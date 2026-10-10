import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Drawer } from '../components/ui/Drawer';
import {
  BrushIcon,
  BusinessMark,
  CalendarIcon,
  ChartIcon,
  CheckIcon,
  ChevronDown,
  ChevronRight,
  ClockIcon,
  DotsIcon,
  ExternalIcon,
  GearIcon,
  GridIcon,
  ListIcon,
  LogOutIcon,
  PlusIcon,
  QuestionIcon,
  SidebarIcon,
  TagIcon,
  UserIcon,
  UsersIcon,
} from '../components/ui/Icons';
import { Avatar, LocaleSwitch, PreviewNote, ProductWordmark } from '../components/ui/bits';
import { useToast } from '../components/ui/Toast';
import { PRODUCT } from '../config/product';
import { auth, type Membership, type SessionInfo } from '../data';
import type { Permission } from '../domain/permissions';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/messages';
import { useMedia } from '../lib/useMedia';
import { AppUIProvider, useAppUI } from './AppUI';
import { useWorkspace, WorkspaceProvider } from './workspace';
import './app.css';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const InsightsPage = lazy(() => import('./pages/InsightsPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const CustomersImport = lazy(() => import('./pages/CustomersImport'));
const ServicesAdmin = lazy(() => import('./pages/ServicesAdmin'));
const StaffAdmin = lazy(() => import('./pages/StaffAdmin'));
const AvailabilityPage = lazy(() => import('./pages/AvailabilityPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const PageEditor = lazy(() => import('./pages/PageEditor'));

interface NavItem {
  to: string;
  key: MessageKey;
  icon: ComponentType<{ size?: number }>;
  /** Day-to-day work: phone tab bar, and the "New appointment" action in the top bar. */
  primary?: boolean;
  /** Day-to-day, but the phone tab bar has no room: it sits at the top of More instead. */
  noTab?: boolean;
  needs?: Permission;
}

const NAV: NavItem[] = [
  { to: '/app', key: 'app.nav.dashboard', icon: GridIcon, primary: true },
  { to: '/app/calendar', key: 'app.nav.calendar', icon: CalendarIcon, primary: true },
  { to: '/app/appointments', key: 'app.nav.appointments', icon: ListIcon, primary: true },
  { to: '/app/customers', key: 'app.nav.customers', icon: UsersIcon, primary: true, needs: 'customers.view' },
  { to: '/app/insights', key: 'app.nav.insights', icon: ChartIcon, primary: true, noTab: true, needs: 'insights.view' },
  { to: '/app/services', key: 'app.nav.services', icon: TagIcon, needs: 'services.manage' },
  { to: '/app/staff', key: 'app.nav.staff', icon: UserIcon, needs: 'staff.manage' },
  { to: '/app/availability', key: 'app.nav.availability', icon: ClockIcon, needs: 'availability.all' },
  { to: '/app/page', key: 'app.nav.page', icon: BrushIcon, needs: 'business.settings' },
  { to: '/app/settings', key: 'app.nav.settings', icon: GearIcon, needs: 'business.settings' },
];

/** Screens that own the full height (no large title, the top bar names them). */
const FULL_BLEED = new Set(['/app/calendar']);
const RAIL_KEY = 'saas.sidebar.rail';

function useNav() {
  const { can } = useWorkspace();
  const { pathname } = useLocation();
  const items = NAV.filter((n) => !n.needs || can(n.needs));
  const current = [...items].sort((a, b) => b.to.length - a.to.length).find((n) => pathname === n.to || pathname.startsWith(n.to + '/')) ?? items[0];
  return { items, current };
}

/** Outside-press and Esc close a popover; the trigger keeps focus semantics. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return { open, setOpen, ref };
}

/** The businesses this person belongs to, plus "create". Used in the switcher and the phone More sheet. */
function BusinessList({ onDone }: { onDone?: () => void }) {
  const { t, tx } = useI18n();
  const { session, membership } = useWorkspace();
  const navigate = useNavigate();
  const go = async (m: Membership) => {
    if (m.businessId !== membership.businessId) await auth.switchBusiness(m.businessId);
    onDone?.();
    navigate('/app');
  };
  return (
    <ul className="menu-list" role="list">
      {session.memberships.map((m) => {
        const on = m.businessId === membership.businessId;
        return (
          <li key={m.id}>
            <button type="button" className="menu-row" aria-current={on || undefined} onClick={() => go(m)}>
              <span data-accent={m.business.branding.accent} className="menu-row__lead">
                <BusinessMark name={tx(m.business.name)} logoUrl={m.business.branding.logoUrl} />
              </span>
              <span className="menu-row__text">
                <span className="menu-row__title">{tx(m.business.name)}</span>
                <span className="menu-row__sub">
                  {t(`roles.${m.role}`)}
                  {m.business.status === 'draft' ? ` · ${t('settings.business.draft')}` : ''}
                </span>
              </span>
              {on && <CheckIcon size={15} className="menu-row__check" />}
            </button>
          </li>
        );
      })}
      <li>
        <Link to="/onboarding" className="menu-row menu-row--action" onClick={onDone}>
          <span className="menu-row__lead menu-row__lead--icon">
            <PlusIcon size={14} />
          </span>
          <span className="menu-row__title">{t('app.account.create')}</span>
        </Link>
      </li>
    </ul>
  );
}

function BusinessSwitcher() {
  const { tx, t } = useI18n();
  const { tenant, membership } = useWorkspace();
  const { open, setOpen, ref } = usePopover();
  const id = useId();
  const b = tenant.business;
  return (
    <div className="switcher" ref={ref}>
      <button type="button" className="switcher__btn" aria-expanded={open} aria-controls={id} aria-label={t('app.account.switchBusiness')} onClick={() => setOpen((o) => !o)}>
        <span data-accent={b.branding.accent} className="switcher__mark">
          <BusinessMark name={tx(b.name)} logoUrl={b.branding.logoUrl} />
        </span>
        <span className="switcher__text">
          <span className="switcher__name">{tx(b.name)}</span>
          <span className="switcher__role">{t(`roles.${membership.role}`)}</span>
        </span>
        <ChevronDown size={14} className="switcher__chev" />
      </button>
      {open && (
        <div className="popover popover--start" id={id}>
          <p className="popover__label">{t('app.account.businesses')}</p>
          <BusinessList onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function AccountMenu() {
  const { t } = useI18n();
  const { session, tenant } = useWorkspace();
  const { open, setOpen, ref } = usePopover();
  const navigate = useNavigate();
  const id = useId();
  return (
    <div className="account-menu" ref={ref}>
      <button type="button" className="account-menu__btn" aria-expanded={open} aria-controls={id} aria-label={t('app.account.menu')} onClick={() => setOpen((o) => !o)}>
        <Avatar name={session.user.name} size="sm" />
      </button>
      {open && (
        <div className="popover popover--end" id={id}>
          <div className="popover__who">
            <Avatar name={session.user.name} />
            <div>
              <p className="popover__name">{session.user.name}</p>
              <p className="popover__meta ltr">{session.user.email}</p>
            </div>
          </div>
          <div className="popover__sep" />
          <div className="popover__line">
            <span>{t('common.language')}</span>
            <LocaleSwitch />
          </div>
          <Link to={`/book/${tenant.business.slug}`} target="_blank" className="menu-row menu-row--plain">
            <ExternalIcon size={15} /> <span className="menu-row__title">{t('app.viewPage')}</span>
          </Link>
          <Link to="/help" target="_blank" className="menu-row menu-row--plain">
            <QuestionIcon size={15} /> <span className="menu-row__title">{t('legal.help')}</span>
          </Link>
          <div className="popover__sep" />
          <button
            type="button"
            className="menu-row menu-row--plain"
            onClick={async () => {
              await auth.signOut();
              navigate('/sign-in', { replace: true });
            }}
          >
            <LogOutIcon size={15} /> <span className="menu-row__title">{t('app.account.signOut')}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function DraftBanner() {
  const { t } = useI18n();
  const { tenant, can, api } = useWorkspace();
  const toast = useToast();
  if (tenant.business.status !== 'draft') return null;
  return (
    <div className="draft-bar" role="status">
      <span className="draft-bar__dot" aria-hidden />
      <span className="draft-bar__text">{t('app.draft')}</span>
      <Link to={`/book/${tenant.business.slug}`} target="_blank" className="draft-bar__link">
        {t('app.viewPage')}
      </Link>
      {can('business.settings') && (
        <button
          type="button"
          className="btn btn--primary btn--xs"
          onClick={async () => {
            await api.setPublished(true);
            toast(t('app.published'));
          }}
        >
          {t('app.publish')}
        </button>
      )}
    </div>
  );
}

function NavGroup({ label, items, rail }: { label: string; items: NavItem[]; rail: boolean }) {
  const { t } = useI18n();
  if (!items.length) return null;
  return (
    <div className="sidebar__group">
      <p className="sidebar__label">{label}</p>
      <ul role="list">
        {items.map((n) => (
          <li key={n.to}>
            <NavLink to={n.to} end={n.to === '/app'} className="sidebar__link" aria-label={rail ? t(n.key) : undefined}>
              <n.icon size={17} />
              <span className="sidebar__text">{t(n.key)}</span>
              <span className="sidebar__tip" aria-hidden>
                {t(n.key)}
              </span>
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Grouped iOS-style rows for the phone "More" sheet. */
function SheetGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section className="sheet-group">
      {label && <p className="sheet-group__label">{label}</p>}
      <div className="sheet-group__list">{children}</div>
    </section>
  );
}

function Shell() {
  const { t, tx } = useI18n();
  const { tenant, can } = useWorkspace();
  const { newAppointment } = useAppUI();
  const { items, current } = useNav();
  const [more, setMore] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [railPref, setRail] = useState(() => localStorage.getItem(RAIL_KEY) === '1');
  const tablet = useMedia('(min-width: 861px) and (max-width: 1099px)');
  const rail = railPref || tablet;
  const { pathname } = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const business = tenant.business;
  const page = `/book/${business.slug}`;
  const primary = items.filter((n) => n.primary);
  const secondary = items.filter((n) => !n.primary);
  const tabs = primary.filter((n) => !n.noTab);
  const moreItems = items.filter((n) => !tabs.includes(n));
  const fullBleed = FULL_BLEED.has(current.to);
  const pinnedTitle = fullBleed;

  useEffect(() => {
    document.title = `${t(current.key)} · ${tx(business.name)} · ${PRODUCT.name}`;
  }, [current, t, tx, business.name]);

  useEffect(() => {
    setMore(false);
    scrollRef.current?.scrollTo(0, 0);
    setScrolled(false);
  }, [pathname]);

  const onScroll = useCallback(() => {
    const y = scrollRef.current?.scrollTop ?? 0;
    setScrolled((s) => (s ? y > 24 : y > 40));
  }, []);

  const toggleRail = () =>
    setRail((r) => {
      localStorage.setItem(RAIL_KEY, r ? '0' : '1');
      return !r;
    });

  const guard = (n: NavItem, el: JSX.Element) => (!n.needs || can(n.needs) ? el : <Navigate to="/app" replace />);
  const byPath = (to: string) => NAV.find((n) => n.to === to)!;
  const showNew = !!current.primary && can('appointments.manage');

  return (
    <div className="app" data-rail={rail || undefined} data-full={fullBleed || undefined}>
      <a href="#app-main" className="skip-link">
        {t('common.skipToContent')}
      </a>
      <aside className="sidebar" aria-label={t('common.menu')}>
        <BusinessSwitcher />
        <nav className="sidebar__nav" aria-label={t('common.menu')}>
          <NavGroup label={t('app.nav.groupWork')} items={primary} rail={rail} />
          <NavGroup label={t('app.nav.groupSetup')} items={secondary} rail={rail} />
        </nav>
        <div className="sidebar__foot">
          <Link to={page} className="sidebar__link sidebar__link--quiet" target="_blank" aria-label={rail ? t('app.viewPage') : undefined}>
            <ExternalIcon size={16} />
            <span className="sidebar__text">{t('app.viewPage')}</span>
            <span className="sidebar__tip" aria-hidden>
              {t('app.viewPage')}
            </span>
          </Link>
          <div className="sidebar__brand">
            <Link to="/" className="sidebar__product" aria-label={PRODUCT.name}>
              <ProductWordmark />
            </Link>
            {!tablet && (
              <button type="button" className="icon-btn sidebar__collapse" onClick={toggleRail} aria-label={rail ? t('app.nav.expand') : t('app.nav.collapse')} aria-pressed={rail}>
                <SidebarIcon size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="app__scroll" ref={scrollRef} onScroll={onScroll}>
        <header className="topbar" data-scrolled={scrolled || fullBleed || undefined}>
          {pinnedTitle ? (
            <h1 className="topbar__title" data-pinned>
              {t(current.key)}
            </h1>
          ) : (
            <p className="topbar__title" aria-hidden>
              {t(current.key)}
            </p>
          )}
          <span className="topbar__note">
            <PreviewNote compact />
          </span>
          <span className="topbar__spacer" />
          {showNew && (
            <button type="button" className="btn btn--primary btn--sm topbar__new" onClick={() => newAppointment()} aria-label={t('app.newAppointment')}>
              <PlusIcon /> <span className="topbar__new-label">{t('app.newAppointment')}</span>
            </button>
          )}
          <AccountMenu />
        </header>
        <DraftBanner />
        <main className="app__main" id="app-main" tabIndex={-1}>
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="appointments" element={<AppointmentsPage />} />
              <Route path="insights" element={guard(byPath('/app/insights'), <InsightsPage />)} />
              <Route path="customers" element={guard(byPath('/app/customers'), <CustomersPage />)} />
              <Route path="customers/import" element={guard(byPath('/app/customers'), <CustomersImport />)} />
              <Route path="services" element={guard(byPath('/app/services'), <ServicesAdmin />)} />
              <Route path="staff" element={guard(byPath('/app/staff'), <StaffAdmin />)} />
              <Route path="availability" element={guard(byPath('/app/availability'), <AvailabilityPage />)} />
              <Route path="settings" element={<Navigate to="/app/settings/business" replace />} />
              <Route path="settings/:section" element={guard(byPath('/app/settings'), <SettingsPage />)} />
              <Route path="*" element={<Navigate to="/app" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      <nav className="tabbar" aria-label={t('common.menu')} style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, 1fr)` }}>
        {tabs.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/app'} className="tabbar__item">
            <n.icon size={22} />
            <span>{t(n.key)}</span>
          </NavLink>
        ))}
        <button type="button" className="tabbar__item" aria-expanded={more} aria-haspopup="dialog" onClick={() => setMore(true)} data-active={!tabs.includes(current) || undefined}>
          <DotsIcon size={22} />
          <span>{t('common.more')}</span>
        </button>
      </nav>

      <Drawer open={more} onClose={() => setMore(false)} title={t('common.more')}>
        <div className="more">
          {moreItems.length > 0 && (
            <SheetGroup>
              {moreItems.map((n) => (
                <NavLink key={n.to} to={n.to} className="sheet-row">
                  <n.icon size={19} />
                  <span className="sheet-row__text">{t(n.key)}</span>
                  <ChevronRight size={14} className="sheet-row__chev" />
                </NavLink>
              ))}
            </SheetGroup>
          )}
          <SheetGroup>
            <Link to={page} target="_blank" className="sheet-row">
              <ExternalIcon size={19} />
              <span className="sheet-row__text">{t('app.viewPage')}</span>
            </Link>
            <div className="sheet-row sheet-row--static">
              <span className="sheet-row__text">{t('common.language')}</span>
              <LocaleSwitch />
            </div>
          </SheetGroup>
          <SheetGroup label={t('app.account.businesses')}>
            <BusinessList onDone={() => setMore(false)} />
          </SheetGroup>
          <MoreAccount onDone={() => setMore(false)} />
        </div>
      </Drawer>
    </div>
  );
}

function MoreAccount({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const { session } = useWorkspace();
  const navigate = useNavigate();
  return (
    <SheetGroup label={t('app.account.signedInAs')}>
      <div className="sheet-row sheet-row--static">
        <Avatar name={session.user.name} size="sm" />
        <span className="sheet-row__text">
          {session.user.name}
          <span className="sheet-row__sub ltr">{session.user.email}</span>
        </span>
      </div>
      <button
        type="button"
        className="sheet-row sheet-row--danger"
        onClick={async () => {
          onDone();
          await auth.signOut();
          navigate('/sign-in', { replace: true });
        }}
      >
        <LogOutIcon size={19} />
        <span className="sheet-row__text">{t('app.account.signOut')}</span>
      </button>
    </SheetGroup>
  );
}

/** Contextual loading: the page's own shape, not a branded spinner. */
function PageSkeleton() {
  return (
    <div className="page" aria-busy="true">
      <div className="app-head">
        <span className="sk" style={{ width: 180, height: 22 }} />
      </div>
      <div className="panel">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="list__row">
            <span className="sk" style={{ width: 44 }} />
            <span className="list__main">
              <span className="sk" style={{ width: '40%' }} />
              <span className="sk" style={{ width: '24%', height: 8, marginTop: 6 }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NoBusiness({ session }: { session: SessionInfo }) {
  useEffect(() => {
    if (!session.active && session.memberships[0]) void auth.switchBusiness(session.memberships[0].businessId);
  }, [session]);
  if (session.memberships.length) return <div className="app__loading" />;
  return <Navigate to="/onboarding" replace />;
}

export default function BusinessApp() {
  const session = auth.useSession();
  const location = useLocation();
  if (!session) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  if (!session.active) return <NoBusiness session={session} />;
  return (
    <WorkspaceProvider key={session.active.businessId} session={session} membership={session.active} fallback={<div className="app__loading" />}>
      <Routes>
        <Route
          path="page"
          element={
            <Suspense fallback={<div className="app__loading" />}>
              <PageEditor />
            </Suspense>
          }
        />
        <Route
          path="*"
          element={
            <AppUIProvider>
              <Shell />
            </AppUIProvider>
          }
        />
      </Routes>
    </WorkspaceProvider>
  );
}
