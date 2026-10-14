import { useSyncExternalStore } from 'react';
import { storageKey } from '../../config/product';
import { SLUG_PATTERN } from '../../domain/defaults';
import { ApiError, type AuthService, type BusinessDirectory, type SessionInfo } from '../contracts';
import { DEMO_BUSINESS_IDS } from '../demo/seed';
import type { MockDatabase } from '../mock/db';
import { isNativeApp } from '../../lib/native';
import { currentToken, getToken, Resource, rpc, setToken } from './client';
import { googleEnabled, supabase } from './identity';
import { clearWorkspaceCache } from './workspace';

const ACTIVE_KEY = storageKey('active-business');

type Base = Omit<SessionInfo, 'active'>;

let base: Base | null = null;
let active: string | null = typeof localStorage === 'undefined' ? null : localStorage.getItem(ACTIVE_KEY);
let session: SessionInfo | null = null;
const listeners = new Set<() => void>();

function publish() {
  session = base && { ...base, active: base.memberships.find((m) => m.businessId === active) ?? base.memberships[0] ?? null };
  listeners.forEach((l) => l());
}

/** Re-read who is signed in and which businesses they belong to. */
export async function refreshSession() {
  if (!(await currentToken())) {
    base = null;
    return publish();
  }
  try {
    const s = await rpc<SessionInfo | null>('session');
    base = s && { user: s.user, memberships: s.memberships };
  } catch {
    base = (await currentToken()) ? base : null;
  }
  publish();
}

function setActive(id: string | null) {
  active = id;
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
  publish();
}

const IMPORTED_KEY = storageKey('imported');

/**
 * Development servers only: someone who signed up in the in-browser demo keeps
 * their account and businesses. Runs once per browser; production refuses it.
 */
async function importLocalDemo() {
  if (supabase || getToken() || localStorage.getItem(IMPORTED_KEY)) return;
  localStorage.setItem(IMPORTED_KEY, '1');
  try {
    const db = JSON.parse(localStorage.getItem(storageKey('db')) ?? 'null') as MockDatabase | null;
    const s = JSON.parse(localStorage.getItem(storageKey('session')) ?? 'null') as { userId: string } | null;
    const user = s && db?.users.find((u) => u.id === s.userId);
    if (!db || !user) return;
    const members = db.members.filter((m) => m.userId === user.id && !DEMO_BUSINESS_IDS.includes(m.businessId));
    if (!members.length) return;
    const tenants = Object.fromEntries(members.flatMap((m) => (db.tenants[m.businessId] ? [[m.businessId, db.tenants[m.businessId]]] : [])));
    const { token } = await rpc<{ token: string }>('dev.importLocal', { users: [user], members, tenants });
    setToken(token);
  } catch {
    /* not a dev server, or nothing to bring over */
  }
}

let demos: ReturnType<AuthService['demoAccounts']> = [];
let started: Promise<void> | null = null;
const start = () =>
  (started ??= (async () => {
    if (supabase) {
      // Returning from an emailed link or Google: the session is set up from ?code=… during getSession().
      await supabase.auth.getSession();
      const u = new URL(location.href);
      if (u.searchParams.has('code')) {
        u.searchParams.delete('code');
        history.replaceState(history.state, '', u.pathname + u.search + u.hash);
      }
      supabase.auth.onAuthStateChange((event) => {
        // Supabase calls this while holding its lock; calling back into it synchronously would deadlock.
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') setTimeout(() => void refreshSession(), 0);
      });
    } else {
      void rpc<typeof demos>('auth.demoAccounts')
        .then((d) => {
          demos = d;
          listeners.forEach((l) => l());
        })
        .catch(() => {});
      await importLocalDemo();
    }
    await refreshSession();
  })());

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

async function signInWith(token: string) {
  setToken(token);
  await refreshSession();
  if (!session) throw new Error('session');
  return session;
}

