import { appointmentStart, isUpcoming } from './scheduling';
import type { Appointment, BookingPolicies } from './types';

export interface PolicyDecision {
  allowed: boolean;
  /** Last moment the customer may act online. */
  deadline: Date;
  reason?: 'past' | 'inactive' | 'window' | 'disabled';
}

type Booking = Pick<Appointment, 'date' | 'start' | 'duration' | 'status' | 'sessionId'>;

function decide(a: Booking, enabled: boolean, hours: number, timeZone: string, now: Date): PolicyDecision {
  const deadline = new Date(appointmentStart(a, timeZone).getTime() - hours * 3_600_000);
  if (!isUpcoming(a, now, timeZone)) return { allowed: false, deadline, reason: a.status === 'cancelled' ? 'inactive' : 'past' };
  if (!enabled) return { allowed: false, deadline, reason: 'disabled' };
  if (now > deadline) return { allowed: false, deadline, reason: 'window' };
  return { allowed: true, deadline };
}

export const canCustomerCancel = (a: Booking, p: BookingPolicies, timeZone: string, now = new Date()) =>
  decide(a, p.customerCanCancel, p.cancelWindowHours, timeZone, now);
/** A seat in a class can't move on its own: the customer cancels and joins another session. */
export const canCustomerReschedule = (a: Booking, p: BookingPolicies, timeZone: string, now = new Date()) =>
  decide(a, p.customerCanReschedule && !a.sessionId, p.rescheduleWindowHours, timeZone, now);
