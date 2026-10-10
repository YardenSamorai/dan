import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BusinessMark, ClockIcon, MessageIcon, PhoneIcon, PinIcon } from '../../components/ui/Icons';
import { StaffAvatar } from '../../components/ui/bits';
import type { PublicService } from '../../data';
import { WEEKDAYS } from '../../domain/defaults';
import { addDays } from '../../domain/time';
import type { ISODate, Minutes } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { usePublicTenant } from './TenantContext';

function useNextOpening(): { serviceId: string; date: ISODate; start: Minutes } | null {
  const tenant = usePublicTenant();
  return useMemo(() => {
    const service = tenant.business.services[0];
    if (!service) return null;
    const q = { serviceId: service.id, staffId: tenant.business.policies.allowAnyStaff || tenant.solo ? ('any' as const) : tenant.business.staff[0]?.id ?? 'any' };
    for (let i = 0; i < 21; i++) {
      const date = addDays(tenant.today, i);
      const s = tenant.slots({ ...q, date })[0];
      if (s) return { serviceId: service.id, date, start: s.start };
    }
    return null;
  }, [tenant]);
}

export default function TenantHome() {
  const { t, tx, fmt } = useI18n();
  const { business, base } = usePublicTenant();
  const next = useNextOpening();
  const name = tx(business.name);

  return (
    <>
      <section className="tenant-hero container" aria-labelledby="tenant-title">
        {business.branding.coverUrl && <img className="tenant-hero__cover" src={business.branding.coverUrl} alt="" />}
        <BusinessMark name={name} logoUrl={business.branding.logoUrl} className="biz-mark--xl" />
        <h1 id="tenant-title" className="display tenant-hero__title">
          {name}
        </h1>
        {tx(business.tagline) && <p className="tenant-hero__tagline">{tx(business.tagline)}</p>}
        {tx(business.description) && <p className="tenant-hero__desc">{tx(business.description)}</p>}
        <div className="tenant-hero__actions">
          <Link to={`${base}/new`} className="btn btn--primary btn--lg">
            {t('common.book')}
          </Link>
          {next ? (
            <Link to={`${base}/new?service=${next.serviceId}&date=${next.date}&time=${next.start}`} className="hero__opening">
              <span className="hero__opening-dot" aria-hidden />
              <span className="muted">{t('tenant.hero.next')}</span>
              <span>
                {fmt.relativeDay(next.date) ?? fmt.date(next.date, 'medium')} · <span className="tabular">{fmt.time(next.start)}</span>
              </span>
            </Link>
          ) : (
            <span className="muted">{t('tenant.hero.none')}</span>
          )}
        </div>
      </section>

      <Services />
      {business.staff.length > 1 && <Team />}
      <Info />
    </>
  );
}

function ServiceRow({ service }: { service: PublicService }) {
  const { t, tx, fmt } = useI18n();
  const { business, base } = usePublicTenant();
  const names = service.staffIds.map((id) => tx(business.staff.find((s) => s.id === id)?.name).split(' ')[0]);
  const desc = tx(service.description);
  return (
    <li className="svc-row">
      <h3 className="svc-row__name">{tx(service.name)}</h3>
      <span className="svc-row__meta">
        <ClockIcon size={13} /> {fmt.duration(service.duration)}
      </span>
      <span className="svc-row__price tabular">{fmt.money(service.price)}</span>
      <p className="svc-row__desc">
        {desc}
        {business.staff.length > 1 && names.length < business.staff.length && (
          <>
            {desc && ' · '}
            {t('tenant.services.with', { names: fmt.list(names) })}
          </>
        )}
      </p>
      <Link to={`${base}/new?service=${service.id}`} className="btn btn--ghost btn--sm svc-row__action">
        {t('tenant.services.book')}
      </Link>
    </li>
  );
}

