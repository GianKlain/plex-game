// Offline cache for the Plex app. Bump VERSION on every release.
const VERSION = 'plex-v2';
const FILES = ['./', 'index.html', 'app.css', 'app.js', 'engine.js', 'ai.js', '../assets/img/Plex-Logo-RedOnWhite.svg', '../assets/img/plex-icon.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
