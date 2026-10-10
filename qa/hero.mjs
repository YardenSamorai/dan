// QA: the calendar hero at scroll offsets (in viewport heights).  node qa/hero.mjs 0,0.4,0.8 [1440x900] [prefix] [he|en] [reduce]
import { chromium } from 'playwright';

const ys = (process.argv[2] ?? '0').split(',').map(Number);
const [w, h] = (process.argv[3] ?? '1440x900').split('x').map(Number);
const prefix = process.argv[4] ?? 'hc';
const locale = process.argv[5] ?? 'he';
const reduce = process.argv[6] === 'reduce';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: reduce ? 'reduce' : 'no-preference', hasTouch: w < 900, isMobile: w < 900, deviceScaleFactor: 2 });
await ctx.addInitScript((l) => localStorage.setItem('saas.locale', l), locale);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const files = [];
for (const y of ys) {
  await page.evaluate((y) => scrollTo(0, y * innerHeight), y);
  await page.waitForTimeout(900);
  const f = `qa/shots/${prefix}-${String(y).replace('.', '_')}-${w}.png`;
  await page.screenshot({ path: f });
  files.push(f);
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
console.log(files.join(' '));
await browser.close();
