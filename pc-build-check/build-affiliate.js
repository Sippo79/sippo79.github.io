/**
 * build-affiliate.js
 *
 * PC BUILD CHECK の構成詳細ページ（builds/*.html）に購入導線を出す。
 *
 * 【仕組み】
 *  ページ内のスペック表（.build-spec-list）から CPU / GPU の型番を読み取り、
 *  共通アフィリエイト基盤（shared/affiliate）で商品を特定して購入ボタンを描画する。
 *  → 75ページ分のHTMLに個別のURLを書かなくてよい。商品マスターを1か所
 *    直せば全ページに反映される。
 *
 * 【フェイルセーフ】
 *  商品を特定できない / マスターが読めない場合はセクションごと出さない。
 *  静的HTMLには何も書かないので、JSが動かなくてもページは通常どおり表示される。
 */
(function () {
  'use strict';

  // スペック表のラベル → 購入導線に出すかどうか
  // 誤リンクを避けるため、型番が明確なCPU・GPUだけを対象にする。
  // （「32GB」「2TB NVMe SSD」のような一般名詞は商品を特定できない）
  var TARGET_LABELS = [
    { match: /^CPU$/, label: 'CPU' },
    { match: /^GPU/, label: 'GPU' },
  ];

  /** スペック表から対象パーツを読み取る */
  function collectPartsFromSpecList() {
    var list = document.querySelector('.build-spec-list');
    if (!list) return [];

    var items = [];
    var rows = list.querySelectorAll('li');

    Array.prototype.forEach.call(rows, function (row) {
      var keyEl = row.querySelector('.spec-key');
      var valEl = row.querySelector('.spec-val');
      if (!keyEl || !valEl) return;

      var key = (keyEl.textContent || '').trim();
      var value = (valEl.textContent || '').trim();
      if (!value) return;

      for (var i = 0; i < TARGET_LABELS.length; i++) {
        if (TARGET_LABELS[i].match.test(key)) {
          items.push({ label: TARGET_LABELS[i].label, name: value });
          return;
        }
      }
    });

    return items;
  }

  /** 購入導線セクションを組み立てて挿入する */
  function render(html) {
    // スペック表のカードの直後に置く
    // （スペックを見た直後＝価格を知りたくなるタイミング）
    var specCard = document.querySelector('.build-spec-list');
    var anchor = specCard ? specCard.closest('.build-card') : null;
    if (!anchor || !anchor.parentNode) return;

    var section = document.createElement('section');
    section.className = 'build-card build-affiliate-card';
    section.innerHTML =
      '<p class="section-label">Shop Links</p>'
      + '<h2>この構成のパーツの価格を見る</h2>'
      + html;

    anchor.parentNode.insertBefore(section, anchor.nextSibling);
  }

  function init() {
    if (!window.SippoAffiliate) return;

    var items = collectPartsFromSpecList();
    if (items.length === 0) return;

    window.SippoAffiliate.init()
      .then(function (ready) {
        if (!ready) return;

        var html = window.SippoAffiliate.renderProductList(items, {
          page: 'pc-build-check-build',
          placement: 'build-detail-spec',
        });

        // 特定できた商品が無ければ何も挿入しない
        if (html) render(html);
      })
      .catch(function () {
        /* 購入導線は「おまけ」。失敗してもページ本体には影響させない */
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
