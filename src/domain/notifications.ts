import { localeMeta, pickText, type Locale } from '../i18n/config';
import { appointmentStart } from './scheduling';
import type { Appointment, TemplateKind, TenantData } from './types';

export const TEMPLATE_VARS = ['name', 'service', 'date', 'time', 'staff', 'business', 'code'] as const;
export type TemplateVar = (typeof TEMPLATE_VARS)[number];

export function renderTemplate(template: string, vars: Partial<Record<TemplateVar, string>>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k as TemplateVar] ?? m);
}

/** Values are formatted in the *customer's* locale and the *business's* timezone. */
export function messageVars(state: TenantData, a: Appointment, locale: Locale): Record<TemplateVar, string> {
  const intl = localeMeta[locale].intl;
  const timeZone = state.business.timezone;
  const start = appointmentStart(a, timeZone);
  const customer = state.customers.find((c) => c.id === a.customerId);
  const service = state.services.find((s) => s.id === a.serviceId);
  const staff = state.staff.find((s) => s.id === a.staffId);
  return {
    name: customer?.name.split(' ')[0] ?? '',
    service: pickText(service?.name, locale),
    date: new Intl.DateTimeFormat(intl, { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(start),
    time: new Intl.DateTimeFormat(intl, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(start),
    staff: pickText(staff?.name, locale).split(' ')[0],
    business: pickText(state.business.name, locale),
    code: a.code,
  };
}

export function renderMessage(state: TenantData, a: Appointment, kind: TemplateKind, locale: Locale): string {
  const tpl = pickText(state.business.notifications.templates[kind], locale);
  return renderTemplate(tpl, messageVars(state, a, locale));
}
