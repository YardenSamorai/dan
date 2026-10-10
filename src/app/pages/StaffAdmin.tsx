import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Drawer } from '../../components/ui/Drawer';
import { LockIcon, PlusIcon } from '../../components/ui/Icons';
import { StaffAvatar, Switch } from '../../components/ui/bits';
import { useToast } from '../../components/ui/Toast';
import { workspace } from '../../data';
import { STAFF_COLORS, WEEKDAYS } from '../../domain/defaults';
import type { Staff, WeeklySchedule } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { useLookup } from '../lookup';
import { newId, PageHeader } from '../shared';
import { useWorkspace } from '../workspace';

export function weeklyMinutes(s: WeeklySchedule) {
  return WEEKDAYS.reduce<number>(
    (sum, d) => sum + s[d].ranges.reduce((a, r) => a + r.end - r.start, 0) - s[d].breaks.reduce((a, r) => a + r.end - r.start, 0),
    0,
  );
}

export default function StaffAdmin() {
  const L = useLookup();
  const { state } = L;
  const { t, tx, fmt } = useI18n();
  const toast = useToast();
  const { ctx, session, solo } = useWorkspace();
  const members = workspace.useMembers(ctx);
  const [editing, setEditing] = useState<Staff | null>(null);

  const blank = (): Staff => ({
    id: newId('st'),
    businessId: state.business.id,
    name: { en: '', he: '' },
    role: { en: '', he: '' },
    bio: { en: '' },
    color: STAFF_COLORS[state.staff.length % STAFF_COLORS.length],
    active: true,
    onlineBookable: true,
    // Starts from the business's opening hours; fine-tune in Availability.
    schedule: structuredClone(state.business.hours),
  });

  return (
    <div className="page">
      <PageHeader
        title={t('app.nav.staff')}
        lede={solo ? t('staffAdmin.soloLede') : t('staffAdmin.lede')}
        actions={
          <button type="button" className="btn btn--ink btn--sm" onClick={() => setEditing(blank())}>
            <PlusIcon /> {t('staffAdmin.add')}
          </button>
        }
      />

      <ul className="panel list">
        {state.staff.map((s) => {
          const services = state.services.filter((x) => x.staffIds.includes(s.id));
          const member = members.find((m) => m.staffId === s.id);
          const isMe = !!member && member.user.id === session.user.id;
          return (
            <li className="list__row staff-row" key={s.id} data-inactive={!s.active || undefined}>
              <StaffAvatar staff={s} size="lg" />
              <div className="list__main">
                <button type="button" className="row-btn list__title" onClick={() => setEditing(s)}>
                  {tx(s.name)} {isMe && <span className="badge badge--plain">{t('staffAdmin.you')}</span>}
                </button>
                <span className="list__sub">{tx(s.role)}</span>
                <span className="staff-row__facts">
                  <span>{t('staffAdmin.weekHours', { hours: fmt.number(Math.round(weeklyMinutes(s.schedule) / 6) / 10) })}</span>
                  <span>{t('staffAdmin.servicesCount', { count: services.length })}</span>
                  {!s.onlineBookable && <span>{t('servicesAdmin.hiddenOnline')}</span>}
                  <span className="staff-row__access">
                    <LockIcon size={12} />{' '}
                    {member ? (
                      <>
                        {t(`roles.${member.role}`)} · <bdi dir="ltr">{member.user.email}</bdi>
                      </>
                    ) : (
                      t('staffAdmin.accessNone')
                    )}
                  </span>
                </span>
              </div>
              <Link className="btn btn--quiet btn--sm only-desktop" to={`/app/availability?subject=${s.id}`}>
                {t('staffAdmin.editHours')}
              </Link>
              <button type="button" className="btn btn--tinted btn--sm" onClick={() => setEditing(s)}>
                {t('common.edit')}
              </button>
            </li>
          );
        })}
      </ul>

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing && state.staff.some((s) => s.id === editing.id) ? t('staffAdmin.edit') : t('staffAdmin.add')}>
        {editing && (
          <StaffForm
            key={editing.id}
            initial={editing}
            onSaved={() => {
              setEditing(null);
              toast(t('common.saved'));
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

function StaffForm({ initial, onSaved }: { initial: Staff; onSaved: () => void }) {
  const L = useLookup();
  const { t, tx } = useI18n();
  const { api } = useWorkspace();
  const [s, setS] = useState(initial);
  const [serviceIds, setServiceIds] = useState(() => L.state.services.filter((x) => x.staffIds.includes(initial.id)).map((x) => x.id));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Staff>(k: K, v: Staff[K]) => setS((x) => ({ ...x, [k]: v }));
  const valid = !!(s.name.en.trim() || s.name.he?.trim());

  const submit = async () => {
    setBusy(true);
    const name = { en: s.name.en.trim() || s.name.he!.trim(), he: s.name.he?.trim() || s.name.en.trim() };
    await api.saveStaff({ ...s, name });
    for (const svc of L.state.services) {
      const has = svc.staffIds.includes(s.id);
      const want = serviceIds.includes(svc.id);
      if (has !== want) await api.saveService({ ...svc, staffIds: want ? [...svc.staffIds, s.id] : svc.staffIds.filter((x) => x !== s.id) });
    }
    onSaved();
  };

  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void submit();
      }}
    >
      <div className="field-row">
        <label className="field">
          <span className="field__label">{t('staffAdmin.fields.nameEn')}</span>
          <input className="field__input" dir="ltr" lang="en" value={s.name.en} onChange={(e) => set('name', { ...s.name, en: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">{t('staffAdmin.fields.nameHe')}</span>
          <input className="field__input" dir="rtl" lang="he" value={s.name.he ?? ''} onChange={(e) => set('name', { ...s.name, he: e.target.value })} />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span className="field__label">{t('staffAdmin.fields.roleEn')}</span>
          <input className="field__input" dir="ltr" lang="en" value={s.role.en} onChange={(e) => set('role', { ...s.role, en: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">{t('staffAdmin.fields.roleHe')}</span>
          <input className="field__input" dir="rtl" lang="he" value={s.role.he ?? ''} onChange={(e) => set('role', { ...s.role, he: e.target.value })} />
        </label>
      </div>
      <fieldset className="field">
        <legend className="field__label">{t('staffAdmin.fields.color')}</legend>
        <div className="color-swatches">
          {STAFF_COLORS.map((c) => (
            <button key={c} type="button" className="color-swatch" aria-pressed={s.color === c} aria-label={c} style={{ background: c } as CSSProperties} onClick={() => set('color', c)} />
          ))}
        </div>
      </fieldset>
      {L.state.services.length > 0 && (
        <fieldset className="field">
          <legend className="field__label">{t('staffAdmin.fields.services')}</legend>
          <div className="checks">
            {L.state.services.map((svc) => (
              <label className="check" key={svc.id}>
                <input type="checkbox" checked={serviceIds.includes(svc.id)} onChange={(e) => setServiceIds((ids) => (e.target.checked ? [...ids, svc.id] : ids.filter((x) => x !== svc.id)))} />
                <span>{tx(svc.name)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <Switch checked={s.active} onChange={(v) => set('active', v)} label={t('staffAdmin.fields.active')} />
      <Switch checked={s.onlineBookable} onChange={(v) => set('onlineBookable', v)} label={t('staffAdmin.fields.online')} />
      <div className="save-bar">
        <button type="submit" className="btn btn--ink" disabled={!valid || busy}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  );
}
