import { createHash } from 'node:crypto';
import { ApiError } from '../src/data/contracts';
import { emptyDatabase, type MockDatabase } from '../src/data/mock/db';
import { SLUG_PATTERN } from '../src/domain/defaults';
import { nextMessageAt } from '../src/domain/notifications';
import type { BusinessMember, User } from '../src/domain/platform';
import type { Channel, TenantData } from '../src/domain/types';
import type { Authenticator } from './auth';
import { changedTenants, Conflict, removedTenants, type Hint, type Store } from './store';

/**
 * Production persistence on Supabase (see supabase/schema.sql). Talks to the
 * REST API with the secret key; row level security keeps everyone else out.
 */

export interface SupabaseConfig {
  url: string;
  /** Server only. Never sent to browsers. */
  secretKey: string;
  /** The public key; used to verify sign-in tokens. */
  publishableKey: string;
  /** Channels with a connected provider; saves record when the next message on them is due. */
  channels?: readonly Channel[];
}

interface ProfileRow {
  id: string;
  email: string;
  name: string;
  locale: User['locale'];
  created_at: string;
}
interface MemberRow {
  id: string;
  business_id: string;
  user_id: string;
  role: BusinessMember['role'];
  staff_id: string | null;
}
interface BusinessRow {
  id: string;
  data: TenantData;
  version: number;
}

const toUser = (p: ProfileRow): User => ({ id: p.id, email: p.email, name: p.name, locale: p.locale, createdAt: p.created_at });
const toMember = (m: MemberRow): BusinessMember => ({ id: m.id, businessId: m.business_id, userId: m.user_id, role: m.role, staffId: m.staff_id });

/** PostgREST `in.(...)` list with each value quoted. */
const list = (xs: Iterable<string>) => `(${[...xs].map((x) => `"${x.replace(/(["\\])/g, '\\$1')}"`).join(',')})`;
const q = encodeURIComponent;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[\w-]{1,64}$/;

export class SupabaseStore implements Store {
  /** The version each loaded business had, so a save can insist nobody changed it since. */
  private versions = new WeakMap<TenantData, number>();
  private knownUsers = new Set<string>();

  constructor(private cfg: SupabaseConfig) {}

  private async rest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.cfg.url}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: this.cfg.secretKey, authorization: `Bearer ${this.cfg.secretKey}`, 'content-type': 'application/json', ...init.headers },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
      // PT409 (40001 in older schemas): someone saved first. 23505: id or booking address already taken.
      if (body.code === 'PT409' || body.code === '40001' || body.code === '23505' || body.message === 'version_conflict') throw new Conflict();
      throw new Error(`supabase ${res.status} ${body.code ?? ''} ${body.message ?? ''}`);
    }
    // Writes with return=minimal answer 201 with no body.
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  /** Loads only what the request may touch: the caller, their memberships, and the businesses named in the hint. */
  async snapshot(hint: Hint): Promise<MockDatabase> {
    const userId = hint.userId && UUID.test(hint.userId) ? hint.userId : null;
    const businessId = hint.businessId && ID.test(hint.businessId) ? hint.businessId : null;
    const slugs = (hint.slugs ?? []).filter((s) => SLUG_PATTERN.test(s));
    const who = [userId && `user_id.eq.${userId}`, businessId && `business_id.in.${list([businessId])}`].filter(Boolean);
    const memberRows = who.length ? await this.rest<MemberRow[]>(`members?select=*&or=${q(`(${who.join(',')})`)}`) : [];

    const businessIds = new Set(hint.namedBusinessesOnly ? [] : memberRows.map((m) => m.business_id));
    if (businessId) businessIds.add(businessId);
    const wanted = [businessIds.size && `id.in.${list(businessIds)}`, slugs.length && `slug.in.${list(slugs)}`].filter(Boolean);
    const userIds = new Set(memberRows.map((m) => m.user_id));
    if (userId) userIds.add(userId);

    const [businessRows, profileRows] = await Promise.all([
      wanted.length ? this.rest<BusinessRow[]>(`businesses?select=id,data,version&or=${q(`(${wanted.join(',')})`)}`) : [],
      userIds.size ? this.rest<ProfileRow[]>(`profiles?select=*&id=${q(`in.${list(userIds)}`)}`) : [],
    ]);

    const tenants: MockDatabase['tenants'] = {};
    for (const row of businessRows) {
      tenants[row.id] = row.data;
      this.versions.set(row.data, row.version);
    }
    return { ...emptyDatabase(), users: profileRows.map(toUser), members: memberRows.map(toMember), tenants };
  }

  async commit(before: MockDatabase, after: MockDatabase) {
    const beforeMembers = new Map(before.members.map((m) => [m.id, m]));
    const afterIds = new Set(after.members.map((m) => m.id));
    const beforeUsers = new Map(before.users.map((u) => [u.id, u]));
    const changes = {
      profiles: after.users.filter((u) => beforeUsers.get(u.id) !== u).map((u) => ({ id: u.id, email: u.email, name: u.name, locale: u.locale })),
      businesses: Object.entries(changedTenants(before, after)).map(([id, data]) => {
        const old = before.tenants[id];
        return { id, data, version: old ? (this.versions.get(old) ?? null) : null, nextMessageAt: nextMessageAt(data, this.cfg.channels ?? []) };
      }),
      deletedBusinesses: removedTenants(before, after),
      members: after.members.filter((m) => beforeMembers.get(m.id) !== m),
      deletedMembers: before.members.filter((m) => !afterIds.has(m.id)).map((m) => m.id),
    };
    if (changes.businesses.some((b) => before.tenants[b.id] && b.version === null)) throw new Error('commit: business without a known version');
    await this.rest('rpc/commit_changes', { method: 'POST', body: JSON.stringify({ changes }) });
    for (const id of changes.deletedBusinesses) {
      // The business is already gone; leftover images must not fail the request.
      await this.deleteImages(id).catch((e) => console.error('image cleanup', id, e));
    }
  }

  /** Removes every image stored under a business (`media/{businessId}/…`). */
  private async deleteImages(businessId: string) {
    if (!ID.test(businessId)) return;
    const headers = { apikey: this.cfg.secretKey, authorization: `Bearer ${this.cfg.secretKey}`, 'content-type': 'application/json' };
    const storage = `${this.cfg.url}/storage/v1/object`;
    for (;;) {
      const res = await fetch(`${storage}/list/media`, { method: 'POST', headers, body: JSON.stringify({ prefix: businessId, limit: 1000 }) });
      if (!res.ok) throw new Error(`image list ${res.status} ${await res.text()}`);
      const files = ((await res.json()) as { name: string; id: string | null }[]).filter((f) => f.id);
      if (!files.length) return;
      const del = await fetch(`${storage}/media`, { method: 'DELETE', headers, body: JSON.stringify({ prefixes: files.map((f) => `${businessId}/${f.name}`) }) });
      if (!del.ok) throw new Error(`image delete ${del.status} ${await del.text()}`);
    }
  }

  async dueBusinesses(now: string, _channels: readonly Channel[], limit: number) {
    const rows = await this.rest<{ id: string }[]>(`businesses?select=id&next_message_at=lte.${q(now)}&order=next_message_at.asc&limit=${limit}`);
    return rows.map((r) => r.id);
  }

  /** First request after someone signs in: make sure they have a profile row. */
  async ensureUser(u: Pick<User, 'id' | 'email' | 'name' | 'locale'>) {
    if (this.knownUsers.has(u.id)) return;
    await this.rest('profiles?on_conflict=id', {
      method: 'POST',
      headers: { prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ id: u.id, email: u.email, name: u.name, locale: u.locale }),
    });
    this.knownUsers.add(u.id);
  }

  /** Stores an uploaded image (data URL) and returns its public address. Same picture → same file. */
  async putImage(businessId: string, dataUrl: string): Promise<string> {
    const m = /^data:(image\/(jpeg|png|webp|gif));base64,(.+)$/.exec(dataUrl);
    if (!m) throw new Error('not an image');
    const bytes = Buffer.from(m[3], 'base64');
    const name = `${businessId}/${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`;
    const res = await fetch(`${this.cfg.url}/storage/v1/object/media/${name}`, {
      method: 'POST',
      headers: { apikey: this.cfg.secretKey, authorization: `Bearer ${this.cfg.secretKey}`, 'content-type': m[1], 'x-upsert': 'true', 'cache-control': '31536000' },
      body: new Uint8Array(bytes),
    });
    if (!res.ok) throw new Error(`image upload ${res.status} ${await res.text()}`);
    return `${this.cfg.url}/storage/v1/object/public/media/${name}`;
  }
}

interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: { name?: string; full_name?: string; locale?: string };
}

/** Sign-in tokens issued by Supabase Auth, checked with Supabase on first sight and cached briefly. */
export function supabaseAuthenticator(cfg: SupabaseConfig): Authenticator {
  const cache = new Map<string, { user: AuthUser | null; until: number }>();
  const lookup = async (token: string): Promise<AuthUser | null> => {
    const hit = cache.get(token);
    if (hit && hit.until > Date.now()) return hit.user;
    const res = await fetch(`${cfg.url}/auth/v1/user`, { headers: { apikey: cfg.publishableKey, authorization: `Bearer ${token}` } });
    const user = res.ok ? ((await res.json()) as AuthUser) : null;
    if (cache.size > 5000) cache.clear();
    cache.set(token, { user, until: Date.now() + 60_000 });
    return user;
  };
  return {
    devSignIn: false,
    async userId(token) {
      return token ? ((await lookup(token))?.id ?? null) : null;
    },
    async profile(token) {
      const u = token ? await lookup(token) : null;
      if (!u?.email) return null;
      const meta = u.user_metadata ?? {};
      return {
        id: u.id,
        email: u.email,
        name: (meta.name ?? meta.full_name ?? u.email.split('@')[0]).trim(),
        locale: meta.locale === 'en' ? 'en' : 'he',
      };
    },
    async createAccount({ email, password, name, locale }) {
      // Confirmed on creation: people sign in straight away, no email round-trip.
      const res = await fetch(`${cfg.url}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: cfg.secretKey, authorization: `Bearer ${cfg.secretKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name, locale } }),
      });
      if (res.ok) return;
      const body = (await res.json().catch(() => ({}))) as { error_code?: string; code?: string | number; msg?: string; message?: string };
      const code = String(body.error_code ?? body.code ?? '');
      const text = body.msg ?? body.message ?? '';
      if (code === 'email_exists' || code === 'user_already_exists' || /already (been )?registered/i.test(text)) throw new ApiError('exists');
      if (code === 'weak_password' || code === 'validation_failed' || code === 'email_address_invalid' || res.status === 422 || res.status === 400) throw new ApiError('invalid');
      throw new Error(`create account ${res.status} ${code} ${text}`);
    },
  };
}
