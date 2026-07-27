/* ==========================================================
   シッポPC相談室 — main.js
   外部ライブラリ不要。スクロール出現アニメ + 仮ボタンの案内
   + 申し込みリンクのクリック計測（GA4）。
   ※ GA4タグ（gtag.js）自体はまだ未設置。設置後に自動で送信が始まる。
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
        alert('このボタンは準備中です。\n500円ワンコイン相談の受付フォームから、お気軽にご相談ください。');
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
     ⑤ 申し込みリンクのクリック計測（GA4）
        対象は data-track を持つリンクのみ。
        イベント名 = data-track / 掲載位置 = data-location。
        ※ GA4タグ（gtag.js）は未設置。設置されるまでこの処理は
          何も送らずに黙って終了する（エラーにしない）。
        ※ preventDefault はしない。外部リンクの通常遷移
          （target="_blank" での新規タブ）を妨げないこと。
     -------------------------------------------------------- */
  function initClickTracking() {
    var links = document.querySelectorAll('a[data-track]');

    links.forEach(function (link) {
      // 同じリンクへの二重登録を防ぐ（初期化が複数回走っても1回だけ）
      if (link.dataset.trackBound === '1') return;
      link.dataset.trackBound = '1';

      link.addEventListener('click', function () {
        // 計測は「おまけ」。何があっても遷移や他の処理を止めない。
        try {
          if (typeof window.gtag !== 'function') return;

          var eventName = link.getAttribute('data-track');
          if (!eventName) return;

          window.gtag('event', eventName, {
            service_location: link.getAttribute('data-location') || '',
            link_url: link.href,
            link_text: (link.textContent || '').trim(),
            page_path: window.location.pathname
          });
        } catch (err) {
          /* 計測失敗は無視（遷移を優先） */
        }
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
    initClickTracking();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
