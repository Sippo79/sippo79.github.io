#!/usr/bin/env node
'use strict';
/**
 * 共通パーツデータの検証（読み取り専用）。
 *
 *   node scripts/catalog/validate.js            … 人間用の要約（致命的エラーがあれば終了コード1）
 *   node scripts/catalog/validate.js --json     … 全件の詳細（GPT 等に渡す用）
 *   node scripts/catalog/validate.js --out <file> … 詳細 JSON をファイルに保存
 *
 * 重大度:
 *   error   … 致命的（ID重複・参照切れ・型/単位の誤り・不正な価格や日付・二重管理・生成物の不一致）。直すまで公開しない。
 *   warning … 要確認（価格が古い・出典URLや確認日が無い・基準の違う価格の大きな差）。サイトは動く。
 *   info    … 把握用（未確認 null の値・移行元のままの値・推定値）。値が無いだけでサイトは止めない。
 */
const fs = require('fs');
const path = require('path');
const L = require('./lib.js');
const { Catalog } = L;

const SEV_ORDER = { error: 0, warning: 1, info: 2 };

function tryJson(rel, root) { try { return L.readJson(rel, root); } catch (e) { return null; } }

function validate(opts) {
  const o = opts || {};
  const root = o.root || L.ROOT;
  const now = o.now || new Date();
  const today = L.todayJst(now);
  const issues = [];
  const add = (i) => issues.push(Object.assign({ severity: 'warning', category: null, id: null, field: null, current: null, source: null, checkedAt: null, reason: '', affects: [] }, i));

  let cat;
  try { cat = o.catalog || L.loadCatalog(root); } catch (e) {
    add({ severity: 'error', code: 'load-failed', reason: '共通データを読み込めない: ' + e.message });
    return finish(issues, {}, today);
  }
  const schema = cat.schema;
  const config = cat.config;
  const sources = (cat.sources && cat.sources.sources) || {};
  const idRe = new RegExp(schema.idPattern);
  const consumers = (config.consumers || {});
  const affects = (c, f) => ((consumers[c] || {})[f] || (consumers[c] || {})['*'] || []);

  /* ---------------- 出典の登録簿 ---------------- */
  for (const [sid, s] of Object.entries(sources)) {
    if (!s.label) add({ severity: 'error', code: 'source-invalid', id: sid, reason: '出典に label が無い' });
    if (s.url !== null && s.url !== undefined && !/^https?:\/\//.test(s.url)) add({ severity: 'error', code: 'source-invalid', id: sid, current: s.url, reason: '出典URLの形式が不正' });
  }

  const seen = {};
  const stats = { products: {}, unverifiedValues: 0, legacyValues: 0, prices: 0, validPrices: 0, stalePrices: 0 };

  for (const c of Object.keys(schema.categories)) {
    const def = schema.categories[c];
    const file = cat[c];
    if (!file) { add({ severity: 'error', code: 'load-failed', category: c, reason: `shared/catalog/${c}.json が無い` }); continue; }
    const recs = Catalog.products(file);
    stats.products[c] = recs.length;
    for (const r of recs) {
      const base = { category: c, id: r && r.id };
      if (!r || typeof r !== 'object') { add({ ...base, severity: 'error', code: 'record-invalid', reason: 'レコードがオブジェクトではない' }); continue; }
      // ID
      if (typeof r.id !== 'string' || !idRe.test(r.id)) add({ ...base, severity: 'error', code: 'id-invalid', current: r.id, reason: `IDは英小文字・数字・ハイフン（${schema.idPattern}）` });
      const k = String(r.id);
      if (seen[k]) add({ ...base, severity: 'error', code: 'id-duplicate', reason: `ID ${k} が ${seen[k]} と重複` });
      else seen[k] = c;
      if (r.category !== c) add({ ...base, severity: 'error', code: 'category-mismatch', current: r.category, reason: `category は ${c}` });
      for (const req of ['maker', 'name']) if (typeof r[req] !== 'string' || !r[req].trim()) add({ ...base, severity: 'error', code: 'required-missing', field: req, reason: `${req} が無い` });
      if (!Array.isArray(r.aliases)) add({ ...base, severity: 'error', code: 'type-mismatch', field: 'aliases', reason: 'aliases は配列' });
      if (!Array.isArray(r.listings) || !r.listings.length || r.listings.some((x) => !schema.listings[x])) add({ ...base, severity: 'error', code: 'listing-invalid', field: 'listings', current: r.listings, reason: `listings は ${Object.keys(schema.listings).join(' / ')} から1つ以上` });
      for (const [rk, rd] of Object.entries(def.record || {})) {
        const v = r[rk];
        if (rd.required && v === undefined) add({ ...base, severity: 'error', code: 'required-missing', field: rk, reason: `${rk} が無い（${rd.label || ''}）` });
        else if (rd.type === 'enum' && !rd.values.includes(v)) add({ ...base, severity: 'error', code: 'type-mismatch', field: rk, current: v, reason: `${rk} は ${rd.values.join(' / ')}` });
        else if (rd.type === 'string' && typeof v !== 'string') add({ ...base, severity: 'error', code: 'type-mismatch', field: rk, current: v, reason: `${rk} は文字列` });
      }

      // 仕様グループ
      const seenField = {};
      for (const g of r.specGroups || []) {
        const gsrc = sources[g.source];
        if (!g.source || !gsrc) add({ ...base, severity: 'error', code: 'source-missing', current: g.source, reason: '仕様グループの出典IDが sources.json に無い' });
        if (!schema.bases[g.basis]) add({ ...base, severity: 'error', code: 'basis-invalid', current: g.basis, reason: `basis は ${Object.keys(schema.bases).join(' / ')}` });
        if (g.checkedAt !== null && g.checkedAt !== undefined) {
          if (!Catalog.isDate(g.checkedAt)) add({ ...base, severity: 'error', code: 'date-invalid', field: 'checkedAt', current: g.checkedAt, reason: '確認日は YYYY-MM-DD' });
          else if (g.checkedAt > today) add({ ...base, severity: 'error', code: 'date-future', field: 'checkedAt', current: g.checkedAt, reason: '確認日が未来' });
        }
        const fieldNames = Object.keys(g.fields || {});
        if ((g.basis === 'official' || g.basis === 'secondary' || g.basis === 'measured')) {
          if (!g.checkedAt) add({ ...base, severity: 'warning', code: 'checked-date-missing', field: fieldNames.join(','), source: g.source, reason: `${g.basis} の値なのに確認日が無い`, affects: fieldNames.flatMap((f) => affects(c, f)) });
          if (gsrc && !gsrc.url) add({ ...base, severity: 'warning', code: 'source-url-missing', field: fieldNames.join(','), current: fieldNames.map((f) => `${f}=${JSON.stringify(g.fields[f])}`).join(' '), source: g.source, checkedAt: g.checkedAt || null, reason: '出典のURLが記録されていない（どのページで確認したか追えない）', affects: fieldNames.flatMap((f) => affects(c, f)) });
        }
        for (const [f, v] of Object.entries(g.fields || {})) {
          const fd = def.fields[f];
          const fb = { ...base, field: f, current: v, source: g.source, checkedAt: g.checkedAt || null, affects: affects(c, f) };
          if (!fd) { add({ ...fb, severity: 'error', code: 'field-unknown', reason: `schema.json に無い項目（単位・名前の誤りの可能性）` }); continue; }
          if (seenField[f]) add({ ...fb, severity: 'error', code: 'field-duplicate', reason: '同じ項目が複数のグループにある' });
          seenField[f] = true;
          if (v === null) { stats.unverifiedValues++; add({ ...fb, severity: 'info', code: 'unverified-value', reason: `未確認（null）：${fd.label}` }); continue; }
          const err = typeError(fd, v);
          if (err) { add({ ...fb, severity: 'error', code: 'type-mismatch', reason: `${fd.label}${fd.unit ? `（${fd.unit}）` : ''}: ${err}` }); continue; }
          if (g.basis === 'unverified') stats.legacyValues++;
        }
      }
      for (const f of Object.keys(def.fields)) if (!seenField[f]) add({ ...base, severity: 'info', code: 'field-absent', field: f, reason: `${def.fields[f].label} の項目が無い（未確認として扱う）`, affects: affects(c, f) });
      // 移行元のまま（確認日の無い値）はグループ単位で1件
      for (const g of r.specGroups || []) {
        const filled = Object.entries(g.fields || {}).filter(([, v]) => v !== null);
        if (g.basis === 'unverified' && filled.length) add({ ...base, severity: 'info', code: 'legacy-unverified', field: filled.map(([f]) => f).join(','), current: filled.map(([f, v]) => `${f}=${JSON.stringify(v)}`).join(' '), source: g.source, reason: '移行元の値のまま（外部出典・確認日の記録なし）', affects: filled.flatMap(([f]) => affects(c, f)) });
      }

      // スコア
      for (const [m, sc] of Object.entries(r.scores || {})) {
        const md = def.scores && def.scores[m];
        const sb = { ...base, field: m, current: sc && sc.value, source: sc && sc.source, affects: affects(c, m) };
        if (!md) { add({ ...sb, severity: 'error', code: 'score-unknown', reason: 'schema.json に無い評価指標' }); continue; }
        if (!md.versions.includes(sc.version)) add({ ...sb, severity: 'error', code: 'score-version', current: sc.version, reason: `版は ${md.versions.join(' / ')}` });
        if (sc.value !== null && (!Number.isFinite(sc.value) || sc.value < 0 || sc.value > 100)) add({ ...sb, severity: 'error', code: 'type-mismatch', reason: '0〜100の数値' });
        if (!sources[sc.source]) add({ ...sb, severity: 'error', code: 'source-missing', reason: '評価の出典IDが sources.json に無い' });
        if (sc.basis === 'estimated' && sc.note) add({ ...sb, severity: 'info', code: 'score-provisional', reason: sc.note });
      }

      // 価格
      checkPrices(r, c, base, { schema, config, sources, now, today, add, stats, affects, root });
    }
  }

  // CPU 固有
  const cpuById = Catalog.index(cat).cpu;
  for (const r of Catalog.products(cat.cpu)) {
    if (r.sameSpecsExceptIgpu && !cpuById[r.sameSpecsExceptIgpu]) add({ severity: 'error', code: 'ref-missing', category: 'cpu', id: r.id, field: 'sameSpecsExceptIgpu', current: r.sameSpecsExceptIgpu, reason: '参照先のCPUが無い' });
    const s = Catalog.specs(r);
    if (Number.isInteger(s.cores) && Number.isInteger(s.threads) && s.threads < s.cores) add({ severity: 'error', code: 'spec-inconsistent', category: 'cpu', id: r.id, field: 'threads', current: `${s.cores}C/${s.threads}T`, reason: 'スレッド数がコア数より少ない' });
    if (Number.isInteger(s.pCores) && Number.isInteger(s.eCores) && Number.isInteger(s.cores) && s.pCores + s.eCores !== s.cores) add({ severity: 'error', code: 'spec-inconsistent', category: 'cpu', id: r.id, field: 'cores', current: `P${s.pCores}+E${s.eCores}≠${s.cores}`, reason: 'Pコア＋Eコアがコア数と合わない' });
    if (Number.isFinite(s.baseGHz) && Number.isFinite(s.boostGHz) && s.boostGHz < s.baseGHz) add({ severity: 'error', code: 'spec-inconsistent', category: 'cpu', id: r.id, field: 'boostGHz', current: `${s.baseGHz}/${s.boostGHz}`, reason: '最大クロックがベースより低い' });
    if (Number.isFinite(s.tdpW) && Number.isFinite(s.maxPowerW) && s.maxPowerW < s.tdpW) add({ severity: 'error', code: 'spec-inconsistent', category: 'cpu', id: r.id, field: 'maxPowerW', current: `${s.tdpW}/${s.maxPowerW}`, reason: '最大電力がTDPより小さい（TDPと最大電力の取り違えの可能性）' });
  }

  if (o.crossRefs !== false) crossRefs(cat, root, add);
  if (o.generated !== false) generatedCheck(root, add);

  return finish(issues, stats, today);
}

function typeError(fd, v) {
  switch (fd.type) {
    case 'number': if (typeof v !== 'number' || !Number.isFinite(v)) return '数値ではない'; break;
    case 'integer': if (!Number.isInteger(v)) return '整数ではない'; break;
    case 'string': if (typeof v !== 'string' || !v.trim()) return '文字列ではない'; return null;
    case 'date': return Catalog.isDate(v) ? null : 'YYYY-MM-DD ではない';
    case 'string[]': if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) return '文字列の配列ではない'; if (fd.values && v.some((x) => !fd.values.includes(x))) return `${fd.values.join(' / ')} 以外の値`; return null;
    case 'string|false': return v === false || (typeof v === 'string' && v.trim()) ? null : '文字列か false';
    default: return `未対応の型 ${fd.type}`;
  }
  if (fd.min !== undefined && v < fd.min) return `${fd.min}${fd.unit || ''} 未満（単位の誤りの可能性）`;
  if (fd.max !== undefined && v > fd.max) return `${fd.max}${fd.unit || ''} 超（単位の誤りの可能性）`;
  return null;
}

