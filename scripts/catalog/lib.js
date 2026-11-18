'use strict';
/**
 * 共通パーツデータ（shared/catalog/）の読み込みと生成（Node 専用）。
 * 生成物:
 *   gpu-guide/gpus.json                  … 正本（gpu.json）＋ GPU GUIDE 固有（gpu-guide/data/gpu-editorial.json）
 *   upgrade/upgrade-engine.js の2ブロック … GPU_POWER / GPU_POWER_SPEC
 * どれも「正本から毎回同じものを作る」。生成物を手で直さない。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const Catalog = require(path.join(ROOT, 'shared', 'catalog', 'catalog.js'));
const GpuTarget = require(path.join(ROOT, 'shared', 'gpu', 'gpu-target.js'));

const PATHS = {
  gpu: 'shared/catalog/gpu.json',
  cpu: 'shared/catalog/cpu.json',
  sources: 'shared/catalog/sources.json',
  config: 'shared/catalog/config.json',
  schema: 'shared/catalog/schema.json',
  revisions: 'shared/catalog/revisions.json',
  editorial: 'gpu-guide/data/gpu-editorial.json',
  gpusJson: 'gpu-guide/gpus.json',
  engine: 'upgrade/upgrade-engine.js',
};

function abs(rel, root) { return path.join(root || ROOT, rel); }
function readJson(rel, root) { return JSON.parse(fs.readFileSync(abs(rel, root), 'utf8').replace(/^﻿/, '')); }
function readText(rel, root) { return fs.readFileSync(abs(rel, root), 'utf8'); }

/** 正本一式を読む（root を変えるとテスト用の複製も読める） */
function loadCatalog(root) {
  return {
    gpu: readJson(PATHS.gpu, root),
    cpu: readJson(PATHS.cpu, root),
    sources: readJson(PATHS.sources, root),
    config: readJson(PATHS.config, root),
    schema: readJson(PATHS.schema, root),
  };
}

function loadEditorial(root) { return readJson(PATHS.editorial, root); }

/* ------------------------------------------------------------------
 *  gpu-guide/gpus.json
 * ------------------------------------------------------------------ */
// 出力のキー順（読みやすさのためだけ。値の意味には関係しない）
const GPUS_KEY_ORDER = ['id', 'name', 'brand', 'maker', 'series', 'generation', 'vram', 'target', 'recommendedResolution', 'score', 'performanceScore', 'price', 'marketPrice', 'marketPriceCheckedAt', 'marketPriceValidUntil', 'marketPriceSampleSize', 'usedPriceMin', 'usedPriceMax', 'power', 'releaseYear', 'market', 'tags', 'usedRecommendRank', 'summary', 'pros', 'cons', 'usedNote', 'caution', 'usedCheckPoints', 'games', 'targetGames', 'compare', 'cpus', 'rasterScore', 'featureScore', 'usedScore', 'scoreSource', 'scoreNote'];
// GPU GUIDE 固有の項目（gpu-editorial.json に置いてよいもの）
const EDITORIAL_KEYS = new Set(['id', 'score', 'tags', 'usedRecommendRank', 'summary', 'pros', 'cons', 'usedNote', 'caution', 'usedCheckPoints', 'games', 'targetGames', 'compare', 'cpus', 'usedScore', 'scoreSource', 'scoreNote']);

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function addDaysIso(iso, days) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }

/**
 * 新品GPUの実売相場（最新の market-median）。GPU GUIDE の見出し価格・UPGRADE の交換費用に使う。
 * validUntil＝確認日＋有効期間（config.pricing）。過ぎたら表示側で「更新待ち」にする。中古中心のGPUは対象外。
 */
function marketOf(r, config) {
  if (r.market === 'used') return null;
  const mm = Catalog.latestOfType(r, 'market-median');
  if (!mm || !isNum(mm.amount) || !mm.checkedAt) return null;
  return { amount: mm.amount, checkedAt: mm.checkedAt, validUntil: addDaysIso(mm.checkedAt, Catalog.staleAfter('market-median', config)), vramGB: mm.vramGB || null, sampleSize: mm.sampleSize || null };
}

