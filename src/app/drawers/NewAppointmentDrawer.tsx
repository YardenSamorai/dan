import { useMemo, useState } from 'react';
import { Drawer } from '../../components/ui/Drawer';
import { SearchIcon } from '../../components/ui/Icons';
import { Avatar } from '../../components/ui/bits';
import { useToast } from '../../components/ui/Toast';
import { ApiError, CAPACITY_LIMIT, REPEAT_LIMITS } from '../../data';
import { Link } from 'react-router-dom';
import { bookingDuration, bookingPrice, businessNow, checkSlot, eligibleStaff, isClass, termsFor, termsRange, type Conflict } from '../../domain/scheduling';
import { addDays, snap } from '../../domain/time';
import type { BlockKind, Customer, Minutes, TenantData } from '../../domain/types';
import { localeMeta, locales, type Locale } from '../../i18n/config';
import { useI18n } from '../../i18n/I18nProvider';
import type { NewAppointmentPrefill } from '../AppUI';
import { useLookup, type Lookup } from '../lookup';
import { isSoftConflict, SlotStatus, TimeSelect, useConflictText } from '../shared';
import { useWorkspace } from '../workspace';

interface Props {
  prefill: NewAppointmentPrefill | null;
  onClose: () => void;
  onCreated: (id?: string, kind?: 'session') => void;
}

type Mode = NonNullable<NewAppointmentPrefill['mode']>;
const TAB_LABEL = { appointment: 'appt.new.tabAppointment', class: 'classes.new.tab', block: 'appt.new.tabBlock' } as const;
const TITLE = { appointment: 'appt.new.title', class: 'classes.new.title', block: 'appt.new.blockTitle' } as const;

export function NewAppointmentDrawer({ prefill, onClose, onCreated }: Props) {
  const { t } = useI18n();
  const L = useLookup();
  const [mode, setMode] = useState<Mode>('appointment');
  const [opened, setOpened] = useState<NewAppointmentPrefill | null>(null);
  const [seq, setSeq] = useState(0);
  if (prefill !== opened) {
    setOpened(prefill);
    setSeq((n) => n + 1);
    if (prefill) setMode(prefill.mode ?? 'appointment');
  }
  const hasClasses = L.state.services.some((s) => s.active && isClass(s));
  const modes: Mode[] = hasClasses || mode === 'class' ? ['appointment', 'class', 'block'] : ['appointment', 'block'];

  return (
    <Drawer open={!!prefill} onClose={onClose} title={t(TITLE[mode])}>
      {prefill && (
        <div className="detail">
          <div className="tabs" role="tablist">
            {modes.map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>
                {t(TAB_LABEL[m])}
              </button>
            ))}
          </div>
          {mode === 'appointment' ? (
            <AppointmentForm key={seq} L={L} prefill={prefill} onCreated={onCreated} />
          ) : mode === 'class' ? (
            <ClassForm key={seq} L={L} prefill={prefill} onCreated={(id) => onCreated(id, 'session')} />
          ) : (
            <BlockForm key={seq} L={L} prefill={prefill} onCreated={onCreated} />
          )}
        </div>
      )}
    </Drawer>
  );
}

function defaultStart(state: TenantData, prefill: NewAppointmentPrefill, step: number): Minutes {
  if (prefill.start !== undefined) return prefill.start;
  const m = snap(businessNow(state).minutes + step / 2, step);
  return Math.min(Math.max(m, 9 * 60), 19 * 60);
}

