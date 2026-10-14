// Push notifications for the business app (sent by server/push.ts).
// Deliberately no fetch handler: nothing is cached, the app always loads fresh.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let m = {};
  try {
    m = event.data ? event.data.json() : {};
  } catch {
    /* not ours */
  }
  // Every push must show something, or browsers withdraw the permission.
  event.waitUntil(
    self.registration.showNotification(m.title || '', {
      body: m.body || '',
      tag: m.tag,
      lang: m.lang,
      dir: m.lang === 'he' ? 'rtl' : 'ltr',
      icon: '/apple-touch-icon.png',
      data: { url: m.url || '/app' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/app', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).pathname.startsWith('/app'));
      if (open) {
        // The open app routes there itself, keeping whatever is on screen.
        open.postMessage({ type: 'open', url });
        return open.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
