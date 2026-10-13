import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PublicBusiness } from '../../data';
import { fromISODate, weekdayOf } from '../../domain/time';
import type { ISODate, TimeRange } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { CalendarIcon, ChevronLeft, ChevronRight } from '../ui/Icons';
import { MonthCalendar } from './MonthCalendar';

/** Opening hours on a date: a special day overrides the weekly schedule. */
export function openHours(business: Pick<PublicBusiness, 'hours' | 'specialDays'>, date: ISODate): TimeRange[] {
  const special = business.specialDays.find((d) => d.date === date);
  if (special) return special.closed ? [] : special.ranges;
  return business.hours[weekdayOf(date)].ranges;
}

export interface StripDay {
  date: ISODate;
  /** Short line under the date: "Free", "2 times", "Full"… */
  status: string;
  open: boolean;
}

interface Props {
  days: StripDay[];
  value?: ISODate;
  onChange: (iso: ISODate) => void;
  today: ISODate;
}

/**
 * The days a customer can come, as a row of large buttons. Scrolls sideways on
 * touch, has arrows on wide screens, and a month grid for dates further out.
 */
export function DateStrip({ days, value, onChange, today }: Props) {
  const { t, fmt, locale, dir } = useI18n();
  const rail = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const [picker, setPicker] = useState(false);
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const min = days[0]?.date ?? today;
  const max = days.at(-1)?.date ?? today;

  const measure = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    const pos = Math.abs(el.scrollLeft);
    setEdge({ start: pos < 4, end: pos >= el.scrollWidth - el.clientWidth - 4 });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, days]);

  // Keep the chosen day in view without moving the page.
  const first = useRef(true);
  useLayoutEffect(() => {
    const el = rail.current;
    const btn = el?.querySelector<HTMLElement>(`[data-date="${value}"]`);
    if (!el || !btn) return;
    const a = el.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    if (b.left >= a.left && b.right <= a.right) return;
    el.scrollBy({ left: b.left + b.width / 2 - (a.left + a.width / 2), behavior: first.current ? 'auto' : 'smooth' });
    first.current = false;
  }, [value]);

  const page = (forward: boolean) => {
    const el = rail.current;
    if (!el) return;
    const step = el.clientWidth * 0.8 * (forward ? 1 : -1) * (dir === 'rtl' ? -1 : 1);
    el.scrollBy({ left: step, behavior: 'smooth' });
  };

  const wdWidth = locale === 'he' ? 'narrow' : 'short';
  const shown = value ?? days.find((d) => d.open)?.date ?? min;

  return (
    <div className="days">
      <div className="days__head">
        <span className="days__month">{fmt.month(shown)}</span>
        <button type="button" className="days__other" aria-expanded={picker} onClick={() => setPicker((v) => !v)}>
          <CalendarIcon size={15} /> {t('booking.time.otherDate')}
        </button>
      </div>

      {picker && (
        <div className="days__picker">
          <MonthCalendar
            value={value}
            min={min}
            max={max}
            isAvailable={(iso) => !!byDate.get(iso)?.open}
            onChange={(iso) => {
              onChange(iso);
              setPicker(false);
            }}
          />
        </div>
      )}

      <div className="days__rail-wrap" data-start={edge.start || undefined} data-end={edge.end || undefined}>
        <button type="button" className="days__arrow days__arrow--back" onClick={() => page(false)} disabled={edge.start} aria-label={t('booking.time.prevDays')}>
          <ChevronLeft size={16} />
        </button>
        <div className="days__rail" ref={rail} onScroll={measure} role="group" aria-label={t('booking.time.pickDay')}>
          {days.map((d) => {
            const selected = d.date === value;
            const isToday = d.date === today;
            const n = fromISODate(d.date).getDate();
            return (
              <button
                key={d.date}
                type="button"
                className="day"
                data-date={d.date}
                aria-pressed={selected}
                disabled={!d.open}
                aria-label={`${isToday ? `${t('common.today')}, ` : ''}${fmt.date(d.date)}, ${d.status}`}
                onClick={() => onChange(d.date)}
              >
                <span className="day__wd">{isToday ? t('common.today') : fmt.weekday(weekdayOf(d.date), wdWidth)}</span>
                <span className="day__num tabular">{fmt.number(n)}</span>
                <span className="day__status">{d.status}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="days__arrow days__arrow--fwd" onClick={() => page(true)} disabled={edge.end} aria-label={t('booking.time.nextDays')}>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