function checkPrices(r, c, base, ctx) {
  const { schema, config, sources, now, today, add, stats, affects, root } = ctx;
  const types = schema.prices.types;
  for (const p of r.prices || []) {
    stats.prices++;
    const pb = { ...base, field: `price:${p && p.type}`, current: p && (p.amount ?? (p.min !== undefined ? `${p.min}〜${p.max}` : null)), source: p && p.source, checkedAt: p && p.checkedAt, affects: affects(c, `price:${p && p.type}`) };
    if (!p || !types[p.type]) { add({ ...pb, severity: 'error', code: 'price-type', reason: `価格の種類は ${Object.keys(types).join(' / ')}` }); continue; }
    if (!schema.prices.currencies.includes(p.currency)) add({ ...pb, severity: 'error', code: 'price-invalid', reason: '通貨が不正（JPY）' });
    if (!schema.prices.conditions.includes(p.condition)) add({ ...pb, severity: 'error', code: 'price-invalid', reason: '新品/中古（condition）が不正' });
    if (!p.target) add({ ...pb, severity: 'error', code: 'price-invalid', reason: '対象モデル（target）が無い' });
    if (!sources[p.source]) add({ ...pb, severity: 'error', code: 'source-missing', reason: '価格の出典IDが sources.json に無い' });
    if (p.type === 'used-range') {
      if (!(Number.isInteger(p.min) && Number.isInteger(p.max) && p.min > 0 && p.max >= p.min)) add({ ...pb, severity: 'error', code: 'price-invalid', reason: '中古相場は 0 < min ≦ max の整数（円）' });
    } else if (!(Number.isInteger(p.amount) && p.amount > 0)) add({ ...pb, severity: 'error', code: 'price-invalid', reason: '金額は正の整数（円）。不明なら価格を登録しない（0円にしない）' });
    if (p.type === 'market-median') {
      if (!(Number.isInteger(p.sampleSize) && p.sampleSize >= 1)) add({ ...pb, severity: 'error', code: 'price-invalid', reason: '実売相場には製品数（sampleSize）が必要' });
      // 対象VRAM（16GB版など）を指定した価格は、そのチップの VRAM と一致すること（8GB版や容量未指定のモデルに流用しない）
      const vram = Catalog.field(r, 'vramGB').value;
      if (p.vramGB !== undefined && p.vramGB !== vram) add({ ...pb, severity: 'error', code: 'price-variant', reason: `価格の対象VRAM（${p.vramGB}GB）がチップの VRAM（${vram}GB）と違う` });
      // 取得記録（evidence）がある価格は、記録から中央値を再計算して一致を確認する（再現性）
      if (p.evidence) {
        let ev = null;
        try { ev = JSON.parse(require('fs').readFileSync(require('path').join(root, p.evidence), 'utf8')); } catch (e) { add({ ...pb, severity: 'error', code: 'evidence-invalid', reason: '取得記録を読めない: ' + e.message }); }
        const ch = ev && ev.chips && ev.chips[r.id];
        if (ev && !ch) add({ ...pb, severity: 'error', code: 'evidence-invalid', reason: '取得記録にこのGPUの集計が無い' });
        if (ch) {
          const prices = (ch.included || []).map((x) => x.price).sort((a, b) => a - b);
          const n = prices.length;
          const raw = n ? (n % 2 ? prices[(n - 1) / 2] : (prices[n / 2 - 1] + prices[n / 2]) / 2) : null;
          const bad = [];
          if (n !== p.sampleSize) bad.push(`製品数 ${n} ≠ ${p.sampleSize}`);
          if (raw !== p.medianRaw) bad.push(`中央値（丸め前） ${raw} ≠ ${p.medianRaw}`);
          if (raw !== null && Math.round(raw / 1000) * 1000 !== p.amount) bad.push(`表示値 ${p.amount} が中央値 ${raw} の千円丸めと違う`);
          if (n && (prices[0] !== p.low || prices[n - 1] !== p.high)) bad.push('low/high が記録と違う');
          if ((ch.included || []).some((x) => !Number.isFinite(x.price) || x.price <= 0)) bad.push('価格の無い製品を集計に含めている');
          if (p.vramGB && (ch.included || []).some((x) => !new RegExp('/' + p.vramGB + 'GB$').test(x.memory || ''))) bad.push(`${p.vramGB}GB以外の製品を集計に含めている`);
          if (ev._meta && ev._meta.source !== p.source) bad.push('取得記録の出典IDが価格の出典と違う');
          if (bad.length) add({ ...pb, severity: 'error', code: 'evidence-mismatch', reason: '取得記録から再計算した値と違う: ' + bad.join(' / ') });
        }
      } else if (p.checkedAt && p === Catalog.latestOfType(r, 'market-median')) {
        add({ ...pb, severity: 'info', code: 'evidence-missing', reason: '最新の実売相場に製品ごとの取得記録（evidence）が無い（再計算できない）' });
      }
      if (Number.isFinite(p.low) && Number.isFinite(p.high) && !(p.low <= p.amount && p.amount <= p.high)) add({ ...pb, severity: 'error', code: 'price-invalid', reason: '中央値が low〜high の範囲外' });
    }
    if (p.checkedAt !== null && p.checkedAt !== undefined) {
      if (!Catalog.isDate(p.checkedAt)) { add({ ...pb, severity: 'error', code: 'date-invalid', reason: '確認日は YYYY-MM-DD' }); continue; }
      if (p.checkedAt > today) { add({ ...pb, severity: 'error', code: 'date-future', reason: '確認日が未来' }); continue; }
    }
    const st = Catalog.priceState(p, config, now);
    if (st.countable && st.undated) add({ ...pb, severity: 'error', code: 'price-undated', reason: '合計に入れる種類の価格なのに確認日が無い' });
    if (st.valid) stats.validPrices++;
    if (st.stale) { stats.stalePrices++; add({ ...pb, severity: 'warning', code: 'price-stale', reason: `価格が古い（確認から${st.ageDays}日・有効期間${st.staleAfterDays}日）。合計・コスパから外れ「更新待ち」と表示` }); }
    if (!st.countable && st.undated && p.type === 'reference') add({ ...pb, severity: 'info', code: 'price-reference-undated', reason: '確認日の無い参考価格（合計には入れない）' });
  }
  // 基準の違う価格の大きな差（どちらが正しいかは判定しない）
  const ref = Catalog.latestOfType(r, 'reference');
  const mm = Catalog.latestOfType(r, 'market-median');
  if (ref && mm && Number.isFinite(ref.amount) && Number.isFinite(mm.amount)) {
    const pct = Math.round(((ref.amount - mm.amount) / mm.amount) * 1000) / 10;
    if (Math.abs(pct) >= ((config.checks && config.checks.priceGapWarnPct) || 30)) add({ ...base, severity: 'warning', code: 'price-gap', field: 'price:reference', current: `reference ${ref.amount} / market-median ${mm.amount}（${pct}%）`, source: `${ref.source} / ${mm.source}`, checkedAt: mm.checkedAt, reason: '確認日なしの参考価格（reference）と実売相場（market-median）が大きく違う。種類の違う価格なので誤りとは断定しない。reference は PC BUILD CHECK の BTO 計算（と実売相場の無いGPUの GPU GUIDE 表示）に使われているため、基準の見直しが必要か判断する', affects: affects(c, 'price:reference') });
  }
  // 新品で PC BUILDER に出るのに、合計に入れられる価格が無い
  if (Catalog.listed(r, 'pc-builder') && r.market !== 'used') {
    const rep = Catalog.representativePrice(r, 'pc-builder', config, now);
    if (!rep || rep.fallback) add({ ...base, severity: 'info', code: 'price-missing', field: 'price', reason: 'PC BUILDER の合計に入れられる価格（最安値・実売相場）が無い。合計では「確認できないパーツ」として件数表示', affects: ['PC BUILDER 合計・コスパ'] });
  }
}

