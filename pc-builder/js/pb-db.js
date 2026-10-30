/* =====================================================================
 *  Sippo PC BUILDER  パーツデータベース (pb-db.js)
 *  ---------------------------------------------------------------------
 *  複数の既存データを「1つのパーツ一覧」にまとめる純粋なロジック層。
 *  DOM には触れない（ブラウザでも Node のテストでも同じ関数を使う）。
 *
 *  【データの出どころ（重複管理しない）】
 *   - GPUチップ          … gpu-guide/gpus.json（性能指数・VRAM・消費電力・目安価格）
 *   - GPUの公式推奨電源  … upgrade/upgrade-engine.js の GPU_POWER_SPEC
 *                           （無いチップだけ data/rules.json の gpuChipPower）
 *   - CPUのゲーム性能    … upgrade/upgrade-engine.js の CPU_TIERS
 *   - 参考価格 … pc-builder/data/prices.json（個別購入の小売目安・手動確認。GPUチップは gpuChips）
 *        価格には tier を付ける: retail（実売確認価格）/ median（参考中央値）/ reference（既存の参考価格）。
 *        reference と、確認から日数がたった価格（stale）は「有効な価格」ではない（合計・コスパに入れない）。
 *        そこに無いときだけ shared/parts/part-prices.json（BTO構成用）/
 *        upgrade-engine.js の PRICE_HINT（日付なし）を、その旨を付けて使う。
 *        rules.json の pricing.suspendFallback にあるカテゴリは既存データを使わない。
 *   - それ以外のパーツ仕様               … pc-builder/data/parts.json
 *
 *  【不明値の扱い】
 *   値が無いものは null のまま残す。0 や平均値で埋めない
 *   （互換性チェック・スコア計算側が null を「要確認」「評価不可」にする）。
 * ===================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SippoPBDb = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CATEGORIES = [
    { id: 'cpu',         label: 'CPU',            short: 'CPU',     multi: false, required: true,  icon: 'cpu' },
    { id: 'gpu',         label: 'GPU（グラフィックボード）', short: 'GPU', multi: false, required: false, icon: 'gpu' },
    { id: 'gpuboard',    label: 'グラボ製品（メーカー別）', short: 'グラボ製品', multi: false, required: false, icon: 'gpu', parent: 'gpu' },
    { id: 'motherboard', label: 'マザーボード',   short: 'マザボ',  multi: false, required: true,  icon: 'mb' },
    { id: 'memory',      label: 'メモリ',         short: 'メモリ',  multi: false, required: true,  icon: 'mem', qty: true, maxQty: 4 },
    { id: 'storage',     label: 'SSD・HDD',       short: 'ストレージ', multi: true, required: true,  icon: 'ssd', qty: true, maxQty: 8 },
    { id: 'psu',         label: '電源ユニット',   short: '電源',    multi: false, required: true,  icon: 'psu' },
    { id: 'case',        label: 'PCケース',       short: 'ケース',  multi: false, required: true,  icon: 'case' },
    { id: 'cooler',      label: 'CPUクーラー',    short: 'クーラー', multi: false, required: false, icon: 'cooler' },
    { id: 'fan',         label: 'ケースファン',   short: 'ファン',  multi: true,  required: false, icon: 'fan', qty: true, maxQty: 12 },
    { id: 'expansion',   label: '拡張パーツ',     short: '拡張',    multi: true,  required: false, icon: 'exp', qty: true, maxQty: 4 },
  ];

  var CATEGORY_MAP = {};
  CATEGORIES.forEach(function (c) { CATEGORY_MAP[c.id] = c; });

  /** upgrade-engine.js / affiliate.js と同じ正規化（GPU名・ID の突き合わせ用） */
  function normalizeKey(value) {
    return String(value == null ? '' : value)
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xfee0); })
      .toLowerCase()
      .replace(/\b(nvidia|geforce|amd|radeon|intel)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /** "a.b.c" 形式のパスでオブジェクトを辿る（キーに空白を含むものはそのまま扱う） */
  function dig(obj, path) {
    var cur = obj;
    var keys = String(path).split('.');
    for (var i = 0; i < keys.length; i++) {
      if (cur == null) return undefined;
      cur = cur[keys[i]];
    }
    return cur;
  }

  /**
   * 参考価格を既存データから引く。見つからなければ null（推測しない）。
   *   part-prices:<path>  → shared/parts/part-prices.json
   *   upgrade-hint:<key>  → upgrade-engine.js の PRICE_HINT（日付を持たないデータ）
   */
  function resolvePriceRef(ref, ctx) {
    if (!ref) return null;
    var idx = ref.indexOf(':');
    var kind = ref.slice(0, idx);
    var path = ref.slice(idx + 1);
    if (kind === 'part-prices' && ctx.partPrices) {
      // 先頭のトップレベルキーだけを分け、残りは "DDR5.32GB" のように辿る
      var first = path.split('.')[0];
      var rest = path.slice(first.length + 1);
      var node = ctx.partPrices[first];
      var hit = rest ? digWithSpaces(node, rest) : node;
      if (hit && isNum(hit.price)) {
        return {
          value: hit.price,
          type: 'sippo',
          checkedAt: hit.updated || (ctx.partPrices._meta && ctx.partPrices._meta.updated) || null,
          label: 'Sippo参考価格（BTO構成用の目安）',
          basis: 'shared/parts/part-prices.json',
          tier: 'reference',
        };
      }
      return null;
    }
    if (kind === 'upgrade-hint' && ctx.engine && ctx.engine.PRICE_HINT) {
      var v = ctx.engine.PRICE_HINT[path];
      if (isNum(v)) {
        return { value: v, type: 'sippo', checkedAt: null, label: 'Sippo参考価格（新品実売の目安・日付なし）', basis: 'upgrade/upgrade-engine.js PRICE_HINT', tier: 'reference' };
      }
    }
    return null;
  }

  /* part-prices.json の storage キーは "1TB NVMe SSD" のように空白とドットを含まないが、
     memory は "DDR5.32GB" と2段。区切りを1段ずつ試して解決する。 */
  function digWithSpaces(node, rest) {
    if (!node) return undefined;
    if (node[rest] !== undefined) return node[rest];
    var parts = rest.split('.');
    return dig(node, parts.join('.'));
  }

  /**
   * 個別の価格データが無い製品に「同じクラスの参考価格」を当てる。
   * 製品そのものの価格ではないので type: 'class' とし、画面では必ずその旨を出す。
   * クラスが一意に決まらないもの（ケース・ファン・SATA機器など）は null のまま。
   */
  function classPrice(part, ctx) {
    var s = part.specs || {};
    var ref = null, label = '', key = null;
    if (part.category === 'memory' && s.type && isNum(s.capacityGB)) {
      ref = 'part-prices:memory.' + s.type + '.' + s.capacityGB + 'GB'; label = s.type + ' ' + s.capacityGB + 'GB';
      key = 'memory:' + s.type + ':' + s.capacityGB;
    } else if (part.category === 'storage' && s.kind === 'nvme' && isNum(s.capacityGB) && [1000, 2000, 4000].indexOf(s.capacityGB) >= 0) {
      ref = 'part-prices:storage.' + (s.capacityGB / 1000) + 'TB NVMe SSD'; label = 'NVMe SSD ' + (s.capacityGB / 1000) + 'TB';
      key = 'storage:nvme:' + s.capacityGB;
    } else if (part.category === 'motherboard' && s.socket) {
      if (s.socket === 'AM4' || s.socket === 'AM5') ref = 'part-prices:motherboard.' + s.socket;
      label = s.socket + ' マザーボード';
      key = 'motherboard:' + s.socket;
    } else if (part.category === 'psu' && [650, 750, 850, 1000].indexOf(s.watt) >= 0) {
      ref = 'upgrade-hint:psu_' + s.watt; label = s.watt + 'W 電源';
      key = 'psu:' + s.watt;
    } else if (part.category === 'cooler' && (s.type === 'air' || s.type === 'aio')) {
      ref = 'upgrade-hint:cooler_' + s.type; label = s.type === 'aio' ? '簡易水冷' : '空冷クーラー';
    }
    // 1) 同クラスの小売目安（prices.json）
    var cls = key && ctx.prices && ctx.prices.classes ? ctx.prices.classes[key] : null;
    if (cls && isNum(cls.value)) {
      return retail(cls, ctx, 'class', '容量別の参考中央値（' + (cls.label || label) + '・' + cls.n + '製品）');
    }
    // 2) 既存データ。実売と大きく違うと確認したカテゴリでは使わない（古い価格で安く見せない）
    if (suspendedReason(part.category, ctx)) return null;
    var hit = ref ? resolvePriceRef(ref, ctx) : null;
    if (!hit) return null;
    hit.type = 'class';
    hit.tier = 'reference';
    hit.label = '同クラスの参考価格（' + label + '・' + (hit.basis === 'shared/parts/part-prices.json' ? 'BTO構成用の目安' : '新品実売の目安・日付なし') + '）';
    return hit;
  }

  function suspendedReason(category, ctx) {
    var p = ctx.rules && ctx.rules.pricing && ctx.rules.pricing.suspendFallback;
    return p && typeof p[category] === 'string' ? p[category] : null;
  }

  /** prices.json の1件を価格オブジェクトにする */
  function retail(entry, ctx, type, label) {
    var meta = (ctx.prices && ctx.prices._meta) || {};
    var src = meta.sources && meta.sources[entry.source] ? meta.sources[entry.source] : null;
    return {
      value: entry.value,
      type: type,
      tier: type === 'retail' ? 'retail' : 'median',
      n: isNum(entry.n) ? entry.n : null,
      low: isNum(entry.low) ? entry.low : null,
      checkedAt: entry.checkedAt || null,
      label: label,
      basis: 'pc-builder/data/prices.json',
      range: Array.isArray(entry.range) ? entry.range.slice(0, 2) : null,
      note: entry.note || '',
      sourceLabel: src ? src.label : '',
      sourceUrl: src ? src.url : '',
    };
  }

  /** 確認日から staleAfterDays を過ぎた価格に stale を付ける（日付なしは判断しない） */
  function markStale(price, ctx) {
    if (!price) return price;
    if (!price.tier) price.tier = 'reference';
    price.valid = false;
    if (!price.checkedAt) return price;
    var days = (ctx.prices && ctx.prices._meta && ctx.prices._meta.staleAfterDays) || 45;
    var t = Date.parse(price.checkedAt + 'T00:00:00+09:00');
    var now = ctx.now instanceof Date ? ctx.now.getTime() : Date.now();
    if (isFinite(t)) price.ageDays = Math.floor((now - t) / 86400000);
    price.stale = isFinite(t) && price.ageDays > days;
    price.valid = price.tier !== 'reference' && !price.stale;
    return price;
  }

  /** 2つのCPUが内蔵GPUの有無以外まったく同じ仕様か（ゲーム指数を借りてよいかの判定） */
  var SILICON_KEYS = ['socket', 'cores', 'threads', 'pCores', 'eCores', 'baseGHz', 'boostGHz', 'l3MB', 'tdpW', 'maxPowerW'];
  function sameCpuSilicon(p, all, otherId) {
    var o = (all || []).filter(function (x) { return x.id === otherId; })[0];
    if (!o || !o.specs || !p.specs) return false;
    return SILICON_KEYS.every(function (k) { return isNum(p.specs[k]) || typeof p.specs[k] === 'string' ? p.specs[k] === o.specs[k] : false; });
  }

  /** GPU GUIDE の1件を PC BUILDER のパーツ形式へ変換する */
  function gpuFromGuide(g, ctx) {
    var key = normalizeKey(g.id);
    var engine = ctx.engine || {};
    var rules = ctx.rules || {};
    var spec = (engine.GPU_POWER_SPEC && engine.GPU_POWER_SPEC[key]) ||
      (rules.gpuChipPower && rules.gpuChipPower[key]) || null;
    var enc = null;
    if (rules.encoders) {
      if (rules.encoders.byGpuId && rules.encoders.byGpuId[g.id]) enc = rules.encoders.byGpuId[g.id];
      else if (rules.encoders.bySeries && rules.encoders.bySeries[g.series]) enc = rules.encoders.bySeries[g.series];
    }
    var used = g.market === 'used';
    return {
      id: g.id,
      category: 'gpu',
      maker: g.brand || g.maker || '',
      name: g.name,
      released: g.releaseYear ? String(g.releaseYear) : null,
      kind: 'chip',
      specs: {
        raster: isNum(g.rasterScore) ? g.rasterScore : null,
        feature: isNum(g.featureScore) ? g.featureScore : null,
        vram: isNum(g.vram) ? g.vram : null,
        powerW: isNum(g.power) ? g.power : null,
        series: g.series || null,
        target: g.target || null,
        market: used ? 'used' : 'new',
        encoder: enc ? enc.slice() : null,
        encoderVerified: !!(enc && rules.encoders && Array.isArray(rules.encoders.verifiedBrands) && rules.encoders.verifiedBrands.indexOf(g.brand || g.maker) >= 0),
        officialPsuW: spec && isNum(spec.psu) ? spec.psu : null,
        connectorRef: spec ? spec.connector : null,
      },
      // PC BUILDER では prices.json の gpuChips（確認日つきの参考中央値）を優先する。
      // GPU GUIDE の値は guidePrice として別に持ち、「GPU GUIDE掲載（別基準・日付なし）」と表示するだけ。
      price: null,
      guidePrice: isNum(g.price) ? {
        value: g.price,
        type: used ? 'used' : 'sippo',
        tier: 'reference',
        checkedAt: null,
        label: used ? 'GPU GUIDE 中古相場の目安（日付なし）' : 'GPU GUIDE 掲載の参考価格（日付なし）',
        basis: 'gpu-guide/gpus.json',
        notice: !used && rules.pricing && rules.pricing.notices && rules.pricing.notices.gpu ? rules.pricing.notices.gpu.text : '',
      } : null,
      source: { label: 'GPU GUIDE（Sippo）', url: '/gpu-guide/gpu/' + g.id + '/', kind: 'sippo', checkedAt: null },
      guideUrl: '/gpu-guide/gpu/' + g.id + '/',
      affiliateId: key,
      summary: g.summary || '',
    };
  }

  /**
   * すべての入力から DB を作る。
   * @param {object} input { parts, gpus, partPrices, engine, rules, gpuTarget, affiliateProducts }
   */
  function buildDb(input) {
    var ctx = input || {};
    var list = [];
    var warnings = [];
    var byId = {};
    var sources = (ctx.parts && ctx.parts.sources) || {};

    (ctx.gpus || []).forEach(function (g) {
      if (!g || !g.id || !g.name) return;
      var gp = gpuFromGuide(g, ctx);
      var chip = ctx.prices && ctx.prices.gpuChips ? ctx.prices.gpuChips[g.id] : null;
      if (chip && isNum(chip.value) && gp.specs.market !== 'used') gp.price = retail(chip, ctx, 'class', 'チップ別の参考中央値（' + chip.n + '製品）');
      else if (gp.guidePrice) gp.price = Object.assign({}, gp.guidePrice);
      markStale(gp.price, ctx);
      list.push(gp);
    });

    ((ctx.parts && ctx.parts.parts) || []).forEach(function (p) {
      if (!p || !p.id || !CATEGORY_MAP[p.category]) {
        warnings.push('不正なパーツ定義をスキップ: ' + (p && p.id));
        return;
      }
      var part = {
        id: p.id,
        category: p.category,
        maker: p.maker || '',
        name: p.name,
        model: p.model || '',
        released: p.released || null,
        kind: p.kind || 'product',
        family: p.family || null,
        chip: p.chip || null,
        specs: Object.assign({}, p.specs || {}),
        price: null,
        source: p.source && sources[p.source] ? Object.assign({ id: p.source }, sources[p.source]) : null,
        specSources: p.specSources || null,
        affiliateId: p.affiliateId || null,
        shops: Array.isArray(p.shops) ? p.shops : [],
        lengthNote: p.lengthNote || '',
      };
      var item = ctx.prices && ctx.prices.items ? ctx.prices.items[p.id] : null;
      if (item && isNum(item.value)) part.price = retail(item, ctx, 'retail', '小売価格の目安');
      else {
        // 目安パーツ（priceRef あり）も、同クラスの小売目安があればそちらを優先する
        var cls = classPrice(part, ctx);
        if (p.priceRef && !(cls && cls.basis === 'pc-builder/data/prices.json')) {
          part.price = suspendedReason(p.category, ctx) ? null : resolvePriceRef(p.priceRef, ctx);
        } else part.price = cls;
      }
      // CPU で prices.json に無いものは part-prices.json の cpu（名前キー・BTO構成用）を使う
      if (!item && p.category === 'cpu' && ctx.partPrices && ctx.partPrices.cpu && ctx.partPrices.cpu[p.name]) {
        var cp = ctx.partPrices.cpu[p.name];
        if (isNum(cp.price)) part.price = { value: cp.price, type: 'sippo', checkedAt: cp.updated || null, label: 'Sippo参考価格（BTO構成用の目安）', basis: 'shared/parts/part-prices.json' };
      }
      markStale(part.price, ctx);
      // CPU のゲーム性能（相対値）は upgrade-engine.js の CPU_TIERS を引く。
      // 無い型番は、仕様が内蔵GPUの有無以外すべて一致する兄弟型番（gameTierSameAs）の値を使う。
      if (p.category === 'cpu') {
        var tiers = ctx.engine && ctx.engine.CPU_TIERS ? ctx.engine.CPU_TIERS : {};
        var tier = tiers[p.id];
        part.gameTierFrom = null;
        if (!isNum(tier) && p.gameTierSameAs && isNum(tiers[p.gameTierSameAs]) && sameCpuSilicon(p, ctx.parts.parts, p.gameTierSameAs)) {
          tier = tiers[p.gameTierSameAs];
          part.gameTierFrom = p.gameTierSameAs;
        }
        part.specs.gameTier = isNum(tier) ? tier : null;
        if (p.boxCoolerNote) part.boxCoolerNote = p.boxCoolerNote;
      }
      list.push(part);
    });

    list.forEach(function (part) {
      if (byId[part.id]) warnings.push('ID重複: ' + part.id);
      byId[part.id] = part;
      part.searchText = [part.name, part.maker, part.model, part.id, normalizeKey(part.name)].join(' ').toLowerCase();
    });

    // グラボ製品のチップ参照を検証（存在しないチップを指していたら警告）
    list.forEach(function (part) {
      if (part.category === 'gpuboard' && (!part.chip || !byId[part.chip])) {
        warnings.push('グラボ製品のチップが見つからない: ' + part.id + ' → ' + part.chip);
      }
    });

    var byCategory = {};
    CATEGORIES.forEach(function (c) { byCategory[c.id] = []; });
    list.forEach(function (part) { byCategory[part.category].push(part); });

    var normIndex = {};
    list.forEach(function (part) {
      var k = normalizeKey(part.name);
      if (k && !normIndex[part.category + ':' + k]) normIndex[part.category + ':' + k] = part.id;
    });

    var thresholds = (ctx.gpuTarget && ctx.gpuTarget.THRESHOLDS) || { WQHD: 65, '4K': 85 };
    var fhdBase = ctx.engine && ctx.engine.RESOLUTION_TARGETS && ctx.engine.RESOLUTION_TARGETS.fhd
      ? ctx.engine.RESOLUTION_TARGETS.fhd.base : 42;

    return {
      list: list,
      byId: byId,
      byCategory: byCategory,
      normIndex: normIndex,
      rules: ctx.rules || {},
      warnings: warnings,
      resolutionRef: { fhd: fhdBase, wqhd: thresholds.WQHD, '4k': thresholds['4K'] },
      partPricesUpdated: ctx.partPrices && ctx.partPrices._meta ? ctx.partPrices._meta.updated : null,
    };
  }

  /** 名前（表記ゆれあり）からパーツを探す。完全一致（正規化後）のみ。部分一致はしない。 */
  function findByName(db, category, name) {
    if (!name) return null;
    var k = normalizeKey(name);
    var id = db.normIndex[category + ':' + k];
    return id ? db.byId[id] : null;
  }

  /**
   * 名前から候補を返す（引き継ぎ時に「近い製品」を選んでもらう用）。
   * 自動で決め打ちはしない。トークンの重なりでスコアを付けて上位を返すだけ。
   */
  function suggest(db, category, name, limit) {
    var raw = String(name || '').toLowerCase();
    var tokens = raw.replace(/[()（）\[\]【】,、/／]/g, ' ').split(/\s+/).filter(function (t) { return t.length >= 2; });
    var key = normalizeKey(name);
    var out = [];
    (db.byCategory[category] || []).forEach(function (p) {
      var score = 0;
      var nk = normalizeKey(p.name);
      if (key && nk === key) score += 100;
      else if (key && key.length >= 4 && (nk.indexOf(key) >= 0 || key.indexOf(nk) >= 0)) score += 30;
      tokens.forEach(function (t) { if (p.searchText.indexOf(t) >= 0) score += 10; });
      if (score > 0) out.push({ part: p, score: score });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, limit || 5).map(function (o) { return o.part; });
  }

  /**
   * 検索・絞り込み・並べ替え。
   * @param {object} q { category, text, maker, priceMax, sort, filter(part)→bool }
   */
  function query(db, q) {
    var items = (db.byCategory[q.category] || []).slice();
    var text = String(q.text || '').trim().toLowerCase();
    if (text) {
      var words = text.split(/\s+/);
      items = items.filter(function (p) {
        return words.every(function (w) { return p.searchText.indexOf(w) >= 0 || p.searchText.indexOf(normalizeKey(w)) >= 0; });
      });
    }
    if (q.maker) items = items.filter(function (p) { return p.maker === q.maker; });
    if (isNum(q.priceMax)) items = items.filter(function (p) { return p.price && p.price.value <= q.priceMax; });
    if (q.hideUsed) items = items.filter(function (p) { return !(p.specs && p.specs.market === 'used'); });
    if (typeof q.filter === 'function') items = items.filter(q.filter);

    var sorters = {
      name: function (a, b) { return a.name.localeCompare(b.name, 'ja'); },
      priceAsc: function (a, b) { return priceOf(a, Infinity) - priceOf(b, Infinity); },
      priceDesc: function (a, b) { return priceOf(b, -Infinity) - priceOf(a, -Infinity); },
      perf: function (a, b) { return perfOf(b) - perfOf(a); },
      newest: function (a, b) { return String(b.released || '').localeCompare(String(a.released || '')); },
    };
    items.sort(sorters[q.sort] || sorters.perf);
    return items;
  }

  function priceOf(p, fallback) { return p.price && isNum(p.price.value) ? p.price.value : fallback; }

  /** 並べ替え用の「性能」。カテゴリごとに確認済みの値だけを使い、無ければ最後尾 */
  function perfOf(p) {
    var s = p.specs || {};
    switch (p.category) {
      case 'gpu': return isNum(s.raster) ? s.raster : -1;
      case 'cpu': return isNum(s.gameTier) ? s.gameTier : -1;
      case 'memory': return isNum(s.capacityGB) ? s.capacityGB : -1;
      case 'storage': return isNum(s.capacityGB) ? s.capacityGB : -1;
      case 'psu': return isNum(s.watt) ? s.watt : -1;
      case 'case': return isNum(s.maxGpuMm) ? s.maxGpuMm : -1;
      case 'gpuboard': return isNum(s.lengthMm) ? -s.lengthMm : -9999;
      default: return 0;
    }
  }

  function makersOf(db, category) {
    var seen = {};
    (db.byCategory[category] || []).forEach(function (p) { if (p.maker) seen[p.maker] = true; });
    return Object.keys(seen).sort();
  }

  return {
    CATEGORIES: CATEGORIES,
    CATEGORY_MAP: CATEGORY_MAP,
    normalizeKey: normalizeKey,
    buildDb: buildDb,
    findByName: findByName,
    suggest: suggest,
    query: query,
    makersOf: makersOf,
    perfOf: perfOf,
    _resolvePriceRef: resolvePriceRef,
  };
});
