import type { PushDeviceInput } from '../data/contracts';

/**
 * The browser side of push notifications: permission, the service worker
 * (public/sw.js shows them) and the subscription the server sends to.
 */

/**
 * `install`: an iPhone or iPad in the browser: notifications only work once
 * the app is on the home screen. `denied`: blocked in the browser's settings.
 */
export type PushState = 'unsupported' | 'install' | 'denied' | 'off' | 'on';

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return isIOS() && !standalone() ? 'install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  return (await currentSubscription()) ? 'on' : 'off';
}

const decode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const encode = (buf: ArrayBuffer | null) => (buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '');

function toDevice(sub: PushSubscription): PushDeviceInput | null {
  const j = sub.toJSON();
  return j.endpoint && j.keys?.p256dh && j.keys.auth ? { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth } : null;
}

/** This browser's subscription, if notifications are already on; for keeping the server's copy current. */
export async function existingDevice(serverKey: string): Promise<PushDeviceInput | null> {
  if (!supported() || Notification.permission !== 'granted') return null;
  const sub = await currentSubscription();
  return sub && encode(sub.options.applicationServerKey) === serverKey ? toDevice(sub) : null;
}

/** Asks for permission (call it from a tap) and subscribes. Null when the person said no. */
export async function enablePush(serverKey: string): Promise<PushDeviceInput | null> {
  // Asked first, while the tap still counts as the person's own action.
  if ((await Notification.requestPermission()) !== 'granted') return null;
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // Made with a server key that has since been replaced: it can't receive anything.
  if (sub && encode(sub.options.applicationServerKey) !== serverKey) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decode(serverKey) });
  return toDevice(sub);
}

/** Unsubscribes this browser; returns the address the server should forget. */
export async function disablePush(): Promise<string | null> {
  if (!supported()) return null;
  const sub = await currentSubscription();
  if (!sub) return null;
  await sub.unsubscribe();
  return sub.endpoint;
}

/**
 * The business app's manifest, added only inside /app: it lets the team put
 * the app on the home screen (which iPhones need for notifications) without
 * changing what a customer gets when they save a booking page.
 */
export function addAppManifest(): () => void {
  if (document.querySelector('link[rel="manifest"]')) return () => {};
  const link = Object.assign(document.createElement('link'), { rel: 'manifest', href: '/manifest.webmanifest' });
  const meta = Object.assign(document.createElement('meta'), { name: 'apple-mobile-web-app-capable', content: 'yes' });
  document.head.append(link, meta);
  return () => {
    link.remove();
    meta.remove();
  };
}

/** Taps on a notification while the app is open arrive here (see public/sw.js). */
export function onNotificationOpen(go: (url: string) => void): () => void {
  if (!('serviceWorker' in navigator)) return () => {};
  const listen = (e: MessageEvent) => {
    const d = e.data as { type?: string; url?: string } | null;
    if (d?.type === 'open' && d.url) go(d.url);
  };
  navigator.serviceWorker.addEventListener('message', listen);
  return () => navigator.serviceWorker.removeEventListener('message', listen);
}
