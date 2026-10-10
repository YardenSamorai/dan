// QA: marketing → sign up → onboarding → publish → app → own booking page. LOCALE=he node qa/onboard.mjs [desktop|mobile]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const mode = process.argv[2] ?? 'desktop';
const locale = process.env.LOCALE ?? 'en';
const viewport = mode === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
mkdirSync('qa/shots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.text().includes('[i18n]')) && errors.push(m.text()));
await page.addInitScript((l) => localStorage.setItem('saas.locale', l), locale);
const shot = (n) => page.screenshot({ path: `qa/shots/onb-${mode}-${locale}-${n}.png` });
const next = async (n) => {
  await page.waitForTimeout(350);
  await shot(n);
  await page.locator('.onb__actions .btn--primary').click();
};

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await shot('marketing');
await page.screenshot({ path: `qa/shots/onb-${mode}-${locale}-marketing-full.png`, fullPage: true });

const stamp = Date.now().toString(36);
await page.goto(`${BASE}/sign-up`, { waitUntil: 'networkidle' });
await page.fill('#su-name', 'Avery Test');
await page.fill('#su-email', `avery+${stamp}@example.com`);
await page.locator('.auth__form button[type="submit"], .auth__form .btn').last().click();
await page.waitForURL(/\/onboarding/, { timeout: 8000 });

await page.fill('#ob-name', `QA Brow Bar ${stamp}`);
await next('1-business');
await page.waitForTimeout(350);
await shot('2-type');
await page.locator('.onb__type').nth(1).click();
await page.fill('#ob-svc', 'Brow shape');
await page.fill('#ob-price', '120');
await next('3-service');
await next('4-hours');
await page.locator('input[name="solo"]').first().check({ force: true });
await next('5-team');
await next('6-rules');
await page.waitForTimeout(350);
await shot('7-preview');
await page.locator('.onb__actions .btn--primary').click();
await page.waitForURL(/\/app/, { timeout: 8000 });
await page.waitForTimeout(800);
await shot('8-app');

const slug = `qa-brow-bar-${stamp}`;
await page.goto(`${BASE}/book/${slug}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await shot('9-booking-page');
console.log('booking page h1:', await page.locator('h1').first().textContent());

if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
