import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type InputHTMLAttributes } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ProviderCalendar, openHours, type CalDay } from '../../components/booking/ProviderCalendar';
import { SlotPicker } from '../../components/booking/SlotPicker';
import { ArrowBackIcon, CheckIcon, ClockIcon, CloseIcon } from '../../components/ui/Icons';
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
type StepKey = 'service' | 'staff' | 'time' | 'details';

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

/** Until a specific person is chosen, duration and price span everyone who could take it. */
function totals(tenant: PublicTenant, d: Draft) {
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
  const who = d.staffId && d.staffId !== 'any' ? [d.staffId] : s?.staffIds ?? [];
  const r = s ? termsRange(s, who) : { duration: [0, 0] as Span, price: [0, 0] as Span };
  return {
    service: s,
    base: r.price,
    duration: [r.duration[0] + xd, r.duration[1] + xd] as Span,
    price: [r.price[0] + xp, r.price[1] + xp] as Span,
  };
}

export default function BookFlowPage() {
  const i18n = useI18n();
  const { t, tx, fmt, locale } = i18n;
  const tenant = usePublicTenant();
  const { business, slug, base } = tenant;
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const soloId = tenant.solo ? business.staff[0]?.id ?? '' : null;
  const anyAllowed = business.policies.allowAnyStaff;

  const [draft, setDraft] = useState<Draft>(() => {
    const d = loadDraft(slug, soloId ?? (anyAllowed ? 'any' : ''));
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
    if (soloId !== null) d.staffId = soloId;
    else if (staff && ((staff === 'any' && anyAllowed) || tenant.staff(staff))) d.staffId = staff;
    else if (d.staffId === 'any' && !anyAllowed) d.staffId = '';
    if (date) d.date = date;
    if (time && !Number.isNaN(Number(time))) d.start = Number(time);
    return d;
  });
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [waited, setWaited] = useState<{ position: number; session: PublicSession } | null>(null);

  const cls = isClass(draft.serviceId ? tenant.service(draft.serviceId) : undefined);
  const steps: StepKey[] = soloId !== null || cls ? ['service', 'time', 'details'] : ['service', 'staff', 'time', 'details'];
  const idx = (k: StepKey) => steps.indexOf(k);
  const session = chosenSession(tenant, draft);
  const waiting = session?.block === 'full';

  const staffChosen = cls || draft.staffId !== '';
  const timeOk = useMemo(() => {
    if (cls) return !!session && (!session.block || session.block === 'full');
    if (!draft.serviceId || !staffChosen || !draft.date || draft.start === undefined) return false;
    return tenant.slots({ serviceId: draft.serviceId, addOnIds: draft.addOnIds, staffId: draft.staffId, date: draft.date }).some((x) => x.start === draft.start);
  }, [tenant, cls, session, draft.serviceId, draft.addOnIds, draft.staffId, draft.date, draft.start, staffChosen]);

  const maxStep = !draft.serviceId ? 0 : !staffChosen ? idx('staff') : !timeOk ? idx('time') : idx('details');

  useEffect(() => {
    if (params.has('step')) return;
    const start = !draft.serviceId ? 0 : timeOk ? idx('details') : params.get('staff') || soloId !== null ? idx('time') : 1;
    setParams({ step: String(start) }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sessionStorage.setItem(draftKey(slug), JSON.stringify(draft));
  }, [draft, slug]);

  const requested = Number(params.get('step') ?? 0);
  const step = Math.max(0, Math.min(Number.isFinite(requested) ? requested : 0, maxStep));
  const key = steps[step];

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
  const canContinue = key === 'service' ? !!draft.serviceId : key === 'staff' ? staffChosen : key === 'time' ? timeOk : true;
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
        staffId: draft.staffId,
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
    if (!canContinue || submitting) return;
    if (key === 'details') {
      const e = validate(draft, business.policies.requireEmail, t);
      setErrors(e);
      const first = Object.keys(e)[0];
      if (first) {
        document.getElementById(`f-${first}`)?.focus();
        return;
      }
      return void submit();
    }
    setNotice(null);
    goTo(step + 1);
  };

  const { service, duration, price } = totals(tenant, draft);
  // A "change" link only for choices already behind the customer.
  const edit: Edit = {
    goTo,
    service: step > 0 ? 0 : -1,
    staff: soloId === null && !cls && step > idx('staff') ? idx('staff') : -1,
    time: step > idx('time') ? idx('time') : -1,
  };
  const hint = key === 'service' ? t('booking.summary.empty') : key === 'time' ? t(cls ? 'booking.calendar.pickClass' : 'booking.calendar.pickTime') : '';
  const ctaLabel =
    key === 'details'
      ? submitting
        ? t('booking.review.confirming')
        : t(waiting ? 'booking.classes.joinWaitlist' : manual ? 'booking.review.request' : cls ? 'booking.classes.join' : 'booking.review.confirm')
      : t('common.continue');
  const pickedTime = cls ? (session && timeOk ? session.start : undefined) : draft.date && draft.start !== undefined && timeOk ? draft.start : undefined;

  const cta = (className = '') => (
    <button type="button" className={`btn btn--primary btn--lg ${className}`} onClick={next} aria-disabled={!canContinue || submitting} aria-describedby={!canContinue ? 'cta-hint' : undefined}>
      {submitting && <span className="spinner" aria-hidden="true" />}
      {ctaLabel}
    </button>
  );

  const logo = (
    <Link to={base} className="booking__logo">
      <BusinessWordmark name={tx(business.name)} logoUrl={business.branding.logoUrl} hideMark={business.branding.hideLogo} />
    </Link>
  );

  if (waited)
    return (
      <div className="booking">
        <header className="booking__bar">
          <div className="booking__bar-inner">{logo}</div>
        </header>
        <div className="booking__body">
          <main className="booking__main" id="main">
            <WaitlistDone position={waited.position} session={waited.session} />
          </main>
        </div>
      </div>
    );

  return (
    <div className="booking">
      <header className="booking__bar">
        <div className="booking__bar-inner">
          {logo}
          <nav className="progress" aria-label={t('booking.title')}>
            <ol>
              {steps.map((k, i) => (
                <li key={k} data-state={i < step ? 'done' : i === step ? 'current' : 'todo'}>
                  {i < step ? (
                    <button type="button" onClick={() => goTo(i)}>
                      <CheckIcon size={12} /> <span className="progress__label">{t(`booking.steps.${k}`)}</span>
                    </button>
                  ) : (
                    <span aria-current={i === step ? 'step' : undefined}>
                      <span className="progress__label">{t(`booking.steps.${k}`)}</span>
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <p className="progress__mobile">
              <span className="muted">{t('booking.stepOf', { current: step + 1, total: steps.length })}</span> · {t(`booking.steps.${key}`)}
            </p>
          </nav>
          <Link to={base} className="booking__close" aria-label={t('booking.exit')}>
            <CloseIcon size={18} />
          </Link>
        </div>
        <div className="progress__bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${(step + 1) / steps.length})` }} />
        </div>
      </header>

      <div className="booking__body">
        <main className="booking__main" id="main">
          {step > 0 && (
            <button type="button" className="booking__back" onClick={() => goTo(step - 1)}>
              <ArrowBackIcon size={14} /> {t(`booking.steps.${steps[step - 1]}`)}
            </button>
          )}
          {notice && (
            <p className="booking__notice" role="alert">
              {notice}
            </p>
          )}
          <div key={step} className="booking__step">
            {key === 'service' && <StepService draft={draft} update={update} />}
            {key === 'staff' && <StepStaff draft={draft} update={update} onPick={() => goTo(idx('time'))} />}
            {key === 'time' && service && cls && <StepClass draft={draft} update={update} />}
            {key === 'time' && service && !cls && (
              <>
                <StepTitle>{t('booking.time.title')}</StepTitle>
                <SlotPicker
                  serviceId={service.id}
                  addOnIds={draft.addOnIds}
                  staffId={draft.staffId}
                  date={draft.date}
                  start={draft.start}
                  duration={duration[0]}
                  onChange={(v) => update({ date: v.date, start: v.start })}
                />
              </>
            )}
            {key === 'details' && (
              <>
                <StepTitle lede={t(waiting ? 'booking.classes.fullLede' : 'booking.details.lede')}>{t(waiting ? 'booking.classes.waitTitle' : 'booking.details.title')}</StepTitle>
                <div className="booking__ticket">
                  <Summary draft={draft} edit={edit} />
                </div>
                <StepDetails draft={draft} update={update} errors={errors} requireEmail={business.policies.requireEmail} />
                <Policies waiting={waiting} session={!!session} />
              </>
            )}
          </div>
        </main>

        <aside className="booking__aside" aria-label={t('booking.summary.title')}>
          <div className="booking__card">
            <Summary draft={draft} edit={edit} />
            {cta('btn--block')}
            {!canContinue && hint && (
              <p id="cta-hint" className="booking__hint">
                {hint}
              </p>
            )}
          </div>
        </aside>
      </div>

      <div className="dock">
        <div className="dock__info" aria-live="polite">
          {service ? (
            <>
              <strong className="tabular">{fmt.moneyRange(price)}</strong>
              <span className="tabular">
                {fmt.durationRange(duration)}
                {pickedTime !== undefined ? ` · ${fmt.time(pickedTime)}` : ''}
              </span>
            </>
          ) : (
            <span className="muted">{hint}</span>
          )}
        </div>
        {cta()}
      </div>
    </div>
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

/**
 * Every class the business runs, on one schedule: the chosen class stands
 * out, the others stay visible so the customer sees the whole week and can
 * switch to another class from here.
 */
function StepClass({ draft, update }: StepProps) {
  const { t, tx, fmt } = useI18n();
  const tenant = usePublicTenant();
  const { business, today } = tenant;
  const sessions = useMemo(
    () =>
      business.services
        .filter(isClass)
        .flatMap((c) => tenant.sessions(c.id))
        .filter((s) => s.block !== 'cancelled' && s.block !== 'past')
        .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start),
    [tenant, business.services],
  );
  const byDate = useMemo(() => {
    const m = new Map<ISODate, PublicSession[]>();
    for (const s of sessions) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return m;
  }, [sessions]);
  const open = (s: PublicSession) => !s.block || s.block === 'full';
  const chosen = sessions.find((s) => s.id === draft.sessionId);
  const first = sessions.find((s) => s.serviceId === draft.serviceId && open(s)) ?? sessions.find(open) ?? sessions[0];
  const last = sessions.at(-1)?.date ?? today;

  const status = useCallback(
    (s: PublicSession) =>
      s.block === 'full'
        ? t('booking.classes.fullWait')
        : s.block === 'closed'
          ? t('booking.classes.closed')
          : s.block === 'too_far'
            ? t('booking.classes.notYet')
            : t('booking.classes.spotsLeft', { count: s.seatsLeft }),
    [t],
  );

  const plan = useCallback(
    (iso: ISODate): CalDay => ({
      hours: openHours(business, iso),
      entries: (byDate.get(iso) ?? []).map((s) => {
        const name = tx(tenant.service(s.serviceId)?.name);
        const staff = tenant.solo ? undefined : tenant.staff(s.staffId);
        const when = fmt.timeRange(s.start, s.start + s.duration);
        return {
          id: s.id,
          kind: 'session' as const,
          start: s.start,
          end: s.start + s.duration,
          title: name,
          sub: [when, staff ? tx(staff.name).split(' ')[0] : ''].filter(Boolean).join(' · '),
          badge: status(s),
          label: [name, fmt.date(iso), when, staff ? t('booking.classes.with', { name: tx(staff.name) }) : '', fmt.money(s.price), status(s)].filter(Boolean).join(', '),
          selected: s.id === draft.sessionId,
          off: !open(s),
          full: s.block === 'full',
          other: s.serviceId !== draft.serviceId,
          onPick: () => update({ serviceId: s.serviceId, sessionId: s.id, addOnIds: [], start: undefined }),
        };
      }),
    }),
    [business, byDate, tenant, tx, fmt, t, status, draft.sessionId, draft.serviceId, update],
  );
  const next = useCallback((from: ISODate) => sessions.find((s) => s.date >= from && open(s))?.date ?? null, [sessions]);

  const teachers = [...new Set(sessions.map((s) => s.staffId))];
  const teacher = teachers.length === 1 ? tenant.staff(teachers[0]) : undefined;
  const owner = teacher
    ? { title: t('booking.calendar.of', { name: tx(teacher.name).split(' ')[0] }), sub: t('booking.calendar.schedule'), avatar: <StaffAvatar staff={teacher} /> }
    : { title: t('booking.calendar.schedule'), sub: tx(business.name) };

  return (
    <>
      <StepTitle lede={t('booking.time.timezone', { zone: fmt.zoneName() })}>{t('booking.classes.title')}</StepTitle>
      {!sessions.length ? (
        <p className="muted">{t('booking.classes.none')}</p>
      ) : (
        <ProviderCalendar
          owner={owner}
          initial={chosen?.date ?? first.date}
          today={today}
          last={last}
          interval={20}
          plan={plan}
          count={(n) => t('booking.calendar.classes', { count: n })}
          empty={t('booking.calendar.emptyClasses')}
          next={next}
        />
      )}
    </>
  );
}

function StepTitle({ children, lede }: { children: string; lede?: string }) {
  return (
    <div className="step-head">
      <h1 id="step-title" className="display step-head__title" tabIndex={-1}>
        {children}
      </h1>
      {lede && <p className="muted">{lede}</p>}
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

  return (
    <>
      <StepTitle>{t('booking.service.title')}</StepTitle>
      {groups.map((g) => (
        <fieldset key={g.id} className="choice-group">
          {g.name && <legend className="choice-group__legend">{g.name}</legend>}
          {g.items.map((s) => {
            const selected = s.id === draft.serviceId;
            const r = termsRange(s);
            return (
              <label key={s.id} className="choice" data-selected={selected}>
                <input type="radio" name="service" className="sr-only" checked={selected} onChange={() => update({ serviceId: s.id, addOnIds: selected ? draft.addOnIds : [], start: undefined, sessionId: undefined })} />
                <span className="choice__main">
                  <span className="choice__title">{tx(s.name)}</span>
                  {(tx(s.description) || isClass(s)) && <span className="choice__desc">{[isClass(s) ? t('booking.classes.groupLabel') : '', tx(s.description)].filter(Boolean).join(' · ')}</span>}
                </span>
                <span className="choice__side">
                  <span className="choice__price tabular">{fmt.moneyRange(r.price)}</span>
                  <span className="choice__meta">
                    <ClockIcon size={12} /> {fmt.durationRange(r.duration)}
                  </span>
                </span>
                <span className="choice__tick" aria-hidden="true">
                  <CheckIcon size={12} />
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}
      {draft.serviceId && business.addOns.length > 0 && !isClass(business.services.find((s) => s.id === draft.serviceId)) && (
        <fieldset className="choice-group">
          <legend className="choice-group__legend">{t('booking.service.addOnsTitle')}</legend>
          <p className="muted choice-group__hint">{t('booking.service.addOnsHint')}</p>
          <div className="addon-grid">
            {business.addOns.map((a) => {
              const on = draft.addOnIds.includes(a.id);
              return (
                <label key={a.id} className="addon-choice" data-selected={on}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => update({ addOnIds: on ? draft.addOnIds.filter((x) => x !== a.id) : [...draft.addOnIds, a.id], start: undefined })} />
                  <span>{tx(a.name)}</span>
                  <span className="muted tabular">
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

function StepStaff({ draft, update, onPick }: StepProps & { onPick: () => void }) {
  const { t, tx, fmt } = useI18n();
  const tenant = usePublicTenant();
  const service = tenant.service(draft.serviceId!);
  const staff = tenant.business.staff.filter((s) => service?.staffIds.includes(s.id));
  const addOnKey = draft.addOnIds.join();

  const nextFor = useMemo(() => {
    const out: Record<string, string | null> = {};
    const ids = [...(tenant.business.policies.allowAnyStaff ? ['any'] : []), ...staff.map((s) => s.id)];
    for (const id of ids) {
      const q = { serviceId: draft.serviceId!, addOnIds: draft.addOnIds, staffId: id };
      const date = tenant.firstAvailable(q);
      if (!date) {
        out[id] = null;
        continue;
      }
      const first = tenant.slots({ ...q, date })[0];
      out[id] = `${fmt.relativeDay(date) ?? fmt.date(date, 'medium')} · ${fmt.time(first.start)}`;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, draft.serviceId, addOnKey, fmt]);

  const options = [
    ...(tenant.business.policies.allowAnyStaff ? [{ id: 'any', title: t('booking.staff.anyTitle'), sub: t('booking.staff.anyBody'), staff: null }] : []),
    ...staff.map((s) => ({ id: s.id, title: tx(s.name), sub: tx(s.role), staff: s })),
  ];
  // Only worth showing when the people differ; otherwise the price was already on the service.
  const all = service ? termsRange(service) : null;
  const varies = !!all && (all.price[0] !== all.price[1] || all.duration[0] !== all.duration[1]);
  const termsOf = (id: string) => termsRange(service!, id === 'any' ? service!.staffIds : [id]);

  return (
    <>
      <StepTitle>{t('booking.staff.title')}</StepTitle>
      <div className="choice-group" role="radiogroup" aria-labelledby="step-title">
        {options.map((o) => {
          const selected = draft.staffId === o.id;
          const next = nextFor[o.id];
          return (
            <label key={o.id} className="choice choice--staff" data-selected={selected}>
              <input
                type="radio"
                name="staff"
                className="sr-only"
                checked={selected}
                onChange={() => {
                  update({ staffId: o.id, start: undefined });
                  onPick();
                }}
                onClick={() => selected && onPick()}
              />
              {o.staff ? (
                <StaffAvatar staff={o.staff} />
              ) : (
                <span className="avatar choice__any" aria-hidden>
                  ∗
                </span>
              )}
              <span className="choice__main">
                <span className="choice__title">{o.title}</span>
                {o.sub && <span className="choice__desc">{o.sub}</span>}
              </span>
              <span className="choice__side">
                {varies && (
                  <>
                    <span className="choice__price tabular">{fmt.moneyRange(termsOf(o.id).price)}</span>
                    <span className="choice__meta">
                      <ClockIcon size={12} /> {fmt.durationRange(termsOf(o.id).duration)}
                    </span>
                  </>
                )}
                <span className="choice__meta">{next ? t('booking.staff.nextAvailable', { when: next }) : t('booking.staff.unavailable')}</span>
              </span>
            </label>
          );
        })}
      </div>
    </>
  );
}

function StepDetails({ draft, update, errors, requireEmail }: StepProps & { errors: Errors; requireEmail: boolean }) {
  const { t } = useI18n();
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
  return (
    <>
      <div className="details-form">
        {field('name', t('booking.details.name'), { autoComplete: 'name', required: true })}
        {field('phone', t('booking.details.phone'), { type: 'tel', autoComplete: 'tel', inputMode: 'tel', dir: 'ltr', required: true }, t('booking.details.phoneHint'))}
        {field('email', requireEmail ? t('booking.details.email') : `${t('booking.details.email')} (${t('common.optional')})`, { type: 'email', autoComplete: 'email', dir: 'ltr', required: requireEmail })}
        <div className="field">
          <label className="field__label" htmlFor="f-note">
            {t('booking.details.note')} <span className="muted">({t('common.optional')})</span>
          </label>
          <textarea id="f-note" className="field__input" value={draft.note} placeholder={t('booking.details.notePlaceholder')} onChange={(e) => update({ note: e.target.value })} />
        </div>
      </div>
    </>
  );
}

function Policies({ waiting, session }: { waiting: boolean; session: boolean }) {
  const { t } = useI18n();
  const p = usePublicTenant().business.policies;
  if (!waiting && !p.customerCanCancel && p.confirmationMode !== 'manual') return null;
  return (
    <div className="review__policies">
      {waiting && <p className="review__policy">{t('booking.classes.done.how')}</p>}
      {!waiting && p.customerCanCancel && (
        <p className="review__policy">
          <ClockIcon /> {t(session ? 'booking.classes.policy' : 'booking.review.policy', { hours: t('units.hoursLong', { count: p.cancelWindowHours }) })}
        </p>
      )}
      {!waiting && p.confirmationMode === 'manual' && <p className="review__policy">{t('booking.review.manual')}</p>}
    </div>
  );
}

/** Step indexes the summary can jump back to; -1 hides that link. */
interface Edit {
  goTo: (n: number) => void;
  service: number;
  staff: number;
  time: number;
}

function Change({ edit, step, label }: { edit?: Edit; step: number | undefined; label: string }) {
  const { t } = useI18n();
  if (!edit || step === undefined || step < 0) return null;
  return (
    <button type="button" className="summary__change" onClick={() => edit.goTo(step)}>
      {t('common.change')}
      <span className="sr-only">, {label}</span>
    </button>
  );
}

function Summary({ draft, edit }: { draft: Draft; edit?: Edit }) {
  const { t, tx, fmt } = useI18n();
  const tenant = usePublicTenant();
  const { service, base, duration, price } = totals(tenant, draft);
  if (!service) return <p className="summary__empty muted">{t('booking.summary.empty')}</p>;
  const cls = isClass(service);
  const session = chosenSession(tenant, draft);
  const staff = tenant.staff(session ? session.staffId : draft.staffId);
  const start = cls ? session?.start : draft.date ? draft.start : undefined;
  const date = cls ? session?.date : draft.date;
  const addOns = cls ? [] : draft.addOnIds.map((id) => tenant.addOn(id)).filter((a) => !!a);
  return (
    <div className="summary">
      <p className="summary__eyebrow">
        {t('booking.summary.title')}
        <Change edit={edit} step={edit?.service} label={t('booking.steps.service')} />
      </p>
      <ul className="summary__lines">
        <li>
          <span>{tx(service.name)}</span>
          <span className="tabular">{fmt.moneyRange(base)}</span>
        </li>
        {addOns.map((a) => (
          <li key={a!.id} className="summary__addon">
            <span>{tx(a!.name)}</span>
            <span className="tabular">+{fmt.money(a!.price)}</span>
          </li>
        ))}
      </ul>
      <dl className="summary__meta">
        {!tenant.solo && (cls ? !!session : !!draft.staffId) && (
          <div>
            <dt>
              {t('booking.steps.staff')}
              <Change edit={edit} step={edit?.staff} label={t('booking.steps.staff')} />
            </dt>
            <dd>{staff ? tx(staff.name) : t('booking.summary.staffAny')}</dd>
          </div>
        )}
        {date && start !== undefined && (
          <div>
            <dt>
              {t('booking.steps.time')}
              <Change edit={edit} step={edit?.time} label={t('booking.steps.time')} />
            </dt>
            <dd>
              {fmt.date(date, 'medium')} ·{' '}
              <span className="tabular">{duration[0] === duration[1] ? fmt.timeRange(start, start + duration[0]) : fmt.time(start)}</span>
            </dd>
          </div>
        )}
        {session?.block === 'full' && (
          <div>
            <dt>{t('booking.classes.seats')}</dt>
            <dd>{t('booking.classes.fullWait')}</dd>
          </div>
        )}
        <div>
          <dt>{t('appt.duration')}</dt>
          <dd>{fmt.durationRange(duration)}</dd>
        </div>
      </dl>
      <div className="summary__total">
        <span>{t('booking.summary.total')}</span>
        <span className="tabular">{fmt.moneyRange(price)}</span>
      </div>
      {price[0] !== price[1] && <p className="summary__note muted">{t('booking.summary.dependsOnStaff')}</p>}
      <p className="summary__note muted">{t('booking.summary.payAtVisit')}</p>
    </div>
  );
}
