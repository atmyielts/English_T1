// Lightweight installability service worker for the Schood English Hub.
// We deliberately do NOT cache HTML or API responses — we want every page
// load to hit the network so users always see the latest deploy and never
// get a stale auth/session shell. The worker exists primarily so the PWA
// install criteria are met; it also caches the app icon and manifest on
// first visit so the install banner art shows up offline.

const CACHE_NAME = 'schood-english-hub-shell-v1';
const SHELL_ASSETS = ['/manifest.webmanifest', '/schood-logo.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only intercept same-origin shell assets. Everything else (HTML, JS,
  // API) goes straight to the network so we don't risk serving stale
  // builds or stale auth.
  if (url.origin !== self.location.origin) return;
  if (!SHELL_ASSETS.includes(url.pathname)) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() => cached || new Response('', { status: 504 }));
    }),
  );
});