/* ---------------- 他データとの参照・二重管理 ---------------- */
function crossRefs(cat, root, add) {
  const gpuById = Catalog.index(cat).gpu;
  const cpuById = Catalog.index(cat).cpu;
  const norm = (s) => String(s || '').toLowerCase().replace(/\b(nvidia|geforce|amd|radeon|intel)\b/g, '').replace(/[^a-z0-9]/g, '');

  const ed = tryJson(L.PATHS.editorial, root);
  if (!ed) add({ severity: 'error', code: 'load-failed', reason: 'gpu-guide/data/gpu-editorial.json を読めない' });
  else {
    const edIds = new Set();
    for (const e of ed.gpus) {
      if (edIds.has(e.id)) add({ severity: 'error', code: 'id-duplicate', category: 'gpu', id: e.id, reason: 'gpu-editorial.json でIDが重複' });
      edIds.add(e.id);
      if (!gpuById[e.id]) add({ severity: 'error', code: 'ref-missing', category: 'gpu', id: e.id, reason: 'gpu-editorial.json のGPUが正本に無い' });
      else if (!Catalog.listed(gpuById[e.id], 'gpu-guide')) add({ severity: 'error', code: 'listing-mismatch', category: 'gpu', id: e.id, reason: 'gpu-editorial.json にあるが正本の listings に gpu-guide が無い' });
      for (const k of Object.keys(e)) if (!L.EDITORIAL_KEYS.has(k)) add({ severity: 'error', code: 'editorial-key', category: 'gpu', id: e.id, field: k, reason: 'GPU GUIDE 固有ではない項目（正本に置く）' });
      for (const cid of e.compare || []) if (!gpuById[cid] || !Catalog.listed(gpuById[cid], 'gpu-guide')) add({ severity: 'error', code: 'ref-missing', category: 'gpu', id: e.id, field: 'compare', current: cid, reason: '比較先のGPUが GPU GUIDE に無い' });
      if (typeof e.score !== 'number') add({ severity: 'error', code: 'required-missing', category: 'gpu', id: e.id, field: 'score', reason: 'GPU GUIDE の総合評価 score が無い' });
    }
    for (const r of Catalog.products(cat.gpu)) if (Catalog.listed(r, 'gpu-guide') && !edIds.has(r.id)) add({ severity: 'error', code: 'ref-missing', category: 'gpu', id: r.id, reason: 'listings に gpu-guide があるのに gpu-editorial.json に無い（説明文・掲載順が未設定）' });
    for (const r of Catalog.products(cat.gpu)) if (Catalog.listed(r, 'pc-builder') && !Catalog.listed(r, 'gpu-guide')) add({ severity: 'error', code: 'listing-mismatch', category: 'gpu', id: r.id, reason: 'PC BUILDER のGPUは GPU GUIDE の個別ページへリンクするため gpu-guide にも載せる' });
  }

  const parts = tryJson('pc-builder/data/parts.json', root);
  if (parts) {
    for (const p of parts.parts || []) {
      if (p.category === 'cpu' || p.category === 'gpu') add({ severity: 'error', code: 'duplicate-master', category: p.category, id: p.id, reason: 'pc-builder/data/parts.json に CPU/GPUチップがある（正本は shared/catalog/）' });
      if (p.category === 'gpuboard' && (!gpuById[p.chip] || !Catalog.listed(gpuById[p.chip], 'pc-builder'))) add({ severity: 'error', code: 'ref-missing', category: 'gpuboard', id: p.id, field: 'chip', current: p.chip, reason: 'グラボ製品のGPUチップが正本に無い' });
      if (p.category === 'gpuboard' && gpuById[p.chip]) {
        const v = Catalog.specs(gpuById[p.chip]).vramGB;
        if (Number.isFinite(p.specs.vram) && Number.isFinite(v) && p.specs.vram !== v) add({ severity: 'error', code: 'value-conflict', category: 'gpuboard', id: p.id, field: 'vram', current: `${p.specs.vram}GB / チップ ${v}GB`, reason: 'グラボ製品とGPUチップのVRAMが違う（別チップの可能性）' });
      }
    }
    const rules = tryJson('pc-builder/data/rules.json', root) || {};
    for (const r of Catalog.products(cat.cpu)) if (rules.cpuFamilies && !rules.cpuFamilies[r.family]) add({ severity: 'error', code: 'ref-missing', category: 'cpu', id: r.id, field: 'family', current: r.family, reason: 'CPU世代が pc-builder/data/rules.json の cpuFamilies に無い' });
    if (rules.gpuChipPower) add({ severity: 'error', code: 'duplicate-master', reason: 'pc-builder/data/rules.json に gpuChipPower が残っている（正本は shared/catalog/gpu.json）' });
  }
  const prices = tryJson('pc-builder/data/prices.json', root);
  if (prices) {
    if (prices.gpuChips) add({ severity: 'error', code: 'duplicate-master', reason: 'pc-builder/data/prices.json に gpuChips が残っている（正本は shared/catalog/gpu.json の prices）' });
    for (const id of Object.keys(prices.items || {})) if (cpuById[id] || gpuById[id]) add({ severity: 'error', code: 'duplicate-master', id, reason: 'pc-builder/data/prices.json の items にCPU/GPUの価格がある（正本は shared/catalog/）' });
  }
  // PC BUILD CHECK の part-prices.json（BTO基準の価格は別物。仕様の重複だけ一致を検証）
  const pp = tryJson('shared/parts/part-prices.json', root);
  if (pp && pp.cpu) {
    for (const [name, v] of Object.entries(pp.cpu)) {
      if (name[0] === '_') continue;
      const r = Catalog.products(cat.cpu).find((x) => norm(x.name) === norm(name));
      if (!r) { add({ severity: 'error', code: 'ref-missing', category: 'cpu', id: name, reason: 'part-prices.json のCPUが正本に無い', affects: ['PC BUILD CHECK'] }); continue; }
      const s = Catalog.specs(r);
      for (const f of ['cores', 'threads']) if (v[f] !== undefined && v[f] !== s[f]) add({ severity: 'error', code: 'value-conflict', category: 'cpu', id: r.id, field: f, current: `part-prices ${v[f]} / 正本 ${s[f]}`, reason: 'PC BUILD CHECK と正本でCPU仕様が違う', affects: ['PC BUILD CHECK（得意分野・構成タイプ）'] });
      if (v.x3d !== undefined && v.x3d !== /x3d$/.test(r.id)) add({ severity: 'error', code: 'value-conflict', category: 'cpu', id: r.id, field: 'x3d', current: v.x3d, reason: 'X3D の有無が型番と合わない', affects: ['PC BUILD CHECK'] });
    }
  }
  // PC BUILD CHECK の構成が参照するGPU
  const buildsRaw = tryJson('pc-build-check/builds.json', root);
  const builds = Array.isArray(buildsRaw) ? buildsRaw : (buildsRaw && buildsRaw.builds) || [];
  const gpuNames = new Set(Catalog.products(cat.gpu).filter((r) => Catalog.listed(r, 'gpu-guide')).map((r) => norm(r.name)));
  const missing = new Set();
  for (const b of builds) if (b.gpu && !gpuNames.has(norm(b.gpu))) missing.add(b.gpu);
  for (const n of missing) add({ severity: 'error', code: 'ref-missing', category: 'gpu', id: n, reason: 'pc-build-check/builds.json のGPUが正本（GPU GUIDE掲載分）に無い', affects: ['PC BUILD CHECK'] });
  // UPGRADE の手書きの性能指数（別尺度。共通化しない）に正本のGPUが揃っているか
  try {
    const file = path.join(root, L.PATHS.engine);
    delete require.cache[require.resolve(file)];
    const E = require(file);
    for (const r of Catalog.products(cat.gpu)) if (Catalog.listed(r, 'upgrade') && !(Catalog.engineKey(r.id) in E.GPU_TIERS)) add({ severity: 'warning', code: 'site-metric-missing', category: 'gpu', id: r.id, field: 'GPU_TIERS', reason: 'UPGRADE の性能指数（GPU_TIERS・独自尺度）に無い。UPGRADE の入力候補で判定できない', affects: ['UPGRADE'] });
    for (const key of Object.keys(E.GPU_TIERS)) if (!Catalog.products(cat.gpu).some((r) => Catalog.engineKey(r.id) === key)) add({ severity: 'warning', code: 'ref-missing', category: 'gpu', id: key, field: 'GPU_TIERS', reason: 'UPGRADE の GPU_TIERS にあるが正本に無い（消費電力・推奨電源を引けない）', affects: ['UPGRADE'] });
  } catch (e) { add({ severity: 'error', code: 'load-failed', reason: 'upgrade-engine.js を読めない: ' + e.message }); }
}

