import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../../data';
import { useI18n } from '../../i18n/I18nProvider';
import { AuthLayout } from './AuthLayout';
import { PasswordForm } from './PasswordForm';

function Consent() {
  const { t } = useI18n();
  return (
    <p className="auth__legal">
      {t('legal.agree', { terms: '\u0001', privacy: '\u0002' })
        .split(/([\u0001\u0002])/)
        .map((part, i) =>
          part === '\u0001' ? (
            <Link key={i} to="/terms" target="_blank">
              {t('legal.agreeTerms')}
            </Link>
          ) : part === '\u0002' ? (
            <Link key={i} to="/privacy" target="_blank">
              {t('legal.agreePrivacy')}
            </Link>
          ) : (
            part
          ),
        )}
    </p>
  );
}

export default function SignUpPage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      await auth.signUp({ name, email, locale });
      navigate('/onboarding');
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const haveAccount = (
    <p className="auth__switch">
      {t('auth.signUp.haveAccount')} <Link to="/sign-in">{t('auth.signIn.submit')}</Link>
    </p>
  );

  if (auth.method === 'password')
    return (
      <AuthLayout variant="signUp" title={t('auth.signUp.title')} lede={t('auth.signUp.lede')}>
        <PasswordForm create footer={<Consent />} />
        {haveAccount}
      </AuthLayout>
    );

  return (
    <AuthLayout variant="signUp" title={t('auth.signUp.title')} lede={t('auth.signUp.lede')}>
      <form className="auth__form" onSubmit={submit} noValidate>
        <div className="field">
          <label className="field__label" htmlFor="su-name">
            {t('auth.signUp.name')}
          </label>
          <input id="su-name" className="field__input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="su-email">
            {t('auth.signUp.email')}
          </label>
          <input
            id="su-email"
            className="field__input"
            type="email"
            autoComplete="email"
            dir="ltr"
            value={email}
            aria-invalid={error}
            aria-describedby={error ? 'su-error' : undefined}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error && (
          <p id="su-error" className="field__error" role="alert">
            {t('auth.signUp.invalid')}
          </p>
        )}
        <button className="btn btn--primary btn--block" disabled={busy}>
          {busy && <span className="spinner" aria-hidden />}
          {t('auth.signUp.submit')}
        </button>
        <Consent />
      </form>
      {haveAccount}
    </AuthLayout>
  );
}
