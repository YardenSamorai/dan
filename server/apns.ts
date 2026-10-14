import type { PushMessage } from './push';
import { b64url } from './push';

/**
 * Apple's push service, for the iPhone app. Token auth: a .p8 key from
 * developer.apple.com → Keys (with APNs) signs a short-lived JWT. APNs only
 * speaks HTTP/2, which Cloudflare's fetch uses; plain Node's fetch can't, so
 * locally these sends fail and are logged.
 */
export interface ApnsKeys {
  keyId: string;
  teamId: string;
  /** The .p8 file's contents (PEM). */
  privateKey: string;
  /** The app's bundle id. */
  topic: string;
  host: string;
}

type Env = Record<string, string | undefined>;

/** APNS_KEY_ID + APNS_TEAM_ID + APNS_PRIVATE_KEY, or null: the app offers no notifications. */
export function apnsKeysFromEnv(env: Env): ApnsKeys | null {
  const keyId = env.APNS_KEY_ID?.trim();
  const teamId = env.APNS_TEAM_ID?.trim();
  const privateKey = env.APNS_PRIVATE_KEY?.trim();
  if (!keyId || !teamId || !privateKey) return null;
  return {
    keyId,
    teamId,
    privateKey,
    topic: env.APNS_TOPIC?.trim() || 'il.co.tornu.app',
    host: env.APNS_SANDBOX === 'true' ? SANDBOX : PRODUCTION,
  };
}

const PRODUCTION = 'api.push.apple.com';
const SANDBOX = 'api.sandbox.push.apple.com';

const encoder = new TextEncoder();

async function importKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** Apple wants a token reused for 20–60 minutes, not one per request. */
let cached: { key: string; token: string; at: number } | null = null;

async function providerToken(keys: ApnsKeys): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.key === keys.keyId && now - cached.at < 40 * 60) return cached.token;
  const json = (v: unknown) => b64url.encode(encoder.encode(JSON.stringify(v)));
  const unsigned = `${json({ alg: 'ES256', kid: keys.keyId })}.${json({ iss: keys.teamId, iat: now })}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await importKey(keys.privateKey), encoder.encode(unsigned)));
  cached = { key: keys.keyId, token: `${unsigned}.${b64url.encode(sig)}`, at: now };
  return cached.token;
}

/** `gone`: the app was removed or turned notifications off for good; forget the device. */
export async function sendApns(token: string, message: PushMessage, keys: ApnsKeys, fetchImpl: typeof fetch = fetch): Promise<'sent' | 'gone' | 'failed'> {
  const post = async (host: string) => {
    const res = await fetchImpl(`https://${host}/3/device/${token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${await providerToken(keys)}`,
        'apns-topic': keys.topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400),
        'apns-collapse-id': message.tag.slice(0, 64),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ aps: { alert: { title: message.title, body: message.body }, sound: 'default', 'thread-id': 'activity' }, url: message.url }),
    });
    const reason = res.ok ? '' : (((await res.json().catch(() => ({}))) as { reason?: string }).reason ?? '');
    return { ok: res.ok, status: res.status, reason };
  };
  try {
    let r = await post(keys.host);
    // A token from the other environment (a development build vs TestFlight) reads as a bad token: try there before forgetting the device.
    if (r.reason === 'BadDeviceToken') {
      const other = await post(keys.host === SANDBOX ? PRODUCTION : SANDBOX);
      if (other.ok || other.reason !== 'BadDeviceToken') r = other;
    }
    if (r.ok) return 'sent';
    console.error('[apns]', r.status, r.reason);
    if (r.status === 410 || r.reason === 'BadDeviceToken' || r.reason === 'Unregistered' || r.reason === 'DeviceTokenNotForTopic') return 'gone';
    return 'failed';
  } catch (e) {
    console.error('[apns]', e instanceof Error ? e.message : e);
    return 'failed';
  }
}
