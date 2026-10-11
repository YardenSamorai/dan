// QA: the "how it works" section mid-animation.  LOCALE=he URL=… node qa/how.mjs [1440x900] [ms,ms,…]
import { chromium } from 'playwright';

const [w, h] = (process.argv[2] ?? '1440x900').split('x').map(Number);
const times = (process.argv[3] ?? '400,1900,3800,6600,9200,12600').split(',').map(Number);
const locale = process.env.LOCALE ?? 'he';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w < 900 ? 2 : 1 });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.addInitScript((l) => localStorage.setItem('saas.locale', l), locale);
await p.goto(process.env.URL ?? 'http://localhost:5173/', { waitUntil: 'networkidle' });
const how = p.locator('#how');
await how.scrollIntoViewIfNeeded();
await p.evaluate(() => document.querySelector('#how').scrollIntoView({ block: 'center' }));
const t0 = Date.now();
for (const t of times) {
  await p.waitForTimeout(Math.max(0, t - (Date.now() - t0)));
  await how.screenshot({ path: `qa/shots/how-${w}-${locale}-${t}.png` });
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
console.log('done');
await b.close();
