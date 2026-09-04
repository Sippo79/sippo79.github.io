/*
 * shared/parts/build-price.js
 *
 * PC BUILD CHECK の「構成参考価格」を計算する唯一の場所。
 *
 * 設計方針
 *  - 価格の内訳は shared/parts/part-prices.json（CPU/メモリ/ストレージ/マザボ/BTO上乗せ）と
 *    gpu-guide/gpus.json（GPU価格）の2つだけを情報源にする。ここに数値を直接書かない。
 *  - 出すのは「同等構成のBTO完成品の実売目安」。パーツ個別購入の合計ではない。
 *    サイトの予算選択肢（10万円前後〜）はBTO実売価格帯を指しているため、それに合わせる。
 *  - 同じ計算を診断画面（script.js）と静的75ページ（generate-builds.ps1）の両方から呼ぶ。
 *    片方だけ直すと表示が食い違うので、ロジックをコピペしないこと。
 *  - 出せない値は出さない。パーツ価格が1つでも欠けたら null を返し、
 *    呼び出し側は「参考価格を表示しない」を選ぶ。それらしい概算を捏造しない。
 *  - ここが返すのは実売価格の目安であって特定商品の販売価格ではない。表示側は必ず変動注意を添える。
 *
 * ブラウザでは <script> で読み込むと window.SippoBuildPrice に生える。
 * Node（テスト・静的生成）では require() できる。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SippoBuildPrice = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- 正規化 ---------- */

  // GPU名の表記ゆれ（GeForce有無・全角・余分な空白）を吸収して突き合わせる。
  // gpu-links.js と同じ考え方で、曖昧一致はしない。
  function normalizeGpuName(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/[！-～]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
      })
      .replace(/\b(geforce|radeon|nvidia|amd)\b/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  /* ---------- 各パーツの価格取得 ---------- */

  function lookupGpuPrice(gpuName, gpuList) {
    if (!Array.isArray(gpuList)) return null;
    var key = normalizeGpuName(gpuName);
    if (!key) return null;
    for (var i = 0; i < gpuList.length; i += 1) {
      var gpu = gpuList[i];
      if (normalizeGpuName(gpu && gpu.name) !== key) continue;
      var price = Number(gpu.price);
      return Number.isFinite(price) && price > 0 ? price : null;
    }
    return null;
  }

  function entryPrice(entry) {
    if (!entry) return null;
    var price = Number(entry.price);
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  /* ---------- 本体 ---------- */

  /**
   * 1構成の参考価格を計算する。
   *
   * @param {object} build     builds.json の1件
   * @param {object} options   { prices: part-prices.json, gpuList: gpus.json }
   * @returns {object|null}    { total, breakdown, missing, updated } / 計算不能なら null
   */
  function calculateBuildEstimate(build, options) {
    if (!build) return null;
    var opts = options || {};
    var prices = opts.prices;
    if (!prices) return null;

    var memoryType =
      (build.motherboardGuide && build.motherboardGuide.memoryType) || "";
    var socket = (build.motherboardGuide && build.motherboardGuide.socket) || "";

    var memoryTable = prices.memory && prices.memory[memoryType];

    var parts = [
      { key: "cpu", label: "CPU", detail: build.cpu, price: entryPrice(prices.cpu && prices.cpu[build.cpu]) },
      { key: "gpu", label: "GPU", detail: build.gpu, price: lookupGpuPrice(build.gpu, opts.gpuList) },
      { key: "motherboard", label: "マザーボード", detail: socket + " 対応", price: entryPrice(prices.motherboard && prices.motherboard[socket]) },
      { key: "memory", label: "メモリ", detail: memoryType + " " + build.ram, price: entryPrice(memoryTable && memoryTable[build.ram]) },
      { key: "storage", label: "ストレージ", detail: build.storage, price: entryPrice(prices.storage && prices.storage[build.storage]) },
      // ケース・電源・CPUクーラー・OS・組立をまとめたBTO完成品の上乗せ分。
      // 個別パーツとして並べると「自分で買い揃える合計」に見えてしまうので1項目にする。
      { key: "btoOverhead", label: "ケース・電源・冷却・OSなど", detail: "BTO完成品に含まれる分", price: entryPrice(prices.btoOverhead) },
    ];

    var missing = parts.filter(function (p) { return p.price === null; }).map(function (p) { return p.key; });
    // 1つでも欠けたら概算を出さない。欠けたまま合計すると必ず安く見える。
    if (missing.length) return { total: null, breakdown: parts, missing: missing, updated: null };

    var total = parts.reduce(function (sum, p) { return sum + p.price; }, 0);

    return {
      total: total,
      breakdown: parts,
      missing: [],
      updated: (prices._meta && prices._meta.updated) || null,
    };
  }

  /* ---------- 表示用 ---------- */

  // 万円単位に丸めた見出し用テキスト。「約24万円」のように幅を持たせて読ませる。
  // 1円単位まで出すと固定価格に見えるので、意図的に粗くする。
  function formatEstimate(total) {
    if (!Number.isFinite(total) || total <= 0) return null;
    var man = total / 10000;
    // 1万円未満は切り上げず四捨五入。20.4万→約20万、20.6万→約21万。
    return "約" + Math.round(man) + "万円";
  }

  function formatYen(value) {
    if (!Number.isFinite(value)) return "";
    return value.toLocaleString("ja-JP") + "円";
  }

  var PRICE_DISCLAIMER =
    "※価格は販売店・時期によって変動します。同等構成のBTO完成品のおおよその価格帯を示す目安で、特定商品の販売価格ではありません。";

  /* ---------- 予算との突き合わせ ---------- */

  // 予算選択肢は「10万円前後」という表記なので、多少の幅は想定内。
  // ここを超えたら「前後」では説明できない、という線を1か所で定義する。
  // OVER_TOLERANCE=0.15 は 10万円→11.5万円。数値の根拠は下記。
  //   ・75構成の乖離を実測したところ、20万/25万帯の中央値は +6% / -6% で、
  //     価格モデルとしては妥当な範囲に収まっていた。
  //   ・一方、選択予算に対して +15% を超える構成は、
  //     「前後」と言い張るには苦しい額（10万円選択で11.5万円超）になる。
  var OVER_TOLERANCE = 0.15;

  /**
   * 参考価格が選択予算に収まっているかを判定する。
   * 収まらない場合に構成を作り替えるのではなく、事実として伝えるための材料を返す。
   *
   * @returns {object|null} { total, budget, diff, ratio, isOver, text }
   */
  function evaluateBudgetFit(total, budget) {
    var bd = Number(budget);
    if (!Number.isFinite(total) || !Number.isFinite(bd) || bd <= 0) return null;
    var diff = total - bd;
    var ratio = diff / bd;
    var isOver = ratio > OVER_TOLERANCE;
    return {
      total: total,
      budget: bd,
      diff: diff,
      ratio: ratio,
      isOver: isOver,
      // 予算を超えるときだけ文言を出す。収まっているときに
      // 「予算内です」と言い切ると、価格変動で簡単に嘘になる。
      text: isOver
        ? "この構成の参考価格は" +
          formatEstimate(total) +
          "で、選んだ予算（" +
          Math.round(bd / 10000) +
          "万円前後）を上回ります。この条件を満たすには、もう少し予算が必要です。"
        : null,
    };
  }

  return {
    calculateBuildEstimate: calculateBuildEstimate,
    evaluateBudgetFit: evaluateBudgetFit,
    formatEstimate: formatEstimate,
    formatYen: formatYen,
    normalizeGpuName: normalizeGpuName,
    OVER_TOLERANCE: OVER_TOLERANCE,
    PRICE_DISCLAIMER: PRICE_DISCLAIMER,
  };
});
