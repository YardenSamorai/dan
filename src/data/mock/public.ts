import { useMemo } from 'react';
import { canCustomerCancel, canCustomerReschedule } from '../../domain/policy';
import { availableSlots, businessNow, firstAvailableDate, pickStaff, termsIfMoved } from '../../domain/scheduling';
import { WEEKDAYS } from '../../domain/defaults';
import { pageOf } from '../../domain/page';
import type { Appointment, TenantData } from '../../domain/types';
import { ApiError, type PublicBooking, type PublicBookingApi, type PublicBusiness } from '../contracts';
import { getDb, getSession, latency, mutateTenant, useMockDb, useMockSession, type MockDatabase } from './db';
import { appointmentEvent, cancelledBy, insertAppointment, newAppointment, normalizePhone, patchAppointmentIn, upsertCustomer, withOwnerAlert } from './workspace';

/**
 * Mock of the public booking endpoints. Availability is computed here from the
 * tenant's full data — exactly what a server does — but callers only ever get
 * the public projection and slot lists back.
 */

export const bySlug = (db: MockDatabase, slug: string): TenantData | undefined => Object.values(db.tenants).find((t) => t.business.slug === slug);

function requireTenant(slug: string) {
  const t = bySlug(getDb(), slug);
  if (!t || !visible(getDb(), t, getSession()?.userId)) throw new ApiError('not_found');
  return t;
}

/** A blocked customer is recognised by either phone or email, so changing one of them isn't enough to get back in. */
function isBlocked(t: TenantData, who: { phone: string; email?: string }) {
  const phone = normalizePhone(who.phone);
  const email = who.email?.trim().toLowerCase();
  return t.customers.some((c) => c.blocked && (normalizePhone(c.phone) === phone || (!!email && c.email?.trim().toLowerCase() === email)));
}

export const visible = (db: MockDatabase, t: TenantData, userId?: string) =>
  t.business.status === 'published' || (!!userId && db.members.some((m) => m.businessId === t.business.id && m.userId === userId));

const projections = new WeakMap<TenantData, PublicBusiness>();

export function project(t: TenantData): PublicBusiness {
  const cached = projections.get(t);
  if (cached) return cached;
  const b = t.business;
  const today = businessNow(t).date;
  const staff = t.staff.filter((s) => s.active && s.onlineBookable);
  const staffIds = new Set(staff.map((s) => s.id));
  const p = b.policies;
  const out: PublicBusiness = {
    id: b.id,
    slug: b.slug,
    type: b.type,
    status: b.status,
    name: b.name,
    tagline: b.tagline,
    description: b.description,
    timezone: b.timezone,
    currency: b.currency,
    defaultLocale: b.defaultLocale,
    address: b.address,
    phone: b.phone,
    email: b.email,
    social: b.social,
    branding: b.branding,
    page: pageOf(b.page, staff.length),
    hours: b.hours,
    specialDays: t.exceptions
      .filter((e) => e.staffId === null && e.date >= today)
      .sort((x, y) => x.date.localeCompare(y.date))
      .slice(0, 6)
      .map(({ date, closed, ranges, label }) => ({ date, closed, ranges, label })),
    policies: {
      slotInterval: p.slotInterval,
      leadTimeMinutes: p.leadTimeMinutes,
      maxAdvanceDays: p.maxAdvanceDays,
      cancelWindowHours: p.cancelWindowHours,
      rescheduleWindowHours: p.rescheduleWindowHours,
      customerCanCancel: p.customerCanCancel,
      customerCanReschedule: p.customerCanReschedule,
      allowAnyStaff: p.allowAnyStaff && staff.length > 1,
      requireEmail: p.requireEmail,
      confirmationMode: p.confirmationMode,
    },
    reminderHoursBefore: b.notifications.reminder.enabled ? b.notifications.reminder.hoursBefore : null,
    categories: t.categories.map(({ id, name }) => ({ id, name })),
    services: t.services
      .filter((s) => s.active && s.onlineBookable && s.staffIds.some((id) => staffIds.has(id)))
      .map(({ id, categoryId, name, description, duration, price, bufferBefore, bufferAfter, staffIds: ids, staffTerms, imageUrl }) => ({
        id,
        categoryId,
        name,
        description,
        duration,
        price,
        bufferBefore,
        bufferAfter,
        staffIds: ids.filter((x) => staffIds.has(x)),
        staffTerms: staffTerms && Object.fromEntries(Object.entries(staffTerms).filter(([x]) => staffIds.has(x))),
        imageUrl,
      })),
    addOns: t.addOns.filter((a) => a.active).map(({ id, name, duration, price }) => ({ id, name, duration, price })),
    staff: staff.map((s) => ({
      id: s.id,
      name: s.name,
      role: s.role,
      bio: s.bio,
      color: s.color,
      avatarUrl: s.avatarUrl,
      workingDays: WEEKDAYS.filter((d) => s.schedule[d].ranges.length > 0),
    })),
  };
  projections.set(t, out);
  return out;
}

