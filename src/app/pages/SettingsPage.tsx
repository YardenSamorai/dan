import { useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, useParams } from 'react-router-dom';
import { ACCENT_KEYS, ACCENTS } from '../../components/ui/accents';
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
import type { BookingPolicies, Branding, Business, Channel, NotificationSettings, TemplateKind } from '../../domain/types';
import { localeMeta, locales, type Locale } from '../../i18n/config';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/messages';
import { PageHeader } from '../shared';
import { useWorkspace } from '../workspace';

type Section = 'business' | 'booking' | 'branding' | 'notifications' | 'team' | 'billing' | 'data';
const SECTIONS: { id: Section; needs: Permission; previewOnly?: boolean }[] = [
  { id: 'business', needs: 'business.settings' },
  { id: 'booking', needs: 'business.settings' },
  { id: 'branding', needs: 'business.settings' },
  { id: 'notifications', needs: 'business.settings' },
  { id: 'team', needs: 'staff.manage' },
  { id: 'billing', needs: 'billing.manage' },
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
        {current.id === 'team' && <TeamSection />}
        {current.id === 'billing' && <BillingSection />}
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

const MAX_LOGO_BYTES = 300_000;

function BrandingSection() {
  const { tenant, api } = useWorkspace();
  const { t, tx } = useI18n();
  const toast = useToast();
  const d = useDraft<Branding>(tenant.business.branding);
  const v = d.value;
  const name = tx(tenant.business.name);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > MAX_LOGO_BYTES) return toast(t('settings.branding.logoHint'));
    const r = new FileReader();
    r.onload = () => d.set({ ...v, logoUrl: String(r.result) });
    r.readAsDataURL(file);
  };

  return (
    <>
      <p className="page__lede">{t('settings.branding.lede')}</p>
      <div className="settings__split">
        <section className="panel panel__body form-grid">
          <fieldset className="field">
            <legend className="field__label">{t('settings.branding.accent')}</legend>
            <div className="color-swatches">
              {ACCENT_KEYS.map((k) => (
                <button key={k} type="button" className="color-swatch" aria-pressed={v.accent === k} aria-label={k} style={{ background: ACCENTS[k] }} onClick={() => d.set({ ...v, accent: k })} />
              ))}
            </div>
          </fieldset>
          <div className="field">
            <span className="field__label">{t('settings.branding.logo')}</span>
            <div className="settings__logo" data-accent={v.accent}>
              <BusinessMark name={name} logoUrl={v.logoUrl} className="biz-mark--xl" />
              <label className="btn btn--ghost btn--sm">
                {t('settings.branding.upload')}
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              {v.logoUrl && (
                <button type="button" className="btn btn--quiet btn--sm" onClick={() => d.set({ ...v, logoUrl: undefined })}>
                  {t('settings.branding.removeLogo')}
                </button>
              )}
            </div>
            <p className="field__hint">{t('settings.branding.logoHint')}</p>
          </div>
          <Field id="brand-cover" label={t('settings.branding.cover')}>
            <input id="brand-cover" className="field__input ltr" dir="ltr" type="url" value={v.coverUrl ?? ''} onChange={(e) => d.set({ ...v, coverUrl: e.target.value || undefined })} />
          </Field>
        </section>
        <section className="panel brand-preview" data-accent={v.accent} aria-label={t('settings.branding.preview')}>
          <p className="brand-preview__eyebrow">{t('settings.branding.preview')}</p>
          {v.coverUrl && <img className="brand-preview__cover" src={v.coverUrl} alt="" />}
          <BusinessMark name={name} logoUrl={v.logoUrl} className="biz-mark--xl" />
          <p className="display brand-preview__name">{name}</p>
          <p className="muted">{tx(tenant.business.tagline)}</p>
          <span className="btn btn--primary btn--sm" aria-hidden>
            {t('common.book')}
          </span>
          <span className="chip" aria-pressed="true" aria-hidden>
            10:30
          </span>
        </section>
      </div>
      <SaveBar dirty={d.dirty} onReset={d.reset} onSave={() => api.updateBusiness({ branding: v })} />
    </>
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
