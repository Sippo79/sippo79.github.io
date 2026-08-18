/* =====================================================================
 *  シッポPC 共通アップグレード提案モジュール (affiliate-recommend.js)
 *  ---------------------------------------------------------------------
 *  「今のPC → 交換推奨パーツ → Amazon / 楽天 → 必要なら有料相談」
 *  という導線を、どのサイトからでも同じ形で出せるようにするモジュール。
 *
 *  今回の対象:
 *    - PC BUILD CHECK の診断結果（現在のGPU → おすすめアップグレード）
 *    - PC相談サイトの相談結果（おすすめパーツの提示）
 *  今後の対象:
 *    - 「ゲーミングPCアップグレード相談」ページ（新規予定）
 *
 *  依存: shared/affiliate/affiliate.js（SippoAffiliate）
 *        先に読み込んでおくこと。
 *
 *  【使い方】
 *    SippoAffiliate.init().then(function () {
 *      box.innerHTML = SippoRecommend.renderUpgrade({
 *        currentGpu: 'RTX 3060',
 *        page: 'pc-consult',
 *        placement: 'upgrade-result'
 *      });
 *    });
 * ===================================================================== */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------
   *  GPUの世代・性能の目安（アップグレード提案の判断に使う）
   *  数値は「だいたいの相対性能」。厳密なベンチマークではなく、
   *  「どれくらい変わるか」を★で示すためのラフな目安として使う。
   * ------------------------------------------------------------------ */
  var GPU_TIERS = {
    // エントリー
    gtx1650: 20, gtx1660: 26, gtx1660super: 29, gtx1660ti: 30,
    rtx2060: 34, rtx3050: 32, rx6600: 38, rx570: 16, rx580: 19,
    // ミドル
    rtx2070: 40, rtx2070super: 44, rtx3060: 42, rtx3060ti: 52,
    rx6600xt: 45, rx6650xt: 47, rx6700: 50, rx6700xt: 55, rx7600: 48,
    rtx4060: 50, rtx4060ti: 57,
    // ミドルハイ
    rtx2080: 48, rtx2080ti: 58, rtx3070: 58, rtx3070ti: 62, rtx3080: 70,
    rx6750xt: 60, rx6800xt: 70, rx7700xt: 63, rx7800xt: 72,
    rtx4070: 68, rtx4070super: 76, rtx5050: 44, rtx5060: 60, rtx5060ti: 68,
    // ハイエンド
    rtx3080ti: 76, rtx3090: 78, rtx4070tisuper: 84, rtx4080super: 92,
    rx7900gre: 78, rx7900xt: 86, rx7900xtx: 94, rx9070: 84, rx9070xt: 90,
    rtx5070: 82, rtx5070ti: 91, rtx5080: 100, rtx5090: 125,
  };

  /**
   * アップグレード先の候補（新しい世代を優先して並べる）。
   * 現行世代を上から順に見て、十分な性能向上が見込めるものを選ぶ。
   */
  var UPGRADE_CANDIDATES = [
    'rtx5060',   // 60
    'rtx5060ti', // 68
    'rtx5070',   // 82
    'rx9070',    // 84
    'rx9070xt',  // 90
    'rtx5070ti', // 91
    'rtx5080',   // 100
    'rtx5090',   // 125
  ];

  /** 期待できる改善度を★で表す（1〜5） */
  function ratingStars(ratio) {
    var stars;
    if (ratio >= 2.5) stars = 5;
    else if (ratio >= 1.9) stars = 4;
    else if (ratio >= 1.5) stars = 3;
    else if (ratio >= 1.25) stars = 2;
    else stars = 1;
    return {
      count: stars,
      text: new Array(stars + 1).join('★') + new Array(6 - stars).join('☆'),
    };
  }

  /** 改善度の説明文 */
  function ratingLabel(stars) {
    if (stars >= 5) return '大幅に快適になります（解像度や画質を1段階上げられる目安）';
    if (stars >= 4) return 'はっきり違いを感じられます';
    if (stars >= 3) return '体感できる差があります';
    if (stars >= 2) return 'やや快適になります';
    return '差は小さめです。買い替えの効果は限定的かもしれません';
  }

  /**
   * 現在のGPUから、おすすめのアップグレード先を1つ選ぶ。
   *
   * @param {string} currentGpuName - 現在のGPU名（表記ゆれ可）
   * @param {Object} [options] - { minRatio: number } 最低何倍の性能向上を求めるか
   * @returns {Object|null} { currentId, currentName, currentTier,
   *                          recommendedId, recommendedName, ratio, rating }
   */
  function suggestGpuUpgrade(currentGpuName, options) {
    var A = global.SippoAffiliate;
    if (!A || !A.isReady()) return null;

    var opts = options || {};
    // これ未満の性能向上なら勧めない。買い替えても体感差が小さく、
    // 「★2つ」のような弱い提案を出すとかえって信用を落とすため。
    var minRatio = opts.minRatio || 1.5;

    var currentId = A.findProductIdByName(currentGpuName);
    if (!currentId) return null;

    var currentTier = GPU_TIERS[currentId];
    if (!currentTier) return null;

    // すでに十分high-endなGPUには買い替えを勧めない。
    // 例: RTX 4070 SUPER のような現役の上位GPUに RTX 5090 を勧めると
    //     「高いものを売りたいだけ」に見えるし、実際おすすめでもない。
    //     この場合は「提案なし（null）」が正しい答え。
    // t62以上（RTX 3070 Ti / RTX 3080 / RX 6800 XT / RTX 4070 クラス）は
    // 現役として十分速い。ここに RTX 5090 を勧めると押し売りになるので
    // 「提案なし」を正解とする。
    var enoughTier = opts.enoughTier || 62;
    if (currentTier >= enoughTier) return null;

    // 候補のうち「minRatio を満たす中で最も控えめなもの」を選ぶ。
    // 予算感を無視して最上位を勧めないための、いちばん重要なルール。
    //
    // minRatio を満たす候補が1つも無い場合（＝現行GPUが古すぎて、
    // 一番下の候補でも倍率が足りない…ということは起きないが、
    // 逆に現行が速すぎて全部足りない場合）は提案しない。
    // 【候補の選び方】
    // 「性能が currentTier の minRatio 倍以上」を満たす候補のうち、
    // いちばん性能が低いもの＝いちばん安いものを選ぶ。
    //
    // 倍率の上限（maxRatio）は設けない。上限を付けると、古いGPU
    // （RX 570 など倍率がどうしても大きくなる人）に何も提案できなく
    // なってしまうため。「最も控えめな候補を選ぶ」というルール自体が
    // 勧めすぎの歯止めになっている。
    //
    // 一方、現行GPUが速すぎて控えめな候補が全部 minRatio に届かない
    // 場合は、上の enoughTier で先に弾いている。
    var best = null;
    for (var i = 0; i < UPGRADE_CANDIDATES.length; i++) {
      var id = UPGRADE_CANDIDATES[i];
      var tier = GPU_TIERS[id];
      if (!tier) continue;

      var ratio = tier / currentTier;
      if (ratio < minRatio) continue;

      var product = A.getProduct(id);
      if (!product) continue;

      // 購入リンクが出せないものは勧めても意味がない
      if (A.getAffiliateLinks(id).length === 0) continue;

      // より控えめ（tierが低い）候補を優先して選ぶ
      if (!best || tier < best.tier) {
        best = { id: id, tier: tier, ratio: ratio, product: product };
      }
    }

    // 適切な候補が無い＝「今は買い替えどきではない」。
    // 無理に何かを勧めるより、提案しない方が正しい。
    if (!best) return null;

    var rating = ratingStars(best.ratio);
    var currentProduct = A.getProduct(currentId);

    return {
      currentId: currentId,
      currentName: currentProduct ? currentProduct.name : currentGpuName,
      currentTier: currentTier,
      recommendedId: best.id,
      recommendedName: best.product.name,
      ratio: best.ratio,
      rating: rating,
      ratingLabel: ratingLabel(rating.count),
    };
  }

  /** HTML特殊文字をエスケープする */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * アップグレード提案カードのHTMLを返す。
   *
   *   現在のGPU        RTX 3060
   *   おすすめ          RTX 5070
   *   期待できる改善    ★★★★★
   *   [Amazonで見る] [楽天市場で見る]
   *
   * 提案できない場合（現在のGPUを特定できない・十分な向上が無い等）は
   * 空文字を返す。呼び出し側はそのまま innerHTML に入れてよい。
   *
   * @param {Object} params
   *   currentGpu {string} 現在のGPU名
   *   page       {string} 計測用のページ識別子
   *   placement  {string} 計測用の掲載位置（既定 'upgrade-result'）
   *   heading    {string} 見出し（省略可）
   * @returns {string} HTML
   */
  function renderUpgrade(params) {
    var p = params || {};
    var A = global.SippoAffiliate;
    if (!A || !A.isReady()) return '';

    var suggestion = suggestGpuUpgrade(p.currentGpu, { minRatio: p.minRatio });
    if (!suggestion) return '';

    var buttons = A.renderAffiliateButtons(suggestion.recommendedId, {
      page: p.page || '',
      placement: p.placement || 'upgrade-result',
      disclosure: false, // カード下部に1回だけ出す
    });
    if (!buttons) return '';

    return '<div class="sippo-upgrade" data-affiliate-block="1">'
      + (p.heading ? '<p class="sippo-upgrade-heading">' + esc(p.heading) + '</p>' : '')
      + '<div class="sippo-upgrade-grid">'
      + '<div class="sippo-upgrade-item">'
      + '<span class="sippo-upgrade-label">今のGPU</span>'
      + '<strong class="sippo-upgrade-value">' + esc(suggestion.currentName) + '</strong>'
      + '</div>'
      + '<div class="sippo-upgrade-arrow" aria-hidden="true">→</div>'
      + '<div class="sippo-upgrade-item sippo-upgrade-item-rec">'
      + '<span class="sippo-upgrade-label">おすすめアップグレード</span>'
      + '<strong class="sippo-upgrade-value">' + esc(suggestion.recommendedName) + '</strong>'
      + '</div>'
      + '</div>'
      + '<p class="sippo-upgrade-rating">'
      + '<span class="sippo-upgrade-label">期待できる改善</span> '
      + '<span class="sippo-upgrade-stars" aria-label="5段階中' + suggestion.rating.count + '">'
      + esc(suggestion.rating.text) + '</span> '
      + '<span class="sippo-upgrade-note">' + esc(suggestion.ratingLabel) + '</span>'
      + '</p>'
      + buttons
      + '<p class="sippo-aff-disclosure">' + esc(A.getDisclosureText()) + '</p>'
      + '</div>';
  }

  /**
   * 相談結果などで「おすすめパーツ一覧」を出すための薄いラッパー。
   * 中身は SippoAffiliate.renderProductList と同じ。
   *
   *   SippoRecommend.renderRecommendedParts([
   *     { label: 'おすすめGPU', name: 'GeForce RTX 5070' },
   *     { label: 'おすすめ電源', id: 'psu_750w' }
   *   ], { page: 'pc-consult', placement: 'consult-result' })
   */
  function renderRecommendedParts(items, options) {
    var A = global.SippoAffiliate;
    if (!A || !A.isReady()) return '';
    return A.renderProductList(items, options || {});
  }

  global.SippoRecommend = {
    suggestGpuUpgrade: suggestGpuUpgrade,
    renderUpgrade: renderUpgrade,
    renderRecommendedParts: renderRecommendedParts,
    // 参照・拡張用
    GPU_TIERS: GPU_TIERS,
    UPGRADE_CANDIDATES: UPGRADE_CANDIDATES,
  };
})(typeof window !== 'undefined' ? window : this);
