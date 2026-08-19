/* =====================================================================
 *  パーツ別ページの購入ボタン描画 (upgrade-products.js)
 *  ---------------------------------------------------------------------
 *  生成ページ（/upgrade/gpu/ など）にある
 *    <div id="productList" data-products="rtx5060,rtx5070">
 *  を読み取り、共通アフィリエイト基盤で購入ボタンを描画する。
 *
 *  リンクの組み立て・ID管理・リンク切れ対応・計測はすべて
 *  shared/affiliate/affiliate.js に任せる（独自実装を作らない）。
 *
 *  商品が特定できない場合、共通基盤は空文字を返す。
 *  そのときは見出しごと隠して、空の枠が残らないようにする。
 * ===================================================================== */
(function (global) {
  'use strict';

  var doc = global.document;
  if (!doc) return;

  var box = doc.getElementById('productList');
  if (!box) return;

  var ids = String(box.getAttribute('data-products') || '')
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);

  if (!ids.length) return;

  var A = global.SippoAffiliate;
  if (!A) return;

  function render() {
    var html = '';

    ids.forEach(function (id) {
      var product = A.getProduct(id);
      if (!product) return;

      var buttons = A.renderAffiliateButtons(id, {
        page: 'upgrade',
        placement: 'part-page-product',
        disclosure: false, // 広告表記はフッターに1回だけ出している
      });
      // 購入リンクを出せない商品は、カードごと出さない
      if (!buttons) return;

      html += '<div class="u-card" style="margin-bottom:14px">'
        + '<h3 style="font-size:16px;margin-bottom:10px">' + escapeHtml(product.name) + '</h3>'
        + buttons
        + '</div>';
    });

    if (!html) {
      // 1件も出せなかった場合は、セクションごと隠す。
      // 「おすすめパーツ」という見出しだけが残るのは不自然なため。
      var section = box.closest ? box.closest('.u-section') : null;
      if (section) section.style.display = 'none';
      return;
    }

    box.innerHTML = html;
    A.bindTracking();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 商品マスターの読み込みに失敗しても、ページ自体は壊さない
  A.init().then(render, function () {
    var section = box.closest ? box.closest('.u-section') : null;
    if (section) section.style.display = 'none';
  });
})(typeof window !== 'undefined' ? window : this);
