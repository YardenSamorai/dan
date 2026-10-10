/**
 * Product-level identity. The SaaS brand is not decided yet: everything that
 * names the product reads from here, so choosing the final name is a one-line
 * change (or a VITE_APP_NAME env var) rather than a refactor.
 *
 * Storage keys use a brand-neutral prefix so a rename never loses local data.
 */
export const PRODUCT = {
  name: (import.meta.env.VITE_APP_NAME as string | undefined)?.trim() || 'APP_NAME',
  storagePrefix: 'saas',
} as const;

export const storageKey = (key: string) => `${PRODUCT.storagePrefix}.${key}`;

/**
 * What this build can actually do. The UI reads these flags so it never claims
 * an effect that doesn't happen (e.g. "SMS sent") while running on mock adapters.
 */
export const CAPABILITIES = {
  /** Real authentication and server-side sessions. */
  auth: false,
  /** Server persistence + tenant isolation enforced by an API. */
  backend: false,
  /** A connected SMS / WhatsApp / email provider. */
  messaging: false,
  /** Payments, deposits, subscriptions. */
  payments: false,
} as const;
