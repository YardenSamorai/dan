// Export the hero's poster frames and the still version from the real 3D scene (dev lab).
//   node qa/export-stills.mjs   → qa/shots/export/*.png, then: python qa/_webp.py
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

mkdirSync('qa/shots/export', { recursive: true });
const jobs = [
  // Posters: the hero's first frame, shown until WebGL is ready. Same framing and rail offset as the page.
  { name: 'poster-wide', w: 1600, h: 1000, p: 0, shift: 58 },
  { name: 'poster-wide-ltr', w: 1600, h: 1000, p: 0, shift: -58 },
  { name: 'poster-tall', w: 430, h: 932, p: 0, shift: 22, dpr: 2 },
  { name: 'poster-tall-ltr', w: 430, h: 932, p: 0, shift: -22, dpr: 2 },
  // Stills: one frame per appointment, for reduced motion and devices that don't get WebGL.
  { name: 'still-nails', w: 960, h: 720, p: 0.015 },
  { name: 'still-pilates', w: 960, h: 720, p: 0.27 },
  { name: 'still-hair', w: 960, h: 720, p: 0.45 },
  { name: 'still-clinic', w: 960, h: 720, p: 0.66 },
  { name: 'still-home', w: 960, h: 720, p: 0.79 },
];
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const j of jobs) {
  const page = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: j.dpr ?? 1 });
  await page.goto(`http://localhost:5173/lab.html?p=${j.p}&shift=${j.shift ?? 0}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `qa/shots/export/${j.name}.png` });
  await page.close();
  console.log(j.name);
}
await browser.close();
