const CACHE_NAME = 'zealift-v140';
const SHELL = ['./', './index.html', './css/styles.css?v=140', './js/app.js?v=140', './js/supabase-client.js?v=140', './manifest.json'];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // don't wait for old tabs to close — take over immediately
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()) // take control of any already-open tabs right away
  );
});

// Network-first: always try to get the latest code. Cache is only a fallback for offline use,
// never the default — this is what was wrong before.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