function Services() {
  const { t, tx, fmt } = useI18n();
  const { business } = usePublicTenant();
  const groups = useMemo(() => {
    const cats = business.categories.map((c) => ({ id: c.id, name: tx(c.name), items: business.services.filter((s) => s.categoryId === c.id) }));
    const rest = business.services.filter((s) => !s.categoryId || !business.categories.some((c) => c.id === s.categoryId));
    return [...cats, { id: '_', name: '', items: rest }].filter((g) => g.items.length);
  }, [business, tx]);

  return (
    <section className="section container tenant-section" id="services" aria-labelledby="svc-title">
      <h2 id="svc-title" className="display display-sm">
        {t('tenant.services.title')}
      </h2>
      {groups.length === 0 && <p className="muted">{t('tenant.services.empty')}</p>}
      {groups.map((g) => (
        <div key={g.id} className="svc-cat">
          {g.name && groups.length > 1 && <h3 className="svc-cat__title">{g.name}</h3>}
          <ul className="svc-list">
            {g.items.map((s) => (
              <ServiceRow key={s.id} service={s} />
            ))}
          </ul>
        </div>
      ))}
      {business.addOns.length > 0 && (
        <div className="svc-cat">
          <h3 className="svc-cat__title">{t('tenant.services.addOns')}</h3>
          <ul className="addons">
            {business.addOns.map((a) => (
              <li key={a.id} className="addon">
                <span>{tx(a.name)}</span>
                <span className="muted tabular">
                  +{fmt.duration(a.duration)} · {fmt.money(a.price)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Team() {
  const { t, tx, fmt } = useI18n();
  const { business, base } = usePublicTenant();
  return (
    <section className="section container tenant-section" id="team" aria-labelledby="team-title">
      <h2 id="team-title" className="display display-sm">
        {t('tenant.team.title')}
      </h2>
      <div className="team-grid">
        {business.staff.map((s) => {
          const name = tx(s.name);
          return (
            <article key={s.id} className="team-card">
              <StaffAvatar staff={s} size="xl" />
              <div>
                <h3 className="team-card__name">{name}</h3>
                {tx(s.role) && <p className="team-card__role">{tx(s.role)}</p>}
              </div>
              <div className="team-card__meta">
                <span className="muted">{t('tenant.team.works')}</span>
                <div className="team-card__days">
                  {WEEKDAYS.map((wd) => (
                    <span key={wd} className="team-card__day" data-on={s.workingDays.includes(wd)} title={fmt.weekday(wd)}>
                      {fmt.weekday(wd, 'narrow')}
                    </span>
                  ))}
                </div>
              </div>
              <Link to={`${base}/new?staff=${s.id}`} className="link-arrow">
                {t('tenant.team.book', { name: name.split(' ')[0] })}
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function OpeningHours({ compact }: { compact?: boolean }) {
  const { t, fmt } = useI18n();
  const { hours } = usePublicTenant().business;
  return (
    <dl className={`hours${compact ? ' hours--compact' : ''}`}>
      {WEEKDAYS.map((wd) => (
        <div key={wd} className="hours__row">
          <dt>{fmt.weekday(wd, compact ? 'short' : 'long')}</dt>
          <dd className="tabular">{hours[wd].ranges.length ? hours[wd].ranges.map((r) => fmt.timeRange(r.start, r.end)).join(', ') : t('common.closed')}</dd>
        </div>
      ))}
    </dl>
  );
}

function Info() {
  const { t, tx, fmt } = useI18n();
  const { business } = usePublicTenant();
  const p = business.policies;
  const address = tx(business.address);
  const phoneDigits = business.phone.replace(/\D/g, '');
  const wa = business.social.whatsapp?.replace(/\D/g, '');
  const hoursText = (h: number) => t('units.hoursLong', { count: h });
  const notice = p.leadTimeMinutes >= 1440 ? t('units.daysLong', { count: Math.round(p.leadTimeMinutes / 1440) }) : p.leadTimeMinutes >= 60 ? hoursText(Math.round(p.leadTimeMinutes / 60)) : fmt.duration(p.leadTimeMinutes);

  return (
    <section className="section container tenant-section" id="info" aria-labelledby="info-title">
      <h2 id="info-title" className="display display-sm">
        {t('tenant.info.title')}
      </h2>
      <div className="tenant-info">
        <div>
          <h3 className="svc-cat__title">{t('tenant.info.hours')}</h3>
          <OpeningHours />
          {business.specialDays.length > 0 && (
            <>
              <h3 className="svc-cat__title tenant-info__sub">{t('tenant.info.special')}</h3>
              <dl className="hours">
                {business.specialDays.map((d) => (
                  <div key={d.date} className="hours__row">
                    <dt>
                      {fmt.date(d.date, 'medium')}
                      {d.label && <span className="muted"> · {d.label}</span>}
                    </dt>
                    <dd className="tabular">{d.closed ? t('common.closed') : d.ranges.map((r) => fmt.timeRange(r.start, r.end)).join(', ')}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
        <div className="tenant-info__col">
          {address && (
            <div>
              <h3 className="svc-cat__title">{t('tenant.info.location')}</h3>
              <p className="tenant-info__line">
                <PinIcon /> {address}
              </p>
              <a className="link-arrow" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.address.en || address)}`} target="_blank" rel="noreferrer">
                {t('tenant.info.directions')}
              </a>
            </div>
          )}
          <div>
            <h3 className="svc-cat__title">{t('tenant.info.contact')}</h3>
            <div className="tenant-info__actions">
              {phoneDigits && (
                <a className="btn btn--ghost btn--sm" href={`tel:${phoneDigits}`}>
                  <PhoneIcon /> <span className="ltr">{business.phone}</span>
                </a>
              )}
              {wa && (
                <a className="btn btn--ghost btn--sm" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
                  <MessageIcon /> {t('common.whatsapp')}
                </a>
              )}
              {business.email && (
                <a className="btn btn--ghost btn--sm" href={`mailto:${business.email}`}>
                  {t('common.email')}
                </a>
              )}
              {business.social.instagram && (
                <a className="btn btn--ghost btn--sm" href={`https://instagram.com/${business.social.instagram}`} target="_blank" rel="noreferrer">
                  Instagram
                </a>
              )}
            </div>
          </div>
          <div>
            <h3 className="svc-cat__title">{t('tenant.info.policies')}</h3>
            <ul className="tenant-policies">
              <li>{t('tenant.info.noticePolicy', { time: notice })}</li>
              <li>{p.customerCanCancel ? t('tenant.info.cancelPolicy', { hours: hoursText(p.cancelWindowHours) }) : t('tenant.info.noOnlineCancel')}</li>
              {p.customerCanReschedule && <li>{t('tenant.info.reschedulePolicy', { hours: hoursText(p.rescheduleWindowHours) })}</li>}
              {p.confirmationMode === 'manual' && <li>{t('tenant.info.manualPolicy')}</li>}
              <li>{t('tenant.info.payment')}</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
