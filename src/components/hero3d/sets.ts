import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { arcPanel, box, contact, cushion, cyl, group, lathe, limb, mat, mesh, place, puck, rot, sphere, tube } from './kit';

/**
 * The day's rooms, built as cut-away sets: floor, back wall with a window the
 * sun comes through, side walls, no ceiling and no front wall. Each room has
 * its own material character but the same construction, scale and detail level:
 * real thickness, small bevels, contact shadows where things meet.
 */

export const ROOM = { w: 4.6, d: 3.6, h: 2.7, t: 0.14 };
/** Distance between room centres (story's ROOM_X). */
const ROOM_PITCH = 6;
const BACK = -ROOM.d / 2;

export interface RoomStyle {
  wall: string;
  floor: string;
  /** Wood floors get a grain and a low clearcoat; others read as stone or resin. */
  wood?: boolean;
  /** Window centre along the back wall (x) and its size. */
  window?: { x: number; w: number; h: number; sill: number };
  trim?: string;
  /** A faint pane in the window, for rooms where a reflection helps (home at dusk). */
  pane?: boolean;
}

// ── Shared materials ──────────────────────────────────────────────────
const M = {
  oak: () => mat('#cfb08c', { rough: 0.58, clear: 0.12, clearRough: 0.5, bump: 'grain', bumpScale: 0.35, repeat: [1, 3] }),
  walnut: () => mat('#7d5d47', { rough: 0.5, clear: 0.25, clearRough: 0.45, bump: 'grain', bumpScale: 0.35, repeat: [1, 3] }),
  brushed: () => mat('#c6c5c1', { rough: 0.32, metal: 0.85 }),
  darkMetal: () => mat('#2b2a2a', { rough: 0.38, metal: 0.6 }),
  glass: () => mat('#ffffff', { rough: 0.04, opacity: 0.26, clear: 1, clearRough: 0.04 }),
  plasticWhite: () => mat('#f5f4f1', { rough: 0.32, clear: 0.5, clearRough: 0.3 }),
  matteWhite: () => mat('#f1f0ec', { rough: 0.6 }),
  fabric: (c: string) => mat(c, { rough: 0.96, sheen: 0.7, bump: 'weave', bumpScale: 0.4, repeat: [3, 3] }),
  leather: (c: string) => mat(c, { rough: 0.48, sheen: 0.25, clear: 0.2, clearRough: 0.45, bump: 'leather', bumpScale: 0.45, repeat: [2, 2] }),
  paper: () => mat('#fbfaf7', { rough: 0.95 }),
};

/** Floor, walls, skirting and a window with a real reveal and sill. Origin at the floor centre. */
export function roomShell(s: RoomStyle) {
  const g = new THREE.Group();
  const { w, d, h, t } = ROOM;
  const wall = mat(s.wall, { rough: 0.94, bump: 'plaster', bumpScale: 0.35, repeat: [3, 2] });
  const floor = s.wood
    ? mat(s.floor, { rough: 0.6, clear: 0.15, clearRough: 0.55, bump: 'grain', bumpScale: 0.45, repeat: [3, 7] })
    : mat(s.floor, { rough: 0.78, bump: 'plaster', bumpScale: 0.15, repeat: [4, 4] });
  const trim = mat(s.trim ?? s.wall, { rough: 0.62 });
  const section = mat('#d6cfc6', { rough: 0.92 });
  // Side walls are solid to the midpoint between rooms, so the row of rooms reads as one building cut open.
  const st = (ROOM_PITCH - w) / 2;
  g.add(box(w, 0.16, d + t, floor, 0.02, [0, -0.08, t / 2]));
  g.add(box(ROOM_PITCH, 0.16, d + t, section, 0.004, [0, -0.0805, t / 2]));

  const win = s.window;
  const z = BACK - t / 2;
  if (win) {
    const x0 = win.x - win.w / 2;
    const x1 = win.x + win.w / 2;
    const left = x0 + w / 2;
    const right = w / 2 - x1;
    g.add(box(left + st, h, t, wall, 0.012, [-w / 2 - st + (left + st) / 2, h / 2, z]));
    g.add(box(right + st, h, t, wall, 0.012, [x1 + (right + st) / 2, h / 2, z]));
    g.add(box(win.w, win.sill, t, wall, 0.012, [win.x, win.sill / 2, z]));
    const top = h - win.sill - win.h;
    g.add(box(win.w, top, t, wall, 0.012, [win.x, h - top / 2, z]));
    // Frame set back in the reveal, a sill that sits proud of the wall.
    const fz = z - t * 0.15;
    g.add(box(win.w + 0.1, 0.028, t + 0.06, trim, 0.008, [win.x, win.sill + 0.014, z + 0.03]));
    for (const sx of [-1, 1]) g.add(box(0.04, win.h, 0.06, trim, 0.008, [win.x + sx * (win.w / 2 - 0.02), win.sill + win.h / 2, fz]));
    g.add(box(win.w, 0.04, 0.06, trim, 0.008, [win.x, win.sill + win.h - 0.02, fz]));
    g.add(box(win.w, 0.035, 0.06, trim, 0.008, [win.x, win.sill + 0.045, fz]));
    g.add(box(0.026, win.h, 0.045, trim, 0.006, [win.x, win.sill + win.h / 2, fz]));
    g.add(box(win.w, 0.022, 0.045, trim, 0.006, [win.x, win.sill + win.h * 0.64, fz]));
    if (s.pane) {
      const pane = mesh(new THREE.PlaneGeometry(win.w - 0.06, win.h - 0.06), M.glass(), false);
      pane.position.set(win.x, win.sill + win.h / 2, fz + 0.005);
      pane.receiveShadow = false;
      g.add(pane);
    }
  } else {
    g.add(box(w + st * 2, h, t, wall, 0.012, [0, h / 2, z]));
  }
  for (const sx of [-1, 1]) {
    g.add(box(st, h, d, wall, 0.012, [sx * (w / 2 + st / 2), h / 2, 0]));
    // Section faces: the cut tops and fronts read as drawn, like an architect's model.
    g.add(box(st - 0.004, 0.006, d + t, section, 0.002, [sx * (w / 2 + st / 2), h + 0.003, -t / 2]));
    g.add(box(st - 0.004, h, 0.006, section, 0.002, [sx * (w / 2 + st / 2), h / 2, d / 2 + 0.003]));
  }
  g.add(box(w, 0.006, t, section, 0.002, [0, h + 0.003, z]));
  // Skirting on all three walls: the line that makes a set read as built.
  g.add(box(w, 0.07, 0.016, trim, 0.004, [0, 0.035, BACK + 0.008]));
  for (const sx of [-1, 1]) g.add(box(0.016, 0.07, d, trim, 0.004, [sx * (w / 2 - 0.008), 0.035, 0]));
  return g;
}

