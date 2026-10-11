// QA: the "who it's for" section, auto-cycling and after picking a field.  LOCALE=he URL=… node qa/types.mjs [1440x900]
import { chromium } from 'playwright';

const [w, h] = (process.argv[2] ?? '1440x900').split('x').map(Number);
const locale = process.env.LOCALE ?? 'he';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w < 900 ? 2 : 1 });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.addInitScript((l) => localStorage.setItem('saas.locale', l), locale);
await p.goto(process.env.URL ?? 'http://localhost:5173/', { waitUntil: 'networkidle' });
const sec = p.locator('section[aria-labelledby="types-title"]');
await p.evaluate(() => document.querySelector('section[aria-labelledby="types-title"]').scrollIntoView({ block: 'center' }));
await p.waitForTimeout(800);
await sec.screenshot({ path: `qa/shots/types-${w}-${locale}-0.png` });
await p.waitForTimeout(4200);
await sec.screenshot({ path: `qa/shots/types-${w}-${locale}-auto.png` });
await sec.getByRole('tab').nth(2).click();
await p.waitForTimeout(800);
await sec.screenshot({ path: `qa/shots/types-${w}-${locale}-picked.png` });
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
console.log('done');
await b.close();
