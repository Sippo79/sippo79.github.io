// GPU GUIDE Service Worker
// キャッシュバージョンを上げるとデプロイ時に古いキャッシュが自動削除されます
// v3: OGP・manifest・icon 刷新に合わせてキャッシュリストを更新
// v4: 購入リンクを共通アフィリエイト基盤(shared/affiliate)へ移行
// v5: GPU個別ページを静的化（/gpu-guide/gpu/<id>/）。style.css を更新したため
//     旧キャッシュが残ると新ページが未スタイルで表示される。必ず版を上げること。
// v6: スマホ表示の修正（ロゴ・パンくずのタップ領域）。common.css / style.css を更新。
// v10: GPU個別ページの追加コンテンツ（RX 9070の比較・実機レビュー等）用に style.css を更新。
// v11: ヘッダー検索（gpu-search.js）を追加し common.css を更新。
// v12: GA4 を共通ローダー（/shared/analytics/sippo-analytics.js）へ置き換え、gpu-search.js に検索選択の計測を追加。
// v13: 価格を実売相場（確認日つき）優先に変更（script.js・gpu-detail.js・gpus.json）。キャッシュ優先の script.js を入れ替えるため版を上げる。
// v14: コスパの順位を確認済みの掲載価格だけに限定・価格の表示名を変更（script.js）。
// v16: 価格での絞り込み・並べ替えで、確認済みと未確認の価格を分けて表示（script.js・style.css）。
// v17: 共通アフィリエイトに商品カード（リンク先のメーカー名・製品名を表示）を追加（affiliate.js・affiliate.css・affiliate-master.json）。
// v18: 共通アフィリエイトの商品カードに、楽天で発行した画像リンク（item.imageLink）をそのまま表示（affiliate.js・affiliate.css・affiliate-master.json）。
// v19: 楽天カードのボタン文言を行き先に合わせる（商品を見る／価格を比較）・販売状態の注記・RTX 5070 Ti の発行画像（affiliate.js・affiliate.css・affiliate-master.json）。
// v20: 楽天の画像リンクだけで紹介する製品（RTX 5070 を 12G VENTUS 2X OC、RTX 5060 を 8G VENTUS 2X OC V1 に変更し、旧モデルの価格比較ボタンを外す）（affiliate.js・affiliate.css・affiliate-master.json）。
const CACHE_NAME = 'gpu-guide-v20';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './gpu.html',
  './common.css',
  './style.css',
  './script.js',
  './gpu-detail.js',
  './gpu-search.js',
  './affiliate-links.js',
  // 共通アフィリエイト基盤（サイト横断で共有。パスは絶対）
  '/shared/affiliate/affiliate-config.js',
  '/shared/affiliate/affiliate.js',
  '/shared/affiliate/affiliate.css',
  '/shared/affiliate/affiliate-master.json',
  './gpus.json',
  './cpu-recommendations.json',
  './site.webmanifest',
  './ogp.png',
  './favicon.ico',
  './favicon-32x32.png',
  './favicon-16x16.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
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
