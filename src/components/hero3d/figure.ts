import * as THREE from 'three';
import { limbLoft, loft, mat, sphere, tube, type Ring } from './kit';

/**
 * A faceless, softly modelled figure. Every part is a lofted form (elliptical
 * sections with offsets) so shoulders slope into the neck, calves and forearms
 * taper, and joints round over instead of meeting as cylinders.
 * The figure faces +Z. Poses are joint rotations in degrees.
 */

export interface Look {
  skin: string;
  hair: string;
  top: string;
  bottom: string;
  shoes: string;
  /** 'long' = low ponytail, 'bob' = jaw-length cut, 'bun', 'short'. */
  hairStyle: 'long' | 'bob' | 'bun' | 'short';
  /** A long coat over the top (the doctor). */
  coat?: string;
  /** Sleeve length: 'long' to the wrist, 'mid' just below the elbow. */
  sleeve?: 'long' | 'mid';
  stethoscope?: boolean;
  scale?: number;
}

type J = 'root' | 'spine' | 'chest' | 'neck' | 'head' | 'lSh' | 'lEl' | 'lWr' | 'rSh' | 'rEl' | 'rWr' | 'lHip' | 'lKn' | 'lAn' | 'rHip' | 'rKn' | 'rAn';
type V3 = [number, number, number];
/** A contact point in world space, and which way the elbow or knee should point (figure space, from the shoulder or hip). */
export interface Reach {
  to: V3;
  pole?: V3;
}
export type Pose = Partial<Record<J, [number, number, number]>> & {
  at?: [number, number, number];
  turn?: number;
  /** Finger curl, left and right: 0 open, 1 loosely closed. */
  curl?: [number, number];
  /** Wrists and ankles placed exactly (hands on a cushion, feet on a footbar); overrides the shoulder/elbow or hip/knee angles. */
  ik?: { lHand?: Reach; rHand?: Reach; lFoot?: Reach; rFoot?: Reach };
};

export interface Figure {
  root: THREE.Group;
  joints: Record<J, THREE.Object3D>;
  hair: { long: THREE.Object3D; bob: THREE.Object3D } | null;
  /** Something held in the right hand (scissors, tablet). */
  rightHand: THREE.Object3D;
  leftHand: THREE.Object3D;
  pose(p: Pose): void;
}

/** Standing hip height; seated poses set `at.y` = hips above the floor minus this. */
export const HIP = 0.92;
const D = Math.PI / 180;

