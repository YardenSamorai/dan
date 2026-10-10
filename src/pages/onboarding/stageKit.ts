import * as THREE from 'three';

/** Shared pieces of the onboarding's small 3D scenes (welcome and done). */

export const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
export const easeOutBack = (x: number) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;
export const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** A canvas drawn once and used as a texture. Sizes are in CSS-like pixels; drawn at 2x. */
export function paint(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h * 2;
  const g = c.getContext('2d')!;
  g.scale(2, 2);
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Drawing helpers whose x is measured from the reading start edge of a canvas `w` wide. */
export function pen(rtl: boolean, font: string) {
  const X = (w: number, x: number, width = 0) => (rtl ? w - x - width : x);
  /** Text, cut with an ellipsis when it would run past `max` pixels. */
  const label = (g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight = 500, w = 0, max = Infinity) => {
    g.font = `${weight} ${size}px ${font}`;
    g.fillStyle = color;
    g.textBaseline = 'middle';
    g.direction = rtl ? 'rtl' : 'ltr';
    g.textAlign = rtl ? 'right' : 'left';
    let out = s;
    if (g.measureText(out).width > max) {
      while (out.length > 1 && g.measureText(`${out}…`).width > max) out = out.slice(0, -1);
      out = `${out.trimEnd()}…`;
    }
    g.fillText(out, rtl ? w - x : x, y);
  };
  const rect = (g: CanvasRenderingContext2D, w: number, x: number, y: number, rw: number, rh: number, r: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(X(w, x, rw), y, rw, rh, r);
    g.fill();
  };
  return { X, label, rect };
}

/** A soft pool of shade on the floor; real shadow maps streak at these low camera angles. */
export function shadePool(w: number, d: number) {
  const tex = paint(256, 256, (g) => {
    const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    r.addColorStop(0, 'rgba(20,30,28,0.55)');
    r.addColorStop(0.45, 'rgba(20,30,28,0.22)');
    r.addColorStop(1, 'rgba(20,30,28,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 256, 256);
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export function disposeTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mt of Array.isArray(m.material) ? m.material : [m.material]) {
      (mt as THREE.MeshBasicMaterial).map?.dispose();
      mt.dispose();
    }
  });
}
