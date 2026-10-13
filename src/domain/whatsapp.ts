import type { Locale } from '../i18n/config';
import { renderTemplate, type TemplateVar } from './notifications';
import type { TemplateKind } from './types';

/**
 * WhatsApp only lets a business start a conversation with wording Meta
 * approved in advance (a "template"), so messages to customers there use this
 * fixed text with the appointment's details filled in. The owner's own wording
 * in settings still goes out by SMS and email.
 *
 * The same text is submitted to Meta (scripts/whatsapp-templates.ts), sent by
 * the server and previewed in settings. Changing a text here means submitting
 * it again and waiting for approval before it can be sent.
 *
 * Meta's rules: no variable at the very start or end, words between
 * variables, and enough plain text for the number of variables.
 */
export interface WhatsAppTemplate {
  /** The template's name in WhatsApp Manager. */
  name: string;
  /** Utility = about an appointment the customer made. Marketing costs about seven times more. */
  category: 'UTILITY' | 'MARKETING';
  /** Variables in the order they appear; named placeholders ({{name}}) use the same keys as the owner's templates. */
  vars: TemplateVar[];
  text: Record<Locale, string>;
}

const BODY: TemplateVar[] = ['name', 'business', 'service', 'date', 'time', 'link'];

export const WHATSAPP_TEMPLATES: Record<TemplateKind, WhatsAppTemplate> = {
  confirmation: {
    name: 'booking_confirmation',
    category: 'UTILITY',
    vars: BODY,
    text: {
      he: 'שלום {{name}}, התור שלך ב{{business}} נקבע בהצלחה.\nהשירות: {{service}}, ב{{date}} בשעה {{time}}.\nאפשר לצפות בתור, לשנות אותו או לבטל דרך העמוד: {{link}}\nנתראה בקרוב!',
      en: 'Hi {{name}}, your appointment at {{business}} is confirmed.\nService: {{service}}, on {{date}} at {{time}}.\nYou can view, change or cancel it from the booking page: {{link}}\nSee you soon!',
    },
  },
  reminder: {
    name: 'booking_reminder',
    category: 'UTILITY',
    vars: BODY,
    text: {
      he: 'שלום {{name}}, זו תזכורת לתור שלך ב{{business}}.\nהשירות: {{service}}, ב{{date}} בשעה {{time}}.\nאם צריך לשנות או לבטל, אפשר לעשות זאת דרך העמוד: {{link}}\nנתראה!',
      en: 'Hi {{name}}, this is a reminder of your appointment at {{business}}.\nService: {{service}}, on {{date}} at {{time}}.\nIf you need to change or cancel it, you can do so from the booking page: {{link}}\nSee you then!',
    },
  },
  reschedule: {
    name: 'booking_rescheduled',
    category: 'UTILITY',
    vars: BODY,
    text: {
      he: 'שלום {{name}}, התור שלך ב{{business}} הועבר למועד חדש.\nהשירות: {{service}}, ב{{date}} בשעה {{time}}.\nלצפייה בפרטי התור דרך העמוד: {{link}}\nנתראה בקרוב!',
      en: 'Hi {{name}}, your appointment at {{business}} has moved to a new time.\nService: {{service}}, on {{date}} at {{time}}.\nSee the details on the booking page: {{link}}\nSee you soon!',
    },
  },
  cancellation: {
    name: 'booking_cancelled',
    category: 'UTILITY',
    vars: BODY,
    text: {
      he: 'שלום {{name}}, התור שלך ב{{business}} בוטל.\nהשירות: {{service}}, ב{{date}} בשעה {{time}}.\nאם תרצו לקבוע תור חדש, אפשר לעשות זאת דרך העמוד: {{link}}\nתודה רבה.',
      en: 'Hi {{name}}, your appointment at {{business}} has been cancelled.\nService: {{service}}, on {{date}} at {{time}}.\nTo book a new time, use the booking page: {{link}}\nThank you.',
    },
  },
  rebook: {
    name: 'booking_rebook',
    category: 'MARKETING',
    vars: ['name', 'business', 'service', 'link'],
    text: {
      he: 'שלום {{name}}, עבר קצת זמן מאז הביקור האחרון שלך ב{{business}}.\nאם הגיע הזמן ל{{service}} נוסף, אפשר לקבוע תור בקלות דרך העמוד: {{link}}\nנשמח לראות אותך שוב!',
      en: 'Hi {{name}}, it’s been a while since your last visit to {{business}}.\nIf you’re ready for another {{service}}, you can book in a few taps on the booking page: {{link}}\nWe’d love to see you again!',
    },
  },
  spotOpen: {
    name: 'class_spot_open',
    category: 'UTILITY',
    vars: BODY,
    text: {
      he: 'שלום {{name}}, נרשמת לרשימת ההמתנה ב{{business}}, ועכשיו התפנה מקום.\nהשיעור: {{service}}, ב{{date}} בשעה {{time}}.\nהמקום שמור למי שנרשם ראשון, דרך העמוד: {{link}}\nאם כבר לא מתאים לך, אפשר להתעלם מההודעה.',
      en: 'Hi {{name}}, you joined the waitlist at {{business}}, and a spot just opened.\nClass: {{service}}, on {{date}} at {{time}}.\nThe spot goes to whoever books first, on the page: {{link}}\nIf it no longer suits you, you can ignore this message.',
    },
  },
};

/** WhatsApp rejects empty values, and every customer is greeted by name; this stands in when there's none. */
const NO_NAME: Record<Locale, string> = { he: 'לך', en: 'there' };

/** The values to send, in the template's order. None is empty and none spans lines (both are rejected). */
export function whatsAppParams(kind: TemplateKind, locale: Locale, vars: Partial<Record<TemplateVar, string>>): { name: TemplateVar; text: string }[] {
  return WHATSAPP_TEMPLATES[kind].vars.map((name) => {
    const text = (vars[name] ?? '').replace(/\s+/g, ' ').trim();
    return { name, text: text || (name === 'name' ? NO_NAME[locale] : '-') };
  });
}

/** The message as the customer will read it, for previews. */
export function renderWhatsApp(kind: TemplateKind, locale: Locale, vars: Partial<Record<TemplateVar, string>>): string {
  const values = Object.fromEntries(whatsAppParams(kind, locale, vars).map((p) => [p.name, p.text]));
  return renderTemplate(WHATSAPP_TEMPLATES[kind].text[locale].replace(/\{\{(\w+)\}\}/g, '{$1}'), values);
}

/** Meta's language codes for the locales the templates are written in. */
export const WHATSAPP_LANGUAGE: Record<Locale, string> = { he: 'he', en: 'en' };