export function makeFigure(look: Look): Figure {
  const skin = mat(look.skin, { rough: 0.58, sheen: 0.18, spec: 0.35 });
  const top = mat(look.top, { rough: 0.92, sheen: 0.55, bump: 'knit', bumpScale: 0.35, repeat: [6, 6] });
  const bottom = mat(look.bottom, { rough: 0.88, sheen: 0.4, bump: 'twill', bumpScale: 0.3, repeat: [5, 5] });
  const shoes = mat(look.shoes, { rough: 0.5, clear: 0.2, spec: 0.6 });
  const hairM = mat(look.hair, { rough: 0.46, sheen: 0.8, spec: 0.55, bump: 'strand', bumpScale: 0.6, repeat: [3, 1] });
  hairM.side = THREE.DoubleSide;
  const coat = look.coat ? mat(look.coat, { rough: 0.86, sheen: 0.45, bump: 'twill', bumpScale: 0.15, repeat: [4, 4] }) : null;
  const sleeveM = coat ?? top;

  const j = (name: J, parent: THREE.Object3D, at: [number, number, number]) => {
    const o = new THREE.Group();
    o.name = name;
    o.position.set(...at);
    parent.add(o);
    return o;
  };

  const root = new THREE.Group();
  const scaleG = new THREE.Group();
  scaleG.scale.setScalar(look.scale ?? 1);
  root.add(scaleG);
  const hips = j('root', scaleG, [0, HIP, 0]);

  // Pelvis: trousers, glutes slightly back, the waist tucked under the top's hem.
  hips.add(
    loft(
      [
        { y: -0.095, rx: 0.13, rz: 0.088, oz: -0.012 },
        { y: -0.055, rx: 0.158, rz: 0.106, oz: -0.018 },
        { y: 0.0, rx: 0.148, rz: 0.094, oz: -0.01 },
        { y: 0.07, rx: 0.126, rz: 0.078, oz: -0.004 },
        { y: 0.11, rx: 0.118, rz: 0.074 },
      ],
      bottom,
      { caps: [true, false], cap: 0.25 },
    ),
  );

  const spine = j('spine', hips, [0, 0.09, 0]);
  // Abdomen: the top's lower half, its hem sitting just proud of the trousers.
  spine.add(
    loft(
      [
        { y: -0.13, rx: 0.178, rz: 0.126, oz: -0.02 },
        { y: -0.1, rx: 0.166, rz: 0.114, oz: -0.014 },
        { y: -0.04, rx: 0.143, rz: 0.095, oz: -0.006 },
        { y: 0.05, rx: 0.132, rz: 0.088, oz: 0.004 },
        { y: 0.13, rx: 0.137, rz: 0.092, oz: 0.006 },
      ],
      top,
      { caps: [false, false] },
    ),
  );

  const chest = j('chest', spine, [0, 0.17, 0]);
  // Chest to shoulders: the shoulder line is wide, then slopes in to the neck.
  const chestRings: Ring[] = [
    { y: -0.08, rx: 0.128, rz: 0.08, oz: 0.014 },
    { y: 0.02, rx: 0.148, rz: 0.1, oz: 0.016 },
    { y: 0.085, rx: 0.156, rz: 0.098, oz: 0.012 },
    { y: 0.135, rx: 0.164, rz: 0.086, oz: -0.004 },
    { y: 0.175, rx: 0.118, rz: 0.066, oz: -0.012 },
    { y: 0.205, rx: 0.058, rz: 0.05, oz: -0.006 },
  ];
  chest.add(loft(chestRings, top, { caps: [false, false] }));

  if (coat) {
    // The coat hangs from the shoulders to just above the knee, open at the hem.
    chest.add(
      loft(
        [
          { y: -0.6, rx: 0.192, rz: 0.13, oz: 0.004 },
          { y: -0.45, rx: 0.184, rz: 0.124 },
          { y: -0.3, rx: 0.176, rz: 0.118, oz: -0.004 },
          { y: -0.16, rx: 0.164, rz: 0.11, oz: 0.004 },
          { y: -0.02, rx: 0.15, rz: 0.104, oz: 0.01 },
          { y: 0.09, rx: 0.164, rz: 0.104, oz: 0.012 },
          { y: 0.14, rx: 0.168, rz: 0.09, oz: -0.004 },
          { y: 0.18, rx: 0.124, rz: 0.072, oz: -0.012 },
          { y: 0.21, rx: 0.07, rz: 0.06, oz: -0.008 },
        ],
        coat,
        { caps: [false, false] },
      ),
    );
    // The front opening and a breast pocket: one dark seam, one small edge.
    const seam = mat('#d9d9d4', { rough: 0.9 });
    const placket = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.66, 0.004), seam);
    placket.position.set(0, -0.26, 0.122);
    placket.rotation.x = -0.02;
    chest.add(placket);
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.004, 0.004), seam);
    pocket.position.set(-0.075, 0.07, 0.112);
    chest.add(pocket);
  }

  // Neck and head.
  const neck = j('neck', chest, [0, 0.19, -0.008]);
  neck.add(
    loft(
      [
        { y: -0.05, rx: 0.052, rz: 0.05 },
        { y: 0.015, rx: 0.044, rz: 0.045, oz: 0.004 },
        { y: 0.07, rx: 0.045, rz: 0.047, oz: 0.006 },
      ],
      skin,
      { caps: [false, false], seg: 20 },
    ),
  );
  const head = j('head', neck, [0, 0.045, 0.008]);
  head.add(
    loft(
      [
        { y: 0.008, rx: 0.03, rz: 0.028, oz: 0.03 },
        { y: 0.03, rx: 0.052, rz: 0.058, oz: 0.016 },
        { y: 0.075, rx: 0.066, rz: 0.08, oz: 0.006 },
        { y: 0.125, rx: 0.073, rz: 0.091, oz: -0.004 },
        { y: 0.175, rx: 0.069, rz: 0.087, oz: -0.012 },
        { y: 0.208, rx: 0.044, rz: 0.054, oz: -0.016 },
      ],
      skin,
      { cap: 1, seg: 32, caps: [false, true] },
    ),
  );
  // A suggestion of a nose and ears gives the head its direction; the face stays blank.
  head.add(sphere(0.012, skin, [0, 0.085, 0.091], [0.75, 1.6, 0.9]));
  for (const s of [1, -1]) head.add(sphere(0.018, skin, [0.068 * s, 0.1, -0.006], [0.45, 1.25, 0.85]));

  let hair: Figure['hair'] = null;
  // Hair sits a few millimetres off the skull, swept back from a hairline at the top of the forehead.
  const capRings: Ring[] = [
    { y: 0.06, rx: 0.07, rz: 0.06, oz: -0.04 },
    { y: 0.11, rx: 0.081, rz: 0.086, oz: -0.03 },
    { y: 0.155, rx: 0.08, rz: 0.093, oz: -0.018 },
    { y: 0.188, rx: 0.077, rz: 0.091, oz: -0.014 },
  ];
  if (look.hairStyle === 'long' || look.hairStyle === 'bob') {
    const long = new THREE.Group();
    long.add(loft(capRings, hairM, { caps: [false, true] }));
    // Gathered low at the nape, then a tail that falls between the shoulder blades.
    long.add(sphere(0.03, hairM, [0, 0.07, -0.1], [1.1, 0.9, 0.9]));
    const tail = limbLoft(
      [
        [0, 0.028, 0.024],
        [0.05, 0.036, 0.03, -0.004],
        [0.14, 0.032, 0.026, -0.008],
        [0.24, 0.02, 0.016, -0.004],
        [0.29, 0.008, 0.007],
      ],
      hairM,
      { seg: 18 },
    );
    tail.position.set(0, 0.07, -0.108);
    tail.rotation.x = 0.18;
    long.add(tail);
    const bob = new THREE.Group();
    // The cut: fuller at the sides, ending at the jaw with a slight turn under.
    bob.add(
      loft(
        [
          { y: 0.004, rx: 0.074, rz: 0.06, oz: -0.042 },
          { y: 0.022, rx: 0.088, rz: 0.074, oz: -0.036 },
          { y: 0.08, rx: 0.093, rz: 0.084, oz: -0.03 },
          { y: 0.13, rx: 0.088, rz: 0.094, oz: -0.016 },
          { y: 0.17, rx: 0.083, rz: 0.097, oz: -0.01 },
          { y: 0.198, rx: 0.079, rz: 0.094, oz: -0.012 },
        ],
        hairM,
        { caps: [false, true] },
      ),
    );
    head.add(long, bob);
    bob.visible = look.hairStyle === 'bob';
    long.visible = look.hairStyle === 'long';
    hair = { long, bob };
  } else {
    head.add(loft(capRings.map((r) => (look.hairStyle === 'short' ? { ...r, rx: r.rx * 0.98, rz: r.rz * 0.97 } : r)), hairM, { caps: [false, true] }));
    if (look.hairStyle === 'bun') head.add(sphere(0.046, hairM, [0, 0.19, -0.088], [1, 0.92, 0.9]));
  }

  if (look.stethoscope) {
    const st = mat('#2b2d30', { rough: 0.35, clear: 0.4 });
    chest.add(
      tube(
        [
          [-0.035, 0.08, 0.1],
          [-0.06, 0.16, 0.06],
          [0, 0.205, -0.06],
          [0.06, 0.16, 0.06],
          [0.035, 0.07, 0.105],
        ],
        0.005,
        st,
        40,
      ),
    );
    chest.add(sphere(0.012, mat('#c8c9c7', { rough: 0.3, metal: 0.8 }), [0.035, 0.06, 0.108]));
  }

  // Arms: deltoid rounding into the upper arm, a tapered forearm, a real hand.
  const hands: { l: (c: number) => void; r: (c: number) => void } = { l: () => {}, r: () => {} };
  const handGroups: Record<'l' | 'r', THREE.Object3D> = { l: new THREE.Group(), r: new THREE.Group() };
  const arm = (side: 1 | -1) => {
    const L = side > 0 ? 'l' : 'r';
    const sh = j(side > 0 ? 'lSh' : 'rSh', chest, [0.14 * side, 0.122, -0.012]);
    sh.add(
      limbLoft(
        [
          [0, 0.036, 0.042, -0.002],
          [0.05, 0.042, 0.046],
          [0.13, 0.04, 0.042],
          [0.21, 0.035, 0.037],
          [0.27, 0.033, 0.033],
        ],
        sleeveM,
        { cap: 0.45 },
      ),
    );
    const el = j(side > 0 ? 'lEl' : 'rEl', sh, [0, -0.27, 0]);
    const longSleeve = look.sleeve === 'long' || !!coat;
    if (!longSleeve) {
      // A mid sleeve: the cuff sits just below the elbow.
      el.add(limbLoft([[-0.02, 0.038, 0.038], [0.04, 0.037, 0.035]], top, { caps: [true, false], cap: 0.3 }));
    }
    el.add(
      limbLoft(
        [
          [0, 0.031, 0.032],
          [0.05, 0.034, 0.031, 0.002],
          [0.14, 0.027, 0.023],
          [0.21, 0.021, 0.016],
          [0.235, 0.02, 0.015],
        ],
        longSleeve ? sleeveM : skin,
      ),
    );
    if (longSleeve) el.add(limbLoft([[0.2, 0.024, 0.02], [0.225, 0.025, 0.021]], sleeveM, { caps: [false, true], cap: 0.3 }));
    const wr = j(side > 0 ? 'lWr' : 'rWr', el, [0, -0.235, 0]);
    const hand = makeHand(skin, side);
    wr.add(hand.group);
    hand.group.add(handGroups[L]);
    hands[L] = hand.curl;
  };
  arm(1);
  arm(-1);

  const leg = (side: 1 | -1) => {
    const hp = j(side > 0 ? 'lHip' : 'rHip', hips, [0.084 * side, -0.04, 0]);
    hp.add(
      limbLoft(
        [
          [0, 0.066, 0.076, -0.006],
          [0.08, 0.076, 0.082, -0.002],
          [0.2, 0.067, 0.07],
          [0.36, 0.052, 0.055, 0.004],
          [0.42, 0.048, 0.05, 0.004],
        ],
        bottom,
        { cap: 0.5 },
      ),
    );
    const kn = j(side > 0 ? 'lKn' : 'rKn', hp, [0, -0.42, 0]);
    kn.add(
      limbLoft(
        [
          [0, 0.047, 0.05, 0.004],
          [0.09, 0.048, 0.054, -0.008],
          [0.22, 0.041, 0.044, -0.006],
          [0.35, 0.034, 0.035],
          [0.4, 0.036, 0.037],
        ],
        bottom,
      ),
    );
    const an = j(side > 0 ? 'lAn' : 'rAn', kn, [0, -0.41, 0]);
    an.add(limbLoft([[-0.02, 0.026, 0.027], [0.03, 0.025, 0.026]], skin, { seg: 16 }));
    const shoe = loft(
      [
        { y: -0.045, rx: 0.031, rz: 0.028 },
        { y: 0.0, rx: 0.035, rz: 0.033 },
        { y: 0.07, rx: 0.04, rz: 0.027, oz: 0.008 },
        { y: 0.125, rx: 0.039, rz: 0.02, oz: 0.014 },
        { y: 0.16, rx: 0.03, rz: 0.015, oz: 0.018 },
      ],
      shoes,
      { cap: 0.8, seg: 22 },
    );
    shoe.rotation.x = Math.PI / 2;
    shoe.position.set(0, -0.055, 0.0);
    an.add(shoe);
  };
  leg(1);
  leg(-1);

  const joints = {} as Record<J, THREE.Object3D>;
  root.traverse((o) => {
    if (o.name) joints[o.name as J] = o;
  });

  return {
    root,
    joints,
    hair,
    rightHand: handGroups.r,
    leftHand: handGroups.l,
    pose(p: Pose) {
      for (const name of Object.keys(joints) as J[]) {
        const r = p[name] ?? [0, 0, 0];
        joints[name].rotation.set(r[0] * D, r[1] * D, r[2] * D);
      }
      if (p.at) root.position.set(...p.at);
      root.rotation.y = (p.turn ?? 0) * D;
      hands.l(p.curl?.[0] ?? 0.25);
      hands.r(p.curl?.[1] ?? 0.25);
      if (p.ik) {
        root.updateMatrixWorld(true);
        const J_ = joints;
        if (p.ik.lHand) solve(root, J_.lSh, J_.lEl, J_.lWr, p.ik.lHand, [0.5, -0.4, -1], 1);
        if (p.ik.rHand) solve(root, J_.rSh, J_.rEl, J_.rWr, p.ik.rHand, [-0.5, -0.4, -1], 1);
        if (p.ik.lFoot) solve(root, J_.lHip, J_.lKn, J_.lAn, p.ik.lFoot, [0.1, 0, 1], -1);
        if (p.ik.rFoot) solve(root, J_.rHip, J_.rKn, J_.rAn, p.ik.rFoot, [-0.1, 0, 1], -1);
      }
    },
  };
}

