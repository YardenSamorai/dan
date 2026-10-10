import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowIcon } from '../../components/ui/Icons';
import { auth } from '../../data';
import { useI18n } from '../../i18n/I18nProvider';
import { AuthLayout } from './AuthLayout';

export default function SignInPage() {
  const { t, tx } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const demos = auth.demoAccounts();

  const go = async (address: string) => {
    setBusy(address);
    setError(false);
    try {
      const s = await auth.signIn(address);
      navigate(s.active ? '/app' : '/onboarding');
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) void go(email);
  };

  return (
    <AuthLayout
      title={t('auth.signIn.title')}
      lede={t('auth.signIn.lede')}
      aside={
        demos.length > 0 && (
          <section className="auth__demo" aria-labelledby="demo-title">
            <h2 id="demo-title" className="auth__demo-title">
              {t('auth.demo.title')}
            </h2>
            <p className="muted">{t('auth.demo.lede')}</p>
            <ul className="auth__demo-list">
              {demos.map(({ user, label }) => (
                <li key={user.id}>
                  <button type="button" className="auth__account" onClick={() => go(user.email)} disabled={!!busy}>
                    <span className="auth__account-main">
                      <strong>{tx(label.businessName)}</strong>
                      <span className="muted">
                        {user.name} · {t(`roles.${label.role}`)} · {label.staffCount <= 1 ? t('auth.demo.solo') : t('auth.demo.team', { count: label.staffCount })}
                      </span>
                    </span>
                    {busy === user.email ? <span className="spinner" aria-hidden /> : <ArrowIcon />}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      }
    >
      <form className="auth__form" onSubmit={submit} noValidate>
        <div className="field">
          <label className="field__label" htmlFor="si-email">
            {t('auth.signIn.email')}
          </label>
          <input
            id="si-email"
            className="field__input"
            type="email"
            autoComplete="email"
            dir="ltr"
            value={email}
            aria-invalid={error}
            aria-describedby={error ? 'si-error' : undefined}
            onChange={(e) => (setEmail(e.target.value), setError(false))}
          />
          {error && (
            <p id="si-error" className="field__error" role="alert">
              {t('auth.signIn.notFound')}
            </p>
          )}
        </div>
        <button className="btn btn--ink btn--block" disabled={!!busy}>
          {busy === email && <span className="spinner" aria-hidden />}
          {t('auth.signIn.submit')}
        </button>
      </form>
      <p className="auth__switch">
        {t('auth.signIn.noAccount')} <Link to="/sign-up">{t('auth.signIn.create')}</Link>
      </p>
    </AuthLayout>
  );
}
