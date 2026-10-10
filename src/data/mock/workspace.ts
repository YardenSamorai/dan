import { useMemo } from 'react';
import { renderMessage } from '../../domain/notifications';
import { can, type Permission } from '../../domain/permissions';
import { appointmentStart, availableSlots, bookingDuration, bookingPrice, checkSlot, pickStaff } from '../../domain/scheduling';
import type { Actor, Appointment, AppointmentEvent, Customer, OutboxMessage, TemplateKind, TenantData } from '../../domain/types';
import { ApiError, type CustomerInput, type MemberInfo, type TenantContext, type WorkspaceApi, type WorkspaceData } from '../contracts';
import { makeCode } from '../demo/seed';
import { getDb, latency, mutateTenant, resetDemoData, uid, useMockDb } from './db';

const nowISO = () => new Date().toISOString();
const event = (type: AppointmentEvent['type'], by: Actor, detail?: string): AppointmentEvent => ({ at: nowISO(), type, by, detail });
export const normalizePhone = (p: string) => p.replace(/\D/g, '');

// ── Shared tenant mutations (also used by the public adapter) ────────

function queueMessages(t: TenantData, a: Appointment, kind: TemplateKind): OutboxMessage[] {
  const cfg = t.business.notifications[kind];
  if (!cfg.enabled) return [];
  const customer = t.customers.find((c) => c.id === a.customerId);
  const locale = customer?.locale ?? t.business.defaultLocale;
  const at =
    kind === 'reminder'
      ? new Date(appointmentStart(a, t.business.timezone).getTime() - t.business.notifications.reminder.hoursBefore * 3_600_000)
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

/** Messages are generated and stored, never delivered: no provider is connected in this build. */
export function withMessages(t: TenantData, a: Appointment, kinds: TemplateKind[]): OutboxMessage[] {
  const kept = t.outbox.filter((m) => !(m.appointmentId === a.id && m.state === 'scheduled'));
  const active = a.status !== 'cancelled' ? kinds : kinds.filter((k) => k !== 'reminder');
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

export function patchAppointmentIn(businessId: string, id: string, fn: (a: Appointment, t: TenantData) => Appointment, kinds: TemplateKind[] = []) {
  let out!: Appointment;
  mutateTenant(businessId, (t) => {
    const a = t.appointments.find((x) => x.id === id);
    if (!a) throw new ApiError('not_found');
    out = { ...fn(a, t), updatedAt: nowISO() };
    const next = { ...t, appointments: t.appointments.map((x) => (x.id === id ? out : x)) };
    return kinds.length ? { ...next, outbox: withMessages(next, out, kinds) } : next;
  });
  return out;
}

export function newAppointment(t: TenantData, fields: Pick<Appointment, 'customerId' | 'staffId' | 'serviceId' | 'addOnIds' | 'date' | 'start' | 'status' | 'source' | 'anyStaff' | 'note'>, by: Actor): Appointment {
  return {
    businessId: t.business.id,
    id: uid('a'),
    code: makeCode(),
    ...fields,
    duration: bookingDuration(t, fields.serviceId, fields.addOnIds),
    price: bookingPrice(t, fields.serviceId, fields.addOnIds),
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

const upsert = <T extends { id: string }>(list: T[], item: T) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]);

function createApi(ctx: TenantContext): WorkspaceApi {
  const B = ctx.businessId;
  const write = (fn: (t: TenantData) => TenantData) => mutateTenant(B, fn);

  return {
    ctx,

    async createAppointment(input) {
      await latency(250);
      const t = authorize(ctx, 'appointments.manage');
      const staffChoice = can(ctx.role, 'calendar.all') ? input.staffId : ctx.staffId;
      if (!staffChoice) throw new ApiError('forbidden');
      const slot = availableSlots(t, { ...input, staffId: staffChoice }).find((x) => x.start === input.start);
      const staffId = staffChoice === 'any' ? pickStaff(t, input.date, slot?.staffIds ?? t.staff.filter((s) => s.active).map((s) => s.id)) : staffChoice;
      const duration = bookingDuration(t, input.serviceId, input.addOnIds);
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
        return insertAppointment(withCustomer, created);
      });
      return created;
    },

    async rescheduleAppointment(id, input) {
      await latency(120);
      const { t, a } = authorizeAppointment(ctx, id);
      const staffId = input.staffId ?? a.staffId;
      if (staffId !== a.staffId && !can(ctx.role, 'calendar.all')) throw new ApiError('forbidden');
      const conflict = checkSlot(t, { staffId, date: input.date, start: input.start, duration: a.duration, serviceId: a.serviceId, excludeAppointmentId: a.id });
      if (conflict && !(input.force && conflict.kind === 'outside_shift')) throw new ApiError('slot_taken', conflict);
      const detail = `${a.date} ${a.start} ${a.staffId} → ${input.date} ${input.start} ${staffId}`;
      return patchAppointmentIn(B, id, (x) => ({ ...x, date: input.date, start: input.start, staffId, history: [...x.history, event('rescheduled', 'staff', detail)] }), ['reschedule', 'reminder']);
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

    async saveService(s) {
      await latency(120);
      authorize(ctx, 'services.manage');
      const scoped = { ...s, businessId: B };
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
        out = { ...cur.business, ...patch, id: B };
        return { ...cur, business: out };
      });
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
function scopeForRole(t: TenantData, ctx: TenantContext): TenantData {
  if (can(ctx.role, 'calendar.all')) return t;
  const appointments = t.appointments.filter((a) => a.staffId === ctx.staffId);
  const customerIds = new Set(appointments.map((a) => a.customerId));
  return {
    ...t,
    appointments,
    customers: t.customers.filter((c) => customerIds.has(c.id)),
    timeOff: t.timeOff.filter((x) => x.staffId === ctx.staffId),
    blocks: t.blocks.filter((b) => b.staffId === null || b.staffId === ctx.staffId),
    outbox: t.outbox.filter((m) => appointments.some((a) => a.id === m.appointmentId)),
  };
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
    return useMemo<MemberInfo[]>(() => {
      const isMember = db.members.some((m) => m.businessId === ctx.businessId && m.userId === ctx.userId);
      if (!isMember || !can(ctx.role, 'staff.manage')) return [];
      return db.members
        .filter((m) => m.businessId === ctx.businessId)
        .flatMap((m) => {
          const u = db.users.find((x) => x.id === m.userId);
          return u ? [{ id: m.id, role: m.role, staffId: m.staffId, user: { id: u.id, name: u.name, email: u.email } }] : [];
        });
    }, [db.members, db.users, ctx]);
  },
  api: createApi,
};