// ── Two-bone reach ───────────────────────────────────────────────────
const _s = new THREE.Vector3();
const _t = new THREE.Vector3();
const _e = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _f = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _sc = new THREE.Vector3();

/**
 * Places the end of a two-bone limb (shoulder, elbow, wrist / hip, knee, ankle) on a point.
 * The middle joint is a hinge on its local X: `flex` 1 bends forward (elbow), -1 bends back (knee).
 */
function solve(root: THREE.Object3D, A: THREE.Object3D, B: THREE.Object3D, C: THREE.Object3D, r: Reach, defPole: V3, flex: 1 | -1) {
  A.getWorldPosition(_s);
  A.getWorldScale(_sc);
  const a = B.position.length() * _sc.x;
  const b = C.position.length() * _sc.x;
  _t.set(...r.to);
  _d.subVectors(_t, _s);
  const d = THREE.MathUtils.clamp(_d.length(), Math.abs(a - b) + 1e-4, (a + b) * 0.9995);
  _d.normalize();
  // The bend direction, from the figure's frame into the world.
  root.getWorldQuaternion(_q);
  _p.set(...(r.pole ?? defPole)).applyQuaternion(_q);
  _p.addScaledVector(_d, -_p.dot(_d));
  if (_p.lengthSq() < 1e-8) _p.set(0, 0, 1).applyQuaternion(_q);
  _p.normalize();
  const x = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  _e.copy(_s).addScaledVector(_d, x).addScaledVector(_p, h);
  _t.copy(_s).addScaledVector(_d, d);
  // Upper bone frame: +Y up the limb, Z toward the bend.
  _y.subVectors(_s, _e).normalize();
  _f.subVectors(_t, _e).normalize();
  _z.copy(_f).addScaledVector(_y, -_f.dot(_y));
  if (_z.lengthSq() < 1e-8) _z.copy(_p);
  _z.normalize().multiplyScalar(flex);
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  _q.setFromRotationMatrix(_m);
  A.parent!.getWorldQuaternion(_qp);
  A.quaternion.copy(_qp.invert().multiply(_q));
  const ang = Math.acos(THREE.MathUtils.clamp(-_y.dot(_f), -1, 1));
  B.rotation.set(-flex * ang, 0, 0);
  A.updateMatrixWorld(true);
}

