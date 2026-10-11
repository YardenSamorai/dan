// The "who with" booking step on a phone:
//   node qa/staff-mobile.mjs [base]   → qa/shots/staff-mobile-*.png
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5174';
const browser = await chromium.launch();
const errors = [];
for (const width of [320, 390, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, locale: 'he-IL', deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/book/demo-studio/new`, { waitUntil: 'networkidle' });
  await page.locator('.choice', { hasText: 'ג׳ל' }).first().click();
  await page.waitForTimeout(500);
  if (!(await page.locator('.choice--staff').count())) await page.getByRole('button', { name: 'המשך' }).click();
  await page.locator('.choice--staff').first().waitFor();
  await page.waitForTimeout(700);
  const widths = await page.locator('.choice--staff .choice__main').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  console.log(width, 'name column widths:', widths.join(', '));
  await page.screenshot({ path: `qa/shots/staff-mobile-${width}.png` });
  await page.close();
}
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
