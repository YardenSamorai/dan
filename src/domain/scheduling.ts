import { addDays, atMinutes, diffDays, intersectRanges, mergeRanges, overlaps, subtractRanges, weekdayOf, zonedInstant, zonedNow } from './time';
import type { Appointment, Block, ClassSession, ISODate, Minutes, ScheduleException, Service, Staff, TenantData, TimeOff, TimeRange } from './types';

/**
 * The availability engine. Pure functions over ONE tenant's data — the same
 * rules drive the public booking flow, the calendar and (later) server-side
 * validation. It combines:
 *   business hours → special-day exceptions → staff weekly shifts → staff
 *   exceptions → breaks → time off → blocks → existing appointments →
 *   service duration + add-ons → buffers before/after → lead time & horizon,
 * all evaluated in the business's timezone.
 */

export const ACTIVE_STATUSES = new Set<Appointment['status']>(['pending', 'confirmed', 'arrived', 'completed']);
export const occupiesTime = (a: Appointment) => ACTIVE_STATUSES.has(a.status);

/** A group class: people join sessions instead of picking a free time. */
export const isClass = (s?: Pick<Service, 'capacity'>) => (s?.capacity ?? 0) >= 2;
export const sessionsOf = (state: TenantData): ClassSession[] => state.sessions ?? [];
/** Sessions that still take place. */
export const liveSessions = (state: TenantData) => sessionsOf(state).filter((s) => s.status === 'scheduled');

export interface StaffDay {
  staff: Staff;
  date: ISODate;
  /** Business opening ∩ staff shift, after exceptions. */
  shift: TimeRange[];
  breaks: TimeRange[];
  blocks: Block[];
  timeOff: TimeOff | null;
  /** Special-day override in effect for this person (staff-level wins over business-level). */
  exception: ScheduleException | null;
  /** One-to-one appointments; seats in a session are represented by the session. */
  appointments: Appointment[];
  sessions: ClassSession[];
}

export function timeOffOn(state: TenantData, staffId: string, date: ISODate): TimeOff | null {
  return state.timeOff.find((t) => t.staffId === staffId && t.from <= date && date <= t.to) ?? null;
}

export function exceptionOn(state: TenantData, staffId: string | null, date: ISODate): ScheduleException | null {
  return state.exceptions.find((e) => e.date === date && e.staffId === staffId) ?? null;
}

export function businessHours(state: TenantData, date: ISODate): TimeRange[] {
  const ex = exceptionOn(state, null, date);
  if (ex) return ex.closed ? [] : ex.ranges;
  return state.business.hours[weekdayOf(date)].ranges;
}

function businessBreaks(state: TenantData, date: ISODate): TimeRange[] {
  const ex = exceptionOn(state, null, date);
  if (ex) return ex.breaks;
  return state.business.hours[weekdayOf(date)].breaks;
}

export function staffDay(state: TenantData, staffId: string, date: ISODate): StaffDay {
  const staff = state.staff.find((s) => s.id === staffId)!;
  const timeOff = timeOffOn(state, staffId, date);
  const own = exceptionOn(state, staffId, date);
  const weekly = staff.schedule[weekdayOf(date)];
  const ranges = own ? (own.closed ? [] : own.ranges) : weekly.ranges;
  const breaks = own ? own.breaks : weekly.breaks;
  return {
    staff,
    date,
    shift: timeOff ? [] : intersectRanges(ranges, businessHours(state, date)),
    breaks: timeOff ? [] : mergeRanges([...breaks, ...businessBreaks(state, date)]),
    blocks: state.blocks.filter((b) => b.date === date && (b.staffId === staffId || b.staffId === null)),
    timeOff,
    exception: own ?? exceptionOn(state, null, date),
    appointments: state.appointments.filter((a) => a.staffId === staffId && a.date === date && !a.sessionId).sort((a, b) => a.start - b.start),
    sessions: liveSessions(state).filter((s) => s.staffId === staffId && s.date === date).sort((a, b) => a.start - b.start),
  };
}

const serviceOf = (state: TenantData, id: string) => state.services.find((s) => s.id === id);

function buffersOf(state: TenantData, serviceId?: string) {
  const s = serviceId ? serviceOf(state, serviceId) : undefined;
  return { before: s?.bufferBefore ?? 0, after: s?.bufferAfter ?? 0 };
}

