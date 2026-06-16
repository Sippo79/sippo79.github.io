/* Sippo Brand Site — Service Worker（軽量キャッシュ） */
const CACHE_NAME = 'sippo-pc-v8';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './favicon.png',
  './manifest.json',
  './assets/icon-192.png',
  './assets/sippo/sippo-normal.webp',
  './assets/sippo/sippo-thinking.webp',
  './assets/sippo/sippo-happy.webp',
  './assets/sippo/sippo-worried.webp',
  './assets/sippo/sippo-surprised.webp',
  './assets/sippo/sippo-sleepy.webp'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ネットワーク優先、失敗時キャッシュ（常に最新を届けつつオフラインでも表示） */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
