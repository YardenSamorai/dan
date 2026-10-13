/**
 * API checks against a throwaway copy of the demo data:
 *   npm run test:api
 * Exercises booking conflicts, role scoping and authorization in server/handler.ts.
 */
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { devAuthenticator } from '../server/auth';
import { handleIcs, handleRpc, type ApiDeps } from '../server/handler';
import { dispatchMessages, globalSms, parseMessageRef, SendError, smsNumber, whatsappCloud, type Sender, type Senders } from '../server/messaging';
import { handleWhatsAppWebhook } from '../server/whatsappWebhook';
import { usageMonth } from '../src/domain/usage';
import { WHATSAPP_TEMPLATES, whatsAppParams } from '../src/domain/whatsapp';
import { internationalPhone } from '../src/lib/phone';
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

    const byName = await call('public.findBookings', [SLUG, '050-111-1111', ' test ']);
    check('phone + first name finds the booking', byName.status === 200 && byName.result.some((b: any) => b.id === booked.id), byName);
    const byCode = await call('public.findBookings', [SLUG, '0501111111', booked.code.toLowerCase()]);
    check('phone + booking ref finds exactly that booking', byCode.result?.length === 1 && byCode.result[0].id === booked.id, byCode);
    const wrongName = await call('public.findBookings', [SLUG, '0501111111', 'Someone']);
    check('phone + wrong name finds nothing', wrongName.status === 200 && wrongName.result.length === 0, wrongName);
    const wrongPhone = await call('public.findBookings', [SLUG, '0509999999', 'Test']);
    check('right name + wrong phone finds nothing', wrongPhone.result?.length === 0, wrongPhone);
    const phoneOnly = await call('public.findBookings', [SLUG, '0501111111', '']);
    check('phone alone finds nothing', phoneOnly.result?.length === 0, phoneOnly);
    const guessed = `05${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    const guesses = [];
    for (let i = 0; i < 6; i++) guesses.push((await call('public.findBookings', [SLUG, guessed, `guess${i}`])).status);
    check('repeated wrong guesses for one number → 429', guesses.slice(0, 5).every((s) => s === 200) && guesses[5] === 429, guesses);

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

  // Team invites.
  const roster = (await call('workspace.members', [BIZ], owner)).result as { id: string; staffId: string | null; user: { email: string } }[];
  const team = (await call('workspace.tenant', [BIZ], owner)).result.staff as { id: string; userId?: string; active: boolean }[];
  const freeStaff = team.find((s) => s.active && !s.userId && !roster.some((m) => m.staffId === s.id));
  check('demo has a staff profile nobody signs in as', !!freeStaff);
  const staffInvite = await call('workspace.call', [BIZ, 'createInvite', [{ role: 'manager', staffId: null }]], staff);
  check('staff cannot invite → 403', staffInvite.status === 403, staffInvite);
  const takenInvite = await call('workspace.call', [BIZ, 'createInvite', [{ role: 'staff', staffId: mayaStaffId }]], owner);
  check('cannot invite onto a profile someone already uses', takenInvite.status === 409, takenInvite);
  const ownerInvite = await call('workspace.call', [BIZ, 'createInvite', [{ role: 'owner', staffId: null }]], owner);
  check('owner role cannot be handed out by link', ownerInvite.status === 400, ownerInvite);
  if (freeStaff) {
    const made = await call('workspace.call', [BIZ, 'createInvite', [{ role: 'staff', staffId: freeStaff.id }]], owner);
    const token = made.result?.result as string;
    check('owner creates an invite link', made.status === 200 && /^[a-f0-9]{36}$/.test(token ?? ''), made);
    check('staff never see invite links', !JSON.stringify((await call('workspace.tenant', [BIZ], staff)).result).includes(token));
    check('public view carries no invite links', !JSON.stringify((await call('public.business', [SLUG])).result).includes(token));
    const peek = await call('invite.peek', [SLUG, token]);
    check('anyone with the link sees who invites them', peek.result?.role === 'staff' && !!peek.result?.staffName, peek);
    check('wrong token → nothing', (await call('invite.peek', [SLUG, '0'.repeat(36)])).result === null);
    check('token of one business does not open another', (await call('invite.peek', ['shira-nails', token])).result === null);
    const anonAccept = await call('invite.accept', [SLUG, token]);
    check('accepting needs an account → 401', anonAccept.status === 401, anonAccept);
    const joiner = (await call('auth.devSignUp', [{ name: 'Join Test', email: 'join.test@example.com', locale: 'he' }])).result.token as string;
    const accepted = await call('invite.accept', [SLUG, token], joiner);
    check('invitee joins the business', accepted.status === 200 && accepted.result === BIZ, accepted);
    const joinedSession = (await call('session', [], joiner)).result;
    const joined = joinedSession.memberships.find((m: any) => m.businessId === BIZ);
    check('invitee gets the invited role and profile', joined?.role === 'staff' && joined.staffId === freeStaff.id, joined);
    const joinerView = (await call('workspace.tenant', [BIZ], joiner)).result;
    check('invitee sees only their own appointments', joinerView.appointments.every((a: any) => a.staffId === freeStaff.id));
    const reuse = await call('invite.accept', [SLUG, token], staff);
    check('a link works only once', reuse.status === 404, reuse);
    const memberId = (await call('workspace.members', [BIZ], owner)).result.find((m: any) => m.user.email === 'join.test@example.com')?.id;
    const staffRemove = await call('workspace.call', [BIZ, 'removeMember', [memberId]], staff);
    check('staff cannot remove people → 403', staffRemove.status === 403, staffRemove);
    const ownerId = roster.find((m) => m.user.email === 'noa@demo-studio.example')?.id;
    const removeSelf = await call('workspace.call', [BIZ, 'removeMember', [ownerId]], owner);
    check('owner cannot be removed', removeSelf.status === 403, removeSelf);
    const removed = await call('workspace.call', [BIZ, 'removeMember', [memberId]], owner);
    check('owner removes a member', removed.status === 200, removed);
    const afterRemove = await call('workspace.tenant', [BIZ], joiner);
    check('removed member loses access → 403', afterRemove.status === 403, afterRemove);
    check('their staff profile is free again', !removed.result?.tenant.staff.find((s: any) => s.id === freeStaff.id)?.userId);
    const revokeToken = (await call('workspace.call', [BIZ, 'createInvite', [{ role: 'manager', staffId: null }]], owner)).result?.result as string;
    await call('workspace.call', [BIZ, 'revokeInvite', [revokeToken]], owner);
    check('a cancelled link stops working', (await call('invite.peek', [SLUG, revokeToken])).result === null);
    const sneakyInvite = await call('workspace.call', [BIZ, 'updateBusiness', [{ invites: [{ token: 'b'.repeat(36), role: 'manager', staffId: null, createdAt: '2020-01-01', expiresAt: '2999-01-01' }] }]], owner);
    check('settings save cannot plant an invite', !JSON.stringify(sneakyInvite.result?.tenant.business.invites ?? []).includes('b'.repeat(36)));
  }

  // Message delivery.
  const outbox: { channel: string; to: string; body: string }[] = [];
  const capture = (channel: string): Sender => ({ send: async (m) => void outbox.push({ channel, to: m.to, body: m.body }) });
  const senders: Senders = { email: capture('email'), sms: capture('sms') };
  await call('workspace.call', [BIZ, 'updateBusiness', [{ email: 'owner@demo-studio.example', alerts: { channels: ['email'], booked: true, changed: true } }]], owner);
  const svcM = bookable[0];
  let msgBooking: any = null;
  for (const date of days.slice(6)) {
    for (const start of [600, 660, 720, 780]) {
      const r = await call('public.createBooking', [SLUG, { serviceId: svcM.id, addOnIds: [], staffId: svcM.staffIds[0], date, start, customer: { name: 'Mail Test', phone: '0507777777', email: 'mail.test@example.com', locale: 'he' } }]);
      if (r.status === 200) {
        msgBooking = r.result;
        break;
      }
    }
    if (msgBooking) break;
  }
  check('booking for message tests', !!msgBooking);
  if (msgBooking) {
    const store = deps.store;
    const first = await dispatchMessages(store, senders, { only: [BIZ] });
    const mine = outbox.filter((m) => m.to === 'mail.test@example.com' || m.to.replace(/\D/g, '') === '0507777777');
    check('confirmation goes out on connected channels', first.sent > 0 && mine.length > 0, { first, outbox });
    const alert = outbox.find((m) => m.to === 'owner@demo-studio.example' && m.body.includes('Mail Test'));
    check('owner gets a new-booking alert', !!alert, outbox.filter((m) => m.to === 'owner@demo-studio.example'));
    const after1 = (await store.snapshot({})).tenants[BIZ].outbox.filter((m) => m.appointmentId === msgBooking.id);
    check('sent messages are marked sent', after1.filter((m) => m.state === 'sent').length === mine.length + 1, after1.map((m) => [m.kind, m.channel, m.state]));
    check('reminder waits for its time', after1.some((m) => m.kind === 'reminder' && m.state === 'scheduled') || !after1.some((m) => m.kind === 'reminder'));
    check('channels without a provider keep waiting', after1.filter((m) => m.channel === 'whatsapp').every((m) => m.state === 'queued' || m.state === 'scheduled'));
    const count = outbox.length;
    const second = await dispatchMessages(store, senders, { only: [BIZ] });
    check('nothing is sent twice', second.sent === 0 && outbox.length === count, second);
    const due = await store.dueBusinesses!(new Date().toISOString(), ['email', 'sms'], 50);
    check('business drops off the due list once sent', !due.includes(BIZ), due);

    await call('public.cancelBooking', [SLUG, msgBooking.id]);
    const failing: Senders = { email: { send: async () => { throw new SendError('rejected', false); } } };
    await dispatchMessages(store, failing, { only: [BIZ] });
    const after2 = (await store.snapshot({})).tenants[BIZ].outbox.filter((m) => m.appointmentId === msgBooking.id);
    check('a rejected message is marked failed, not retried', after2.some((m) => m.channel === 'email' && m.state === 'failed'), after2.map((m) => [m.kind, m.channel, m.state]));
    check('cancelling drops the pending reminder', !after2.some((m) => m.kind === 'reminder' && (m.state === 'scheduled' || m.state === 'queued')));
    const late = await dispatchMessages(store, senders, { only: [BIZ], now: new Date(Date.now() + 7 * 3_600_000) });
    const after3 = (await store.snapshot({})).tenants[BIZ].outbox.filter((m) => m.appointmentId === msgBooking.id);
    check('stale messages are skipped, not sent late', late.sent === 0 && after3.filter((m) => m.channel === 'sms' && m.kind === 'cancellation').every((m) => m.state === 'skipped'), after3.map((m) => [m.kind, m.channel, m.state]));
    const staffSees = (await call('workspace.tenant', [BIZ], staff)).result.outbox as any[];
    check('staff never see alerts to the owner', !staffSees.some((m) => m.to === 'owner'));
    const info = await call('platform.info', []);
    check('platform reports no connected channels by default', Array.isArray(info.result?.channels) && info.result.channels.length === 0, info);
  }

  // "Time to book again" and repeating appointments.
  {
    const store = deps.store;
    const svc = (await call('workspace.tenant', [BIZ], owner)).result.services.find((s: any) => s.id === svcM.id);
    const saved = await call('workspace.call', [BIZ, 'saveService', [{ ...svc, rebookAfterDays: 28 }]], owner);
    check('service keeps its book-again interval', saved.result?.result?.rebookAfterDays === 28, saved);
    const junk = await call('workspace.call', [BIZ, 'saveService', [{ ...svc, rebookAfterDays: -5 }]], owner);
    check('nonsense intervals are dropped', junk.result?.result?.rebookAfterDays === undefined, junk);
    await call('workspace.call', [BIZ, 'saveService', [{ ...svc, rebookAfterDays: 28 }]], owner);
    const notes = (await call('workspace.tenant', [BIZ], owner)).result.business.notifications;
    await call('workspace.call', [BIZ, 'updateBusiness', [{ notifications: { ...notes, rebook: { ...notes.rebook, channels: ['sms'] } } }]], owner);

    const wideDays = Array.from({ length: 40 }, (_, i) => new Date(Date.now() + (i + 2) * 86_400_000).toISOString().slice(0, 10));
    const bookAt = async (name: string, phone: string, fromDay: number) => {
      const live = (await call('workspace.tenant', [BIZ], owner)).result;
      for (const date of wideDays.slice(fromDay)) {
        for (const { start } of availableSlots(live, { serviceId: svcM.id, staffId: svcM.staffIds[0], date, online: true }).slice(0, 3)) {
          const r = await call('public.createBooking', [SLUG, { serviceId: svcM.id, addOnIds: [], staffId: svcM.staffIds[0], date, start, customer: { name, phone, email: '', locale: 'he' } }]);
          if (r.status === 200) return r.result;
        }
      }
      return null;
    };
    const visit = await bookAt('Rebook Test', '0508888888', 8);
    const rebookMsg = (await store.snapshot({})).tenants[BIZ].outbox.find((m) => m.appointmentId === visit?.id && m.kind === 'rebook');
    check('booking queues a book-again message', !!rebookMsg && rebookMsg.state === 'scheduled', rebookMsg);
    if (rebookMsg) {
      const dueAt = new Date(Date.parse(rebookMsg.at) + 60_000);
      outbox.length = 0;
      await dispatchMessages(store, senders, { only: [BIZ], now: dueAt, origin: 'https://tornu.co.il' });
      const sms = outbox.find((m) => m.channel === 'sms' && m.body.includes('Rebook Test'.split(' ')[0]));
      check('book-again message goes out with a booking link', !!sms && sms.body.includes(`https://tornu.co.il/book/${SLUG}`) && !sms.body.includes('{link}'), outbox);
    }

    const second = await bookAt('Again Test', '0509999999', 8);
    await bookAt('Again Test', '0509999999', second ? wideDays.indexOf(second.date) + 1 : 10);
    const again = (await store.snapshot({})).tenants[BIZ].outbox.find((m) => m.appointmentId === second?.id && m.kind === 'rebook');
    if (again) {
      await dispatchMessages(store, senders, { only: [BIZ], now: new Date(Date.parse(again.at) + 60_000) });
      const after = (await store.snapshot({})).tenants[BIZ].outbox.find((m) => m.id === again.id);
      check('no book-again message if they already booked', after?.state === 'skipped' && after.error === 'already_booked', after);
    } else check('second customer booked twice', false);

    const t0 = (await call('workspace.tenant', [BIZ], owner)).result;
    const startDate = days[12];
    let series: any = null;
    for (const date of wideDays.slice(12)) {
      for (const { start } of availableSlots(t0, { serviceId: svcM.id, staffId: svcM.staffIds[0], date, online: true }).slice(0, 4)) {
        series = await call('workspace.call', [BIZ, 'createAppointmentSeries', [{ serviceId: svcM.id, addOnIds: [], staffId: svcM.staffIds[0], date, start, customer: { name: 'Series Test', phone: '0501231234', locale: 'he' } }, { everyWeeks: 1, count: 4 }]], owner);
        if (series.status !== 409) break;
      }
      if (series && series.status !== 409) break;
    }
    const r = series?.result?.result;
    if (series?.status === 200) {
      check('series books every date or reports it', r.created.length + r.skipped.length === 4, r);
      const ids = new Set(r.created.map((a: any) => a.seriesId));
      check('series appointments share one series id', ids.size === 1 && !ids.has(undefined));
      check('series is one customer', new Set(r.created.map((a: any) => a.customerId)).size === 1);
      const confirms = (await store.snapshot({})).tenants[BIZ].outbox.filter((m) => m.kind === 'confirmation' && r.created.some((a: any) => a.id === m.appointmentId));
      const firstConfirms = confirms.filter((m) => m.appointmentId === r.created[0].id);
      check('only the first in a series sends a confirmation', confirms.length === firstConfirms.length && firstConfirms.length > 0, confirms.map((m) => m.appointmentId));
    } else check('series created', false, { series, staff: t0.staff.length });
    const tooMany = await call('workspace.call', [BIZ, 'createAppointmentSeries', [{ serviceId: svcM.id, addOnIds: [], staffId: svcM.staffIds[0], date: startDate, start: 900, customer: { name: 'Series Test', phone: '0501231234', locale: 'he' } }, { everyWeeks: 1, count: 500 }]], owner);
    check('series length is capped', tooMany.status === 400, tooMany);
  }

  // SMS through Global SMS.
  {
    check('sms numbers in Israeli local form', smsNumber('+972 50-123-4567') === '0501234567' && smsNumber('050-123-4567') === '0501234567' && smsNumber('972501234567') === '0501234567' && smsNumber('+44 7700 900123') === '447700900123');
    const sent: string[] = [];
    let reply = () => new Response('2', { status: 200 });
    const sms = globalSms('sms-key', '0521234567', (async (url: string) => (sent.push(url), reply())) as unknown as typeof fetch);
    await sms.send({ to: '+972 52-333-4444', body: 'שלום יעל, התור נקבע', subject: '', fromName: 'Ten' });
    const url = new URL(sent[0] ?? 'http://x');
    const q = Object.fromEntries(url.searchParams);
    check('sms goes to Global SMS with the key, sender and Hebrew text', url.origin + url.pathname === 'https://api.itnewsletter.co.il/api/restApiSms/sendSmsToRecipients' && q.ApiKey === 'sms-key' && q.txtOriginator === '0521234567' && q.destinations === '0523334444' && q.txtSMSmessage === 'שלום יעל, התור נקבע', q);
    const err = async () => sms.send({ to: '0523334444', body: 'x', subject: '', fromName: 'Ten' }).then(() => null, (e: SendError) => e);
    reply = () => new Response('Unapporved originator number', { status: 200 });
    const rejected = await err();
    check('a refused sms fails without retrying', rejected instanceof SendError && !rejected.retry && rejected.message.includes('originator'), rejected);
    reply = () => new Response('Forbidden', { status: 403 });
    const blocked = await err();
    check('an unapproved server IP is reported plainly', blocked instanceof SendError && !blocked.retry && blocked.message.includes('IP'), blocked);
    reply = () => new Response('system error', { status: 200 });
    const busy = await err();
    check('a gateway system error is retried', busy instanceof SendError && busy.retry, busy);
    reply = () => new Response('<?xml version="1.0"?><string xmlns="http://tempuri.org/">1</string>', { status: 200 });
    check('a credits count wrapped in XML counts as sent', (await err()) === null);
  }

  // WhatsApp templates and the Cloud API sender.
  {
    for (const [kind, tpl] of Object.entries(WHATSAPP_TEMPLATES)) {
      for (const [locale, text] of Object.entries(tpl.text)) {
        const used = [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
        const words = text.replace(/\{\{\w+\}\}/g, ' ').split(/\s+/).filter(Boolean).length;
        const ok = !/^\s*\{\{/.test(text) && !/\}\}[\s.!:,]*$/.test(text) && !/\}\}\s*\{\{/.test(text) && used.join() === tpl.vars.join() && words >= 3 * used.length + 1 && !/[—–]|--/.test(text) && /^[a-z_]+$/.test(tpl.name);
        check(`whatsapp template ${kind} (${locale}) follows Meta's rules`, ok, { used, words });
      }
    }
    check('international number from a local one', internationalPhone('050-777-7777', 'Asia/Jerusalem') === '972507777777' && internationalPhone('+44 7700 900123', 'Asia/Jerusalem') === '447700900123' && internationalPhone('0507777777', 'Europe/Nowhere') === null);
    check('empty name gets a greeting, not a blank', whatsAppParams('confirmation', 'he', { name: ' ', link: 'x' })[0].text === 'לך');

    const store = deps.store;
    const calls: { url: string; auth: string; body: any }[] = [];
    let reply: () => Response = () => new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 });
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, auth: String((init.headers as Record<string, string>).authorization), body: JSON.parse(String(init.body)) });
      return reply();
    }) as unknown as typeof fetch;
    const wa: Senders = { whatsapp: whatsappCloud('test-token', '1234567890', fakeFetch) };

    const t0 = (await call('workspace.tenant', [BIZ], owner)).result;
    const n = t0.business.notifications;
    await call('workspace.call', [BIZ, 'updateBusiness', [{ notifications: { ...n, confirmation: { ...n.confirmation, enabled: true, channels: ['whatsapp'] }, cancellation: { ...n.cancellation, enabled: true, channels: ['whatsapp'] } } }]], owner);
    let booked: any = null;
    const live = (await call('workspace.tenant', [BIZ], owner)).result;
    for (const date of days) {
      const slot = availableSlots(live, { serviceId: svcM.id, staffId: svcM.staffIds[0], date, online: true })[0];
      if (!slot) continue;
      const r = await call('public.createBooking', [SLUG, { serviceId: svcM.id, addOnIds: [], staffId: svcM.staffIds[0], date, start: slot.start, customer: { name: 'יעל כהן', phone: '052-333-4444', email: '', locale: 'he' } }]);
      if (r.status === 200) booked = r.result;
      if (booked) break;
    }
    check('booking for whatsapp tests', !!booked);
    if (booked) {
      await dispatchMessages(store, wa, { only: [BIZ], origin: 'https://tornu.co.il' });
      const sent = calls.find((c) => c.body.to === '972523334444');
      const params = Object.fromEntries((sent?.body.template.components[0].parameters ?? []).map((p: any) => [p.parameter_name, p.text]));
      check('whatsapp goes to the platform number endpoint with the token', !!sent && sent.url === 'https://graph.facebook.com/v26.0/1234567890/messages' && sent.auth === 'Bearer test-token', sent);
      check('whatsapp sends the approved confirmation template in the customer’s language', sent?.body.type === 'template' && sent.body.template.name === 'booking_confirmation' && sent.body.template.language.code === 'he', sent?.body);
      check('whatsapp fills in the appointment’s details', params.name === 'יעל' && !!params.business && !!params.date && !!params.time && params.link === `https://tornu.co.il/book/${SLUG}`, params);
      const snap = await store.snapshot({});
      const state = snap.tenants[BIZ].outbox.find((m) => m.appointmentId === booked.id && m.channel === 'whatsapp' && m.kind === 'confirmation');
      check('whatsapp confirmation is marked sent', state?.state === 'sent', state);
      check('whatsapp keeps Meta’s message id', state?.providerId === 'wamid.1', state);
      const ref = parseMessageRef(sent?.body.biz_opaque_callback_data);
      check('whatsapp sends a ref back to its business and message', ref?.businessId === BIZ && ref.messageId === state?.id, sent?.body.biz_opaque_callback_data);
      const month = usageMonth(new Date(), snap.tenants[BIZ].business.timezone);
      const usage0 = snap.tenants[BIZ].business.usage?.[month]?.whatsapp ?? 0;
      check('a sent whatsapp message is counted for the month', usage0 >= 1, snap.tenants[BIZ].business.usage);
      const planted = await call('workspace.call', [BIZ, 'updateBusiness', [{ usage: { [month]: { whatsapp: 0 } } }]], owner);
      check('settings save cannot rewrite usage', planted.result?.tenant.business.usage?.[month]?.whatsapp === usage0, planted.result?.tenant.business.usage);

      // Delivery reports from Meta.
      const smsOut: string[] = [];
      const withSms: Senders = { ...wa, sms: { send: async (m) => void smsOut.push(m.body) } };
      const hookEnv = { WHATSAPP_APP_SECRET: 'app-secret', WHATSAPP_VERIFY_TOKEN: 'verify-me', SITE_URL: 'https://tornu.co.il' };
      const hook = (body: unknown, secret = 'app-secret') => {
        const raw = JSON.stringify(body);
        const sig = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
        return handleWhatsAppWebhook(new Request('http://test/api/whatsapp/webhook', { method: 'POST', headers: { 'x-hub-signature-256': sig }, body: raw }), { store, senders: withSms }, hookEnv);
      };
      const statusBody = (status: string, extra: object = {}) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'wamid.1', status, biz_opaque_callback_data: sent?.body.biz_opaque_callback_data, ...extra }] } }] }] });
      const outboxMsg = async () => (await store.snapshot({})).tenants[BIZ].outbox.find((m) => m.id === state?.id);

      const verify = await handleWhatsAppWebhook(new Request('http://test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345'), { store, senders: withSms }, hookEnv);
      check('webhook answers Meta’s verification with the challenge', verify.status === 200 && (await verify.text()) === '12345');
      const wrongToken = await handleWhatsAppWebhook(new Request('http://test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1'), { store, senders: withSms }, hookEnv);
      check('webhook refuses a wrong verify token', wrongToken.status === 404);
      const forged = await hook(statusBody('failed'), 'not-the-secret');
      check('webhook refuses an unsigned report', forged.status === 401 && (await outboxMsg())?.state === 'sent');
      const off = await handleWhatsAppWebhook(new Request('http://test/api/whatsapp/webhook', { method: 'POST', body: '{}' }), { store, senders: withSms }, {});
      check('webhook doesn’t exist without an app secret', off.status === 404);

      await hook(statusBody('delivered'));
      check('a delivered report marks the message delivered', (await outboxMsg())?.delivery === 'delivered', await outboxMsg());
      await hook(statusBody('read'));
      await hook(statusBody('delivered'));
      check('read stays read when a late delivered report arrives', (await outboxMsg())?.delivery === 'read', await outboxMsg());

      await hook(statusBody('failed', { errors: [{ code: 131026, title: 'Message undeliverable' }] }));
      const afterFail = await store.snapshot({});
      const failedMsg = afterFail.tenants[BIZ].outbox.find((m) => m.id === state?.id);
      const standIn = afterFail.tenants[BIZ].outbox.find((m) => m.fallbackFor === state?.id);
      check('a failed report marks the message failed with the reason', failedMsg?.state === 'failed' && String(failedMsg.error).includes('131026'), failedMsg);
      check('an undelivered whatsapp message is taken off the count', (afterFail.tenants[BIZ].business.usage?.[month]?.whatsapp ?? 0) === usage0 - 1, afterFail.tenants[BIZ].business.usage);
      check('an undelivered whatsapp message goes out by SMS instead', standIn?.channel === 'sms' && standIn.state === 'sent' && smsOut.some((b) => b === standIn.body), { standIn, smsOut });
      check('the SMS stand-in is counted', (afterFail.tenants[BIZ].business.usage?.[month]?.sms ?? 0) >= 1, afterFail.tenants[BIZ].business.usage);
      const count = smsOut.length;
      await hook(statusBody('failed', { errors: [{ code: 131026 }] }));
      check('a repeated failed report sends no second SMS', smsOut.length === count && (await store.snapshot({})).tenants[BIZ].outbox.filter((m) => m.fallbackFor === state?.id).length === 1);
      const stranger = await hook({ entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'wamid.x', status: 'failed', biz_opaque_callback_data: 'not ours' }] } }] }] });
      check('reports that aren’t ours are ignored', stranger.status === 200);

      reply = () => new Response(JSON.stringify({ error: { code: 132001, message: 'Template name does not exist in the translation' } }), { status: 404 });
      await call('public.cancelBooking', [SLUG, booked.id]);
      await dispatchMessages(store, withSms, { only: [BIZ], origin: 'https://tornu.co.il' });
      const after = (await store.snapshot({})).tenants[BIZ].outbox;
      const cancelled = after.find((m) => m.appointmentId === booked.id && m.channel === 'whatsapp' && m.kind === 'cancellation');
      check('an unapproved template fails without retrying', cancelled?.state === 'failed' && String(cancelled.error).includes('132001'), cancelled);
      const cancelSms = after.find((m) => m.fallbackFor === cancelled?.id);
      check('a whatsapp message refused on sending goes out by SMS in the same pass', cancelSms?.state === 'sent', cancelSms);
    }
    await call('workspace.call', [BIZ, 'updateBusiness', [{ notifications: n }]], owner);
  }

  const persisted = new FileStore(join(dir, 'db.json'));
  const reread = await persisted.snapshot();
  check('changes are written to disk', reread.tenants[BIZ].business.phone === '03-000-0000');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
