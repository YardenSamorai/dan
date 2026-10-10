import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as RMouseEvent,
  type PointerEvent as RPointerEvent,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, PlusIcon } from '../../components/ui/Icons';
import { Segmented, StaffAvatar, StatusBadge, Switch } from '../../components/ui/bits';
import { useToast } from '../../components/ui/Toast';
import { businessHours, businessNow, checkSlot, exceptionOn, occupiesTime, staffDay, type Conflict } from '../../domain/scheduling';
import { addDays, snap, startOfWeek, weekdayOf } from '../../domain/time';
import type { Appointment, Block, ISODate, Minutes, Staff, TenantData, TimeOff, TimeRange } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { useAppUI } from '../AppUI';
import { useLookup } from '../lookup';
import { isSoftConflict, useConflictText } from '../shared';
import { useWorkspace } from '../workspace';
import './calendar.css';

type View = 'day' | 'week' | 'list';

interface Column {
  key: string;
  date: ISODate;
  /** The single artist this column belongs to (day view, or week filtered to one artist). */
  staff: Staff | null;
  closed: boolean;
  shift: TimeRange[];
  breaks: TimeRange[];
  blocks: Block[];
  timeOff: TimeOff | null;
  /** Week view, whole team: who's away that day. */
  away: TimeOff[];
  /** Week view, whole team: one fixed lane per artist working that day. */
  staffLanes: string[] | null;
  /** Label of a special-hours exception affecting this column. */
  special: string | null;
  appointments: Appointment[];
}

interface Preview {
  id: string;
  col: number;
  start: Minutes;
  conflict: Conflict | null;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Side-by-side lanes for overlapping appointments within one column. */
function layoutLanes(items: { id: string; start: number; end: number }[]) {
  const out = new Map<string, { lane: number; lanes: number }>();
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: { id: string; end: number; lane: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => out.set(c.id, { lane: c.lane, lanes }));
    cluster = [];
  };
  for (const it of sorted) {
    if (it.start >= clusterEnd) flush();
    const taken = new Set(cluster.filter((c) => c.end > it.start).map((c) => c.lane));
    let lane = 0;
    while (taken.has(lane)) lane++;
    cluster.push({ id: it.id, end: it.end, lane });
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return out;
}

/** "Now" in the business's timezone, ticking every minute. */
function useBusinessNow(state: TenantData) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const z = businessNow(state, now);
  return { today: z.date, minute: z.minutes };
}

const NARROW = '(max-width: 860px)';
function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

