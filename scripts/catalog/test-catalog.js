#!/usr/bin/env node
'use strict';
/**
 * 共通パーツデータ（shared/catalog/）のテスト。  node scripts/catalog/test-catalog.js
 *
 *  1. 本番データ：致命的エラー0・生成物が正本と一致・生成の再実行で差分が出ない
 *  2. 反映：正本の値を変えると GPU GUIDE（gpus.json・UPGRADE の生成ブロック）と PC BUILDER の両方が変わる
 *     （リポジトリのファイルは書き換えない。一時フォルダの複製と、メモリ上の複製で確かめる）
 *  3. 検証が壊れたデータを検出する（ID重複・型/単位・日付・価格・出典・二重管理・サイト間の矛盾）
 *  4. 価格：未確認・価格不明・古い価格でも表示が破綻せず、合計に 0 円や古い価格を入れない
 *  5. 互換性：既存ID・共有URL・保存済み構成が読める
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('./lib.js');
const V = require('./validate.js');
const { Catalog } = L;
const ROOT = L.ROOT;

const Db = require(path.join(ROOT, 'pc-builder/js/pb-db.js'));
const Score = require(path.join(ROOT, 'pc-builder/js/pb-score.js'));
const Compat = require(path.join(ROOT, 'pc-builder/js/pb-compat.js'));
const Codec = require(path.join(ROOT, 'pc-builder/js/pb-codec.js'));
const engine = require(path.join(ROOT, 'upgrade/upgrade-engine.js'));
const gpuTarget = require(path.join(ROOT, 'shared/gpu/gpu-target.js'));

let pass = 0, fail = 0;
const failures = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; failures.push(msg); } }
function eq(a, b, msg) { ok(a === b, `${msg}（期待: ${JSON.stringify(b)} / 実際: ${JSON.stringify(a)}）`); }
const clone = (x) => JSON.parse(JSON.stringify(x));
const rj = (rel) => L.readJson(rel);

const catalog = L.loadCatalog();
// 基準日は「本番データの最新の確認日」以降にする（それより前だと確認日が未来扱いになる）。2026-11-15 に価格・電源仕様を再確認したため更新
const NOW = new Date('2026-11-15T21:00:00+09:00');
const inputs = { parts: rj('pc-builder/data/parts.json'), rules: rj('pc-builder/data/rules.json'), gpus: rj('gpu-guide/gpus.json'), partPrices: rj('shared/parts/part-prices.json'), prices: rj('pc-builder/data/prices.json'), engine, gpuTarget };
const dbOf = (cat, now, extra) => Db.buildDb(Object.assign({}, clone(inputs), { engine, gpuTarget, catalog: cat, now: now || NOW }, extra || {}));
const recOf = (cat, c, id) => cat[c].products.find((r) => r.id === id);
const fieldSet = (rec, name, value) => { for (const g of rec.specGroups) if (name in g.fields) { g.fields[name] = value; return; } throw new Error('no field ' + name); };
const codes = (res, sev) => res.issues.filter((i) => !sev || i.severity === sev).map((i) => i.code);
const vmem = (cat, extra) => V.validate(Object.assign({ catalog: cat, now: NOW, generated: false }, extra || {}));

/* ------------------------------------------------------------------
 *  1. 本番データ
 * ------------------------------------------------------------------ */
const real = V.validate({ now: NOW });
eq(real.summary.errors, 0, '本番データに致命的エラーが無い: ' + real.issues.filter((i) => i.severity === 'error').slice(0, 3).map((i) => i.code + ' ' + i.id + ' ' + i.reason).join(' / '));
ok(real.issues.every((i) => ['error', 'warning', 'info'].includes(i.severity) && Array.isArray(i.affects) && 'checkedAt' in i && 'source' in i && 'current' in i), '指摘はすべて 重大度・現在値・出典・確認日・影響先 の形');
const out1 = L.computeOutputs(ROOT).outputs;
const out2 = L.computeOutputs(ROOT).outputs;
for (const [rel, text] of Object.entries(out1)) {
  ok(L.sameText(L.readText(rel), text), `${rel} は正本から生成した内容と一致（生成し忘れ・手編集なし）`);
  eq(out2[rel], text, `${rel} は何度生成しても同じ（不要な差分が出ない）`);
}
const revPrev = rj(L.PATHS.revisions);
const rev = L.computeRevisions(catalog, revPrev, new Date('2030-01-01T00:00:00Z'));
eq(rev.changed.length + rev.removed.length, 0, '正本が変わらなければ更新履歴も変わらない（日付が進んでも）');
eq(rev.json.replace(/\r\n/g, '\n'), L.readText(L.PATHS.revisions).replace(/\r\n/g, '\n'), 'revisions.json は再計算しても同じ');

