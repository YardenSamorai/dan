// QA: zoomed crops of the hand plate with a pixel grid, for tracing nail paths.
// node qa/grid.mjs x,y,w,h[;x,y,w,h...] [overlay.svg-path-file]
// Coordinates are scene units: the plate is always laid out at 768×1024 regardless of its pixel size.
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';

const regions = (process.argv[2] ?? '0,0,768,1024').split(';').map((r) => r.split(',').map(Number));
const overlay = process.argv[3] && existsSync(process.argv[3]) ? readFileSync(process.argv[3], 'utf8') : '';
const img = readFileSync(`qa/source/${process.env.PLATE ?? 'hand'}.jpg`).toString('base64');

let grid = '';
for (let x = 0; x <= 768; x += 10) grid += `<line x1="${x}" y1="0" x2="${x}" y2="1024" stroke="${x % 50 ? 'rgba(0,120,255,.25)' : 'rgba(255,0,80,.6)'}" stroke-width="${x % 50 ? 0.15 : 0.3}"/>`;
for (let y = 0; y <= 1024; y += 10) grid += `<line x1="0" y1="${y}" x2="768" y2="${y}" stroke="${y % 50 ? 'rgba(0,120,255,.25)' : 'rgba(255,0,80,.6)'}" stroke-width="${y % 50 ? 0.15 : 0.3}"/>`;
for (let x = 0; x <= 768; x += 50) for (let y = 0; y <= 1024; y += 50) grid += `<text x="${x + 1}" y="${y + 4}" font-size="3.5" fill="#d0005a" font-family="monospace">${x},${y}</text>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 5 });
await page.setContent(`<body style="margin:0"><svg width="768" height="1024" viewBox="0 0 768 1024" style="display:block">
<image href="data:image/jpeg;base64,${img}" width="768" height="1024"/>${overlay}${grid}</svg></body>`);
for (const [i, [x, y, w, h]] of regions.entries()) {
  await page.screenshot({ path: `qa/shots/grid-${i}.png`, clip: { x, y, width: w, height: h } });
}
await browser.close();
