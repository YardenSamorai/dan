import { addDays, diffDays } from './time';
import { appointmentStart, businessNow, liveSessions, occupiesTime, sessionsOf } from './scheduling';
import type { Appointment, ClassSession, ISODate, OutboxMessage, TenantData } from './types';

/**
 * Group classes: the business opens sessions (pilates, Tuesday 18:00, 8
 * seats) and people join them. Pure functions over one tenant, shared by the
 * booking page, the app and the server.
 */

/** People holding a seat (cancelled and no-show seats are free again). */
export const participantsOf = (state: TenantData, sessionId: string): Appointment[] =>
  state.appointments.filter((a) => a.sessionId === sessionId && occupiesTime(a));

export const seatsLeft = (state: TenantData, s: ClassSession) => Math.max(0, s.capacity - participantsOf(state, s.id).length);

/** Why nobody can join right now: cancelled, already started, past the sign-up cutoff, beyond the booking horizon, or full. */
export type JoinBlock = 'cancelled' | 'past' | 'closed' | 'too_far' | 'full';

/** Online joins keep the business's minimum notice and horizon; the team can add people up to the start. */
export function joinBlock(state: TenantData, s: ClassSession, online: boolean, now = new Date()): JoinBlock | null {
  if (s.status === 'cancelled') return 'cancelled';
  const { policies, timezone } = state.business;
  const start = appointmentStart(s, timezone).getTime();
  if (start <= now.getTime()) return 'past';
  if (online && start - now.getTime() < policies.leadTimeMinutes * 60_000) return 'closed';
  if (online && diffDays(s.date, businessNow(state, now).date) > policies.maxAdvanceDays) return 'too_far';
  if (seatsLeft(state, s) === 0) return 'full';
  return null;
}

/** A waitlist is worth joining only when the session is full but otherwise open. */
export const canWait = (state: TenantData, s: ClassSession, now = new Date()) => joinBlock(state, s, true, now) === 'full';

/** Scheduled sessions from `from` for `days` days, in time order. */
export function upcomingSessions(state: TenantData, q: { from: ISODate; days: number; serviceId?: string; staffId?: string }): ClassSession[] {
  const until = addDays(q.from, q.days - 1);
  return liveSessions(state)
    .filter((s) => s.date >= q.from && s.date <= until && (!q.serviceId || s.serviceId === q.serviceId) && (!q.staffId || s.staffId === q.staffId))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
}

/** The page a seat offer links to: the session's own sign-up step. */
export const sessionPath = (slug: string, sessionId: string) => `/book/${slug}/class/${sessionId}`;

export function waitlistEntry(state: TenantData, entryId: string) {
  for (const session of sessionsOf(state)) {
    const entry = session.waitlist.find((w) => w.id === entryId);
    if (entry) return { session, entry };
  }
  return null;
}

/**
 * The appointment a message is about. A seat offer has none yet, so it gets
 * one shaped from the session and the waiting person, for the same wording,
 * recipient and template values.
 */
export function messageSubject(state: TenantData, m: Pick<OutboxMessage, 'appointmentId' | 'kind'>): Appointment | null {
  const a = state.appointments.find((x) => x.id === m.appointmentId);
  if (a) return a;
  if (m.kind !== 'spotOpen') return null;
  const found = waitlistEntry(state, m.appointmentId);
  return found ? offerSubject(found.session, found.entry.id, found.entry.customerId, found.entry.at) : null;
}

export function offerSubject(s: ClassSession, id: string, customerId: string, at: string): Appointment {
  return {
    businessId: s.businessId,
    id,
    code: '',
    customerId,
    staffId: s.staffId,
    serviceId: s.serviceId,
    addOnIds: [],
    date: s.date,
    start: s.start,
    duration: s.duration,
    price: s.price,
    status: 'confirmed',
    source: 'online',
    anyStaff: false,
    sessionId: s.id,
    createdAt: at,
    updatedAt: at,
    history: [],
  };
}
