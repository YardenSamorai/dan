import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { TimeSelect } from '../../app/shared';
import { Confetti } from '../../components/ui/Confetti';
import { ACCENT_KEYS, ACCENTS } from '../../components/ui/accents';
import { BusinessMark, CheckIcon, ChevronDown, ChevronLeft, ClockIcon, CloseIcon, LinkIcon, MinusIcon, PinIcon, PlusIcon, UserIcon, UsersIcon } from '../../components/ui/Icons';
import { Avatar, ProductWordmark } from '../../components/ui/bits';
import { storageKey } from '../../config/product';
import { ApiError, auth, directory } from '../../data';
import { BUSINESS_TYPES, dayHours, latinSlug, range, SERVICE_TEMPLATES, SLUG_PATTERN, STAFF_COLORS, WEEKDAYS, weeklyFrom } from '../../domain/defaults';
import { addDays, isValidTimeZone, todayISO, weekdayOf } from '../../domain/time';
import type { AccentKey, BookingPolicies, BusinessType, TimeRange, Weekday, WeeklySchedule } from '../../domain/types';
import { localeMeta, locales, type Locale } from '../../i18n/config';
import { useI18n } from '../../i18n/I18nProvider';
import { FinaleScene } from './FinaleScene';
import type { FinaleText } from './finaleStage';
import { WelcomeScene } from './WelcomeScene';
import './onboarding.css';

const STEPS = ['welcome', 'name', 'type', 'service', 'hours', 'team', 'rules', 'contact', 'review'] as const;
type Step = (typeof STEPS)[number];
const QUESTIONS = STEPS.slice(1);
const KEY = storageKey('onboarding');
const STEP_KEY = storageKey('onboarding.step');

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
  accent: AccentKey;
}

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const ZONES = ['Asia/Jerusalem', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney'];
const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'AUD', 'CAD'];
const DURATIONS = [15, 20, 30, 45, 50, 60, 75, 90, 105, 120, 150, 180, 240];
const NOTICE = [0, 60, 120, 1440] as const;
const CANCEL = [0, 2, 12, 24, 48] as const;

const TYPE_ICON: Record<BusinessType, string> = {
  nails: '💅',
  lashes_brows: '👁️',
  hair: '✂️',
  makeup: '💄',
  skin: '🧴',
  massage: '💆',
  fitness: '🏋️',
  therapy: '🌿',
  tutoring: '📚',
  other: '✨',
};

const CONFETTI = [ACCENTS.fig, ACCENTS.rose, ACCENTS.gold, ACCENTS.sage, ACCENTS.ocean, '#0f6b66', '#f2c14e', '#f4a6b8', '#9ad0c2'];

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
    accent: 'fig',
  };
}

const isRange = (r: unknown): r is TimeRange =>
  !!r && typeof (r as TimeRange).start === 'number' && typeof (r as TimeRange).end === 'number';
const isWeek = (h: unknown): h is WeeklySchedule =>
  !!h && WEEKDAYS.every((w) => Array.isArray((h as WeeklySchedule)[w]?.ranges) && (h as WeeklySchedule)[w].ranges.every(isRange));

/** A draft saved by an older version of this page may not match `Draft`; keep only what still fits. */
function revive(saved: Record<string, unknown>, base: Draft): Draft {
  const out = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof Draft)[]) {
    const v = saved[key];
    const b = base[key];
    if (v === undefined) continue;
    if (key === 'type') out.type = BUSINESS_TYPES.includes(v as BusinessType) ? v : null;
    else if (key === 'solo') out.solo = typeof v === 'boolean' ? v : null;
    else if (key === 'accent') out.accent = ACCENT_KEYS.includes(v as AccentKey) ? v : b;
    else if (key === 'locale') out.locale = locales.includes(v as Locale) ? v : b;
    else if (key === 'timezone') out.timezone = typeof v === 'string' && isValidTimeZone(v) ? v : b;
    else if (key === 'hours') out.hours = isWeek(v) ? v : b;
    else if (key === 'team') out.team = Array.isArray(v) && v.length && v.every((x) => typeof x === 'string') ? v : b;
    else if (key === 'service') {
      const s = v as Partial<Draft['service']>;
      out.service = {
        name: typeof s?.name === 'string' ? s.name : '',
        duration: typeof s?.duration === 'number' && s.duration > 0 ? s.duration : base.service.duration,
        price: typeof s?.price === 'string' ? s.price : typeof s?.price === 'number' ? String(s.price) : '',
      };
    } else if (typeof v === typeof b) out[key] = v;
  }
  return out as unknown as Draft;
}

function load(locale: Locale): Draft {
  try {
    const raw = sessionStorage.getItem(KEY);
    const saved: unknown = raw ? JSON.parse(raw) : null;
    if (saved && typeof saved === 'object') return revive(saved as Record<string, unknown>, fresh(locale));
  } catch {
    /* ignore */
  }
  return fresh(locale);
}

function validity(d: Draft, slugFree: boolean): Record<Step, boolean> {
  return {
    welcome: true,
    name: d.name.trim().length > 1 && slugFree,
    type: !!d.type,
    service: d.service.name.trim().length > 1 && d.service.duration > 0 && d.service.price !== '' && Number(d.service.price) >= 0,
    hours: openRanges(d.hours).length > 0,
    team: d.solo !== null,
    rules: true,
    contact: true,
    review: true,
  };
}

