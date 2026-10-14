import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, platform, publicBooking, type PublicBooking } from '../../data';
import { forgetMyBookings, rememberBooking, savePhonePass, useMyBookingIds, usePhonePass } from '../../data/mine';
import { isUpcoming } from '../../domain/scheduling';
import { useI18n } from '../../i18n/I18nProvider';
import { callingCode, cleanPhone, telHref } from '../../lib/phone';
import { BookingTicket } from './BookingTicket';
import { usePublicTenant } from './TenantContext';

/** One subscription per remembered booking token. */
function Remembered({ token, children }: { token: string; children: (b: PublicBooking) => React.ReactNode }) {
  const tenant = usePublicTenant();
  const b = publicBooking.useBooking(tenant.slug, token);
  return b ? <>{children(b)}</> : null;
}

/** A phone number inside a sentence keeps its order in Hebrew. */
const ltr = (s: string) => `\u2066${s}\u2069`;

/** Seconds before another code can be asked for. */
const RESEND_AFTER = 30;

type FindError = 'badPhone' | 'tooMany' | 'wrong' | 'expired' | 'failed';

/** Phone number, then the code sent to it. A right code keeps the number's bookings on this device. */
function FindByPhone() {
  const { t, tx, locale } = useI18n();
  const tenant = usePublicTenant();
  const { slug, business } = tenant;
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [demoCode, setDemoCode] = useState<string>();
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<FindError | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = cleanPhone(phone, callingCode(business.timezone)) ?? phone.trim();
  const wait = Math.max(0, RESEND_AFTER - Math.floor((now - sentAt) / 1000));

  useEffect(() => {
    if (step !== 'code' || wait === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(id);
    };
  }, [step, wait]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await publicBooking.requestPhoneCode(slug, phone, locale);
      setDemoCode(r.demoCode);
      setStep('code');
      setCode('');
      setSentAt(Date.now());
      setNow(Date.now());
    } catch (e) {
      const c = e instanceof ApiError ? e.code : null;
      setError(c === 'invalid' ? 'badPhone' : c === 'rate_limited' ? 'tooMany' : 'failed');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await publicBooking.verifyPhoneCode(slug, phone, code);
      if ('error' in r) return setError(r.error);
      for (const b of r.bookings) rememberBooking(slug, b.id);
      savePhonePass(slug, { pass: r.pass, phone: shown });
    } catch {
      setError('failed');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void (step === 'phone' ? send() : verify());
  };

  return (
    <form className="mine__find" onSubmit={submit} noValidate>
      <h2 className="mine__find-title">{t('mine.find.title')}</h2>
      {step === 'phone' ? (
        <>
          <p className="muted">{t('mine.find.lede')}</p>
          <div className="field">
            <label className="field__label" htmlFor="find-phone">
              {t('mine.find.phone')}
            </label>
            <input
              id="find-phone"
              className="field__input"
              type="tel"
              dir="ltr"
              autoComplete="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setError(null);
              }}
            />
          </div>
        </>
      ) : (
        <>
          <p className="muted" role="status">
            {t('mine.find.sent', { phone: ltr(shown), business: tx(business.name) })}
          </p>
          {demoCode && <p className="mine__demo">{t('mine.find.demoCode', { code: demoCode })}</p>}
          <div className="field">
            <label className="field__label" htmlFor="find-code">
              {t('mine.find.code')}
            </label>
            <input
              id="find-code"
              className="field__input mine__code"
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ''));
                setError(null);
              }}
            />
          </div>
        </>
      )}
      {error && (
        <p className="field__error" role="alert">
          {t(`mine.find.${error}`)}
        </p>
      )}
      <button className="btn btn--ink btn--block" disabled={busy || (step === 'code' && code.length < 6)}>
        {busy && <span className="spinner" aria-hidden />}
        {t(step === 'phone' ? 'mine.find.send' : 'mine.find.verify')}
      </button>
      {step === 'code' && (
        <div className="mine__again">
          <button type="button" className="btn btn--quiet btn--sm" disabled={busy || wait > 0} onClick={() => void send()}>
            {wait > 0 ? t('mine.find.resendIn', { seconds: wait }) : t('mine.find.resend')}
          </button>
          <button
            type="button"
            className="btn btn--quiet btn--sm"
            onClick={() => {
              setStep('phone');
              setError(null);
            }}
          >
            {t('mine.find.otherNumber')}
          </button>
        </div>
      )}
    </form>
  );
}

export default function MyBookingsPage() {
  const { t, tx } = useI18n();
  const tenant = usePublicTenant();
  const { slug, business } = tenant;
  const ids = useMyBookingIds(slug);
  const pass = usePhonePass(slug);
  const info = platform.useInfo();
  const [disconnecting, setDisconnecting] = useState(false);
  const tz = business.timezone;
  const upcoming = (b: PublicBooking) => isUpcoming(b, new Date(), tz);

  // Bookings made since, from any device, show up too.
  useEffect(() => {
    if (!pass) return;
    let live = true;
    publicBooking
      .phoneBookings(slug, pass.pass)
      .then((found) => {
        if (!live) return;
        if (found === null) savePhonePass(slug, null);
        else for (const b of found) rememberBooking(slug, b.id);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [slug, pass]);

  const disconnect = async () => {
    if (!pass) return;
    setDisconnecting(true);
    await publicBooking.forgetPhone(slug, pass.pass).catch(() => undefined);
    forgetMyBookings(slug);
    setDisconnecting(false);
  };

  const list = (filter: (b: PublicBooking) => boolean) =>
    ids.map((id) => (
      <Remembered key={id} token={id}>
        {(b) =>
          filter(b) ? (
            <li>
              <BookingTicket booking={b} link />
            </li>
          ) : null
        }
      </Remembered>
    ));

  let side: React.ReactNode;
  if (pass) {
    side = (
      <div className="mine__find">
        <h2 className="mine__find-title">{t('mine.phone.title', { phone: ltr(pass.phone) })}</h2>
        <p className="muted">{t('mine.phone.body')}</p>
        <button type="button" className="btn btn--ghost btn--block" disabled={disconnecting} onClick={() => void disconnect()}>
          {disconnecting && <span className="spinner" aria-hidden />}
          {t('mine.phone.disconnect')}
        </button>
      </div>
    );
  } else if (info && !info.phoneCodes) {
    side = (
      <div className="mine__find">
        <h2 className="mine__find-title">{t('mine.find.title')}</h2>
        <p className="muted">{t('mine.find.unavailable', { business: tx(business.name) })}</p>
        {business.phone && (
          <a className="btn btn--ghost btn--block" href={telHref(business.phone)}>
            {t('mine.manage.call', { phone: business.phone })}
          </a>
        )}
      </div>
    );
  } else side = <FindByPhone />;

  return (
    <>
      <header className="page-head container">
        <h1 className="display">{t('mine.title')}</h1>
        <p className="lede">{t('mine.lede', { business: tx(business.name) })}</p>
      </header>
      <div className="container mine">
        <div className="mine__lists">
          <section aria-labelledby="up-title">
            <h2 id="up-title" className="svc-cat__title">
              {t('mine.upcoming')}
            </h2>
            <ul className="mine__list">{list(upcoming)}</ul>
            <p className="muted mine__empty">{t('mine.empty')}</p>
          </section>
          {ids.length > 0 && (
            <section className="mine__past" aria-labelledby="past-title">
              <h2 id="past-title" className="svc-cat__title">
                {t('mine.past')}
              </h2>
              <ul className="mine__list">{list((b) => !upcoming(b))}</ul>
            </section>
          )}
        </div>
        {side}
      </div>
    </>
  );
}