// ── Furniture and props ──────────────────────────────────────────────
/** A dining-style chair: upholstered seat, tapered splayed legs, a bent-ply back. Faces +Z. */
export function chair(o: { fabric: string; wood?: THREE.Material; h?: number }) {
  const h = o.h ?? 0.46;
  const wood = o.wood ?? M.oak();
  const g = new THREE.Group();
  g.add(cushion(0.45, 0.06, 0.43, M.fabric(o.fabric), [0, h, 0.01], 0.45));
  g.add(box(0.42, 0.025, 0.4, wood, 0.008, [0, h - 0.04, 0]));
  const L = h - 0.05;
  for (const [x, z] of [
    [-0.18, -0.17],
    [0.18, -0.17],
    [-0.18, 0.17],
    [0.18, 0.17],
  ]) {
    const leg = cyl(0.014, 0.01, L, wood, [x * 1.03, L / 2, z * 1.03], 14);
    leg.rotation.set(-Math.sign(z) * 0.035, 0, Math.sign(x) * 0.035);
    g.add(leg);
  }
  for (const x of [-0.18, 0.18]) g.add(rot(cyl(0.011, 0.013, 0.42, wood, [x, h + 0.19, -0.2], 12), -0.1, 0, 0));
  g.add(rot(place(arcPanel(0.44, 0.15, 0.018, 0.55, wood), [0, h + 0.24, -0.225]), -0.12, 0, 0));
  g.add(contact(0.7, 0.66, [0, 0, 0], 0.55));
  return g;
}

/** A round upholstered stool on a pedestal. */
function stool(fabric: string, h = 0.52) {
  const metal = M.brushed();
  const ring = rot(mesh(new THREE.TorusGeometry(0.15, 0.007, 10, 48), metal), Math.PI / 2, 0, 0);
  ring.position.y = 0.2;
  return group(
    cushion(0.38, 0.07, 0.38, M.fabric(fabric), [0, h, 0], 0.48),
    puck(0.17, 0.02, metal, [0, h - 0.045, 0], 0.006),
    cyl(0.022, 0.026, h - 0.06, metal, [0, (h - 0.06) / 2, 0], 18),
    ring,
    puck(0.21, 0.018, metal, [0, 0.009, 0], 0.006),
    contact(0.6, 0.6, [0, 0, 0], 0.55),
  );
}

export function plant(potColor: string, leaf = '#5f7a5a', s = 1) {
  const g = new THREE.Group();
  const pot = mat(potColor, { rough: 0.88, bump: 'plaster', bumpScale: 0.4, repeat: [2, 2] });
  g.add(
    lathe(
      [
        [0, 0],
        [0.002, 0.098 * s],
        [0.01, 0.103 * s],
        [0.24 * s, 0.13 * s],
        [0.262 * s, 0.132 * s],
        [0.262 * s, 0.118 * s],
        [0.24 * s, 0.114 * s],
      ],
      pot,
    ),
  );
  g.add(puck(0.115 * s, 0.01, mat('#4b3d33', { rough: 1 }), [0, 0.236 * s, 0], 0.003));
  const lm = mat(leaf, { rough: 0.62, sheen: 0.35, spec: 0.6 });
  lm.side = THREE.DoubleSide;
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (i % 2) * 0.4;
    const l = limb(0.034 * s, 0.004 * s, (0.4 + (i % 3) * 0.11) * s, lm, 0.22);
    l.rotation.order = 'YXZ';
    l.rotation.y = a;
    l.rotation.x = Math.PI - 0.28 - (i % 3) * 0.17;
    l.position.y = 0.24 * s;
    g.add(l);
  }
  g.add(contact(0.42 * s, 0.42 * s, [0, 0, 0], 0.5));
  return g;
}

/** A pendant: a cord, a turned shade with real wall thickness, and a warm diffuser that reads as lit. */
export function pendant(color: string, drop: number, ceiling = ROOM.h) {
  const shade = mat(color, { rough: 0.42, metal: 0.15, clear: 0.3 });
  shade.side = THREE.DoubleSide;
  const y = ceiling - drop;
  const diffuser = rot(mesh(new THREE.CircleGeometry(0.06, 32), new THREE.MeshBasicMaterial({ color: '#fff4e2', side: THREE.DoubleSide }), false), Math.PI / 2, 0, 0);
  diffuser.position.y = y - 0.01;
  return group(
    cyl(0.003, 0.003, drop, M.darkMetal(), [0, ceiling - drop / 2, 0], 6),
    lathe(
      Array.from({ length: 18 }, (_, i): [number, number] => {
        const a = (i / 17) * (Math.PI / 2);
        return [-0.07 + Math.sin(a) * 0.16, 0.012 + Math.cos(a) * 0.148];
      }),
      shade,
      [0, y, 0],
      64,
    ),
    diffuser,
  );
}

export function rug(color: string, w: number, d: number) {
  return box(w, 0.012, d, mat(color, { rough: 1, sheen: 0.6, bump: 'weave', bumpScale: 0.6, repeat: [10, 7] }), 0.006, [0, 0.006, 0]);
}

/** A framed print with a quiet abstract: paper, a mat, a thin oak frame. */
function print(w: number, h: number, colors: [string, string, string]) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = Math.round((256 * h) / w);
  const g = c.getContext('2d')!;
  g.fillStyle = colors[0];
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = colors[1];
  g.beginPath();
  g.arc(c.width * 0.42, c.height * 0.62, c.width * 0.3, Math.PI, 0);
  g.lineTo(c.width * 0.72, c.height * 0.9);
  g.lineTo(c.width * 0.12, c.height * 0.9);
  g.fill();
  g.fillStyle = colors[2];
  g.beginPath();
  g.arc(c.width * 0.66, c.height * 0.36, c.width * 0.11, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const art = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
  return group(box(w + 0.05, h + 0.05, 0.025, M.oak(), 0.004, [0, 0, 0.012]), box(w + 0.02, h + 0.02, 0.006, M.paper(), 0.002, [0, 0, 0.027]), place(mesh(new THREE.PlaneGeometry(w - 0.06, h - 0.06), art, false), [0, 0, 0.031]));
}

/** A nail-polish bottle: clear glass shell, lacquer inside, a tall glossy cap. */
function bottle(c: string, s = 1) {
  return group(
    box(0.032 * s, 0.04 * s, 0.032 * s, M.glass(), 0.008 * s, [0, 0.02 * s, 0]),
    box(0.025 * s, 0.03 * s, 0.025 * s, mat(c, { rough: 0.22, clear: 1, clearRough: 0.08 }), 0.006 * s, [0, 0.017 * s, 0]),
    cyl(0.0065 * s, 0.0075 * s, 0.006 * s, M.glass(), [0, 0.042 * s, 0], 16),
    puck(0.0095 * s, 0.042 * s, mat('#151414', { rough: 0.16, clear: 0.9 }), [0, 0.065 * s, 0], 0.003 * s, 24),
  );
}

