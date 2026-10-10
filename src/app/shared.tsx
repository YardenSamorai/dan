import { useCallback, type ReactNode } from 'react';
import { AlertIcon, CheckIcon } from '../components/ui/Icons';
import type { Conflict } from '../domain/scheduling';
import type { Minutes, Staff } from '../domain/types';
import { useI18n } from '../i18n/I18nProvider';

/** The large title every management page opens with; the top bar takes over the name once it scrolls away. */
export function PageHeader({ title, lede, eyebrow, actions }: { title: ReactNode; lede?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="app-head">
      <div className="app-head__text">
        {eyebrow && <p className="app-head__eyebrow">{eyebrow}</p>}
        <h1 className="app-head__title">{title}</h1>
        {lede && <p className="app-head__lede">{lede}</p>}
      </div>
      {actions && <div className="app-head__actions">{actions}</div>}
    </header>
  );
}

/** Client-generated id for new records (a real backend may assign its own). */
export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

/** Selectable start/end times for staff-side forms. */
export function timeOptions(step = 15, from: Minutes = 7 * 60, to: Minutes = 22 * 60, include?: Minutes): Minutes[] {
  const out: Minutes[] = [];
  for (let m = from; m <= to; m += step) out.push(m);
  if (include !== undefined && !out.includes(include)) out.push(include), out.sort((a, b) => a - b);
  return out;
}

export function TimeSelect({
  value,
  onChange,
  step,
  from,
  to,
  id,
  label,
}: {
  value: Minutes;
  onChange: (m: Minutes) => void;
  step?: number;
  from?: Minutes;
  to?: Minutes;
  id?: string;
  label?: string;
}) {
  const { fmt } = useI18n();
  return (
    <select id={id} aria-label={label} className="field__input field__input--sm" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {timeOptions(step, from, to, value).map((m) => (
        <option key={m} value={m}>
          {fmt.time(m)}
        </option>
      ))}
    </select>
  );
}

export function useConflictText() {
  const { t, tx } = useI18n();
  return useCallback(
    (c: Conflict | { kind: 'slot_taken' }, staff?: Staff) => t(`conflict.${c.kind}`, { staff: staff ? tx(staff.name) : '' }),
    [t, tx],
  );
}

/** Live availability line under a time picker. */
export function SlotStatus({ conflict, staff, okLabel }: { conflict: Conflict | null; staff?: Staff; okLabel: string }) {
  const text = useConflictText();
  if (!conflict)
    return (
      <p className="inline-alert inline-alert--ok" role="status">
        <CheckIcon size={14} /> {okLabel}
      </p>
    );
  const soft = conflict.kind === 'outside_shift';
  return (
    <p className={`inline-alert inline-alert--${soft ? 'warn' : 'danger'}`} role="status">
      <AlertIcon size={14} /> {text(conflict, staff)}
    </p>
  );
}

export const isSoftConflict = (c: Conflict | null) => !c || c.kind === 'outside_shift';
