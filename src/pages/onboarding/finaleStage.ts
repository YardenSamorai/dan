import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clamp01, disposeTree, easeInOutCubic, easeOutBack, easeOutCubic, paint, pen, shadePool } from './stageKit';

/**
 * The last onboarding screen: the owner's own booking page on a phone, a
 * customer picking a time on it, and that booking landing in the owner's
 * calendar. Plays once, then floats. Decorative: the text beside it says the same.
 */

export interface FinaleText {
  business: string;
  /** Business type and address, under the name. */
  meta: string;
  pickService: string;
  service: string;
  serviceMeta: string;
  pickTime: string;
  slots: string[];
  /** Index of the slot the customer picks. */
  picked: number;
  cta: string;
  /** Calendar header: the day the booking lands on. */
  day: string;
  example: string;
  /** Hour labels down the calendar gutter, one per row. */
  hours: string[];
  /** Minutes of the first gutter row, and of the booking. */
  firstHour: number;
  start: number;
  end: number;
  range: string;
  customer: string;
  isNew: string;
}

export interface FinaleScene {
  dispose(): void;
}

interface Opts {
  text: FinaleText;
  rtl: boolean;
  accent: string;
  font: string;
  reducedMotion: boolean;
}

const INK = '#1c1c1e';
const MUTED = '#8a8a8e';
const LINE = '#ecebe8';
const SOFT = '#f6f6f4';

/** Beats of the one-off sequence, in seconds. */
const T = { phone: 1.0, cal: [0.35, 0.9], tap: 1.55, fly: [1.85, 0.95], land: [2.8, 0.6] } as const;

// Phone screen, in texture pixels, and the slot grid on it.
const SW = 300;
const SH = 620;
const PW = 0.8;
const PH = 1.62;
const SCREEN = { w: PW - 0.06, h: PH - 0.06 };
const SLOT_W = (SW - 44 - 16) / 3;
const SLOT_H = 36;
const slotBox = (i: number) => ({ x: 22 + (i % 3) * (SLOT_W + 8), y: 384 + Math.floor(i / 3) * 44 });

// Calendar card, in texture pixels.
const CW = 380;
const CH = 456;
const CAL = { w: 1.25, h: 1.5 };
const CAL_FACE = { w: CAL.w - 0.04, h: CAL.h - 0.04 };
const GRID = { top: 104, row: 84, rows: 4, col: 80, colW: CW - 80 - 20 };

/** A point on a texture, as local coordinates on the plane that shows it. */
const onFace = (px: number, py: number, tw: number, th: number, face: { w: number; h: number }, z: number) =>
  new THREE.Vector3((px / tw - 0.5) * face.w, (0.5 - py / th) * face.h, z);

