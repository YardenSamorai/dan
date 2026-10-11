// Repeating appointments and the book-again setting, in the in-browser demo (VITE_BACKEND=mock):
//   node qa/repeat.mjs [base]   → qa/shots/repeat-*.png
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5174';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = async (name, el) => (await page.waitForTimeout(900), el ?? page).screenshot({ path: `qa/shots/repeat-${name}.png` });

await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });
await page.fill('#si-email', 'noa@demo-studio.example');
await page.locator('.auth__form button').click();
await page.waitForURL('**/app');

await page.getByRole('button', { name: 'תור חדש' }).first().click();
const drawer = page.locator('.drawer').last();
await drawer.waitFor();
await drawer.locator('.picker-list button').first().click();
const monday = new Date();
monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
await drawer.locator('input[type="date"]').fill(monday.toISOString().slice(0, 10));
await drawer.locator('input[type="date"]').locator('xpath=../following-sibling::label//select').selectOption('600');
await drawer.getByLabel('חוזר').selectOption('1');
await drawer.getByLabel('כמה תורים בסך הכול').selectOption('8');
await drawer.locator('.series-preview').scrollIntoViewIfNeeded();
await shot('1-drawer', drawer);
console.log('preview:', (await drawer.locator('.series-preview').innerText()).replace(/\n/g, ' | '));
await drawer.locator('.btn--primary').click();
await page.waitForTimeout(800);
console.log('toast:', await page.locator('[role="status"], .toast').allInnerTexts());

await page.goto(`${BASE}/app/settings/notifications`, { waitUntil: 'networkidle' });
const rebook = page.locator('.panel', { hasText: 'הזמנה לקבוע שוב' }).first();
await rebook.scrollIntoViewIfNeeded();
await shot('2-notifications', rebook);

await page.goto(`${BASE}/app/services`, { waitUntil: 'networkidle' });
await page.locator('main button, main a').filter({ hasText: /./ }).nth(0);
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
