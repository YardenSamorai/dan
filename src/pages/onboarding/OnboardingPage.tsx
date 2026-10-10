import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { TimeSelect } from '../../app/shared';
import { ArrowBackIcon, BusinessMark, CheckIcon, CloseIcon, PlusIcon } from '../../components/ui/Icons';
import { ProductWordmark, Segmented } from '../../components/ui/bits';
import { storageKey } from '../../config/product';
import { ApiError, auth, directory } from '../../data';
import { BUSINESS_TYPES, dayHours, range, SERVICE_TEMPLATES, slugify, SLUG_PATTERN, WEEKDAYS, weeklyFrom } from '../../domain/defaults';
import { isValidTimeZone } from '../../domain/time';
import type { BookingPolicies, BusinessType, Weekday, WeeklySchedule } from '../../domain/types';
import { localeMeta, locales, type Locale } from '../../i18n/config';
import { useI18n } from '../../i18n/I18nProvider';
import '../../components/booking/booking.css';
import './onboarding.css';

const STEPS = ['business', 'type', 'service', 'hours', 'team', 'rules', 'preview'] as const;
type Step = (typeof STEPS)[number];
const KEY = storageKey('onboarding');

interface Draft {
  name: string;
  slug: string;
  slugTouched: boolean;
  phone: string;
  address: string;
  locale: Locale;
  timezone: string;
  currency: string;
  type: BusinessType | null;
  service: { name: string; duration: number; price: string };
  hours: WeeklySchedule;
  solo: boolean | null;
  team: string[];
  leadTimeMinutes: number;
  cancelWindowHours: number;
  confirmationMode: BookingPolicies['confirmationMode'];
}

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const ZONES = ['Asia/Jerusalem', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney'];
const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'AUD', 'CAD'];
const DURATIONS = [15, 20, 30, 45, 50, 60, 75, 90, 105, 120, 150, 180];

function fresh(locale: Locale): Draft {
  const he = locale === 'he';
  return {
    name: '',
    slug: '',
    slugTouched: false,
    phone: '',
    address: '',
    locale,
    timezone: isValidTimeZone(browserZone()) ? browserZone() : 'Asia/Jerusalem',
    currency: he ? 'ILS' : 'USD',
    type: null,
    service: { name: '', duration: 60, price: '' },
    hours: weeklyFrom(he ? [0, 1, 2, 3, 4] : [1, 2, 3, 4, 5], '09:00', '18:00'),
    solo: null,
    team: [''],
    leadTimeMinutes: 120,
    cancelWindowHours: 24,
    confirmationMode: 'auto',
  };
}

function load(locale: Locale): Draft {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return { ...fresh(locale), ...(JSON.parse(raw) as Partial<Draft>) };
  } catch {
    /* ignore */
  }
  return fresh(locale);
}

