import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays } from '../../domain/time';
import type { ISODate, Minutes } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { usePublicTenant } from '../../pages/booking/TenantContext';
import { CheckIcon } from '../ui/Icons';
import { DateStrip, openHours, type StripDay } from './DateStrip';

interface Props {
  serviceId: string;
  addOnIds: string[];
  staffId: string | 'any';
  date?: ISODate;
  start?: Minutes;
  excludeBookingId?: string;
  onChange: (v: { date: ISODate; start?: Minutes }) => void;
}

const PARTS = [
  { key: 'morning', until: 12 * 60 },
  { key: 'afternoon', until: 17 * 60 },
  { key: 'evening', until: 24 * 60 },
] as const;

/** Date strip + that day's free start times. Shared by booking and customer rescheduling. */
export function SlotPicker({ serviceId, addOnIds, staffId, date, start, excludeBookingId, onChange }: Props) {
  const { t, fmt } = useI18n();
  const tenant = usePublicTenant();
  const { today, business } = tenant;
  const last = addDays(today, business.policies.maxAdvanceDays);
  const addOnKey = addOnIds.join();
  // `business` changes identity whenever the tenant's data does, which refreshes the cache.
  const q = useMemo(() => ({ serviceId, addOnIds, staffId, excludeBookingId }), [serviceId, addOnKey, staffId, excludeBookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cache = useMemo(() => new Map<ISODate, ReturnType<typeof tenant.slots>>(), [tenant, q]);
  const slotsOn = useCallback(
    (iso: ISODate) => {
      let v = cache.get(iso);
      if (!v) cache.set(iso, (v = tenant.slots({ ...q, date: iso })));
      return v;
    },
    [cache, tenant, q],
  );

  const days = useMemo<StripDay[]>(() => {
    const out: StripDay[] = [];
    for (let d = today; d <= last; d = addDays(d, 1)) {
      const n = slotsOn(d).length;
      const status = n ? (n <= 3 ? t('booking.time.dayCount', { count: n }) : t('booking.time.dayFree')) : openHours(business, d).length ? t('booking.time.dayFull') : t('booking.time.dayClosed');
      out.push({ date: d, status, open: n > 0 });
    }
    return out;
  }, [today, last, slotsOn, business, t]);

  const firstDay = days.find((d) => d.open)?.date;
  const [day, setDay] = useState<ISODate | undefined>(() => (date && date >= today && date <= last ? date : firstDay));
  useEffect(() => {
    if (date && date !== day && date >= today) setDay(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);
  useEffect(() => {
    if (!day && firstDay) setDay(firstDay);
  }, [day, firstDay]);

  const pickDay = (iso: ISODate) => {
    setDay(iso);
    onChange({ date: iso, start: iso === date ? start : undefined });
  };

  if (!firstDay) return <p className="times__none">{t('booking.time.none')}</p>;

  const slots = day ? slotsOn(day) : [];
  const nextAfter = day ? days.find((d) => d.open && d.date > day)?.date : undefined;
  const nearest = day && !slots.length ? nextAfter ?? firstDay : undefined;
  const when = (iso: ISODate, m: Minutes) => t('booking.time.at', { day: fmt.relativeDay(iso) ?? fmt.date(iso, 'medium'), time: fmt.time(m) });

  return (
    <div className="when">
      <DateStrip days={days} value={day} onChange={pickDay} today={today} />

      <div className="times" aria-live="polite">
        {day && slots.length > 0 ? (
          PARTS.map((part, i) => {
            const from = i ? PARTS[i - 1].until : 0;
            const list = slots.filter((s) => s.start >= from && s.start < part.until);
            if (!list.length) return null;
            return (
              <section key={part.key} className="times__part" aria-label={t(`booking.time.${part.key}`)}>
                <h3 className="times__label">{t(`booking.time.${part.key}`)}</h3>
                <div className="times__grid">
                  {list.map((s) => {
                    const selected = date === day && start === s.start;
                    return (
                      <button
                        key={s.start}
                        type="button"
                        className="time"
                        aria-pressed={selected}
                        aria-label={t('booking.time.slotLabel', { time: fmt.time(s.start), date: fmt.date(day) })}
                        onClick={() => onChange({ date: day, start: s.start })}
                      >
                        {selected && <CheckIcon size={13} />}
                        <span className="tabular ltr">{fmt.time(s.start)}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })
        ) : (
          <div className="times__empty">
            <p>{t('booking.time.emptyDay')}</p>
            {nearest && (
              <>
                <p className="muted">{t('booking.time.nearest', { when: when(nearest, slotsOn(nearest)[0].start) })}</p>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => pickDay(nearest)}>
                  {t('booking.time.showDay', { day: fmt.relativeDay(nearest) ?? fmt.date(nearest, 'medium') })}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <p className="times__tz">{t('booking.time.timezone', { zone: fmt.zoneName() })}</p>
    </div>
  );
}
