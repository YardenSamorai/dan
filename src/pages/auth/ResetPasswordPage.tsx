import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { EyeIcon, EyeOffIcon } from '../../components/ui/Icons';
import { useToast } from '../../components/ui/Toast';
import { ApiError, auth } from '../../data';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/messages';
import { AuthField, AuthFields } from './AuthField';
import { AuthLayout } from './AuthLayout';
import { useNext, withNext } from './next';
import { EMAIL, MIN_PASSWORD } from './PasswordForm';

/** Forgot password: an emailed code, typed here, then a new password. Works whichever device reads the email. */
export default function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const next = useNext();
  const { state } = useLocation() as { state: { email?: string } | null };
  const [email, setEmail] = useState(state?.email ?? '');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setErrorKey] = useState<MessageKey | null>(null);
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);

  if (auth.method !== 'password') return <Navigate to="/sign-in" replace />;

  const setError = (key: MessageKey) => {
    setErrorKey(key);
    setShake((s) => s + 1);
  };
  const failed = (err: unknown) => {
    const code = err instanceof ApiError ? err.code : 'server';
    setError(
      code === 'rate_limited'
        ? 'auth.reset.rateLimited'
        : code === 'invalid'
          ? 'auth.reset.codeWrong'
          : code === 'policy'
            ? 'auth.reset.weak'
            : 'common.unknownError',
    );
  };

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!EMAIL.test(email.trim())) return setError('auth.password.emailInvalid');
    setBusy(true);
    setErrorKey(null);
    try {
      await auth.requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      failed(err);
    }
    setBusy(false);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6,10}$/.test(code.replace(/\s/g, ''))) return setError('auth.reset.codeMissing');
    if (password.length < MIN_PASSWORD) return setError('auth.password.tooShort');
    setBusy(true);
    setErrorKey(null);
    try {
      const s = await auth.resetPassword({ email, code, password });
      toast(t('auth.reset.done'));
      navigate(next ?? (s.active ? '/app' : '/onboarding'), { replace: true });
    } catch (err) {
      failed(err);
      setBusy(false);
    }
  };

  const clear = () => setErrorKey(null);

  return (
    <AuthLayout variant="signIn" title={t('auth.reset.title')} lede={sent ? t('auth.reset.sentLede', { email: email.trim() }) : t('auth.reset.lede')}>
      {!sent ? (
        <form className="auth__form" onSubmit={send} noValidate>
          <AuthFields shake={shake}>
            <AuthField
              id="rp-email"
              label={t('auth.signIn.email')}
              type="email"
              autoComplete="username"
              dir="ltr"
              value={email}
              invalid={error === 'auth.password.emailInvalid'}
              onChange={(e) => (setEmail(e.target.value), clear())}
            />
          </AuthFields>
          {error && (
            <p className="auth__error" role="alert">
              {t(error)}
            </p>
          )}
          <button className="btn btn--ink btn--block auth__submit" disabled={busy}>
            {busy && <span className="spinner" aria-hidden />}
            {t('auth.reset.send')}
          </button>
        </form>
      ) : (
        <form className="auth__form" onSubmit={save} noValidate>
          <AuthFields shake={shake}>
            <AuthField
              id="rp-code"
              label={t('auth.reset.code')}
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              maxLength={12}
              value={code}
              invalid={error === 'auth.reset.codeMissing' || error === 'auth.reset.codeWrong'}
              onChange={(e) => (setCode(e.target.value), clear())}
            />
            <AuthField
              id="rp-password"
              label={t('auth.reset.newPassword')}
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              dir="ltr"
              value={password}
              invalid={error === 'auth.password.tooShort' || error === 'auth.reset.weak'}
              aria-describedby="rp-hint"
              onChange={(e) => (setPassword(e.target.value), clear())}
              trailing={
                <button type="button" className="af__reveal" onClick={() => setShow((s) => !s)} aria-label={show ? t('auth.password.hide') : t('auth.password.show')} aria-pressed={show}>
                  {show ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
                </button>
              }
            />
          </AuthFields>
          <p id="rp-hint" className="auth__hint">
            {t('auth.password.hint', { count: MIN_PASSWORD })}
          </p>
          {error && (
            <p className="auth__error" role="alert">
              {t(error)}
            </p>
          )}
          <button className="btn btn--ink btn--block auth__submit" disabled={busy}>
            {busy && <span className="spinner" aria-hidden />}
            {t('auth.reset.save')}
          </button>
          <p className="auth__hint">
            {t('auth.reset.noEmail')}{' '}
            <button type="button" className="auth__link" disabled={busy} onClick={() => (setCode(''), void send())}>
              {t('auth.reset.resend')}
            </button>
          </p>
        </form>
      )}
      <p className="auth__switch">
        <Link to={withNext('/sign-in', next)}>{t('auth.reset.back')}</Link>
      </p>
    </AuthLayout>
  );
}
