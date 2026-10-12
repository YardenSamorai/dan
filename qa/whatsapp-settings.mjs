// QA: the WhatsApp wording appears under a message once WhatsApp is picked. BASE=http://localhost:5181 node qa/whatsapp-settings.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
mkdirSync('qa/shots', { recursive: true });
const browser = await chromium.launch();
const errors = [];
for (const locale of ['he', 'en']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => (m.type() === 'error' || m.text().includes('[i18n]')) && errors.push(m.text()));
  await page.addInitScript((l) => localStorage.setItem('saas.locale', l), locale);
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });
  await page.fill('#si-email', 'noa@demo-studio.example');
  await page.locator('.auth__form button').click();
  await page.waitForURL(/\/(app|onboarding)/, { timeout: 8000 });
  await page.goto(`${BASE}/app/settings/notifications`, { waitUntil: 'networkidle' });
  const panel = page.locator('section.panel').filter({ has: page.locator('textarea[id^="tpl-confirmation"]') });
  const chip = panel.locator('.chip', { hasText: locale === 'he' ? 'וואטסאפ' : 'WhatsApp' });
  if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();
  const bubbles = panel.locator('.field-row').last().locator('.preview-bubble');
  console.log(locale, 'whatsapp previews:', await bubbles.count());
  console.log((await bubbles.first().innerText()).replace(/\n/g, ' | '));
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: `qa/shots/whatsapp-settings-${locale}.png` });
  await page.close();
}
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
