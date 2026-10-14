import { timingSafeEqual } from 'node:crypto';
import { nextMessageAt } from '../src/domain/notifications';
import { devAuthenticator } from './auth';
import { handleIcs, handleRpc, type ApiDeps } from './handler';
import { canSendCodes, channelsOf, dispatchMessages, sendersFromEnv, sendPhoneCode, type Senders } from './messaging';
import { FileStore } from './store';
import { SupabaseStore, supabaseAuthenticator, type SupabaseConfig } from './supabase';
import { notifyDevices, pushKeysFromEnv, type PushKeys } from './push';
import { handleWhatsAppWebhook } from './whatsappWebhook';

type Env = Record<string, string | undefined>;

type Deps = ApiDeps & { senders: Senders; push: PushKeys | null };

let deps: Deps | null = null;

/** Supabase settings, or null for local development. The URL and public key are shared with the browser build. */
export function supabaseConfig(env: Env): SupabaseConfig | null {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  if (!url) return null;
  const secretKey = env.SUPABASE_SECRET_KEY;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!secretKey || !publishableKey) throw new Error('Supabase is configured without SUPABASE_SECRET_KEY / the publishable key. See .env.');
  return { url: url.replace(/\/$/, ''), secretKey, publishableKey };
}

/**
 * With Supabase settings: the real database and sign-in. Without them, local
 * development: data in .data/db.json and email-only sign-in, which refuses to
 * start in production.
 */
function build(env: Env): Deps {
  const senders = sendersFromEnv(env);
  const cfg = supabaseConfig(env);
  const channels = channelsOf(senders);
  const push = pushKeysFromEnv(env);
  const sendCode: ApiDeps['sendCode'] = canSendCodes(senders) ? (t, to, code, locale) => sendPhoneCode(senders, t, to, code, locale) : undefined;
  const shared = { senders, channels, push, pushKey: push?.publicKey, sendCode };
  if (cfg) return { store: new SupabaseStore({ ...cfg, channels }), auth: supabaseAuthenticator(cfg), ...shared };
  if (env.NODE_ENV === 'production' && !env.ALLOW_DEV_BACKEND) {
    throw new Error('No production backend configured: set the Supabase environment variables.');
  }
  return {
    store: new FileStore(env.DEV_DB_PATH ?? '.data/db.json'),
    auth: devAuthenticator(env.DEV_AUTH_SECRET ?? 'local-dev-only'),
    ...shared,
  };
}

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** POST /api/cron/messages with `Authorization: Bearer $CRON_SECRET` (see supabase/cron.sql). */
async function handleCron(req: Request, d: ApiDeps & { senders: Senders }, env: Env): Promise<Response> {
  const secret = env.CRON_SECRET;
  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!secret || req.method !== 'POST' || !safeEqual(given, secret)) return new Response('Not found', { status: 404 });
  const result = await dispatchMessages(d.store, d.senders, { origin: env.SITE_URL ?? new URL(req.url).origin });
  return new Response(JSON.stringify({ ...result, channels: channelsOf(d.senders) }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

/** The iPhone app's pages (Capacitor) call the API from their own origin. It signs in with a bearer token, never cookies. */
const APP_ORIGINS = new Set(['capacitor://localhost']);

function withAppOrigin(origin: string, res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set('access-control-allow-origin', origin);
  out.headers.append('vary', 'origin');
  return out;
}

/** `waitUntil` (Cloudflare) keeps the instance alive for work that finishes after the response. */
export async function handle(req: Request, env: Env = process.env, waitUntil?: (p: Promise<unknown>) => void): Promise<Response> {
  const path = new URL(req.url).pathname;
  const origin = req.headers.get('origin') ?? '';
  if (path === '/api/rpc' && APP_ORIGINS.has(origin)) {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'POST',
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-max-age': '86400',
          vary: 'origin',
        },
      });
    }
    return withAppOrigin(origin, await route(req, path, env, waitUntil));
  }
  return route(req, path, env, waitUntil);
}

function route(req: Request, path: string, env: Env, waitUntil?: (p: Promise<unknown>) => void): Promise<Response> {
  const d = (deps ??= build(env));
  if (path === '/api/cron/messages') return handleCron(req, d, env);
  if (path === '/api/whatsapp/webhook') return handleWhatsAppWebhook(req, d, env, waitUntil);
  if (path.startsWith('/api/ics/')) return handleIcs(req, d);
  const channels = channelsOf(d.senders);
  return handleRpc(req, d, {
    background: waitUntil,
    // A booking's confirmation, the owner's alert and push notifications go out right away, not at the next scheduled pass.
    onSaved(changes) {
      if (d.push && changes.some((c) => c.after.pushDevices?.length)) {
        const work = notifyDevices(d.store, d.push, changes).catch((e) => console.error('[push]', e));
        if (waitUntil) waitUntil(work);
      }
      if (!channels.length) return;
      const now = new Date().toISOString();
      const due = changes.filter((c) => (nextMessageAt(c.after, channels) ?? '9') <= now).map((c) => c.after.business.id);
      if (!due.length) return;
      const work = dispatchMessages(d.store, d.senders, { only: due, origin: env.SITE_URL ?? new URL(req.url).origin }).catch((e) => console.error('[messages]', e));
      if (waitUntil) waitUntil(work);
    },
  });
}