/** Time an appointment (or a session) holds on the calendar, including the service's buffers. */
export function heldRange(state: TenantData, a: Pick<Appointment, 'serviceId' | 'start' | 'duration'>): TimeRange {
  const b = buffersOf(state, a.serviceId);
  return { start: a.start - b.before, end: a.start + a.duration + b.after };
}

export const blocksAll = (state: TenantData, serviceId?: string) => !!(serviceId && serviceOf(state, serviceId)?.blocksAll);

/**
 * Other people's appointments that hold this person too: those for a service
 * that blocks everyone, or all of them when the service being booked does.
 */
export function sharedAppointments(state: TenantData, staffId: string, date: ISODate, serviceId?: string, excludeAppointmentId?: string): Appointment[] {
  const all = blocksAll(state, serviceId);
  return state.appointments.filter(
    (a) => a.date === date && a.staffId !== staffId && a.id !== excludeAppointmentId && !a.sessionId && occupiesTime(a) && (all || blocksAll(state, a.serviceId)),
  );
}

/** The same for other people's sessions. */
function sharedSessions(state: TenantData, staffId: string, date: ISODate, serviceId?: string, excludeSessionId?: string): ClassSession[] {
  const all = blocksAll(state, serviceId);
  return liveSessions(state).filter((s) => s.date === date && s.staffId !== staffId && s.id !== excludeSessionId && (all || blocksAll(state, s.serviceId)));
}

interface Excluding {
  appointmentId?: string;
  sessionId?: string;
}

function busyRanges(state: TenantData, d: StaffDay, serviceId?: string, skip: Excluding = {}): TimeRange[] {
  return [
    ...d.breaks,
    ...d.blocks,
    ...d.appointments.filter((a) => a.id !== skip.appointmentId && occupiesTime(a)).map((a) => heldRange(state, a)),
    ...d.sessions.filter((s) => s.id !== skip.sessionId).map((s) => heldRange(state, s)),
    ...sharedAppointments(state, d.staff.id, d.date, serviceId, skip.appointmentId).map((a) => heldRange(state, a)),
    ...sharedSessions(state, d.staff.id, d.date, serviceId, skip.sessionId).map((s) => heldRange(state, s)),
  ];
}

export function freeRanges(state: TenantData, staffId: string, date: ISODate, excludeAppointmentId?: string): TimeRange[] {
  const d = staffDay(state, staffId, date);
  return subtractRanges(d.shift, busyRanges(state, d, undefined, { appointmentId: excludeAppointmentId }));
}

export type ConflictKind = 'closed' | 'not_working' | 'time_off' | 'outside_shift' | 'break' | 'block' | 'overlap' | 'session' | 'shared' | 'not_qualified';

export interface Conflict {
  kind: ConflictKind;
  /** Appointment or block id when relevant. */
  refId?: string;
}

export interface SlotCheck {
  staffId: string;
  date: ISODate;
  start: Minutes;
  /** Service duration + add-ons (buffers are added by the engine). */
  duration: Minutes;
  serviceId?: string;
  excludeAppointmentId?: string;
  /** When moving a session, its own time doesn't block it. */
  excludeSessionId?: string;
}

/**
 * Why a staff member can't take this time — or null if they can.
 * The appointment itself must sit inside the shift; buffers may run past the
 * shift edges (prep before the first client, cleanup after the last) but never
 * into another appointment, a break or a block.
 */
