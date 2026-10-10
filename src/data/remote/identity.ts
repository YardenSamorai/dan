import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { storageKey } from '../../config/product';

/**
 * Sign-in through Supabase Auth, when the build has its settings. The browser
 * only ever uses it for signing in; all data goes through /api.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, storageKey: storageKey('auth') },
      })
    : null;

export const googleEnabled = !!supabase && import.meta.env.VITE_AUTH_GOOGLE === 'true';
