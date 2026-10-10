import { useState } from 'react';
import { Drawer } from '../../components/ui/Drawer';
import { MessageIcon, PhoneIcon, PlusIcon } from '../../components/ui/Icons';
import { Avatar, StatusBadge } from '../../components/ui/bits';
import { useToast } from '../../components/ui/Toast';
import { appointmentStart, isUpcoming } from '../../domain/scheduling';
import type { Appointment, Customer, TenantData } from '../../domain/types';
import { localeMeta, locales, type Locale } from '../../i18n/config';
import { useI18n } from '../../i18n/I18nProvider';
import { telHref, whatsappHref } from '../../lib/phone';
import { useAppUI } from '../AppUI';
import { useLookup, type Lookup } from '../lookup';
import { useWorkspace } from '../workspace';

export const NEW_CUSTOMER = 'new';

export function CustomerDrawer({ id, onClose, onCreated }: { id: string | null; onClose: () => void; onCreated: (id: string) => void }) {
  const L = useLookup();
  const { t } = useI18n();
  const creating = id === NEW_CUSTOMER;
  const c = id && !creating ? L.customers.get(id) : undefined;
  return (
    <Drawer open={creating || !!c} onClose={onClose} title={creating ? t('customers.newTitle') : t('customers.profile')}>
      {creating && <CreateForm onCreated={onCreated} onCancel={onClose} />}
      {c && <Body key={c.id} c={c} L={L} onClose={onClose} />}
    </Drawer>
  );
}

export function customerStats(state: TenantData, customerId: string) {
  const tz = state.business.timezone;
  const mine = state.appointments.filter((a) => a.customerId === customerId);
  const done = mine.filter((a) => a.status === 'completed');
  const now = new Date();
  const upcoming = mine.filter((a) => isUpcoming(a, now, tz)).sort((a, b) => +appointmentStart(a, tz) - +appointmentStart(b, tz));
  const past = mine.filter((a) => !upcoming.includes(a)).sort((a, b) => +appointmentStart(b, tz) - +appointmentStart(a, tz));
  return {
    visits: done.length,
    cancelled: mine.filter((a) => a.status === 'cancelled').length,
    noShows: mine.filter((a) => a.status === 'no_show').length,
    spend: done.reduce((s, a) => s + a.price, 0),
    last: done.length ? done.reduce((m, a) => (a.date > m ? a.date : m), done[0].date) : null,
    next: upcoming[0] ?? null,
    upcoming,
    past,
  };
}

