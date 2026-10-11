import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { BusinessMark } from '../../components/ui/Icons';
import { useToast } from '../../components/ui/Toast';
import { ApiError, auth, invites, type InvitePreview } from '../../data';
import { useI18n } from '../../i18n/I18nProvider';
import { AuthLayout } from './AuthLayout';
import { withNext } from './next';

/** /join/:slug/:token — a team invite. Sign in or create an account, then join with one tap. */
export default function JoinPage() {
  const { slug = '', token = '' } = useParams();
  const { t, tx } = useI18n();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const session = auth.useSession();
  const [preview, setPreview] = useState<InvitePreview | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    invites
      .peek(slug, token)
      .then((p) => {
        if (live) setPreview(p);
      })
      .catch(() => {
        if (live) setPreview(null);
      });
    return () => {
      live = false;
    };
  }, [slug, token]);

  const join = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await invites.accept(slug, token);
      toast(t('join.joined', { business: preview ? tx(preview.businessName) : '' }));
      navigate('/app', { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_found') setPreview(null);
      else setFailed(true);
      setBusy(false);
    }
  };

  if (preview === undefined)
    return (
      <AuthLayout variant="signUp" title={t('join.loading')} lede="">
        <span className="spinner" aria-hidden />
      </AuthLayout>
    );

  if (preview === null)
    return (
      <AuthLayout variant="signUp" title={t('join.deadTitle')} lede={t('join.deadBody')}>
        <p className="auth__switch">
          <Link to="/">{t('notFound.home')}</Link>
        </p>
      </AuthLayout>
    );

  const business = tx(preview.businessName);
  const what = preview.role === 'manager' ? t('join.asManager') : t('join.asStaff', { name: preview.staffName ? tx(preview.staffName) : '' });

  return (
    <AuthLayout variant="signUp" title={t('join.title', { business })} lede={what}>
      <div className="join__mark" data-accent={preview.branding.accent}>
        <BusinessMark name={business} logoUrl={preview.branding.logoUrl} className="biz-mark--xl" />
      </div>
      {session ? (
        <div className="auth__form">
          <p className="auth__hint">{t('join.signedInAs', { email: `\u2068${session.user.email}\u2069` })}</p>
          {failed && (
            <p className="auth__error" role="alert">
              {t('common.unknownError')}
            </p>
          )}
          <button type="button" className="btn btn--primary btn--block auth__submit" disabled={busy} onClick={join}>
            {busy && <span className="spinner" aria-hidden />}
            {t('join.accept', { business })}
          </button>
          <p className="auth__hint">
            {t('join.notYou')}{' '}
            <button type="button" className="auth__link" disabled={busy} onClick={() => void auth.signOut()}>
              {t('app.account.signOut')}
            </button>
          </p>
        </div>
      ) : (
        <div className="auth__form">
          <Link to={withNext('/sign-up', pathname)} className="btn btn--primary btn--block auth__submit">
            {t('join.create')}
          </Link>
          <Link to={withNext('/sign-in', pathname)} className="btn btn--ghost btn--block">
            {t('join.signIn')}
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
