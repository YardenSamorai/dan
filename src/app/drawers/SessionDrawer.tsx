import { useState, type CSSProperties } from 'react';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Drawer } from '../../components/ui/Drawer';
import { PlusIcon } from '../../components/ui/Icons';
import { Avatar, StaffAvatar, StatusBadge } from '../../components/ui/bits';
import { useToast } from '../../components/ui/Toast';
import { ApiError, CAPACITY_LIMIT, type CustomerInput } from '../../data';
import { joinBlock, participantsOf } from '../../domain/classes';
import { checkSlot, eligibleStaff, sessionsOf, termsFor } from '../../domain/scheduling';
import type { Appointment, AppointmentStatus, ClassSession } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/messages';
import { useAppUI } from '../AppUI';
import { CustomerPick } from '../CustomerPick';
import { useLookup, type Lookup } from '../lookup';
import { isSoftConflict, SlotStatus, TimeSelect, useConflictText } from '../shared';
import { useWorkspace } from '../workspace';

/** Attendance at a glance: the one or two things you'd mark for each person. */
const ATTENDANCE: Partial<Record<AppointmentStatus, { key: MessageKey; to: AppointmentStatus }[]>> = {
  pending: [{ key: 'appt.actions.confirm', to: 'confirmed' }],
  confirmed: [
    { key: 'appt.actions.checkIn', to: 'arrived' },
    { key: 'appt.actions.noShow', to: 'no_show' },
  ],
  arrived: [{ key: 'appt.actions.noShow', to: 'no_show' }],
  no_show: [{ key: 'appt.actions.checkIn', to: 'arrived' }],
};

export function SessionDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const L = useLookup();
  const { t } = useI18n();
  const s = id ? sessionsOf(L.state).find((x) => x.id === id) : undefined;
  return (
    <Drawer open={!!s} onClose={onClose} title={t('classes.details')}>
      {s && <Body key={s.id} s={s} L={L} onClose={onClose} />}
    </Drawer>
  );
}

