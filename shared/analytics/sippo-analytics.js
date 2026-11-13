/* =====================================================================
 *  SippoPC 共通 GA4 読み込み（全サービス共通・このファイルだけで設定する）
 *
 *  各ページの <head> に次の1行だけを書く（gtag.js のタグを直接書かない）:
 *    <script src="/shared/analytics/sippo-analytics.js"></script>
 *
 *  役割
 *   1. 測定ID（MEASUREMENT_ID）をこの1か所で管理する
 *   2. 本番ドメイン（sippo-pc.jp / www.sippo-pc.jp）以外では Google へ何も送らない
 *      （ローカル開発・プレビュー・file:// の操作が本番データに混ざらない）
 *   3. page_view に content_group（サービス名）を付ける → サービス単位で分析できる
 *   4. URL のフラグメント（#…）とトークン類のクエリを page_location から取り除く
 *      （PC Builds Hub のパスワード再設定などで認証情報が送られないように）
 *   5. イベントのパラメータから個人情報らしい値（メールアドレス等）を取り除く
 *   6. サイト内の「相談室へのリンク」「別サービスへのリンク」のクリックを計測する
 *      （アフィリエイトリンク・data-track 付きリンクは既存の計測があるので二重に送らない）
 *
 *  既存コードは今まで通り window.gtag('event', …) を呼べばよい（gtag はここで定義する）。
 *  ⚠️ このファイルを変えたら、キャッシュ優先で配る Service Worker の版を上げること
 *     （pc-build-check/sw.js・gpu-guide/sw.js・game-pc-guide/sw.js）。
 *  ⚠️ 測定ID（G-…）は公開してよい値。GA4 Data API 用のサービスアカウント鍵（JSON）とは別物で、
 *     鍵はこのリポジトリに絶対に置かない（_control/secrets/ のみ）。
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.SippoAnalytics) return; // 二重読み込みでも1回だけ動かす

  var MEASUREMENT_ID = 'G-NDQ8GTKGHC';
  var PROD_HOSTS = ['sippo-pc.jp', 'www.sippo-pc.jp'];

  /* パス接頭辞 → サービスID（shared/nav/sippo-nav.js の SERVICES・_control/lib/services.js と同じID） */
  var SERVICES = [
    ['/gpu-guide/', 'gpu-guide'], ['/pc-build-check/', 'pc-build-check'], ['/game-pc-guide/', 'game-pc-guide'],
    ['/pc-builder/', 'pc-builder'], ['/upgrade/', 'upgrade'], ['/pc-builds-hub/', 'pc-builds-hub'], ['/pc-consult/', 'pc-consult'],
  ];
  function serviceOf(pathname) {
    var p = String(pathname || '/');
    for (var i = 0; i < SERVICES.length; i++) {
      var pre = SERVICES[i][0];
      if (p === pre.slice(0, -1) || p.indexOf(pre) === 0) return SERVICES[i][1];
    }
    return p === '/' || p === '/index.html' ? 'home' : 'other';
  }

  /* ---------- 送ってはいけない情報を除く ---------- */
  var SENSITIVE_QUERY = /^(code|token|access_token|refresh_token|id_token|provider_token|type|email|mail|password|pass|key|apikey|api_key|session|sid|state|error_description)$/i;
  var SENSITIVE_KEY = /(e?mail|password|passwd|token|secret|phone|tel|address|user_?name|full_?name)/i;
  var EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

  function cleanUrl(href) {
    try {
      var u = new URL(href);
      u.hash = '';
      var drop = [];
      u.searchParams.forEach(function (v, k) { if (SENSITIVE_QUERY.test(k) || EMAIL.test(v)) drop.push(k); });
      drop.forEach(function (k) { u.searchParams.delete(k); });
      return u.toString();
    } catch (e) {
      return String(href || '').split('#')[0].split('?')[0];
    }
  }

  function cleanParams(p) {
    if (!p || typeof p !== 'object') return p;
    var out = {}; var n = 0;
    for (var k in p) {
      if (!Object.prototype.hasOwnProperty.call(p, k)) continue;
      if (SENSITIVE_KEY.test(k)) continue;
      var v = p[k];
      if (typeof v === 'string') {
        if (EMAIL.test(v)) continue;
        if (/^(link_url|page_location|page_referrer)$/.test(k)) v = cleanUrl(v);
        if (v.length > 100) v = v.slice(0, 100); // GA4 のパラメータ値の上限
      } else if (v !== null && typeof v === 'object') {
        continue; // 入れ子のオブジェクトは送らない
      }
      out[k] = v;
      if (++n >= 25) break; // GA4 の1イベントあたり上限
    }
    return out;
  }

  /* ---------- 送信してよい環境か ---------- */
  function storage(key, value) {
    try {
      if (value === undefined) return global.localStorage.getItem(key);
      if (value === null) global.localStorage.removeItem(key); else global.localStorage.setItem(key, value);
    } catch (e) { /* 保存できない環境では無視 */ }
    return null;
  }
  var loc = global.location || {};
  // 運営者の確認用：?sippo_ga=off で以後このブラウザの計測を止める（?sippo_ga=on で戻す）
  try {
    var flag = new URLSearchParams(loc.search || '').get('sippo_ga');
    if (flag === 'off') storage('sippo-ga-optout', '1');
    if (flag === 'on') storage('sippo-ga-optout', null);
    if (flag === 'debug') storage('sippo-ga-debug', '1');
    if (flag === 'nodebug') storage('sippo-ga-debug', null);
  } catch (e) { /* 古いブラウザは無視 */ }

  // 本番ドメインなら http でも計測する（GitHub Pages の「Enforce HTTPS」が未設定で http のまま表示されるため。
  // https だけにすると http で来た訪問が計測から漏れる。ドメインで判定するのでローカル・github.io は送らない）
  var isProdHost = (loc.protocol === 'https:' || loc.protocol === 'http:') && PROD_HOSTS.indexOf(loc.hostname) >= 0;
  var optedOut = storage('sippo-ga-optout') === '1';
  var debug = storage('sippo-ga-debug') === '1';
  var enabled = isProdHost && !optedOut;
  var service = serviceOf(loc.pathname);

  /* ---------- gtag（既存コードが呼ぶ関数） ---------- */
  global.dataLayer = global.dataLayer || [];
  function gtag() {
    var a = arguments;
    if (a[0] === 'event' && a[2]) a[2] = cleanParams(a[2]);
    if (!enabled) {
      if (debug && global.console) global.console.debug('[SippoAnalytics:送信しません]', Array.prototype.slice.call(a));
      return;
    }
    global.dataLayer.push(a);
  }
  global.gtag = gtag;

  if (enabled) {
    var s = global.document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
    (global.document.head || global.document.documentElement).appendChild(s);
    gtag('js', new Date());
    var cfg = { content_group: service, page_location: cleanUrl(loc.href) };
    if (global.document.referrer) cfg.page_referrer = cleanUrl(global.document.referrer);
    if (debug) cfg.debug_mode = true; // GA4 の DebugView で確認するとき（?sippo_ga=debug）
    gtag('config', MEASUREMENT_ID, cfg);
  }

  /* ---------- サイト内導線のクリック ---------- */
  function placementOf(a) {
    var el = a.closest && a.closest('[data-track-placement]');
    if (el) return String(el.getAttribute('data-track-placement')).slice(0, 40);
    if (a.closest) {
      if (a.closest('[data-sippo-servicenav]')) return 'service_nav';
      if (a.closest('header')) return 'header';
      if (a.closest('footer')) return 'footer';
      if (a.closest('nav')) return 'nav';
      var sec = a.closest('section[id], article[id], div[id]');
      if (sec) return String(sec.id).slice(0, 40);
    }
    return 'body';
  }

  function onClick(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    // 既存の計測があるリンクは送らない（二重計測の防止）
    if (a.hasAttribute('data-affiliate-track') || a.hasAttribute('data-track') || a.hasAttribute('data-no-track')) return;
    var u;
    try { u = new URL(a.getAttribute('href'), loc.href); } catch (err) { return; }
    var host = u.hostname.replace(/^www\./, '');
    if (host !== 'sippo-pc.jp' && u.hostname !== loc.hostname) return; // 外部リンクは GA4 の拡張計測（click）に任せる
    var to = serviceOf(u.pathname);
    if (to === 'pc-consult' && service !== 'pc-consult') {
      gtag('event', 'consult_cta_click', { from_service: service, placement: placementOf(a), link_path: u.pathname });
    } else if (to !== service && to !== 'other') {
      gtag('event', 'cross_service_click', { from_service: service, to_service: to, placement: placementOf(a) });
    }
  }
  if (global.document && global.document.addEventListener) global.document.addEventListener('click', onClick, true);

  /* ---------- 各サービスのスクリプトから使う計測 ---------- */
  global.SippoAnalytics = {
    measurementId: MEASUREMENT_ID,
    enabled: enabled,
    service: service,
    /** 計測は「おまけ」。失敗しても画面の動作を止めない */
    track: function (name, params) {
      try { if (/^[a-z][a-z0-9_]{0,39}$/.test(name)) gtag('event', name, params || {}); } catch (e) { /* 無視 */ }
    },
    // テスト用
    _serviceOf: serviceOf, _cleanUrl: cleanUrl, _cleanParams: cleanParams,
  };
})(typeof window !== 'undefined' ? window : this);
