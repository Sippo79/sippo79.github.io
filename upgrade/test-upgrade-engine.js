/* =====================================================================
 *  アップグレード診断エンジンのテスト
 *  ---------------------------------------------------------------------
 *  実行: node upgrade/test-upgrade-engine.js
 *
 *  このサイトの信頼性は「勧めすぎないこと」に懸かっているため、
 *  テストの主眼も【不要な交換を勧めていないか】に置いている。
 *  性能が足りているのに交換を勧める・未入力なのに問題なしと言い切る、
 *  といった振る舞いはすべて不具合として扱う。
 * ===================================================================== */
'use strict';

var E = require('./upgrade-engine.js');

var passed = 0;
var failed = 0;
var failures = [];

function check(name, condition, extra) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(name + (extra ? '  → ' + extra : ''));
  }
}

function part(result, partName) {
  return result.parts.filter(function (p) { return p.part === partName; })[0];
}

/* ------------------------------------------------------------------
 *  1. 「交換不要」を正しく返せるか（最重要）
 * ------------------------------------------------------------------ */

(function () {
  var r = E.diagnose({
    gpu: 'RTX 4070 SUPER', cpu: 'Ryzen 7 7800X3D',
    memory: 32, memoryType: 'ddr5', storage: 2000, storageType: 'ssd',
    psu: 850, resolution: 'fhd', targetFps: 144, usage: 'normal',
  });
  check('十分な構成では交換不要と判定する', r.overall.verdict === 'keep', r.overall.verdict);
  check('十分な構成では費用0', r.overall.estimatedCost === 0, String(r.overall.estimatedCost));
  check('十分なGPUに交換を勧めない', part(r, 'gpu').status === 'keep', part(r, 'gpu').status);
  check('十分なCPUに交換を勧めない', part(r, 'cpu').status === 'keep', part(r, 'cpu').status);
})();

(function () {
  // 16GBは一般用途では十分。増設を勧めてはいけない。
  var r = E.diagnose({
    gpu: 'RTX 4060', cpu: 'Core i5-13400F',
    memory: 16, memoryType: 'ddr4', storage: 1000, storageType: 'ssd',
    psu: 650, resolution: 'fhd', targetFps: 60, usage: 'normal',
  });
  check('16GB・一般用途では増設を勧めない', part(r, 'memory').status === 'keep', part(r, 'memory').status);
})();

(function () {
  // GPUを替えないなら電源交換も不要（今動いているのだから）
  var r = E.diagnose({
    gpu: 'RTX 4070 SUPER', cpu: 'Ryzen 7 7800X3D',
    memory: 32, memoryType: 'ddr5', storage: 2000, storageType: 'ssd',
    psu: 600, resolution: 'fhd', targetFps: 60, usage: 'normal',
  });
  check('GPU非交換なら電源も交換不要', part(r, 'psu').status === 'keep', part(r, 'psu').status);
})();

/* ------------------------------------------------------------------
 *  2. 押し売り防止（高額GPUを無条件に勧めない）
 * ------------------------------------------------------------------ */

(function () {
  var r = E.diagnose({
    gpu: 'RTX 3060', cpu: 'Ryzen 5 5600X',
    memory: 16, memoryType: 'ddr4', storage: 1000, storageType: 'ssd',
    psu: 650, resolution: 'wqhd', targetFps: 144, usage: 'normal',
  });
  var gpu = part(r, 'gpu');
  check('RTX 3060/WQHD144 で最上位GPUを勧めない',
    gpu.recommendId !== 'rtx5090' && gpu.recommendId !== 'rtx5080', gpu.recommendId);
  check('RTX 3060/WQHD144 の提案は現実的な価格帯',
    !gpu.recommendId || (E.PRICE_HINT[gpu.recommendId] || 0) <= 160000,
    gpu.recommendId + '=' + E.PRICE_HINT[gpu.recommendId]);
})();

(function () {
  // 予算を指定したら必ずその範囲内で提案する
  var budget = 100000;
  var r = E.diagnose({
    gpu: 'RTX 3060', cpu: 'Ryzen 5 5600X',
    memory: 16, memoryType: 'ddr4', storage: 1000, storageType: 'ssd',
    psu: 750, resolution: 'wqhd', targetFps: 144, usage: 'normal',
    budget: budget,
  });
  var gpu = part(r, 'gpu');
  check('予算指定時は予算内のGPUを提案する',
    !gpu.recommendId || (E.PRICE_HINT[gpu.recommendId] || 0) <= budget,
    gpu.recommendId + '=' + E.PRICE_HINT[gpu.recommendId]);
})();

