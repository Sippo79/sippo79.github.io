/* =====================================================================
 *  GPUデータ整合性テスト (test-gpu-data.js)
 *  ---------------------------------------------------------------------
 *  実行: node gpu-guide/test-gpu-data.js
 *
 *  gpus.json 自体の妥当性と、サイト全体のGPU参照が解決できるかを検証する。
 *  ページの生成結果は test-gpu-pages.js が見る。ここはデータ側の番人。
 *
 *  【なぜ必要か】
 *   Phase 3 まで、GAME PC GUIDE と Upgrade が参照している RTX 5050 が
 *   gpus.json に無いことに、テストでは気付けなかった（手作業で見つけた）。
 *   参照と実体のズレは機械で検出できるので、ここで固定する。
 *
 *  ★GPU数をハードコードしない。すべて gpus.json の件数から導く。
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const ROOT = path.join(DIR, '..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

const gpus = readJson(path.join(DIR, 'gpus.json'));
const cpuRecs = readJson(path.join(DIR, 'cpu-recommendations.json'));
const builds = readJson(path.join(ROOT, 'pc-build-check', 'builds.json'));
const games = readJson(path.join(ROOT, 'game-pc-guide', 'data', 'games.json'));
const Links = require(path.join(ROOT, 'shared', 'gpu', 'gpu-links.js'));
Links.setCatalog(gpus);

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { pass++; return; }
  fail++;
  failures.push(name + (detail ? '  → ' + detail : ''));
}

/* ==================================================================
 *  1. 一意性
 * ================================================================== */
(function () {
  const ids = gpus.map((g) => g.id);
  const names = gpus.map((g) => g.name);
  ok('id が一意', new Set(ids).size === ids.length,
    ids.filter((v, i) => ids.indexOf(v) !== i).join(', '));
  ok('name が一意', new Set(names).size === names.length,
    names.filter((v, i) => names.indexOf(v) !== i).join(', '));
  // id は URL になるので形式を固定する（Phase 2 で /gpu-guide/gpu/<id>/ にした）
  const badId = ids.filter((id) => !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(id));
  ok('id がURLセーフ', badId.length === 0, badId.join(', '));
})();

/* ==================================================================
 *  2. 必須フィールド
 * ================================================================== */
(function () {
  const required = ['id', 'name', 'brand', 'vram', 'target', 'score', 'price',
    'power', 'summary', 'games', 'compare', 'cpus', 'generation',
    'rasterScore', 'featureScore', 'usedScore'];
  required.forEach((f) => {
    const miss = gpus.filter((g) => {
      const v = g[f];
      return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    }).map((g) => g.id);
    ok('必須フィールド ' + f + ' が全GPUにある', miss.length === 0, miss.slice(0, 5).join(', '));
  });
})();

/* ==================================================================
 *  3. 数値の妥当性
 * ================================================================== */
(function () {
  ['score', 'rasterScore', 'featureScore', 'usedScore'].forEach((f) => {
    const bad = gpus.filter((g) => {
      const v = g[f];
      return typeof v !== 'number' || v < 0 || v > 100;
    }).map((g) => g.id + '=' + g[f]);
    ok(f + ' が 0-100 の範囲', bad.length === 0, bad.slice(0, 5).join(', '));
  });

  const badVram = gpus.filter((g) => !(Number(g.vram) > 0)).map((g) => g.id);
  ok('vram が正の数', badVram.length === 0, badVram.join(', '));
  const badPower = gpus.filter((g) => !(Number(g.power) > 0)).map((g) => g.id);
  ok('power が正の数', badPower.length === 0, badPower.join(', '));
  const badPrice = gpus.filter((g) => !(Number(g.price) > 0)).map((g) => g.id);
  ok('price が正の数', badPrice.length === 0, badPrice.join(', '));

  // 中古価格レンジ
  const badRange = gpus.filter((g) =>
    g.usedPriceMin != null && g.usedPriceMax != null && g.usedPriceMin > g.usedPriceMax
  ).map((g) => g.id);
  ok('中古価格 min <= max', badRange.length === 0, badRange.join(', '));
})();