function ContactFields({ draft, set, readOnly }: { draft: Pick<Customer, 'name' | 'phone' | 'email' | 'locale' | 'note'>; set: (k: 'name' | 'phone' | 'email' | 'locale' | 'note', v: string | undefined) => void; readOnly?: boolean }) {
  const { t } = useI18n();
  return (
    <fieldset className="form-grid" disabled={readOnly}>
      <label className="field">
        <span className="field__label">{t('customers.name')}</span>
        <input className="field__input" value={draft.name} autoComplete="off" onChange={(e) => set('name', e.target.value)} />
      </label>
      <div className="field-row">
        <label className="field">
          <span className="field__label">{t('customers.phone')}</span>
          <input className="field__input ltr" type="tel" dir="ltr" value={draft.phone} onChange={(e) => set('phone', e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('customers.language')}</span>
          <select className="field__input" value={draft.locale} onChange={(e) => set('locale', e.target.value as Locale)}>
            {locales.map((l) => (
              <option key={l} value={l}>
                {localeMeta[l].label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field__label">
          {t('customers.email')} <span className="muted">({t('common.optional')})</span>
        </span>
        <input className="field__input ltr" type="email" dir="ltr" value={draft.email ?? ''} onChange={(e) => set('email', e.target.value || undefined)} />
      </label>
      <label className="field">
        <span className="field__label">{t('customers.note')}</span>
        <textarea className="field__input" placeholder={t('customers.notePlaceholder')} value={draft.note ?? ''} onChange={(e) => set('note', e.target.value || undefined)} />
      </label>
    </fieldset>
  );
}

function CreateForm({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const { api, tenant } = useWorkspace();
  const [draft, setDraft] = useState({ name: '', phone: '', email: undefined as string | undefined, note: undefined as string | undefined, locale: tenant.business.defaultLocale });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const valid = draft.name.trim().length > 1 && draft.phone.replace(/\D/g, '').length >= 9;
  const save = async () => {
    if (!valid) return setError(true);
    setBusy(true);
    try {
      const c = await api.createCustomer({ ...draft, name: draft.name.trim(), phone: draft.phone.trim() });
      toast(t('customers.created'));
      onCreated(c.id);
    } catch {
      setBusy(false);
      toast(t('common.unknownError'));
    }
  };
  return (
    <div className="detail">
      <ContactFields draft={draft} set={(k, v) => setDraft((d) => ({ ...d, [k]: v }))} />
      {error && !valid && (
        <p className="field__error" role="alert">
          {t('booking.details.errors.phone')}
        </p>
      )}
      <div className="detail__actions">
        <button type="button" className="btn btn--ink btn--sm" disabled={busy} onClick={save}>
          {busy ? t('common.saving') : t('customers.add')}
        </button>
        <button type="button" className="btn btn--quiet btn--sm" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

function Body({ c, L, onClose }: { c: Customer; L: Lookup; onClose: () => void }) {
  const { t, tx, fmt } = useI18n();
  const toast = useToast();
  const { openAppointment, newAppointment } = useAppUI();
  const { api, can, solo } = useWorkspace();
  const [draft, setDraft] = useState(c);
  const [busy, setBusy] = useState(false);
  const stats = customerStats(L.state, c.id);
  const editable = can('customers.edit');
  const dirty = JSON.stringify(draft) !== JSON.stringify(c);
  const wa = whatsappHref(c.phone, L.state.business.timezone);

  const save = async () => {
    setBusy(true);
    try {
      await api.saveCustomer({ ...draft, name: draft.name.trim() || c.name, phone: draft.phone.trim() || c.phone });
      toast(t('common.saved'));
    } catch {
      toast(t('common.forbidden'));
    }
    setBusy(false);
  };

  const row = (a: Appointment) => (
    <button key={a.id} type="button" className="list__row" onClick={() => (onClose(), openAppointment(a.id))}>
      <div className="list__main">
        <span className="list__title">
          {fmt.date(a.date, 'medium')} · <span className="ltr">{fmt.time(a.start)}</span>
        </span>
        <span className="list__sub">{[tx(L.services.get(a.serviceId)?.name), solo ? null : tx(L.staff.get(a.staffId)?.name), fmt.money(a.price)].filter(Boolean).join(' · ')}</span>
      </div>
      <StatusBadge status={a.status} />
    </button>
  );

  return (
    <div className="detail">
      <div className="detail__person">
        <Avatar name={c.name} size="lg" />
        <div className="list__main">
          <p className="detail__when">{c.name}</p>
          <p className="muted">{t('customers.since', { date: fmt.date(c.createdAt.slice(0, 10), 'dayMonth') })}</p>
        </div>
      </div>

      <dl className="stats">
        <div>
          <dt>{t('customers.stats.visits')}</dt>
          <dd>{fmt.number(stats.visits)}</dd>
        </div>
        <div>
          <dt>{t('customers.stats.cancelled')}</dt>
          <dd>{fmt.number(stats.cancelled)}</dd>
        </div>
        <div data-warn={stats.noShows > 0 || undefined}>
          <dt>{t('customers.stats.noShows')}</dt>
          <dd>{fmt.number(stats.noShows)}</dd>
        </div>
        <div>
          <dt>{t('customers.stats.spend')}</dt>
          <dd>{fmt.money(stats.spend)}</dd>
        </div>
      </dl>

      <div className="detail__actions">
        {can('appointments.manage') && (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => {
              onClose();
              newAppointment({ customerId: c.id });
            }}
          >
            <PlusIcon /> {t('customers.book', { name: c.name.split(' ')[0] })}
          </button>
        )}
        <a className="btn btn--ghost btn--sm" href={telHref(c.phone)}>
          <PhoneIcon size={14} /> {t('common.call')}
        </a>
        {wa && (
          <a className="btn btn--ghost btn--sm" href={wa} target="_blank" rel="noreferrer">
            <MessageIcon size={14} /> {t('common.whatsapp')}
          </a>
        )}
      </div>

      <section className="detail__block">
        <h3 className="section-title">{t('customers.upcoming')}</h3>
        {stats.upcoming.length ? <div className="panel list">{stats.upcoming.map(row)}</div> : <p className="muted">{t('customers.never')}</p>}
      </section>

      <section className="detail__block">
        <h3 className="section-title">{t('customers.contact')}</h3>
        <ContactFields draft={draft} set={(k, v) => setDraft((d) => ({ ...d, [k]: v }))} readOnly={!editable} />
        {dirty && editable && (
          <div className="detail__actions">
            <button type="button" className="btn btn--ink btn--sm" disabled={busy} onClick={save}>
              {busy ? t('common.saving') : t('common.save')}
            </button>
            <button type="button" className="btn btn--quiet btn--sm" onClick={() => setDraft(c)}>
              {t('common.cancel')}
            </button>
          </div>
        )}
      </section>

      <section className="detail__block">
        <h3 className="section-title">{t('customers.history')}</h3>
        {stats.past.length ? <div className="panel list">{stats.past.map(row)}</div> : <p className="muted">{t('customers.noHistory')}</p>}
      </section>
    </div>
  );
}
