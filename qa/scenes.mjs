// QA: the looping scenes in the product chapters and "switching".  LOCALE=he URL=… node qa/scenes.mjs [1440x900] [ms,ms,…]
import { chromium } from 'playwright';

const [w, h] = (process.argv[2] ?? '1440x900').split('x').map(Number);
const times = (process.argv[3] ?? '300,1200,2500,4200').split(',').map(Number);
const locale = process.env.LOCALE ?? 'he';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w < 900 ? 2 : 1 });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.addInitScript((l) => localStorage.setItem('saas.locale', l), locale);
await p.goto(process.env.URL ?? 'http://localhost:5173/', { waitUntil: 'networkidle' });

const targets = [
  ...[0, 1, 2, 3, 4, 5].map((i) => ({ name: `ch${i}`, sel: `.chapter >> nth=${i}` })),
  { name: 'switch', sel: '.mk-switch' },
];
for (const { name, sel } of targets) {
  const el = p.locator(sel);
  await el.evaluate((n) => n.scrollIntoView({ block: 'center' }));
  const t0 = Date.now();
  for (const t of times) {
    await p.waitForTimeout(Math.max(0, t - (Date.now() - t0)));
    await el.screenshot({ path: `qa/shots/scene-${w}-${locale}-${name}-${t}.png` });
  }
  // Let the scene leave the screen before the next one, so nothing carries over.
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(150);
}
const playing = await p.evaluate(() => document.querySelectorAll('[data-play]').length);
console.log('elements playing at top of page:', playing);
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
console.log('done');
await b.close();
