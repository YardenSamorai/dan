import { devAuthenticator } from './auth';
import { handleIcs, handleRpc, type ApiDeps } from './handler';
import { FileStore } from './store';
import { SupabaseStore, supabaseAuthenticator, type SupabaseConfig } from './supabase';

type Env = Record<string, string | undefined>;

let deps: ApiDeps | null = null;

/** Supabase settings, or null for local development. The URL and public key are shared with the browser build. */
export function supabaseConfig(env: Env): SupabaseConfig | null {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  if (!url) return null;
  const secretKey = env.SUPABASE_SECRET_KEY;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!secretKey || !publishableKey) throw new Error('Supabase is configured without SUPABASE_SECRET_KEY / the publishable key. See .env.example.');
  return { url: url.replace(/\/$/, ''), secretKey, publishableKey };
}

/**
 * With Supabase settings: the real database and sign-in. Without them, local
 * development: data in .data/db.json and email-only sign-in, which refuses to
 * start in production.
 */
function build(env: Env): ApiDeps {
  const cfg = supabaseConfig(env);
  if (cfg) return { store: new SupabaseStore(cfg), auth: supabaseAuthenticator(cfg) };
  if (env.NODE_ENV === 'production' && !env.ALLOW_DEV_BACKEND) {
    throw new Error('No production backend configured: set the Supabase environment variables.');
  }
  return {
    store: new FileStore(env.DEV_DB_PATH ?? '.data/db.json'),
    auth: devAuthenticator(env.DEV_AUTH_SECRET ?? 'local-dev-only'),
  };
}

export function handle(req: Request, env: Env = process.env): Promise<Response> {
  deps ??= build(env);
  return new URL(req.url).pathname.startsWith('/api/ics/') ? handleIcs(req, deps) : handleRpc(req, deps);
}
