import { useSyncExternalStore } from 'react';
import { availableSlots, businessNow, firstAvailableDate } from '../../domain/scheduling';
import type { TenantData } from '../../domain/types';
import type { PublicBooking, PublicBookingApi, PublicBusiness } from '../contracts';
import { Resource, rpc } from './client';

interface PublicView {
  business: PublicBusiness;
  preview: boolean;
  /** Schedules and busy time only — enough to show open slots. */
  availability: TenantData;
}

const views = new Resource<PublicView | null>((slug) => rpc<PublicView | null>('public.business', slug));
const bookings = new Resource<PublicBooking | null>((key) => {
  const [slug, token] = JSON.parse(key) as [string, string];
  return rpc<PublicBooking | null>('public.booking', slug, token);
});
const bookingKey = (slug: string, token: string) => JSON.stringify([slug, token]);

/** Someone else may have booked in the meantime: refresh open slots when the page regains focus. */
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => views.keys().forEach((k) => void views.refresh(k)));
}

const online = (staffId: string | 'any') => ({ staffId, online: true as const });

const results = new WeakMap<PublicView, { business: PublicBusiness; preview: boolean }>();
const resultOf = (v: PublicView) => {
  let r = results.get(v);
  if (!r) results.set(v, (r = { business: v.business, preview: v.preview }));
  return r;
};

async function afterChange(slug: string, booking: PublicBooking) {
  bookings.set(bookingKey(slug, booking.id), booking);
  await views.refresh(slug);
  return booking;
}

export const remotePublicBooking: PublicBookingApi = {
  useBusiness(slug) {
    const v = useSyncExternalStore(views.subscribe, () => views.read(slug));
    if (v === undefined) return null;
    return v ? resultOf(v) : undefined;
  },

  slots(slug, q) {
    const t = views.peek(slug)?.availability;
    if (!t) return [];
    return availableSlots(t, { serviceId: q.serviceId, addOnIds: q.addOnIds, date: q.date, excludeAppointmentId: q.excludeBookingId, ...online(q.staffId) });
  },

  firstAvailable(slug, q, from) {
    const t = views.peek(slug)?.availability;
    if (!t) return null;
    return firstAvailableDate(t, { serviceId: q.serviceId, addOnIds: q.addOnIds, excludeAppointmentId: q.excludeBookingId, ...online(q.staffId) }, from, t.business.policies.maxAdvanceDays);
  },

  today(slug) {
    const t = views.peek(slug)?.availability;
    return businessNow(t ?? ({ business: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } } as TenantData)).date;
  },

  async createBooking(slug, input) {
    try {
      return await afterChange(slug, await rpc<PublicBooking>('public.createBooking', slug, input));
    } catch (e) {
      void views.refresh(slug);
      throw e;
    }
  },

  useBooking(slug, token) {
    const key = bookingKey(slug, token);
    const b = useSyncExternalStore(bookings.subscribe, () => bookings.read(key));
    if (b === undefined) return null;
    return b ?? undefined;
  },

  async findBooking(slug, code, phone) {
    const b = await rpc<PublicBooking | null>('public.findBooking', slug, code, phone);
    if (b) bookings.set(bookingKey(slug, b.id), b);
    return b;
  },

  async cancelBooking(slug, token) {
    return afterChange(slug, await rpc<PublicBooking>('public.cancelBooking', slug, token));
  },

  async rescheduleBooking(slug, token, to) {
    return afterChange(slug, await rpc<PublicBooking>('public.rescheduleBooking', slug, token, to));
  },
};
