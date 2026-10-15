# Production message scheduling

Production uses the Cloudflare Worker `tornu-message-scheduler`, configured in
`wrangler.messages.jsonc`, every five minutes. It calls the Pages application's
authenticated `/api/cron/messages` endpoint. Do not also enable `supabase/cron.sql`:
running both schedulers can dispatch the same outbox concurrently.

Both deployments require the same `CRON_SECRET`. Set it as a secret, never as a
plain-text variable or committed file. Pages requires a new deployment after
changing its environment. Deploy the scheduler with:

```
npx wrangler deploy --config wrangler.messages.jsonc
```

For first deployment, use `--secrets-file` with an ignored private JSON file
containing `CRON_SECRET`; remove that file afterwards. The scheduler has no public
HTTP route. Check its scheduled execution logs for the dispatch result and failures.

WhatsApp customer lookup requires the approved `phone_code` templates and
`PHONE_CODES=on` on Pages. The live `platform.info` response should contain
`phoneCodes: true`. Email and SMS require their own provider credentials.

The dispatcher skips reminders for cancelled/completed/past appointments and
stale confirmations. A reminder whose appointment is still upcoming can be sent
late. Do not automatically retry failed scheduler calls: a provider may already
have accepted a message before an interrupted response.

Test the scheduler without sending messages:

```
npx esbuild qa/message-scheduler-test.ts --bundle --platform=node --format=esm --packages=external --outfile=node_modules/.tmp/message-scheduler-test.mjs
node node_modules/.tmp/message-scheduler-test.mjs
```
