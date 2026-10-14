import type { Appointment, AppointmentEvent, OwnerAlertKind, PushDevice, TenantData } from './types';

/**
 * What customers did online (booked, cancelled, moved), read from each
 * appointment's history. The workspace bell lists it; push notifications
 * announce it as it happens.
 */
export interface Activity {
  /** Stable: the appointment and the event's place in its history. */
  id: string;
  kind: OwnerAlertKind;
  at: string;
  appointment: Appointment;
}

const KIND: Partial<Record<AppointmentEvent['type'], OwnerAlertKind>> = { created: 'ownerBooked', cancelled: 'ownerCancelled', rescheduled: 'ownerRescheduled' };

function eventsOf(a: Appointment, from = 0): Activity[] {
  return a.history.slice(from).flatMap((e, i) => {
    const kind = e.by === 'customer' ? KIND[e.type] : undefined;
    return kind ? [{ id: `${a.id}:${from + i}`, kind, at: e.at, appointment: a }] : [];
  });
}

/** Newest first. Anything stamped after `now` (imported or demo data) is left out, so it can't stay "new" forever. */
export function customerActivity(t: TenantData, now = new Date(), limit = 30): Activity[] {
  const cutoff = now.toISOString();
  return t.appointments
    .flatMap((a) => eventsOf(a))
    .filter((x) => x.at <= cutoff)
    .sort((x, y) => y.at.localeCompare(x.at))
    .slice(0, limit);
}

/** What customers did between two saved versions of a business. */
export function newActivity(before: TenantData | undefined, after: TenantData): Activity[] {
  const seen = new Map(before?.appointments.map((a) => [a.id, a.history.length]));
  return after.appointments.flatMap((a) => eventsOf(a, seen.get(a.id) ?? 0));
}

/** Push services browsers actually use. Anything else is refused, so the server never posts to an address someone made up. */
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com', 'web.push.apple.com'];
const PUSH_HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com'];

export function isPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > 1024) return false;
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && (PUSH_HOSTS.includes(u.hostname) || PUSH_HOST_SUFFIXES.some((s) => u.hostname.endsWith(s)));
  } catch {
    return false;
  }
}

const B64URL = /^[A-Za-z0-9_-]+$/;

/** A browser's subscription as it arrives from the page, or null if it doesn't look like one. */
export function cleanPushDevice(v: unknown): Pick<PushDevice, 'endpoint' | 'p256dh' | 'auth'> | null {
  const d = v as Partial<PushDevice> | null;
  if (!d || typeof d.endpoint !== 'string' || typeof d.p256dh !== 'string' || typeof d.auth !== 'string') return null;
  if (!isPushEndpoint(d.endpoint)) return null;
  // An uncompressed P-256 point (65 bytes) and a 16-byte secret, base64url.
  if (!B64URL.test(d.p256dh) || d.p256dh.length < 86 || d.p256dh.length > 88) return null;
  if (!B64URL.test(d.auth) || d.auth.length < 21 || d.auth.length > 24) return null;
  return { endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth };
}

/** Enough for a team with a few devices each; the oldest go first. */
export const PUSH_DEVICE_LIMIT = 40;
