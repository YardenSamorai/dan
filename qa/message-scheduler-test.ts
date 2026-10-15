import assert from 'node:assert/strict';
import { runMessages } from '../server/messageScheduler';

let calls = 0;
const mock: typeof fetch = async (url, init) => {
  calls++;
  assert.equal(url, 'https://tornu.co.il/api/cron/messages');
  assert.equal(init?.method, 'POST');
  assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-secret');
  assert.ok(init?.signal);
  return Response.json({ businesses: 1, sent: 0, failed: 0, skipped: 1 });
};
await assert.rejects(runMessages({ CRON_SECRET: '' }, mock), /missing/);
assert.equal(calls, 0);
assert.equal((await runMessages({ CRON_SECRET: 'test-secret' }, mock)).skipped, 1);
await assert.rejects(runMessages({ CRON_SECRET: 'test-secret' }, async () => new Response(null, { status: 401 })), /401/);
await assert.rejects(runMessages({ CRON_SECRET: 'test-secret' }, async () => Response.json({ failed: 1 })), /delivery failures/);
console.log('Scheduler checks passed');
