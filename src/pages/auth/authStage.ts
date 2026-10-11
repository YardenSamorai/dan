import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clamp01, disposeTree, easeOutBack, easeOutCubic, paint, pen } from '../onboarding/stageKit';

/**
 * Beside sign-in and sign-up: today's calendar for a two-person team, its
 * appointments settling in one by one, then a new booking arriving with a
 * notification. Plays once, then floats with the pointer. Decorative only.
 */

export interface AuthItem {
  col: 0 | 1;
  /** Minutes from midnight. */
  start: number;
  end: number;
  customer: string;
  service: string;
}

export interface AuthSceneText {
  day: string;
  title: string;
  staff: [string, string];
  /** Minutes of the first gutter row; four hourly rows follow. */
  firstHour: number;
  /** The last item is the booking that arrives with the notification. */
  items: AuthItem[];
  toastTitle: string;
  toastSub: string;
  /** Floats below the card when the stage is tall enough. */
  caption: string;
}

export interface AuthScene {
  dispose(): void;
}

interface Opts {
  text: AuthSceneText;
  rtl: boolean;
  accent: string;
  font: string;
  displayFont: string;
  reducedMotion: boolean;
}

const INK = '#1c1c1e';
const MUTED = '#8a8a8e';
const LINE = '#ecebe8';

// Calendar card, in texture pixels and scene units.
const CW = 420;
const CH = 520;
const CAL = { w: 1.4, h: (1.4 * CH) / CW };
const FACE = { w: CAL.w - 0.04, h: CAL.h - 0.04 };
const GRID = { top: 132, row: 92, rows: 4, gutter: 70, gap: 8 };
const COL_W = (CW - GRID.gutter - 18 - GRID.gap) / 2;

// Notification card.
const TW = 360;
const TH = 92;
const TOAST = { w: 1.12, h: (1.12 * TH) / TW };

// Caption letters: a face and a stack of darker layers behind it that read as their depth.
const PW = 840;
const PH = 84;
const PLATE = { w: 2.1, h: (2.1 * PH) / PW, depth: 0.034, layers: 12 };
const CAPTION_Y = -1.1;

/** Beats, in seconds. */
const T = { cal: 0.9, items: 0.75, stagger: 0.2, arrive: 1.95, toast: 2.25, caption: 2.6 } as const;

