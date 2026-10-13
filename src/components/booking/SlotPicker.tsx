import { useCallback, useMemo } from 'react';
import { addDays } from '../../domain/time';
import type { ISODate, Minutes } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { usePublicTenant } from '../../pages/booking/TenantContext';
import { StaffAvatar } from '../ui/bits';
import { openHours, ProviderCalendar, type CalDay } from './ProviderCalendar';

interface Props {
  serviceId: string;
  addOnIds: string[];
  staffId: string | 'any';
  date?: ISODate;
  start?: Minutes;
  /** How long the booking takes, to draw it on the calendar once a time is picked. */
  duration?: Minutes;
  excludeBookingId?: string;
  onChange: (v: { date: ISODate; start?: Minutes }) => void;
}

/** Date + time selection on the provider's calendar. Shared by booking and customer rescheduling. */
export function SlotPicker({ serviceId, addOnIds, staffId, date, start, duration, excludeBookingId, onChange }: Props) {
  const { t, tx, fmt } = useI18n();
  const tenant = usePublicTenant();
  const { today, business } = tenant;
  const last = addDays(today, business.policies.maxAdvanceDays);
  const interval = business.policies.slotInterval;
  const addOnKey = addOnIds.join();
  // Cached per selection; `business` changes identity whenever the tenant's data does.
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

  const first = useMemo(() => tenant.firstAvailable(q), [tenant, q]);

  const plan = useCallback(
    (iso: ISODate): CalDay => {
      const picked = iso === date && start !== undefined;
      return {
        hours: openHours(business, iso),
        entries: slotsOn(iso).map((s) => ({
          id: `${iso}-${s.start}`,
          kind: 'slot' as const,
          start: s.start,
          end: s.start + interval,
          title: fmt.time(s.start),
          label: t('booking.time.slotLabel', { time: fmt.time(s.start), date: fmt.date(iso) }),
          selected: picked && s.start === start,
          onPick: () => onChange({ date: iso, start: s.start }),
        })),
        ghost: picked && duration ? { start: start!, end: start! + duration, label: fmt.timeRange(start!, start! + duration) } : undefined,
      };
    },
    [business, slotsOn, interval, fmt, t, date, start, duration, onChange],
  );

  const next = useCallback(
    (from: ISODate) => {
      if (from > last) return null;
      return tenant.firstAvailable(q, from);
    },
    [tenant, q, last],
  );

  const staff = staffId !== 'any' ? tenant.staff(staffId) : tenant.solo ? business.staff[0] : undefined;
  const service = tenant.service(serviceId);
  const owner = {
    title: staff ? t('booking.calendar.of', { name: tx(staff.name).split(' ')[0] }) : t('booking.calendar.team'),
    sub: [tx(service?.name), duration ? fmt.duration(duration) : ''].filter(Boolean).join(' · '),
    avatar: staff ? <StaffAvatar staff={staff} /> : undefined,
  };

  if (!first) return <p className="muted">{t('booking.time.none')}</p>;
  return (
    <>
      <ProviderCalendar
        owner={owner}
        initial={date ?? first}
        today={today}
        last={last}
        interval={interval}
        plan={plan}
        count={(n) => t('booking.calendar.free', { count: n })}
        empty={t('booking.calendar.emptyWeek')}
        next={next}
      />
      <p className="pcal__tz muted">{t('booking.time.timezone', { zone: fmt.zoneName() })}</p>
    </>
  );
}
