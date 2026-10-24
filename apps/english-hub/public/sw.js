// Schood English service worker: an installable, offline-tolerant shell that
// never caches learner data.
//
// Strategy:
//   - API hosts (*.supabase.co / *.supabase.in) and any other origin: never
//     touched, never cached. Auth and freshness matter more than offline.
//   - Page loads (navigations): network-first. The fresh index.html is kept
//     as the offline copy; when offline we serve that copy, then the static
//     /offline.html page. A deploy is therefore picked up on the next online
//     load, and an old index.html can never be served while online.
//   - /assets/* (content-hashed Vite output) and /icons/*: cache-first.
//   - Manifests: network-first, so a changed name or icon reaches installs.
//   - "Download for offline" (Today) posts { type: 'warm-cache', urls } so the
//     shell ('/') and the build files the page has loaded are cached before the
//     connection goes. Only '/' and same-origin /assets/ and /icons/ files are
//     accepted; learner data stays in the page's IndexedDB, never in this cache.
//
// Updates: a new worker installs in the background and WAITS until every tab
// of the old one is closed (no skipWaiting / clients.claim), so an open lesson
// never loses chunks it still needs. A new deploy does not depend on that: page
// loads are network-first, and the page itself (src/lib/pwa.ts) notices a new
// build and offers a reload.
//
// Bump VERSION whenever this file's behaviour or the precache list changes.

const VERSION = 'v5';
const CACHE_PREFIX = 'schood-english-hub-shell-';
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/manifest.webmanifest', '/icons/icon-192.png', '/icons/favicon-32.png'];

const isApiOrigin = (url) => url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in');
const isHashedAsset = (url) => url.pathname.startsWith('/assets/');
const isIcon = (url) => url.pathname.startsWith('/icons/') || url.pathname === '/schood-logo.png';
const isManifest = (url) => url.pathname === '/manifest.webmanifest' || url.pathname.startsWith('/manifests/');
const isNavigationRequest = (request) =>
  request.mode === 'navigate' || (request.method === 'GET' && (request.headers.get('accept') || '').includes('text/html'));

// Hosts can answer /offline.html with a redirect to /offline. A redirected
// response cannot answer a navigation, so store a clean copy of the body.
const cleanCopy = async (response) => {
  if (!response.redirected) return response;
  const body = await response.blob();
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
};

const precache = async () => {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(PRECACHE.map(async (path) => {
    try {
      const response = await fetch(path, { cache: 'no-cache' });
      if (response.ok) await cache.put(path, await cleanCopy(response));
    } catch {
      // Offline during install: the page still works online; the fallback text below covers the rest.
    }
  }));
};

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  );
});

const put = (key, response) => {
  if (!response || !response.ok || response.type !== 'basic') return;
  const copy = response.clone();
  cleanCopy(copy)
    .then((clean) => caches.open(CACHE_NAME).then((cache) => cache.put(key, clean)))
    .catch(() => undefined);
};

const cacheFirst = async (request) => {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    // A missing old chunk comes back as the SPA's index.html; never keep that under a script's name.
    if (!(response.headers.get('content-type') || '').includes('text/html')) put(request, response);
    return response;
  } catch {
    return new Response('', { status: 504 });
  }
};

const networkFirst = async (request) => {
  try {
    const response = await fetch(request);
    put(request, response);
    return response;
  } catch {
    return (await caches.match(request)) || new Response('', { status: 504 });
  }
};

const offlineText = () => new Response('You are offline and no saved page is available.', {
  status: 503,
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
});

const navigate = async (request) => {
  try {
    const response = await fetch(request);
    const html = (response.headers.get('content-type') || '').includes('text/html');
    // Every route serves the same index.html; keep the newest one as the offline copy.
    if (response.ok && html) put('/', response);
    return response;
  } catch {
    return (await caches.match('/')) || (await caches.match(OFFLINE_URL)) || offlineText();
  }
};

// Offline download: keep the shell and the build files the page lists.
const warm = async (urls) => {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(urls.map(async (raw) => {
    let url;
    try {
      url = new URL(String(raw), self.location.origin);
    } catch {
      return;
    }
    if (url.origin !== self.location.origin) return;
    const shell = url.pathname === '/';
    if (!shell && !isHashedAsset(url) && !isIcon(url)) return;
    // Hashed files never change; skip what is already kept.
    if (!shell && (await cache.match(url.pathname))) return;
    try {
      const response = await fetch(url.pathname, { cache: shell ? 'no-cache' : 'default', credentials: 'same-origin' });
      if (!response.ok || response.type !== 'basic') return;
      const html = (response.headers.get('content-type') || '').includes('text/html');
      // The shell must be HTML; a build file must not be (a missing chunk comes back as index.html).
      if (shell !== html) return;
      await cache.put(url.pathname, await cleanCopy(response));
    } catch {
      // Offline or a storage error: the page reports the download; the next online visit fills the gap.
    }
  }));
};

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'warm-cache' || !Array.isArray(data.urls)) return;
  if (event.origin && event.origin !== self.location.origin) return;
  event.waitUntil(warm(data.urls.slice(0, 300)));
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

  if (isApiOrigin(url) || url.origin !== self.location.origin) return;

  if (isNavigationRequest(req)) {
    event.respondWith(navigate(req));
    return;
  }
  if (isHashedAsset(url) || isIcon(url)) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (isManifest(url)) {
    event.respondWith(networkFirst(req));
  }
  // Anything else on our origin: default network behaviour.
});
