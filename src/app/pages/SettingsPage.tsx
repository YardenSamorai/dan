import { useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, useNavigate, useParams } from 'react-router-dom';
import { accentStyle } from '../../components/ui/accents';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { AlertIcon, BusinessMark, ExternalIcon } from '../../components/ui/Icons';
import { Switch } from '../../components/ui/bits';
import { useToast } from '../../components/ui/Toast';
import { CAPABILITIES } from '../../config/product';
import { ApiError, directory, workspace } from '../../data';
import { BUSINESS_TYPES, SLUG_PATTERN } from '../../domain/defaults';
import { messageVars, renderTemplate, TEMPLATE_VARS } from '../../domain/notifications';
import type { Permission } from '../../domain/permissions';
import { businessNow, isUpcoming } from '../../domain/scheduling';
import { isValidTimeZone } from '../../domain/time';
import type { BookingPolicies, Business, Channel, NotificationSettings, TemplateKind } from '../../domain/types';
import { localeMeta, locales, type Locale } from '../../i18n/config';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/messages';
import { PageHeader } from '../shared';
import { useWorkspace } from '../workspace';

type Section = 'business' | 'booking' | 'branding' | 'notifications' | 'calendar' | 'team' | 'billing' | 'account' | 'data';
const SECTIONS: { id: Section; needs: Permission; previewOnly?: boolean }[] = [
  { id: 'business', needs: 'business.settings' },
  { id: 'booking', needs: 'business.settings' },
  { id: 'branding', needs: 'business.settings' },
  { id: 'notifications', needs: 'business.settings' },
  { id: 'calendar', needs: 'calendar.all' },
  { id: 'team', needs: 'staff.manage' },
  { id: 'billing', needs: 'billing.manage' },
  { id: 'account', needs: 'billing.manage' },
  { id: 'data', needs: 'demo.reset', previewOnly: true },
];
const KINDS: TemplateKind[] = ['confirmation', 'reminder', 'reschedule', 'cancellation'];
const CHANNELS: Channel[] = ['sms', 'whatsapp', 'email'];
const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'AUD', 'CAD'];
const ZONES = ['Asia/Jerusalem', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney'];

export default function SettingsPage() {
  const { t } = useI18n();
  const { can } = useWorkspace();
  const { section } = useParams();
  const available = SECTIONS.filter((s) => can(s.needs) && (!s.previewOnly || !CAPABILITIES.backend));
  const current = available.find((s) => s.id === section);
  if (!current) return <Navigate to={`/app/settings/${available[0]?.id ?? 'business'}`} replace />;

  return (
    <div className="page settings">
      <PageHeader title={t('app.nav.settings')} />
      <nav className="settings__nav" aria-label={t('settings.title')}>
        {available.map((s) => (
          <NavLink key={s.id} to={`/app/settings/${s.id}`} className="settings__link">
            {t(`settings.sections.${s.id}`)}
          </NavLink>
        ))}
      </nav>
      <div className="settings__body">
        <h2 className="settings__title">{t(`settings.sections.${current.id}`)}</h2>
        {current.id === 'business' && <BusinessSection />}
        {current.id === 'booking' && <BookingSection />}
        {current.id === 'branding' && <BrandingSection />}
        {current.id === 'notifications' && <NotificationsSection />}
        {current.id === 'calendar' && <CalendarSection />}
        {current.id === 'team' && <TeamSection />}
        {current.id === 'billing' && <BillingSection />}
        {current.id === 'account' && <AccountSection />}
        {current.id === 'data' && <DataSection />}
      </div>
    </div>
  );
}

/** Local draft of a slice of business settings with a save bar. */
function useDraft<T>(saved: T) {
  const [draft, setDraft] = useState<T | null>(null);
  const value = draft ?? saved;
  return { value, set: (v: T) => setDraft(v), reset: () => setDraft(null), dirty: draft !== null && JSON.stringify(draft) !== JSON.stringify(saved) };
}

function SaveBar({ dirty, disabled, onSave, onReset }: { dirty: boolean; disabled?: boolean; onSave: () => Promise<unknown>; onReset: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!dirty) return null;
  return (
    <div className="save-bar save-bar--sticky">
      <button type="button" className="btn btn--quiet btn--sm" onClick={onReset}>
        {t('common.cancel')}
      </button>
      <button
        type="button"
        className="btn btn--ink btn--sm"
        disabled={busy || disabled}
        onClick={async () => {
          setBusy(true);
          try {
            await onSave();
            onReset();
            toast(t('common.saved'));
          } catch (e) {
            toast(e instanceof ApiError && e.code === 'slug_taken' ? t('onboarding.business.slugTaken') : t('common.unknownError'));
          }
          setBusy(false);
        }}
      >
        {busy ? t('common.saving') : t('common.save')}
      </button>
    </div>
  );
}

function Field({ label, hint, children, id }: { label: ReactNode; hint?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

// ── Business ─────────────────────────────────────────────────────────

type BusinessDraft = Pick<Business, 'name' | 'tagline' | 'description' | 'address' | 'phone' | 'email' | 'currency' | 'defaultLocale' | 'timezone' | 'type' | 'slug' | 'social'>;

function BusinessSection() {
  const { tenant, api } = useWorkspace();
  const { t } = useI18n();
  const toast = useToast();
  const b = tenant.business;
  const pick = (x: Business): BusinessDraft => ({
    name: x.name,
    tagline: x.tagline,
    description: x.description,
    address: x.address,
    phone: x.phone,
    email: x.email,
    currency: x.currency,
    defaultLocale: x.defaultLocale,
    timezone: x.timezone,
    type: x.type,
    slug: x.slug,
    social: x.social,
  });
  const d = useDraft(pick(b));
  const v = d.value;
  directory.useSlugChecks();
  const slugOk = v.slug === b.slug || (SLUG_PATTERN.test(v.slug) && directory.isSlugAvailable(v.slug));
  const zones = useMemo(() => [...new Set([v.timezone, ...ZONES])].filter(isValidTimeZone), [v.timezone]);
  const both = (k: 'name' | 'tagline' | 'description' | 'address', lEn: MessageKey, lHe: MessageKey, area = false) => (
    <div className="field-row">
      {(['en', 'he'] as const).map((l) => {
        const props = {
          id: `biz-${k}-${l}`,
          className: 'field__input',
          dir: localeMeta[l].dir,
          lang: l,
          value: v[k][l] ?? '',
          onChange: (e: { target: { value: string } }) => d.set({ ...v, [k]: { ...v[k], [l]: e.target.value } }),
        };
        return (
          <Field key={l} id={props.id} label={t(l === 'en' ? lEn : lHe)}>
            {area ? <textarea rows={3} {...props} /> : <input {...props} />}
          </Field>
        );
      })}
    </div>
  );

  return (
    <>
      <section className="panel panel__body form-grid">
        <div className="settings__status">
          <div>
            <p className="field__label">{t('settings.business.status')}</p>
            <p className="muted">
              <span className="badge" data-status={b.status === 'published' ? 'confirmed' : 'pending'}>
                {t(b.status === 'published' ? 'settings.business.published' : 'settings.business.draft')}
              </span>{' '}
              <Link to={`/book/${b.slug}`} target="_blank" className="ltr">
                /book/{b.slug} <ExternalIcon size={12} />
              </Link>
            </p>
          </div>
          <button
            type="button"
            className={`btn btn--sm ${b.status === 'published' ? 'btn--ghost' : 'btn--primary'}`}
            onClick={async () => {
              await api.setPublished(b.status !== 'published');
              toast(t('common.saved'));
            }}
          >
            {b.status === 'published' ? t('settings.business.unpublish') : t('settings.business.publish')}
          </button>
        </div>
      </section>

      <section className="panel panel__body form-grid">
        {both('name', 'settings.business.nameEn', 'settings.business.nameHe')}
        {both('tagline', 'settings.business.taglineEn', 'settings.business.taglineHe')}
        {both('description', 'settings.business.descEn', 'settings.business.descHe', true)}
        <Field id="biz-slug" label={t('settings.business.slug')} hint={!slugOk ? <span className="field__error">{t('onboarding.business.slugTaken')}</span> : t('onboarding.business.slugHint')}>
          <div className="slug-field" dir="ltr">
            <span className="muted">/book/</span>
            <input id="biz-slug" className="field__input" value={v.slug} aria-invalid={!slugOk} onChange={(e) => d.set({ ...v, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
          </div>
        </Field>
        <Field id="biz-type" label={t('settings.business.type')}>
          <select id="biz-type" className="field__input" value={v.type} onChange={(e) => d.set({ ...v, type: e.target.value as Business['type'] })}>
            {BUSINESS_TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`businessType.${x}`)}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section className="panel panel__body form-grid">
        {both('address', 'settings.business.addressEn', 'settings.business.addressHe')}
        <div className="field-row">
          <Field id="biz-phone" label={t('settings.business.phone')}>
            <input id="biz-phone" className="field__input ltr" dir="ltr" type="tel" value={v.phone} onChange={(e) => d.set({ ...v, phone: e.target.value })} />
          </Field>
          <Field id="biz-email" label={t('settings.business.email')}>
            <input id="biz-email" className="field__input ltr" dir="ltr" type="email" value={v.email} onChange={(e) => d.set({ ...v, email: e.target.value })} />
          </Field>
        </div>
        <p className="field__label">{t('settings.business.social')}</p>
        <div className="field-row">
          {(['instagram', 'website', 'whatsapp'] as const).map((k) => (
            <Field key={k} id={`biz-${k}`} label={t(`settings.business.${k}`)}>
              <input id={`biz-${k}`} className="field__input ltr" dir="ltr" value={v.social[k] ?? ''} onChange={(e) => d.set({ ...v, social: { ...v.social, [k]: e.target.value || undefined } })} />
            </Field>
          ))}
        </div>
      </section>

      <section className="panel panel__body form-grid">
        <div className="field-row">
          <Field id="biz-tz" label={t('settings.business.timezone')}>
            <select id="biz-tz" className="field__input" value={v.timezone} onChange={(e) => d.set({ ...v, timezone: e.target.value })}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </Field>
          <Field id="biz-cur" label={t('settings.business.currency')}>
            <select id="biz-cur" className="field__input" value={v.currency} onChange={(e) => d.set({ ...v, currency: e.target.value })}>
              {[...new Set([v.currency, ...CURRENCIES])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field id="biz-locale" label={t('settings.business.defaultLocale')}>
            <select id="biz-locale" className="field__input" value={v.defaultLocale} onChange={(e) => d.set({ ...v, defaultLocale: e.target.value as Locale })}>
              {locales.map((l) => (
                <option key={l} value={l}>
                  {localeMeta[l].label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>
      <SaveBar dirty={d.dirty} disabled={!slugOk} onReset={d.reset} onSave={() => api.updateBusiness(v)} />
    </>
  );
}

// ── Booking rules ────────────────────────────────────────────────────

function OptionSelect<T extends number>({ id, value, options, render, onChange }: { id?: string; value: T; options: T[]; render: (v: T) => string; onChange: (v: T) => void }) {
  const all = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  return (
    <select id={id} className="field__input" value={value} onChange={(e) => onChange(Number(e.target.value) as T)}>
      {all.map((o) => (
        <option key={o} value={o}>
          {render(o)}
        </option>
      ))}
    </select>
  );
}

function BookingSection() {
  const { tenant, api, solo } = useWorkspace();
  const { t, fmt } = useI18n();
  const d = useDraft<BookingPolicies>(tenant.business.policies);
  const v = d.value;
  const hours = (h: number) => (h === 0 ? t('common.none') : t('units.hoursLong', { count: h }));
  const row = (id: string, label: string, hint: string | null, control: ReactNode) => (
    <div className="settings__row">
      <div>
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
        {hint && <p className="field__hint">{hint}</p>}
      </div>
      {control}
    </div>
  );

  return (
    <>
      <section className="panel panel__body form-grid">
        <fieldset className="choice-group">
          <legend className="field__label">{t('settings.booking.confirmation')}</legend>
          {(['auto', 'manual'] as const).map((m) => (
            <label key={m} className="choice" data-selected={v.confirmationMode === m}>
              <input type="radio" name="confirm" className="sr-only" checked={v.confirmationMode === m} onChange={() => d.set({ ...v, confirmationMode: m })} />
              <span className="choice__main">
                <span className="choice__title">{t(`settings.booking.${m}`)}</span>
                <span className="choice__desc">{t(`onboarding.rules.${m}Body`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </section>
      <section className="panel panel__body form-grid">
        {row('pol-interval', t('settings.booking.slotInterval'), t('settings.booking.slotIntervalHint'), <OptionSelect id="pol-interval" value={v.slotInterval} options={[10, 15, 20, 30, 60]} render={fmt.duration} onChange={(x) => d.set({ ...v, slotInterval: x })} />)}
        {row(
          'pol-lead',
          t('settings.booking.leadTime'),
          t('settings.booking.leadTimeHint'),
          <OptionSelect id="pol-lead" value={v.leadTimeMinutes} options={[0, 60, 120, 240, 720, 1440, 2880]} render={(m) => (m === 0 ? t('common.none') : m >= 1440 ? t('units.daysLong', { count: m / 1440 }) : m >= 60 ? hours(m / 60) : fmt.duration(m))} onChange={(x) => d.set({ ...v, leadTimeMinutes: x })} />,
        )}
        {row('pol-adv', t('settings.booking.maxAdvance'), t('settings.booking.maxAdvanceHint'), <OptionSelect id="pol-adv" value={v.maxAdvanceDays} options={[14, 30, 60, 90, 180]} render={(n) => t('units.daysLong', { count: n })} onChange={(x) => d.set({ ...v, maxAdvanceDays: x })} />)}
      </section>
      <section className="panel panel__body form-grid">
        <Switch checked={v.customerCanCancel} onChange={(x) => d.set({ ...v, customerCanCancel: x })} label={t('settings.booking.customerCancel')} />
        {v.customerCanCancel &&
          row('pol-cancel', t('settings.booking.cancelWindow'), t('settings.booking.windowHint'), <OptionSelect id="pol-cancel" value={v.cancelWindowHours} options={[0, 2, 6, 12, 24, 48, 72]} render={hours} onChange={(x) => d.set({ ...v, cancelWindowHours: x })} />)}
        <Switch checked={v.customerCanReschedule} onChange={(x) => d.set({ ...v, customerCanReschedule: x })} label={t('settings.booking.customerReschedule')} />
        {v.customerCanReschedule &&
          row('pol-resched', t('settings.booking.rescheduleWindow'), t('settings.booking.windowHint'), <OptionSelect id="pol-resched" value={v.rescheduleWindowHours} options={[0, 2, 6, 12, 24, 48, 72]} render={hours} onChange={(x) => d.set({ ...v, rescheduleWindowHours: x })} />)}
      </section>
      <section className="panel panel__body form-grid">
        {!solo && <Switch checked={v.allowAnyStaff} onChange={(x) => d.set({ ...v, allowAnyStaff: x })} label={t('settings.booking.anyStaff')} />}
        <Switch checked={v.requireEmail} onChange={(x) => d.set({ ...v, requireEmail: x })} label={t('settings.booking.requireEmail')} />
      </section>
      <SaveBar dirty={d.dirty} onReset={d.reset} onSave={() => api.updateBusiness({ policies: v })} />
    </>
  );
}

// ── Branding ─────────────────────────────────────────────────────────

function BrandingSection() {
  const { tenant } = useWorkspace();
  const { t, tx } = useI18n();
  const { branding } = tenant.business;
  const name = tx(tenant.business.name);
  return (
    <section className="panel brand-preview" data-accent={branding.accent} style={accentStyle(branding)}>
      {branding.coverUrl && <img className="brand-preview__cover" src={branding.coverUrl} alt="" />}
      <BusinessMark name={name} logoUrl={branding.logoUrl} className="biz-mark--xl" />
      <h2 className="display brand-preview__name">{t('settings.branding.title')}</h2>
      <p className="muted">{t('settings.branding.body')}</p>
      <Link to="/app/page" className="btn btn--primary">
        {t('settings.branding.open')}
      </Link>
    </section>
  );
}

// ── Notifications ────────────────────────────────────────────────────

function NotificationsSection() {
  const { tenant: state, api } = useWorkspace();
  const { t } = useI18n();
  const d = useDraft<NotificationSettings>(state.business.notifications);
  const v = d.value;
  const sample = state.appointments.find((a) => isUpcoming(a, new Date(), state.business.timezone)) ?? state.appointments[0];

  return (
    <>
      {!CAPABILITIES.messaging && (
        <p className="inline-alert inline-alert--warn">
          <AlertIcon size={14} /> {t('settings.notifications.notConnected')}
        </p>
      )}
      <p className="page__lede">{t('settings.notifications.lede')}</p>
      {KINDS.map((k) => {
        const cfg = v[k];
        const setCfg = (patch: Partial<typeof cfg>) => d.set({ ...v, [k]: { ...cfg, ...patch } });
        return (
          <section className="panel" key={k}>
            <header className="panel__head">
              <h3 className="panel__title">{t(`settings.notifications.kinds.${k}`)}</h3>
              <Switch checked={cfg.enabled} onChange={(x) => setCfg({ enabled: x })} label={<span className="sr-only">{t(`settings.notifications.kinds.${k}`)}</span>} />
            </header>
            {cfg.enabled && (
              <div className="panel__body form-grid">
                <div className="toolbar">
                  {CHANNELS.map((c) => {
                    const on = cfg.channels.includes(c);
                    return (
                      <button key={c} type="button" className="chip" aria-pressed={on} onClick={() => setCfg({ channels: on ? cfg.channels.filter((x) => x !== c) : [...cfg.channels, c] })}>
                        {t(`channel.${c}`)}
                      </button>
                    );
                  })}
                  {k === 'reminder' && (
                    <>
                      <span className="toolbar__spacer" />
                      <label className="cell-person">
                        <span className="field__label">{t('settings.notifications.reminderTiming')}</span>
                        <OptionSelect value={v.reminder.hoursBefore} options={[2, 6, 12, 24, 48]} render={(h) => t('units.hoursBefore', { count: h })} onChange={(h) => d.set({ ...v, reminder: { ...v.reminder, hoursBefore: h } })} />
                      </label>
                    </>
                  )}
                </div>
                <div className="field-row">
                  {locales.map((l) => {
                    const text = v.templates[k][l] ?? '';
                    return (
                      <div className="field" key={l}>
                        <label className="field__label" htmlFor={`tpl-${k}-${l}`}>
                          {t('settings.notifications.template')} · {localeMeta[l].label}
                        </label>
                        <textarea
                          id={`tpl-${k}-${l}`}
                          className="field__input"
                          dir={localeMeta[l].dir}
                          lang={l}
                          rows={4}
                          value={text}
                          onChange={(e) => d.set({ ...v, templates: { ...v.templates, [k]: { ...v.templates[k], [l]: e.target.value } } })}
                        />
                        {sample && (
                          <>
                            <span className="field__hint">{t('settings.notifications.previewIn', { language: localeMeta[l].label })}</span>
                            <p className="preview-bubble" dir={localeMeta[l].dir} lang={l}>
                              {renderTemplate(text, messageVars(state, sample, l))}
                            </p>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="field__hint">{t('settings.notifications.variables', { vars: TEMPLATE_VARS.map((x) => `{${x}}`).join(' ') })}</p>
              </div>
            )}
          </section>
        );
      })}
      <SaveBar dirty={d.dirty} onReset={d.reset} onSave={() => api.updateBusiness({ notifications: v })} />
    </>
  );
}

// ── Team access ──────────────────────────────────────────────────────

function TeamSection() {
  const { ctx, tenant, session } = useWorkspace();
  const { t, tx } = useI18n();
  const members = workspace.useMembers(ctx);
  return (
    <>
      <p className="page__lede">{t('settings.team.lede')}</p>
      <section className="panel">
        <div className="list">
          {members.map((m) => {
            const st = m.staffId ? tenant.staff.find((s) => s.id === m.staffId) : undefined;
            return (
              <div key={m.id} className="list__row">
                <div className="list__main">
                  <span className="list__title">
                    {m.user.name} {m.user.id === session.user.id && <span className="badge badge--plain">{t('staffAdmin.you')}</span>}
                  </span>
                  <span className="list__sub">
                    <span className="ltr">{m.user.email}</span>
                    {st ? ` · ${tx(st.name)}` : ''}
                  </span>
                </div>
                <span className="badge badge--plain">{t(`roles.${m.role}`)}</span>
              </div>
            );
          })}
        </div>
      </section>
      <p className="inline-alert">{t('settings.team.later')}</p>
    </>
  );
}

// ── Calendar subscription links ──────────────────────────────────────

const feedUrl = (slug: string, key: string) => `${location.origin}/api/ics/${slug}/${key}.ics`;

function CalendarSection() {
  const { tenant } = useWorkspace();
  const { t, tx } = useI18n();
  const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  const rows: { staffId: string | null; label: string }[] = [
    { staffId: null, label: t('settings.calendar.everyone') },
    ...tenant.staff.filter((s) => s.active).map((s) => ({ staffId: s.id, label: tx(s.name) })),
  ];
  return (
    <>
      <p className="page__lede">{t('settings.calendar.lede')}</p>
      {!CAPABILITIES.backend && (
        <p className="inline-alert inline-alert--warn">
          <AlertIcon size={14} /> {t('settings.calendar.needsServer')}
        </p>
      )}
      {CAPABILITIES.backend && local && <p className="inline-alert">{t('settings.calendar.localhost')}</p>}
      <section className="panel">
        <div className="list">
          {rows.map((r) => (
            <FeedRow key={r.staffId ?? 'all'} staffId={r.staffId} label={r.label} />
          ))}
        </div>
      </section>
      <section className="panel panel__body">
        <h3 className="settings__sub">{t('settings.calendar.howTitle')}</h3>
        <ol className="settings__steps">
          <li>{t('settings.calendar.howGoogle')}</li>
          <li>{t('settings.calendar.howOutlook')}</li>
          <li>{t('settings.calendar.howApple')}</li>
        </ol>
        <p className="muted">{t('settings.calendar.oneWay')}</p>
      </section>
    </>
  );
}

function FeedRow({ staffId, label }: { staffId: string | null; label: string }) {
  const { tenant, api } = useWorkspace();
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const feed = tenant.business.calendarFeeds?.find((f) => f.staffId === staffId);
  const url = feed && feedUrl(tenant.business.slug, feed.key);

  const run = async (rotate: boolean) => {
    setBusy(true);
    try {
      await api.calendarFeed(staffId, rotate);
      if (rotate) toast(t('settings.calendar.rotated'));
    } catch {
      toast(t('common.unknownError'));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast(t('settings.calendar.copied'));
    } catch {
      toast(t('common.unknownError'));
    }
  };

  return (
    <div className="list__row feed-row">
      <div className="list__main">
        <span className="list__title">{label}</span>
        {url ? (
          <input className="field__input field__input--sm ltr feed-row__url" dir="ltr" readOnly value={url} aria-label={t('settings.calendar.link', { name: label })} onFocus={(e) => e.currentTarget.select()} />
        ) : (
          <span className="list__sub">{t('settings.calendar.none')}</span>
        )}
      </div>
      <div className="feed-row__actions">
        {url ? (
          <>
            <button type="button" className="btn btn--tinted btn--sm" onClick={copy}>
              {t('common.copy')}
            </button>
            <a className="btn btn--ghost btn--sm" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url.replace(/^https?:/, 'webcal:'))}`} target="_blank" rel="noreferrer">
              {t('settings.calendar.google')} <ExternalIcon size={12} />
            </a>
            <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setConfirm(true)}>
              {t('settings.calendar.rotate')}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--tinted btn--sm" disabled={busy || !CAPABILITIES.backend} onClick={() => run(false)}>
            {t('settings.calendar.create')}
          </button>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        title={t('settings.calendar.rotate')}
        body={t('settings.calendar.rotateConfirm')}
        confirmLabel={t('settings.calendar.rotate')}
        cancelLabel={t('common.cancel')}
        danger
        onConfirm={() => run(true)}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}

// ── Billing (placeholder) ────────────────────────────────────────────

function BillingSection() {
  const { tenant } = useWorkspace();
  const { t } = useI18n();
  const month = businessNow(tenant).date.slice(0, 7);
  const bookings = tenant.appointments.filter((a) => a.createdAt.slice(0, 7) === month).length;
  const staff = tenant.staff.filter((s) => s.active).length;
  return (
    <>
      <p className="page__lede">{t('settings.billing.lede')}</p>
      <p className="inline-alert inline-alert--warn">
        <AlertIcon size={14} /> {t('settings.billing.notice')}
      </p>
      <section className="panel">
        <dl className="settings__dl">
          <div>
            <dt>{t('settings.billing.plan')}</dt>
            <dd className="muted">{t('settings.billing.notConfigured')}</dd>
          </div>
          <div>
            <dt>{t('settings.billing.status')}</dt>
            <dd className="muted">{t('settings.billing.notConfigured')}</dd>
          </div>
          <div>
            <dt>{t('settings.billing.usage')}</dt>
            <dd>
              {t('settings.billing.usageStaff', { count: staff })} · {t('settings.billing.usageBookings', { count: bookings })}
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}

// ── Account & data: export and delete ────────────────────────────────

function download(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function AccountSection() {
  const { tenant, api } = useWorkspace();
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const slug = tenant.business.slug;
  const stamp = businessNow(tenant).date;

  const exportJson = () => download(`${slug}-${stamp}.json`, 'application/json', JSON.stringify({ exportedAt: new Date().toISOString(), ...tenant }, null, 2));
  const exportCustomers = () => {
    const visits = new Map<string, { count: number; last: string }>();
    for (const a of tenant.appointments) {
      if (a.status === 'cancelled') continue;
      const v = visits.get(a.customerId) ?? { count: 0, last: '' };
      visits.set(a.customerId, { count: v.count + 1, last: a.date > v.last ? a.date : v.last });
    }
    const head = (['name', 'phone', 'email', 'note', 'visits', 'last', 'since'] as const).map((k) => t(`settings.account.csv.${k}`));
    const rows = tenant.customers.map((c) => [c.name, c.phone, c.email, c.note, visits.get(c.id)?.count ?? 0, visits.get(c.id)?.last ?? '', c.createdAt.slice(0, 10)]);
    // BOM so Excel opens Hebrew correctly.
    download(`${slug}-customers-${stamp}.csv`, 'text/csv;charset=utf-8', '\uFEFF' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n'));
  };

  return (
    <>
      <p className="page__lede">{t('settings.account.lede')}</p>
      <section className="panel panel__body form-grid">
        <h3 className="settings__sub">{t('settings.account.exportTitle')}</h3>
        <p className="muted">{t('settings.account.exportBody')}</p>
        <div className="settings__actions">
          <button type="button" className="btn btn--tinted btn--sm" onClick={exportCustomers}>
            {t('settings.account.exportCustomers')}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={exportJson}>
            {t('settings.account.exportAll')}
          </button>
        </div>
      </section>
      <section className="panel panel__body form-grid">
        <h3 className="settings__sub">{t('settings.account.deleteTitle')}</h3>
        <p className="muted">{t('settings.account.deleteBody')}</p>
        <button type="button" className="btn btn--ghost btn--danger btn--sm" style={{ justifySelf: 'start' }} onClick={() => setOpen(true)}>
          {t('settings.account.delete')}
        </button>
      </section>
      <ConfirmDialog
        open={open}
        title={t('settings.account.deleteConfirmTitle')}
        body={
          <div className="form-grid">
            <p>{t('settings.account.deleteConfirmBody')}</p>
            <label className="field__label" htmlFor="delete-slug">
              {t('settings.account.typeSlug', { slug })}
            </label>
            <input id="delete-slug" className="field__input ltr" dir="ltr" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value.trim())} />
          </div>
        }
        confirmLabel={t('settings.account.deleteForever')}
        cancelLabel={t('common.cancel')}
        danger
        busy={busy}
        confirmDisabled={typed !== slug}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api.deleteBusiness(typed);
            toast(t('settings.account.deleted'));
            navigate('/app', { replace: true });
          } catch (e) {
            toast(e instanceof ApiError && e.code === 'forbidden' ? t('settings.account.demoProtected') : t('common.unknownError'));
            setBusy(false);
          }
        }}
        onCancel={() => {
          setOpen(false);
          setTyped('');
        }}
      />
    </>
  );
}

// ── Demo data (preview builds only) ──────────────────────────────────

function DataSection() {
  const { t } = useI18n();
  const toast = useToast();
  const { api } = useWorkspace();
  const [open, setOpen] = useState(false);
  return (
    <section className="panel panel__body form-grid">
      <p className="muted">{t('settings.data.body')}</p>
      <button type="button" className="btn btn--ghost btn--danger btn--sm" style={{ justifySelf: 'start' }} onClick={() => setOpen(true)}>
        {t('settings.data.reset')}
      </button>
      <ConfirmDialog
        open={open}
        title={t('settings.data.reset')}
        body={t('settings.data.resetConfirm')}
        confirmLabel={t('settings.data.reset')}
        cancelLabel={t('common.cancel')}
        danger
        onConfirm={async () => {
          await api.resetDemo();
          setOpen(false);
          toast(t('settings.data.done'));
        }}
        onCancel={() => setOpen(false)}
      />
    </section>
  );
}
