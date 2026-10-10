import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
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

/** Product-level pages; tenant pages and /app set their own titles. */
function useProductTitle() {
  const { pathname } = useLocation();
  const { t } = useI18n();
  useEffect(() => {
    if (pathname.startsWith('/book/') || pathname.startsWith('/app')) return;
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

export function App() {
  useProductTitle();
  return (
    <ToastProvider>
      <ScrollReset />
      <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
        <Routes>
          <Route element={<MarketingLayout />}>
            <Route index element={<MarketingHome />} />
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
    </ToastProvider>
  );
}
