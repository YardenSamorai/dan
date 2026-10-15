/** Production snapshots must contain only loaded data and retain optimistic locking. */
import assert from 'node:assert/strict';
import { SupabaseStore } from '../server/supabase';
import { emptyDatabase, freshDatabase } from '../src/data/mock/db';

const sample = freshDatabase();
const tenant = JSON.parse(JSON.stringify(Object.values(sample.tenants)[0])) as (typeof sample.tenants)[string];
const requests: { url: string; body?: any }[] = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  requests.push({ url, body });
  if (url.includes('/members?')) return Response.json([]);
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
  console.log('Production snapshot and versioned save checks passed');
} finally {
  globalThis.fetch = originalFetch;
}