function Body({ s, L, onClose }: { s: ClassSession; L: Lookup; onClose: () => void }) {
  const { t, tx, fmt } = useI18n();
  const toast = useToast();
  const conflictText = useConflictText();
  const { openAppointment } = useAppUI();
  const { api, can, solo } = useWorkspace();
  const manage = can('appointments.manage');
  const service = L.services.get(s.serviceId);
  const staff = L.staff.get(s.staffId);
  const seats = participantsOf(L.state, s.id);
  const people = L.state.appointments.filter((a) => a.sessionId === s.id && a.status !== 'cancelled').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const left = Math.max(0, s.capacity - seats.length);
  const live = s.status === 'scheduled';
  const started = joinBlock(L.state, s, false) === 'past';
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [scope, setScope] = useState<'one' | 'following'>('one');
  const [reason, setReason] = useState('');

  const errorText = (e: unknown) => {
    if (!(e instanceof ApiError)) return t('common.unknownError');
    if (e.code === 'forbidden') return t('common.forbidden');
    if (e.code === 'slot_taken') return e.conflict ? conflictText(e.conflict, staff) : t('classes.isFull');
    if (e.code === 'exists') return t('classes.alreadyIn');
    if (e.code === 'policy') return t('classes.closed');
    return t('common.unknownError');
  };
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast(done);
      return true;
    } catch (e) {
      toast(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (c: CustomerInput, customerId?: string) => {
    if (await run(() => api.addParticipant(s.id, c, customerId), t('classes.added'))) setAdding(false);
  };
  const doCancel = async () => {
    setBusy(true);
    try {
      const n = await api.cancelSessions(s.id, scope, reason.trim() || undefined);
      toast(t('classes.cancelledToast', { count: n }));
      setConfirmCancel(false);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const seated = new Set(seats.map((a) => a.customerId));
  const statusLabel = !live ? t('classes.cancelled') : left === 0 ? t('classes.full') : t('classes.spotsLeft', { count: left });

  return (
    <div className="detail">
      <div className="detail__hero">
        <span className="badge" data-status={!live ? 'cancelled' : left === 0 ? 'pending' : 'confirmed'}>
          {statusLabel}
        </span>
        <p className="detail__when">
          {fmt.relativeDay(s.date) ?? fmt.date(s.date, 'long')}
          <br />
          <span className="ltr">{fmt.timeRange(s.start, s.start + s.duration)}</span>
        </p>
        <p className="detail__service">{tx(service?.name)}</p>
        <p className="muted">
          {fmt.duration(s.duration)} · {fmt.money(s.price)}
          {s.seriesId ? ` · ${t('classes.series')}` : ''}
        </p>
        <div className="seat-meter" style={{ '--fill': s.capacity ? seats.length / s.capacity : 0 } as CSSProperties} aria-hidden>
          <span />
        </div>
        <p className="seat-meter__text tabular">
          {t('classes.booked', { taken: seats.length, capacity: s.capacity })}
          {s.waitlist.length > 0 && ` · ${t('classes.waitlistCount', { count: s.waitlist.length })}`}
        </p>
        {s.status === 'cancelled' && s.cancellation && (
          <p className="detail__cancel">
            {t('appt.cancellation', { by: t(`appt.actor.${s.cancellation.by}`), when: fmt.dateTime(new Date(s.cancellation.at)) })}
            {s.cancellation.reason && (
              <>
                <br />
                {t('appt.cancellationReason', { reason: s.cancellation.reason })}
              </>
            )}
          </p>
        )}
      </div>

      {manage && live && (
        <div className="detail__actions">
          {!started && left > 0 && (
            <button type="button" className="btn btn--sm btn--ink" aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
              <PlusIcon size={14} /> {t('classes.addParticipant')}
            </button>
          )}
          <button type="button" className="btn btn--sm btn--ghost" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
            {t('classes.edit')}
          </button>
          <button type="button" className="btn btn--sm btn--quiet btn--danger" disabled={busy} onClick={() => setConfirmCancel(true)}>
            {t('classes.cancel')}
          </button>
        </div>
      )}

      {adding && (
        <div className="panel panel__body">
          <CustomerPick onPick={add} busy={busy} actionLabel={t('classes.add')} exclude={seated} />
        </div>
      )}
      {editing && <EditSession s={s} L={L} seats={seats.length} onDone={() => setEditing(false)} />}

      <section className="detail__block">
        <h3 className="section-title">
          {t('classes.participants')} <span className="muted tabular">{t('classes.seats', { taken: seats.length, capacity: s.capacity })}</span>
        </h3>
        {people.length === 0 ? (
          <p className="muted">{t('classes.noParticipants')}</p>
        ) : (
          <ul className="roster" role="list">
            {people.map((a) => (
              <Participant key={a.id} a={a} L={L} manage={manage && live} busy={busy} onOpen={() => (onClose(), openAppointment(a.id))} onStatus={(to) => run(() => api.setAppointmentStatus(a.id, to), t('appt.statusChanged', { status: t(`status.${to}`) }))} />
            ))}
          </ul>
        )}
      </section>

      {live && s.waitlist.length > 0 && (
        <section className="detail__block">
          <h3 className="section-title">
            {t('classes.waitlist')} <span className="muted tabular">{fmt.number(s.waitlist.length)}</span>
          </h3>
          <ol className="roster" role="list">
            {s.waitlist.map((w, i) => {
              const c = L.customers.get(w.customerId);
              return (
                <li key={w.id} className="roster__row">
                  <span className="roster__pos tabular" aria-hidden>
                    {fmt.number(i + 1)}
                  </span>
                  <div className="list__main">
                    <span className="list__title">{c?.name}</span>
                    <span className="list__sub">
                      <span className="ltr">{c?.phone}</span>
                      {w.offeredAt && ` · ${t('classes.offered')}`}
                    </span>
                  </div>
                  {manage && (
                    <span className="roster__acts">
                      {left > 0 && !started && c && (
                        <button type="button" className="btn btn--ghost btn--xs" disabled={busy} onClick={() => add({ name: c.name, phone: c.phone, email: c.email, locale: c.locale }, c.id)}>
                          {t('classes.add')}
                        </button>
                      )}
                      <button type="button" className="btn btn--quiet btn--xs" disabled={busy} onClick={() => run(() => api.removeFromWaitlist(s.id, w.id), t('classes.removed'))} aria-label={`${t('classes.removeWaiting')}, ${c?.name ?? ''}`}>
                        {t('common.remove')}
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {!solo && staff && (
        <section className="detail__block">
          <h3 className="section-title">{t('classes.new.instructor')}</h3>
          <div className="detail__person">
            <StaffAvatar staff={staff} size="sm" />
            <span className="detail__person-name">{tx(staff.name)}</span>
          </div>
        </section>
      )}

      {s.note && (
        <section className="detail__block">
          <div className="msg">
            <span className="msg__meta">{t('classes.new.note')}</span>
            <p className="msg__body">{s.note}</p>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={confirmCancel}
        title={t('classes.cancel')}
        body={
          <div className="form-grid">
            <p>{t('classes.cancelConfirm')}</p>
            {s.seriesId && (
              <div className="radios" role="radiogroup" aria-label={t('classes.cancel')}>
                {(['one', 'following'] as const).map((k) => (
                  <label key={k} className="check">
                    <input type="radio" name="cancel-scope" checked={scope === k} onChange={() => setScope(k)} />
                    <span>{t(k === 'one' ? 'classes.scopeOne' : 'classes.scopeFollowing')}</span>
                  </label>
                ))}
              </div>
            )}
            <label className="field">
              <span className="field__label">{t('appt.cancelReason')}</span>
              <input className="field__input field__input--sm" value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          </div>
        }
        confirmLabel={t('classes.cancel')}
        cancelLabel={t('common.back')}
        danger
        busy={busy}
        onConfirm={doCancel}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}

function Participant({ a, L, manage, busy, onOpen, onStatus }: { a: Appointment; L: Lookup; manage: boolean; busy: boolean; onOpen: () => void; onStatus: (to: AppointmentStatus) => void }) {
  const { t } = useI18n();
  const c = L.customers.get(a.customerId);
  return (
    <li className="roster__row" data-status={a.status}>
      <Avatar name={c?.name ?? ''} size="sm" />
      <button type="button" className="row-btn list__main" onClick={onOpen}>
        <span className="list__title">{c?.name}</span>
        <span className="list__sub ltr">{c?.phone}</span>
      </button>
      {a.status !== 'confirmed' && <StatusBadge status={a.status} />}
      {manage && (
        <span className="roster__acts">
          {(ATTENDANCE[a.status] ?? []).map((x) => (
            <button key={x.to} type="button" className="btn btn--ghost btn--xs" disabled={busy} onClick={() => onStatus(x.to)}>
              {t(x.key)}
            </button>
          ))}
        </span>
      )}
    </li>
  );
}

function EditSession({ s, L, seats, onDone }: { s: ClassSession; L: Lookup; seats: number; onDone: () => void }) {
  const { t, tx } = useI18n();
  const toast = useToast();
  const conflictText = useConflictText();
  const { api, can } = useWorkspace();
  const [date, setDate] = useState(s.date);
  const [start, setStart] = useState(s.start);
  const [staffId, setStaffId] = useState(s.staffId);
  const [capacity, setCapacity] = useState(s.capacity);
  const [note, setNote] = useState(s.note ?? '');
  const [busy, setBusy] = useState(false);
  const service = L.services.get(s.serviceId);
  const staffList = eligibleStaff(L.state, s.serviceId);
  const duration = staffId !== s.staffId && service ? termsFor(service, staffId).duration : s.duration;
  const moved = date !== s.date || start !== s.start || staffId !== s.staffId;
  const conflict = moved ? checkSlot(L.state, { staffId, date, start, duration, serviceId: s.serviceId, excludeSessionId: s.id }) : null;
  const tooFew = capacity < seats;
  const unchanged = !moved && capacity === s.capacity && note === (s.note ?? '');

  const save = async () => {
    setBusy(true);
    try {
      await api.updateSession(s.id, { date, start, staffId, capacity, note, force: !!conflict && isSoftConflict(conflict) });
      toast(t('classes.saved'));
      onDone();
    } catch (e) {
      setBusy(false);
      toast(e instanceof ApiError && e.conflict ? conflictText(e.conflict, L.staff.get(staffId)) : e instanceof ApiError && e.code === 'invalid' ? t('classes.capacityTooLow', { count: seats }) : t('common.unknownError'));
    }
  };

  return (
    <div className="panel panel__body form-grid">
      <h3 className="section-title">{t('classes.edit')}</h3>
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
      <div className="field-row">
        {can('calendar.all') && staffList.length > 1 && (
          <label className="field">
            <span className="field__label">{t('classes.new.instructor')}</span>
            <select className="field__input field__input--sm" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              {staffList.map((x) => (
                <option key={x.id} value={x.id}>
                  {tx(x.name)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span className="field__label">{t('classes.new.capacity')}</span>
          <input
            className="field__input field__input--sm"
            type="number"
            inputMode="numeric"
            min={Math.max(1, seats)}
            max={CAPACITY_LIMIT}
            value={capacity}
            aria-invalid={tooFew || undefined}
            onChange={(e) => setCapacity(Math.min(CAPACITY_LIMIT, Math.max(1, Math.round(Number(e.target.value)) || 1)))}
          />
        </label>
      </div>
      {tooFew && <p className="field__error">{t('classes.capacityTooLow', { count: seats })}</p>}
      <label className="field">
        <span className="field__label">{t('classes.new.note')}</span>
        <textarea className="field__input field__input--sm" rows={2} placeholder={t('appt.internalNotePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {moved && <SlotStatus conflict={conflict} staff={L.staff.get(staffId)} okLabel={t('appt.reschedule.ok')} />}
      {moved && seats > 0 && <p className="field__hint">{t('classes.movedNote')}</p>}
      <div className="detail__actions">
        <button type="button" className="btn btn--ink btn--sm" disabled={unchanged || busy || tooFew || !isSoftConflict(conflict)} onClick={save}>
          {busy ? t('common.saving') : conflict && isSoftConflict(conflict) ? t('appt.reschedule.force') : t('classes.save')}
        </button>
        <button type="button" className="btn btn--quiet btn--sm" onClick={onDone}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
