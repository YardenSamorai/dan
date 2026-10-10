import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Shared building blocks for the hero's 3D sets: one material vocabulary, soft
 * lofted surfaces for bodies and upholstery, small real bevels for hard objects.
 */

export type Mat = THREE.MeshPhysicalMaterial;
const cache = new Map<string, Mat>();

export interface MatOpts {
  rough?: number;
  metal?: number;
  sheen?: number;
  clear?: number;
  clearRough?: number;
  opacity?: number;
  /** A tileable surface texture used as a bump map: knit, twill, wood grain, leather. */
  bump?: Surface;
  bumpScale?: number;
  repeat?: [number, number];
  ior?: number;
  spec?: number;
}

/** One material vocabulary: matte by default, sheen for fabric, clearcoat for lacquer and glass. */
export function mat(color: string, o: MatOpts = {}): Mat {
  const key = `${color}|${JSON.stringify(o)}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({
      color,
      roughness: o.rough ?? 0.82,
      metalness: o.metal ?? 0,
      sheen: o.sheen ?? 0,
      sheenRoughness: 0.75,
      sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.45),
      clearcoat: o.clear ?? 0,
      clearcoatRoughness: o.clearRough ?? 0.3,
      transparent: o.opacity !== undefined,
      opacity: o.opacity ?? 1,
      ior: o.ior ?? 1.5,
      specularIntensity: o.spec ?? 1,
    });
    m.userData.look = key;
    if (o.bump) {
      const t = surface(o.bump).clone();
      t.repeat.set(...(o.repeat ?? [4, 4]));
      t.needsUpdate = true;
      m.bumpMap = t;
      m.bumpScale = o.bumpScale ?? 1;
    }
    cache.set(key, m);
  }
  return m;
}

// ── Surface textures, drawn once ──────────────────────────────────────
export type Surface = 'knit' | 'twill' | 'grain' | 'leather' | 'plaster' | 'weave' | 'strand';
const surfaces = new Map<Surface, THREE.CanvasTexture>();

/** Small tileable height textures; they only ever add a whisper of relief. */
function surface(kind: Surface) {
  let t = surfaces.get(kind);
  if (t) return t;
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const img = g.createImageData(n, n);
  let seed = kind.length * 977;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const noise = new Float32Array(n * n).map(() => rnd());
  const at = (x: number, y: number) => noise[((y + n) % n) * n + ((x + n) % n)];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let v = 0.5;
      const r = at(x, y);
      if (kind === 'knit') v = 0.5 + 0.28 * Math.sin((x / n) * Math.PI * 2 * 32) * Math.sin((y / n) * Math.PI * 2 * 22 + (x % 2) * 1.2) + (r - 0.5) * 0.18;
      else if (kind === 'twill') v = 0.5 + 0.3 * Math.sin(((x + y) / n) * Math.PI * 2 * 24) + (r - 0.5) * 0.15;
      else if (kind === 'weave') v = 0.5 + 0.22 * (Math.sin((x / n) * Math.PI * 2 * 20) + Math.sin((y / n) * Math.PI * 2 * 20)) + (r - 0.5) * 0.2;
      else if (kind === 'grain') v = 0.5 + 0.25 * Math.sin((y / n) * Math.PI * 2 * 6 + Math.sin((x / n) * Math.PI * 2 * 2) * 1.6 + at(0, y) * 0.8) + (r - 0.5) * 0.1;
      else if (kind === 'strand') v = 0.5 + 0.22 * Math.sin((x / n) * Math.PI * 2 * 28 + at(x, 0) * 2.5) + 0.12 * Math.sin((x / n) * Math.PI * 2 * 71) + (r - 0.5) * 0.08;
      else if (kind === 'leather') v = 0.5 + ((at(x, y) + at(x + 1, y) + at(x, y + 1) + at(x - 1, y) + at(x, y - 1)) / 5 - 0.5) * 0.9;
      else v = 0.5 + ((at(x, y) + at(x + 2, y + 1) + at(x - 1, y + 2)) / 3 - 0.5) * 0.5;
      const b = Math.max(0, Math.min(255, v * 255));
      const i = (y * n + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  surfaces.set(kind, t);
  return t;
}

export function mesh(geo: THREE.BufferGeometry, material: THREE.Material, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** A box with a real, small bevel, positioned by its centre. */
export function box(w: number, h: number, d: number, material: THREE.Material, r = 0.008, at: [number, number, number] = [0, 0, 0]) {
  const m = mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.01, h / 2.01, d / 2.01)), material);
  m.position.set(...at);
  return m;
}

export function cyl(rTop: number, rBottom: number, h: number, material: THREE.Material, at: [number, number, number] = [0, 0, 0], seg = 32) {
  const m = mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), material);
  m.position.set(...at);
  return m;
}

/** A cylinder with softened rims: a lathe of a rounded rectangle. */
export function puck(r: number, h: number, material: THREE.Material, at: [number, number, number] = [0, 0, 0], bevel = 0.006, seg = 40) {
  const b = Math.min(bevel, r / 2, h / 2);
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, -h / 2)];
  for (let i = 0; i <= 4; i++) {
    const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, -h / 2 + b + Math.sin(a) * b));
  }
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, h / 2 - b + Math.sin(a) * b));
  }
  pts.push(new THREE.Vector2(0, h / 2));
  const m = mesh(new THREE.LatheGeometry(pts, seg), material);
  m.position.set(...at);
  return m;
}

export function sphere(r: number, material: THREE.Material, at: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) {
  const m = mesh(new THREE.SphereGeometry(r, 40, 28), material);
  m.position.set(...at);
  m.scale.set(...scale);
  return m;
}

/** A bent tube through points (frames, rails, cables). */
export function tube(points: [number, number, number][], r: number, material: THREE.Material, seg = 48, closed = false) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)),
    closed,
    'catmullrom',
    0.2,
  );
  return mesh(new THREE.TubeGeometry(curve, seg, r, 14, closed), material);
}

/**
 * A bent panel (plywood chair backs, curved screens): an arc band w wide, h tall and t thick,
 * curving toward +Z with radius R, its back face's centre at the origin and its foot at y = 0.
 */
export function arcPanel(w: number, h: number, t: number, R: number, material: THREE.Material, bevel = 0.004) {
  const a = w / 2 / R;
  const s = new THREE.Shape();
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const f = -a + (2 * a * i) / n;
    const v = [R * Math.sin(f), -R + R * Math.cos(f)] as const;
    if (i === 0) s.moveTo(v[0], v[1]);
    else s.lineTo(v[0], v[1]);
  }
  for (let i = n; i >= 0; i--) {
    const f = -a + (2 * a * i) / n;
    s.lineTo((R - t) * Math.sin(f), -R + (R - t) * Math.cos(f));
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: h - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  geo.computeVertexNormals();
  return mesh(geo, material);
}

/** A soft upholstered block: a rounded box whose bevel is most of its thickness. */
export function cushion(w: number, h: number, d: number, material: THREE.Material, at: [number, number, number] = [0, 0, 0], soft = 0.42) {
  const m = mesh(new RoundedBoxGeometry(w, h, d, 5, Math.min(h * soft, w / 2.01, d / 2.01)), material);
  m.position.set(...at);
  return m;
}

/** A turned object (bottles, mugs, vases, lamp bases) from a radius profile [y, r][], bottom to top. */
export function lathe(profile: [number, number][], material: THREE.Material, at: [number, number, number] = [0, 0, 0], seg = 36) {
  const m = mesh(new THREE.LatheGeometry(profile.map(([y, r]) => new THREE.Vector2(r, y)), seg), material);
  m.position.set(...at);
  return m;
}

// ── Lofts: smooth bodies from elliptical rings ────────────────────────
export interface Ring {
  /** Height along the loft axis. Rings go from bottom to top. */
  y: number;
  /** Half-width (x) and half-depth (z). */
  rx: number;
  rz: number;
  /** Offset of the section centre: forward (z) and sideways (x). */
  oz?: number;
  ox?: number;
}

const cr = (a: number, b: number, c: number, d: number, t: number) =>
  0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);

/**
 * A smooth closed surface through rings, rounded off at both ends.
 * Rings are interpolated with Catmull-Rom so a handful of numbers gives a soft form.
 */
export function loftGeo(rings: Ring[], o: { seg?: number; sub?: number; caps?: [boolean, boolean]; cap?: number } = {}) {
  const seg = o.seg ?? 28;
  const sub = o.sub ?? 4;
  const caps = o.caps ?? [true, true];
  const capK = o.cap ?? 1;
  const R = rings.map((r) => ({ y: r.y, rx: r.rx, rz: r.rz, oz: r.oz ?? 0, ox: r.ox ?? 0 }));
  const dense: typeof R = [];
  for (let i = 0; i < R.length - 1; i++) {
    const a = R[Math.max(0, i - 1)];
    const b = R[i];
    const c = R[i + 1];
    const d = R[Math.min(R.length - 1, i + 2)];
    for (let s = 0; s < sub; s++) {
      const t = s / sub;
      dense.push({
        y: cr(a.y, b.y, c.y, d.y, t),
        rx: Math.max(0.0005, cr(a.rx, b.rx, c.rx, d.rx, t)),
        rz: Math.max(0.0005, cr(a.rz, b.rz, c.rz, d.rz, t)),
        oz: cr(a.oz, b.oz, c.oz, d.oz, t),
        ox: cr(a.ox, b.ox, c.ox, d.ox, t),
      });
    }
  }
  dense.push(R[R.length - 1]);
  // Rounded ends: the section shrinks on a quarter circle.
  const capRings = (r: (typeof R)[0], dir: 1 | -1) => {
    const out: typeof R = [];
    const len = Math.min(r.rx, r.rz) * capK;
    for (let i = 1; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      out.push({ ...r, y: r.y + dir * Math.sin(a) * len, rx: r.rx * Math.cos(a), rz: r.rz * Math.cos(a) });
    }
    return out;
  };
  const all = [...(caps[0] ? capRings(dense[0], -1).reverse() : []), ...dense, ...(caps[1] ? capRings(dense[dense.length - 1], 1) : [])];

  const n = all.length;
  const pos = new Float32Array(n * (seg + 1) * 3);
  const uv = new Float32Array(n * (seg + 1) * 2);
  let len = 0;
  const vs: number[] = [0];
  for (let i = 1; i < n; i++) vs.push((len += Math.abs(all[i].y - all[i - 1].y) + 1e-6));
  for (let i = 0; i < n; i++) {
    const r = all[i];
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      const k = (i * (seg + 1) + j) * 3;
      pos[k] = r.ox + r.rx * Math.sin(th);
      pos[k + 1] = r.y;
      pos[k + 2] = r.oz + r.rz * Math.cos(th);
      uv[(i * (seg + 1) + j) * 2] = j / seg;
      uv[(i * (seg + 1) + j) * 2 + 1] = vs[i] / (len || 1);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const b = a + 1;
      const d = a + seg + 1;
      const c = d + 1;
      idx.push(a, b, d, b, c, d);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Close the seam: average the duplicated first and last column.
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n; i++) {
    const a = i * (seg + 1);
    const b = a + seg;
    const x = nrm.getX(a) + nrm.getX(b);
    const y = nrm.getY(a) + nrm.getY(b);
    const z = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(a, x / l, y / l, z / l);
    nrm.setXYZ(b, x / l, y / l, z / l);
  }
  return geo;
}

export function loft(rings: Ring[], material: THREE.Material, o?: Parameters<typeof loftGeo>[1]) {
  return mesh(loftGeo(rings, o), material);
}

/** A limb hanging down -Y from its joint: rings given as [distance down, rx, rz, oz]. */
export function limbLoft(profile: [number, number, number, number?][], material: THREE.Material, o?: Parameters<typeof loftGeo>[1]) {
  const rings = profile.map(([d, rx, rz, oz]) => ({ y: -d, rx, rz, oz: oz ?? 0 })).reverse();
  return loft(rings, material, o);
}

/** A simple tapered blade or stem along -Y (leaves), flattened in z by `flat`. */
export function limb(r1: number, r2: number, len: number, material: THREE.Material, flat = 1) {
  const m = limbLoft(
    [
      [0, r1, r1 * flat],
      [len * 0.35, (r1 + r2) * 0.6, (r1 + r2) * 0.6 * flat],
      [len, r2, r2 * flat],
    ],
    material,
    { seg: 10, sub: 3 },
  );
  return m;
}

// ── Contact shadows: soft dark pools where things meet the floor or a table ──
let blob: THREE.CanvasTexture | null = null;
function blobTex() {
  if (blob) return blob;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(40,30,22,0.55)');
  r.addColorStop(0.45, 'rgba(40,30,22,0.25)');
  r.addColorStop(1, 'rgba(40,30,22,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  blob = new THREE.CanvasTexture(c);
  return blob;
}
const blobMats = new Map<number, THREE.MeshBasicMaterial>();

/** A soft ambient-occlusion pool, w by d metres, lying on a surface at height y. */
export function contact(w: number, d: number, at: [number, number, number], strength = 1) {
  const k = Math.round(strength * 20) / 20;
  let m = blobMats.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: k, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
    blobMats.set(k, m);
  }
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
  p.name = 'contact';
  p.rotation.x = -Math.PI / 2;
  p.position.set(at[0], at[1] + 0.001, at[2]);
  p.renderOrder = 1;
  return p;
}

export const group = (...children: THREE.Object3D[]) => {
  const g = new THREE.Group();
  children.forEach((c) => g.add(c));
  return g;
};

export function place<T extends THREE.Object3D>(o: T, at: [number, number, number], rotY = 0): T {
  o.position.set(...at);
  o.rotation.y = rotY;
  return o;
}

export function rot<T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0): T {
  o.rotation.set(x, y, z);
  return o;
}