/** The saved step, or the first earlier one that still needs an answer. */
function loadStep(d: Draft): Step {
  const s = sessionStorage.getItem(STEP_KEY);
  const saved = STEPS.includes(s as Step) ? (s as Step) : 'welcome';
  const valid = validity(d, SLUG_PATTERN.test(d.slug) && directory.isSlugAvailable(d.slug));
  return STEPS.slice(0, STEPS.indexOf(saved)).find((step) => !valid[step]) ?? saved;
}

/** A free link derived from the name; numbered when the plain one is taken. */
function autoSlug(name: string) {
  let base = latinSlug(name).slice(0, 34).replace(/-+$/, '');
  if (!base) return '';
  if (base.length < 3) base = `${base}-book`;
  if (directory.isSlugAvailable(base)) return base;
  for (let i = 2; i < 100; i++) if (directory.isSlugAvailable(`${base}-${i}`)) return `${base}-${i}`;
  return base;
}

const openRanges = (h: WeeklySchedule) => WEEKDAYS.map((w) => h[w].ranges[0]).filter(Boolean);
const commonRange = (h: WeeklySchedule): TimeRange => openRanges(h)[0] ?? range('09:00', '18:00');
const isUniform = (h: WeeklySchedule) => {
  const [first, ...rest] = openRanges(h);
  return rest.every((r) => r.start === first.start && r.end === first.end);
};

const weekOrder = (d: Draft): Weekday[] => (d.locale === 'he' || d.timezone === 'Asia/Jerusalem' ? WEEKDAYS : [1, 2, 3, 4, 5, 6, 0]);
const host = () => window.location.host;