/**
 * What a browser needs to compute open slots itself: schedules and busy time,
 * without customers, notes, codes or history. The server re-checks every booking.
 */
export function availabilityView(t: TenantData): TenantData {
  const from = businessNow(t).date;
  return {
    ...t,
    business: { ...t.business, subscription: { status: 'not_configured', planId: null }, calendarFeeds: undefined, invites: undefined },
    staff: t.staff.map(({ userId: _userId, ...s }) => s),
    timeOff: t.timeOff.map(({ note: _note, ...x }) => x),
    blocks: t.blocks.map((b) => ({ ...b, label: '' })),
    customers: [],
    outbox: [],
    appointments: t.appointments
      .filter((a) => a.date >= from && a.status !== 'cancelled')
      .map((a) => ({ ...a, code: '', customerId: '', note: undefined, internalNote: undefined, cancellation: undefined, history: [], price: 0 })),
  };
}

export function toPublic(t: TenantData, a: Appointment): PublicBooking {
  const c = t.customers.find((x) => x.id === a.customerId);
  return {
    id: a.id,
    code: a.code,
    serviceId: a.serviceId,
    addOnIds: a.addOnIds,
    staffId: a.staffId,
    anyStaff: a.anyStaff,
    date: a.date,
    start: a.start,
    duration: a.duration,
    price: a.price,
    status: a.status,
    customerFirstName: c?.name.split(' ')[0] ?? '',
    contactPhone: c?.phone ?? '',
    cancellation: a.cancellation,
  };
}

const online = (staffId: string | 'any') => ({ staffId, online: true as const });

