import { storageKey } from '../../config/product';
import { ApiError, type ApiErrorCode } from '../contracts';
import { supabase } from './identity';

const TOKEN_KEY = storageKey('token');

/** Development sign-in token (email-only sign-in against the local server). */
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/** The bearer token for the API: Supabase's (refreshed as needed) or the development one. */
export async function currentToken(): Promise<string | null> {
  if (!supabase) return getToken();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Calls one server function. Errors arrive as `ApiError` with the server's code. */
export async function rpc<T>(fn: string, ...args: unknown[]): Promise<T> {
  const token = await currentToken();
  let res: Response;
  try {
    res = await fetch('/api/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: JSON.stringify({ fn, args }),
    });
  } catch {
    throw new ApiError('network');
  }
  const body = (await res.json().catch(() => ({}))) as { result?: T; error?: string; conflict?: ApiError['conflict'] };
  if (res.status === 401 && token && !supabase) setToken(null);
  if (!res.ok || body.error) throw new ApiError((body.error as ApiErrorCode) ?? 'server', body.conflict);
  return body.result as T;
}

/**
 * A keyed cache that React reads synchronously (via useSyncExternalStore) and
 * fills from the server in the background. `undefined` means "not loaded yet".
 */
export class Resource<T> {
  private values = new Map<string, T>();
  private inflight = new Map<string, Promise<void>>();
  private listeners = new Set<() => void>();

  constructor(private load: (key: string) => Promise<T>) {}

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  private emit() {
    this.listeners.forEach((l) => l());
  }

  /** The cached value; starts a fetch when there is none. */
  read(key: string): T | undefined {
    if (!this.values.has(key)) void this.refresh(key);
    return this.values.get(key);
  }

  peek(key: string): T | undefined {
    return this.values.get(key);
  }

  has(key: string) {
    return this.values.has(key);
  }

  refresh(key: string): Promise<void> {
    const running = this.inflight.get(key);
    if (running) return running;
    const p = this.load(key)
      .then((v) => this.set(key, v))
      .catch(() => {
        /* keep what we had; the next read retries */
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  set(key: string, value: T) {
    this.values.set(key, value);
    this.emit();
  }

  clear() {
    this.values.clear();
    this.emit();
  }

  keys() {
    return [...this.values.keys()];
  }
}
