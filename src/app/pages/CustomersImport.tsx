import { useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AlertIcon, ArrowBackIcon, CheckIcon, DownloadIcon, UploadIcon } from '../../components/ui/Icons';
import {
  IMPORT_FIELDS,
  IMPORT_LIMIT,
  buildImport,
  cell,
  columnLetter,
  firstDataRow,
  guessHeaderRow,
  guessMapping,
  usedColumns,
  type Grid,
  type ImportField,
  type ImportSetup,
} from '../../domain/customerImport';
import type { CustomerImportResult } from '../../data';
import { useI18n } from '../../i18n/I18nProvider';
import { callingCode, phoneKey } from '../../lib/phone';
import { SPREADSHEET_ACCEPT, downloadSpreadsheet, readSpreadsheet, type Sheet } from '../../lib/spreadsheet';
import { useLookup } from '../lookup';
import { PageHeader } from '../shared';
import { useWorkspace } from '../workspace';
import './customers-import.css';

type Step = 'file' | 'map' | 'done';
const PREVIEW_AFTER = 12;
const PICKABLE_ROWS = 40;
/** Phones and dates read left to right even on a Hebrew page. */
const NUMERIC = /^[\d+\-()./ ]+$/;

function autoSetup(grid: Grid, code?: string): ImportSetup {
  const headerRow = guessHeaderRow(grid);
  const firstRow = firstDataRow(grid, headerRow);
  return { headerRow, firstRow, mapping: guessMapping(grid, headerRow, firstRow, code) };
}

