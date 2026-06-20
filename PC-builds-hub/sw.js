// =====================
// PC Builds Hub — Service Worker
// Cache name はサイト固有にすること（他サイトとの混線防止）
// =====================
const CACHE_NAME = "pc-builds-cache-v9";

const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./all-posts.html",
  "./login.html",
  "./mypage.html",
  "./submit.html",
  "./admin.html",
  "./style.css",
  "./api.js",
  "./auth.js",
  "./supabase-config.js",
  "./main.js",
  "./post.js",
  "./login.js",
  "./mypage.js",
  "./submit.js",
  "./admin.js",
  "./images/no-image.svg",
];

// ── Install: 静的アセットを事前キャッシュ ──
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: 旧キャッシュ (他バージョン・他サイト) を一掃 ──
self.addEventListener("activate", (event) => {
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

// ── Fetch: リクエスト別ストラテジー ──
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // 外部ドメインはスルー
  if (url.origin !== self.location.origin) return;

  // posts.json は常にネットワーク優先（データは常に最新を取得）
  if (url.pathname.endsWith("posts.json")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // cache: "no-store" が指定されたリクエストはキャッシュしない
  if (event.request.cache === "no-store") {
    event.respondWith(fetch(event.request));
    return;
  }

  // 画像: キャッシュファースト（なければネットワーク取得してキャッシュ）
  if (/\.(jpe?g|png|gif|webp|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return response;
          })
      )
    );
    return;
  }

  // HTML / CSS / JS: ネットワークファースト、失敗時はキャッシュフォールバック
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
