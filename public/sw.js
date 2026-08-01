const CACHE_NAME = 'gerak-cache-v331';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install Event - cache core static resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching App Shell and core assets');
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('[Service Worker] Some assets failed to cache during install, ignoring: ', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Event - clean up obsolete caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle standard GET requests, and only same-origin — cross-origin
  // calls (Supabase API/auth/realtime) should go straight to the network
  // untouched rather than being routed through this cache logic.
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Vite's built assets are content-hashed (filename changes iff contents
  // change), so a cached copy is never stale — a new deploy simply produces
  // a new URL. Serving these straight from cache skips a network round-trip
  // on every single chunk, on every single load, for files that by
  // construction can never need revalidation. Falls back to network (and
  // caches the result) the first time a given hash is seen.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else (the HTML shell, manifest, icons) — network-first, so
  // updates to the app shell itself are picked up as soon as they're live,
  // falling back to cache when offline.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if network fails
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If offline and request is for a page, return a minimal HTML response
          if (event.request.headers.get('accept').includes('text/html')) {
            return new Response(
              '<html><body><div style="font-family:sans-serif; text-align:center; padding:50px;">' +
              '<h2>GERAK is currently offline</h2>' +
              '<p>Please check your campus network connection and try again.</p>' +
              '</div></body></html>',
              { headers: { 'Content-Type': 'text/html' } }
            );
          }
        });
      })
  );
});
