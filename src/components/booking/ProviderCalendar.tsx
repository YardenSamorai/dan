import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { PublicBusiness } from '../../data';
import { addDays, weekdayOf } from '../../domain/time';
import type { ISODate, Minutes, TimeRange } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { CalendarIcon, ChevronLeft, ChevronRight } from '../ui/Icons';

/** One thing on the calendar a customer can pick: a start time, or a class session. */
export interface CalEntry {
  id: string;
  start: Minutes;
  /** Where the block ends on the grid (a start time fills one interval). */
  end: Minutes;
  kind: 'slot' | 'session';
  title: string;
  sub?: string;
  badge?: string;
  label: string;
  selected: boolean;
  /** Shown but not pickable (registration closed / not open yet). */
  off?: boolean;
  /** Pickable, but only onto the waitlist. */
  full?: boolean;
  /** A class of another service: part of the schedule, quieter. */
  other?: boolean;
  onPick: () => void;
}

export interface CalDay {
  hours: TimeRange[];
  entries: CalEntry[];
  /** How long the picked time takes, drawn as an outline from its start. */
  ghost?: { start: Minutes; end: Minutes; label: string };
}

interface Props {
  owner: { title: string; sub?: string; avatar?: ReactNode };
  /** Any date inside the week to open on. */
  initial: ISODate;
  today: ISODate;
  last: ISODate;
  /** Height of one start-time cell is derived from this. */
  interval: Minutes;
  plan: (date: ISODate) => CalDay;
  count: (n: number) => string;
  empty: string;
  /** First date with something to pick on or after `from`, for the "next free week" jump. */
  next: (from: ISODate) => ISODate | null;
}

export const weekOf = (iso: ISODate) => addDays(iso, -weekdayOf(iso));

/** Opening hours on a date: a special day overrides the weekly schedule. */
export function openHours(business: Pick<PublicBusiness, 'hours' | 'specialDays'>, date: ISODate): TimeRange[] {
  const special = business.specialDays.find((d) => d.date === date);
  if (special) return special.closed ? [] : special.ranges;
  return business.hours[weekdayOf(date)].ranges;
}

const useNarrow = () => {
  const query = '(max-width: 720px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
};

/** Side-by-side lanes for overlapping sessions (two instructors at the same hour). */
function lanes(entries: CalEntry[]) {
  const out = new Map<string, { lane: number; of: number }>();
  const sorted = [...entries].sort((a, b) => a.start - b.start || b.end - a.end);
  let group: CalEntry[] = [];
  let groupEnd = -1;
  let ends: number[] = [];
  const flush = () => {
    for (const e of group) out.get(e.id)!.of = ends.length;
    group = [];
    ends = [];
  };
  for (const e of sorted) {
    if (e.start >= groupEnd) flush();
    let lane = ends.findIndex((end) => end <= e.start);
    if (lane < 0) lane = ends.push(e.end) - 1;
    else ends[lane] = e.end;
    out.set(e.id, { lane, of: 0 });
    group.push(e);
    groupEnd = Math.max(groupEnd, e.end);
  }
  flush();
  return out;
}

/**
 * The provider's diary as the customer sees it: a week of opening hours with
 * the free start times (or the class sessions) in place. Phones get a day
 * strip and that day's diary instead of seven narrow columns.
 */
