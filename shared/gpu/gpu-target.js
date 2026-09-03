/* =====================================================================
 *  シッポPC 共通 GPU解像度適性 (shared/gpu/gpu-target.js)
 *  ---------------------------------------------------------------------
 *  GPUの「主な用途としてどの解像度を狙えるか」を、性能指数から一意に決める。
 *
 *  【解決したい問題】
 *   gpus.json の `target` は手入力で、決め方が文書化されていなかった。
 *   その結果、同じ性能でも入力した時期によって基準がズレていた。
 *
 *     現行GPU: FHD上限 raster 68 / WQHD下限 raster 70
 *     中古GPU: FHD上限 raster 55 / WQHD下限 raster 50
 *
 *   実例として RTX 5060 Ti (raster 68) が FHD、
 *   同じ raster 68 の RX 6800 が WQHD になっていた。
 *   `target` は PC BUILD CHECK の「解像度が足りない」警告の唯一の根拠なので、
 *   このズレはそのまま診断結果の誤りになる。
 *
 *  【なぜ rasterScore だけで決めるか】
 *   候補を3案比較した:
 *     案A  rasterScore のみ
 *     案B  rasterScore + VRAMガード
 *     案C  rasterScore + featureScore + VRAM
 *   実データで検証したところ、
 *     - VRAM 8GB未満のGPUは rasterScore だけで既に全てFHDに落ちる
 *     - 案Bは案Aと**結果が1件も変わらない**（ガードが機能しない）
 *     - VRAMは現状のtargetを説明できない。実際 RTX 5060 Ti(16GB) が FHD で
 *       RTX 4070(12GB) が WQHD と、VRAMが多い方が下の判定になっていた
 *   複雑にしても精度が上がらないうえ、ユーザーに説明できなくなる。
 *   よって**単純で一貫した基準**を採る。
 *   VRAM不足は target を下げるのではなく、
 *   長所・注意点（generate-gpu-pages.js の derivedCons）で個別に伝える。
 *
 *  【market / 世代を判定に使わない理由】
 *   「中古だからWQHD」「新世代だからFHD」は説明不能な差になる。
 *   market は購入判断の軸であって、GPUの解像度性能とは別物。
 *   世代の機能差は featureScore と注意点で表現する。
 *
 *  【target の意味】★「出力できる最大解像度」ではない
 *   RTX 3060 でも4K出力自体はできるが、それを4K向けGPUとは呼ばない。
 *   ここでの target は **そのGPUを選ぶときの主なゲーム用途** を指す。
 *     FHD  … 最新ゲームをフルHDで現実的に狙える性能帯
 *     WQHD … WQHDを主用途として検討しやすい性能帯
 *     4K   … 4Kを主用途として検討できる性能帯
 *
 *  【閾値の決め方】
 *   rasterScore は外部ベンチマークではなくサイト独自指数（Phase 4で確認済み）。
 *   そのため「絶対的に正しい閾値」は存在しない。
 *   実データの分布から、
 *     - 境界に張り付くGPUが最も少ない（＝1点差で判定が変わる不自然さが小さい）
 *     - 既存データからの変更が過大にならない
 *   点を選んだ。候補比較の結果 WQHD>=65 / 4K>=85 を採用（境界±1のGPUが最少）。
 *
 *  【使い方】
 *   ブラウザ: <script src="/shared/gpu/gpu-target.js"></script>
 *             SippoGpuTarget.deriveTarget(gpu)
 *   Node    : require('../shared/gpu/gpu-target.js').deriveTarget(gpu)
 *
 *  ★閾値を変えるときはここだけを直す。
 *    gpus.json の target が derived と一致することは
 *    gpu-guide/test-gpu-data.js が全件検証している。
 * ===================================================================== */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SippoGpuTarget = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* 解像度の重さ順。大小比較にのみ使う（間隔に意味は無い）。 */
  var RESOLUTION_LEVELS = { fhd: 1, wqhd: 2, '4k': 3 };

  /* rasterScore の閾値。この値以上でその解像度帯とみなす。 */
  var THRESHOLDS = {
    WQHD: 65,
    '4K': 85,
  };

  /* 各targetの意味（表示・説明に使う） */
  var TARGET_MEANING = {
    FHD: '最新ゲームをフルHDで現実的に狙える性能帯',
    WQHD: 'WQHDを主用途として検討しやすい性能帯',
    '4K': '4Kを主用途として検討できる性能帯',
  };

  /**
   * GPUの解像度適性を性能指数から導く。
   * @param {object} gpu gpus.json のレコード
   * @returns {'FHD'|'WQHD'|'4K'}
   */
  function deriveTarget(gpu) {
    var raster = Number(gpu && gpu.rasterScore);
    if (!Number.isFinite(raster)) return 'FHD';
    if (raster >= THRESHOLDS['4K']) return '4K';
    if (raster >= THRESHOLDS.WQHD) return 'WQHD';
    return 'FHD';
  }

  /** "FHD" / "fhd" のどちらでも同じレベル値にする */
  function getResolutionLevel(value) {
    if (!value) return null;
    var key = String(value).toLowerCase().trim();
    return Object.prototype.hasOwnProperty.call(RESOLUTION_LEVELS, key)
      ? RESOLUTION_LEVELS[key]
      : null;
  }

  /** そのtargetがどういう意味かの一文 */
  function describeTarget(target) {
    return TARGET_MEANING[target] || '';
  }

  /**
   * この target と判定された理由を説明する一文。
   * ユーザーに「なぜWQHD向けなのか」を説明できるようにするため。
   */
  function explainTarget(gpu) {
    var t = deriveTarget(gpu);
    var raster = Number(gpu && gpu.rasterScore);
    if (t === '4K') {
      return 'ゲーム性能スコア' + raster + 'は、4Kを主用途として検討できる水準（' +
        THRESHOLDS['4K'] + '以上）です。';
    }
    if (t === 'WQHD') {
      return 'ゲーム性能スコア' + raster + 'は、WQHDを主用途として検討しやすい水準（' +
        THRESHOLDS.WQHD + '以上）です。';
    }
    return 'ゲーム性能スコア' + raster + 'は、フルHDを主用途とする水準（' +
      THRESHOLDS.WQHD + '未満）です。';
  }

  return {
    RESOLUTION_LEVELS: RESOLUTION_LEVELS,
    THRESHOLDS: THRESHOLDS,
    TARGET_MEANING: TARGET_MEANING,
    deriveTarget: deriveTarget,
    getResolutionLevel: getResolutionLevel,
    describeTarget: describeTarget,
    explainTarget: explainTarget,
  };
});
