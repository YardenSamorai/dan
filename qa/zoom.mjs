// QA: zoomed crop of the hero at progress p. node qa/zoom.mjs <p> <selector-or-x,y,w,h> [name]
import { chromium } from 'playwright';

const [p = '1', region = 'nails', name = 'zoom'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.addInitScript(() => localStorage.setItem('saas.locale', 'en'));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate((p) => {
  const h = document.querySelector('.hero');
  window.scrollTo(0, h.offsetTop + (h.offsetHeight - innerHeight) * p);
}, Number(p));
await page.waitForTimeout(1400);
let clip;
if (region === 'nails') {
  const r = await page.evaluate(() => {
    const b = document.querySelector('.hero__scene').getBoundingClientRect();
    return { x: b.x + b.width * 0.18, y: b.y + b.height * 0.15, width: b.width * 0.7, height: b.height * 0.45 };
  });
  clip = r;
} else {
  const [x, y, width, height] = region.split(',').map(Number);
  clip = { x, y, width, height };
}
await page.screenshot({ path: `qa/shots/${name}.png`, clip });
await browser.close();