// 生成した gpus.json は旧形式の全項目を持つ（他サイトのスクリプトが読む形）
const gj = JSON.parse(out1[L.PATHS.gpusJson]);
const ed = L.loadEditorial();
eq(gj.length, ed.gpus.length, 'gpus.json の件数は GPU GUIDE 掲載分（gpu-editorial.json）と一致');
eq(gj.map((g) => g.id).join(), ed.gpus.map((g) => g.id).join(), '掲載順は gpu-editorial.json の順');
gj.forEach((g) => {
  ok(['id', 'name', 'brand', 'vram', 'target', 'score', 'price', 'power', 'rasterScore'].every((k) => g[k] !== undefined && g[k] !== null), `${g.id}: gpus.json の必須項目がそろう`);
  eq(g.target, gpuTarget.deriveTarget(g), `${g.id}: target は rasterScore から導出（手で書かない）`);
});
ok(!Catalog.products(catalog.gpu).filter((r) => !Catalog.listed(r, 'gpu-guide')).some((r) => gj.some((g) => g.id === r.id)), 'UPGRADE 専用のGPUは gpus.json に出さない');
// UPGRADE の生成ブロック
for (const r of Catalog.products(catalog.gpu).filter((x) => Catalog.listed(x, 'upgrade'))) {
  const s = Catalog.specs(r);
  const k = Catalog.engineKey(r.id);
  if (Number.isFinite(s.boardPowerW)) eq(engine.GPU_POWER[k], s.boardPowerW, `${r.id}: UPGRADE の GPU_POWER = 正本の boardPowerW`);
  const psu = Catalog.field(r, 'recommendedSystemPowerW');
  if (psu.basis === 'official' && Number.isFinite(psu.value)) eq(engine.GPU_POWER_SPEC[k] && engine.GPU_POWER_SPEC[k].psu, psu.value, `${r.id}: UPGRADE の公式推奨電源 = 正本`);
  else ok(!engine.GPU_POWER_SPEC[k], `${r.id}: 公式値でない推奨電源は UPGRADE の公式表に入れない`);
}
// 意味の違う数値を別項目にしている
ok(Catalog.products(catalog.gpu).every((r) => { const s = Catalog.specs(r); return !(Number.isFinite(s.boardPowerW) && Number.isFinite(s.recommendedSystemPowerW)) || s.recommendedSystemPowerW > s.boardPowerW; }), 'GPU消費電力と推奨システム電源は別項目（推奨電源 > 消費電力）');
ok(Catalog.products(catalog.cpu).every((r) => { const s = Catalog.specs(r); return s.maxPowerW === null || s.maxPowerW >= s.tdpW; }), 'CPUのTDPと最大電力は別項目（最大電力 ≧ TDP、AMD は null＝未確認）');

/* ------------------------------------------------------------------
 *  2. 反映：正本を1か所変えると GPU GUIDE と PC BUILDER の両方が変わる
 * ------------------------------------------------------------------ */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sippo-catalog-'));
