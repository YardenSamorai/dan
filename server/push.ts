import { newActivity, type Activity } from '../src/domain/activity';
import { alertsOf, renderOwnerAlert } from '../src/domain/notifications';
import { can } from '../src/domain/permissions';
import type { PushDevice, TenantData } from '../src/domain/types';
import { pickText } from '../src/i18n/config';
import { Conflict, type Store } from './store';

/**
 * Web Push (RFC 8291 encryption, RFC 8292 VAPID) with WebCrypto only, so it
 * runs the same on Cloudflare and in Node. The browser's push service (Google,
 * Apple, Mozilla, Microsoft) delivers it; nothing is charged per message.
 */

export interface PushKeys {
  /** Uncompressed P-256 point, base64url. Browsers subscribe with it. */
  publicKey: string;
  /** The private scalar, base64url. Server only. */
  privateKey: string;
  /** Who push services contact about abuse: mailto: or https:. */
  subject: string;
}

type Env = Record<string, string | undefined>;

/** VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (npm run push:keys makes them), or null: push stays off. */
export function pushKeysFromEnv(env: Env): PushKeys | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  const email = env.VAPID_SUBJECT?.trim() || env.VITE_SUPPORT_EMAIL?.trim();
  const subject = !email ? (env.SITE_URL ?? 'mailto:support@example.com') : /^(mailto|https):/.test(email) ? email : `mailto:${email}`;
  return { publicKey, privateKey, subject };
}

type Bytes = Uint8Array<ArrayBuffer>;

export const b64url = {
  encode(bytes: Uint8Array): string {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(s: string): Bytes {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  },
};

const encoder = new TextEncoder();
const text = { encode: (s: string): Bytes => new Uint8Array(encoder.encode(s)) };

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** A fresh key pair, base64url: for `npm run push:keys`. */
export async function generatePushKeys(): Promise<Pick<PushKeys, 'publicKey' | 'privateKey'>> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: b64url.encode(raw), privateKey: jwk.d! };
}

const signingKeys = new Map<string, Promise<CryptoKey>>();

function signingKey(keys: PushKeys): Promise<CryptoKey> {
  let k = signingKeys.get(keys.privateKey);
  if (!k) {
    const pub = b64url.decode(keys.publicKey);
    const jwk = { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: b64url.encode(pub.slice(1, 33)), y: b64url.encode(pub.slice(33, 65)), ext: true };
    k = crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    signingKeys.set(keys.privateKey, k);
  }
  return k;
}

/** The Authorization header for one push service: a signed token valid for 12 hours. */
async function vapid(endpoint: string, keys: PushKeys): Promise<string> {
  const json = (v: unknown) => b64url.encode(text.encode(JSON.stringify(v)));
  const unsigned = `${json({ typ: 'JWT', alg: 'ES256' })}.${json({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: keys.subject })}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(keys), text.encode(unsigned)));
  return `vapid t=${unsigned}.${b64url.encode(sig)}, k=${keys.publicKey}`;
}

/** The payload encrypted for one browser (aes128gcm, a single record). */
export async function encryptPush(payload: Bytes, p256dh: string, authSecret: string): Promise<Bytes> {
  const uaPublic = b64url.decode(p256dh);
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(b64url.decode(authSecret), shared, concat(text.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, text.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, text.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 0x02: the last (and only) record.
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, sealed);
}

/** What the service worker (public/sw.js) shows. */
export interface PushMessage {
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url: string;
  /** Same tag = replaces the earlier notification instead of stacking. */
  tag: string;
  lang: string;
}

/** `gone`: the browser unsubscribed or the subscription expired; forget it. */
export async function sendPush(device: Pick<PushDevice, 'endpoint' | 'p256dh' | 'auth'>, message: PushMessage, keys: PushKeys, fetchImpl: typeof fetch = fetch): Promise<'sent' | 'gone' | 'failed'> {
  try {
    const body = await encryptPush(text.encode(JSON.stringify(message)), device.p256dh, device.auth);
    const res = await fetchImpl(device.endpoint, {
      method: 'POST',
      headers: { authorization: await vapid(device.endpoint, keys), 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '86400', urgency: 'high' },
      body,
    });
    if (res.ok) return 'sent';
    if (res.status === 404 || res.status === 410) return 'gone';
    console.error('[push]', new URL(device.endpoint).hostname, res.status, (await res.text().catch(() => '')).slice(0, 160));
    return 'failed';
  } catch (e) {
    console.error('[push]', e instanceof Error ? e.message : e);
    return 'failed';
  }
}

function messageFor(t: TenantData, x: Activity): PushMessage {
  const locale = t.business.defaultLocale;
  return {
    title: pickText(t.business.name, locale),
    body: renderOwnerAlert(t, x.appointment, x.kind),
    url: `/app?appointment=${encodeURIComponent(x.appointment.id)}`,
    tag: x.id,
    lang: locale,
  };
}

export interface TenantChange {
  before?: TenantData;
  after: TenantData;
}

/**
 * Tells the team's devices what customers just did, per the business's alert
 * settings: owners and managers hear about everything, staff about their own
 * appointments. Subscriptions the push service says are gone are removed.
 */
export async function notifyDevices(store: Store, keys: PushKeys, changes: TenantChange[], fetchImpl: typeof fetch = fetch) {
  for (const { before, after } of changes) {
    const devices = after.pushDevices ?? [];
    if (!devices.length) continue;
    const cfg = alertsOf(after.business);
    const fresh = newActivity(before, after).filter((x) => (x.kind === 'ownerBooked' ? cfg.booked : cfg.changed));
    if (!fresh.length) continue;
    const id = after.business.id;
    const members = (await store.snapshot({ businessId: id })).members.filter((m) => m.businessId === id);
    const gone = new Set<string>();
    for (const x of fresh) {
      const to = devices.filter((d) => {
        const m = members.find((y) => y.userId === d.userId);
        return !!m && (can(m.role, 'calendar.all') || m.staffId === x.appointment.staffId);
      });
      const message = messageFor(after, x);
      const results = await Promise.all(to.map((d) => sendPush(d, message, keys, fetchImpl)));
      results.forEach((r, i) => r === 'gone' && gone.add(to[i].endpoint));
    }
    if (gone.size) await forgetDevices(store, id, gone);
  }
}

async function forgetDevices(store: Store, id: string, endpoints: Set<string>) {
  for (let attempt = 0; ; attempt++) {
    const before = await store.snapshot({ businessId: id });
    const t = before.tenants[id];
    const kept = t?.pushDevices?.filter((d) => !endpoints.has(d.endpoint));
    if (!t || !kept || kept.length === t.pushDevices!.length) return;
    try {
      await store.commit(before, { ...before, tenants: { ...before.tenants, [id]: { ...t, pushDevices: kept } } });
      return;
    } catch (e) {
      if (!(e instanceof Conflict) || attempt >= 3) throw e;
    }
  }
}
