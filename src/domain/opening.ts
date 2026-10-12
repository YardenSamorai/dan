import { addDays, weekdayOf, zonedNow } from './time';
import type { ISODate, Minutes, TimeRange, WeeklySchedule } from './types';

export type OpenState = { open: true; until: Minutes } | { open: false; next: { date: ISODate; start: Minutes } | null };

type SpecialDay = { date: ISODate; closed: boolean; ranges: TimeRange[] };

/** The business's opening hours on `date`: a special day wins over the weekly hours. */
export function hoursOn(hours: WeeklySchedule, special: SpecialDay[], date: ISODate): TimeRange[] {
  const s = special.find((d) => d.date === date);
  const ranges = s ? (s.closed ? [] : s.ranges) : hours[weekdayOf(date)].ranges;
  return [...ranges].sort((a, b) => a.start - b.start);
}

/** Open right now (and until when), or when it next opens within a week. In the business's time zone. */
export function openState(hours: WeeklySchedule, special: SpecialDay[], timeZone: string, now = new Date()): OpenState {
  const here = zonedNow(timeZone, now);
  const today = hoursOn(hours, special, here.date);
  const current = today.find((r) => r.start <= here.minutes && here.minutes < r.end);
  if (current) {
    // Back-to-back ranges read as one stretch.
    let until = current.end;
    for (const r of today) if (r.start === until) until = r.end;
    return { open: true, until };
  }
  const later = today.find((r) => r.start > here.minutes);
  if (later) return { open: false, next: { date: here.date, start: later.start } };
  for (let i = 1; i <= 7; i++) {
    const date = addDays(here.date, i);
    const first = hoursOn(hours, special, date)[0];
    if (first) return { open: false, next: { date, start: first.start } };
  }
  return { open: false, next: null };
}
