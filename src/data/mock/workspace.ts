import { useMemo } from 'react';
import { cleanPushDevice, PUSH_DEVICE_LIMIT } from '../../domain/activity';
import { IMPORT_LIMIT, LIMITS, mergeNotes } from '../../domain/customerImport';
import { alertsOf, notificationsOf, renderMessage, renderOwnerAlert } from '../../domain/notifications';
import { locales } from '../../i18n/config';
import { callingCode, cleanPhone, phoneKey } from '../../lib/phone';
import { can, type Permission } from '../../domain/permissions';
import { appointmentStart, availableSlots, bookingDuration, bookingPrice, checkSlot, isClass, pickStaff, sessionsOf, termsFor, termsIfMoved } from '../../domain/scheduling';
import { joinBlock, offerSubject, participantsOf, seatsLeft } from '../../domain/classes';
import type { Actor, Appointment, AppointmentEvent, ClassSession, Customer, Invite, OutboxMessage, OwnerAlertKind, Service, TemplateKind, TenantData } from '../../domain/types';
import {
  ApiError,
  CAPACITY_LIMIT,
  INVITE_DAYS,
  REPEAT_LIMITS,
  type CustomerInput,
  type MemberInfo,
  type RepeatInput,
  type SeriesResult,
  type SessionSeriesResult,
  type StudioBookingInput,
  type TenantContext,
  type WorkspaceApi,
  type WorkspaceData,
} from '../contracts';
import { addDays } from '../../domain/time';
import { DEMO_BUSINESS_IDS, makeCode } from '../demo/seed';
import { getDb, latency, mutateDb, mutateTenant, mutateTenantIfStored, resetDemoData, uid, useMockDb, type MockDatabase } from './db';

const nowISO = () => new Date().toISOString();
const event = (type: AppointmentEvent['type'], by: Actor, detail?: string): AppointmentEvent => ({ at: nowISO(), type, by, detail });
export const normalizePhone = (p: string) => p.replace(/\D/g, '');
const feedKey = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), (n) => n.toString(16).padStart(2, '0')).join('');

// ── Shared tenant mutations (also used by the public adapter) ────────

function queueMessages(t: TenantData, a: Appointment, kind: TemplateKind): OutboxMessage[] {
  const settings = notificationsOf(t.business);
  const cfg = settings[kind];
  if (!cfg.enabled) return [];
  const rebookDays = kind === 'rebook' ? t.services.find((s) => s.id === a.serviceId)?.rebookAfterDays : undefined;
  if (kind === 'rebook' && !rebookDays) return [];
  const customer = t.customers.find((c) => c.id === a.customerId);
  const locale = customer?.locale ?? t.business.defaultLocale;
  const start = appointmentStart(a, t.business.timezone).getTime();
  const at =
    kind === 'reminder'
      ? new Date(start - settings.reminder.hoursBefore * 3_600_000)
      : kind === 'rebook'
        ? new Date(start + rebookDays! * 86_400_000)
        : new Date();
  return cfg.channels.map((channel) => ({
    businessId: t.business.id,
    id: uid('m'),
    appointmentId: a.id,
    kind,
    channel,
    locale,
    body: renderMessage(t, a, kind, locale),
    at: at.toISOString(),
    state: at > new Date() ? 'scheduled' : 'queued',
  }));
}

/** Alerts to the business about something a customer did online, per the business's alert settings. */
export function withOwnerAlert(t: TenantData, a: Appointment, kind: OwnerAlertKind): TenantData {
  const cfg = alertsOf(t.business);
  if (!(kind === 'ownerBooked' ? cfg.booked : cfg.changed)) return t;
  const at = nowISO();
  const body = renderOwnerAlert(t, a, kind);
  const alerts: OutboxMessage[] = cfg.channels.map((channel) => ({
    businessId: t.business.id,
    id: uid('m'),
    appointmentId: a.id,
    kind,
    to: 'owner',
    channel,
    locale: t.business.defaultLocale,
    body,
    at,
    state: 'queued',
  }));
  return alerts.length ? { ...t, outbox: [...t.outbox, ...alerts] } : t;
}

/** Messages are stored here; the server's dispatcher delivers them through whichever providers are connected. */
export function withMessages(t: TenantData, a: Appointment, kinds: TemplateKind[]): OutboxMessage[] {
  const kept = t.outbox.filter((m) => !(m.appointmentId === a.id && m.state === 'scheduled' && m.to !== 'owner'));
  // The visit-relative messages move with the visit and go away with it.
  const all: TemplateKind[] = kinds.includes('reminder') ? [...kinds, 'rebook'] : kinds;
  const active = a.status !== 'cancelled' ? all : all.filter((k) => k !== 'reminder' && k !== 'rebook');
  return [...kept, ...active.flatMap((k) => queueMessages(t, a, k))];
}

