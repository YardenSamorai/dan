/** Calling codes for converting national numbers ("050…") into international form, keyed by business timezone. */
const CALLING_CODE: Record<string, string> = {
  'Asia/Jerusalem': '972',
  'Europe/London': '44',
  'Europe/Paris': '33',
  'Europe/Berlin': '49',
  'Australia/Sydney': '61',
};

export const callingCode = (timeZone: string): string | undefined => CALLING_CODE[timeZone];

/** Same digits for "+972 50-123 4567", "0501234567" and "00972501234567": used to spot the same person twice. */
export function phoneKey(phone: string, code?: string): string {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (code && d.startsWith(code) && d.length > code.length + 7) d = `0${d.slice(code.length)}`;
  return d;
}

/**
 * A phone number as people type it (or as a spreadsheet mangles it) → the national form we store,
 * or null when it can't be a phone. Israeli numbers get the leading 0 back and dashes: 050-123-4567.
 */
export function cleanPhone(raw: string, code?: string): string | null {
  const s = raw.trim();
  const intl = /^(\+|00)/.test(s);
  let d = phoneKey(s, code);
  if (code === '972') {
    if (intl && !d.startsWith('0')) return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
    if (!d.startsWith('0') && (d.length === 8 || d.length === 9)) d = `0${d}`;
    if (!/^0\d{8,9}$/.test(d)) return null;
    return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  }
  if (d.length < 7 || d.length > 15) return null;
  return intl ? `+${d}` : s.replace(/[^\d+\-() ]/g, '').trim();
}

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/** International digits without the plus ("972501234567"), or null when the number can't be made international with confidence. */
export function internationalPhone(phone: string, timeZone: string): string | null {
  const raw = phone.replace(/[^\d+]/g, '');
  if (raw.startsWith('+')) return raw.slice(1) || null;
  if (raw.startsWith('00')) return raw.slice(2) || null;
  const cc = CALLING_CODE[timeZone];
  if (cc && raw.startsWith('0') && raw.length > 1) return `${cc}${raw.slice(1)}`;
  return null;
}

/** wa.me link, or null when the number can't be made international with confidence. */
export function whatsappHref(phone: string, timeZone: string): string | null {
  const intl = internationalPhone(phone, timeZone);
  return intl ? `https://wa.me/${intl}` : null;
}
