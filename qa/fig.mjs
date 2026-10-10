// QA: figure studies from the dev lab.  node qa/fig.mjs full,hands,head [prefix]
import { chromium } from 'playwright';

const shots = (process.argv[2] ?? 'full').split(',');
const prefix = process.argv[3] ?? 'fig';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
for (const s of shots) {
  await page.goto(`http://localhost:5173/lab.html?fig=${s}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  await page.screenshot({ path: `qa/shots/${prefix}-${s}.png` });
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