export function upsertCustomer(t: TenantData, input: CustomerInput, id?: string): [Customer[], Customer] {
  const existing = id ? t.customers.find((c) => c.id === id) : t.customers.find((c) => normalizePhone(c.phone) === normalizePhone(input.phone));
  if (existing) {
    const updated = { ...existing, name: input.name || existing.name, email: input.email || existing.email, locale: input.locale };
    return [t.customers.map((c) => (c.id === existing.id ? updated : c)), updated];
  }
  const created: Customer = {
    businessId: t.business.id,
    id: uid('c'),
    name: input.name,
    phone: input.phone,
    email: input.email,
    note: input.note,
    locale: input.locale,
    createdAt: nowISO(),
  };
  return [[...t.customers, created], created];
}

export function insertAppointment(t: TenantData, a: Appointment): TenantData {
  const next = { ...t, appointments: [...t.appointments, a] };
  return { ...next, outbox: withMessages(next, a, a.status === 'pending' ? [] : ['confirmation', 'reminder']) };
}

export function patchAppointmentIn(businessId: string, id: string, fn: (a: Appointment, t: TenantData) => Appointment, kinds: TemplateKind[] = [], alert?: OwnerAlertKind) {
  let out!: Appointment;
  mutateTenant(businessId, (t) => {
    const a = t.appointments.find((x) => x.id === id);
    if (!a) throw new ApiError('not_found');
    out = { ...fn(a, t), updatedAt: nowISO() };
    const next = { ...t, appointments: t.appointments.map((x) => (x.id === id ? out : x)) };
    const withCustomer = kinds.length ? { ...next, outbox: withMessages(next, out, kinds) } : next;
    const withAlert = alert ? withOwnerAlert(withCustomer, out, alert) : withCustomer;
    return out.sessionId ? withSeatOffers(withAlert, out.sessionId) : withAlert;
  });
  return out;
}

// ── Class sessions ───────────────────────────────────────────────────

const replaceSession = (t: TenantData, s: ClassSession): TenantData => ({ ...t, sessions: sessionsOf(t).map((x) => (x.id === s.id ? s : x)) });

/**
 * A seat is free and people are waiting: tell everyone not told yet. Whoever
 * joins first gets it. Nothing happens while the session is full or closed
 * to online sign-up.
 */
export function withSeatOffers(t: TenantData, sessionId: string): TenantData {
  const s = sessionsOf(t).find((x) => x.id === sessionId);
  if (!s || !notificationsOf(t.business).spotOpen.enabled || joinBlock(t, s, true)) return t;
  const seated = new Set(participantsOf(t, s.id).map((a) => a.customerId));
  const told = s.waitlist.filter((w) => !w.offeredAt && !seated.has(w.customerId));
  if (!told.length) return t;
  const at = nowISO();
  const messages = told.flatMap((w) => queueMessages(t, offerSubject(s, w.id, w.customerId, w.at), 'spotOpen'));
  const waitlist = s.waitlist.map((w) => (told.includes(w) ? { ...w, offeredAt: at } : w));
  return { ...replaceSession(t, { ...s, waitlist }), outbox: [...t.outbox, ...messages] };
}

/** After someone takes a seat: they leave the waitlist, and once the session is full the rest will hear about the next opening. */
export function afterJoin(t: TenantData, sessionId: string, customerId: string): TenantData {
  const s = sessionsOf(t).find((x) => x.id === sessionId);
  if (!s) return t;
  const full = seatsLeft(t, s) === 0;
  const waitlist = s.waitlist.filter((w) => w.customerId !== customerId).map((w) => (full && w.offeredAt ? { ...w, offeredAt: undefined } : w));
  return replaceSession(t, { ...s, waitlist });
}

/** A seat in `s`; date, time, person and price come from the session. */
export function newSeat(t: TenantData, s: ClassSession, customerId: string, fields: Pick<Appointment, 'status' | 'source' | 'note'>, by: Actor): Appointment {
  return {
    ...newAppointment(t, { customerId, staffId: s.staffId, serviceId: s.serviceId, addOnIds: [], date: s.date, start: s.start, anyStaff: false, ...fields }, by),
    duration: s.duration,
    price: s.price,
    sessionId: s.id,
  };
}

export const hasSeat = (t: TenantData, sessionId: string, customerId: string) => participantsOf(t, sessionId).some((a) => a.customerId === customerId);

export function newAppointment(t: TenantData, fields: Pick<Appointment, 'customerId' | 'staffId' | 'serviceId' | 'addOnIds' | 'date' | 'start' | 'status' | 'source' | 'anyStaff' | 'note'>, by: Actor): Appointment {
  return {
    businessId: t.business.id,
    id: uid('a'),
    code: makeCode(),
    ...fields,
    duration: bookingDuration(t, fields.serviceId, fields.addOnIds, fields.staffId),
    price: bookingPrice(t, fields.serviceId, fields.addOnIds, fields.staffId),
    createdAt: nowISO(),
    updatedAt: nowISO(),
    history: [event('created', by)],
  };
}

