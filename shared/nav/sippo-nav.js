/* =====================================================================
 *  シッポPC 共通サービスナビ (sippo-nav.js)
 *  ---------------------------------------------------------------------
 *  サイトが増えるたびに各ページのヘッダー・フッターへ「関連サイトボタン」を
 *  手で足していく運用をやめ、サービス一覧を【この1ファイルだけ】で管理する。
 *
 *  【解決したい問題】
 *    - 子サイトのヘッダーには「Sippoに相談」1本しか無く、他サービスへは
 *      ページ最下部の「関連サイト」カードまでスクロールしないと行けない。
 *    - その関連サイトカードが各サイトで別々に手書きされており、サービスが
 *      増えるたびに全ページを直す必要がある（実際 /upgrade/ 追加で発生）。
 *    - 「今どのサイトを見ているのか」がユーザーに分からない。
 *
 *  【設計方針】
 *    - サービス定義は SERVICES 配列ただ1つ。ここに足せば全サイトに出る。
 *    - "サービス名" ではなく "やりたいこと"（action）を主見出しにする。
 *      ユーザーは「GPU GUIDE」を探しているのではなく「GPUを調べたい」ため。
 *    - 現在地は data-sippo-site 属性で判定し、リンクではなく現在地表示にする。
 *    - 依存ライブラリなし。既存CSSに干渉しないよう全クラスを sippo-svcnav-
 *      接頭辞で統一する。
 *    - JSが動かなくても致命傷にならないよう、各ページのフッターには
 *      静的なリンクを残す（このナビは"上乗せ"であって唯一の導線ではない）。
 *
 *  【使い方】
 *    <link rel="stylesheet" href="/shared/nav/sippo-nav.css">
 *    <script src="/shared/nav/sippo-nav.js" defer></script>
 *    <body data-sippo-site="upgrade">           ← 現在地（省略時は自動判定）
 *      <div data-sippo-servicenav></div>        ← ここに描画される
 *
 *  マウント先が無い場合は何もしない（既存ページを壊さない）。
 * ===================================================================== */
