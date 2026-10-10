// Build an alpha-matted WebP of a hero plate (background is near-neutral cream, subject is chromatic or dark).
// node qa/matte.mjs [hand|fitness|education|health]  → public/hero/<name>.webp (+ qa/shots/matte-<name>.png)
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const name = process.argv[2] ?? 'hand';
const src = 'data:image/jpeg;base64,' + readFileSync(`qa/source/${name}.jpg`).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');
// Only the manicure plate has pale nail plates that need forcing opaque from traced paths.
const nails = name === 'hand' ? [...readFileSync('qa/nails-overlay.svg', 'utf8').matchAll(/ d="([^"]+)"/g)].map((m) => m[1]) : [];
// Plates with a soft cast shadow need a stricter colour-distance ramp so the shadow drops out.
const DIST = { education: [40, 66], health: [38, 62] }[name] ?? [22, 40];
const WARM = { education: [14, 30] }[name] ?? [6, 20];
const ROWS = name === 'education';
const out = await page.evaluate(async ([src, NAILS, DIST, WARM, ROWS]) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const { width: w, height: h } = img;
  const c = document.getElementById('c');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // Background reference: median of the border band.
  const samples = [];
  for (let x = 0; x < w; x += 4) for (const y of [4, 10, 16]) samples.push([x, y]);
  for (let y = 0; y < h * 0.8; y += 4) for (const x of [4, 10, w - 5, w - 11]) samples.push([x, y]);
  const ch = [[], [], []];
  for (const [x, y] of samples) {
    const i = (y * w + x) * 4;
    ch[0].push(px[i]); ch[1].push(px[i + 1]); ch[2].push(px[i + 2]);
  }
  const med = ch.map((a) => a.sort((p, q) => p - q)[a.length >> 1]);

  const smooth = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  // Background reference per row from the left border band, for plates whose backdrop has a vertical gradient.
  const rowRef = [];
  for (let y = 0; y < h; y++) {
    const cs = [[], [], []];
    for (let yy = Math.max(0, y - 12); yy <= Math.min(h - 1, y + 12); yy += 3)
      for (let x = 4; x < 60; x += 4) {
        const i = (yy * w + x) * 4;
        cs[0].push(px[i]); cs[1].push(px[i + 1]); cs[2].push(px[i + 2]);
      }
    rowRef.push(cs.map((a) => a.sort((p, q) => p - q)[a.length >> 1]));
  }
  const ref = (y) => (ROWS ? rowRef[y] : med);
  const a = new Float32Array(w * h);
  for (let i = 0, k = 0; i < px.length; i += 4, k++) {
    const r0 = ref((k / w) | 0);
    const dr = px[i] - r0[0], dg = px[i + 1] - r0[1], db = px[i + 2] - r0[2];
    // Skin moves toward red/away from blue relative to the background.
    const warm = (dr - db) * 0.5 + (dr - dg) * 0.35;
    const dist = Math.hypot(dr, dg, db);
    a[k] = Math.max(smooth(WARM[0], WARM[1], warm), smooth(DIST[0], DIST[1], dist));
  }
  // Fill interior holes: flood background from the borders through low-alpha pixels.
  const bg = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const k = y * w + x;
    if (!bg[k] && a[k] < 0.5) { bg[k] = 1; stack.push(k); }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const k = stack.pop();
    const x = k % w, y = (k / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  for (let k = 0; k < w * h; k++) if (!bg[k] && a[k] < 0.5) a[k] = 1;
  // Nail plates and free edges are pale and low-chroma: force them opaque from the traced paths.
  const m = document.createElement('canvas');
  m.width = w; m.height = h;
  const mx = m.getContext('2d');
  mx.fillStyle = mx.strokeStyle = '#fff';
  mx.lineWidth = 2;
  mx.scale(w / 768, h / 1024);
  for (const d of NAILS) { const p2 = new Path2D(d); mx.fill(p2); mx.stroke(p2); }
  const md = mx.getImageData(0, 0, w, h).data;
  for (let k = 0; k < w * h; k++) a[k] = Math.max(a[k], md[k * 4 + 3] / 255);
  // Slight blur of the alpha for a soft, anti-aliased edge (3x3 box, twice).
  for (let pass = 0; pass < 2; pass++) {
    const b = new Float32Array(a);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let s = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += b[(y + j) * w + x + i];
      a[y * w + x] = s / 9;
    }
  }
  // Decontaminate edges: un-premultiply the background colour out of semi-transparent pixels.
  for (let i = 0, k = 0; i < px.length; i += 4, k++) {
    const al = a[k];
    if (al > 0.02 && al < 0.98) {
      for (let cIdx = 0; cIdx < 3; cIdx++) {
        px[i + cIdx] = Math.max(0, Math.min(255, (px[i + cIdx] - med[cIdx] * (1 - al)) / al));
      }
    }
    px[i + 3] = Math.round(al * 255);
  }
  ctx.putImageData(data, 0, 0);
  const webp = c.toDataURL('image/webp', 0.9);
  // Check render over the page colour and a dark colour.
  const chk = document.createElement('canvas');
  chk.width = w * 2; chk.height = h;
  const cx = chk.getContext('2d');
  cx.fillStyle = '#F5F1EC'; cx.fillRect(0, 0, w, h);
  cx.fillStyle = '#3a2a2e'; cx.fillRect(w, 0, w, h);
  cx.drawImage(c, 0, 0); cx.drawImage(c, w, 0);
  return { webp, check: chk.toDataURL('image/png'), med };
}, [src, nails, DIST, WARM, ROWS]);
writeFileSync(`public/hero/${name}.webp`, Buffer.from(out.webp.split(',')[1], 'base64'));
writeFileSync(`qa/shots/matte-${name}.png`, Buffer.from(out.check.split(',')[1], 'base64'));
console.log('bg median', out.med);
await browser.close();
