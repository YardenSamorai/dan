import { useMemo, useState } from 'react';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Drawer } from '../../components/ui/Drawer';
import { MessageIcon, PhoneIcon } from '../../components/ui/Icons';
import { Avatar, StaffAvatar, StatusBadge } from '../../components/ui/bits';
import { useToast } from '../../components/ui/Toast';
import { CAPABILITIES } from '../../config/product';
import { ApiError } from '../../data';
import { checkSlot, eligibleStaff, termsIfMoved } from '../../domain/scheduling';
import type { Appointment, AppointmentStatus } from '../../domain/types';
import { localeMeta } from '../../i18n/config';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/messages';
import { telHref } from '../../lib/phone';
import { useAppUI } from '../AppUI';
import { useLookup, type Lookup } from '../lookup';
import { isSoftConflict, SlotStatus, TimeSelect, useConflictText } from '../shared';
import { useWorkspace } from '../workspace';

type Action = { key: MessageKey; to: AppointmentStatus; primary?: boolean };

const ACTIONS: Partial<Record<AppointmentStatus, Action[]>> = {
  pending: [
    { key: 'appt.actions.confirm', to: 'confirmed', primary: true },
    { key: 'appt.actions.noShow', to: 'no_show' },
  ],
  confirmed: [
    { key: 'appt.actions.checkIn', to: 'arrived', primary: true },
    { key: 'appt.actions.complete', to: 'completed' },
    { key: 'appt.actions.noShow', to: 'no_show' },
  ],
  arrived: [{ key: 'appt.actions.complete', to: 'completed', primary: true }],
  cancelled: [{ key: 'appt.actions.restore', to: 'confirmed' }],
  no_show: [{ key: 'appt.actions.restore', to: 'confirmed' }],
};

export function AppointmentDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const L = useLookup();
  const { t } = useI18n();
  const a = id ? L.state.appointments.find((x) => x.id === id) : undefined;
  return (
    <Drawer open={!!a} onClose={onClose} title={t('appt.details')}>
      {a && <Body key={a.id} a={a} L={L} onClose={onClose} />}
    </Drawer>
  );
}