/**
 * A hand hanging from the wrist: a flat palm, four two-part fingers and a thumb.
 * The palm faces the body (side 1 = left hand, palm toward -X); the thumb points forward.
 */
function makeHand(skin: THREE.Material, side: 1 | -1) {
  const g = new THREE.Group();
  g.add(
    limbLoft(
      [
        [0, 0.014, 0.022],
        [0.02, 0.0145, 0.033],
        [0.055, 0.0135, 0.037, 0],
        [0.082, 0.012, 0.034],
      ],
      skin,
      { seg: 20, cap: 0.7 },
    ),
  );
  const fingers: { base: THREE.Object3D; tip: THREE.Object3D }[] = [];
  const spec: [number, number, number][] = [
    [0.023, 0.072, 0.0078],
    [0.0075, 0.08, 0.008],
    [-0.0085, 0.074, 0.0076],
    [-0.023, 0.06, 0.0068],
  ];
  for (const [z, len, r] of spec) {
    const base = new THREE.Group();
    base.position.set(0, -0.078, z);
    base.rotation.x = (z / 0.023) * 0.05;
    const a = len * 0.55;
    base.add(limbLoft([[0, r, r], [a, r * 0.94, r * 0.94]], skin, { seg: 12, cap: 0.9 }));
    const tip = new THREE.Group();
    tip.position.y = -a;
    const t = limbLoft([[0, r * 0.92, r * 0.92], [len - a, r * 0.78, r * 0.8]], skin, { seg: 12, cap: 0.9 });
    t.castShadow = false;
    tip.add(t);
    base.add(tip);
    g.add(base);
    fingers.push({ base, tip });
  }
  const thumb = new THREE.Group();
  thumb.position.set(-0.006 * side, -0.022, 0.028);
  thumb.rotation.set(-0.55, 0, 0.22 * side);
  thumb.add(limbLoft([[0, 0.0105, 0.0105], [0.035, 0.009, 0.0095]], skin, { seg: 12, cap: 0.9 }));
  const tt = new THREE.Group();
  tt.position.y = -0.035;
  tt.add(limbLoft([[0, 0.0088, 0.0088], [0.026, 0.0075, 0.0078]], skin, { seg: 12, cap: 0.9 }));
  thumb.add(tt);
  g.add(thumb);
  return {
    group: g,
    curl(c: number) {
      // Fingers close toward the palm, the far joint a little more than the near one.
      for (const f of fingers) {
        f.base.rotation.z = -side * c * 0.9;
        f.tip.rotation.z = -side * c * 1.1;
      }
      tt.rotation.z = -side * c * 0.6;
    },
  };
}

/** Blend two poses joint by joint (for small, scrubbed movements inside a scene). */
export function mixPose(a: Pose, b: Pose, t: number): Pose {
  const out: Pose = { at: a.at, turn: a.turn };
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => k !== 'at' && k !== 'turn' && k !== 'curl')) as Set<J>;
  keys.forEach((k) => {
    const x = a[k] ?? [0, 0, 0];
    const y = b[k] ?? [0, 0, 0];
    out[k] = [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
  });
  if (a.at && b.at) out.at = [a.at[0] + (b.at[0] - a.at[0]) * t, a.at[1] + (b.at[1] - a.at[1]) * t, a.at[2] + (b.at[2] - a.at[2]) * t];
  return out;
}
