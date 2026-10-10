// QA helper: LOCALE=he AS=noa@demo-studio.example node qa/app.mjs <desktop|mobile> [route,route,...]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const [mode = 'desktop', list = '/app,/app/calendar,/app/calendar?view=week,/app/calendar?view=list,/app/appointments,/app/customers,/app/services,/app/staff,/app/availability,/app/settings/business,/app/settings/branding,/app/settings/billing'] =
  process.argv.slice(2);
const viewport = mode === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const locale = process.env.LOCALE ?? 'en';
const as = process.env.AS ?? 'noa@demo-studio.example';
const tag = `app-${mode}-${locale}-${as.split('@')[0]}`;
mkdirSync('qa/shots', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport, deviceScaleFactor: mode === 'mobile' ? 2 : 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.text().includes('[i18n]')) && errors.push(m.text()));
await page.addInitScript((l) => localStorage.setItem('saas.locale', l), locale);

await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });
await page.fill('#si-email', as);
await page.locator('.auth__form button').click();
await page.waitForURL(/\/(app|onboarding)/, { timeout: 8000 });

for (const route of list.split(',')) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const name = route.replace(/^\/app\/?/, '').replace(/[?=&/]+/g, '-') || 'dashboard';
  await page.screenshot({ path: `qa/shots/${tag}-${name}.png` });
}

if (process.env.DRAWER) {
  await page.goto(`${BASE}/app/calendar?view=day`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.locator('.cal-appt').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `qa/shots/${tag}-drawer.png` });
}

if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
