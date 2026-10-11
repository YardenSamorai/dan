import { pickText } from '../src/i18n/config';
import { bookingLink, isWaiting, KEEP_DONE_MS, LINK_PLACEHOLDER, MAX_ATTEMPTS, recipientOf, STALE_AFTER_MS } from '../src/domain/notifications';
import { appointmentStart } from '../src/domain/scheduling';
import type { Channel, OutboxMessage, TenantData } from '../src/domain/types';
import { Conflict, type Store } from './store';

/**
 * Delivery. Messages wait in each business's outbox (src/data/mock/workspace.ts
 * queues them); this sends the due ones through whichever providers the
 * environment connects. A channel without a provider simply keeps waiting.
 */

export interface OutgoingMessage {
  to: string;
  body: string;
  /** Email subject (the business name). */
  subject: string;
  /** Email replies go to the business, not to us. */
  replyTo?: string;
  fromName: string;
}

export interface Sender {
  /** Throws SendError; `retry: false` for problems a retry won't fix (bad address, rejected content). */
  send(m: OutgoingMessage): Promise<void>;
}

export class SendError extends Error {
  constructor(
    message: string,
    public retry: boolean,
  ) {
    super(message);
  }
}

export type Senders = Partial<Record<Channel, Sender>>;

type Env = Record<string, string | undefined>;

/** Email through Resend (resend.com). MAIL_FROM must be an address on a domain verified there. */
export function resendEmail(apiKey: string, from: string): Sender {
  return {
    async send(m) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: `${m.fromName.replace(/[<>"]/g, '')} <${from}>`,
          to: [m.to],
          subject: m.subject,
          text: m.body,
          ...(m.replyTo && { reply_to: m.replyTo }),
        }),
      });
      if (res.ok) return;
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      throw new SendError(`resend ${res.status} ${detail}`, res.status === 429 || res.status >= 500);
    },
  };
}

/** Development only: prints instead of sending, so the whole flow can be tried locally. */
const logSender = (channel: Channel): Sender => ({
  async send(m) {
    console.log(`[messages] ${channel} → ${m.to}: ${m.body}`);
  },
});

/**
 * Providers from the environment:
 *   RESEND_API_KEY + MAIL_FROM   email
 *   MESSAGES_LOG=1               (development) print every channel to the console
 * SMS / WhatsApp: add a Sender here once a provider is chosen.
 */
export function sendersFromEnv(env: Env): Senders {
  const s: Senders = {};
  if (env.RESEND_API_KEY && env.MAIL_FROM) s.email = resendEmail(env.RESEND_API_KEY, env.MAIL_FROM);
  if (env.MESSAGES_LOG === '1' && env.NODE_ENV !== 'production') for (const c of ['sms', 'whatsapp', 'email'] as const) s[c] ??= logSender(c);
  return s;
}

export const channelsOf = (senders: Senders) => Object.keys(senders) as Channel[];

type Outcome = Pick<OutboxMessage, 'state' | 'attempts' | 'doneAt' | 'error'>;

/** Why a waiting message shouldn't go out any more, if it shouldn't. */
function tooLate(t: TenantData, m: OutboxMessage, now: Date): string | null {
  const a = t.appointments.find((x) => x.id === m.appointmentId);
  if (!a) return 'no_appointment';
  if (m.kind === 'reminder') {
    if (a.status === 'cancelled' || a.status === 'no_show' || a.status === 'completed') return 'not_needed';
    if (appointmentStart(a, t.business.timezone) <= now) return 'too_late';
    return null;
  }
  if (m.kind === 'rebook') {
    if (a.status === 'cancelled' || a.status === 'no_show') return 'not_needed';
    const customer = t.customers.find((c) => c.id === a.customerId);
    if (!customer || customer.blocked) return 'not_needed';
    const later = t.appointments.some((x) => x.id !== a.id && x.customerId === a.customerId && x.status !== 'cancelled' && (x.date > a.date || (x.date === a.date && x.start > a.start)));
    if (later) return 'already_booked';
    return now.getTime() - Date.parse(m.at) > REBOOK_STALE_MS ? 'too_late' : null;
  }
  return now.getTime() - Date.parse(m.at) > STALE_AFTER_MS ? 'too_late' : null;
}

