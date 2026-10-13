import { joinBlock, seatsLeft, upcomingSessions } from '../domain/classes';
import type { TenantData } from '../domain/types';
import type { PublicSession } from './contracts';

/** Longest stretch the booking page asks for at once. */
const MAX_DAYS = 62;

/**
 * A class's sessions for the booking page, from the tenant or its
 * availability view. Sessions that already started are left out; full or
 * closed ones stay, so people can join the waitlist or see what's coming.
 */
export function publicSessions(t: TenantData, q: { serviceId: string; from: string; days: number }, now = new Date()): PublicSession[] {
  const service = t.services.find((s) => s.id === q.serviceId && s.active && s.onlineBookable);
  if (!service) return [];
  const staff = new Set(t.staff.filter((s) => s.active && s.onlineBookable).map((s) => s.id));
  const days = Math.max(1, Math.min(MAX_DAYS, Math.round(q.days) || 1));
  return upcomingSessions(t, { serviceId: service.id, from: q.from, days })
    .filter((s) => staff.has(s.staffId))
    .map((s) => ({
      id: s.id,
      serviceId: s.serviceId,
      staffId: s.staffId,
      date: s.date,
      start: s.start,
      duration: s.duration,
      price: s.price,
      capacity: s.capacity,
      seatsLeft: seatsLeft(t, s),
      waiting: s.waitlist.length,
      block: joinBlock(t, s, true, now),
    }))
    .filter((s) => s.block !== 'past');
}
