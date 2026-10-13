import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Drawer } from '../../components/ui/Drawer';
import { CheckIcon, PlusIcon } from '../../components/ui/Icons';
import { StaffAvatar, Switch } from '../../components/ui/bits';
import { useToast } from '../../components/ui/Toast';
import { CAPACITY_LIMIT } from '../../data';
import { isClass, termsFor, termsRange } from '../../domain/scheduling';
import type { AddOn, Service, StaffTerms } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { useLookup } from '../lookup';
import { newId, PageHeader } from '../shared';
import { useWorkspace } from '../workspace';

const VIEWS = ['list', 'team'] as const;
type View = (typeof VIEWS)[number];

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
  const view: View = !solo && params.get('view') === 'team' ? 'team' : 'list';

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

      {!solo && (
        <div className="tabs" role="tablist">
          {VIEWS.map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setParams(v === 'list' ? {} : { view: v }, { replace: true })}>
              {t(`servicesAdmin.views.${v}`)}
            </button>
          ))}
        </div>
      )}

      {view === 'team' && <WhoDoesWhat groups={groups} onEdit={setEditing} />}

      {view === 'list' && groups.length === 0 && (
        <section className="panel">
          <p className="empty">{t('servicesAdmin.empty')}</p>
        </section>
      )}

      {view === 'list' && groups.map((g) => (
        <section className="panel" key={g.id}>
          {g.name && (
            <header className="panel__head">
              <h2 className="panel__title">{g.name}</h2>
            </header>
          )}
          <div className="list">
            {g.items.map((s) => {
              const r = termsRange(s);
              return (
              <button key={s.id} type="button" className="list__row" onClick={() => setEditing(s)}>
                <div className="list__main">
                  <span className="list__title">
                    {tx(s.name)}{' '}
                    {!s.active && <span className="badge badge--plain">{t('servicesAdmin.inactive')}</span>}{' '}
                    {s.active && !s.onlineBookable && <span className="badge badge--plain">{t('servicesAdmin.hiddenOnline')}</span>}{' '}
                    {s.blocksAll && <span className="badge badge--plain">{t('servicesAdmin.blocksAllBadge')}</span>}{' '}
                    {isClass(s) && <span className="badge badge--plain">{t('servicesAdmin.classBadge', { count: s.capacity! })}</span>}
                  </span>
                  <span className="list__sub">
                    {fmt.durationRange(r.duration)}
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
                <strong className="tabular list__price">{fmt.moneyRange(r.price)}</strong>
              </button>
              );
            })}
          </div>
        </section>
      ))}

      {view === 'list' && (
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
      )}

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
      <div className="form-grid">
        <Switch checked={isClass(s)} onChange={(v) => set('capacity', v ? initial.capacity ?? 8 : undefined)} label={t('servicesAdmin.fields.isClass')} />
        <p className="field__hint">{t('servicesAdmin.fields.isClassHint')}</p>
        {isClass(s) && (
          <label className="field">
            <span className="field__label">{t('servicesAdmin.fields.capacity')}</span>
            <input
              className="field__input"
              type="number"
              inputMode="numeric"
              min={2}
              max={CAPACITY_LIMIT}
              value={s.capacity}
              onChange={(e) => set('capacity', Math.min(CAPACITY_LIMIT, Math.max(2, Math.round(Number(e.target.value)) || 2)))}
            />
          </label>
        )}
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
      {!solo && <StaffTermsField service={s} onChange={setS} />}
      <label className="field">
        <span className="field__label">{t('servicesAdmin.fields.rebook')}</span>
        <select className="field__input" value={s.rebookAfterDays ?? 0} onChange={(e) => set('rebookAfterDays', Number(e.target.value) || undefined)} aria-describedby="svc-rebook-hint">
          {[...new Set([0, 7, 14, 21, 28, 35, 42, 56, 84, s.rebookAfterDays ?? 0])].map((n) => (
            <option key={n} value={n}>
              {!n ? t('servicesAdmin.fields.rebookNever') : n % 7 ? t('servicesAdmin.fields.rebookAfterDays', { count: n }) : t('servicesAdmin.fields.rebookAfter', { count: n / 7 })}
            </option>
          ))}
        </select>
      </label>
      <p id="svc-rebook-hint" className="field__hint">
        {t('servicesAdmin.fields.rebookHint')}
      </p>
      <label className="field">
        <span className="field__label">
          {t('servicesAdmin.fields.image')} <span className="muted">({t('common.optional')})</span>
        </span>
        <input className="field__input" type="text" inputMode="url" dir="ltr" value={s.imageUrl ?? ''} onChange={(e) => set('imageUrl', e.target.value)} />
      </label>
      <Switch checked={s.active} onChange={(v) => set('active', v)} label={t('servicesAdmin.fields.active')} />
      <Switch checked={s.onlineBookable} onChange={(v) => set('onlineBookable', v)} label={t('servicesAdmin.fields.online')} />
      <div>
        <Switch checked={!!s.blocksAll} onChange={(v) => set('blocksAll', v || undefined)} label={t('servicesAdmin.fields.blocksAll')} />
        <p className="field__hint">{t('servicesAdmin.fields.blocksAllHint')}</p>
      </div>
      <div className="save-bar">
        <button type="submit" className="btn btn--ink" disabled={!valid || busy}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  );
}

