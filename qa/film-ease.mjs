// One wheel notch on the demo film: the progress should glide to its new value, not jump.
//   node qa/film-ease.mjs [base]
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5174';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' });
await page.goto(`${BASE}/book/demo-studio`, { waitUntil: 'networkidle' });
await page.locator('.film__set[data-ready]').waitFor({ timeout: 15000 });
await page.evaluate(() => {
  const el = document.querySelector('.film');
  window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + (el.offsetHeight - innerHeight) * 0.3);
});
await page.waitForTimeout(1500);
const progress = () => page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('.film__progress span')).transform).a);
const before = await progress();
await page.mouse.move(700, 450);
await page.mouse.wheel(0, 400);
const samples = [];
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(60);
  samples.push(await progress());
}
const steps = samples.map((v, i) => v - (i ? samples[i - 1] : before));
console.log('progress', before.toFixed(4), '→', samples.map((v) => v.toFixed(4)).join(' '));
const moving = steps.filter((d) => d > 0.00005).length;
console.log(moving >= 4 ? `glides over ${moving} samples` : `jumps (moved in ${moving} samples)`);
await browser.close();