export default function OnboardingPage() {
  const { t, locale } = useI18n();
  const session = auth.useSession();
  const navigate = useNavigate();
  const [d, setD] = useState<Draft>(() => load(locale));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  useEffect(() => sessionStorage.setItem(KEY, JSON.stringify(d)), [d]);
  useLayoutEffect(() => window.scrollTo(0, 0), [step]);
  useEffect(() => {
    document.getElementById('step-title')?.focus({ preventScroll: true });
  }, [step]);

  const slugOk = SLUG_PATTERN.test(d.slug);
  const slugFree = slugOk && directory.isSlugAvailable(d.slug);
  const valid: Record<Step, boolean> = {
    business: d.name.trim().length > 1 && slugFree,
    type: !!d.type,
    service: d.service.name.trim().length > 1 && d.service.duration > 0 && d.service.price !== '' && Number(d.service.price) >= 0,
    hours: WEEKDAYS.some((w) => d.hours[w].ranges.length > 0),
    team: d.solo !== null,
    rules: true,
    preview: true,
  };
  const key = STEPS[step];

  if (!session) return <Navigate to="/sign-up" replace />;

  const create = async (publish: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await directory.createBusiness({
        name: d.name,
        slug: d.slug,
        type: d.type ?? 'other',
        locale: d.locale,
        timezone: d.timezone,
        currency: d.currency,
        phone: d.phone,
        address: d.address,
        service: { name: d.service.name, duration: d.service.duration, price: Number(d.service.price) || 0 },
        hours: d.hours,
        solo: !!d.solo,
        team: d.solo ? [] : d.team,
        policies: { leadTimeMinutes: d.leadTimeMinutes, cancelWindowHours: d.cancelWindowHours, confirmationMode: d.confirmationMode },
        publish,
      });
      sessionStorage.removeItem(KEY);
      navigate('/app', { replace: true });
    } catch (e) {
      setBusy(false);
      setError(e instanceof ApiError && e.code === 'slug_taken' ? t('onboarding.business.slugTaken') : t('common.unknownError'));
    }
  };

  const next = () => valid[key] && step < STEPS.length - 1 && setStep(step + 1);

  return (
    <div className="booking onb">
      <header className="booking__bar">
        <div className="booking__bar-inner">
          <Link to="/" className="booking__logo">
            <ProductWordmark />
          </Link>
          <nav className="progress" aria-label={t('onboarding.title')}>
            <ol>
              {STEPS.map((k, i) => (
                <li key={k} data-state={i < step ? 'done' : i === step ? 'current' : 'todo'}>
                  {i < step ? (
                    <button type="button" onClick={() => setStep(i)}>
                      <CheckIcon size={12} /> <span className="progress__label">{t(`onboarding.steps.${k}`)}</span>
                    </button>
                  ) : (
                    <span aria-current={i === step ? 'step' : undefined}>
                      <span className="progress__label">{t(`onboarding.steps.${k}`)}</span>
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <p className="progress__mobile">
              <span className="muted">{t('onboarding.stepOf', { current: step + 1, total: STEPS.length })}</span> · {t(`onboarding.steps.${key}`)}
            </p>
          </nav>
          <Link to={session.active ? '/app' : '/'} className="booking__close" aria-label={t('onboarding.exit')}>
            <CloseIcon size={18} />
          </Link>
        </div>
        <div className="progress__bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${(step + 1) / STEPS.length})` }} />
        </div>
      </header>

      <main className="onb__main" id="main">
        {step > 0 && (
          <button type="button" className="booking__back" onClick={() => setStep(step - 1)}>
            <ArrowBackIcon size={14} /> {t(`onboarding.steps.${STEPS[step - 1]}`)}
          </button>
        )}
        <div key={step} className="booking__step">
          {key === 'business' && <StepBusiness d={d} update={update} slugOk={slugOk} slugFree={slugFree} />}
          {key === 'type' && <StepType d={d} update={update} onPick={() => setStep(step + 1)} />}
          {key === 'service' && <StepService d={d} update={update} />}
          {key === 'hours' && <StepHours d={d} update={update} />}
          {key === 'team' && <StepTeam d={d} update={update} />}
          {key === 'rules' && <StepRules d={d} update={update} />}
          {key === 'preview' && <StepPreview d={d} />}
        </div>
        {error && (
          <p className="booking__notice" role="alert">
            {error}
          </p>
        )}
        <div className="onb__actions">
          {key === 'preview' ? (
            <>
              <button type="button" className="btn btn--primary btn--lg" disabled={busy} onClick={() => create(true)}>
                {busy && <span className="spinner" aria-hidden />}
                {busy ? t('onboarding.preview.creating') : t('onboarding.preview.publish')}
              </button>
              <button type="button" className="btn btn--ghost btn--lg" disabled={busy} onClick={() => create(false)}>
                {t('onboarding.preview.draft')}
              </button>
              <p className="muted onb__hint">{t('onboarding.preview.draftHint')}</p>
            </>
          ) : (
            <button type="button" className="btn btn--primary btn--lg" aria-disabled={!valid[key]} onClick={next}>
              {t('common.continue')}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

interface StepProps {
  d: Draft;
  update: (p: Partial<Draft>) => void;
}

function Title({ title, lede }: { title: string; lede?: string }) {
  return (
    <div className="step-head">
      <h1 id="step-title" className="display step-head__title" tabIndex={-1}>
        {title}
      </h1>
      {lede && <p className="muted">{lede}</p>}
    </div>
  );
}

function StepBusiness({ d, update, slugOk, slugFree }: StepProps & { slugOk: boolean; slugFree: boolean }) {
  const { t } = useI18n();
  const zones = useMemo(() => [...new Set([d.timezone, browserZone(), ...ZONES])].filter(isValidTimeZone), [d.timezone]);
  const slugError = d.slug && !slugOk ? t('onboarding.business.slugInvalid') : d.slug && !slugFree ? t('onboarding.business.slugTaken') : null;
  return (
    <>
      <Title title={t('onboarding.business.title')} lede={t('onboarding.business.lede')} />
      <div className="details-form">
        <div className="field">
          <label className="field__label" htmlFor="ob-name">
            {t('onboarding.business.name')}
          </label>
          <input
            id="ob-name"
            className="field__input"
            value={d.name}
            autoComplete="organization"
            onChange={(e) => update({ name: e.target.value, ...(d.slugTouched ? {} : { slug: slugify(e.target.value) }) })}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ob-slug">
            {t('onboarding.business.slug')}
          </label>
          <div className="slug-field" dir="ltr">
            <span className="muted">/book/</span>
            <input
              id="ob-slug"
              className="field__input"
              value={d.slug}
              aria-invalid={!!slugError}
              aria-describedby="ob-slug-hint"
              onChange={(e) => update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''), slugTouched: true })}
            />
          </div>
          <p id="ob-slug-hint" className={slugError ? 'field__error' : 'field__hint'}>
            {slugError ?? t('onboarding.business.slugHint')}
          </p>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ob-phone">
            {t('onboarding.business.phone')} <span className="muted">({t('common.optional')})</span>
          </label>
          <input id="ob-phone" className="field__input" type="tel" dir="ltr" value={d.phone} onChange={(e) => update({ phone: e.target.value })} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ob-address">
            {t('onboarding.business.address')} <span className="muted">({t('common.optional')})</span>
          </label>
          <input id="ob-address" className="field__input" value={d.address} onChange={(e) => update({ address: e.target.value })} aria-describedby="ob-address-hint" />
          <p id="ob-address-hint" className="field__hint">
            {t('onboarding.business.addressHint')}
          </p>
        </div>
        <div className="onb__row">
          <div className="field">
            <label className="field__label" htmlFor="ob-locale">
              {t('onboarding.business.language')}
            </label>
            <select id="ob-locale" className="field__input" value={d.locale} onChange={(e) => update({ locale: e.target.value as Locale })}>
              {locales.map((l) => (
                <option key={l} value={l}>
                  {localeMeta[l].label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="ob-tz">
              {t('onboarding.business.timezone')}
            </label>
            <select id="ob-tz" className="field__input" value={d.timezone} onChange={(e) => update({ timezone: e.target.value })}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="ob-cur">
              {t('onboarding.business.currency')}
            </label>
            <select id="ob-cur" className="field__input" value={d.currency} onChange={(e) => update({ currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </>
  );
}

function StepType({ d, update, onPick }: StepProps & { onPick: () => void }) {
  const { t, tx } = useI18n();
  return (
    <>
      <Title title={t('onboarding.type.title')} lede={t('onboarding.type.lede')} />
      <div className="onb__types" role="radiogroup" aria-labelledby="step-title">
        {BUSINESS_TYPES.map((type) => (
          <label key={type} className="onb__type" data-selected={d.type === type}>
            <input
              type="radio"
              name="type"
              className="sr-only"
              checked={d.type === type}
              onChange={() => {
                const tpl = SERVICE_TEMPLATES[type][0];
                update({ type, ...(d.service.name ? {} : { service: { ...d.service, name: tx(tpl.name), duration: tpl.duration } }) });
                onPick();
              }}
            />
            {t(`businessType.${type}`)}
          </label>
        ))}
      </div>
    </>
  );
}

function StepService({ d, update }: StepProps) {
  const { t, tx, fmt } = useI18n();
  const templates = SERVICE_TEMPLATES[d.type ?? 'other'];
  return (
    <>
      <Title title={t('onboarding.service.title')} lede={t('onboarding.service.lede')} />
      <p className="onb__label">{t('onboarding.service.suggestions')}</p>
      <div className="onb__chips">
        {templates.map((tpl) => (
          <button key={tpl.name.en} type="button" className="chip" aria-pressed={d.service.name === tx(tpl.name)} onClick={() => update({ service: { ...d.service, name: tx(tpl.name), duration: tpl.duration } })}>
            {tx(tpl.name)} · {fmt.duration(tpl.duration)}
          </button>
        ))}
      </div>
      <div className="details-form">
        <div className="field">
          <label className="field__label" htmlFor="ob-svc">
            {t('onboarding.service.name')}
          </label>
          <input id="ob-svc" className="field__input" value={d.service.name} onChange={(e) => update({ service: { ...d.service, name: e.target.value } })} />
        </div>
        <div className="onb__row">
          <div className="field">
            <label className="field__label" htmlFor="ob-dur">
              {t('onboarding.service.duration')}
            </label>
            <select id="ob-dur" className="field__input" value={d.service.duration} onChange={(e) => update({ service: { ...d.service, duration: Number(e.target.value) } })}>
              {[...new Set([...DURATIONS, d.service.duration])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>
                  {fmt.duration(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="ob-price">
              {t('onboarding.service.price')} ({d.currency})
            </label>
            <input id="ob-price" className="field__input tabular" type="number" min={0} inputMode="decimal" dir="ltr" value={d.service.price} onChange={(e) => update({ service: { ...d.service, price: e.target.value } })} />
          </div>
        </div>
      </div>
    </>
  );
}

function StepHours({ d, update }: StepProps) {
  const { t, fmt } = useI18n();
  const order: Weekday[] = d.locale === 'he' || d.timezone === 'Asia/Jerusalem' ? WEEKDAYS : [1, 2, 3, 4, 5, 6, 0];
  const set = (w: Weekday, open: boolean, start?: number, end?: number) => {
    const cur = d.hours[w].ranges[0] ?? range('09:00', '18:00');
    const r = { start: start ?? cur.start, end: end ?? cur.end };
    update({ hours: { ...d.hours, [w]: open ? dayHours([r.end > r.start ? r : cur]) : dayHours() } });
  };
  const copy = () => {
    const first = order.map((w) => d.hours[w].ranges[0]).find(Boolean);
    if (!first) return;
    update({ hours: Object.fromEntries(WEEKDAYS.map((w) => [w, d.hours[w].ranges.length ? dayHours([{ ...first }]) : dayHours()])) as WeeklySchedule });
  };
  return (
    <>
      <Title title={t('onboarding.hours.title')} lede={t('onboarding.hours.lede')} />
      <ul className="onb__hours">
        {order.map((w) => {
          const r = d.hours[w].ranges[0];
          return (
            <li key={w} className="onb__day" data-open={!!r}>
              <label className="switch">
                <input type="checkbox" role="switch" checked={!!r} onChange={(e) => set(w, e.target.checked)} />
                <span>{fmt.weekday(w)}</span>
              </label>
              {r ? (
                <span className="onb__times">
                  <TimeSelect value={r.start} onChange={(m) => set(w, true, m)} label={`${fmt.weekday(w)} ${t('common.from')}`} step={30} from={5 * 60} to={23 * 60} />
                  <span aria-hidden>-</span>
                  <TimeSelect value={r.end} onChange={(m) => set(w, true, undefined, m)} label={`${fmt.weekday(w)} ${t('common.to')}`} step={30} from={6 * 60} to={24 * 60 - 30} />
                </span>
              ) : (
                <span className="muted">{t('common.closed')}</span>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn btn--quiet btn--sm" onClick={copy}>
        {t('onboarding.hours.copyToAll')}
      </button>
    </>
  );
}

function StepTeam({ d, update }: StepProps) {
  const { t } = useI18n();
  return (
    <>
      <Title title={t('onboarding.team.title')} />
      <div className="choice-group" role="radiogroup" aria-labelledby="step-title">
        {[
          { v: true, title: t('onboarding.team.solo'), body: t('onboarding.team.soloBody') },
          { v: false, title: t('onboarding.team.withTeam'), body: t('onboarding.team.teamBody') },
        ].map((o) => (
          <label key={String(o.v)} className="choice" data-selected={d.solo === o.v}>
            <input type="radio" name="solo" className="sr-only" checked={d.solo === o.v} onChange={() => update({ solo: o.v })} />
            <span className="choice__main">
              <span className="choice__title">{o.title}</span>
              <span className="choice__desc">{o.body}</span>
            </span>
            <span className="choice__tick" aria-hidden="true">
              <CheckIcon size={12} />
            </span>
          </label>
        ))}
      </div>
      {d.solo === false && (
        <div className="details-form onb__team">
          {d.team.map((name, i) => (
            <div key={i} className="field">
              <label className="field__label" htmlFor={`ob-team-${i}`}>
                {t('onboarding.team.member', { n: i + 1 })}
              </label>
              <input id={`ob-team-${i}`} className="field__input" value={name} onChange={(e) => update({ team: d.team.map((x, j) => (j === i ? e.target.value : x)) })} />
            </div>
          ))}
          <button type="button" className="btn btn--quiet btn--sm" onClick={() => update({ team: [...d.team, ''] })}>
            <PlusIcon /> {t('onboarding.team.addMember')}
          </button>
          <p className="field__hint">{t('onboarding.team.note')}</p>
        </div>
      )}
    </>
  );
}

function StepRules({ d, update }: StepProps) {
  const { t, fmt } = useI18n();
  const notice = [0, 60, 120, 240, 720, 1440, 2880];
  const windows = [0, 2, 12, 24, 48];
  const label = (m: number) => (m === 0 ? t('common.none') : m >= 1440 ? t('units.daysLong', { count: m / 1440 }) : m >= 60 ? t('units.hoursLong', { count: m / 60 }) : fmt.duration(m));
  return (
    <>
      <Title title={t('onboarding.rules.title')} />
      <div className="details-form">
        <div className="field">
          <label className="field__label" htmlFor="ob-notice">
            {t('onboarding.rules.notice')}
          </label>
          <select id="ob-notice" className="field__input" value={d.leadTimeMinutes} onChange={(e) => update({ leadTimeMinutes: Number(e.target.value) })} aria-describedby="ob-notice-hint">
            {notice.map((m) => (
              <option key={m} value={m}>
                {label(m)}
              </option>
            ))}
          </select>
          <p id="ob-notice-hint" className="field__hint">
            {t('onboarding.rules.noticeHint')}
          </p>
        </div>
        <div className="field">
          <span className="field__label" id="ob-cancel-l">
            {t('onboarding.rules.cancel')}
          </span>
          <Segmented
            label={t('onboarding.rules.cancel')}
            value={String(d.cancelWindowHours)}
            options={windows.map((h) => ({ value: String(h), label: h === 0 ? t('common.none') : t('units.hoursBefore', { count: h }) }))}
            onChange={(v) => update({ cancelWindowHours: Number(v) })}
          />
        </div>
        <fieldset className="choice-group">
          <legend className="field__label">{t('onboarding.rules.confirmation')}</legend>
          {(['auto', 'manual'] as const).map((m) => (
            <label key={m} className="choice" data-selected={d.confirmationMode === m}>
              <input type="radio" name="confirm" className="sr-only" checked={d.confirmationMode === m} onChange={() => update({ confirmationMode: m })} />
              <span className="choice__main">
                <span className="choice__title">{t(`onboarding.rules.${m}`)}</span>
                <span className="choice__desc">{t(`onboarding.rules.${m}Body`)}</span>
              </span>
              <span className="choice__tick" aria-hidden="true">
                <CheckIcon size={12} />
              </span>
            </label>
          ))}
        </fieldset>
      </div>
    </>
  );
}

function StepPreview({ d }: { d: Draft }) {
  const { t, fmt } = useI18n();
  const money = new Intl.NumberFormat(localeMeta[d.locale].intl, { style: 'currency', currency: d.currency, minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const open = WEEKDAYS.filter((w) => d.hours[w].ranges.length);
  return (
    <>
      <Title title={t('onboarding.preview.title')} lede={t('onboarding.preview.lede')} />
      <p className="onb__label">{t('onboarding.preview.url')}</p>
      <p className="onb__url ltr">/book/{d.slug}</p>
      <div className="onb__preview" data-accent="fig">
        <BusinessMark name={d.name} className="biz-mark--xl" />
        <p className="display onb__preview-name">{d.name}</p>
        <div className="svc-row onb__preview-row">
          <span className="svc-row__name">{d.service.name}</span>
          <span className="svc-row__meta">{fmt.duration(d.service.duration)}</span>
          <span className="svc-row__price tabular">{money.format(Number(d.service.price) || 0)}</span>
        </div>
        <p className="muted">
          {open.map((w) => fmt.weekday(w, 'short')).join(' · ')} · {d.hours[open[0]]?.ranges[0] && fmt.timeRange(d.hours[open[0]].ranges[0].start, d.hours[open[0]].ranges[0].end)}
        </p>
        <span className="btn btn--primary" aria-hidden>
          {t('common.book')}
        </span>
      </div>
    </>
  );
}
