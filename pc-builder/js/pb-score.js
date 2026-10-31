/* =====================================================================
 *  Sippo PC BUILDER  性能スコア (pb-score.js)
 *  ---------------------------------------------------------------------
 *  5角形グラフの5項目（ゲーム / 動画編集 / 配信 / 拡張性 / コスパ）を
 *  0〜100点で計算する純粋なロジック層。式と定数はすべてこのファイルにあり、
 *  pc-builder/README.md に同じ内容を文章で記録している。
 *
 *  【スコアの種類（grade）】
 *    calc     … 必要な値がそろい、式どおりに計算できた
 *    estimate … 参考値。一部の値が無い／推定モデルを含む（理由を reasons に入れる）
 *    na       … 評価不可。根拠となる値が足りないので点数を作らない
 *
 *  【大前提】
 *   - 性能の材料は Sippo の既存指数（GPU GUIDE の rasterScore、
 *     upgrade-engine.js の CPU_TIERS）と、パーツの公式スペックだけ。
 *   - これらは実測FPSではない。「構成どうしを比べるための相対値」。
 *   - 固定値・感覚で点を付けない。値が無ければ na にする。
 * ===================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SippoPBScore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------- 定数（変更したら README も直す） ---------------- */
  var C = {
    // ゲーム: GPU の rasterScore が解像度の基準値ちょうどのとき 75 点
    GPU_POINT_AT_REF: 75,
    // ゲーム: CPU_TIERS の基準値（高解像度ほど CPU の影響は小さいので基準を下げる）
    CPU_REF: { fhd: 60, wqhd: 50, '4k': 40 },
    // ゲーム: ボトルネック（低い方）を重く見る配分
    BOTTLENECK_MIN_W: 0.7,
    // ゲーム: メモリ・VRAM 不足の係数
    MEM_UNDER_16_FACTOR: 0.85,
    VRAM_RULES: { wqhd: [{ under: 8, factor: 0.9 }], '4k': [{ under: 8, factor: 0.8 }, { under: 12, factor: 0.9 }] },
    // マルチスレッド指数: (Pコア × SMT係数 + Eコア × 0.5) × 最大クロック
    SMT_FACTOR: 1.25,
    E_CORE_FACTOR: 0.5,
    MT_REF: 16 * 1.25 * 5.7, // 16コア32スレッド・5.7GHz を 100 点（約114）
    // 動画編集の配分
    VIDEO_W: { cpu: 0.55, gpu: 0.25, ram: 0.20 },
    // 配信の配分
    STREAM_W: { enc: 0.35, game: 0.30, cpu: 0.20, ram: 0.15 },
    ENCODER_POINTS: { h264: 50, hevc: 20, av1: 30 },
    // 拡張性の配分
    EXPAND_W: { mem: 0.2, m2: 0.2, sata: 0.1, pcie: 0.1, bays: 0.1, fans: 0.1, psu: 0.2 },
    // コスパ: 性能 ÷ 価格(万円) がこの値で 100 点
    CP_REF: 5.0,
    // コスパ: 価格がこの割合だけ上下したときの点数も出す（価格変動の影響を見せる）
    CP_SENSITIVITY: 0.1,
    CP_SENSITIVITY_STEPS: [0.1, 0.3, 0.5],
    // 評価不可にする欠損割合（重みの合計）
    NA_MISSING_WEIGHT: 0.4,
  };

  var CAT_JA = { cpu: 'CPU', gpu: 'GPU', gpuboard: 'グラボ製品', motherboard: 'マザーボード', memory: 'メモリ' };

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function clamp(v) { return Math.max(0, Math.min(100, v)); }
  function round(v) { return Math.round(v); }

  function first(build, db, cat) {
    var e = ((build && build.items && build.items[cat]) || [])[0];
    return e ? db.byId[e.id] || null : null;
  }
  function all(build, db, cat) {
    return ((build && build.items && build.items[cat]) || []).map(function (e) {
      return { part: db.byId[e.id] || null, qty: Math.max(1, Math.floor(Number(e.qty) || 1)) };
    }).filter(function (x) { return x.part; });
  }

  /** 重み付き平均。値が null の要素は除外し、欠損の重みが大きければ null を返す */
  function weighted(components) {
    var sum = 0, wsum = 0, missingW = 0, missing = [];
    components.forEach(function (c) {
      if (isNum(c.v)) { sum += c.v * c.w; wsum += c.w; }
      else { missingW += c.w; missing.push(c.label); }
    });
    var total = wsum + missingW;
    if (!wsum || missingW / total > C.NA_MISSING_WEIGHT) return { score: null, missing: missing };
    return { score: sum / wsum, missing: missing };
  }

  /* ---------------- 部品ごとの指数 ---------------- */

  function gpuResScore(gpu, db, res) {
    if (!gpu || !isNum(gpu.specs.raster)) return null;
    var ref = db.resolutionRef[res];
    return clamp(gpu.specs.raster / ref * C.GPU_POINT_AT_REF);
  }

  function cpuResScore(cpu, res) {
    if (!cpu || !isNum(cpu.specs.gameTier)) return null;
    return clamp(cpu.specs.gameTier / C.CPU_REF[res] * C.GPU_POINT_AT_REF);
  }

  /** マルチスレッド指数（公式スペックからの推定モデル）。値が足りなければ null */
  function cpuMtIndex(cpu) {
    if (!cpu) return null;
    var s = cpu.specs || {};
    // AMD はコアの種類が1つ（P/Eの区別なし）なので cores をそのまま使う
    var p = isNum(s.pCores) ? s.pCores : (cpu.maker === 'AMD' && isNum(s.cores) ? s.cores : null);
    var e = isNum(s.eCores) ? s.eCores : (cpu.maker === 'AMD' ? 0 : null);
    if (!isNum(p) || !isNum(e) || !isNum(s.boostGHz) || !isNum(s.threads)) return null;
    var smt = s.threads > p + e ? C.SMT_FACTOR : 1;
    return (p * smt + e * C.E_CORE_FACTOR) * s.boostGHz;
  }

  function cpuMtScore(cpu) {
    var mt = cpuMtIndex(cpu);
    return mt == null ? null : clamp(mt / C.MT_REF * 100);
  }

  function memoryGB(build, db) {
    var m = all(build, db, 'memory')[0];
    if (!m || !isNum(m.part.specs.capacityGB)) return null;
    return m.part.specs.capacityGB * m.qty;
  }

  function ramScore(gb) {
    if (!isNum(gb) || gb <= 0) return null;
    return clamp(20 + Math.log(gb / 8) / Math.LN2 * 30); // 8GB=20 / 16GB=50 / 32GB=80 / 64GB=100
  }

  function encoderScore(gpu) {
    if (!gpu || !Array.isArray(gpu.specs.encoder)) return null;
    var s = 0;
    gpu.specs.encoder.forEach(function (c) { s += C.ENCODER_POINTS[c] || 0; });
    return clamp(s);
  }

  /* ---------------- 5項目 ---------------- */

  function gameScore(build, db, res) {
    var cpu = first(build, db, 'cpu'), gpu = first(build, db, 'gpu');
    var reasons = [];
    if (!cpu) return { score: null, grade: 'na', reasons: ['CPUが未選択です'] };
    if (!gpu) return { score: null, grade: 'na', reasons: ['GPUなし（内蔵GPU）の性能データはSippoに未登録のため評価できません'] };
    var g = gpuResScore(gpu, db, res);
    if (g == null) return { score: null, grade: 'na', reasons: ['GPUの性能指数が未登録です'] };
    var c = cpuResScore(cpu, res);
    var base, grade = 'calc';
    if (c == null) {
      base = g; grade = 'estimate';
      reasons.push(cpu.name + ' のゲーム性能指数が未登録のため、GPUだけで計算した参考値です');
    } else {
      if (cpu.gameTierFrom && db.byId[cpu.gameTierFrom]) reasons.push(cpu.name + ' のゲーム性能指数は、内蔵GPUの有無以外の仕様が同じ ' + db.byId[cpu.gameTierFrom].name + ' の値を使っています');
      base = Math.min(g, c) * C.BOTTLENECK_MIN_W + (g + c) / 2 * (1 - C.BOTTLENECK_MIN_W);
      if (c < g - 10) reasons.push('この解像度ではCPUが先に限界になりやすい組み合わせです');
      if (g < c - 10) reasons.push('GPUの性能が全体の上限を決めています');
    }
    var gb = memoryGB(build, db);
    if (gb == null) { grade = 'estimate'; reasons.push('メモリ未選択（メモリ不足の影響を含めていません）'); }
    else if (gb < 16) { base *= C.MEM_UNDER_16_FACTOR; reasons.push('メモリ' + gb + 'GBは最近のゲームには少なめです'); }
    var vram = gpu.specs.vram;
    (C.VRAM_RULES[res] || []).some(function (r) {
      if (isNum(vram) && vram < r.under) { base *= r.factor; reasons.push('VRAM ' + vram + 'GB はこの解像度では高画質設定で不足しやすいです'); return true; }
      return false;
    });
    return { score: round(clamp(base)), grade: grade, reasons: reasons, parts: { gpu: round(g), cpu: c == null ? null : round(c) } };
  }

  function videoScore(build, db) {
    var cpu = first(build, db, 'cpu'), gpu = first(build, db, 'gpu');
    if (!cpu) return { score: null, grade: 'na', reasons: ['CPUが未選択です'] };
    var w = weighted([
      { v: cpuMtScore(cpu), w: C.VIDEO_W.cpu, label: 'CPUのコア数・クロック' },
      { v: gpu ? (isNum(gpu.specs.raster) ? gpu.specs.raster : null) : null, w: C.VIDEO_W.gpu, label: gpu ? 'GPU性能指数' : 'GPU（内蔵GPUの性能データなし）' },
      { v: ramScore(memoryGB(build, db)), w: C.VIDEO_W.ram, label: 'メモリ容量' },
    ]);
    if (w.score == null) return { score: null, grade: 'na', reasons: ['評価に必要な値が不足: ' + w.missing.join('・')] };
    return { score: round(w.score), grade: 'estimate', reasons: ['CPUのマルチスレッド性能はコア数×クロックからの推定モデルです', '1クロックあたりの性能（世代差）は含めていないため、世代が違うCPUどうしの差は実際と違うことがあります'].concat(w.missing.length ? ['未反映: ' + w.missing.join('・')] : []) };
  }

  function streamScore(build, db, res) {
    var cpu = first(build, db, 'cpu'), gpu = first(build, db, 'gpu');
    if (!cpu) return { score: null, grade: 'na', reasons: ['CPUが未選択です'] };
    var game = gameScore(build, db, res);
    var enc = encoderScore(gpu);
    var w = weighted([
      { v: enc, w: C.STREAM_W.enc, label: gpu ? 'ハードウェアエンコーダー' : 'エンコーダー（GPUなし）' },
      { v: game.score, w: C.STREAM_W.game, label: 'ゲーム性能' },
      { v: cpuMtScore(cpu), w: C.STREAM_W.cpu, label: 'CPUのコア数・クロック' },
      { v: ramScore(memoryGB(build, db)), w: C.STREAM_W.ram, label: 'メモリ容量' },
    ]);
    if (w.score == null) return { score: null, grade: 'na', reasons: ['評価に必要な値が不足: ' + w.missing.join('・')] };
    var reasons = [gpu && gpu.specs.encoderVerified ? 'エンコーダー対応はNVIDIA公式の対応表で確認済みです' : 'エンコーダー対応はGPU世代単位の情報です（公式ページとは未照合）'];
    if (gpu && Array.isArray(gpu.specs.encoder)) reasons.push('対応コーデック: ' + (gpu.specs.encoder.length ? gpu.specs.encoder.map(function (c) { return c.toUpperCase(); }).join(' / ') : 'なし'));
    if (w.missing.length) reasons.push('未反映: ' + w.missing.join('・'));
    return { score: round(w.score), grade: 'estimate', reasons: reasons };
  }

  function expandScore(build, db, power) {
    var mb = first(build, db, 'motherboard'), cs = first(build, db, 'case'), psu = first(build, db, 'psu');
    if (!mb) return { score: null, grade: 'na', reasons: ['マザーボードが未選択です'] };
    var s = mb.specs;
    var used = { m2: 0, sata: 0, bays: 0, exp: 0 };
    all(build, db, 'storage').forEach(function (x) {
      if (x.part.specs.formFactor === 'M.2') used.m2 += x.qty;
      if (x.part.specs.interface === 'SATA') used.sata += x.qty;
      if (x.part.specs.formFactor === '3.5' || x.part.specs.formFactor === '2.5') used.bays += x.qty;
    });
    all(build, db, 'expansion').forEach(function (x) { used.exp += x.qty; });
    var hasGpu = !!first(build, db, 'gpu');
    function lin(v, per) { return isNum(v) ? clamp(Math.max(0, v) * per) : null; }
    var comps = [
      { v: isNum(s.maxMemoryGB) ? clamp(s.maxMemoryGB / 256 * 100) : null, w: C.EXPAND_W.mem, label: 'メモリ最大容量' },
      { v: isNum(s.m2Slots) ? [0, 40, 75, 100][Math.min(3, Math.max(0, s.m2Slots - used.m2))] : null, w: C.EXPAND_W.m2, label: 'M.2の空き' },
      { v: isNum(s.sataPorts) ? lin(s.sataPorts - used.sata, 25) : null, w: C.EXPAND_W.sata, label: 'SATAの空き' },
      { v: isNum(s.pcieX16Slots) && isNum(s.pcieX1Slots) ? lin(s.pcieX16Slots - (hasGpu ? 1 : 0) + s.pcieX1Slots - used.exp, 50) : null, w: C.EXPAND_W.pcie, label: '拡張スロットの空き' },
      { v: cs && isNum(cs.specs.bay35) && isNum(cs.specs.bay25) ? lin(cs.specs.bay35 + cs.specs.bay25 - used.bays, 12.5) : null, w: C.EXPAND_W.bays, label: 'ケースのドライブベイ' },
      { v: cs && isNum(cs.specs.fan120) ? clamp(cs.specs.fan120 / 10 * 100) : null, w: C.EXPAND_W.fans, label: 'ケースのファン取り付け数' },
      { v: psu && isNum(psu.specs.watt) && power && power.complete ? clamp(((psu.specs.watt - power.totalW) / psu.specs.watt - 0.1) / 0.4 * 100) : null, w: C.EXPAND_W.psu, label: '電源の余裕' },
    ];
    var w = weighted(comps);
    if (w.score == null) return { score: null, grade: 'na', reasons: ['評価に必要な値が不足: ' + w.missing.join('・')] };
    return { score: round(w.score), grade: w.missing.length ? 'estimate' : 'calc', reasons: w.missing.length ? ['未反映: ' + w.missing.join('・')] : ['空きスロット・ベイ・電源の余裕から計算'] };
  }

  /**
   * 価格の合計。
   *  - 有効な価格（valid: 実売確認価格・参考中央値で、確認から日数がたっていないもの）だけを total に入れる。
   *  - 既存の参考価格（tier: reference）や古い価格は refRows / refTotal に分けて、合計には入れない。
   *  - グラボ製品に実売確認価格があればそれを使い、GPUチップの価格は数えない（二重計上しない）。
   */
  function priceSummary(build, db) {
    var total = 0, refTotal = 0, rows = [], refRows = [], unpriced = [];
    var board = first(build, db, 'gpuboard');
    var boardPriced = !!(board && board.price && board.price.valid && isNum(board.price.value));
    Object.keys((build && build.items) || {}).forEach(function (cat) {
      if (cat === 'gpuboard' && !boardPriced) return;
      if (cat === 'gpu' && boardPriced) return;
      all(build, db, cat).forEach(function (x) {
        var p = x.part.price;
        if (p && isNum(p.value)) {
          var row = { category: cat, id: x.part.id, name: x.part.name, qty: x.qty, value: p.value * x.qty, price: p, valid: !!p.valid };
          if (row.valid) { rows.push(row); total += row.value; } else { refRows.push(row); refTotal += row.value; }
        } else {
          unpriced.push({ category: cat, id: x.part.id, name: x.part.name });
        }
      });
    });
    return { total: total, rows: rows, refRows: refRows, refTotal: refTotal, unpriced: unpriced, boardPriced: boardPriced };
  }

  /** 価格が ratio 変わったときのコスパの点数 */
  function costAt(perf, total, ratio) {
    return round(clamp(perf / (total * (1 + ratio) / 10000) / C.CP_REF * 100));
  }

  function costScore(build, db, game, video) {
    var prices = priceSummary(build, db);
    var need = ['cpu', 'motherboard', 'memory'];
    if (first(build, db, 'gpu')) need.push(prices.boardPriced ? 'gpuboard' : 'gpu');
    var lacking = need.filter(function (cat) { return !prices.rows.some(function (r) { return r.category === cat; }); });
    if (lacking.length) {
      var refOnly = lacking.filter(function (cat) { return prices.refRows.some(function (r) { return r.category === cat; }); });
      var none = lacking.filter(function (cat) { return refOnly.indexOf(cat) < 0; });
      var why = [];
      if (refOnly.length) why.push('最近調べた価格がないパーツがあります（' + refOnly.map(function (c) { return CAT_JA[c] || c; }).join('・') + '）。不確かな価格で点数を出さないため評価しません');
      if (none.length) why.push('価格がわからない主要パーツがあります（' + none.map(function (c) { return CAT_JA[c] || c; }).join('・') + '）');
      return { score: null, grade: 'na', reasons: why, prices: prices };
    }
    // 性能はゲームと動画編集の両方がそろったときだけ。片方だけで計算すると、
    // 内蔵GPU構成など「ゲームが評価不可」の構成が安いぶん高得点になり、他の構成と同じ条件で比べられない。
    if (!isNum(game.score) || !isNum(video.score)) {
      return { score: null, grade: 'na', reasons: [(isNum(game.score) ? '動画編集' : 'ゲーム性能') + 'スコアが評価不可のため、他の構成と同じ条件でコスパを比べられません'], prices: prices };
    }
    var perfs = [game.score, video.score];
    var perf = (game.score + video.score) / 2;
    // 分母は「性能を決めるパーツ（CPU・GPU）＋土台（マザボ・メモリ）」の価格だけ。
    // ケースや電源など価格の分かるパーツの数で分母が変わると、価格未登録が多い構成ほど点数が高く出てしまうため、
    // どの構成でも同じ範囲の価格で比べる。
    var coreRows = prices.rows.filter(function (r) { return need.indexOf(r.category) >= 0; });
    var coreTotal = coreRows.reduce(function (a, r) { return a + r.value; }, 0);
    var value = perf / (coreTotal / 10000);
    var reasons = ['性能 ' + round(perf) + '点 ÷ ' + need.map(function (c) { return CAT_JA[c] || c; }).join('・') + 'の価格 ' + (coreTotal / 10000).toFixed(1) + '万円（ストレージ・電源・ケースなどは含めない）'];
    var med = coreRows.filter(function (r) { return r.price.tier === 'median'; });
    if (med.length) reasons.push('型番の価格がないパーツは同等品の相場で計算（' + med.map(function (r) { return r.name; }).join('、') + '）');
    // 価格変動の影響: 合計が ±10% / 30% / 50% 変わったときの点数（下がる方向は 50% まで）
    var sens = C.CP_SENSITIVITY_STEPS.map(function (k) { return { ratio: k, up: costAt(perf, coreTotal, k), down: costAt(perf, coreTotal, -k) }; });
    reasons.push('価格が10%上がると ' + sens[0].up + '点、10%下がると ' + sens[0].down + '点（30%・50%は価格内訳タブ）');
    return { score: round(clamp(value / C.CP_REF * 100)), grade: 'estimate', reasons: reasons, prices: prices, value: value, coreTotal: coreTotal,
      sensitivity: { up: sens[0].up, down: sens[0].down, ratio: sens[0].ratio, steps: sens } };
  }

  /**
   * 構成全体を評価する。
   * @param {string} res 'fhd' | 'wqhd' | '4k'（ゲーム・配信の基準解像度）
   */
  function scoreBuild(build, db, res, power) {
    res = res || 'wqhd';
    var game = gameScore(build, db, res);
    var video = videoScore(build, db);
    var stream = streamScore(build, db, res);
    var expand = expandScore(build, db, power);
    var cost = costScore(build, db, game, video);
    var byRes = {};
    ['fhd', 'wqhd', '4k'].forEach(function (r) { byRes[r] = gameScore(build, db, r); });
    var cpu = first(build, db, 'cpu'), gpu = first(build, db, 'gpu');
    return {
      res: res,
      axes: { game: game, video: video, stream: stream, expand: expand, cost: cost },
      gameByRes: byRes,
      detail: {
        gpuRaster: gpu && isNum(gpu.specs.raster) ? gpu.specs.raster : null,
        cpuGame: cpu && isNum(cpu.specs.gameTier) ? cpu.specs.gameTier : null,
        cpuMt: cpuMtScore(cpu) == null ? null : round(cpuMtScore(cpu)),
        memoryGB: memoryGB(build, db),
        vram: gpu && isNum(gpu.specs.vram) ? gpu.specs.vram : null,
      },
      prices: cost.prices || priceSummary(build, db),
    };
  }

  /**
   * 予算を増減したときの違い：GPUだけを、価格が近い上下の新品GPUに替えた場合。
   * 価格が登録されている新品GPUだけを使う（中古相場とは混ぜない）。
   */
  function gpuAlternatives(build, db, res, count) {
    var gpu = first(build, db, 'gpu');
    if (!gpu || !gpu.price || !gpu.price.valid) return [];
    // 確認日つきの価格（有効な価格）があるGPUどうしだけで比べる（GPU GUIDEの古い価格とは混ぜない）
    var pool = (db.byCategory.gpu || []).filter(function (g) {
      return g.price && g.price.valid && isNum(g.price.value) && g.specs.market !== 'used' && isNum(g.specs.raster);
    }).sort(function (a, b) { return a.price.value - b.price.value; });
    var base = gameScore(build, db, res).score;
    var cheaper = pool.filter(function (g) { return g.price.value < gpu.price.value && g.id !== gpu.id; }).slice(-(count || 2));
    var pricier = pool.filter(function (g) { return g.price.value > gpu.price.value && g.id !== gpu.id; }).slice(0, count || 2);
    return cheaper.concat(pricier).map(function (g) {
      var trial = { items: Object.assign({}, build.items, { gpu: [{ id: g.id, qty: 1 }], gpuboard: [] }) };
      var s = gameScore(trial, db, res).score;
      return { id: g.id, name: g.name, priceDiff: g.price.value - gpu.price.value, score: s, scoreDiff: isNum(s) && isNum(base) ? s - base : null };
    });
  }

  return {
    C: C,
    scoreBuild: scoreBuild,
    gameScore: gameScore,
    videoScore: videoScore,
    streamScore: streamScore,
    expandScore: expandScore,
    costScore: costScore,
    priceSummary: priceSummary,
    cpuMtIndex: cpuMtIndex,
    cpuMtScore: cpuMtScore,
    ramScore: ramScore,
    encoderScore: encoderScore,
    gpuAlternatives: gpuAlternatives,
    AXES: [
      { id: 'game', label: 'ゲーム性能', short: 'ゲーム', help: 'GPU GUIDEの描画性能指数とCPUのゲーム性能指数から、選んだ解像度で計算。低い方（ボトルネック）を重く見ます。実測FPSではありません。' },
      { id: 'video', label: '動画編集性能', short: '動画編集', help: 'CPUのコア数×クロック（推定モデル）55%・GPU性能25%・メモリ容量20%。' },
      { id: 'stream', label: '配信性能', short: '配信', help: 'GPUのハードウェアエンコーダー（H.264/HEVC/AV1）35%・ゲーム性能30%・CPU20%・メモリ15%。' },
      { id: 'expand', label: '拡張性', short: '拡張性', help: 'メモリ最大容量・M.2/SATA/拡張スロットの空き・ケースのベイとファン・電源の余裕。' },
      { id: 'cost', label: 'コストパフォーマンス', short: 'コスパ', help: '性能（ゲームと動画編集の平均）÷ CPU・GPU・マザボ・メモリの価格（万円）。5.0で100点。どの構成でも同じパーツの範囲で比べます。最近調べた価格（最安値の目安・同等品の相場）だけを使い、CPU・GPU・マザボ・メモリのどれかの価格がわからなければ評価不可。現在の販売価格ではありません。価格が10%・30%・50%変わったときの点数も表示します。' },
    ],
  };
});
