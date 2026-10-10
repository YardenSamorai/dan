import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Drawer } from '../../components/ui/Drawer';
import { PlusIcon } from '../../components/ui/Icons';
import { StaffAvatar, Switch } from '../../components/ui/bits';
import { useToast } from '../../components/ui/Toast';
import type { AddOn, Service } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { useLookup } from '../lookup';
import { newId, PageHeader } from '../shared';
import { useWorkspace } from '../workspace';

export default function ServicesAdmin() {
  const L = useLookup();
  const { state } = L;
  const { t, tx, fmt } = useI18n();
  const toast = useToast();
  const { api, solo } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Service | null>(null);
  const [addOn, setAddOn] = useState<AddOn | null>(null);

  const blank = (): Service => ({
    id: newId('svc'),
    businessId: state.business.id,
    categoryId: state.categories[0]?.id ?? null,
    name: { en: '', he: '' },
    description: { en: '', he: '' },
    duration: 60,
    price: 0,
    bufferBefore: 0,
    bufferAfter: 0,
    staffIds: state.staff.filter((s) => s.active).map((s) => s.id),
    active: true,
    onlineBookable: true,
  });

  useEffect(() => {
    if (params.get('new') !== '1') return;
    setEditing(blank());
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const groups = [
    ...state.categories.map((c) => ({ id: c.id, name: tx(c.name), items: state.services.filter((s) => s.categoryId === c.id) })),
    {
      id: '_none',
      name: state.categories.length ? t('servicesAdmin.uncategorised') : '',
      items: state.services.filter((s) => !s.categoryId || !state.categories.some((c) => c.id === s.categoryId)),
    },
  ].filter((g) => g.items.length);

  return (
    <div className="page">
      <PageHeader
        title={t('app.nav.services')}
        lede={t('servicesAdmin.lede')}
        actions={
          <button type="button" className="btn btn--ink btn--sm" onClick={() => setEditing(blank())}>
            <PlusIcon /> {t('servicesAdmin.addService')}
          </button>
        }
      />

      {groups.length === 0 && (
        <section className="panel">
          <p className="empty">{t('servicesAdmin.empty')}</p>
        </section>
      )}

      {groups.map((g) => (
        <section className="panel" key={g.id}>
          {g.name && (
            <header className="panel__head">
              <h2 className="panel__title">{g.name}</h2>
            </header>
          )}
          <div className="list">
            {g.items.map((s) => (
              <button key={s.id} type="button" className="list__row" onClick={() => setEditing(s)}>
                <div className="list__main">
                  <span className="list__title">
                    {tx(s.name)}{' '}
                    {!s.active && <span className="badge badge--plain">{t('servicesAdmin.inactive')}</span>}{' '}
                    {s.active && !s.onlineBookable && <span className="badge badge--plain">{t('servicesAdmin.hiddenOnline')}</span>}
                  </span>
                  <span className="list__sub">
                    {fmt.duration(s.duration)}
                    {s.bufferBefore + s.bufferAfter > 0 && ` · ${t('servicesAdmin.bufferNote', { min: s.bufferBefore + s.bufferAfter })}`}
                  </span>
                </div>
                {!solo && (
                  <span className="only-desktop avatar-stack">
                    {s.staffIds.map((id) => {
                      const st = L.staff.get(id);
                      return st ? <StaffAvatar key={id} staff={st} size="sm" /> : null;
                    })}
                  </span>
                )}
                <strong className="tabular list__price">{fmt.money(s.price)}</strong>
              </button>
            ))}
          </div>
        </section>
      ))}

      <section className="panel">
        <header className="panel__head">
          <h2 className="panel__title">{t('servicesAdmin.addOns')}</h2>
          <button
            type="button"
            className="btn btn--quiet btn--xs"
            onClick={() => setAddOn({ id: newId('addon'), businessId: state.business.id, name: { en: '', he: '' }, duration: 10, price: 0, active: true })}
          >
            <PlusIcon size={12} /> {t('servicesAdmin.addAddOn')}
          </button>
        </header>
        <div className="list">
          {state.addOns.map((x) => (
            <div key={x.id} className="list__row">
              <button type="button" className="row-btn list__main" onClick={() => setAddOn(x)}>
                <span className="list__title">{tx(x.name)}</span>
                <span className="list__sub">
                  +{fmt.duration(x.duration)} · +{fmt.money(x.price)}
                </span>
              </button>
              <Switch
                checked={x.active}
                label={<span className="sr-only">{tx(x.name)}</span>}
                onChange={async (v) => {
                  await api.saveAddOn({ ...x, active: v });
                  toast(t('common.saved'));
                }}
              />
            </div>
          ))}
        </div>
      </section>

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing && !state.services.some((s) => s.id === editing.id) ? t('servicesAdmin.newService') : t('servicesAdmin.edit')}>
        {editing && (
          <ServiceForm
            key={editing.id}
            initial={editing}
            onSaved={() => {
              setEditing(null);
              toast(t('common.saved'));
            }}
          />
        )}
      </Drawer>
      <Drawer open={!!addOn} onClose={() => setAddOn(null)} title={t('servicesAdmin.addOns')}>
        {addOn && (
          <AddOnForm
            key={addOn.id}
            initial={addOn}
            onSaved={() => {
              setAddOn(null);
              toast(t('common.saved'));
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

function NameFields({ value, onChange, en, he }: { value: { en: string; he?: string }; onChange: (v: { en: string; he?: string }) => void; en: string; he: string }) {
  return (
    <div className="field-row">
      <label className="field">
        <span className="field__label">{en}</span>
        <input className="field__input" dir="ltr" lang="en" value={value.en} onChange={(e) => onChange({ ...value, en: e.target.value })} />
      </label>
      <label className="field">
        <span className="field__label">{he}</span>
        <input className="field__input" dir="rtl" lang="he" value={value.he ?? ''} onChange={(e) => onChange({ ...value, he: e.target.value })} />
      </label>
    </div>
  );
}

function ServiceForm({ initial, onSaved }: { initial: Service; onSaved: () => void }) {
  const L = useLookup();
  const { t, tx } = useI18n();
  const { api, solo } = useWorkspace();
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Service>(k: K, v: Service[K]) => setS((x) => ({ ...x, [k]: v }));
  const valid = !!(s.name.en.trim() || s.name.he?.trim()) && s.duration > 0 && s.price >= 0 && s.staffIds.length > 0;
  const num = (v: string) => Math.max(0, Number(v) || 0);

  return (
    <form
      className="form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        await api.saveService({ ...s, imageUrl: s.imageUrl?.trim() || undefined });
        onSaved();
      }}
    >
      <NameFields value={s.name} onChange={(v) => set('name', v)} en={t('servicesAdmin.fields.nameEn')} he={t('servicesAdmin.fields.nameHe')} />
      <label className="field">
        <span className="field__label">{t('servicesAdmin.fields.descEn')}</span>
        <textarea className="field__input" dir="ltr" lang="en" value={s.description.en} onChange={(e) => set('description', { ...s.description, en: e.target.value })} />
      </label>
      <label className="field">
        <span className="field__label">{t('servicesAdmin.fields.descHe')}</span>
        <textarea className="field__input" dir="rtl" lang="he" value={s.description.he ?? ''} onChange={(e) => set('description', { ...s.description, he: e.target.value })} />
      </label>
      <label className="field">
        <span className="field__label">{t('servicesAdmin.fields.category')}</span>
        <select className="field__input" value={s.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value || null)}>
          <option value="">{t('servicesAdmin.fields.noCategory')}</option>
          {L.state.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {tx(c.name)}
            </option>
          ))}
        </select>
      </label>
      <div className="field-row">
        <label className="field">
          <span className="field__label">{t('servicesAdmin.fields.duration')}</span>
          <input className="field__input" type="number" min={5} step={5} value={s.duration} onChange={(e) => set('duration', num(e.target.value))} />
        </label>
        <label className="field">
          <span className="field__label">
            {t('servicesAdmin.fields.price')} ({L.state.business.currency})
          </span>
          <input className="field__input" type="number" min={0} step={1} value={s.price} onChange={(e) => set('price', num(e.target.value))} />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span className="field__label">{t('servicesAdmin.fields.bufferBefore')}</span>
          <input className="field__input" type="number" min={0} step={5} value={s.bufferBefore} onChange={(e) => set('bufferBefore', num(e.target.value))} aria-describedby="svc-buffer-hint" />
        </label>
        <label className="field">
          <span className="field__label">{t('servicesAdmin.fields.bufferAfter')}</span>
          <input className="field__input" type="number" min={0} step={5} value={s.bufferAfter} onChange={(e) => set('bufferAfter', num(e.target.value))} aria-describedby="svc-buffer-hint" />
        </label>
      </div>
      <p id="svc-buffer-hint" className="field__hint">
        {t('servicesAdmin.fields.bufferHint')}
      </p>
      {!solo && (
        <fieldset className="field">
          <legend className="field__label">{t('servicesAdmin.fields.staff')}</legend>
          <div className="staff-pick">
            {L.state.staff.map((st) => {
              const on = s.staffIds.includes(st.id);
              return (
                <button key={st.id} type="button" aria-pressed={on} onClick={() => set('staffIds', on ? s.staffIds.filter((x) => x !== st.id) : [...s.staffIds, st.id])}>
                  <StaffAvatar staff={st} size="sm" /> {tx(st.name)}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
      <label className="field">
        <span className="field__label">
          {t('servicesAdmin.fields.image')} <span className="muted">({t('common.optional')})</span>
        </span>
        <input className="field__input" type="url" dir="ltr" value={s.imageUrl ?? ''} onChange={(e) => set('imageUrl', e.target.value)} />
      </label>
      <Switch checked={s.active} onChange={(v) => set('active', v)} label={t('servicesAdmin.fields.active')} />
      <Switch checked={s.onlineBookable} onChange={(v) => set('onlineBookable', v)} label={t('servicesAdmin.fields.online')} />
      <div className="save-bar">
        <button type="submit" className="btn btn--ink" disabled={!valid || busy}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  );
}

function AddOnForm({ initial, onSaved }: { initial: AddOn; onSaved: () => void }) {
  const { t } = useI18n();
  const { api, tenant } = useWorkspace();
  const [x, setX] = useState(initial);
  const [busy, setBusy] = useState(false);
  const valid = !!(x.name.en.trim() || x.name.he?.trim()) && x.duration >= 0 && x.price >= 0;
  return (
    <form
      className="form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        await api.saveAddOn(x);
        onSaved();
      }}
    >
      <NameFields value={x.name} onChange={(name) => setX({ ...x, name })} en={t('servicesAdmin.fields.nameEn')} he={t('servicesAdmin.fields.nameHe')} />
      <div className="field-row">
        <label className="field">
          <span className="field__label">{t('servicesAdmin.fields.duration')}</span>
          <input className="field__input" type="number" min={0} step={5} value={x.duration} onChange={(e) => setX({ ...x, duration: Math.max(0, Number(e.target.value) || 0) })} />
        </label>
        <label className="field">
          <span className="field__label">
            {t('servicesAdmin.fields.price')} ({tenant.business.currency})
          </span>
          <input className="field__input" type="number" min={0} value={x.price} onChange={(e) => setX({ ...x, price: Math.max(0, Number(e.target.value) || 0) })} />
        </label>
      </div>
      <Switch checked={x.active} onChange={(v) => setX({ ...x, active: v })} label={t('servicesAdmin.fields.active')} />
      <div className="save-bar">
        <button type="submit" className="btn btn--ink" disabled={!valid || busy}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  );
}