function buildGpusJson(cat, editorial) {
  const byId = Catalog.index(cat).gpu;
  const out = [];
  for (const ed of editorial.gpus) {
    const r = byId[ed.id];
    if (!r) throw new Error(`gpu-editorial.json の ${ed.id} が shared/catalog/gpu.json に無い`);
    const s = Catalog.specs(r);
    const raster = Catalog.score(r, 'sippoRaster');
    const target = GpuTarget.deriveTarget({ rasterScore: raster });
    const ref = Catalog.latestOfType(r, 'reference');
    const used = Catalog.latestOfType(r, 'used-range');
    const market = marketOf(r, cat.config);
    const v = {
      id: r.id, name: r.name, brand: r.maker, maker: r.maker, series: r.series, generation: r.series,
      vram: s.vramGB, target, recommendedResolution: target,
      score: ed.score, performanceScore: ed.score,
      price: ref ? ref.amount : undefined,
      marketPrice: market ? market.amount : undefined,
      marketPriceCheckedAt: market ? market.checkedAt : undefined,
      marketPriceValidUntil: market ? market.validUntil : undefined,
      marketPriceSampleSize: market && market.sampleSize ? market.sampleSize : undefined,
      usedPriceMin: used ? used.min : undefined, usedPriceMax: used ? used.max : undefined,
      power: s.boardPowerW,
      releaseYear: isNum(s.releaseYear) ? s.releaseYear : undefined,
      market: r.market === 'used' ? 'used' : undefined,
      rasterScore: raster,
      featureScore: Catalog.score(r, 'sippoFeature') === null ? undefined : Catalog.score(r, 'sippoFeature'),
    };
    for (const [k, val] of Object.entries(ed)) {
      if (k === 'id' || k === 'score') continue;
      if (!EDITORIAL_KEYS.has(k)) throw new Error(`gpu-editorial.json の ${ed.id}.${k} は GPU GUIDE 固有の項目ではない（正本 shared/catalog/gpu.json に置く）`);
      v[k] = val;
    }
    const o = {};
    for (const k of GPUS_KEY_ORDER) if (v[k] !== undefined) o[k] = v[k];
    for (const k of Object.keys(v)) if (!(k in o) && v[k] !== undefined) o[k] = v[k];
    out.push(o);
  }
  return JSON.stringify(out, null, 2) + '\n';
}

/* ------------------------------------------------------------------
 *  upgrade/upgrade-engine.js の生成ブロック
 * ------------------------------------------------------------------ */
function jsStr(s) { return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }

function engineBlocks(cat) {
  const recs = Catalog.products(cat.gpu).filter((r) => Catalog.listed(r, 'upgrade'));
  const power = recs.filter((r) => isNum(Catalog.specs(r).boardPowerW)).map((r) => `${Catalog.engineKey(r.id)}: ${Catalog.specs(r).boardPowerW}`);
  const lines = [];
  for (let i = 0; i < power.length; i += 6) lines.push('    ' + power.slice(i, i + 6).join(', ') + ',');
  const powerBlock = ['  var GPU_POWER = {', ...lines, '  };'].join('\n');

  const specLines = [];
  for (const r of recs) {
    const psu = Catalog.field(r, 'recommendedSystemPowerW');
    const con = Catalog.field(r, 'powerConnectorsReference');
    if (psu.basis !== 'official' || !isNum(psu.value)) continue;
    const key = Catalog.engineKey(r.id) + ':';
    specLines.push(`    ${key.padEnd(11)}{ psu: ${psu.value}, connector: ${jsStr(con.value || '未確認')} },`);
  }
  const specBlock = ['  var GPU_POWER_SPEC = {', ...specLines, '  };'].join('\n');

  // UPGRADE の交換費用（GPU）。新品GPUの最新 market-median だけ（確認日つき）。無いGPUは候補に出ない
  const priceLines = [];
  for (const r of recs) {
    const m = marketOf(r, cat.config);
    if (!m) continue;
    const key = Catalog.engineKey(r.id) + ':';
    const chipVram = Catalog.specs(r).vramGB;
    priceLines.push(`    ${key.padEnd(11)}{ price: ${m.amount}, checkedAt: '${m.checkedAt}', validUntil: '${m.validUntil}'${isNum(chipVram) ? `, vram: ${chipVram}` : ''}${m.vramGB ? `, vramGB: ${m.vramGB}` : ''} },`);
  }
  const priceBlock = ['  var GPU_PRICE = {', ...priceLines, '  };'].join('\n');
  return { 'catalog-gpu-power': powerBlock, 'catalog-gpu-power-spec': specBlock, 'catalog-gpu-price': priceBlock };
}

