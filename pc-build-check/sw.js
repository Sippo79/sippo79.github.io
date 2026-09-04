/* =========================
   PC BUILD CHECK — Service Worker
   バージョンを上げるたびに CACHE_NAME を更新してください
========================= */

// v4: 購入導線を共通アフィリエイト基盤(shared/affiliate)へ移行
// ※ キャッシュ名を正式名 pc-build-check に統一（旧 'jisako-v3' は別サイト名の誤用）
// v5: 解像度適性の注意書き(style.css) と
//     GPU詳細への直リンク(script.js) を追加。両方キャッシュ対象のため版を上げる。
// v6: 中古前提GPUの注意書きを追加（script.js / style.css を更新）。
//     両方キャッシュ対象なので版を上げないと再訪ユーザーに旧版が配られる。
// v7: 構成の参考価格を追加（script.js / style.css を更新、
//     shared/parts/build-price.js と part-prices.json を新規にキャッシュ対象へ）。
//     あわせて Phase 7（75構成の見直し=builds.json）と Phase 8 の分の版上げをまとめて反映。
//     ★v6 のまま Phase 7・8 を公開してしまっていたため、再訪ユーザーには
//       Phase 6 時点の script.js が配られ続けていた。症状として、
//       診断結果の「詳細スペックを見る」が古い /gpu-guide/?gpu= のままになり
//       GPU一覧に着地する／参考価格が出ない、が起きる。
//     ⚠️ script.js・style.css・builds.json・shared/ 配下を変更したら必ずここを上げること。
const CACHE_NAME = 'pc-build-check-v7';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './build-affiliate.js',
  './builds.json',
  // 共通アフィリエイト基盤（サイト横断で共有）
  '/shared/affiliate/affiliate-config.js',
  '/shared/affiliate/affiliate.js',
  '/shared/affiliate/affiliate.css',
  '/shared/affiliate/affiliate-master.json',
  '/shared/affiliate/affiliate-recommend.js',
  // 共通サービスナビ（ヘッダーのサービス切り替え）
  '/shared/nav/sippo-nav.js',
  '/shared/nav/sippo-nav.css',
  // GPU名→GPU GUIDE個別ページURL の解決（診断結果のGPUリンクで使う）
  '/shared/gpu/gpu-links.js',
  // 解像度適性の共通基準（GPU GUIDE と同じ尺度を使うため）
  '/shared/gpu/gpu-target.js',
  // 構成の参考価格（計算ロジックと価格マスター）
  '/shared/parts/build-price.js',
  '/shared/parts/part-prices.json',
  './manifest.json',
  './ogp.jpg',
  './icons/favicon.ico',
  './icons/favicon-32x32.png',
  './icons/favicon-16x16.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
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

  /* builds.json / part-prices.json: ネットワーク優先（最新データ取得）、失敗時キャッシュ。
     どちらも中身が更新されうるデータで、古い値を配ると
     「構成が違う」「参考価格が古い」が起きるため、版上げを待たずに最新を取りに行く。 */
  if (url.pathname.endsWith('builds.json') || url.pathname.endsWith('part-prices.json')) {
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
