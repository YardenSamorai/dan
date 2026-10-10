import { occupiesTime, staffDay } from './scheduling';
import { addDays, diffDays, subtractRanges, weekdayOf } from './time';
import type { Appointment, ISODate, Minutes, TenantData, Weekday } from './types';

/**
 * Business insights: pure summaries of one tenant's appointments over a date
 * span. "Revenue" is the booked price of appointments that weren't cancelled
 * or missed — payments aren't tracked, so this is what the work was worth.
 */

export type PeriodKey = '7d' | '30d' | '90d' | 'month' | 'lastMonth';
export const PERIODS: PeriodKey[] = ['7d', '30d', '90d', 'month', 'lastMonth'];

/** Inclusive on both ends. */
export interface DateSpan {
  from: ISODate;
  to: ISODate;
}

export interface Now {
  date: ISODate;
  minutes: Minutes;
}

export const spanDays = (s: DateSpan) => diffDays(s.to, s.from) + 1;
export const inSpan = (date: ISODate, s: DateSpan) => date >= s.from && date <= s.to;

const monthStart = (iso: ISODate) => `${iso.slice(0, 8)}01`;
const prevMonthStart = (iso: ISODate) => monthStart(addDays(monthStart(iso), -1));
const monthEnd = (iso: ISODate) => addDays(monthStart(addDays(monthStart(iso), 32)), -1);

/** The span a period covers and the equally long span right before it, for comparison. */
export function periodSpans(key: PeriodKey, today: ISODate): { current: DateSpan; previous: DateSpan } {
  if (key === 'month') {
    const from = monthStart(today);
    const pFrom = prevMonthStart(today);
    const pTo = addDays(pFrom, diffDays(today, from));
    return { current: { from, to: today }, previous: { from: pFrom, to: pTo > monthEnd(pFrom) ? monthEnd(pFrom) : pTo } };
  }
  if (key === 'lastMonth') {
    const from = prevMonthStart(today);
    const pFrom = prevMonthStart(from);
    return { current: { from, to: monthEnd(from) }, previous: { from: pFrom, to: monthEnd(pFrom) } };
  }
  const n = parseInt(key, 10);
  const from = addDays(today, -(n - 1));
  return { current: { from, to: today }, previous: { from: addDays(from, -n), to: addDays(from, -1) } };
}

const isUpcoming = (a: Appointment, now: Now) => a.date > now.date || (a.date === now.date && a.start + a.duration > now.minutes);

/** Working minutes a person had on a date: shift minus breaks and blocks, nothing on time off. */
export function openMinutes(state: TenantData, staffId: string, date: ISODate): Minutes {
  const d = staffDay(state, staffId, date);
  return subtractRanges(d.shift, [...d.breaks, ...d.blocks]).reduce((m, r) => m + r.end - r.start, 0);
}

function eachDay(s: DateSpan, fn: (date: ISODate) => void) {
  for (let d = s.from; d <= s.to; d = addDays(d, 1)) fn(d);
}

/** Staff counted in a span: everyone active, plus anyone who had appointments then. */
function staffInSpan(state: TenantData, appts: Appointment[]) {
  const ids = new Set(appts.map((a) => a.staffId));
  return state.staff.filter((s) => s.active || ids.has(s.id));
}

export interface Totals {
  /** Every appointment dated in the span, whatever happened to it. */
  total: number;
  /** Not cancelled or missed. */
  booked: number;
  completed: number;
  /** Booked and not over yet. */
  upcoming: number;
  cancelled: number;
  noShow: number;
  revenue: number;
  /** Price of cancelled and missed appointments. */
  lost: number;
  avgTicket: number;
  customers: number;
  /** Customers whose first booked visit ever falls in the span. */
  newCustomers: number;
  returningCustomers: number;
  bookedMinutes: Minutes;
  openMinutes: Minutes;
  /** bookedMinutes / openMinutes, 0..1. */
  occupancy: number;
  /** (cancelled + no-shows) / total, 0..1. */
  lossRate: number;
  online: number;
  studio: number;
}

