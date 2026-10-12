// QA: the business page below the demo film, full length. BASE=http://localhost:5181 LOCALE=he node qa/tenant-page.mjs [slug] [tag]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const locale = process.env.LOCALE ?? 'he';
const [slug = 'demo-studio', tag = 'now'] = process.argv.slice(2);
mkdirSync('qa/shots', { recursive: true });
const browser = await chromium.launch();
const errors = [];
for (const [mode, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: mode === 'mobile' ? 2 : 1 });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => (m.type() === 'error' || m.text().includes('[i18n]')) && errors.push(m.text()));
  await page.addInitScript((l) => localStorage.setItem('saas.locale', l), locale);
  await page.goto(`${BASE}/book/${slug}`, { waitUntil: 'networkidle' });
  // Skip past the film to the page itself.
  const main = page.locator('main#main');
  await main.scrollIntoViewIfNeeded();
  await page.evaluate(async () => {
    const top = document.querySelector('main#main').getBoundingClientRect().top + scrollY;
    for (let y = top; y < document.body.scrollHeight; y += 600) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    scrollTo(0, top);
  });
  await page.waitForTimeout(600);
  await main.screenshot({ path: `qa/shots/tenant-${tag}-${mode}-${locale}.png` });
  if (process.env.FRAMES) {
    const top = await page.evaluate(() => document.querySelector('main#main').getBoundingClientRect().top + scrollY);
    const end = await page.evaluate(() => document.body.scrollHeight);
    for (let y = top, i = 0; y < end - 200; y += viewport.height * 0.9, i++) {
      await page.evaluate((v) => scrollTo(0, v), y);
      await page.waitForTimeout(350);
      await page.screenshot({ path: `qa/shots/tenant-${tag}-${mode}-${locale}-f${i}.png` });
    }
  }
  await page.close();
}
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