/* ---------------- 生成物が正本と一致するか ---------------- */
function generatedCheck(root, add) {
  let res;
  try { res = L.computeOutputs(root); } catch (e) { add({ severity: 'error', code: 'generate-failed', reason: '生成できない: ' + e.message }); return; }
  for (const [rel, text] of Object.entries(res.outputs)) {
    let disk = null;
    try { disk = L.readText(rel, root); } catch (e) { /* 無い */ }
    if (disk === null || !L.sameText(disk, text)) add({ severity: 'error', code: 'generated-stale', id: rel, reason: `${rel} が正本から生成した内容と違う（生成物を手で直した／生成し忘れ）。node scripts/catalog/build.js を実行する`, affects: [rel] });
  }
  // revisions.json が最新か
  let prev = null;
  try { prev = L.readJson(L.PATHS.revisions, root); } catch (e) { /* 無い */ }
  const rev = L.computeRevisions(res.cat, prev, new Date());
  if (!prev || rev.changed.length || rev.removed.length) add({ severity: 'error', code: 'revisions-stale', id: L.PATHS.revisions, current: rev.changed.slice(0, 5).map((x) => x.key).join(', '), reason: '正本を変えたのに更新履歴（revisions.json）が更新されていない。node scripts/catalog/build.js を実行する' });
}

