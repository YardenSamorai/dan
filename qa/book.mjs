// QA: full customer booking through the UI. LOCALE=he SLUG=lash-room node qa/book.mjs [desktop|mobile]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const mode = process.argv[2] ?? 'desktop';
const locale = process.env.LOCALE ?? 'en';
const slug = process.env.SLUG ?? 'demo-studio';
const viewport = mode === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
mkdirSync('qa/shots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.text().includes('[i18n]')) && errors.push(m.text()));
await page.addInitScript((l) => localStorage.setItem('saas.locale', l), locale);

const cta = () => page.locator('.btn--primary.btn--lg:visible').first();
const shot = (n) => page.screenshot({ path: `qa/shots/book-${slug}-${mode}-${locale}-${n}.png` });

await page.goto(`${BASE}/book/${slug}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await shot('home');
await page.goto(`${BASE}/book/${slug}/new`, { waitUntil: 'networkidle' });
await page.locator('input[name="service"]').first().check({ force: true });
await shot(0);
await cta().click();
await page.waitForTimeout(300);
if (await page.locator('input[name="staff"]').count()) {
  await page.locator('input[name="staff"]').first().check({ force: true });
  await page.waitForTimeout(300);
  if (await page.locator('input[name="staff"]').count()) await cta().click();
}
await page.waitForTimeout(500);
await shot(1);
const slot = page.locator('.pcal-entry--slot:visible:not([data-off])');
await slot.first().waitFor({ timeout: 4000 });
await slot.nth(2).click();
await page.waitForTimeout(200);
await shot(2);
await cta().click();
await page.waitForTimeout(300);
await shot(3);
await page.fill('#f-name', locale === 'he' ? 'דנה בדיקה' : 'Test Customer');
await page.fill('#f-phone', '054-555-1234');
if (await page.locator('#f-email[required]').count()) await page.fill('#f-email', 'test@example.com');
await shot(4);
await cta().click();
await page.waitForURL(/\/confirmed\//, { timeout: 8000 });
await page.waitForTimeout(500);
await shot('confirmed');
console.log('confirmed:', page.url());
console.log(await page.locator('main h1, h1').first().textContent());

if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
