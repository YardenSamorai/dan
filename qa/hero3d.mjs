// QA: the live hero at scroll progress values.  node qa/hero3d.mjs 0,0.5,1 [1440x900] [prefix] [he|en] [reduce]
import { chromium } from 'playwright';

const ps = (process.argv[2] ?? '0').split(',').map(Number);
const [w, h] = (process.argv[3] ?? '1440x900').split('x').map(Number);
const prefix = process.argv[4] ?? 'h3';
const locale = process.argv[5] ?? 'he';
const reduce = process.argv[6] === 'reduce';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: reduce ? 'reduce' : 'no-preference', hasTouch: w < 900, isMobile: w < 900, deviceScaleFactor: w < 900 ? 2 : 1 });
await ctx.addInitScript((l) => localStorage.setItem('saas.locale', l), locale);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
console.log('mode', await page.evaluate(() => document.querySelector('.h3')?.dataset.mode));
const files = [];
for (const p of ps) {
  await page.evaluate((p) => {
    const s = document.querySelector('.h3');
    const top = s.getBoundingClientRect().top + scrollY;
    scrollTo(0, top + p * (s.offsetHeight - innerHeight));
  }, p);
  await page.waitForTimeout(1300);
  const f = `qa/shots/${prefix}-${String(p).replace('.', '_')}-${w}.png`;
  await page.screenshot({ path: f });
  files.push(f);
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
console.log(files.join(' '));
await browser.close();