try {
  for (const rel of [L.PATHS.gpu, L.PATHS.cpu, L.PATHS.sources, L.PATHS.config, L.PATHS.schema, L.PATHS.editorial, L.PATHS.gpusJson, L.PATHS.engine]) {
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), path.join(tmp, rel));
  }
  const cat2 = L.loadCatalog(tmp);
  const r5070 = recOf(cat2, 'gpu', 'rtx-5070');
  fieldSet(r5070, 'boardPowerW', 251);
  fieldSet(r5070, 'recommendedSystemPowerW', 700);
  fieldSet(r5070, 'vramGB', 16);
  r5070.scores.sippoRaster.value = 79;
  Catalog.latestOfType(r5070, 'market-median').amount = 171000;
  Catalog.latestOfType(r5070, 'reference').amount = 119000;
  fs.writeFileSync(path.join(tmp, L.PATHS.gpu), JSON.stringify(cat2.gpu, null, 2) + '\n');
  const o = L.computeOutputs(tmp).outputs;
  const g2 = JSON.parse(o[L.PATHS.gpusJson]).find((g) => g.id === 'rtx-5070');
  ok(g2.power === 251 && g2.vram === 16 && g2.rasterScore === 79 && g2.price === 119000, 'GPU GUIDE（gpus.json）に正本の変更が反映される');
  ok(/rtx5070: 251/.test(o[L.PATHS.engine]) && /rtx5070:\s+\{ psu: 700,/.test(o[L.PATHS.engine]), 'UPGRADE（upgrade-engine.js）に正本の変更が反映される');
  const d2 = dbOf(cat2);
  const p2 = d2.byId['rtx-5070'];
  ok(p2.specs.powerW === 251 && p2.specs.officialPsuW === 700 && p2.specs.vram === 16 && p2.specs.raster === 79, 'PC BUILDER に正本の仕様の変更が反映される');
  eq(p2.price.value, 171000, 'PC BUILDER の価格（実売相場）に正本の変更が反映される');
  eq(p2.guidePrice.value, 119000, 'PC BUILDER の「GPU GUIDE掲載の目安」も同じ正本の reference');
  // CPU
  const r7800 = recOf(cat2, 'cpu', 'ryzen77800x3d');
  fieldSet(r7800, 'boostGHz', 5.1);
  Catalog.latestOfType(r7800, 'lowest').amount = 61000;
  const d3 = dbOf(cat2);
  ok(d3.byId.ryzen77800x3d.specs.boostGHz === 5.1 && d3.byId.ryzen77800x3d.price.value === 61000, 'CPUの仕様・価格の変更が PC BUILDER に反映される');
  // 変えた後は「生成物が古い」を検出し、元に戻せば一致に戻る
  const stale = V.validate({ root: tmp, now: NOW, crossRefs: false });
  ok(codes(stale, 'error').includes('generated-stale'), '正本だけ変えて生成し忘れると致命的エラー（生成物の不一致）');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
ok(!fs.existsSync(tmp), '反映テスト用の一時ファイルを消した（リポジトリは変更していない）');

/* ------------------------------------------------------------------
 *  3. 検証が壊れたデータを検出する
 * ------------------------------------------------------------------ */
function broken(mut, extra) { const c = clone(catalog); mut(c); return vmem(c, extra); }
// 価格の取得記録（evidence）と対象VRAM（2026-11-15〜）
{
  const mm = (c, id) => Catalog.latestOfType(recOf(c, 'gpu', id), 'market-median');
  ok(real.issues.filter((i) => /^evidence-|^price-variant$/.test(i.code) && i.severity === 'error').length === 0, '本番データの実売相場は取得記録から再計算した値と一致する');
  ok(codes(broken((c) => { mm(c, 'rtx-5060').amount = 99000; }), 'error').includes('evidence-mismatch'), '取得記録と違う金額を検出');
  ok(codes(broken((c) => { mm(c, 'rtx-5060').sampleSize = 20; }), 'error').includes('evidence-mismatch'), '取得記録と違う製品数を検出');
  ok(codes(broken((c) => { mm(c, 'rtx-5060-ti').vramGB = 8; }), 'error').includes('price-variant'), '16GB版の価格を8GBとして使う（VRAM違いへの流用）を検出');
  ok(mm(catalog, 'rtx-5060-ti').vramGB === 16 && mm(catalog, 'rx-9060-xt').vramGB === 16, 'RTX 5060 Ti・RX 9060 XT の価格は16GB版と明記');
  ok(codes(broken((c) => { mm(c, 'rtx-5060').evidence = 'shared/catalog/evidence/no-such.json'; }), 'error').includes('evidence-invalid'), '読めない取得記録を検出');
}
ok(codes(broken((c) => c.gpu.products.push(clone(recOf(c, 'gpu', 'rtx-5070')))), 'error').includes('id-duplicate'), 'ID重複を検出');
ok(codes(broken((c) => { recOf(c, 'cpu', 'ryzen55500').id = 'Ryzen 5 5500'; }), 'error').includes('id-invalid'), '不正なIDを検出');
ok(codes(broken((c) => fieldSet(recOf(c, 'gpu', 'rtx-5070'), 'vramGB', '12GB')), 'error').includes('type-mismatch'), '型の誤り（"12GB" を数値欄に）を検出');
ok(codes(broken((c) => fieldSet(recOf(c, 'gpu', 'rtx-5070'), 'boardPowerW', 0.25)), 'error').includes('type-mismatch'), '単位の誤り（kW で入力）を範囲外として検出');
ok(codes(broken((c) => { recOf(c, 'gpu', 'rtx-5070').specGroups[0].fields.boardPower = 250; }), 'error').includes('field-unknown'), '定義に無い項目名（単位の付け忘れ）を検出');
ok(codes(broken((c) => { recOf(c, 'gpu', 'rtx-5070').specGroups[0].checkedAt = '2026/11/09'; }), 'error').includes('date-invalid'), '不正な日付を検出');
ok(codes(broken((c) => { Catalog.latestOfType(recOf(c, 'gpu', 'rtx-5070'), 'market-median').checkedAt = '2027-01-01'; }), 'error').includes('date-future'), '未来の確認日を検出');
ok(codes(broken((c) => { Catalog.latestOfType(recOf(c, 'cpu', 'ryzen77800x3d'), 'lowest').amount = 0; }), 'error').includes('price-invalid'), '0円の価格を検出（不明なら登録しない）');
ok(codes(broken((c) => { Catalog.latestOfType(recOf(c, 'cpu', 'ryzen77800x3d'), 'lowest').amount = -1000; }), 'error').includes('price-invalid'), '負の価格を検出');
ok(codes(broken((c) => { Catalog.latestOfType(recOf(c, 'cpu', 'ryzen77800x3d'), 'lowest').currency = 'USD'; }), 'error').includes('price-invalid'), '通貨の誤りを検出');
ok(codes(broken((c) => { Catalog.latestOfType(recOf(c, 'cpu', 'ryzen77800x3d'), 'lowest').checkedAt = null; }), 'error').includes('price-undated'), '合計に入れる種類の価格に確認日が無いことを検出');
ok(codes(broken((c) => { Catalog.latestOfType(recOf(c, 'gpu', 'rtx-3060'), 'used-range').min = 99999; }), 'error').includes('price-invalid'), '中古相場の min > max を検出');
ok(codes(broken((c) => { Catalog.latestOfType(recOf(c, 'gpu', 'rtx-5070'), 'market-median').source = 'nowhere'; }), 'error').includes('source-missing'), '登録されていない出典IDを検出');
ok(codes(broken((c) => { recOf(c, 'cpu', 'corei714700k').specGroups[0].fields.maxPowerW = 100; }), 'error').includes('spec-inconsistent'), 'TDPと最大電力の取り違え（最大電力 < TDP）を検出');
ok(codes(broken((c) => { recOf(c, 'cpu', 'ryzen77800x3d').sameSpecsExceptIgpu = 'no-such-cpu'; }), 'error').includes('ref-missing'), '参照先の欠落を検出');
ok(codes(broken((c) => fieldSet(recOf(c, 'cpu', 'ryzen77800x3d'), 'cores', 6)), 'error').includes('value-conflict'), 'PC BUILD CHECK（part-prices.json）との仕様の矛盾を検出');
ok(codes(broken((c) => { c.gpu.products = c.gpu.products.filter((r) => r.id !== 'rx-9070'); }), 'error').includes('ref-missing'), 'GPU GUIDE・PC BUILD CHECK が参照するGPUの欠落を検出');
ok(codes(broken((c) => { c.sources.sources['wiki-zen4'].url = 'wiki/zen4'; }), 'error').includes('source-invalid'), '不正な出典URLを検出');
// 警告と把握用（サイトは止めない）
const nul = broken((c) => fieldSet(recOf(c, 'cpu', 'ryzen77800x3d'), 'boostGHz', null));
ok(nul.summary.errors === 0 && nul.issues.some((i) => i.code === 'unverified-value' && i.id === 'ryzen77800x3d' && i.severity === 'info'), '未確認（null）は把握用であってエラーではない');
const later = vmem(clone(catalog), { now: new Date('2027-03-01T12:00:00+09:00') });
ok(later.summary.errors === 0 && later.issues.some((i) => i.code === 'price-stale' && i.severity === 'warning'), '古くなった価格は警告（致命的ではない）');
const noUrl = broken((c) => { c.sources.sources['nvidia-rtx-5070-family'].url = null; });
ok(noUrl.issues.some((i) => i.code === 'source-url-missing' && i.id === 'rtx-5070'), '出典URLの無い公式値を「出典不足」として警告');
ok(codes(real).includes('price-gap'), '確認日なしの参考価格と実売相場の大きな差を警告（どちらが正しいかは判定しない）');
// 二重管理（PC BUILDER の旧ファイルへの書き戻し）
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'sippo-catalog-'));
try {
  for (const rel of ['pc-builder/data/parts.json', 'pc-builder/data/prices.json', 'pc-builder/data/rules.json', L.PATHS.editorial, 'shared/parts/part-prices.json', 'pc-build-check/builds.json', L.PATHS.engine]) {
    fs.mkdirSync(path.dirname(path.join(tmp2, rel)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), path.join(tmp2, rel));
  }
  const pr = JSON.parse(fs.readFileSync(path.join(tmp2, 'pc-builder/data/prices.json'), 'utf8'));
  pr.items.ryzen77800x3d = { value: 1000, checkedAt: '2026-11-01', source: 'kakaku-mb' };
  pr.gpuChips = {};
  fs.writeFileSync(path.join(tmp2, 'pc-builder/data/prices.json'), JSON.stringify(pr));
  const r2 = V.validate({ root: tmp2, catalog: clone(catalog), now: NOW, generated: false });
  ok(r2.issues.filter((i) => i.code === 'duplicate-master').length >= 2, 'PC BUILDER の旧ファイルにCPU価格・GPU価格を書き戻すと二重管理として検出');
} finally { fs.rmSync(tmp2, { recursive: true, force: true }); }