/** A pillar standing in front of the rooms: the first scene change wipes behind it. */
export function pillar() {
  const m = mat('#e9e4dd', { rough: 0.94, bump: 'plaster', bumpScale: 0.5, repeat: [2, 6] });
  return lathe(
    [
      [-0.16, 0],
      [-0.16, 0.38],
      [-0.06, 0.38],
      [-0.05, 0.37],
      [-0.04, 0.34],
      [-0.02, 0.31],
      [0.0, 0.3],
      [4.44, 0.3],
      [4.45, 0],
    ],
    m,
    [0, 0, 0],
    64,
  );
}

// ── Rooms ──────────────────────────────────────────────────────────────
export interface Set {
  group: THREE.Group;
  /** Named points the camera and story use, in room coordinates. */
  marks: Record<string, THREE.Vector3>;
  /** Moving parts the story drives. */
  parts: Record<string, THREE.Object3D>;
}

/** Top surface of the nail table, the salon counter, the home desk. */
export const NAIL_TOP = 0.76;

/** 09:00: the nail studio. A stone-topped oak table, a hand cushion on a folded towel, a lamp, bottles, morning light. */
export function nailStudio(): Set {
  const g = roomShell({ wall: '#efe9e4', floor: '#d9c6b0', wood: true, trim: '#e7e1da', window: { x: -0.9, w: 1.5, h: 1.45, sill: 0.85 } });
  const oak = M.oak();
  const stone = mat('#f2efea', { rough: 0.34, clear: 0.45, clearRough: 0.25, bump: 'plaster', bumpScale: 0.12, repeat: [2, 1] });

  // The table: a 3 cm stone top on an oak apron, slim tapered legs so her knees fit under.
  // Narrow, as manicure tables are: the technician works across it.
  const T = NAIL_TOP;
  const table = group(box(1.0, 0.03, 0.64, stone, 0.01, [0, T - 0.015, 0]), box(0.88, 0.06, 0.52, oak, 0.008, [0, T - 0.06, 0]));
  for (const [x, z] of [
    [-0.43, -0.27],
    [0.43, -0.27],
    [-0.43, 0.27],
    [0.43, 0.27],
  ])
    table.add(cyl(0.022, 0.014, T - 0.03, oak, [x, (T - 0.03) / 2, z], 16));
  table.add(contact(1.35, 0.95, [0, 0, 0], 0.5), contact(0.7, 0.42, [-0.15, T, 0.08], 0.16));
  place(table, [0, 0, 0.1]);
  g.add(table);

  // Her side: a folded towel and a soft hand cushion.
  g.add(box(0.34, 0.012, 0.22, mat('#f7f4ef', { rough: 1, sheen: 0.8, bump: 'weave', bumpScale: 0.8, repeat: [5, 3] }), 0.005, [-0.22, T + 0.006, 0.18]));
  g.add(cushion(0.2, 0.05, 0.12, M.fabric('#e3c3b9'), [-0.3, T + 0.012 + 0.025, 0.18], 0.48));
  // The lamp: a white arch over a base plate, a soft glow inside.
  const lampM = M.plasticWhite();
  lampM.side = THREE.DoubleSide;
  const arch = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.18, 48, 1, true, 0, Math.PI), lampM);
  arch.rotation.z = Math.PI / 2;
  g.add(place(group(box(0.22, 0.012, 0.19, lampM, 0.005, [0, 0.006, 0]), place(arch, [0, 0.012, 0]), place(box(0.12, 0.004, 0.018, new THREE.MeshBasicMaterial({ color: '#f1effb' }), 0.001), [0, 0.09, 0])), [-0.05, T, -0.14]));
  g.add(contact(0.32, 0.26, [-0.05, T, -0.14], 0.35));
  // A brushed tray of colours, and the technician's tools.
  const metal = M.brushed();
  g.add(box(0.27, 0.008, 0.11, metal, 0.003, [0.28, T + 0.004, 0.24]));
  const colours = ['#9c3a47', '#d5978b', '#ead6cc', '#2f2a2c', '#b4855f'];
  colours.forEach((c, i) => g.add(place(bottle(c), [0.18 + i * 0.05, T + 0.008, 0.24])));
  g.add(rot(box(0.012, 0.0035, 0.12, mat('#e2cfc4', { rough: 0.9 }), 0.0015, [0.3, T + 0.002, 0.06]), 0, 0.5, 0));
  g.add(rot(cyl(0.0025, 0.0025, 0.12, metal, [0.22, T + 0.003, 0.05], 8), Math.PI / 2, 0, 0.9));

  const hers = chair({ fabric: '#ece4dc' });
  place(hers, [-0.7, 0, 0.14], Math.PI / 2);
  g.add(hers);
  g.add(place(stool('#e3d8cc', 0.5), [0.56, 0, 0.12]));

  // Back wall: an oak shelf of colours, a framed print, a plant in the corner.
  g.add(box(0.86, 0.03, 0.18, oak, 0.008, [0.55, 1.42, BACK + 0.1]));
  for (let i = 0; i < 9; i++) g.add(place(bottle(colours[i % colours.length], 1.3), [0.2 + i * 0.087, 1.435, BACK + 0.1]));
  g.add(place(print(0.4, 0.52, ['#efe8df', '#d9b8a8', '#b2563d']), [0.55, 1.95, BACK]));
  g.add(place(plant('#e8e2da'), [-2.0, 0, -1.4]));
  g.add(place(pendant('#efe9e4', 0.95), [0, 0, 0.1]));
  g.add(place(rug('#e8ddd2', 2.4, 1.6), [0, 0, 0.15]));

  return {
    group: g,
    marks: { hands: new THREE.Vector3(-0.32, 0.8, 0.22), table: new THREE.Vector3(0, T, 0.1) },
    parts: {},
  };
}

/** Carriage geometry the story uses: her hips sit this far along the carriage from its centre. */
export const CARRIAGE = { top: 0.465, hip: 0.05, foot: 0.98, bar: 0.68 };

