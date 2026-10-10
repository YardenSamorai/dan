import type { Locale } from '../i18n/config';
import type { BusinessId } from './types';

/**
 * Platform-level entities: who can sign in, and which businesses they belong to.
 * These live outside any tenant.
 */
export interface User {
  id: string;
  name: string;
  email: string;
  locale: Locale;
  createdAt: string;
}

export type Role = 'owner' | 'manager' | 'staff';

export interface BusinessMember {
  id: string;
  businessId: BusinessId;
  userId: string;
  role: Role;
  /** The bookable staff profile this member works as, if any. */
  staffId: string | null;
}

export interface Session {
  userId: string;
  activeBusinessId: BusinessId | null;
}
