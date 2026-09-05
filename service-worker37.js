const CACHE_NAME = 'spotted-unila-cache-v170';
const APP_SHELL = [
  './',
  './index.html',
  './background.mp4',
  './slogan.png',
  './icon-192.png',
  './icon-512.png',
  './favicon.png',
  './apple-touch-icon.png'
];

async function cacheAppAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(APP_SHELL.map(asset =>
    fetch(asset, { cache: 'no-cache' })
      .then(response => response && response.ok ? cache.put(asset, response.clone()) : null)
      .catch(() => null)
  ));
}

self.addEventListener('install', event => {
  event.waitUntil(cacheAppAssets().catch(() => null).then(() => self.skipWaiting()));
});

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.action === 'cache-app-assets') {
    event.waitUntil(cacheAppAssets());
  } else if (event.data.action === 'skipWaiting') {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isVideo = url.pathname.endsWith('/background.mp4');
  const isBackground = isVideo || url.pathname.endsWith('/slogan.png');
  const isAppNavigation = request.mode === 'navigate';

  if (!isBackground && !isAppNavigation && url.origin !== self.location.origin) return;

  if (isAppNavigation) {
    event.respondWith(
      fetch(new Request(request.url, {
        method: 'GET',
        headers: request.headers,
        cache: 'no-store',
        credentials: request.credentials,
        redirect: 'follow'
      }))
        .then(response => {
          if (response && response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put('./index.html', response.clone()));
          }
          return response;
        })
        .catch(() => caches.match('./index.html').then(cached => cached || Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(new Request(url.href))
      .then(cached => cached || fetch(request).then(response => {
        if (response && response.ok && isBackground) {
          caches.open(CACHE_NAME).then(cache => cache.put(new Request(url.href), response.clone()));
        }
        return response;
      }))
      .catch(() => Response.error())
  );
});
