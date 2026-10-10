import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SearchIcon } from '../../components/ui/Icons';
import { Segmented, StaffAvatar, StatusBadge } from '../../components/ui/bits';
import { appointmentStart, businessNow, isUpcoming } from '../../domain/scheduling';
import type { AppointmentStatus } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { useAppUI } from '../AppUI';
import { useLookup } from '../lookup';
import { PageHeader } from '../shared';
import { useWorkspace } from '../workspace';

type Range = 'today' | 'upcoming' | 'past' | 'all';
const RANGES: Range[] = ['today', 'upcoming', 'past', 'all'];
const STATUSES: AppointmentStatus[] = ['pending', 'confirmed', 'arrived', 'completed', 'cancelled', 'no_show'];
const PAGE = 60;

export default function AppointmentsPage() {
  const L = useLookup();
  const { t, tx, fmt } = useI18n();
  const { openAppointment } = useAppUI();
  const { solo, can } = useWorkspace();
  const showStaff = !solo && can('calendar.all');
  const [params, setParams] = useSearchParams();
  const range = (RANGES.includes(params.get('range') as Range) ? params.get('range') : 'upcoming') as Range;
  const status = (STATUSES.includes(params.get('status') as AppointmentStatus) ? params.get('status') : '') as AppointmentStatus | '';
  const staffId = params.get('staff') ?? '';
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    v ? p.set(k, v) : p.delete(k);
    setParams(p, { replace: true });
    setLimit(PAGE);
  };

  const rows = useMemo(() => {
    const now = new Date();
    const tz = L.state.business.timezone;
    const today = businessNow(L.state, now).date;
    const query = q.trim().toLowerCase();
    const digits = query.replace(/\D/g, '');
    const ended = (a: (typeof L.state.appointments)[number]) => +appointmentStart(a, tz) + a.duration * 60_000 <= +now;
    const list = L.state.appointments.filter((a) => {
      if (range === 'today' && a.date !== today) return false;
      // Pending/cancelled future bookings still belong to "upcoming".
      if (range === 'upcoming' && (ended(a) || (!isUpcoming(a, now, tz) && a.status !== 'pending' && a.status !== 'cancelled'))) return false;
      if (range === 'past' && !ended(a)) return false;
      if (status && a.status !== status) return false;
      if (staffId && a.staffId !== staffId) return false;
      if (query) {
        const c = L.customers.get(a.customerId);
        const hit =
          c?.name.toLowerCase().includes(query) ||
          a.code.toLowerCase().includes(query) ||
          (digits.length > 2 && c?.phone.replace(/\D/g, '').includes(digits));
        if (!hit) return false;
      }
      return true;
    });
    const dirn = range === 'past' ? -1 : 1;
    return list.sort((a, b) => dirn * (+appointmentStart(a, tz) - +appointmentStart(b, tz)));
  }, [L, range, status, staffId, q]);

  const visible = rows.slice(0, limit);

  return (
    <div className="page">
      <PageHeader title={t('app.nav.appointments')} />
      <div className="toolbar">
        <Segmented<Range>
          label={t('appointments.title')}
          value={range}
          onChange={(v) => set('range', v === 'upcoming' ? '' : v)}
          options={RANGES.map((r) => ({ value: r, label: t(`appointments.range.${r}`) }))}
        />
        <label className="search">
          <SearchIcon />
          <input
            className="field__input field__input--sm"
            type="search"
            placeholder={t('appointments.searchPlaceholder')}
            aria-label={t('appointments.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select className="field__input field__input--sm" style={{ width: 'auto' }} aria-label={t('appointments.status')} value={status} onChange={(e) => set('status', e.target.value)}>
          <option value="">{t('appointments.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </select>
        {showStaff && (
          <select className="field__input field__input--sm" style={{ width: 'auto' }} aria-label={t('calendar.filterStaff')} value={staffId} onChange={(e) => set('staff', e.target.value)}>
            <option value="">{t('calendar.allStaff')}</option>
            {L.state.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {tx(s.name)}
              </option>
            ))}
          </select>
        )}
        <span className="toolbar__spacer" />
        <span className="toolbar__count">{t('appointments.count', { count: rows.length })}</span>
      </div>

      <section className="panel">
        {rows.length === 0 ? (
          <p className="empty">{t('appointments.empty')}</p>
        ) : (
          <>
            <div className="table-wrap only-desktop">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">{t('appointments.col.when')}</th>
                    <th scope="col">{t('appointments.col.customer')}</th>
                    <th scope="col">{t('appointments.col.service')}</th>
                    {showStaff && <th scope="col">{t('appointments.col.staff')}</th>}
                    <th scope="col">{t('appointments.col.status')}</th>
                    <th scope="col" className="num">
                      {t('appointments.col.price')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((a) => {
                    const c = L.customers.get(a.customerId);
                    const st = L.staff.get(a.staffId);
                    return (
                      <tr key={a.id} onClick={() => openAppointment(a.id)}>
                        <td>
                          <button type="button" className="row-btn table__primary" onClick={(e) => (e.stopPropagation(), openAppointment(a.id))}>
                            {fmt.relativeDay(a.date) ?? fmt.date(a.date, 'medium')}
                          </button>
                          <div className="table__sub ltr">{fmt.timeRange(a.start, a.start + a.duration)}</div>
                        </td>
                        <td>
                          <div className="table__primary">{c?.name}</div>
                          <div className="table__sub ltr">{c?.phone}</div>
                        </td>
                        <td>
                          {tx(L.services.get(a.serviceId)?.name)}
                          {a.addOnIds.length > 0 && <span className="table__sub"> +{a.addOnIds.length}</span>}
                        </td>
                        {showStaff && (
                          <td>
                            {st && (
                              <span className="cell-person">
                                <StaffAvatar staff={st} size="sm" /> {tx(st.name)}
                              </span>
                            )}
                          </td>
                        )}
                        <td>
                          <StatusBadge status={a.status} />
                        </td>
                        <td className="num">{fmt.money(a.price)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="list only-mobile">
              {visible.map((a) => (
                <button key={a.id} type="button" className="list__row" onClick={() => openAppointment(a.id)}>
                  <div className="list__main">
                    <span className="list__title">{L.customers.get(a.customerId)?.name}</span>
                    <span className="list__sub">
                      {fmt.relativeDay(a.date) ?? fmt.date(a.date, 'medium')} · <span className="ltr">{fmt.time(a.start)}</span> ·{' '}
                      {tx(L.services.get(a.serviceId)?.name)}
                      {showStaff ? ` · ${tx(L.staff.get(a.staffId)?.name)}` : ''}
                    </span>
                  </div>
                  <StatusBadge status={a.status} />
                </button>
              ))}
            </div>
            {rows.length > limit && (
              <div className="panel__body" style={{ textAlign: 'center' }}>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setLimit((n) => n + PAGE)}>
                  {t('common.showMore')}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
