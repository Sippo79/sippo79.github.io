// GPU GUIDE Service Worker
// キャッシュバージョンを上げるとデプロイ時に古いキャッシュが自動削除されます
// v2: affiliate-master.json を gpu-guide 直下に配置する方式へ変更
const CACHE_NAME = 'gpu-guide-v2';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './gpu.html',
  './common.css',
  './style.css',
  './script.js',
  './gpu-detail.js',
  './affiliate-links.js',
  './affiliate-master.json',
  './gpus.json',
  './cpu-recommendations.json',
  './favicon.ico',
  './favicon-32x32.png',
  './favicon-16x16.png',
  './apple-touch-icon.png',
  './site.webmanifest',
];

// インストール時: 静的アセットをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// アクティベート時: 古いバージョンのキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // GETリクエスト以外はスキップ
  if (request.method !== 'GET') return;

  // 別オリジンへのリクエストはスキップ
  if (!request.url.startsWith(self.location.origin)) return;

  const url = new URL(request.url);

  // HTMLナビゲーション: ネットワーク優先、失敗時はキャッシュにフォールバック
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // JSONデータ: stale-while-revalidate（キャッシュを即返しつつバックグラウンドで更新）
  if (url.pathname.endsWith('.json')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // 静的アセット: キャッシュ優先、なければネットワーク取得してキャッシュ保存
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
