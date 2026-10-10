import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AlertIcon, BanIcon, CalendarIcon, CheckIcon, ChevronRight, ClockIcon, MessageIcon, PhoneIcon, PlusIcon, TagIcon, UserIcon } from '../../components/ui/Icons';
import { StaffAvatar, StatusBadge } from '../../components/ui/bits';
import { businessNow, freeRanges, occupiesTime, staffDay } from '../../domain/scheduling';
import { addDays } from '../../domain/time';
import type { Appointment, ISODate, Minutes } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { telHref, whatsappHref } from '../../lib/phone';
import { useAppUI } from '../AppUI';
import { useLookup } from '../lookup';
import { PageHeader } from '../shared';
import { useWorkspace } from '../workspace';

const MIN_GAP = 30;
const DAY = 864e5;

export default function Dashboard() {
  const L = useLookup();
  const { state } = L;
  const { can, me, solo, session } = useWorkspace();
  const { t, tx, fmt } = useI18n();
  const { openAppointment, newAppointment, newCustomer } = useAppUI();
  const now = new Date();
  const { date: today, minutes: nowMin } = businessNow(state, now);
  const allCalendar = can('calendar.all');
  const people = allCalendar ? state.staff.filter((s) => s.active) : me ? [me] : [];

  const todays = state.appointments.filter((a) => a.date === today).sort((a, b) => a.start - b.start);
  const live = todays.filter(occupiesTime);
  const remaining = live.filter((a) => a.start + a.duration > nowMin && a.status !== 'completed');
  const current = remaining.find((a) => a.start <= nowMin);
  const next = current ?? remaining[0];

  const gaps = people.flatMap((s) =>
    freeRanges(state, s.id, today)
      .map((r) => ({ ...r, start: Math.max(r.start, Math.ceil(nowMin / 15) * 15) }))
      .filter((r) => r.end - r.start >= MIN_GAP)
      .map((r) => ({ ...r, staff: s })),
  );
  gaps.sort((a, b) => a.start - b.start);

  // Needs attention
  const pending = state.appointments.filter((a) => a.status === 'pending' && (a.date > today || (a.date === today && a.start + a.duration > nowMin)));
  const cancelled = state.appointments.filter((a) => a.status === 'cancelled' && a.cancellation && +now - +new Date(a.cancellation.at) <= DAY);
  const weekAgo = addDays(today, -7);
  const noShows = state.appointments.filter((a) => a.status === 'no_show' && a.date >= weekAgo && a.date <= today);
  const unmarked = state.appointments.filter(
    (a) => (a.status === 'confirmed' || a.status === 'arrived') && a.date >= weekAgo && (a.date < today || (a.date === today && a.start + a.duration <= nowMin)),
  );
  const soonOff = state.timeOff.filter((x) => x.to >= today && x.from <= addDays(today, 14));
  const attention = pending.length + cancelled.length + noShows.length + unmarked.length + soonOff.length;

  const hour = Math.floor(nowMin / 60);
  const greeting = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const firstName = (me ? tx(me.name) : session.user.name).split(' ')[0];
  const summary = !live.length
    ? t('dashboard.summary.none')
    : remaining.length
      ? t('dashboard.summary.line', { total: t('units.appointments', { count: live.length }), remaining: fmt.number(remaining.length) })
      : t('dashboard.summary.done', { total: t('units.appointments', { count: live.length }) });

  return (
    <div className="page">
      <PageHeader eyebrow={fmt.date(today, 'full')} title={t(`dashboard.greeting.${greeting}`, { name: firstName })} lede={summary} />

      {can('appointments.manage') && (
        <div className="dash__quick" role="group" aria-label={t('dashboard.quick.title')}>
          <button type="button" className="btn btn--tinted btn--sm" onClick={() => newAppointment()}>
            <PlusIcon size={14} /> {t('dashboard.quick.newAppointment')}
          </button>
          <button type="button" className="btn btn--tinted btn--sm" onClick={() => newAppointment({ mode: 'block', date: today })}>
            <BanIcon size={14} /> {t('dashboard.quick.block')}
          </button>
          {can('customers.edit') && (
            <button type="button" className="btn btn--tinted btn--sm" onClick={newCustomer}>
              <UserIcon size={14} /> {t('dashboard.quick.customer')}
            </button>
          )}
          {can('services.manage') && (
            <Link to="/app/services?new=1" className="btn btn--tinted btn--sm">
              <TagIcon size={14} /> {t('dashboard.quick.service')}
            </Link>
          )}
        </div>
      )}

      <div className="dash">
        <div className="dash__col">
          <UpNext a={next} inProgress={!!current} nowMin={nowMin} onOpen={openAppointment} />

          <section className="sec" aria-labelledby="dash-agenda">
            <div className="sec__head">
              <h2 className="sec__title" id="dash-agenda">
                {t('dashboard.agenda')}
              </h2>
              <Link to={`/app/calendar?date=${today}`} className="sec__link">
                <CalendarIcon size={14} /> {t('app.nav.calendar')}
              </Link>
            </div>
            <div className="panel">
              {todays.length ? (
                <div className="list">
                  {todays.map((a) => (
                    <AgendaRow key={a.id} a={a} past={a.start + a.duration <= nowMin} showStaff={allCalendar && !solo} onOpen={() => openAppointment(a.id)} />
                  ))}
                </div>
              ) : (
                <p className="empty">{t('calendar.emptyDay')}</p>
              )}
            </div>
          </section>
        </div>

        <div className="dash__col">
          <section className="sec" aria-labelledby="dash-attention">
            <div className="sec__head">
              <h2 className="sec__title" id="dash-attention">
                {t('dashboard.attention')}
              </h2>
            </div>
            <div className="panel">
              {attention === 0 ? (
                <p className="all-clear">
                  <CheckIcon /> {t('dashboard.allClear')}
                </p>
              ) : (
                <div className="list">
                  {pending.length > 0 && (
                    <AttentionRow tone="warn" icon={<AlertIcon size={14} />} to="/app/appointments?status=pending&range=upcoming">
                      {t('dashboard.alerts.pending', { count: pending.length })}
                    </AttentionRow>
                  )}
                  {unmarked.length > 0 && (
                    <AttentionRow icon={<ClockIcon size={14} />} to="/app/appointments?status=confirmed&range=past">
                      {t('dashboard.alerts.unmarked', { count: unmarked.length })}
                    </AttentionRow>
                  )}
                  {cancelled.length > 0 && (
                    <AttentionRow tone="danger" icon={<BanIcon size={14} />} to="/app/appointments?status=cancelled&range=all">
                      {t('dashboard.alerts.cancelled', { count: cancelled.length })}
                    </AttentionRow>
                  )}
                  {noShows.length > 0 && (
                    <AttentionRow tone="danger" icon={<BanIcon size={14} />} to="/app/appointments?status=no_show&range=past">
                      {t('dashboard.alerts.noShows', { count: noShows.length })}
                    </AttentionRow>
                  )}
                  {soonOff.map((x) => (
                    <AttentionRow key={x.id} icon={<CalendarIcon size={14} />} to={can('availability.all') ? '/app/availability?tab=timeOff' : '/app/calendar'}>
                      {t('dashboard.alerts.timeOff', { staff: tx(L.staff.get(x.staffId)?.name), from: fmt.date(x.from, 'short'), to: fmt.date(x.to, 'short') })}
                    </AttentionRow>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="sec" aria-labelledby="dash-gaps">
            <div className="sec__head">
              <h2 className="sec__title" id="dash-gaps">
                {t('dashboard.gaps')}
              </h2>
            </div>
            <div className="panel">
              {gaps.length ? (
                <div className="list">
                  {gaps.slice(0, 6).map((g) => (
                    <GapRow
                      key={`${g.staff.id}-${g.start}`}
                      date={today}
                      start={g.start}
                      end={g.end}
                      staffName={!solo ? tx(g.staff.name) : undefined}
                      canBook={can('appointments.manage')}
                      onBook={() => newAppointment({ date: today, start: g.start, staffId: g.staff.id })}
                    />
                  ))}
                </div>
              ) : (
                <p className="empty">{t('dashboard.noGaps')}</p>
              )}
            </div>
          </section>

          {allCalendar && !solo && (
            <section className="sec" aria-labelledby="dash-team">
              <div className="sec__head">
                <h2 className="sec__title" id="dash-team">
                  {t('dashboard.teamToday')}
                </h2>
              </div>
              <div className="panel list">
                {people.map((s) => {
                  const d = staffDay(state, s.id, today);
                  const count = d.appointments.filter(occupiesTime).length;
                  return (
                    <Link to={`/app/calendar?staff=${s.id}`} className="list__row team-row" key={s.id}>
                      <StaffAvatar staff={s} size="sm" />
                      <div className="list__main">
                        <span className="list__title">{tx(s.name)}</span>
                        <span className="list__sub">
                          {d.timeOff
                            ? t(`timeOffKind.${d.timeOff.kind}`)
                            : d.shift.length
                              ? fmt.timeRange(d.shift[0].start, d.shift[d.shift.length - 1].end)
                              : t('dashboard.off')}
                        </span>
                      </div>
                      <span className="list__meta">{d.shift.length ? t('units.appointments', { count }) : ''}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function UpNext({ a, inProgress, nowMin, onOpen }: { a?: Appointment; inProgress: boolean; nowMin: Minutes; onOpen: (id: string) => void }) {
  const L = useLookup();
  const { solo } = useWorkspace();
  const { t, tx, fmt } = useI18n();
  if (!a)
    return (
      <section className="panel up-next up-next--empty">
        <div className="up-next__main">
          <p className="up-next__label">{t('dashboard.next')}</p>
          <p className="up-next__who">{t('dashboard.noNext')}</p>
          <p className="up-next__what">{t('dashboard.noNextBody')}</p>
        </div>
      </section>
    );
  const customer = L.customers.get(a.customerId);
  const staff = L.staff.get(a.staffId);
  const phone = customer?.phone;
  const wa = phone && whatsappHref(phone, L.state.business.timezone);
  return (
    <section className="panel up-next" aria-label={inProgress ? t('dashboard.nowWith') : t('dashboard.next')}>
      <button type="button" className="up-next__main" onClick={() => onOpen(a.id)}>
        <span className="up-next__when">
          <span className="up-next__label">{inProgress ? t('dashboard.nowWith') : t('dashboard.next')}</span>
          {!inProgress && <span>{t('dashboard.nextIn', { time: fmt.duration(a.start - nowMin) })}</span>}
          {a.status !== 'confirmed' && <StatusBadge status={a.status} />}
        </span>
        <span className="up-next__time tabular">
          {fmt.time(a.start)} <span>- {fmt.time(a.start + a.duration)}</span>
        </span>
        <span className="up-next__who">{customer?.name}</span>
        <span className="up-next__what">
          {[tx(L.services.get(a.serviceId)?.name), ...a.addOnIds.map((id) => tx(L.addOns.get(id)?.name)), !solo && staff ? tx(staff.name) : null].filter(Boolean).join(' · ')}
        </span>
        {customer?.note && <span className="up-next__note">{customer.note}</span>}
      </button>
      {phone && (
        <div className="up-next__actions">
          <a className="btn btn--tinted btn--sm" href={telHref(phone)}>
            <PhoneIcon size={14} /> {t('common.call')}
          </a>
          {wa && (
            <a className="btn btn--tinted btn--sm" href={wa} target="_blank" rel="noreferrer">
              <MessageIcon size={14} /> {t('common.whatsapp')}
            </a>
          )}
        </div>
      )}
    </section>
  );
}

function AttentionRow({ to, icon, tone, children }: { to: string; icon: ReactNode; tone?: 'warn' | 'danger'; children: ReactNode }) {
  return (
    <Link className="list__row att-row" data-tone={tone} to={to}>
      <span className="att-row__icon" aria-hidden>
        {icon}
      </span>
      <span className="list__main">
        <span className="list__title">{children}</span>
      </span>
      <ChevronRight className="list__chev" />
    </Link>
  );
}

function AgendaRow({ a, past, showStaff, onOpen }: { a: Appointment; past: boolean; showStaff: boolean; onOpen: () => void }) {
  const L = useLookup();
  const { tx, fmt } = useI18n();
  const staff = L.staff.get(a.staffId);
  return (
    <button type="button" className="list__row" onClick={onOpen} data-past={past || undefined} data-inactive={!occupiesTime(a) || undefined}>
      <span className="list__time tabular">{fmt.time(a.start)}</span>
      <div className="list__main">
        <span className="list__title">{L.customers.get(a.customerId)?.name}</span>
        <span className="list__sub">
          {tx(L.services.get(a.serviceId)?.name)} · {fmt.duration(a.duration)}
        </span>
      </div>
      {a.status !== 'confirmed' && <StatusBadge status={a.status} />}
      {showStaff && staff && <StaffAvatar staff={staff} size="sm" />}
    </button>
  );
}

function GapRow({ start, end, staffName, canBook, onBook }: { date: ISODate; start: Minutes; end: Minutes; staffName?: string; canBook: boolean; onBook: () => void }) {
  const { t, fmt } = useI18n();
  return (
    <div className="list__row gap-row">
      <div className="list__main">
        <span className="list__title tabular">{t('dashboard.gap', { range: fmt.timeRange(start, end), length: fmt.duration(end - start) })}</span>
        {staffName && <span className="list__sub">{staffName}</span>}
      </div>
      {canBook && (
        <button type="button" className="btn btn--tinted btn--xs gap-row__add" onClick={onBook} aria-label={`${t('dashboard.quick.newAppointment')} ${fmt.time(start)}`}>
          <PlusIcon size={12} /> {t('common.add')}
        </button>
      )}
    </div>
  );
}
