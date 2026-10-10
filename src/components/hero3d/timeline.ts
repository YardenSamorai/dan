import { clamp, easeInOutCubic, easeInOutSine, lerp, range } from '../../lib/math';

/**
 * The hero's clock: everything here is a pure function of scroll progress p (0..1)
 * and has no WebGL in it, so the page can lay out the time rail, the booking
 * panel and the calendar before (or without) the 3D scene.
 *
 *   09:00 manicure │ pillar │ 11:00 Pilates │ crane │ 13:30 haircut │ mirror │
 *   16:00 clinic │ sunset │ 20:30 home, booking │ the booking lands in the business calendar
 */

export type SceneId = 'nails' | 'pilates' | 'hair' | 'clinic' | 'home';
export const SCENES: SceneId[] = ['nails', 'pilates', 'hair', 'clinic', 'home'];

/** Where each scene holds, in p. Transitions sit between them. */
export const T = {
  nails: [0, 0.15],
  pilates: [0.22, 0.33],
  hair: [0.42, 0.53],
  clinic: [0.59, 0.68],
  home: [0.77, 0.85],
  /** The salon mirror and the clinic screen share a colour; the camera cuts inside it. */
  cut: 0.56,
  /** The booking page on her screen becomes real DOM. */
  dom: [0.836, 0.852],
  /** She picks a time. */
  pick: 0.866,
  /** The page ground replaces the room; the panel steps back; the chosen time flies into the business calendar. */
  ground: [0.874, 0.912],
  panel: [0.884, 0.912],
  chip: [0.882, 0.934],
  card: [0.9, 0.936],
  rail: [0.88, 0.95],
  copy: [0.942, 0.985],
} as const;

/** Clock time in minutes for p: each scene's appointment runs while it holds, transitions skip ahead. */
const CLOCK: [number, number][] = [
  [0, 540],
  [0.15, 585],
  [0.22, 660],
  [0.33, 705],
  [0.42, 810],
  [0.53, 850],
  [0.59, 960],
  [0.68, 995],
  [0.77, 1230],
  [0.9, 1244],
  [1, 1246],
];

export function minuteAt(p: number) {
  for (let i = 1; i < CLOCK.length; i++) {
    const [p1, m1] = CLOCK[i];
    if (p <= p1) {
      const [p0, m0] = CLOCK[i - 1];
      return lerp(m0, m1, easeInOutSine(clamp((p - p0) / (p1 - p0))));
    }
  }
  return CLOCK[CLOCK.length - 1][1];
}

/** Her day as appointments on the rail: start and end minutes. */
export const DAY: { id: SceneId; start: number; end: number }[] = [
  { id: 'nails', start: 540, end: 600 },
  { id: 'pilates', start: 660, end: 715 },
  { id: 'hair', start: 810, end: 855 },
  { id: 'clinic', start: 960, end: 1000 },
];

/** The scene the clock label names: the last one whose hold has begun. */
export function sceneAt(p: number): SceneId {
  if (p >= 0.74) return 'home';
  if (p >= T.cut) return 'clinic';
  if (p >= 0.375) return 'hair';
  if (p >= 0.185) return 'pilates';
  return 'nails';
}

const ease = (p: number, r: readonly [number, number]) => easeInOutCubic(range(p, r[0], r[1]));

export interface Dom {
  minute: number;
  scene: SceneId;
  /** Opening line and scroll cue. */
  intro: number;
  /** Real DOM booking page over the monitor. */
  dom: number;
  picked: boolean;
  ground: number;
  panel: number;
  chip: number;
  card: number;
  /** 0: the rail is the day's clock; 1: it is the calendar's hour gutter. */
  rail: number;
  copy: number;
}

export function domAt(p: number): Dom {
  return {
    minute: minuteAt(p),
    scene: sceneAt(p),
    intro: 1 - range(p, 0.012, 0.05),
    dom: range(p, T.dom[0], T.dom[1]),
    picked: p >= T.pick,
    ground: ease(p, T.ground),
    panel: ease(p, T.panel),
    chip: ease(p, T.chip),
    card: ease(p, T.card),
    rail: ease(p, T.rail),
    copy: ease(p, T.copy),
  };
}

/** The business calendar the booking lands in: the nail studio's day, 08:00 to 19:00. */
export const CAL = { start: 480, end: 1140 };
export const CAL_APPTS: { id: 'a' | 'mine' | 'b' | 'c' | 'd'; start: number; end: number; tone: string; mine?: boolean }[] = [
  { id: 'a', start: 540, end: 600, tone: '#c24d6b' },
  { id: 'mine', start: 630, end: 690, tone: '#0f6b66', mine: true },
  { id: 'b', start: 720, end: 780, tone: '#8a63b8' },
  { id: 'c', start: 840, end: 885, tone: '#c9814a' },
  { id: 'd', start: 930, end: 990, tone: '#c24d6b' },
];
/** Times the booking page offers: exactly the gaps in that calendar. */
export const SLOTS = [630, 780, 990, 1050];
export const PICKED = 630;