(function () {
  // 目標が過剰な場合、高額GPUを押し付けず目標見直しを提案する
  var r = E.diagnose({
    gpu: 'RTX 3060', cpu: 'Ryzen 7 7800X3D',
    memory: 32, memoryType: 'ddr5', storage: 2000, storageType: 'ssd',
    psu: 1000, resolution: '4k', targetFps: 240, usage: 'heavy',
  });
  var gpu = part(r, 'gpu');
  check('到達不能な目標では交換を断定しない',
    gpu.status === 'consider', gpu.status + '/' + gpu.recommendId);
})();

/* ------------------------------------------------------------------
 *  3. 未入力の扱い（断定しない）
 * ------------------------------------------------------------------ */

(function () {
  var r = E.diagnose({ resolution: 'fhd', targetFps: 60, usage: 'normal' });
  check('全項目未入力では「不要」と断定しない',
    r.overall.verdict === 'insufficient', r.overall.verdict);
  check('全項目未入力では費用を出さない',
    r.overall.estimatedCost === null, String(r.overall.estimatedCost));
})();

(function () {
  var r = E.diagnose({
    gpu: 'RTX 3060', resolution: 'fhd', targetFps: 60, usage: 'normal',
  });
  check('GPUのみ入力では判定を保留する',
    r.overall.verdict === 'insufficient', r.overall.verdict);
  check('未入力項目はunknownsに列挙される',
    r.unknowns.length >= 3, String(r.unknowns.length));
})();

(function () {
  var r = E.diagnose({
    gpu: 'よく分からないGPU', cpu: '不明',
    resolution: 'fhd', targetFps: 60, usage: 'normal',
  });
  check('認識できないGPU名はunknown扱い',
    part(r, 'gpu').status === 'unknown', part(r, 'gpu').status);
  check('認識できない入力でも例外を投げない', true);
})();

/* ------------------------------------------------------------------
 *  4. 買い替え判定
 * ------------------------------------------------------------------ */

(function () {
  var r = E.diagnose({
    gpu: 'GTX 1060 6GB', cpu: 'Ryzen 5 3600',
    memory: 8, memoryType: 'ddr4', storage: 500, storageType: 'hdd',
    psu: 500, resolution: '4k', targetFps: 60, usage: 'heavy',
  });
  check('古い構成×多数交換では買い替えを勧める',
    r.overall.verdict === 'replace', r.overall.verdict);
})();

(function () {
  // 交換1点なら買い替えではなくアップグレード
  var r = E.diagnose({
    gpu: 'RTX 4060 Ti', cpu: 'Core i5-13400F',
    memory: 8, memoryType: 'ddr4', storage: 1000, storageType: 'ssd',
    psu: 650, resolution: 'fhd', targetFps: 60, usage: 'normal',
  });
  check('軽微な不足はアップグレード判定',
    r.overall.verdict === 'upgrade', r.overall.verdict);
  check('メモリ増設のみなら費用は安い',
    r.overall.estimatedCost !== null && r.overall.estimatedCost <= 20000,
    String(r.overall.estimatedCost));
})();

/* ------------------------------------------------------------------
 *  5. 電源の安全判定（事故防止）
 * ------------------------------------------------------------------ */

(function () {
  // 容量不足の電源でGPUを替えるなら、必ず電源交換を促すこと
  var r = E.diagnose({
    gpu: 'RTX 3060', cpu: 'Ryzen 7 5800X3D',
    memory: 32, memoryType: 'ddr4', storage: 2000, storageType: 'ssd',
    psu: 400, resolution: 'wqhd', targetFps: 120, usage: 'normal',
  });
  var gpu = part(r, 'gpu');
  var psu = part(r, 'psu');
  if (gpu.status === 'upgrade') {
    check('GPU交換時に容量不足の電源は交換対象になる',
      psu.status === 'upgrade', psu.status);
    check('電源の必要容量が算出される',
      typeof psu.neededWatt === 'number' && psu.neededWatt > 0, String(psu.neededWatt));
  } else {
    check('（前提）このケースではGPU交換が提案される', false, gpu.status);
  }
})();