const onFace = (px: number, py: number, z: number) => new THREE.Vector3((px / CW - 0.5) * FACE.w, (0.5 - py / CH) * FACE.h, z);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function createAuthScene(host: HTMLElement, o: Opts): AuthScene {
  const { text, rtl, accent, font } = o;
  const { X, label, rect } = pen(rtl, font);
  const side = rtl ? -1 : 1;
  const tones = [accent, new THREE.Color(accent).offsetHSL(0.09, -0.12, 0.1).getStyle()];
  const tint = (c: string, k = 0.86) => new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k).getStyle();
  const colX = (col: number) => GRID.gutter + col * (COL_W + GRID.gap);
  const yOf = (m: number) => GRID.top + ((m - text.firstHour) / 60) * GRID.row;

  const digits = (g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight = 500, align: CanvasTextAlign = 'center') => {
    g.font = `${weight} ${size}px ${font}`;
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.direction = 'ltr';
    g.fillText(s, x, y);
  };

  // Faces are redrawn whenever their on-screen size changes: a texture much larger than its
  // footprint gets sampled from blended mip levels and the text goes soft.
  type Draw = (g: CanvasRenderingContext2D) => void;
  const surfaces: { w: number; h: number; draw: Draw; mat: THREE.MeshBasicMaterial }[] = [];
  const surface = (w: number, h: number, draw: Draw) => {
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true });
    surfaces.push({ w, h, draw, mat });
    return mat;
  };
  let density = 0;
  const repaint = (d: number, anisotropy: number) => {
    density = d;
    for (const s of surfaces) {
      const old = s.mat.map;
      s.mat.map = paint(s.w, s.h, s.draw, d);
      s.mat.map.anisotropy = anisotropy;
      s.mat.needsUpdate = true;
      old?.dispose();
    }
    for (const m of captionLayers) {
      m.map = captionMat.map;
      m.needsUpdate = true;
    }
  };

  // ── Calendar face ─────────────────────────────────────────────────
  const calMat = surface(CW, CH, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, CW, CH);
    label(g, text.day, 26, 38, 19, INK, 700, CW, CW - 52);
    label(g, text.title, 26, 64, 12.5, MUTED, 500, CW, CW - 52);
    rect(g, CW, 0, 86, CW, 1, 0, LINE);
    text.staff.forEach((name, i) => {
      const x = colX(i);
      g.fillStyle = tones[i];
      g.beginPath();
      g.arc(X(CW, x + 13), 110, 12, 0, Math.PI * 2);
      g.fill();
      g.font = `700 11px ${font}`;
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText([...name.trim()][0]?.toLocaleUpperCase() ?? '', X(CW, x + 13), 111);
      label(g, name, x + 32, 110, 12.5, INK, 600, CW, COL_W - 36);
    });
    for (let i = 0; i <= GRID.rows; i++) {
      const y = GRID.top + i * GRID.row;
      rect(g, CW, GRID.gutter - 6, y, CW - GRID.gutter - 12, 1, 0, LINE);
      if (i < GRID.rows) digits(g, hhmm(text.firstHour + i * 60), X(CW, 18, 40) + 20, y + 1, 11, MUTED);
    }
    rect(g, CW, colX(1) - GRID.gap / 2, GRID.top, 1, GRID.rows * GRID.row, 0, LINE);
  });

  // ── Appointments ──────────────────────────────────────────────────
  const last = text.items.length - 1;
  const chipFaces = text.items.map((it, i) => {
    const h = Math.max(40, yOf(it.end) - yOf(it.start) - 4);
    const fresh = i === last;
    const c = tones[it.col];
    return {
      h,
      mat: surface(COL_W, h, (g) => {
        g.fillStyle = fresh ? c : tint(c);
        g.beginPath();
        g.roundRect(0, 0, COL_W, h, 10);
        g.fill();
        if (!fresh) rect(g, COL_W, 0, 0, 4, h, 2, c);
        const ink = fresh ? '#ffffff' : INK;
        const sub = fresh ? 'rgba(255,255,255,0.82)' : 'rgba(28,28,30,0.6)';
        g.font = `600 10.5px ${font}`;
        g.fillStyle = sub;
        g.textBaseline = 'middle';
        g.direction = 'ltr';
        g.textAlign = rtl ? 'right' : 'left';
        g.fillText(`${hhmm(it.start)}–${hhmm(it.end)}`, rtl ? COL_W - 13 : 13, 15);
        label(g, it.customer, 13, 33, 13, ink, 700, COL_W, COL_W - 24);
        if (h >= 62) label(g, it.service, 13, 51, 11, sub, 500, COL_W, COL_W - 24);
      }),
    };
  });

  // ── Notification ──────────────────────────────────────────────────
  const toastMat = surface(TW, TH, (g) => {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(0, 0, TW, TH, 22);
    g.fill();
    const cx = X(TW, 20, 46) + 23;
    g.fillStyle = accent;
    g.beginPath();
    g.arc(cx, TH / 2, 23, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(cx - 9, TH / 2 + 1);
    g.lineTo(cx - 3, TH / 2 + 7);
    g.lineTo(cx + 9, TH / 2 - 6);
    g.stroke();
    label(g, text.toastTitle, 80, 36, 15.5, INK, 700, TW, TW - 100);
    label(g, text.toastSub, 80, 60, 12.5, MUTED, 500, TW, TW - 100);
  });

  // ── Caption ───────────────────────────────────────────────────────
  const captionMat = surface(PW, PH, (g) => {
    let size = 46;
    const fontOf = (s: number) => `700 ${s}px ${o.displayFont}`;
    g.font = fontOf(size);
    const fit = PW * 0.8;
    const wide = g.measureText(text.caption).width;
    if (wide > fit) size = Math.floor((size * fit) / wide);
    g.font = fontOf(size);
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.direction = rtl ? 'rtl' : 'ltr';
    g.fillText(text.caption, PW / 2, PH / 2 + size * 0.36);
  });
  captionMat.color.set(INK);
  captionMat.depthWrite = false;

  // ── Scene ─────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' });
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const key = new THREE.DirectionalLight('#fff6ec', 2.2);
  key.position.set(-side * 2.5, 4, 3.5);
  scene.add(key, new THREE.HemisphereLight('#ffffff', '#d9dedc', 0.9));

  // No floor: the scene floats in a soft pool of the accent's light, which swells when the booking lands.
  const glowTex = paint(256, 256, (g) => {
    const tone = new THREE.Color(accent);
    const rgba = (a: number) => `rgba(${Math.round(tone.r * 255)},${Math.round(tone.g * 255)},${Math.round(tone.b * 255)},${a})`;
    const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    r.addColorStop(0, rgba(0.3));
    r.addColorStop(0.4, rgba(0.14));
    r.addColorStop(0.75, rgba(0.04));
    r.addColorStop(1, rgba(0));
    g.fillStyle = r;
    g.fillRect(0, 0, 256, 256);
  }, 1);
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), glowMat);
  glow.position.set(0, -0.15, -1.4);
  glow.renderOrder = -1;
  scene.add(glow);

  // Floating below the card, turned a little toward the pointer.
  const caption = new THREE.Group();
  const plate = new THREE.PlaneGeometry(PLATE.w, PLATE.h);
  const sideFrom = new THREE.Color('#7c7c81');
  const sideTo = new THREE.Color('#c8c8cb');
  const captionLayers = Array.from({ length: PLATE.layers }, (_, i) => {
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false });
    mat.color.copy(sideFrom).lerp(sideTo, i / (PLATE.layers - 1));
    const mesh = new THREE.Mesh(plate, mat);
    mesh.position.z = -((i + 1) / PLATE.layers) * PLATE.depth;
    mesh.renderOrder = PLATE.layers - i;
    caption.add(mesh);
    return mat;
  });
  const captionFace = new THREE.Mesh(plate, captionMat);
  captionFace.renderOrder = PLATE.layers + 1;
  caption.add(captionFace);
  scene.add(caption);
  let captionOn = false;

  const rig = new THREE.Group();
  scene.add(rig);

  const paperMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.25 });

  const cal = new THREE.Group();
  const calFace = new THREE.Mesh(new THREE.PlaneGeometry(FACE.w, FACE.h), calMat);
  calFace.position.z = 0.0205;
  cal.add(new THREE.Mesh(new RoundedBoxGeometry(CAL.w, CAL.h, 0.04, 4, 0.06), paperMat), calFace);
  rig.add(cal);

  const chips = text.items.map((it, i) => {
    const { h, mat: faceMat } = chipFaces[i];
    const size = { w: (COL_W / CW) * FACE.w, h: (h / CH) * FACE.h };
    const fresh = i === last;
    const slabMat = new THREE.MeshPhysicalMaterial({ color: fresh ? tones[it.col] : tint(tones[it.col]), roughness: 0.5, clearcoat: 0.6, transparent: true });
    const group = new THREE.Group();
    const f = new THREE.Mesh(new THREE.PlaneGeometry(size.w - 0.008, size.h - 0.008), faceMat);
    f.position.z = 0.0085;
    group.add(new THREE.Mesh(new RoundedBoxGeometry(size.w, size.h, 0.016, 3, 0.012), slabMat), f);
    const home = onFace(X(CW, colX(it.col), COL_W) + COL_W / 2, yOf(it.start) + 2 + h / 2, 0.03);
    cal.add(group);
    return { group, home, mats: [slabMat, faceMat], at: fresh ? T.arrive : T.items + i * T.stagger, fresh };
  });

  const ringMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.175, 64), ringMat);
  const freshChip = chips[last];
  if (freshChip) ring.position.copy(freshChip.home).setZ(0.05);
  cal.add(ring);

  const toast = new THREE.Group();
  const toastFace = new THREE.Mesh(new THREE.PlaneGeometry(TOAST.w - 0.02, TOAST.h - 0.02), toastMat);
  toastFace.position.z = 0.0165;
  toast.add(new THREE.Mesh(new RoundedBoxGeometry(TOAST.w, TOAST.h, 0.03, 4, 0.05), paperMat), toastFace);
  rig.add(toast);

  const orbMat = new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.25, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1 });
  const orbSoft = new THREE.MeshPhysicalMaterial({ color: tint(accent, 0.55), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 });
  const orbs = [
    { r: 0.11, m: orbMat, p: [side * 0.86, 0.78, -0.25], s: 0.9 },
    { r: 0.07, m: orbSoft, p: [-side * 0.9, 0.95, -0.4], s: 1.3 },
    { r: 0.16, m: orbSoft, p: [side * 0.95, -0.82, -0.5], s: 0.7 },
  ].map(({ r, m, p, s }) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 24), m);
    mesh.position.set(p[0], p[1], p[2]);
    rig.add(mesh);
    return { mesh, y: p[1], s };
  });

  // ── Motion ────────────────────────────────────────────────────────
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointer = (e: PointerEvent) => {
    pointer.tx = clamp01(e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = clamp01(e.clientY / window.innerHeight) * 2 - 1;
  };
  if (!o.reducedMotion) window.addEventListener('pointermove', onPointer, { passive: true });

  const start = performance.now();

  function pose(now: number) {
    const t = (now - start) / 1000;
    const k = o.reducedMotion ? 99 : t;
    const idle = o.reducedMotion ? 0 : 1;

    const c = easeOutCubic(clamp01(k / T.cal));
    cal.position.set(side * 0.06, -0.3 * (1 - c) + idle * Math.sin(t * 0.6) * 0.018, -0.2 * (1 - c));
    cal.rotation.set(-0.1 + 0.15 * (1 - c), -side * (0.2 + 0.35 * (1 - c)), 0);
    const swell = Math.exp(-(((k - T.arrive - 0.4) / 0.7) ** 2));
    glowMat.opacity = c * (0.85 + 0.45 * swell);
    glow.scale.setScalar(1 + 0.08 * swell + idle * Math.sin(t * 0.5) * 0.015);

    for (const ch of chips) {
      const p = clamp01((k - ch.at) / 0.55);
      const e = easeOutBack(p);
      ch.group.visible = p > 0;
      ch.group.position.copy(ch.home).setZ(ch.home.z + (1 - e) * 0.4);
      ch.group.scale.setScalar(Math.max(0.001, 0.82 + 0.18 * e));
      ch.mats[0].opacity = ch.mats[1].opacity = clamp01(p / 0.3);
    }

    const r = clamp01((k - T.arrive - 0.2) / 0.8);
    ring.visible = r > 0 && r < 1;
    ring.scale.setScalar(0.5 + 1.4 * easeOutCubic(r));
    ringMat.opacity = 0.55 * (1 - r);

    const q = clamp01((k - T.toast) / 0.6);
    toast.visible = q > 0;
    toast.scale.setScalar(Math.max(0.001, 0.6 + 0.4 * easeOutBack(q)));
    toast.position.set(-side * 0.5, -0.6 + idle * Math.sin(t * 0.9 + 0.8) * 0.025, 0.5);
    toast.rotation.set(0.05, side * 0.14, -side * 0.02);

    const cp = easeOutCubic(clamp01((k - T.caption) / 0.9));
    caption.visible = captionOn && cp > 0;
    caption.position.set(0, CAPTION_Y - (1 - cp) * 0.08 + idle * Math.sin(t * 0.7 + 2) * 0.012, 0.62);
    caption.rotation.set(0, pointer.x * 0.1, 0);
    captionMat.opacity = cp;
    for (const m of captionLayers) m.opacity = cp;

    for (const orb of orbs) orb.mesh.position.y = orb.y + idle * Math.sin(t * orb.s + orb.y * 3) * 0.05;

    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    rig.rotation.set(pointer.y * 0.07 + idle * Math.sin(t * 0.21) * 0.015, pointer.x * 0.18 + idle * Math.sin(t * 0.27) * 0.04, 0);
  }

  function resize() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    const half = Math.tan(THREE.MathUtils.degToRad(15));
    // Keep the card, the notification and the sway in view: about 2.4 units across and 2.3 down,
    // plus the caption on the floor when the stage is tall.
    captionOn = aspect < 0.9;
    const dist = Math.max((captionOn ? 1.42 : 1.15) / half, 1.2 / (half * aspect));
    camera.position.set(0, 0.2, dist);
    camera.lookAt(0, captionOn ? -0.2 : -0.02, 0);
    camera.updateProjectionMatrix();

    // Device pixels per texture pixel at the card's depth, with headroom for the nearer notification.
    const perUnit = (h * dpr) / (2 * dist * half);
    const d = Math.min(4, Math.max(0.75, Math.ceil(((perUnit * FACE.w) / CW) * 1.15 * 8) / 8));
    if (Math.abs(d - density) / d > 0.12) repaint(d, renderer.capabilities.getMaxAnisotropy());
  }

  let raf = 0;
  let visible = true;
  const render = (now: number) => {
    pose(now);
    renderer.render(scene, camera);
  };
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (visible && !document.hidden) render(now);
  };

  const ro = new ResizeObserver(() => {
    resize();
    if (o.reducedMotion) render(performance.now());
  });
  ro.observe(host);
  const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting));
  io.observe(host);
  resize();
  if (o.reducedMotion) render(performance.now());
  else raf = requestAnimationFrame(loop);

  return {
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onPointer);
      disposeTree(scene);
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
