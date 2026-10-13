import { pickText, type Locale } from '../i18n/config';
import { appointmentEnd, appointmentStart, liveSessions } from './scheduling';
import { participantsOf } from './classes';
import type { TenantData } from './types';

/** How far back a subscribed calendar keeps past appointments. */
const HISTORY_DAYS = 60;

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** RFC 5545 text escaping. */
const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** RFC 5545 lines are at most 75 octets; continuation lines start with a space. */
function fold(line: string): string {
  const bytes = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (bytes.encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/**
 * An iCalendar document of a business's appointments, for "subscribe by URL"
 * in Google Calendar, Outlook and Apple Calendar. Read-only: changes made in
 * those calendars don't come back.
 */
export function buildIcs(t: TenantData, staffId: string | null, locale: Locale, now = new Date()): string {
  const b = t.business;
  const from = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);
  const name = pickText(b.name, locale);
  const staffName = staffId ? pickText(t.staff.find((s) => s.id === staffId)?.name, locale) : '';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//booking//calendar feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${text(staffName ? `${name} · ${staffName}` : name)}`,
    `X-WR-TIMEZONE:${b.timezone}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  const where = pickText(b.address, locale);
  for (const s of liveSessions(t)) {
    if (staffId && s.staffId !== staffId) continue;
    const end = appointmentEnd(s, b.timezone);
    if (end < from) continue;
    const people = participantsOf(t, s.id).map((a) => t.customers.find((c) => c.id === a.customerId)?.name ?? '');
    const service = pickText(t.services.find((x) => x.id === s.serviceId)?.name, locale);
    const staff = pickText(t.staff.find((x) => x.id === s.staffId)?.name, locale);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}@${b.slug}`,
      `DTSTAMP:${stamp(new Date(s.createdAt))}`,
      `DTSTART:${stamp(appointmentStart(s, b.timezone))}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${text(`${service} · ${people.length}/${s.capacity}`)}`,
      `DESCRIPTION:${text([staffId ? '' : staff, s.note, ...people].filter(Boolean).join('\n'))}`,
      'STATUS:CONFIRMED',
    );
    if (where) lines.push(`LOCATION:${text(where)}`);
    lines.push('END:VEVENT');
  }
  for (const a of t.appointments) {
    if (a.status === 'cancelled' || a.sessionId || (staffId && a.staffId !== staffId)) continue;
    const end = appointmentEnd(a, b.timezone);
    if (end < from) continue;
    const customer = t.customers.find((c) => c.id === a.customerId);
    const service = pickText(t.services.find((s) => s.id === a.serviceId)?.name, locale);
    const staff = pickText(t.staff.find((s) => s.id === a.staffId)?.name, locale);
    const details = [customer?.phone, staffId ? '' : staff, a.note, a.internalNote, `#${a.code}`].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${a.id}@${b.slug}`,
      `DTSTAMP:${stamp(new Date(a.updatedAt))}`,
      `DTSTART:${stamp(appointmentStart(a, b.timezone))}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${text([service, customer?.name].filter(Boolean).join(' · '))}`,
      `DESCRIPTION:${text(details)}`,
      `STATUS:${a.status === 'pending' ? 'TENTATIVE' : 'CONFIRMED'}`,
    );
    if (where) lines.push(`LOCATION:${text(where)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
