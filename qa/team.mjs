// Team invites, end to end in the in-browser demo (VITE_BACKEND=mock):
//   node qa/team.mjs [base]   → qa/shots/team-*.png
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5174';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = async (name) => (await page.waitForTimeout(1200), page).screenshot({ path: `qa/shots/team-${name}.png`, fullPage: true });

await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });
await page.fill('#si-email', 'noa@demo-studio.example');
await page.locator('.auth__form button').click();
await page.waitForURL('**/app');
await page.goto(`${BASE}/app/settings/team`, { waitUntil: 'networkidle' });
await shot('1-settings');

await page.getByRole('button', { name: 'יצירת קישור' }).click();
const link = await page.locator('.invite__done input').inputValue();
await shot('2-link');
console.log('link', link);

await page.locator('.account-menu__btn').click();
await page.getByRole('button', { name: 'יציאה' }).click();
await page.waitForURL('**/sign-in');
await page.goto(link.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'networkidle' });
await shot('3-join-signed-out');

await page.getByRole('link', { name: 'פתיחת חשבון והצטרפות' }).click();
await page.fill('#su-name', 'טל בדיקה');
await page.fill('#su-email', 'tal.qa@example.com');
await page.locator('.auth__form button.auth__submit').click();
await page.waitForURL('**/join/**');
await page.locator('.join__mark').waitFor();
await shot('4-join-signed-in');
await page.locator('.auth__submit').click();
await page.waitForURL('**/app');
await page.waitForTimeout(500);
await shot('5-joined');
console.log('url', page.url());
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
