const CACHE_NAME = 'monolift-v257';
const SHELL = ['./', './index.html', './css/styles.css?v=257', './js/app.js?v=257', './js/supabase-client.js?v=257', './manifest.json'];

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

// Strategy is chosen per resource type rather than one blanket rule.
//
// The previous network-first-for-everything meant every app open re-downloaded
// the entire ~700KB app.js over the network before anything could run, with the
// cache used only if the network outright failed. On a phone that is the single
// dominant cost of opening the app.
//
// The fix leans on the fact that our asset URLs already carry a ?v=N bumped on
// every deploy. A versioned URL can never go stale - if the content changed, the
// URL changed too - so serving those from cache is both correct and instant.
//
// - Navigation/HTML: NETWORK-FIRST. This is the one file with no version in its
//   URL, and it is what tells the browser which ?v=N to request. It must stay
//   network-first or a user would never learn a new version exists. Falls back
//   to cache when offline.
// - Versioned assets (?v=N): CACHE-FIRST. Instant, and self-invalidating on
//   deploy because the URL itself changes.
// - Other same-origin (icons, manifest): STALE-WHILE-REVALIDATE. Serve at once,
//   refresh in the background for next time.
// - Cross-origin (Supabase, fonts, exercise database): not intercepted at all,
//   so a network hiccup can never serve stale data from before a write.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // browser handles it normally

  const isNavigation = req.mode === 'navigate' || req.destination === 'document';
  const isVersioned = url.searchParams.has('v');

  if (isNavigation){
    // STALE-WHILE-REVALIDATE, not network-first. Network-first meant every
    // single app open paid a full round trip for the HTML before a single
    // script could even begin downloading - the whole app sat behind it.
    //
    // We serve the cached HTML instantly and revalidate in the background.
    // The update path is preserved rather than sacrificed: if the freshly
    // fetched HTML differs from what we served, we message the page so it
    // can offer a reload. The user gets an instant open AND still learns
    // about new versions, just one open later instead of blocking every open
    // forever to catch the rare deploy.
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkPromise = fetch(req).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          if (cached){
            // Compare bodies to see whether a deploy actually happened.
            Promise.all([cached.clone().text(), response.clone().text()]).then(([oldText, newText]) => {
              if (oldText !== newText){
                self.clients.matchAll().then((clients) => {
                  clients.forEach((c) => c.postMessage({ type: 'APP_UPDATE_AVAILABLE' }));
                });
              }
            }).catch(() => {});
          }
          return response;
        }).catch(() => cached);
        return cached || networkPromise;
      })
    );
    return;
  }

  if (isVersioned){
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit; // exact version already held - no network at all
        return fetch(req).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return response;
      }).catch(() => hit);
      return hit || network;
    })
  );
});
