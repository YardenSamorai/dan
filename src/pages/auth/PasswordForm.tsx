import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EyeIcon, EyeOffIcon } from '../../components/ui/Icons';
import { ApiError, auth } from '../../data';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/messages';
import { AuthField, AuthFields } from './AuthField';
import { useNext, withNext } from './next';

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD = 8;

/** Email + password sign-in / sign-up, or continue with Google. */
export function PasswordForm({ create, footer }: { create: boolean; footer?: ReactNode }) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const next = useNext();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setErrorKey] = useState<MessageKey | null>(null);
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const p = (k: string) => `${create ? 'pf-up' : 'pf-in'}-${k}`;
  const setError = (key: MessageKey | null) => {
    setErrorKey(key);
    if (key) setShake((s) => s + 1);
  };
  const strong = password.length >= MIN_PASSWORD;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (create && !name.trim()) return setError('auth.password.nameMissing');
    if (!EMAIL.test(email.trim())) return setError('auth.password.emailInvalid');
    if (create && password.length < MIN_PASSWORD) return setError('auth.password.tooShort');
    if (!password) return setError('auth.password.passwordMissing');
    setBusy(true);
    setErrorKey(null);
    try {
      if (create) {
        await auth.signUpWithPassword({ name: name.trim(), email, password, locale });
        navigate(next ?? '/onboarding');
      } else {
        const s = await auth.signInWithPassword({ email, password });
        navigate(next ?? (s.active ? '/app' : '/onboarding'));
      }
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'server';
      setError(
        code === 'exists'
          ? 'auth.password.exists'
          : code === 'rate_limited'
            ? 'auth.password.rateLimited'
            : code === 'invalid'
              ? create
                ? 'auth.password.emailInvalid'
                : 'auth.password.wrong'
              : 'common.unknownError',
      );
      setBusy(false);
    }
  };

  const clear = () => setErrorKey(null);

  return (
    <>
      {auth.providers.google && (
        <>
          <button type="button" className="btn btn--ghost btn--block auth__google" onClick={() => void auth.signInWithGoogle(next ?? (create ? '/onboarding' : '/app')).catch(() => setError('common.unknownError'))}>
            <GoogleMark /> {t('auth.password.google')}
          </button>
          <p className="auth__or">{t('auth.password.or')}</p>
        </>
      )}
      <form className="auth__form" onSubmit={submit} noValidate>
        <AuthFields shake={shake}>
          {create && (
            <AuthField
              id={p('name')}
              label={t('auth.signUp.name')}
              autoComplete="name"
              value={name}
              invalid={error === 'auth.password.nameMissing'}
              onChange={(e) => (setName(e.target.value), clear())}
            />
          )}
          <AuthField
            id={p('email')}
            label={t('auth.signIn.email')}
            type="email"
            autoComplete={create ? 'email' : 'username'}
            dir="ltr"
            value={email}
            invalid={error === 'auth.password.emailInvalid'}
            onChange={(e) => (setEmail(e.target.value), clear())}
          />
          <AuthField
            id={p('password')}
            label={t('auth.password.password')}
            type={show ? 'text' : 'password'}
            autoComplete={create ? 'new-password' : 'current-password'}
            dir="ltr"
            value={password}
            invalid={error === 'auth.password.tooShort' || error === 'auth.password.passwordMissing' || error === 'auth.password.wrong'}
            aria-describedby={create ? p('hint') : undefined}
            onChange={(e) => (setPassword(e.target.value), clear())}
            trailing={
              <button type="button" className="af__reveal" onClick={() => setShow((s) => !s)} aria-label={show ? t('auth.password.hide') : t('auth.password.show')} aria-pressed={show}>
                {show ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
              </button>
            }
          />
        </AuthFields>
        {!create && (
          <Link to={withNext('/reset-password', next)} state={{ email: email.trim() }} className="auth__forgot">
            {t('auth.reset.forgot')}
          </Link>
        )}
        {create && (
          <div className="af-meter" data-ok={strong || undefined}>
            <span className="af-meter__track">
              <i style={{ '--p': Math.min(password.length / MIN_PASSWORD, 1) } as CSSProperties} />
            </span>
            <p id={p('hint')} className="af-meter__text">
              {strong && <CheckMark />}
              {t('auth.password.hint', { count: MIN_PASSWORD })}
            </p>
          </div>
        )}
        {error && (
          <p className="auth__error" role="alert">
            {t(error)}{' '}
            {error === 'auth.password.exists' && <Link to={withNext('/sign-in', next)}>{t('auth.signIn.submit')}</Link>}
          </p>
        )}
        <button className={`btn btn--block auth__submit ${create ? 'btn--primary' : 'btn--ink'}`} disabled={busy}>
          {busy && <span className="spinner" aria-hidden />}
          {create ? t('auth.signUp.submit') : t('auth.signIn.submit')}
        </button>
        {footer}
      </form>
    </>
  );
}

function CheckMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
