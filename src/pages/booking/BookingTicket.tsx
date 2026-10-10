import { Link } from 'react-router-dom';
import { ChevronRight } from '../../components/ui/Icons';
import { StaffAvatar, StatusBadge } from '../../components/ui/bits';
import type { PublicBooking } from '../../data';
import { weekdayOf } from '../../domain/time';
import { useI18n } from '../../i18n/I18nProvider';
import { usePublicTenant } from './TenantContext';

/** Customer-facing appointment ticket. */
export function BookingTicket({ booking, link }: { booking: PublicBooking; link?: boolean }) {
  const { tx, fmt } = useI18n();
  const tenant = usePublicTenant();
  const service = tenant.service(booking.serviceId);
  const staff = tenant.staff(booking.staffId);
  const addOns = booking.addOnIds.map((id) => tx(tenant.addOn(id)?.name)).filter(Boolean);
  const inner = (
    <>
      <div className="ticket__date">
        <span className="ticket__wd">{fmt.relativeDay(booking.date) ?? fmt.weekday(weekdayOf(booking.date), 'short')}</span>
        <span className="ticket__day tabular">{fmt.date(booking.date, 'short')}</span>
        <span className="ticket__time tabular">{fmt.time(booking.start)}</span>
      </div>
      <div className="ticket__main">
        <p className="ticket__service">{tx(service?.name)}</p>
        {addOns.length > 0 && <p className="ticket__addons">+ {fmt.list(addOns)}</p>}
        <p className="ticket__staff">
          {staff && !tenant.solo && <StaffAvatar staff={staff} size="sm" />}
          {!tenant.solo && staff && <>{tx(staff.name)} · </>}
          {fmt.duration(booking.duration)} · <span className="tabular">{fmt.money(booking.price)}</span>
        </p>
        {(booking.status === 'cancelled' || booking.status === 'pending') && <StatusBadge status={booking.status} />}
      </div>
      {link && <ChevronRight className="ticket__chev" />}
    </>
  );
  return link ? (
    <Link to={`${tenant.base}/bookings/${booking.id}`} className="ticket ticket--link">
      {inner}
    </Link>
  ) : (
    <div className="ticket">{inner}</div>
  );
}
