/**
 * Product-level identity. Everything that names the product reads from here,
 * so a rename is a one-line change (or a VITE_APP_NAME env var) rather than a refactor.
 *
 * Storage keys use a brand-neutral prefix so a rename never loses local data.
 */
/** Vite's env in the browser; empty when this module runs on the server. */
const env: Partial<ImportMetaEnv> = import.meta.env ?? {};

export const PRODUCT = {
  name: env.VITE_APP_NAME?.trim() || 'תורנו',
  storagePrefix: 'saas',
} as const;

export const storageKey = (key: string) => `${PRODUCT.storagePrefix}.${key}`;

/**
 * Who runs the service, for the legal pages and the help page. Fill these in
 * (env vars) before launch; the name shows a "[…]" placeholder until then.
 * The registration number and address are optional: the pages leave them out.
 */
const company = env.VITE_LEGAL_COMPANY?.trim() || '[שם העסק / החברה]';
export const OPERATOR = {
  company,
  companyId: env.VITE_LEGAL_COMPANY_ID?.trim() || '',
  address: env.VITE_LEGAL_ADDRESS?.trim() || '',
  email: env.VITE_SUPPORT_EMAIL?.trim() || 'support@example.com',
  /** Accessibility coordinator, required on the accessibility statement. */
  a11yContact: env.VITE_A11Y_CONTACT?.trim() || company,
  /** "Last updated" on the legal pages; bump when their wording changes. */
  legalUpdated: '2026-10-13',
};

/** Setup videos, by checklist step. A step without a link simply shows no video button. */
export const VIDEOS: Partial<Record<string, string>> = {
  welcome: env.VITE_VIDEO_WELCOME,
  page: env.VITE_VIDEO_PAGE,
  photos: env.VITE_VIDEO_PHOTOS,
  team: env.VITE_VIDEO_TEAM,
  publish: env.VITE_VIDEO_PUBLISH,
  calendar: env.VITE_VIDEO_CALENDAR,
  share: env.VITE_VIDEO_SHARE,
};

/** WhatsApp + SMS messages a business's plan includes each month (VITE_MESSAGE_ALLOWANCE). Unset = usage is shown without a limit. */
export const MESSAGE_ALLOWANCE: number | null = Number(env.VITE_MESSAGE_ALLOWANCE) > 0 ? Math.floor(Number(env.VITE_MESSAGE_ALLOWANCE)) : null;

/**
 * What this build can actually do. The UI reads these flags so it never claims
 * an effect that doesn't happen (e.g. "SMS sent") while running on mock adapters.
 */
export const CAPABILITIES = {
  /** Real authentication (Supabase Auth) and server-side sessions. */
  auth: !!env.VITE_SUPABASE_URL && env.VITE_BACKEND !== 'mock',
  /** Server persistence + tenant isolation enforced by an API. */
  backend: env.VITE_BACKEND !== 'mock',
  /** A connected SMS / WhatsApp / email provider. */
  messaging: false,
  /** Payments, deposits, subscriptions. */
  payments: false,
} as const;