export function checkSlot(state: TenantData, q: SlotCheck): Conflict | null {
  if (businessHours(state, q.date).length === 0) return { kind: 'closed' };
  const d = staffDay(state, q.staffId, q.date);
  if (d.timeOff) return { kind: 'time_off', refId: d.timeOff.id };
  if (d.shift.length === 0) return { kind: 'not_working' };
  const service = q.serviceId ? serviceOf(state, q.serviceId) : undefined;
  if (service && !service.staffIds.includes(q.staffId)) return { kind: 'not_qualified' };
  const b = buffersOf(state, q.serviceId);
  const core = { start: q.start, end: q.start + q.duration };
  const held = { start: q.start - b.before, end: core.end + b.after };
  if (!d.shift.some((s) => core.start >= s.start && core.end <= s.end)) return { kind: 'outside_shift' };
  if (d.breaks.some((br) => overlaps(br, held))) return { kind: 'break' };
  const bl = d.blocks.find((x) => overlaps(x, held));
  if (bl) return { kind: 'block', refId: bl.id };
  const clash = d.appointments.find((a) => a.id !== q.excludeAppointmentId && occupiesTime(a) && overlaps(heldRange(state, a), held));
  if (clash) return { kind: 'overlap', refId: clash.id };
  const session = d.sessions.find((s) => s.id !== q.excludeSessionId && overlaps(heldRange(state, s), held));
  if (session) return { kind: 'session', refId: session.id };
  const shared = sharedAppointments(state, q.staffId, q.date, q.serviceId, q.excludeAppointmentId).find((a) => overlaps(heldRange(state, a), held));
  if (shared) return { kind: 'shared', refId: shared.id };
  const sharedSession = sharedSessions(state, q.staffId, q.date, q.serviceId, q.excludeSessionId).find((s) => overlaps(heldRange(state, s), held));
  if (sharedSession) return { kind: 'session', refId: sharedSession.id };
  return null;
}

type Priced = Pick<Service, 'duration' | 'price' | 'staffTerms'>;

/** What a service takes and costs with one person. Without a person (or own terms) it's the service's own. */
export function termsFor(service: Priced, staffId?: string | null): { duration: Minutes; price: number } {
  const own = staffId ? service.staffTerms?.[staffId] : undefined;
  return { duration: own?.duration ?? service.duration, price: own?.price ?? service.price };
}

export interface TermsRange {
  duration: [Minutes, Minutes];
  price: [number, number];
}

/** Shortest–longest and cheapest–dearest across the given people (default: everyone who performs it). */
export function termsRange(service: Priced & Pick<Service, 'staffIds'>, staffIds: string[] = service.staffIds): TermsRange {
  const all = (staffIds.length ? staffIds : [null]).map((id) => termsFor(service, id));
  const d = all.map((x) => x.duration);
  const p = all.map((x) => x.price);
  return { duration: [Math.min(...d), Math.max(...d)], price: [Math.min(...p), Math.max(...p)] };
}

export function bookingDuration(state: TenantData, serviceId: string, addOnIds: string[] = [], staffId?: string | null): Minutes {
  const s = serviceOf(state, serviceId);
  const extra = addOnIds.reduce((sum, id) => sum + (state.addOns.find((a) => a.id === id)?.duration ?? 0), 0);
  return (s ? termsFor(s, staffId).duration : 0) + extra;
}

export function bookingPrice(state: TenantData, serviceId: string, addOnIds: string[] = [], staffId?: string | null): number {
  const s = serviceOf(state, serviceId);
  const extra = addOnIds.reduce((sum, id) => sum + (state.addOns.find((a) => a.id === id)?.price ?? 0), 0);
  return (s ? termsFor(s, staffId).price : 0) + extra;
}

/**
 * Duration and price of an existing appointment if it moves to `staffId`.
 * Staying with the same person keeps what was booked; a new person brings their own terms.
 */
export function termsIfMoved(state: TenantData, a: Appointment, staffId: string): { duration: Minutes; price: number } {
  if (staffId === a.staffId) return { duration: a.duration, price: a.price };
  return { duration: bookingDuration(state, a.serviceId, a.addOnIds, staffId), price: bookingPrice(state, a.serviceId, a.addOnIds, staffId) };
}

export function eligibleStaff(state: TenantData, serviceId: string, online = false): Staff[] {
  const s = serviceOf(state, serviceId);
  return state.staff.filter((st) => st.active && (!online || st.onlineBookable) && (!s || s.staffIds.includes(st.id)));
}

export interface Slot {
  start: Minutes;
  staffIds: string[];
}

export interface SlotQuery {
  serviceId: string;
  addOnIds?: string[];
  staffId: string | 'any';
  date: ISODate;
  now?: Date;
  excludeAppointmentId?: string;
  /** Online bookings respect lead time + horizon; staff-side bookings don't. */
  online?: boolean;
}

/** "Today" and the current minute in the business's timezone. */
export const businessNow = (state: TenantData, now = new Date()) => zonedNow(state.business.timezone, now);

