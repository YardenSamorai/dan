/**
 * Creates the key pair for push notifications and adds it to .env:
 *   npm run push:keys
 *
 * Run once. New keys cut off every phone already subscribed (they'd have to
 * turn notifications on again), so an existing pair is never replaced.
 * Production (Cloudflare Pages project "dan") needs the same two values as secrets:
 *   npx wrangler pages secret put VAPID_PUBLIC_KEY --project-name dan
 *   npx wrangler pages secret put VAPID_PRIVATE_KEY --project-name dan
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { generatePushKeys } from '../server/push';

const file = '.env';
const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
const has = (k: string) => new RegExp(`^\\s*${k}\\s*=\\s*\\S`, 'm').test(current);

if (has('VAPID_PUBLIC_KEY') || has('VAPID_PRIVATE_KEY')) {
  console.log('.env already has push keys; nothing changed.');
  process.exit(0);
}

const keys = await generatePushKeys();
const sep = current && !current.endsWith('\n') ? '\n' : '';
appendFileSync(file, `${sep}\n# Push notifications to the team (npm run push:keys). Same values as Cloudflare secrets.\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`);
console.log('Added VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to .env. Restart `npm run dev` to use them.');
console.log('For production, copy both from .env into Cloudflare: npx wrangler pages secret put VAPID_PUBLIC_KEY --project-name dan, then VAPID_PRIVATE_KEY.');
