import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { DateStrip, type StripDay } from '../../components/booking/DateStrip';
import { SlotPicker } from '../../components/booking/SlotPicker';
import { CheckIcon, ClockIcon, CloseIcon, PlusIcon } from '../../components/ui/Icons';
import { BusinessWordmark, StaffAvatar } from '../../components/ui/bits';
import { storageKey } from '../../config/product';
import { ApiError, publicBooking, type PublicSession } from '../../data';
import { rememberBooking } from '../../data/mine';
import { isClass, termsRange } from '../../domain/scheduling';
import type { ISODate, Minutes } from '../../domain/types';
import { useI18n, type I18n } from '../../i18n/I18nProvider';
import { usePublicTenant, type PublicTenant } from './TenantContext';
import '../../components/booking/booking.css';

interface Draft {
  serviceId?: string;
  addOnIds: string[];
  /** '' = not chosen yet (when "anyone available" isn't offered). */
  staffId: string;
  date?: ISODate;
  start?: Minutes;
  /** Group class services pick a session instead of a time. */
  sessionId?: string;
  name: string;
  phone: string;
  email: string;
  note: string;
}

type Errors = Partial<Record<'name' | 'phone' | 'email', string>>;
type StepKey = 'service' | 'time' | 'details' | 'review';
const STEPS: StepKey[] = ['service', 'time', 'details', 'review'];
const idx = (k: StepKey) => STEPS.indexOf(k);

const draftKey = (slug: string) => storageKey(`draft.${slug}`);

function loadDraft(slug: string, fallbackStaff: string): Draft {
  const empty: Draft = { addOnIds: [], staffId: fallbackStaff, name: '', phone: '', email: '', note: '' };
  try {
    return { ...empty, ...JSON.parse(sessionStorage.getItem(draftKey(slug)) ?? '{}') };
  } catch {
    return empty;
  }
}

function validate(d: Draft, requireEmail: boolean, t: I18n['t']): Errors {
  const e: Errors = {};
  if (d.name.trim().length < 2) e.name = t('booking.details.errors.name');
  if (d.phone.replace(/\D/g, '').length < 9) e.phone = t('booking.details.errors.phone');
  if ((requireEmail || d.email) && !/^\S+@\S+\.\S+$/.test(d.email)) e.email = t('booking.details.errors.email');
  return e;
}

type Span = [number, number];

function chosenSession(tenant: PublicTenant, d: Draft): PublicSession | undefined {
  const s = d.serviceId ? tenant.service(d.serviceId) : undefined;
  if (!s || !isClass(s) || !d.sessionId) return undefined;
  return tenant.sessions(s.id).find((x) => x.id === d.sessionId);
}

/**
 * Who the booking is with. The saved choice only counts while it still fits
 * the service; a service done by one person needs no choice at all.
 */
function staffFor(tenant: PublicTenant, d: Draft): { staffId: string; options: string[] } {
  const { business } = tenant;
  if (tenant.solo) return { staffId: business.staff[0]?.id ?? '', options: [] };
  const s = d.serviceId ? tenant.service(d.serviceId) : undefined;
  if (!s || isClass(s)) return { staffId: d.staffId, options: [] };
  const people = s.staffIds.filter((id) => tenant.staff(id));
  const options = [...(business.policies.allowAnyStaff && people.length > 1 ? ['any'] : []), ...people];
  const staffId = options.includes(d.staffId) ? d.staffId : options.length === 1 ? options[0] : business.policies.allowAnyStaff ? 'any' : '';
  return { staffId, options: options.length > 1 ? options : [] };
}

/** Until a specific person is chosen, duration and price span everyone who could take it. */
function totals(tenant: PublicTenant, d: Draft, staffId: string) {
  const s = d.serviceId ? tenant.service(d.serviceId) : undefined;
  const session = chosenSession(tenant, d);
  if (s && isClass(s)) {
    const r = termsRange(s);
    const duration: Span = session ? [session.duration, session.duration] : r.duration;
    const price: Span = session ? [session.price, session.price] : r.price;
    return { service: s, base: price, duration, price };
  }
  const extras = d.addOnIds.map((id) => tenant.addOn(id)).filter((a) => !!a);
  const xd = extras.reduce((m, a) => m + a!.duration, 0);
  const xp = extras.reduce((m, a) => m + a!.price, 0);
  const who = staffId && staffId !== 'any' ? [staffId] : s?.staffIds ?? [];
  const r = s ? termsRange(s, who) : { duration: [0, 0] as Span, price: [0, 0] as Span };
  return {
    service: s,
    base: r.price,
    duration: [r.duration[0] + xd, r.duration[1] + xd] as Span,
    price: [r.price[0] + xp, r.price[1] + xp] as Span,
  };
}