export function ProviderCalendar({ owner, initial, today, last, interval, plan, count, empty, next }: Props) {
  const { t, fmt } = useI18n();
  const narrow = useNarrow();
  const [week, setWeek] = useState(() => weekOf(initial < today ? today : initial));
  const [active, setActive] = useState<ISODate>(initial < today ? today : initial);

  useEffect(() => {
    setWeek(weekOf(initial < today ? today : initial));
    setActive(initial < today ? today : initial);
  }, [initial, today]);

  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  const days = useMemo(() => dates.map((date) => ({ date, past: date < today, ...(date < today || date > last ? { hours: [], entries: [] } : plan(date)) })), [dates, today, last, plan]);
  const total = days.reduce((n, d) => n + d.entries.length, 0);

  const firstWeek = weekOf(today);
  const lastWeek = weekOf(last);
  const go = (w: ISODate) => {
    setWeek(w);
    const inWeek = Array.from({ length: 7 }, (_, i) => addDays(w, i)).filter((d) => d >= today);
    setActive(inWeek.find((d) => plan(d).entries.length) ?? inWeek[0] ?? w);
  };
  const jump = total ? null : next(addDays(week, 7));

  const hourPx = Math.round(Math.min(112, Math.max(56, (26 * 60) / Math.max(5, interval))));
  const bounds = useMemo(() => {
    let from = Infinity;
    let to = -Infinity;
    for (const d of days) {
      for (const r of d.hours) {
        from = Math.min(from, r.start);
        to = Math.max(to, r.end);
      }
      for (const e of d.entries) {
        from = Math.min(from, e.start);
        to = Math.max(to, e.end);
      }
      if (d.ghost) to = Math.max(to, d.ghost.end);
    }
    if (from === Infinity) return { from: 9 * 60, to: 18 * 60 };
    return { from: Math.floor(from / 60) * 60, to: Math.ceil(to / 60) * 60 };
  }, [days]);
  const y = (m: Minutes) => ((m - bounds.from) / 60) * hourPx;
  const box = (start: Minutes, end: Minutes): CSSProperties => ({ top: y(start), height: Math.max(14, y(end) - y(start)) });

  const scroll = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const picked = days.flatMap((d) => d.entries).find((e) => e.selected);
    const first = picked ?? days.flatMap((d) => d.entries).sort((a, b) => a.start - b.start)[0];
    el.scrollTop = first ? Math.max(0, y(first.start) - 24) : 0;
    // Only when the week changes; picking a time mustn't move the grid under the pointer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, narrow]);

  const weekLabel = `${fmt.date(week, 'dayMonth')} – ${fmt.date(addDays(week, 6), 'dayMonth')}`;

  const entryButton = (e: CalEntry, style?: CSSProperties, cls = '') => (
    <button
      key={e.id}
      type="button"
      className={`pcal-entry pcal-entry--${e.kind} ${cls}`}
      style={style}
      data-selected={e.selected || undefined}
      data-off={e.off || undefined}
      data-full={e.full || undefined}
      data-other={e.other || undefined}
      aria-pressed={e.selected}
      aria-disabled={e.off || undefined}
      aria-label={e.label}
      title={e.kind === 'session' ? e.label : undefined}
      onClick={() => !e.off && e.onPick()}
    >
      {e.kind === 'slot' ? (
        <span className="pcal-entry__time tabular">{e.title}</span>
      ) : (
        <>
          <span className="pcal-entry__title">{e.title}</span>
          {e.sub && <span className="pcal-entry__sub tabular">{e.sub}</span>}
          {e.badge && <span className="pcal-entry__badge">{e.badge}</span>}
        </>
      )}
    </button>
  );

  const head = (
    <div className="pcal__bar">
      <div className="pcal__owner">
        {owner.avatar ?? (
          <span className="pcal__owner-icon" aria-hidden>
            <CalendarIcon size={18} />
          </span>
        )}
        <span className="pcal__owner-text">
          <strong>{owner.title}</strong>
          {owner.sub && <span>{owner.sub}</span>}
        </span>
      </div>
      <div className="pcal__nav">
        {week !== firstWeek && (
          <button type="button" className="btn btn--quiet btn--sm" onClick={() => go(firstWeek)}>
            {t('common.today')}
          </button>
        )}
        <button type="button" className="pcal__navbtn" onClick={() => go(addDays(week, -7))} disabled={week <= firstWeek} aria-label={t('booking.calendar.prevWeek')}>
          <ChevronLeft size={18} />
        </button>
        <span className="pcal__week tabular" aria-live="polite">
          {weekLabel}
        </span>
        <button type="button" className="pcal__navbtn" onClick={() => go(addDays(week, 7))} disabled={week >= lastWeek} aria-label={t('booking.calendar.nextWeek')}>
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );

  const nothing = !total && (
    <div className="pcal__empty">
      <p>{empty}</p>
      {jump && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => go(weekOf(jump))}>
          {t('booking.calendar.jump', { date: fmt.relativeDay(jump) ?? fmt.date(jump, 'medium') })}
        </button>
      )}
    </div>
  );

  if (narrow) {
    const day = days.find((d) => d.date === active) ?? days[0];
    return (
      <div className="pcal pcal--day">
        {head}
        <div className="pcal__strip" role="group" aria-label={weekLabel}>
          {days.map((d) => (
            <button
              key={d.date}
              type="button"
              className="pcal__strip-day"
              aria-pressed={d.date === day.date}
              data-today={d.date === today || undefined}
              data-has={d.entries.length > 0 || undefined}
              disabled={d.past}
              onClick={() => setActive(d.date)}
              aria-label={`${fmt.date(d.date)}${d.entries.length ? `, ${count(d.entries.length)}` : ''}`}
            >
              <span className="pcal__strip-wd">{fmt.weekday(weekdayOf(d.date), 'narrow')}</span>
              <span className="pcal__strip-num tabular">{fmt.number(Number(d.date.slice(8)))}</span>
              <i aria-hidden />
            </button>
          ))}
        </div>
        {nothing || <DayAgenda day={day} date={day.date} count={count} entryButton={entryButton} />}
      </div>
    );
  }

  return (
    <div className="pcal">
      {head}
      {nothing}
      <div className="pcal__scroll" ref={scroll} hidden={!total}>
        <div className="pcal__grid" style={{ '--hour': `${hourPx}px`, '--h': `${y(bounds.to)}px` } as CSSProperties}>
          <div className="pcal__corner" />
          {days.map((d) => (
            <div key={d.date} className="pcal__head" data-today={d.date === today || undefined} data-past={d.past || undefined}>
              <span className="pcal__head-wd">{fmt.weekday(weekdayOf(d.date), 'short')}</span>
              <span className="pcal__head-num tabular">{fmt.number(Number(d.date.slice(8)))}</span>
              <span className="pcal__head-sub">{d.past ? '' : d.entries.length ? count(d.entries.length) : d.hours.length ? '' : t('common.closed')}</span>
            </div>
          ))}
          <div className="pcal__gutter">
            {Array.from({ length: (bounds.to - bounds.from) / 60 + 1 }, (_, i) => bounds.from + i * 60).map((m) => (
              <span key={m} className="pcal__hour" style={{ top: y(m) }}>
                {fmt.time(m)}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const lane = d.entries.some((e) => e.kind === 'session') ? lanes(d.entries) : null;
            return (
              <div key={d.date} className="pcal__col" data-past={d.past || undefined} role="group" aria-label={fmt.date(d.date)}>
                {d.hours.map((r) => (
                  <span key={r.start} className="pcal__shift" style={box(r.start, r.end)} />
                ))}
                <span className="pcal__lines" aria-hidden />
                {d.entries.map((e) => {
                  const l = lane?.get(e.id);
                  const style: CSSProperties = {
                    ...box(e.start, e.end),
                    ...(l && l.of > 1 ? { insetInlineStart: `calc(${(100 / l.of) * l.lane}% + 3px)`, width: `calc(${100 / l.of}% - 6px)`, insetInlineEnd: 'auto' } : {}),
                  };
                  return entryButton(e, style);
                })}
                {d.ghost && (
                  <span className="pcal__ghost" style={box(d.ghost.start, d.ghost.end)} aria-hidden>
                    <span className="tabular">{d.ghost.label}</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** One day as a list of hours: the start times of each hour in a row, quiet stretches folded into one line. */
function DayAgenda({
  day,
  date,
  count,
  entryButton,
}: {
  day: CalDay & { past: boolean };
  date: ISODate;
  count: (n: number) => string;
  entryButton: (e: CalEntry, style?: CSSProperties, cls?: string) => ReactNode;
}) {
  const { t, fmt } = useI18n();
  const rows = useMemo(() => {
    const out: { from: Minutes; to: Minutes; entries: CalEntry[] }[] = [];
    const hours = new Set<number>();
    for (const r of day.hours) for (let h = Math.floor(r.start / 60); h * 60 < r.end; h++) hours.add(h);
    for (const e of day.entries) hours.add(Math.floor(e.start / 60));
    for (const h of [...hours].sort((a, b) => a - b)) {
      const entries = day.entries.filter((e) => Math.floor(e.start / 60) === h);
      const prev = out.at(-1);
      if (!entries.length && prev && !prev.entries.length && prev.to === h * 60) prev.to = h * 60 + 60;
      else out.push({ from: h * 60, to: h * 60 + 60, entries });
    }
    return out;
  }, [day]);

  return (
    <div className="pcal__agenda">
      <h3 className="pcal__agenda-title">
        {fmt.relativeDay(date) ?? fmt.date(date, 'full')}
        {day.entries.length > 0 && <span className="muted"> · {count(day.entries.length)}</span>}
      </h3>
      {!day.hours.length && !day.entries.length ? (
        <p className="muted pcal__agenda-none">{t('common.closed')}</p>
      ) : (
        <ol className="pcal__rows">
          {rows.map((r) => (
            <li key={r.from} className="pcal__row" data-empty={!r.entries.length || undefined}>
              <span className="pcal__row-hour tabular">{fmt.time(r.from)}</span>
              {r.entries.length ? (
                <div className={r.entries[0].kind === 'slot' ? 'pcal__chips' : 'pcal__cards'}>{r.entries.map((e) => entryButton(e))}</div>
              ) : (
                <span className="pcal__row-none">{r.to - r.from > 60 ? `${fmt.timeRange(r.from, r.to)} · ` : ''}{t('booking.calendar.noneHere')}</span>
              )}
            </li>
          ))}
        </ol>
      )}
      {day.ghost && <p className="pcal__picked tabular">{day.ghost.label}</p>}
    </div>
  );
}