export function availableSlots(state: TenantData, q: SlotQuery): Slot[] {
  const service = serviceOf(state, q.serviceId);
  if (!service || isClass(service)) return [];
  const { policies } = state.business;
  const here = businessNow(state, q.now);
  if (q.date < here.date) return [];
  if (q.online && diffDays(q.date, here.date) > policies.maxAdvanceDays) return [];

  const step = policies.slotInterval;
  // Minutes into q.date before which nothing may start (lead time can spill past midnight).
  const lead = q.online ? policies.leadTimeMinutes : 0;
  const earliest = here.minutes + lead - diffDays(q.date, here.date) * 1440;

  const pool = eligibleStaff(state, q.serviceId, q.online)
    .filter((s) => q.staffId === 'any' || s.id === q.staffId)
    .map((s) => s.id);

  const byStart = new Map<number, string[]>();
  for (const staffId of pool) {
    const d = staffDay(state, staffId, q.date);
    if (!d.shift.length) continue;
    const duration = bookingDuration(state, q.serviceId, q.addOnIds, staffId);
    const busy = busyRanges(state, d, q.serviceId, { appointmentId: q.excludeAppointmentId });
    for (const r of d.shift) {
      for (let t = Math.ceil(r.start / step) * step; t + duration <= r.end; t += step) {
        if (t < earliest) continue;
        const held = { start: t - service.bufferBefore, end: t + duration + service.bufferAfter };
        if (busy.some((b) => overlaps(b, held))) continue;
        const list = byStart.get(t) ?? [];
        list.push(staffId);
        byStart.set(t, list);
      }
    }
  }
  return [...byStart.entries()].sort((a, b) => a[0] - b[0]).map(([start, staffIds]) => ({ start, staffIds }));
}

/** For "any available": the least-booked qualified person that day. */
export function pickStaff(state: TenantData, date: ISODate, candidates: string[]): string {
  const load = (id: string) =>
    state.appointments.filter((a) => a.staffId === id && a.date === date && !a.sessionId && occupiesTime(a)).reduce((m, a) => m + a.duration, 0) +
    liveSessions(state).filter((s) => s.staffId === id && s.date === date).reduce((m, s) => m + s.duration, 0);
  return [...candidates].sort((a, b) => load(a) - load(b) || a.localeCompare(b))[0];
}

export function firstAvailableDate(state: TenantData, q: Omit<SlotQuery, 'date'>, from: ISODate, horizon = 60): ISODate | null {
  for (let i = 0; i <= horizon; i++) {
    const date = addDays(from, i);
    if (availableSlots(state, { ...q, date }).length) return date;
  }
  return null;
}

export interface Opening {
  date: ISODate;
  start: Minutes;
  staffIds: string[];
}

export function nextOpenings(state: TenantData, serviceId: string, count: number, now = new Date()): Opening[] {
  const out: Opening[] = [];
  const today = businessNow(state, now).date;
  for (let i = 0; i < 21 && out.length < count; i++) {
    const date = addDays(today, i);
    const slots = availableSlots(state, { serviceId, staffId: 'any', date, now, online: true });
    // Spread suggestions across the day instead of listing consecutive slots.
    let lastStart = -999;
    for (const s of slots) {
      if (s.start - lastStart < 120) continue;
      out.push({ date, ...s });
      lastStart = s.start;
      if (out.length >= count) break;
    }
  }
  return out;
}

type Timed = Pick<Appointment, 'date' | 'start'>;

/** Real instant an appointment starts. Pass the business timezone; without it the browser's is assumed. */
export const appointmentStart = (a: Timed, timeZone?: string) => (timeZone ? zonedInstant(a.date, a.start, timeZone) : atMinutes(a.date, a.start));
export const appointmentEnd = (a: Timed & Pick<Appointment, 'duration'>, timeZone?: string) =>
  new Date(appointmentStart(a, timeZone).getTime() + a.duration * 60_000);

export function isUpcoming(a: Timed & Pick<Appointment, 'duration' | 'status'>, now = new Date(), timeZone?: string) {
  return ACTIVE_STATUSES.has(a.status) && a.status !== 'completed' && appointmentEnd(a, timeZone) > now;
}