/* ==================================================================
 *  4. 分類の一貫性
 * ================================================================== */
(function () {
  const badTarget = gpus.filter((g) => ['FHD', 'WQHD', '4K'].indexOf(g.target) < 0)
    .map((g) => g.id + '=' + g.target);
  ok('target が FHD/WQHD/4K のいずれか', badTarget.length === 0, badTarget.join(', '));

  const badBrand = gpus.filter((g) => ['NVIDIA', 'AMD', 'Intel'].indexOf(g.brand) < 0)
    .map((g) => g.id + '=' + g.brand);
  ok('brand が既知の値', badBrand.length === 0, badBrand.join(', '));

  const badMarket = gpus.filter((g) => g.market != null && g.market !== 'used')
    .map((g) => g.id + '=' + g.market);
  ok('market は未設定か "used"', badMarket.length === 0, badMarket.join(', '));

  // 名前とブランドの一致（RTX が AMD になっている等を検出）
  const mismatch = gpus.filter((g) => {
    if (/^GeForce|^NVIDIA/i.test(g.name)) return g.brand !== 'NVIDIA';
    if (/^Radeon|^AMD/i.test(g.name)) return g.brand !== 'AMD';
    return false;
  }).map((g) => g.id);
  ok('name と brand が一致', mismatch.length === 0, mismatch.join(', '));

  // 冗長フィールドが本体とズレていないこと
  ok('maker === brand', gpus.every((g) => g.maker === g.brand),
    gpus.filter((g) => g.maker !== g.brand).map((g) => g.id).join(', '));
  ok('performanceScore === score', gpus.every((g) => g.performanceScore === g.score),
    gpus.filter((g) => g.performanceScore !== g.score).map((g) => g.id).join(', '));
  ok('recommendedResolution === target', gpus.every((g) => g.recommendedResolution === g.target),
    gpus.filter((g) => g.recommendedResolution !== g.target).map((g) => g.id).join(', '));
})();

/* ==================================================================
 *  5. compare（比較GPU）
 * ================================================================== */
(function () {
  const ids = new Set(gpus.map((g) => g.id));
  const self = [];
  const dead = [];
  const dup = [];
  gpus.forEach((g) => {
    const cs = g.compare || [];
    if (cs.indexOf(g.id) > -1) self.push(g.id);
    cs.forEach((c) => { if (!ids.has(c)) dead.push(g.id + ' -> ' + c); });
    if (new Set(cs).size !== cs.length) dup.push(g.id);
  });
  ok('自分自身を比較対象にしていない', self.length === 0, self.join(', '));
  ok('compare の参照先が全て存在する', dead.length === 0, dead.slice(0, 5).join(', '));
  ok('compare に重複が無い', dup.length === 0, dup.join(', '));

  // 性能差が極端に大きい比較は「比べたくなる相手」になっていない
  const byId = {};
  gpus.forEach((g) => { byId[g.id] = g; });
  const far = [];
  gpus.forEach((g) => {
    (g.compare || []).forEach((c) => {
      const t = byId[c];
      if (!t) return;
      const diff = Math.abs(t.rasterScore - g.rasterScore);
      if (diff > 30) far.push(g.id + ' vs ' + c + ' (差' + diff + ')');
    });
  });
  ok('比較対象の性能差が30以内', far.length === 0, far.slice(0, 5).join(', '));
})();

/* ==================================================================
 *  6. スコアの相対関係
 * ================================================================== */
