import { timingSafeEqual } from 'node:crypto';
import { buildIcs } from '../src/domain/ics';
import { ApiError, type NewBusinessInput, type PublicBookingInput, type SessionJoinInput, type TenantContext, type WorkspaceApi } from '../src/data/contracts';
import { mockAuth, mockDirectory, sessionInfo } from '../src/data/mock/auth';
import { getDb, mutateDb, type MockDatabase } from '../src/data/mock/db';
import { availabilityView, bySlug, mockPublicBooking, project, toPublic, visible } from '../src/data/mock/public';
import { mockInvites } from '../src/data/mock/invites';
import { membersOf, mockWorkspace, normalizePhone, scopeForRole } from '../src/data/mock/workspace';
import type { Locale } from '../src/i18n/config';
import { bearer, type Authenticator } from './auth';
import { inScope } from './context';
import { changedTenants, Conflict, type Hint, type Store } from './store';
import type { Channel, TenantData } from '../src/domain/types';

/**
 * The whole API is one POST /api/rpc endpoint: `{ fn, args }` in, `{ result }`
 * or `{ error }` out. Every function re-derives who the caller is and what
 * they may do; nothing the browser claims about roles is trusted.
 */

interface Call {
  userId: string | null;
  auth: Authenticator;
  store: Store;
  channels: readonly Channel[];
}

/** Replaces every inline image (data URL) in `v` with the URL `put` stored it under. */
async function uploadInline(v: unknown, put: (dataUrl: string) => Promise<string>): Promise<unknown> {
  if (typeof v === 'string') return v.startsWith('data:image/') ? put(v) : v;
  if (Array.isArray(v)) return Promise.all(v.map((x) => uploadInline(x, put)));
  if (v && typeof v === 'object') {
    const entries = await Promise.all(Object.entries(v).map(async ([k, x]) => [k, await uploadInline(x, put)] as const));
    return Object.fromEntries(entries);
  }
  return v;
}

const WITH_IMAGES = new Set<string>(['savePage', 'updateBusiness', 'saveService', 'saveStaff']);

/**
 * Wrong guesses allowed per business and mobile number before booking lookups
 * pause. Counted per server instance, so it slows guessing rather than
 * stopping a determined attacker outright.
 */
const LOOKUP_LIMIT = { misses: 5, windowMs: 15 * 60_000 };
const lookupMisses = new Map<string, { count: number; until: number }>();

interface Fn {
  hint?: (args: any[], c: Call) => Hint;
  run: (args: any[], c: Call, db: () => MockDatabase) => Promise<unknown> | unknown;
}

const WORKSPACE_METHODS = new Set<keyof WorkspaceApi>([
  'createAppointment',
  'createAppointmentSeries',
  'rescheduleAppointment',
  'cancelAppointment',
  'setAppointmentStatus',
  'updateAppointmentNotes',
  'createSessions',
  'updateSession',
  'cancelSessions',
  'addParticipant',
  'removeFromWaitlist',
  'createCustomer',
  'saveCustomer',
  'importCustomers',
  'saveService',
  'saveAddOn',
  'saveCategory',
  'saveStaff',
  'addTimeOff',
  'removeTimeOff',
  'addBlock',
  'removeBlock',
  'saveException',
  'removeException',
  'updateBusiness',
  'setPublished',
  'savePage',
  'calendarFeed',
  'createInvite',
  'revokeInvite',
  'removeMember',
  'deleteBusiness',
  'resetDemo',
]);

const requireUser = (c: Call) => {
  if (!c.userId) throw new ApiError('unauthenticated');
  return c.userId;
};

