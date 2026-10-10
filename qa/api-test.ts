/**
 * API checks against a throwaway copy of the demo data:
 *   npm run test:api
 * Exercises booking conflicts, role scoping and authorization in server/handler.ts.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { devAuthenticator } from '../server/auth';
import { handleIcs, handleRpc, type ApiDeps } from '../server/handler';
import { FileStore } from '../server/store';
import { availableSlots } from '../src/domain/scheduling';

const dir = mkdtempSync(join(tmpdir(), 'api-test-'));
const auth = devAuthenticator('test-secret');
const deps: ApiDeps = { store: new FileStore(join(dir, 'db.json')), auth };

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
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
}

const BIZ = 'biz_demo_studio';
const SLUG = 'demo-studio';

try {
  const owner = (await call('auth.devSignIn', ['noa@demo-studio.example'])).result.token as string;
  const staff = (await call('auth.devSignIn', ['maya@demo-studio.example'])).result.token as string;
  check('demo sign-in issues tokens', !!owner && !!staff);

  const view = await call('public.business', [SLUG]);
  check('public view has no customers', view.result.availability.customers.length === 0);
  check('public view strips customer ids', view.result.availability.appointments.every((a: any) => a.customerId === '' && !a.note && !a.internalNote));

  const missing = await call('public.business', ['no-such-business']);
  check('unknown slug → null', missing.result === null);

  const ownerView = await call('workspace.tenant', [BIZ], owner);
  const staffView = await call('workspace.tenant', [BIZ], staff);
  const mayaStaffId = (await call('session', [], staff)).result.memberships[0].staffId;
  check('owner sees all appointments', ownerView.result.appointments.length > staffView.result.appointments.length);
  check(
    'staff sees only own appointments',
    staffView.result.appointments.every((a: any) => a.staffId === mayaStaffId),
  );

  const anon = await call('workspace.tenant', [BIZ]);
  check('anonymous workspace read → 401', anon.status === 401, anon);

  const otherBiz = await call('workspace.tenant', ['biz_demo_shira'], staff);
  check('member of another business → 403', otherBiz.status === 403, otherBiz);

  const forged = await call('workspace.tenant', [BIZ], 'dev.u_noa.not-a-real-signature');
  check('forged token → 401', forged.status === 401, forged);

  const staffEdit = await call('workspace.call', [BIZ, 'updateBusiness', [{ phone: '000' }]], staff);
  check('staff cannot change business settings → 403', staffEdit.status === 403, staffEdit);

  const unknown = await call('workspace.call', [BIZ, 'constructor', []], owner);
  check('unknown workspace method rejected', unknown.status === 400, unknown);

  const ownerEdit = await call('workspace.call', [BIZ, 'updateBusiness', [{ phone: '03-000-0000' }]], owner);
  check('owner can change settings', ownerEdit.status === 200 && ownerEdit.result.tenant.business.phone === '03-000-0000', ownerEdit);

  // Booking: two customers race for the same person and time.
  const svc = view.result.business.services[0];
  const person = svc.staffIds[0];
  // From two UTC days out: "tomorrow" in UTC can still be today in the business's timezone, inside the cancel window.
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() + (i + 2) * 86_400_000).toISOString().slice(0, 10));
  let booked: any = null;
  let attempt: any = null;
  for (const date of days) {
    for (const start of [600, 660, 720, 780, 840]) {
      attempt = { serviceId: svc.id, addOnIds: [], staffId: person, date, start, customer: { name: 'Test One', phone: '0501111111', locale: 'he' } };
      const r = await call('public.createBooking', [SLUG, attempt]);
      if (r.status === 200) {
        booked = r.result;
        break;
      }
    }
    if (booked) break;
  }
  check('customer can book an open slot', !!booked, attempt);
  if (booked) {
    const again = await call('public.createBooking', [SLUG, { ...attempt, customer: { name: 'Test Two', phone: '0502222222', locale: 'he' } }]);
    check('same slot twice → slot_taken', again.status === 409 && again.error === 'slot_taken', again);

    const parallel = await Promise.all(
      [3, 4].map((n) =>
        call('public.createBooking', [SLUG, { ...attempt, start: attempt.start + 180, customer: { name: `Racer ${n}`, phone: `050333333${n}`, locale: 'he' } }]),
      ),
    );
    check('parallel race → exactly one wins', parallel.filter((r) => r.status === 200).length <= 1, parallel.map((r) => r.status));

    const fetched = await call('public.booking', [SLUG, booked.id]);
    check('booking readable by its token', fetched.result?.code === booked.code);

    const cancelled = await call('public.cancelBooking', [SLUG, booked.id]);
    check('customer can cancel within policy', cancelled.status === 200 && cancelled.result.status === 'cancelled', cancelled);
  }

  // Calendar subscription links.
  const ics = async (path: string) => {
    const r = await handleIcs(new Request(`http://test${path}`), deps);
    return { status: r.status, body: await r.text() };
  };
  const allKey = (await call('workspace.call', [BIZ, 'calendarFeed', [null]], owner)).result?.result as string;
  check('owner creates the all-appointments link', /^[a-f0-9]{36}$/.test(allKey ?? ''), allKey);
  const feed = await ics(`/api/ics/${SLUG}/${allKey}.ics`);
  check('feed is an iCalendar with events', feed.status === 200 && feed.body.startsWith('BEGIN:VCALENDAR') && feed.body.includes('BEGIN:VEVENT'), feed.body.slice(0, 80));
  check('feed lines are folded to 75 octets', feed.body.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));
  check('wrong key → 404', (await ics(`/api/ics/${SLUG}/${'0'.repeat(36)}.ics`)).status === 404);
  check('key of one business does not open another', (await ics(`/api/ics/shira-nails/${allKey}.ics`)).status === 404);

  const staffAll = await call('workspace.call', [BIZ, 'calendarFeed', [null]], staff);
  check('staff cannot get the all-appointments link → 403', staffAll.status === 403, staffAll);
  const ownKey = (await call('workspace.call', [BIZ, 'calendarFeed', [mayaStaffId]], staff)).result?.result as string;
  check('staff gets their own link', !!ownKey);
  const staffTenant = (await call('workspace.tenant', [BIZ], staff)).result;
  check('staff never see the owner’s link', !JSON.stringify(staffTenant).includes(allKey));
  const ownFeed = await ics(`/api/ics/${SLUG}/${ownKey}.ics`);
  const others = ownerView.result.appointments.filter((a: any) => a.staffId !== mayaStaffId && a.status !== 'cancelled').map((a: any) => a.id);
  check('staff feed holds only their appointments', ownFeed.status === 200 && !others.some((id: string) => ownFeed.body.includes(`UID:${id}@`)));

  const pub = await call('public.business', [SLUG]);
  check('public view carries no calendar links', !JSON.stringify(pub.result).includes(allKey) && !JSON.stringify(pub.result).includes(ownKey));

  const rotated = (await call('workspace.call', [BIZ, 'calendarFeed', [null, true]], owner)).result?.result as string;
  check('replacing the link revokes the old one', rotated !== allKey && (await ics(`/api/ics/${SLUG}/${allKey}.ics`)).status === 404 && (await ics(`/api/ics/${SLUG}/${rotated}.ics`)).status === 200);

  const sneaky = await call('workspace.call', [BIZ, 'updateBusiness', [{ calendarFeeds: [{ key: 'a'.repeat(36), staffId: null }] }]], owner);
  check('settings save cannot plant a link', !JSON.stringify(sneaky.result?.tenant.business.calendarFeeds).includes('a'.repeat(36)));

  // Importing customers from a spreadsheet.
  const before = ownerView.result.customers as { name: string; phone: string; email?: string }[];
  const known = before[0];
  const rows = [
    { name: 'Import One', phone: '052-111-2222', locale: 'he' },
    { name: 'Import Two', phone: '+972 53 333 4444', email: 'two@example.com', locale: 'en' },
    { name: 'Renamed Person', phone: known.phone.replace(/-/g, ''), email: 'known.new@example.com', note: 'From the old system', locale: 'en' },
    { name: '', phone: '050-000-0000', locale: 'he' },
    { name: 'Bad Phone', phone: '12', locale: 'he' },
    { name: '<script>', phone: '054-555-6666', locale: 'xx' },
  ];
  const staffImport = await call('workspace.call', [BIZ, 'importCustomers', [rows]], staff);
  check('staff cannot import customers → 403', staffImport.status === 403, staffImport);
  const imported = await call('workspace.call', [BIZ, 'importCustomers', [rows]], owner);
  check('import reports what happened', JSON.stringify(imported.result?.result) === JSON.stringify({ added: 3, updated: 1, unchanged: 0, invalid: 2 }), imported.result?.result);
  const after = imported.result?.tenant.customers as { name: string; phone: string; email?: string; note?: string; locale: string; id: string }[];
  const two = after.find((c) => c.name === 'Import Two');
  check('international numbers are stored the local way', two?.phone === '053-333-4444', two);
  const same = after.find((c) => c.phone === known.phone);
  check('existing customer keeps their name, gains missing details', same?.name === known.name && same.note?.includes('From the old system') === true && (!!known.email || same.email === 'known.new@example.com'), same);
  check('unknown language falls back to the business default', after.find((c) => c.phone === '054-555-6666')?.locale === ownerView.result.business.defaultLocale);
  check('every customer has its own id', new Set(after.map((c) => c.id)).size === after.length);
  const again2 = await call('workspace.call', [BIZ, 'importCustomers', [rows]], owner);
  check('importing the same file twice adds nobody', again2.result?.result.added === 0 && again2.result?.tenant.customers.length === after.length, again2.result?.result);
  const flood = await call('workspace.call', [BIZ, 'importCustomers', [Array.from({ length: 5001 }, (_, i) => ({ name: `N${i}`, phone: `050${String(i).padStart(7, '0')}`, locale: 'he' }))]], owner);
  check('more than 5,000 rows → rejected', flood.status === 400, flood.status);

  // Deleting a business.
  const staffDelete = await call('workspace.call', [BIZ, 'deleteBusiness', [SLUG]], staff);
  check('staff cannot delete the business → 403', staffDelete.status === 403, staffDelete);
  const demoDelete = await call('workspace.call', [BIZ, 'deleteBusiness', [SLUG]], owner);
  check('demo businesses are protected', demoDelete.status === 403, demoDelete);

  const newcomer = (await call('auth.devSignUp', [{ name: 'Dana Test', email: 'dana.delete@example.com', locale: 'he' }])).result.token as string;
  const created = await call(
    'directory.createBusiness',
    [
      {
        name: 'Dana',
        slug: 'dana-delete-test',
        type: 'beauty',
        locale: 'he',
        timezone: 'Asia/Jerusalem',
        currency: 'ILS',
        phone: '050-0000000',
        address: '',
        service: { name: 'Cut', duration: 30, price: 100 },
        hours: ownerView.result.business.hours,
        solo: true,
        team: [],
        policies: { leadTimeMinutes: 60, cancelWindowHours: 24, confirmationMode: 'auto' },
        publish: true,
      },
    ],
    newcomer,
  );
  const danaId = created.result?.businessId as string | undefined;
  check('newcomer creates a business', created.status === 200 && !!danaId, created);
  if (danaId) {
    const wrong = await call('workspace.call', [danaId, 'deleteBusiness', ['not-the-slug']], newcomer);
    check('wrong confirmation → rejected', wrong.status === 400, wrong);
    const gone = await call('workspace.call', [danaId, 'deleteBusiness', ['dana-delete-test']], newcomer);
    check('owner deletes their business', gone.status === 200, gone);
    check('deleted page is gone', (await call('public.business', ['dana-delete-test'])).result === null);
    check('membership is gone', (await call('session', [], newcomer)).result.memberships.length === 0);
    const disk = await new FileStore(join(dir, 'db.json')).snapshot();
    check('deleted business is removed from disk', !disk.tenants[danaId] && !disk.members.some((m) => m.businessId === danaId));
  }

  // A service that takes the whole place (one shared room). The engine finds a time
  // when the whole team is free and the second person works; the server must then agree.
  const full = (await call('workspace.tenant', [BIZ], owner)).result;
  const bookable = full.services.filter((s: any) => s.active && s.onlineBookable);
  const later = Array.from({ length: 14 }, (_, i) => new Date(Date.now() + (i + 3) * 86_400_000).toISOString().slice(0, 10));
  type Plan = { room: any; a: string; other: any; b: string; date: string; start: number };
  let plan: Plan | null = null;
  for (const base of bookable)
    for (const other of bookable)
      for (const a of base.staffIds)
        for (const b of other.staffIds) {
          if (plan || base.id === other.id || a === b) continue;
          const room = { ...base, id: 'svc_room_test', staffIds: [a], staffTerms: undefined, blocksAll: true };
          const withRoom = { ...full, services: [...full.services, room] };
          for (const date of later) {
            const theirs = new Set(availableSlots(full, { serviceId: other.id, staffId: b, date, online: true }).map((s) => s.start));
            const hit = availableSlots(withRoom, { serviceId: room.id, staffId: a, date, online: true }).find((s) => theirs.has(s.start));
            if (hit) {
              plan = { room, a, other, b, date, start: hit.start };
              break;
            }
          }
        }
  check('demo has a time the whole team is free', !!plan);
  if (plan) {
    const { room, a, other, b, date, start } = plan;
    await call('workspace.call', [BIZ, 'saveService', [room]], owner);
    const book = (serviceId: string, staffId: string, phone: string) =>
      call('public.createBooking', [SLUG, { serviceId, addOnIds: [], staffId, date, start, customer: { name: 'Room Test', phone, locale: 'he' } }]);
    const roomBooking = await book(room.id, a, '0504444441');
    check('room service books when everyone is free', roomBooking.status === 200, roomBooking);
    const held = await book(other.id, b, '0504444442');
    check('room booking holds the rest of the team', held.status === 409 && held.error === 'slot_taken', held);
    if (roomBooking.result) await call('public.cancelBooking', [SLUG, roomBooking.result.id]);
    const freed = await book(other.id, b, '0504444443');
    check('cancelling the room frees the team', freed.status === 200, freed);
    const needsAll = await book(room.id, a, '0504444444');
    check('room service needs everyone free', needsAll.status === 409 && needsAll.error === 'slot_taken', needsAll);
    if (freed.result) await call('public.cancelBooking', [SLUG, freed.result.id]);
    await call('workspace.call', [BIZ, 'saveService', [{ ...room, active: false }]], owner);
  }

  // Blocked clients.
  const regular = (await call('workspace.tenant', [BIZ], owner)).result.customers.find((c: any) => c.phone === '0501111111');
  check('test client exists', !!regular);
  if (regular) {
    await call('workspace.call', [BIZ, 'saveCustomer', [{ ...regular, email: 'blocked@example.com', blocked: true }]], owner);
    const svc0 = bookable[0];
    const attemptBlocked = (customer: object) =>
      call('public.createBooking', [SLUG, { serviceId: svc0.id, addOnIds: [], staffId: svc0.staffIds[0], date: days[5], start: 600, customer: { name: 'Again', locale: 'he', ...customer } }]);
    const byPhone = await attemptBlocked({ phone: '050-111-1111' });
    check('blocked client cannot book (phone)', byPhone.status === 403 && byPhone.error === 'blocked', byPhone);
    const byEmail = await attemptBlocked({ phone: '0509999999', email: 'Blocked@Example.com' });
    check('blocked client cannot book (email)', byEmail.status === 403 && byEmail.error === 'blocked', byEmail);
    await call('workspace.call', [BIZ, 'saveCustomer', [{ ...regular, blocked: undefined }]], owner);
    const unblocked = await attemptBlocked({ phone: '0501111111' });
    check('unblocked client is not refused as blocked', unblocked.error !== 'blocked', unblocked);
  }

  const persisted = new FileStore(join(dir, 'db.json'));
  const reread = await persisted.snapshot();
  check('changes are written to disk', reread.tenants[BIZ].business.phone === '03-000-0000');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
