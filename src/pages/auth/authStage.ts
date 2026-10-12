import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clamp01, disposeTree, easeOutBack, easeOutCubic, paint, pen } from '../onboarding/stageKit';

/**
 * Beside sign-in and sign-up: today's calendar for a two-person team, its
 * appointments settling in one by one, then a new booking arriving with a
 * notification. Plays once, then floats with the pointer. Decorative only.
 */

export type AuthStatus = 'confirmed' | 'pending' | 'vip';

export interface AuthItem {
  col: 0 | 1;
  /** Minutes from midnight. */
  start: number;
  end: number;
  customer: string;
  service: string;
  /** Ignored for the last item, which is always the new booking. */
  status: AuthStatus;
}

export interface AuthSceneText {
  day: string;
  title: string;
  staff: [string, string];
  /** Minutes of the first gutter row; four hourly rows follow. */
  firstHour: number;
  /** Where the current-time line sits, in minutes; keep it clear of the cards' text. */
  now: number;
  /** The last item is the booking that arrives with the notification. */
  items: AuthItem[];
  pending: string;
  fresh: string;
  toastTitle: string;
  toastSub: string;
  toastTime: string;
  statLabel: string;
  /** Floats below the card when the stage is tall enough. */
  caption: string;
}

/** Colour is an accent here: strips, dots, one glow. Most of the scene stays white. */
export interface AuthPalette {
  blue: string;
  mint: string;
  amber: string;
  violet: string;
}

export interface AuthScene {
  dispose(): void;
}

interface Opts {
  text: AuthSceneText;
  rtl: boolean;
  palette: AuthPalette;
  font: string;
  displayFont: string;
  reducedMotion: boolean;
}

const INK = '#1c1c1e';
const MUTED = '#86868b';
const LINE = '#ececee';
const HAIRLINE = '#e3e3e6';
/** Shadows lean cool, so white cards read as lit rather than grey. */
const SHADE = '#141a3a';

// Calendar card, in texture pixels and scene units.
const CW = 420;
const CH = 520;
const CAL = { w: 1.4, h: (1.4 * CH) / CW };
const FACE = { w: CAL.w - 0.04, h: CAL.h - 0.04 };
const CAL_R = 0.06;
/** The face's corner in texture pixels, so it follows the card's edge inset by 0.02. */
const FACE_R = ((CAL_R - 0.02) / FACE.w) * CW;
const GRID = { top: 132, row: 92, rows: 4, gutter: 70, gap: 8 };
const COL_W = (CW - GRID.gutter - 18 - GRID.gap) / 2;

// Notification card.
const TW = 380;
const TH = 96;
const TOAST = { w: 1.18, h: (1.18 * TH) / TW };
const CHECK = { r: 22, ring: 28, start: 22 };

// Today's count, floating off the card's top corner.
const SW = 200;
const SH = 84;
const STAT = { w: 0.52, h: (0.52 * SH) / SW };

// Caption letters: a face and a stack of darker layers behind it that read as their depth.
const PW = 840;
const PH = 84;
const PLATE = { w: 2.1, h: (2.1 * PH) / PW, depth: 0.016, layers: 8 };
const CAPTION_Y = -1.1;

/** Beats, in seconds. */
const T = { cal: 0.9, stat: 0.85, items: 0.8, stagger: 0.22, arrive: 2.05, toast: 2.4, caption: 2.75 } as const;

const easeOutQuint = (x: number) => 1 - (1 - x) ** 5;

/**
 * A thin slab with real rounded corners, centred on its depth. RoundedBoxGeometry caps the
 * radius at half the thickness, so thin cards came out square behind their rounded faces.
 */
