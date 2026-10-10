import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LocaleSwitch, ProductWordmark } from '../../components/ui/bits';
import { useI18n } from '../../i18n/I18nProvider';
import './auth.css';

export function AuthLayout({ title, lede, children, aside }: { title: string; lede: string; children: ReactNode; aside?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="auth">
      <header className="auth__top">
        <Link to="/" aria-label={t('notFound.home')}>
          <ProductWordmark />
        </Link>
        <LocaleSwitch />
      </header>
      <main className="auth__main" id="main">
        <section className="auth__card">
          <h1 className="display auth__title">{title}</h1>
          <p className="auth__lede">{lede}</p>
          {children}
          <p className="auth__mock" role="note">
            {t('auth.mockNotice')}
          </p>
        </section>
        {aside}
      </main>
    </div>
  );
}