/* ------------------------------------------------------------------
 *  4. 価格：代表価格・未確認・価格不明・古い価格
 * ------------------------------------------------------------------ */
const cfg = catalog.config;
const r5070 = recOf(catalog, 'gpu', 'rtx-5070');
const rep = Catalog.representativePrice(r5070, 'pc-builder', cfg, NOW);
ok(rep && rep.type === 'market-median' && rep.state.valid && !rep.fallback, 'PC BUILDER の代表価格は確認日つきの実売相場（有効期間内）');
const repOld = Catalog.representativePrice(r5070, 'pc-builder', cfg, new Date('2027-03-01T00:00:00+09:00'));
ok(repOld.state.stale && !repOld.state.valid, '有効期間を過ぎた代表価格は「古い（更新待ち）」で、合計に使えない');
// 2026-11-15〜 GPU GUIDE の見出しは実売相場（market-median）優先。無いGPUは reference（確認日なしの目安）
eq(Catalog.representativePrice(r5070, 'gpu-guide', cfg, NOW).type, 'market-median', 'GPU GUIDE の見出しは確認日つきの実売相場（ルールどおり）');
ok((() => { const x = Catalog.representativePrice(recOf(catalog, 'gpu', 'rtx-4060'), 'gpu-guide', cfg, NOW); return x && x.type === 'reference' && x.fallback; })(), 'GPU GUIDE で実売相場の無いGPUは reference を代わりに使う（fallback）');
const r4060 = recOf(catalog, 'gpu', 'rtx-4060');
const rep4060 = Catalog.representativePrice(r4060, 'pc-builder', cfg, NOW);
ok(rep4060 && rep4060.fallback && rep4060.type === 'reference' && !rep4060.state.valid, '実売相場の無いGPUは reference を「目安（合計に含めない）」として使う');
eq(Catalog.representativePrice({ prices: [] }, 'pc-builder', cfg, NOW), null, '価格が1件も無ければ null（0円にしない）');
// 合計日数の設定は config で変えられる
const cfg2 = clone(cfg); cfg2.pricing.staleAfterDays = 5; cfg2.pricing.staleAfterDaysByType = {};
ok(Catalog.priceState(Catalog.latestOfType(r5070, 'market-median'), cfg2, new Date(NOW.getTime() + 10 * 86400000)).stale, '有効期間は config.json で変えられる');
// PC BUILDER の合計：価格不明・未確認・古い価格を 0 円で足さない
const db = dbOf(catalog);
const B = (items) => ({ items: Object.fromEntries(Object.entries(items).map(([k, v]) => [k, (Array.isArray(v) ? v : [v]).map((x) => ({ id: x, qty: 1 }))])) });
const build = B({ cpu: 'ryzen77800x3d', gpu: 'rtx-4060', motherboard: 'asus-tuf-b650-plus-wifi', memory: 'mem-generic-ddr5-32' });
const sum = Score.priceSummary(build, db);
ok(sum.refRows.some((r) => r.id === 'rtx-4060') && !sum.rows.some((r) => r.id === 'rtx-4060'), '確認日の無いGPU価格は合計に入れず「目安」として別に数える');
ok(sum.rows.every((r) => r.value > 0), '合計に 0 円の行が無い');
const catNoPrice = clone(catalog); recOf(catNoPrice, 'cpu', 'ryzen77800x3d').prices = [];
const dbNo = dbOf(catNoPrice, NOW, { partPrices: { _meta: {}, cpu: {} } });
const sumNo = Score.priceSummary(build, dbNo);
ok(sumNo.unpriced.some((r) => r.id === 'ryzen77800x3d') && !sumNo.rows.some((r) => r.id === 'ryzen77800x3d'), '価格不明のCPUは「価格情報なし」として数え、合計に含めない');
eq(Score.costScore(build, dbNo, Score.gameScore(build, dbNo, 'wqhd'), Score.videoScore(build, dbNo)).grade, 'na', '価格不明があるとコスパは評価不可（0円で計算しない）');
const dbOld = dbOf(catalog, new Date('2027-03-01T12:00:00+09:00'));
const build5070 = B({ cpu: 'ryzen77800x3d', gpu: 'rtx-5070', motherboard: 'asus-tuf-b650-plus-wifi', memory: 'mem-generic-ddr5-32' });
const sumOld = Score.priceSummary(build5070, dbOld);
ok(dbOld.byId['rtx-5070'].price.stale && dbOld.byId.ryzen77800x3d.price.stale, '有効期間を過ぎた CPU・GPU の価格に stale が付く');
ok(!sumOld.rows.some((r) => r.id === 'rtx-5070' || r.id === 'ryzen77800x3d') && sumOld.refRows.some((r) => r.id === 'rtx-5070'), '古くなった価格は合計に入れず「目安」側に回す');
ok(Score.priceSummary(build5070, db).rows.some((r) => r.id === 'rtx-5070'), '（対照）有効期間内なら同じ価格は合計に入る');
const scoreOld = Score.scoreBuild(build, dbOld, 'wqhd');
ok(Object.values(scoreOld.axes).every((a) => a.score === null || (a.score >= 0 && a.score <= 100)), '古い価格・未確認の値でもスコア計算が破綻しない');
// 未確認の仕様：互換性は「対応」を返さない
const catNull = clone(catalog); fieldSet(recOf(catNull, 'cpu', 'ryzen77800x3d'), 'socket', null);
const dbNull = dbOf(catNull);
const cr = Compat.checkBuild(B({ cpu: 'ryzen77800x3d', motherboard: 'asus-tuf-b650-plus-wifi' }), dbNull, Db.CATEGORIES).results.find((x) => x.id === 'socket');
ok(cr && cr.status !== 'ok', '正本の値が未確認（null）なら互換性は「対応」にしない');

