/* ==========================================================
   シッポPC相談室 — main.js
   外部ライブラリ不要。スクロール出現アニメ + 仮ボタンの案内のみ。
   ※ 将来：申し込みフォーム連携・計測タグはここに追加していく。
   ========================================================== */

(function () {
  'use strict';

  /* --------------------------------------------------------
     ① スクロールで .reveal 要素をふわっと表示
     -------------------------------------------------------- */
  function initReveal() {
    var targets = document.querySelectorAll('.reveal');
    if (!targets.length) return;

    // IntersectionObserver 非対応環境ではそのまま全表示
    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

    targets.forEach(function (el) { observer.observe(el); });
  }

  /* --------------------------------------------------------
     ② 同セクション内のカードを少しずつ遅らせて表示
     -------------------------------------------------------- */
  function initStagger() {
    var groups = document.querySelectorAll(
      '.worry-grid, .service-grid, .diag-grid, .case-grid, ' +
      '.prepare-grid, .flow-list, .cannot-grid, .note-grid'
    );
    groups.forEach(function (group) {
      var items = group.querySelectorAll('.reveal');
      items.forEach(function (el, i) {
        el.style.transitionDelay = (i * 70) + 'ms';
      });
    });
  }

  /* --------------------------------------------------------
     ③ 仮リンク（受付準備中）クリック時の案内
        ※ 正式フォーム実装時にこのブロックを差し替える
     -------------------------------------------------------- */
  function initPlaceholderLinks() {
    var links = document.querySelectorAll('.apply a[href="#"]');
    links.forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        alert('現在は受付準備中です。\n無料モニターの募集を開始したら、こちらでご案内します。');
      });
    });
  }

  /* --------------------------------------------------------
     ④ ヘッダー内リンクのスムーズスクロール補助
        （CSS scroll-behavior があるブラウザでは基本不要だが、
         sticky ヘッダー分のズレ防止に軽く補助）
     -------------------------------------------------------- */
  function initSmoothAnchors() {
    var anchors = document.querySelectorAll('a[href^="#"]:not([href="#"])');
    anchors.forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href');
        var target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', id);
      });
    });
  }

  /* --------------------------------------------------------
     初期化
     -------------------------------------------------------- */
  function init() {
    initStagger();
    initReveal();
    initPlaceholderLinks();
    initSmoothAnchors();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
