/* =====================================================================
 *  Sippo PC BUILDER テスト（node pc-builder/test-pc-builder.js）
 *  データの健全性・互換性判定・スコア・URL共有・他サイトからの引き継ぎを検証する。
 * ===================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const rq = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, '')); // builds.json は BOM 付き

const Db = require('./js/pb-db.js');
const Compat = require('./js/pb-compat.js');
const Score = require('./js/pb-score.js');
const Codec = require('./js/pb-codec.js');
const Import = require('./js/pb-import.js');
const engine = require('../upgrade/upgrade-engine.js');
const gpuTarget = require('../shared/gpu/gpu-target.js');

const partsJson = rq('pc-builder/data/parts.json');
const rules = rq('pc-builder/data/rules.json');
const presets = rq('pc-builder/data/presets.json').presets;
const gpus = rq('gpu-guide/gpus.json');
const partPrices = rq('shared/parts/part-prices.json');
const pricesJson = rq('pc-builder/data/prices.json');
const affiliate = rq('shared/affiliate/affiliate-master.json').products;
const builds = rq('pc-build-check/builds.json');
const gamesRaw = rq('game-pc-guide/data/games.json');
const games = Array.isArray(gamesRaw) ? gamesRaw : gamesRaw.games;

let pass = 0, fail = 0;
const failures = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; failures.push(msg); } }
function eq(a, b, msg) { ok(a === b, msg + `（期待: ${b} / 実際: ${a}）`); }

// 本番と同じ入力（prices.json を含む）。mutate で parts、mutatePrices で prices を書き換えた DB も作れる
const TEST_NOW = new Date('2026-10-30T12:00:00+09:00');
function makeDb(extraParts, mutate, mutatePrices, now) {
  const parts = JSON.parse(JSON.stringify(partsJson));
  const prices = JSON.parse(JSON.stringify(pricesJson));
  if (extraParts) parts.parts = parts.parts.concat(extraParts);
  if (mutate) mutate(parts);
  if (mutatePrices) mutatePrices(prices);
  return Db.buildDb({ parts, rules, gpus, partPrices, engine, gpuTarget, prices, now: now || TEST_NOW });
}
// 指定したパーツの仕様だけを書き換えた DB（「値が無ければ要確認」を実データの欠けに頼らず確かめる）
const withSpec = (id, patch) => makeDb(null, (p) => { Object.assign(p.parts.find((x) => x.id === id).specs, patch); });
const db = makeDb();
const B = (items) => ({ items: Object.fromEntries(Object.entries(items).map(([k, v]) => [k, (Array.isArray(v) ? v : [v]).map((x) => typeof x === 'string' ? { id: x, qty: 1 } : x)])) });
const statusOf = (build, id, d) => { const r = Compat.checkBuild(build, d || db, Db.CATEGORIES).results.find((x) => x.id === id); return r ? r.status : null; };

/* ------------------------------------------------------------------
 *  1. データの健全性
 * ------------------------------------------------------------------ */