function finish(issues, stats, today) {
  issues.sort((a, b) => (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]) || String(a.code).localeCompare(String(b.code)) || String(a.id).localeCompare(String(b.id)));
  const count = (s) => issues.filter((i) => i.severity === s).length;
  const byCode = {};
  for (const i of issues) {
    const k = `${i.severity}:${i.code}`;
    byCode[k] = (byCode[k] || 0) + 1;
  }
  return { today, summary: { errors: count('error'), warnings: count('warning'), infos: count('info'), byCode }, stats, issues };
}

/* ---------------- 人間用の要約 ---------------- */
const CODE_LABEL = {
  'price-stale': '価格が古い（更新待ち）', 'source-url-missing': '出典URLが無い', 'checked-date-missing': '確認日が無い', 'price-gap': '参考価格と実売相場の差が大きい', 'price-variant': '価格の対象VRAMがチップと違う', 'evidence-invalid': '価格の取得記録を読めない', 'evidence-mismatch': '価格が取得記録と一致しない', 'evidence-missing': '価格の取得記録が無い',
  'site-metric-missing': 'UPGRADE独自指数が無い', 'unverified-value': '未確認（null）の値', 'legacy-unverified': '移行元のまま（出典・確認日なし）', 'price-missing': '合計に使える価格が無い',
  'price-reference-undated': '確認日の無い参考価格', 'field-absent': '項目が無い', 'score-provisional': '暫定の推定スコア',
};

