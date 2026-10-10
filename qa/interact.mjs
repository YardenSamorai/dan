// QA: drag-reschedule + undo, quick-create from an empty slot, status change.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.addInitScript(() => localStorage.setItem('saas.locale', 'en'));

const d = new Date(Date.now() + 864e5);
const tomorrow = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
await page.goto(`http://localhost:5173/app/calendar?date=${tomorrow}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// Drag the first card 1 hour down.
const card = page.locator('.cal-appt').first();
const before = await card.getAttribute('aria-label');
const box = await card.boundingBox();
await page.mouse.move(box.x + 20, box.y + 10);
await page.mouse.down();
await page.mouse.move(box.x + 20, box.y + 40, { steps: 4 });
await page.mouse.move(box.x + 20, box.y + 10 + Number(process.env.DY ?? -96), { steps: 6 });
await page.waitForTimeout(200);
await page.screenshot({ path: 'qa/shots/int-drag.png' });
await page.mouse.up();
await page.waitForTimeout(600);
const toast = await page.locator('.toast').first().textContent().catch(() => null);
console.log('before:', before);
console.log('toast:', toast);
await page.screenshot({ path: 'qa/shots/int-dropped.png' });
const undo = page.locator('.toast button');
if (await undo.count()) {
  await undo.first().click();
  await page.waitForTimeout(600);
  console.log('after undo:', await page.locator('.cal-appt').first().getAttribute('aria-label'));
}

// Quick-create at 09:00 in the first column.
const col = page.locator('.cal__col').first();
const cb = await col.boundingBox();
const nine = await page.locator('.cal__hour', { hasText: '09:00' }).first().boundingBox();
await page.mouse.click(cb.x + cb.width / 2, nine.y + nine.height / 2 + 8);
await page.waitForTimeout(500);
await page.locator('.picker-list button').first().click();
await page.waitForTimeout(200);
await page.screenshot({ path: 'qa/shots/int-new.png' });
const createBtn = page.locator('dialog[open] .btn--primary').last();
console.log('create label:', await createBtn.textContent(), 'disabled:', await createBtn.isDisabled());
if (!(await createBtn.isDisabled())) {
  await createBtn.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'qa/shots/int-created.png' });
  console.log('drawer title:', await page.locator('dialog[open] .drawer__title').textContent().catch(() => null));
  const confirm = page.locator('dialog[open] .detail__actions .btn--ink').first();
  if (await confirm.count()) {
    console.log('action:', await confirm.textContent());
    await confirm.click();
    await page.waitForTimeout(400);
    console.log('status now:', await page.locator('dialog[open] .detail__hero .badge').textContent());
  }
}

if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