(function (global) {
  'use strict';

  var doc = global.document;
  if (!doc) return;

  /* ------------------------------------------------------------------
   *  サービス定義 ★ サイトを追加したらここに1件足すだけ
   * ------------------------------------------------------------------
   *   id     … data-sippo-site の値 / 現在地判定キー
   *   action … ユーザーの「やりたいこと」（メニューの主見出し）
   *   name   … 正式なサービス名（補助表示）
   *   desc   … 一言説明
   *   url    … ディレクトリURL（末尾スラッシュ。サイト内リンクは絶対パス）
   *   match  … 現在地の自動判定に使うパスの接頭辞
   * ------------------------------------------------------------------ */
  var SERVICES = [
    {
      id: 'home',
      action: 'シッポPCのトップ',
      name: 'シッポPC',
      desc: 'PC選び・診断・相談の入口',
      url: '/',
      match: null, // ルートは前方一致だと全部に当たるので個別扱い
      icon: '🐾',
    },
    {
      id: 'pc-build-check',
      action: 'PCを選ぶ・構成を診断する',
      name: 'PC BUILD CHECK',
      desc: '予算・用途・解像度からおすすめ構成を診断',
      url: '/pc-build-check/',
      match: '/pc-build-check/',
      icon: '🧩',
    },
    {
      id: 'game-pc-guide',
      action: 'ゲームに合うPCを調べる',
      name: 'GAME PC GUIDE',
      desc: '遊びたいゲームから必要スペックを逆引き',
      url: '/game-pc-guide/',
      match: '/game-pc-guide/',
      icon: '🎮',
    },
    {
      id: 'gpu-guide',
      action: 'GPU（グラボ）を比較する',
      name: 'GPU GUIDE',
      desc: 'GPUの性能・価格帯・用途別の比較',
      url: '/gpu-guide/',
      match: '/gpu-guide/',
      icon: '📊',
    },
    {
      id: 'upgrade',
      action: '今のPCをアップグレードする',
      name: 'PC UPGRADE',
      desc: '交換すべきパーツと買い替え時期を診断',
      url: '/upgrade/',
      match: '/upgrade/',
      icon: '⚡',
      isNew: true,
    },
    {
      id: 'pc-builds-hub',
      action: 'みんなのPC構成を見る',
      name: 'PC構成投稿サイト',
      desc: '実際のPC構成を投稿・閲覧できる',
      url: '/pc-builds-hub/',
      match: '/pc-builds-hub/',
      icon: '🗂️',
    },
    {
      id: 'pc-consult',
      action: 'PCについて相談する',
      name: 'シッポPC相談室',
      desc: '購入前チェック・構成相談',
      url: '/pc-consult/',
      match: '/pc-consult/',
      icon: '💬',
      isCta: true,
    },
  ];

  /** HTML特殊文字をエスケープする（定義は自前だが将来の可変化に備える） */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * 現在どのサービスを見ているかを判定する。
   * 1. <body data-sippo-site="..."> が最優先（明示指定）
   * 2. 無ければ URL のパスから推定
   */
  function detectCurrentSite() {
    var explicit = doc.body && doc.body.getAttribute('data-sippo-site');
    if (explicit) return explicit;

    var path = global.location && global.location.pathname ? global.location.pathname : '/';
    for (var i = 0; i < SERVICES.length; i++) {
      var m = SERVICES[i].match;
      if (m && path.indexOf(m) === 0) return SERVICES[i].id;
    }
    // どれにも当たらなければ親サイト扱い
    return 'home';
  }

  /** ドロップダウン内の1項目を組み立てる */
  function renderItem(service, isCurrent) {
    var cls = 'sippo-svcnav__item';
    if (isCurrent) cls += ' is-current';
    if (service.isCta) cls += ' sippo-svcnav__item--cta';

    // 現在地はリンクにしない（自分自身へのリンクは導線として無意味なため）
    var tag = isCurrent ? 'span' : 'a';
    var href = isCurrent ? '' : ' href="' + esc(service.url) + '"';
    var current = isCurrent ? ' aria-current="page"' : '';

    return '<' + tag + href + current + ' class="' + cls + '" role="menuitem">'
      + '<span class="sippo-svcnav__icon" aria-hidden="true">' + esc(service.icon) + '</span>'
      + '<span class="sippo-svcnav__text">'
      + '<span class="sippo-svcnav__action">' + esc(service.action)
      + (service.isNew ? '<span class="sippo-svcnav__badge">NEW</span>' : '')
      + (isCurrent ? '<span class="sippo-svcnav__here">表示中</span>' : '')
      + '</span>'
      + '<span class="sippo-svcnav__name">' + esc(service.name) + '</span>'
      + '<span class="sippo-svcnav__desc">' + esc(service.desc) + '</span>'
      + '</span>'
      + '</' + tag + '>';
  }

  /** ナビ全体のHTMLを組み立てる */
  function buildHtml(currentId) {
    var currentService = null;
    for (var i = 0; i < SERVICES.length; i++) {
      if (SERVICES[i].id === currentId) currentService = SERVICES[i];
    }
    var label = currentService ? currentService.name : 'シッポPC';

    var items = '';
    for (var j = 0; j < SERVICES.length; j++) {
      items += renderItem(SERVICES[j], SERVICES[j].id === currentId);
    }

    return ''
      + '<div class="sippo-svcnav">'
      + '<button type="button" class="sippo-svcnav__toggle" aria-expanded="false" aria-haspopup="true">'
      + '<span class="sippo-svcnav__toggle-label">サービス</span>'
      + '<span class="sippo-svcnav__toggle-current">' + esc(label) + '</span>'
      + '<span class="sippo-svcnav__caret" aria-hidden="true"></span>'
      + '</button>'
      + '<div class="sippo-svcnav__panel" role="menu" hidden>'
      + '<p class="sippo-svcnav__heading">やりたいことから選ぶ</p>'
      + items
      + '</div>'
      + '</div>';
  }

  /** 開閉の挙動を配線する */
  function bind(root) {
    var toggle = root.querySelector('.sippo-svcnav__toggle');
    var panel = root.querySelector('.sippo-svcnav__panel');
    if (!toggle || !panel) return;

    function open() {
      panel.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      root.classList.add('is-open');
    }
    function close() {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      root.classList.remove('is-open');
    }

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      if (panel.hidden) open(); else close();
    });

    // 外側クリックで閉じる
    doc.addEventListener('click', function (e) {
      if (panel.hidden) return;
      if (!root.contains(e.target)) close();
    });

    // Escで閉じる（キーボード操作でも閉じ込められないように）
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) {
        close();
        toggle.focus();
      }
    });
  }

  /** マウント先すべてに描画する */
  function mount() {
    var targets = doc.querySelectorAll('[data-sippo-servicenav]');
    if (!targets.length) return;

    var currentId = detectCurrentSite();
    var html = buildHtml(currentId);

    for (var i = 0; i < targets.length; i++) {
      // 二重描画を防ぐ（他のスクリプトが再実行しても安全にする）
      if (targets[i].getAttribute('data-sippo-servicenav-ready') === '1') continue;
      targets[i].innerHTML = html;
      targets[i].setAttribute('data-sippo-servicenav-ready', '1');
      var root = targets[i].querySelector('.sippo-svcnav');
      if (root) bind(root);
    }
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  /* 外部から参照したい場合に備えて公開（サービス一覧の再利用など） */
  global.SippoNav = {
    services: SERVICES,
    getCurrentSite: detectCurrentSite,
    mount: mount,
  };
})(typeof window !== 'undefined' ? window : this);