export const cancelledBy = (by: Actor, reason?: string) => ({ at: nowISO(), by, reason });
export { event as appointmentEvent };

// ── Authorization (imitates what the server must do) ─────────────────

function tenantOf(ctx: TenantContext): TenantData {
  const db = getDb();
  const member = db.members.find((m) => m.businessId === ctx.businessId && m.userId === ctx.userId);
  if (!member) throw new ApiError('forbidden');
  const t = db.tenants[ctx.businessId];
  if (!t) throw new ApiError('not_found');
  return t;
}

function authorize(ctx: TenantContext, permission: Permission) {
  const t = tenantOf(ctx);
  if (!can(ctx.role, permission)) throw new ApiError('forbidden');
  return t;
}

/** Staff without calendar.all may only touch their own appointments. */
function authorizeAppointment(ctx: TenantContext, id: string) {
  const t = authorize(ctx, 'appointments.manage');
  const a = t.appointments.find((x) => x.id === id);
  if (!a) throw new ApiError('not_found');
  if (!can(ctx.role, 'calendar.all') && a.staffId !== ctx.staffId) throw new ApiError('forbidden');
  return { t, a };
}

/** Keep only real overrides, for people who still perform the service. */
function cleanTerms(s: Service): Service['staffTerms'] {
  const out: NonNullable<Service['staffTerms']> = {};
  for (const id of s.staffIds) {
    const own = s.staffTerms?.[id];
    const duration = own?.duration && own.duration > 0 && own.duration !== s.duration ? own.duration : undefined;
    const price = own?.price !== undefined && own.price >= 0 && own.price !== s.price ? own.price : undefined;
    if (duration !== undefined || price !== undefined) out[id] = { ...(duration !== undefined && { duration }), ...(price !== undefined && { price }) };
  }
  return Object.keys(out).length ? out : undefined;
}

const upsert = <T extends { id: string }>(list: T[], item: T) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]);

function checkRepeat(repeat: RepeatInput) {
  const everyWeeks = Math.round(Number(repeat.everyWeeks));
  const count = Math.round(Number(repeat.count));
  if (!(everyWeeks >= 1 && everyWeeks <= REPEAT_LIMITS.everyWeeks && count >= 2 && count <= REPEAT_LIMITS.count)) throw new ApiError('invalid');
  return { everyWeeks, count };
}

function cleanCapacity(n: unknown): number {
  const c = Math.round(Number(n));
  if (!(c >= 1 && c <= CAPACITY_LIMIT)) throw new ApiError('invalid');
  return c;
}

const isTime = (date: unknown, start: unknown) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isInteger(start) && (start as number) >= 0 && (start as number) < 1440;
const cleanText = (s: unknown) => (typeof s === 'string' ? s.trim().slice(0, 500) || undefined : undefined);