function AppointmentForm({ L, prefill, onCreated }: { L: Lookup; prefill: NewAppointmentPrefill; onCreated: (id?: string) => void }) {
  const { t, tx, fmt } = useI18n();
  const toast = useToast();
  const conflictText = useConflictText();
  const { api, can, me, solo } = useWorkspace();
  const { business, services, addOns, customers } = L.state;
  const step = business.policies.slotInterval;
  const allCalendar = can('calendar.all');

  const [customerId, setCustomerId] = useState<string | null>(prefill.customerId ?? null);
  const [query, setQuery] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', locale: business.defaultLocale as Locale });

  const bookable = services.filter((s) => s.active && !isClass(s) && (allCalendar || (me && s.staffIds.includes(me.id))));
  const [serviceId, setServiceId] = useState(() => {
    const s = prefill.staffId ? bookable.find((x) => x.staffIds.includes(prefill.staffId!)) : bookable[0];
    return (s ?? bookable[0])?.id ?? '';
  });
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const staffList = eligibleStaff(L.state, serviceId).filter((s) => allCalendar || s.id === me?.id);
  const [staffChoice, setStaffChoice] = useState<string>(prefill.staffId ?? (allCalendar ? 'any' : me?.id ?? 'any'));
  const [date, setDate] = useState(prefill.date ?? businessNow(L.state).date);
  const [start, setStart] = useState(() => defaultStart(L.state, prefill, step));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const staffValid = (staffChoice === 'any' && staffList.length > 1) || staffList.some((s) => s.id === staffChoice);
  const effectiveChoice = staffValid ? staffChoice : staffList.length === 1 ? staffList[0].id : 'any';

  // For "any", show who would take it: the first eligible artist with no conflict, on their own duration.
  const resolved = useMemo((): { staffId: string; conflict: Conflict | null } => {
    const check = (id: string) => checkSlot(L.state, { staffId: id, date, start, duration: bookingDuration(L.state, serviceId, addOnIds, id), serviceId });
    if (effectiveChoice !== 'any') return { staffId: effectiveChoice, conflict: check(effectiveChoice) };
    const results = staffList.map((s) => ({ staffId: s.id, conflict: check(s.id) }));
    return results.find((r) => !r.conflict) ?? results.find((r) => isSoftConflict(r.conflict)) ?? results[0] ?? { staffId: '', conflict: { kind: 'not_working' } };
  }, [L.state, effectiveChoice, staffList, date, start, addOnIds, serviceId]);
  const duration = bookingDuration(L.state, serviceId, addOnIds, resolved.staffId);
  const price = bookingPrice(L.state, serviceId, addOnIds, resolved.staffId);

  const [everyWeeks, setEveryWeeks] = useState(0);
  const [count, setCount] = useState(6);
  const later = useMemo(() => {
    if (!everyWeeks || !resolved.staffId) return [];
    return Array.from({ length: count - 1 }, (_, i) => {
      const d = addDays(date, (i + 1) * everyWeeks * 7);
      return { date: d, conflict: checkSlot(L.state, { staffId: resolved.staffId, date: d, start, duration, serviceId }) };
    });
  }, [L.state, everyWeeks, count, date, start, duration, serviceId, resolved.staffId]);
  const outsideHours = !!resolved.conflict && isSoftConflict(resolved.conflict);
  const taken = later.filter((x) => x.conflict && !(outsideHours && isSoftConflict(x.conflict)));

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const list = q ? customers.filter((c) => c.name.toLowerCase().includes(q) || (digits.length > 2 && c.phone.replace(/\D/g, '').includes(digits))) : customers;
    return [...list].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 6);
  }, [customers, query]);

  const customer: Customer | undefined = customerId ? L.customers.get(customerId) : undefined;
  const customerReady = !!customer || (creatingCustomer && newCustomer.name.trim().length > 1 && newCustomer.phone.replace(/\D/g, '').length >= 7);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const input = {
        serviceId,
        addOnIds,
        staffId: resolved.staffId,
        date,
        start,
        force: isSoftConflict(resolved.conflict),
        customerId: customer?.id,
        customer: customer ? { name: customer.name, phone: customer.phone, email: customer.email, locale: customer.locale } : { ...newCustomer, name: newCustomer.name.trim() },
      };
      if (everyWeeks) {
        const r = await api.createAppointmentSeries(input, { everyWeeks, count });
        toast(r.skipped.length ? t('appt.new.seriesPartly', { count: r.created.length, skipped: r.skipped.length }) : t('appt.new.seriesCreated', { count: r.created.length }));
        onCreated(r.created[0].id);
        return;
      }
      const a = await api.createAppointment(input);
      toast(t('appt.new.created'));
      onCreated(a.id);
    } catch (e) {
      setBusy(false);
      setError(
        e instanceof ApiError && e.code === 'forbidden'
          ? t('common.forbidden')
          : e instanceof ApiError
            ? conflictText(e.conflict ?? { kind: 'slot_taken' }, L.staff.get(resolved.staffId))
            : t('common.unknownError'),
      );
    }
  };

  if (!bookable.length) return <p className="empty">{t('servicesAdmin.empty')}</p>;

  return (
    <div className="form-grid">
      <section className="form-section form-grid">
        <h3 className="section-title">{t('appt.new.customer')}</h3>
        {customer ? (
          <div className="chosen">
            <Avatar name={customer.name} size="sm" />
            <div className="list__main">
              <span className="list__title">{customer.name}</span>
              <span className="list__sub ltr">{customer.phone}</span>
            </div>
            <button type="button" className="btn btn--quiet btn--xs" onClick={() => setCustomerId(null)}>
              {t('common.change')}
            </button>
          </div>
        ) : creatingCustomer ? (
          <>
            <div className="field-row">
              <label className="field">
                <span className="field__label">{t('appt.new.name')}</span>
                <input className="field__input" autoFocus value={newCustomer.name} onChange={(e) => setNewCustomer((c) => ({ ...c, name: e.target.value }))} />
              </label>
              <label className="field">
                <span className="field__label">{t('appt.new.phone')}</span>
                <input className="field__input ltr" type="tel" dir="ltr" value={newCustomer.phone} onChange={(e) => setNewCustomer((c) => ({ ...c, phone: e.target.value }))} />
              </label>
            </div>
            <label className="field">
              <span className="field__label">{t('appt.new.language')}</span>
              <select className="field__input" value={newCustomer.locale} onChange={(e) => setNewCustomer((c) => ({ ...c, locale: e.target.value as Locale }))}>
                {locales.map((l) => (
                  <option key={l} value={l}>
                    {localeMeta[l].label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn--quiet btn--xs" style={{ justifySelf: 'start' }} onClick={() => setCreatingCustomer(false)}>
              {t('common.back')}
            </button>
          </>
        ) : (
          <>
            <label className="search">
              <SearchIcon />
              <input
                className="field__input"
                type="search"
                placeholder={t('appt.new.searchCustomer')}
                aria-label={t('appt.new.searchCustomer')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="picker-list">
              {matches.map((c) => (
                <button key={c.id} type="button" onClick={() => setCustomerId(c.id)}>
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
                setCreatingCustomer(true);
                const q = query.trim();
                if (q) setNewCustomer((c) => (/\d{3}/.test(q) ? { ...c, phone: q } : { ...c, name: q }));
              }}
            >
              {t('appt.new.newCustomer')}
            </button>
          </>
        )}
      </section>

      <section className="form-section form-grid">
        <label className="field">
          <span className="field__label">{t('appt.service')}</span>
          <select className="field__input" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {bookable.map((s) => {
              const r = termsRange(s, allCalendar ? s.staffIds : [me!.id]);
              return (
                <option key={s.id} value={s.id}>
                  {tx(s.name)} · {fmt.durationRange(r.duration)} · {fmt.moneyRange(r.price)}
                </option>
              );
            })}
          </select>
        </label>
        {addOns.some((x) => x.active) && (
        <fieldset className="field">
          <legend className="field__label">{t('appt.addOns')}</legend>
          <div className="checks">
            {addOns
              .filter((x) => x.active)
              .map((x) => (
                <label className="check" key={x.id}>
                  <input
                    type="checkbox"
                    checked={addOnIds.includes(x.id)}
                    onChange={(e) => setAddOnIds((ids) => (e.target.checked ? [...ids, x.id] : ids.filter((i) => i !== x.id)))}
                  />
                  <span>
                    {tx(x.name)} <span className="muted">+{fmt.money(x.price)}</span>
                  </span>
                </label>
              ))}
          </div>
        </fieldset>
        )}
        {!solo && staffList.length > 1 && (
          <label className="field">
            <span className="field__label">{t('appt.staff')}</span>
            <select className="field__input" value={effectiveChoice} onChange={(e) => setStaffChoice(e.target.value)}>
              <option value="any">{t('common.anyAvailable')}</option>
              {staffList.map((s) => {
                const own = L.services.get(serviceId);
                const differs = !!own?.staffTerms?.[s.id];
                return (
                  <option key={s.id} value={s.id}>
                    {tx(s.name)}
                    {differs && own ? ` · ${fmt.duration(termsFor(own, s.id).duration)} · ${fmt.money(termsFor(own, s.id).price)}` : ''}
                  </option>
                );
              })}
            </select>
          </label>
        )}
      </section>

      <section className="form-section form-grid">
        <div className="field-row">
          <label className="field">
            <span className="field__label">{t('appt.reschedule.date')}</span>
            <input type="date" className="field__input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">{t('appt.reschedule.time')}</span>
            <TimeSelect value={start} onChange={setStart} step={step} />
          </label>
        </div>
        <SlotStatus
          conflict={resolved.conflict}
          staff={L.staff.get(resolved.staffId)}
          okLabel={
            effectiveChoice === 'any' && resolved.staffId
              ? `${t('appt.reschedule.ok')} · ${tx(L.staff.get(resolved.staffId)?.name)}`
              : t('appt.reschedule.ok')
          }
        />
        <p className="muted">
          {fmt.timeRange(start, start + duration)} · {fmt.duration(duration)} · {fmt.money(price)}
        </p>
        <div className="field-row">
          <label className="field">
            <span className="field__label">{t('appt.new.repeat')}</span>
            <select className="field__input" value={everyWeeks} onChange={(e) => setEveryWeeks(Number(e.target.value))}>
              {[0, 1, 2, 3, 4, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n ? t('appt.new.every', { count: n }) : t('appt.new.once')}
                </option>
              ))}
            </select>
          </label>
          {!!everyWeeks && (
            <label className="field">
              <span className="field__label">{t('appt.new.howMany')}</span>
              <select className="field__input" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {Array.from({ length: REPEAT_LIMITS.count - 1 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    {t('appointments.count', { count: n })}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {!!everyWeeks && later.length > 0 && (
          <div className="series-preview">
            <p className="muted">{t('appt.new.until', { date: fmt.date(later[later.length - 1].date, 'medium') })}</p>
            {taken.length > 0 && (
              <div className="series-preview__taken" role="status">
                <p>{t('appt.new.takenDates', { count: taken.length })}</p>
                <ul>
                  {taken.map((x) => (
                    <li key={x.date}>
                      {fmt.date(x.date, 'medium')} · {conflictText(x.conflict!, L.staff.get(resolved.staffId))}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn btn--primary" disabled={busy || !customerReady || !resolved.staffId || !isSoftConflict(resolved.conflict)} onClick={submit}>
          {busy ? t('common.saving') : resolved.conflict && isSoftConflict(resolved.conflict) ? t('appt.reschedule.force') : t('appt.new.create')}
        </button>
      </section>
    </div>
  );
}

function ClassForm({ L, prefill, onCreated }: { L: Lookup; prefill: NewAppointmentPrefill; onCreated: (id?: string) => void }) {
  const { t, tx, fmt } = useI18n();
  const toast = useToast();
  const conflictText = useConflictText();
  const { api, can, me, solo } = useWorkspace();
  const step = L.state.business.policies.slotInterval;
  const allCalendar = can('calendar.all');
  const classes = L.state.services.filter((s) => s.active && isClass(s) && (allCalendar || (me && s.staffIds.includes(me.id))));
  const [serviceId, setServiceId] = useState(() => (prefill.staffId ? classes.find((s) => s.staffIds.includes(prefill.staffId!)) : classes[0])?.id ?? classes[0]?.id ?? '');
  const service = L.services.get(serviceId);
  const staffList = eligibleStaff(L.state, serviceId).filter((s) => allCalendar || s.id === me?.id);
  const [staffChoice, setStaffChoice] = useState(prefill.staffId ?? me?.id ?? '');
  const staffId = staffList.some((s) => s.id === staffChoice) ? staffChoice : staffList[0]?.id ?? '';
  const [date, setDate] = useState(prefill.date ?? businessNow(L.state).date);
  const [start, setStart] = useState(() => defaultStart(L.state, prefill, step));
  const [capacity, setCapacity] = useState<number | null>(null);
  const seats = capacity ?? service?.capacity ?? 8;
  const [note, setNote] = useState('');
  const [everyWeeks, setEveryWeeks] = useState(0);
  const [count, setCount] = useState(12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const terms = service ? termsFor(service, staffId) : { duration: 60, price: 0 };
  const conflict = staffId ? checkSlot(L.state, { staffId, date, start, duration: terms.duration, serviceId }) : ({ kind: 'not_working' } as Conflict);
  const later = useMemo(
    () =>
      everyWeeks && staffId
        ? Array.from({ length: count - 1 }, (_, i) => {
            const d = addDays(date, (i + 1) * everyWeeks * 7);
            return { date: d, conflict: checkSlot(L.state, { staffId, date: d, start, duration: terms.duration, serviceId }) };
          })
        : [],
    [L.state, everyWeeks, count, date, start, terms.duration, serviceId, staffId],
  );
  const soft = !!conflict && isSoftConflict(conflict);
  const taken = later.filter((x) => x.conflict && !(soft && isSoftConflict(x.conflict)));

  if (!classes.length)
    return (
      <div className="form-grid">
        <p className="muted">{t('classes.new.none')}</p>
        {can('services.manage') && (
          <Link to="/app/services" className="btn btn--ghost btn--sm" style={{ justifySelf: 'start' }}>
            {t('classes.new.toServices')}
          </Link>
        )}
      </div>
    );

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.createSessions({ serviceId, staffId, date, start, capacity: seats, note: note.trim() || undefined, force: soft }, everyWeeks ? { everyWeeks, count } : undefined);
      toast(
        !everyWeeks ? t('classes.new.created') : r.skipped.length ? t('classes.new.seriesPartly', { count: r.created.length }) : t('classes.new.seriesCreated', { count: r.created.length }),
      );
      onCreated(r.created[0]?.id);
    } catch (e) {
      setBusy(false);
      setError(e instanceof ApiError && e.code === 'forbidden' ? t('common.forbidden') : e instanceof ApiError ? conflictText(e.conflict ?? { kind: 'slot_taken' }, L.staff.get(staffId)) : t('common.unknownError'));
    }
  };

  return (
    <div className="form-grid">
      <section className="form-section form-grid">
        <label className="field">
          <span className="field__label">{t('classes.new.class')}</span>
          <select className="field__input" value={serviceId} onChange={(e) => (setServiceId(e.target.value), setCapacity(null))}>
            {classes.map((s) => (
              <option key={s.id} value={s.id}>
                {tx(s.name)} · {fmt.duration(s.duration)} · {t('servicesAdmin.classBadge', { count: s.capacity! })}
              </option>
            ))}
          </select>
        </label>
        <div className="field-row">
          {!solo && staffList.length > 1 && (
            <label className="field">
              <span className="field__label">{t('classes.new.instructor')}</span>
              <select className="field__input" value={staffId} onChange={(e) => setStaffChoice(e.target.value)}>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {tx(s.name)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span className="field__label">{t('classes.new.capacity')}</span>
            <input
              className="field__input"
              type="number"
              inputMode="numeric"
              min={1}
              max={CAPACITY_LIMIT}
              value={seats}
              onChange={(e) => setCapacity(Math.min(CAPACITY_LIMIT, Math.max(1, Math.round(Number(e.target.value)) || 1)))}
            />
          </label>
        </div>
      </section>

      <section className="form-section form-grid">
        <div className="field-row">
          <label className="field">
            <span className="field__label">{t('appt.reschedule.date')}</span>
            <input type="date" className="field__input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">{t('appt.reschedule.time')}</span>
            <TimeSelect value={start} onChange={setStart} step={step} />
          </label>
        </div>
        <SlotStatus conflict={conflict} staff={L.staff.get(staffId)} okLabel={t('appt.reschedule.ok')} />
        <p className="muted">
          {fmt.timeRange(start, start + terms.duration)} · {fmt.duration(terms.duration)} · {fmt.money(terms.price)}
        </p>
        <div className="field-row">
          <label className="field">
            <span className="field__label">{t('appt.new.repeat')}</span>
            <select className="field__input" value={everyWeeks} onChange={(e) => setEveryWeeks(Number(e.target.value))}>
              {[0, 1, 2].map((n) => (
                <option key={n} value={n}>
                  {n ? t('appt.new.every', { count: n }) : t('appt.new.once')}
                </option>
              ))}
            </select>
          </label>
          {!!everyWeeks && (
            <label className="field">
              <span className="field__label">{t('classes.new.howMany')}</span>
              <select className="field__input" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {Array.from({ length: REPEAT_LIMITS.count - 1 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    {t('classes.new.count', { count: n })}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {!!everyWeeks && later.length > 0 && (
          <div className="series-preview">
            <p className="muted">{t('classes.new.until', { date: fmt.date(later[later.length - 1].date, 'medium') })}</p>
            {taken.length > 0 && (
              <div className="series-preview__taken" role="status">
                <p>{t('classes.new.takenDates', { count: taken.length })}</p>
                <ul>
                  {taken.map((x) => (
                    <li key={x.date}>
                      {fmt.date(x.date, 'medium')} · {conflictText(x.conflict!, L.staff.get(staffId))}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <label className="field">
          <span className="field__label">
            {t('classes.new.note')} <span className="muted">({t('common.optional')})</span>
          </span>
          <input className="field__input" placeholder={t('appt.internalNotePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn btn--primary" disabled={busy || !staffId || !isSoftConflict(conflict)} onClick={submit}>
          {busy ? t('common.saving') : soft ? t('appt.reschedule.force') : t('classes.new.create')}
        </button>
      </section>
    </div>
  );
}

const BLOCK_KINDS: BlockKind[] = ['blocked', 'break', 'personal'];

function BlockForm({ L, prefill, onCreated }: { L: Lookup; prefill: NewAppointmentPrefill; onCreated: (id?: string) => void }) {
  const { t, tx } = useI18n();
  const toast = useToast();
  const { api, can, me, solo } = useWorkspace();
  const allTeam = can('availability.all');
  const step = L.state.business.policies.slotInterval;
  const [staffId, setStaffId] = useState<string>(allTeam ? prefill.staffId ?? '' : me?.id ?? '');
  const [kind, setKind] = useState<BlockKind>('blocked');
  const [date, setDate] = useState(prefill.date ?? businessNow(L.state).date);
  const [start, setStart] = useState(() => defaultStart(L.state, prefill, step));
  const [end, setEnd] = useState(() => defaultStart(L.state, prefill, step) + 60);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = end > start;

  const submit = async () => {
    setBusy(true);
    try {
      await api.addBlock({ staffId: staffId || null, date, start, end, kind, label: label.trim() || t(`blockKind.${kind}`) });
      toast(t('appt.new.blockCreated'));
      onCreated();
    } catch {
      setBusy(false);
      toast(t('common.forbidden'));
    }
  };

  return (
    <div className="form-grid">
      {allTeam && !solo && (
        <label className="field">
          <span className="field__label">{t('availability.blocks.who')}</span>
          <select className="field__input" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">{t('appt.new.wholeTeam')}</option>
            {L.state.staff
              .filter((s) => s.active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {tx(s.name)}
                </option>
              ))}
          </select>
        </label>
      )}
      <div className="field">
        <span className="field__label">{t('appt.new.blockKind')}</span>
        <div className="segmented" role="group" aria-label={t('appt.new.blockKind')}>
          {BLOCK_KINDS.map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {t(`blockKind.${k}`)}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span className="field__label">{t('availability.blocks.date')}</span>
        <input type="date" className="field__input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </label>
      <div className="field-row">
        <label className="field">
          <span className="field__label">{t('availability.blocks.start')}</span>
          <TimeSelect value={start} onChange={setStart} step={step} />
        </label>
        <label className="field">
          <span className="field__label">{t('appt.new.end')}</span>
          <TimeSelect value={end} onChange={setEnd} step={step} />
        </label>
      </div>
      <label className="field">
        <span className="field__label">{t('appt.new.blockLabel')}</span>
        <input className="field__input" placeholder={t('appt.new.blockLabelPlaceholder')} value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <button type="button" className="btn btn--primary" disabled={busy || !valid} onClick={submit}>
        {busy ? t('common.saving') : t('appt.new.createBlock')}
      </button>
    </div>
  );
}
