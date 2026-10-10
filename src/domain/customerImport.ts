import { locales, type Locale } from '../i18n/config';
import { cleanPhone, phoneKey } from '../lib/phone';

/**
 * Turning a customer spreadsheet into customers. Pure: the grid is plain text
 * (one string per cell, as the sheet shows it), so this works the same for
 * Excel, CSV or anything else that can be read into rows.
 */

export type ImportField = 'skip' | 'name' | 'firstName' | 'lastName' | 'phone' | 'email' | 'note' | 'locale';
export const IMPORT_FIELDS: ImportField[] = ['name', 'firstName', 'lastName', 'phone', 'email', 'note', 'locale', 'skip'];

export const IMPORT_LIMIT = 5000;
export const LIMITS = { name: 120, email: 200, note: 2000 } as const;

export type Grid = string[][];

export interface ImportSetup {
  /** Row index with the column titles, or -1 when the sheet has none. */
  headerRow: number;
  /** Row index of the first customer. */
  firstRow: number;
  /** One field per column. */
  mapping: ImportField[];
}

export type SkipReason = 'noName' | 'noPhone' | 'badPhone';

export interface ImportRow {
  /** 1-based, as the spreadsheet numbers it. */
  row: number;
  name: string;
  phone: string;
  email?: string;
  note?: string;
  locale: Locale;
}

export interface ImportPlan {
  rows: ImportRow[];
  skipped: { row: number; reason: SkipReason; text: string }[];
  /** Rows folded into an earlier row with the same phone. */
  duplicates: number;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/["'`׳״.:_\-–—/\\()[\]*#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Column titles people actually use, Hebrew and English. Exact matches win over partial ones. */
const TITLES: Record<Exclude<ImportField, 'skip'>, { exact: string[]; partial: string[] }> = {
  firstName: { exact: ['first', 'שם פרטי', 'פרטי'], partial: ['שם פרטי', 'first name', 'firstname', 'given name'] },
  lastName: { exact: ['last', 'משפחה', 'שם משפחה'], partial: ['שם משפחה', 'last name', 'lastname', 'surname', 'family name'] },
  email: { exact: ['mail', 'מייל', 'דואל', 'דוא ל'], partial: ['email', 'e mail', 'אימייל', 'אמייל', 'מייל', 'דואר אלקטרוני', 'דוא ל'] },
  phone: {
    exact: ['tel', 'טל', 'נייד', 'cell'],
    partial: ['phone', 'mobile', 'telephone', 'whatsapp', 'טלפון', 'נייד', 'סלולרי', 'סלולארי', 'פלאפון', 'פלפון', 'וואטסאפ', 'ווטסאפ'],
  },
  locale: { exact: ['שפה', 'language', 'lang', 'locale'], partial: ['שפה', 'language'] },
  note: { exact: ['הערה', 'note'], partial: ['הערות', 'notes', 'comment', 'remark', 'העדפות'] },
  name: { exact: ['שם', 'name', 'לקוח', 'לקוחה', 'customer', 'client'], partial: ['שם מלא', 'שם הלקוח', 'שם לקוח', 'full name', 'customer name', 'client name', 'contact name'] },
};
const ORDER = Object.keys(TITLES) as (keyof typeof TITLES)[];

export function fieldFromTitle(title: string): ImportField | null {
  const n = norm(title);
  if (!n) return null;
  for (const f of ORDER) if (TITLES[f].exact.includes(n)) return f;
  for (const f of ORDER) if (TITLES[f].partial.some((p) => n.includes(p))) return f;
  return null;
}

const DATE = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})$/;
const looksLikePhone = (v: string, code?: string) => /^[\d+\-() .]{7,}$/.test(v.trim()) && !DATE.test(v.trim()) && !!cleanPhone(v, code);
const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const isEmpty = (row: string[] | undefined) => !row || row.every((c) => !c.trim());

export const columnCount = (grid: Grid) => grid.reduce((n, r) => Math.max(n, r.length), 0);
export const cell = (grid: Grid, r: number, c: number) => (grid[r]?.[c] ?? '').trim();

