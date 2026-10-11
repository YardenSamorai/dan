-- ============================================================================
-- Sends due messages (reminders, confirmations, alerts) every 5 minutes by
-- calling the site's /api/cron/messages endpoint.
--
-- Before running: replace both placeholders below.
--   SITE_URL     e.g. https://tornu.co.il
--   CRON_SECRET  the same value as the CRON_SECRET variable in Cloudflare
--
-- Safe to run again (it replaces the job). To stop: select cron.unschedule('send-messages');
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-messages',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'SITE_URL/api/cron/messages',
    headers := jsonb_build_object('authorization', 'Bearer CRON_SECRET'),
    timeout_milliseconds := 25000
  );
  $$
);