function createApi(ctx: TenantContext): WorkspaceApi {
  const B = ctx.businessId;
  const write = (fn: (t: TenantData) => TenantData) => mutateTenant(B, fn);

  const book = (input: StudioBookingInput, series?: { id: string; first: boolean }): Appointment => {
    const t = authorize(ctx, 'appointments.manage');
    const staffChoice = can(ctx.role, 'calendar.all') ? input.staffId : ctx.staffId;
    if (!staffChoice) throw new ApiError('forbidden');
    if (isClass(t.services.find((s) => s.id === input.serviceId))) throw new ApiError('invalid');
    const slot = availableSlots(t, { ...input, staffId: staffChoice }).find((x) => x.start === input.start);
    const staffId = staffChoice === 'any' ? pickStaff(t, input.date, slot?.staffIds ?? t.staff.filter((s) => s.active).map((s) => s.id)) : staffChoice;
    const duration = bookingDuration(t, input.serviceId, input.addOnIds, staffId);
    const conflict = checkSlot(t, { staffId, date: input.date, start: input.start, duration, serviceId: input.serviceId });
    if (conflict && !(input.force && conflict.kind === 'outside_shift')) throw new ApiError('slot_taken', conflict);
    let created!: Appointment;
    write((cur) => {
      const [customers, customer] = upsertCustomer(cur, input.customer, input.customerId);
      const withCustomer = { ...cur, customers };
      created = newAppointment(
        withCustomer,
        { customerId: customer.id, staffId, serviceId: input.serviceId, addOnIds: input.addOnIds, date: input.date, start: input.start, status: 'confirmed', source: 'studio', anyStaff: input.staffId === 'any', note: input.customer.note || undefined },
        'staff',
      );
      if (!series) return insertAppointment(withCustomer, created);
      created = { ...created, seriesId: series.id };
      const next = { ...withCustomer, appointments: [...withCustomer.appointments, created] };
      return { ...next, outbox: withMessages(next, created, series.first ? ['confirmation', 'reminder'] : ['reminder']) };
    });
    return created;
  };

  return {
    ctx,

    async createAppointment(input) {
      await latency(250);
      return book(input);
    },

    async createAppointmentSeries(input, repeat) {
      await latency(300);
      const { everyWeeks, count } = checkRepeat(repeat);
      const id = uid('ser');
      const first = book(input, { id, first: true });
      const created = [first];
      const skipped: SeriesResult['skipped'] = [];
      for (let i = 1; i < count; i++) {
        const date = addDays(input.date, i * everyWeeks * 7);
        try {
          created.push(book({ ...input, date, staffId: first.staffId, customerId: first.customerId }, { id, first: false }));
        } catch (e) {
          if (!(e instanceof ApiError && e.code === 'slot_taken')) throw e;
          skipped.push({ date, conflict: e.conflict ?? { kind: 'overlap' } });
        }
      }
      return { created, skipped };
    },

    async rescheduleAppointment(id, input) {
      await latency(120);
      const { t, a } = authorizeAppointment(ctx, id);
      if (a.sessionId) throw new ApiError('invalid');
      const staffId = input.staffId ?? a.staffId;
      if (staffId !== a.staffId && !can(ctx.role, 'calendar.all')) throw new ApiError('forbidden');
      const terms = termsIfMoved(t, a, staffId);
      const conflict = checkSlot(t, { staffId, date: input.date, start: input.start, duration: terms.duration, serviceId: a.serviceId, excludeAppointmentId: a.id });
      if (conflict && !(input.force && conflict.kind === 'outside_shift')) throw new ApiError('slot_taken', conflict);
      const detail = `${a.date} ${a.start} ${a.staffId} → ${input.date} ${input.start} ${staffId}`;
      return patchAppointmentIn(B, id, (x) => ({ ...x, ...terms, date: input.date, start: input.start, staffId, history: [...x.history, event('rescheduled', 'staff', detail)] }), ['reschedule', 'reminder']);
    },

    async cancelAppointment(id, reason) {
      await latency(120);
      authorizeAppointment(ctx, id);
      return patchAppointmentIn(
        B,
        id,
        (x) => ({ ...x, status: 'cancelled', cancellation: cancelledBy('staff', reason), history: [...x.history, event('cancelled', 'staff', reason)] }),
        ['cancellation'],
      );
    },

    async setAppointmentStatus(id, status) {
      await latency(80);
      const { a } = authorizeAppointment(ctx, id);
      // Confirming a pending online booking is when the customer would hear back.
      const kinds: TemplateKind[] = a.status === 'pending' && status === 'confirmed' ? ['confirmation', 'reminder'] : [];
      return patchAppointmentIn(B, id, (x) => ({ ...x, status, history: [...x.history, event('status', 'staff', status)] }), kinds);
    },

    async updateAppointmentNotes(id, internalNote) {
      await latency(80);
      authorizeAppointment(ctx, id);
      return patchAppointmentIn(B, id, (x) => ({ ...x, internalNote }));
    },

    async createSessions(input, repeat) {
      await latency(250);
      const t = authorize(ctx, 'appointments.manage');
      const staffId = can(ctx.role, 'calendar.all') ? input.staffId : ctx.staffId;
      if (!staffId) throw new ApiError('forbidden');
      const service = t.services.find((s) => s.id === input.serviceId);
      if (!service || !isClass(service) || !t.staff.some((s) => s.id === staffId) || !isTime(input.date, input.start)) throw new ApiError('invalid');
      const capacity = cleanCapacity(input.capacity ?? service.capacity);
      const { everyWeeks, count } = repeat ? checkRepeat(repeat) : { everyWeeks: 1, count: 1 };
      const terms = termsFor(service, staffId);
      const seriesId = count > 1 ? uid('ss') : undefined;
      const out: SessionSeriesResult = { created: [], skipped: [] };
      write((cur) => {
        out.created = [];
        out.skipped = [];
        let next = cur;
        for (let i = 0; i < count; i++) {
          const date = addDays(input.date, i * everyWeeks * 7);
          const conflict = checkSlot(next, { staffId, date, start: input.start, duration: terms.duration, serviceId: service.id });
          if (conflict && !(input.force && conflict.kind === 'outside_shift')) {
            if (i === 0) throw new ApiError('slot_taken', conflict);
            out.skipped.push({ date, conflict });
            continue;
          }
          const s: ClassSession = {
            businessId: B,
            id: uid('cs'),
            serviceId: service.id,
            staffId,
            date,
            start: input.start,
            duration: terms.duration,
            capacity,
            price: terms.price,
            seriesId,
            status: 'scheduled',
            waitlist: [],
            note: cleanText(input.note),
            createdAt: nowISO(),
          };
          next = { ...next, sessions: [...sessionsOf(next), s] };
          out.created.push(s);
        }
        return next;
      });
      return out;
    },

    async updateSession(id, patch) {
      await latency(150);
      const t = authorize(ctx, 'appointments.manage');
      const s = sessionsOf(t).find((x) => x.id === id);
      if (!s) throw new ApiError('not_found');
      const all = can(ctx.role, 'calendar.all');
      if (!all && s.staffId !== ctx.staffId) throw new ApiError('forbidden');
      if (s.status === 'cancelled') throw new ApiError('invalid');
      const staffId = patch.staffId ?? s.staffId;
      if (staffId !== s.staffId && (!all || !t.staff.some((x) => x.id === staffId))) throw new ApiError(all ? 'invalid' : 'forbidden');
      const date = patch.date ?? s.date;
      const start = patch.start ?? s.start;
      if (!isTime(date, start)) throw new ApiError('invalid');
      const moved = date !== s.date || start !== s.start || staffId !== s.staffId;
      const service = t.services.find((x) => x.id === s.serviceId);
      const duration = staffId !== s.staffId && service ? termsFor(service, staffId).duration : s.duration;
      if (moved) {
        const conflict = checkSlot(t, { staffId, date, start, duration, serviceId: s.serviceId, excludeSessionId: s.id });
        if (conflict && !(patch.force && conflict.kind === 'outside_shift')) throw new ApiError('slot_taken', conflict);
      }
      const capacity = patch.capacity === undefined ? s.capacity : cleanCapacity(patch.capacity);
      const detail = `${s.date} ${s.start} ${s.staffId} → ${date} ${start} ${staffId}`;
      let out!: ClassSession;
      write((cur) => {
        const now = sessionsOf(cur).find((x) => x.id === id);
        if (!now) throw new ApiError('not_found');
        const seats = participantsOf(cur, id);
        if (capacity < seats.length) throw new ApiError('invalid');
        out = { ...now, date, start, staffId, duration, capacity, note: patch.note === undefined ? now.note : cleanText(patch.note) };
        let next = replaceSession(cur, out);
        if (moved)
          for (const a of seats) {
            const m = { ...a, date, start, staffId, duration, updatedAt: nowISO(), history: [...a.history, event('rescheduled', 'staff', detail)] };
            next = { ...next, appointments: next.appointments.map((x) => (x.id === a.id ? m : x)) };
            next = { ...next, outbox: withMessages(next, m, ['reschedule', 'reminder']) };
          }
        return withSeatOffers(next, id);
      });
      return out;
    },

    async cancelSessions(id, scope, reason) {
      await latency(200);
      const t = authorize(ctx, 'appointments.manage');
      const first = sessionsOf(t).find((x) => x.id === id);
      if (!first) throw new ApiError('not_found');
      const all = can(ctx.role, 'calendar.all');
      if (!all && first.staffId !== ctx.staffId) throw new ApiError('forbidden');
      const why = cleanText(reason);
      const later = (x: ClassSession) => x.date > first.date || (x.date === first.date && x.start >= first.start);
      let count = 0;
      write((cur) => {
        count = 0;
        const targets = sessionsOf(cur).filter(
          (x) =>
            x.status === 'scheduled' &&
            (all || x.staffId === ctx.staffId) &&
            (x.id === id || (scope === 'following' && !!first.seriesId && x.seriesId === first.seriesId && later(x))),
        );
        let next = cur;
        for (const x of targets) {
          const seats = participantsOf(next, x.id);
          next = replaceSession(next, { ...x, status: 'cancelled', cancellation: cancelledBy('staff', why), waitlist: [] });
          for (const a of seats) {
            const c: Appointment = { ...a, status: 'cancelled', cancellation: cancelledBy('staff', why), updatedAt: nowISO(), history: [...a.history, event('cancelled', 'staff', why)] };
            next = { ...next, appointments: next.appointments.map((y) => (y.id === a.id ? c : y)) };
            next = { ...next, outbox: withMessages(next, c, ['cancellation']) };
          }
          count++;
        }
        return next;
      });
      return count;
    },

    async addParticipant(sessionId, customer, customerId) {
      await latency(200);
      const t = authorize(ctx, 'appointments.manage');
      const s = sessionsOf(t).find((x) => x.id === sessionId);
      if (!s) throw new ApiError('not_found');
      if (!can(ctx.role, 'calendar.all') && s.staffId !== ctx.staffId) throw new ApiError('forbidden');
      let created!: Appointment;
      write((cur) => {
        const now = sessionsOf(cur).find((x) => x.id === sessionId);
        if (!now) throw new ApiError('not_found');
        const block = joinBlock(cur, now, false);
        if (block === 'full') throw new ApiError('slot_taken');
        if (block) throw new ApiError('policy');
        const [customers, c] = upsertCustomer(cur, customer, customerId);
        const withCustomer = { ...cur, customers };
        if (hasSeat(withCustomer, now.id, c.id)) throw new ApiError('exists');
        created = newSeat(withCustomer, now, c.id, { status: 'confirmed', source: 'studio', note: customer.note || undefined }, 'staff');
        return afterJoin(insertAppointment(withCustomer, created), now.id, c.id);
      });
      return created;
    },

    async removeFromWaitlist(sessionId, entryId) {
      await latency(100);
      const t = authorize(ctx, 'appointments.manage');
      const s = sessionsOf(t).find((x) => x.id === sessionId);
      if (!s) throw new ApiError('not_found');
      if (!can(ctx.role, 'calendar.all') && s.staffId !== ctx.staffId) throw new ApiError('forbidden');
      write((cur) => {
        const now = sessionsOf(cur).find((x) => x.id === sessionId);
        return now ? replaceSession(cur, { ...now, waitlist: now.waitlist.filter((w) => w.id !== entryId) }) : cur;
      });
    },

    async createCustomer(input) {
      await latency(120);
      authorize(ctx, 'customers.edit');
      let created!: Customer;
      write((t) => {
        const [customers, c] = upsertCustomer(t, input);
        created = c;
        return { ...t, customers };
      });
      return created;
    },

    async saveCustomer(c) {
      await latency(120);
      authorize(ctx, 'customers.edit');
      const scoped = { ...c, businessId: B };
      write((t) => ({ ...t, customers: upsert(t.customers, scoped) }));
      return scoped;
    },

    async importCustomers(rows) {
      await latency(300);
      const t = authorize(ctx, 'customers.edit');
      if (!Array.isArray(rows) || rows.length > IMPORT_LIMIT) throw new ApiError('invalid');
      const code = callingCode(t.business.timezone);
      const out = { added: 0, updated: 0, unchanged: 0, invalid: 0 };
      write((cur) => {
        const customers = [...cur.customers];
        const at = new Map(customers.map((c, i) => [phoneKey(c.phone, code), i]));
        const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
        for (const r of rows) {
          const name = text(r?.name, LIMITS.name);
          const phone = cleanPhone(text(r?.phone, 40), code);
          if (!name || !phone) {
            out.invalid++;
            continue;
          }
          const email = text(r.email, LIMITS.email) || undefined;
          const note = text(r.note, LIMITS.note) || undefined;
          const locale = (locales as readonly string[]).includes(r.locale) ? r.locale : cur.business.defaultLocale;
          const key = phoneKey(phone, code);
          const i = at.get(key);
          if (i === undefined) {
            at.set(key, customers.length);
            customers.push({ businessId: B, id: uid('c'), name, phone, email, note, locale, createdAt: nowISO() });
            out.added++;
            continue;
          }
          const old = customers[i];
          const merged = { ...old, email: old.email || email, note: mergeNotes(old.note, note)?.slice(0, LIMITS.note) };
          if (merged.email === old.email && merged.note === old.note) out.unchanged++;
          else (customers[i] = merged), out.updated++;
        }
        return { ...cur, customers };
      });
      return out;
    },

    async saveService(s) {
      await latency(120);
      authorize(ctx, 'services.manage');
      const days = Number(s.rebookAfterDays);
      const capacity = Math.round(Number(s.capacity));
      const scoped = {
        ...s,
        businessId: B,
        staffTerms: cleanTerms(s),
        rebookAfterDays: days >= 1 && days <= 365 ? Math.round(days) : undefined,
        capacity: capacity >= 2 && capacity <= CAPACITY_LIMIT ? capacity : undefined,
      };
      write((t) => ({ ...t, services: upsert(t.services, scoped) }));
      return scoped;
    },

    async saveAddOn(x) {
      await latency(80);
      authorize(ctx, 'services.manage');
      const scoped = { ...x, businessId: B };
      write((t) => ({ ...t, addOns: upsert(t.addOns, scoped) }));
      return scoped;
    },

    async saveCategory(c) {
      await latency(80);
      authorize(ctx, 'services.manage');
      const scoped = { ...c, businessId: B };
      write((t) => ({ ...t, categories: upsert(t.categories, scoped) }));
      return scoped;
    },

    async saveStaff(s) {
      await latency(120);
      authorize(ctx, 'staff.manage');
      const scoped = { ...s, businessId: B };
      write((t) => ({ ...t, staff: upsert(t.staff, scoped) }));
      return scoped;
    },

    async addTimeOff(x) {
      await latency(120);
      authorize(ctx, x.staffId === ctx.staffId ? 'appointments.manage' : 'availability.all');
      const created = { ...x, businessId: B, id: uid('to') };
      write((t) => ({ ...t, timeOff: [...t.timeOff, created] }));
      return created;
    },

    async removeTimeOff(id) {
      await latency(80);
      const t = tenantOf(ctx);
      const x = t.timeOff.find((y) => y.id === id);
      authorize(ctx, x?.staffId === ctx.staffId ? 'appointments.manage' : 'availability.all');
      write((cur) => ({ ...cur, timeOff: cur.timeOff.filter((y) => y.id !== id) }));
    },

    async addBlock(b) {
      await latency(120);
      authorize(ctx, b.staffId !== null && b.staffId === ctx.staffId ? 'appointments.manage' : 'availability.all');
      const created = { ...b, businessId: B, id: uid('b') };
      write((t) => ({ ...t, blocks: [...t.blocks, created] }));
      return created;
    },

    async removeBlock(id) {
      await latency(80);
      const t = tenantOf(ctx);
      const b = t.blocks.find((y) => y.id === id);
      authorize(ctx, b?.staffId !== null && b?.staffId === ctx.staffId ? 'appointments.manage' : 'availability.all');
      write((cur) => ({ ...cur, blocks: cur.blocks.filter((y) => y.id !== id) }));
    },

    async saveException(e) {
      await latency(120);
      authorize(ctx, 'availability.all');
      const saved = { ...e, businessId: B, id: e.id ?? uid('ex') };
      // One exception per (person, date): saving replaces any existing one.
      write((t) => ({ ...t, exceptions: [...t.exceptions.filter((x) => x.id !== saved.id && !(x.date === saved.date && x.staffId === saved.staffId)), saved] }));
      return saved;
    },

    async removeException(id) {
      await latency(80);
      authorize(ctx, 'availability.all');
      write((t) => ({ ...t, exceptions: t.exceptions.filter((x) => x.id !== id) }));
    },

    async updateBusiness(patch) {
      await latency(150);
      const t = authorize(ctx, 'business.settings');
      if (patch.slug && patch.slug !== t.business.slug && Object.values(getDb().tenants).some((x) => x.business.slug === patch.slug)) throw new ApiError('slug_taken');
      let out!: TenantData['business'];
      write((cur) => {
        out = { ...cur.business, ...patch, id: B, calendarFeeds: cur.business.calendarFeeds, invites: cur.business.invites, usage: cur.business.usage };
        return { ...cur, business: out };
      });
      return out;
    },

    async savePage(input) {
      await latency(250);
      authorize(ctx, 'business.settings');
      const photo = <T extends { id: string }>(xs: T[], photos: Record<string, string | null>, key: 'imageUrl' | 'avatarUrl') =>
        xs.map((x) => (x.id in photos ? { ...x, [key]: photos[x.id] ?? undefined } : x));
      let out!: TenantData['business'];
      const stored = mutateTenantIfStored(B, (cur) => {
        out = { ...cur.business, page: input.page, branding: input.branding, tagline: input.tagline, description: input.description };
        return {
          ...cur,
          business: out,
          services: photo(cur.services, input.servicePhotos, 'imageUrl'),
          staff: photo(cur.staff, input.staffPhotos, 'avatarUrl'),
        };
      });
      if (!stored) throw new ApiError('too_large');
      return out;
    },

    async setPublished(published) {
      await latency(200);
      authorize(ctx, 'business.settings');
      let out!: TenantData['business'];
      write((cur) => {
        out = { ...cur.business, status: published ? 'published' : 'draft', publishedAt: published ? cur.business.publishedAt ?? nowISO() : cur.business.publishedAt };
        return { ...cur, business: out };
      });
      return out;
    },

    async calendarFeed(staffId, rotate = false) {
      await latency(100);
      if (!(can(ctx.role, 'calendar.all') || (staffId !== null && staffId === ctx.staffId))) throw new ApiError('forbidden');
      const t = getDb().tenants[B];
      if (!t) throw new ApiError('not_found');
      if (staffId !== null && !t.staff.some((s) => s.id === staffId)) throw new ApiError('not_found');
      const existing = t.business.calendarFeeds?.find((f) => f.staffId === staffId);
      if (existing && !rotate) return existing.key;
      const key = feedKey();
      write((cur) => {
        const feeds = (cur.business.calendarFeeds ?? []).filter((f) => f.staffId !== staffId);
        return { ...cur, business: { ...cur.business, calendarFeeds: [...feeds, { key, staffId }] } };
      });
      return key;
    },

    async createInvite({ role, staffId }) {
      await latency(150);
      const t = authorize(ctx, 'staff.manage');
      if (role !== 'manager' && role !== 'staff') throw new ApiError('invalid');
      if (role === 'staff' && !staffId) throw new ApiError('invalid');
      if (staffId) {
        const st = t.staff.find((s) => s.id === staffId);
        if (!st) throw new ApiError('not_found');
        if (st.userId || getDb().members.some((m) => m.businessId === B && m.staffId === staffId)) throw new ApiError('exists');
      }
      const now = new Date();
      const invite: Invite = { token: feedKey(), role, staffId, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000).toISOString() };
      write((cur) => {
        // One open link per staff profile; expired links are dropped as new ones are made.
        const kept = (cur.business.invites ?? []).filter((i) => i.expiresAt > invite.createdAt && !(staffId && i.staffId === staffId));
        if (kept.length >= 20) throw new ApiError('policy');
        return { ...cur, business: { ...cur.business, invites: [...kept, invite] } };
      });
      return invite.token;
    },

    async revokeInvite(token) {
      await latency(100);
      authorize(ctx, 'staff.manage');
      write((cur) => ({ ...cur, business: { ...cur.business, invites: (cur.business.invites ?? []).filter((i) => i.token !== token) } }));
    },

    async removeMember(memberId) {
      await latency(150);
      authorize(ctx, 'staff.manage');
      const m = getDb().members.find((x) => x.id === memberId && x.businessId === B);
      if (!m) throw new ApiError('not_found');
      if (m.role === 'owner' || m.userId === ctx.userId || (m.role === 'manager' && ctx.role !== 'owner')) throw new ApiError('forbidden');
      mutateDb((db) => ({ ...db, members: db.members.filter((x) => x.id !== m.id) }));
      write((cur) => ({
        ...cur,
        staff: cur.staff.map((s) => (s.userId === m.userId ? { ...s, userId: undefined } : s)),
        pushDevices: cur.pushDevices?.filter((d) => d.userId !== m.userId),
      }));
    },

    async savePushDevice(device) {
      await latency(60);
      tenantOf(ctx);
      const d = cleanPushDevice(device);
      if (!d) throw new ApiError('invalid');
      // One browser, one entry: whoever signed in on it last gets its notifications.
      write((cur) => ({ ...cur, pushDevices: [...(cur.pushDevices ?? []).filter((x) => x.endpoint !== d.endpoint), { ...d, userId: ctx.userId, at: nowISO() }].slice(-PUSH_DEVICE_LIMIT) }));
    },

    async removePushDevice(endpoint) {
      await latency(60);
      tenantOf(ctx);
      if (!getDb().tenants[B]?.pushDevices?.some((x) => x.endpoint === endpoint && x.userId === ctx.userId)) return;
      write((cur) => ({ ...cur, pushDevices: cur.pushDevices?.filter((x) => !(x.endpoint === endpoint && x.userId === ctx.userId)) }));
    },

    async deleteBusiness(confirmSlug) {
      await latency(300);
      const t = authorize(ctx, 'billing.manage');
      if (confirmSlug !== t.business.slug) throw new ApiError('invalid');
      if (DEMO_BUSINESS_IDS.includes(B)) throw new ApiError('forbidden');
      mutateDb((db) => {
        const { [B]: _gone, ...tenants } = db.tenants;
        return { ...db, tenants, members: db.members.filter((m) => m.businessId !== B) };
      });
    },

    async resetDemo() {
      await latency(200);
      authorize(ctx, 'demo.reset');
      resetDemoData();
    },
  };
}

