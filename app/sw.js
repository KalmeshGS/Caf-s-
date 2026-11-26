/* Cafe Journal service worker — makes the app work offline */
const CACHE = 'cafe-journal-v48';
const ASSETS = ['./', 'index.html', 'app.css', 'js/guard.js', 'js/core.js', 'js/businessProfile.config.js', 'js/profile.js', 'js/data.js', 'js/views.js', 'js/main.js', 'js/staff.js', 'js/onboarding.js', 'js/bizsetup.js', 'js/auth.js', 'js/tables.js', 'js/tokens.js', 'js/recipes.js', 'js/import.js', 'js/files.js', 'js/menuimport.js', 'js/report.js', 'js/library.js', 'js/costing.js', 'js/floor.js', 'js/scan.js', 'js/periods.js', 'js/ai-config.js', 'js/assistant.js', 'js/inbox.js', 'vendor/firebase.js', 'js/firebase-config.js', 'js/cloud.js', 'js/guest.js',
  'manifest.webmanifest', '../assets/fonts/marcellus-400.woff2', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'];

// Cache each file on its own: one missing or slow file must not stop the whole app from installing
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.allSettled(ASSETS.map((a) => fetch(a, { cache: 'no-cache' }).then((res) => (res.ok ? c.put(a, res) : null)))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first (so updates arrive), fall back to cache when offline
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((res) => { // always check for a newer version
      // keep only good, complete answers — never cache a 404 / error page over a working file
      if (res.ok && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
