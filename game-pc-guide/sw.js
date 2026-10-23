// v2: 購入導線を共通アフィリエイト基盤(shared/affiliate)へ移行
// v3: 構成表のGPU名を GPU GUIDE 個別ページへリンク（style.css を更新）
// style.css をキャッシュしているため、版を上げないと旧CSSが配られる。
// v4: スマホ表示の修正（ヘッダー内の共通ナビ位置・ロゴ/リンクのタップ領域）。style.css を更新。
// v6: 新作ゲーム4本（鬼武者/WARDOGS/バイオRE:レクイエム/ボダラン4）を追加。games.json・index.html を更新。
// v7: 一覧サムネを640px WebP化・詳細ヒーローもWebP化（script.js / 生成ページを更新）。
// v8: ゲーム個別ページのファイル名を games.json の slug から引くよう変更（script.js / games.json を更新）。
// v9: GTA5ページを書き下ろし本文に刷新（style.css / games.json を更新。GTA5に4K構成を追加）。
// v10: 全面リニューアル（style.css・script.js・index.html・games.json を更新。一覧カードを静的化し、script.js は絞り込みのみに）。
//      生成ページの style.css / script.js / game-affiliate.js には内容ハッシュの ?v= が付く（generate-games.js）。
//      下の CSS/JS キャッシュ優先でも、URLが変わるので公開直後に旧CSSと新HTMLが混ざらない。
// v11: 7タイトルを除きゲーム画像を復活（images/*.webp・-mini.webp を追加）。v10 は画像の 404 もキャッシュしていたため、
//      版を上げて古いキャッシュを捨て、画像は成功した応答（response.ok）だけをキャッシュするように修正。
// v12: Call of Duty: Modern Warfare 4 を30タイトル目として追加（index.html・games.json・style.css を更新）。
// v13: 新作判定を発売日（正式版の日）と生成日だけで行うよう修正。script.js が掲載最終日を過ぎた新作表示を閲覧時に外す。
const CACHE_VERSION = 'v13';
const CACHE_NAME = `game-pc-guide-${CACHE_VERSION}`;
const OFFLINE_URL = '/game-pc-guide/offline.html';

// Core assets to cache on install
const PRECACHE_ASSETS = [
  '/game-pc-guide/',
  '/game-pc-guide/index.html',
  '/game-pc-guide/style.css',
  '/game-pc-guide/script.js',
  '/game-pc-guide/data/games.json',
  '/game-pc-guide/offline.html',
  '/game-pc-guide/images/favicon.png',
  '/game-pc-guide/game-affiliate.js',
  // 共通アフィリエイト基盤（サイト横断で共有）
  '/shared/affiliate/affiliate-config.js',
  '/shared/affiliate/affiliate.js',
  '/shared/affiliate/affiliate.css',
  '/shared/affiliate/affiliate-master.json',
];

// Install: precache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('game-pc-guide-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) return;

  // Navigation requests: network-first, fallback to cache, fallback to offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request)
            .then(cached => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // JSON data: network-first, fallback to cache
  if (url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // CSS / JS: cache-first, update in background
  if (url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
    event.respondWith(
      caches.match(request).then(cached => {
        const fetchPromise = fetch(request).then(response => {
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
          return response;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Images: cache-first, fetch and cache on miss
  if (request.destination === 'image') {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          // 404 などの失敗した応答はキャッシュしない（画像を戻しても 404 が残り続けるのを防ぐ）
          if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
          return response;
        }).catch(() => new Response('', { status: 404 }));
      })
    );
    return;
  }
});
