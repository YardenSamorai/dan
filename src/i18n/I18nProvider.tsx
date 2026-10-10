import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { detectLocale, localeMeta, LOCALE_STORAGE_KEY, pickText, type Dir, type Locale, type LText } from './config';
import { getFormatters, type Formatters } from './format';
import { messages, type MessageKey } from './messages';
import type { Params, Plural } from './types';

export interface I18n {
  locale: Locale;
  dir: Dir;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, params?: Params) => string;
  /** Pick the current locale from authored content. */
  tx: (text: LText | undefined) => string;
  fmt: Formatters & {
    duration: (minutes: number) => string;
    /** One value when both ends match, otherwise "low–high". */
    moneyRange: (range: [number, number]) => string;
    durationRange: (range: [number, number]) => string;
  };
}

const Ctx = createContext<I18n | null>(null);

function lookup(locale: Locale, key: string): string | Plural | undefined {
  let node: unknown = messages[locale];
  for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
  return node as string | Plural | undefined;
}

const pluralRules = new Map<Locale, Intl.PluralRules>();

function translate(locale: Locale, key: string, params?: Params): string {
  let entry = lookup(locale, key) ?? lookup('en', key);
  if (entry === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  if (typeof entry !== 'string') {
    let pr = pluralRules.get(locale);
    if (!pr) pluralRules.set(locale, (pr = new Intl.PluralRules(localeMeta[locale].intl)));
    const n = Number(params?.count ?? 0);
    const cat = n === 0 && entry.zero ? 'zero' : pr.select(n);
    entry = entry[cat as keyof Plural] ?? entry.other;
  }
  if (!params) return entry;
  const nf = new Intl.NumberFormat(localeMeta[locale].intl);
  return entry.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = params[k];
    return v === undefined ? m : typeof v === 'number' ? nf.format(v) : v;
  });
}

function applyDocument(locale: Locale) {
  const el = document.documentElement;
  el.lang = locale;
  el.dir = localeMeta[locale].dir;
}

/** Called before React mounts so the first paint is already in the right direction. */
export function primeDocumentLocale() {
  applyDocument(detectLocale());
}

function withFormatters(locale: Locale, t: I18n['t'], currency: string, timeZone?: string): I18n['fmt'] {
  const base = getFormatters(locale, currency, timeZone);
  const duration = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return t('units.minutes', { count: m });
    if (m === 0) return t('units.hours', { count: h });
    return t('units.hoursMinutes', { h: t('units.hours', { count: h }), m: t('units.minutes', { count: m }) });
  };
  // Each end is isolated so a currency sign or unit can't reorder the pair in RTL text.
  const range = (a: string, b: string) => (a === b ? a : t('units.range', { from: `\u2068${a}\u2069`, to: `\u2068${b}\u2069` }));
  return {
    ...base,
    duration,
    moneyRange: ([a, b]) => range(base.money(a), base.money(b)),
    durationRange: ([a, b]) => range(duration(a), duration(b)),
  };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  useEffect(() => {
    applyDocument(locale);
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem(LOCALE_STORAGE_KEY, l);
    setLocaleState(l);
  }, []);

  const value = useMemo<I18n>(() => {
    const t = (key: MessageKey, params?: Params) => translate(locale, key, params);
    return {
      locale,
      dir: localeMeta[locale].dir,
      setLocale,
      t,
      tx: (text) => pickText(text, locale),
      fmt: withFormatters(locale, t, 'USD'),
    };
  }, [locale, setLocale]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Money and "today" inside a tenant follow that business's currency and timezone. */
export function FormatScope({ currency, timeZone, children }: { currency: string; timeZone: string; children: ReactNode }) {
  const parent = useI18n();
  const value = useMemo<I18n>(() => ({ ...parent, fmt: withFormatters(parent.locale, parent.t, currency, timeZone) }), [parent, currency, timeZone]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside I18nProvider');
  return v;
}

export const useT = () => useI18n().t;