export const mockPublicBooking: PublicBookingApi = {
  useBusiness(slug) {
    const db = useMockDb();
    const session = useMockSession();
    const t = bySlug(db, slug);
    const show = !!t && visible(db, t, session?.userId);
    return useMemo(() => (t && show ? { business: project(t), preview: t.business.status !== 'published' } : undefined), [t, show]);
  },

  slots(slug, q) {
    const t = bySlug(getDb(), slug);
    if (!t) return [];
    return availableSlots(t, { serviceId: q.serviceId, addOnIds: q.addOnIds, date: q.date, excludeAppointmentId: q.excludeBookingId, ...online(q.staffId) });
  },

  firstAvailable(slug, q, from) {
    const t = bySlug(getDb(), slug);
    if (!t) return null;
    return firstAvailableDate(t, { serviceId: q.serviceId, addOnIds: q.addOnIds, excludeAppointmentId: q.excludeBookingId, ...online(q.staffId) }, from, t.business.policies.maxAdvanceDays);
  },

  today(slug) {
    const t = bySlug(getDb(), slug);
    return businessNow(t ?? ({ business: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } } as TenantData)).date;
  },

  async createBooking(slug, input) {
    await latency(700);
    const t = requireTenant(slug);
    const service = t.services.find((s) => s.id === input.serviceId && s.active && s.onlineBookable);
    if (!service) throw new ApiError('invalid');
    if (input.staffId === 'any' && !t.business.policies.allowAnyStaff) throw new ApiError('invalid');
    if (!input.customer.name.trim() || normalizePhone(input.customer.phone).length < 9) throw new ApiError('invalid');
    if (t.business.policies.requireEmail && !input.customer.email) throw new ApiError('invalid');
    if (isBlocked(t, input.customer)) throw new ApiError('blocked');
    const slot = availableSlots(t, { ...input, online: true }).find((x) => x.start === input.start);
    if (!slot) throw new ApiError('slot_taken');
    const staffId = input.staffId === 'any' ? pickStaff(t, input.date, slot.staffIds) : input.staffId;
    let created!: Appointment;
    let after!: TenantData;
    mutateTenant(t.business.id, (cur) => {
      const [customers, customer] = upsertCustomer(cur, input.customer);
      const withCustomer = { ...cur, customers };
      created = newAppointment(
        withCustomer,
        {
          customerId: customer.id,
          staffId,
          serviceId: input.serviceId,
          addOnIds: input.addOnIds,
          date: input.date,
          start: input.start,
          status: cur.business.policies.confirmationMode === 'manual' ? 'pending' : 'confirmed',
          source: 'online',
          anyStaff: input.staffId === 'any',
          note: input.customer.note || undefined,
        },
        'customer',
      );
      after = withOwnerAlert(insertAppointment(withCustomer, created), created, 'ownerBooked');
      return after;
    });
    return toPublic(after, created);
  },

  useBooking(slug, token) {
    const db = useMockDb();
    const t = bySlug(db, slug);
    const a = t?.appointments.find((x) => x.id === token);
    return useMemo(() => (t && a ? toPublic(t, a) : undefined), [t, a]);
  },

  async findBooking(slug, code, phone) {
    await latency(400);
    const t = requireTenant(slug);
    const digits = normalizePhone(phone);
    const a = t.appointments.find((x) => {
      const c = t.customers.find((y) => y.id === x.customerId);
      return x.code.toUpperCase() === code.trim().toUpperCase() && c && normalizePhone(c.phone) === digits;
    });
    return a ? toPublic(t, a) : null;
  },

  async cancelBooking(slug, token) {
    await latency(500);
    const t = requireTenant(slug);
    const a = t.appointments.find((x) => x.id === token);
    if (!a) throw new ApiError('not_found');
    if (!canCustomerCancel(a, t.business.policies, t.business.timezone).allowed) throw new ApiError('policy');
    const out = patchAppointmentIn(
      t.business.id,
      a.id,
      (x) => ({ ...x, status: 'cancelled', cancellation: cancelledBy('customer'), history: [...x.history, appointmentEvent('cancelled', 'customer')] }),
      ['cancellation'],
      'ownerCancelled',
    );
    return toPublic(getDb().tenants[t.business.id], out);
  },

  async rescheduleBooking(slug, token, to) {
    await latency(600);
    const t = requireTenant(slug);
    const a = t.appointments.find((x) => x.id === token);
    if (!a) throw new ApiError('not_found');
    if (!canCustomerReschedule(a, t.business.policies, t.business.timezone).allowed) throw new ApiError('policy');
    const customer = t.customers.find((c) => c.id === a.customerId);
    if (customer && isBlocked(t, customer)) throw new ApiError('blocked');
    const slot = availableSlots(t, {
      serviceId: a.serviceId,
      addOnIds: a.addOnIds,
      staffId: a.anyStaff ? 'any' : a.staffId,
      date: to.date,
      excludeAppointmentId: a.id,
      online: true,
    }).find((s) => s.start === to.start);
    if (!slot) throw new ApiError('slot_taken');
    const staffId = slot.staffIds.includes(a.staffId) ? a.staffId : pickStaff(t, to.date, slot.staffIds);
    const detail = `${a.date} ${a.start} ${a.staffId} → ${to.date} ${to.start} ${staffId}`;
    const out = patchAppointmentIn(
      t.business.id,
      a.id,
      (x) => ({ ...x, ...termsIfMoved(t, a, staffId), date: to.date, start: to.start, staffId, history: [...x.history, appointmentEvent('rescheduled', 'customer', detail)] }),
      ['reschedule', 'reminder'],
      'ownerRescheduled',
    );
    return toPublic(getDb().tenants[t.business.id], out);
  },
};