/** The caller's role in a business comes from the database, never from the request. */
function memberCtx(db: MockDatabase, userId: string, businessId: string): TenantContext {
  const m = db.members.find((x) => x.businessId === businessId && x.userId === userId);
  if (!m) throw new ApiError('forbidden');
  return { businessId, userId, role: m.role, staffId: m.staffId };
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

const FNS: Record<string, Fn> = {
  session: {
    hint: (_, c) => ({ userId: c.userId }),
    run: (_, c, db) => (c.userId ? sessionInfo(db(), c.userId, null) : null),
  },

  'auth.devSignIn': {
    run: async ([email], c) => {
      if (!c.auth.devSignIn || !c.auth.issue) throw new ApiError('forbidden');
      const s = await mockAuth.signIn(str(email));
      return { token: c.auth.issue(s.user.id) };
    },
  },
  'auth.devSignUp': {
    run: async ([input], c) => {
      if (!c.auth.devSignIn || !c.auth.issue) throw new ApiError('forbidden');
      const s = await mockAuth.signUp({ name: str(input?.name), email: str(input?.email), locale: str(input?.locale) as Locale });
      return { token: c.auth.issue(s.user.id) };
    },
  },
  /** Email + password account with a real identity provider. The browser signs in with it right after. */
  'auth.createAccount': {
    run: async ([input], c) => {
      if (!c.auth.createAccount) throw new ApiError('forbidden');
      const email = str(input?.email).trim().toLowerCase();
      const password = str(input?.password);
      const name = str(input?.name).trim().slice(0, 80);
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200 || password.length < 8 || password.length > 72) throw new ApiError('invalid');
      await c.auth.createAccount({ email, password, name, locale: str(input?.locale) === 'en' ? 'en' : 'he' });
      return { ok: true };
    },
  },
  /** Development only: move an account made in the in-browser demo onto this server, once. */
  'dev.importLocal': {
    hint: () => ({}),
    run: ([payload], c, db) => {
      if (!c.auth.devSignIn || !c.auth.issue) throw new ApiError('forbidden');
      const p = payload as Partial<Pick<MockDatabase, 'users' | 'members' | 'tenants'>> | undefined;
      const user = p?.users?.[0];
      if (!user?.email) throw new ApiError('invalid');
      const cur = db();
      const existing = cur.users.find((u) => u.email.toLowerCase() === user.email.toLowerCase());
      const userId = existing?.id ?? user.id;
      const slugs = new Set(Object.values(cur.tenants).map((t) => t.business.slug));
      const tenants = Object.fromEntries(Object.entries(p?.tenants ?? {}).filter(([id, t]) => !cur.tenants[id] && !slugs.has(t.business.slug)));
      const members = (p?.members ?? []).filter((m) => tenants[m.businessId]).map((m) => ({ ...m, userId }));
      mutateDb((d) => ({
        ...d,
        users: existing ? d.users : [...d.users, user],
        members: [...d.members, ...members],
        tenants: { ...d.tenants, ...tenants },
      }));
      return { token: c.auth.issue(userId), imported: Object.keys(tenants).length };
    },
  },

  /** Which message channels actually deliver here, so the UI never claims more. */
  'platform.info': {
    run: (_, c) => ({ channels: c.channels }),
  },

  'auth.demoAccounts': {
    run: (_, c) => (c.auth.devSignIn ? mockAuth.demoAccounts() : []),
  },

  'directory.isSlugAvailable': {
    hint: ([slug]) => ({ slugs: [str(slug)] }),
    run: ([slug]) => mockDirectory.isSlugAvailable(str(slug)),
  },
  'directory.createBusiness': {
    hint: ([input], c) => ({ userId: c.userId, slugs: [str(input?.slug)] }),
    run: ([input], c) => {
      requireUser(c);
      return mockDirectory.createBusiness(input as NewBusinessInput);
    },
  },

  'public.business': {
    hint: ([slug], c) => ({ userId: c.userId, slugs: [str(slug)] }),
    run: ([slug], c, db) => {
      const t = bySlug(db(), str(slug));
      if (!t || !visible(db(), t, c.userId ?? undefined)) return null;
      return { business: project(t), preview: t.business.status !== 'published', availability: availabilityView(t) };
    },
  },
  'public.booking': {
    hint: ([slug]) => ({ slugs: [str(slug)] }),
    run: ([slug, token], _, db) => {
      const t = bySlug(db(), str(slug));
      const a = t?.appointments.find((x) => x.id === token);
      return t && a ? toPublic(t, a) : null;
    },
  },
  'public.createBooking': {
    hint: ([slug], c) => ({ userId: c.userId, slugs: [str(slug)] }),
    run: ([slug, input]) => mockPublicBooking.createBooking(str(slug), input as PublicBookingInput),
  },
  'public.findBookings': {
    hint: ([slug], c) => ({ userId: c.userId, slugs: [str(slug)] }),
    run: async ([slug, phone, proof]) => {
      const key = `${str(slug)}|${normalizePhone(str(phone))}`;
      const now = Date.now();
      if (lookupMisses.size > 10_000) for (const [k, m] of lookupMisses) if (m.until <= now) lookupMisses.delete(k);
      const miss = lookupMisses.get(key);
      if (miss && miss.until > now && miss.count >= LOOKUP_LIMIT.misses) throw new ApiError('rate_limited');
      const found = await mockPublicBooking.findBookings(str(slug), str(phone), str(proof));
      if (found.length) lookupMisses.delete(key);
      else lookupMisses.set(key, { count: miss && miss.until > now ? miss.count + 1 : 1, until: now + LOOKUP_LIMIT.windowMs });
      return found;
    },
  },
  'public.cancelBooking': {
    hint: ([slug], c) => ({ userId: c.userId, slugs: [str(slug)] }),
    run: ([slug, token]) => mockPublicBooking.cancelBooking(str(slug), str(token)),
  },
  'public.rescheduleBooking': {
    hint: ([slug], c) => ({ userId: c.userId, slugs: [str(slug)] }),
    run: ([slug, token, to]) => mockPublicBooking.rescheduleBooking(str(slug), str(token), to),
  },
  'public.joinSession': {
    hint: ([slug], c) => ({ userId: c.userId, slugs: [str(slug)] }),
    run: ([slug, input]) => mockPublicBooking.joinSession(str(slug), input as SessionJoinInput),
  },
  'public.joinWaitlist': {
    hint: ([slug], c) => ({ userId: c.userId, slugs: [str(slug)] }),
    run: ([slug, input]) => mockPublicBooking.joinWaitlist(str(slug), input as SessionJoinInput),
  },

  'invite.peek': {
    hint: ([slug]) => ({ slugs: [str(slug)] }),
    run: ([slug, token]) => mockInvites.peek(str(slug), str(token)),
  },
  'invite.accept': {
    hint: ([slug], c) => ({ userId: c.userId, slugs: [str(slug)] }),
    run: ([slug, token], c) => {
      requireUser(c);
      return mockInvites.accept(str(slug), str(token));
    },
  },

  'workspace.tenant': {
    hint: ([businessId], c) => ({ userId: c.userId, businessId: str(businessId) }),
    run: ([businessId], c, db) => {
      const ctx = memberCtx(db(), requireUser(c), str(businessId));
      const t = db().tenants[ctx.businessId];
      if (!t) throw new ApiError('not_found');
      return scopeForRole(t, ctx);
    },
  },
  'workspace.members': {
    hint: ([businessId], c) => ({ userId: c.userId, businessId: str(businessId) }),
    run: ([businessId], c, db) => membersOf(db(), memberCtx(db(), requireUser(c), str(businessId))),
  },
  'workspace.call': {
    hint: ([businessId, method, args], c) => ({
      userId: c.userId,
      businessId: str(businessId),
      slugs: method === 'updateBusiness' && args?.[0]?.slug ? [str(args[0].slug)] : [],
    }),
    run: async ([businessId, method, args], c, db) => {
      const m = str(method) as keyof WorkspaceApi;
      if (!WORKSPACE_METHODS.has(m) || (m === 'resetDemo' && !c.auth.devSignIn)) throw new ApiError('invalid');
      const ctx = memberCtx(db(), requireUser(c), str(businessId));
      const api = mockWorkspace.api(ctx) as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
      let list = Array.isArray(args) ? args : [];
      const put = c.store.putImage?.bind(c.store);
      if (put && WITH_IMAGES.has(m)) list = (await uploadInline(list, (url) => put(ctx.businessId, url))) as unknown[];
      const result = await api[m](...list);
      const t = db().tenants[ctx.businessId];
      return { result, tenant: t && scopeForRole(t, ctx) };
    },
  },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const STATUS: Partial<Record<ApiError['code'], number>> = { unauthenticated: 401, forbidden: 403, blocked: 403, not_found: 404, slot_taken: 409, slug_taken: 409, exists: 409, too_large: 413, rate_limited: 429 };

export interface ApiDeps {
  store: Store;
  auth: Authenticator;
  /** Channels with a connected provider. */
  channels?: readonly Channel[];
}

/** GET /api/ics/{slug}/{key}.ics: the link itself is the credential, like Google's "secret address". */
export async function handleIcs(req: Request, deps: ApiDeps): Promise<Response> {
  const m = /\/api\/ics\/([a-z0-9-]+)\/([a-f0-9]{16,64})(?:\.ics)?$/.exec(new URL(req.url).pathname);
  const notFound = () => new Response('Not found', { status: 404 });
  if (req.method !== 'GET' || !m) return notFound();
  const [, slug, key] = m;
  const db = await deps.store.snapshot({ slugs: [slug] });
  const t = bySlug(db, slug);
  const feed = t?.business.calendarFeeds?.find((f) => safeEqual(f.key, key));
  if (!t || !feed) return notFound();
  return new Response(buildIcs(t, feed.staffId, t.business.defaultLocale), {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `inline; filename="${slug}.ics"`,
      'cache-control': 'private, max-age=300',
    },
  });
}

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export interface RpcHooks {
  /** After a successful save, with the businesses it changed. */
  onSaved?: (tenants: TenantData[]) => void;
}

