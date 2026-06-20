(function () {
  if (!("serviceWorker" in navigator)) return;

  // ── localhost / 開発環境の判定 ──
  const h = location.hostname;
  const isLocal =
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h === "" ||
    location.protocol === "file:" ||
    // LAN IP (192.168.x.x / 10.x.x.x / 172.16-31.x.x)
    /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);

  if (isLocal) {
    // 開発時: このオリジンに残っている全 Service Worker を登録解除
    // → 他サイトの古い SW が残留して CSS/JS 混線するのを防ぐ
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((reg) => {
        reg.unregister();
        console.info("[SW] unregistered (localhost):", reg.scope);
      });
    });

    // 開発時はキャッシュも全クリア
    if ("caches" in window) {
      caches.keys().then((keys) => {
        keys.forEach((key) => {
          caches.delete(key);
          console.info("[SW] cache cleared:", key);
        });
      });
    }

    return; // localhost では SW を登録しない
  }

  // ── 本番環境: Service Worker を登録 ──
  navigator.serviceWorker
    .register("./sw.js", { scope: "./" })
    .then((reg) => {
      // 新バージョンが待機中なら即座に適用
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            newWorker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    })
    .catch((err) => console.error("[SW] registration failed:", err));
})();
