import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertIcon, CloseIcon, PlusIcon } from '../../components/ui/Icons';
import { StaffAvatar, Switch } from '../../components/ui/bits';
import { useToast } from '../../components/ui/Toast';
import { businessNow, checkSlot, isUpcoming, occupiesTime } from '../../domain/scheduling';
import { addDays } from '../../domain/time';
import type { DayHours, TenantData, TimeOffKind, TimeRange, Weekday, WeeklySchedule } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { useAppUI } from '../AppUI';
import { useLookup } from '../lookup';
import { PageHeader, TimeSelect } from '../shared';
import { useWorkspace } from '../workspace';

type Tab = 'hours' | 'special' | 'timeOff' | 'blocks';
const TABS: Tab[] = ['hours', 'special', 'timeOff', 'blocks'];
const WEEK: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const KINDS: TimeOffKind[] = ['vacation', 'sick', 'personal', 'training', 'other'];

export default function AvailabilityPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'hours') as Tab;

  return (
    <div className="page">
      <PageHeader title={t('app.nav.availability')} lede={t('availability.lede')} />
      <div className="tabs" role="tablist">
        {TABS.map((x) => (
          <button
            key={x}
            type="button"
            role="tab"
            aria-selected={tab === x}
            onClick={() => {
              const p = new URLSearchParams(params);
              x === 'hours' ? p.delete('tab') : p.set('tab', x);
              setParams(p, { replace: true });
            }}
          >
            {t(`availability.tabs.${x}`)}
          </button>
        ))}
      </div>
      {tab === 'hours' && <HoursTab />}
      {tab === 'special' && <SpecialTab />}
      {tab === 'timeOff' && <TimeOffTab />}
      {tab === 'blocks' && <BlocksTab />}
    </div>
  );
}

// ── Weekly hours ────────────────────────────────────────────────────