export const remoteAuth: AuthService = {
  ready: start,
  useSession: () => useSyncExternalStore(subscribe, () => session),
  method: supabase ? 'password' : 'email',
  // Google needs a redirect back into the app, and next to it Apple requires Sign in with Apple.
  providers: { google: googleEnabled && !isNativeApp },

  async signInWithPassword({ email, password }) {
    if (!supabase) throw new ApiError('invalid');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      if (error.status === 429 || error.code === 'over_request_rate_limit') throw new ApiError('rate_limited');
      if (error.status === 400 || error.code === 'invalid_credentials') throw new ApiError('invalid');
      throw new ApiError(error.status ? 'server' : 'network');
    }
    setActive(null);
    await refreshSession();
    if (!session) throw new ApiError('server');
    return session;
  },

  async signUpWithPassword({ name, email, password, locale }) {
    if (!supabase) throw new ApiError('invalid');
    await rpc('auth.createAccount', { name, email, password, locale });
    return remoteAuth.signInWithPassword({ email, password });
  },

  async signInWithGoogle(next) {
    if (!supabase) throw new ApiError('invalid');
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: new URL(next, location.origin).href } });
    if (error) throw new ApiError('server');
  },

  async requestPasswordReset(email) {
    if (!supabase) throw new ApiError('invalid');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    if (error && (error.status === 429 || error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit')) throw new ApiError('rate_limited');
    if (error && !error.status) throw new ApiError('network');
  },

  async resetPassword({ email, code, password }) {
    if (!supabase) throw new ApiError('invalid');
    const address = email.trim().toLowerCase();
    // A retry after a rejected password: the code was already used and the person is signed in.
    const current = (await supabase.auth.getSession()).data.session;
    if (current?.user.email?.toLowerCase() !== address) {
      const verified = await supabase.auth.verifyOtp({ email: address, token: code.replace(/\s/g, ''), type: 'recovery' });
      if (verified.error) {
        if (verified.error.status === 429) throw new ApiError('rate_limited');
        throw new ApiError(verified.error.status ? 'invalid' : 'network');
      }
    }
    const updated = await supabase.auth.updateUser({ password });
    if (updated.error) throw new ApiError(updated.error.code === 'weak_password' || updated.error.code === 'same_password' || updated.error.status === 422 ? 'policy' : 'server');
    setActive(null);
    await refreshSession();
    if (!session) throw new ApiError('server');
    return session;
  },

  async signIn(email) {
    const { token } = await rpc<{ token: string }>('auth.devSignIn', email);
    setActive(null);
    return signInWith(token);
  },

  async signUp(input) {
    const { token } = await rpc<{ token: string }>('auth.devSignUp', input);
    setActive(null);
    return signInWith(token);
  },

  async signOut() {
    if (supabase) await supabase.auth.signOut();
    setToken(null);
    setActive(null);
    clearWorkspaceCache();
    base = null;
    publish();
  },

  async switchBusiness(businessId) {
    setActive(businessId);
  },

  demoAccounts: () => demos,
};

const slugs = new Resource<boolean>((slug) => rpc<boolean>('directory.isSlugAvailable', slug));

let slugVersion = 0;
slugs.subscribe(() => slugVersion++);

export const remoteDirectory: BusinessDirectory = {
  useSlugChecks() {
    useSyncExternalStore(slugs.subscribe, () => slugVersion);
  },

  /** Answers from cache; unknown links count as free until the server says otherwise (creation re-checks). */
  isSlugAvailable(slug) {
    if (!SLUG_PATTERN.test(slug)) return false;
    return slugs.read(slug) ?? true;
  },

  async createBusiness(input) {
    const out = await rpc<{ businessId: string; slug: string }>('directory.createBusiness', input);
    slugs.set(out.slug, false);
    active = out.businessId;
    localStorage.setItem(ACTIVE_KEY, out.businessId);
    await refreshSession();
    return out;
  },
};