export default function CustomersImport() {
  const { t, fmt, dir } = useI18n();
  const { api, tenant, can } = useWorkspace();
  const L = useLookup();
  const code = callingCode(tenant.business.timezone);

  const [step, setStep] = useState<Step>('file');
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [fileName, setFileName] = useState('');
  const [sheetIdx, setSheetIdx] = useState(0);
  const [setup, setSetup] = useState<ImportSetup>({ headerRow: -1, firstRow: 0, mapping: [] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CustomerImportResult | null>(null);

  const grid = sheets[sheetIdx]?.grid ?? [];
  const plan = useMemo(() => buildImport(grid, setup, { defaultLocale: tenant.business.defaultLocale, callingCode: code }), [grid, setup, tenant.business.defaultLocale, code]);
  const existing = useMemo(() => {
    const known = new Set(L.state.customers.map((c) => phoneKey(c.phone, code)));
    return plan.rows.filter((r) => known.has(phoneKey(r.phone, code))).length;
  }, [plan, L.state.customers, code]);

  if (!can('customers.edit')) return <Navigate to="/app/customers" replace />;

  const open = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const read = await readSpreadsheet(file);
      const first = read.findIndex((s) => s.grid.length > 0);
      if (first < 0) return setError(t('customers.import.errors.empty'));
      setSheets(read);
      setFileName(file.name);
      setSheetIdx(first);
      setSetup(autoSetup(read[first].grid, code));
      setStep('map');
    } catch {
      setError(t('customers.import.errors.read'));
    } finally {
      setBusy(false);
    }
  };

  const pickSheet = (i: number) => {
    setSheetIdx(i);
    setSetup(autoSetup(sheets[i].grid, code));
  };

  const setHeaderRow = (headerRow: number) => {
    const firstRow = setup.firstRow > headerRow ? setup.firstRow : firstDataRow(grid, headerRow);
    setSetup({ headerRow, firstRow, mapping: guessMapping(grid, headerRow, firstRow, code) });
  };

  const setFirstRow = (firstRow: number) => {
    if (firstRow > setup.headerRow) return setSetup({ ...setup, firstRow });
    // The titles can't come after the first customer.
    const headerRow = firstRow - 1 >= 0 && guessHeaderRow(grid.slice(0, firstRow)) === firstRow - 1 ? firstRow - 1 : -1;
    setSetup({ headerRow, firstRow, mapping: guessMapping(grid, headerRow, firstRow, code) });
  };

  const setField = (col: number, field: ImportField) => {
    const mapping = [...setup.mapping];
    // Name is one column; the others may repeat (two phone columns, several notes).
    if (field === 'name') mapping.forEach((f, i) => f === 'name' && (mapping[i] = 'skip'));
    mapping[col] = field;
    setSetup({ ...setup, mapping });
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.importCustomers(plan.rows.map(({ row: _row, ...c }) => c)));
      setStep('done');
    } catch {
      setError(t('customers.import.failed'));
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setSheets([]);
    setResult(null);
    setError(null);
    setStep('file');
  };

  const sample = async () => {
    const s = (k: 'name' | 'phone' | 'email' | 'note' | 'rowName' | 'rowNote') => t(`customers.import.sample.${k}`);
    await downloadSpreadsheet(t('customers.import.templateFile'), [
      [s('name'), s('phone'), s('email'), s('note')],
      [s('rowName'), '050-123-4567', 'dana@example.com', s('rowNote')],
    ], dir === 'rtl');
  };

  return (
    <div className="page imp">
      <PageHeader
        eyebrow={
          <Link to="/app/customers" className="imp__back">
            <ArrowBackIcon size={14} /> {t('app.nav.customers')}
          </Link>
        }
        title={t('customers.import.title')}
        lede={t('customers.import.lede')}
      />

      <ol className="imp__steps" aria-label={t('customers.import.title')}>
        {(['file', 'map', 'done'] as const).map((s, i) => {
          const at = ['file', 'map', 'done'].indexOf(step);
          return (
            <li key={s} data-state={i < at ? 'done' : i === at ? 'current' : undefined} aria-current={i === at ? 'step' : undefined}>
              <span className="imp__step-dot">{i < at ? <CheckIcon size={12} /> : fmt.number(i + 1)}</span>
              {t(`customers.import.steps.${s}`)}
            </li>
          );
        })}
      </ol>

      {error && (
        <p className="imp__error" role="alert">
          <AlertIcon size={16} /> {error}
        </p>
      )}

      {step === 'file' && <FileStep busy={busy} onFile={open} onSample={sample} />}

      {step === 'map' && (
        <>
          <section className="panel imp__setup">
            <div className="imp__controls">
              <span className="imp__file" title={fileName}>
                {fileName}
              </span>
              {sheets.length > 1 && (
                <label className="imp__control">
                  <span>{t('customers.import.sheet')}</span>
                  <select className="field__input field__input--sm" value={sheetIdx} onChange={(e) => pickSheet(+e.target.value)}>
                    {sheets.map((s, i) => (
                      <option key={s.name} value={i} disabled={!s.grid.length}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="imp__control">
                <span>{t('customers.import.headerRow')}</span>
                <select className="field__input field__input--sm" value={setup.headerRow} onChange={(e) => setHeaderRow(+e.target.value)}>
                  <option value={-1}>{t('customers.import.noHeader')}</option>
                  {grid.slice(0, PICKABLE_ROWS).map((_, r) => (
                    <option key={r} value={r}>
                      {t('customers.import.rowN', { n: r + 1 })}
                    </option>
                  ))}
                </select>
              </label>
              <label className="imp__control">
                <span>{t('customers.import.firstRow')}</span>
                <select className="field__input field__input--sm" value={setup.firstRow} onChange={(e) => setFirstRow(+e.target.value)}>
                  {grid.slice(0, Math.max(PICKABLE_ROWS, setup.firstRow + 1)).map((_, r) => (
                    <option key={r} value={r}>
                      {t('customers.import.rowN', { n: r + 1 })}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="imp__hint">{t('customers.import.gridHint')}</p>
            <Preview grid={grid} setup={setup} onField={setField} onFirstRow={setFirstRow} />
          </section>

          <Summary plan={plan} existing={existing} busy={busy} onRun={run} onBack={restart} mapping={setup.mapping} />
        </>
      )}

      {step === 'done' && result && (
        <section className="panel imp__done">
          <span className="imp__done-mark">
            <CheckIcon size={26} />
          </span>
          <h2>{t('customers.import.doneTitle')}</h2>
          <ul>
            {result.added > 0 && <li>{t('customers.import.added', { count: result.added })}</li>}
            {result.updated > 0 && <li>{t('customers.import.updated', { count: result.updated })}</li>}
            {result.unchanged > 0 && <li>{t('customers.import.unchanged', { count: result.unchanged })}</li>}
          </ul>
          <div className="imp__actions">
            <Link to="/app/customers" className="btn btn--ink">
              {t('customers.import.toCustomers')}
            </Link>
            <button type="button" className="btn btn--quiet" onClick={restart}>
              {t('customers.import.another')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function FileStep({ busy, onFile, onSample }: { busy: boolean; onFile: (f: File) => void; onSample: () => void }) {
  const { t, fmt } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };
  return (
    <div className="imp__start">
      <label
        className="imp__drop"
        data-over={over || undefined}
        data-busy={busy || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
      >
        <input
          ref={input}
          type="file"
          accept={SPREADSHEET_ACCEPT}
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onFile(f);
          }}
        />
        <span className="imp__drop-icon">
          <UploadIcon size={22} />
        </span>
        <span className="imp__drop-title">{busy ? t('customers.import.reading') : t('customers.import.drop')}</span>
        {!busy && <span className="btn btn--ink btn--sm">{t('customers.import.choose')}</span>}
        <span className="imp__drop-sub">{t('customers.import.formats', { limit: fmt.number(IMPORT_LIMIT) })}</span>
        <span className="imp__drop-sub">{t('customers.import.privacy')}</span>
      </label>

      <aside className="panel imp__tips">
        <h2 className="section-title">{t('customers.import.tipsTitle')}</h2>
        <ul>
          <li>{t('customers.import.tip1')}</li>
          <li>{t('customers.import.tip2')}</li>
          <li>{t('customers.import.tip3')}</li>
        </ul>
        <button type="button" className="btn btn--tinted btn--sm" onClick={onSample}>
          <DownloadIcon size={14} /> {t('customers.import.template')}
        </button>
      </aside>
    </div>
  );
}

function Preview({ grid, setup, onField, onFirstRow }: { grid: Grid; setup: ImportSetup; onField: (col: number, f: ImportField) => void; onFirstRow: (r: number) => void }) {
  const { t } = useI18n();
  const cols = usedColumns(grid, setup);
  const top = Math.max(0, Math.min(setup.headerRow >= 0 ? setup.headerRow : setup.firstRow, setup.firstRow) - 2);
  const end = Math.min(grid.length, Math.max(setup.firstRow, setup.headerRow) + PREVIEW_AFTER);
  const rows = Array.from({ length: end - top }, (_, i) => top + i);

  return (
    <div className="imp__grid-wrap">
      <table className="imp__grid">
        <thead>
          <tr>
            <th className="imp__corner" />
            {cols.map((c) => {
              const f = setup.mapping[c] ?? 'skip';
              return (
                <th key={c} scope="col" data-skip={f === 'skip' || undefined}>
                  <span className="imp__letter">{columnLetter(c)}</span>
                  <select
                    className="imp__field"
                    value={f}
                    aria-label={`${columnLetter(c)}${setup.headerRow >= 0 && cell(grid, setup.headerRow, c) ? ` · ${cell(grid, setup.headerRow, c)}` : ''}`}
                    onChange={(e) => onField(c, e.target.value as ImportField)}
                  >
                    {IMPORT_FIELDS.map((x) => (
                      <option key={x} value={x}>
                        {t(`customers.import.fields.${x}`)}
                      </option>
                    ))}
                  </select>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const role = r === setup.headerRow ? 'header' : r === setup.firstRow ? 'first' : r < setup.firstRow ? 'before' : undefined;
            return (
              <tr key={r} data-role={role} onClick={() => r !== setup.headerRow && onFirstRow(r)}>
                <th scope="row">
                  <button type="button" className="imp__rownum" onClick={(e) => (e.stopPropagation(), r !== setup.headerRow && onFirstRow(r))} aria-pressed={r === setup.firstRow}>
                    {r + 1}
                  </button>
                  {role === 'header' && <span className="imp__tag">{t('customers.import.titleTag')}</span>}
                  {role === 'first' && <span className="imp__tag imp__tag--go">{t('customers.import.firstTag')}</span>}
                </th>
                {cols.map((c) => {
                  const v = cell(grid, r, c);
                  return (
                    <td key={c} data-skip={(setup.mapping[c] ?? 'skip') === 'skip' || undefined} dir={NUMERIC.test(v) ? 'ltr' : 'auto'}>
                      {v}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {grid.length > end && <p className="imp__more">{t('customers.import.moreRows', { count: grid.length - end })}</p>}
    </div>
  );
}

function Summary({
  plan,
  existing,
  busy,
  mapping,
  onRun,
  onBack,
}: {
  plan: ReturnType<typeof buildImport>;
  existing: number;
  busy: boolean;
  mapping: ImportField[];
  onRun: () => void;
  onBack: () => void;
}) {
  const { t, fmt } = useI18n();
  const [showSkipped, setShowSkipped] = useState(false);
  const hasName = mapping.some((f) => f === 'name' || f === 'firstName' || f === 'lastName');
  const hasPhone = mapping.includes('phone');
  const tooMany = plan.rows.length > IMPORT_LIMIT;
  const ready = hasName && hasPhone && plan.rows.length > 0 && !tooMany;
  const SHOWN = 30;

  return (
    <section className="panel imp__summary" aria-live="polite">
      {!hasName || !hasPhone ? (
        <ul className="imp__needs">
          {!hasName && <li>{t('customers.import.needs.name')}</li>}
          {!hasPhone && <li>{t('customers.import.needs.phone')}</li>}
        </ul>
      ) : (
        <ul className="imp__facts">
          <li className="imp__fact--main">{t('customers.import.ready', { count: plan.rows.length })}</li>
          {existing > 0 && <li>{t('customers.import.existing', { count: existing })}</li>}
          {plan.duplicates > 0 && <li>{t('customers.import.duplicates', { count: plan.duplicates })}</li>}
          {plan.skipped.length > 0 && (
            <li data-warn>
              {t('customers.import.skipped', { count: plan.skipped.length })}{' '}
              <button type="button" className="imp__link" onClick={() => setShowSkipped((s) => !s)} aria-expanded={showSkipped}>
                {showSkipped ? t('customers.import.hideSkipped') : t('customers.import.showSkipped')}
              </button>
            </li>
          )}
          {tooMany && <li data-warn>{t('customers.import.errors.tooMany', { count: fmt.number(plan.rows.length), limit: fmt.number(IMPORT_LIMIT) })}</li>}
        </ul>
      )}

      {showSkipped && plan.skipped.length > 0 && (
        <ul className="imp__skipped">
          {plan.skipped.slice(0, SHOWN).map((s) => (
            <li key={s.row}>
              <span className="imp__skipped-row">{t('customers.import.rowN', { n: s.row })}</span>
              <span className="imp__skipped-why">{t(`customers.import.reasons.${s.reason}`)}</span>
              <span className="imp__skipped-text">{s.text}</span>
            </li>
          ))}
          {plan.skipped.length > SHOWN && <li className="muted">{t('customers.import.skippedMore', { count: plan.skipped.length - SHOWN })}</li>}
        </ul>
      )}

      <div className="imp__actions">
        <button type="button" className="btn btn--ink" disabled={!ready || busy} onClick={onRun}>
          {busy ? t('customers.import.importing') : t('customers.import.confirm', { count: plan.rows.length })}
        </button>
        <button type="button" className="btn btn--quiet" disabled={busy} onClick={onBack}>
          {t('customers.import.otherFile')}
        </button>
      </div>
    </section>
  );
}
