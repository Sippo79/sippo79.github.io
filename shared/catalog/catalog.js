/* =====================================================================
 *  Sippo 共通パーツデータ  catalog.js
 *  ---------------------------------------------------------------------
 *  shared/catalog/*.json（GPU・CPU の正本）を読むための純粋関数。
 *  ブラウザ（PC BUILDER が実行時に直接読む）と Node（生成・検証・テスト・
 *  GPU GUIDE の静的ページ生成・Sippo CONTROL）が同じ関数を使う。
 *
 *  【決まり】
 *   - 値が null ＝ 未確認。0 や推測で埋めない。
 *   - 確認日（checkedAt）は「外部の出典を実際に確認した日」。データを移した日や
 *     ファイルを更新した日ではない（データの更新日は revisions.json）。
 *   - 価格は種類（type）ごとに意味が違う。合計・コスパに入れてよいのは
 *     config.pricing.countableTypes の種類で、確認日から有効期間内のものだけ。
 *   - 代表価格の採用ルールは config.pricing.representative（サイトごと）。
 * ===================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SippoCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DAY = 86400000;
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && isFinite(Date.parse(s + 'T00:00:00+09:00')); }

  /** 正本のID → upgrade-engine.js / affiliate のキー（ハイフンを除く） */
  function engineKey(id) { return String(id || '').replace(/-/g, ''); }

  /** 日本時間の日付どうしの日数差（checkedAt → now） */
  function ageDays(date, now) {
    if (!isDate(date)) return null;
    var t = Date.parse(date + 'T00:00:00+09:00');
    var n = now instanceof Date ? now.getTime() : (isNum(now) ? now : Date.now());
    return Math.floor((n - t) / DAY);
  }

  function products(file) { return (file && Array.isArray(file.products)) ? file.products : []; }

  /** 入力 { gpu, cpu, sources, config } から ID の索引を作る */
  function index(cat) {
    var byId = { gpu: {}, cpu: {} };
    ['gpu', 'cpu'].forEach(function (c) {
      products(cat && cat[c]).forEach(function (r) { if (r && r.id) byId[c][r.id] = r; });
    });
    return byId;
  }

  /** 仕様の値だけを平らにする { vramGB: 12, ... } */
  function specs(rec) {
    var out = {};
    ((rec && rec.specGroups) || []).forEach(function (g) {
      Object.keys(g.fields || {}).forEach(function (k) { out[k] = g.fields[k]; });
    });
    return out;
  }

  /** 1項目の値と根拠 { value, basis, status, source, checkedAt, note } */
  function field(rec, name) {
    var groups = (rec && rec.specGroups) || [];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (g.fields && Object.prototype.hasOwnProperty.call(g.fields, name)) {
        var v = g.fields[name];
        return {
          value: v, basis: g.basis, source: g.source || null, checkedAt: g.checkedAt || null, note: g.note || '',
          status: v === null || v === undefined ? 'unverified' : g.basis,
        };
      }
    }
    return { value: null, basis: null, source: null, checkedAt: null, note: '', status: 'unverified' };
  }

  function score(rec, metric) {
    var s = rec && rec.scores && rec.scores[metric];
    return s && isNum(s.value) ? s.value : null;
  }

  function staleAfter(type, config) {
    var p = (config && config.pricing) || {};
    var by = p.staleAfterDaysByType || {};
    return isNum(by[type]) ? by[type] : (isNum(p.staleAfterDays) ? p.staleAfterDays : 45);
  }

  /** 価格1件の状態。countable＝合計に入れてよい種類、valid＝その上で確認日があり有効期間内 */
  function priceState(price, config, now) {
    var countable = ((config && config.pricing && config.pricing.countableTypes) || ['lowest', 'market-median']).indexOf(price.type) >= 0;
    var age = ageDays(price.checkedAt, now);
    var limit = staleAfter(price.type, config);
    var stale = age !== null && age > limit;
    return {
      countable: countable,
      undated: age === null,
      ageDays: age,
      staleAfterDays: limit,
      stale: stale,
      valid: countable && age !== null && !stale,
    };
  }

  /** 同じ種類の価格のうち確認日が最も新しいもの（確認日なしは最後） */
  function latestOfType(rec, type) {
    var list = ((rec && rec.prices) || []).filter(function (p) { return p && p.type === type; });
    list.sort(function (a, b) { return String(b.checkedAt || '').localeCompare(String(a.checkedAt || '')); });
    return list[0] || null;
  }

  /**
   * サイトごとの代表価格。config.pricing.representative[site] の order の順に探し、
   * 無ければ fallback。見つからなければ null（0円にしない）。
   * @returns { price, state, type, fallback } | null
   */
  function representativePrice(rec, site, config, now) {
    var rule = (config && config.pricing && config.pricing.representative && config.pricing.representative[site]) || { order: ['lowest', 'market-median'], fallback: ['reference'] };
    var lists = [[rule.order || [], false], [rule.fallback || [], true]];
    for (var i = 0; i < lists.length; i++) {
      var types = lists[i][0];
      for (var j = 0; j < types.length; j++) {
        var p = latestOfType(rec, types[j]);
        if (p) return { price: p, state: priceState(p, config, now), type: types[j], fallback: lists[i][1] };
      }
    }
    return null;
  }

  function source(cat, id) {
    var s = cat && cat.sources && cat.sources.sources ? cat.sources.sources[id] : null;
    return s || null;
  }

  function listed(rec, site) { return !!(rec && Array.isArray(rec.listings) && rec.listings.indexOf(site) >= 0); }

  /* ------------------------------------------------------------------
   *  PC BUILDER 互換アダプター
   *  正本 → pb-db.js が従来受け取っていた形（parts.json の CPU / prices.json の
   *  items・gpuChips / GPU仕様）に変換する。IDは変えない（共有URL・保存済み構成の互換）。
   * ------------------------------------------------------------------ */
  function builderAdapter(cat) {
    var out = { cpuParts: [], partSources: {}, items: {}, gpuChips: {}, priceSources: {}, gpu: {}, gpuIds: [], staleAfterDays: staleAfter('lowest', cat && cat.config) };
    function addPriceSource(id) {
      var s = source(cat, id);
      if (s && !out.priceSources[id]) out.priceSources[id] = { label: s.label, url: s.url || '', basisFile: 'shared/catalog/sources.json' };
    }
    function priceEntry(p, file) {
      addPriceSource(p.source);
      var e = { value: p.amount, checkedAt: p.checkedAt || null, source: p.source, basisFile: file };
      if (p.note) e.note = p.note;
      if (p.type === 'market-median') {
        e.n = isNum(p.sampleSize) ? p.sampleSize : null;
        e.low = isNum(p.low) ? p.low : null;
        if (isNum(p.low) && isNum(p.high)) e.range = [p.low, p.high];
      }
      return e;
    }
    products(cat && cat.cpu).forEach(function (r) {
      if (!listed(r, 'pc-builder')) return;
      var g = (r.specGroups || [])[0] || {};
      var s = specs(r);
      var sp = {};
      Object.keys(s).forEach(function (k) { if (k !== 'released') sp[k] = s[k]; });
      var srcKey = g.source + '@' + (g.checkedAt || 'none');
      var src = source(cat, g.source);
      if (src && !out.partSources[srcKey]) out.partSources[srcKey] = { label: src.label, url: src.url || '', checkedAt: g.checkedAt || null, kind: g.basis === 'official' ? 'official' : 'secondary' };
      var part = { id: r.id, category: 'cpu', maker: r.maker, name: r.name, family: r.family, released: s.released || null, specs: sp, source: srcKey, catalog: 'shared/catalog/cpu.json' };
      if (r.refs && r.refs.affiliateId) part.affiliateId = r.refs.affiliateId;
      if (r.notes && r.notes.boxCooler) part.boxCoolerNote = r.notes.boxCooler;
      if (r.sameSpecsExceptIgpu) part.gameTierSameAs = r.sameSpecsExceptIgpu;
      out.cpuParts.push(part);
      var lp = latestOfType(r, 'lowest');
      if (lp && isNum(lp.amount)) out.items[r.id] = priceEntry(lp, 'shared/catalog/cpu.json');
    });
    products(cat && cat.gpu).forEach(function (r) {
      if (!listed(r, 'pc-builder')) return;
      out.gpuIds.push(r.id);
      var s = specs(r);
      var ref = latestOfType(r, 'reference');
      out.gpu[r.id] = {
        name: r.name, maker: r.maker, series: r.series, market: r.market,
        vram: isNum(s.vramGB) ? s.vramGB : null,
        powerW: isNum(s.boardPowerW) ? s.boardPowerW : null,
        officialPsuW: isNum(s.recommendedSystemPowerW) ? s.recommendedSystemPowerW : null,
        connectorRef: s.powerConnectorsReference || null,
        releaseYear: isNum(s.releaseYear) ? s.releaseYear : null,
        raster: score(r, 'sippoRaster'),
        feature: score(r, 'sippoFeature'),
        reference: ref && isNum(ref.amount) ? { value: ref.amount, checkedAt: ref.checkedAt || null, note: ref.note || '' } : null,
      };
      var mm = latestOfType(r, 'market-median');
      if (mm && isNum(mm.amount) && r.market !== 'used') out.gpuChips[r.id] = priceEntry(mm, 'shared/catalog/gpu.json');
    });
    return out;
  }

  return {
    engineKey: engineKey,
    ageDays: ageDays,
    isDate: isDate,
    index: index,
    specs: specs,
    field: field,
    score: score,
    staleAfter: staleAfter,
    priceState: priceState,
    latestOfType: latestOfType,
    representativePrice: representativePrice,
    source: source,
    listed: listed,
    products: products,
    builderAdapter: builderAdapter,
  };
});