(function () {
  // 同一世代で、型番が明確に上位なのに rasterScore が低い組を検出する。
  // ★「型番が上なら必ず速い」と決め打ちはしない。あくまで "要調査" の検出。
  const numOf = (n) => { const m = n.match(/(\d{3,4})/); return m ? +m[1] : null; };
  const suffix = (n) => {
    const s = n.toLowerCase();
    if (/ti\s+super/.test(s) || /xtx/.test(s)) return 4;
    if (/\bti\b/.test(s) || /\bxt\b/.test(s)) return 3;
    if (/super/.test(s)) return 2;
    if (/\bgre\b/.test(s)) return 1;
    return 0;
  };
  const byGen = {};
  gpus.forEach((g) => { (byGen[g.generation] = byGen[g.generation] || []).push(g); });
  const inversions = [];
  Object.values(byGen).forEach((list) => {
    list.forEach((a) => list.forEach((b) => {
      const na = numOf(a.name);
      const nb = numOf(b.name);
      if (!na || !nb) return;
      const higher = na > nb || (na === nb && suffix(a.name) > suffix(b.name));
      if (higher && a.rasterScore < b.rasterScore) {
        inversions.push(a.name + '(' + a.rasterScore + ') < ' + b.name + '(' + b.rasterScore + ')');
      }
    }));
  });
  ok('同一世代で型番と性能の逆転が無い', inversions.length === 0, inversions.slice(0, 5).join(' / '));

  // score が raster と feature の間に収まっていること（極端な外れ値の検出）
  const outlier = gpus.filter((g) => {
    const lo = Math.min(g.rasterScore, g.featureScore);
    const hi = Math.max(g.rasterScore, g.featureScore);
    return g.score < lo - 5 || g.score > hi + 5;
  }).map((g) => g.id + ' score=' + g.score + ' (raster' + g.rasterScore + '/feature' + g.featureScore + ')');
  ok('score が raster と feature の範囲内', outlier.length === 0, outlier.slice(0, 5).join(', '));
})();

/* ==================================================================
 *  7. 解像度評価の整合
 * ================================================================== */
(function () {
  const LV = { FHD: 1, WQHD: 2, '4K': 3 };
  const ORD = { '余裕あり': 4, '得意': 3, '狙える': 2, '設定調整が必要': 1 };
  const verdict = (target, row) => {
    const have = LV[target] || 1;
    const want = LV[row];
    if (want < have) return '余裕あり';
    if (want === have) return '得意';
    if (want === have + 1) return '狙える';
    return '設定調整が必要';
  };
  const bad = [];
  gpus.forEach((g) => {
    const v = ['FHD', 'WQHD', '4K'].map((r) => verdict(g.target, r));
    // 解像度が上がるほど評価は下がる（単調性）
    if (!(ORD[v[0]] >= ORD[v[1]] && ORD[v[1]] >= ORD[v[2]])) {
      bad.push(g.id + ': ' + v.join('/'));
    }
    // target の行は必ず「得意」
    const ti = ['FHD', 'WQHD', '4K'].indexOf(g.target);
    if (v[ti] !== '得意') bad.push(g.id + ': target行が' + v[ti]);
  });
  ok('解像度評価が単調でtargetが得意', bad.length === 0, bad.slice(0, 5).join(' / '));
})();

/* ==================================================================
 *  8. サイト全体のGPU参照が解決できる
 * ================================================================== */
