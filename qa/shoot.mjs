// QA helper: node qa/shoot.mjs <desktop|mobile> <p1,p2,...> [path]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [mode = 'desktop', list = '0', path = '/'] = process.argv.slice(2);
const viewport = mode === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
mkdirSync('qa/shots', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport, deviceScaleFactor: mode === 'mobile' ? 2 : 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const locale = process.env.LOCALE ?? 'en';
await page.addInitScript((l) => localStorage.setItem('saas.locale', l), locale);
const tag = locale === 'en' ? mode : `${mode}-${locale}`;
await page.goto(`http://localhost:5173${path}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);

for (const token of list.split(',')) {
  if (token.startsWith('y')) {
    await page.evaluate((y) => window.scrollTo(0, y), Number(token.slice(1)));
  } else if (token === 'full') {
    await page.screenshot({ path: `qa/shots/${tag}-full.png`, fullPage: true });
    continue;
  } else {
    const p = Number(token);
    await page.evaluate((p) => {
      const h = document.querySelector('.hero');
      const span = h.offsetHeight - window.innerHeight;
      window.scrollTo(0, h.offsetTop + span * p);
    }, p);
  }
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `qa/shots/${tag}-${token}.png` });
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
