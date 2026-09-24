const CACHE_NAME = 'spotted-unila-cache-v293';
const APP_SHELL = [
  './',
  './index.html',
  './privacy.html',
  './terms.html',
  './manifest.json',
  './file_00000000ff7c820e99efc0caf176d4c1.png',
  './icon-192.png',
  './icon-512.png',
  './favicon.png',
  './apple-touch-icon.png'
];

async function updateShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(APP_SHELL.map(async asset => {
    try {
      const response = await fetch(new Request(asset, { cache: 'no-store' }));
      if (response.ok) await cache.put(asset, response);
    } catch (_) {}
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(updateShell().finally(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.action === 'skipWaiting') self.skipWaiting();
  if (event.data?.action === 'update-shell') event.waitUntil(updateShell());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(new Request(request, { cache: 'no-store' }))
        .then(response => {
          if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put('./index.html', response.clone()));
          return response;
        })
        .catch(() => caches.match('./index.html').then(cached => cached || Response.error()))
    );
    return;
  }

  event.respondWith(
    fetch(new Request(request, { cache: 'no-store' }))
      .then(response => {
        if (response.ok && APP_SHELL.includes(url.pathname.split('/').pop() || './')) {
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || Response.error()))
  );
});