(function () {
  /* 意図的に gpus.json へ載せないGPUの allowlist。
   *
   * upgrade-engine.js の GPU_TIERS は「ユーザーが今持っているGPU」を
   * 認識するための入力辞書であり、GPU GUIDE の掲載対象とは別物。
   * 掲載していない型番を入力されても診断は成立する必要があるため、
   * ここに含まれていても問題ない（詳細ページへ送らないだけ）。
   *
   * ★逆に GPU_CANDIDATES（＝交換先として提案するGPU）は
   *   詳細ページへ送りたいので allowlist に入れない。 */
  const ALLOW_UNLISTED = [
    'rtx3090ti', 'rtx4070ti', 'rtx4080', 'rtx4090', 'rx7600xt',
    'GeForce RTX 4080', 'Radeon RX 7600 XT',
  ];
  const allowKeys = new Set(ALLOW_UNLISTED.map((n) => Links.normalizeKey(n)));

  // builds.json
  const badBuild = [...new Set(builds.map((b) => b.gpu))].filter((n) => !Links.resolveId(n));
  ok('builds.json の全GPUが解決できる', badBuild.length === 0, badBuild.join(', '));

  // games.json
  const gameGpus = new Set();
  games.forEach((g) => (g.builds || []).forEach((b) => gameGpus.add(b.gpu)));
  const badGame = [...gameGpus].filter((n) => !Links.resolveId(n));
  ok('games.json の全GPUが解決できる', badGame.length === 0, badGame.join(', '));

  // upgrade の交換候補（提案するGPU＝詳細へ送りたい）
  const engine = fs.readFileSync(path.join(ROOT, 'upgrade', 'upgrade-engine.js'), 'utf8');
  const cm = engine.match(/var GPU_CANDIDATES = \[([\s\S]*?)\];/);
  ok('GPU_CANDIDATES を読み取れる', Boolean(cm));
  if (cm) {
    const cands = [...cm[1].matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1]);
    const badCand = cands.filter((c) => !Links.resolveId(c));
    ok('Upgradeの交換候補が全てGPU GUIDEに存在する', badCand.length === 0, badCand.join(', '));
  }

  // GPU_TIERS（入力辞書）は allowlist を除いて解決できること
  const tm = engine.match(/var GPU_TIERS = \{([\s\S]*?)\};/);
  if (tm) {
    const keys = [...tm[1].matchAll(/([a-z0-9]+):/g)].map((m) => m[1]);
    const unresolved = keys.filter((k) => !Links.resolveId(k) && !allowKeys.has(Links.normalizeKey(k)));
    ok('GPU_TIERS の未解決が allowlist 内に収まる', unresolved.length === 0, unresolved.join(', '));
  }

  // affiliate master の GPU 商品
  const master = readJson(path.join(ROOT, 'shared', 'affiliate', 'affiliate-master.json'));
  const badAff = Object.entries(master.products || {})
    .filter(([, v]) => v.category === 'gpu')
    .map(([k, v]) => v.name || k)
    .filter((n) => !Links.resolveId(n) && !allowKeys.has(Links.normalizeKey(n)));
  ok('affiliate master のGPUが allowlist 内に収まる', badAff.length === 0, badAff.join(', '));
})();

/* ==================================================================
 *  8-2. target の統一基準（Phase 5）
 * ==================================================================
 *  target は PC BUILD CHECK の「解像度が足りない」警告の唯一の根拠なので、
 *  手入力のズレがそのまま診断の誤りになる。
 *  shared/gpu/gpu-target.js の deriveTarget() を唯一の基準とし、
 *  gpus.json の値がそれと一致することを全件検証する。
 * ================================================================== */
