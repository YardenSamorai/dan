import type { ISODate, Minutes, TimeRange, Weekday } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export const toISODate = (d: Date): ISODate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function fromISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayISO = (now = new Date()) => toISODate(now);

export function addDays(iso: ISODate, n: number): ISODate {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((fromISODate(a).getTime() - fromISODate(b).getTime()) / 86_400_000);
}

export const weekdayOf = (iso: ISODate) => fromISODate(iso).getDay() as Weekday;

/** Start of the week containing `iso`. Weeks start on Sunday (Israel). */
export function startOfWeek(iso: ISODate, weekStartsOn: Weekday = 0): ISODate {
  const wd = weekdayOf(iso);
  return addDays(iso, -((wd - weekStartsOn + 7) % 7));
}

export const minutesOfDay = (d: Date): Minutes => d.getHours() * 60 + d.getMinutes();

export function atMinutes(iso: ISODate, m: Minutes): Date {
  const d = fromISODate(iso);
  d.setMinutes(m);
  return d;
}

export const hhmm = (m: Minutes) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

export function parseHHMM(s: string): Minutes {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
}

export const overlaps = (a: TimeRange, b: TimeRange) => a.start < b.end && b.start < a.end;
export const contains = (outer: TimeRange, inner: TimeRange) => inner.start >= outer.start && inner.end <= outer.end;

/** Sorted, merged union. */
export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const s = [...ranges].filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const out: TimeRange[] = [];
  for (const r of s) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

export function subtractRanges(base: TimeRange[], cut: TimeRange[]): TimeRange[] {
  let out = mergeRanges(base);
  for (const c of mergeRanges(cut)) {
    const next: TimeRange[] = [];
    for (const r of out) {
      if (!overlaps(r, c)) next.push(r);
      else {
        if (c.start > r.start) next.push({ start: r.start, end: c.start });
        if (c.end < r.end) next.push({ start: c.end, end: r.end });
      }
    }
    out = next;
  }
  return out;
}

export function intersectRanges(a: TimeRange[], b: TimeRange[]): TimeRange[] {
  const out: TimeRange[] = [];
  for (const x of mergeRanges(a))
    for (const y of mergeRanges(b)) {
      const start = Math.max(x.start, y.start);
      const end = Math.min(x.end, y.end);
      if (end > start) out.push({ start, end });
    }
  return mergeRanges(out);
}

export const snap = (m: Minutes, step: number) => Math.round(m / step) * step;

// ── Timezones ─────────────────────────────────────────────────────────
// Appointment dates/minutes are wall-clock values in the business's timezone.
// These helpers convert between that wall clock and real instants, so a
// customer browsing from another timezone still sees the business's schedule.

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneParts(timeZone: string, t: number) {
  let f = zoneFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    zoneFormatters.set(timeZone, f);
  }
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(t)) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return { y: p.year, m: p.month, d: p.day, min: (p.hour % 24) * 60 + p.minute };
}

/** Offset of `timeZone` from UTC at instant `t`, in minutes. */
function zoneOffset(timeZone: string, t: number) {
  const p = zoneParts(timeZone, t);
  return Math.round((Date.UTC(p.y, p.m - 1, p.d, 0, p.min) - Math.floor(t / 60_000) * 60_000) / 60_000);
}

/** The wall-clock date and minute in `timeZone` at `now`. */
export function zonedNow(timeZone: string, now = new Date()): { date: ISODate; minutes: Minutes } {
  const p = zoneParts(timeZone, now.getTime());
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, minutes: p.min };
}

/** The instant at which the wall clock in `timeZone` reads `date` + `minutes`. */
export function zonedInstant(date: ISODate, minutes: Minutes, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, minutes);
  let t = wall - zoneOffset(timeZone, wall) * 60_000;
  const corrected = wall - zoneOffset(timeZone, t) * 60_000;
  if (corrected !== t) t = corrected;
  return new Date(t);
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