function Body({ a, L, onClose }: { a: Appointment; L: Lookup; onClose: () => void }) {
  const { t, tx, fmt } = useI18n();
  const toast = useToast();
  const conflictText = useConflictText();
  const { openCustomer } = useAppUI();
  const { api, can, solo } = useWorkspace();
  const customer = L.customers.get(a.customerId);
  const service = L.services.get(a.serviceId);
  const staff = L.staff.get(a.staffId);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reason, setReason] = useState('');
  const [moving, setMoving] = useState(false);
  const [note, setNote] = useState(a.internalNote ?? '');
  const manage = can('appointments.manage');

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast(done);
    } catch (e) {
      toast(e instanceof ApiError && e.code === 'forbidden' ? t('common.forbidden') : e instanceof ApiError && e.conflict ? conflictText(e.conflict, staff) : t('common.unknownError'));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (to: AppointmentStatus) => {
    if (a.status === 'cancelled' || a.status === 'no_show') {
      const c = checkSlot(L.state, { staffId: a.staffId, date: a.date, start: a.start, duration: a.duration, serviceId: a.serviceId, excludeAppointmentId: a.id });
      if (c && c.kind === 'overlap') return toast(conflictText(c, staff));
    }
    await run(() => api.setAppointmentStatus(a.id, to), t('appt.statusChanged', { status: t(`status.${to}`) }));
  };

  const doCancel = async () => {
    await run(() => api.cancelAppointment(a.id, reason.trim() || undefined), t('appt.cancelled'));
    setConfirmCancel(false);
  };

  const messages = L.state.outbox.filter((m) => m.appointmentId === a.id).sort((x, y) => x.at.localeCompare(y.at));
  const active = a.status !== 'cancelled' && a.status !== 'no_show' && a.status !== 'completed';
  const buffers = service && (service.bufferBefore > 0 || service.bufferAfter > 0);

  return (
    <div className="detail">
      <div className="detail__hero">
        <StatusBadge status={a.status} />
        <p className="detail__when">
          {fmt.relativeDay(a.date) ?? fmt.date(a.date, 'long')}
          <br />
          <span className="ltr">{fmt.timeRange(a.start, a.start + a.duration)}</span>
        </p>
        <p className="detail__service">
          {tx(service?.name)}
          {a.addOnIds.length > 0 && <span className="muted"> + {fmt.list(a.addOnIds.map((x) => tx(L.addOns.get(x)?.name)))}</span>}
        </p>
        <p className="muted">
          {fmt.duration(a.duration)} · {fmt.money(a.price)} · {a.source === 'online' ? t('appt.sourceOnline') : t('appt.sourceStudio')}
        </p>
        {buffers && <p className="muted detail__buffers">{t(`appt.buffers.${service.bufferBefore && service.bufferAfter ? 'both' : service.bufferBefore ? 'before' : 'after'}`, { before: fmt.duration(service.bufferBefore), after: fmt.duration(service.bufferAfter) })}</p>}
        {a.status === 'cancelled' && a.cancellation && (
          <p className="detail__cancel">
            {t('appt.cancellation', { by: t(`appt.actor.${a.cancellation.by}`), when: fmt.dateTime(new Date(a.cancellation.at)) })}
            {a.cancellation.reason && (
              <>
                <br />
                {t('appt.cancellationReason', { reason: a.cancellation.reason })}
              </>
            )}
          </p>
        )}
      </div>

      {manage && (
        <div className="detail__actions">
          {(ACTIONS[a.status] ?? []).map((x) => (
            <button key={x.key} type="button" className={`btn btn--sm ${x.primary ? 'btn--ink' : 'btn--ghost'}`} disabled={busy} onClick={() => setStatus(x.to)}>
              {t(x.key)}
            </button>
          ))}
          {active && (
            <>
              <button type="button" className="btn btn--sm btn--ghost" aria-expanded={moving} onClick={() => setMoving((v) => !v)}>
                {t('appt.actions.reschedule')}
              </button>
              <button type="button" className="btn btn--sm btn--quiet btn--danger" disabled={busy} onClick={() => setConfirmCancel(true)}>
                {t('appt.actions.cancel')}
              </button>
            </>
          )}
        </div>
      )}

      {moving && <Reschedule a={a} L={L} onDone={() => setMoving(false)} />}

      <section className="detail__block" aria-label={t('appt.customer')}>
        <h3 className="section-title">{t('appt.customer')}</h3>
        {customer && (
          <div className="detail__person">
            <Avatar name={customer.name} />
            <div className="list__main">
              {can('customers.view') ? (
                <button type="button" className="row-btn detail__person-name" onClick={() => (onClose(), openCustomer(customer.id))}>
                  {customer.name}
                </button>
              ) : (
                <span className="detail__person-name">{customer.name}</span>
              )}
              <span className="list__sub">
                <span className="ltr">{customer.phone}</span> · {localeMeta[customer.locale].label}
              </span>
            </div>
            <a className="btn btn--ghost btn--sm btn--icon" href={telHref(customer.phone)} aria-label={`${t('common.call')} ${customer.phone}`}>
              <PhoneIcon />
            </a>
          </div>
        )}
        {a.note && (
          <div className="msg">
            <span className="msg__meta">{t('appt.customerNote')}</span>
            <p className="msg__body">{a.note}</p>
          </div>
        )}
      </section>

      {!solo && (
        <section className="detail__block">
          <h3 className="section-title">{t('appt.staff')}</h3>
          {staff && (
            <div className="detail__person">
              <StaffAvatar staff={staff} size="sm" />
              <div className="list__main">
                <span className="detail__person-name">{tx(staff.name)}</span>
                {a.anyStaff && <span className="list__sub">{t('appt.anyStaff')}</span>}
              </div>
            </div>
          )}
        </section>
      )}

      {manage && (
        <section className="detail__block">
          <label className="field" htmlFor="appt-note">
            <span className="section-title">{t('appt.internalNote')}</span>
            <textarea
              id="appt-note"
              className="field__input field__input--sm"
              rows={3}
              placeholder={t('appt.internalNotePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={async () => {
                if (note === (a.internalNote ?? '')) return;
                await run(() => api.updateAppointmentNotes(a.id, note), t('common.saved'));
              }}
            />
          </label>
        </section>
      )}

      {messages.length > 0 && (
        <section className="detail__block">
          <h3 className="section-title">{t('appt.messages')}</h3>
          {!CAPABILITIES.messaging && <p className="inline-alert inline-alert--warn">{t('preview.notSent')}</p>}
          {messages.map((m) => (
            <div className="msg" key={m.id}>
              <span className="msg__meta">
                <MessageIcon size={12} />
                {t(`settings.notifications.kinds.${m.kind}`)} · {t(`channel.${m.channel}`)} · {t(m.state === 'queued' ? 'appt.queued' : 'appt.scheduled', { when: fmt.dateTime(new Date(m.at)) })}
              </span>
              <p className="msg__body" dir={localeMeta[m.locale].dir} lang={m.locale}>
                {m.body}
              </p>
            </div>
          ))}
        </section>
      )}

      <section className="detail__block">
        <h3 className="section-title">{t('appt.history')}</h3>
        <ol className="timeline">
          {[...a.history].reverse().map((e, i) => (
            <li key={i}>
              <time dateTime={e.at}>{fmt.dateTime(new Date(e.at))}</time>
              <span>
                {e.type === 'status'
                  ? t('appt.event.status', { status: t(`status.${e.detail as AppointmentStatus}`) })
                  : t(`appt.event.${e.type}`, { by: t(`appt.actor.${e.by}`) })}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <ConfirmDialog
        open={confirmCancel}
        title={t('appt.actions.cancel')}
        body={
          <div className="form-grid">
            <p>{t('appt.cancelConfirm')}</p>
            <label className="field">
              <span className="field__label">{t('appt.cancelReason')}</span>
              <input className="field__input field__input--sm" value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          </div>
        }
        confirmLabel={t('appt.actions.cancel')}
        cancelLabel={t('common.back')}
        danger
        busy={busy}
        onConfirm={doCancel}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}

function Reschedule({ a, L, onDone }: { a: Appointment; L: Lookup; onDone: () => void }) {
  const { t, tx, fmt } = useI18n();
  const toast = useToast();
  const conflictText = useConflictText();
  const { api, can } = useWorkspace();
  const [date, setDate] = useState(a.date);
  const [start, setStart] = useState(a.start);
  const [staffId, setStaffId] = useState(a.staffId);
  const [busy, setBusy] = useState(false);
  const staffList = useMemo(() => eligibleStaff(L.state, a.serviceId), [L.state, a.serviceId]);
  const terms = termsIfMoved(L.state, a, staffId);
  const conflict = checkSlot(L.state, { staffId, date, start, duration: terms.duration, serviceId: a.serviceId, excludeAppointmentId: a.id });
  const termsChange = terms.duration !== a.duration || terms.price !== a.price;
  const unchanged = date === a.date && start === a.start && staffId === a.staffId;

  const apply = async () => {
    setBusy(true);
    try {
      await api.rescheduleAppointment(a.id, { date, start, staffId, force: true });
      toast(t('calendar.moved', { when: `${fmt.date(date, 'medium')} ${fmt.time(start)}` }));
      onDone();
    } catch (e) {
      setBusy(false);
      toast(e instanceof ApiError && e.conflict ? conflictText(e.conflict, L.staff.get(staffId)) : t('common.unknownError'));
    }
  };

  return (
    <div className="panel panel__body form-grid">
      <h3 className="section-title">{t('appt.reschedule.title')}</h3>
      <div className="field-row">
        <label className="field">
          <span className="field__label">{t('appt.reschedule.date')}</span>
          <input type="date" className="field__input field__input--sm" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('appt.reschedule.time')}</span>
          <TimeSelect value={start} onChange={setStart} step={L.state.business.policies.slotInterval} />
        </label>
      </div>
      {can('calendar.all') && staffList.length > 1 && (
        <label className="field">
          <span className="field__label">{t('appt.reschedule.staff')}</span>
          <select className="field__input field__input--sm" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {tx(s.name)}
              </option>
            ))}
          </select>
        </label>
      )}
      {termsChange && (
        <p className="field__hint">
          {t('appt.reschedule.newTerms', { staff: tx(L.staff.get(staffId)?.name), duration: fmt.duration(terms.duration), price: fmt.money(terms.price) })}
        </p>
      )}
      {!unchanged && <SlotStatus conflict={conflict} staff={L.staff.get(staffId)} okLabel={t('appt.reschedule.ok')} />}
      <div className="detail__actions">
        <button type="button" className="btn btn--ink btn--sm" disabled={unchanged || busy || !isSoftConflict(conflict)} onClick={apply}>
          {conflict && isSoftConflict(conflict) ? t('appt.reschedule.force') : t('appt.reschedule.apply')}
        </button>
        <button type="button" className="btn btn--quiet btn--sm" onClick={onDone}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
