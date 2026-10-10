import { clamp, easeInOutSine, lerp, range } from '../../lib/math';
import type { Pose } from './figure';
import { T } from './timeline';

/**
 * The 3D side of the timeline: camera, light and poses as pure functions of p.
 * Rooms stand in a row along x; the camera is a target, a heading and the size
 * of what it should frame, so the same keys work on any aspect ratio.
 */

export const ROOM_X = { nails: 0, pilates: 6, hair: 12, clinic: 18, home: 24 } as const;
export const PILLAR_AT: [number, number, number] = [3, 0, 3.3];

type V3 = [number, number, number];
interface Key {
  p: number;
  t: V3;
  /** Heading in degrees: 0 looks down -Z, positive swings the camera toward +X. */
  yaw: number;
  /** Degrees above the target. */
  pitch: number;
  /** Width and height (m) to keep in frame on a landscape screen. */
  fit: [number, number];
  /** On a portrait screen: what to keep in frame, and an optional different heading. */
  tall?: [number, number];
  tallYaw?: number;
  /** On a portrait screen: a different point to aim at. */
  tallT?: V3;
}

const k = (p: number, t: V3, yaw: number, pitch: number, fit: [number, number], tall?: [number, number], tallYaw?: number, tallT?: V3): Key => ({ p, t, yaw, pitch, fit, tall, tallYaw, tallT });

/**
 * Before the cut: the nail studio, the pillar wipe, Pilates, the crane, the salon, into the mirror.
 * Portrait screens get their own choreography: angles that stack the action in depth instead of width.
 */
const A: Key[] = [
  k(0, [-0.1, 0.92, 0.12], 12, 10, [2.5, 1.4], [1.3, 2.0], -28, [-0.08, 0.92, 0.15]),
  k(0.075, [-0.2, 0.84, 0.2], 24, 26, [1.05, 0.59], [0.62, 0.95], -18, [-0.22, 0.84, 0.22]),
  k(0.135, [0.15, 0.95, 0.15], 6, 9, [3.0, 1.7], [1.4, 2.2], -10, [0.05, 1.0, 0.2]),
  k(0.185, [3.0, 1.1, 0.4], 0, 6, [4.6, 2.6], [1.2, 2.6], 0, [3.0, 1.2, 0.5]),
  k(0.225, [6.05, 0.72, 0.25], -10, 14, [3.0, 1.7], [1.4, 1.8], -30, [6.1, 0.62, 0.25]),
  k(0.28, [6.15, 0.62, 0.3], -24, 20, [1.95, 1.08], [1.15, 1.5], -28, [6.25, 0.62, 0.25]),
  k(0.33, [6.3, 0.85, 0.15], -8, 36, [3.4, 1.9], [1.5, 2.2], -20, [6.25, 0.7, 0.2]),
  k(0.375, [9.0, 0.3, 0.05], 0, 86, [6.6, 3.7], [2.8, 5.0], 0, [11.5, 0.3, 0.2]),
  k(0.42, [12.1, 1.12, 0.32], 16, 16, [2.6, 1.46], [1.2, 2.0], 20, [12.0, 1.1, 0.5]),
  k(0.475, [12.0, 1.32, 0.42], 48, 8, [1.25, 0.7], [0.75, 1.0]),
  k(0.53, [12.25, 1.42, -0.8], 18, 3, [1.3, 0.73], [0.6, 0.9], 14),
  k(T.cut, [12.1, 1.45, -1.765], 0, 0, [0.86, 0.48], [0.32, 0.64], 0),
];

