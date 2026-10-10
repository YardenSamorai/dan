// Export the hero's sets, camera path and cast motion for the Blender pipeline (dev server must be running).
//   node qa/export-blender.mjs [samples]   → tools/blender/data/sets.glb, tools/blender/data/frames.json
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const n = process.argv[2] ?? '1200';
const browser = await chromium.launch({ args: ['--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(`http://localhost:5173/lab.html?export=${n}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
const { glb, frames } = await page.evaluate(() => window.__export);
mkdirSync('tools/blender/data', { recursive: true });
writeFileSync('tools/blender/data/sets.glb', Buffer.from(glb, 'base64'));
writeFileSync('tools/blender/data/frames.json', JSON.stringify(frames));
console.log('sets.glb', Math.round((glb.length * 0.75) / 1024), 'KB;', frames.length, 'frames');
await browser.close();
