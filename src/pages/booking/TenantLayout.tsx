import { Suspense, useEffect, useMemo, type MouseEvent } from 'react';
import { Link, Outlet, useLocation, useMatch, useNavigate, useParams } from 'react-router-dom';
import { PublicHeader } from '../../components/public/PublicHeader';
import { accentStyle, loadThemeFont } from '../../components/ui/accents';
import { BrushIcon } from '../../components/ui/Icons';
import { BusinessWordmark, LocaleSwitch, PreviewNote } from '../../components/ui/bits';
import { PRODUCT } from '../../config/product';
import { auth, publicBooking, workspace } from '../../data';
import { can } from '../../domain/permissions';
import type { SectionKind } from '../../domain/types';
import { FormatScope, useI18n } from '../../i18n/I18nProvider';
import { DemoFilm, FILM_SLUGS } from './film/DemoFilm';
import { FilmCamera } from './film/FilmCamera';
import { inFilmFrame, useFilmFrame } from './film/bridge';
import { filmView, scenesFor } from './film/script';
import { applyDraft, PreviewEditingProvider, useEditorPreview, usePreviewEditing } from './pageBridge';
import { PublicTenantProvider, usePublicTenant } from './TenantContext';
import '../../styles/public.css';
import './tenant.css';
import './page.css';

/** Resolves :businessSlug, applies the tenant's branding and formatting, and provides it to children. */
export function TenantScope() {
  const { businessSlug = '' } = useParams();
  const found = publicBooking.useBusiness(businessSlug);
  const { editing, draft } = useEditorPreview();
  const frame = useFilmFrame();
  const film = useMemo(() => (found && frame ? filmView(found.business, scenesFor(found.business), frame) : null), [found, frame]);
  const value = useMemo(
    () => (found && film ? { ...found, business: film.business } : found && draft ? { ...found, business: applyDraft(found.business, draft) } : found),
    [found, draft, film],
  );
  const theme = value?.business.page.theme ?? 'clean';
  useEffect(() => {
    loadThemeFont(theme);
  }, [theme]);
  if (value === null) return <div style={{ minHeight: '100vh' }} aria-busy="true" />;
  if (!value) return <TenantUnavailable />;
  const { branding } = value.business;
  // In the editor's preview, clicks select sections instead of leaving the page.
  const stayPut = (e: MouseEvent) => {
    if ((e.target as Element).closest('a, button[type="submit"]')) e.preventDefault();
  };
  return (
    <PublicTenantProvider slug={businessSlug} value={value}>
      <FormatScope currency={value.business.currency} timeZone={value.business.timezone}>
        <PreviewEditingProvider value={editing}>
          <div
            className="tenant"
            data-accent={branding.accent}
            data-theme={theme}
            style={accentStyle(branding)}
            data-editing={editing ? '' : undefined}
            data-film={film ? '' : undefined}
            data-typing={film?.typing || undefined}
            onClickCapture={editing || film ? stayPut : undefined}
          >
            {film ? <FilmCamera focus={film.focus} business={film.business} /> : <TenantTitle />}
            <Outlet />
          </div>
        </PreviewEditingProvider>
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

/**
 * Shown only to the business's own members: a way back into the workspace, and
 * for drafts, a reminder that nobody else can see the page yet.
 */
function OwnerBar() {
  const { t } = useI18n();
  const { business, preview } = usePublicTenant();
  const session = auth.useSession();
  const editing = usePreviewEditing();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const member = session?.memberships.find((m) => m.businessId === business.id);
  if (!session || !member || editing || inFilmFrame()) return null;
  const canEdit = can(member.role, 'business.settings');
  const section = hash.slice(1);
  const open = async (to: string) => {
    if (session.active?.businessId !== business.id) await auth.switchBusiness(business.id);
    navigate(to);
  };
  const publish = async () => {
    await workspace.api({ businessId: business.id, userId: session.user.id, role: member.role, staffId: member.staffId }).setPublished(true);
  };
  return (
    <div className="tenant-draft" role={preview ? 'status' : undefined}>
      <span>{preview ? t('tenant.preview') : t('tenant.owner.live')}</span>
      {canEdit ? (
        <button type="button" className="btn btn--light btn--sm" onClick={() => open(section ? `/app/page?section=${encodeURIComponent(section)}` : '/app/page')}>
          <BrushIcon size={14} /> {t('tenant.owner.edit')}
        </button>
      ) : (
        <button type="button" className="btn btn--light btn--sm" onClick={() => open('/app')}>
          {t('tenant.owner.dashboard')}
        </button>
      )}
      {preview && canEdit && (
        <button type="button" className="btn btn--light btn--sm" onClick={publish}>
          {t('tenant.previewPublish')}
        </button>
      )}
    </div>
  );
}

/** Sections worth a header link, in the order they appear on the page. */
const NAV_KINDS: Partial<Record<SectionKind, 'services' | 'gallery' | 'about' | 'team' | 'info'>> = {
  services: 'services',
  gallery: 'gallery',
  about: 'about',
  team: 'team',
  info: 'info',
};

export function TenantChrome() {
  const { t, tx } = useI18n();
  const { business, base, solo, slug } = usePublicTenant();
  const editing = usePreviewEditing();
  const home = !!useMatch('/book/:businessSlug');
  const film = home && !editing && FILM_SLUGS.includes(slug) && !inFilmFrame();
  const name = tx(business.name);
  const { page } = business;
  const hero = page.sections[0];
  const nav = page.sections
    .filter((s) => s.visible && NAV_KINDS[s.kind] && !(s.kind === 'team' && solo) && !(s.kind === 'gallery' && !s.images?.length))
    .map((s) => ({ to: `${base}#${s.kind}`, label: t(`tenant.nav.${NAV_KINDS[s.kind]!}`) }));
  return (
    <div className="tenant-site" data-theme={page.theme} data-hero={hero.layout}>
      <a href="#main" className="skip-link">
        {t('common.skipToContent')}
      </a>
      {film && <DemoFilm />}
      <OwnerBar />
      <PublicHeader
        home={base}
        brand={<BusinessWordmark name={name} logoUrl={business.branding.logoUrl} hideMark={business.branding.hideLogo} />}
        nav={[...nav, { to: `${base}/bookings`, label: t('tenant.nav.myBookings') }]}
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
              <BusinessWordmark name={name} logoUrl={business.branding.logoUrl} hideMark={business.branding.hideLogo} />
              {tx(business.tagline) && <p className="muted">{tx(business.tagline)}</p>}
              <LocaleSwitch />
            </div>
          </div>
          <div className="site-footer__bottom muted">
            <span>{t('tenant.footer.rights', { year: String(new Date().getFullYear()), business: name })}</span>
            <span className="site-footer__powered">
              <Link to="/accessibility">{t('legal.accessibility')}</Link>
              <Link to="/privacy">{t('legal.privacy')}</Link>
              <Link to="/">{t('meta.poweredBy', { product: PRODUCT.name })}</Link>
            </span>
          </div>
          <PreviewNote compact />
        </div>
      </footer>
    </div>
  );
}