(function () {
  // 電源が不明なままGPUを替えるなら「要確認」を出すこと（黙って進めない）
  var r = E.diagnose({
    gpu: 'RTX 3060', cpu: 'Ryzen 7 5800X3D',
    memory: 32, memoryType: 'ddr4', storage: 2000, storageType: 'ssd',
    resolution: 'wqhd', targetFps: 120, usage: 'normal',
  });
  var psu = part(r, 'psu');
  check('電源不明＋GPU交換なら要確認を出す',
    psu.status === 'check', psu.status);
})();

/* ------------------------------------------------------------------
 *  6. 型番の取り違え防止
 * ------------------------------------------------------------------ */

(function () {
  check('RTX 5070 と RTX 5070 Ti を区別する',
    E.resolveKey('RTX 5070', E.GPU_TIERS) === 'rtx5070'
    && E.resolveKey('RTX 5070 Ti', E.GPU_TIERS) === 'rtx5070ti');
  check('ベンダー名付きでも認識する',
    E.resolveKey('NVIDIA GeForce RTX 3060', E.GPU_TIERS) === 'rtx3060');
  check('全角入力でも認識する',
    E.resolveKey('ＲＴＸ　３０６０', E.GPU_TIERS) === 'rtx3060');
  check('メーカー修飾語付きでも認識する',
    E.resolveKey('ASUS TUF RTX 4070 SUPER', E.GPU_TIERS) === 'rtx4070super');
  check('CPUも同様に認識する',
    E.resolveKey('Ryzen 7 5800X3D', E.CPU_TIERS) === 'ryzen75800x3d');
})();

/* ------------------------------------------------------------------
 *  7. 商品マスターとの整合（購入ボタンが出せるか）
 * ------------------------------------------------------------------ */

(function () {
  var master;
  try {
    master = require('../shared/affiliate/affiliate-master.json');
  } catch (e) {
    check('商品マスターを読み込める', false, e.message);
    return;
  }
  var products = master.products || {};

  // エンジンが提案しうるIDは、すべて商品マスターに存在する必要がある。
  // 存在しないと購入ボタンが出せず、提案が行き止まりになる。
  var ids = [
    'rtx5050', 'rtx5060', 'rx9060xt', 'rtx5060ti', 'rtx5070',
    'rx9070', 'rx9070xt', 'rtx5070ti', 'rtx5080', 'rtx5090',
    'ddr4_32gb', 'ddr5_32gb', 'ssd_nvme_1tb',
    'psu_650w', 'psu_750w', 'psu_850w', 'psu_1000w',
  ];
  var missing = ids.filter(function (id) { return !products[id]; });
  check('提案しうる商品IDがすべてマスターに存在する',
    missing.length === 0, missing.join(', '));
})();

/* ------------------------------------------------------------------
 *  8. 異常入力で落ちないこと
 * ------------------------------------------------------------------ */

(function () {
  var weird = [
    undefined, null, {},
    { gpu: '', cpu: '', memory: '', storage: '', psu: '' },
    { gpu: '<script>alert(1)</script>', memory: 'abc', psu: '-500' },
    { gpu: 'RTX 3060', memory: 0, storage: 0, psu: 0 },
    { resolution: 'unknown-res', targetFps: 999, usage: 'nope' },
  ];
  var ok = true;
  var err = '';
  weird.forEach(function (input) {
    try {
      var r = E.diagnose(input);
      if (!r || !r.overall || !r.parts) { ok = false; err = 'returned invalid shape'; }
    } catch (e) {
      ok = false;
      err = e.message;
    }
  });
  check('異常な入力でも例外を投げない', ok, err);
})();


/* ------------------------------------------------------------------
 *  9. 判定情報の充実度（4段階）
 * ------------------------------------------------------------------ */

(function () {
  var r = E.diagnose({ resolution: 'fhd', targetFps: 60, usage: 'normal' });
  check('全未入力では判定情報が「情報不足」',
    r.confidence.level === 1, String(r.confidence.level));
  check('判定情報に「あと何が分かると良いか」が入る',
    r.confidence.missing.length > 0, String(r.confidence.missing.length));
  check('不足項目には理由（benefit）が付く',
    !!(r.confidence.missing[0] && r.confidence.missing[0].benefit));
})();

(function () {
  var r = E.diagnose({
    gpu: 'RTX 3060', cpu: 'Ryzen 5 5600X',
    memory: 16, memoryType: 'ddr4', storage: 1000, storageType: 'ssd',
    psu: 650, resolution: 'wqhd', targetFps: 120, usage: 'normal',
  });
  check('主要項目がそろえば「詳細診断」',
    r.confidence.level === 4, String(r.confidence.level));
  check('そろっていれば不足リストは空',
    r.confidence.missing.length === 0, String(r.confidence.missing.length));
})();