function formatHuman(res) {
  const out = [];
  const s = res.summary;
  out.push(`共通パーツデータの検証（${res.today}）`);
  out.push(`  製品: GPU ${res.stats.products ? res.stats.products.gpu : '-'}件 / CPU ${res.stats.products ? res.stats.products.cpu : '-'}件　価格 ${res.stats.prices || 0}件（合計に使える ${res.stats.validPrices || 0}・古い ${res.stats.stalePrices || 0}）`);
  out.push(`  致命的 ${s.errors}件 / 要確認 ${s.warnings}件 / 把握用 ${s.infos}件`);
  const errs = res.issues.filter((i) => i.severity === 'error');
  if (errs.length) {
    out.push('', '■ 致命的（直すまで公開しない）');
    errs.slice(0, 40).forEach((i) => out.push(`  - [${i.code}] ${i.category ? i.category + ':' : ''}${i.id || ''}${i.field ? ' ' + i.field : ''} … ${i.reason}${i.current !== null && i.current !== undefined ? `（現在値 ${JSON.stringify(i.current)}）` : ''}`));
    if (errs.length > 40) out.push(`  …ほか ${errs.length - 40}件（--json で全件）`);
  }
  for (const sev of ['warning', 'info']) {
    const list = res.issues.filter((i) => i.severity === sev);
    if (!list.length) continue;
    out.push('', sev === 'warning' ? '■ 要確認（優先順）' : '■ 把握用（サイトは動く）');
    const groups = {};
    for (const i of list) (groups[i.code] = groups[i.code] || []).push(i);
    const order = ['price-stale', 'price-gap', 'source-url-missing', 'checked-date-missing', 'site-metric-missing'];
    Object.keys(groups).sort((a, b) => ((order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))).forEach((code) => {
      const g = groups[code];
      const ids = [...new Set(g.map((i) => i.id))];
      out.push(`  - ${CODE_LABEL[code] || code}: ${g.length}件（${ids.slice(0, 6).join(', ')}${ids.length > 6 ? ' ほか' : ''}）`);
    });
  }
  out.push('', '詳細（該当ID・項目・現在値・出典・確認日・理由・影響する参照先）: node scripts/catalog/validate.js --json');
  return out.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const res = validate({});
  const outIdx = args.indexOf('--out');
  if (outIdx >= 0 && args[outIdx + 1]) {
    fs.writeFileSync(args[outIdx + 1], JSON.stringify(res, null, 2) + '\n');
    console.log(`詳細を保存: ${args[outIdx + 1]}`);
  }
  if (args.includes('--json')) process.stdout.write(JSON.stringify(res, null, 2) + '\n');
  else console.log(formatHuman(res));
  process.exitCode = res.summary.errors ? 1 : 0;
}

module.exports = { validate, formatHuman, CODE_LABEL };
