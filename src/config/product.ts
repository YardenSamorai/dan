/**
 * Product-level identity. The SaaS brand is not decided yet: everything that
 * names the product reads from here, so choosing the final name is a one-line
 * change (or a VITE_APP_NAME env var) rather than a refactor.
 *
 * Storage keys use a brand-neutral prefix so a rename never loses local data.
 */
/** Vite's env in the browser; empty when this module runs on the server. */
const env: Partial<ImportMetaEnv> = import.meta.env ?? {};

export const PRODUCT = {
  name: env.VITE_APP_NAME?.trim() || 'APP_NAME',
  storagePrefix: 'saas',
} as const;

export const storageKey = (key: string) => `${PRODUCT.storagePrefix}.${key}`;

/**
 * Who runs the service, for the legal pages and the help page. Fill these in
 * (env vars) before launch; the pages show "[…]" placeholders until then.
 */
export const OPERATOR = {
  company: env.VITE_LEGAL_COMPANY?.trim() || '[שם העסק / החברה]',
  companyId: env.VITE_LEGAL_COMPANY_ID?.trim() || '[ח.פ. / ע.מ.]',
  address: env.VITE_LEGAL_ADDRESS?.trim() || '[כתובת למשלוח דואר]',
  email: env.VITE_SUPPORT_EMAIL?.trim() || 'support@example.com',
  /** Accessibility coordinator, required on the accessibility statement. */
  a11yContact: env.VITE_A11Y_CONTACT?.trim() || '[שם רכז/ת הנגישות]',
  /** "Last updated" on the legal pages; bump when their wording changes. */
  legalUpdated: '2026-10-10',
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