(function () {
  // 精度%のような根拠のない数値を持たせていないこと
  var r = E.diagnose({ gpu: 'RTX 3060', resolution: 'fhd', targetFps: 60, usage: 'normal' });
  var text = JSON.stringify(r.confidence);
  check('判定情報に「%」表記を含めない',
    text.indexOf('%') === -1, text.slice(0, 60));
  check('レベルは4段階に収まる',
    r.confidence.level >= 1 && r.confidence.level <= 4, String(r.confidence.level));
})();

/* ------------------------------------------------------------------
 *  10. 未登録の型番を「問題なし」と誤読させない（重要）
 * ------------------------------------------------------------------ */

(function () {
  // 一覧に無いGPU名を入れると、GPU/CPUの判定ができない。
  // このときメモリ/ストレージ/電源だけが keep になって
  // 「アップグレードは不要」と表示されるのが最も危険な誤り。
  var r = E.diagnose({
    gpu: 'RTX 6090', cpu: '不明なCPU',
    memory: 16, memoryType: 'ddr4', storage: 1000, storageType: 'ssd',
    psu: 850, resolution: 'wqhd', targetFps: 120, usage: 'normal',
  });
  check('GPU/CPUとも不明なら「交換不要」と言わない',
    r.overall.verdict === 'insufficient', r.overall.verdict);
})();

(function () {
  var r = E.diagnose({
    gpu: 'RTX 6090', cpu: 'Ryzen 5 5600X',
    memory: 16, memoryType: 'ddr4', storage: 1000, storageType: 'ssd',
    psu: 850, resolution: 'wqhd', targetFps: 120, usage: 'normal',
  });
  check('GPUが不明なら判定情報は「簡易診断」以下',
    r.confidence.level <= 2, String(r.confidence.level));
})();

(function () {
  // 自由入力が壊れていないこと（未登録でも例外を投げない）
  var ok = true, err = '';
  ['RTX 6090', 'GTX 780 Ti', '謎のGPU', '<script>x</script>'].forEach(function (name) {
    try { E.diagnose({ gpu: name, resolution: 'fhd', targetFps: 60, usage: 'normal' }); }
    catch (e) { ok = false; err = e.message; }
  });
  check('一覧に無い型番でも診断が動く（自由入力の維持）', ok, err);
})();

/* ------------------------------------------------------------------
 *  11. 型番サフィックスの取り違え防止（CPU）
 * ------------------------------------------------------------------ */

(function () {
  check('Ryzen 5 5600 と 5600X を区別する',
    E.resolveKey('Ryzen 5 5600', E.CPU_TIERS) === 'ryzen55600'
    && E.resolveKey('Ryzen 5 5600X', E.CPU_TIERS) === 'ryzen55600x');
  check('5600X と 5600X3D を区別する',
    E.resolveKey('Ryzen 5 5600X3D', E.CPU_TIERS) === 'ryzen55600x3d');
  check('Core i5-12400 と 12400F を区別する',
    E.resolveKey('Core i5-12400', E.CPU_TIERS) === 'corei512400'
    && E.resolveKey('Core i5-12400F', E.CPU_TIERS) === 'corei512400f');
  check('Core i7-14700K と 14700F を区別する',
    E.resolveKey('Core i7-14700K', E.CPU_TIERS) === 'corei714700k'
    && E.resolveKey('Core i7-14700F', E.CPU_TIERS) === 'corei714700f');

  // 登録済みIDがすべて自分自身に解決できること（サフィックス判定の回帰確認）
  var selfBad = [];
  Object.keys(E.CPU_TIERS).forEach(function (k) {
    if (E.resolveKey(k, E.CPU_TIERS) !== k) selfBad.push(k);
  });
  Object.keys(E.GPU_TIERS).forEach(function (k) {
    if (E.resolveKey(k, E.GPU_TIERS) !== k) selfBad.push(k);
  });
  check('登録済みの全型番が自分自身に解決できる',
    selfBad.length === 0, selfBad.join(', '));
})();

/* ------------------------------------------------------------------
 *  12. 商品マスターとオートコンプリート候補の整合
 * ------------------------------------------------------------------ */

