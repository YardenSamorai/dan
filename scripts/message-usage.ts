/**
 * Messages each business sent, and what WhatsApp cost for them:
 *   npm run messages:usage               this month
 *   npm run messages:usage -- 2026-09    another month
 *
 * Reads the businesses from Supabase (SUPABASE_SECRET_KEY in .env; never
 * printed). WhatsApp is priced at Meta's Israel rates; SMS shows gateway
 * credits, priced only if SMS_CREDIT_ILS is set.
 */
import { existsSync, readFileSync } from 'node:fs';
import { allowanceUsed, whatsappCostUsd } from '../src/domain/usage';
import type { UsageCounts } from '../src/domain/types';
import type { LText } from '../src/i18n/config';

function loadEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv('.env');

const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.');
  process.exit(1);
}

const month = process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a)) ?? new Date().toISOString().slice(0, 7);
const smsCredit = Number(process.env.SMS_CREDIT_ILS) || null;

const res = await fetch(`${url}/rest/v1/businesses?select=id,slug,name:data->business->name,usage:data->business->usage`, { headers: { apikey: key, authorization: `Bearer ${key}` } });
if (!res.ok) {
  console.error(`Supabase answered ${res.status}.`);
  process.exit(1);
}
const rows = (await res.json()) as { id: string; slug: string; name: LText | null; usage: Record<string, UsageCounts> | null }[];

const usd = (n: number) => `$${n.toFixed(2)}`;
const lines = rows
  .map((r) => ({ name: r.name?.he || r.name?.en || r.slug, c: r.usage?.[month] ?? {} }))
  .filter((r) => allowanceUsed(r.c) || r.c.email || r.c.phoneCodes)
  .sort((a, b) => allowanceUsed(b.c) - allowanceUsed(a.c));

console.log(`Messages in ${month}\n`);
let total = 0;
for (const { name, c } of lines) {
  const wa = whatsappCostUsd(c);
  total += wa;
  const sms = `SMS ${c.sms ?? 0} (${c.smsCredits ?? 0} credits${smsCredit ? `, ₪${((c.smsCredits ?? 0) * smsCredit).toFixed(2)}` : ''})`;
  console.log(`${name}\n  WhatsApp ${c.whatsapp ?? 0} + marketing ${c.whatsappMarketing ?? 0} = ${usd(wa)} · ${sms} · email ${c.email ?? 0} · lookup codes ${c.phoneCodes ?? 0}`);
}
if (!lines.length) console.log('No messages yet.');
else console.log(`\nWhatsApp total: ${usd(total)}`);