ok(db.warnings.length === 0, 'DB構築時の警告: ' + db.warnings.join(' / '));
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const NUMERIC_SPECS = ['cores', 'threads', 'pCores', 'eCores', 'baseGHz', 'boostGHz', 'l3MB', 'tdpW', 'maxPowerW', 'memorySlots', 'maxMemoryGB', 'm2Slots', 'sataPorts', 'pcieX16Slots', 'pcieX1Slots', 'fanHeaders', 'speed', 'capacityGB', 'modules', 'cas', 'heightMm', 'watt', 'depthMm', 'eps8', 'pcie8', 'h12v2x6', 'sata', 'maxGpuMm', 'maxGpuThickMm', 'maxCoolerMm', 'fan120', 'fan140', 'includedFanCount', 'bay35', 'bay25', 'maxPsuMm', 'radiatorMm', 'radiatorThickMm', 'sizeMm', 'thickMm', 'maxRpm', 'lengthMm', 'pin8', 'pin16', 'recommendedPsuW', 'vram', 'seqReadMBs', 'seqWriteMBs', 'gpuMmWithFrontRad'];
db.list.forEach((p) => ok(ID_RE.test(p.id), `IDの形式が不正: ${p.id}`));
partsJson.parts.forEach((p) => {
  ok(!!Db.CATEGORY_MAP[p.category], `未知のカテゴリ: ${p.id}`);
  ok(!('price' in p), `${p.id}: price を直接持たない（priceRef で既存データを参照する）`);
  if (p.kind !== 'generic') {
    ok(!!p.source && !!partsJson.sources[p.source], `${p.id}: 実在製品には sources に登録した出典が必要`);
    const s = partsJson.sources[p.source];
    ok(s && /^https?:\/\//.test(s.url) && /^\d{4}-\d{2}-\d{2}$/.test(s.checkedAt), `${p.id}: 出典にURLと確認日が必要`);
  }
  if (p.source) ok(!!partsJson.sources[p.source], `${p.id}: 出典ID ${p.source} が sources に無い`);
  if (p.affiliateId) ok(!!affiliate[p.affiliateId], `${p.id}: affiliateId ${p.affiliateId} が共通アフィリエイトマスターに無い`);
  if (p.priceRef) ok(Db._resolvePriceRef(p.priceRef, { partPrices, engine }) !== null, `${p.id}: priceRef ${p.priceRef} を解決できない`);
  if (p.category === 'cpu') ok(!!rules.cpuFamilies[p.family], `${p.id}: CPU世代 ${p.family} が rules.json に無い`);
  if (p.category === 'motherboard' && p.specs.chipset) ok(!!rules.chipsets[p.specs.chipset], `${p.id}: チップセット ${p.specs.chipset} が rules.json に無い`);
  if (p.category === 'motherboard' && p.specs.chipset && rules.chipsets[p.specs.chipset]) eq(p.specs.socket, rules.chipsets[p.specs.chipset].socket, `${p.id}: チップセットとソケットの組み合わせ`);
  if (p.category === 'cpu' && rules.cpuFamilies[p.family]) eq(p.specs.socket, rules.cpuFamilies[p.family].socket, `${p.id}: CPU世代とソケットの組み合わせ`);
  // 数値であるべき項目に文字列が入っていない（判定に使う項目だけ）
  Object.entries(p.specs || {}).forEach(([k, v]) => {
    if (NUMERIC_SPECS.indexOf(k) >= 0 && v !== null) {
      ok(typeof v === 'number', `${p.id}: specs.${k} は数値か null（${JSON.stringify(v)}）`);
    }
  });
});
// 価格を二重管理していない：GPU価格は gpus.json だけ
ok(!partsJson.parts.some((p) => p.category === 'gpu'), 'parts.json に GPUチップを書かない（gpus.json が唯一の情報源）');
// 全GPUが gpus.json 由来で、性能指数を持つ
eq(db.byCategory.gpu.length, gpus.length, 'GPUチップ数は gpus.json と一致');
// エンコーダー情報：全GPUの世代が rules.json にある
db.byCategory.gpu.forEach((g) => ok(Array.isArray(g.specs.encoder), `${g.id}: エンコーダー情報（世代 ${g.specs.series}）が rules.json に無い`));
// GPU_POWER_SPEC と rules.gpuChipPower が重複していない
Object.keys(rules.gpuChipPower).filter((k) => k[0] !== '_').forEach((k) => ok(!engine.GPU_POWER_SPEC[k], `gpuChipPower.${k} は upgrade-engine.js と重複`));
// プリセットのIDが実在
presets.forEach((p) => Object.entries(p.items).forEach(([cat, arr]) => arr.forEach((e) => {
  ok(!!db.byId[e.id], `プリセット ${p.id}: ${e.id} が存在しない`);
  ok(db.byId[e.id] && db.byId[e.id].category === cat, `プリセット ${p.id}: ${e.id} のカテゴリが ${cat} ではない`);
})));

/* ------------------------------------------------------------------
 *  2. 互換性チェック
 * ------------------------------------------------------------------ */
const GOOD = {
  cpu: 'ryzen77800x3d', gpu: 'rtx-5070', gpuboard: 'asus-prime-rtx5070-12g', motherboard: 'asus-tuf-b650-plus-wifi',
  memory: 'corsair-cmk32gx5m2b6000c30', storage: 'ssd-generic-nvme-1tb', psu: 'corsair-rm850x', case: 'lianli-lancool-216', cooler: 'tr-ps120se',
};
const good = B(GOOD);
const rGood = Compat.checkBuild(good, db, Db.CATEGORIES);
eq(rGood.summary.ng, 0, '基準構成に非対応が無い');
['socket', 'bios', 'memtype', 'memslots', 'formfactor', 'gpulen', 'coolersocket', 'coolerheight', 'psuwatt', 'gpupower', 'm2'].forEach((id) => eq(statusOf(good, id), 'ok', `基準構成の ${id} は対応`));

eq(statusOf(B({ ...GOOD, cpu: 'ryzen55600' }), 'socket'), 'ng', 'ソケット不一致（AM4 CPU × AM5 マザボ）は非対応');
eq(statusOf(B({ ...GOOD, cpu: 'corei714700k' }), 'socket'), 'ng', 'ソケット不一致（LGA1700 × AM5）は非対応');
eq(statusOf(B({ ...GOOD, memory: 'corsair-cmk32gx4m2e3200c16' }), 'memtype'), 'ng', 'メモリ規格不一致（DDR4 × DDR5）は非対応');
eq(statusOf(B({ cpu: 'coreultra9285k', memory: 'mem-generic-ddr4-32' }), 'memtype'), 'ng', 'DDR5専用CPUにDDR4は非対応');
eq(statusOf(B({ ...GOOD, case: 'fractal-terra' }), 'formfactor'), 'ng', 'ケースサイズ不一致（ATX × Mini-ITXケース）は非対応');
eq(statusOf(B({ ...GOOD, case: 'lianli-a3-matx' }), 'formfactor'), 'ng', 'ATXマザボ × mATXケースは非対応');
eq(statusOf(B({ ...GOOD, case: 'fractal-terra' }), 'coolerheight'), 'ng', 'クーラー高さ超過は非対応');
eq(statusOf(B({ ...GOOD, memory: { id: 'corsair-cmk32gx5m2b6000c30', qty: 3 } }), 'memslots'), 'ng', 'メモリ枚数がスロットを超えると非対応');
eq(statusOf(B({ ...GOOD, cooler: 'tr-ax120rse-am', cpu: 'coreultra9285k', motherboard: 'asus-tuf-b860-plus-wifi' }), 'coolersocket'), 'ng', 'クーラーの対応ソケット外は非対応');
eq(statusOf(B({ ...GOOD, cooler: 'lianli-galahad2-trinity-360', case: 'fractal-pop-air' }), 'radiator'), 'ng', '360mmラジエーターを付けられないケースは非対応');
eq(statusOf(B({ ...GOOD, cooler: 'lianli-galahad2-trinity-360' }), 'radiator'), 'ok', '360mmラジエーター対応ケースは対応');
eq(statusOf(B({ ...GOOD, cooler: 'cooler-generic-aio240', case: 'fractal-north', gpuboard: 'asus-prime-rx9070xt-o16g', gpu: 'rx-9070-xt' }), 'gpulen'), 'check', '前面ラジエーター時のGPU長制限は要確認');

// GPU寸法超過（短いケースをテスト用に追加）
const dbShort = makeDb([{ id: 'test-short-case', category: 'case', maker: 'TEST', name: 'Test Short', source: 'fractal-north',
  specs: { shape: 'mid', supportedMb: ['ATX'], maxGpuMm: 280, maxCoolerMm: 170, radiators: {}, psuForm: ['ATX'], maxPsuMm: 200 } }]);
eq(statusOf(B({ ...GOOD, case: 'test-short-case' }), 'gpulen', dbShort), 'ng', 'GPU寸法超過（304mm > 280mm）は非対応');

// 電源不足
eq(statusOf(B({ cpu: 'ryzen99950x3d', gpu: 'rtx-5090', psu: 'psu-generic-650' }), 'psuwatt'), 'ng', '電源不足（9950X3D＋RTX 5090 に 650W）は非対応');
eq(statusOf(B({ ...GOOD, psu: 'corsair-rm650' }), 'psuwatt'), 'check', 'GPUメーカー推奨（750W）未満は要確認');
eq(statusOf(B({ ...GOOD, cpu: 'ryzen57500f' }), 'psuwatt', withSpec('ryzen57500f', { tdpW: null })), 'check', 'CPUの消費電力が未登録なら電源容量は要確認');

// BIOS
eq(statusOf(B({ ...GOOD, cpu: 'ryzen79800x3d' }), 'bios'), 'check', 'B650 × Ryzen 9000 はBIOS要確認');
eq(statusOf(B({ cpu: 'ryzen55600', motherboard: 'mb-generic-am4-b550-atx' }), 'bios'), 'check', 'B550 × Ryzen 5000 はBIOS要確認');
eq(statusOf(B({ cpu: 'corei514400f', motherboard: 'asus-prime-b760m-a-d4' }), 'bios'), 'check', 'B760 × 第14世代はBIOS要確認');
eq(statusOf(B({ cpu: 'corei513400f', motherboard: 'asus-prime-b760m-a-d4' }), 'bios'), 'ok', 'B760 × 第13世代は対応');

// 情報不足は要確認
eq(statusOf(B({ ...GOOD, motherboard: 'mb-generic-am5-b650-atx' }), 'memslots'), 'check', '機種未指定マザボのメモリスロットは要確認');
eq(statusOf(B({ ...GOOD, gpuboard: [] }), 'gpulen'), 'check', 'グラボ製品未選択ならGPU長は要確認');
eq(statusOf(B({ ...GOOD, gpuboard: [] }), 'gpupower'), 'check', 'グラボ製品未選択なら補助電源は要確認');
eq(statusOf(B({ ...GOOD, psu: 'psu-generic-850' }), 'gpupower'), 'check', '機種未指定電源のケーブルは要確認');
eq(statusOf(B({ ...GOOD, cooler: 'cooler-generic-air' }), 'coolerheight'), 'check', '機種未指定クーラーの高さは要確認');
eq(statusOf(B({ ...GOOD, cooler: [] }), 'nocooler'), 'check', '付属クーラー不明でクーラー未選択は要確認');
eq(statusOf(B({ ...GOOD, gpu: 'rx-9070-xt', gpuboard: 'asus-prime-rx9070xt-o16g', psu: 'corsair-rm750e' }), 'gpupower'), 'check', '8ピン×3を変換ケーブル込みの電源で賄うときは要確認');

// 映像出力
eq(statusOf(B({ cpu: 'ryzen57500f' }), 'display'), 'ng', '内蔵GPUなしCPUでGPU未選択は非対応');
eq(statusOf(B({ cpu: 'ryzen55600g' }), 'display'), 'ok', '5600G（内蔵GPU）ならGPUなしで対応');
eq(statusOf(B({ cpu: 'corei914900k' }), 'display', withSpec('corei914900k', { igpu: null })), 'check', '内蔵GPU未確認のCPUでGPUなしは要確認');
eq(statusOf(B({ cpu: 'corei914900k' }), 'display'), 'ok', '14900K（UHD 770）ならGPUなしで対応');

// ストレージ・ベイ
eq(statusOf(B({ ...GOOD, storage: [{ id: 'ssd-generic-nvme-1tb', qty: 4 }] }), 'm2'), 'ng', 'M.2が足りないと非対応');
eq(statusOf(B({ ...GOOD, storage: [{ id: 'hdd-generic-35', qty: 5 }] }), 'sata'), 'ng', 'SATAポート不足は非対応');
eq(statusOf(B({ ...GOOD, storage: [{ id: 'hdd-generic-35', qty: 3 }] }), 'bays'), 'ng', '3.5インチベイ不足は非対応');
eq(statusOf(B({ ...GOOD, storage: 'samsung-990evo-1tb' }), 'm2'), 'check', 'M.2の長さ規格が未確認なら要確認');
eq(statusOf(B({ ...GOOD, fan: { id: 'corsair-rs120', qty: 11 } }), 'fans'), 'ng', 'ファン取り付け数超過は非対応');

// ★「根拠となる値が null のとき対応を返さない」：基準構成の値を1つずつ消して確認
const NULL_CASES = [
  ['socket', 'cpu', 'ryzen77800x3d', 'socket'],
  ['memtype', 'motherboard', 'asus-tuf-b650-plus-wifi', 'memoryType'],
  ['memslots', 'motherboard', 'asus-tuf-b650-plus-wifi', 'memorySlots'],
  ['memslots', 'motherboard', 'asus-tuf-b650-plus-wifi', 'maxMemoryGB'],
  ['formfactor', 'case', 'lianli-lancool-216', 'supportedMb'],
  ['formfactor', 'motherboard', 'asus-tuf-b650-plus-wifi', 'formFactor'],
  ['gpulen', 'case', 'lianli-lancool-216', 'maxGpuMm'],
  ['gpulen', 'gpuboard', 'asus-prime-rtx5070-12g', 'lengthMm'],
  ['coolersocket', 'cooler', 'tr-ps120se', 'sockets'],
  ['coolerheight', 'cooler', 'tr-ps120se', 'heightMm'],
  ['coolerheight', 'case', 'lianli-lancool-216', 'maxCoolerMm'],
  ['psuwatt', 'cpu', 'ryzen77800x3d', 'tdpW'],
  ['psuwatt', 'psu', 'corsair-rm850x', 'watt'],
  ['gpupower', 'psu', 'corsair-rm850x', 'h12v2x6'],
  ['gpupower', 'gpuboard', 'asus-prime-rtx5070-12g', 'pin16'],
  ['m2', 'motherboard', 'asus-tuf-b650-plus-wifi', 'm2Slots'],
  ['bios', 'motherboard', 'asus-tuf-b650-plus-wifi', 'cpuFamilies'],
];
NULL_CASES.forEach(([check, , id, field]) => {
  const d = makeDb(null, (parts) => { const p = parts.parts.find((x) => x.id === id); p.specs[field] = null; });
  const st = statusOf(good, check, d);
  ok(st !== 'ok', `${id}.${field} が null のとき ${check} を「対応」にしない（実際: ${st}）`);
});

// 全パーツ組み合わせで例外が出ない（ランダム 3000 構成）
let seed = 42;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
let threw = 0, okWithNull = 0;
for (let i = 0; i < 3000; i++) {
  const items = {};
  Db.CATEGORIES.forEach((c) => { const arr = db.byCategory[c.id]; if (arr.length && rnd(3)) items[c.id] = [{ id: arr[rnd(arr.length)].id, qty: 1 + rnd(2) }]; });
  try {
    const r = Compat.checkBuild({ items }, db, Db.CATEGORIES);
    const s = Score.scoreBuild({ items }, db, ['fhd', 'wqhd', '4k'][rnd(3)], r.power);
    Object.values(s.axes).forEach((a) => { if (a.score !== null && (a.score < 0 || a.score > 100 || !Number.isFinite(a.score))) threw++; if (a.score === null && a.grade !== 'na') threw++; });
    r.results.forEach((x) => { if (x.message.indexOf('null') >= 0 || x.message.indexOf('undefined') >= 0 || x.message.indexOf('NaN') >= 0) okWithNull++; });
  } catch (e) { threw++; }
}
eq(threw, 0, 'ランダム3000構成で例外・範囲外スコアが出ない');
eq(okWithNull, 0, '判定メッセージに null / undefined / NaN が出ない');

/* ------------------------------------------------------------------
 *  3. スコア
 * ------------------------------------------------------------------ */
const empty = Score.scoreBuild({ items: {} }, db, 'wqhd');
Object.entries(empty.axes).forEach(([k, a]) => eq(a.grade, 'na', `空の構成の ${k} は評価不可`));
const igpu = Score.scoreBuild(B({ cpu: 'ryzen55600g', memory: 'mem-generic-ddr4-16' }), db, 'fhd');
eq(igpu.axes.game.grade, 'na', '内蔵GPU構成のゲーム性能は評価不可（データが無いため）');
const sg = Score.scoreBuild(good, db, 'wqhd', rGood.power);
ok(sg.gameByRes.fhd.score >= sg.gameByRes.wqhd.score && sg.gameByRes.wqhd.score >= sg.gameByRes['4k'].score, '解像度が上がるとゲーム性能は下がる（同じかそれ以下）');
// GPUを上げるとゲーム性能が下がらない（全GPUで単調性を確認）
const sortedGpus = db.byCategory.gpu.filter((g) => Number.isFinite(g.specs.raster)).sort((a, b) => a.specs.raster - b.specs.raster);
let mono = true;
['fhd', 'wqhd', '4k'].forEach((res) => {
  let prev = -1;
  sortedGpus.forEach((g) => {
    const s = Score.gameScore(B({ cpu: 'ryzen77800x3d', gpu: g.id, memory: 'mem-generic-ddr5-32' }), db, res).score;
    if (s < prev - 10) mono = false; // VRAM係数で多少前後するのは許容
    prev = Math.max(prev, s);
  });
});
ok(mono, 'GPU性能指数が上がってゲーム性能が大きく下がらない');
const COST_BUILD = B({ cpu: 'ryzen99950x', gpu: 'rtx-5070', motherboard: 'asus-tuf-b650-plus-wifi', memory: 'mem-generic-ddr5-32' });
eq(Score.scoreBuild(COST_BUILD, db, 'wqhd').axes.cost.grade, 'estimate', '主要パーツの価格がそろえばコスパは参考値');
eq(Score.scoreBuild(COST_BUILD, makeDb(null, null, (pr) => { delete pr.items.ryzen99950x; }), 'wqhd').axes.cost.grade, 'na', 'CPUの参考価格が無いとコスパは評価不可');
eq(Score.scoreBuild(B({ cpu: 'ryzen57600', gpu: 'rtx-5070', memory: 'mem-generic-ddr5-32' }), withSpec('ryzen57600', { cores: null, pCores: null }), 'wqhd').axes.video.grade, 'na', 'コア数が未登録のCPUは動画編集を評価不可');
eq(Score.scoreBuild(B({ cpu: 'ryzen57600', gpu: 'rtx-5070', memory: 'mem-generic-ddr5-32' }), db, 'wqhd').axes.video.grade, 'estimate', 'コア数・クロックがそろったCPUは動画編集を参考値で評価');
ok(Score.cpuMtIndex(withSpec('ryzen97900x', { boostGHz: null }).byId.ryzen97900x) === null, 'クロックが無いCPUのマルチ指数は null（推測しない）');
eq(Score.ramScore(16), 50, 'メモリ16GBは50点');
eq(Score.encoderScore(db.byId['rtx-5070']), 100, 'AV1対応GPUのエンコーダーは100点');
eq(Score.encoderScore(db.byId['rx-6500-xt']), 0, 'エンコーダーの無いRX 6500 XTは0点');
presets.forEach((p) => {
  const s = Score.scoreBuild({ items: p.items }, db, p.res);
  Object.entries(s.axes).forEach(([k, a]) => ok(a.score === null || (a.score >= 0 && a.score <= 100), `プリセット ${p.id} の ${k} が0〜100`));
});
// 価格は gpuboard を二重計上しない
const pr = Score.priceSummary(good, db);
ok(!pr.rows.some((r) => r.category === 'gpuboard'), 'グラボ製品の価格をGPUと二重計上しない');
eq(pr.rows.find((r) => r.category === 'gpu').value, pricesJson.gpuChips['rtx-5070'].value, 'GPUの価格は prices.json の gpuChips（確認日つき）を優先');
eq(db.byId['rtx-5070'].guidePrice.value, gpus.find((g) => g.id === 'rtx-5070').price, 'GPU GUIDE の価格は guidePrice として別に持つ（gpus.json は変えない）');
eq(pr.rows.find((r) => r.category === 'cpu').value, pricesJson.items.ryzen77800x3d.value, 'CPUの参考価格は prices.json（小売目安）の値');

/* ------------------------------------------------------------------
 *  4. URL共有・保存
 * ------------------------------------------------------------------ */
presets.forEach((p) => {
  const enc = Codec.encode({ items: p.items });
  const dec = Codec.decode(enc, db);
  eq(Codec.encode(dec.build), enc, `プリセット ${p.id} のURL往復で同じ構成に戻る`);
  ok(/^[a-z0-9~._-]+$/.test(enc), `共有文字列はURLでエスケープ不要な文字だけ（${p.id}）`);
});
const bad = Codec.decode('1~cpu.ryzen77800x3d~gpu.not-a-gpu~zzz.foo~mem.<script>~sto.ssd-generic-nvme-1tb_99', db);
eq(bad.build.items.cpu[0].id, 'ryzen77800x3d', '壊れたURLでも有効な部分は復元');
ok(!bad.build.items.gpu, '未知のGPU IDは除外');
ok(bad.warnings.length >= 3, '除外した理由を警告として返す');
eq(bad.build.items.storage[0].qty, 16, '数量は上限16に丸める');
eq(Codec.decode('9~cpu.ryzen77800x3d', db).build.items.cpu, undefined, '未対応の形式の版は読まない');
eq(Codec.decode('1~cpu.ssd-generic-nvme-1tb', db).build.items.cpu, undefined, 'カテゴリが違うIDは除外');
eq(Codec.cleanName('<img src=x onerror=1>テスト'), 'img src=x onerror=1テスト', '構成名から < > を取り除く');
const longId = (i) => 'a' + 'x'.repeat(58) + String(i).padStart(2, '0');
ok(Codec.toQuery({ items: { storage: Array.from({ length: 12 }, (_, i) => ({ id: longId(i), qty: 2 })), fan: Array.from({ length: 12 }, (_, i) => ({ id: longId(i + 20), qty: 2 })) } }).tooLong, '長すぎるURLを検出する');
ok(!/key|token|secret|password/i.test(Codec.toQuery(good, { name: 'a' }).query), '共有URLに秘密情報らしき項目を含めない');

/* ------------------------------------------------------------------
 *  5. 他サイトからの引き継ぎ
 * ------------------------------------------------------------------ */
// GPU GUIDE: 全GPUが引き継げる
gpus.forEach((g) => { const r = Import.resolve(db, { gpu: g.id }); ok(r && r.slots[0] && r.slots[0].part && r.slots[0].part.id === g.id, `GPU GUIDE → ${g.id} を引き継げる`); });
ok(Import.resolve(db, { gpu: 'rtx-9999' }).slots.length === 0, '未知のGPU IDは入れない');
// PC BUILD CHECK: 75構成すべて CPU / GPU / メモリが引き継げる
const PBP = require('../pc-build-check/build-profile.js');
builds.forEach((b) => {
  eq(Import.pcbcSlug(b), PBP.slugOf(b), `スラグの規則が build-profile.js と一致（${b.id}）`);
  const r = Import.resolve(db, { from: 'pcbc', build: PBP.slugOf(b) }, { builds });
  const by = Object.fromEntries(r.slots.map((s) => [s.category, s]));
  ok(by.cpu && by.cpu.part, `PC BUILD CHECK ${PBP.slugOf(b)}: CPU「${b.cpu}」を引き継げる`);
  ok(by.gpu && by.gpu.part, `PC BUILD CHECK ${PBP.slugOf(b)}: GPU「${b.gpu}」を引き継げる`);
  ok(by.memory && by.memory.part, `PC BUILD CHECK ${PBP.slugOf(b)}: メモリ「${b.ram}」を引き継げる`);
  ok(by.motherboard && (by.motherboard.part || by.motherboard.candidates.length), `PC BUILD CHECK ${PBP.slugOf(b)}: マザボの候補がある`);
  if (by.cpu && by.cpu.part && by.motherboard && by.motherboard.part) eq(by.cpu.part.specs.socket, by.motherboard.part.specs.socket, `PC BUILD CHECK ${PBP.slugOf(b)}: 引き継いだCPUとマザボのソケット一致`);
});
ok(Import.resolve(db, { from: 'pcbc', build: 'old-slug-999man' }, { builds }).slots.length === 0, '古い構成スラグでも壊れない');
// GAME PC GUIDE: 全ゲームで推奨構成のCPU・GPUが引き継げる
let gameMiss = [];
games.forEach((g) => {
  const r = Import.resolve(db, { game: g.slug || g.id, res: 'wqhd' }, { games });
  r.slots.forEach((s) => { if (!s.part) gameMiss.push(`${g.id}:${s.input}`); });
  ok(r.game && r.game.builds.length === g.builds.length, `GAME PC GUIDE ${g.id}: 推奨構成をすべて表示`);
});
ok(gameMiss.length === 0, 'GAME PC GUIDE の推奨CPU・GPUがすべてPC BUILDERに存在（未登録: ' + gameMiss.join(', ') + '）');
ok(Import.resolve(db, { game: 'no-such-game' }, { games }).slots.length === 0, '未知のゲームでも壊れない');
// UPGRADE
const up = Import.resolve(db, { from: 'upgrade', cgpu: 'rtx3060', ccpu: 'ryzen55600', cmem: '16', togpu: 'rtx5070', res: 'wqhd' });
eq(up.compare.a.items.gpu[0].id, 'rtx-3060', 'UPGRADE: 今のGPUを構成Aに入れる');
eq(up.compare.b.items.gpu[0].id, 'rtx-5070', 'UPGRADE: 交換後のGPUを構成Bに入れる');
eq(up.compare.a.items.memory[0].id, 'mem-generic-ddr4-16', 'UPGRADE: CPUの規格からメモリを再現');
const upBad = Import.resolve(db, { from: 'upgrade', cgpu: '<x>', ccpu: 'zzz' });
ok(upBad.notes.length >= 2 && !upBad.compare.a.items.gpu, 'UPGRADE: 未知の入力は入れずに理由を出す');
// Builds Hub
const hubPosts = rq('pc-builds-hub/posts.json');
const post = (Array.isArray(hubPosts) ? hubPosts : hubPosts.posts)[0];
const hub = Import.resolve(db, { from: 'hub', cpu: post.cpu, gpu: post.gpu, ram: post.ram, mb: post.motherboard, storage: post.storage, case: post.case, psu: post.psu, cooler: post.cooler, title: post.title });
const hb = Object.fromEntries(hub.slots.map((s) => [s.category, s]));
eq(hb.cpu.part && hb.cpu.part.id, 'ryzen75700x3d', 'Hub: CPUを名前で特定');
eq(hb.gpu.part && hb.gpu.part.id, 'rtx-4070-super', 'Hub: GPUを名前で特定');
ok(!hb.case.part, 'Hub: 未登録のケースは自動で入れない');
ok(!hb.psu.part && hb.psu.candidates.length > 0, 'Hub: 一致しない電源は候補を出す');
ok(!hb.motherboard.part, 'Hub: 未登録のマザボを推測で入れない');

/* ------------------------------------------------------------------
 *  6. 既存サイトからの導線
 * ------------------------------------------------------------------ */
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
ok(read('shared/nav/sippo-nav.js').indexOf("url: '/pc-builder/'") >= 0, '共通ナビ SERVICES に PC BUILDER がある');
ok(read('index.html').indexOf('/pc-builder/') >= 0, 'トップページから PC BUILDER へリンク');
const gpuPages = fs.readdirSync(path.join(ROOT, 'gpu-guide/gpu'));
gpuPages.forEach((id) => ok(read(`gpu-guide/gpu/${id}/index.html`).indexOf(`/pc-builder/?gpuid=${id}`) >= 0, `GPU GUIDE ${id} → PC BUILDER（GPU引き継ぎ）`));
ok(read('pc-build-check/script.js').indexOf('/pc-builder/?from=pcbc&amp;build=') >= 0, 'PC BUILD CHECK の診断結果 → PC BUILDER');
const gameFiles = fs.readdirSync(path.join(ROOT, 'game-pc-guide/games')).filter((f) => f.endsWith('.html'));
gameFiles.forEach((f) => ok(read('game-pc-guide/games/' + f).indexOf('/pc-builder/?game=') >= 0, `GAME PC GUIDE ${f} → PC BUILDER`));
ok(read('upgrade/upgrade-diagnose.js').indexOf('href="/pc-builder/?') >= 0 && read('upgrade/upgrade-diagnose.js').indexOf("'from=upgrade'") >= 0, 'UPGRADE の診断結果 → PC BUILDER');
ok(read('pc-builds-hub/post.js').indexOf('/pc-builder/?') >= 0, 'PC Builds Hub の投稿詳細 → PC BUILDER');
// PC BUILDER 自体の SEO
const html = read('pc-builder/index.html');
ok(/<link rel="canonical" href="https:\/\/sippo-pc\.jp\/pc-builder\/">/.test(html), 'canonical は /pc-builder/');
ok(html.indexOf('og:image" content="https://sippo-pc.jp/assets/ogp.png"') >= 0, 'OGP画像は png');
ok((html.match(/<h1[\s>]/g) || []).length === 1, 'h1 は1つ');
const localAssets = html.match(/(?:src|href)="(?:js\/pb-[a-z]+\.js|style\.css)[^"]*"/g) || [];
ok(localAssets.length >= 9 && localAssets.every((x) => /\?v=\w+/.test(x)) && new Set(localAssets.map((x) => x.match(/\?v=(\w+)/)[1])).size === 1, 'PC BUILDER の CSS・JS は同じ版番号つき（公開直後に新旧が混ざらない）');
ok(html.indexOf('js/pb-flow.js') >= 0 && html.indexOf('js/pb-flow.js') < html.indexOf('js/pb-app.js'), 'pb-flow.js は pb-app.js より先に読む');
ok(html.indexOf('アフィリエイト広告') >= 0, '広告表記がある');
const sm = read('pc-builder/sitemap.xml');
ok(sm.indexOf('<loc>https://sippo-pc.jp/pc-builder/</loc>') >= 0 && !/<loc>[^<]*\?/.test(sm), 'sitemap は正式URLだけ（クエリURLを載せない）');
ok(read('sitemap.xml').indexOf('https://sippo-pc.jp/pc-builder/sitemap.xml') >= 0, 'サイトマップインデックスに pc-builder を追加');
// 秘密情報を置いていない
['pc-builder/js/pb-app.js', 'pc-builder/js/pb-db.js', 'pc-builder/data/parts.json', 'pc-builder/data/prices.json'].forEach((f) => ok(!/(secret|accessKey|apikey|api_key)\s*[:=]/i.test(read(f)), `${f} に秘密鍵らしき値が無い`));

/* ------------------------------------------------------------------
 *  7. データ更新時の検査（仕様の整合・価格表・価格の扱い）
 *     パーツや価格を足したら、ここで矛盾・推測値・古い価格の扱いを検出する。
 * ------------------------------------------------------------------ */
const cpus = partsJson.parts.filter((p) => p.category === 'cpu');
cpus.forEach((c) => {
  const s = c.specs;
  ok(['socket', 'cores', 'threads', 'pCores', 'eCores', 'baseGHz', 'boostGHz', 'l3MB', 'tdpW', 'igpu'].every((k) => s[k] !== null && s[k] !== undefined), `CPU ${c.name}: 判定に使う仕様がそろっている`);
  ok(s.pCores + s.eCores === s.cores, `CPU ${c.name}: Pコア＋Eコア＝コア数`);
  ok(s.threads >= s.cores && s.threads <= s.cores * 2, `CPU ${c.name}: スレッド数がコア数〜2倍の範囲`);
  ok(s.baseGHz <= s.boostGHz, `CPU ${c.name}: 基本クロック ≦ 最大クロック`);
  ok(rules.cpuFamilies[c.family] && rules.cpuFamilies[c.family].socket === s.socket, `CPU ${c.name}: 世代とソケットが一致`);
  ok(c.maker !== 'Intel' || (Number.isFinite(s.maxPowerW) && s.maxPowerW >= s.tdpW), `CPU ${c.name}: Intel は最大ターボ電力 ≧ 基本電力`);
  ok(/F$/.test(c.name) ? s.igpu === 'none' : true, `CPU ${c.name}: F付きは内蔵GPUなし`);
  ok(partsJson.sources[c.source] && /oldid=\d+/.test(partsJson.sources[c.source].url), `CPU ${c.name}: 出典は版を固定したURL`);
  ok(s.boxCooler === null || s.boxCooler === false || typeof s.boxCooler === 'string', `CPU ${c.name}: 付属クーラーは 名前 / false（なし）/ null（未確認）`);
});
// ゲーム指数の借用は「内蔵GPUの有無以外が同じ」兄弟型番だけ
cpus.filter((c) => c.gameTierSameAs).forEach((c) => {
  ok(!Number.isFinite(engine.CPU_TIERS[c.id]), `${c.name}: CPU_TIERS にある型番は借用しない`);
  eq(db.byId[c.id].specs.gameTier, engine.CPU_TIERS[c.gameTierSameAs], `${c.name}: 兄弟型番 ${c.gameTierSameAs} のゲーム指数を使う`);
  ok(c.specs.igpu !== partsJson.parts.find((x) => x.id === c.gameTierSameAs).specs.igpu, `${c.name}: 兄弟型番とは内蔵GPUの有無だけが違う`);
});
eq(withSpec('corei514600k', { boostGHz: 5.4 }).byId.corei514600k.specs.gameTier, null, '仕様が違えば兄弟型番の指数を借りない（評価を作らない）');
ok(Score.gameScore(B({ cpu: 'corei514600k', gpu: 'rtx-5070', memory: 'mem-generic-ddr5-32' }), db, 'wqhd').reasons.some((r) => r.indexOf('Core i5-14600KF') >= 0), '借用したゲーム指数はスコアの理由に明記');
// B850 は Ryzen 9000 登場後のチップセット
eq(statusOf(B({ cpu: 'ryzen79800x3d', motherboard: 'asus-tuf-b850m-plus-wifi7', memory: 'corsair-cmk32gx5m2b6000c30' }), 'bios'), 'ok', 'B850 × Ryzen 9000 はBIOS更新なしで対応');
// 電源の奥行きの根拠
partsJson.parts.filter((p) => p.category === 'psu' && p.kind !== 'generic' && Number.isFinite(p.specs.depthMm)).forEach((p) => ok(!!p.specs.depthNote, `${p.name}: 奥行きの根拠（depthNote）がある`));
// ケースのファン数・ベイ数が 0 以上の整数
partsJson.parts.filter((p) => p.category === 'case').forEach((p) => ['fan120', 'fan140', 'bay35', 'bay25', 'slots'].forEach((k) => ok(p.specs[k] == null || (Number.isInteger(p.specs[k]) && p.specs[k] >= 0), `${p.name}: ${k} は0以上の整数か未確認`)));

// 価格表（prices.json）
const pm = pricesJson._meta;
ok(/^\d{4}-\d{2}-\d{2}$/.test(pm.updated) && Number.isFinite(pm.staleAfterDays), '価格表に更新日と「古い」とみなす日数がある');
Object.entries(pricesJson.items).forEach(([id, it]) => {
  const p = partsJson.parts.find((x) => x.id === id);
  ok(!!p && p.kind !== 'generic', `価格 ${id}: parts.json の実在製品を指す`);
  ok(!gpus.some((g) => g.id === id), `価格 ${id}: GPUチップの価格は書かない（gpus.json が正）`);
  ok(Number.isFinite(it.value) && it.value > 0 && it.value % 1000 === 0, `価格 ${id}: 千円単位の正の値`);
  ok(/^\d{4}-\d{2}-\d{2}$/.test(it.checkedAt) && pm.sources[it.source], `価格 ${id}: 確認日と出典がある`);
});
Object.entries(pricesJson.classes).filter(([k]) => k[0] !== '_').forEach(([k, c]) => {
  ok(Number.isFinite(c.value) && c.n >= 1 && c.range[0] <= c.value && c.value <= c.range[1], `同クラス価格 ${k}: 中央値が確認範囲の中にある`);
  ok(/^\d{4}-\d{2}-\d{2}$/.test(c.checkedAt) && pm.sources[c.source], `同クラス価格 ${k}: 確認日と出典がある`);
  ok(!/^gpu:/.test(k), `同クラス価格 ${k}: GPUは置かない`);
});
// 価格の優先順位と表示用の情報
const p7800 = db.byId.ryzen77800x3d.price;
ok(p7800.type === 'retail' && p7800.basis === 'pc-builder/data/prices.json' && /^https:/.test(p7800.sourceUrl), '製品の小売目安は prices.json から（出典URLつき）');
eq(db.byId['mem-generic-ddr5-32'].price.value, pricesJson.classes['memory:DDR5:32'].value, 'DDR5 32GB の目安パーツは同クラスの小売目安');
eq(db.byId['mem-generic-ddr5-32'].price.type, 'class', '同クラスの価格は class として区別');
eq(db.byId['mem-generic-ddr5-16'].price, null, 'メモリは実売と大きく違う既存価格を使わない（同クラス価格が無ければ未登録）');
eq(db.byId['ssd-generic-sata-25'].price, null, 'SSDも既存価格に戻らない');
ok(db.byId['psu-generic-650'].price && /日付なし/.test(db.byId['psu-generic-650'].price.label), '小売目安の無い電源は既存の目安を「日付なし」と明記して使う');
ok(/BTO構成用/.test(db.byId.ryzen77700.price.label), '小売価格を確認できなかったCPUは「BTO構成用の目安」と明記');
ok(!!db.byId['rtx-5070'].guidePrice.notice && !db.byId['rtx-3060'].guidePrice.notice, 'GPU GUIDE の新品価格には実売との差の注意が付く（中古相場には付けない）');
eq(db.byId.ryzen77800x3d.price.stale, false, '確認したばかりの価格は古くない');
eq(makeDb(null, null, null, new Date('2027-01-31T12:00:00+09:00')).byId.ryzen77800x3d.price.stale, true, `確認から${pm.staleAfterDays}日を過ぎた価格は「古い」`);
const oldDb = makeDb(null, null, null, new Date('2027-01-31T12:00:00+09:00'));
eq(oldDb.byId.ryzen77800x3d.price.valid, false, '古くなった価格は「有効な価格」ではない');
eq(Score.costScore(good, oldDb, Score.gameScore(good, db, 'wqhd'), Score.videoScore(good, db)).grade, 'na', '主要パーツの価格が古くなったらコスパは評価不可（古い価格で点数を作らない）');
eq(Score.priceSummary(good, oldDb).total, 0, '古くなった価格は合計に入れない');
// 価格変動の影響
const cg = Score.scoreBuild(good, db, 'wqhd', rGood.power).axes.cost;
ok(cg.sensitivity && cg.sensitivity.up <= cg.score && cg.score <= cg.sensitivity.down, 'コスパ：価格が上がると点が下がり、下がると上がる');
ok(cg.reasons.some((r) => r.indexOf('10%') >= 0), 'コスパの理由に価格変動の影響を書く');
ok(cg.sensitivity.steps.length === 3 && cg.sensitivity.steps.every((x, i, a) => x.up <= cg.score && x.down >= cg.score && (i === 0 || (x.up <= a[i - 1].up && x.down >= a[i - 1].down))), 'コスパ：価格±10/30/50%で点数が単調に変わる');

/* 価格の3区分（実売確認価格・参考中央値・既存の参考価格）と合計・コスパの条件 */
eq(db.byId.ryzen77800x3d.price.tier, 'retail', '型番一致の価格は実売確認価格');
eq(db.byId['mem-generic-ddr5-32'].price.tier, 'median', '容量別の価格は参考中央値');
eq(db.byId['rtx-5070'].price.tier, 'median', 'GPUチップの価格は参考中央値');
eq(db.byId['psu-generic-650'].price.tier, 'reference', '日付の無い既存価格は参考価格（未確認）');
ok(['retail', 'median', 'reference'].every((t) => db.list.filter((p) => p.price).every((p) => ['retail', 'median', 'reference'].indexOf(p.price.tier) >= 0)), 'すべての価格に3区分のどれかが付く');
ok(db.list.filter((p) => p.price && p.price.tier === 'reference').every((p) => p.price.valid === false), '既存の参考価格は有効な価格として扱わない');
const refBuild = B({ ...GOOD, psu: 'psu-generic-650' });
const refSum = Score.priceSummary(refBuild, db);
ok(refSum.refRows.some((r) => r.id === 'psu-generic-650') && !refSum.rows.some((r) => r.id === 'psu-generic-650'), '参考価格だけのパーツは合計に入れず別に数える');
const noChipGpu = gpus.find((g) => g.market !== 'used' && !pricesJson.gpuChips[g.id] && Number.isFinite(g.price));
if (noChipGpu) {
  const c = Score.scoreBuild(B({ ...GOOD, gpu: noChipGpu.id, gpuboard: [] }), db, 'wqhd').axes.cost;
  eq(c.grade, 'na', `確認日つきの価格が無いGPU（${noChipGpu.id}）ではコスパは評価不可`);
  ok(c.reasons.some((r) => r.indexOf('最近調べた価格がないパーツ') >= 0), 'その理由（最近調べた価格がない）を表示');
}
// グラボ製品に実売確認価格があれば、その製品価格を使い、チップの価格は数えない
const boardBuild = B({ ...GOOD, gpu: 'rx-9070-xt', gpuboard: 'asus-prime-rx9070xt-o16g' });
const bs = Score.priceSummary(boardBuild, db);
ok(bs.boardPriced && bs.rows.some((r) => r.category === 'gpuboard' && r.value === pricesJson.items['asus-prime-rx9070xt-o16g'].value) && !bs.rows.some((r) => r.category === 'gpu'), 'グラボ製品の実売確認価格を使い、チップの価格と二重に数えない');
// gpuChips のデータ
Object.entries(pricesJson.gpuChips).filter(([k]) => k[0] !== '_').forEach(([id, c]) => {
  const g = gpus.find((x) => x.id === id);
  ok(!!g && g.market !== 'used', `gpuChips ${id}: gpus.json の新品GPU`);
  ok(c.n >= 3 && c.range[0] <= c.value && c.value <= c.range[1] && c.low === c.range[0], `gpuChips ${id}: 3製品以上の中央値で範囲内`);
  ok(/^\d{4}-\d{2}-\d{2}$/.test(c.checkedAt) && pricesJson._meta.sources[c.source], `gpuChips ${id}: 確認日と出典がある`);
});
// メモリ・SSDの実在製品
const realMem = partsJson.parts.filter((p) => p.category === 'memory' && p.kind !== 'generic');
const realSsd = partsJson.parts.filter((p) => p.category === 'storage' && p.kind !== 'generic' && p.specs.kind === 'nvme');
ok(realMem.length >= 10, `実在メモリが10製品以上（${realMem.length}）`);
ok(realSsd.length >= 10, `実在NVMe SSDが10製品以上（${realSsd.length}）`);
realMem.forEach((p) => ok(['DDR4', 'DDR5'].indexOf(p.specs.type) >= 0 && Number.isFinite(p.specs.speed) && Number.isFinite(p.specs.capacityGB) && Number.isInteger(p.specs.modules) && p.specs.capacityGB % p.specs.modules === 0, `メモリ ${p.name}: 規格・速度・容量・枚数がそろっている`));
realSsd.slice(1).forEach((p) => ok(p.specs.m2Length === '2280' && /^PCIe [345]\.0 NVMe$/.test(p.specs.interface) && Number.isFinite(p.specs.seqReadMBs), `SSD ${p.name}: M.2 2280・接続・速度がそろっている`));
[...realMem, ...realSsd].forEach((p) => ok(['official', 'distributor'].indexOf(partsJson.sources[p.source].kind) >= 0, `${p.name}: 出典はメーカーか国内正規代理店`));
eq(statusOf(B({ ...GOOD, memory: 'cfd-w5u6000cs-16gc38f' }), 'memtype'), 'ok', '追加したDDR5メモリはDDR5マザボで対応');
eq(statusOf(B({ ...GOOD, memory: 'corsair-cmw32gx4m2d3600c18' }), 'memtype'), 'ng', 'DDR4メモリはDDR5マザボで非対応');
eq(statusOf(B({ ...GOOD, storage: 'kioxia-exceria-g3-2tb' }), 'm2'), 'ok', '追加したNVMe SSDはM.2の判定に対応');
// コスパの公平性: 分母はCPU・GPU・マザボ・メモリだけ（ケース・電源の価格の有無で点数が変わらない）、ゲームと動画編集の両方が必要
const costOf = (b) => Score.scoreBuild(b, db, 'wqhd').axes.cost;
eq(costOf(B({ ...GOOD, case: [], psu: [], cooler: [], storage: [] })).score, costOf(good).score, 'ケース・電源・クーラー・ストレージの有無でコスパの点数は変わらない');
eq(Score.scoreBuild(B({ cpu: 'ryzen55600g', motherboard: 'mb-generic-am4-b550-atx', memory: 'mem-generic-ddr4-32' }), db, 'fhd').axes.cost.grade, 'na', 'ゲームが評価不可（内蔵GPU）の構成はコスパも評価不可');
// prices.json が無くても DB は作れる（既存データの目安だけになる）
const noPrices = Db.buildDb({ parts: partsJson, rules, gpus, partPrices, engine, gpuTarget });
ok(noPrices.list.length === db.list.length && noPrices.byId['mem-generic-ddr5-32'].price === null, '価格表が読めなくても動き、停止中のカテゴリは未登録のまま');
// エンコーダー: NVIDIA は公式表で照合済み、AMD は未照合と区別する
ok(db.byId['rtx-5070'].specs.encoderVerified && !db.byId['rx-9070-xt'].specs.encoderVerified, 'エンコーダー情報の照合状況をGPUごとに区別');
ok(Score.streamScore(B({ cpu: 'ryzen77800x3d', gpu: 'rx-9070-xt', memory: 'mem-generic-ddr5-32' }), db, 'wqhd').reasons.some((r) => r.indexOf('未照合') >= 0), 'AMD GPUの配信スコアは「未照合」と明記');
// 検証スクリプト
const vp =JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'validate-parts.js'), '--json']).toString());
eq(vp.errors.length, 0, 'validate-parts.js のエラー0件');
ok(!vp.missingKey.cpu, 'CPUは判定に使う主要仕様がすべてそろっている');

