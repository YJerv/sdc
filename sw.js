const CACHE = 'sdc-shell-2';

const ASSETS = [
  './index.html',
  './css/app.css',
  './js/main.js',
  './js/viewer.js',
  './js/step-model.js',
  './js/format.js',
  './js/step-worker.js',
  './js/orient.js',
  './js/settings.js',
  './js/drawing/geometry.js',
  './js/drawing/features.js',
  './js/drawing/sheet.js',
  './js/drawing/create.js',
  './js/export-policy.js',
  './js/export-client.js',
  './js/pdf-image.js',
  './manifest.webmanifest',
  './vendor/occt-import-js/occt-import-js.js',
  './vendor/occt-import-js/occt-import-js.wasm',
  './vendor/three/three.module.min.js',
  './vendor/three/OrbitControls.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/jet-logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      return await fetch(event.request);
    } catch (error) {
      if (event.request.mode === 'navigate') {
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});
