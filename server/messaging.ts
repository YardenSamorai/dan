import { pickText, type Locale } from '../src/i18n/config';
import { bookingLink, isWaiting, KEEP_DONE_MS, LINK_PLACEHOLDER, MAX_ATTEMPTS, messageLink, messageVars, recipientOf, STALE_AFTER_MS } from '../src/domain/notifications';
import { joinBlock, messageSubject, participantsOf } from '../src/domain/classes';
import { appointmentStart, sessionsOf } from '../src/domain/scheduling';
import { addUsage, usageKey, usageMonth } from '../src/domain/usage';
import { renderWhatsApp, WHATSAPP_LANGUAGE, WHATSAPP_TEMPLATES, whatsAppParams } from '../src/domain/whatsapp';
import type { Channel, MessageKind, OutboxMessage, TemplateKind, TenantData, UsageCounts } from '../src/domain/types';
import { uid } from '../src/data/mock/db';
import { internationalPhone } from '../src/lib/phone';
import { emailHtml } from './emailHtml';
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
  /** Email layout: language, whether it's an alert to the business itself, and the site address its logo loads from. */
  locale?: Locale;
  toOwner?: boolean;
  origin?: string;
  /** For WhatsApp, which only sends Meta-approved wording: the template and its values. Missing for owner alerts. */
  template?: { kind: TemplateKind; locale: Locale; params: { name: string; text: string }[] };
  /** Comes back with the provider's delivery reports (WhatsApp), so a report can find its business and message. */
  ref?: string;
}

export interface SendResult {
  /** The provider's id for the message. */
  id?: string;
  /** Credits charged (SMS). */
  units?: number;
}

export interface Sender {
  /** Throws SendError; `retry: false` for problems a retry won't fix (bad address, rejected content). */
  send(m: OutgoingMessage): Promise<SendResult | void>;
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
          html: emailHtml({ body: m.body, locale: m.locale ?? 'he', from: m.toOwner ? { kind: 'product' } : { kind: 'business', name: m.fromName }, origin: m.origin }),
          ...(m.replyTo && { reply_to: m.replyTo }),
        }),
      });
      if (res.ok) return;
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      throw new SendError(`resend ${res.status} ${detail}`, res.status === 429 || res.status >= 500);
    },
  };
}

/** Israeli numbers the way Israeli SMS gateways expect them (0501234567); others as international digits. */
export function smsNumber(phone: string): string {
  const raw = phone.replace(/[^\d+]/g, '');
  if (raw.startsWith('+972')) return `0${raw.slice(4)}`;
  if (raw.startsWith('00972')) return `0${raw.slice(5)}`;
  if (raw.startsWith('972') && raw.length === 12) return `0${raw.slice(3)}`;
  return raw.replace(/^\+|^00/, '');
}

export const GLOBALSMS_API = 'https://api.itnewsletter.co.il/api/restApiSms';

/**
 * SMS through Global SMS (globalsms.co.il), an Israeli gateway billed per
 * message (Hebrew: 70 characters a credit). `sender` is what customers see: a
 * phone number verified in the Global SMS app, or up to 11 English letters
 * pre-approved there. Every message already names the business.
 *
 * Global SMS only answers approved server IPs (otherwise 401/403), and the
 * account must be strongly identified (KYC) for API access.
 */
export function globalSms(apiKey: string, sender: string, fetchImpl: typeof fetch = fetch): Sender {
  return {
    async send(m) {
      const q = new URLSearchParams({ ApiKey: apiKey, txtOriginator: sender, destinations: smsNumber(m.to), txtSMSmessage: m.body, dteToDeliver: '', txtAddInf: '' });
      const res = await fetchImpl(`${GLOBALSMS_API}/sendSmsToRecipients?${q}`, { method: 'GET' });
      const text = (await res.text().catch(() => ''))
        .replace(/<[^>]+>/g, '')
        .trim()
        .replace(/^"|"$/g, '');
      if (res.status === 401 || res.status === 403) throw new SendError(`globalsms ${res.status}: this server's IP is not approved by Global SMS`, false);
      if (!res.ok) throw new SendError(`globalsms ${res.status} ${text.slice(0, 200)}`, res.status === 429 || res.status >= 500);
      // Success is the number of credits charged; anything else is one of their error strings.
      if (/^\d+(\.\d+)?$/.test(text)) return { units: Math.max(1, Math.ceil(Number(text))) };
      throw new SendError(`globalsms: ${text.slice(0, 200) || 'empty reply'}`, /^system error$/i.test(text));
    },
  };
}