/* ------------------------------------------------------------------
 *  8. 画面の案内（pb-flow.js）と5角形グラフの描き方（pb-charts.js）
 * ------------------------------------------------------------------ */
const Flow = require('./js/pb-flow.js');
const Charts = require('./js/pb-charts.js');
const states = (b) => Flow.categoryStates(b, db, Db.CATEGORIES, Compat.checkBuild(b, db, Db.CATEGORIES));
// 必須・任意は構成で変わる
eq(states(B({ cpu: 'ryzen57500f' })).gpu.need, 'required', '内蔵GPUの無いCPUではGPUが必須');
eq(states(B({ cpu: 'ryzen55600g' })).gpu.need, 'recommended', '内蔵GPUのあるCPUではGPUは「おすすめ」（必須の数には入れない）');
eq(Flow.nextCategory(states(B({ cpu: 'ryzen55600g' })), 'cpu'), 'gpu', '内蔵GPUのCPUでも、次はGPUを案内する（ゲーム用途を取りこぼさない）');
eq(Flow.nextCategory(states(B({ cpu: 'ryzen55600g' })), 'cpu', { gpu: true }), 'motherboard', '「GPUなしで進む」を選んだら次はマザボ');
eq(states(B({ cpu: 'ryzen55600' })).cooler.need, 'optional', '付属クーラーのあるCPU（5600）ではクーラーは任意');
eq(states(B({ cpu: 'ryzen77800x3d' })).cooler.need, 'required', '付属クーラーの無いCPU（7800X3D）ではクーラーが必須');
eq(states(B({ cpu: 'corei714700k' })).cooler.need, 'required', '付属クーラーが未確認のCPUではクーラーを必須として案内');
eq(states(B({})).gpuboard.need, 'locked', 'GPU未選択ではグラボ製品は選べない状態');
eq(states(B({ gpu: 'rtx-5070' })).gpuboard.need, 'optional', 'GPUを選ぶとグラボ製品は任意で選べる');
// 状態（選択済み・要確認・非対応）
eq(states(B({ cpu: 'ryzen57500f' })).cpu.state, 'ok', 'CPUだけなら選択済み');
eq(states(B({ cpu: 'ryzen57500f', motherboard: 'asus-prime-b760m-a-d4' })).cpu.state, 'ng', 'ソケットが合わないと非対応');
eq(states(B({ cpu: 'ryzen79800x3d', motherboard: 'asus-tuf-b650-plus-wifi' })).motherboard.state, 'check', 'BIOS要確認なら要確認');
eq(states(B({})).cpu.state, 'empty', '未選択は empty');
// 進み具合と次に選ぶカテゴリ
const stEmpty = states(B({}));
eq(Flow.nextCategory(stEmpty, 'cpu'), 'gpu', '空の構成でCPUを見ているときの次はGPU');
eq(Flow.nextCategory(stEmpty, 'memory'), 'storage', '今のカテゴリより後ろの未選択を優先');
const stDone = states(good);
ok(Flow.progress(stDone).complete && Flow.nextCategory(stDone, 'cpu') === null, '必須がそろうと次は無し（完成）');
const stIgpu = states(B({ cpu: 'ryzen55600g', motherboard: 'mb-generic-am4-b550-atx', memory: 'mem-generic-ddr4-32', storage: 'ssd-generic-nvme-1tb', psu: 'psu-generic-650', case: 'fractal-north' }));
ok(Flow.progress(stIgpu).complete, '内蔵GPU・付属クーラーのCPUなら、GPUとクーラーなしで必須がそろう');
// 製品カードの主要スペック：全パーツで例外なし・最大4項目・値が無ければ null（推測しない）
db.list.forEach((p) => {
  let cs; try { cs = Flow.cardSpecs(p, db); } catch (e) { cs = null; }
  ok(Array.isArray(cs) && cs.length >= 1 && cs.length <= 4 && cs.every((x) => x.label && (x.value === null || typeof x.value === 'string')), `カードの主要スペック（${p.id}）`);
});
eq(Flow.cardSpecs(db.byId.ryzen77800x3d, db)[0].value, '8 / 16', 'CPUカード：コア / スレッド');
eq(Flow.cardSpecs(withSpec('ryzen77800x3d', { cores: null }).byId.ryzen77800x3d, db)[0].value, null, '値が無い項目は「未確認」（null）で推測しない');
// グラフの下の説明：根拠のある文だけ
const insGood = Flow.insights(Score.scoreBuild(good, db, 'wqhd', rGood.power), 'wqhd', db.byId['rtx-5070']);
ok(insGood.length <= 5 && insGood.every((x) => ['good', 'warn', 'info'].indexOf(x.kind) >= 0), '説明は最大5つ・種類つき');
ok(insGood.some((x) => /75点/.test(x.text)), 'ゲーム性能が75点以上なら「検討できる目安に届いている」（基準を明記）');
ok(!insGood.some((x) => /どんなゲームも|必ず|絶対/.test(x.text)), '裏付けのない断定をしない');
const insIgpu = Flow.insights(Score.scoreBuild(B({ cpu: 'ryzen55600g', memory: 'mem-generic-ddr4-16' }), db, 'fhd'), 'fhd', null);
ok(insIgpu.some((x) => x.kind === 'info' && /ゲーム性能は評価不可（N\/A）/.test(x.text)), '評価不可の項目は「N/A」と理由を説明');
const insLowMem = Flow.insights(Score.scoreBuild(B({ cpu: 'ryzen77800x3d', gpu: 'rtx-5070', memory: { id: 'mem-generic-ddr5-16', qty: 0 } }), db, 'fhd'), 'fhd', db.byId['rtx-5070']);
ok(Array.isArray(insLowMem), '説明の生成で例外が起きない（メモリ数量の異常値）');

