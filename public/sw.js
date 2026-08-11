/**
 * Service worker: precache everything, serve from cache, work in the basement.
 *
 * The cache name carries the build hash (passed as ?v= when the worker is
 * registered), so a stale worker can never serve a half-updated bundle: a new
 * build is a new worker, a new cache, and every other cache is dropped on
 * activate.
 */

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `bb-${VERSION}`;

// index.html and sw.js are served no-cache by nginx, so a fix pushed on the
// morning of the party still reaches a phone that already loaded the site.
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Hashed assets are immutable: cache-first, and fill the cache as we go.
  // There is no network to be first for — the game makes no requests after load.
  event.respondWith(
    caches.match(req, { ignoreSearch: url.pathname.endsWith('/') }).then((hit) => {
      if (hit) {
        // Refresh the document in the background so a redeploy lands on the
        // next open rather than the one after.
        if (req.mode === 'navigate') void refresh(req);
        return hit;
      }
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then((idx) => idx || Response.error()));
    }),
  );
});

function refresh(req) {
  return fetch(req)
    .then((res) => {
      if (res && res.status === 200) return caches.open(CACHE).then((c) => c.put(req, res.clone()));
      return undefined;
    })
    .catch(() => undefined);
}