/** After the cut: out of the clinic screen, the clinic, the sunset glide, home, into her monitor. */
const B: Key[] = [
  k(T.cut, [19.45, 1.45, -0.9], 0, 0, [0.86, 0.48], [0.32, 0.64], 0),
  k(0.592, [18.55, 1.15, -0.45], -4, 7, [2.3, 1.3], [1.3, 2.0], 0, [18.1, 1.0, -0.2]),
  k(0.655, [18.0, 1.0, -0.3], -14, 12, [2.4, 1.35], [1.1, 1.9], -20, [17.95, 1.0, -0.1]),
  k(0.705, [18.6, 0.6, -0.2], -4, 46, [5.6, 3.15], [2.0, 3.4], -4, [18.4, 0.6, -0.2]),
  k(0.74, [21.0, 0.3, -0.1], 0, 80, [6.6, 3.7], [2.8, 5.0], 0, [22.9, 0.3, -0.2]),
  k(0.775, [23.95, 1.0, -0.6], 10, 13, [2.9, 1.63], [1.3, 2.1], 14, [23.85, 1.0, -0.7]),
  k(0.815, [24.0, 1.12, -1.05], 18, 8, [1.4, 0.79], [0.8, 1.1], 24),
  k(0.85, [24.0, 1.13, -1.3], 14, 1, [1.02, 0.57], [0.7, 0.9], 20),
  k(0.9, [24.0, 1.13, -1.3], 9, 0.5, [0.94, 0.53], [0.68, 0.88], 14),
  k(1, [24.0, 1.13, -1.3], 8, 0.5, [0.92, 0.52], [0.68, 0.88], 13),
];

/** Vertical field of view. Portrait screens open it up so the horizontal view stays a normal lens, not a telephoto. */
const fovFor = (aspect: number) => (aspect < 1 ? 44 : 30);

/** Camera distance that fits `fit` on a screen of this aspect. */
function distFor(fit: [number, number], aspect: number) {
  const tv = Math.tan((fovFor(aspect) / 2) * (Math.PI / 180));
  const th = tv * aspect;
  return Math.max(fit[0] / (2 * th), fit[1] / (2 * tv));
}

type Vec = number[];
/** `through` marks path ends the camera passes through at speed (the cut) rather than settling on. */
function sample(keys: Key[], p: number, aspect: number, through: { start?: boolean; end?: boolean } = {}): Vec {
  const tall = aspect < 1;
  const v = keys.map((q) => {
    const fit = tall && q.tall ? q.tall : q.fit;
    const yaw = tall && q.tallYaw !== undefined ? q.tallYaw : q.yaw;
    const t = tall && q.tallT ? q.tallT : q.t;
    return [t[0], t[1], t[2], yaw, q.pitch, Math.log(distFor(fit, aspect))];
  });
  const ps = keys.map((q) => q.p);
  if (p <= ps[0]) return v[0];
  const n = ps.length - 1;
  if (p >= ps[n]) return v[n];
  let i = 0;
  while (p > ps[i + 1]) i++;
  const h = ps[i + 1] - ps[i];
  const s = (p - ps[i]) / h;
  // Cubic Hermite with finite-difference tangents: smooth through every key, no stops between them.
  const tan = (j: number) => {
    if (j === 0) return through.start ? v[0].map((_, c) => (v[1][c] - v[0][c]) / (ps[1] - ps[0])) : v[0].map(() => 0);
    if (j === n) return through.end ? v[n].map((_, c) => (v[n][c] - v[n - 1][c]) / (ps[n] - ps[n - 1])) : v[n].map(() => 0);
    return v[j].map((_, c) => (v[j + 1][c] - v[j - 1][c]) / (ps[j + 1] - ps[j - 1]));
  };
  const m0 = tan(i);
  const m1 = tan(i + 1);
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  return v[i].map((a, c) => h00 * a + h10 * h * m0[c] + h01 * v[i + 1][c] + h11 * h * m1[c]);
}

export interface Cam {
  pos: V3;
  target: V3;
  fov: number;
}

export function cameraAt(p: number, aspect: number): Cam {
  const [x, y, z, yaw, pitch, ld] = p < T.cut ? sample(A, p, aspect, { end: true }) : sample(B, p, aspect, { start: true });
  const d = Math.exp(ld);
  const ya = (yaw * Math.PI) / 180;
  const pa = (pitch * Math.PI) / 180;
  return {
    target: [x, y, z],
    pos: [x + d * Math.sin(ya) * Math.cos(pa), y + d * Math.sin(pa), z + d * Math.cos(ya) * Math.cos(pa)],
    fov: fovFor(aspect),
  };
}