/** マーカーの間を置き換える（改行コードはファイルに合わせる） */
function applyBlocks(src, blocks) {
  const nl = src.includes('\r\n') ? '\r\n' : '\n';
  let s = src.replace(/\r\n/g, '\n');
  for (const [name, body] of Object.entries(blocks)) {
    const open = `// <GENERATED:${name}>`;
    const close = `// </GENERATED:${name}>`;
    const a = s.indexOf(open);
    const b = s.indexOf(close);
    if (a < 0 || b < 0 || b < a) throw new Error(`upgrade-engine.js に生成マーカー ${name} が無い`);
    const lineStart = s.indexOf('\n', a) + 1;
    const closeLineStart = s.lastIndexOf('\n', b) + 1;
    s = s.slice(0, lineStart) + body + '\n' + s.slice(closeLineStart);
  }
  return s.replace(/\n/g, nl);
}

/* ------------------------------------------------------------------
 *  データの更新履歴（revisions.json）
 *  レコードの中身が変わったときだけ revision を上げ、dataUpdatedAt を今日（日本時間）にする。
 *  ※ dataUpdatedAt は「データを書き換えた日」。外部出典を確認した日（checkedAt）とは別。
 * ------------------------------------------------------------------ */
function hashRecord(r) { return crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex').slice(0, 16); }
function todayJst(now) {
  const d = new Date((now instanceof Date ? now.getTime() : Date.now()) + 9 * 3600000);
  return d.toISOString().slice(0, 10);
}

function computeRevisions(cat, prev, now) {
  const before = (prev && prev.records) || {};
  const records = {};
  const changed = [];
  for (const c of ['gpu', 'cpu']) {
    for (const r of Catalog.products(cat[c])) {
      const key = `${c}:${r.id}`;
      const h = hashRecord(r);
      const old = before[key];
      if (old && old.hash === h) records[key] = old;
      else {
        records[key] = { hash: h, revision: old ? old.revision + 1 : 1, dataUpdatedAt: todayJst(now) };
        changed.push({ key, from: old ? old.revision : 0, to: records[key].revision, isNew: !old });
      }
    }
  }
  const removed = Object.keys(before).filter((k) => !records[k]);
  const sorted = {};
  for (const k of Object.keys(records).sort()) sorted[k] = records[k];
  const meta = {
    purpose: 'レコードごとのデータ更新日（dataUpdatedAt）と版（revision）。node scripts/catalog/build.js が内容のハッシュで自動更新する。手で直さない。',
    note: 'dataUpdatedAt はデータを書き換えた日。外部の出典を確認した日は各値の checkedAt（別物）。変更内容そのものは git の履歴で追う。',
  };
  const removedLog = ((prev && prev.removed) || []).concat(removed.map((k) => ({ key: k, revision: before[k].revision, removedAt: todayJst(now) })));
  const json = JSON.stringify({ _meta: meta, records: sorted, removed: removedLog }, null, 2) + '\n';
  return { json, changed, removed };
}

/** 生成物をまとめて計算する（書き込みはしない） */
function computeOutputs(root) {
  const cat = loadCatalog(root);
  const editorial = loadEditorial(root);
  const engineSrc = readText(PATHS.engine, root);
  return {
    cat,
    editorial,
    outputs: {
      [PATHS.gpusJson]: buildGpusJson(cat, editorial),
      [PATHS.engine]: applyBlocks(engineSrc, engineBlocks(cat)),
    },
  };
}

/** 改行コードの違い（CRLF/LF）は Git の設定で変わるため比較では無視する */
function sameText(a, b) { return String(a).replace(/\r\n/g, '\n') === String(b).replace(/\r\n/g, '\n'); }

module.exports = {
  ROOT, PATHS, Catalog, GpuTarget,
  readJson, readText, loadCatalog, loadEditorial,
  buildGpusJson, engineBlocks, applyBlocks, computeRevisions, computeOutputs,
  hashRecord, todayJst, sameText, EDITORIAL_KEYS, marketOf,
};
