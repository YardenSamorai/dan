/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  /** `mock` = in-browser demo over localStorage; anything else = the /api backend. */
  readonly VITE_BACKEND?: string;
  /** Supabase project; with these set, people sign in with an emailed link. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** `true` once the Google provider is set up in Supabase. */
  readonly VITE_AUTH_GOOGLE?: string;
  readonly VITE_LEGAL_COMPANY?: string;
  readonly VITE_LEGAL_COMPANY_ID?: string;
  readonly VITE_LEGAL_ADDRESS?: string;
  readonly VITE_SUPPORT_EMAIL?: string;
  readonly VITE_A11Y_CONTACT?: string;
  /** WhatsApp + SMS messages included per business per month. */
  readonly VITE_MESSAGE_ALLOWANCE?: string;
  /** YouTube/Vimeo links for the setup checklist. */
  readonly VITE_VIDEO_WELCOME?: string;
  readonly VITE_VIDEO_PAGE?: string;
  readonly VITE_VIDEO_PHOTOS?: string;
  readonly VITE_VIDEO_TEAM?: string;
  readonly VITE_VIDEO_PUBLISH?: string;
  readonly VITE_VIDEO_CALENDAR?: string;
  readonly VITE_VIDEO_SHARE?: string;
}