(function () {
  const T = require(path.join(ROOT, 'shared', 'gpu', 'gpu-target.js'));

  // --- 保存値と導出値が一致する（GPU追加時の入力ミス検出） ---
  const mismatch = gpus
    .filter((g) => T.deriveTarget(g) !== g.target)
    .map((g) => `${g.id}: 保存=${g.target} / 導出=${T.deriveTarget(g)} (raster${g.rasterScore})`);
  ok('全GPUで target === deriveTarget()', mismatch.length === 0, mismatch.slice(0, 8).join(' / '));

  // --- 同じ rasterScore なら同じ target（market・世代で差を付けない） ---
  const byRaster = {};
  gpus.forEach((g) => { (byRaster[g.rasterScore] = byRaster[g.rasterScore] || []).push(g); });
  const inconsistent = [];
  Object.entries(byRaster).forEach(([raster, list]) => {
    const targets = new Set(list.map((g) => g.target));
    if (targets.size > 1) {
      inconsistent.push(`raster${raster}: ` + list.map((g) => g.name + '=' + g.target).join(', '));
    }
  });
  ok('同じ rasterScore なら同じ target', inconsistent.length === 0, inconsistent.slice(0, 5).join(' / '));

  // --- market（現行/中古）で基準が変わっていない ---
  const band = (sel) => {
    const l = gpus.filter(sel);
    const out = {};
    ['FHD', 'WQHD', '4K'].forEach((t) => {
      const s = l.filter((g) => g.target === t).map((g) => g.rasterScore);
      if (s.length) out[t] = { min: Math.min(...s), max: Math.max(...s) };
    });
    return out;
  };
  const cur = band((g) => g.market !== 'used');
  const used = band((g) => g.market === 'used');
  ['WQHD', '4K'].forEach((t) => {
    if (!cur[t] || !used[t]) return;
    // 同じ target の下限が market 間で大きくズレていないこと
    ok(`${t} の下限が market 間でズレていない`,
      Math.abs(cur[t].min - used[t].min) <= 5,
      `現行${cur[t].min} / 中古${used[t].min}`);
  });

  // --- 帯が重ならない（FHDの上限 < WQHDの下限 < 4Kの下限） ---
  const all = band(() => true);
  if (all.FHD && all.WQHD) {
    ok('FHD帯とWQHD帯が重ならない', all.FHD.max < all.WQHD.min,
      `FHD上限${all.FHD.max} / WQHD下限${all.WQHD.min}`);
  }
  if (all.WQHD && all['4K']) {
    ok('WQHD帯と4K帯が重ならない', all.WQHD.max < all['4K'].min,
      `WQHD上限${all.WQHD.max} / 4K下限${all['4K'].min}`);
  }

  // --- 境界値の回帰テスト（今後GPUを追加しても基準がズレないよう固定） ---
  const W = T.THRESHOLDS.WQHD;
  const K = T.THRESHOLDS['4K'];
  [[W - 1, 'FHD'], [W, 'WQHD'], [W + 1, 'WQHD'],
   [K - 1, 'WQHD'], [K, '4K'], [K + 1, '4K'],
   [0, 'FHD'], [100, '4K']].forEach(([raster, expect]) => {
    ok(`raster ${raster} → ${expect}`, T.deriveTarget({ rasterScore: raster }) === expect,
      T.deriveTarget({ rasterScore: raster }));
  });
  // 不正入力でも落ちない
  ok('rasterScore が無い場合は FHD にフォールバック', T.deriveTarget({}) === 'FHD');
  ok('deriveTarget が null 入力で落ちない', T.deriveTarget(null) === 'FHD');

  // --- 解像度レベルの比較（PC BUILD CHECK と同じ尺度か） ---
  ok('FHD < WQHD < 4K の順序', T.getResolutionLevel('FHD') < T.getResolutionLevel('WQHD')
    && T.getResolutionLevel('WQHD') < T.getResolutionLevel('4K'));
  ok('大文字小文字を問わない', T.getResolutionLevel('FHD') === T.getResolutionLevel('fhd'));
  ok('未知の表記は null', T.getResolutionLevel('8K') === null);
})();

/* ==================================================================
 *  8-3. 推奨GPUの妥当性（Phase 6）
 * ==================================================================
 *  「その条件なら確かにそのGPUを選ぶ」と納得できる推奨になっているかを、
 *  データ側から検証する。推薦アルゴリズム本体（upgrade-engine.js）の
 *  総当り検証は同ファイルのテストが担当する。
 * ================================================================== */
