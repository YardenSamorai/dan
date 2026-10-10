import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { addDays, fromISODate, toISODate, weekdayOf } from '../../domain/time';
import type { ISODate } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { ChevronLeft, ChevronRight } from '../ui/Icons';

interface Props {
  value?: ISODate;
  onChange: (iso: ISODate) => void;
  isAvailable: (iso: ISODate) => boolean;
  min: ISODate;
  max: ISODate;
}

const monthStart = (iso: ISODate) => iso.slice(0, 8) + '01';
const addMonths = (iso: ISODate, n: number) => {
  const d = fromISODate(monthStart(iso));
  d.setMonth(d.getMonth() + n);
  return toISODate(d);
};

/**
 * Month grid with roving focus. Arrow keys move by day/week (mirrored in RTL),
 * Home/End to week edges, PageUp/PageDown by month.
 */
export function MonthCalendar({ value, onChange, isAvailable, min, max }: Props) {
  const { t, fmt, dir } = useI18n();
  const [month, setMonth] = useState(() => monthStart(value ?? min));
  const [focusIso, setFocusIso] = useState(() => value ?? min);
  const gridRef = useRef<HTMLDivElement>(null);
  const shouldFocus = useRef(false);

  useEffect(() => {
    if (value && monthStart(value) !== month) setMonth(monthStart(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const days = useMemo(() => {
    const start = addDays(month, -weekdayOf(month));
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [month]);

  const inMonth = (iso: ISODate) => iso.slice(0, 7) === month.slice(0, 7);
  const weeks = inMonth(days[35]) ? 6 : 5;

  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusIso}"]`)?.focus();
  }, [focusIso, month]);

  const canPrev = month > monthStart(min);
  const canNext = addMonths(month, 1) <= max;

  const moveFocus = (iso: ISODate) => {
    if (iso < min) iso = min;
    if (iso > max) iso = max;
    shouldFocus.current = true;
    if (!inMonth(iso)) setMonth(monthStart(iso));
    setFocusIso(iso);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, iso: ISODate) => {
    const fwd = dir === 'rtl' ? -1 : 1;
    const wd = weekdayOf(iso);
    const map: Record<string, () => ISODate> = {
      ArrowLeft: () => addDays(iso, -fwd),
      ArrowRight: () => addDays(iso, fwd),
      ArrowUp: () => addDays(iso, -7),
      ArrowDown: () => addDays(iso, 7),
      Home: () => addDays(iso, -wd),
      End: () => addDays(iso, 6 - wd),
      PageUp: () => addMonths(iso, -1).slice(0, 8) + iso.slice(8),
      PageDown: () => addMonths(iso, 1).slice(0, 8) + iso.slice(8),
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      let next = fn();
      if (Number.isNaN(fromISODate(next).getTime()) || toISODate(fromISODate(next)) !== next) next = addMonths(iso, e.key === 'PageUp' ? -1 : 1);
      moveFocus(next);
    }
  };

  const firstBookable = days.find((d) => inMonth(d) && d >= min && d <= max);
  const tabbable = inMonth(focusIso) ? focusIso : firstBookable;
  // `min` is "today" in the business's timezone.
  const today = min;

  return (
    <div className="month-cal">
      <div className="month-cal__head">
        <h3 className="month-cal__month" aria-live="polite">
          {fmt.month(month)}
        </h3>
        <div className="month-cal__nav">
          <button type="button" className="month-cal__navbtn" onClick={() => setMonth(addMonths(month, -1))} disabled={!canPrev} aria-label={t('booking.time.prevMonth')}>
            <ChevronLeft />
          </button>
          <button type="button" className="month-cal__navbtn" onClick={() => setMonth(addMonths(month, 1))} disabled={!canNext} aria-label={t('booking.time.nextMonth')}>
            <ChevronRight />
          </button>
        </div>
      </div>
      <div className="month-cal__grid" ref={gridRef} role="group" aria-label={t('booking.steps.time')}>
        {[0, 1, 2, 3, 4, 5, 6].map((wd) => (
          <abbr key={wd} title={fmt.weekday(wd)} className="month-cal__wd" aria-hidden="true">
            {fmt.weekday(wd, 'narrow')}
          </abbr>
        ))}
        {days.slice(0, weeks * 7).map((iso) => {
          if (!inMonth(iso)) return <span key={iso} className="month-cal__pad" aria-hidden="true" />;
          const inWindow = iso >= min && iso <= max;
          const available = inWindow && isAvailable(iso);
          const selected = iso === value;
          const isToday = iso === today;
          return (
            <button
              key={iso}
              type="button"
              data-iso={iso}
              className="month-cal__day"
              data-available={available}
              data-selected={selected}
              data-today={isToday}
              aria-pressed={selected}
              aria-disabled={!available}
              aria-label={`${fmt.date(iso)}${isToday ? `, ${t('common.today')}` : ''}`}
              tabIndex={iso === tabbable ? 0 : -1}
              onKeyDown={(e) => onKeyDown(e, iso)}
              onFocus={() => setFocusIso(iso)}
              onClick={() => available && onChange(iso)}
            >
              {fmt.number(fromISODate(iso).getDate())}
            </button>
          );
        })}
      </div>
    </div>
  );
}