/** 11:00: Pilates. A reformer with an oak frame, brushed tracks, an upholstered carriage, springs, straps. */
export function pilatesStudio(): Set {
  const g = roomShell({ wall: '#e7eae4', floor: '#d6c3a8', wood: true, trim: '#e2e5de', window: { x: 0.2, w: 2.6, h: 1.6, sill: 0.6 } });
  const oak = M.oak();
  const alu = M.brushed();
  const pad = M.leather('#8f9d93');
  const rope = mat('#3a3937', { rough: 0.7, sheen: 0.4 });

  const reformer = () => {
    const r = new THREE.Group();
    for (const z of [-0.29, 0.29]) r.add(box(2.3, 0.1, 0.07, oak, 0.022, [0, 0.3, z]));
    for (const x of [-1.13, 1.13]) r.add(box(0.08, 0.3, 0.66, oak, 0.022, [x, 0.2, 0]));
    for (const x of [-1.1, 1.1]) for (const z of [-0.29, 0.29]) r.add(puck(0.028, 0.05, mat('#2d2c2b', { rough: 0.7 }), [x, 0.025, z], 0.006, 20));
    for (const z of [-0.24, 0.24]) r.add(box(2.2, 0.016, 0.034, alu, 0.006, [0, 0.355, z]));
    // Footbar: one bent tube on brackets, a padded grip across the middle.
    const f = CARRIAGE.foot;
    r.add(
      tube(
        [
          [f, 0.36, -0.3],
          [f, 0.6, -0.3],
          [f + 0.005, CARRIAGE.bar, -0.24],
          [f + 0.005, CARRIAGE.bar, 0.24],
          [f, 0.6, 0.3],
          [f, 0.36, 0.3],
        ],
        0.014,
        alu,
        64,
      ),
    );
    r.add(rot(cushion(0.05, 0.42, 0.05, pad, [f + 0.005, CARRIAGE.bar, 0], 0.48), Math.PI / 2, 0, 0));
    for (const z of [-0.3, 0.3]) r.add(box(0.06, 0.05, 0.03, alu, 0.008, [f, 0.35, z]));
    // Spring bar at the foot end; springs reach from it to the carriage.
    r.add(rot(cyl(0.012, 0.012, 0.5, alu, [f + 0.04, 0.36, 0], 12), Math.PI / 2, 0, 0));
    const springs = new THREE.Group();
    const springColours = ['#b7a48e', '#9aa89c', '#9aa89c', '#c4b6a6'];
    [-0.12, -0.04, 0.04, 0.12].forEach((z, i) => {
      const pts: [number, number, number][] = [];
      for (let k = 0; k <= 120; k++) {
        const a = (k / 120) * Math.PI * 2 * 18;
        pts.push([k / 120, Math.sin(a) * 0.011, z + Math.cos(a) * 0.011]);
      }
      springs.add(tube(pts, 0.0028, mat(springColours[i], { rough: 0.35, metal: 0.6 }), 240));
    });
    springs.position.y = 0.36;
    springs.traverse((o) => (o.castShadow = false));
    r.add(springs);
    // Head end: two risers with pulleys; the straps rest looped on the frame.
    for (const z of [-0.29, 0.29]) {
      r.add(cyl(0.014, 0.014, 0.42, alu, [-1.12, 0.56, z], 12));
      r.add(rot(puck(0.03, 0.014, mat('#2d2c2b', { rough: 0.45 }), [-1.12, 0.78, z], 0.004, 24), Math.PI / 2, 0, 0));
      r.add(
        tube(
          [
            [-1.12, 0.8, z],
            [-1.08, 0.74, z * 1.02],
            [-0.98, 0.5, z * 1.06],
            [-0.9, 0.38, z * 1.1],
          ],
          0.004,
          rope,
          32,
        ),
      );
      const loop = rot(mesh(new THREE.TorusGeometry(0.035, 0.008, 8, 28), mat('#2f2e2c', { rough: 0.8, sheen: 0.5 })), Math.PI / 2, 0, 0.3);
      loop.position.set(-0.86, 0.365, z * 1.12);
      r.add(loop);
    }
    // The carriage: oak base, upholstered pad, headrest, shoulder blocks.
    const carriage = group(
      box(0.86, 0.03, 0.56, oak, 0.01, [0, 0.39, 0]),
      cushion(0.87, 0.07, 0.56, pad, [0.015, CARRIAGE.top - 0.035, 0], 0.3),
      cushion(0.2, 0.06, 0.3, pad, [-0.53, CARRIAGE.top - 0.018, 0], 0.4),
      box(0.18, 0.025, 0.26, oak, 0.008, [-0.53, CARRIAGE.top - 0.06, 0]),
    );
    for (const z of [-0.115, 0.115]) carriage.add(cushion(0.07, 0.12, 0.085, pad, [-0.43, CARRIAGE.top + 0.06, z], 0.4), box(0.05, 0.02, 0.065, oak, 0.006, [-0.43, CARRIAGE.top, z]));
    r.add(carriage);
    r.add(contact(2.8, 0.95, [0, 0, 0], 0.55));
    return { r, carriage, springs };
  };
  const main = reformer();
  place(main.r, [0, 0, 0.25]);
  g.add(main.r);
  const spare = reformer();
  place(spare.r, [0.3, 0, -1.05]);
  spare.carriage.position.x = -0.25;
  spare.springs.position.x = -0.25 + 0.45;
  spare.springs.scale.x = CARRIAGE.foot - (-0.25 + 0.45);
  g.add(spare.r);

  // An oak ladder rack, rolled mats, a ball in the corner.
  for (const z of [-0.88, -0.32]) g.add(box(0.04, 1.8, 0.04, oak, 0.01, [ROOM.w / 2 - 0.05, 0.9, z]));
  for (let i = 0; i < 6; i++) g.add(rot(cyl(0.014, 0.014, 0.56, oak, [ROOM.w / 2 - 0.05, 0.3 + i * 0.27, -0.6], 12), Math.PI / 2, 0, 0));
  ['#b9c4b8', '#d8c5b4', '#9aa89c'].forEach((c, i) => {
    g.add(rot(cushion(0.14, 0.56, 0.14, M.fabric(c), [ROOM.w / 2 - 0.22, 0.07 + i * 0.142, 0.42], 0.49), Math.PI / 2, 0, 0));
  });
  g.add(contact(0.3, 0.7, [ROOM.w / 2 - 0.22, 0, 0.42], 0.5));
  g.add(sphere(0.3, mat('#d9cfc4', { rough: 0.7, sheen: 0.4 }), [-1.85, 0.3, -1.2]), contact(0.75, 0.75, [-1.85, 0, -1.2], 0.6));
  g.add(place(plant('#e6e2da', '#6c8466', 1.25), [-1.95, 0, 0.9]));
  g.add(place(rug('#e2ddd3', 3, 1.2), [0, 0, 0.25]));

  return {
    group: g,
    marks: { body: new THREE.Vector3(0, 0.55, 0.25) },
    parts: { carriage: main.carriage, springs: main.springs },
  };
}

export const MIRROR = { w: 1.0, h: 1.4, y: 1.45 };
/** The colour the salon mirror and the clinic screen share: the cut between them happens on it. */
export const GLASS = '#e4e6e5';

