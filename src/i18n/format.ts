import type { ISODate, Minutes } from '../domain/types';
import { atMinutes, diffDays, fromISODate, todayISO, zonedNow } from '../domain/time';
import { localeMeta, type Locale } from './config';

/**
 * Locale-bound formatters, cached per locale + currency + timezone. All output
 * comes from Intl. ISO dates and minute-of-day values are wall-clock values in
 * the business's timezone, so they're formatted without conversion; real
 * instants (Date) are shown in the business's timezone when one is given.
 */
export interface Formatters {
  date: (iso: ISODate, style?: DateStyle) => string;
  time: (m: Minutes) => string;
  timeRange: (start: Minutes, end: Minutes) => string;
  dateTime: (d: Date) => string;
  money: (amount: number) => string;
  number: (n: number) => string;
  percent: (n: number) => string;
  weekday: (wd: number, width?: 'long' | 'short' | 'narrow') => string;
  month: (iso: ISODate) => string;
  relativeDay: (iso: ISODate, now?: Date) => string | null;
  list: (items: string[]) => string;
  /** Localised name of the timezone, e.g. "Israel Time". */
  zoneName: () => string;
}

export type DateStyle = 'full' | 'long' | 'medium' | 'short' | 'dayMonth' | 'weekdayDay' | 'numeric';

const DATE_OPTS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  full: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  long: { weekday: 'long', day: 'numeric', month: 'long' },
  medium: { weekday: 'short', day: 'numeric', month: 'short' },
  short: { day: 'numeric', month: 'short' },
  dayMonth: { day: 'numeric', month: 'long' },
  weekdayDay: { weekday: 'short', day: 'numeric' },
  numeric: { day: '2-digit', month: '2-digit', year: 'numeric' },
};

const cache = new Map<string, Formatters>();

export function getFormatters(locale: Locale, currency: string, timeZone?: string): Formatters {
  const key = `${locale}|${currency}|${timeZone ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const tag = localeMeta[locale].intl;
  const dateFmts = new Map<DateStyle, Intl.DateTimeFormat>();
  const df = (style: DateStyle) => {
    let f = dateFmts.get(style);
    if (!f) dateFmts.set(style, (f = new Intl.DateTimeFormat(tag, DATE_OPTS[style])));
    return f;
  };
  const timeFmt = new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dateTimeFmt = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone });
  const moneyWhole = new Intl.NumberFormat(tag, { style: 'currency', currency, maximumFractionDigits: 0 });
  const moneyCents = new Intl.NumberFormat(tag, { style: 'currency', currency, minimumFractionDigits: 2 });
  const num = new Intl.NumberFormat(tag);
  const pct = new Intl.NumberFormat(tag, { style: 'percent', maximumFractionDigits: 0 });
  const rel = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' });
  const listFmt = new Intl.ListFormat(tag, { type: 'conjunction' });
  const wdFmts = {
    long: new Intl.DateTimeFormat(tag, { weekday: 'long' }),
    short: new Intl.DateTimeFormat(tag, { weekday: 'short' }),
    narrow: new Intl.DateTimeFormat(tag, { weekday: 'narrow' }),
  };
  const monthFmt = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' });
  // 2026-10-04 is a Sunday: weekday index 0.
  const wdDate = (wd: number) => new Date(2026, 9, 4 + wd);
  const time = (m: Minutes) => timeFmt.format(atMinutes('2026-01-01', m));
  const today = (now: Date) => (timeZone ? zonedNow(timeZone, now).date : todayISO(now));

  const f: Formatters = {
    date: (iso, style = 'long') => df(style).format(fromISODate(iso)),
    time,
    // Isolated LTR so a range reads start→end in RTL text too.
    timeRange: (a, b) => `\u2066${time(a)}-${time(b)}\u2069`,
    dateTime: (d) => dateTimeFmt.format(d),
    money: (n) => (Number.isInteger(n) ? moneyWhole : moneyCents).format(n),
    number: (n) => num.format(n),
    percent: (n) => pct.format(n),
    weekday: (wd, width = 'long') => wdFmts[width].format(wdDate(wd)),
    month: (iso) => monthFmt.format(fromISODate(iso)),
    relativeDay: (iso, now = new Date()) => {
      const d = diffDays(iso, today(now));
      if (d === 0 || d === 1 || d === -1) {
        const s = rel.format(d, 'day');
        return s.charAt(0).toLocaleUpperCase(tag) + s.slice(1);
      }
      return null;
    },
    list: (items) => listFmt.format(items),
    zoneName: () => {
      const tz = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      const part = new Intl.DateTimeFormat(tag, { timeZone: tz, timeZoneName: 'longGeneric' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName');
      return part?.value ?? tz;
    },
  };
  cache.set(key, f);
  return f;
}
