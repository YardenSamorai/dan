import { lazy, Suspense, useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ToastProvider } from './components/ui/Toast';
import { PRODUCT } from './config/product';
import { useI18n } from './i18n/I18nProvider';
import { MarketingLayout } from './pages/marketing/MarketingLayout';
import MarketingHome from './pages/marketing/MarketingHome';
import { TenantChrome, TenantScope } from './pages/booking/TenantLayout';

const SignInPage = lazy(() => import('./pages/auth/SignInPage'));
const SignUpPage = lazy(() => import('./pages/auth/SignUpPage'));
const OnboardingPage = lazy(() => import('./pages/onboarding/OnboardingPage'));
const TenantHome = lazy(() => import('./pages/booking/TenantHome'));
const BookFlowPage = lazy(() => import('./pages/booking/BookFlowPage'));
const ConfirmedPage = lazy(() => import('./pages/booking/ConfirmedPage'));
const MyBookingsPage = lazy(() => import('./pages/booking/MyBookingsPage'));
const ManageBookingPage = lazy(() => import('./pages/booking/ManageBookingPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const BusinessApp = lazy(() => import('./app/BusinessApp'));
const HelpPage = lazy(() => import('./pages/info/InfoPages'));
const PrivacyPage = lazy(() => import('./pages/info/InfoPages').then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('./pages/info/InfoPages').then((m) => ({ default: m.TermsPage })));
const AccessibilityPage = lazy(() => import('./pages/info/InfoPages').then((m) => ({ default: m.AccessibilityPage })));

const INFO_PAGES = /^\/(help|privacy|terms|accessibility)\b/;

/** Product-level pages; tenant pages, /app and the info pages set their own titles. */
function useProductTitle() {
  const { pathname } = useLocation();
  const { t } = useI18n();
  useEffect(() => {
    if (pathname.startsWith('/book/') || pathname.startsWith('/app') || INFO_PAGES.test(pathname)) return;
    const page = pathname.startsWith('/sign-in')
      ? t('auth.signIn.title')
      : pathname.startsWith('/sign-up')
        ? t('auth.signUp.title')
        : pathname.startsWith('/onboarding')
          ? t('onboarding.title')
          : null;
    document.title = page ? `${page} · ${PRODUCT.name}` : `${PRODUCT.name} · ${t('marketing.cta.primary')}`;
  }, [pathname, t]);
}

function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Blank for quick loads; a spinner only when the page is slow to arrive. */
function PageLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 400);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--ink-3)' }} aria-busy="true">
      {slow && <span className="spinner" style={{ width: 22, height: 22 }} />}
    </div>
  );
}

export function App() {
  useProductTitle();
  const { pathname } = useLocation();
  return (
    <ToastProvider>
      <ScrollReset />
      <ErrorBoundary resetKey={pathname}>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route element={<MarketingLayout />}>
              <Route index element={<MarketingHome />} />
              <Route path="help" element={<HelpPage />} />
              <Route path="privacy" element={<PrivacyPage />} />
              <Route path="terms" element={<TermsPage />} />
              <Route path="accessibility" element={<AccessibilityPage />} />
            </Route>
            <Route path="sign-in" element={<SignInPage />} />
            <Route path="sign-up" element={<SignUpPage />} />
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route path="book/:businessSlug" element={<TenantScope />}>
              <Route path="new" element={<BookFlowPage />} />
              <Route element={<TenantChrome />}>
                <Route index element={<TenantHome />} />
                <Route path="confirmed/:id" element={<ConfirmedPage />} />
                <Route path="bookings" element={<MyBookingsPage />} />
                <Route path="bookings/:id" element={<ManageBookingPage />} />
              </Route>
            </Route>
            <Route path="app/*" element={<BusinessApp />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </ToastProvider>
  );
}
