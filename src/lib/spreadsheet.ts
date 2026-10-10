import type { CellObject, WorkSheet } from 'xlsx';
import type { Grid } from '../domain/customerImport';

/** Reading and writing spreadsheets. The parser is loaded on first use, not with the app. */

export interface Sheet {
  name: string;
  grid: Grid;
}

export const SPREADSHEET_ACCEPT = '.xlsx,.xlsm,.xls,.csv,.tsv,.txt,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv';
const TEXT_FILE = /\.(csv|tsv|txt)$/i;

/** 12/05/1990: the order used in Israel and in the app's English (en-GB), never the US m/d/yy. */
function dayMonthYear(d: Date): string {
  const utc = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  const [y, m, day] = utc ? [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()] : [d.getFullYear(), d.getMonth(), d.getDate()];
  return `${String(day).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`;
}

/** Text exactly as a person reads it in the sheet, except whole numbers keep every digit (phones!). */
function text(c: CellObject | undefined): string {
  if (!c || c.t === 'e' || c.t === 'z') return '';
  if (c.t === 'n' && typeof c.v === 'number' && Number.isInteger(c.v) && Math.abs(c.v) < 1e15) return String(c.v);
  if (c.t === 's') return String(c.v ?? '');
  if (c.t === 'd' && c.v instanceof Date && !Number.isNaN(+c.v)) return dayMonthYear(c.v);
  return c.w ?? String(c.v ?? '');
}

function toGrid(ws: WorkSheet, decodeRange: (ref: string) => { s: { r: number; c: number }; e: { r: number; c: number } }): Grid {
  const rows = (ws['!data'] ?? []) as (CellObject | undefined)[][];
  if (!ws['!ref']) return [];
  const { e } = decodeRange(ws['!ref']);
  const grid: Grid = [];
  for (let r = 0; r <= e.r; r++) {
    const row = rows[r] ?? [];
    grid.push(Array.from({ length: e.c + 1 }, (_, c) => text(row[c]).replace(/\s+/g, ' ').trim()));
  }
  while (grid.length && grid[grid.length - 1].every((v) => !v)) grid.pop();
  return grid;
}

/** CSVs from Excel in Hebrew are often not UTF-8. */
function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1255').decode(buf);
  }
}

export async function readSpreadsheet(file: File): Promise<Sheet[]> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = TEXT_FILE.test(file.name)
    ? XLSX.read(decodeText(buf).replace(/^\uFEFF/, ''), { type: 'string', dense: true, raw: true })
    : XLSX.read(buf, { type: 'array', dense: true, cellDates: true });
  return wb.SheetNames.map((name) => ({ name, grid: toGrid(wb.Sheets[name], XLSX.utils.decode_range) }));
}

export async function downloadSpreadsheet(fileName: string, rows: string[][], rtl: boolean) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = rows[0].map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Customers');
  if (rtl) wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.writeFile(wb, fileName);
}
