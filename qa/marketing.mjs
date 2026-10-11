// QA: each landing-page section after the hero, plus the live page designer in every style.
//   LOCALE=he URL=http://localhost:5173/ node qa/marketing.mjs [desktop|mobile]
import { chromium } from 'playwright';

const mode = process.argv[2] ?? 'desktop';
const locale = process.env.LOCALE ?? 'en';
const vp = mode === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const b = await chromium.launch();
const p = await b.newPage({ viewport: vp, deviceScaleFactor: mode === 'mobile' ? 2 : 1 });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.addInitScript((l) => localStorage.setItem('saas.locale', l), locale);
await p.goto(process.env.URL ?? 'http://localhost:5173/', { waitUntil: 'networkidle' });

const shot = async (el, name) => {
  await el.scrollIntoViewIfNeeded();
  await p.waitForTimeout(700);
  await el.screenshot({ path: `qa/shots/mk-${mode}-${locale}-${name}.png` });
};

const chapters = await p.locator('.chapter').all();
for (const [i, c] of chapters.entries()) await shot(c, `chapter${i}`);
await shot(p.locator('.showcase__more'), 'details');
await shot(p.locator('.mk-switch').locator('..'), 'switch');
if (await p.locator('.mk-honest').count()) await shot(p.locator('.mk-honest'), 'honest');

const design = p.locator('.vig-design');
const styles = design.locator('fieldset').first().locator('button');
for (let i = 0; i < (await styles.count()); i++) {
  await styles.nth(i).click();
  await design.locator('fieldset').nth(1).locator('button').nth(i * 2).click();
  await p.waitForTimeout(500);
  await shot(design, `design-${i}`);
}
await design.locator('fieldset').nth(2).locator('button').last().click();
await shot(design, 'design-faq');

if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
console.log('done');
await b.close();
