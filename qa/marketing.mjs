import { chromium } from 'playwright';
const mode = process.argv[2] ?? 'desktop';
const vp = mode === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const b = await chromium.launch(); const p = await b.newPage({ viewport: vp, deviceScaleFactor: mode === 'mobile' ? 2 : 1 });
await p.addInitScript((l) => localStorage.setItem('saas.locale', l), process.env.LOCALE ?? 'en');
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
const start = await p.evaluate(() => { const h = document.querySelector('.h3'); return h.offsetTop + h.offsetHeight; });
const total = await p.evaluate(() => document.documentElement.scrollHeight);
let i = 0;
for (let y = start; y < total; y += vp.height * 0.9) {
  await p.evaluate((y) => window.scrollTo(0, y), y);
  await p.waitForTimeout(900);
  await p.screenshot({ path: `qa/shots/mk-${mode}-${process.env.LOCALE ?? 'en'}-${i++}.png` });
}
console.log('frames', i);
await b.close();