/** An invitation to book again can still go out a few days late (say, after an outage). */
const REBOOK_STALE_MS = 3 * 86_400_000;

async function deliver(t: TenantData, m: OutboxMessage, sender: Sender, now: Date, origin: string | undefined): Promise<Outcome> {
  const doneAt = now.toISOString();
  const late = tooLate(t, m, now);
  if (late) return { state: 'skipped', doneAt, error: late };
  const to = recipientOf(t, m);
  if (!to) return { state: 'skipped', doneAt, error: 'no_recipient' };
  const business = pickText(t.business.name, m.locale);
  const body = m.body.split(LINK_PLACEHOLDER).join(origin ? bookingLink(origin, t.business.slug) : '');
  const attempts = (m.attempts ?? 0) + 1;
  try {
    await sender.send({ to, body, subject: business, fromName: business, replyTo: m.to === 'owner' ? undefined : t.business.email || undefined });
    return { state: 'sent', attempts, doneAt };
  } catch (e) {
    const retry = e instanceof SendError ? e.retry : true;
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    console.error('[messages]', t.business.id, m.id, error);
    return attempts >= MAX_ATTEMPTS || !retry ? { state: 'failed', attempts, doneAt, error } : { state: m.state, attempts, error };
  }
}

/** Sends what's due in one business and records the outcome. Never sends the same message twice, even if the save has to be retried. */
async function dispatchBusiness(store: Store, senders: Senders, id: string, now: Date, origin: string | undefined) {
  const nowISO = now.toISOString();
  let before = await store.snapshot({ businessId: id });
  const t = before.tenants[id];
  if (!t) return { sent: 0, failed: 0, skipped: 0 };
  const outcomes = new Map<string, Outcome>();
  for (const m of t.outbox) {
    const sender = senders[m.channel];
    if (!sender || !isWaiting(m) || m.at > nowISO) continue;
    outcomes.set(m.id, await deliver(t, m, sender, now, origin));
  }
  const keep = (m: OutboxMessage) => isWaiting(m) || !m.doneAt || now.getTime() - Date.parse(m.doneAt) < KEEP_DONE_MS;
  for (let attempt = 0; ; attempt++) {
    const cur = before.tenants[id];
    if (!cur) break;
    const outbox = cur.outbox.map((m) => (outcomes.has(m.id) ? { ...m, ...outcomes.get(m.id) } : m)).filter(keep);
    try {
      await store.commit(before, { ...before, tenants: { ...before.tenants, [id]: { ...cur, outbox } } });
      break;
    } catch (e) {
      if (!(e instanceof Conflict) || attempt >= 3) throw e;
      before = await store.snapshot({ businessId: id });
    }
  }
  const count = (s: OutboxMessage['state']) => [...outcomes.values()].filter((o) => o.state === s).length;
  return { sent: count('sent'), failed: count('failed'), skipped: count('skipped') };
}

/** One pass: every business with something due on a connected channel (or just `only`). `origin` = the site's address, for booking links. */
export async function dispatchMessages(store: Store, senders: Senders, opts: { now?: Date; only?: string[]; limit?: number; origin?: string } = {}) {
  const now = opts.now ?? new Date();
  const channels = channelsOf(senders);
  const total = { businesses: 0, sent: 0, failed: 0, skipped: 0 };
  if (!channels.length || !store.dueBusinesses) return total;
  const due = opts.only ?? (await store.dueBusinesses(now.toISOString(), channels, opts.limit ?? 50));
  for (const id of due) {
    try {
      const r = await dispatchBusiness(store, senders, id, now, opts.origin);
      total.businesses++;
      total.sent += r.sent;
      total.failed += r.failed;
      total.skipped += r.skipped;
    } catch (e) {
      console.error('[messages] business', id, e);
    }
  }
  return total;
}
