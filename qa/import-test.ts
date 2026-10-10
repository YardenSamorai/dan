/**
 * Spreadsheet → customers, on files shaped like the ones people really have:
 *   npm run test:import
 */
import * as XLSX from 'xlsx';
import { buildImport, firstDataRow, guessHeaderRow, guessMapping, type Grid } from '../src/domain/customerImport';
import { cleanPhone } from '../src/lib/phone';
import { readSpreadsheet } from '../src/lib/spreadsheet';

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
}

const auto = (grid: Grid) => {
  const headerRow = guessHeaderRow(grid);
  const firstRow = firstDataRow(grid, headerRow);
  const mapping = guessMapping(grid, headerRow, firstRow, '972');
  return { setup: { headerRow, firstRow, mapping }, plan: buildImport(grid, { headerRow, firstRow, mapping }, { defaultLocale: 'he', callingCode: '972' }) };
};

// Phones
check('050-1234567 → 050-123-4567', cleanPhone('050-1234567', '972') === '050-123-4567');
check('number without its 0 → 050-123-4567', cleanPhone('501234567', '972') === '050-123-4567');
check('+972 → local', cleanPhone('+972-50-123-4567', '972') === '050-123-4567');
check('972 without plus → local', cleanPhone('972501234567', '972') === '050-123-4567');
check('landline 03 → 03-555-0110', cleanPhone('035550110', '972') === '03-555-0110');
check('foreign number kept international', cleanPhone('+44 7700 900123', '972') === '+447700900123');
check('too short → null', cleanPhone('1234', '972') === null);

// An Excel file the way a salon exports it: a title line, titles in row 3, phones stored as numbers.
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([
  ['רשימת לקוחות 2026'],
  [],
  ['', 'שם פרטי', 'שם משפחה', 'נייד', 'טלפון בבית', 'דוא"ל', 'תאריך לידה', 'הערות'],
  ['', 'דנה', 'לוי', 501234567, '03-5550110', 'dana@example.com', new Date(Date.UTC(1990, 4, 12)), 'אלרגית ללטקס'],
  ['', 'רוני', 'כהן', '+972 52 765 4321', '', '', '', ''],
  ['', 'רוני', 'כהן', '052-7654321', '', 'roni@example.com', '', 'מגיעה עם הבת'],
  ['', 'בלי', 'טלפון', '', '', '', '', ''],
  ['', 'מספר', 'שבור', '12', '', '', '', ''],
  [],
  ['', 'Big', 'Number', 972541112222, '', '', '', ''],
]);
XLSX.utils.book_append_sheet(wb, ws, 'לקוחות');
const xlsx = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true }) as ArrayBuffer;
const [sheet] = await readSpreadsheet(new File([xlsx], 'customers.xlsx'));
check('reads the xlsx sheet', sheet.name === 'לקוחות' && sheet.grid.length === 10, sheet.grid.length);
check('whole-number phones keep every digit', sheet.grid[9][3] === '972541112222', sheet.grid[9][3]);

const { setup, plan } = auto(sheet.grid);
check('finds the titles row under the title line', setup.headerRow === 2, setup.headerRow);
check('first customer is the row after the titles', setup.firstRow === 3, setup.firstRow);
check('maps columns by their titles', JSON.stringify(setup.mapping) === JSON.stringify(['skip', 'firstName', 'lastName', 'phone', 'phone', 'email', 'note', 'note']), setup.mapping);
check('three customers come in', plan.rows.length === 3, plan.rows);
const dana = plan.rows[0];
check('first + last name joined', dana?.name === 'דנה לוי', dana);
check('phone gets its 0 back', dana?.phone === '050-123-4567', dana);
check('second phone and other columns land in notes', !!dana?.note?.includes('טלפון בבית: 03-5550110') && dana.note.includes('תאריך לידה: 12/05/1990') && dana.note.includes('הערות: אלרגית ללטקס'), dana?.note);
const roni = plan.rows.find((r) => r.name === 'רוני כהן');
check('same person twice is merged, details combined', plan.duplicates === 1 && roni?.email === 'roni@example.com' && roni.note === 'מגיעה עם הבת', roni);
check('rows without a usable phone are listed with the reason', JSON.stringify(plan.skipped.map((s) => [s.row, s.reason])) === JSON.stringify([[7, 'noPhone'], [8, 'badPhone']]), plan.skipped);
check('972… without plus is local', plan.rows[2]?.phone === '054-111-2222', plan.rows[2]);

// A CSV saved by Excel in Hebrew (windows-1255), no titles at all.
const win1255 = new Map([...'אבגדהוזחטיךכלםמןנסעףפץצקרשת'].map((ch, i) => [ch, 0xe0 + i]));
const csvText = 'מיכל אברהם,0549876543,michal@example.com\r\nיוסי,0501112233,\r\n';
const bytes = Uint8Array.from([...csvText].map((ch) => win1255.get(ch) ?? ch.charCodeAt(0)));
const [csv] = await readSpreadsheet(new File([bytes], 'export.csv'));
check('Hebrew CSV in windows-1255 decodes', csv.grid[0][0] === 'מיכל אברהם', csv.grid[0]);
check('CSV keeps leading zeros', csv.grid[0][1] === '0549876543', csv.grid[0][1]);
const noTitles = auto(csv.grid);
check('no titles: guesses by content', noTitles.setup.headerRow === -1 && JSON.stringify(noTitles.setup.mapping) === JSON.stringify(['name', 'phone', 'email']), noTitles.setup);
check('no titles: both customers in', noTitles.plan.rows.length === 2 && noTitles.plan.rows[0].email === 'michal@example.com', noTitles.plan.rows);

// English titles
const en = auto([['Customer Name', 'Mobile', 'E-mail', 'Language', 'Last visit'], ['Ann Smith', '0521234567', 'ann@x.com', 'English', '2026-01-02']]);
check('English titles map', JSON.stringify(en.setup.mapping) === JSON.stringify(['name', 'phone', 'email', 'locale', 'note']), en.setup.mapping);
check('language column understood', en.plan.rows[0]?.locale === 'en', en.plan.rows[0]);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
