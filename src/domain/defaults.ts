import type { LText } from '../i18n/config';
import { parseHHMM } from './time';
import type {
  BookingPolicies,
  Business,
  BusinessType,
  DayHours,
  Minutes,
  NotificationSettings,
  TenantData,
  TimeRange,
  Weekday,
  WeeklySchedule,
} from './types';

/** Starting values for a new business. Every one is editable in settings. */

export const range = (s: string, e: string): TimeRange => ({ start: parseHHMM(s), end: parseHHMM(e) });
export const dayHours = (ranges: TimeRange[] = [], breaks: TimeRange[] = []): DayHours => ({ ranges, breaks });

export function weekly(map: Partial<Record<Weekday, DayHours>>): WeeklySchedule {
  const off = () => dayHours();
  return { 0: off(), 1: off(), 2: off(), 3: off(), 4: off(), 5: off(), 6: off(), ...map };
}

export const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export function weeklyFrom(days: Weekday[], start: string, end: string, breaks: TimeRange[] = []): WeeklySchedule {
  return weekly(Object.fromEntries(days.map((d) => [d, dayHours([range(start, end)], breaks)])) as Partial<Record<Weekday, DayHours>>);
}

export const DEFAULT_POLICIES: BookingPolicies = {
  slotInterval: 15,
  leadTimeMinutes: 120,
  maxAdvanceDays: 60,
  cancelWindowHours: 24,
  rescheduleWindowHours: 12,
  customerCanCancel: true,
  customerCanReschedule: true,
  allowAnyStaff: true,
  requireEmail: false,
  confirmationMode: 'auto',
};

export function defaultNotifications(): NotificationSettings {
  return {
    confirmation: { enabled: true, channels: ['whatsapp'] },
    reminder: { enabled: true, hoursBefore: 24, channels: ['whatsapp'] },
    reschedule: { enabled: true, channels: ['whatsapp'] },
    cancellation: { enabled: true, channels: ['whatsapp'] },
    rebook: { enabled: true, channels: ['whatsapp'] },
    spotOpen: { enabled: true, channels: ['whatsapp'] },
    templates: {
      spotOpen: {
        en: 'Hi {name}, a spot opened in {service} on {date} at {time}. The first to book gets it: {link}\n{business}',
        he: 'היי {name}, התפנה מקום ב{service} ב{date} בשעה {time}. מי שנרשם ראשון מקבל אותו: {link}\n{business}',
      },
      rebook: {
        en: 'Hi {name}, it’s been a while since your last {service}. Want to book the next one? {link}\n{business}',
        he: 'היי {name}, עבר זמן מאז ה{service} האחרון. רוצה לקבוע את הבא? {link}\n{business}',
      },
      confirmation: {
        en: 'Hi {name}, you’re booked for {service} with {staff} on {date} at {time}. Booking ref: {code}.\n{business}',
        he: 'היי {name}, נקבע לך תור ל{service} אצל {staff} ב{date} בשעה {time}. מספר אישור: {code}.\n{business}',
      },
      reminder: {
        en: 'Reminder: {service} with {staff} on {date} at {time}. To change it, use the link you got when you booked.\n{business}',
        he: 'תזכורת: יש לך תור ל{service} אצל {staff} ב{date} בשעה {time}. אפשר לשנות דרך הקישור שקיבלת.\n{business}',
      },
      reschedule: {
        en: 'Your appointment has moved to {date} at {time} with {staff}. Booking ref: {code}.\n{business}',
        he: 'התור שלך הועבר ל{date} בשעה {time} אצל {staff}. מספר אישור: {code}.\n{business}',
      },
      cancellation: {
        en: 'Your {service} on {date} at {time} has been cancelled.\n{business}',
        he: 'התור שלך ל{service} ב{date} בשעה {time} בוטל.\n{business}',
      },
    },
  };
}

export const BUSINESS_TYPES: BusinessType[] = ['nails', 'lashes_brows', 'hair', 'makeup', 'skin', 'massage', 'fitness', 'therapy', 'tutoring', 'other'];

export interface ServiceTemplate {
  name: LText;
  duration: Minutes;
}

