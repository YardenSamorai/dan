import type { CSSProperties, ReactNode } from 'react';
import type { AppointmentStatus, Staff } from '../../domain/types';
import { locales, localeMeta } from '../../i18n/config';
import { useI18n } from '../../i18n/I18nProvider';
import { CAPABILITIES, PRODUCT } from '../../config/product';
import { BusinessMark, ProductMark } from './Icons';

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
}

export function Avatar({ name, color, size, src }: { name: string; color?: string; size?: 'sm' | 'lg' | 'xl'; src?: string }) {
  return (
    <span className={`avatar${size ? ` avatar--${size}` : ''}`} style={color ? ({ '--tone': color } as CSSProperties) : undefined} aria-hidden>
      {src ? <img className="avatar__img" src={src} alt="" /> : initials(name)}
    </span>
  );
}

export function StaffAvatar({ staff, size }: { staff: Pick<Staff, 'name' | 'color' | 'avatarUrl'>; size?: 'sm' | 'lg' | 'xl' }) {
  const { tx } = useI18n();
  return <Avatar name={tx(staff.name)} color={staff.color} size={size} src={staff.avatarUrl} />;
}

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { t } = useI18n();
  return (
    <span className="badge" data-status={status}>
      {t(`status.${status}`)}
    </span>
  );
}

export function LocaleSwitch({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className={`locale-switch${className ? ` ${className}` : ''}`} role="group" aria-label={t('common.language')}>
      {locales.map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={l === locale} onClick={() => setLocale(l)} title={localeMeta[l].label}>
          {localeMeta[l].short}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** The SaaS product's wordmark (name from config). */
export function ProductWordmark({ light }: { light?: boolean }) {
  return (
    <span className={`wordmark${light ? ' wordmark--light' : ''}`}>
      <ProductMark className="wordmark__mark" />
      <span>{PRODUCT.name}</span>
    </span>
  );
}

/** A tenant's name with its logo or monogram. */
export function BusinessWordmark({ name, logoUrl, hideMark }: { name: string; logoUrl?: string; hideMark?: boolean }) {
  return (
    <span className="wordmark wordmark--biz">
      {!hideMark && <BusinessMark name={name} logoUrl={logoUrl} />}
      <span>{name}</span>
    </span>
  );
}

/** "Preview build" ribbon — shown wherever data could be mistaken for real. */
export function PreviewNote({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  if (CAPABILITIES.backend) return null;
  return (
    <p className={`preview-note${compact ? ' preview-note--compact' : ''}`} role="note">
      <InfoDot /> {t(compact ? 'preview.bannerShort' : 'preview.banner')}
    </p>
  );
}

function InfoDot() {
  return <span className="preview-note__dot" aria-hidden />;
}

/** Wraps a string with *emphasis* markers into <em>. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/\*(.+?)\*/g);
  return <>{parts.map((p, i) => (i % 2 ? <em key={i}>{p}</em> : p))}</>;
}