(function () {
  var master;
  try { master = require('../shared/affiliate/affiliate-master.json'); }
  catch (e) { check('商品マスターを読み込める', false, e.message); return; }

  var products = master.products || {};
  // オートコンプリートの候補（＝マスターのGPU/CPU）が
  // すべて診断エンジンで認識できること。
  // ここがズレると「候補から選んだのに判定できない」が起きる。
  var bad = [];
  Object.keys(products).forEach(function (id) {
    var p = products[id];
    if (p.category !== 'gpu' && p.category !== 'cpu') return;
    var table = p.category === 'gpu' ? E.GPU_TIERS : E.CPU_TIERS;
    var label = p.shortName || p.name;
    if (!E.resolveKey(label, table)) bad.push(label);
  });
  check('候補に出る全GPU/CPUが診断エンジンで解決できる',
    bad.length === 0, bad.join(', '));
})();

/* ------------------------------------------------------------------
 *  6. GPU推奨の妥当性（過剰推奨をしないこと）
 * ------------------------------------------------------------------
 *  この診断でいちばん壊れやすいのが「高性能GPUを使っている人に、
 *  さらに高額なGPUを勧めてしまう」パターン。
 *  かつては WQHD/144fps/重量級 と入力しただけで
 *  RX 9070 → RTX 5090（約45万円）を勧め、そのまま買い替え判定にまで
 *  落ちていた。同じ壊れ方を二度としないための固定テスト。
 * ------------------------------------------------------------------ */

/** 交換候補として提示されたGPUの価格を返す（提示が無ければ0） */
function recPrice(result) {
  var g = part(result, 'gpu');
  if (!g || !g.recommendId) return 0;
  return E.PRICE_HINT[g.recommendId] || 0;
}

(function () {
  // ケースA：高性能GPU × 予算20万円 → 交換を勧めない
  var r = E.diagnose({
    gpu: 'RX 9070', resolution: 'wqhd', targetFps: 144,
    usage: 'heavy', budget: '200000',
  });
  var g = part(r, 'gpu');
  check('A: RX9070/WQHD144/重量級では交換を勧めない',
    g.status === 'keep', g.status + '/' + g.recommendId);
  check('A: RX9070にGPU交換候補を出さない',
    !g.recommendId, String(g.recommendId));
  check('A: 買い替え判定にならない',
    r.overall.verdict !== 'replace', r.overall.verdict);
})();

(function () {
  // ケースB：ミドル帯 × 予算20万円 → 現実的な候補を出す
  var r = E.diagnose({
    gpu: 'RTX 3060', resolution: 'wqhd', targetFps: 144,
    usage: 'heavy', budget: '200000',
  });
  var g = part(r, 'gpu');
  check('B: RTX3060には交換を提案する',
    g.status === 'upgrade', g.status);
  check('B: 提案GPUは予算内',
    recPrice(r) <= 200000, String(recPrice(r)));
  check('B: 最上位GPUを押し付けない',
    g.recommendId !== 'rtx5090', String(g.recommendId));
})();

(function () {
  // ケースC：明確に性能不足 → はっきり交換を勧める
  var r = E.diagnose({
    gpu: 'GTX 1660 SUPER', resolution: 'wqhd', targetFps: 144,
    usage: 'heavy', budget: '120000',
  });
  var g = part(r, 'gpu');
  check('C: GTX1660SUPERには交換を勧める',
    g.status === 'upgrade', g.status);
  check('C: 提案GPUは予算内',
    recPrice(r) <= 120000, String(recPrice(r)));
  check('C: 十分な性能向上がある候補を選ぶ',
    g.ratio >= 1.5, String(g.ratio));
})();

(function () {
  // ケースD：最上位GPU保有者 → 原則として現状維持
  var r = E.diagnose({
    gpu: 'RTX 4090', resolution: 'wqhd', targetFps: 144, usage: 'heavy',
  });
  var g = part(r, 'gpu');
  check('D: RTX4090には交換を勧めない',
    g.status === 'keep', g.status + '/' + g.recommendId);
})();

(function () {
  // ケースE：4K・重量級・予算なし → ハイエンドも候補になり得る
  var r = E.diagnose({
    gpu: 'RTX 3060', resolution: '4k', targetFps: 144, usage: 'heavy',
  });
  var g = part(r, 'gpu');
  check('E: 4K重量級では交換を提案する',
    g.status === 'upgrade' || g.status === 'consider', g.status);
  check('E: 4K重量級ではハイエンドGPUも候補になる',
    !g.recommendId || E.GPU_TIERS[g.recommendId] >= 90,
    g.recommendId + '=' + E.GPU_TIERS[g.recommendId]);
})();