export default function CalendarPage() {
  const L = useLookup();
  const { state } = L;
  const { t, tx, fmt } = useI18n();
  const toast = useToast();
  const conflictText = useConflictText();
  const { openAppointment, newAppointment } = useAppUI();
  const { api, can, me, solo } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const now = useBusinessNow(state);
  const narrow = useNarrow();
  const manage = can('appointments.manage');
  const allCalendar = can('calendar.all');

  const rawDate = params.get('date');
  const date = rawDate && ISO_RE.test(rawDate) ? rawDate : now.today;
  const rawView = params.get('view');
  const team = useMemo(() => state.staff.filter((s) => s.active && (allCalendar || s.id === me?.id)), [state.staff, allCalendar, me]);
  const staffFilter = team.length > 1 ? params.get('staff') ?? '' : '';
  const shown = staffFilter ? team.filter((s) => s.id === staffFilter) : team;
  // Phones get the agenda by default whenever more than one column would be squeezed in.
  const view: View = rawView === 'week' || rawView === 'list' || rawView === 'day' ? rawView : narrow && shown.length > 1 ? 'list' : 'day';
  const showCancelled = params.get('cancelled') === '1';
  const step = state.business.policies.slotInterval;
  const ppm = view === 'day' ? 1.6 : 1.2;

  const update = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    setParams(p, { replace: true });
  };

  const weekStart = startOfWeek(date);

  const columns = useMemo<Column[]>(() => {
    if (view === 'list') return [];
    const live = (a: Appointment) => showCancelled || occupiesTime(a);
    const single = (st: Staff, d: ISODate, key: string): Column => {
      const sd = staffDay(state, st.id, d);
      const ex = sd.exception ?? exceptionOn(state, null, d);
      return {
        key,
        date: d,
        staff: st,
        closed: businessHours(state, d).length === 0,
        shift: sd.shift,
        breaks: sd.breaks,
        blocks: sd.blocks,
        timeOff: sd.timeOff,
        away: [],
        staffLanes: null,
        special: ex ? ex.label || t('calendar.special') : null,
        appointments: state.appointments.filter((a) => a.staffId === st.id && a.date === d && live(a)).sort((a, b) => a.start - b.start),
      };
    };
    if (view === 'day') return shown.map((st) => single(st, date, st.id));
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    if (shown.length === 1) return days.map((d) => single(shown[0], d, d));
    const ids = new Set(shown.map((s) => s.id));
    return days.map((d) => {
      const appointments = state.appointments.filter((a) => a.date === d && ids.has(a.staffId) && live(a)).sort((a, b) => a.start - b.start);
      return {
        key: d,
        date: d,
        staff: null,
        closed: businessHours(state, d).length === 0,
        shift: businessHours(state, d),
        breaks: [],
        blocks: state.blocks.filter((b) => b.date === d && (b.staffId === null || ids.has(b.staffId))),
        timeOff: null,
        away: state.timeOff.filter((x) => ids.has(x.staffId) && x.from <= d && d <= x.to),
        staffLanes: shown.filter((s) => staffDay(state, s.id, d).shift.length > 0 || appointments.some((a) => a.staffId === s.id)).map((s) => s.id),
        special: (() => {
          const ex = exceptionOn(state, null, d);
          return ex ? ex.label || t('calendar.special') : null;
        })(),
        appointments,
      };
    });
  }, [state, view, shown, date, weekStart, showCancelled, t]);

  // Visible hours: opening hours of the visible days, plus anything booked outside them, with an hour of air.
  const [lo, hi] = useMemo(() => {
    let a = Infinity;
    let b = -Infinity;
    const days = view === 'day' ? [date] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    for (const d of days) for (const r of businessHours(state, d)) (a = Math.min(a, r.start)), (b = Math.max(b, r.end));
    for (const c of columns) for (const x of c.appointments) (a = Math.min(a, x.start)), (b = Math.max(b, x.start + x.duration));
    if (!isFinite(a)) (a = 9 * 60), (b = 20 * 60);
    return [Math.max(0, Math.floor(a / 60) * 60 - 60), Math.min(24 * 60, Math.ceil(b / 60) * 60 + 60)];
  }, [state, columns, view, date, weekStart]);

  const height = (hi - lo) * ppm;
  const y = (m: Minutes) => (m - lo) * ppm;

  // ── scroll into the working part of the day ─────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const showsToday = columns.some((c) => c.date === now.today);
    const first = Math.min(...columns.flatMap((c) => c.appointments.map((a) => a.start)), hi);
    const target = showsToday ? now.minute - 90 : first - 45;
    el.scrollTop = Math.max(0, y(Math.max(lo, target)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, view]);

  // ── drag to reschedule ──────────────────────────────────────────
  const drag = useRef<{ id: string; pointerId: number; x: number; y: number; grab: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const targetFor = (a: Appointment, clientX: number, clientY: number): Preview | null => {
    const el = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-col]');
    if (!el || !drag.current) return null;
    const col = Number(el.dataset.col);
    const c = columns[col];
    const rect = el.getBoundingClientRect();
    const raw = lo + (clientY - rect.top) / ppm - drag.current.grab;
    const start = Math.min(Math.max(snap(raw, step), lo), hi - a.duration);
    const staffId = c.staff && view === 'day' ? c.staff.id : a.staffId;
    const conflict = checkSlot(state, { staffId, date: c.date, start, duration: a.duration, serviceId: a.serviceId, excludeAppointmentId: a.id });
    return { id: a.id, col, start, conflict };
  };

  const onCardDown = (e: RPointerEvent, a: Appointment) => {
    if (!manage || e.button !== 0 || e.pointerType === 'touch' || a.status === 'completed' || !occupiesTime(a)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    drag.current = { id: a.id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, grab: (e.clientY - rect.top) / ppm, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onCardMove = (e: RPointerEvent, a: Appointment) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
    d.moved = true;
    const p = targetFor(a, e.clientX, e.clientY);
    const prev = previewRef.current;
    if (p && (!prev || prev.col !== p.col || prev.start !== p.start)) {
      previewRef.current = p;
      setPreview(p);
    }
  };

  const endDrag = () => {
    drag.current = null;
    previewRef.current = null;
    setPreview(null);
  };

  const onCardUp = async (e: RPointerEvent, a: Appointment) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const p = previewRef.current;
    if (!d.moved || !p) return endDrag();
    justDragged.current = true;
    const c = columns[p.col];
    const staffId = c.staff && view === 'day' ? c.staff.id : a.staffId;
    if (c.date === a.date && p.start === a.start && staffId === a.staffId) return endDrag();
    if (!isSoftConflict(p.conflict)) {
      toast(conflictText(p.conflict!, L.staff.get(staffId)));
      return endDrag();
    }
    const prev = { date: a.date, start: a.start, staffId: a.staffId };
    drag.current = null;
    setSaving(a.id);
    try {
      await api.rescheduleAppointment(a.id, { date: c.date, start: p.start, staffId, force: true });
      toast(t('calendar.moved', { when: `${fmt.date(c.date, 'medium')} ${fmt.time(p.start)}` }), {
        label: t('calendar.undo'),
        run: () => void api.rescheduleAppointment(a.id, { ...prev, force: true }).catch(() => toast(t('common.unknownError'))),
      });
    } catch {
      toast(t('conflict.slot_taken'));
    } finally {
      setSaving(null);
      endDrag();
    }
  };

  // ── click empty time to create ──────────────────────────────────
  const [hover, setHover] = useState<{ col: number; start: Minutes } | null>(null);
  const minuteAt = (e: RMouseEvent, el: HTMLElement) =>
    Math.min(Math.max(Math.floor((lo + (e.clientY - el.getBoundingClientRect().top) / ppm) / step) * step, lo), hi - step);

  const onColMove = (e: RPointerEvent<HTMLDivElement>, col: number) => {
    if (e.pointerType !== 'mouse' || drag.current || (e.target as HTMLElement).closest('.cal-appt')) return hover && setHover(null);
    const start = minuteAt(e, e.currentTarget);
    if (!hover || hover.col !== col || hover.start !== start) setHover({ col, start });
  };

  const onColClick = (e: RMouseEvent<HTMLDivElement>, c: Column) => {
    if (!manage || (e.target as HTMLElement).closest('.cal-appt')) return;
    newAppointment({ date: c.date, start: minuteAt(e, e.currentTarget), staffId: c.staff?.id ?? (staffFilter || undefined) });
  };

  // ── header ──────────────────────────────────────────────────────
  const title =
    view === 'day'
      ? fmt.date(date, 'full')
      : view === 'list'
        ? `${fmt.date(date, 'short')} - ${fmt.date(addDays(date, 6), 'short')}`
        : `${fmt.date(weekStart, 'short')} - ${fmt.date(addDays(weekStart, 6), 'short')}`;
  const shiftBy = (n: number) => update({ date: addDays(date, n * (view === 'day' ? 1 : 7)) });
  const hours: Minutes[] = [];
  for (let m = lo; m < hi; m += 60) hours.push(m);

  return (
    <div className="page page--full cal" data-view={view}>
      <div className="cal__bar">
        <div className="toolbar">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => update({ date: null })} disabled={date === now.today}>
            {t('calendar.today')}
          </button>
          <div className="cal__nav">
            <button type="button" className="btn btn--quiet btn--sm btn--icon" onClick={() => shiftBy(-1)} aria-label={t('calendar.prev')}>
              <ChevronLeft />
            </button>
            <button type="button" className="btn btn--quiet btn--sm btn--icon" onClick={() => shiftBy(1)} aria-label={t('calendar.next')}>
              <ChevronRight />
            </button>
          </div>
          <h2 className="cal__title" aria-live="polite">
            {title}
          </h2>
          <input
            type="date"
            className="field__input field__input--sm cal__jump"
            aria-label={t('appt.reschedule.date')}
            value={date}
            onChange={(e) => e.target.value && update({ date: e.target.value })}
          />
          <span className="toolbar__spacer" />
          <Segmented<View>
            label={t('app.nav.calendar')}
            value={view}
            onChange={(v) => update({ view: v })}
            options={[
              { value: 'day', label: t('calendar.day') },
              { value: 'week', label: t('calendar.week') },
              { value: 'list', label: t('calendar.list') },
            ]}
          />
        </div>
        <div className="cal__staff" role="group" aria-label={t('calendar.filterStaff')}>
          {team.length > 1 && (
            <>
              <button type="button" className="chip" aria-pressed={!staffFilter} onClick={() => update({ staff: null })}>
                {t('calendar.allStaff')}
              </button>
              {team.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="chip cal__staff-chip"
                  aria-pressed={staffFilter === s.id}
                  style={{ '--tone': s.color } as CSSProperties}
                  onClick={() => update({ staff: staffFilter === s.id ? null : s.id })}
                >
                  <i aria-hidden /> {tx(s.name)}
                </button>
              ))}
            </>
          )}
          <span className="cal__toggle">
            <Switch checked={showCancelled} onChange={(v) => update({ cancelled: v ? '1' : null })} label={t('calendar.showCancelled')} />
          </span>
          {manage && view !== 'list' && <span className="cal__hint muted">{t('calendar.dragHint')}</span>}
        </div>
      </div>

      {view === 'list' ? (
        <Agenda from={date} staffIds={new Set(shown.map((s) => s.id))} showCancelled={showCancelled} showStaff={!solo && shown.length > 1} today={now.today} nowMin={now.minute} />
      ) : (
      <div className="cal__scroll" ref={scrollRef}>
        <div
          className="cal__grid"
          style={{ '--cols': columns.length, '--h': `${height}px`, '--hour': `${60 * ppm}px` } as CSSProperties}
        >
          <div className="cal__corner" />
          {columns.map((c) => (
            <div className="cal__head" key={c.key} data-today={c.date === now.today}>
              {view === 'day' && c.staff ? (
                <>
                  <StaffAvatar staff={c.staff} size="sm" />
                  <div className="cal__head-text">
                    <span className="cal__head-name">{tx(c.staff.name)}</span>
                    <span className="cal__head-sub">
                      {c.timeOff
                        ? t(`timeOffKind.${c.timeOff.kind}`)
                        : c.shift.length === 0
                          ? t('calendar.off')
                          : `${fmt.timeRange(c.shift[0].start, c.shift[c.shift.length - 1].end)} · ${t('units.appointments', { count: c.appointments.filter(occupiesTime).length })}`}
                    </span>
                  </div>
                  {c.special && <span className="cal__special" title={c.special}>{c.special}</span>}
                </>
              ) : (
                <button type="button" className="cal__head-day" onClick={() => update({ date: c.date, view: 'day' })}>
                  <span className="cal__head-wd">{fmt.weekday(weekdayOf(c.date), 'short')}</span>
                  <span className="cal__head-num">{fmt.number(Number(c.date.slice(8)))}</span>
                  <span className="cal__head-sub">
                    {c.special ? c.special : c.closed ? t('calendar.closed') : t('units.appointments', { count: c.appointments.filter(occupiesTime).length })}
                  </span>
                </button>
              )}
            </div>
          ))}

          <div className="cal__gutter" aria-hidden>
            {hours.map((m) => (
              <span key={m} className="cal__hour" style={{ top: y(m) }}>
                {m === lo ? '' : fmt.time(m)}
              </span>
            ))}
          </div>

          {columns.map((c, ci) => {
            const lanes = layoutLanes(
              c.appointments.map((a) => {
                const s = L.services.get(a.serviceId);
                return { id: a.id, start: a.start - (s?.bufferBefore ?? 0), end: a.start + a.duration + (s?.bufferAfter ?? 0) };
              }),
            );
            const isToday = c.date === now.today;
            const off = c.closed || !!c.timeOff || c.shift.length === 0;
            return (
              <div
                key={c.key}
                className="cal__col"
                data-col={ci}
                data-off={off}
                data-lanes={!!c.staffLanes}
                onPointerMove={(e) => onColMove(e, ci)}
                onPointerLeave={() => setHover(null)}
                onClick={(e) => onColClick(e, c)}
              >
                {c.shift.map((r, i) => (
                  <div key={i} className="cal-shift" style={{ top: y(r.start), height: (r.end - r.start) * ppm }} />
                ))}
                <div className="cal-lines" aria-hidden />
                {c.breaks.map((r, i) => (
                  <div key={i} className="cal-break" style={{ top: y(r.start), height: (r.end - r.start) * ppm }}>
                    <span>{t('calendar.break')}</span>
                  </div>
                ))}
                {c.blocks.map((b) => (
                  <div key={b.id} className="cal-block" data-kind={b.kind} style={{ top: y(b.start), height: (b.end - b.start) * ppm }} title={b.label}>
                    <span>{b.label}</span>
                  </div>
                ))}
                {(c.timeOff || (c.closed && view === 'day')) && (
                  <div className="cal-away">
                    <span>{c.timeOff ? t(`timeOffKind.${c.timeOff.kind}`) : t('calendar.closed')}</span>
                  </div>
                )}
                {c.away.length > 0 && (
                  <div className="cal-away-strip">
                    {c.away.map((x) => (
                      <span key={x.id} className="badge badge--plain">
                        {tx(L.staff.get(x.staffId)?.name)} · {t(`timeOffKind.${x.kind}`)}
                      </span>
                    ))}
                  </div>
                )}

                {c.appointments.map((a) => {
                  const st = L.staff.get(a.staffId);
                  const lane = lanes.get(a.id) ?? { lane: 0, lanes: 1 };
                  const service = L.services.get(a.serviceId);
                  const live = occupiesTime(a);
                  const before = live ? service?.bufferBefore ?? 0 : 0;
                  const buffer = live ? service?.bufferAfter ?? 0 : 0;
                  const h = a.duration * ppm;
                  const customer = L.customers.get(a.customerId);
                  const compact = h < 34;
                  const roomy = h >= 64;
                  const label = [fmt.timeRange(a.start, a.start + a.duration), customer?.name ?? '', tx(service?.name), solo ? '' : tx(st?.name), t(`status.${a.status}`)].filter(Boolean).join(', ');
                  return (
                    <div
                      key={a.id}
                      className="cal-slot"
                      data-inactive={!live || undefined}
                      style={
                        {
                          top: y(a.start - before),
                          height: h + (before + buffer) * ppm,
                          insetInlineStart: `calc(${(lane.lane / lane.lanes) * 100}% + 2px)`,
                          width: `calc(${100 / lane.lanes}% - 6px)`,
                          '--tone': st?.color,
                        } as CSSProperties
                      }
                    >
                      {before > 0 && <span className="cal-buffer cal-buffer--before" style={{ height: before * ppm }} aria-hidden />}
                      <button
                        type="button"
                        className="cal-appt"
                        data-status={a.status}
                        data-compact={compact}
                        data-dragging={preview?.id === a.id}
                        data-saving={saving === a.id}
                        style={{ height: h }}
                        aria-label={label}
                        onPointerDown={(e) => onCardDown(e, a)}
                        onPointerMove={(e) => onCardMove(e, a)}
                        onPointerUp={(e) => onCardUp(e, a)}
                        onPointerCancel={endDrag}
                        onClick={() => {
                          if (justDragged.current) return void (justDragged.current = false);
                          openAppointment(a.id);
                        }}
                      >
                        <span className="cal-appt__time ltr">{compact || c.staffLanes ? fmt.time(a.start) : fmt.timeRange(a.start, a.start + a.duration)}</span>
                        <span className="cal-appt__name">{customer?.name}</span>
                        {roomy && <span className="cal-appt__svc">{tx(service?.name)}</span>}
                      </button>
                      {buffer > 0 && <span className="cal-buffer" style={{ height: buffer * ppm }} aria-hidden />}
                    </div>
                  );
                })}

                {preview && preview.col === ci && (() => {
                  const a = state.appointments.find((x) => x.id === preview.id)!;
                  const tone = preview.conflict ? (isSoftConflict(preview.conflict) ? 'warn' : 'danger') : 'ok';
                  return (
                    <div
                      className="cal-ghost"
                      data-tone={tone}
                      style={{ top: y(preview.start), height: a.duration * ppm, '--tone': L.staff.get(a.staffId)?.color } as CSSProperties}
                      aria-hidden
                    >
                      <span className="ltr">{fmt.timeRange(preview.start, preview.start + a.duration)}</span>
                      {preview.conflict && <span className="cal-ghost__why">{conflictText(preview.conflict, c.staff ?? L.staff.get(a.staffId))}</span>}
                    </div>
                  );
                })()}

                {hover && hover.col === ci && !preview && (
                  <div className="cal-hover" style={{ top: y(hover.start), height: step * ppm * 2 }} aria-hidden>
                    <PlusIcon size={12} /> <span className="ltr">{fmt.time(hover.start)}</span>
                  </div>
                )}

                {isToday && now.minute >= lo && now.minute <= hi && (
                  <div className="cal-now" style={{ top: y(now.minute) }} title={`${t('calendar.now')} ${fmt.time(now.minute)}`} aria-hidden />
                )}
              </div>
            );
          })}
        </div>
        {columns.length === 0 && <p className="empty">{t('calendar.empty')}</p>}
      </div>
      )}
    </div>
  );
}

