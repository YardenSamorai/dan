import { Suspense, useEffect } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { PublicHeader } from '../../components/public/PublicHeader';
import { BusinessWordmark, LocaleSwitch, PreviewNote } from '../../components/ui/bits';
import { PRODUCT } from '../../config/product';
import { auth, publicBooking, workspace } from '../../data';
import { FormatScope, useI18n } from '../../i18n/I18nProvider';
import { PublicTenantProvider, usePublicTenant } from './TenantContext';
import '../../styles/public.css';
import './tenant.css';

/** Resolves :businessSlug, applies the tenant's branding and formatting, and provides it to children. */
export function TenantScope() {
  const { businessSlug = '' } = useParams();
  const found = publicBooking.useBusiness(businessSlug);
  if (!found) return <TenantUnavailable />;
  return (
    <PublicTenantProvider slug={businessSlug} value={found}>
      <FormatScope currency={found.business.currency} timeZone={found.business.timezone}>
        <div className="tenant" data-accent={found.business.branding.accent}>
          <TenantTitle />
          <Outlet />
        </div>
      </FormatScope>
    </PublicTenantProvider>
  );
}

function TenantTitle() {
  const { business } = usePublicTenant();
  const { tx } = useI18n();
  const name = tx(business.name);
  const tagline = tx(business.tagline);
  useEffect(() => {
    document.title = tagline ? `${name} · ${tagline}` : name;
  }, [name, tagline]);
  return null;
}

function TenantUnavailable() {
  const { t } = useI18n();
  return (
    <section className="page-head container" style={{ minHeight: '80vh' }}>
      <h1 className="display">{t('tenant.unavailable.title')}</h1>
      <p className="lede">{t('tenant.unavailable.body')}</p>
      <Link to="/" className="btn btn--ink" style={{ marginBlockStart: 32 }}>
        {t('tenant.unavailable.home')}
      </Link>
    </section>
  );
}

/** Draft pages are visible to the business's own members only, with a banner saying so. */
function DraftBanner() {
  const { t } = useI18n();
  const { business, preview } = usePublicTenant();
  const session = auth.useSession();
  const member = session?.memberships.find((m) => m.businessId === business.id);
  if (!preview || !member) return null;
  const publish = async () => {
    await workspace.api({ businessId: business.id, userId: session!.user.id, role: member.role, staffId: member.staffId }).setPublished(true);
  };
  return (
    <div className="tenant-draft" role="status">
      <span>{t('tenant.preview')}</span>
      {member.role !== 'staff' && (
        <button type="button" className="btn btn--light btn--sm" onClick={publish}>
          {t('tenant.previewPublish')}
        </button>
      )}
    </div>
  );
}

export function TenantChrome() {
  const { t, tx } = useI18n();
  const { business, base } = usePublicTenant();
  const name = tx(business.name);
  return (
    <>
      <a href="#main" className="skip-link">
        {t('common.skipToContent')}
      </a>
      <DraftBanner />
      <PublicHeader
        home={base}
        brand={<BusinessWordmark name={name} logoUrl={business.branding.logoUrl} />}
        nav={[
          { to: `${base}#services`, label: t('tenant.nav.services') },
          ...(business.staff.length > 1 ? [{ to: `${base}#team`, label: t('tenant.nav.team') }] : []),
          { to: `${base}#info`, label: t('tenant.nav.info') },
          { to: `${base}/bookings`, label: t('tenant.nav.myBookings') },
        ]}
        action={
          <Link to={`${base}/new`} className="btn btn--primary btn--sm">
            {t('common.bookShort')}
          </Link>
        }
        sheetFoot={
          <Link to={`${base}/new`} className="btn btn--primary btn--lg btn--block">
            {t('common.book')}
          </Link>
        }
      />
      <main id="main" tabIndex={-1}>
        <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="site-footer">
        <div className="container">
          <div className="site-footer__top">
            <div className="site-footer__brand">
              <BusinessWordmark name={name} logoUrl={business.branding.logoUrl} />
              {tx(business.tagline) && <p className="muted">{tx(business.tagline)}</p>}
              <LocaleSwitch />
            </div>
          </div>
          <div className="site-footer__bottom muted">
            <span>{t('tenant.footer.rights', { year: new Date().getFullYear(), business: name })}</span>
            <span className="site-footer__powered">
              <Link to="/">{t('meta.poweredBy', { product: PRODUCT.name })}</Link>
            </span>
          </div>
          <PreviewNote compact />
        </div>
      </footer>
    </>
  );
}
