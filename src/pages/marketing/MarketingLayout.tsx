import { Suspense } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { PublicHeader } from '../../components/public/PublicHeader';
import { LocaleSwitch, ProductWordmark } from '../../components/ui/bits';
import { PRODUCT } from '../../config/product';
import { auth } from '../../data';
import { useI18n } from '../../i18n/I18nProvider';
import './marketing.css';

export function MarketingLayout() {
  const { t } = useI18n();
  const session = auth.useSession();
  const signedIn = !!session;
  return (
    <>
      <a href="#main" className="skip-link">
        {t('common.skipToContent')}
      </a>
      <PublicHeader
        home="/"
        brand={<ProductWordmark />}
        nav={[
          { to: '/#features', label: t('marketing.nav.features') },
          { to: '/#how', label: t('marketing.nav.how') },
          { to: '/book/demo-studio', label: t('marketing.nav.demo') },
        ]}
        action={
          <>
            <Link to={signedIn ? '/app' : '/sign-in'} className="btn btn--quiet btn--sm mk-signin">
              {signedIn ? t('app.nav.dashboard') : t('marketing.nav.signIn')}
            </Link>
            <Link to="/sign-up" className="btn btn--primary btn--sm">
              {t('marketing.nav.getStarted')}
            </Link>
          </>
        }
        sheetFoot={
          <>
            <Link to="/sign-up" className="btn btn--primary btn--lg btn--block">
              {t('marketing.cta.primary')}
            </Link>
            <Link to={signedIn ? '/app' : '/sign-in'} className="muted">
              {signedIn ? t('app.nav.dashboard') : t('marketing.nav.signIn')}
            </Link>
          </>
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
              <ProductWordmark />
              <LocaleSwitch />
            </div>
            <div className="site-footer__cols">
              <ul>
                <li>
                  <a href="/#features">{t('marketing.nav.features')}</a>
                </li>
                <li>
                  <a href="/#how">{t('marketing.nav.how')}</a>
                </li>
                <li>
                  <Link to="/book/demo-studio">{t('marketing.footer.demo')}</Link>
                </li>
                <li>
                  <Link to="/sign-in">{t('marketing.footer.workspace')}</Link>
                </li>
              </ul>
              <ul>
                <li>
                  <Link to="/help">{t('legal.help')}</Link>
                </li>
                <li>
                  <Link to="/privacy">{t('legal.privacy')}</Link>
                </li>
                <li>
                  <Link to="/terms">{t('legal.terms')}</Link>
                </li>
                <li>
                  <Link to="/accessibility">{t('legal.accessibility')}</Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="site-footer__bottom muted">
            <span>{t('marketing.footer.rights', { year: new Date().getFullYear(), product: PRODUCT.name })}</span>
            <span>{t('meta.previewBuild')}</span>
          </div>
        </div>
      </footer>
    </>
  );
}
