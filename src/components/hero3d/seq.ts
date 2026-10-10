/**
 * The opening (the nail studio up to the pillar wipe) as a prerendered film, drawn over the live scene.
 * Frames come from tools/blender: one image per two story frames, rendered at 2.1:1 without the rail shift,
 * with the camera the live scene uses on a 1.8:1 screen. Fitted to the screen's height, they cover any
 * landscape screen up to `maxAspect`; the live scene frames the opening the same way while the film shows.
 */
export const SEQ = {
  count: 121,
  /** Story progress of the last frame: frame i is at p = i * 2 / 1200. */
  end: 0.2,
  w: 1890,
  h: 900,
  camAspect: 1.8,
  maxAspect: 2.0,
};

const src = (i: number) => `/hero3d/seq/nails/${String(i).padStart(3, '0')}.webp`;

export interface Seq {
  /** Draw the frame for p. Returns whether a frame was drawn. */
  draw(p: number): boolean;
  resize(w: number, h: number, dpr: number, shift: number): void;
  dispose(): void;
}

/** `onFrame` runs when the frame last asked for arrives, so a page that isn't scrolling still gets it. */
export function createSeq(canvas: HTMLCanvasElement, onFrame: () => void): Seq {
  const g = canvas.getContext('2d', { alpha: false })!;
  const imgs: (HTMLImageElement | null)[] = Array(SEQ.count).fill(null);
  let W = 1;
  let H = 1;
  let shift = 0;
  let drawn = -1;
  let want = 0;
  let gone = false;

  // The first frame, then the rest in order, a few at a time.
  let next = 0;
  const load = () => {
    if (gone || next >= SEQ.count) return;
    const i = next++;
    const im = new Image();
    im.decoding = 'async';
    im.src = src(i);
    im.decode()
      .then(() => {
        if (gone) return;
        imgs[i] = im;
        if (i === want && drawn !== i) onFrame();
      })
      .catch(() => {})
      .finally(load);
  };
  load();
  for (let k = 0; k < 3; k++) setTimeout(load, 300);

  const nearest = (i: number) => {
    for (let d = 0; d <= 6; d++) {
      if (imgs[i - d]) return i - d;
      if (imgs[i + d]) return i + d;
    }
    return -1;
  };

  return {
    draw(p) {
      if (p > SEQ.end + 0.002) return false;
      want = Math.min(SEQ.count - 1, Math.max(0, Math.round((p / SEQ.end) * (SEQ.count - 1))));
      const i = nearest(want);
      if (i < 0) return false;
      if (i !== drawn) {
        const s = H / SEQ.h;
        const dw = SEQ.w * s;
        g.drawImage(imgs[i]!, (W - dw) / 2 - shift, 0, dw, H);
        drawn = i;
      }
      return true;
    },
    resize(w, h, dpr, sh) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#f6f6f4';
      g.fillRect(0, 0, w, h);
      g.imageSmoothingQuality = 'high';
      W = w;
      H = h;
      shift = sh;
      drawn = -1;
    },
    dispose() {
      gone = true;
      imgs.fill(null);
    },
  };
}