/** Earliest booked visit per customer, over all time. */
export function firstVisits(state: TenantData): Map<string, ISODate> {
  const first = new Map<string, ISODate>();
  for (const a of state.appointments) {
    if (!occupiesTime(a)) continue;
    const f = first.get(a.customerId);
    if (!f || a.date < f) first.set(a.customerId, a.date);
  }
  return first;
}

export function totals(state: TenantData, span: DateSpan, now: Now, first = firstVisits(state)): Totals {
  const all = state.appointments.filter((a) => inSpan(a.date, span));
  const kept = all.filter(occupiesTime);
  const customers = new Set(kept.map((a) => a.customerId));
  let newCustomers = 0;
  for (const c of customers) if (inSpan(first.get(c) ?? '', span)) newCustomers++;
  const revenue = kept.reduce((s, a) => s + a.price, 0);
  const bookedMinutes = kept.reduce((s, a) => s + a.duration, 0);
  let open = 0;
  const people = staffInSpan(state, all);
  eachDay(span, (date) => {
    for (const p of people) open += openMinutes(state, p.id, date);
  });
  const cancelled = all.filter((a) => a.status === 'cancelled');
  const noShow = all.filter((a) => a.status === 'no_show');
  return {
    total: all.length,
    booked: kept.length,
    completed: kept.filter((a) => a.status === 'completed').length,
    upcoming: kept.filter((a) => a.status !== 'completed' && isUpcoming(a, now)).length,
    cancelled: cancelled.length,
    noShow: noShow.length,
    revenue,
    lost: [...cancelled, ...noShow].reduce((s, a) => s + a.price, 0),
    avgTicket: kept.length ? revenue / kept.length : 0,
    customers: customers.size,
    newCustomers,
    returningCustomers: customers.size - newCustomers,
    bookedMinutes,
    openMinutes: open,
    occupancy: open ? Math.min(1, bookedMinutes / open) : 0,
    lossRate: all.length ? (cancelled.length + noShow.length) / all.length : 0,
    online: kept.filter((a) => a.source === 'online').length,
    studio: kept.filter((a) => a.source !== 'online').length,
  };
}

export interface StaffStat {
  staffId: string;
  booked: number;
  completed: number;
  noShow: number;
  cancelled: number;
  revenue: number;
  bookedMinutes: Minutes;
  openMinutes: Minutes;
  occupancy: number;
  customers: number;
}

/** One row per person, most revenue first. */
export function staffStats(state: TenantData, span: DateSpan): StaffStat[] {
  const all = state.appointments.filter((a) => inSpan(a.date, span));
  return staffInSpan(state, all)
    .map((s): StaffStat => {
      const mine = all.filter((a) => a.staffId === s.id);
      const kept = mine.filter(occupiesTime);
      let open = 0;
      eachDay(span, (date) => {
        open += openMinutes(state, s.id, date);
      });
      const bookedMinutes = kept.reduce((m, a) => m + a.duration, 0);
      return {
        staffId: s.id,
        booked: kept.length,
        completed: kept.filter((a) => a.status === 'completed').length,
        noShow: mine.filter((a) => a.status === 'no_show').length,
        cancelled: mine.filter((a) => a.status === 'cancelled').length,
        revenue: kept.reduce((m, a) => m + a.price, 0),
        bookedMinutes,
        openMinutes: open,
        occupancy: open ? Math.min(1, bookedMinutes / open) : 0,
        customers: new Set(kept.map((a) => a.customerId)).size,
      };
    })
    .filter((r) => r.booked > 0 || r.openMinutes > 0)
    .sort((a, b) => b.revenue - a.revenue || b.booked - a.booked);
}

export interface ServiceStat {
  serviceId: string;
  booked: number;
  revenue: number;
}

