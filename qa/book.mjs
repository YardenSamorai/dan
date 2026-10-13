// QA: full customer booking through the UI. LOCALE=he SLUG=lash-room W=390 node qa/book.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const width = Number(process.env.W ?? 1440);
const locale = process.env.LOCALE ?? 'en';
const slug = process.env.SLUG ?? 'demo-studio';
const viewport = { width, height: width < 700 ? 844 : 900 };
mkdirSync('qa/shots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport, hasTouch: width < 700, isMobile: width < 700 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.text().includes('[i18n]')) && errors.push(m.text()));
await page.addInitScript((l) => localStorage.setItem('saas.locale', l), locale);

const cta = () => page.locator('.bar__cta');
const shot = (n, fullPage = false) =>
  page.screenshot({ path: `qa/shots/book-${slug}-${width}-${locale}-${n}.png`, fullPage });
const overflow = async (step) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (w > 0) errors.push(`horizontal overflow ${w}px on ${step}`);
};

await page.goto(`${BASE}/book/${slug}/new`, { waitUntil: 'networkidle' });
await shot('0-service-empty');
await page.locator('label.svc').first().click();
await page.waitForTimeout(250);
await overflow('service');
await shot('1-service', true);
await cta().click();
await page.waitForTimeout(500);
await shot('2-time');
await overflow('time');
await page.locator('.days__other').click();
await page.waitForTimeout(250);
await shot('3-month');
await page.locator('.days__other').click();
const full = page.locator('.day:not(:disabled)', { hasText: locale === 'he' ? 'מלא' : 'Full' }).first();
if (await full.count()) {
  await full.click();
  await page.waitForTimeout(400);
  await shot('3b-empty-day');
  await page.locator('.times__empty .btn').click();
  await page.waitForTimeout(400);
}
const time = page.locator('button.time');
await time.first().waitFor({ timeout: 4000 });
await time.nth(Math.min(2, (await time.count()) - 1)).click();
await page.waitForTimeout(250);
await shot('4-time-picked', true);
await cta().click();
await page.waitForTimeout(300);
await page.fill('#f-name', locale === 'he' ? 'דנה בדיקה' : 'Test Customer');
await page.fill('#f-phone', '054-555-1234');
if (await page.locator('#f-email[required]').count()) await page.fill('#f-email', 'test@example.com');
await overflow('details');
await shot('5-details');
await cta().click();
await page.waitForTimeout(300);
await overflow('review');
await shot('6-review', true);
await cta().click();
await page.waitForURL(/\/confirmed\//, { timeout: 8000 });
await page.waitForTimeout(500);
await shot('7-confirmed');
console.log(width, locale, 'confirmed:', page.url());

if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
