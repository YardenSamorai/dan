import { Link, useParams } from 'react-router-dom';
import { CalendarIcon, CheckIcon, ClockIcon } from '../../components/ui/Icons';
import { publicBooking } from '../../data';
import { useI18n } from '../../i18n/I18nProvider';
import { downloadICS } from '../../lib/ics';
import NotFoundPage from '../NotFoundPage';
import { BookingTicket } from './BookingTicket';
import { usePublicTenant } from './TenantContext';

export default function ConfirmedPage() {
  const { id = '' } = useParams();
  const { t, tx } = useI18n();
  const tenant = usePublicTenant();
  const booking = publicBooking.useBooking(tenant.slug, id);
  if (booking === null) return <section className="confirmed container" aria-busy="true" />;
  if (!booking) return <NotFoundPage />;
  const { business } = tenant;
  const name = tx(business.name);
  const pending = booking.status === 'pending';
  const service = tenant.service(booking.serviceId);

  return (
    <section className="confirmed container">
      <div className="confirmed__mark" data-pending={pending} aria-hidden="true">
        {pending ? <ClockIcon size={26} /> : <CheckIcon size={28} />}
      </div>
      <p className="eyebrow">{t(pending ? 'confirmed.eyebrowPending' : 'confirmed.eyebrow')}</p>
      <h1 className="display confirmed__title">{t(pending ? 'confirmed.titlePending' : 'confirmed.title', { name: booking.customerFirstName })}</h1>
      <p className="lede">{t(pending ? 'confirmed.bodyPending' : 'confirmed.body', { business: name })}</p>
      <div className="confirmed__ticket">
        <BookingTicket booking={booking} />
        <p className="confirmed__ref">
          {t('confirmed.ref')} <strong className="ltr tabular">{booking.code}</strong>
        </p>
      </div>
      <div className="confirmed__actions">
        <button type="button" className="btn btn--ink" onClick={() => downloadICS(booking, `${tx(service?.name)} · ${name}`, tx(business.address), business.timezone)}>
          <CalendarIcon /> {t('confirmed.addToCalendar')}
        </button>
        <Link to={`${tenant.base}/bookings/${booking.id}`} className="btn btn--ghost">
          {t('confirmed.manage')}
        </Link>
        <Link to={tenant.base} className="btn btn--quiet">
          {t('confirmed.back', { business: name })}
        </Link>
      </div>
    </section>
  );
}
