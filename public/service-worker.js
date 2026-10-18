/* Only public installation assets belong in this cache. Account data stays online. */
const CACHE_NAME = 'affimaro-public-v2';
const PUBLIC_ASSETS = [
  '/offline',
  '/manifest.webmanifest',
  '/app-icons/icon-192.png',
  '/app-icons/icon-512.png',
  '/app-icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const responses = await Promise.all(PUBLIC_ASSETS.map(async path => {
      const response = await fetch(new URL(path, self.location.origin).href, {
        credentials: 'omit', cache: 'reload', redirect: 'error',
      });
      const contentType = response.headers.get('content-type') || '';
      const expected = path.endsWith('.png') ? 'image/png' : path.endsWith('.webmanifest') ? 'application/manifest+json' : 'text/html';
      if (!response.ok || response.redirected || !contentType.startsWith(expected) || /private|no-store/i.test(response.headers.get('cache-control') || '')) {
        throw new Error('Public installation assets are unavailable.');
      }
      return [path, response];
    }));
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(responses.map(([path, response]) => cache.put(path, response)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('affimaro-public-') && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, {cache: 'no-store'}).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match('/offline') || new Response('Reconnect to use Affimaro.', {
        status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'},
      });
    }));
    return;
  }

  if (!url.search && PUBLIC_ASSETS.includes(url.pathname)) {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(url.pathname) || Response.error();
    }));
  }
});
