// QA: group classes end to end. LOCALE=he node qa/classes.mjs [desktop|mobile]
// Turns the first service into a 3-seat class, opens a weekly series, fills one session online, then joins its waitlist.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const mode = process.argv[2] ?? 'desktop';
const locale = process.env.LOCALE ?? 'en';
const slug = process.env.SLUG ?? 'demo-studio';
const he = locale === 'he';
const viewport = mode === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
mkdirSync('qa/shots', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport, deviceScaleFactor: mode === 'mobile' ? 2 : 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.text().includes('[i18n]')) && errors.push(m.text()));
await page.addInitScript((l) => localStorage.setItem('saas.locale', l), locale);
const shot = (n) => page.screenshot({ path: `qa/shots/classes-${mode}-${locale}-${n}.png` });
const cta = () => page.locator('.btn--primary.btn--lg:visible').first();

await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });
await page.fill('#si-email', 'noa@demo-studio.example');
await page.locator('.auth__form button').click();
await page.waitForURL(/\/app/, { timeout: 8000 });

// 1. Make the first service a 3-seat class.
await page.goto(`${BASE}/app/services`, { waitUntil: 'networkidle' });
await page.locator('.panel .list__row').first().click();
await page.waitForTimeout(400);
const sw = page.getByRole('switch', { name: he ? 'שיעור קבוצתי' : 'Group class' });
await sw.scrollIntoViewIfNeeded();
if (!(await sw.isChecked())) await sw.check({ force: true });
await page.waitForTimeout(200);
await shot('1-service');
await page.getByRole('button', { name: he ? 'שמירה' : 'Save', exact: true }).last().click();
await page.waitForTimeout(600);
await shot('2-services-list');

// 2. Open a weekly series with 3 seats.
await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
await page.locator('.dash__quick button').first().click();
await page.waitForTimeout(400);
await page.getByRole('tab', { name: he ? 'שיעור' : 'Class' }).click();
await page.waitForTimeout(300);
const drawer = page.locator('.drawer:visible, [role="dialog"]:visible').last();
await drawer.locator('input[type="number"]').fill('3');
const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
await drawer.locator('input[type="date"]').fill(tomorrow);
await shot('3-new-class');
const selects = await drawer.locator('select').all();
for (const s of selects) {
  if ((await s.locator('option[value="1"]').count()) && (await s.locator('option[value="0"]').count())) {
    await s.selectOption('1');
    break;
  }
}
await page.waitForTimeout(300);
const submit = drawer.locator('.btn--primary').last();
for (const s of await drawer.locator('select').all()) {
  const times = await s.locator('option').evaluateAll((os) => os.map((o) => o.value).filter((v) => /^\d+$/.test(v) && +v >= 540 && +v <= 1260));
  if (times.length < 10) continue;
  for (const v of times) {
    await s.selectOption(v);
    if (await submit.isEnabled()) break;
  }
  break;
}
await shot('4-new-class-weekly');
await submit.click();
await page.waitForTimeout(800);
await shot('5-session-drawer');

// 3. Calendar and dashboard.
await page.goto(`${BASE}/app/calendar?view=day&date=${tomorrow}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await shot('6-calendar');

// 4. Book it online until it's full, then join the waitlist.
const book = async (i) => {
  await page.goto(`${BASE}/book/${slug}/new`, { waitUntil: 'networkidle' });
  await page.locator('label.choice', { hasText: he ? 'שיעור קבוצתי' : 'Group class' }).first().click();
  await cta().click();
  await page.waitForTimeout(400);
  if (i === 0) await shot('7-schedule');
  await page.locator('label.choice:not([data-off])').filter({ has: page.locator('input[name="session"]') }).first().click();
  await page.waitForTimeout(300);
  await page.fill('#f-name', he ? `לקוחה ${i + 1}` : `Customer ${i + 1}`);
  await page.fill('#f-phone', `054-555-10${i}${i}`);
  if (await page.locator('#f-email[required]').count()) await page.fill('#f-email', `c${i}@example.com`);
  await cta().click();
  await page.waitForTimeout(300);
  if (i === 0 || i === 3) await shot(`8-review-${i}`);
  await cta().click();
  await page.waitForTimeout(1200);
  await shot(`9-done-${i}`);
};
for (let i = 0; i < 4; i++) await book(i);

await page.goto(`${BASE}/book/${slug}/new`, { waitUntil: 'networkidle' });
await page.locator('label.choice', { hasText: he ? 'שיעור קבוצתי' : 'Group class' }).first().click();
await cta().click();
await page.waitForTimeout(400);
await shot('10-schedule-full');

// 5. Owner view of the full session.
await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await shot('11-dashboard');
await page.goto(`${BASE}/app/calendar?view=day&date=${tomorrow}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.locator('.cal-class').first().click();
await page.waitForTimeout(600);
await shot('12-session-full');

if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
