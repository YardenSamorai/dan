// QA matrix: every key route × width × locale. Reports horizontal overflow, page errors and small touch targets.
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const WIDTHS = (process.env.WIDTHS ?? '375,390,430,768,1024,1280,1440').split(',').map(Number);
const PUBLIC = ['/', '/sign-in', '/sign-up', '/book/demo-studio', '/book/demo-studio/new'];
const APP = ['/app', '/app/calendar', '/app/calendar?view=week', '/app/appointments', '/app/customers', '/app/services', '/app/staff', '/app/availability', '/app/settings/business', '/app/settings/branding'];

const browser = await chromium.launch();
const issues = [];
for (const locale of ['en', 'he']) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 860 }, hasTouch: width < 800, isMobile: width < 800 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => issues.push(`${locale} ${width} pageerror ${e.message}`));
    await page.addInitScript((l) => localStorage.setItem('saas.locale', l), locale);
    const check = async (route) => {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(350);
      const r = await page.evaluate((touch) => {
        const de = document.documentElement;
        const over = de.scrollWidth - de.clientWidth;
        const wide = [];
        if (over > 1) {
          for (const el of document.querySelectorAll('body *')) {
            const b = el.getBoundingClientRect();
            if (b.width && (b.right > de.clientWidth + 1 || b.left < -1) && getComputedStyle(el).position !== 'fixed') {
              let p = el.parentElement, clipped = false;
              while (p && p !== document.body) {
                const o = getComputedStyle(p).overflowX;
                if (o !== 'visible') { clipped = true; break; }
                p = p.parentElement;
              }
              if (!clipped) wide.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
            }
            if (wide.length > 4) break;
          }
        }
        const small = [];
        if (touch) {
          for (const el of document.querySelectorAll('button, a[href], [role="tab"], input[type="checkbox"], select')) {
            const b = el.getBoundingClientRect();
            if (!b.width || getComputedStyle(el).visibility === 'hidden') continue;
            if (el.closest('[aria-hidden="true"], .sr-only, .hero, .chapter__stage')) continue;
            if (Math.min(b.width, b.height) < 30) small.push(`${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')}(${Math.round(b.width)}x${Math.round(b.height)})`);
          }
        }
        return { over, wide, small: [...new Set(small)].slice(0, 6) };
      }, width < 800);
      if (r.over > 1) issues.push(`${locale} ${width} ${route} overflow ${r.over}px ${r.wide.join(' ')}`);
      if (r.small.length) issues.push(`${locale} ${width} ${route} small ${r.small.join(' ')}`);
    };
    for (const route of PUBLIC) await check(route);
    await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });
    await page.fill('#si-email', 'noa@demo-studio.example');
    await page.locator('.auth__form button').click();
    await page.waitForURL(/\/app/, { timeout: 8000 });
    for (const route of APP) await check(route);
    await ctx.close();
  }
}
await browser.close();
console.log(issues.length ? issues.join('\n') : 'clean');