/** Seven-day agenda — the calendar on a phone, and a quick scan on desktop. */
function Agenda({ from, staffIds, showCancelled, showStaff, today, nowMin }: { from: ISODate; staffIds: Set<string>; showCancelled: boolean; showStaff: boolean; today: ISODate; nowMin: Minutes }) {
  const L = useLookup();
  const { state } = L;
  const { t, tx, fmt } = useI18n();
  const { openAppointment, newAppointment } = useAppUI();
  const { can } = useWorkspace();
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return (
    <div className="agenda">
      {days.map((d) => {
        const items = state.appointments
          .filter((a) => a.date === d && staffIds.has(a.staffId) && (showCancelled || occupiesTime(a)))
          .sort((a, b) => a.start - b.start);
        const blocks = state.blocks.filter((b) => b.date === d && (b.staffId === null || staffIds.has(b.staffId)));
        const closed = businessHours(state, d).length === 0;
        const ex = exceptionOn(state, null, d);
        return (
          <section key={d} className="agenda__day" data-today={d === today || undefined} aria-labelledby={`ag-${d}`}>
            <header className="agenda__head">
              <h3 id={`ag-${d}`}>
                <span className="agenda__wd">{fmt.relativeDay(d) ?? fmt.weekday(weekdayOf(d), 'long')}</span>
                <span className="muted">{fmt.date(d, 'dayMonth')}</span>
              </h3>
              {ex && <span className="cal__special">{ex.label || t('calendar.special')}</span>}
              {can('appointments.manage') && !closed && (
                <button type="button" className="btn btn--quiet btn--xs" onClick={() => newAppointment({ date: d })} aria-label={`${t('app.newAppointment')}, ${fmt.date(d, 'medium')}`}>
                  <PlusIcon size={12} />
                </button>
              )}
            </header>
            {items.length === 0 && blocks.length === 0 ? (
              <p className="agenda__empty muted">{closed ? t('calendar.closed') : t('calendar.emptyDay')}</p>
            ) : (
              <div className="list">
                {[...blocks.map((b) => ({ at: b.start, b, a: null })), ...items.map((a) => ({ at: a.start, a, b: null }))]
                  .sort((x, y) => x.at - y.at)
                  .map(({ a, b }) => (b ? (
                  <div key={b.id} className="list__row agenda__block" data-kind={b.kind}>
                    <span className="list__time tabular">{fmt.time(b.start)}</span>
                    <div className="list__main">
                      <span className="list__title">{b.label}</span>
                      <span className="list__sub">
                        {fmt.timeRange(b.start, b.end)}
                        {showStaff && b.staffId ? ` · ${tx(L.staff.get(b.staffId)?.name)}` : ''}
                      </span>
                    </div>
                  </div>
                ) : a ? (() => {
                  const st = L.staff.get(a.staffId);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className="list__row"
                      onClick={() => openAppointment(a.id)}
                      data-past={(d < today || (d === today && a.start + a.duration <= nowMin)) || undefined}
                      data-inactive={!occupiesTime(a) || undefined}
                      style={{ '--tone': st?.color } as CSSProperties}
                    >
                      <span className="list__time tabular">{fmt.time(a.start)}</span>
                      <div className="list__main">
                        <span className="list__title">{L.customers.get(a.customerId)?.name}</span>
                        <span className="list__sub">
                          {[tx(L.services.get(a.serviceId)?.name), fmt.duration(a.duration), showStaff ? tx(st?.name) : null].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                      <StatusBadge status={a.status} />
                    </button>
                  );
                })() : null))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