function useMoney(currency: string) {
  const { locale } = useI18n();
  return useMemo(() => {
    const intl = localeMeta[locale].intl;
    const f = new Intl.NumberFormat(intl, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return { format: (n: number) => f.format(n), symbol: f.formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency };
  }, [currency, locale]);
}

/** "Sun–Thu", or "Sun, Tue, Thu" when the open days aren't consecutive. */
function useDaysLabel(d: Draft) {
  const { fmt, locale } = useI18n();
  const width = locale === 'he' ? 'narrow' : 'short';
  const order = weekOrder(d);
  const open = order.filter((w) => d.hours[w].ranges.length);
  if (!open.length) return '';
  const consecutive = open.length > 2 && order.indexOf(open[open.length - 1]) - order.indexOf(open[0]) === open.length - 1;
  return consecutive ? `${fmt.weekday(open[0], width)}–${fmt.weekday(open[open.length - 1], width)}` : open.map((w) => fmt.weekday(w, width)).join(', ');
}

export default function OnboardingPage() {
  const { t, locale } = useI18n();
  const session = auth.useSession();
  directory.useSlugChecks();
  const [d, setD] = useState<Draft>(() => load(locale));
  const [step, setStep] = useState<Step>(() => loadStep(d));
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState(0);
  const [sceneFocus, setSceneFocus] = useState<number | null>(null);
  const [fromReview, setFromReview] = useState(false);
  const [done, setDone] = useState<{ slug: string; published: boolean } | null>(null);
  const update = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  useEffect(() => {
    sessionStorage.setItem(KEY, JSON.stringify(d));
  }, [d]);
  useEffect(() => {
    sessionStorage.setItem(STEP_KEY, step);
  }, [step]);
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);
  useEffect(() => {
    const target = document.querySelector<HTMLElement>('[data-autofocus]') ?? document.getElementById('step-title');
    target?.focus({ preventScroll: true });
  }, [step, done]);

  const slugOk = SLUG_PATTERN.test(d.slug);
  const slugFree = slugOk && directory.isSlugAvailable(d.slug);
  const valid = validity(d, slugFree);
  const index = STEPS.indexOf(step);

  if (!session) return <Navigate to="/sign-up" replace />;
  if (done) return <Done {...done} d={d} />;

  const go = (to: Step) => {
    setDir(STEPS.indexOf(to) >= index ? 'fwd' : 'back');
    setNudge(0);
    setError(null);
    if (to === 'review') setFromReview(false);
    setStep(to);
  };

  const next = () => {
    if (!valid[step]) return setNudge((n) => n + 1);
    if (fromReview) go('review');
    else if (index < STEPS.length - 1) go(STEPS[index + 1]);
  };

  const edit = (to: Step) => {
    go(to);
    setFromReview(true);
  };

  const create = async (publish: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const { slug } = await directory.createBusiness({
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
        accent: d.accent,
        publish,
      });
      sessionStorage.removeItem(KEY);
      sessionStorage.removeItem(STEP_KEY);
      setDone({ slug, published: publish });
    } catch (e) {
      setBusy(false);
      setError(e instanceof ApiError && e.code === 'slug_taken' ? t('onboarding.business.slugTaken') : t('common.unknownError'));
    }
  };

  const needs: Partial<Record<Step, string>> = {
    name: t('onboarding.business.need'),
    type: t('onboarding.type.need'),
    service: t('onboarding.service.need'),
    hours: t('onboarding.hours.need'),
    team: t('onboarding.team.need'),
  };
  const props = { d, update };
  const contactEmpty = !d.phone.trim() && !d.address.trim();

  return (
    <div className="onb">
      <header className="onb__bar">
        <div className="onb__bar-side">
          {index > 0 && (
            <button type="button" className="onb__icon-btn" onClick={() => go(STEPS[index - 1])} aria-label={t('onboarding.back')}>
              <ChevronLeft size={20} />
            </button>
          )}
        </div>
        {index > 0 ? (
          <div className="onb-progress">
            <div className="onb-progress__track" role="progressbar" aria-valuemin={1} aria-valuemax={QUESTIONS.length} aria-valuenow={index} aria-valuetext={t('onboarding.stepOf', { current: index, total: QUESTIONS.length })}>
              {QUESTIONS.map((q, i) => (
                <i key={q} data-on={i < index} />
              ))}
            </div>
            <p className="onb-progress__text">
              {t('onboarding.stepOf', { current: index, total: QUESTIONS.length })}
            </p>
          </div>
        ) : (
          <Link to="/" className="onb__logo">
            <ProductWordmark />
          </Link>
        )}
        <div className="onb__bar-side onb__bar-side--end">
          <Link to={session.active ? '/app' : '/'} className="onb__icon-btn" aria-label={t('onboarding.exit')}>
            <CloseIcon size={18} />
          </Link>
        </div>
      </header>

      <div className="onb__layout" data-preview={step !== 'welcome'} data-welcome={step === 'welcome' || undefined}>
        <main className="onb__main" id="main">
          <form
            key={step}
            className="onb__step"
            data-dir={dir}
            data-step={step}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (step === 'review') create(true);
              else next();
            }}
          >
            {step === 'welcome' && <StepWelcome onFocus={setSceneFocus} />}
            {step === 'name' && <StepName {...props} slugOk={slugOk} slugFree={slugFree} nudge={nudge} />}
            {step === 'type' && <StepType {...props} onPick={() => window.setTimeout(() => go(fromReview ? 'review' : 'service'), 320)} />}
            {step === 'service' && <StepService {...props} />}
            {step === 'hours' && <StepHours {...props} />}
            {step === 'team' && <StepTeam {...props} />}
            {step === 'rules' && <StepRules {...props} />}
            {step === 'contact' && <StepContact {...props} />}
            {step === 'review' && <StepReview {...props} go={edit} />}

            {error && (
              <p className="onb__error" role="alert">
                {error}
              </p>
            )}
            {nudge > 0 && !valid[step] && needs[step] && (
              <p key={nudge} className="onb__need" role="status">
                {needs[step]}
              </p>
            )}

            <div className="onb__actions">
              {step === 'review' ? (
                <>
                  <button type="submit" className="btn btn--primary btn--lg" disabled={busy}>
                    {busy && <span className="spinner" aria-hidden />}
                    {busy ? t('onboarding.review.creating') : t('onboarding.review.publish')}
                  </button>
                  <button type="button" className="btn btn--quiet btn--lg" disabled={busy} onClick={() => create(false)}>
                    {t('onboarding.review.draft')}
                  </button>
                  <p className="onb__hint">{t('onboarding.review.draftHint')}</p>
                </>
              ) : (
                <button key={nudge} type="submit" className="btn btn--primary btn--lg" aria-disabled={!valid[step]} data-nudge={nudge > 0 && !valid[step]}>
                  {step === 'welcome' ? t('onboarding.welcome.start') : step === 'contact' && contactEmpty ? t('onboarding.skip') : t('onboarding.continue')}
                </button>
              )}
            </div>
          </form>
        </main>

        {step === 'welcome' && (
          <div className="onb-scene" aria-hidden>
            <WelcomeScene focus={sceneFocus} />
          </div>
        )}
        {step !== 'welcome' && (
          <aside className="onb__aside" aria-label={t('onboarding.preview.label')}>
            <PhonePreview d={d} />
          </aside>
        )}
      </div>
    </div>
  );
}

interface StepProps {
  d: Draft;
  update: (p: Partial<Draft>) => void;
}

function Head({ title, lede }: { title: string; lede?: string }) {
  return (
    <div className="onb__head">
      <h1 id="step-title" className="onb__title" tabIndex={-1}>
        {title}
      </h1>
      {lede && <p className="onb__lede">{lede}</p>}
    </div>
  );
}