(function () {
  // 予算が上がるほど提案GPUの性能も上がる（予算が効いていることの確認）。
  // 予算を無視して常に同じGPUを返していないかを見る。
  var base = {
    gpu: 'GTX 1660 SUPER', resolution: 'wqhd', targetFps: 144, usage: 'heavy',
  };
  var tiers = [50000, 80000, 120000, 200000].map(function (b) {
    var i = {};
    for (var k in base) if (base.hasOwnProperty(k)) i[k] = base[k];
    i.budget = String(b);
    var g = part(E.diagnose(i), 'gpu');
    return g.recommendId ? E.GPU_TIERS[g.recommendId] : 0;
  });
  var monotonic = true;
  for (var i = 1; i < tiers.length; i++) {
    if (tiers[i] < tiers[i - 1]) monotonic = false;
  }
  check('予算が増えると提案GPUの性能も下がらない',
    monotonic, tiers.join(' → '));
})();

(function () {
  // 予算が小さすぎて意味のある候補が無いなら、無理に勧めない。
  var r = E.diagnose({
    gpu: 'RX 9070', resolution: 'wqhd', targetFps: 144,
    usage: 'heavy', budget: '30000',
  });
  var g = part(r, 'gpu');
  check('予算内に候補が無ければ交換を勧めない',
    g.status === 'keep', g.status + '/' + g.recommendId);
})();

(function () {
  // 予算指定が無くても、費用対効果が悪い交換は「おすすめ」にしない。
  // RX 9070 → RTX 5080 のように、伸びが小さいのに高額なケース。
  var r = E.diagnose({
    gpu: 'RX 9070 XT', resolution: '4k', targetFps: 120, usage: 'heavy',
  });
  var g = part(r, 'gpu');
  check('費用対効果が悪い交換をupgrade断定しない',
    g.status !== 'upgrade' || g.valueLabel !== 'poor',
    g.status + '/' + g.valueLabel);
})();

(function () {
  // 性能向上が15%未満の交換は候補にすらしない（RX9070 → RX9070XT など）
  var ranked = E.GPU_TIERS;
  var r = E.diagnose({
    gpu: 'RX 9070', resolution: '4k', targetFps: 60, usage: 'heavy',
  });
  var g = part(r, 'gpu');
  var gain = g.recommendId ? ranked[g.recommendId] / ranked.rx9070 : 99;
  check('わずかな性能差のGPUを提案しない',
    gain >= 1.15, g.recommendId + ' gain=' + gain.toFixed(2));
})();

(function () {
  // 高性能GPU保有者が、GPU起因で買い替え判定に落ちないこと。
  // 元の不具合では GPU1点の提案だけで45万円→買い替え推奨になっていた。
  var r = E.diagnose({
    gpu: 'RX 9070', cpu: 'Ryzen 7 7800X3D',
    memory: 32, memoryType: 'ddr5', storage: 2000, storageType: 'ssd',
    psu: 850, resolution: 'wqhd', targetFps: 144, usage: 'heavy',
    budget: '200000',
  });
  check('十分な構成では買い替えを勧めない',
    r.overall.verdict === 'keep', r.overall.verdict);
  check('十分な構成では費用が発生しない',
    !r.overall.estimatedCost, String(r.overall.estimatedCost));
})();

(function () {
  // GPUを交換しないなら、電源交換も要求しないこと（既存挙動の維持）
  var r = E.diagnose({
    gpu: 'RX 9070', cpu: 'Ryzen 7 7800X3D',
    memory: 32, memoryType: 'ddr5', storage: 2000, storageType: 'ssd',
    psu: 550, resolution: 'wqhd', targetFps: 144, usage: 'heavy',
    budget: '200000',
  });
  check('GPU現状維持なら電源交換も求めない',
    part(r, 'psu').status === 'keep', part(r, 'psu').status);
})();

/* ------------------------------------------------------------------
 *  結果
 * ------------------------------------------------------------------ */

console.log('');
console.log('  アップグレード診断エンジン テスト結果');
console.log('  ------------------------------------');
console.log('  成功: ' + passed);
console.log('  失敗: ' + failed);
if (failures.length) {
  console.log('');
  failures.forEach(function (f) { console.log('  ✗ ' + f); });
}
console.log('');

process.exit(failed === 0 ? 0 : 1);
