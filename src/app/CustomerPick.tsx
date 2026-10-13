import { useMemo, useState } from 'react';
import { SearchIcon } from '../components/ui/Icons';
import { Avatar } from '../components/ui/bits';
import type { CustomerInput } from '../data';
import { localeMeta, locales, type Locale } from '../i18n/config';
import { useI18n } from '../i18n/I18nProvider';
import { useLookup } from './lookup';

/** Search a customer and pick with one tap, or type in someone new. */
export function CustomerPick({ onPick, busy, actionLabel, exclude }: { onPick: (c: CustomerInput, id?: string) => void; busy: boolean; actionLabel: string; exclude?: Set<string> }) {
  const { t } = useI18n();
  const L = useLookup();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', phone: '', locale: L.state.business.defaultLocale as Locale });

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const list = L.state.customers.filter((c) => !exclude?.has(c.id) && (!q || c.name.toLowerCase().includes(q) || (digits.length > 2 && c.phone.replace(/\D/g, '').includes(digits))));
    return [...list].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 6);
  }, [L.state.customers, query, exclude]);
  const ready = draft.name.trim().length > 1 && draft.phone.replace(/\D/g, '').length >= 7;

  if (creating)
    return (
      <div className="form-grid">
        <div className="field-row">
          <label className="field">
            <span className="field__label">{t('appt.new.name')}</span>
            <input className="field__input field__input--sm" autoFocus value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          </label>
          <label className="field">
            <span className="field__label">{t('appt.new.phone')}</span>
            <input className="field__input field__input--sm ltr" type="tel" dir="ltr" value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} />
          </label>
        </div>
        <label className="field">
          <span className="field__label">{t('appt.new.language')}</span>
          <select className="field__input field__input--sm" value={draft.locale} onChange={(e) => setDraft((d) => ({ ...d, locale: e.target.value as Locale }))}>
            {locales.map((l) => (
              <option key={l} value={l}>
                {localeMeta[l].label}
              </option>
            ))}
          </select>
        </label>
        <div className="detail__actions">
          <button type="button" className="btn btn--ink btn--sm" disabled={busy || !ready} onClick={() => onPick({ ...draft, name: draft.name.trim() })}>
            {busy ? t('common.saving') : actionLabel}
          </button>
          <button type="button" className="btn btn--quiet btn--sm" onClick={() => setCreating(false)}>
            {t('common.back')}
          </button>
        </div>
      </div>
    );

  return (
    <div className="form-grid">
      <label className="search">
        <SearchIcon />
        <input className="field__input" type="search" placeholder={t('appt.new.searchCustomer')} aria-label={t('appt.new.searchCustomer')} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="picker-list">
        {matches.map((c) => (
          <button key={c.id} type="button" disabled={busy} onClick={() => onPick({ name: c.name, phone: c.phone, email: c.email, locale: c.locale }, c.id)}>
            <Avatar name={c.name} size="sm" />
            <span className="list__main">
              <span className="list__title">{c.name}</span>
              <span className="list__sub ltr">{c.phone}</span>
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        style={{ justifySelf: 'start' }}
        onClick={() => {
          setCreating(true);
          const q = query.trim();
          if (q) setDraft((d) => (/\d{3}/.test(q) ? { ...d, phone: q } : { ...d, name: q }));
        }}
      >
        {t('appt.new.newCustomer')}
      </button>
    </div>
  );
}
