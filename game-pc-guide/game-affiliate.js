/**
 * game-affiliate.js
 *
 * ゲーム別ページ（games/*.html）の購入導線を描画する。
 *
 * 【この版での変更点】
 *  - 旧版は `../../●共通/affiliate/affiliate-master.json` を読もうとしていたが、
 *    そのパスは実在しない（正しくは shared/affiliate/）。そのため全ボタンが
 *    常に「準備中」表示のままだった。
 *  - 共通アフィリエイト基盤 SippoAffiliate（shared/affiliate/affiliate.js）
 *    へ移行し、パス解決とリンク生成をそちらへ任せる。
 *
 * 【表示するもの】
 *  data/games.json の各ゲームの推奨構成（builds）から GPU と CPU を拾い、
 *  商品マスターで特定できたものだけ購入ボタンを出す。
 *  広告だらけにしないため、1ページに出すのは最大4件まで。
 *
 * 【フェイルセーフ】
 *  商品マスターが読めない／商品を特定できない場合はセクションごと非表示。
 *  壊れたボタンや「準備中」の空ボタンは出さない。
 */
(function () {
  'use strict';

  // monster-hunter.html → mhwilds のような例外マッピング
  var FILENAME_TO_ID = {
    'monster-hunter': 'mhwilds',
  };

  // 1ページに出す購入ボタンの上限（広告だらけにしない）
  var MAX_ITEMS = 4;

  /** ページのファイル名から gameId を導出する */
  function getGameId() {
    var filename = location.pathname
      .split('/')
      .pop()
      .replace(/\.html$/, '');
    return FILENAME_TO_ID[filename] || filename;
  }

  /** HTML 特殊文字をエスケープして XSS を防ぐ */
  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * ゲームデータの推奨構成から、購入導線に出すパーツを組み立てる。
   * 同じパーツが複数の構成に出てきても1回だけにする。
   */
  function collectParts(game) {
    var A = window.SippoAffiliate;
    var items = [];
    var seen = {};

    function push(label, name) {
      if (!name) return;
      var id = A.findProductIdByName(name);
      // 商品を特定できないものは出さない（誤リンク防止）
      if (!id || seen[id]) return;
      seen[id] = true;
      items.push({ id: id, label: label });
    }

    var builds = Array.isArray(game.builds) ? game.builds : [];

    // GPU を優先（購入検討で最も見られるパーツ）
    builds.forEach(function (build) {
      push(build.name ? build.name + '構成のGPU' : 'GPU', build.gpu);
    });
    // 次に CPU
    builds.forEach(function (build) {
      push(build.name ? build.name + '構成のCPU' : 'CPU', build.cpu);
    });

    return items.slice(0, MAX_ITEMS);
  }

  /** 購入セクションを描画する */
  function renderSection(section, game) {
    var A = window.SippoAffiliate;
    var items = collectParts(game);

    var html = A.renderProductList(items, {
      page: 'game-pc-guide',
      placement: 'game-recommended-parts',
    });

    // 出せる商品が1件も無ければセクションごと消す（空の枠を残さない）
    if (!html) {
      section.remove();
      return;
    }

    section.innerHTML =
      '<div class="affiliate-heading">'
      + '<p class="section-label">SHOP LINKS</p>'
      + '<h2 id="affiliateTitle">' + esc(game.title || 'このゲーム') + ' 向けパーツの価格を見る</h2>'
      + '<p>上のおすすめ構成で挙げたパーツの、実際の販売価格を確認できます。価格は変動するため各ショップでご確認ください。</p>'
      + '</div>'
      + html;

    // JS 描画済みマークを付与 → CSS の自動非表示ルールから除外される
    section.setAttribute('data-affiliate', 'loaded');
  }

  /** メイン処理 */
  function init() {
    var section = document.querySelector('.affiliate-section');
    if (!section) return;

    // 共通基盤が読み込まれていなければ、セクションを消して終わり
    if (!window.SippoAffiliate) {
      section.remove();
      return;
    }

    var gameId = getGameId();

    Promise.all([
      window.SippoAffiliate.init(),
      fetch('../data/games.json')
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .catch(function (err) {
          console.warn('[game-affiliate] games.json を取得できませんでした:', err.message);
          return null;
        }),
    ])
      .then(function (results) {
        var affiliateReady = results[0];
        var games = results[1];

        if (!affiliateReady || !Array.isArray(games)) {
          section.remove();
          return;
        }

        var game = games.filter(function (g) { return g.id === gameId; })[0];
        if (!game) {
          section.remove();
          return;
        }

        renderSection(section, game);
      })
      .catch(function (err) {
        // 何があってもページ本体は壊さない
        console.warn('[game-affiliate] 購入導線の描画に失敗しました:', err && err.message);
        section.remove();
      });
  }

  // DOM 構築後に実行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