function HoursTab() {
  const L = useLookup();
  const { state } = L;
  const { t, tx } = useI18n();
  const toast = useToast();
  const { api } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const subject = params.get('subject') && L.staff.has(params.get('subject')!) ? params.get('subject')! : 'business';
  const staff = subject === 'business' ? null : L.staff.get(subject)!;
  const saved = staff ? staff.schedule : state.business.hours;
  const [draft, setDraft] = useState<{ key: string; value: WeeklySchedule }>({ key: subject, value: saved });
  const value = draft.key === subject ? draft.value : saved;
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  const [busy, setBusy] = useState(false);

  const pick = (s: string) => {
    const p = new URLSearchParams(params);
    s === 'business' ? p.delete('subject') : p.set('subject', s);
    setParams(p, { replace: true });
  };

  // Booked appointments the draft would strand.
  const stranded = useMemo(() => {
    if (!dirty) return 0;
    const next: TenantData = staff
      ? { ...state, staff: state.staff.map((s) => (s.id === staff.id ? { ...s, schedule: value } : s)) }
      : { ...state, business: { ...state.business, hours: value } };
    const now = new Date();
    return state.appointments.filter((a) => {
      if (!occupiesTime(a) || !isUpcoming(a, now, state.business.timezone) || (staff && a.staffId !== staff.id)) return false;
      const c = checkSlot(next, { staffId: a.staffId, date: a.date, start: a.start, duration: a.duration, excludeAppointmentId: a.id });
      return !!c && ['closed', 'not_working', 'outside_shift', 'break'].includes(c.kind);
    }).length;
  }, [dirty, state, staff, value]);

  const save = async () => {
    setBusy(true);
    if (staff) await api.saveStaff({ ...staff, schedule: value });
    else await api.updateBusiness({ hours: value });
    setBusy(false);
    toast(t('common.saved'));
  };

  return (
    <>
      <div className="staff-pick" role="group" aria-label={t('availability.tabs.hours')}>
        <button type="button" aria-pressed={!staff} onClick={() => pick('business')} style={{ paddingInlineStart: 14 }}>
          {t('availability.businessHours')}
        </button>
        {state.staff
          .filter((s) => s.active)
          .map((s) => (
            <button key={s.id} type="button" aria-pressed={subject === s.id} onClick={() => pick(s.id)}>
              <StaffAvatar staff={s} size="sm" /> {tx(s.name)}
            </button>
          ))}
      </div>

      <section className="panel">
        <header className="panel__head">
          <h2 className="panel__title">{staff ? `${t('availability.staffHours')} · ${tx(staff.name)}` : t('availability.businessHours')}</h2>
        </header>
        <div className="panel__body">
          <ScheduleEditor value={value} closedLabel={staff ? t('availability.notWorking') : t('availability.closedDay')} onChange={(v) => setDraft({ key: subject, value: v })} />
          {dirty && (
            <div className="save-bar">
              {stranded > 0 && (
                <p className="inline-alert inline-alert--warn" style={{ marginInlineEnd: 'auto' }}>
                  <AlertIcon size={14} /> {t('availability.stranded', { count: stranded })}
                </p>
              )}
              <button type="button" className="btn btn--quiet btn--sm" onClick={() => setDraft({ key: subject, value: saved })}>
                {t('common.cancel')}
              </button>
              <button type="button" className="btn btn--ink btn--sm" disabled={busy} onClick={save}>
                {busy ? t('common.saving') : t('common.save')}
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function ScheduleEditor({ value, closedLabel, onChange }: { value: WeeklySchedule; closedLabel: string; onChange: (v: WeeklySchedule) => void }) {
  const { t, fmt } = useI18n();
  const setDay = (d: Weekday, day: DayHours) => onChange({ ...value, [d]: day });

  return (
    <div className="sched">
      {WEEK.map((d) => {
        const day = value[d];
        const on = day.ranges.length > 0;
        return (
          <div className="sched__row" key={d}>
            <div className="sched__day">
              <Switch
                checked={on}
                label={fmt.weekday(d, 'long')}
                onChange={(v) => setDay(d, v ? { ranges: [{ start: 9 * 60, end: 18 * 60 }], breaks: [] } : { ranges: [], breaks: [] })}
              />
            </div>
            {on ? (
              <div className="sched__ranges">
                <RangeList
                  label={t('availability.staffHours')}
                  ranges={day.ranges}
                  onChange={(ranges) => setDay(d, { ...day, ranges })}
                  addLabel={t('availability.addRange')}
                  min={1}
                />
                <RangeList
                  label={t('availability.breaks')}
                  ranges={day.breaks}
                  onChange={(breaks) => setDay(d, { ...day, breaks })}
                  addLabel={t('availability.addBreak')}
                  min={0}
                  muted
                />
              </div>
            ) : (
              <span className="sched__off">{closedLabel}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RangeList({
  label,
  ranges,
  onChange,
  addLabel,
  min,
  muted,
}: {
  label: string;
  ranges: TimeRange[];
  onChange: (r: TimeRange[]) => void;
  addLabel: string;
  min: number;
  muted?: boolean;
}) {
  const { t } = useI18n();
  const update = (i: number, r: TimeRange) => onChange(ranges.map((x, j) => (j === i ? r : x)));
  return (
    <>
      {ranges.map((r, i) => (
        <div className="sched__range" key={i}>
          <span className="sched__label">{muted ? label : ''}</span>
          <TimeSelect label={`${label} ${t('common.from')}`} value={r.start} from={6 * 60} to={23 * 60} onChange={(m) => update(i, { ...r, start: m })} />
          <span aria-hidden>-</span>
          <TimeSelect label={`${label} ${t('common.to')}`} value={r.end} from={6 * 60} to={23 * 60} onChange={(m) => update(i, { ...r, end: m })} />
          {r.end <= r.start && <AlertIcon size={14} className="field__error" />}
          {ranges.length > min && (
            <button type="button" className="btn btn--quiet btn--xs btn--icon" aria-label={t('common.remove')} onClick={() => onChange(ranges.filter((_, j) => j !== i))}>
              <CloseIcon size={12} />
            </button>
          )}
        </div>
      ))}
      <div className="sched__range sched__range--add">
        <button
          type="button"
          className="btn btn--quiet btn--xs"
          onClick={() => {
            const last = ranges[ranges.length - 1];
            const start = last ? Math.min(last.end + 60, 22 * 60) : 13 * 60;
            onChange([...ranges, { start, end: Math.min(start + (muted ? 30 : 120), 23 * 60) }]);
          }}
        >
          <PlusIcon size={12} /> {addLabel}
        </button>
      </div>
    </>
  );
}

// ── Special days ────────────────────────────────────────────────────

function SpecialTab() {
  const L = useLookup();
  const { state } = L;
  const { t, tx, fmt } = useI18n();
  const toast = useToast();
  const { api, solo } = useWorkspace();
  const today = businessNow(state).date;
  const [who, setWho] = useState<string>('');
  const [date, setDate] = useState(addDays(today, 7));
  const [closed, setClosed] = useState(true);
  const [ranges, setRanges] = useState<TimeRange[]>([{ start: 10 * 60, end: 14 * 60 }]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const list = state.exceptions.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const valid = date >= today && (closed || (ranges.length > 0 && ranges.every((r) => r.end > r.start)));

  return (
    <div className="dash-grid">
      <section className="panel">
        <header className="panel__head">
          <h2 className="panel__title">{t('availability.tabs.special')}</h2>
        </header>
        <p className="panel__body muted">{t('availability.special.lede')}</p>
        {list.length === 0 ? (
          <p className="empty">{t('availability.special.empty')}</p>
        ) : (
          <div className="list">
            {list.map((e) => {
              const st = e.staffId ? L.staff.get(e.staffId) : null;
              return (
                <div className="list__row" key={e.id}>
                  {st ? <StaffAvatar staff={st} size="sm" /> : <span className="avatar avatar--sm" aria-hidden />}
                  <div className="list__main">
                    <span className="list__title">
                      {fmt.date(e.date, 'medium')} {e.label && `· ${e.label}`}
                    </span>
                    <span className="list__sub">
                      {e.closed ? t('availability.special.closedTag') : e.ranges.map((r) => fmt.timeRange(r.start, r.end)).join(', ')}
                      {!solo && ` · ${st ? tx(st.name) : t('availability.businessHours')}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn--quiet btn--xs btn--icon"
                    aria-label={t('common.remove')}
                    onClick={async () => {
                      await api.removeException(e.id);
                      toast(t('common.saved'));
                    }}
                  >
                    <CloseIcon size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <header className="panel__head">
          <h2 className="panel__title">{t('availability.special.add')}</h2>
        </header>
        <form
          className="panel__body form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid) return;
            setBusy(true);
            await api.saveException({ staffId: who || null, date, closed, ranges: closed ? [] : ranges, breaks: [], label: label.trim() });
            setBusy(false);
            setLabel('');
            toast(t('common.saved'));
          }}
        >
          {!solo && (
            <label className="field">
              <span className="field__label">{t('availability.special.who')}</span>
              <select className="field__input" value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="">{t('availability.businessHours')}</option>
                {state.staff
                  .filter((s) => s.active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {tx(s.name)}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="field">
            <span className="field__label">{t('availability.special.date')}</span>
            <input type="date" className="field__input" value={date} min={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
          <Switch checked={closed} onChange={setClosed} label={t('availability.special.closed')} />
          {!closed && (
            <div className="sched__ranges">
              <RangeList label={t('availability.special.hours')} ranges={ranges} onChange={setRanges} addLabel={t('availability.addRange')} min={1} />
            </div>
          )}
          <label className="field">
            <span className="field__label">
              {t('availability.special.label')} <span className="muted">({t('common.optional')})</span>
            </span>
            <input className="field__input" placeholder={t('availability.special.labelPlaceholder')} value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <button type="submit" className="btn btn--ink" disabled={!valid || busy}>
            {t('availability.special.add')}
          </button>
        </form>
      </section>
    </div>
  );
}

// ── Time off ────────────────────────────────────────────────────────

function TimeOffTab() {
  const L = useLookup();
  const { state } = L;
  const { t, tx, fmt } = useI18n();
  const toast = useToast();
  const { api } = useWorkspace();
  const today = businessNow(state).date;
  const team = state.staff.filter((s) => s.active);
  const [staffId, setStaffId] = useState(team[0]?.id ?? '');
  const [kind, setKind] = useState<TimeOffKind>('vacation');
  const [from, setFrom] = useState(addDays(today, 7));
  const [to, setTo] = useState(addDays(today, 9));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = staffId && from <= to;

  const affectedIn = (sid: string, a: string, b: string) =>
    state.appointments.filter((x) => x.staffId === sid && x.date >= a && x.date <= b && occupiesTime(x) && x.status !== 'completed').length;
  const affected = valid ? affectedIn(staffId, from, to) : 0;

  const current = state.timeOff.filter((x) => x.to >= today).sort((a, b) => a.from.localeCompare(b.from));
  const past = state.timeOff.filter((x) => x.to < today).sort((a, b) => b.from.localeCompare(a.from));

  const row = (x: (typeof state.timeOff)[number]) => {
    const st = L.staff.get(x.staffId);
    const n = x.to >= today ? affectedIn(x.staffId, x.from > today ? x.from : today, x.to) : 0;
    return (
      <div className="list__row" key={x.id}>
        {st && <StaffAvatar staff={st} size="sm" />}
        <div className="list__main">
          <span className="list__title">
            {tx(st?.name)} · {t(`timeOffKind.${x.kind}`)}
          </span>
          <span className="list__sub">
            {x.from === x.to ? fmt.date(x.from, 'medium') : `${fmt.date(x.from, 'medium')} - ${fmt.date(x.to, 'medium')}`}
            {x.note && ` · ${x.note}`}
          </span>
        </div>
        {n > 0 && (
          <span className="badge" data-status="pending">
            {t('units.appointments', { count: n })}
          </span>
        )}
        <button
          type="button"
          className="btn btn--quiet btn--xs btn--icon"
          aria-label={t('common.remove')}
          onClick={async () => {
            await api.removeTimeOff(x.id);
            toast(t('common.saved'));
          }}
        >
          <CloseIcon size={12} />
        </button>
      </div>
    );
  };

  return (
    <div className="dash-grid">
      <div className="dash-col">
        <section className="panel">
          <header className="panel__head">
            <h2 className="panel__title">{t('availability.timeOff.upcoming')}</h2>
          </header>
          {current.length ? <div className="list">{current.map(row)}</div> : <p className="empty">{t('availability.timeOff.empty')}</p>}
        </section>
        {past.length > 0 && (
          <section className="panel">
            <header className="panel__head">
              <h2 className="panel__title">{t('availability.timeOff.past')}</h2>
            </header>
            <div className="list">{past.map(row)}</div>
          </section>
        )}
      </div>

      <section className="panel">
        <header className="panel__head">
          <h2 className="panel__title">{t('availability.timeOff.add')}</h2>
        </header>
        <form
          className="panel__body form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid) return;
            setBusy(true);
            await api.addTimeOff({ staffId, kind, from, to, note: note.trim() || undefined });
            setBusy(false);
            setNote('');
            toast(t('common.saved'));
          }}
        >
          <label className="field">
            <span className="field__label">{t('availability.timeOff.staff')}</span>
            <select className="field__input" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              {team.map((s) => (
                <option key={s.id} value={s.id}>
                  {tx(s.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">{t('availability.timeOff.kind')}</span>
            <select className="field__input" value={kind} onChange={(e) => setKind(e.target.value as TimeOffKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`timeOffKind.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label className="field">
              <span className="field__label">{t('availability.timeOff.from')}</span>
              <input type="date" className="field__input" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">{t('availability.timeOff.to')}</span>
              <input type="date" className="field__input" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span className="field__label">
              {t('availability.timeOff.note')} <span className="muted">({t('common.optional')})</span>
            </span>
            <input className="field__input" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {affected > 0 && (
            <p className="inline-alert inline-alert--warn">
              <AlertIcon size={14} /> {t('availability.timeOff.affected', { count: affected })}
            </p>
          )}
          <button type="submit" className="btn btn--ink" disabled={!valid || busy}>
            {t('availability.timeOff.add')}
          </button>
        </form>
      </section>
    </div>
  );
}

// ── Blocks ──────────────────────────────────────────────────────────

function BlocksTab() {
  const L = useLookup();
  const { t, tx, fmt } = useI18n();
  const toast = useToast();
  const { newAppointment } = useAppUI();
  const { api } = useWorkspace();
  const today = businessNow(L.state).date;
  const blocks = L.state.blocks.filter((b) => b.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);

  return (
    <section className="panel">
      <header className="panel__head">
        <h2 className="panel__title">{t('availability.tabs.blocks')}</h2>
        <button type="button" className="btn btn--ink btn--sm" onClick={() => newAppointment({ mode: 'block' })}>
          <PlusIcon /> {t('availability.blocks.add')}
        </button>
      </header>
      {blocks.length === 0 ? (
        <p className="empty">{t('availability.blocks.empty')}</p>
      ) : (
        <div className="list">
          {blocks.map((b) => {
            const st = b.staffId ? L.staff.get(b.staffId) : null;
            return (
              <div className="list__row" key={b.id}>
                {st ? <StaffAvatar staff={st} size="sm" /> : <span className="avatar avatar--sm" aria-hidden />}
                <div className="list__main">
                  <span className="list__title">
                    {b.label} <span className="badge badge--plain">{t(`blockKind.${b.kind}`)}</span>
                  </span>
                  <span className="list__sub">
                    {fmt.date(b.date, 'medium')} · <span className="ltr">{fmt.timeRange(b.start, b.end)}</span> · {st ? tx(st.name) : t('appt.new.wholeTeam')}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn--quiet btn--xs btn--icon"
                  aria-label={t('common.remove')}
                  onClick={async () => {
                    await api.removeBlock(b.id);
                    toast(t('common.saved'));
                  }}
                >
                  <CloseIcon size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
