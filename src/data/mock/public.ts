import { useMemo } from 'react';
import { canCustomerCancel, canCustomerReschedule } from '../../domain/policy';
import { availableSlots, businessNow, firstAvailableDate, isClass, pickStaff, sessionsOf, termsIfMoved } from '../../domain/scheduling';
import { joinBlock } from '../../domain/classes';
import { WEEKDAYS } from '../../domain/defaults';
import { pageOf } from '../../domain/page';
import type { Appointment, ClassSession, TenantData } from '../../domain/types';
import { ApiError, type PublicBooking, type PublicBookingApi, type PublicBookingInput, type PublicBusiness, type SessionJoinInput } from '../contracts';
import { publicSessions } from '../sessions';
import { getDb, getSession, latency, mutateTenant, uid, useMockDb, useMockSession, type MockDatabase } from './db';
import {
  afterJoin,
  appointmentEvent,
  cancelledBy,
  hasSeat,
  insertAppointment,
  newAppointment,
  newSeat,
  normalizePhone,
  patchAppointmentIn,
  upsertCustomer,
  withOwnerAlert,
} from './workspace';

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

function checkCustomer(t: TenantData, customer: PublicBookingInput['customer']) {
  if (!customer?.name?.trim() || normalizePhone(customer.phone ?? '').length < 9) throw new ApiError('invalid');
  if (t.business.policies.requireEmail && !customer.email) throw new ApiError('invalid');
  if (isBlocked(t, customer)) throw new ApiError('blocked');
}

/** A session someone may sign up to online: its class and instructor are on the booking page. */
function onlineSession(t: TenantData, sessionId: string): ClassSession {
  const s = sessionsOf(t).find((x) => x.id === sessionId);
  const listed = s && t.services.some((x) => x.id === s.serviceId && x.active && x.onlineBookable) && t.staff.some((x) => x.id === s.staffId && x.active && x.onlineBookable);
  if (!s || !listed) throw new ApiError('not_found');
  return s;
}

/** Most people a single session's waitlist holds. */
const WAITLIST_LIMIT = 100;

/** Case, spacing, niqqud and punctuation (geresh, hyphens, quotes) don't count when comparing names. */
const nameKey = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u0591-\u05c7\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

/** The name the customer types matches their whole saved name or any single word of it. */
const nameMatches = (saved: string, given: string) => {
  const full = nameKey(saved);
  return full === given || full.split(' ').includes(given);
};

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
      .map(({ id, categoryId, name, description, duration, price, bufferBefore, bufferAfter, staffIds: ids, staffTerms, imageUrl, capacity }) => ({
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
        capacity,
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
    business: { ...t.business, subscription: { status: 'not_configured', planId: null }, calendarFeeds: undefined, invites: undefined, usage: undefined },
    staff: t.staff.map(({ userId: _userId, ...s }) => s),
    timeOff: t.timeOff.map(({ note: _note, ...x }) => x),
    blocks: t.blocks.map((b) => ({ ...b, label: '' })),
    customers: [],
    outbox: [],
    pushDevices: undefined,
    appointments: t.appointments
      .filter((a) => a.date >= from && a.status !== 'cancelled')
      .map((a) => ({ ...a, code: '', customerId: '', note: undefined, internalNote: undefined, cancellation: undefined, history: [], price: 0 })),
    sessions: sessionsOf(t)
      .filter((s) => s.date >= from && s.status === 'scheduled')
      .map((s) => ({ ...s, note: undefined, waitlist: s.waitlist.map(() => ({ id: '', customerId: '', at: '' })) })),
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
    sessionId: a.sessionId,
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
    if (!service || isClass(service)) throw new ApiError('invalid');
    if (input.staffId === 'any' && !t.business.policies.allowAnyStaff) throw new ApiError('invalid');
    checkCustomer(t, input.customer);
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

  async findBookings(slug, phone, proof) {
    await latency(400);
    const t = requireTenant(slug);
    const digits = normalizePhone(phone);
    const given = nameKey(proof);
    if (digits.length < 9 || !given) return [];
    const mine = new Set(t.customers.filter((c) => normalizePhone(c.phone) === digits).map((c) => c.id));
    const byCode = t.appointments.find((a) => mine.has(a.customerId) && a.code.toUpperCase() === proof.trim().toUpperCase());
    if (byCode) return [toPublic(t, byCode)];
    const named = new Set(t.customers.filter((c) => mine.has(c.id) && nameMatches(c.name, given)).map((c) => c.id));
    const today = businessNow(t).date;
    return t.appointments
      .filter((a) => named.has(a.customerId) && a.status !== 'cancelled' && a.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
      .map((a) => toPublic(t, a));
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

  sessions(slug, q) {
    const t = bySlug(getDb(), slug);
    return t ? publicSessions(t, q) : [];
  },

  async joinSession(slug, input: SessionJoinInput) {
    await latency(600);
    const t = requireTenant(slug);
    checkCustomer(t, input.customer);
    onlineSession(t, input.sessionId);
    let created!: Appointment;
    let after!: TenantData;
    mutateTenant(t.business.id, (cur) => {
      // Seats are counted again on the latest data, so two people can't take the last one.
      const s = onlineSession(cur, input.sessionId);
      const block = joinBlock(cur, s, true);
      if (block === 'full') throw new ApiError('slot_taken');
      if (block) throw new ApiError('policy');
      const [customers, customer] = upsertCustomer(cur, input.customer);
      const withCustomer = { ...cur, customers };
      if (hasSeat(withCustomer, s.id, customer.id)) throw new ApiError('exists');
      const status = cur.business.policies.confirmationMode === 'manual' ? 'pending' : 'confirmed';
      created = newSeat(withCustomer, s, customer.id, { status, source: 'online', note: input.customer.note || undefined }, 'customer');
      after = afterJoin(withOwnerAlert(insertAppointment(withCustomer, created), created, 'ownerBooked'), s.id, customer.id);
      return after;
    });
    return toPublic(after, created);
  },

  async joinWaitlist(slug, input: SessionJoinInput) {
    await latency(500);
    const t = requireTenant(slug);
    checkCustomer(t, input.customer);
    onlineSession(t, input.sessionId);
    let position = 0;
    mutateTenant(t.business.id, (cur) => {
      const s = onlineSession(cur, input.sessionId);
      const block = joinBlock(cur, s, true);
      if (block !== 'full') throw new ApiError(block ? 'policy' : 'invalid');
      const [customers, customer] = upsertCustomer(cur, input.customer);
      const withCustomer = { ...cur, customers };
      if (hasSeat(withCustomer, s.id, customer.id)) throw new ApiError('exists');
      const mine = s.waitlist.findIndex((w) => w.customerId === customer.id);
      if (mine >= 0) {
        position = mine + 1;
        return cur;
      }
      if (s.waitlist.length >= WAITLIST_LIMIT) throw new ApiError('policy');
      position = s.waitlist.length + 1;
      const waitlist = [...s.waitlist, { id: uid('w'), customerId: customer.id, at: new Date().toISOString() }];
      return { ...withCustomer, sessions: sessionsOf(cur).map((x) => (x.id === s.id ? { ...s, waitlist } : x)) };
    });
    return { sessionId: input.sessionId, position };
  },
};