// 5角形：評価不可を0点で補わない・区間ごとに塗る
const rp = Charts._radarPaths;
const segs = (r) => (r.edge.match(/M/g) || []).length;
eq(segs(rp([80, 70, 60, 50, 40], [true, true, true, true, true])), 5, '5項目すべて有効なら5辺（閉じた5角形）');
eq(segs(rp([80, 70, 60, 50, 40], [true, true, true, true, false])), 3, '1項目が評価不可なら、その軸をまたぐ2辺を描かない');
eq(segs(rp([80, 70, 60, 50, 40], [true, false, true, false, true])), 1, '複数が評価不可なら、隣り合う有効な軸どうしだけ');
eq(rp([80, 70, 60, 50, 40], [false, false, false, false, false]).fill, '', 'すべて評価不可なら図形を描かない（枠だけ）');
ok(/L180\.0,168\.0/.test(rp([0, 70, 60, 50, 40], [true, true, true, true, true]).edge), '実際の0点は中心に頂点を置く（評価不可とは別）');
eq(segs(rp([80, 70, 60, 50, 40], [true, true, true, true, true])), (rp([80, 70, 60, 50, 40], [true, true, true, true, true]).fill.match(/Z/g) || []).length, '塗りは辺と同じ区間だけ');
// 画面の言葉：内部の呼び方（確認日・未確認・中央値など）を出さない／一括リセットがある
{
  const appSrc = read('pc-builder/js/pb-app.js');
  const strs = (appSrc.match(/'[^'\n]*'/g) || []).join('\n') + html.replace(/<!--[\s\S]*?-->/g, '');
  ['確認日', '日付なし', '未確認', '実売確認価格', '参考中央値', '参考価格（未確認）', '参考価格 未登録'].forEach((w) => ok(strs.indexOf(w) < 0, `画面の文言に「${w}」を出さない（わかりやすい言葉にする）`));
  ok(/data-action="reset">[^<]*すべて外す/.test(html) && /pb-progress__reset[^']*' data-action="reset"|pb-progress__reset" data-action="reset"/.test(appSrc), '選んだパーツを一括で外すボタン（構成の下と進み具合の下）');
}
ok(!/NaN|undefined/.test(JSON.stringify(rp([NaN, 70, 60, 50, 40].map((x) => (Number.isFinite(x) ? x : 0)), [false, true, true, true, true]))), 'NaN が混じっても座標に NaN を出さない（無効な軸は描かない）');

/* ------------------------------------------------------------------ */
console.log(`\nPC BUILDER テスト: ${pass} 件成功 / ${fail} 件失敗`);
if (fail) { failures.slice(0, 60).forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
