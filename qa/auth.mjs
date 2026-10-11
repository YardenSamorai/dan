// QA: the sign-up / sign-in forms in their states.  LOCALE=he URL=… node qa/auth.mjs [1440x900]
import { chromium } from 'playwright';

const [w, h] = (process.argv[2] ?? '1440x900').split('x').map(Number);
const locale = process.env.LOCALE ?? 'he';
const base = (process.env.URL ?? 'http://localhost:5173/').replace(/\/$/, '');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w < 900 ? 2 : 1 });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.addInitScript((l) => localStorage.setItem('saas.locale', l), locale);
const shot = (name) => p.screenshot({ path: `qa/shots/auth-${w}-${locale}-${name}.png` });

await p.goto(`${base}/sign-up`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2600);
await shot('up-empty');

const inputs = p.locator('.af__input');
await inputs.first().fill('נועה לוי');
await inputs.nth(1).click();
await p.keyboard.type('noa@studio', { delay: 10 });
await shot('up-typing');

const password = p.locator('input[type="password"]');
if (await password.count()) {
  await password.fill('abc12');
  await shot('up-weak');
  await password.fill('abc12345');
  await p.waitForTimeout(450);
  await shot('up-strong');
}

await inputs.nth(1).fill('not-an-email');
await p.locator('.auth__submit').click();
await p.waitForTimeout(450);
await shot('up-error');

await p.goto(`${base}/sign-in`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2600);
await shot('in-empty');

if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
console.log('done');
await b.close();
