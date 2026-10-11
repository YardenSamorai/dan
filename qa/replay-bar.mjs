// A returning visitor on the demo page: the "watch again" pill must sit below the fixed header, not under it,
// and clicking it must bring the film back.
//   node qa/replay-bar.mjs [base]   → qa/shots/replay-<device>.png, qa/shots/mine-phone.png
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5174';
const browser = await chromium.launch();
for (const [device, viewport] of [
  ['phone', { width: 320, height: 700 }],
  ['desktop', { width: 1280, height: 800 }],
]) {
  const page = await browser.newPage({ viewport, locale: 'he-IL', deviceScaleFactor: 2 });
  await page.addInitScript(() => sessionStorage.setItem('film.seen', '1'));
  await page.goto(`${BASE}/book/demo-studio`, { waitUntil: 'networkidle' });
  const pill = await page.locator('.film-replay .btn').boundingBox();
  const header = await page.locator('.site-header').boundingBox();
  console.log(device, 'pill below header:', !!pill && !!header && pill.y >= header.y + header.height, pill, header);
  await page.screenshot({ path: `qa/shots/replay-${device}.png`, clip: { x: 0, y: 0, width: viewport.width, height: 220 } });
  await page.locator('.film-replay .btn').click();
  const replayed = await page.locator('.film').waitFor({ timeout: 5000 }).then(() => true, () => false);
  console.log(device, 'click starts the film again:', replayed);
  if (device === 'phone') {
    await page.goto(`${BASE}/book/demo-studio/bookings`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'qa/shots/mine-phone.png', fullPage: true });
  }
  await page.close();
}
await browser.close();
