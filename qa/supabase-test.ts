/**
 * End-to-end checks against the real Supabase project:
 *   npm run test:supabase
 * Creates two throwaway users and a throwaway business, exercises the API
 * through server/handler.ts with real sign-in tokens, then deletes everything.
 */
import { existsSync, readFileSync } from 'node:fs';
import { supabaseConfig } from '../server/app';
import { handleRpc, type ApiDeps } from '../server/handler';
import { SupabaseStore, supabaseAuthenticator } from '../server/supabase';

for (const file of ['.env', '.env.local']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
const cfg = supabaseConfig(process.env)!;
const deps: ApiDeps = { store: new SupabaseStore(cfg), auth: supabaseAuthenticator(cfg) };
const admin = { apikey: cfg.secretKey, authorization: `Bearer ${cfg.secretKey}`, 'content-type': 'application/json' };

const PASSWORD = `Qa-${Date.now()}-pass`;

/** What the browser does: the server creates the account, then Supabase signs in with the password. */
async function passwordSignIn(email: string, password: string) {
  const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: cfg.publishableKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.ok ? ((await res.json()) as { access_token: string; user: { id: string } }) : null;
}

async function makeUser(email: string, name: string) {
  const created = await call('auth.createAccount', [{ name, email, password: PASSWORD, locale: 'he' }]);
  if (created.status !== 200) throw new Error(`createAccount ${JSON.stringify(created)}`);
  const s = await passwordSignIn(email, PASSWORD);
  if (!s) throw new Error('password sign-in failed');
  return { id: s.user.id, token: s.access_token };
}

async function call(fn: string, args: unknown[] = [], token?: string) {
  const res = await handleRpc(
    new Request('http://test/api/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: JSON.stringify({ fn, args }),
    }),
    deps,
  );
  return { status: res.status, ...((await res.json()) as { result?: any; error?: string }) };
}

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 300)}`}`);
}

const run = Date.now().toString(36);
const slug = `qa-${run}`;
const users: string[] = [];
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

try {
  const owner = await makeUser(`qa-owner-${run}@example.com`, 'QA Owner');
  const other = await makeUser(`qa-other-${run}@example.com`, 'QA Other');
  users.push(owner.id, other.id);
  check('sign-up with password works without an email round-trip', !!owner.token && !!other.token);
  const dup = await call('auth.createAccount', [{ name: 'Again', email: `QA-OWNER-${run}@example.com`, password: PASSWORD, locale: 'he' }]);
  check('same email twice → exists', dup.status === 409 && dup.error === 'exists', dup);
  const weak = await call('auth.createAccount', [{ name: 'Weak', email: `qa-weak-${run}@example.com`, password: '1234567', locale: 'he' }]);
  check('password under 8 characters → invalid', weak.status === 400, weak);
  check('wrong password → no session', (await passwordSignIn(`qa-owner-${run}@example.com`, 'not-the-password')) === null);

  const s = await call('session', [], owner.token);
  check('first request creates the profile', s.status === 200 && s.result?.user?.name === 'QA Owner' && s.result.memberships.length === 0, s);
  check('no token → no session', (await call('session')).result === null);
  check('forged token → 401 on workspace', (await call('workspace.tenant', ['x'], 'not-a-token')).status === 401);

  const created = await call(
    'directory.createBusiness',
    [
      {
        name: 'QA Studio',
        slug,
        type: 'beauty',
        locale: 'he',
        timezone: 'Asia/Jerusalem',
        currency: 'ILS',
        phone: '050-0000000',
        address: 'QA',
        service: { name: 'Cut', duration: 30, price: 100 },
        hours: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { ranges: [{ start: 540, end: 1080 }], breaks: [] }])),
        solo: true,
        team: [],
        policies: { leadTimeMinutes: 0, cancelWindowHours: 1, confirmationMode: 'auto' },
        publish: true,
      },
    ],
    owner.token,
  );
  const biz = created.result?.businessId as string;
  check('owner creates a business', created.status === 200 && !!biz, created);
  check('same address twice → slug_taken', (await call('directory.isSlugAvailable', [slug])).result === false);

  const tenant = await call('workspace.tenant', [biz], owner.token);
  check('owner reads the workspace', tenant.status === 200 && tenant.result.business.slug === slug, tenant);
  check('someone else → 403', (await call('workspace.tenant', [biz], other.token)).status === 403);

  const page = await call('public.business', [slug]);
  check('public page loads', page.status === 200 && page.result?.business?.slug === slug, page);

  const svc = page.result.business.services[0];
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const booking = { serviceId: svc.id, addOnIds: [], staffId: svc.staffIds[0], date: tomorrow, start: 600, customer: { name: 'QA Customer', phone: '0501234567', locale: 'he' } };
  const booked = await call('public.createBooking', [slug, booking]);
  check('customer books', booked.status === 200, booked);
  const again = await call('public.createBooking', [slug, { ...booking, customer: { ...booking.customer, phone: '0507654321' } }]);
  check('same slot → slot_taken', again.status === 409, again);
  const race = await Promise.all([1, 2, 3].map((n) => call('public.createBooking', [slug, { ...booking, start: 720, customer: { name: `R${n}`, phone: `05000000${n}0`, locale: 'he' } }])));
  check('three at once → one booking', race.filter((r) => r.status === 200).length === 1, race.map((r) => r.status));

  const t2 = (await call('workspace.tenant', [biz], owner.token)).result;
  const saved = await call(
    'workspace.call',
    [biz, 'savePage', [{ page: t2.business.page ?? null, branding: { ...t2.business.branding, logoUrl: PNG }, tagline: t2.business.tagline, description: t2.business.description, servicePhotos: {}, staffPhotos: {} }]],
    owner.token,
  );
  const logo = saved.result?.tenant?.business?.branding?.logoUrl as string | undefined;
  check('logo goes to storage, not the database', saved.status === 200 && !!logo && logo.startsWith(`${cfg.url}/storage/v1/object/public/media/${biz}/`), logo ?? saved);
  if (logo) check('stored logo is publicly readable', (await fetch(logo)).status === 200);

  const deleted = await call('workspace.call', [biz, 'deleteBusiness', [slug]], owner.token);
  check('owner deletes the business', deleted.status === 200, deleted);
  check('page is gone after delete', (await call('public.business', [slug])).result === null);
} catch (e) {
  failed++;
  console.error('FAIL crashed', e);
} finally {
  for (const id of users) await fetch(`${cfg.url}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: admin });
  await fetch(`${cfg.url}/rest/v1/businesses?slug=eq.${slug}`, { method: 'DELETE', headers: admin });
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
