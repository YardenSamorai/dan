// QA: frame pacing while scrolling through the hero.  node qa/hero3d-perf.mjs [1440x900] [cpuThrottle]
import { chromium } from 'playwright';

const [w, h] = (process.argv[2] ?? '1440x900').split('x').map(Number);
const throttle = Number(process.argv[3] ?? 1);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900, deviceScaleFactor: w < 900 ? 3 : 1 });
await ctx.addInitScript(() => localStorage.setItem('saas.locale', 'he'));
const page = await ctx.newPage();
page.on('console', (m) => m.text().startsWith('spike') && console.log(m.text()));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
if (throttle > 1) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
}
const r = await page.evaluate(
  () =>
    new Promise((done) => {
      const s = document.querySelector('.h3');
      const top = s.getBoundingClientRect().top + scrollY;
      const span = s.offsetHeight - innerHeight;
      const dts = [];
      let last = performance.now();
      const t0 = last;
      const dur = 9000;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        if (now - last > 40) (window.__spikes ??= []).push(`${(now - last).toFixed(0)}ms@${k.toFixed(3)}`);
        dts.push(now - last);
        last = now;
        scrollTo(0, top + k * span);
        if (k < 1) requestAnimationFrame(step);
        else done(dts);
      };
      requestAnimationFrame(step);
    }),
);
console.log('spikes', await page.evaluate(() => (window.__spikes ?? []).join(' ')));
r.sort((a, b) => a - b);
const q = (x) => r[Math.floor(x * (r.length - 1))].toFixed(1);
console.log(`${w}x${h} cpu x${throttle}: frames ${r.length}, median ${q(0.5)}ms, p95 ${q(0.95)}ms, p99 ${q(0.99)}ms, max ${r[r.length - 1].toFixed(1)}ms, >33ms ${r.filter((x) => x > 33).length}`);
await browser.close();
