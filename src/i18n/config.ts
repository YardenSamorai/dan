import { storageKey } from '../config/product';

export const locales = ['en', 'he'] as const;
export type Locale = (typeof locales)[number];
export type Dir = 'ltr' | 'rtl';

export interface LocaleMeta {
  /** Name of the language in itself — shown in the switcher. */
  label: string;
  short: string;
  dir: Dir;
  /** BCP-47 tag handed to Intl formatters. */
  intl: string;
}

export const localeMeta: Record<Locale, LocaleMeta> = {
  en: { label: 'English', short: 'EN', dir: 'ltr', intl: 'en-GB' },
  he: { label: 'עברית', short: 'עב', dir: 'rtl', intl: 'he-IL' },
};

export const defaultLocale: Locale = 'he';
export const LOCALE_STORAGE_KEY = storageKey('locale');

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (locales as readonly string[]).includes(v);

export function detectLocale(): Locale {
  if (typeof window === 'undefined') return defaultLocale;
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  return isLocale(stored) ? stored : defaultLocale;
}

/** Content authored per locale. English is required and is the fallback. */
export type LText = { en: string } & Partial<Record<Exclude<Locale, 'en'>, string>>;

export const pickText = (t: LText | undefined, locale: Locale): string => (t ? t[locale] ?? t.en : '');
