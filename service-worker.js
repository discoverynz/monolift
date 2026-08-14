const CACHE_NAME = 'monolift-v231';
const SHELL = ['./', './index.html', './css/styles.css?v=231', './js/app.js?v=231', './js/supabase-client.js?v=231', './manifest.json'];

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
// Only ever caches same-origin requests (the app's own shell) - third-party API
// calls (Supabase, the exercise database, etc.) are never cached here, so a
// transient network hiccup can't fall back to stale data from before a write.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const isSameOrigin = new URL(event.request.url).origin === self.location.origin;
  if (!isSameOrigin){
    event.respondWith(fetch(event.request));
    return;
  }
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
