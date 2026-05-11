// Schood English Hub service worker — offline-capable shell with strict
// network-first for API calls so users never see stale auth or stale data.
//
// Strategy:
//   - SHELL_ASSETS (manifest, logo): cache-first.
//   - Vite-built JS / CSS in /assets/: cache-first (these are content-hashed,
//     so a new deploy emits new filenames; the cache for the OLD names stays
//     warm so a user mid-session offline still boots).
//   - HTML navigation requests: network-first with cache fallback so users
//     can still open the app while offline (they'll see the last-good
//     index.html, which boots the SPA).
//   - Everything else (API to *.supabase.co, third-party): pass through to
//     network. Never cached.
//
// Cache versioning: bump CACHE_NAME when you change SW logic so old caches
// get cleared on activate.

const CACHE_NAME = 'schood-english-hub-shell-v2';
const SHELL_ASSETS = ['/manifest.webmanifest', '/schood-logo.png'];

const isApiOrigin = (url) => {
  // Supabase Edge Functions and any other dynamic backend host. We never
  // cache these — auth + freshness matter more than offline.
  return url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in');
};

const isHashedAsset = (url) => {
  // Vite emits /assets/index-<hash>.js etc. Treat the whole /assets/ dir as
  // immutable cacheable content.
  return url.origin === self.location.origin && url.pathname.startsWith('/assets/');
};

const isNavigationRequest = (request) =>
  request.mode === 'navigate' || (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));

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

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Pass-through for APIs and any cross-origin request we don't own.
  if (isApiOrigin(url)) return;
  if (url.origin !== self.location.origin) return;

  // Cache-first for the static shell + content-hashed Vite assets.
  if (SHELL_ASSETS.includes(url.pathname) || isHashedAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            if (res && res.ok && res.type === 'basic') {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => undefined);
            }
            return res;
          })
          .catch(() => cached || new Response('', { status: 504 }));
      }),
    );
    return;
  }

  // Network-first for HTML navigation so a fresh deploy is picked up
  // immediately when online. Falls back to the last-cached index.html when
  // offline so the SPA can still boot.
  if (isNavigationRequest(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match('/');
          if (cached) return cached;
          const fallback = await caches.match(req);
          return fallback || new Response('You are offline and no cached page is available.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          });
        }),
    );
  }
  // Anything else we don't own (favicons, etc.): default network behaviour.
});
