import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowBackIcon, CloseIcon, EyeIcon, EyeOffIcon, MailIcon } from '../../components/ui/Icons';
import { useToast } from '../../components/ui/Toast';
import { ApiError, auth } from '../../data';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/messages';
import { AuthField, AuthFields } from './AuthField';
import { AuthLayout } from './AuthLayout';
import { CodeInput } from './CodeInput';
import { useNext, withNext } from './next';
import { EMAIL, MIN_PASSWORD } from './PasswordForm';

/** Must match Supabase › Authentication › Sign In / Providers › Email › Email OTP Length. */
const CODE_LENGTH = 6;
const RESEND_AFTER_S = 30;

type Step = 'code' | 'password';

/** Forgot password: an emailed code, typed in a dialog over the page, then a new password. Works whichever device reads the email. */
export default function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const next = useNext();
  const { state } = useLocation() as { state: { email?: string } | null };
  const [email, setEmail] = useState(state?.email ?? '');
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setErrorKey] = useState<MessageKey | null>(null);
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const dialog = useRef<HTMLDialogElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Native autofocus doesn't survive React mounting the content before showModal().
  useEffect(() => {
    if (open) requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus());
  }, [open, step]);

  useEffect(() => {
    if (!open || resendAt <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open, resendAt]);

  if (auth.method !== 'password') return <Navigate to="/sign-in" replace />;

  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const setError = (key: MessageKey) => {
    setErrorKey(key);
    setShake((s) => s + 1);
  };
  const failed = (err: unknown) => {
    const kind = err instanceof ApiError ? err.code : 'server';
    if (kind === 'invalid') {
      setStep('code');
      setCode('');
    }
    setError(kind === 'rate_limited' ? 'auth.reset.rateLimited' : kind === 'invalid' ? 'auth.reset.codeWrong' : kind === 'policy' ? 'auth.reset.weak' : 'common.unknownError');
  };

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!EMAIL.test(email.trim())) return setError('auth.password.emailInvalid');
    setBusy(true);
    setErrorKey(null);
    try {
      await auth.requestPasswordReset(email);
      setSent(true);
      setCode('');
      setStep('code');
      setResendAt(Date.now() + RESEND_AFTER_S * 1000);
      setNow(Date.now());
      setOpen(true);
    } catch (err) {
      failed(err);
    }
    setBusy(false);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
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
  const close = () => {
    setOpen(false);
    setErrorKey(null);
  };
  const changeEmail = () => {
    close();
    setSent(false);
    requestAnimationFrame(() => emailInput.current?.select());
  };

  const address = <bdi dir="ltr">{email.trim()}</bdi>;

  return (
    <AuthLayout variant="signIn" title={t('auth.reset.title')} lede={t('auth.reset.lede')}>
      <form className="auth__form" onSubmit={send} noValidate>
        <AuthFields shake={open ? 0 : shake}>
          <AuthField
            ref={emailInput}
            id="rp-email"
            label={t('auth.signIn.email')}
            type="email"
            autoComplete="username"
            dir="ltr"
            value={email}
            invalid={!open && error === 'auth.password.emailInvalid'}
            onChange={(e) => (setEmail(e.target.value), clear(), setSent(false))}
          />
        </AuthFields>
        {error && !open && (
          <p className="auth__error" role="alert">
            {t(error)}
          </p>
        )}
        <button className="btn btn--ink btn--block auth__submit" disabled={busy}>
          {busy && !open && <span className="spinner" aria-hidden />}
          {t('auth.reset.send')}
        </button>
        {sent && !open && (
          <p className="auth__hint">
            <button type="button" className="auth__link" onClick={() => setOpen(true)}>
              {t('auth.reset.haveCode')}
            </button>
          </p>
        )}
      </form>
      <p className="auth__switch">
        <Link to={withNext('/sign-in', next)}>{t('auth.reset.back')}</Link>
      </p>

      <dialog
        ref={dialog}
        className="dialog code-dialog"
        aria-labelledby="code-dialog-title"
        onCancel={(e) => (e.preventDefault(), close())}
        onClick={(e) => e.target === e.currentTarget && !busy && close()}
      >
        {open && (
          <div className="code-dialog__step" key={step}>
            <button type="button" className="code-dialog__close" onClick={close} aria-label={t('common.close')}>
              <CloseIcon size={16} />
            </button>
            <span className="code-dialog__badge" aria-hidden>
              <MailIcon size={22} />
            </span>

            {step === 'code' ? (
              <>
                <h2 id="code-dialog-title" className="code-dialog__title">
                  {t('auth.reset.dialogTitle')}
                </h2>
                <p className="code-dialog__lede">
                  {t('auth.reset.dialogLede', { count: CODE_LENGTH })}
                  <br />
                  <b>{address}</b>
                </p>
                <CodeInput
                  id="rp-code"
                  length={CODE_LENGTH}
                  value={code}
                  label={t('auth.reset.code')}
                  invalid={error === 'auth.reset.codeWrong'}
                  shake={shake}
                  onChange={(v) => (setCode(v), clear())}
                  onComplete={() => setTimeout(() => setStep('password'), 160)}
                />
                {error && (
                  <p className="auth__error" role="alert">
                    {t(error)}
                  </p>
                )}
                <p className="code-dialog__foot">
                  {t('auth.reset.noEmail')}{' '}
                  {wait > 0 ? (
                    <span className="code-dialog__wait">{t('auth.reset.resendIn', { seconds: wait })}</span>
                  ) : (
                    <button type="button" className="auth__link" disabled={busy} onClick={() => void send()}>
                      {t('auth.reset.resend')}
                    </button>
                  )}
                </p>
                <p className="code-dialog__foot">
                  <button type="button" className="auth__link code-dialog__quiet" onClick={changeEmail}>
                    {t('auth.reset.changeEmail')}
                  </button>
                </p>
              </>
            ) : (
              <form onSubmit={save} noValidate>
                <h2 id="code-dialog-title" className="code-dialog__title">
                  {t('auth.reset.passwordTitle')}
                </h2>
                <p className="code-dialog__lede">{t('auth.reset.passwordLede')}</p>
                <AuthFields shake={shake}>
                  <AuthField
                    id="rp-password"
                    data-autofocus
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
                <p id="rp-hint" className="auth__hint code-dialog__hint">
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
                <p className="code-dialog__foot">
                  <button type="button" className="auth__link code-dialog__quiet" onClick={() => (setStep('code'), clear())}>
                    <ArrowBackIcon size={14} /> {t('auth.reset.editCode')}
                  </button>
                </p>
              </form>
            )}
          </div>
        )}
      </dialog>
    </AuthLayout>
  );
}
