// QA: stills from the dev-only 3D lab.  node qa/lab.mjs 0,0.1,0.2 [1440x900] [prefix]
import { chromium } from 'playwright';

const ps = (process.argv[2] ?? '0').split(',').map(Number);
const [w, h] = (process.argv[3] ?? '1440x900').split('x').map(Number);
const prefix = process.argv[4] ?? 'lab';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://localhost:5173/lab.html?p=0`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
const files = [];
for (const p of ps) {
  const t0 = Date.now();
  await page.evaluate((p) => window.__frame(p), p);
  const ms = Date.now() - t0;
  const f = `qa/shots/${prefix}-${String(p).replace('.', '_')}-${w}.png`;
  await page.screenshot({ path: f });
  files.push(f);
  console.log(p, `${ms}ms`);
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
console.log(files.join(' '));
await browser.close();
