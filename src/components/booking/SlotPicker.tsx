import { useMemo } from 'react';
import { addDays } from '../../domain/time';
import type { ISODate, Minutes } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { usePublicTenant } from '../../pages/booking/TenantContext';
import { MonthCalendar } from './MonthCalendar';

interface Props {
  serviceId: string;
  addOnIds: string[];
  staffId: string | 'any';
  date?: ISODate;
  start?: Minutes;
  excludeBookingId?: string;
  onChange: (v: { date: ISODate; start?: Minutes }) => void;
}

const PERIODS = [
  { key: 'morning', from: 0, to: 12 * 60 },
  { key: 'afternoon', from: 12 * 60, to: 17 * 60 },
  { key: 'evening', from: 17 * 60, to: 24 * 60 },
] as const;

/** Date + time selection backed by the tenant's public availability. Shared by booking and customer rescheduling. */
export function SlotPicker({ serviceId, addOnIds, staffId, date, start, excludeBookingId, onChange }: Props) {
  const { t, fmt } = useI18n();
  const tenant = usePublicTenant();
  const { today, business } = tenant;
  const max = addDays(today, business.policies.maxAdvanceDays);
  const addOnKey = addOnIds.join();
  // Cached per selection; `business` changes identity whenever the tenant's data does.
  const q = useMemo(() => ({ serviceId, addOnIds, staffId, excludeBookingId }), [serviceId, addOnKey, staffId, excludeBookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const dayCache = useMemo(() => new Map<ISODate, boolean>(), [tenant, q]);
  const isAvailable = (iso: ISODate) => {
    let v = dayCache.get(iso);
    if (v === undefined) dayCache.set(iso, (v = tenant.slots({ ...q, date: iso }).length > 0));
    return v;
  };

  const first = useMemo(() => tenant.firstAvailable(q), [tenant, q]);
  const slots = useMemo(() => (date ? tenant.slots({ ...q, date }) : []), [tenant, q, date]);

  return (
    <div className="when">
      <div className="when__cal">
        <MonthCalendar value={date} min={today} max={max} isAvailable={isAvailable} onChange={(iso) => onChange({ date: iso })} />
        {first && first !== date && (
          <button type="button" className="when__first" onClick={() => onChange({ date: first })}>
            {t('booking.time.firstAvailable', { date: fmt.relativeDay(first) ?? fmt.date(first, 'medium') })}
          </button>
        )}
        <p className="when__tz muted">{t('booking.time.timezone', { zone: fmt.zoneName() })}</p>
      </div>
      <div className="when__slots" aria-live="polite">
        {!first ? (
          <p className="muted">{t('booking.time.none')}</p>
        ) : !date ? (
          <p className="muted">{t('booking.time.pickDay')}</p>
        ) : (
          <>
            <h3 className="when__day">
              {fmt.date(date)}
              <span className="muted"> · {t('booking.time.count', { count: slots.length })}</span>
            </h3>
            {slots.length === 0 && <p className="muted">{t('booking.time.noSlots')}</p>}
            {PERIODS.map((p) => {
              const list = slots.filter((s) => s.start >= p.from && s.start < p.to);
              if (!list.length) return null;
              return (
                <fieldset key={p.key} className="slots">
                  <legend className="slots__legend">{t(`booking.time.${p.key}`)}</legend>
                  <div className="slots__grid">
                    {list.map((s) => (
                      <button key={s.start} type="button" className="slot tabular" aria-pressed={s.start === start} onClick={() => onChange({ date, start: s.start })}>
                        {fmt.time(s.start)}
                      </button>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
