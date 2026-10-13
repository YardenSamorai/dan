/**
 * Submits the WhatsApp templates (src/domain/whatsapp.ts) to Meta for approval,
 * in Hebrew and English, and shows where each one stands:
 *   npm run whatsapp:templates              submit the missing ones, then list
 *   npm run whatsapp:templates -- --status  only list
 *
 * Needs WHATSAPP_TOKEN and WHATSAPP_BUSINESS_ACCOUNT_ID in .env; never prints them.
 * Approval usually takes minutes, sometimes up to a day. A template that's
 * already there isn't touched: edit it in WhatsApp Manager, or delete it there
 * and run this again.
 */
import { existsSync, readFileSync } from 'node:fs';
import { GRAPH_API } from '../server/messaging';
import { WHATSAPP_LANGUAGE, WHATSAPP_TEMPLATES } from '../src/domain/whatsapp';
import type { TemplateVar } from '../src/domain/notifications';
import type { Locale } from '../src/i18n/config';

function loadEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv('.env');

const token = process.env.WHATSAPP_TOKEN;
const account = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
if (!token || !account) {
  console.error('Missing WHATSAPP_TOKEN or WHATSAPP_BUSINESS_ACCOUNT_ID in .env.');
  process.exit(1);
}

/** Meta's reviewers read these, so they look like a real appointment. */
const EXAMPLES: Record<Locale, Partial<Record<TemplateVar, string>>> = {
  he: { name: 'דנה', business: 'סטודיו נועה', service: 'תספורת', date: 'יום שלישי, 14 באוקטובר', time: '10:30', link: 'https://tornu.co.il/book/demo-studio' },
  en: { name: 'Dana', business: 'Noa Studio', service: 'Haircut', date: 'Tuesday, October 14', time: '10:30', link: 'https://tornu.co.il/book/demo-studio' },
};

async function graph<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GRAPH_API}/${path}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; error_user_msg?: string } };
  if (!res.ok) throw new Error(body.error?.error_user_msg || body.error?.message || `HTTP ${res.status}`);
  return body;
}

type Existing = { name: string; language: string; status: string; category: string };
const list = async () => (await graph<{ data: Existing[] }>(`${account}/message_templates?fields=name,language,status,category&limit=200`)).data;

const existing = await list();
const has = (name: string, lang: string) => existing.some((t) => t.name === name && t.language === lang);

if (!process.argv.includes('--status')) {
  for (const tpl of Object.values(WHATSAPP_TEMPLATES)) {
    for (const locale of Object.keys(WHATSAPP_LANGUAGE) as Locale[]) {
      const language = WHATSAPP_LANGUAGE[locale];
      if (has(tpl.name, language)) continue;
      try {
        await graph(`${account}/message_templates`, {
          method: 'POST',
          body: JSON.stringify({
            name: tpl.name,
            language,
            category: tpl.category,
            parameter_format: 'named',
            components: [
              {
                type: 'BODY',
                text: tpl.text[locale],
                example: { body_text_named_params: tpl.vars.map((v) => ({ param_name: v, example: EXAMPLES[locale][v] ?? v })) },
              },
            ],
          }),
        });
        console.log(`submitted  ${tpl.name} (${language})`);
      } catch (e) {
        console.error(`failed     ${tpl.name} (${language}): ${(e as Error).message}`);
      }
    }
  }
}

const ours = new Set(Object.values(WHATSAPP_TEMPLATES).map((t) => t.name));
const rows = (await list()).filter((t) => ours.has(t.name)).sort((a, b) => a.name.localeCompare(b.name) || a.language.localeCompare(b.language));
console.log('');
for (const t of rows) console.log(`${t.status.padEnd(10)} ${t.name} (${t.language}) ${t.category}`);
const missing = Object.values(WHATSAPP_TEMPLATES).flatMap((t) => Object.values(WHATSAPP_LANGUAGE).filter((l) => !rows.some((r) => r.name === t.name && r.language === l)).map((l) => `${t.name} (${l})`));
if (missing.length) console.log(`\nnot submitted: ${missing.join(', ')}`);
