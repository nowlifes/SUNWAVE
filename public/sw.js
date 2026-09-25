// Service worker SUNWAVE : reçoit les push « Golden hour dans 20 min » et ouvre l'app au clic.
// Servi à la racine (/sw.js) pour que sa portée couvre toute l'app.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Golden hour dans 20 min';
  const body = typeof data.body === 'string' ? data.body : '';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/da/orb.png',
      badge: '/da/orb.png',
      // Un seul emplacement : une notification du jour en remplace une autre, elles ne s'empilent pas.
      tag: 'golden-hour',
      data: { url: typeof data.url === 'string' ? data.url : '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
