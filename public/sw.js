const CACHE = 'swol-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(CACHE);
    cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match('/index.html') || Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  const cache = await caches.open(CACHE);
  cache.put(request, fresh.clone());
  return fresh;
}


self.addEventListener('push', (event) => {
  let data = { title: 'SwolTracker', body: 'New update' };
  try {
    if (event.data) data = event.data.json();
  } catch {
    /* non-JSON payload */
  }
  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    // Only ever go to a page of this app. A push cannot send the user to another origin.
    let target;
    try {
      target = new URL(raw, self.location.origin);
    } catch {
      target = new URL('/', self.location.origin);
    }
    if (target.origin !== self.location.origin) target = new URL('/', self.location.origin);

    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if (!('focus' in client)) continue;
      // Bring the window forward first (a notification tap is allowed to), then send it to a deep
      // link so a check-in lands on its card. A plain "open the app" push (the home page) only
      // brings the window forward, as before.
      let focused = client;
      try {
        focused = (await client.focus()) || client;
      } catch {
        // Focus can be refused; navigating still works.
      }
      const isDeepLink = target.pathname !== '/' || target.search !== '';
      if (isDeepLink && 'navigate' in client) {
        try {
          return await client.navigate(target.href);
        } catch {
          // Some browsers refuse to navigate a window we do not control. It is already focused.
        }
      }
      return focused;
    }
    if (self.clients.openWindow) return self.clients.openWindow(target.href);
    return undefined;
  })());
});