/** 13:30: the salon. A leather styling chair facing a walnut-framed mirror, a stylist behind her. */
export function salon(reflect: number): Set {
  const g = roomShell({ wall: '#ebe4dc', floor: '#e0d9d0', trim: '#e2dbd2', window: { x: -1.5, w: 1.1, h: 1.6, sill: 0.7 } });
  const walnut = M.walnut();
  const leather = M.leather('#3a3431');
  const steel = M.brushed();
  const brass = mat('#c7a77a', { rough: 0.3, metal: 0.9 });
  const z = BACK;

  const station = (x: number, live: boolean) => {
    const s = new THREE.Group();
    // A deep walnut frame with a brass liner; the glass sits inside it.
    const fw = MIRROR.w + 0.12;
    const fh = MIRROR.h + 0.12;
    s.add(box(fw, 0.06, 0.05, walnut, 0.012, [0, MIRROR.y + fh / 2 - 0.03, z + 0.025]), box(fw, 0.06, 0.05, walnut, 0.012, [0, MIRROR.y - fh / 2 + 0.03, z + 0.025]));
    for (const sx of [-1, 1]) s.add(box(0.06, fh - 0.12, 0.05, walnut, 0.012, [sx * (fw / 2 - 0.03), MIRROR.y, z + 0.025]));
    for (const sx of [-1, 1]) s.add(box(0.006, MIRROR.h, 0.012, brass, 0.002, [sx * (MIRROR.w / 2 + 0.003), MIRROR.y, z + 0.045]));
    for (const sy of [-1, 1]) s.add(box(MIRROR.w, 0.006, 0.012, brass, 0.002, [0, MIRROR.y + sy * (MIRROR.h / 2 + 0.003), z + 0.045]));
    let mirror: THREE.Object3D;
    if (live && reflect > 0) {
      const r = new Reflector(new THREE.PlaneGeometry(MIRROR.w, MIRROR.h), { textureWidth: reflect, textureHeight: Math.round((reflect * MIRROR.h) / MIRROR.w), color: '#b9bcbb', clipBias: 0.003 });
      mirror = r;
    } else {
      mirror = mesh(new THREE.PlaneGeometry(MIRROR.w, MIRROR.h), mat('#cfd3d2', { rough: 0.06, metal: 1 }), false);
    }
    mirror.position.set(0, MIRROR.y, z + 0.03);
    s.add(mirror);
    // A soft frosted veil over the glass: it carries the shared sheen, and thickens to solid at the cut.
    const veil = mesh(new THREE.PlaneGeometry(MIRROR.w, MIRROR.h), new THREE.MeshBasicMaterial({ color: GLASS, transparent: true, opacity: 0.22, depthWrite: false }), false);
    veil.position.set(0, MIRROR.y, z + 0.032);
    s.add(veil);
    // Two upright light bars either side of the mirror.
    const glow = new THREE.MeshBasicMaterial({ color: '#fff3e3' });
    for (const sx of [-1, 1]) {
      s.add(place(cyl(0.017, 0.017, 0.56, glow, [0, 0, 0], 20), [sx * (fw / 2 + 0.09), MIRROR.y + 0.1, z + 0.06]));
      for (const sy of [-1, 1]) s.add(puck(0.02, 0.02, brass, [sx * (fw / 2 + 0.09), MIRROR.y + 0.1 + sy * 0.29, z + 0.06], 0.004, 20));
      s.add(box(0.03, 0.03, 0.04, brass, 0.006, [sx * (fw / 2 + 0.09), MIRROR.y + 0.1, z + 0.025]));
    }
    // The counter: a floating walnut shelf with its tidy kit.
    s.add(box(1.2, 0.045, 0.36, walnut, 0.012, [0, 0.8, z + 0.18]));
    s.add(contact(1.1, 0.3, [0, 0.823, z + 0.18], 0.25));
    s.add(lathe([[0, 0], [0, 0.03], [0.14, 0.033], [0.155, 0.02], [0.17, 0.012], [0.2, 0.012]], mat('#2f2b29', { rough: 0.3, clear: 0.8 }), [0.36, 0.823, z + 0.2]));
    s.add(lathe([[0, 0], [0, 0.027], [0.12, 0.028], [0.135, 0.016], [0.15, 0.016]], mat('#d6c7b5', { rough: 0.3, clear: 0.8 }), [0.45, 0.823, z + 0.22]));
    s.add(cushion(0.2, 0.05, 0.14, M.fabric('#efe9e1'), [-0.38, 0.848, z + 0.2], 0.4), cushion(0.2, 0.05, 0.14, M.fabric('#d9cfc4'), [-0.38, 0.898, z + 0.2], 0.4));
    s.add(box(0.18, 0.006, 0.03, mat('#2a2828', { rough: 0.4 }), 0.002, [0.1, 0.826, z + 0.26]));
    place(s, [x, 0, 0]);
    return { s, veil, mirror };
  };
  const a = station(0.1, true);
  const b = station(1.55, false);
  g.add(a.s, b.s);

  const salonChair = () =>
    group(
      puck(0.25, 0.026, steel, [0, 0.013, 0], 0.008, 48),
      lathe([[0.026, 0.07], [0.06, 0.06], [0.3, 0.042], [0.38, 0.05], [0.42, 0.075]], steel, [0, 0, 0], 32),
      cushion(0.52, 0.12, 0.5, leather, [0, 0.52, 0.01], 0.42),
      rot(cushion(0.5, 0.6, 0.12, leather, [0, 0.9, -0.22], 0.42), -0.1, 0, 0),
      ...[-1, 1].flatMap((sx) => [
        cushion(0.07, 0.05, 0.4, leather, [sx * 0.29, 0.73, 0.02], 0.45),
        tube(
          [
            [sx * 0.26, 0.5, -0.12],
            [sx * 0.29, 0.62, -0.08],
            [sx * 0.29, 0.7, 0.05],
          ],
          0.012,
          steel,
          16,
        ),
      ]),
      tube(
        [
          [-0.16, 0.42, 0.18],
          [-0.15, 0.13, 0.32],
          [0.15, 0.13, 0.32],
          [0.16, 0.42, 0.18],
        ],
        0.011,
        steel,
        40,
      ),
      contact(0.75, 0.75, [0, 0, 0], 0.65),
    );
  g.add(place(salonChair(), [0.1, 0, 0.2], Math.PI));
  g.add(place(salonChair(), [1.55, 0, 0.2], Math.PI));

  // A trolley beside the chair, pendants over the stations, a plant by the window.
  g.add(
    place(
      group(
        cyl(0.011, 0.011, 0.7, steel, [0, 0.38, 0], 12),
        box(0.36, 0.025, 0.28, mat('#efe9e2', { rough: 0.4, clear: 0.4 }), 0.01, [0, 0.74, 0]),
        box(0.36, 0.025, 0.28, mat('#efe9e2', { rough: 0.4, clear: 0.4 }), 0.01, [0, 0.4, 0]),
        puck(0.18, 0.02, steel, [0, 0.03, 0], 0.006),
        lathe([[0, 0], [0, 0.035], [0.1, 0.035], [0.12, 0.012], [0.16, 0.012]], mat('#e9e2d8', { rough: 0.35, clear: 0.6 }), [0.08, 0.752, 0.04]),
        box(0.12, 0.012, 0.035, mat('#2a2828', { rough: 0.4 }), 0.004, [-0.06, 0.758, -0.04]),
        contact(0.5, 0.45, [0, 0, 0], 0.5),
      ),
      [-0.75, 0, 0.1],
    ),
  );
  g.add(place(pendant('#2f2b29', 1.0), [0.1, 0, 0.1]), place(pendant('#2f2b29', 1.0), [1.55, 0, 0.1]));
  g.add(place(plant('#d8cfc4', '#5e7658', 1.3), [-1.95, 0, -1.2]));
  g.add(contact(0.7, 0.7, [-0.34, 0, 0.78], 0.6));

  return {
    group: g,
    marks: { head: new THREE.Vector3(0.1, 1.28, 0.2), mirror: new THREE.Vector3(0.1, MIRROR.y, z + 0.035) },
    parts: { glass: a.veil, mirror: a.mirror },
  };
}

