/** Lightweight clock: delivery stays in the site's authenticated message endpoint. */
export interface SchedulerEnv {
  CRON_SECRET: string;
}

export async function runMessages(env: SchedulerEnv, fetchImpl: typeof fetch = fetch) {
  if (!env.CRON_SECRET) throw new Error('Message scheduler secret is missing');
  const response = await fetchImpl('https://tornu.co.il/api/cron/messages', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`Message dispatcher returned ${response.status}`);
  const result = await response.json() as { businesses: number; sent: number; failed: number; skipped: number };
  console.log('[message-scheduler]', JSON.stringify(result));
  if (result.failed) throw new Error('Message delivery failures; inspect the outbox');
  return result;
}

export default {
  async scheduled(_event: unknown, env: SchedulerEnv) {
    await runMessages(env);
  },
};
