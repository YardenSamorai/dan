import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, publicBooking, type PublicBooking } from '../../data';
import { rememberBooking, useMyBookingIds } from '../../data/mine';
import { isUpcoming } from '../../domain/scheduling';
import { useI18n } from '../../i18n/I18nProvider';
import { BookingTicket } from './BookingTicket';
import { usePublicTenant } from './TenantContext';

/** One subscription per remembered booking token. */
function Remembered({ token, children }: { token: string; children: (b: PublicBooking) => React.ReactNode }) {
  const tenant = usePublicTenant();
  const b = publicBooking.useBooking(tenant.slug, token);
  return b ? <>{children(b)}</> : null;
}

export default function MyBookingsPage() {
  const { t, tx } = useI18n();
  const tenant = usePublicTenant();
  const ids = useMyBookingIds(tenant.slug);
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [proof, setProof] = useState('');
  const [error, setError] = useState<'notFound' | 'tooMany' | null>(null);
  const [foundCount, setFoundCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const tz = tenant.business.timezone;
  const upcoming = (b: PublicBooking) => isUpcoming(b, new Date(), tz);

  const find = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFoundCount(0);
    const found = await publicBooking.findBookings(tenant.slug, phone, proof).catch((err) => (err instanceof ApiError && err.code === 'rate_limited' ? 'tooMany' : null));
    setBusy(false);
    if (found === 'tooMany') return setError('tooMany');
    if (!found?.length) return setError('notFound');
    for (const b of found) rememberBooking(tenant.slug, b.id);
    if (found.length === 1) return navigate(`${tenant.base}/bookings/${found[0].id}`);
    setFoundCount(found.length);
  };
  const edit = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value);
    setError(null);
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

  return (
    <>
      <header className="page-head container">
        <h1 className="display">{t('mine.title')}</h1>
        <p className="lede">{t('mine.lede', { business: tx(tenant.business.name) })}</p>
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
        <form className="mine__find" onSubmit={find} noValidate>
          <h2 className="mine__find-title">{t('mine.find.title')}</h2>
          <p className="muted">{t('mine.find.lede')}</p>
          <div className="field">
            <label className="field__label" htmlFor="find-phone">
              {t('mine.find.phone')}
            </label>
            <input id="find-phone" className="field__input" type="tel" dir="ltr" autoComplete="tel" value={phone} onChange={edit(setPhone)} />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="find-proof">
              {t('mine.find.proof')}
            </label>
            <input id="find-proof" className="field__input" autoComplete="given-name" aria-describedby="find-proof-hint" value={proof} onChange={edit(setProof)} />
            <p id="find-proof-hint" className="field__hint">
              {t('mine.find.proofHint')}
            </p>
          </div>
          {error && (
            <p className="field__error" role="alert">
              {t(`mine.find.${error}`)}
            </p>
          )}
          {foundCount > 0 && (
            <p className="mine__found" role="status">
              {t('mine.find.found', { count: foundCount })}
            </p>
          )}
          <button className="btn btn--ink btn--block" disabled={busy}>
            {busy && <span className="spinner" aria-hidden />}
            {t('mine.find.submit')}
          </button>
        </form>
      </div>
    </>
  );
}