/** Exam couch height: she sits on its edge. */
export const COUCH = { top: 0.71, edge: -0.1, step: 0.3 };

/** 16:00: the clinic. An upholstered couch with a raised back, a step, a side cabinet, a frosted privacy screen. */
export function clinic(): Set {
  const g = roomShell({ wall: '#e8ebea', floor: '#d9dcd8', trim: '#e0e3e2', window: { x: -1.2, w: 1.4, h: 1.5, sill: 0.8 } });
  const white = mat('#f3f3f1', { rough: 0.42, clear: 0.25, clearRough: 0.4 });
  const plinth = mat('#c9cdcb', { rough: 0.7 });
  const steel = M.brushed();
  const pad = M.leather('#b5c3c1');

  // The couch along x, its back raised at the right-hand end.
  g.add(
    place(
      group(
        box(1.5, 0.06, 0.44, plinth, 0.01, [0, 0.03, 0]),
        box(1.6, 0.5, 0.52, white, 0.02, [0, 0.31, 0]),
        box(1.58, 0.004, 0.004, plinth, 0.001, [0, 0.38, 0.262]),
        box(1.9, 0.04, 0.7, white, 0.012, [0, 0.58, 0]),
        cushion(1.4, 0.1, 0.7, pad, [-0.25, COUCH.top - 0.05, 0], 0.35),
        rot(cushion(0.56, 0.1, 0.7, pad, [0.68, COUCH.top + 0.06, 0], 0.35), 0, 0, 0.36),
        box(1.0, 0.004, 0.5, M.paper(), 0.002, [-0.35, COUCH.top + 0.002, 0]),
        rot(cyl(0.05, 0.05, 0.56, M.paper(), [-1.0, 0.64, 0], 28), Math.PI / 2, 0, 0),
        rot(cyl(0.012, 0.012, 0.6, steel, [-1.0, 0.64, 0], 10), Math.PI / 2, 0, 0),
        contact(2.3, 1.0, [0, 0, 0], 0.6),
      ),
      [-0.1, 0, -0.45],
    ),
  );
  // A two-tread step under her feet.
  g.add(place(group(box(0.46, COUCH.step, 0.3, white, 0.015, [0, COUCH.step / 2, 0]), box(0.42, 0.012, 0.26, plinth, 0.004, [0, COUCH.step + 0.006, 0]), contact(0.65, 0.5, [0, 0, 0], 0.55)), [-0.35, 0, 0.3]));

  // Side cabinet by the couch: two drawers, a tray, a glass jar.
  g.add(
    place(
      group(
        box(0.46, 0.66, 0.42, white, 0.015, [0, 0.33, 0]),
        box(0.44, 0.003, 0.003, plinth, 0.001, [0, 0.44, 0.212]),
        box(0.44, 0.003, 0.003, plinth, 0.001, [0, 0.22, 0.212]),
        box(0.12, 0.012, 0.012, steel, 0.004, [0, 0.55, 0.218]),
        box(0.12, 0.012, 0.012, steel, 0.004, [0, 0.33, 0.218]),
        box(0.3, 0.012, 0.2, steel, 0.004, [0.02, 0.666, 0]),
        lathe([[0, 0], [0, 0.04], [0.1, 0.042], [0.105, 0.035], [0.11, 0.035]], M.glass(), [-0.12, 0.66, 0.06]),
        sphere(0.03, mat('#fbfbf9', { rough: 1, sheen: 1 }), [-0.12, 0.69, 0.06], [1, 0.8, 1]),
        cushion(0.16, 0.04, 0.12, M.fabric('#dfe6e4'), [0.08, 0.692, -0.04], 0.4),
        contact(0.66, 0.6, [0, 0, 0], 0.55),
      ),
      [-1.5, 0, -0.5],
    ),
  );

  // Privacy screen: a slim aluminium frame on two feet, frosted glass the same as the salon mirror.
  const glass = mesh(new THREE.PlaneGeometry(MIRROR.w, MIRROR.h), new THREE.MeshBasicMaterial({ color: GLASS }), false);
  const fr = 0.022;
  const screen = group(
    glass,
    box(MIRROR.w + fr * 2, fr, 0.03, steel, 0.006, [0, MIRROR.h / 2 + fr / 2, -0.016]),
    box(MIRROR.w + fr * 2, fr, 0.03, steel, 0.006, [0, -MIRROR.h / 2 - fr / 2, -0.016]),
    box(fr, MIRROR.h, 0.03, steel, 0.006, [-MIRROR.w / 2 - fr / 2, 0, -0.016]),
    box(fr, MIRROR.h, 0.03, steel, 0.006, [MIRROR.w / 2 + fr / 2, 0, -0.016]),
  );
  const leg = MIRROR.y - MIRROR.h / 2;
  for (const x of [-MIRROR.w / 2 + 0.02, MIRROR.w / 2 - 0.02]) {
    screen.add(cyl(0.012, 0.012, leg, steel, [x, -MIRROR.h / 2 - leg / 2, -0.016], 12));
    screen.add(box(0.05, 0.02, 0.36, steel, 0.008, [x, -MIRROR.y + 0.01, -0.016]));
  }
  place(screen, [1.45, MIRROR.y, -0.9]);
  g.add(screen, contact(1.3, 0.6, [1.45, 0, -0.9], 0.45));

  // The doctor's desk: a closed laptop, a lamp; a tall cabinet with grooves; a print.
  g.add(box(1.0, 0.035, 0.5, white, 0.012, [1.5, 0.742, -1.45]));
  g.add(box(0.05, 0.72, 0.46, white, 0.01, [1.03, 0.36, -1.45]), box(0.05, 0.72, 0.46, white, 0.01, [1.97, 0.36, -1.45]));
  g.add(box(0.32, 0.014, 0.22, mat('#c9cbcc', { rough: 0.3, metal: 0.8 }), 0.006, [1.42, 0.767, -1.42]));
  g.add(lathe([[0, 0], [0, 0.06], [0.01, 0.06], [0.01, 0.012], [0.32, 0.012], [0.32, 0.05], [0.36, 0.05], [0.36, 0.0]], M.plasticWhite(), [1.82, 0.76, -1.55], 32));
  g.add(contact(1.3, 0.7, [1.5, 0, -1.45], 0.45));
  g.add(box(0.8, 1.8, 0.4, white, 0.015, [-1.95, 0.9, -1.55]));
  g.add(box(0.003, 1.76, 0.003, plinth, 0.001, [-1.95, 0.9, -1.349]));
  for (const x of [-2.0, -1.9]) g.add(box(0.012, 0.22, 0.016, steel, 0.004, [x, 1.0, -1.34]));
  g.add(contact(1.0, 0.6, [-1.95, 0, -1.55], 0.5));
  g.add(place(print(0.5, 0.5, ['#eef0ee', '#c9d6d3', '#e3cdb8']), [-0.1, 1.55, BACK]));
  g.add(place(stool('#c9d4d2', 0.55), [0.75, 0, 0.35]));
  g.add(place(plant('#e6e2da', '#6f8a6a', 1.1), [2.0, 0, 1.0]));
  g.add(contact(0.6, 0.6, [0.48, 0, 0.3], 0.6));

  return {
    group: g,
    marks: { bed: new THREE.Vector3(-0.1, 0.9, -0.45), glass: new THREE.Vector3(1.45, MIRROR.y, -0.9) },
    parts: { glass },
  };
}

