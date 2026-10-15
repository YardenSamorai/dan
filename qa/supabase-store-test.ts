/** Production snapshots must contain only loaded data and retain optimistic locking. */
import assert from 'node:assert/strict';
import { SupabaseStore } from '../server/supabase';
import { emptyDatabase, freshDatabase } from '../src/data/mock/db';
import { dateFormatter } from '../src/domain/dateFormat';

const sample = freshDatabase();
const tenant = JSON.parse(JSON.stringify(Object.values(sample.tenants)[0])) as (typeof sample.tenants)[string];
const requests: { url: string; body?: any }[] = [];
const originalFetch = globalThis.fetch;
let memberRows: unknown[] = [];
globalThis.fetch = async (input, init) => {
  const url = String(input);
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  requests.push({ url, body });
  if (url.includes('/members?')) return Response.json(memberRows);
  if (url.includes('/profiles?')) return Response.json([]);
  if (url.includes('/businesses?')) return Response.json([{ id: tenant.business.id, data: tenant, version: 17 }]);
  if (url.endsWith('/rpc/commit_changes')) return new Response(null, { status: 204 });
  throw new Error(`Unexpected database request: ${url}`);
};

try {
  const store = new SupabaseStore({ url: 'https://store.invalid', secretKey: 'test', publishableKey: 'test' });
  const empty = await store.snapshot({});
  assert.deepEqual(empty, emptyDatabase());
  assert.equal(requests.length, 0, 'empty snapshots need no database calls');
  const another = await store.snapshot({});
  assert.notEqual(empty.tenants, another.tenants, 'requests must not share mutable state');
  const before = await store.snapshot({ businessId: tenant.business.id });
  assert.deepEqual(Object.keys(before.tenants), [tenant.business.id]);
  assert.deepEqual(before.users, []);
  assert.deepEqual(before.members, []);
  assert.equal(before.version, sample.version);
  const loaded = before.tenants[tenant.business.id];
  assert.deepEqual(loaded, tenant, 'loaded business data is preserved');
  const changed = { ...loaded, business: { ...loaded.business, name: { he: 'בדיקה', en: 'Test' } } };
  await store.commit(before, { ...before, tenants: { [tenant.business.id]: changed } });
  const write = requests.at(-1)!.body.changes;
  assert.equal(write.businesses[0].version, 17, 'save retains the loaded optimistic version');
  assert.deepEqual(write.businesses[0].data, changed);
  assert.equal(write.businesses.length, 1);
  const userId = '11111111-1111-4111-8111-111111111111';
  memberRows = [tenant.business.id, 'unrelated-business'].map((id) => ({ id: `member-${id}`, business_id: id, user_id: userId, role: 'owner', staff_id: null }));
  await store.snapshot({ userId, businessId: tenant.business.id, namedBusinessesOnly: true });
  const scoped = decodeURIComponent(requests.filter((r) => r.url.includes('/businesses?')).at(-1)!.url);
  assert.ok(!scoped.includes('unrelated-business'), 'workspace does not load other businesses');
  assert.ok(scoped.includes(tenant.business.id));
  await store.snapshot({ userId });
  const session = decodeURIComponent(requests.filter((r) => r.url.includes('/businesses?')).at(-1)!.url);
  assert.ok(session.includes('unrelated-business'), 'session still loads all memberships');
  await store.snapshot({ userId, businessId: tenant.business.id, namedBusinessesOnly: true, slugs: ['other-slug'] });
  assert.ok(decodeURIComponent(requests.filter((r) => r.url.includes('/businesses?')).at(-1)!.url).includes('other-slug'), 'slug conflict checks remain loaded');
  for (const locale of ['he-IL', 'en-US']) for (const timeZone of ['Asia/Jerusalem', 'America/New_York', 'UTC']) {
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone };
    for (const at of ['2026-03-27T00:30:00Z', '2026-10-25T00:30:00Z', '2026-12-31T23:30:00Z']) {
      assert.equal(dateFormatter(locale, options).format(new Date(at)), new Intl.DateTimeFormat(locale, options).format(new Date(at)), 'format unchanged across DST and year boundaries');
    }
  }
  console.log('Production snapshot and versioned save checks passed');
} finally {
  globalThis.fetch = originalFetch;
}