(function () {
  const Links = require(path.join(ROOT, 'shared', 'gpu', 'gpu-links.js'));
  Links.setCatalog(gpus);
  const byId = {};
  gpus.forEach((g) => { byId[g.id] = g; });

  const engine = fs.readFileSync(path.join(ROOT, 'upgrade', 'upgrade-engine.js'), 'utf8');

  // --- 交換候補は現行GPUのみ（中古前提GPUを新品前提の交換先に出さない） ---
  const cm = engine.match(/var GPU_CANDIDATES = \[([\s\S]*?)\];/);
  ok('GPU_CANDIDATES を読み取れる', Boolean(cm));
  if (cm) {
    const cands = [...cm[1].matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1]);
    const usedCands = cands.filter((c) => {
      const g = byId[Links.resolveId(c)];
      return g && g.market === 'used';
    });
    ok('交換候補に中古前提GPUが含まれない', usedCands.length === 0, usedCands.join(', '));

    // 候補は性能順に並んでいること（価格と性能が逆行していないか）
    const tm = engine.match(/var GPU_TIERS = \{([\s\S]*?)\};/);
    const tiers = Object.fromEntries(
      [...tm[1].matchAll(/([a-z0-9]+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])])
    );
    const pm = engine.match(/var PRICE_HINT = \{([\s\S]*?)\};/);
    const prices = Object.fromEntries(
      [...pm[1].matchAll(/([a-z0-9_]+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])])
    );
    // 性能が高いのに明確に安い、という逆転が無いか（価格帯の整合）
    const inverted = [];
    cands.forEach((a) => cands.forEach((b) => {
      if (a === b) return;
      if (tiers[a] > tiers[b] && prices[a] < prices[b] * 0.75) {
        inverted.push(`${a}(t${tiers[a]} ¥${prices[a]}) vs ${b}(t${tiers[b]} ¥${prices[b]})`);
      }
    }));
    ok('候補の性能と価格に大きな逆転が無い', inverted.length === 0, inverted.slice(0, 3).join(' / '));
  }

  // --- builds.json の中古GPUには必ず注意書きが出る ---
  const builds = readJson(path.join(ROOT, 'pc-build-check', 'builds.json'));
  const usedBuilds = builds.filter((b) => {
    const g = byId[Links.resolveId(b.gpu)];
    return g && g.market === 'used';
  });
  const buildsDir = path.join(ROOT, 'pc-build-check', 'builds');
  const noticed = fs.readdirSync(buildsDir)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => fs.readFileSync(path.join(buildsDir, f), 'utf8').indexOf('中古で探すのが前提') > -1);
  ok('中古GPUを使う構成ページ数と注意書きの数が一致',
    noticed.length === usedBuilds.length,
    `注意書き${noticed.length}ページ / 中古GPU構成${usedBuilds.length}件`);

  // --- 診断側にも中古の注意を出す実装がある ---
  const pbc = fs.readFileSync(path.join(ROOT, 'pc-build-check', 'script.js'), 'utf8');
  ok('診断結果に中古GPUの注意書き実装がある', pbc.indexOf('renderUsedGpuNotice') > -1);
  ok('中古判定は gpus.json の market を見ている', pbc.indexOf("market === \"used\"") > -1);

  // --- builds.json のGPUがVRAM的に極端でない（解像度との整合） ---
  const lowVram = builds.filter((b) => {
    const g = byId[Links.resolveId(b.gpu)];
    // 4K構成で VRAM 8GB未満は現実的でない
    return g && b.resolution === '4k' && g.vram < 8;
  }).map((b) => `${b.id}:${b.gpu}(${byId[Links.resolveId(b.gpu)].vram}GB)`);
  ok('4K構成にVRAM 8GB未満のGPUが無い', lowVram.length === 0, lowVram.join(', '));
})();

/* ==================================================================
 *  9. CPU相性データ
 * ================================================================== */
(function () {
  const ids = new Set(gpus.map((g) => g.id));
  const orphan = Object.keys(cpuRecs).filter((k) => !k.startsWith('_') && !ids.has(k));
  ok('CPU相性データが存在しないGPUを参照していない', orphan.length === 0, orphan.join(', '));

  // 断定しすぎた表現を作らない（「絶対」「必ず」等）
  const strong = [];
  Object.entries(cpuRecs).forEach(([k, v]) => {
    if (k.startsWith('_')) return;
    (v.picks || []).forEach((p) => {
      const text = String(p.bottleneck_note || '') + String(p.reason || '');
      if (/絶対|必ず|確実に|100%/.test(text)) strong.push(k);
    });
  });
  ok('CPU相性の説明に過度な断定が無い', strong.length === 0, [...new Set(strong)].join(', '));

  // 現行GPUはCPU相性を持つ（新品購入検討者に必要な情報）
  const currentNoCpu = gpus.filter((g) => g.market !== 'used' && !cpuRecs[g.id]).map((g) => g.id);
  ok('現行GPUに全てCPU相性データがある', currentNoCpu.length === 0, currentNoCpu.join(', '));
})();

/* ------------------------------------------------------------------ */
console.log('');
console.log('  GPUデータ整合性テスト結果');
console.log('  --------------------------');
console.log('  GPU件数: ' + gpus.length);
console.log('  成功: ' + pass);
console.log('  失敗: ' + fail);
if (failures.length) {
  console.log('');
  failures.slice(0, 40).forEach((f) => console.log('  × ' + f));
}
console.log('');
process.exit(fail === 0 ? 0 : 1);