/** Suggestions for the first service during onboarding. Prices are always entered by the business. */
export const SERVICE_TEMPLATES: Record<BusinessType, ServiceTemplate[]> = {
  nails: [
    { name: { en: 'Gel manicure', he: 'מניקור ג׳ל' }, duration: 60 },
    { name: { en: 'Manicure', he: 'מניקור' }, duration: 45 },
    { name: { en: 'Pedicure', he: 'פדיקור' }, duration: 60 },
  ],
  lashes_brows: [
    { name: { en: 'Lash lift', he: 'הרמת ריסים' }, duration: 60 },
    { name: { en: 'Classic lash set', he: 'סט ריסים קלאסי' }, duration: 120 },
    { name: { en: 'Brow shaping', he: 'עיצוב גבות' }, duration: 30 },
  ],
  hair: [
    { name: { en: 'Haircut', he: 'תספורת' }, duration: 45 },
    { name: { en: 'Colour', he: 'צבע' }, duration: 120 },
    { name: { en: 'Blow-dry', he: 'פן' }, duration: 30 },
  ],
  makeup: [
    { name: { en: 'Event makeup', he: 'איפור ערב' }, duration: 60 },
    { name: { en: 'Bridal trial', he: 'ניסיון איפור כלה' }, duration: 90 },
  ],
  skin: [
    { name: { en: 'Facial', he: 'טיפול פנים' }, duration: 60 },
    { name: { en: 'Peel', he: 'פילינג' }, duration: 45 },
  ],
  massage: [
    { name: { en: 'Massage, 60 min', he: 'עיסוי, 60 דקות' }, duration: 60 },
    { name: { en: 'Massage, 90 min', he: 'עיסוי, 90 דקות' }, duration: 90 },
  ],
  fitness: [
    { name: { en: 'Personal training', he: 'אימון אישי' }, duration: 60 },
    { name: { en: 'Intro session', he: 'מפגש היכרות' }, duration: 30 },
  ],
  therapy: [
    { name: { en: 'Session', he: 'פגישה' }, duration: 50 },
    { name: { en: 'First consultation', he: 'פגישת היכרות' }, duration: 30 },
  ],
  tutoring: [
    { name: { en: 'Lesson', he: 'שיעור' }, duration: 60 },
    { name: { en: 'Trial lesson', he: 'שיעור ניסיון' }, duration: 30 },
  ],
  other: [{ name: { en: 'Appointment', he: 'פגישה' }, duration: 60 }],
};

export const STAFF_COLORS = ['#c24d6b', '#2e7bb8', '#c8862a', '#4f9a5c', '#7d62c4', '#1f8f86', '#c0623f', '#5f7488'];

export function emptyTenant(business: Business): TenantData {
  return {
    business,
    categories: [],
    services: [],
    addOns: [],
    staff: [],
    timeOff: [],
    blocks: [],
    exceptions: [],
    customers: [],
    appointments: [],
    outbox: [],
  };
}

/** "Studio Noa & Co" → "studio-noa-co". Non-Latin names fall back to an empty slug the user fills in. */
export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

const HEBREW = /[\u05d0-\u05ea]/;
const HE_LATIN: Record<string, string> = {
  א: 'a', ב: 'v', ג: 'g', ד: 'd', ה: 'h', ו: 'o', ז: 'z', ח: 'ch', ט: 't', י: 'i', כ: 'ch', ך: 'ch', ל: 'l',
  מ: 'm', ם: 'm', נ: 'n', ן: 'n', ס: 's', ע: 'a', פ: 'f', ף: 'f', צ: 'tz', ץ: 'tz', ק: 'k', ר: 'r', ש: 'sh', ת: 't',
};
const HE_FIRST: Record<string, string> = { ב: 'b', ו: 'v', י: 'y', כ: 'k', פ: 'p' };
const HE_GERESH: Record<string, string> = { ג: 'j', ז: 'zh', צ: 'ch' };

/**
 * A readable Latin slug for any name, so Hebrew names get a link without the
 * owner having to invent one: "הסטודיו של נועה" → "hastodio-shl-noa".
 * Rough phonetics, not a transliteration standard; the owner can always edit it.
 */
export function latinSlug(name: string) {
  const chars = [...name.replace(/[\u0591-\u05c7]/g, '')];
  let out = '';
  chars.forEach((c, i) => {
    if (c === '׳' || c === "'") return;
    const latin = HE_LATIN[c];
    if (!latin) {
      out += c;
      return;
    }
    const first = !HEBREW.test(chars[i - 1] ?? '');
    const last = !HEBREW.test(chars[i + 1] ?? '');
    const geresh = chars[i + 1] === '׳' || chars[i + 1] === "'";
    if (geresh && HE_GERESH[c]) out += HE_GERESH[c];
    else if (first && HE_FIRST[c]) out += HE_FIRST[c];
    else if (c === 'ה' && first && !last) out += 'ha';
    else if (c === 'ה' && last) out += 'a';
    else if (c === 'ו' && chars[i + 1] === 'ו') out += 'v';
    else if (c === 'ו' && chars[i - 1] === 'ו') return;
    else out += latin;
  });
  return slugify(out).replace(/([aeiou])\1+/g, '$1');
}
