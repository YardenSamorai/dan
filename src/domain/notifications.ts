import { PUBLIC_SITE } from '../config/product';
import { dateFormatter } from './dateFormat';
import { localeMeta, pickText, type Locale } from '../i18n/config';
import { appointmentStart } from './scheduling';
import { messageSubject, sessionPath } from './classes';
import { defaultNotifications } from './defaults';
import type { Appointment, Business, Channel, MessageKind, NotificationSettings, OutboxMessage, OwnerAlertKind, OwnerAlerts, TemplateKind, TenantData } from './types';

export const TEMPLATE_VARS = ['name', 'service', 'date', 'time', 'staff', 'business', 'code', 'link'] as const;
export type TemplateVar = (typeof TEMPLATE_VARS)[number];

export function renderTemplate(template: string, vars: Partial<Record<TemplateVar, string>>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k as TemplateVar] ?? m);
}

/** Settings with defaults for kinds added after they were saved. */
export function notificationsOf(b: Business): NotificationSettings {
  const d = defaultNotifications();
  const n = b.notifications;
  return { ...d, ...n, templates: { ...d.templates, ...n.templates } };
}

/** The booking page. On the server the site's address isn't known when a message is written, so `{link}` stays and delivery fills it in. */
export const LINK_PLACEHOLDER = '{link}';
export const bookingLink = (origin: string, slug: string) => `${origin}/book/${slug}`;
const siteOrigin = () => {
  if (typeof location === 'undefined') return null;
  // The iPhone app's pages come from the device (capacitor://…), not the site.
  if (!/^https?:/.test(location.protocol)) return PUBLIC_SITE;
  return location.origin;
};

/** A seat offer links straight to the session; everything else to the booking page. */
export const messageLink = (origin: string, state: TenantData, a: Appointment, kind?: MessageKind) =>
  kind === 'spotOpen' && a.sessionId ? origin + sessionPath(state.business.slug, a.sessionId) : bookingLink(origin, state.business.slug);

/** Values are formatted in the *customer's* locale and the *business's* timezone. */
export function messageVars(state: TenantData, a: Appointment, locale: Locale, kind?: MessageKind): Record<TemplateVar, string> {
  const origin = siteOrigin();
  const intl = localeMeta[locale].intl;
  const timeZone = state.business.timezone;
  const start = appointmentStart(a, timeZone);
  const customer = state.customers.find((c) => c.id === a.customerId);
  const service = state.services.find((s) => s.id === a.serviceId);
  const staff = state.staff.find((s) => s.id === a.staffId);
  return {
    name: customer?.name.split(' ')[0] ?? '',
    service: pickText(service?.name, locale),
    date: dateFormatter(intl, { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(start),
    time: dateFormatter(intl, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(start),
    staff: pickText(staff?.name, locale).split(' ')[0],
    business: pickText(state.business.name, locale),
    code: a.code,
    link: origin ? messageLink(origin, state, a, kind) : LINK_PLACEHOLDER,
  };
}

export function renderMessage(state: TenantData, a: Appointment, kind: TemplateKind, locale: Locale): string {
  const tpl = pickText(notificationsOf(state.business).templates[kind], locale);
  return renderTemplate(tpl, messageVars(state, a, locale, kind));
}

// ── Alerts to the business ──────────────────────────────────────────

export const DEFAULT_ALERTS: OwnerAlerts = { channels: ['email'], booked: true, changed: true };
export const alertsOf = (b: Business): OwnerAlerts => b.alerts ?? DEFAULT_ALERTS;

const OWNER_TEXT: Record<Locale, Record<OwnerAlertKind, string> & { pending: string; team: string }> = {
  he: {
    ownerBooked: 'תור חדש: {name}, {service}, {date} בשעה {time}{team}.',
    ownerCancelled: '{name} ביטל/ה את התור: {service}, {date} בשעה {time}{team}.',
    ownerRescheduled: '{name} העביר/ה את התור ל{date} בשעה {time}: {service}{team}.',
    pending: ' התור מחכה לאישור שלך.',
    team: ' אצל {staff}',
  },
  en: {
    ownerBooked: 'New booking: {name}, {service}, {date} at {time}{team}.',
    ownerCancelled: '{name} cancelled: {service}, {date} at {time}{team}.',
    ownerRescheduled: '{name} moved their booking to {date} at {time}: {service}{team}.',
    pending: ' It’s waiting for your approval.',
    team: ' with {staff}',
  },
};

/** The alert text, in the business's own language. Uses the customer's full name. */
export function renderOwnerAlert(state: TenantData, a: Appointment, kind: OwnerAlertKind): string {
  const locale = state.business.defaultLocale;
  const text = OWNER_TEXT[locale] ?? OWNER_TEXT.en;
  const vars = messageVars(state, a, locale);
  const customer = state.customers.find((c) => c.id === a.customerId);
  const team = state.staff.filter((s) => s.active).length > 1 ? renderTemplate(text.team, vars) : '';
  const body = text[kind].replace('{team}', team);
  return renderTemplate(body, { ...vars, name: customer?.name ?? vars.name }) + (kind === 'ownerBooked' && a.status === 'pending' ? text.pending : '');
}

// ── Delivery ─────────────────────────────────────────────────────────

/** Where a message goes: the customer's phone / email, or the business's for alerts. */
export function recipientOf(state: TenantData, m: OutboxMessage): string | null {
  if (m.to === 'owner') return (m.channel === 'email' ? state.business.email : state.business.phone)?.trim() || null;
  const a = messageSubject(state, m);
  const c = a && state.customers.find((x) => x.id === a.customerId);
  if (!c) return null;
  return (m.channel === 'email' ? c.email : c.phone)?.trim() || null;
}

export const isWaiting = (m: OutboxMessage) => m.state === 'queued' || m.state === 'scheduled';

/** The earliest moment one of these channels has something to send, or null. */
export function nextMessageAt(state: TenantData, channels: readonly Channel[]): string | null {
  let next: string | null = null;
  for (const m of state.outbox) if (isWaiting(m) && channels.includes(m.channel) && (!next || m.at < next)) next = m.at;
  return next;
}

/** Past this, a confirmation or alert is noise; it's skipped instead of sent late. */
export const STALE_AFTER_MS = 6 * 3_600_000;
/** Finished messages are kept this long (they show on the appointment), then dropped. */
export const KEEP_DONE_MS = 60 * 86_400_000;
export const MAX_ATTEMPTS = 3;
