/* Cafe Journal service worker — makes the app work offline */
const CACHE = 'cafe-journal-v21';
const ASSETS = ['./', 'index.html', 'app.css', 'js/core.js', 'js/data.js', 'js/views.js', 'js/main.js', 'js/staff.js', 'js/onboarding.js', 'js/auth.js', 'js/tables.js', 'js/recipes.js', 'js/inbox.js', 'vendor/firebase.js', 'js/firebase-config.js', 'js/cloud.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first (so updates arrive), fall back to cache when offline
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((res) => { // always check for a newer version
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
