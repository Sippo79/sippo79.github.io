/* =====================================================================
 *  PC BUILDER パーツデータの点検（node pc-builder/validate-parts.js）
 *  ---------------------------------------------------------------------
 *  製品を追加・更新したときに実行する。
 *    1. 形式の誤り（ID・カテゴリ・出典・参照先）  → あれば終了コード1
 *    2. 「未確認（null）」の項目一覧               → 埋めると「要確認」が減る
 *  null を埋めるときは、必ずメーカー公式ページで値を読み、
 *  parts.json の sources にURLと確認日を書くこと（推測で埋めない）。
 *
 *  オプション: --missing だけで未確認一覧のみ / --json でJSON出力
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const rq = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, ''));

const Db = require('./js/pb-db.js');
const parts = rq('pc-builder/data/parts.json');
const rules = rq('pc-builder/data/rules.json');
const affiliate = rq('shared/affiliate/affiliate-master.json').products;
const partPrices = rq('shared/parts/part-prices.json');
const engine = require('../upgrade/upgrade-engine.js');

const errors = [];
const seen = {};
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

parts.parts.forEach((p, i) => {
  const at = `parts[${i}] ${p.id || '(IDなし)'}`;
  if (!p.id || !ID_RE.test(p.id)) errors.push(`${at}: IDは英小文字・数字・ハイフンで64文字以内`);
  if (seen[p.id]) errors.push(`${at}: IDが重複`);
  seen[p.id] = true;
  if (!Db.CATEGORY_MAP[p.category]) errors.push(`${at}: 未知のカテゴリ ${p.category}`);
  if (!p.name) errors.push(`${at}: name が無い`);
  if (p.kind !== 'generic' && !(p.source && parts.sources[p.source])) errors.push(`${at}: 実在製品には sources に登録した出典が必要`);
  if (p.source && !parts.sources[p.source]) errors.push(`${at}: 出典ID ${p.source} が sources に無い`);
  if (p.affiliateId && !affiliate[p.affiliateId]) errors.push(`${at}: affiliateId ${p.affiliateId} が shared/affiliate/affiliate-master.json に無い`);
  if (p.priceRef && !Db._resolvePriceRef(p.priceRef, { partPrices, engine })) errors.push(`${at}: priceRef ${p.priceRef} を解決できない`);
  if ('price' in p) errors.push(`${at}: price を直接書かない（priceRef / shops[] を使う）`);
  (p.shops || []).forEach((s, j) => {
    if (!s.shop || !/^https?:\/\//.test(s.url || '')) errors.push(`${at}: shops[${j}] に shop と url が必要`);
    if (s.price != null && !/^\d{4}-\d{2}-\d{2}$/.test(s.checkedAt || '')) errors.push(`${at}: shops[${j}] の価格には確認日 checkedAt（YYYY-MM-DD）が必要`);
  });
  if (p.category === 'cpu' && !rules.cpuFamilies[p.family]) errors.push(`${at}: family ${p.family} が rules.json に無い`);
  if (p.category === 'gpuboard' && !p.chip) errors.push(`${at}: chip（gpu-guide/gpus.json の id）が必要`);
});
Object.entries(parts.sources).forEach(([id, s]) => {
  if (!s.url) errors.push(`sources.${id}: url が無い`);
  if (s.kind === 'official' && !/^\d{4}-\d{2}-\d{2}$/.test(s.checkedAt || '')) errors.push(`sources.${id}: 確認日 checkedAt が必要`);
});

// 未確認（null）の一覧
// KEY_FIELDS = 互換性チェック・スコア計算が実際に使う項目（null だと「要確認」「評価不可」になる）。
// それ以外の null は表示用の参考情報（判定には影響しない）。
const KEY_FIELDS = {
  cpu: ['socket', 'cores', 'threads', 'pCores', 'eCores', 'boostGHz', 'tdpW', 'maxPowerW', 'igpu', 'memoryTypes'],
  motherboard: ['socket', 'chipset', 'formFactor', 'memoryType', 'memorySlots', 'maxMemoryGB', 'm2Slots', 'sataPorts', 'pcieX16Slots', 'pcieX1Slots', 'fanHeaders'],
  memory: ['type', 'speed', 'capacityGB', 'modules'],
  storage: ['kind', 'formFactor', 'interface', 'capacityGB'],
  gpuboard: ['lengthMm', 'thickMm', 'pin8', 'pin16', 'recommendedPsuW'],
  psu: ['watt', 'formFactor', 'depthMm', 'pcie8', 'h12v2x6'],
  case: ['supportedMb', 'maxGpuMm', 'maxCoolerMm', 'radiators', 'psuForm', 'maxPsuMm', 'fan120', 'bay35', 'bay25'],
  cooler: ['type', 'sockets', 'heightMm', 'radiatorMm'],
  fan: ['sizeMm'],
};
// 製品の種類によって意味を持たない項目（null でも未確認ではない）
function notApplicable(p, k) {
  if (k === 'maxPowerW' && p.maker === 'AMD') return true; // AMD は TDP×1.35 で求める（Intel だけの項目）
  if (p.category === 'cooler' && p.specs.type === 'air' && (k === 'radiatorMm' || k === 'radiatorThickMm')) return true;
  if (p.category === 'cooler' && p.specs.type === 'aio' && k === 'heightMm') return true; // ケースの高さ制限は空冷だけ
  return false;
}
const missing = {};
const missingKey = {};
parts.parts.filter((p) => p.kind !== 'generic').forEach((p) => {
  const nulls = Object.entries(p.specs || {}).filter(([k, v]) => v === null && !notApplicable(p, k)).map(([k]) => k);
  if (nulls.length) (missing[p.category] = missing[p.category] || []).push({ id: p.id, name: p.name, fields: nulls });
  const key = (KEY_FIELDS[p.category] || []).filter((k) => !notApplicable(p, k) && (p.specs[k] === null || p.specs[k] === undefined));
  if (key.length) (missingKey[p.category] = missingKey[p.category] || []).push({ id: p.id, name: p.name, fields: key });
});

const counts = {};
parts.parts.forEach((p) => { counts[p.category] = (counts[p.category] || 0) + 1; });

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ errors, counts, missingKey, missing }, null, 1));
} else {
  if (!process.argv.includes('--missing')) {
    console.log('■ 登録数（parts.json。GPUチップは gpu-guide/gpus.json）');
    Object.entries(counts).forEach(([c, n]) => console.log(`  ${c}: ${n}`));
    console.log(errors.length ? `\n■ エラー ${errors.length} 件` : '\n■ エラー 0 件');
    errors.forEach((e) => console.log('  ✗ ' + e));
  }
  const nKey = Object.values(missingKey).reduce((a, arr) => a + arr.length, 0);
  console.log(`\n■ 判定に使う主要仕様が不足している製品: ${nKey} 件（互換性が「要確認」・スコアが「評価不可」になる原因）`);
  Object.entries(missingKey).forEach(([cat, arr]) => {
    console.log(`  [${cat}]`);
    arr.forEach((m) => console.log(`    ${m.name}: ${m.fields.join(', ')}`));
  });
  console.log('\n■ 未確認（null）の項目すべて（参考情報を含む）― 公式ページで確認できたら埋める');
  Object.entries(missing).forEach(([cat, arr]) => {
    console.log(`  [${cat}]`);
    arr.forEach((m) => console.log(`    ${m.name}: ${m.fields.join(', ')}`));
  });
}
process.exit(errors.length ? 1 : 0);
