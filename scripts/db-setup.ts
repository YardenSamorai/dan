/**
 * One-off database chores against Supabase:
 *   npm run db:setup                  check the schema, add the demo businesses
 *   npm run db:setup -- --import-local   also copy businesses from .data/db.json
 *   npm run db:setup -- --refresh-demo-page   give the demo businesses the seed's page, photos and texts (bookings untouched)
 *
 * --import-local moves businesses made on the local dev server. Each owner
 * must have signed in once with the same email (so they have a profile).
 * Reads settings from .env.local; never prints keys.
 */
import { existsSync, readFileSync } from 'node:fs';
import { freshDatabase, type MockDatabase } from '../src/data/mock/db';
import { DEMO_BUSINESS_IDS } from '../src/data/demo/seed';
import { supabaseConfig } from '../server/app';

function loadEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv('.env');
loadEnv('.env.local');

const cfg = supabaseConfig(process.env);
if (!cfg) {
  console.error('No Supabase settings found (VITE_SUPABASE_URL in .env.local).');
  process.exit(1);
}

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${cfg!.url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: cfg!.secretKey, authorization: `Bearer ${cfg!.secretKey}`, 'content-type': 'application/json', ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

try {
  await rest('businesses?select=id&limit=1');
  await rest('members?select=id&limit=1');
  await rest('profiles?select=id&limit=1');
} catch (e) {
  console.error('The tables are missing. Run supabase/schema.sql in the Supabase SQL editor first.\n', String(e).slice(0, 200));
  process.exit(1);
}
console.log('✓ schema is in place');

const insertBusinesses = (rows: { id: string; data: unknown }[]) =>
  rest('businesses?on_conflict=id', { method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(rows) }) as Promise<{ id: string }[]>;

const seed = freshDatabase();
const demo = DEMO_BUSINESS_IDS.filter((id) => seed.tenants[id]).map((id) => ({ id, data: seed.tenants[id] }));
const added = await insertBusinesses(demo);
console.log(`✓ demo businesses: ${added.length} added, ${demo.length - added.length} already there`);

if (process.argv.includes('--refresh-demo-page')) {
  for (const { id, data: fresh } of demo) {
    const [row] = (await rest(`businesses?id=eq.${id}&select=data,version`)) as { data: typeof fresh; version: number }[];
    if (!row) continue;
    const photo = <T extends { id: string }>(xs: T[], from: T[], keys: (keyof T)[]) =>
      xs.map((x) => {
        const f = from.find((y) => y.id === x.id);
        return f ? { ...x, ...Object.fromEntries(keys.map((k) => [k, f[k]])) } : x;
      });
    const data = {
      ...row.data,
      business: { ...row.data.business, page: fresh.business.page, branding: fresh.business.branding, tagline: fresh.business.tagline, description: fresh.business.description },
      services: photo(row.data.services, fresh.services, ['imageUrl']),
      staff: photo(row.data.staff, fresh.staff, ['avatarUrl', 'bio']),
    };
    const updated = await rest(`businesses?id=eq.${id}&version=eq.${row.version}`, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ data, version: row.version + 1 }),
    });
    console.log(updated?.length ? `✓ refreshed the page of ${id}` : `– ${id} changed meanwhile, run again`);
  }
}

if (process.argv.includes('--import-local')) {
  const local = JSON.parse(readFileSync('.data/db.json', 'utf8')) as MockDatabase;
  for (const [id, t] of Object.entries(local.tenants)) {
    if (DEMO_BUSINESS_IDS.includes(id)) continue;
    const name = t.business.name.he ?? t.business.name.en;
    const members = local.members.filter((m) => m.businessId === id);
    const emails = members.map((m) => local.users.find((u) => u.id === m.userId)?.email).filter((e): e is string => !!e);
    const profiles = emails.length ? ((await rest(`profiles?select=id,email&email=in.(${emails.map((e) => `"${e}"`).join(',')})`)) as { id: string; email: string }[]) : [];
    const byEmail = new Map(profiles.map((p) => [p.email.toLowerCase(), p.id]));
    const mapped = members.flatMap((m) => {
      const email = local.users.find((u) => u.id === m.userId)?.email.toLowerCase();
      const userId = email && byEmail.get(email);
      return userId ? [{ id: m.id, business_id: id, user_id: userId, role: m.role, staff_id: m.staffId }] : [];
    });
    if (!mapped.some((m) => m.role === 'owner')) {
      console.log(`– skipped "${name}" (${t.business.slug}): its owner (${emails.join(', ') || 'unknown'}) hasn't signed in to Supabase yet`);
      continue;
    }
    const inserted = await insertBusinesses([{ id, data: t }]);
    if (!inserted.length) {
      console.log(`– "${name}" is already in Supabase`);
      continue;
    }
    await rest('members?on_conflict=id', { method: 'POST', headers: { prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify(mapped) });
    console.log(`✓ imported "${name}" (/book/${t.business.slug}) with ${mapped.length} member(s)`);
  }
}
