import { PRODUCT } from '../config/product';
import { appointmentEnd, appointmentStart } from '../domain/scheduling';
import type { Appointment } from '../domain/types';

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');

type Timed = Pick<Appointment, 'id' | 'code' | 'date' | 'start' | 'duration'>;

export function downloadICS(a: Timed, title: string, location: string, timeZone: string) {
  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${PRODUCT.name}//Booking//EN`,
    'BEGIN:VEVENT',
    `UID:${a.id}@${PRODUCT.storagePrefix}.booking`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(appointmentStart(a, timeZone))}`,
    `DTEND:${stamp(appointmentEnd(a, timeZone))}`,
    `SUMMARY:${esc(title)}`,
    `LOCATION:${esc(location)}`,
    `DESCRIPTION:${esc(`Ref ${a.code}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `appointment-${a.code}.ics`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