/** A dusk sky: deep blue-grey overhead warming to a low peach band, a far roofline. */
function duskTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  const v = g.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, '#3f4a63');
  v.addColorStop(0.55, '#66708a');
  v.addColorStop(0.8, '#b79a94');
  v.addColorStop(1, '#d9b193');
  g.fillStyle = v;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#353b4a';
  const roof = [0, 214, 18, 214, 18, 200, 44, 200, 44, 220, 70, 220, 70, 190, 96, 190, 96, 210, 128, 210, 128, 256, 0, 256];
  g.beginPath();
  for (let i = 0; i < roof.length; i += 2) g.lineTo(roof[i], roof[i + 1]);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A linen curtain: a plane with soft vertical folds. */
function curtain(w: number, h: number, color: string) {
  const geo = new THREE.PlaneGeometry(w, h, 48, 1);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setZ(i, Math.sin((x / w) * Math.PI * 2 * 4.5) * 0.025 + Math.sin((x / w) * Math.PI * 2 * 9.5 + 1) * 0.008);
  }
  geo.computeVertexNormals();
  const m = mat(color, { rough: 0.95, sheen: 0.8, opacity: 0.94, bump: 'weave', bumpScale: 0.5, repeat: [8, 8] });
  m.side = THREE.DoubleSide;
  return mesh(geo, m);
}

