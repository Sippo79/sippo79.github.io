/* =====================================================================
 *  Sippo PC BUILDER  構成の保存・共有 (pb-codec.js)
 *  ---------------------------------------------------------------------
 *  構成 ⇔ URLパラメータ文字列 の変換と、ブラウザ内保存（localStorage）。
 *
 *  【URLの形】 ?b=1~cpu.ryzen57500f~gpu.rtx-5060~mem.mem-generic-ddr5-32_1~sto.ssd-generic-nvme-1tb_1.hdd-generic-35_2
 *    - 先頭はフォーマットの版（今は 1）
 *    - "~" でカテゴリ区切り、"." で同じカテゴリの複数パーツ、"_数字" で数量
 *    - どれも URL でエスケープ不要な文字なので、共有時に崩れない
 *    - パーツIDは英小文字・数字・ハイフンだけ（parts.json / gpus.json の規則）
 *  名前は n=、基準解像度は r= に別で入れる。秘密情報は一切含めない。
 *
 *  【保存データの形】（将来 PC Builds Hub / Supabase に送れるよう、平らなJSON）
 *    { id, name, savedAt, res, build: { items: {...} }, format: 'sippo-pc-builder/1' }
 * ===================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SippoPBCodec = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '1';
  var FORMAT = 'sippo-pc-builder/1';
  var KEYS = {
    cpu: 'cpu', gpu: 'gpu', gpuboard: 'gb', motherboard: 'mb', memory: 'mem',
    storage: 'sto', psu: 'psu', case: 'case', cooler: 'cool', fan: 'fan', expansion: 'exp',
  };
  var REVERSE = {};
  Object.keys(KEYS).forEach(function (k) { REVERSE[KEYS[k]] = k; });

  var ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
  var MAX_QTY = 16;
  var MAX_ITEMS_PER_CAT = 12;
  var MAX_URL_PARAM = 1500; // 共有URLが長くなりすぎないよう、ここを超えたら警告する
  var STORAGE_KEY = 'sippo-pc-builder:saved:v1';
  var MAX_SAVED = 30;

  function encode(build) {
    var parts = [VERSION];
    Object.keys(KEYS).forEach(function (cat) {
      var arr = (build && build.items && build.items[cat]) || [];
      var tokens = arr.filter(function (e) { return e && ID_RE.test(e.id); }).map(function (e) {
        var q = Math.max(1, Math.min(MAX_QTY, Math.floor(Number(e.qty) || 1)));
        return q > 1 ? e.id + '_' + q : e.id;
      });
      if (tokens.length) parts.push(KEYS[cat] + '.' + tokens.join('.'));
    });
    return parts.join('~');
  }

  /**
   * 文字列を構成に戻す。壊れた部分・知らないIDは捨てて warnings に記録する
   * （例外を投げない＝古いURLや手で書き換えたURLでもページは開ける）。
   * @param {object} db 省略可。渡すと存在しないIDを除外する
   */
  function decode(str, db) {
    var build = { items: {} };
    var warnings = [];
    if (!str || typeof str !== 'string') return { build: build, warnings: warnings };
    var segs = str.slice(0, 4000).split('~');
    if (segs[0] !== VERSION) {
      warnings.push('この共有URLの形式（' + String(segs[0]).slice(0, 8) + '）には対応していません。');
      return { build: build, warnings: warnings };
    }
    segs.slice(1).forEach(function (seg) {
      var dot = seg.indexOf('.');
      if (dot < 0) return;
      var cat = REVERSE[seg.slice(0, dot)];
      if (!cat) { warnings.push('不明な項目を無視しました: ' + seg.slice(0, dot).slice(0, 12)); return; }
      seg.slice(dot + 1).split('.').slice(0, MAX_ITEMS_PER_CAT).forEach(function (tok) {
        var m = /^([a-z0-9][a-z0-9-]{0,63})(?:_(\d{1,2}))?$/.exec(tok);
        if (!m) { warnings.push('読み取れないパーツ指定を無視しました'); return; }
        var id = m[1], qty = Math.max(1, Math.min(MAX_QTY, Number(m[2] || 1)));
        if (db && !db.byId[id]) { warnings.push('登録されていないパーツ「' + id + '」を除外しました（販売終了などでデータから外れた可能性があります）。'); return; }
        if (db && db.byId[id].category !== cat) { warnings.push('種類が合わないパーツ「' + id + '」を除外しました。'); return; }
        (build.items[cat] = build.items[cat] || []).push({ id: id, qty: qty });
      });
    });
    // 1つしか選べないカテゴリは先頭だけ残す
    ['cpu', 'gpu', 'gpuboard', 'motherboard', 'memory', 'psu', 'case', 'cooler'].forEach(function (cat) {
      if (build.items[cat] && build.items[cat].length > 1) build.items[cat] = build.items[cat].slice(0, 1);
    });
    ['cpu', 'gpu', 'gpuboard', 'motherboard', 'psu', 'case', 'cooler'].forEach(function (cat) {
      if (build.items[cat]) build.items[cat][0].qty = 1;
    });
    return { build: build, warnings: warnings };
  }

  function cleanName(name) {
    return String(name == null ? '' : name).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
  }

  /** 共有URLのクエリ部分を作る */
  function toQuery(build, opts) {
    var o = opts || {};
    var params = [];
    params.push('b=' + encode(build));
    if (o.name) params.push('n=' + encodeURIComponent(cleanName(o.name)));
    if (o.res) params.push('r=' + encodeURIComponent(o.res));
    if (o.compare) params.push('c=' + encode(o.compare));
    if (o.compareName) params.push('cn=' + encodeURIComponent(cleanName(o.compareName)));
    var q = params.join('&');
    return { query: q, tooLong: q.length > MAX_URL_PARAM };
  }

  /* ---------------- ブラウザ内保存 ---------------- */

  function storage() {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  }

  function loadSaved() {
    var s = storage();
    if (!s) return [];
    try {
      var raw = s.getItem(STORAGE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(function (x) { return x && x.id && x.build; }) : [];
    } catch (e) { return []; }
  }

  function writeSaved(arr) {
    var s = storage();
    if (!s) return false;
    try { s.setItem(STORAGE_KEY, JSON.stringify(arr.slice(0, MAX_SAVED))); return true; } catch (e) { return false; }
  }

  function saveBuild(entry) {
    var arr = loadSaved();
    var rec = {
      format: FORMAT,
      id: entry.id || ('b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
      name: cleanName(entry.name) || '名前のない構成',
      savedAt: new Date().toISOString(),
      res: entry.res || 'wqhd',
      build: { items: JSON.parse(JSON.stringify((entry.build && entry.build.items) || {})) },
    };
    arr = arr.filter(function (x) { return x.id !== rec.id; });
    arr.unshift(rec);
    return writeSaved(arr) ? rec : null;
  }

  function deleteSaved(id) {
    return writeSaved(loadSaved().filter(function (x) { return x.id !== id; }));
  }

  return {
    VERSION: VERSION,
    FORMAT: FORMAT,
    MAX_URL_PARAM: MAX_URL_PARAM,
    encode: encode,
    decode: decode,
    toQuery: toQuery,
    cleanName: cleanName,
    loadSaved: loadSaved,
    saveBuild: saveBuild,
    deleteSaved: deleteSaved,
  };
});