export const GRAPH_API = 'https://graph.facebook.com/v26.0';

/** Meta's throughput limits: worth trying again later. Any other 4xx (not on WhatsApp, template not approved, bad values) is final. */
const WHATSAPP_THROTTLED = new Set([130429, 131056]);

/**
 * WhatsApp through Meta's own Cloud API: no middleman, Meta bills per delivered
 * template. One platform number sends for every business; each message names
 * the business. Only templates approved in WhatsApp Manager go out.
 */
export function whatsappCloud(token: string, phoneNumberId: string, fetchImpl: typeof fetch = fetch): Sender {
  return {
    async send(m) {
      if (!m.template) throw new SendError('whatsapp: only appointment messages to customers have a template', false);
      const tpl = WHATSAPP_TEMPLATES[m.template.kind];
      const res = await fetchImpl(`${GRAPH_API}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: m.to,
          type: 'template',
          template: {
            name: tpl.name,
            language: { policy: 'deterministic', code: WHATSAPP_LANGUAGE[m.template.locale] },
            components: [{ type: 'body', parameters: m.template.params.map((p) => ({ type: 'text', parameter_name: p.name, text: p.text })) }],
          },
          ...(m.ref && { biz_opaque_callback_data: m.ref }),
        }),
      });
      if (res.ok) {
        const reply = (await res.json().catch(() => null)) as { messages?: { id?: string }[] } | null;
        return { id: reply?.messages?.[0]?.id };
      }
      const text = await res.text().catch(() => '');
      let code: number | undefined;
      try {
        code = (JSON.parse(text) as { error?: { code?: number } }).error?.code;
      } catch {
        /* not JSON */
      }
      const retry = res.status === 429 || res.status >= 500 || (!!code && WHATSAPP_THROTTLED.has(code));
      throw new SendError(`whatsapp ${res.status}${code ? ` ${code}` : ''} ${text.slice(0, 160)}`, retry);
    },
  };
}

/** Development only: prints instead of sending, so the whole flow can be tried locally. */
const logSender = (channel: Channel): Sender => ({
  async send(m) {
    console.log(`[messages] ${channel} → ${m.to}: ${m.template ? `[${WHATSAPP_TEMPLATES[m.template.kind].name}] ${renderWhatsApp(m.template.kind, m.template.locale, Object.fromEntries(m.template.params.map((p) => [p.name, p.text])))}` : m.body}`);
  },
});

/**
 * Providers from the environment:
 *   RESEND_API_KEY + MAIL_FROM                     email
 *   GLOBALSMS_API_KEY + GLOBALSMS_SENDER           SMS (Global SMS)
 *   WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID      WhatsApp (Meta Cloud API)
 *   MESSAGES_LOG=1                                 (development) print every channel to the console
 */
export function sendersFromEnv(env: Env): Senders {
  const s: Senders = {};
  if (env.RESEND_API_KEY && env.MAIL_FROM) s.email = resendEmail(env.RESEND_API_KEY, env.MAIL_FROM);
  if (env.GLOBALSMS_API_KEY && env.GLOBALSMS_SENDER) s.sms = globalSms(env.GLOBALSMS_API_KEY, env.GLOBALSMS_SENDER);
  if (env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) s.whatsapp = whatsappCloud(env.WHATSAPP_TOKEN, env.WHATSAPP_PHONE_NUMBER_ID);
  if (env.MESSAGES_LOG === '1' && env.NODE_ENV !== 'production') for (const c of ['sms', 'whatsapp', 'email'] as const) s[c] ??= logSender(c);
  return s;
}

export const channelsOf = (senders: Senders) => Object.keys(senders) as Channel[];

type Outcome = Pick<OutboxMessage, 'state' | 'attempts' | 'doneAt' | 'error' | 'providerId'> & { units?: number };

const withOutcome = (m: OutboxMessage, { units: _, ...o }: Outcome): OutboxMessage => ({ ...m, ...o });

/** A delivery report's `ref`: which business and message it's about. */
export const messageRef = (businessId: string, messageId: string) => JSON.stringify({ b: businessId, m: messageId });

export function parseMessageRef(ref: unknown): { businessId: string; messageId: string } | null {
  if (typeof ref !== 'string') return null;
  try {
    const v = JSON.parse(ref) as { b?: unknown; m?: unknown };
    return typeof v.b === 'string' && typeof v.m === 'string' ? { businessId: v.b, messageId: v.m } : null;
  } catch {
    return null;
  }
}

/** The same message by SMS, for a WhatsApp message to a customer that couldn't be delivered. None if an SMS of it already exists. */
function smsFallback(outbox: OutboxMessage[], m: OutboxMessage, at: string): OutboxMessage[] {
  if (m.channel !== 'whatsapp' || m.to === 'owner') return [];
  if (outbox.some((x) => x.appointmentId === m.appointmentId && x.kind === m.kind && x.channel === 'sms')) return [];
  return [{ businessId: m.businessId, id: uid('m'), appointmentId: m.appointmentId, kind: m.kind, channel: 'sms', locale: m.locale, body: m.body, at, state: 'queued', fallbackFor: m.id }];
}

/** Why a waiting message shouldn't go out any more, if it shouldn't. */
function tooLate(t: TenantData, m: OutboxMessage, now: Date): string | null {
  const a = messageSubject(t, m);
  if (!a) return 'no_appointment';
  if (m.kind === 'spotOpen') {
    const session = sessionsOf(t).find((s) => s.id === a.sessionId);
    if (!session || joinBlock(t, session, true, now)) return 'not_needed';
    if (participantsOf(t, session.id).some((p) => p.customerId === a.customerId)) return 'already_booked';
    return now.getTime() - Date.parse(m.at) > STALE_AFTER_MS ? 'too_late' : null;
  }
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

const isTemplateKind = (k: MessageKind): k is TemplateKind => k in WHATSAPP_TEMPLATES;

/** The approved WhatsApp template and its values for a message to a customer; none for alerts to the business. */
function whatsAppTemplateFor(t: TenantData, m: OutboxMessage, link: string): OutgoingMessage['template'] {
  const a = messageSubject(t, m);
  if (m.to === 'owner' || !a || !isTemplateKind(m.kind)) return undefined;
  const vars = { ...messageVars(t, a, m.locale, m.kind), link };
  return { kind: m.kind, locale: m.locale, params: whatsAppParams(m.kind, m.locale, vars) };
}

async function deliver(t: TenantData, m: OutboxMessage, sender: Sender, now: Date, origin: string | undefined): Promise<Outcome> {
  const doneAt = now.toISOString();
  const late = tooLate(t, m, now);
  if (late) return { state: 'skipped', doneAt, error: late };
  const address = recipientOf(t, m);
  if (!address) return { state: 'skipped', doneAt, error: 'no_recipient' };
  const to = m.channel === 'whatsapp' ? internationalPhone(address, t.business.timezone) : address;
  if (!to) return { state: 'skipped', doneAt, error: 'bad_number' };
  const business = pickText(t.business.name, m.locale);
  const subject = messageSubject(t, m);
  const link = !origin ? '' : subject ? messageLink(origin, t, subject, m.kind) : bookingLink(origin, t.business.slug);
  const body = m.body.split(LINK_PLACEHOLDER).join(link);
  const template = m.channel === 'whatsapp' ? whatsAppTemplateFor(t, m, link) : undefined;
  const attempts = (m.attempts ?? 0) + 1;
  try {
    const r = await sender.send({ to, body, subject: business, fromName: business, replyTo: m.to === 'owner' ? undefined : t.business.email || undefined, locale: m.locale, toOwner: m.to === 'owner', origin, template, ref: messageRef(t.business.id, m.id) });
    return { state: 'sent', attempts, doneAt, error: undefined, providerId: r?.id, units: r?.units };
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
  if (!t) return { sent: 0, failed: 0, skipped: 0, fallbacks: 0 };
  const outcomes = new Map<string, Outcome>();
  for (const m of t.outbox) {
    const sender = senders[m.channel];
    if (!sender || !isWaiting(m) || m.at > nowISO) continue;
    outcomes.set(m.id, await deliver(t, m, sender, now, origin));
  }
  const keep = (m: OutboxMessage) => isWaiting(m) || !m.doneAt || now.getTime() - Date.parse(m.doneAt) < KEEP_DONE_MS;
  const delta: UsageCounts = {};
  for (const m of t.outbox) {
    const o = outcomes.get(m.id);
    if (o?.state !== 'sent') continue;
    const key = usageKey(m);
    delta[key] = (delta[key] ?? 0) + 1;
    if (m.channel === 'sms') delta.smsCredits = (delta.smsCredits ?? 0) + (o.units ?? 1);
  }
  let fallbacks = 0;
  for (let attempt = 0; ; attempt++) {
    const cur = before.tenants[id];
    if (!cur) break;
    const merged = cur.outbox.map((m) => (outcomes.has(m.id) ? withOutcome(m, outcomes.get(m.id)!) : m));
    const added: OutboxMessage[] = [];
    if (senders.sms) for (const m of merged) if (outcomes.get(m.id)?.state === 'failed') added.push(...smsFallback([...merged, ...added], m, nowISO));
    const outbox = [...merged, ...added].filter(keep);
    const usage = Object.keys(delta).length ? addUsage(cur.business.usage, usageMonth(now, cur.business.timezone), delta) : cur.business.usage;
    try {
      await store.commit(before, { ...before, tenants: { ...before.tenants, [id]: { ...cur, business: { ...cur.business, usage }, outbox } } });
      fallbacks = added.length;
      break;
    } catch (e) {
      if (!(e instanceof Conflict) || attempt >= 3) throw e;
      before = await store.snapshot({ businessId: id });
    }
  }
  const count = (s: OutboxMessage['state']) => [...outcomes.values()].filter((o) => o.state === s).length;
  return { sent: count('sent'), failed: count('failed'), skipped: count('skipped'), fallbacks };
}

export interface DeliveryReport {
  messageId: string;
  providerId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  error?: string;
}

/**
 * Applies WhatsApp delivery reports to one business's outbox. A message that
 * turns out undelivered is marked failed, taken off the month's count (Meta
 * bills delivered messages only) and, when SMS is connected, queued again as an
 * SMS. Returns how many SMS were queued.
 */
export async function recordDelivery(store: Store, senders: Senders, businessId: string, reports: DeliveryReport[], now = new Date()): Promise<number> {
  const nowISO = now.toISOString();
  for (let attempt = 0; ; attempt++) {
    const before = await store.snapshot({ businessId });
    const cur = before.tenants[businessId];
    if (!cur) return 0;
    const outbox = [...cur.outbox];
    let usage = cur.business.usage;
    let changed = false;
    let fallbacks = 0;
    for (const r of reports) {
      const i = outbox.findIndex((m) => m.id === r.messageId && m.channel === 'whatsapp' && (!m.providerId || m.providerId === r.providerId));
      const m = outbox[i];
      if (!m || m.state !== 'sent') continue;
      if (r.status === 'failed') {
        outbox[i] = { ...m, state: 'failed', delivery: undefined, error: (r.error ?? 'whatsapp_undelivered').slice(0, 200) };
        if (m.doneAt) usage = addUsage(usage, usageMonth(new Date(m.doneAt), cur.business.timezone), { [usageKey(m)]: -1 });
        if (senders.sms) {
          const added = smsFallback(outbox, outbox[i], nowISO);
          outbox.push(...added);
          fallbacks += added.length;
        }
        changed = true;
      } else if ((r.status === 'delivered' || r.status === 'read') && m.delivery !== 'read' && m.delivery !== r.status) {
        outbox[i] = { ...m, delivery: r.status };
        changed = true;
      }
    }
    if (!changed) return 0;
    try {
      await store.commit(before, { ...before, tenants: { ...before.tenants, [businessId]: { ...cur, business: { ...cur.business, usage }, outbox } } });
      return fallbacks;
    } catch (e) {
      if (!(e instanceof Conflict) || attempt >= 3) throw e;
    }
  }
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
      // WhatsApp messages that failed just now have SMS stand-ins waiting: send those too.
      if (r.fallbacks) {
        const again = await dispatchBusiness(store, senders, id, now, opts.origin);
        r.sent += again.sent;
        r.failed += again.failed;
        r.skipped += again.skipped;
      }
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
