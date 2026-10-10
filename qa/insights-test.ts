/**
 * Insights maths (src/domain/insights.ts) on the demo tenants and on small hand-made ones:
 *   npm run test:insights
 */
import { buildDemoDatabase } from '../src/data/demo/seed';
import { insights, outlook, PERIODS, periodSpans, spanDays, totals } from '../src/domain/insights';
import { businessNow } from '../src/domain/scheduling';
import type { Appointment, TenantData } from '../src/domain/types';

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
}
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// Periods
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
check('30 days ends today, previous is the 30 before', eq(periodSpans('30d', '2026-10-11'), { current: { from: '2026-09-12', to: '2026-10-11' }, previous: { from: '2026-08-13', to: '2026-09-11' } }));
check('7 days', eq(periodSpans('7d', '2026-10-11').current, { from: '2026-10-05', to: '2026-10-11' }));
check('this month vs same days last month', eq(periodSpans('month', '2026-10-11'), { current: { from: '2026-10-01', to: '2026-10-11' }, previous: { from: '2026-09-01', to: '2026-09-11' } }));
check('this month clamps to a shorter previous month', eq(periodSpans('month', '2026-03-31').previous, { from: '2026-02-01', to: '2026-02-28' }));
check('last month is the whole month', eq(periodSpans('lastMonth', '2026-10-11'), { current: { from: '2026-09-01', to: '2026-09-30' }, previous: { from: '2026-08-01', to: '2026-08-31' } }));
check('last month across a year', eq(periodSpans('lastMonth', '2026-01-15').current, { from: '2025-12-01', to: '2025-12-31' }));
for (const p of ['7d', '30d', '90d'] as const) {
  const s = periodSpans(p, '2026-10-11');
  check(`${p}: both spans equally long`, spanDays(s.current) === spanDays(s.previous) && spanDays(s.current) === parseInt(p, 10));
}

// The demo tenants: every breakdown adds up to the totals.
const now = new Date();
const db = buildDemoDatabase(now);
for (const t of Object.values(db.tenants)) {
  const name = t.business.slug;
  const today = businessNow(t, now);
  for (const p of PERIODS) {
    const r = insights(t, p, today);
    const c = r.current;
    const tag = `${name} ${p}`;
    check(`${tag}: booked + cancelled + no-shows = all`, c.booked + c.cancelled + c.noShow === c.total, c);
    check(`${tag}: staff revenue adds up`, sum(r.staff.map((s) => s.revenue)) === c.revenue);
    check(`${tag}: service revenue adds up`, sum(r.services.map((s) => s.revenue)) === c.revenue);
    check(`${tag}: chart adds up`, sum(r.series.map((b) => b.revenue)) === c.revenue && sum(r.series.map((b) => b.booked)) === c.booked);
    check(`${tag}: heatmap counts every booked appointment`, sum(r.heat.cells.flat()) === c.booked, { heat: sum(r.heat.cells.flat()), booked: c.booked });
    check(`${tag}: new + returning = customers`, c.newCustomers + c.returningCustomers === c.customers);
    check(`${tag}: occupancy within 0..1`, c.occupancy >= 0 && c.occupancy <= 1 && r.staff.every((s) => s.occupancy >= 0 && s.occupancy <= 1));
    check(`${tag}: online + studio = booked`, c.online + c.studio === c.booked);
  }
  const r30 = insights(t, '30d', today);
  check(`${name}: last 30 days has data`, r30.current.booked > 20 && r30.current.revenue > 0, r30.current);
  check(`${name}: comparable with the 30 days before`, r30.comparable && r30.previous.booked > 20, r30.previous);
  check(`${name}: some customers are new`, r30.current.newCustomers > 0 && r30.current.returningCustomers > 0, r30.current);
  check(`${name}: 90 days has no full previous period yet`, !insights(t, '90d', today).comparable);
  const ahead = outlook(t, today);
  check(`${name}: week ahead has 7 days and bookings`, ahead.days.length === 7 && ahead.booked > 0);
}

// A hand-made tenant with exact numbers.
const base = buildDemoDatabase(now).tenants['biz_lash_room'];
const D = '2026-10-06'; // a Tuesday
const appt = (id: string, status: Appointment['status'], price: number, customerId: string, date = D, start = 600): Appointment => ({
  businessId: base.business.id,
  id,
  code: id,
  customerId,
  staffId: 'shira',
  serviceId: 'lash-lift',
  addOnIds: [],
  date,
  start,
  duration: 60,
  price,
  status,
  source: id === 'a1' ? 'studio' : 'online',
  anyStaff: false,
  createdAt: `${date}T08:00:00.000Z`,
  updatedAt: `${date}T08:00:00.000Z`,
  history: [],
});
const small: TenantData = {
  ...base,
  timeOff: [],
  blocks: [],
  exceptions: [],
  appointments: [
    appt('a0', 'completed', 250, 'lr-c1', '2026-09-01'),
    appt('a1', 'completed', 250, 'lr-c1'),
    appt('a2', 'completed', 180, 'lr-c2', D, 720),
    appt('a3', 'cancelled', 380, 'lr-c3'),
    appt('a4', 'no_show', 90, 'lr-c4', D, 840),
  ],
};
const at = { date: '2026-10-11', minutes: 600 };
const s = totals(small, { from: D, to: D }, at);
check('exact: booked, cancelled, no-shows', s.booked === 2 && s.cancelled === 1 && s.noShow === 1 && s.total === 4, s);
check('exact: revenue and average', s.revenue === 430 && s.avgTicket === 215, s);
check('exact: lost to cancellations and no-shows', s.lost === 470, s);
check('exact: loss rate', s.lossRate === 0.5, s);
check('exact: one new, one returning', s.newCustomers === 1 && s.returningCustomers === 1, s);
// Shira works 10:00–19:00 on Tuesdays with a 13:30–14:00 business break = 510 open minutes.
check('exact: open minutes and occupancy', s.openMinutes === 510 && s.bookedMinutes === 120 && Math.abs(s.occupancy - 120 / 510) < 1e-9, s);
check('exact: one online, one by the team', s.online === 1 && s.studio === 1, s);

// A brand-new business.
const empty: TenantData = { ...small, appointments: [] };
const e = insights(empty, '30d', at);
check('empty: no history, nothing compared', !e.hasHistory && !e.comparable && e.current.revenue === 0 && e.heat.peak === null && e.staff.every((x) => x.booked === 0));

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