/** A keyboard's key layout, drawn once. */
function keysTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 170;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c4c5c7';
  g.fillRect(0, 0, 512, 170);
  g.fillStyle = '#f1f1f0';
  const rows = [14, 14, 13, 12, 10];
  rows.forEach((n, r) => {
    const kw = (512 - 16 - (n - 1) * 4) / n;
    for (let i = 0; i < n; i++) {
      g.beginPath();
      g.roundRect(8 + i * (kw + 4), 8 + r * 32, kw, 27, 4);
      g.fill();
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 20:30: home. An oak desk, a slim monitor, a lamp on, a dusk sky behind a linen curtain. */
export const SCREEN = { w: 0.62, h: 0.3875, y: 1.13, z: -1.3 };
export const DESK_TOP = 0.76;
/** Where her keyboard sits, in room coordinates. */
export const KEYS: [number, number, number] = [-0.08, DESK_TOP + 0.006, -1.13];

export function home(): Set {
  const g = roomShell({ wall: '#e9e1d7', floor: '#bfa486', wood: true, trim: '#e2d8cc', window: { x: -1.25, w: 1.3, h: 1.4, sill: 0.85 }, pane: true });
  const oak = mat('#b8936c', { rough: 0.52, clear: 0.22, clearRough: 0.45, bump: 'grain', bumpScale: 0.4, repeat: [1, 3] });
  const alu = mat('#b9bbbd', { rough: 0.34, metal: 0.85 });
  const black = mat('#141416', { rough: 0.2, clear: 0.7, clearRough: 0.15 });
  const darkMetal = M.darkMetal();

  const sky = mesh(new THREE.PlaneGeometry(1.7, 1.8), new THREE.MeshBasicMaterial({ color: '#ffffff', map: duskTexture() }), false);
  sky.position.set(-1.25, 0.85 + 0.7, BACK - 0.35);
  g.add(sky);
  g.add(place(curtain(0.5, 2.3, '#e9e0d3'), [-1.25 - 0.82, 1.2, BACK + 0.09]));
  g.add(cyl(0.008, 0.008, 1.9, darkMetal, [-1.25, 2.38, BACK + 0.1], 10).rotateZ(Math.PI / 2));

  // The desk: a 3.5 cm oak top on tapered legs with an apron.
  const T = DESK_TOP;
  g.add(box(1.5, 0.035, 0.66, oak, 0.01, [0, T - 0.0175, -1.42]));
  g.add(box(1.36, 0.06, 0.04, oak, 0.008, [0, T - 0.065, -1.72]));
  for (const [x, z] of [
    [-0.7, -1.7],
    [0.7, -1.7],
    [-0.7, -1.14],
    [0.7, -1.14],
  ])
    g.add(cyl(0.02, 0.013, T - 0.035, oak, [x, (T - 0.035) / 2, z], 14));
  g.add(contact(1.9, 1.0, [0, 0, -1.42], 0.5));
  g.add(contact(1.0, 0.45, [0, T, -1.3], 0.22));

  // The monitor: a black glass face in a slim aluminium body on a leaning stand.
  const S = SCREEN;
  g.add(box(S.w + 0.024, S.h + 0.024, 0.008, black, 0.006, [0, S.y, S.z - 0.004]));
  g.add(box(S.w + 0.024, S.h + 0.024, 0.016, alu, 0.008, [0, S.y, S.z - 0.016]));
  g.add(rot(box(0.13, 0.34, 0.014, alu, 0.006, [0, 0.93, S.z - 0.075]), 0.18, 0, 0));
  g.add(box(0.2, 0.008, 0.17, alu, 0.004, [0, T + 0.004, S.z - 0.075]));
  const screen = mesh(new THREE.PlaneGeometry(S.w, S.h), new THREE.MeshBasicMaterial({ color: '#fbfbfa' }), false);
  screen.position.set(0, S.y, S.z + 0.0005);
  g.add(screen);
  // Keyboard and trackpad.
  const keysM = new THREE.MeshStandardMaterial({ map: keysTexture(), roughness: 0.5, metalness: 0.3 });
  g.add(box(0.34, 0.008, 0.115, alu, 0.003, [KEYS[0], T + 0.004, KEYS[2]]));
  g.add(place(rot(mesh(new THREE.PlaneGeometry(0.325, 0.105), keysM, false), -Math.PI / 2, 0, 0), [KEYS[0], T + 0.0085, KEYS[2]]));
  g.add(box(0.13, 0.005, 0.1, alu, 0.002, [KEYS[0] + 0.26, T + 0.0025, KEYS[2]]));
  // A notebook with a pen, a mug.
  const notebook = group(box(0.15, 0.01, 0.21, mat('#5d6b78', { rough: 0.85 }), 0.003, [0, 0.005, 0]), box(0.144, 0.006, 0.204, M.paper(), 0.002, [0.002, 0.012, 0]), rot(cyl(0.004, 0.004, 0.14, mat('#2a2a2c', { rough: 0.3 }), [0.03, 0.019, 0], 10), Math.PI / 2, 0, 0));
  g.add(place(notebook, [0.5, T, -1.25], 0.25));
  const mugM = mat('#e9e3da', { rough: 0.35, clear: 0.6 });
  g.add(lathe([[0, 0], [0, 0.036], [0.004, 0.04], [0.085, 0.04], [0.09, 0.041], [0.09, 0.037], [0.008, 0.036]], mugM, [0.38, T, -1.55], 32));
  g.add(place(rot(mesh(new THREE.TorusGeometry(0.022, 0.006, 10, 24, Math.PI), mugM), 0, 0, -Math.PI / 2), [0.418 + 0.004, T + 0.045, -1.55]));

  // The lamp: a weighted base, a bent arm, a dark shade with a warm diffuser. It is the room's light now.
  const shade = mat('#262524', { rough: 0.4, metal: 0.3 });
  shade.side = THREE.DoubleSide;
  const LX = -0.64;
  g.add(puck(0.075, 0.022, darkMetal, [LX, T + 0.011, -1.6], 0.006));
  g.add(tube([[LX, T + 0.02, -1.6], [LX - 0.005, 1.02, -1.62], [LX, 1.22, -1.54], [LX, 1.24, -1.49]], 0.006, darkMetal, 32));
  g.add(lathe([[-0.1, 0.11], [-0.07, 0.1], [-0.02, 0.07], [0.02, 0.035], [0.035, 0.02]], shade, [LX, 1.24, -1.47], 40));
  g.add(place(rot(mesh(new THREE.CircleGeometry(0.07, 32), new THREE.MeshBasicMaterial({ color: '#ffe4bd', side: THREE.DoubleSide }), false), Math.PI / 2, 0, 0), [LX, 1.17, -1.47]));
  g.add(contact(0.3, 0.3, [LX, T, -1.6], 0.4));
  const lamp = new THREE.PointLight('#ffc98f', 0, 4.5, 1.6);
  lamp.position.set(LX, 1.12, -1.45);
  g.add(lamp);

  // A linen armchair, shelves with books, a rug: a room someone lives in.
  const linen = M.fabric('#d9cdbd');
  g.add(
    place(
      group(
        cushion(0.8, 0.16, 0.7, linen, [0, 0.32, 0.02], 0.4),
        cushion(0.84, 0.2, 0.76, linen, [0, 0.16 + 0.05, 0], 0.35),
        rot(cushion(0.78, 0.5, 0.16, linen, [0, 0.62, -0.3], 0.42), -0.12, 0, 0),
        cushion(0.14, 0.34, 0.76, linen, [-0.38, 0.47, 0], 0.45),
        cushion(0.14, 0.34, 0.76, linen, [0.38, 0.47, 0], 0.45),
        ...[-0.32, 0.32].flatMap((x) => [cyl(0.018, 0.012, 0.11, oak, [x, 0.055, 0.28], 12), cyl(0.018, 0.012, 0.11, oak, [x, 0.055, -0.28], 12)]),
        contact(1.1, 1.0, [0, 0, 0], 0.6),
      ),
      [1.55, 0, 0.35],
      -0.5,
    ),
  );
  for (let i = 0; i < 3; i++) g.add(box(0.9, 0.03, 0.26, oak, 0.008, [1.6, 1.25 + i * 0.38, BACK + 0.13]));
  ['#b2563d', '#d6cbbd', '#5d6b78', '#e5ddd2', '#8a6a52'].forEach((c, i) =>
    g.add(box(0.05, 0.24 - (i % 2) * 0.04, 0.18, mat(c, { rough: 0.9 }), 0.006, [1.25 + i * 0.065, 1.385 - (i % 2) * 0.02, BACK + 0.13])),
  );
  g.add(rot(box(0.05, 0.22, 0.18, mat('#c9b9a6', { rough: 0.9 }), 0.006, [1.6, 1.37, BACK + 0.13]), 0, 0, -0.3));
  g.add(lathe([[0, 0], [0, 0.05], [0.08, 0.06], [0.16, 0.035], [0.2, 0.025], [0.21, 0.03]], mat('#e8e2d8', { rough: 0.5, clear: 0.5 }), [1.9, 1.265, BACK + 0.13]));
  g.add(place(print(0.36, 0.26, ['#ece6dc', '#c79b84', '#5d6b78']), [1.62, 2.03 + 0.12, BACK + 0.03]));
  g.add(place(rug('#d9cbb8', 2.6, 1.8), [0.3, 0, 0]));
  g.add(place(chair({ fabric: '#e7ddd0', wood: oak }), [-0.15, 0, -0.62], Math.PI));
  g.add(place(plant('#d8cfc4', '#5b7357', 1.2), [-2.0, 0, 0.6]));

  return {
    group: g,
    marks: { screen: new THREE.Vector3(0, SCREEN.y, SCREEN.z) },
    parts: { screen, lamp, sky },
  };
}

export { sphere };
