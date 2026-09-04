const CACHE_NAME = 'spotted-unila-cache-v165';
const APP_SHELL = [
  './',
  './index.html',
  './spotted-bg.jpg',
  './background.mp4',
  './slogan.png'
];

async function cacheAppAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(APP_SHELL.map(asset =>
    fetch(asset, { cache: 'no-cache' })
      .then(response => {
        if (response && response.ok) return cache.put(asset, response.clone());
        return null;
      })
      .catch(() => null)
  ));
}

self.addEventListener('install', event => {
  event.waitUntil(cacheAppAssets().then(() => self.skipWaiting()));
});

self.addEventListener('message', event => {
  if (event.data && event.data.action === 'cache-app-assets') {
    event.waitUntil(cacheAppAssets());
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isBackground = url.pathname.endsWith('/spotted-bg.jpg') || url.pathname.endsWith('/background.mp4') || url.pathname.endsWith('/slogan.png');
  const isAppNavigation = request.mode === 'navigate';

  if (!isBackground && !isAppNavigation && url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.ok && (isBackground || url.origin === self.location.origin)) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => {
        if (isAppNavigation) return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