/** Date and start of the chosen time or class, once there is one. */
function whenOf(tenant: PublicTenant, d: Draft): { date: ISODate; start: Minutes } | undefined {
  const session = chosenSession(tenant, d);
  if (session) return { date: session.date, start: session.start };
  return d.date && d.start !== undefined ? { date: d.date, start: d.start } : undefined;
}

export default function BookFlowPage() {
  const i18n = useI18n();
  const { t, tx, fmt, locale } = i18n;
  const tenant = usePublicTenant();
  const { business, slug, base } = tenant;
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const anyAllowed = business.policies.allowAnyStaff;

  const [draft, setDraft] = useState<Draft>(() => {
    const d = loadDraft(slug, anyAllowed ? 'any' : '');
    const service = params.get('service');
    const staff = params.get('staff');
    const date = params.get('date');
    const time = params.get('time');
    const session = params.get('session');
    if (d.serviceId && !tenant.service(d.serviceId)) d.serviceId = undefined;
    if (service && tenant.service(service)) {
      if (service !== d.serviceId) {
        d.addOnIds = [];
        d.sessionId = undefined;
      }
      d.serviceId = service;
    }
    if (session) d.sessionId = session;
    if (staff && ((staff === 'any' && anyAllowed) || tenant.staff(staff))) d.staffId = staff;
    if (date) d.date = date;
    if (time && !Number.isNaN(Number(time))) d.start = Number(time);
    return d;
  });
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [waited, setWaited] = useState<{ position: number; session: PublicSession } | null>(null);

  const cls = isClass(draft.serviceId ? tenant.service(draft.serviceId) : undefined);
  const { staffId } = staffFor(tenant, draft);
  const session = chosenSession(tenant, draft);
  const waiting = session?.block === 'full';

  const timeOk = useMemo(() => {
    if (cls) return !!session && (!session.block || session.block === 'full');
    if (!draft.serviceId || !staffId || !draft.date || draft.start === undefined) return false;
    return tenant.slots({ serviceId: draft.serviceId, addOnIds: draft.addOnIds, staffId, date: draft.date }).some((x) => x.start === draft.start);
  }, [tenant, cls, session, draft.serviceId, draft.addOnIds, staffId, draft.date, draft.start]);

  const detailsOk = Object.keys(validate(draft, business.policies.requireEmail, t)).length === 0;
  const maxStep = !draft.serviceId ? 0 : !timeOk ? idx('time') : !detailsOk ? idx('details') : idx('review');

  useEffect(() => {
    if (params.has('step')) return;
    setParams({ step: String(!draft.serviceId ? 0 : timeOk ? idx('details') : idx('time')) }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sessionStorage.setItem(draftKey(slug), JSON.stringify(draft));
  }, [draft, slug]);

  const requested = Number(params.get('step') ?? 0);
  const step = Math.max(0, Math.min(Number.isFinite(requested) ? requested : 0, maxStep));
  const key = STEPS[step];

  const prevStep = useRef(step);
  const firstRender = useRef(true);
  useLayoutEffect(() => {
    if (prevStep.current !== step) window.scrollTo(0, 0);
    prevStep.current = step;
  }, [step]);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    document.getElementById('step-title')?.focus({ preventScroll: true });
  }, [step]);

  const update = useCallback((patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[k as keyof Errors];
      return next;
    });
  }, []);

  const goTo = useCallback((n: number) => setParams({ step: String(n) }), [setParams]);
  const manual = business.policies.confirmationMode === 'manual';

  const customer = () => ({ name: draft.name.trim(), phone: draft.phone.trim(), email: draft.email.trim() || undefined, note: draft.note.trim(), locale });

  const join = async () => {
    if (!session) return;
    setSubmitting(true);
    setNotice(null);
    const input = { sessionId: session.id, customer: customer() };
    try {
      if (waiting) {
        const r = await publicBooking.joinWaitlist(slug, input);
        sessionStorage.removeItem(draftKey(slug));
        setSubmitting(false);
        setWaited({ position: r.position, session });
        window.scrollTo(0, 0);
        return;
      }
      const b = await publicBooking.joinSession(slug, input);
      rememberBooking(slug, b.id);
      sessionStorage.removeItem(draftKey(slug));
      navigate(`${base}/confirmed/${b.id}`, { replace: true });
    } catch (e) {
      setSubmitting(false);
      const code = e instanceof ApiError ? e.code : '';
      if (code === 'slot_taken') setNotice(t('booking.classes.justFilled'));
      else if (code === 'invalid' && waiting) setNotice(t('booking.classes.spotOpened'));
      else if (code === 'exists') setNotice(t('booking.classes.exists'));
      else if (code === 'policy') {
        setNotice(t('booking.classes.closedNotice'));
        goTo(idx('time'));
      } else if (code === 'blocked') setNotice(t('booking.blocked'));
      else setNotice(t('common.unknownError'));
    }
  };

  const submit = async () => {
    if (cls) return join();
    if (!draft.serviceId || !draft.date || draft.start === undefined) return;
    setSubmitting(true);
    try {
      const b = await publicBooking.createBooking(slug, {
        serviceId: draft.serviceId,
        addOnIds: draft.addOnIds,
        staffId,
        date: draft.date,
        start: draft.start,
        customer: customer(),
      });
      rememberBooking(slug, b.id);
      sessionStorage.removeItem(draftKey(slug));
      navigate(`${base}/confirmed/${b.id}`, { replace: true });
    } catch (e) {
      setSubmitting(false);
      if (e instanceof ApiError && e.code === 'slot_taken') {
        update({ start: undefined });
        setNotice(t('conflict.slot_taken'));
        goTo(idx('time'));
      } else if (e instanceof ApiError && e.code === 'blocked') setNotice(t('booking.blocked'));
      else setNotice(t('common.unknownError'));
    }
  };

  const next = () => {
    if (submitting) return;
    if (key === 'details') {
      const e = validate(draft, business.policies.requireEmail, t);
      setErrors(e);
      const first = Object.keys(e)[0];
      if (first) {
        document.getElementById(`f-${first}`)?.focus();
        return;
      }
    }
    if (key === 'review') return void submit();
    setNotice(null);
    goTo(step + 1);
  };

  const { service, duration, price } = totals(tenant, draft, staffId);
  const when = whenOf(tenant, draft);
  const ready = key === 'service' ? !!draft.serviceId : key === 'time' ? timeOk : true;
  const ctaLabel =
    key === 'service'
      ? t('booking.cta.toTime')
      : key === 'time'
        ? t('booking.cta.toDetails')
        : key === 'details'
          ? t('booking.cta.toReview')
          : submitting
            ? t('booking.review.confirming')
            : t(waiting ? 'booking.classes.joinWaitlist' : manual ? 'booking.review.request' : cls ? 'booking.classes.join' : 'booking.review.confirm');

  const logo = (
    <Link to={base} className="bk-top__id">
      <BusinessWordmark name={tx(business.name)} logoUrl={business.branding.logoUrl} hideMark={business.branding.hideLogo} />
    </Link>
  );

  if (waited)
    return (
      <div className="booking">
        <header className="bk-top">
          <div className="bk-top__inner">{logo}</div>
        </header>
        <main className="flow" id="main">
          <WaitlistDone position={waited.position} session={waited.session} />
        </main>
      </div>
    );

  const termsLine = service ? [fmt.durationRange(duration), fmt.moneyRange(price)].join(' · ') : '';
  const whenLine = when ? `${fmt.date(when.date, 'medium')} · ${fmt.time(when.start)}` : '';

  return (
    <div className="booking">
      <header className="bk-top">
        <div className="bk-top__inner">
          {logo}
          <Link to={base} className="bk-top__close" aria-label={t('booking.exit')}>
            <CloseIcon size={18} />
          </Link>
        </div>
      </header>

      <main className="flow" id="main">
        <nav className="steps" aria-label={t('booking.title')}>
          <ol>
            {STEPS.map((k, i) => (
              <li key={k} data-state={i < step ? 'done' : i === step ? 'current' : 'todo'}>
                {i < step ? (
                  <button type="button" onClick={() => goTo(i)}>
                    <span className="steps__n" aria-hidden="true">
                      <CheckIcon size={11} />
                    </span>
                    {t(`booking.steps.${k}`)}
                  </button>
                ) : (
                  <span aria-current={i === step ? 'step' : undefined}>
                    <span className="steps__n" aria-hidden="true">
                      {fmt.number(i + 1)}
                    </span>
                    {t(`booking.steps.${k}`)}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>

        {notice && (
          <p className="flow__notice" role="alert">
            {notice}
          </p>
        )}

        <div key={step} className="flow__step">
          {key === 'service' && <StepService draft={draft} update={update} />}
          {key === 'time' && service && (
            <>
              <StepTitle>{t(cls ? 'booking.classes.title' : 'booking.time.title')}</StepTitle>
              <Context onChange={() => goTo(0)} label={t('booking.steps.service')}>
                <strong>{tx(service.name)}</strong>
                {!cls && <span className="muted"> · {termsLine}</span>}
              </Context>
              {cls ? <StepClass draft={draft} update={update} /> : <StepTime draft={draft} update={update} staffId={staffId} />}
            </>
          )}
          {key === 'details' && (
            <>
              <StepTitle lede={waiting ? t('booking.classes.fullLede') : undefined}>{t(waiting ? 'booking.classes.waitTitle' : 'booking.details.title')}</StepTitle>
              <Context onChange={() => goTo(idx('time'))} label={t('booking.steps.time')}>
                <strong>{tx(service?.name)}</strong>
                <span className="muted"> · {whenLine}</span>
              </Context>
              <StepDetails draft={draft} update={update} errors={errors} requireEmail={business.policies.requireEmail} />
            </>
          )}
          {key === 'review' && <StepReview draft={draft} staffId={staffId} goTo={goTo} waiting={waiting} />}
        </div>

        {ready && (
          <div className="bar" data-step={key}>
            <div className="bar__info" aria-live="polite">
              {key === 'service' && service && (
                <>
                  <strong>{tx(service.name)}</strong>
                  <span>{cls ? t('booking.classes.groupLabel') : termsLine}</span>
                </>
              )}
              {key !== 'service' && when && (
                <>
                  <strong className="tabular">{whenLine}</strong>
                  <span className="tabular">{fmt.moneyRange(price)}</span>
                </>
              )}
            </div>
            <button type="button" className="btn btn--primary btn--lg bar__cta" onClick={next} aria-disabled={submitting}>
              {submitting && <span className="spinner" aria-hidden="true" />}
              {ctaLabel}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function StepTitle({ children, lede }: { children: string; lede?: string }) {
  return (
    <div className="step-head">
      <h1 id="step-title" className="step-head__title" tabIndex={-1}>
        {children}
      </h1>
      {lede && <p className="step-head__lede">{lede}</p>}
    </div>
  );
}

/** What's been chosen so far, in one line, with a way back to change it. */
function Context({ children, onChange, label }: { children: ReactNode; onChange: () => void; label: string }) {
  const { t } = useI18n();
  return (
    <div className="context">
      <p className="context__text">{children}</p>
      <button type="button" className="context__change" onClick={onChange}>
        {t('common.change')}
        <span className="sr-only">, {label}</span>
      </button>
    </div>
  );
}

interface StepProps {
  draft: Draft;
  update: (p: Partial<Draft>) => void;
}

function StepService({ draft, update }: StepProps) {
  const { t, tx, fmt } = useI18n();
  const { business } = usePublicTenant();
  const groups = useMemo(() => {
    const cats = business.categories.map((c) => ({ id: c.id, name: tx(c.name), items: business.services.filter((s) => s.categoryId === c.id) }));
    const rest = business.services.filter((s) => !s.categoryId || !business.categories.some((c) => c.id === s.categoryId));
    return [...cats, { id: '_', name: '', items: rest }].filter((g) => g.items.length);
  }, [business, tx]);
  const chosen = business.services.find((s) => s.id === draft.serviceId);

  return (
    <>
      <StepTitle>{t('booking.service.title')}</StepTitle>
      {groups.map((g) => (
        <fieldset key={g.id} className="svc-group">
          {g.name && <legend className="svc-group__name">{g.name}</legend>}
          <div className="svc-group__list">
            {g.items.map((s) => {
              const selected = s.id === draft.serviceId;
              const r = termsRange(s);
              const desc = [isClass(s) ? t('booking.classes.groupLabel') : '', tx(s.description)].filter(Boolean).join(' · ');
              return (
                <label key={s.id} className="svc" data-selected={selected}>
                  <input
                    type="radio"
                    name="service"
                    className="sr-only"
                    checked={selected}
                    onChange={() => update({ serviceId: s.id, addOnIds: selected ? draft.addOnIds : [], start: undefined, sessionId: undefined })}
                  />
                  <span className="svc__name">{tx(s.name)}</span>
                  {desc && <span className="svc__desc">{desc}</span>}
                  <span className="svc__meta">
                    <span className="svc__duration">
                      <ClockIcon size={13} /> {fmt.durationRange(r.duration)}
                    </span>
                    <span className="svc__price tabular">{fmt.moneyRange(r.price)}</span>
                  </span>
                  <span className="svc__tick" aria-hidden="true">
                    <CheckIcon size={12} />
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      {chosen && business.addOns.length > 0 && !isClass(chosen) && (
        <fieldset className="svc-group">
          <legend className="svc-group__name">{t('booking.service.addOnsTitle')}</legend>
          <p className="svc-group__hint">{t('booking.service.addOnsHint')}</p>
          <div className="addon-grid">
            {business.addOns.map((a) => {
              const on = draft.addOnIds.includes(a.id);
              return (
                <label key={a.id} className="addon-choice" data-selected={on}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => update({ addOnIds: on ? draft.addOnIds.filter((x) => x !== a.id) : [...draft.addOnIds, a.id], start: undefined })} />
                  <span className="addon-choice__name">
                    {on ? <CheckIcon size={13} /> : <PlusIcon size={13} />} {tx(a.name)}
                  </span>
                  <span className="addon-choice__meta tabular">
                    +{fmt.money(a.price)} · {fmt.duration(a.duration)}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
    </>
  );
}

function StepTime({ draft, update, staffId }: StepProps & { staffId: string }) {
  const { t, tx } = useI18n();
  const tenant = usePublicTenant();
  const { options } = staffFor(tenant, draft);
  return (
    <>
      {options.length > 0 && (
        <div className="who">
          <span className="who__label" id="who-label">
            {t('booking.staff.title')}
          </span>
          <div className="who__list" role="radiogroup" aria-labelledby="who-label">
            {options.map((id) => {
              const person = id === 'any' ? undefined : tenant.staff(id);
              const on = id === staffId;
              return (
                <button key={id} type="button" role="radio" aria-checked={on} className="who__opt" onClick={() => update({ staffId: id, start: undefined })}>
                  {person && <StaffAvatar staff={person} size="sm" />}
                  {person ? tx(person.name).split(' ')[0] : t('booking.staff.anyTitle')}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {staffId ? (
        <SlotPicker serviceId={draft.serviceId!} addOnIds={draft.addOnIds} staffId={staffId} date={draft.date} start={draft.start} onChange={(v) => update({ date: v.date, start: v.start })} />
      ) : (
        <p className="times__none">{t('booking.staff.pickFirst')}</p>
      )}
    </>
  );
}

/** The sessions of the chosen class, one day at a time. */
function StepClass({ draft, update }: StepProps) {
  const { t, tx, fmt } = useI18n();
  const tenant = usePublicTenant();
  const sessions = useMemo(() => tenant.sessions(draft.serviceId!).filter((s) => s.block !== 'cancelled' && s.block !== 'past'), [tenant, draft.serviceId]);
  const open = (s: PublicSession) => !s.block || s.block === 'full';

  const days = useMemo<StripDay[]>(() => {
    const m = new Map<ISODate, PublicSession[]>();
    for (const s of sessions) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return [...m].map(([date, list]) => {
      const free = list.filter((s) => !s.block).length;
      const status = free ? t('booking.classes.count', { count: free }) : list.some(open) ? t('booking.time.dayFull') : t('booking.classes.closed');
      return { date, status, open: list.some(open) };
    });
  }, [sessions, t]);

  const chosen = sessions.find((s) => s.id === draft.sessionId);
  const [day, setDay] = useState<ISODate | undefined>(() => chosen?.date ?? days.find((d) => d.open)?.date ?? days[0]?.date);

  if (!sessions.length) return <p className="times__none">{t('booking.classes.none')}</p>;

  const status = (s: PublicSession) =>
    s.block === 'full'
      ? t('booking.classes.fullWait')
      : s.block === 'closed'
        ? t('booking.classes.closed')
        : s.block === 'too_far'
          ? t('booking.classes.notYet')
          : t('booking.classes.spotsLeft', { count: s.seatsLeft });

  return (
    <div className="when">
      <DateStrip days={days} value={day} onChange={setDay} today={tenant.today} />
      <div className="sessions" role="radiogroup" aria-label={day ? fmt.date(day) : undefined}>
        {sessions
          .filter((s) => s.date === day)
          .map((s) => {
            const on = s.id === draft.sessionId;
            const staff = tenant.solo ? undefined : tenant.staff(s.staffId);
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={on}
                className="session"
                data-full={s.block === 'full' || undefined}
                disabled={!open(s)}
                onClick={() => update({ sessionId: s.id })}
              >
                <span className="session__time tabular">{fmt.timeRange(s.start, s.start + s.duration)}</span>
                <span className="session__who">{staff ? t('booking.classes.with', { name: tx(staff.name) }) : fmt.duration(s.duration)}</span>
                <span className="session__status">{status(s)}</span>
                <span className="session__price tabular">{fmt.money(s.price)}</span>
                {on && (
                  <span className="session__tick" aria-hidden="true">
                    <CheckIcon size={12} />
                  </span>
                )}
              </button>
            );
          })}
      </div>
      <p className="times__tz">{t('booking.time.timezone', { zone: fmt.zoneName() })}</p>
    </div>
  );
}

function StepDetails({ draft, update, errors, requireEmail }: StepProps & { errors: Errors; requireEmail: boolean }) {
  const { t } = useI18n();
  const [more, setMore] = useState(() => !!(draft.email || draft.note));
  const field = (key: 'name' | 'phone' | 'email', label: string, props: InputHTMLAttributes<HTMLInputElement>, hint?: string) => (
    <div className="field">
      <label className="field__label" htmlFor={`f-${key}`}>
        {label}
      </label>
      <input
        id={`f-${key}`}
        className="field__input"
        value={draft[key]}
        onChange={(e) => update({ [key]: e.target.value })}
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `e-${key}` : hint ? `h-${key}` : undefined}
        {...props}
      />
      {errors[key] ? (
        <p id={`e-${key}`} className="field__error">
          {errors[key]}
        </p>
      ) : (
        hint && (
          <p id={`h-${key}`} className="field__hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
  const email = field('email', requireEmail ? t('booking.details.email') : `${t('booking.details.email')} (${t('common.optional')})`, { type: 'email', autoComplete: 'email', dir: 'ltr', required: requireEmail });
  return (
    <div className="details-form">
      {field('name', t('booking.details.name'), { autoComplete: 'name', required: true })}
      {field('phone', t('booking.details.phone'), { type: 'tel', autoComplete: 'tel', inputMode: 'tel', dir: 'ltr', required: true }, t('booking.details.phoneHint'))}
      {requireEmail && email}
      {more || errors.email ? (
        <>
          {!requireEmail && email}
          <div className="field">
            <label className="field__label" htmlFor="f-note">
              {t('booking.details.note')} <span className="muted">({t('common.optional')})</span>
            </label>
            <textarea id="f-note" className="field__input" value={draft.note} placeholder={t('booking.details.notePlaceholder')} onChange={(e) => update({ note: e.target.value })} />
          </div>
        </>
      ) : (
        <button type="button" className="details-form__more" onClick={() => setMore(true)}>
          <PlusIcon size={13} /> {t(requireEmail ? 'booking.details.addNote' : 'booking.details.addMore')}
        </button>
      )}
    </div>
  );
}

function StepReview({ draft, staffId, goTo, waiting }: { draft: Draft; staffId: string; goTo: (n: number) => void; waiting: boolean }) {
  const { t, tx, fmt } = useI18n();
  const tenant = usePublicTenant();
  const p = tenant.business.policies;
  const { service, duration, price } = totals(tenant, draft, staffId);
  const session = chosenSession(tenant, draft);
  const when = whenOf(tenant, draft);
  if (!service || !when) return null;
  const staff = tenant.staff(session ? session.staffId : staffId);
  const fixed = duration[0] === duration[1];
  const rows: [string, ReactNode, number][] = [
    [t('booking.review.rows.service'), [tx(service.name), ...draft.addOnIds.map((id) => tx(tenant.addOn(id)?.name))].join(' + '), idx('service')],
    ...(!tenant.solo ? ([[t('booking.review.rows.with'), staff ? tx(staff.name) : t('booking.summary.staffAny'), idx('time')]] as [string, ReactNode, number][]) : []),
    [t('booking.review.rows.date'), fmt.date(when.date), idx('time')],
    [t('booking.review.rows.time'), <span className="tabular">{fixed ? fmt.timeRange(when.start, when.start + duration[0]) : fmt.time(when.start)}</span>, idx('time')],
    [t('booking.review.rows.duration'), fmt.durationRange(duration), -1],
    [t('booking.review.rows.details'), [draft.name, draft.phone, draft.email].filter(Boolean).join(' · '), idx('details')],
  ];
  return (
    <>
      <StepTitle lede={waiting ? t('booking.classes.fullLede') : undefined}>{t(waiting ? 'booking.classes.waitTitle' : 'booking.review.title')}</StepTitle>
      <div className="review">
        <dl className="review__rows">
          {rows.map(([label, value, step]) => (
            <div key={label} className="review__row">
              <dt>{label}</dt>
              <dd>{value}</dd>
              {step >= 0 && (
                <button type="button" className="context__change" onClick={() => goTo(step)}>
                  {t('common.change')}
                  <span className="sr-only">, {label}</span>
                </button>
              )}
            </div>
          ))}
        </dl>
        <div className="review__total">
          <span>{t('booking.summary.total')}</span>
          <strong className="tabular">{fmt.moneyRange(price)}</strong>
        </div>
        <p className="review__note">{price[0] !== price[1] ? t('booking.summary.dependsOnStaff') : t('booking.summary.payAtVisit')}</p>
      </div>
      <div className="review__policies">
        {waiting && <p className="review__policy">{t('booking.classes.done.how')}</p>}
        {!waiting && p.customerCanCancel && (
          <p className="review__policy">
            <ClockIcon /> {t(session ? 'booking.classes.policy' : 'booking.review.policy', { hours: t('units.hoursLong', { count: p.cancelWindowHours }) })}
          </p>
        )}
        {!waiting && p.confirmationMode === 'manual' && <p className="review__policy">{t('booking.review.manual')}</p>}
      </div>
    </>
  );
}

function WaitlistDone({ position, session }: { position: number; session: PublicSession }) {
  const { t, tx, fmt } = useI18n();
  const tenant = usePublicTenant();
  const service = tenant.service(session.serviceId);
  return (
    <div className="waitlist-done">
      <span className="waitlist-done__mark" aria-hidden="true">
        <CheckIcon size={20} />
      </span>
      <StepTitle lede={t('booking.classes.done.body', { service: tx(service?.name), when: `${fmt.date(session.date, 'medium')} · ${fmt.time(session.start)}` })}>
        {t('booking.classes.done.title')}
      </StepTitle>
      <p className="waitlist-done__pos">{t('booking.classes.done.position', { position: fmt.number(position) })}</p>
      <p className="muted">{t('booking.classes.done.how')}</p>
      <Link to={tenant.base} className="btn btn--ghost">
        {t('confirmed.back', { business: tx(tenant.business.name) })}
      </Link>
    </div>
  );
}