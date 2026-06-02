/* =========================
   PC BUILD CHECK — Service Worker
   バージョンを上げるたびに CACHE_NAME を更新してください
========================= */

const CACHE_NAME = 'pc-build-check-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './builds.json',
  './site.webmanifest',
  './favicon.ico',
  './favicon-32x32.png',
  './favicon-16x16.png',
  './apple-touch-icon.png',
];

/* インストール — 静的アセットをキャッシュ */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

/* アクティベート — 古いキャッシュを削除 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* フェッチ戦略 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  /* builds.json: ネットワーク優先（最新データ取得）、失敗時キャッシュ */
  if (url.pathname.endsWith('builds.json')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  /* 外部リソース（アフィリエイトリンク等）: ネットワークのみ */
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }

  /* その他の静的アセット: キャッシュ優先 */
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
