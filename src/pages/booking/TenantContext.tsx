import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { publicBooking, type AvailabilityQuery, type PublicBusiness, type PublicSession } from '../../data';
import type { Slot } from '../../domain/scheduling';
import type { ISODate } from '../../domain/types';

/** Everything a customer-facing page knows about the business it belongs to. */
export interface PublicTenant {
  slug: string;
  business: PublicBusiness;
  preview: boolean;
  /** Base path: /book/{slug} */
  base: string;
  today: ISODate;
  solo: boolean;
  service: (id: string) => PublicBusiness['services'][number] | undefined;
  staff: (id: string) => PublicBusiness['staff'][number] | undefined;
  addOn: (id: string) => PublicBusiness['addOns'][number] | undefined;
  slots: (q: AvailabilityQuery & { date: ISODate }) => Slot[];
  firstAvailable: (q: AvailabilityQuery, from?: ISODate) => ISODate | null;
  /** Upcoming group sessions of a class service, from today. */
  sessions: (serviceId: string, days?: number) => PublicSession[];
}

const Ctx = createContext<PublicTenant | null>(null);

export function PublicTenantProvider({ slug, value, children }: { slug: string; value: { business: PublicBusiness; preview: boolean }; children: ReactNode }) {
  const { business, preview } = value;
  const tenant = useMemo<PublicTenant>(() => {
    const today = publicBooking.today(slug);
    return {
      slug,
      business,
      preview,
      base: `/book/${slug}`,
      today,
      solo: business.staff.length <= 1,
      service: (id) => business.services.find((s) => s.id === id),
      staff: (id) => business.staff.find((s) => s.id === id),
      addOn: (id) => business.addOns.find((a) => a.id === id),
      slots: (q) => publicBooking.slots(slug, q),
      firstAvailable: (q, from = today) => publicBooking.firstAvailable(slug, q, from),
      sessions: (serviceId, days = 62) => publicBooking.sessions(slug, { serviceId, from: today, days }),
    };
  }, [slug, business, preview]);
  return <Ctx.Provider value={tenant}>{children}</Ctx.Provider>;
}

export function usePublicTenant(): PublicTenant {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePublicTenant outside a tenant route');
  return v;
}