/** Booked services, most revenue first. */
export function serviceStats(state: TenantData, span: DateSpan): ServiceStat[] {
  const by = new Map<string, ServiceStat>();
  for (const a of state.appointments) {
    if (!inSpan(a.date, span) || !occupiesTime(a)) continue;
    const r = by.get(a.serviceId) ?? { serviceId: a.serviceId, booked: 0, revenue: 0 };
    r.booked++;
    r.revenue += a.price;
    by.set(a.serviceId, r);
  }
  return [...by.values()].sort((a, b) => b.revenue - a.revenue || b.booked - a.booked);
}

export interface CustomerStat {
  customerId: string;
  visits: number;
  revenue: number;
  last: ISODate;
}

export function topCustomers(state: TenantData, span: DateSpan, limit = 5): CustomerStat[] {
  const by = new Map<string, CustomerStat>();
  for (const a of state.appointments) {
    if (!inSpan(a.date, span) || !occupiesTime(a)) continue;
    const r = by.get(a.customerId) ?? { customerId: a.customerId, visits: 0, revenue: 0, last: a.date };
    r.visits++;
    r.revenue += a.price;
    if (a.date > r.last) r.last = a.date;
    by.set(a.customerId, r);
  }
  return [...by.values()].sort((a, b) => b.revenue - a.revenue || b.visits - a.visits).slice(0, limit);
}

export interface Bucket {
  from: ISODate;
  to: ISODate;
  booked: number;
  revenue: number;
}

/** Revenue and appointments over time: one bucket a day, or a week when the span is long. */
export function series(state: TenantData, span: DateSpan): Bucket[] {
  const days = spanDays(span);
  const size = days > 45 ? 7 : 1;
  const out: Bucket[] = [];
  for (let i = 0; i < days; i += size) {
    const from = addDays(span.from, i);
    const end = addDays(from, size - 1);
    out.push({ from, to: end > span.to ? span.to : end, booked: 0, revenue: 0 });
  }
  for (const a of state.appointments) {
    if (!inSpan(a.date, span) || !occupiesTime(a)) continue;
    const b = out[Math.floor(diffDays(a.date, span.from) / size)];
    b.booked++;
    b.revenue += a.price;
  }
  return out;
}

export interface Heatmap {
  weekdays: Weekday[];
  /** Start hours shown, e.g. [9, 10, … 19]. */
  hours: number[];
  /** cells[weekday index][hour index] = appointments starting in that hour. */
  cells: number[][];
  max: number;
  /** The single busiest weekday + hour. */
  peak: { weekday: Weekday; hour: number } | null;
  /** Most appointments over the span, by weekday and by hour of day. */
  busiestDay: Weekday | null;
  busiestHour: number | null;
}

/** When appointments start, by weekday and hour, Sunday first. */
export function heatmap(state: TenantData, span: DateSpan): Heatmap {
  const kept = state.appointments.filter((a) => inSpan(a.date, span) && occupiesTime(a));
  const hrs = state.business.hours;
  const open = ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).filter((d) => hrs[d].ranges.length || kept.some((a) => weekdayOf(a.date) === d));
  const ranges = open.flatMap((d) => hrs[d].ranges);
  let lo = Math.min(...ranges.map((r) => Math.floor(r.start / 60)), ...kept.map((a) => Math.floor(a.start / 60)));
  let hi = Math.max(...ranges.map((r) => Math.ceil(r.end / 60) - 1), ...kept.map((a) => Math.floor(a.start / 60)));
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) (lo = 9), (hi = 18);
  const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const cells = open.map(() => hours.map(() => 0));
  for (const a of kept) {
    const row = open.indexOf(weekdayOf(a.date));
    const col = Math.floor(a.start / 60) - lo;
    if (row >= 0 && col >= 0 && col < hours.length) cells[row][col]++;
  }
  let max = 0;
  let peak: Heatmap['peak'] = null;
  cells.forEach((r, i) =>
    r.forEach((v, j) => {
      if (v > max) (max = v), (peak = { weekday: open[i], hour: hours[j] });
    }),
  );
  const dayTotals = cells.map((r) => r.reduce((s, v) => s + v, 0));
  const hourTotals = hours.map((_, j) => cells.reduce((s, r) => s + r[j], 0));
  const bestDay = Math.max(0, ...dayTotals);
  const bestHour = Math.max(0, ...hourTotals);
  return {
    weekdays: open,
    hours,
    cells,
    max,
    peak,
    busiestDay: bestDay ? open[dayTotals.indexOf(bestDay)] : null,
    busiestHour: bestHour ? hours[hourTotals.indexOf(bestHour)] : null,
  };
}