/** Who performs the service, and where someone's duration or price differs from the service's own. */
function StaffTermsField({ service: s, onChange }: { service: Service; onChange: (s: Service) => void }) {
  const L = useLookup();
  const { t, tx, fmt } = useI18n();
  const people = L.state.staff.filter((st) => st.active || s.staffIds.includes(st.id));
  const toggle = (id: string, on: boolean) => onChange({ ...s, staffIds: on ? [...s.staffIds, id] : s.staffIds.filter((x) => x !== id) });
  const setTerm = (id: string, key: keyof StaffTerms, raw: string) => {
    const n = raw === '' ? undefined : Math.max(0, Number(raw) || 0);
    onChange({ ...s, staffTerms: { ...s.staffTerms, [id]: { ...s.staffTerms?.[id], [key]: n } } });
  };

  return (
    <fieldset className="field">
      <legend className="field__label">{t('servicesAdmin.fields.staff')}</legend>
      <p className="field__hint" id="svc-terms-hint">
        {t('servicesAdmin.terms.hint', { duration: fmt.duration(s.duration), price: fmt.money(s.price) })}
      </p>
      <div className="terms" role="group" aria-describedby="svc-terms-hint">
        <div className="terms__head" aria-hidden="true">
          <span />
          <span>{t('servicesAdmin.terms.duration')}</span>
          <span>{t('servicesAdmin.terms.price')}</span>
        </div>
        {people.map((st) => {
          const on = s.staffIds.includes(st.id);
          const own = s.staffTerms?.[st.id];
          const name = tx(st.name);
          return (
            <div key={st.id} className="terms__row" data-on={on}>
              <label className="terms__who">
                <input type="checkbox" checked={on} onChange={(e) => toggle(st.id, e.target.checked)} />
                <StaffAvatar staff={st} size="sm" />
                <span className="terms__name">{name}</span>
              </label>
              <input
                className="field__input terms__num"
                type="number"
                inputMode="numeric"
                dir="ltr"
                min={5}
                step={5}
                disabled={!on}
                placeholder={String(s.duration)}
                value={on ? own?.duration ?? '' : ''}
                aria-label={`${t('servicesAdmin.terms.duration')}, ${name}`}
                onChange={(e) => setTerm(st.id, 'duration', e.target.value)}
              />
              <input
                className="field__input terms__num"
                type="number"
                inputMode="decimal"
                dir="ltr"
                min={0}
                disabled={!on}
                placeholder={String(s.price)}
                value={on ? own?.price ?? '' : ''}
                aria-label={`${t('servicesAdmin.terms.price')}, ${name}`}
                onChange={(e) => setTerm(st.id, 'price', e.target.value)}
              />
            </div>
          );
        })}
      </div>
      {s.staffIds.length === 0 && <p className="field__error">{t('servicesAdmin.terms.none')}</p>}
    </fieldset>
  );
}

