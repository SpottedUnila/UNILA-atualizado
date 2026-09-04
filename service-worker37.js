const CACHE_NAME = 'spotted-unila-cache-v163';
const APP_SHELL = [
  './',
  './index.html',
  './spotted-bg.jpg',
  './background.mp4',
  './slogan.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await cache.add('./').catch(() => {});
      await cache.add('./index.html').catch(() => {});
      // Se o arquivo ainda não estiver disponível durante a instalação,
      // o Service Worker continua ativo e fará cache quando ele for usado.
      await cache.add('./spotted-bg.jpg').catch(() => {});
      await cache.add('./background.mp4').catch(() => {});
      await cache.add('./slogan.png').catch(() => {});
      return self.skipWaiting();
    })
  );
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