/* ------------------------------------------------------------------
 *  5. 既存ID・共有URL・保存済み構成の互換
 * ------------------------------------------------------------------ */
// 移行前（2026-11-14 以前）の PC BUILDER が作っていた共有URLの形
const OLD_SHARE = '1~cpu.ryzen77800x3d~gpu.rtx-5070~mb.asus-tuf-b650-plus-wifi~mem.mem-generic-ddr5-32_2';
const dec = Codec.decode(OLD_SHARE, db);
ok(dec.warnings.length === 0, '移行前の共有URLが警告なしで読める: ' + dec.warnings.join(' / '));
ok(dec.build.items.cpu && dec.build.items.cpu[0].id === 'ryzen77800x3d' && dec.build.items.gpu[0].id === 'rtx-5070', '共有URLのCPU・GPUが同じIDで復元される');
const enc = Codec.encode(dec.build);
eq(Codec.decode(enc, db).build.items.cpu[0].id, 'ryzen77800x3d', '共有URLの往復');
// 保存済み構成（localStorage の形式）に入っていたIDがすべて解決できる
const oldParts = JSON.parse(require('child_process').execFileSync('git', ['show', 'HEAD:pc-builder/data/parts.json'], { cwd: ROOT, maxBuffer: 1 << 26 }).toString());
const oldIds = oldParts.parts.map((p) => p.id).concat(rj('gpu-guide/gpus.json').map((g) => g.id));
const missing = oldIds.filter((id) => !db.byId[id]);
eq(missing.length, 0, '移行前に選べた全パーツのIDが今も解決できる（保存済み構成・共有URLが壊れない）: ' + missing.slice(0, 5).join(','));
const oldCpu = oldParts.parts.filter((p) => p.category === 'cpu');
const diffs = [];
for (const p of oldCpu) {
  const n = db.byId[p.id];
  for (const [k, v] of Object.entries(p.specs)) if (JSON.stringify(n.specs[k]) !== JSON.stringify(v)) diffs.push(`${p.id}.${k}`);
  if (n.name !== p.name || n.family !== p.family || n.released !== p.released || (n.affiliateId || null) !== (p.affiliateId || null)) diffs.push(p.id + ' 基本情報');
}
eq(diffs.length, 0, '移行前後で CPU の仕様・名前・世代・発売日・アフィリエイトIDが同じ: ' + diffs.slice(0, 5).join(','));
const oldPrices = JSON.parse(require('child_process').execFileSync('git', ['show', 'HEAD:pc-builder/data/prices.json'], { cwd: ROOT, maxBuffer: 1 << 26 }).toString());
const priceDiffs = [];
for (const [id, it] of Object.entries(oldPrices.items)) if (db.byId[id] && db.byId[id].price && db.byId[id].category === 'cpu' && (db.byId[id].price.value !== it.value || db.byId[id].price.checkedAt !== it.checkedAt)) priceDiffs.push(id);
// GPU は移行後に再確認した新しい記録（確認日がより新しい）が足されていてよい。その場合も移行前の記録が履歴として残っていること
for (const [id, c] of Object.entries(oldPrices.gpuChips)) {
  if (id[0] === '_') continue;
  const cur = db.byId[id].price;
  if (cur.value === c.value && cur.checkedAt === c.checkedAt && cur.n === c.n) continue;
  const kept = (recOf(catalog, 'gpu', id).prices || []).some((p) => p.type === 'market-median' && p.amount === c.value && p.checkedAt === c.checkedAt && p.sampleSize === c.n);
  if (!(kept && cur.checkedAt > c.checkedAt)) priceDiffs.push(id);
}
eq(priceDiffs.length, 0, '移行前後で CPU・GPU の価格と確認日が同じ（移行で「確認済み」にしていない）: ' + priceDiffs.join(','));
ok(Catalog.products(catalog.gpu).every((r) => (r.prices || []).filter((p) => p.source === 'legacy-gpus-json').every((p) => p.checkedAt === null)), '移行しただけの価格に確認日を付けていない');
ok(Catalog.products(catalog.gpu).every((r) => r.specGroups.filter((g) => g.source === 'legacy-gpus-json' || g.source === 'legacy-upgrade-engine').every((g) => g.basis === 'unverified' && g.checkedAt === null)), '移行しただけの仕様は「未確認」で確認日なし');

console.log(`\n共通パーツデータ テスト\n  成功: ${pass}   失敗: ${fail}`);
if (fail) { failures.forEach((f) => console.log('  ✗ ' + f)); process.exitCode = 1; }