/** Services × team in one grid: tap a cell to assign or unassign. */
function WhoDoesWhat({ groups, onEdit }: { groups: { id: string; name: string; items: Service[] }[]; onEdit: (s: Service) => void }) {
  const L = useLookup();
  const { t, tx, fmt } = useI18n();
  const toast = useToast();
  const { api } = useWorkspace();
  const [pending, setPending] = useState<string | null>(null);
  const staff = L.state.staff.filter((s) => s.active);

  const toggle = async (svc: Service, staffId: string) => {
    const on = svc.staffIds.includes(staffId);
    if (on && svc.staffIds.length === 1) {
      toast(t('servicesAdmin.matrix.lastOne'));
      return;
    }
    const key = `${svc.id}:${staffId}`;
    setPending(key);
    try {
      await api.saveService({ ...svc, staffIds: on ? svc.staffIds.filter((x) => x !== staffId) : [...svc.staffIds, staffId] });
      toast(t(on ? 'servicesAdmin.matrix.removed' : 'servicesAdmin.matrix.added', { service: tx(svc.name), staff: tx(L.staff.get(staffId)?.name) }));
    } catch {
      toast(t('common.unknownError'));
    } finally {
      setPending((p) => (p === key ? null : p));
    }
  };

  if (!groups.length) {
    return (
      <section className="panel">
        <p className="empty">{t('servicesAdmin.empty')}</p>
      </section>
    );
  }

  return (
    <section className="panel matrix-panel">
      <div className="matrix-scroll">
        <table className="table matrix">
          <thead>
            <tr>
              <th scope="col">{t('servicesAdmin.matrix.service')}</th>
              {staff.map((st) => (
                <th key={st.id} scope="col" className="matrix__staff">
                  <StaffAvatar staff={st} size="sm" />
                  <span>{tx(st.name).split(' ')[0]}</span>
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.id}>
              {g.name && (
                <tr className="matrix__group">
                  <th scope="rowgroup" colSpan={staff.length + 1}>
                    {g.name}
                  </th>
                </tr>
              )}
              {g.items.map((svc) => (
                <tr key={svc.id} data-inactive={!svc.active || undefined}>
                  <th scope="row">
                    <div className="matrix__service">
                      <button type="button" className="row-btn table__primary" onClick={() => onEdit(svc)}>
                        {tx(svc.name)}
                      </button>
                      <span className="table__sub">
                        {fmt.duration(svc.duration)} · {fmt.money(svc.price)}
                      </span>
                    </div>
                  </th>
                  {staff.map((st) => {
                    const on = svc.staffIds.includes(st.id);
                    const own = on && svc.staffTerms?.[st.id] ? termsFor(svc, st.id) : null;
                    const busy = pending === `${svc.id}:${st.id}`;
                    return (
                      <td key={st.id} className="matrix__cell">
                        <button
                          type="button"
                          className="matrix__toggle"
                          aria-pressed={on}
                          aria-busy={busy || undefined}
                          disabled={busy}
                          aria-label={`${tx(svc.name)}, ${tx(st.name)}`}
                          onClick={() => toggle(svc, st.id)}
                        >
                          <span className="matrix__dot" aria-hidden="true">
                            {on && <CheckIcon size={12} />}
                          </span>
                          {own && (
                            <span className="matrix__terms tabular">
                              {fmt.money(own.price)}
                              <br />
                              {fmt.duration(own.duration)}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="matrix__foot">{t('servicesAdmin.matrix.hint')}</p>
    </section>
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
