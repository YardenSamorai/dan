// The demo film on /book/demo-studio: screenshots at points along the scroll.
//   node qa/film.mjs [base] [desktop|phone] [locale]   → qa/shots/film-<device>-<nn>.png
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5174';
const device = process.argv[3] ?? 'desktop';
const locale = process.argv[4] ?? 'he';
const size = device === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: size, locale: locale === 'he' ? 'he-IL' : 'en-US', deviceScaleFactor: device === 'phone' ? 2 : 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${BASE}/book/demo-studio`, { waitUntil: 'networkidle' });
if (locale === 'en') {
  await page.evaluate(() => {
    const prefix = Object.keys(localStorage)[0]?.split('.')[0];
    localStorage.setItem(`${prefix}.locale`, 'en');
  });
  await page.reload({ waitUntil: 'networkidle' });
}
await page.locator('.film__set[data-ready]').waitFor({ timeout: 15000 });

const points = (process.argv[5] ?? '0,0.06,0.12,0.2,0.27,0.36,0.45,0.55,0.66,0.74,0.82,0.9,0.99').split(',').map(Number);
for (const [i, p] of points.entries()) {
  await page.evaluate((p) => {
    const el = document.querySelector('.film');
    const run = el.offsetHeight - window.innerHeight;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + run * p);
  }, p);
  await page.waitForTimeout(2000);
  const caption = await page.locator('.film__caption[data-active] .film__title').innerText().catch(() => '?');
  console.log(String(i).padStart(2, '0'), p, caption);
  await page.screenshot({ path: `qa/shots/film-${device}-${String(i).padStart(2, '0')}.png` });
}
await page.evaluate(() => document.getElementById('film-end').scrollIntoView());
await page.waitForTimeout(800);
await page.screenshot({ path: `qa/shots/film-${device}-after.png` });
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
