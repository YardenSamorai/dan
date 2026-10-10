/** Calling codes for converting national numbers ("050…") into international form, keyed by business timezone. */
const CALLING_CODE: Record<string, string> = {
  'Asia/Jerusalem': '972',
  'Europe/London': '44',
  'Europe/Paris': '33',
  'Europe/Berlin': '49',
  'Australia/Sydney': '61',
};

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/** wa.me link, or null when the number can't be made international with confidence. */
export function whatsappHref(phone: string, timeZone: string): string | null {
  const raw = phone.replace(/[^\d+]/g, '');
  if (raw.startsWith('+')) return `https://wa.me/${raw.slice(1)}`;
  if (raw.startsWith('00')) return `https://wa.me/${raw.slice(2)}`;
  const cc = CALLING_CODE[timeZone];
  if (cc && raw.startsWith('0')) return `https://wa.me/${cc}${raw.slice(1)}`;
  return null;
}