export function createFinaleScene(host: HTMLElement, o: Opts): FinaleScene {
  const { text, rtl, accent, font } = o;
  const tint = new THREE.Color(accent).lerp(new THREE.Color('#ffffff'), 0.9).getStyle();
  const { X, label, rect } = pen(rtl, font);
  const side = rtl ? -1 : 1;

  /** Centered, always-LTR text (times). */
  const digits = (g: CanvasRenderingContext2D, s: string, cx: number, y: number, size: number, color: string, weight = 600) => {
    g.font = `${weight} ${size}px ${font}`;
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.direction = 'ltr';
    g.fillText(s, cx, y);
  };

  // ── The owner's booking page ──────────────────────────────────────
  const screenTex = paint(SW, SH, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, SW, SH);
    rect(g, SW, 0, 0, SW, 150, 0, tint);
    g.fillStyle = accent;
    g.beginPath();
    g.arc(X(SW, 46), 92, 24, 0, Math.PI * 2);
    g.fill();
    g.font = `700 20px ${font}`;
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText([...text.business.trim()][0]?.toLocaleUpperCase() ?? '', X(SW, 46), 93);
    label(g, text.business, 80, 84, 17, INK, 700, SW, SW - 100);
    label(g, text.meta, 80, 106, 12, MUTED, 500, SW, SW - 100);

    label(g, text.pickService, 22, 186, 14, INK, 650, SW);
    rect(g, SW, 22, 206, SW - 44, 60, 12, tint);
    g.strokeStyle = accent;
    g.lineWidth = 1.5;
    g.beginPath();
    g.roundRect(X(SW, 22, SW - 44), 206, SW - 44, 60, 12);
    g.stroke();
    label(g, text.service, 38, 228, 13, INK, 600, SW, SW - 76);
    label(g, text.serviceMeta, 38, 248, 11, MUTED, 500, SW, SW - 76);
    rect(g, SW, 22, 276, SW - 44, 52, 12, SOFT);
    rect(g, SW, 38, 292, 120, 8, 4, LINE);
    rect(g, SW, 38, 308, 70, 6, 3, LINE);

    label(g, text.pickTime, 22, 364, 14, INK, 650, SW);
    text.slots.slice(0, 6).forEach((s, i) => {
      const b = slotBox(i);
      rect(g, SW, b.x, b.y, SLOT_W, SLOT_H, 10, SOFT);
      digits(g, s, X(SW, b.x, SLOT_W) + SLOT_W / 2, b.y + SLOT_H / 2 + 1, 12, INK);
    });
    rect(g, SW, 22, 548, SW - 44, 46, 23, accent);
    g.font = `650 14px ${font}`;
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.direction = rtl ? 'rtl' : 'ltr';
    g.fillText(text.cta, SW / 2, 572);
  });

  const picked = slotBox(text.picked);
  const pickedTex = paint(SLOT_W, SLOT_H, (g) => {
    g.fillStyle = accent;
    g.beginPath();
    g.roundRect(0, 0, SLOT_W, SLOT_H, 10);
    g.fill();
    digits(g, text.slots[text.picked] ?? '', SLOT_W / 2, SLOT_H / 2 + 1, 12, '#ffffff');
  });

  // ── The owner's calendar ──────────────────────────────────────────
  const blockY = GRID.top + ((text.start - text.firstHour) / 60) * GRID.row;
  const gridEnd = GRID.top + GRID.rows * GRID.row;
  const blockH = Math.max(44, Math.min(((text.end - text.start) / 60) * GRID.row, gridEnd - blockY - 6));

  const calTex = paint(CW, CH, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, CW, CH);
    g.font = `600 11px ${font}`;
    const pillW = g.measureText(text.example).width + 20;
    rect(g, CW, CW - 24 - pillW, 24, pillW, 22, 11, '#f1f1ef');
    label(g, text.example, CW - 24 - pillW + 10, 35.5, 11, MUTED, 600, CW);
    label(g, text.day, 24, 36, 18, INK, 700, CW, CW - 72 - pillW);
    label(g, text.business, 24, 62, 13, MUTED, 500, CW, CW - 48);
    rect(g, CW, 0, 88, CW, 1, 0, LINE);
    text.hours.slice(0, GRID.rows).forEach((h, i) => {
      const y = GRID.top + i * GRID.row;
      rect(g, CW, GRID.col - 6, y, CW - GRID.col - 14, 1, 0, LINE);
      digits(g, h, X(CW, 24, 44) + 22, y + 1, 11, MUTED, 500);
    });
    rect(g, CW, GRID.col - 6, gridEnd, CW - GRID.col - 14, 1, 0, LINE);
  });

  const chipTex = paint(GRID.colW, blockH, (g) => {
    g.fillStyle = accent;
    g.beginPath();
    g.roundRect(0, 0, GRID.colW, blockH, 12);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.font = `700 10px ${font}`;
    const newW = g.measureText(text.isNew).width + 16;
    g.beginPath();
    g.roundRect(X(GRID.colW, GRID.colW - 12 - newW, newW), 10, newW, 18, 9);
    g.fill();
    label(g, text.isNew, GRID.colW - 12 - newW + 8, 19.5, 10, '#ffffff', 700, GRID.colW);
    g.font = `600 11px ${font}`;
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.textBaseline = 'middle';
    g.direction = 'ltr';
    g.textAlign = rtl ? 'right' : 'left';
    g.fillText(text.range, rtl ? GRID.colW - 14 : 14, 19.5);
    label(g, text.customer, 14, 41, 15, '#ffffff', 700, GRID.colW, GRID.colW - 28);
    if (blockH >= 70) label(g, text.service, 14, 61, 12, 'rgba(255,255,255,0.8)', 500, GRID.colW, GRID.colW - 28);
  });

  // ── Scene ─────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const key = new THREE.DirectionalLight('#fff6ec', 2.2);
  key.position.set(rtl ? -2.5 : 2.5, 4, 3.5);
  scene.add(key, new THREE.HemisphereLight('#ffffff', '#d9dedc', 0.9));

  const shade = shadePool(3.4, 1.2);
  shade.position.y = -1.0;
  scene.add(shade);

  const rig = new THREE.Group();
  scene.add(rig);

  const body = new THREE.MeshPhysicalMaterial({ color: '#232326', roughness: 0.35, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.15 });
  const paper = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const face = (map: THREE.Texture, transparent = false) => new THREE.MeshBasicMaterial({ map, toneMapped: false, transparent });

  // Phone, on the reading start side, turned toward the calendar.
  const phone = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), face(screenTex));
  glass.position.z = 0.0405;
  const island = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.05, 0.004, 3, 0.02), body);
  island.position.set(0, PH / 2 - 0.08, 0.043);
  phone.add(new THREE.Mesh(new RoundedBoxGeometry(PW, PH, 0.08, 6, 0.1), body), glass, island);
  rig.add(phone);

  const slotAt = onFace(X(SW, picked.x, SLOT_W) + SLOT_W / 2, picked.y + SLOT_H / 2, SW, SH, SCREEN, 0.0415);
  const slotSize = { w: (SLOT_W / SW) * SCREEN.w, h: (SLOT_H / SH) * SCREEN.h };
  const pickMat = face(pickedTex, true);
  const pick = new THREE.Mesh(new THREE.PlaneGeometry(slotSize.w, slotSize.h), pickMat);
  pick.position.copy(slotAt);
  phone.add(pick);

  const ringMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.062, 48), ringMat);
  ring.position.copy(slotAt).setZ(0.043);
  phone.add(ring);

  // Calendar, on the end side.
  const cal = new THREE.Group();
  const calFace = new THREE.Mesh(new THREE.PlaneGeometry(CAL_FACE.w, CAL_FACE.h), face(calTex));
  calFace.position.z = 0.0205;
  cal.add(new THREE.Mesh(new RoundedBoxGeometry(CAL.w, CAL.h, 0.04, 4, 0.06), paper), calFace);
  rig.add(cal);

  const blockAt = onFace(X(CW, GRID.col, GRID.colW) + GRID.colW / 2, blockY + blockH / 2, CW, CH, CAL_FACE, 0.034);
  const blockSize = { w: (GRID.colW / CW) * CAL_FACE.w, h: (blockH / CH) * CAL_FACE.h };

  // The booking: picked on the phone, flown into the calendar.
  const chipSlabMat = new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.45, clearcoat: 0.7, clearcoatRoughness: 0.2, transparent: true });
  const chipFaceMat = face(chipTex, true);
  const chip = new THREE.Group();
  const chipFace = new THREE.Mesh(new THREE.PlaneGeometry(blockSize.w - 0.012, blockSize.h - 0.012), chipFaceMat);
  chipFace.position.z = 0.0105;
  chip.add(new THREE.Mesh(new RoundedBoxGeometry(blockSize.w, blockSize.h, 0.02, 3, 0.02), chipSlabMat), chipFace);
  rig.add(chip);

  // ── Motion ────────────────────────────────────────────────────────
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointer = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    pointer.tx = clamp01((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.ty = clamp01((e.clientY - r.top) / r.height) * 2 - 1;
  };
  if (!o.reducedMotion) window.addEventListener('pointermove', onPointer, { passive: true });

  const start = performance.now();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();

  function pose(now: number) {
    const t = (now - start) / 1000;
    const k = o.reducedMotion ? 99 : t;
    const idle = o.reducedMotion ? 0 : 1;

    const p = easeOutCubic(clamp01(k / T.phone));
    phone.position.set(-side * 0.78, -0.3 * (1 - p) + idle * Math.sin(t * 0.7) * 0.02, 0);
    phone.rotation.set(0.04, side * (0.28 + 0.5 * (1 - p)), 0);
    shade.material.opacity = p;

    const q = easeOutBack(clamp01((k - T.cal[0]) / T.cal[1]));
    const land = clamp01((k - T.land[0]) / T.land[1]);
    cal.visible = k > T.cal[0];
    cal.position.set(side * (0.74 + 0.5 * (1 - q)), 0.02 + idle * Math.sin(t * 0.6 + 1.3) * 0.02, 0);
    cal.rotation.set(0.03, -side * 0.24, 0);
    cal.scale.setScalar(Math.max(0.001, (0.6 + 0.4 * q) * (1 + Math.sin(land * Math.PI) * 0.03)));

    const tap = clamp01((k - T.tap) / 0.55);
    pickMat.opacity = clamp01((k - T.tap) / 0.12);
    ring.visible = tap > 0 && tap < 1;
    ring.scale.setScalar(0.6 + 1.6 * tap);
    ringMat.opacity = 0.6 * (1 - tap);

    const f = clamp01((k - T.fly[0]) / T.fly[1]);
    const e = easeInOutCubic(f);
    chip.visible = f > 0;
    if (chip.visible) {
      phone.updateMatrix();
      cal.updateMatrix();
      from.copy(slotAt).applyMatrix4(phone.matrix);
      to.copy(blockAt).applyMatrix4(cal.matrix);
      const arc = Math.sin(Math.PI * e);
      chip.position.lerpVectors(from, to, e);
      chip.position.z += arc * 0.45;
      chip.position.y += arc * 0.12;
      chip.quaternion.slerpQuaternions(phone.quaternion, cal.quaternion, e);
      chip.scale.setScalar(THREE.MathUtils.lerp(slotSize.w / blockSize.w, cal.scale.x, e));
      chipSlabMat.opacity = chipFaceMat.opacity = clamp01(f / 0.15);
    }

    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    rig.rotation.set(pointer.y * 0.06, pointer.x * 0.16, 0);
  }

  function resize() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    const half = Math.tan(THREE.MathUtils.degToRad(15));
    // Fit both objects with the pointer sway: about 3.1 units across and 2.1 down, whichever is tighter.
    const dist = Math.max(1.05 / half, 1.55 / (half * aspect));
    camera.position.set(0, 0.25, dist);
    camera.lookAt(0, -0.02, 0);
    camera.updateProjectionMatrix();
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
