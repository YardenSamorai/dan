import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type InputHTMLAttributes } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SlotPicker } from '../../components/booking/SlotPicker';
import { ArrowBackIcon, CheckIcon, ClockIcon, CloseIcon } from '../../components/ui/Icons';
import { BusinessWordmark, StaffAvatar } from '../../components/ui/bits';
import { storageKey } from '../../config/product';
import { ApiError, publicBooking } from '../../data';
import { rememberBooking } from '../../data/mine';
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
  name: string;
  phone: string;
  email: string;
  note: string;
}

type Errors = Partial<Record<'name' | 'phone' | 'email', string>>;
type StepKey = 'service' | 'staff' | 'time' | 'details' | 'review';

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

function totals(tenant: PublicTenant, d: Draft) {
  const s = d.serviceId ? tenant.service(d.serviceId) : undefined;
  const extras = d.addOnIds.map((id) => tenant.addOn(id)).filter((a) => !!a);
  return {
    service: s,
    duration: (s?.duration ?? 0) + extras.reduce((m, a) => m + a!.duration, 0),
    price: (s?.price ?? 0) + extras.reduce((m, a) => m + a!.price, 0),
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
  const steps: StepKey[] = soloId !== null ? ['service', 'time', 'details', 'review'] : ['service', 'staff', 'time', 'details', 'review'];
  const idx = (k: StepKey) => steps.indexOf(k);

  const [draft, setDraft] = useState<Draft>(() => {
    const d = loadDraft(slug, soloId ?? (anyAllowed ? 'any' : ''));
    const service = params.get('service');
    const staff = params.get('staff');
    const date = params.get('date');
    const time = params.get('time');
    if (d.serviceId && !tenant.service(d.serviceId)) d.serviceId = undefined;
    if (service && tenant.service(service)) {
      if (service !== d.serviceId) d.addOnIds = [];
      d.serviceId = service;
    }
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

  const staffChosen = draft.staffId !== '';
  const timeOk = useMemo(() => {
    if (!draft.serviceId || !staffChosen || !draft.date || draft.start === undefined) return false;
    return tenant.slots({ serviceId: draft.serviceId, addOnIds: draft.addOnIds, staffId: draft.staffId, date: draft.date }).some((x) => x.start === draft.start);
  }, [tenant, draft.serviceId, draft.addOnIds, draft.staffId, draft.date, draft.start, staffChosen]);

  const detailsOk = Object.keys(validate(draft, business.policies.requireEmail, t)).length === 0;
  const maxStep = !draft.serviceId ? 0 : !staffChosen ? idx('staff') : !timeOk ? idx('time') : !detailsOk ? idx('details') : idx('review');

  useEffect(() => {
    if (params.has('step')) return;
    const start = !draft.serviceId ? 0 : timeOk ? idx('details') : params.get('staff') || soloId !== null ? idx('time') : 1;
    setParams({ step: String(start) }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => sessionStorage.setItem(draftKey(slug), JSON.stringify(draft)), [draft, slug]);

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

  const submit = async () => {
    if (!draft.serviceId || !draft.date || draft.start === undefined) return;
    setSubmitting(true);
    try {
      const b = await publicBooking.createBooking(slug, {
        serviceId: draft.serviceId,
        addOnIds: draft.addOnIds,
        staffId: draft.staffId,
        date: draft.date,
        start: draft.start,
        customer: { name: draft.name.trim(), phone: draft.phone.trim(), email: draft.email.trim() || undefined, note: draft.note.trim(), locale },
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
      } else setNotice(t('common.unknownError'));
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
    }
    if (key === 'review') return void submit();
    setNotice(null);
    goTo(step + 1);
  };

  const { service, duration, price } = totals(tenant, draft);
  const hint = key === 'service' ? t('booking.summary.empty') : key === 'time' ? t('booking.time.pickDay') : '';
  const ctaLabel = key === 'review' ? (submitting ? t('booking.review.confirming') : t(manual ? 'booking.review.request' : 'booking.review.confirm')) : t('common.continue');

  const cta = (className = '') => (
    <button type="button" className={`btn btn--primary btn--lg ${className}`} onClick={next} aria-disabled={!canContinue || submitting} aria-describedby={!canContinue ? 'cta-hint' : undefined}>
      {submitting && <span className="spinner" aria-hidden="true" />}
      {ctaLabel}
    </button>
  );

  return (
    <div className="booking">
      <header className="booking__bar">
        <div className="booking__bar-inner">
          <Link to={base} className="booking__logo">
            <BusinessWordmark name={tx(business.name)} logoUrl={business.branding.logoUrl} />
          </Link>
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
            {key === 'time' && service && (
              <>
                <StepTitle>{t('booking.time.title')}</StepTitle>
                <SlotPicker serviceId={service.id} addOnIds={draft.addOnIds} staffId={draft.staffId} date={draft.date} start={draft.start} onChange={(v) => update({ date: v.date, start: v.start })} />
              </>
            )}
            {key === 'details' && <StepDetails draft={draft} update={update} errors={errors} requireEmail={business.policies.requireEmail} />}
            {key === 'review' && <StepReview draft={draft} goTo={goTo} staffStep={soloId === null ? idx('staff') : -1} timeStep={idx('time')} detailsStep={idx('details')} />}
          </div>
        </main>

        <aside className="booking__aside" aria-label={t('booking.summary.title')}>
          <div className="booking__card">
            <Summary draft={draft} />
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
              <strong className="tabular">{fmt.money(price)}</strong>
              <span className="tabular">
                {fmt.duration(duration)}
                {draft.date && draft.start !== undefined && timeOk ? ` · ${fmt.time(draft.start)}` : ''}
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
            return (
              <label key={s.id} className="choice" data-selected={selected}>
                <input type="radio" name="service" className="sr-only" checked={selected} onChange={() => update({ serviceId: s.id, addOnIds: selected ? draft.addOnIds : [], start: undefined })} />
                <span className="choice__main">
                  <span className="choice__title">{tx(s.name)}</span>
                  {tx(s.description) && <span className="choice__desc">{tx(s.description)}</span>}
                </span>
                <span className="choice__side">
                  <span className="choice__price tabular">{fmt.money(s.price)}</span>
                  <span className="choice__meta">
                    <ClockIcon size={12} /> {fmt.duration(s.duration)}
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
      {draft.serviceId && business.addOns.length > 0 && (
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
      <StepTitle lede={t('booking.details.lede')}>{t('booking.details.title')}</StepTitle>
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

function StepReview({ draft, goTo, staffStep, timeStep, detailsStep }: { draft: Draft; goTo: (n: number) => void; staffStep: number; timeStep: number; detailsStep: number }) {
  const { t, tx, fmt } = useI18n();
  const tenant = usePublicTenant();
  const p = tenant.business.policies;
  const service = tenant.service(draft.serviceId!)!;
  const staff = tenant.staff(draft.staffId);
  const rows: [string, string, number][] = [
    [t('booking.steps.service'), [tx(service.name), ...draft.addOnIds.map((id) => tx(tenant.addOn(id)?.name))].join(' + '), 0],
    ...(staffStep >= 0 ? ([[t('booking.steps.staff'), staff ? tx(staff.name) : t('booking.summary.staffAny'), staffStep]] as [string, string, number][]) : []),
    [t('booking.steps.time'), `${fmt.date(draft.date!)} · ${fmt.time(draft.start!)}`, timeStep],
    [t('booking.steps.details'), [draft.name, draft.phone, draft.email].filter(Boolean).join(' · '), detailsStep],
  ];
  return (
    <>
      <StepTitle>{t('booking.review.title')}</StepTitle>
      <dl className="review">
        {rows.map(([label, value, step]) => (
          <div key={label} className="review__row">
            <dt>{label}</dt>
            <dd>{value}</dd>
            <button type="button" className="btn btn--quiet btn--xs" onClick={() => goTo(step)}>
              {t('common.change')}
              <span className="sr-only">, {label}</span>
            </button>
          </div>
        ))}
      </dl>
      {p.customerCanCancel && (
        <p className="review__policy">
          <ClockIcon /> {t('booking.review.policy', { hours: t('units.hoursLong', { count: p.cancelWindowHours }) })}
        </p>
      )}
      {p.confirmationMode === 'manual' && <p className="review__policy">{t('booking.review.manual')}</p>}
    </>
  );
}

function Summary({ draft }: { draft: Draft }) {
  const { t, tx, fmt } = useI18n();
  const tenant = usePublicTenant();
  const { service, duration, price } = totals(tenant, draft);
  if (!service) return <p className="summary__empty muted">{t('booking.summary.empty')}</p>;
  const staff = tenant.staff(draft.staffId);
  const addOns = draft.addOnIds.map((id) => tenant.addOn(id)).filter((a) => !!a);
  return (
    <div className="summary">
      <p className="summary__eyebrow">{t('booking.summary.title')}</p>
      <ul className="summary__lines">
        <li>
          <span>{tx(service.name)}</span>
          <span className="tabular">{fmt.money(service.price)}</span>
        </li>
        {addOns.map((a) => (
          <li key={a!.id} className="summary__addon">
            <span>{tx(a!.name)}</span>
            <span className="tabular">+{fmt.money(a!.price)}</span>
          </li>
        ))}
      </ul>
      <dl className="summary__meta">
        {!tenant.solo && draft.staffId && (
          <div>
            <dt>{t('booking.steps.staff')}</dt>
            <dd>{staff ? tx(staff.name) : t('booking.summary.staffAny')}</dd>
          </div>
        )}
        {draft.date && draft.start !== undefined && (
          <div>
            <dt>{t('booking.steps.time')}</dt>
            <dd>
              {fmt.date(draft.date, 'medium')} · <span className="tabular">{fmt.timeRange(draft.start, draft.start + duration)}</span>
            </dd>
          </div>
        )}
        <div>
          <dt>{t('appt.duration')}</dt>
          <dd>{fmt.duration(duration)}</dd>
        </div>
      </dl>
      <div className="summary__total">
        <span>{t('booking.summary.total')}</span>
        <span className="tabular">{fmt.money(price)}</span>
      </div>
      <p className="summary__note muted">{t('booking.summary.payAtVisit')}</p>
    </div>
  );
}