function slab(w: number, h: number, r: number, depth: number) {
  const bevel = Math.min(0.004, depth / 4);
  const x = w / 2 - bevel;
  const y = h / 2 - bevel;
  const k = Math.max(0.001, r - bevel);
  const s = new THREE.Shape();
  s.moveTo(-x + k, -y);
  s.lineTo(x - k, -y);
  s.quadraticCurveTo(x, -y, x, -y + k);
  s.lineTo(x, y - k);
  s.quadraticCurveTo(x, y, x - k, y);
  s.lineTo(-x + k, y);
  s.quadraticCurveTo(-x, y, -x, y - k);
  s.lineTo(-x, -y + k);
  s.quadraticCurveTo(-x, -y, -x + k, -y);
  const g = new THREE.ExtrudeGeometry(s, { depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -depth / 2 + bevel);
  return g;
}
const onFace = (px: number, py: number, z: number) => new THREE.Vector3((px / CW - 0.5) * FACE.w, (0.5 - py / CH) * FACE.h, z);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function createAuthScene(host: HTMLElement, o: Opts): AuthScene {
  const { text, rtl, palette: P, font } = o;
  const { X, label, rect } = pen(rtl, font);
  const side = rtl ? -1 : 1;
  const tint = (c: string, k = 0.86) => new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k).getStyle();
  const shade = (c: string, k = 0.35) => new THREE.Color(c).lerp(new THREE.Color('#000000'), k).getStyle();
  const statusColor: Record<AuthStatus, string> = { confirmed: P.mint, pending: P.amber, vip: P.violet };
  const staffTone = [P.blue, P.violet];
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
  const dot = (g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  };
  /** A small rounded label at the reading end of a canvas `w` wide, `end` pixels in from that edge. */
  const pill = (g: CanvasRenderingContext2D, w: number, s: string, end: number, cy: number, bg: string, fg: string) => {
    g.font = `650 9.5px ${font}`;
    const pw = Math.ceil(g.measureText(s).width) + 14;
    const x = X(w, w - end - pw, pw);
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(x, cy - 8, pw, 16, 8);
    g.fill();
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.direction = rtl ? 'rtl' : 'ltr';
    g.fillText(s, x + pw / 2, cy + 0.5);
  };

  // Faces are redrawn whenever their on-screen size changes: a texture much larger than its
  // footprint gets sampled from blended mip levels and the text goes soft.
  type Draw = (g: CanvasRenderingContext2D) => void;
  type Surface = { w: number; h: number; draw: Draw; mat: THREE.MeshBasicMaterial };
  const surfaces: Surface[] = [];
  const surface = (w: number, h: number, draw: Draw) => {
    const s: Surface = { w, h, draw, mat: new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true }) };
    surfaces.push(s);
    return s;
  };
  let density = 0;
  let anisotropy = 1;
  const redraw = (s: Surface) => {
    const old = s.mat.map;
    s.mat.map = paint(s.w, s.h, s.draw, density || 1);
    s.mat.map.anisotropy = anisotropy;
    s.mat.needsUpdate = true;
    old?.dispose();
  };
  const repaint = (d: number, a: number) => {
    density = d;
    anisotropy = a;
    surfaces.forEach(redraw);
    for (const m of captionLayers) {
      m.map = captionMat.map;
      m.needsUpdate = true;
    }
  };

  // ── Calendar face ─────────────────────────────────────────────────
  const nowY = yOf(text.now);
  const nowX = GRID.gutter - 6;
  const calMat = surface(CW, CH, (g) => {
    g.beginPath();
    g.roundRect(0, 0, CW, CH, FACE_R);
    g.clip();
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, CW, CH);
    label(g, text.day, 26, 38, 19, INK, 700, CW, CW - 52);
    label(g, text.title, 26, 64, 12.5, MUTED, 500, CW, CW - 52);
    rect(g, CW, 0, 86, CW, 1, 0, LINE);
    text.staff.forEach((name, i) => {
      const x = colX(i);
      dot(g, X(CW, x + 13), 110, 12, tint(staffTone[i], 0.84));
      g.font = `700 11px ${font}`;
      g.fillStyle = staffTone[i];
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
    // Now: a hairline across the day with a dot on the gutter edge (its pulse is a mesh).
    g.globalAlpha = 0.85;
    rect(g, CW, nowX, nowY - 0.75, CW - GRID.gutter - 6, 1.5, 0.75, P.blue);
    g.globalAlpha = 1;
    dot(g, X(CW, nowX), nowY, 4, P.blue);
  }).mat;

  // ── Appointments ──────────────────────────────────────────────────
  const last = text.items.length - 1;
  const chipFaces = text.items.map((it, i) => {
    const h = Math.max(40, yOf(it.end) - yOf(it.start) - 4);
    const fresh = i === last;
    // White cards with a coloured edge; the booking that just arrived is the one tinted card.
    const c = fresh ? P.blue : statusColor[it.status];
    return {
      h,
      mat: surface(COL_W, h, (g) => {
        g.beginPath();
        g.roundRect(0.75, 0.75, COL_W - 1.5, h - 1.5, 9);
        g.fillStyle = fresh ? tint(P.blue, 0.93) : '#ffffff';
        g.fill();
        g.strokeStyle = fresh ? P.blue : HAIRLINE;
        g.lineWidth = fresh ? 1.5 : 1;
        g.stroke();
        rect(g, COL_W, 5, 7, 3, h - 14, 1.5, c);
        const pad = 16;
        g.font = `600 10.5px ${font}`;
        g.fillStyle = fresh ? P.blue : MUTED;
        g.textBaseline = 'middle';
        g.direction = 'ltr';
        g.textAlign = rtl ? 'right' : 'left';
        g.fillText(`${hhmm(it.start)}–${hhmm(it.end)}`, rtl ? COL_W - pad : pad, 16);
        if (fresh) pill(g, COL_W, text.fresh, 9, 16, P.blue, '#ffffff');
        else if (it.status === 'pending') pill(g, COL_W, text.pending, 9, 16, tint(P.amber, 0.8), shade(P.amber, 0.45));
        else dot(g, X(COL_W, COL_W - 17), 16, 3.5, c);
        label(g, it.customer, pad, 34, 13, INK, 650, COL_W, COL_W - pad - 10);
        if (h >= 62) label(g, it.service, pad, 52, 11, MUTED, 500, COL_W, COL_W - pad - 10);
      }).mat,
    };
  });

  // ── Notification ──────────────────────────────────────────────────
  const checkX = X(TW, CHECK.start, CHECK.ring * 2) + CHECK.ring;
  const toastMat = surface(TW, TH, (g) => {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(0, 0, TW, TH, 24);
    g.fill();
    const cy = TH / 2;
    // A dark check inside a thin mint ring: confirmed, without a block of colour.
    dot(g, checkX, cy, CHECK.ring, tint(P.mint, 0.84));
    g.strokeStyle = P.mint;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(checkX, cy, CHECK.ring - 0.75, 0, Math.PI * 2);
    g.stroke();
    dot(g, checkX, cy, CHECK.r, INK);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(checkX - 8.5, cy + 0.5);
    g.lineTo(checkX - 2.5, cy + 6.5);
    g.lineTo(checkX + 8.5, cy - 5.5);
    g.stroke();
    g.font = `500 11.5px ${font}`;
    const tw = g.measureText(text.toastTime).width;
    const tx = CHECK.start + CHECK.ring * 2 + 16;
    label(g, text.toastTime, TW - 22 - tw, 37, 11.5, MUTED, 500, TW);
    label(g, text.toastTitle, tx, 38, 16, INK, 700, TW, TW - tx - 22 - tw - 10);
    label(g, text.toastSub, tx, 62, 12.5, MUTED, 500, TW, TW - tx - 22);
  }).mat;

  // ── Today's count ─────────────────────────────────────────────────
  let count = -1;
  const total = text.items.length;
  const stat = surface(SW, SH, (g) => {
    const n = Math.max(0, count);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(0, 0, SW, SH, 20);
    g.fill();
    label(g, text.statLabel, 18, 25, 11.5, MUTED, 600, SW, SW - 36);
    g.font = `700 30px ${font}`;
    const nw = g.measureText(String(n)).width;
    digits(g, String(n), X(SW, 18, nw) + nw / 2, 56, 30, INK, 700);
    if (n === total) {
      const pw = 30;
      rect(g, SW, 18 + nw + 8, 47, pw, 18, 9, tint(P.mint, 0.8));
      digits(g, '+1', X(SW, 18 + nw + 8, pw) + pw / 2, 56.5, 10.5, shade(P.mint, 0.4), 700);
    }
    // A week of days, today rising as the calendar fills.
    const heights = [16, 24, 13, 27];
    const bars = heights.length + 1;
    const x0 = SW - 18 - (bars * 7 + (bars - 1) * 5);
    heights.forEach((bh, i) => rect(g, SW, x0 + i * 12, 68 - bh, 7, bh, 2.5, '#e8e9f0'));
    const today = 8 + (30 * n) / total;
    rect(g, SW, x0 + heights.length * 12, 68 - today, 7, today, 2.5, P.blue);
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
  }).mat;
  captionMat.color.set(INK);
  captionMat.depthWrite = false;

  // ── Scene ─────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Neutral keeps white paper white; ACES greys it.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' });
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.7;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(-side * 2.5, 4, 3.5);
  // A faint cool rim from the far side catches the cards' edges.
  const rim = new THREE.DirectionalLight(tint(P.blue, 0.55), 0.45);
  rim.position.set(side * 3, 1, -1.5);
  scene.add(key, rim, new THREE.HemisphereLight('#ffffff', '#e4e4e7', 1.1));

  // No floor: each card casts a soft, low shadow onto the air behind it, like a window over the desktop.
  const shadowTex = paint(256, 256, (g) => {
    // Only the blurred shadow lands on the canvas; the shape itself is drawn off to the side.
    g.shadowColor = '#000';
    g.shadowBlur = 40;
    g.shadowOffsetX = 1000;
    g.fillStyle = '#000';
    g.beginPath();
    g.roundRect(56 - 1000, 56, 144, 144, 24);
    g.fill();
  }, 1);
  const shadowOf = (w: number, h: number, opacity: number, color = SHADE) => {
    const mat = new THREE.MeshBasicMaterial({ map: shadowTex, color, transparent: true, depthWrite: false, toneMapped: false, opacity });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.78, h * 1.78), mat);
    mesh.renderOrder = -1;
    return { mesh, mat, opacity };
  };

  // Floating below the card, turned a little toward the pointer.
  const caption = new THREE.Group();
  const plate = new THREE.PlaneGeometry(PLATE.w, PLATE.h);
  const sideFrom = new THREE.Color('#9a9a9f');
  const sideTo = new THREE.Color('#dcdcdf');
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

  const paperMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3 });

  const cal = new THREE.Group();
  const calFace = new THREE.Mesh(new THREE.PlaneGeometry(FACE.w, FACE.h), calMat);
  calFace.position.z = 0.0205;
  const calShadow = shadowOf(CAL.w, CAL.h, 0.26);
  calShadow.mesh.position.set(0, -0.14, -0.22);
  // Tomorrow's page peeking out behind today's: the calendar reads as a stack, not a sheet.
  const backMat = new THREE.MeshPhysicalMaterial({ color: '#f1f1f5', roughness: 0.5, clearcoat: 0.2, transparent: true });
  const back = new THREE.Mesh(slab(CAL.w, CAL.h, CAL_R, 0.03), backMat);
  back.position.set(-side * 0.05, 0.09, -0.09);
  back.rotation.z = side * 0.03;
  back.scale.setScalar(0.94);
  cal.add(calShadow.mesh, back, new THREE.Mesh(slab(CAL.w, CAL.h, CAL_R, 0.04), paperMat), calFace);
  rig.add(cal);

  const chips = text.items.map((it, i) => {
    const { h, mat: faceMat } = chipFaces[i];
    const size = { w: (COL_W / CW) * FACE.w, h: (h / CH) * FACE.h };
    const fresh = i === last;
    const slabMat = new THREE.MeshPhysicalMaterial({ color: fresh ? tint(P.blue, 0.8) : '#ffffff', roughness: 0.4, clearcoat: 0.5, transparent: true });
    const group = new THREE.Group();
    const f = new THREE.Mesh(new THREE.PlaneGeometry(size.w - 0.008, size.h - 0.008), faceMat);
    f.position.z = 0.0085;
    // The new booking glows blue from underneath; the rest cast a faint lift.
    const under = fresh ? shadowOf(size.w, size.h, 0.42, P.blue) : shadowOf(size.w, size.h, 0.1);
    under.mesh.position.set(0, fresh ? -0.02 : -0.012, -0.009);
    group.add(under.mesh, new THREE.Mesh(slab(size.w, size.h, (9 / CW) * FACE.w, 0.016), slabMat), f);
    const home = onFace(X(CW, colX(it.col), COL_W) + COL_W / 2, yOf(it.start) + 2 + h / 2, 0.03);
    cal.add(group);
    return { group, home, mats: [slabMat, faceMat], under, at: fresh ? T.arrive : T.items + i * T.stagger, fresh };
  });

  const ringMat = new THREE.MeshBasicMaterial({ color: P.blue, transparent: true, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.172, 64), ringMat);
  const freshChip = chips[last];
  if (freshChip) ring.position.copy(freshChip.home).setZ(0.05);
  cal.add(ring);

  const pulseMat = new THREE.MeshBasicMaterial({ color: P.blue, transparent: true, depthWrite: false, toneMapped: false });
  const pulse = new THREE.Mesh(new THREE.CircleGeometry(1, 40), pulseMat);
  pulse.position.copy(onFace(X(CW, nowX), nowY, 0.0215));
  const dotR = (4 / CW) * FACE.w;
  cal.add(pulse);

  const toast = new THREE.Group();
  const toastFace = new THREE.Mesh(new THREE.PlaneGeometry(TOAST.w - 0.02, TOAST.h - 0.02), toastMat);
  toastFace.position.z = 0.0165;
  const toastShadow = shadowOf(TOAST.w, TOAST.h, 0.26);
  toastShadow.mesh.position.set(0, -0.06, -0.1);
  const checkRingMat = new THREE.MeshBasicMaterial({ color: P.mint, transparent: true, depthWrite: false, toneMapped: false });
  const checkRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.09, 56), checkRingMat);
  const checkR = (CHECK.ring / TW) * TOAST.w;
  checkRing.position.set((checkX / TW - 0.5) * TOAST.w, 0, 0.018);
  toast.add(toastShadow.mesh, new THREE.Mesh(slab(TOAST.w, TOAST.h, (24 / TW) * TOAST.w, 0.03), paperMat), toastFace, checkRing);
  rig.add(toast);

  const statGroup = new THREE.Group();
  const statFace = new THREE.Mesh(new THREE.PlaneGeometry(STAT.w - 0.016, STAT.h - 0.016), stat.mat);
  statFace.position.z = 0.0135;
  const statShadow = shadowOf(STAT.w, STAT.h, 0.2);
  statShadow.mesh.position.set(0, -0.045, -0.08);
  statGroup.add(statShadow.mesh, new THREE.Mesh(slab(STAT.w, STAT.h, (20 / SW) * STAT.w, 0.024), paperMat), statFace);
  rig.add(statGroup);

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

    const c = easeOutQuint(clamp01(k / T.cal));
    cal.position.set(side * 0.06, -0.22 * (1 - c) + idle * Math.sin(t * 0.6) * 0.014, -0.25 * (1 - c));
    cal.rotation.set(-0.08 + 0.12 * (1 - c), -side * (0.18 + 0.3 * (1 - c)), 0);
    calShadow.mat.opacity = calShadow.opacity * c;
    backMat.opacity = c;

    let landed = 0;
    for (const ch of chips) {
      const p = clamp01((k - ch.at) / (ch.fresh ? 0.85 : 0.7));
      const q = easeOutQuint(p);
      ch.group.visible = p > 0;
      ch.group.position.copy(ch.home);
      if (ch.fresh) {
        // Rises into its slot and settles with a little give.
        const e = easeOutBack(p);
        ch.group.position.y -= (1 - q) * 0.1;
        ch.group.position.z += (1 - e) * 0.38;
        ch.group.scale.setScalar(Math.max(0.001, 0.9 + 0.1 * e));
        ch.under.mat.opacity = ch.under.opacity * q * (0.82 + idle * 0.18 * Math.sin(t * 1.7));
      } else {
        // Slides down into its slot and lands on the page.
        ch.group.position.y += (1 - q) * 0.07;
        ch.group.position.z += (1 - q) * 0.14;
        ch.group.scale.setScalar(Math.max(0.001, 0.96 + 0.04 * q));
        ch.under.mat.opacity = ch.under.opacity * q;
      }
      ch.mats[0].opacity = ch.mats[1].opacity = clamp01(p / 0.4);
      if (p >= 0.55) landed++;
    }
    if (landed !== count) {
      count = landed;
      redraw(stat);
    }

    const r = clamp01((k - T.arrive - 0.25) / 0.9);
    ring.visible = r > 0 && r < 1;
    ring.scale.setScalar(0.5 + 1.5 * easeOutCubic(r));
    ringMat.opacity = 0.5 * (1 - r);

    // The current-time dot breathes, slowly, once the page has settled.
    const np = (t % 2.6) / 2.6;
    pulse.visible = idle > 0 && c > 0.9;
    pulse.scale.setScalar(dotR * (1 + 2.4 * easeOutCubic(np)));
    pulseMat.opacity = 0.3 * (1 - np);

    const s = easeOutQuint(clamp01((k - T.stat) / 0.8));
    statGroup.visible = s > 0;
    statGroup.scale.setScalar(0.94 + 0.06 * s);
    statGroup.position.set(side * (0.72 + 0.12 * (1 - s)), 0.84 - 0.06 * (1 - s) + idle * Math.sin(t * 0.8 + 2.1) * 0.016, 0.3);
    statGroup.rotation.set(0.04, -side * (0.16 + 0.2 * (1 - s)), side * 0.015);
    statShadow.mat.opacity = statShadow.opacity * s;
    stat.mat.opacity = clamp01(s / 0.3);

    // The notification glides in from the outer edge and settles with a soft spring.
    const q = clamp01((k - T.toast) / 0.9);
    const qe = easeOutQuint(q);
    toast.visible = q > 0;
    toast.scale.setScalar(0.92 + 0.08 * easeOutBack(q));
    toast.position.set(-side * (0.48 + 0.35 * (1 - qe)), -0.62 + idle * Math.sin(t * 0.9 + 0.8) * 0.02, 0.5);
    toast.rotation.set(0.05, side * (0.14 + 0.25 * (1 - qe)), -side * 0.02);
    toastShadow.mat.opacity = toastShadow.opacity * qe;
    toastMat.opacity = clamp01(q / 0.3);

    const cr = clamp01((k - T.toast - 0.45) / 1.1);
    checkRing.visible = cr > 0 && cr < 1;
    checkRing.scale.setScalar(checkR * (1 + 0.85 * easeOutCubic(cr)));
    checkRingMat.opacity = 0.6 * (1 - cr);

    const cp = easeOutCubic(clamp01((k - T.caption) / 0.9));
    caption.visible = captionOn && cp > 0;
    caption.position.set(0, CAPTION_Y - (1 - cp) * 0.08 + idle * Math.sin(t * 0.7 + 2) * 0.012, 0.62);
    caption.rotation.set(0, pointer.x * 0.1, 0);
    captionMat.opacity = cp;
    for (const m of captionLayers) m.opacity = cp;

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
    // Keep the card, the count, the notification and the sway in view: about 2.5 units across
    // and 2.4 down, plus the caption on the floor when the stage is tall.
    captionOn = aspect < 0.9;
    const dist = Math.max((captionOn ? 1.46 : 1.2) / half, 1.27 / (half * aspect));
    camera.position.set(0, 0.2, dist);
    camera.lookAt(0, captionOn ? -0.18 : 0, 0);
    camera.updateProjectionMatrix();

    // Device pixels per texture pixel at the card's depth, with headroom for the nearer notification.
    const perUnit = (h * dpr) / (2 * dist * half);
    // Headroom covers the nearer notification and the card turning toward the pointer.
    const d = Math.min(4, Math.max(1, Math.ceil(((perUnit * FACE.w) / CW) * 1.5 * 8) / 8));
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
      shadowTex.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
