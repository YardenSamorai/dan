// Watch the film to the end, book a test appointment, come back:
//   node qa/film-flow.mjs [base]
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5174';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${BASE}/book/demo-studio`, { waitUntil: 'networkidle' });
await page.locator('.film__set[data-ready]').waitFor();
const headerHidden = () => page.evaluate(() => getComputedStyle(document.querySelector('.site-header')).visibility === 'hidden');
console.log('header hidden during film:', await headerHidden());

await page.evaluate(() => {
  const el = document.querySelector('.film');
  window.scrollTo(0, el.offsetTop + el.offsetHeight - window.innerHeight - 2);
});
await page.waitForTimeout(900);
await page.getByRole('link', { name: 'לקביעת תור בדיקה' }).click();
await page.waitForURL('**/book/demo-studio/new**');
await page.locator('.choice').first().waitFor();
console.log('booking flow opened:', page.url(), '| film gone:', !(await page.locator('.film').count()));
await page.goBack({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);
console.log('replay bar instead of the film:', await page.locator('.film-replay').isVisible(), '| film:', await page.locator('.film').count());
console.log('header back:', !(await headerHidden()));
console.log('focusable inside phone:', await page.evaluate(() => document.querySelector('.film iframe')?.hasAttribute('inert') ?? 'n/a'));
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
