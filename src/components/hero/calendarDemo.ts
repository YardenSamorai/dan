/**
 * The sample day in the hero's calendar: a nail studio with three artists, 09:00 to 17:00.
 * `order` is when each appointment gets booked as the page scrolls; the first `PREBOOKED` are there from the start.
 */
export const DAY_START = 540;
export const DAY_END = 1020;
export const PREBOOKED = 4;

export type StaffId = 'a' | 'b' | 'c';
export type ServiceId = 'gel' | 'ext' | 'pedi' | 'fill';

export const STAFF: { id: StaffId; color: string }[] = [
  { id: 'a', color: '#c24d6b' },
  { id: 'b', color: '#8a63b8' },
  { id: 'c', color: '#c9814a' },
];

export interface DemoAppt {
  staff: StaffId;
  start: number;
  end: number;
  client: number;
  service: ServiceId;
  order: number;
}

export const APPTS: DemoAppt[] = [
  { staff: 'a', start: 540, end: 600, client: 0, service: 'gel', order: 0 },
  { staff: 'a', start: 615, end: 705, client: 1, service: 'ext', order: 5 },
  { staff: 'a', start: 720, end: 780, client: 2, service: 'gel', order: 8 },
  { staff: 'a', start: 810, end: 855, client: 3, service: 'pedi', order: 2 },
  { staff: 'a', start: 870, end: 930, client: 4, service: 'gel', order: 11 },
  { staff: 'a', start: 945, end: 1005, client: 5, service: 'fill', order: 13 },
  { staff: 'b', start: 570, end: 630, client: 6, service: 'gel', order: 1 },
  { staff: 'b', start: 660, end: 750, client: 7, service: 'ext', order: 7 },
  { staff: 'b', start: 780, end: 825, client: 8, service: 'pedi', order: 10 },
  { staff: 'b', start: 840, end: 900, client: 9, service: 'gel', order: 4 },
  { staff: 'b', start: 930, end: 990, client: 10, service: 'fill', order: 14 },
  { staff: 'c', start: 540, end: 585, client: 11, service: 'pedi', order: 3 },
  { staff: 'c', start: 600, end: 660, client: 12, service: 'gel', order: 6 },
  { staff: 'c', start: 690, end: 780, client: 13, service: 'ext', order: 9 },
  { staff: 'c', start: 840, end: 900, client: 14, service: 'gel', order: 12 },
];

export const TOTAL = APPTS.length;

/** How many of `total` appointments are booked at scroll progress p (0..1), `pre` of them from the start. */
export function bookedAt(p: number, total = TOTAL, pre = PREBOOKED) {
  const rest = total - pre;
  let n = pre;
  for (let i = 0; i < rest; i++) if (p >= 0.06 + (i * 0.8) / Math.max(1, rest - 1)) n++;
  return n;
}