export interface OutlookDay {
  date: ISODate;
  booked: number;
  revenue: number;
  occupancy: number;
  /** Nobody works that day. */
  closed: boolean;
}

export interface Outlook {
  days: OutlookDay[];
  booked: number;
  revenue: number;
  pending: number;
  occupancy: number;
}

/** What's already on the books for the next `days` days, today included. */
export function outlook(state: TenantData, now: Now, days = 7): Outlook {
  const span = { from: now.date, to: addDays(now.date, days - 1) };
  const ahead = state.appointments.filter((a) => inSpan(a.date, span) && occupiesTime(a) && isUpcoming(a, now));
  const people = staffInSpan(state, ahead);
  let bookedAll = 0;
  let openAll = 0;
  const out: OutlookDay[] = [];
  eachDay(span, (date) => {
    const mine = ahead.filter((a) => a.date === date);
    const booked = mine.reduce((m, a) => m + a.duration, 0);
    const open = people.reduce((m, p) => m + openMinutes(state, p.id, date), 0);
    bookedAll += booked;
    openAll += open;
    out.push({ date, booked: mine.length, revenue: mine.reduce((m, a) => m + a.price, 0), occupancy: open ? Math.min(1, booked / open) : 0, closed: open === 0 });
  });
  return {
    days: out,
    booked: ahead.length,
    revenue: ahead.reduce((m, a) => m + a.price, 0),
    pending: ahead.filter((a) => a.status === 'pending').length,
    occupancy: openAll ? Math.min(1, bookedAll / openAll) : 0,
  };
}

/** Just appointments and revenue, for summaries elsewhere in the app. */
export function quickTotals(state: TenantData, span: DateSpan): { booked: number; revenue: number } {
  let booked = 0;
  let revenue = 0;
  for (const a of state.appointments)
    if (inSpan(a.date, span) && occupiesTime(a)) {
      booked++;
      revenue += a.price;
    }
  return { booked, revenue };
}

/** Date of the earliest appointment on record. */
export const historyStart = (state: TenantData): ISODate | null => state.appointments.reduce<ISODate | null>((m, a) => (!m || a.date < m ? a.date : m), null);

/** Relative change, or null when there's nothing to compare with. */
export const change = (cur: number, prev: number): number | null => (prev ? (cur - prev) / prev : null);

export interface Insights {
  span: DateSpan;
  previousSpan: DateSpan;
  current: Totals;
  previous: Totals;
  staff: StaffStat[];
  services: ServiceStat[];
  customers: CustomerStat[];
  series: Bucket[];
  heat: Heatmap;
  /** Anything ever booked; false = a brand-new business. */
  hasHistory: boolean;
  /** The previous span is fully covered by history, so changes against it mean something. */
  comparable: boolean;
}

export function insights(state: TenantData, key: PeriodKey, now: Now): Insights {
  const { current: span, previous: previousSpan } = periodSpans(key, now.date);
  const first = firstVisits(state);
  const earliest = historyStart(state);
  return {
    comparable: !!earliest && earliest <= previousSpan.from,
    span,
    previousSpan,
    current: totals(state, span, now, first),
    previous: totals(state, previousSpan, now, first),
    staff: staffStats(state, span),
    services: serviceStats(state, span),
    customers: topCustomers(state, span),
    series: series(state, span),
    heat: heatmap(state, span),
    hasHistory: state.appointments.length > 0,
  };
}
