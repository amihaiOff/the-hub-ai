/* The Hub AI service worker.
 *
 * Deliberately conservative for a financial app:
 *  - Content-hashed build output (/_next/static) is cache-first.
 *  - Stable-named static files (icons, fonts) use stale-while-revalidate.
 *  - Navigations are network-first with an offline fallback page.
 *  - API routes and auth (/api, /handler, /auth) are NEVER cached — always
 *    network. We never persist sensitive financial or session data to cache.
 */
const CACHE_VERSION = 'hub-ai-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const OFFLINE_URL = '/offline.html';

// offline.html is essential (it's the navigation fallback); the icons are a
// best-effort nicety. Cache each independently so a single failed fetch can't
// abort the whole install and leave the app with no offline fallback.
const ESSENTIAL_URLS = [OFFLINE_URL];
const OPTIONAL_URLS = ['/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then(async (cache) => {
        // Essential: must succeed for offline support.
        await cache.addAll(ESSENTIAL_URLS);
        // Optional: tolerate individual failures.
        await Promise.allSettled(OPTIONAL_URLS.map((url) => cache.add(url)));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isNeverCached(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/handler/') ||
    url.pathname.startsWith('/auth')
  );
}

// Content-hashed build output — safe to cache forever (cache-first).
function isImmutableAsset(url) {
  return url.pathname.startsWith('/_next/static/');
}

// Other static files served from /public (icons, fonts, root images). These
// have stable filenames, so we use stale-while-revalidate: serve from cache
// for speed but refresh in the background so an updated asset propagates
// without needing a CACHE_VERSION bump.
function isRevalidatedAsset(url) {
  return (
    url.pathname.startsWith('/icons/') ||
    /\.(?:woff2?|png|jpg|jpeg|svg|ico|webp)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET; let the browser deal with everything else.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Same-origin only.
  if (url.origin !== self.location.origin) return;

  // Never intercept/cache sensitive routes — go straight to the network.
  if (isNeverCached(url)) return;

  // Cache-first for immutable, content-hashed build assets.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // Stale-while-revalidate for stable-named static files (icons, fonts).
  if (isRevalidatedAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request)
            .then((response) => {
              if (response && response.status === 200 && response.type === 'basic') {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // Network-first for navigations, with offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached || Response.error())
      )
    );
    return;
  }
});