// ── Light: one sun that is the time of day ────────────────────────────
interface LightKey {
  m: number;
  dir: V3;
  sun: string;
  sunI: number;
  sky: string;
  ground: string;
  skyI: number;
  env: number;
  lamp: number;
  exposure: number;
}
const LIGHT: LightKey[] = [
  { m: 540, dir: [4, 6.5, 5], sun: '#fff1dc', sunI: 2.2, sky: '#fbf7f1', ground: '#e4dad0', skyI: 1.0, env: 0.32, lamp: 0, exposure: 1 },
  { m: 690, dir: [2, 8, 4.5], sun: '#fff6ea', sunI: 2.35, sky: '#f9f8f4', ground: '#e2dcd2', skyI: 1.0, env: 0.32, lamp: 0, exposure: 1 },
  { m: 830, dir: [-0.6, 9, 3.8], sun: '#fffaf3', sunI: 2.35, sky: '#f8f8f6', ground: '#e3ddd5', skyI: 0.98, env: 0.32, lamp: 0, exposure: 1 },
  { m: 975, dir: [-3.6, 6, 4.2], sun: '#fff0dc', sunI: 2.1, sky: '#f2f4f4', ground: '#dcdcd6', skyI: 0.96, env: 0.3, lamp: 0, exposure: 1 },
  { m: 1110, dir: [-6, 2.6, 3.4], sun: '#ffb877', sunI: 2.0, sky: '#efe0d0', ground: '#d9c7b4', skyI: 0.8, env: 0.26, lamp: 0.6, exposure: 1 },
  { m: 1230, dir: [-5, 3.2, 4], sun: '#93a6d1', sunI: 0.42, sky: '#c4cbd9', ground: '#a9a19a', skyI: 0.58, env: 0.18, lamp: 3.2, exposure: 1.05 },
];

export interface Light extends Omit<LightKey, 'm' | 'sun' | 'sky' | 'ground'> {
  sun: [string, string, number];
  sky: [string, string, number];
  ground: [string, string, number];
}

/** Light at a clock minute. Colours come back as pairs plus a mix factor, so the engine can blend in linear space. */
export function lightAt(minute: number): Light {
  let i = 0;
  while (i < LIGHT.length - 2 && minute > LIGHT[i + 1].m) i++;
  const a = LIGHT[i];
  const b = LIGHT[i + 1];
  const t = easeInOutSine(clamp((minute - a.m) / (b.m - a.m)));
  const L = (x: number, y: number) => lerp(x, y, t);
  return {
    dir: [L(a.dir[0], b.dir[0]), L(a.dir[1], b.dir[1]), L(a.dir[2], b.dir[2])],
    sun: [a.sun, b.sun, t],
    sunI: L(a.sunI, b.sunI),
    sky: [a.sky, b.sky, t],
    ground: [a.ground, b.ground, t],
    skyI: L(a.skyI, b.skyI),
    env: L(a.env, b.env),
    lamp: L(a.lamp, b.lamp),
    exposure: L(a.exposure, b.exposure),
  };
}

// ── Poses ─────────────────────────────────────────────────────────────
// Bodies are posed from the spine out; hands and feet are then placed on what they touch.

/** Seated: hips this far above the seat surface, as a root offset (`at.y`). */
const seated = (seat: number) => seat + 0.11 - 0.92;

export const SIT_BASE: Pose = {
  lHip: [-86, 0, -3],
  rHip: [-86, 0, 3],
  lKn: [86, 0, 0],
  rKn: [86, 0, 0],
};

const wave = (p: number, a: number, b: number, cycles: number) => Math.sin(range(p, a, b) * Math.PI * 2 * cycles);

/** A point in a figure's own frame (x left, z forward) placed in the world. */
const local = (at: V3, turn: number, x: number, y: number, z: number): V3 => {
  const r = (turn * Math.PI) / 180;
  return [at[0] + x * Math.cos(r) + z * Math.sin(r), y, at[2] - x * Math.sin(r) + z * Math.cos(r)];
};

export type Room = keyof typeof ROOM_X;
export interface Cast {
  /** Which room she is in. She moves between rooms only while the camera can't see either. */
  room: Room;
  her: Pose;
  hair: 'long' | 'bob';
  tech: Pose;
  stylist: Pose;
  doctor: Pose;
  /** Pilates carriage offset along x, in room coordinates. */
  carriage: number;
}

/** Palms down: the forearm rolls so the palm faces the surface it rests on. */
const PRONE_L: V3 = [8, -90, 0];
const PRONE_R: V3 = [8, 90, 0];

