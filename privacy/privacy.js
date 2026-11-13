/* プライバシーポリシー（/privacy/）のページ用スクリプト。
 * 親サイトの /script.js はトップページ専用の処理（マスコット画像の相対パス読み込み等）を含み、
 * このページで読むと /privacy/assets/... への 404 が出るため読まない。必要な2つの動きだけをここに持つ：
 *   1. ヘッダー：スクロールしたら背景を付ける／スマホのメニュー開閉（/script.js と同じクラス名・挙動）
 *   2. このブラウザでのアクセス解析の状態表示
 * 計測の停止・再開そのものは /shared/analytics/sippo-analytics.js が ?sippo_ga=off / on で行う（ボタンはそのURLへのリンク）。 */
(function () {
  'use strict';

  /* ---------- 1. ヘッダー ---------- */
  var header = document.getElementById('header');
  var ticking = false;
  function onScroll() {
    ticking = false;
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 24);
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  var toggle = document.getElementById('navToggle');
  var menu = document.getElementById('navMenu');
  if (toggle && menu) {
    var setMenu = function (open) {
      menu.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
      document.body.style.overflow = open ? 'hidden' : '';
    };
    toggle.addEventListener('click', function () { setMenu(!menu.classList.contains('is-open')); });
    menu.addEventListener('click', function (e) {
      if (e.target === menu || (e.target.closest && e.target.closest('a'))) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) { setMenu(false); toggle.focus(); }
    });
    if (window.matchMedia) {
      var mq = window.matchMedia('(max-width: 820px)');
      var reset = function (e) { if (!e.matches) setMenu(false); };
      if (mq.addEventListener) mq.addEventListener('change', reset); else if (mq.addListener) mq.addListener(reset);
    }
  }

  /* ---------- 2. 計測の状態 ---------- */
  var el = document.getElementById('gaStatus');
  if (el) {
    var off = false;
    try { off = window.localStorage.getItem('sippo-ga-optout') === '1'; } catch (e) { /* 保存できない環境 */ }
    el.textContent = off
      ? 'このブラウザでの計測の状態：停止中（当サイトはこのブラウザから Google アナリティクスへ送信しません）'
      : 'このブラウザでの計測の状態：計測中';
  }
})();