/**
 * Role-scoped read model. A staff-role member gets their own appointments and
 * the customers attached to them — the same filtering a server would apply.
 */
export function scopeForRole(full: TenantData, ctx: TenantContext): TenantData {
  const t = full.pushDevices ? { ...full, pushDevices: undefined } : full;
  if (can(ctx.role, 'calendar.all')) return can(ctx.role, 'staff.manage') ? t : { ...t, business: { ...t.business, invites: undefined, usage: undefined } };
  const appointments = t.appointments.filter((a) => a.staffId === ctx.staffId);
  const sessions = sessionsOf(t).filter((s) => s.staffId === ctx.staffId);
  const customerIds = new Set([...appointments.map((a) => a.customerId), ...sessions.flatMap((s) => s.waitlist.map((w) => w.customerId))]);
  return {
    ...t,
    business: { ...t.business, invites: undefined, usage: undefined, calendarFeeds: t.business.calendarFeeds?.filter((f) => f.staffId !== null && f.staffId === ctx.staffId) },
    appointments,
    sessions,
    customers: t.customers.filter((c) => customerIds.has(c.id)),
    timeOff: t.timeOff.filter((x) => x.staffId === ctx.staffId),
    blocks: t.blocks.filter((b) => b.staffId === null || b.staffId === ctx.staffId),
    outbox: t.outbox.filter((m) => m.to !== 'owner' && appointments.some((a) => a.id === m.appointmentId)),
  };
}

export function membersOf(db: MockDatabase, ctx: TenantContext): MemberInfo[] {
  const isMember = db.members.some((m) => m.businessId === ctx.businessId && m.userId === ctx.userId);
  if (!isMember || !can(ctx.role, 'staff.manage')) return [];
  return db.members
    .filter((m) => m.businessId === ctx.businessId)
    .flatMap((m) => {
      const u = db.users.find((x) => x.id === m.userId);
      return u ? [{ id: m.id, role: m.role, staffId: m.staffId, user: { id: u.id, name: u.name, email: u.email } }] : [];
    });
}

export const mockWorkspace: WorkspaceData = {
  useTenant(ctx) {
    const db = useMockDb();
    const t = db.tenants[ctx.businessId];
    const isMember = db.members.some((m) => m.businessId === ctx.businessId && m.userId === ctx.userId);
    return useMemo(() => (t && isMember ? scopeForRole(t, ctx) : undefined), [t, isMember, ctx]);
  },
  useMembers(ctx) {
    const db = useMockDb();
    return useMemo(() => membersOf(db, ctx), [db.members, db.users, ctx]);
  },
  api: createApi,
};
