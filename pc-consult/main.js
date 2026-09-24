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
     ⑥ PC BUILD CHECK からの引き継ぎ（相談メモ）
        /pc-consult/?from=pc-build-check&b=25&u=fps&r=wqhd で来たとき、
        診断された構成を builds.json から引いて、コピーできる文章にする。
        ・申し込みフォームは外部サービスなので自動入力はしない（できない）。
        ・URLの値はそのまま画面に出さない。builds.json に実在する構成に
          一致したときだけ表示し、表示は textContent / value で入れる。
        ・CPU/GPU名をこのファイルに持たない（構成の正は builds.json）。
     -------------------------------------------------------- */
  function initBuildCheckMemo() {
    var box = document.getElementById('bc-memo');
    if (!box || !window.URLSearchParams || !window.fetch) return;
    var params = new URLSearchParams(window.location.search);
    if (params.get('from') !== 'pc-build-check') return;

    var man = Number(params.get('b'));
    var usage = params.get('u') || '';
    var resolution = params.get('r') || '';
    if (!Number.isFinite(man) || man <= 0 || !/^[a-z]+$/.test(usage) || !/^[a-z0-9]+$/.test(resolution)) return;

    fetch('/pc-build-check/builds.json')
      .then(function (res) { return res.ok ? res.text() : ''; })
      .then(function (text) {
        var builds = JSON.parse(String(text || '[]').replace(/^﻿/, ''));
        var build = null;
        for (var i = 0; i < builds.length; i += 1) {
          var b = builds[i];
          if (Number(b.budget) === man * 10000 && b.usage === usage && b.resolution === resolution) { build = b; break; }
        }
        if (!build) return;
        renderBuildCheckMemo(box, build, man, usage, resolution);
      })
      .catch(function () { /* 取得できなければ何も出さない（申し込みには影響させない） */ });
  }

  function renderBuildCheckMemo(box, build, man, usage, resolution) {
    var diagnoseUrl = 'https://sippo-pc.jp/pc-build-check/?b=' + man +
      '&u=' + encodeURIComponent(usage) + '&r=' + encodeURIComponent(resolution);
    var memo = [
      '【PC BUILD CHECKの診断結果】',
      '構成：' + build.title,
      '予算：' + man + '万円前後',
      'CPU：' + build.cpu,
      'GPU：' + build.gpu,
      'メモリ：' + build.ram,
      'SSD：' + build.storage,
      '診断URL：' + diagnoseUrl,
      '',
      '【相談したいこと】',
      '（例：この構成で買って大丈夫か／近いBTOモデルの選び方／予算を下げても大丈夫か）'
    ].join('\n');

    var head = document.createElement('p');
    head.className = 'bc-memo__head';
    head.textContent = '🐾 PC BUILD CHECKの診断内容を引き継ぎました';

    var lead = document.createElement('p');
    lead.className = 'bc-memo__lead';
    lead.textContent = '下の「相談メモ」をコピーして、申し込み後のフォームに貼り付けてください。構成から相談したい場合は1,500円の「ゲーム向けPC構成・購入相談」、この構成に近いBTOモデルを見つけた場合は500円の購入前チェックがおすすめです。';

    var area = document.createElement('textarea');
    area.className = 'bc-memo__text';
    area.readOnly = true;
    area.rows = 9;
    area.value = memo;
    area.setAttribute('aria-label', '相談メモ（コピーして使えます）');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--primary bc-memo__copy';
    btn.textContent = '相談メモをコピー';
    btn.addEventListener('click', function () {
      var done = function () {
        btn.textContent = 'コピーしました ✓';
        setTimeout(function () { btn.textContent = '相談メモをコピー'; }, 2400);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(memo).then(done, function () { area.select(); });
      } else {
        area.select();
        try { document.execCommand('copy'); done(); } catch (e) { /* 手動コピーしてもらう */ }
      }
      try {
        if (typeof window.gtag === 'function') {
          window.gtag('event', 'consult_memo_copy', { from: 'pc-build-check', budget: String(man), usage: usage, resolution: resolution });
        }
      } catch (err) { /* 計測失敗は無視 */ }
    });

    box.appendChild(head);
    box.appendChild(lead);
    box.appendChild(area);
    box.appendChild(btn);
    box.hidden = false;
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
    initBuildCheckMemo();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
