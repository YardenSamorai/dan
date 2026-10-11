// Close-ups of the film's dashboard panel at points along the scroll.
//   node qa/film-panel.mjs [base] [points]   → qa/shots/film-panel-<nn>.png
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5174';
const points = (process.argv[3] ?? '0.856').split(',').map(Number);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'he-IL', deviceScaleFactor: 2 });
await page.goto(`${BASE}/book/demo-studio`, { waitUntil: 'networkidle' });
await page.locator('.film__set[data-ready]').waitFor({ timeout: 15000 });
for (const [i, p] of points.entries()) {
  await page.evaluate((p) => {
    const el = document.querySelector('.film');
    const run = el.offsetHeight - window.innerHeight;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + run * p);
  }, p);
  await page.waitForTimeout(2000);
  await page.locator('.fp').screenshot({ path: `qa/shots/film-panel-${String(i).padStart(2, '0')}.png` });
}
await browser.close();
