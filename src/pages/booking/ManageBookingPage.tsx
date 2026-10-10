import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SlotPicker } from '../../components/booking/SlotPicker';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ArrowBackIcon, CalendarIcon, LockIcon, PhoneIcon } from '../../components/ui/Icons';
import { useToast } from '../../components/ui/Toast';
import { ApiError, publicBooking } from '../../data';
import { rememberBooking } from '../../data/mine';
import { canCustomerCancel, canCustomerReschedule } from '../../domain/policy';
import type { ISODate, Minutes } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { downloadICS } from '../../lib/ics';
import NotFoundPage from '../NotFoundPage';
import { BookingTicket } from './BookingTicket';
import { usePublicTenant } from './TenantContext';
import '../../components/booking/booking.css';

export default function ManageBookingPage() {
  const { id = '' } = useParams();
  const { t, tx, fmt } = useI18n();
  const toast = useToast();
  const tenant = usePublicTenant();
  const booking = publicBooking.useBooking(tenant.slug, id);
  const [mode, setMode] = useState<'view' | 'reschedule'>('view');
  const [pick, setPick] = useState<{ date?: ISODate; start?: Minutes }>({});
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!booking) return <NotFoundPage />;
  const { business } = tenant;
  const tz = business.timezone;
  const cancel = canCustomerCancel(booking, business.policies, tz);
  const move = canCustomerReschedule(booking, business.policies, tz);
  const service = tenant.service(booking.serviceId);
  const when = (d: Date) => fmt.dateTime(d);
  const phone = business.phone;

  const doMove = async () => {
    if (!pick.date || pick.start === undefined) return;
    setBusy(true);
    setError(null);
    try {
      await publicBooking.rescheduleBooking(tenant.slug, booking.id, { date: pick.date, start: pick.start });
      toast(t('mine.manage.moved'));
      setMode('view');
      setPick({});
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'slot_taken' ? t('conflict.slot_taken') : t('common.unknownError'));
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    setBusy(true);
    await publicBooking.cancelBooking(tenant.slug, booking.id).catch(() => toast(t('common.unknownError')));
    rememberBooking(tenant.slug, booking.id);
    setBusy(false);
    setConfirmCancel(false);
  };

  const contact = phone && (
    <a className="btn btn--ghost" href={`tel:${phone.replace(/\D/g, '')}`}>
      <PhoneIcon /> {t('mine.manage.call', { phone })}
    </a>
  );

  return (
    <div className="container manage">
      <Link to={`${tenant.base}/bookings`} className="booking__back">
        <ArrowBackIcon size={14} /> {t('mine.title')}
      </Link>
      <h1 className="display manage__title">{t('mine.manage.title')}</h1>
      <BookingTicket booking={booking} />
      <p className="manage__ref muted">
        {t('confirmed.ref')} <span className="ltr tabular">{booking.code}</span>
      </p>

      {booking.status === 'cancelled' ? (
        <p className="manage__note">{t('mine.manage.cancelled')}</p>
      ) : cancel.reason === 'past' ? (
        <p className="manage__note">{t('mine.manage.past')}</p>
      ) : mode === 'view' ? (
        <>
          {booking.status === 'pending' && <p className="manage__note">{t('mine.manage.pending')}</p>}
          <p className="manage__note">
            {move.reason === 'disabled' ? (
              t('mine.manage.disabled')
            ) : move.allowed ? (
              t('mine.manage.deadline', { when: when(move.deadline) })
            ) : (
              <>
                <LockIcon /> {t('mine.manage.lockedReschedule', { when: when(move.deadline) })}
              </>
            )}
          </p>
          <div className="manage__actions">
            {move.allowed && (
              <button type="button" className="btn btn--ink" onClick={() => setMode('reschedule')}>
                {t('mine.manage.reschedule')}
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={() => downloadICS(booking, `${tx(service?.name)} · ${tx(business.name)}`, tx(business.address), tz)}>
              <CalendarIcon /> {t('confirmed.addToCalendar')}
            </button>
            {cancel.allowed ? (
              <button type="button" className="btn btn--danger" onClick={() => setConfirmCancel(true)}>
                {t('mine.manage.cancel')}
              </button>
            ) : (
              contact
            )}
          </div>
        </>
      ) : (
        <section className="manage__move" aria-labelledby="move-title">
          <h2 id="move-title" className="svc-cat__title">
            {t('mine.manage.newTime')}
          </h2>
          <SlotPicker
            serviceId={booking.serviceId}
            addOnIds={booking.addOnIds}
            staffId={booking.anyStaff ? 'any' : booking.staffId}
            excludeBookingId={booking.id}
            date={pick.date ?? booking.date}
            start={pick.start}
            onChange={(v) => setPick(v)}
          />
          {error && (
            <p className="booking__notice" role="alert">
              {error}
            </p>
          )}
          <div className="manage__actions">
            <button type="button" className="btn btn--primary" disabled={pick.start === undefined || busy} onClick={doMove}>
              {busy && <span className="spinner" aria-hidden />}
              {pick.start !== undefined && pick.date ? t('mine.manage.confirmMove', { when: `${fmt.date(pick.date, 'medium')} ${fmt.time(pick.start)}` }) : t('mine.manage.newTime')}
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => setMode('view')}>
              {t('common.cancel')}
            </button>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={confirmCancel}
        title={t('mine.manage.cancelConfirm')}
        body={t('mine.manage.cancelBody')}
        confirmLabel={t('mine.manage.cancel')}
        cancelLabel={t('mine.manage.keep')}
        danger
        busy={busy}
        onConfirm={doCancel}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