function StepWelcome({ onFocus }: { onFocus: (i: number | null) => void }) {
  const { t } = useI18n();
  return (
    <div className="onb-welcome">
      <Head title={t('onboarding.welcome.title')} lede={t('onboarding.welcome.lede')} />
      <p className="sr-only">{t('onboarding.welcome.what')}</p>
      <ol className="onb-welcome__list" onPointerLeave={() => onFocus(null)}>
        {(['business', 'offer', 'booking'] as const).map((k, i) => (
          <li key={k} style={{ '--i': i } as CSSProperties} onPointerEnter={() => onFocus(i)}>
            <span className="onb-welcome__num" aria-hidden>
              {i + 1}
            </span>
            <span className="onb-welcome__text">{t(`onboarding.welcome.${k}`)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepName({ d, update, slugOk, slugFree, nudge }: StepProps & { slugOk: boolean; slugFree: boolean; nudge: number }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const slugError = d.slug && !slugOk ? t('onboarding.business.slugInvalid') : d.slug && !slugFree ? t('onboarding.business.slugTaken') : null;
  const named = d.name.trim().length > 1;
  const showEditor = editing || (named && nudge > 0 && !slugFree);
  return (
    <>
      <Head title={t('onboarding.business.title')} lede={t('onboarding.business.lede')} />
      <div className="field">
        <label className="field__label" htmlFor="ob-name">
          {t('onboarding.business.name')}
        </label>
        <input
          id="ob-name"
          data-autofocus
          className="field__input onb__big-input"
          value={d.name}
          placeholder={t('onboarding.business.namePlaceholder')}
          autoComplete="organization"
          maxLength={60}
          onChange={(e) => update({ name: e.target.value, ...(d.slugTouched ? {} : { slug: autoSlug(e.target.value) }) })}
        />
      </div>
      {showEditor ? (
        <div className="field onb-link onb-link--edit">
          <label className="field__label" htmlFor="ob-slug">
            {t('onboarding.business.slug')}
          </label>
          <div className="onb-link__box" dir="ltr">
            <span className="onb-link__prefix">{host()}/book/</span>
            <input
              id="ob-slug"
              className="onb-link__input"
              value={d.slug}
              aria-invalid={!!slugError}
              aria-describedby="ob-slug-hint"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''), slugTouched: true })}
            />
          </div>
          <p id="ob-slug-hint" className={slugError ? 'field__error' : 'field__hint'}>
            {slugError ?? t('onboarding.business.slugHint')}
          </p>
          {editing && !slugError && slugOk && (
            <button type="button" className="onb-link__change" onClick={() => setEditing(false)}>
              {t('onboarding.business.linkDone')}
            </button>
          )}
        </div>
      ) : (
        d.slug && (
          <p className="onb-link" aria-live="polite">
            <LinkIcon size={14} />
            <span>{t('onboarding.business.link')}</span>
            <bdi className="onb-link__url ltr">
              {host()}/book/<b>{d.slug}</b>
            </bdi>
            <button type="button" className="onb-link__change" onClick={() => setEditing(true)}>
              {t('onboarding.business.linkEdit')}
            </button>
          </p>
        )
      )}
    </>
  );
}

function StepType({ d, update, onPick }: StepProps & { onPick: () => void }) {
  const { t, tx } = useI18n();
  return (
    <>
      <Head title={t('onboarding.type.title')} lede={t('onboarding.type.lede')} />
      <div className="onb-types" role="radiogroup" aria-labelledby="step-title">
        {BUSINESS_TYPES.map((type, i) => (
          <label key={type} className="onb-type" data-selected={d.type === type} style={{ '--i': i } as CSSProperties}>
            <input
              type="radio"
              name="type"
              className="sr-only"
              checked={d.type === type}
              onChange={() => {
                const tpl = SERVICE_TEMPLATES[type][0];
                const prevTemplates = d.type ? SERVICE_TEMPLATES[d.type].map((x) => tx(x.name)) : [];
                const keepName = d.service.name && !prevTemplates.includes(d.service.name);
                update({ type, ...(keepName ? {} : { service: { ...d.service, name: tx(tpl.name), duration: tpl.duration } }) });
                onPick();
              }}
            />
            <span className="onb-type__icon" aria-hidden>
              {TYPE_ICON[type]}
            </span>
            <span className="onb-type__label">{t(`businessType.${type}`)}</span>
          </label>
        ))}
      </div>
    </>
  );
}

function StepService({ d, update }: StepProps) {
  const { t, tx, fmt } = useI18n();
  const money = useMoney(d.currency);
  const templates = SERVICE_TEMPLATES[d.type ?? 'other'];
  const svc = (patch: Partial<Draft['service']>) => update({ service: { ...d.service, ...patch } });
  const shorter = [...DURATIONS].reverse().find((m) => m < d.service.duration);
  const longer = DURATIONS.find((m) => m > d.service.duration);
  return (
    <>
      <Head title={t('onboarding.service.title')} lede={t('onboarding.service.lede')} />
      <p className="onb-q__label">{t('onboarding.service.suggestions')}</p>
      <div className="onb-chips">
        {templates.map((tpl) => (
          <button key={tpl.name.en} type="button" className="chip" aria-pressed={d.service.name === tx(tpl.name)} onClick={() => svc({ name: tx(tpl.name), duration: tpl.duration })}>
            {tx(tpl.name)}
          </button>
        ))}
      </div>
      <div className="field">
        <label className="field__label" htmlFor="ob-svc">
          {t('onboarding.service.name')}
        </label>
        <input id="ob-svc" className="field__input onb__big-input" value={d.service.name} placeholder={t('onboarding.service.namePlaceholder')} maxLength={60} onChange={(e) => svc({ name: e.target.value })} />
      </div>
      <div className="onb-q">
        <p className="onb-q__label" id="ob-dur-l">
          {t('onboarding.service.duration')}
        </p>
        <div className="onb-stepper" role="group" aria-labelledby="ob-dur-l">
          <button type="button" className="onb-stepper__btn" aria-label={t('onboarding.service.shorter')} disabled={!shorter} onClick={() => shorter && svc({ duration: shorter })}>
            <MinusIcon size={18} />
          </button>
          <output className="onb-stepper__value" aria-live="polite" key={d.service.duration}>
            {fmt.duration(d.service.duration)}
          </output>
          <button type="button" className="onb-stepper__btn" aria-label={t('onboarding.service.longer')} disabled={!longer} onClick={() => longer && svc({ duration: longer })}>
            <PlusIcon size={18} />
          </button>
        </div>
        <p className="field__hint">{t('onboarding.service.durationHint')}</p>
      </div>
      <div className="onb-q">
        <label className="onb-q__label" htmlFor="ob-price">
          {t('onboarding.service.price')}
        </label>
        <div className="onb-money" dir="ltr">
          <span className="onb-money__sym" aria-hidden>
            {money.symbol}
          </span>
          <input
            id="ob-price"
            className="field__input onb-money__input tabular"
            type="number"
            min={0}
            inputMode="decimal"
            placeholder="0"
            aria-label={`${t('onboarding.service.price')} (${d.currency})`}
            value={d.service.price}
            onChange={(e) => svc({ price: e.target.value })}
          />
        </div>
      </div>
    </>
  );
}

function StepHours({ d, update }: StepProps) {
  const { t, fmt } = useI18n();
  const [perDay, setPerDay] = useState(() => !isUniform(d.hours));
  const order = weekOrder(d);
  const common = commonRange(d.hours);
  const setDay = (w: Weekday, r: TimeRange | null) => update({ hours: { ...d.hours, [w]: r ? dayHours([r]) : dayHours() } });
  const setAll = (r: TimeRange) => {
    if (r.end <= r.start) return;
    update({ hours: Object.fromEntries(WEEKDAYS.map((w) => [w, d.hours[w].ranges.length ? dayHours([{ ...r }]) : dayHours()])) as WeeklySchedule });
  };
  const times = (r: TimeRange, onChange: (r: TimeRange) => void, label: string) => (
    <span className="onb-times">
      <TimeSelect value={r.start} onChange={(m) => m < r.end && onChange({ ...r, start: m })} label={`${label} ${t('common.from')}`} step={30} from={5 * 60} to={23 * 60} />
      <span aria-hidden>–</span>
      <TimeSelect value={r.end} onChange={(m) => m > r.start && onChange({ ...r, end: m })} label={`${label} ${t('common.to')}`} step={30} from={6 * 60} to={24 * 60 - 30} />
    </span>
  );
  return (
    <>
      <Head title={t('onboarding.hours.title')} lede={t('onboarding.hours.lede')} />
      {!perDay && (
        <>
          <div className="onb-q">
            <p className="onb-q__label" id="ob-days-l">
              {t('onboarding.hours.days')}
            </p>
            <div className="onb-days" role="group" aria-labelledby="ob-days-l">
              {order.map((w) => {
                const open = d.hours[w].ranges.length > 0;
                return (
                  <button key={w} type="button" className="onb-day" aria-pressed={open} aria-label={fmt.weekday(w)} onClick={() => setDay(w, open ? null : { ...common })}>
                    {fmt.weekday(w, 'narrow')}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="onb-q">
            <p className="onb-q__label">{t('onboarding.hours.time')}</p>
            {times(common, setAll, t('onboarding.hours.time'))}
          </div>
        </>
      )}
      {perDay && (
        <ul className="onb-week">
          {order.map((w) => {
            const r = d.hours[w].ranges[0];
            return (
              <li key={w} className="onb-week__day" data-open={!!r}>
                <label className="switch">
                  <input type="checkbox" role="switch" checked={!!r} onChange={(e) => setDay(w, e.target.checked ? { ...common } : null)} />
                  <span>{fmt.weekday(w)}</span>
                </label>
                {r ? times(r, (nr) => setDay(w, nr), fmt.weekday(w)) : <span className="muted">{t('onboarding.hours.closed')}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <label className="switch onb-perday">
        <input
          type="checkbox"
          role="switch"
          checked={perDay}
          onChange={(e) => {
            setPerDay(e.target.checked);
            if (!e.target.checked) setAll(common);
          }}
        />
        <span>{t('onboarding.hours.perDay')}</span>
      </label>
    </>
  );
}

function Option({ name, checked, onChange, icon, title, body }: { name: string; checked: boolean; onChange: () => void; icon?: ReactNode; title: string; body?: string }) {
  return (
    <label className="onb-option" data-selected={checked}>
      <input type="radio" name={name} className="sr-only" checked={checked} onChange={onChange} />
      {icon && (
        <span className="onb-option__icon" aria-hidden>
          {icon}
        </span>
      )}
      <span className="onb-option__text">
        <span className="onb-option__title">{title}</span>
        {body && <span className="onb-option__body">{body}</span>}
      </span>
      <span className="onb-option__tick" aria-hidden>
        <CheckIcon size={12} />
      </span>
    </label>
  );
}

function StepTeam({ d, update }: StepProps) {
  const { t } = useI18n();
  const setMember = (i: number, name: string) => update({ team: d.team.map((x, j) => (j === i ? name : x)) });
  return (
    <>
      <Head title={t('onboarding.team.title')} />
      <div className="onb-options" role="radiogroup" aria-labelledby="step-title">
        <Option name="solo" checked={d.solo === true} onChange={() => update({ solo: true })} icon={<UserIcon size={20} />} title={t('onboarding.team.solo')} body={t('onboarding.team.soloBody')} />
        <Option name="solo" checked={d.solo === false} onChange={() => update({ solo: false })} icon={<UsersIcon size={20} />} title={t('onboarding.team.withTeam')} body={t('onboarding.team.teamBody')} />
      </div>
      {d.solo === false && (
        <div className="onb-team">
          {d.team.map((name, i) => (
            <div key={i} className="onb-team__row">
              <Avatar name={name || '?'} color={STAFF_COLORS[(i + 1) % STAFF_COLORS.length]} />
              <input
                className="field__input"
                value={name}
                placeholder={t('onboarding.team.memberPlaceholder')}
                aria-label={t('onboarding.team.member', { n: i + 1 })}
                data-autofocus={i === d.team.length - 1 && !name ? true : undefined}
                maxLength={40}
                onChange={(e) => setMember(i, e.target.value)}
              />
              {d.team.length > 1 && (
                <button type="button" className="onb__icon-btn onb__icon-btn--sm" aria-label={t('onboarding.team.remove', { name: name || t('onboarding.team.member', { n: i + 1 }) })} onClick={() => update({ team: d.team.filter((_, j) => j !== i) })}>
                  <CloseIcon size={14} />
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn--tinted btn--sm onb-team__add" onClick={() => update({ team: [...d.team, ''] })}>
            <PlusIcon /> {t('onboarding.team.addMember')}
          </button>
          <p className="field__hint">{t('onboarding.team.note')}</p>
        </div>
      )}
    </>
  );
}

function Pills<T extends number>({ name, label, options, value, onChange, text }: { name: string; label: string; options: readonly T[]; value: T | number; onChange: (v: T) => void; text: (v: T) => string }) {
  return (
    <fieldset className="onb-q">
      <legend className="onb-q__label">{label}</legend>
      <div className="onb-pills">
        {options.map((o) => (
          <label key={o} className="onb-pill" data-selected={value === o}>
            <input type="radio" name={name} className="sr-only" checked={value === o} onChange={() => onChange(o)} />
            {text(o)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function StepRules({ d, update }: StepProps) {
  const { t } = useI18n();
  return (
    <>
      <Head title={t('onboarding.rules.title')} lede={t('onboarding.rules.lede')} />
      <Pills name="notice" label={t('onboarding.rules.notice')} options={NOTICE} value={d.leadTimeMinutes} onChange={(v) => update({ leadTimeMinutes: v })} text={(v) => t(`onboarding.rules.notice${v}`)} />
      <Pills name="cancel" label={t('onboarding.rules.cancel')} options={CANCEL} value={d.cancelWindowHours} onChange={(v) => update({ cancelWindowHours: v })} text={(v) => t(`onboarding.rules.cancel${v}`)} />
      <fieldset className="onb-q">
        <legend className="onb-q__label">{t('onboarding.rules.confirmation')}</legend>
        <div className="onb-options">
          {(['auto', 'manual'] as const).map((m) => (
            <Option key={m} name="confirm" checked={d.confirmationMode === m} onChange={() => update({ confirmationMode: m })} title={t(`onboarding.rules.${m}`)} />
          ))}
        </div>
      </fieldset>
    </>
  );
}

function StepContact({ d, update }: StepProps) {
  const { t, locale } = useI18n();
  const money = useMoney(d.currency);
  const zones = useMemo(() => [...new Set([d.timezone, browserZone(), ...ZONES])].filter(isValidTimeZone), [d.timezone]);
  const zoneName = (z: string) =>
    new Intl.DateTimeFormat(localeMeta[locale].intl, { timeZone: z, timeZoneName: 'longGeneric' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? z;
  return (
    <>
      <Head title={t('onboarding.contact.title')} lede={t('onboarding.contact.lede')} />
      <div className="field">
        <label className="field__label" htmlFor="ob-phone">
          {t('onboarding.contact.phone')} <span className="muted">({t('common.optional')})</span>
        </label>
        <input id="ob-phone" data-autofocus className="field__input onb__big-input" type="tel" dir="ltr" autoComplete="tel" value={d.phone} onChange={(e) => update({ phone: e.target.value })} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="ob-address">
          {t('onboarding.contact.address')} <span className="muted">({t('common.optional')})</span>
        </label>
        <input id="ob-address" className="field__input onb__big-input" autoComplete="street-address" value={d.address} onChange={(e) => update({ address: e.target.value })} aria-describedby="ob-address-hint" />
        <p id="ob-address-hint" className="field__hint">
          {t('onboarding.contact.addressHint')}
        </p>
      </div>
      <details className="onb-region">
        <summary>
          <span className="onb-region__text">
            <span className="onb-region__title">{t('onboarding.contact.region')}</span>
            <span className="onb-region__value">
              {localeMeta[d.locale].label}, {money.symbol} {d.currency}, {zoneName(d.timezone)}
            </span>
          </span>
          <span className="onb-region__change">
            {t('onboarding.contact.regionChange')} <ChevronDown size={14} />
          </span>
        </summary>
        <div className="onb-region__fields">
          <div className="field">
            <label className="field__label" htmlFor="ob-locale">
              {t('onboarding.contact.language')}
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
            <label className="field__label" htmlFor="ob-cur">
              {t('onboarding.contact.currency')}
            </label>
            <select id="ob-cur" className="field__input" value={d.currency} onChange={(e) => update({ currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="ob-tz">
              {t('onboarding.contact.timezone')}
            </label>
            <select id="ob-tz" className="field__input" value={d.timezone} onChange={(e) => update({ timezone: e.target.value })}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {zoneName(z)} ({z.split('/').pop()!.replace(/_/g, ' ')})
                </option>
              ))}
            </select>
          </div>
        </div>
      </details>
    </>
  );
}

function StepReview({ d, update, go }: StepProps & { go: (s: Step) => void }) {
  const { t, fmt } = useI18n();
  const money = useMoney(d.currency);
  const days = useDaysLabel(d);
  const team = d.team.filter((n) => n.trim()).length;
  const rows: { step: Step; label: string; value: ReactNode }[] = [
    { step: 'name', label: t('onboarding.review.link'), value: <bdi className="ltr">{host()}/book/{d.slug}</bdi> },
    { step: 'service', label: t('onboarding.review.service'), value: `${d.service.name}, ${fmt.duration(d.service.duration)}, ${money.format(Number(d.service.price) || 0)}` },
    { step: 'hours', label: t('onboarding.review.hours'), value: isUniform(d.hours) ? `${days}, ${fmt.timeRange(commonRange(d.hours).start, commonRange(d.hours).end)}` : days },
    { step: 'team', label: t('onboarding.review.team'), value: d.solo || !team ? t('onboarding.review.solo') : t('onboarding.review.teamCount', { count: team }) },
    { step: 'rules', label: t('onboarding.review.rules'), value: `${t(`onboarding.review.${d.confirmationMode === 'auto' ? 'autoShort' : 'manualShort'}`)}` },
  ];
  return (
    <>
      <Head title={t('onboarding.review.title')} lede={t('onboarding.review.lede')} />
      <fieldset className="onb-q">
        <legend className="onb-q__label">{t('onboarding.review.color')}</legend>
        <div className="onb-swatches">
          {ACCENT_KEYS.map((k) => (
            <label key={k} className="onb-swatch" style={{ '--c': ACCENTS[k] } as CSSProperties} title={t(`onboarding.review.colorName.${k}`)}>
              <input type="radio" name="accent" className="sr-only" checked={d.accent === k} onChange={() => update({ accent: k })} aria-label={t(`onboarding.review.colorName.${k}`)} />
              <CheckIcon size={16} />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="onb-review__phone">
        <PhonePreview d={d} />
      </div>
      <dl className="onb-summary">
        {rows.map((r) => (
          <div key={r.step} className="onb-summary__row">
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
            <button type="button" className="onb-summary__edit" onClick={() => go(r.step)} aria-label={t('onboarding.review.editItem', { item: r.label })}>
              {t('onboarding.review.edit')}
            </button>
          </div>
        ))}
      </dl>
    </>
  );
}

/** The customer's view, assembling itself as the owner answers. */
function PhonePreview({ d }: { d: Draft }) {
  const { t, fmt } = useI18n();
  const money = useMoney(d.currency);
  const days = useDaysLabel(d);
  const team = d.solo === false ? d.team.filter((n) => n.trim()) : [];
  const svcKey = `${d.service.name}|${d.service.duration}|${d.service.price}`;
  const common = commonRange(d.hours);
  return (
    <div className="phone" data-accent={d.accent} aria-hidden>
      <div className="phone__screen">
        <div className="phone__island" />
        <div className="phone__hero">
          <BusinessMark name={d.name || '·'} className="phone__mark" />
          {d.name.trim() ? (
            <p className="phone__name" key={d.name}>
              {d.name}
            </p>
          ) : (
            <span className="phone__skel phone__skel--title" />
          )}
          {d.type ? <p className="phone__meta">{[t(`businessType.${d.type}`), d.address.trim()].filter(Boolean).join(', ')}</p> : <span className="phone__skel phone__skel--meta" />}
        </div>

        <div className="phone__section">
          <p className="phone__h">{t('onboarding.preview.services')}</p>
          {d.service.name.trim() ? (
            <div className="phone__svc" key={svcKey}>
              <span className="phone__svc-text">
                <span className="phone__svc-name">{d.service.name}</span>
                <span className="phone__svc-meta">
                  <ClockIcon size={11} /> {fmt.duration(d.service.duration)}
                  {d.service.price !== '' && <> · {money.format(Number(d.service.price) || 0)}</>}
                </span>
              </span>
              <span className="phone__svc-btn">{t('onboarding.preview.book')}</span>
            </div>
          ) : (
            <div className="phone__svc phone__svc--empty">
              <span className="phone__skel" />
            </div>
          )}
          <div className="phone__svc phone__svc--ghost">
            <span className="phone__skel" />
          </div>
        </div>

        {team.length > 0 && (
          <div className="phone__section">
            <p className="phone__h">{t('onboarding.preview.team')}</p>
            <div className="phone__team">
              {team.slice(0, 5).map((n, i) => (
                <Avatar key={i} name={n} color={STAFF_COLORS[(i + 1) % STAFF_COLORS.length]} size="sm" />
              ))}
            </div>
          </div>
        )}

        <div className="phone__section">
          <p className="phone__h">{t('onboarding.preview.hours')}</p>
          <p className="phone__hours" key={`${days}|${common.start}|${common.end}`}>
            {days && (
              <>
                {days}
                {isUniform(d.hours) && (
                  <>
                    , <span className="ltr">{fmt.timeRange(common.start, common.end)}</span>
                  </>
                )}
              </>
            )}
          </p>
          {d.phone.trim() && (
            <p className="phone__hours">
              <span className="ltr">{d.phone}</span>
            </p>
          )}
          {d.address.trim() && (
            <p className="phone__hours">
              <PinIcon size={11} /> {d.address}
            </p>
          )}
        </div>

        <div className="phone__cta">{t('common.book')}</div>
      </div>
    </div>
  );
}

/** The first day the business is open after today. */
function sampleDay(h: WeeklySchedule) {
  const today = todayISO();
  for (let i = 1; i <= 7; i++) {
    const day = addDays(today, i);
    if (h[weekdayOf(day)].ranges.length) return day;
  }
  return addDays(today, 1);
}

/** What the last screen's scene shows: a sample booking on this business's real page and hours. */
function useFinaleText(d: Draft): FinaleText {
  const { t, fmt } = useI18n();
  const money = useMoney(d.currency);
  const day = sampleDay(d.hours);
  const open = d.hours[weekdayOf(day)].ranges[0] ?? range('09:00', '18:00');
  const duration = d.service.duration;
  const first = Math.ceil(open.start / 30) * 30;
  const slots: number[] = [];
  for (let m = first; m + duration <= open.end && slots.length < 6; m += 30) slots.push(m);
  if (!slots.length) slots.push(first);
  const picked = Math.min(2, slots.length - 1);
  const start = slots[picked];
  const firstHour = Math.max(Math.floor(open.start / 60) * 60, Math.floor(start / 60) * 60 - 60);
  return {
    business: d.name.trim(),
    meta: [d.type ? t(`businessType.${d.type}`) : '', d.address.trim()].filter(Boolean).join(', ') || t('onboarding.welcome.scene.tagline'),
    pickService: t('onboarding.welcome.scene.pickService'),
    service: d.service.name.trim(),
    serviceMeta: `${fmt.duration(duration)} · ${money.format(Number(d.service.price) || 0)}`,
    pickTime: t('onboarding.welcome.scene.pickTime'),
    slots: slots.map(fmt.time),
    picked,
    cta: t('onboarding.welcome.scene.cta'),
    day: fmt.date(day, 'medium'),
    example: t('onboarding.done.scene.example'),
    hours: [0, 1, 2, 3].map((i) => fmt.time(firstHour + i * 60)),
    firstHour,
    start,
    end: start + duration,
    range: `${fmt.time(start)}–${fmt.time(start + duration)}`,
    customer: t('onboarding.done.scene.customer'),
    isNew: t('onboarding.done.scene.isNew'),
  };
}

function Done({ slug, published, d }: { slug: string; published: boolean; d: Draft }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [scene, setScene] = useState(true);
  const finale = useFinaleText(d);
  const url = `${window.location.origin}/book/${slug}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* the link stays visible to copy by hand */
    }
  };
  return (
    <div className="onb onb--done" data-accent={d.accent} data-scene={scene || undefined}>
      {!scene && <Confetti colors={CONFETTI} />}
      <div className="onb-done__layout">
        {scene && (
          <div className="onb-scene onb-done__scene" aria-hidden>
            <FinaleScene text={finale} onUnavailable={() => setScene(false)} />
          </div>
        )}
        <main className="onb-done" id="main">
          {!scene && (
            <div className="onb-done__check" aria-hidden>
              <svg viewBox="0 0 52 52">
                <circle cx="26" cy="26" r="24" />
                <path d="m15 27 7.5 7.5L37.5 19" />
              </svg>
            </div>
          )}
          <h1 id="step-title" tabIndex={-1} className="onb__title">
            {published ? t('onboarding.done.liveTitle') : t('onboarding.done.draftTitle')}
          </h1>
          <p className="onb__lede">{published ? t('onboarding.done.liveLede') : t('onboarding.done.draftLede')}</p>
          {published && (
            <div className="onb-done__link">
              <bdi className="ltr onb-done__url">
                {host()}/book/<b>{slug}</b>
              </bdi>
              <button type="button" className="btn btn--tinted btn--sm" onClick={copy} aria-live="polite">
                {copied ? (
                  <>
                    <CheckIcon /> {t('onboarding.done.copied')}
                  </>
                ) : (
                  <>
                    <LinkIcon /> {t('onboarding.done.copy')}
                  </>
                )}
              </button>
            </div>
          )}
          <div className="onb-done__actions">
            <Link to="/app" replace className="btn btn--primary btn--lg">
              {t('onboarding.done.calendar')}
            </Link>
            <Link to={`/book/${slug}`} className="btn btn--ghost btn--lg">
              {t('onboarding.done.view')}
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
