const CACHE = 'naughtyshare-shell-v6';
const APP_SHELL = ['/manifest.webmanifest', '/icons/naughtyshare.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache API responses, private originals, compatibility video derivatives,
  // or other derived private media.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/media/') ||
    url.pathname.startsWith('/compat-media/') ||
    url.pathname.startsWith('/thumbnail/')
  ) return;

  // NaughtyShare is an authenticated online vault. Never serve cached HTML or
  // JavaScript because that can keep an installed PWA on an old UI after a deploy.
  // A stale interface is worse than an offline shell here.
  if (
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css')
  ) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, clone)));
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});