export async function handleRpc(req: Request, deps: ApiDeps, hooks: RpcHooks = {}): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'invalid' }, 405);
  let body: { fn?: unknown; args?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: 'invalid' }, 400);
  }
  const fn = FNS[str(body.fn)];
  if (!fn) return json({ error: 'invalid' }, 404);
  const args = Array.isArray(body.args) ? body.args : [];
  const token = bearer(req);
  const call: Call = { userId: await deps.auth.userId(token), auth: deps.auth, store: deps.store, channels: deps.channels ?? [] };
  if (call.userId && deps.auth.profile && deps.store.ensureUser) {
    try {
      const p = await deps.auth.profile(token);
      if (p) await deps.store.ensureUser(p);
    } catch (e) {
      console.error('[api] profile', e);
      return json({ error: 'server' }, 500);
    }
  }

  for (let attempt = 0; ; attempt++) {
    try {
      const before = await deps.store.snapshot(fn.hint?.(args, call) ?? {});
      const out = await inScope(before, call.userId, () => fn.run(args, call, getDb));
      if (out.db !== before) {
        await deps.store.commit(before, out.db);
        hooks.onSaved?.(Object.values(changedTenants(before, out.db)));
      }
      return json({ result: out.result ?? null });
    } catch (e) {
      if (e instanceof Conflict && attempt < 3) continue;
      if (e instanceof ApiError) return json({ error: e.code, conflict: e.conflict }, STATUS[e.code] ?? 400);
      console.error('[api]', str(body.fn), e);
      return json({ error: 'server' }, 500);
    }
  }
}