export function castAt(p: number): Cast {
  const room: Room = p < 0.185 ? 'nails' : p < 0.375 ? 'pilates' : p < T.cut ? 'hair' : p < 0.74 ? 'clinic' : 'home';
  const X = ROOM_X[room];
  let her: Pose;
  let carriage = 0;

  if (room === 'nails') {
    // Sitting tall, leaning in a little; right forearm on the cushion, left hand in her lap.
    const at: V3 = [X - 0.72, seated(0.49), 0.14];
    her = {
      ...SIT_BASE,
      at,
      turn: 90,
      spine: [4, 0, 0],
      chest: [6, -6, 0],
      neck: [4, 0, 0],
      head: [12, -10, 0],
      lWr: [0, -70, 0],
      rWr: [-4, 90, 0],
      curl: [0.4, 0.3],
      ik: {
        rHand: { to: [X - 0.37, 0.826, 0.185], pole: [-0.6, -1, -0.3] },
        lHand: { to: [X - 0.47, 0.66, 0.1], pole: [1, -0.6, -0.6] },
        lFoot: { to: [X - 0.3, 0.085, 0.06] },
        rFoot: { to: [X - 0.27, 0.085, 0.24] },
      },
    };
  } else if (room === 'pilates') {
    // Footwork: the carriage rides out and back, the legs follow the footbar; arms long beside her.
    const c = 0.5 - 0.5 * Math.cos(range(p, 0.19, 0.37) * Math.PI * 2 * 2.5);
    const hipX = lerp(0.4, 0.17, c);
    carriage = hipX - 0.05;
    const hipY = 0.585;
    const rz = 0.25;
    her = {
      at: [X + hipX, hipY - 0.92, rz],
      turn: 90,
      root: [-90, 0, 0],
      spine: [-4, 0, 0],
      chest: [-4, 0, 0],
      neck: [6, 0, 0],
      head: [4, 0, 0],
      lAn: [38, 0, 0],
      rAn: [38, 0, 0],
      lWr: PRONE_L,
      rWr: PRONE_R,
      curl: [0.15, 0.15],
      ik: {
        lFoot: { to: [X + 0.98 - 0.035, 0.75, rz - 0.075], pole: [0, 1, 0] },
        rFoot: { to: [X + 0.98 - 0.035, 0.75, rz + 0.075], pole: [0, 1, 0] },
        lHand: { to: [X + hipX + 0.1, 0.495, rz - 0.2], pole: [0, 1, 0] },
        rHand: { to: [X + hipX + 0.1, 0.495, rz + 0.2], pole: [0, 1, 0] },
      },
    };
  } else if (room === 'hair') {
    // Upright in the chair, chin slightly down for the cut; hands on the armrests, feet on the footrest.
    const at: V3 = [X + 0.1, seated(0.58), 0.27];
    her = {
      ...SIT_BASE,
      at,
      turn: 180,
      spine: [-2, 0, 0],
      chest: [2, 0, 0],
      head: [8, 0, 0],
      lWr: PRONE_L,
      rWr: PRONE_R,
      curl: [0.3, 0.3],
      ik: {
        lHand: { to: [X + 0.1 - 0.27, 0.79, 0.12], pole: [1, -0.5, -0.8] },
        rHand: { to: [X + 0.1 + 0.27, 0.79, 0.12], pole: [-1, -0.5, -0.8] },
        lFoot: { to: [X + 0.1 - 0.085, 0.2, -0.13] },
        rFoot: { to: [X + 0.1 + 0.085, 0.2, -0.13] },
      },
    };
  } else if (room === 'clinic') {
    // On the edge of the couch, feet on the step, turned toward the doctor and listening.
    const nod = wave(p, 0.6, 0.72, 2) * 2;
    const at: V3 = [X - 0.35, seated(0.71), -0.2];
    her = {
      ...SIT_BASE,
      at,
      turn: 16,
      spine: [-2, 0, 0],
      chest: [4, 6, 0],
      neck: [0, 10, 0],
      head: [nod + 2, 14, 0],
      lWr: PRONE_L,
      rWr: PRONE_R,
      curl: [0.35, 0.4],
      ik: {
        lHand: { to: local(at, 16, 0.25, 0.735, 0.02), pole: [1, -0.4, -1] },
        rHand: { to: local(at, 16, -0.07, 0.85, 0.2), pole: [-1, -0.2, -0.5] },
        lFoot: { to: local(at, 16, 0.09, 0.37, 0.43) },
        rFoot: { to: local(at, 16, -0.08, 0.37, 0.45) },
      },
    };
  } else {
    // At the desk, both hands on the keyboard, feet flat; typing is a whisper in the wrists.
    const t = wave(p, 0.74, 0.86, 7) * 0.004;
    const at: V3 = [X - 0.15, seated(0.49), -0.58];
    her = {
      ...SIT_BASE,
      at,
      turn: 180,
      spine: [6, 0, 0],
      chest: [6, 0, 0],
      head: [6, 0, 0],
      lWr: [12, -84, 0],
      rWr: [12, 84, 0],
      curl: [0.32, 0.32],
      ik: {
        lHand: { to: [X - 0.08 + 0.09, 0.79 + t, -1.05], pole: [1, -0.6, -0.6] },
        rHand: { to: [X - 0.08 - 0.09, 0.79 - t, -1.05], pole: [-1, -0.6, -0.6] },
        lFoot: { to: [X - 0.15 + 0.1, 0.085, -0.97] },
        rFoot: { to: [X - 0.15 - 0.1, 0.085, -1.0] },
      },
    };
  }

  // The technician leans across the table: one hand steadies her fingers, the other paints.
  const brush = wave(p, 0, 0.2, 5) * 0.006;
  const techAt: V3 = [ROOM_X.nails + 0.58, seated(0.535), 0.12];
  const tech: Pose = {
    ...SIT_BASE,
    at: techAt,
    turn: -90,
    spine: [12, 0, 0],
    chest: [14, 8, 0],
    neck: [8, 0, 0],
    head: [20, 6, 0],
    lWr: [-10, 80, 0],
    rWr: [30, 60, 0],
    curl: [0.3, 0.75],
    ik: {
      lHand: { to: [ROOM_X.nails - 0.09, 0.8, 0.205], pole: [1, -0.7, -0.3] },
      rHand: { to: [ROOM_X.nails - 0.1, 0.9 + brush, 0.15], pole: [-1, -0.8, -0.2] },
      lFoot: { to: [ROOM_X.nails + 0.3, 0.085, 0.2] },
      rFoot: { to: [ROOM_X.nails + 0.32, 0.085, 0.02] },
    },
  };

  // The stylist stands behind her shoulder: comb hand lifting a section, scissors hand at the ends.
  const snip = wave(p, 0.38, 0.56, 6) * 0.008;
  const stylistAt: V3 = [ROOM_X.hair - 0.24, 0, 0.72];
  const stylist: Pose = {
    at: stylistAt,
    turn: 146,
    spine: [4, 0, 0],
    chest: [6, 0, 0],
    head: [16, -4, 0],
    lHip: [-4, 0, 2],
    rHip: [4, 0, -2],
    lKn: [6, 0, 0],
    lWr: [0, -60, 0],
    rWr: [0, 70, 0],
    curl: [0.65, 0.6],
    ik: {
      lHand: { to: [ROOM_X.hair + 0.0, 1.36, 0.31], pole: [1, -0.8, -0.3] },
      rHand: { to: [ROOM_X.hair - 0.02 + snip, 1.26, 0.34], pole: [-1, -0.9, -0.2] },
    },
  };

  // The doctor: an easy stance, tablet in the left hand at waist height, right hand relaxed.
  const docAt: V3 = [ROOM_X.clinic + 0.34, 0, 0.34];
  const doctor: Pose = {
    at: docAt,
    turn: -128,
    spine: [2, 0, 0],
    chest: [3, -4, 0],
    head: [12, 6, 0],
    lHip: [-3, 0, 3],
    rHip: [5, 0, -2],
    rKn: [8, 0, 0],
    rSh: [-6, 0, -5],
    rEl: [-22, 0, 0],
    rWr: [0, 30, 0],
    lWr: [0, -10, -10],
    curl: [0.5, 0.3],
    ik: { lHand: { to: local(docAt, -128, 0.1, 1.0, 0.27), pole: [1, -0.8, -0.4] } },
  };

  return { room, her, hair: p < 0.487 ? 'long' : 'bob', tech, stylist, doctor, carriage };
}