/** "A", "B" … "Z", "AA" — the letters above each spreadsheet column. */
export function columnLetter(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** The row among the first few that reads most like column titles; -1 if none does. */
export function guessHeaderRow(grid: Grid): number {
  let best = -1;
  let bestScore = 0;
  for (let r = 0; r < Math.min(grid.length, 25); r++) {
    const score = (grid[r] ?? []).filter((c) => fieldFromTitle(c)).length;
    if (score > bestScore) [best, bestScore] = [r, score];
  }
  return best;
}

export function firstDataRow(grid: Grid, headerRow: number): number {
  let r = headerRow + 1;
  while (r < grid.length && isEmpty(grid[r])) r++;
  return Math.min(r, Math.max(grid.length - 1, 0));
}

/** Columns with nothing in them from the first customer down: hidden, and never imported. */
export function usedColumns(grid: Grid, setup: Pick<ImportSetup, 'headerRow' | 'firstRow'>): number[] {
  const out: number[] = [];
  for (let c = 0; c < columnCount(grid); c++) {
    const header = setup.headerRow >= 0 && cell(grid, setup.headerRow, c);
    if (header || grid.slice(setup.firstRow).some((r) => (r[c] ?? '').trim())) out.push(c);
  }
  return out;
}

/** Best guess for each column: by title first, then by what the values look like. */
export function guessMapping(grid: Grid, headerRow: number, firstRow: number, code?: string): ImportField[] {
  const cols = columnCount(grid);
  const sample = grid.slice(firstRow, firstRow + 50);
  const out: ImportField[] = Array.from({ length: cols }, (_, c) => {
    const title = headerRow >= 0 ? cell(grid, headerRow, c) : '';
    const byTitle = title ? fieldFromTitle(title) : null;
    if (byTitle) return byTitle;
    const values = sample.map((r) => (r[c] ?? '').trim()).filter(Boolean);
    if (!values.length) return 'skip';
    const share = (test: (v: string) => boolean) => values.filter(test).length / values.length;
    if (share((v) => looksLikePhone(v, code)) >= 0.6) return 'phone';
    if (share(looksLikeEmail) >= 0.6) return 'email';
    // Anything else with a title is kept as a note, so no information is lost on the way in.
    return title ? 'note' : 'skip';
  });
  // Without titles, the first column of words is most likely the name.
  if (!out.some((f) => f === 'name' || f === 'firstName')) {
    const c = out.findIndex((f, i) => (f === 'skip' || f === 'note') && sample.some((r) => /\p{L}{2,}/u.test(r[i] ?? '')));
    if (c >= 0) out[c] = 'name';
  }
  return out;
}

export function parseLocale(v: string, fallback: Locale): Locale {
  const n = norm(v);
  if (/^(he|heb|hebrew|עב|עברית)$/.test(n)) return 'he';
  if (/^(en|eng|english|אנגלית)$/.test(n)) return 'en';
  return (locales as readonly string[]).includes(n) ? (n as Locale) : fallback;
}

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);

/** Several notes for one person become one text, each line saying where it came from. */
function joinNote(parts: { title: string; value: string }[]): string {
  if (parts.length === 1 && (!parts[0].title || fieldFromTitle(parts[0].title) === 'note')) return parts[0].value;
  return parts.map((p) => (p.title ? `${p.title}: ${p.value}` : p.value)).join('\n');
}

export function mergeNotes(a: string | undefined, b: string | undefined): string | undefined {
  if (!b) return a;
  if (!a) return b;
  return a.includes(b) ? a : `${a}\n${b}`;
}

export function buildImport(grid: Grid, setup: ImportSetup, opts: { defaultLocale: Locale; callingCode?: string }): ImportPlan {
  const { mapping } = setup;
  const cols = (f: ImportField) => mapping.flatMap((m, i) => (m === f ? [i] : []));
  const [nameCols, firstCols, lastCols, phoneCols, emailCols, noteCols, localeCols] = (['name', 'firstName', 'lastName', 'phone', 'email', 'note', 'locale'] as const).map(cols);
  const title = (c: number) => (setup.headerRow >= 0 ? cell(grid, setup.headerRow, c) : '');

  const rows: ImportRow[] = [];
  const skipped: ImportPlan['skipped'] = [];
  const byPhone = new Map<string, ImportRow>();
  let duplicates = 0;

  for (let r = Math.max(setup.firstRow, 0); r < grid.length; r++) {
    if (r === setup.headerRow || isEmpty(grid[r])) continue;
    const get = (c: number) => cell(grid, r, c);
    const words = (list: number[]) => list.map(get).filter(Boolean).join(' ');
    const name = clip((words(nameCols) || [words(firstCols), words(lastCols)].filter(Boolean).join(' ')).replace(/\s+/g, ' '), LIMITS.name);
    const phones = phoneCols.map((c) => ({ c, raw: get(c) })).filter((p) => p.raw);
    const rawPhones = phones.map((p) => p.raw);
    const phone = rawPhones.map((p) => cleanPhone(p, opts.callingCode)).find(Boolean);
    const text = grid[r].map((c) => c.trim()).filter(Boolean).join(' · ');
    const reason: SkipReason | null = !name ? 'noName' : !rawPhones.length ? 'noPhone' : !phone ? 'badPhone' : null;
    if (reason || !phone) {
      skipped.push({ row: r + 1, reason: reason ?? 'badPhone', text });
      continue;
    }
    const email = emailCols.map(get).find(looksLikeEmail);
    const notes = noteCols.map((c) => ({ title: title(c), value: get(c) })).filter((p) => p.value);
    // A second phone column (home, work…) that wasn't used is still worth keeping.
    for (const p of phones) if (cleanPhone(p.raw, opts.callingCode) !== phone) notes.push({ title: title(p.c) || '☎', value: p.raw });
    const note = notes.length ? clip(joinNote(notes), LIMITS.note) : undefined;
    const lang = localeCols.map(get).find(Boolean);

    const row: ImportRow = {
      row: r + 1,
      name,
      phone,
      email: email ? clip(email, LIMITS.email) : undefined,
      note,
      locale: lang ? parseLocale(lang, opts.defaultLocale) : opts.defaultLocale,
    };
    const key = phoneKey(phone, opts.callingCode);
    const prev = byPhone.get(key);
    if (prev) {
      duplicates++;
      prev.email ??= row.email;
      prev.note = mergeNotes(prev.note, row.note);
      continue;
    }
    byPhone.set(key, row);
    rows.push(row);
  }
  return { rows, skipped, duplicates };
}
