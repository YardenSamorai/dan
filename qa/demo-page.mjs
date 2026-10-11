// The example business page, full length, phone and desktop:
//   node qa/demo-page.mjs [base]   → qa/shots/demo-page-*.png
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5174';
const browser = await chromium.launch();
const errors = [];
for (const [name, width] of [['phone', 390], ['desktop', 1280]]) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, locale: 'he-IL' });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/book/demo-studio${process.argv[3] ?? ''}`, { waitUntil: 'networkidle' });
  for (let y = 0; y < (await page.evaluate(() => document.body.scrollHeight)); y += 600) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `qa/shots/demo-page-${name}.png`, fullPage: true });
  await page.close();
}
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
