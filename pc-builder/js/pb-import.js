/* =====================================================================
 *  Sippo PC BUILDER  他サイトからの引き継ぎ (pb-import.js)
 *  ---------------------------------------------------------------------
 *  既存の Sippo サイトから渡されたURLパラメータを、PC BUILDER の構成に変換する。
 *
 *    GPU GUIDE        ?gpuid=<gpus.json の id>（?gpu= も受け付ける）
 *    PC BUILD CHECK   ?from=pcbc&build=<構成スラグ>       （builds.json から復元）
 *    GAME PC GUIDE    ?game=<スラグ>&res=fhd|wqhd|4k      （games.json の推奨構成）
 *    PC UPGRADE       ?from=upgrade&cgpu=&ccpu=&cmem=&togpu=&res=
 *    PC Builds Hub    ?from=hub&cpu=&gpu=&ram=&mb=&storage=&case=&psu=&cooler=&title=
 *
 *  【大事な方針】
 *   - 名前が完全一致（正規化後）したものだけを自動で入れる。
 *   - 一致しないものは「候補」を出してユーザーに選んでもらう（勝手に決めない）。
 *   - 不明なID・壊れた値は無視して、理由を notes に残す。
 * ===================================================================== */
(function (root, factory) {
  var api = factory(root.SippoPBDb || (typeof require === 'function' ? require('./pb-db.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SippoPBImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Db) {
  'use strict';

  var RES = { fhd: 'fhd', wqhd: 'wqhd', '4k': '4k' };

  function cleanText(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max || 80);
  }

  /** メモリ表記（"32GB DDR4-3200 (16GB×2)" / "16GB" など）から容量と規格を読む */
  function parseMemory(text) {
    var t = String(text || '').toUpperCase();
    var gb = /(\d{1,3})\s*GB/.exec(t);
    var type = /DDR([45])/.exec(t);
    return { gb: gb ? Number(gb[1]) : null, type: type ? 'DDR' + type[1] : null };
  }

  /** 容量と規格から目安メモリ（generic）を探す。見つからなければ null */
  function genericMemory(db, gb, type) {
    if (!gb || !type) return null;
    var id = 'mem-generic-' + type.toLowerCase() + '-' + gb;
    return db.byId[id] || null;
  }

  function genericStorage(db, text) {
    var t = String(text || '').toUpperCase();
    var tb = /(\d)\s*TB/.exec(t);
    if (tb && /NVME|M\.2|SSD/.test(t)) return db.byId['ssd-generic-nvme-' + tb[1] + 'tb'] || null;
    return null;
  }

  /** 1項目の解決結果 */
  function slot(category, label, input, part, candidates, note) {
    return { category: category, label: label, input: input, part: part || null, candidates: candidates || [], note: note || '' };
  }

  function resolveByName(db, category, label, name) {
    var text = cleanText(name);
    if (!text) return null;
    var hit = Db.findByName(db, category, text);
    if (hit) return slot(category, label, text, hit, [], '');
    return slot(category, label, text, null, Db.suggest(db, category, text, 5),
      '「' + text + '」と完全に一致する製品が未登録です。近い候補から選んでください。');
  }

  function toBuild(slots) {
    var build = { items: {} };
    slots.forEach(function (s) {
      if (s && s.part) build.items[s.category] = [{ id: s.part.id, qty: s.qty || 1 }];
    });
    return build;
  }

  /* ---------------- 各サイト ---------------- */

  function fromGpuGuide(db, gpuId) {
    var id = cleanText(gpuId, 64).toLowerCase();
    var part = db.byId[id];
    if (!part || part.category !== 'gpu') {
      return { source: 'gpu-guide', title: 'GPU GUIDE から', slots: [], notes: ['指定されたGPU（' + id + '）は登録されていません。'] };
    }
    return { source: 'gpu-guide', title: 'GPU GUIDE から：' + part.name, slots: [slot('gpu', 'GPU', part.name, part)], notes: ['GPUを入れました。ほかのパーツを選ぶと互換性と性能グラフが更新されます。'] };
  }

  /** PC BUILD CHECK の構成スラグ（解像度-用途-予算man）。build-profile.js の slugOf と同じ規則 */
  function pcbcSlug(build) {
    return build.resolution + '-' + build.usage + '-' + Math.round(Number(build.budget) / 10000) + 'man';
  }

  function fromPcBuildCheck(db, builds, slug) {
    var s = cleanText(slug, 40);
    var b = (builds || []).filter(function (x) { return pcbcSlug(x) === s; })[0];
    if (!b) return { source: 'pc-build-check', title: 'PC BUILD CHECK から', slots: [], notes: ['構成「' + s + '」が見つかりませんでした（構成データが更新された可能性があります）。'] };
    var mg = b.motherboardGuide || {};
    var slots = [
      resolveByName(db, 'cpu', 'CPU', b.cpu),
      resolveByName(db, 'gpu', 'GPU', b.gpu),
    ];
    var memType = mg.memoryType || null;
    var mem = parseMemory(b.ram);
    var memPart = genericMemory(db, mem.gb, memType);
    slots.push(slot('memory', 'メモリ', b.ram + (memType ? '（' + memType + '）' : ''), memPart, [],
      memPart ? '容量と規格が同じ「機種未指定」のメモリで再現しています。' : 'メモリ規格が分からないため選んでください。'));
    var st = genericStorage(db, b.storage);
    slots.push(slot('storage', 'ストレージ', b.storage, st, [], st ? '容量が同じ「機種未指定」のNVMe SSDで再現しています。' : ''));
    // マザーボードは builds.json が製品名を持たない（ソケット＋チップセットの目安）ため、候補を出す
    var mbCands = (db.byCategory.motherboard || []).filter(function (p) { return p.specs.socket === mg.socket && (!memType || p.specs.memoryType === memType); });
    var mbGeneric = mbCands.filter(function (p) { return p.kind === 'generic'; })[0] || null;
    slots.push(slot('motherboard', 'マザーボード', [mg.socket, mg.chipset].filter(Boolean).join(' / '), mbGeneric, mbCands.filter(function (p) { return p !== mbGeneric; }).slice(0, 5),
      'PC BUILD CHECK はマザーボードを型番ではなく目安（' + (mg.chipset || '') + '）で示しています。具体的な製品は候補から選べます。'));
    return {
      source: 'pc-build-check',
      title: 'PC BUILD CHECK から：' + (b.title || s),
      res: RES[b.resolution] || null,
      slots: slots.filter(Boolean),
      notes: ['電源・ケース・クーラーは診断結果に含まれないため、ご自身で選んでください。', 'PC BUILD CHECK の参考価格は「BTO完成品（OS・組み立て込み）」の目安、PC BUILDER の合計は「パーツを個別に買う場合」の目安です。基準が違うため金額は一致しません。'],
    };
  }

  function fromGame(db, games, slugOrId, res) {
    var key = cleanText(slugOrId, 60);
    var g = (games || []).filter(function (x) { return (x.slug || x.id) === key || x.id === key; })[0];
    if (!g) return { source: 'game-pc-guide', title: 'GAME PC GUIDE から', slots: [], notes: ['ゲーム「' + key + '」が見つかりませんでした。'] };
    var wantRes = RES[res] || null;
    var builds = (g.builds || []).map(function (b, i) {
      var r = /4K/i.test(b.target) ? '4k' : (/WQHD/i.test(b.target) ? 'wqhd' : 'fhd');
      return { index: i, name: b.name, target: b.target, res: r, cpu: b.cpu, gpu: b.gpu, gpuAlt: b.gpuAlt, memory: b.memory, price: b.price };
    });
    var pick = builds.filter(function (b) { return wantRes && b.res === wantRes; })[0] || builds[0];
    var slots = [];
    if (pick) {
      slots.push(resolveByName(db, 'cpu', 'CPU', pick.cpu));
      slots.push(resolveByName(db, 'gpu', 'GPU', pick.gpu));
    }
    return {
      source: 'game-pc-guide',
      title: 'GAME PC GUIDE から：' + g.title,
      game: { id: g.id, slug: g.slug || g.id, title: g.title, recommended: g.recommended || '', builds: builds, url: '/game-pc-guide/games/' + (g.slug || g.id) + '.html' },
      res: pick ? pick.res : wantRes,
      slots: slots.filter(Boolean),
      notes: ['GAME PC GUIDE の推奨構成（' + (pick ? pick.name + '・' + pick.target : '') + '）のCPUとGPUを入れました。メモリは ' + (pick && pick.memory ? pick.memory : '未指定') + ' が目安です。FPSの数値は実測データが無いため表示しません。'],
    };
  }

  function fromUpgrade(db, params) {
    var notes = [];
    function gpuByKey(key) {
      var k = Db.normalizeKey(key);
      if (!k) return null;
      return (db.byCategory.gpu || []).filter(function (g) { return Db.normalizeKey(g.id) === k; })[0] || null;
    }
    var cur = gpuByKey(params.cgpu), next = gpuByKey(params.togpu);
    var cpu = params.ccpu && db.byId[cleanText(params.ccpu, 40)] && db.byId[cleanText(params.ccpu, 40)].category === 'cpu' ? db.byId[cleanText(params.ccpu, 40)] : null;
    var gb = Number(params.cmem) || null;
    if (params.cgpu && !cur) notes.push('今のGPU（' + cleanText(params.cgpu, 30) + '）はGPU GUIDEに未登録です。');
    if (params.ccpu && !cpu) notes.push('今のCPU（' + cleanText(params.ccpu, 30) + '）はPC BUILDERに未登録です。');
    var a = { items: {} }, b = { items: {} };
    if (cpu) { a.items.cpu = [{ id: cpu.id, qty: 1 }]; b.items.cpu = [{ id: cpu.id, qty: 1 }]; }
    if (cur) a.items.gpu = [{ id: cur.id, qty: 1 }];
    if (next || cur) b.items.gpu = [{ id: (next || cur).id, qty: 1 }];
    // メモリの規格：CPUが1規格だけならそれ、無ければ診断で入力された規格（ddr4 / ddr5）
    var memType = cpu && Array.isArray(cpu.specs.memoryTypes) && cpu.specs.memoryTypes.length === 1 ? cpu.specs.memoryTypes[0]
      : (/^ddr[45]$/.test(String(params.cmemtype || '')) ? String(params.cmemtype).toUpperCase() : null);
    if (gb && memType) {
      var m = genericMemory(db, gb, memType);
      if (m) { a.items.memory = [{ id: m.id, qty: 1 }]; b.items.memory = [{ id: m.id, qty: 1 }]; }
    }
    return {
      source: 'upgrade',
      title: 'PC UPGRADE から：交換前と交換後',
      res: RES[params.res] || null,
      compare: { a: a, b: b, aName: '今のPC', bName: next ? '交換後（' + next.name + '）' : '交換後' },
      slots: [],
      notes: notes.concat(['「今のPC」と「交換後」を重ねて比較しています。マザーボード・電源・ケースを選ぶと、交換後も電源やケースに収まるか確認できます。']),
    };
  }

  function fromHub(db, params) {
    var map = [
      ['cpu', 'CPU', params.cpu],
      ['gpu', 'GPU', params.gpu],
      ['motherboard', 'マザーボード', params.mb],
      ['psu', '電源', params.psu],
      ['case', 'ケース', params.case],
      ['cooler', 'CPUクーラー', params.cooler],
    ];
    var slots = map.map(function (m) { return resolveByName(db, m[0], m[1], m[2]); }).filter(Boolean);
    if (params.ram) {
      var mem = parseMemory(params.ram);
      var cpuSlot = slots.filter(function (s) { return s.category === 'cpu' && s.part; })[0];
      var type = mem.type || (cpuSlot && cpuSlot.part.specs.memoryTypes && cpuSlot.part.specs.memoryTypes.length === 1 ? cpuSlot.part.specs.memoryTypes[0] : null);
      var mp = genericMemory(db, mem.gb, type);
      slots.push(slot('memory', 'メモリ', cleanText(params.ram), mp, [], mp ? '容量と規格が同じ「機種未指定」のメモリで再現しています。' : 'メモリの容量・規格を読み取れませんでした。'));
    }
    if (params.storage) {
      var st = genericStorage(db, params.storage);
      slots.push(st ? slot('storage', 'ストレージ', cleanText(params.storage), st, [], '容量が同じ「機種未指定」のNVMe SSDで再現しています。')
        : resolveByName(db, 'storage', 'ストレージ', params.storage));
    }
    return {
      source: 'pc-builds-hub',
      title: 'PC Builds Hub から：' + (cleanText(params.title, 60) || '投稿された構成'),
      res: null,
      slots: slots,
      notes: ['投稿はパーツ名の自由入力のため、登録済みの製品名と完全に一致したものだけ自動で入れています。'],
    };
  }

  /**
   * URLSearchParams 相当のオブジェクトから引き継ぎ内容を作る。
   * @param {object} p   パラメータ（文字列の値）
   * @param {object} data { builds, games }（必要なときだけ読み込んだもの）
   */
  function resolve(db, p, data) {
    var d = data || {};
    if (p.from === 'pcbc' && p.build) return fromPcBuildCheck(db, d.builds, p.build);
    if (p.from === 'upgrade') return fromUpgrade(db, p);
    if (p.from === 'hub') return fromHub(db, p);
    if (p.game) return fromGame(db, d.games, p.game, p.res);
    if (p.gpuid || p.gpu) return fromGpuGuide(db, p.gpuid || p.gpu);
    return null;
  }

  return {
    resolve: resolve,
    toBuild: toBuild,
    pcbcSlug: pcbcSlug,
    parseMemory: parseMemory,
    _fromHub: fromHub,
  };
});
