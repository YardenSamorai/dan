import type { Business, OutboxMessage, UsageCounts } from './types';

/** Months of history kept on the business. */
const KEEP_MONTHS = 13;

/** "2026-10": the month of `at` in the business's timezone. */
export function usageMonth(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}`;
}

/** The counter a sent message adds to. Book-again invitations are WhatsApp's pricier marketing category. */
export function usageKey(m: Pick<OutboxMessage, 'channel' | 'kind'>): keyof UsageCounts {
  if (m.channel === 'whatsapp') return m.kind === 'rebook' ? 'whatsappMarketing' : 'whatsapp';
  return m.channel;
}

/** The business's usage with `delta` added to `month` (negative to take back a message that turned out undelivered). */
export function addUsage(usage: Business['usage'], month: string, delta: UsageCounts): Business['usage'] {
  const cur = usage?.[month] ?? {};
  const next: UsageCounts = { ...cur };
  for (const [k, v] of Object.entries(delta) as [keyof UsageCounts, number][]) next[k] = Math.max(0, (cur[k] ?? 0) + v);
  const all = { ...usage, [month]: next };
  return Object.fromEntries(Object.entries(all).sort(([a], [b]) => b.localeCompare(a)).slice(0, KEEP_MONTHS));
}

/** Messages that count toward the plan's monthly allowance: WhatsApp and SMS. Email is free. */
export const allowanceUsed = (c: UsageCounts | undefined) => (c?.whatsapp ?? 0) + (c?.whatsappMarketing ?? 0) + (c?.sms ?? 0);

/** Meta's rate card for recipients in Israel, USD per delivered message (October 2026). */
export const WHATSAPP_USD = { utility: 0.0053, marketing: 0.0353, authentication: 0.0053 };

/** What Meta bills for one message of this kind on WhatsApp. */
export const whatsappRateUsd = (kind: OutboxMessage['kind']) => WHATSAPP_USD[usageKey({ channel: 'whatsapp', kind }) === 'whatsappMarketing' ? 'marketing' : 'utility'];

/** WhatsApp's charge for a month's counts, in USD. Lookup codes are counted as WhatsApp authentication. */
export const whatsappCostUsd = (c: UsageCounts | undefined) =>
  (c?.whatsapp ?? 0) * WHATSAPP_USD.utility + (c?.whatsappMarketing ?? 0) * WHATSAPP_USD.marketing + (c?.phoneCodes ?? 0) * WHATSAPP_USD.authentication;
