/* =====================================================================
 *  Sippo PC BUILDER  画面 (pb-app.js)
 *  ---------------------------------------------------------------------
 *  状態を1つ（S）にまとめ、変更があったら update() で全体を描き直す。
 *  判定・計算は pb-db / pb-compat / pb-score / pb-codec / pb-import に任せ、
 *  このファイルは「表示と操作」だけを担当する。
 *  ユーザー入力・URL由来の文字列は必ず esc() してから innerHTML に入れる。
 * ===================================================================== */
(function (global) {
  'use strict';

  var doc = global.document;
  var Db = global.SippoPBDb, Compat = global.SippoPBCompat, Score = global.SippoPBScore;
  var Codec = global.SippoPBCodec, Import = global.SippoPBImport, Charts = global.SippoPBCharts;
  var esc = Charts.esc;
  if (!doc || !Db || !Compat || !Score || !Codec) return;

  var $ = function (id) { return doc.getElementById(id); };
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  var CAT_INFO = {
    cpu: '<strong>CPU</strong>はパソコンの頭脳です。ソケット（AM4 / AM5 / LGA1700 など）で使えるマザーボードが決まります。ゲームでは「ゲーム性能指数」、動画編集ではコア数が効きます。',
    gpu: '<strong>GPU</strong>はゲームの快適さに最も効くパーツです。ここではGPUの種類（チップ）を選び、長さや補助電源は「グラボ製品」で選びます。<button type="button" class="pb-btn pb-btn--sm" data-action="no-gpu">GPUなし（内蔵GPUを使う）</button>',
    gpuboard: '<strong>グラボ製品</strong>は、同じGPUでもメーカーごとに長さ・厚さ・補助電源が違います。選ぶとケースに入るか・電源ケーブルが足りるかを判定できます。',
    motherboard: '<strong>マザーボード</strong>は全パーツの土台です。CPUのソケット、メモリの種類（DDR4 / DDR5）、ケースに入る大きさの3つを合わせます。「機種未指定」は目安です。',
    memory: '<strong>メモリ</strong>は作業机の広さ。ゲームは16〜32GB、動画編集は32GB以上が目安です。DDR4とDDR5は差し込めないので、マザーボードと合わせます。',
    storage: '<strong>SSD・HDD</strong>はデータの保存場所です。複数選べます。M.2 SSD はマザーボードのM.2スロット、2.5 / 3.5インチはSATAポートとケースのベイを使います。',
    psu: '<strong>電源ユニット</strong>は推定消費電力に余裕があり、GPUメーカーの推奨容量以上が目安です。GPUの補助電源ケーブル（8ピン / 16ピン）の本数も確認します。',
    case: '<strong>PCケース</strong>はマザーボードの大きさ、GPUの長さ、CPUクーラーの高さ、ラジエーターの位置に上限があります。',
    cooler: '<strong>CPUクーラー</strong>は空冷（高さに注意）と簡易水冷（ラジエーターの取り付け位置に注意）があります。付属クーラーがあるCPUは未選択でも組めます。',
    fan: '<strong>ケースファン</strong>は数を増やせます。ケースの付属ファンだけで足りることも多いです。',
    expansion: '<strong>拡張パーツ</strong>は、無線LANカードなど後から足すパーツです。マザーボードの空きスロットを使います。',
  };

  var ICONS = {
    cpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></svg>',
    gpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2" y="7" width="20" height="10" rx="2"/><circle cx="8" cy="12" r="2.5"/><circle cx="15" cy="12" r="2.5"/><path d="M4 17v3"/></svg>',
    mb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="5" height="5"/><path d="M15 7v10M18 7v10M7 15h5M7 18h5"/></svg>',
    mem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2" y="7" width="20" height="8" rx="1"/><path d="M6 15v3M10 15v3M14 15v3M18 15v3M6 10h2M11 10h2M16 10h2"/></svg>',
    ssd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2" y="8" width="20" height="8" rx="1.5"/><path d="M5 12h7M17 11v2"/></svg>',
    psu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="10" cy="12" r="4"/><path d="M13 3l-2 4h3l-2 4" transform="translate(5 3) scale(.6)"/></svg>',
    case: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="6" y="2" width="12" height="20" rx="2"/><circle cx="12" cy="8" r="2.5"/><path d="M9 16h6M9 19h6"/></svg>',
    cooler: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 12c0-4 3-6 5-5M12 12c4 0 6 3 5 5M12 12c0 4-3 6-5 5M12 12c-4 0-6-3-5-5"/></svg>',
    fan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5"/></svg>',
    exp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="8" width="18" height="8" rx="1"/><path d="M6 16v3h4v-3M17 5v3"/></svg>',
  };

  var STATUS_LABEL = { ok: '対応', check: '要確認', ng: '非対応' };
  var GRADE_LABEL = { calc: '計算値', estimate: '参考値', na: '評価不可' };
  var RES_LABEL = { fhd: 'フルHD', wqhd: 'WQHD', '4k': '4K' };
  var PRICE_COLORS = { cpu: '#38bdf8', gpu: '#818cf8', motherboard: '#2dd4bf', memory: '#f472b6', storage: '#a3e635', psu: '#fbbf24', case: '#fb923c', cooler: '#5eead4', fan: '#94a3b8', expansion: '#cbd5e1', gpuboard: '#818cf8' };

  var S = {
    db: null,
    builds: { A: { name: '', items: {} }, B: null },
    active: 'A',
    res: 'wqhd',
    cat: 'cpu',
    filters: { text: '', maker: '', sort: 'perf', priceMax: '', onlyCompat: false, hideUsed: false },
    detailTab: 'res',
    importInfo: null,
    warnings: [],
    presets: [],
    calc: { A: null, B: null },
  };

  /* ==================================================================
   *  起動
   * ================================================================== */
  function fetchJson(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
  }

  function start() {
    var listEl = $('pbList');
    if (listEl) listEl.innerHTML = '<li class="pb-msg">パーツデータを読み込んでいます…</li>';
    Promise.all([
      fetchJson('data/parts.json'),
      fetchJson('data/rules.json'),
      fetchJson('/gpu-guide/gpus.json'),
      fetchJson('/shared/parts/part-prices.json').catch(function () { return null; }),
      fetchJson('data/presets.json').catch(function () { return { presets: [] }; }),
      // 価格表が読めなくても動く（その場合は既存データの目安価格だけになる）
      fetchJson('data/prices.json').catch(function () { return null; }),
    ]).then(function (res) {
      S.db = Db.buildDb({
        parts: res[0], rules: res[1], gpus: res[2], partPrices: res[3], prices: res[5],
        engine: global.SippoUpgradeEngine || null,
        gpuTarget: global.SippoGpuTarget || null,
      });
      S.presets = (res[4] && res[4].presets) || [];
      bindEvents();
      return readUrl();
    }).then(function () {
      renderPresets();
      renderScoreHelp();
      update();
      initAffiliate();
    }).catch(function (e) {
      if (listEl) listEl.innerHTML = '<li class="pb-msg">データを読み込めませんでした。時間をおいて再読み込みしてください。（' + esc(e.message) + '）</li>';
    });
  }

  /* ---------------- URL から復元・他サイトから引き継ぎ ---------------- */
  function params() {
    var out = {};
    try {
      new URLSearchParams(global.location.search).forEach(function (v, k) { out[k] = String(v).slice(0, 2000); });
    } catch (e) { /* 古いブラウザでは引き継がない */ }
    return out;
  }

  function readUrl() {
    var p = params();
    if (p.r && RES_LABEL[p.r]) S.res = p.r;
    if (p.res && RES_LABEL[p.res]) S.res = p.res;
    if (p.b) {
      var d = Codec.decode(p.b, S.db);
      S.builds.A = { name: Codec.cleanName(p.n || ''), items: d.build.items };
      S.warnings = S.warnings.concat(d.warnings);
      if (p.c) {
        var dc = Codec.decode(p.c, S.db);
        S.builds.B = { name: Codec.cleanName(p.cn || '') || '構成B', items: dc.build.items };
        S.warnings = S.warnings.concat(dc.warnings);
      }
      track('pcb_open_shared', {});
      return Promise.resolve();
    }
    if (!Import) return Promise.resolve();
    var need = {};
    var loads = [];
    if (p.from === 'pcbc' && p.build) loads.push(fetchJson('/pc-build-check/builds.json').then(function (b) { need.builds = b; }).catch(function () { need.builds = []; }));
    if (p.game) loads.push(fetchJson('/game-pc-guide/data/games.json').then(function (g) { need.games = Array.isArray(g) ? g : g.games; }).catch(function () { need.games = []; }));
    return Promise.all(loads).then(function () {
      var info = Import.resolve(S.db, p, need);
      if (!info) return;
      S.importInfo = info;
      if (info.res) S.res = info.res;
      if (info.compare) {
        S.builds.A = { name: info.compare.aName, items: info.compare.a.items };
        S.builds.B = { name: info.compare.bName, items: info.compare.b.items };
      } else {
        S.builds.A.items = Import.toBuild(info.slots).items;
      }
      track('pcb_import', { source: info.source });
    });
  }

  /* ==================================================================
   *  構成の操作
   * ================================================================== */
  function cur() { return S.builds[S.active] || S.builds.A; }
  function catDef(id) { return Db.CATEGORY_MAP[id]; }
  function part(id) { return S.db.byId[id] || null; }

  function addPart(cat, id) {
    var b = cur(), def = catDef(cat), p = part(id);
    if (!p || !def) return;
    var items = b.items;
    if (def.multi) {
      var arr = items[cat] = items[cat] || [];
      var hit = arr.filter(function (e) { return e.id === id; })[0];
      if (hit) hit.qty = Math.min(def.maxQty || 8, (hit.qty || 1) + 1);
      else if (arr.length < 12) arr.push({ id: id, qty: 1 });
    } else {
      items[cat] = [{ id: id, qty: 1 }];
    }
    if (cat === 'gpu') {
      var board = (items.gpuboard || [])[0];
      if (board && part(board.id) && part(board.id).chip !== id) items.gpuboard = [];
    }
    if (cat === 'gpuboard') items.gpu = [{ id: p.chip, qty: 1 }];
    track('pcb_add_part', { category: cat, part_id: id });
    toast((S.builds.B ? '構成' + S.active + 'に' : '') + '「' + p.name + '」を入れました');
    update();
  }

  function removePart(cat, id) {
    var items = cur().items;
    items[cat] = (items[cat] || []).filter(function (e) { return e.id !== id; });
    if (cat === 'gpu') items.gpuboard = [];
    update();
  }

  function setQty(cat, id, delta) {
    var def = catDef(cat);
    var e = (cur().items[cat] || []).filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    var q = (e.qty || 1) + delta;
    if (q < 1) { removePart(cat, id); return; }
    e.qty = Math.min(def.maxQty || 8, q);
    update();
  }

  function selectedIds(cat, build) {
    return ((build || cur()).items[cat] || []).map(function (e) { return e.id; });
  }

  /* ==================================================================
   *  描画：全体
   * ================================================================== */
  var urlTimer = 0;
  function update() {
    S.calc.A = calcFor(S.builds.A);
    S.calc.B = S.builds.B ? calcFor(S.builds.B) : null;
    renderImport();
    renderCats();
    renderList();
    renderBuildSwitch();
    renderBuild();
    renderPerf();
    clearTimeout(urlTimer);
    urlTimer = setTimeout(syncUrl, 300);
  }

  function calcFor(build) {
    var compat = Compat.checkBuild(build, S.db, Db.CATEGORIES);
    var score = Score.scoreBuild(build, S.db, S.res, compat.power);
    return { compat: compat, score: score };
  }

  function isEmpty(build) {
    return !build || !Object.keys(build.items).some(function (k) { return (build.items[k] || []).length; });
  }

  function syncUrl() {
    if (!global.history || !global.history.replaceState) return;
    var url = global.location.pathname;
    if (!isEmpty(S.builds.A)) {
      var q = Codec.toQuery(S.builds.A, { name: S.builds.A.name, res: S.res, compare: S.builds.B && !isEmpty(S.builds.B) ? S.builds.B : null, compareName: S.builds.B ? S.builds.B.name : '' });
      url += '?' + q.query;
    }
    try { global.history.replaceState(null, '', url + global.location.hash); } catch (e) { /* 失敗しても動作に影響しない */ }
  }

  /* ==================================================================
   *  引き継ぎパネル
   * ================================================================== */
  function renderImport() {
    var box = $('pbImport');
    var info = S.importInfo;
    var warn = S.warnings;
    if (!info && !warn.length) { box.hidden = true; box.innerHTML = ''; return; }
    var html = '<div class="pb-import__box">';
    if (info) {
      html += '<div class="pb-import__head"><h2>🐾 ' + esc(info.title) + '</h2><button type="button" class="pb-btn pb-btn--sm pb-btn--ghost" data-action="close-import">閉じる</button></div>';
      if (info.notes && info.notes.length) html += '<ul class="pb-import__notes">' + info.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';
      if (info.slots && info.slots.length) {
        html += '<div class="pb-import__slots">' + info.slots.map(function (s) {
          var body = s.part
            ? '<span class="pb-st pb-st--ok">入れました</span> ' + esc(s.part.name)
            : '<span class="pb-st pb-st--check">候補から選択</span>';
          var cands = !s.part && s.candidates.length ? '<div class="pb-cand">' + s.candidates.map(function (c) {
            return '<button type="button" class="pb-btn pb-btn--sm" data-add="' + esc(c.category) + '|' + esc(c.id) + '">' + esc(c.name) + '</button>';
          }).join('') + '</div>' : '';
          var more = s.part && s.candidates.length ? '<div class="pb-cand">' + s.candidates.map(function (c) {
            return '<button type="button" class="pb-btn pb-btn--sm pb-btn--ghost" data-add="' + esc(c.category) + '|' + esc(c.id) + '">' + esc(c.name) + 'に変える</button>';
          }).join('') + '</div>' : '';
          var none = !s.part && !s.candidates.length ? '<div class="pb-note">近い製品が未登録です。「パーツを選ぶ」から選んでください。</div>' : '';
          return '<div class="pb-import__slot"><strong>' + esc(s.label) + '：' + esc(s.input) + '</strong>' + body
            + (s.note ? '<div class="pb-note">' + esc(s.note) + '</div>' : '') + cands + more + none + '</div>';
        }).join('') + '</div>';
      }
      if (info.game) {
        html += '<div class="pb-import__games">' + info.game.builds.map(function (b) {
          return '<button type="button" class="pb-btn pb-btn--sm" data-game-build="' + b.index + '">' + esc(b.name) + '（' + esc(b.target) + '）を使う</button>';
        }).join('') + '<a class="pb-btn pb-btn--sm pb-btn--ghost" href="' + esc(info.game.url) + '">' + esc(info.game.title) + ' のページに戻る</a></div>';
      }
    }
    if (warn.length) html += '<div class="pb-warnings">' + warn.map(esc).join('<br>') + '</div>';
    html += '</div>';
    box.innerHTML = html;
    box.hidden = false;
  }

  function applyGameBuild(index) {
    var info = S.importInfo;
    if (!info || !info.game) return;
    var b = info.game.builds[index];
    if (!b) return;
    ['cpu', 'gpu'].forEach(function (cat) {
      var hit = Db.findByName(S.db, cat, b[cat]);
      if (hit) { cur().items[cat] = [{ id: hit.id, qty: 1 }]; if (cat === 'gpu') cur().items.gpuboard = []; }
    });
    S.res = b.res;
    toast(b.name + '（' + b.target + '）のCPUとGPUを入れました');
    update();
  }

  /* ==================================================================
   *  ① パーツ選択
   * ================================================================== */
  function renderCats() {
    var build = cur();
    $('pbCats').innerHTML = Db.CATEGORIES.map(function (c) {
      var filled = (build.items[c.id] || []).length ? 1 : 0;
      return '<button type="button" class="pb-cat" role="tab" data-cat="' + c.id + '" aria-selected="' + (S.cat === c.id) + '" data-filled="' + filled + '" data-required="' + (c.required ? 1 : 0) + '">'
        + '<span class="pb-cat__dot" aria-hidden="true"></span>' + esc(c.short) + (c.required ? '' : '') + '</button>';
    }).join('');
    $('pbCatInfo').innerHTML = CAT_INFO[S.cat] || '';
    $('pbHideUsedWrap').hidden = S.cat !== 'gpu';
    var makers = Db.makersOf(S.db, S.cat);
    var sel = $('pbMaker');
    if (sel.getAttribute('data-cat') !== S.cat) {
      sel.innerHTML = '<option value="">すべてのメーカー</option>' + makers.map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('');
      sel.setAttribute('data-cat', S.cat);
      S.filters.maker = '';
    }
    var lbl = $('pbEditingLabel');
    lbl.setAttribute('data-build', S.active);
    lbl.innerHTML = S.builds.B ? '編集中：<b>構成' + S.active + '</b>' : '';
  }

  // 価格の種類（3つを混同しない）
  var TIER_LABEL = { retail: '実売確認価格', median: '参考中央値', reference: '参考価格（未確認）' };

  function priceHtml(p) {
    var guide = p.guidePrice && (!p.price || p.price.basis !== p.guidePrice.basis)
      ? '<small class="pb-price__guide">GPU GUIDE掲載 約' + yen(p.guidePrice.value) + '（別基準・日付なし）</small>' : '';
    if (!p.price || !isNum(p.price.value)) return '<span class="pb-price pb-price--none">参考価格 未登録</span>' + guide;
    var d = p.price.checkedAt ? '（' + esc(p.price.checkedAt) + '確認）' : '（日付なし）';
    var warn = p.price.stale ? '<small class="pb-price__warn">確認から' + esc(p.price.ageDays) + '日たっています（合計・コスパに入れません）</small>'
      : (p.price.tier === 'reference' ? '<small class="pb-price__warn">' + (p.price.notice ? '実売はこれより高めの傾向。' : '') + '確認日が無いため合計・コスパに入れません</small>' : '');
    return '<span class="pb-price" data-tier="' + esc(p.price.tier) + '"><b>約' + yen(p.price.value) + '</b><small><span class="pb-tier">' + esc(TIER_LABEL[p.price.tier] || '') + '</span>' + esc(p.price.label) + d + '</small>' + warn + guide + '</span>';
  }

  /** 価格の出どころを1行で（出典URLがあればリンク） */
  function priceSource(price) {
    if (!price) return '';
    var t = esc(price.label) + (price.checkedAt ? '（' + esc(price.checkedAt) + '確認）' : '（日付なし）');
    if (price.range) t += '・確認できた範囲 ' + yen(price.range[0]) + '〜' + yen(price.range[1]);
    if (price.sourceUrl && /^https:\/\//.test(price.sourceUrl)) t += '・<a href="' + esc(price.sourceUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(price.sourceLabel || '出典') + '</a>';
    if (price.note) t += '・' + esc(price.note);
    if (price.notice) t += '<br>' + esc(price.notice);
    return t;
  }

  function yen(v) { return isNum(v) ? '¥' + Math.round(v).toLocaleString('ja-JP') : '—'; }
  function man(v) { return isNum(v) ? (v / 10000).toFixed(1) + '万円' : '—'; }

  function specChips(p) {
    var s = p.specs || {}, out = [];
    function add(label, v, unit) { if (v != null && v !== '') out.push(esc(label) + ' ' + esc(v) + (unit || '')); }
    switch (p.category) {
      case 'cpu':
        add('', s.socket); if (isNum(s.cores)) out.push(esc(s.cores + 'コア/' + (s.threads || '?') + 'スレッド'));
        add('最大', s.boostGHz, 'GHz'); add('TDP', s.tdpW, 'W');
        out.push(s.igpu === 'none' ? '内蔵GPUなし' : (s.igpu ? '内蔵GPUあり' : '内蔵GPU 未確認'));
        add('ゲーム指数', s.gameTier); break;
      case 'gpu':
        add('性能指数', s.raster); add('VRAM', s.vram, 'GB'); add('消費電力', s.powerW, 'W'); add('主用途', s.target);
        if (Array.isArray(s.encoder)) out.push(s.encoder.length ? 'エンコード ' + esc(s.encoder.map(function (c) { return c.toUpperCase(); }).join('/')) : 'エンコーダーなし');
        break;
      case 'gpuboard':
        var chip = part(p.chip); add('', chip ? chip.name : p.chip); add('長さ', s.lengthMm, 'mm'); add('', s.slots, 'スロット');
        add('補助電源', (s.pin16 ? '16ピン×' + s.pin16 : '') + (s.pin8 ? '8ピン×' + s.pin8 : '')); add('推奨電源', s.recommendedPsuW, 'W'); break;
      case 'motherboard':
        add('', s.socket); add('', s.chipset); add('', s.formFactor || 'サイズ未指定'); add('', s.memoryType); add('M.2×', s.m2Slots); add('SATA×', s.sataPorts); break;
      case 'memory':
        add('', s.type); add('', s.capacityGB, 'GB'); add('枚数', s.modules); add('', s.speed, 'MT/s'); add('CL', s.cas); break;
      case 'storage':
        add('', s.interface); add('', s.formFactor === 'M.2' ? 'M.2' : s.formFactor + 'インチ');
        if (isNum(s.capacityGB)) out.push(s.capacityGB >= 1000 ? (s.capacityGB / 1000) + 'TB' : s.capacityGB + 'GB');
        add('読込', s.seqReadMBs, 'MB/s'); break;
      case 'psu':
        add('', s.watt, 'W'); add('', s.efficiency); add('', s.formFactor); add('', s.atxVersion);
        if (isNum(s.h12v2x6)) out.push('12V-2x6×' + s.h12v2x6); if (isNum(s.pcie8)) out.push('PCIe 8ピン×' + s.pcie8); break;
      case 'case':
        add('対応', (s.supportedMb || []).join('/')); add('GPU', s.maxGpuMm, 'mmまで'); add('クーラー', s.maxCoolerMm, 'mmまで'); add('電源', (s.psuForm || []).join('/')); break;
      case 'cooler':
        add('', s.type === 'aio' ? '簡易水冷' : '空冷'); add('高さ', s.heightMm, 'mm'); add('ラジエーター', s.radiatorMm, 'mm');
        if (Array.isArray(s.sockets)) out.push(esc(s.sockets.join('/'))); else out.push('対応ソケット 未確認'); break;
      case 'fan':
        add('', s.sizeMm, 'mm'); add('最大', s.maxRpm, 'rpm'); add('', s.airflow); add('', s.noise); break;
      case 'expansion':
        add('', s.slot === 'pcie-x1' ? 'PCIe x1' : s.slot); break;
    }
    return out.map(function (t) { return '<span>' + t + '</span>'; }).join('');
  }

  var SPEC_LABELS = {
    socket: 'ソケット', cores: 'コア数', threads: 'スレッド数', pCores: 'Pコア', eCores: 'Eコア', baseGHz: '基本クロック(GHz)', boostGHz: '最大クロック(GHz)',
    l3MB: 'L3キャッシュ(MB)', tdpW: 'TDP / 基本電力(W)', maxPowerW: '最大ターボ電力(W)', igpu: '内蔵GPU', memoryTypes: '対応メモリ', memorySpeed: 'メモリ定格', boxCooler: '付属クーラー', gameTier: 'ゲーム性能指数（Sippo）',
    raster: '描画性能指数（GPU GUIDE）', feature: '機能スコア', vram: 'VRAM(GB)', powerW: '消費電力(W)', target: '主な用途の解像度', encoder: 'HWエンコーダー', officialPsuW: 'メーカー推奨電源(W)', connectorRef: '補助電源（リファレンス）', series: '世代',
    chipset: 'チップセット', formFactor: 'フォームファクター', memoryType: 'メモリ規格', memorySlots: 'メモリスロット', maxMemoryGB: '最大メモリ(GB)', m2Slots: 'M.2スロット', m2Detail: 'M.2の内訳', sataPorts: 'SATAポート',
    pcieX16Slots: 'PCIe x16形状スロット', pcieX1Slots: 'PCIe x1スロット', pcieDetail: '拡張スロットの内訳', fanHeaders: 'ファン端子', wifi: '無線LAN', cpuFamilies: '対応CPU世代', notes: '備考',
    type: '種類', speed: '速度(MT/s)', capacityGB: '容量(GB)', modules: '枚数', cas: 'CL', voltage: '電圧', profile: 'プロファイル', heightMm: '高さ(mm)',
    kind: '種類', m2Length: 'M.2の長さ', interface: '接続', seqReadMBs: '連続読込(MB/s)', seqWriteMBs: '連続書込(MB/s)', tbw: 'TBW',
    watt: '容量(W)', efficiency: '効率', atxVersion: 'ATX規格', depthMm: '奥行き(mm)', dimensions: '寸法', modular: 'ケーブル', eps8: 'CPU EPS 8ピン', pcie8: 'PCIe 8ピン', h12v2x6: '12V-2x6（16ピン）', sata: 'SATAコネクタ', warrantyYears: '保証(年)',
    shape: '形', supportedMb: '対応マザーボード', maxGpuMm: 'GPU最大長(mm)', gpuNote: 'GPUの条件', maxGpuThickMm: 'GPU最大厚(mm)', maxCoolerMm: 'CPUクーラー最大高(mm)', radiators: 'ラジエーター', fan120: '120mmファン最大数', fan140: '140mmファン最大数',
    fanMountText: 'ファン取り付け位置', includedFans: '付属ファン', bay35: '3.5インチベイ', bay25: '2.5インチ取り付け', bayNote: 'ベイの備考', psuForm: '電源規格', maxPsuMm: '電源最大長(mm)', slots: '拡張スロット / 厚さ(スロット)',
    heightNote: '高さの備考', fans: 'ファン', heatpipes: 'ヒートパイプ', radiatorMm: 'ラジエーター(mm)', radiatorThickMm: 'ラジエーター厚(mm)', sizeMm: 'サイズ(mm)', thickMm: '厚さ(mm)', maxRpm: '最大回転数', airflow: '風量', noise: '騒音',
    connector: 'コネクタ', lengthMm: '長さ(mm)', pin8: '8ピン', pin16: '16ピン', recommendedPsuW: '推奨電源(W)', slot: '使うスロット',
    depthNote: '奥行きの根拠', mbNote: 'マザーボードの条件', slotNote: 'スロットの備考', psuNote: '電源の備考',
  };
  var HIDE_SPECS = { market: 1, gpuMmWithFrontRad: 1, includedFanCount: 1, psuFormVerified: 1, pcieShared: 1, encoderVerified: 1 };

  function specValue(k, v) {
    if (v == null || v === '') return null;
    if (k === 'radiators' && typeof v === 'object') return Object.keys(v).map(function (pos) { return ({ front: '前面', top: '天面', rear: '背面', side: '側面', bottom: '底面' })[pos] + ' ' + v[pos].join('/'); }).join('、');
    if (k === 'encoder') return v.length ? v.map(function (c) { return c.toUpperCase(); }).join(' / ') : 'なし';
    if (k === 'cpuFamilies') return v.map(function (f) { var r = S.db.rules.cpuFamilies && S.db.rules.cpuFamilies[f]; return r ? r.label : f; }).join('、');
    if (k === 'igpu' && v === 'none') return 'なし';
    if (k === 'boxCooler' && v === false) return '付属なし';
    if (Array.isArray(v)) return v.join(' / ');
    if (k === 'shape') return ({ mid: 'ミドルタワー', full: 'フルタワー', dual: 'デュアルチャンバー', itx: 'Mini-ITX小型', matx: 'Micro-ATX小型' })[v] || v;
    if (k === 'kind') return ({ nvme: 'NVMe SSD', 'sata-ssd': 'SATA SSD', hdd: 'HDD' })[v] || v;
    if (k === 'type') return ({ air: '空冷', aio: '簡易水冷' })[v] || v;
    return String(v);
  }

  function specTable(p) {
    var rows = Object.keys(p.specs || {}).filter(function (k) { return !HIDE_SPECS[k]; }).map(function (k) {
      var v = specValue(k, p.specs[k]);
      return '<tr><th>' + esc(SPEC_LABELS[k] || k) + '</th>' + (v == null ? '<td class="is-null">未確認</td>' : '<td>' + esc(v) + '</td>') + '</tr>';
    }).join('');
    var src = p.source
      ? '出典：' + (p.source.url && /^https?:|^\//.test(p.source.url) ? '<a href="' + esc(p.source.url) + '" target="_blank" rel="noopener noreferrer">' + esc(p.source.label) + '</a>' : esc(p.source.label))
        + (p.source.checkedAt ? '（' + esc(p.source.checkedAt) + '確認）' : '')
      : (p.kind === 'generic' ? '機種を特定しない目安パーツです（製品の仕様ではありません）。' : '出典未登録');
    if (p.specSources) src += '<br>一部の項目（' + esc(Object.keys(p.specSources).map(function (k) { return SPEC_LABELS[k] || k; }).join('・')) + '）は Sippo 既存データ（part-prices.json）';
    if (p.lengthNote) src += '<br>' + esc(p.lengthNote);
    if (p.boxCoolerNote) src += '<br>' + esc(p.boxCoolerNote);
    if (p.gameTierFrom && part(p.gameTierFrom)) src += '<br>ゲーム性能指数は、内蔵GPUの有無以外の仕様が同じ ' + esc(part(p.gameTierFrom).name) + ' の値です。';
    if (p.price) src += '<br>価格：' + priceSource(p.price);
    if (p.guideUrl) src += '<br><a href="' + esc(p.guideUrl) + '">GPU GUIDE で ' + esc(p.name) + ' の詳細を見る</a>';
    return '<table class="pb-spec-table">' + rows + '</table><p class="pb-src">' + src + '</p>';
  }

  function renderList() {
    var f = S.filters, build = cur();
    var hasOthers = Object.keys(build.items).some(function (k) { return k !== S.cat && (build.items[k] || []).length; });
    var statusCache = {};
    function statusOf(p) {
      if (!statusCache[p.id]) statusCache[p.id] = Compat.statusIfAdded(build, S.db, S.cat, p.id);
      return statusCache[p.id];
    }
    var gpuSel = (build.items.gpu || [])[0];
    var items = Db.query(S.db, {
      category: S.cat, text: f.text, maker: f.maker, sort: f.sort,
      priceMax: f.priceMax ? Number(f.priceMax) : null,
      hideUsed: S.cat === 'gpu' && f.hideUsed,
      filter: function (p) {
        if (S.cat === 'gpuboard' && gpuSel && p.chip !== gpuSel.id) return false;
        if (f.onlyCompat && hasOthers) return statusOf(p).status !== 'ng';
        return true;
      },
    });
    var sel = selectedIds(S.cat);
    var total = (S.db.byCategory[S.cat] || []).length;
    var note = '';
    if (S.cat === 'gpuboard' && gpuSel) note = '（選択中のGPU「' + (part(gpuSel.id) ? part(gpuSel.id).name : '') + '」の製品だけ表示）';
    $('pbCount').textContent = items.length + '件 / 全' + total + '件' + note;
    if (!items.length) {
      $('pbList').innerHTML = '<li class="pb-msg">' + (S.cat === 'gpuboard' && gpuSel
        ? 'このGPUのメーカー別製品データはまだ登録されていません。グラボの長さ・補助電源は「要確認」として扱います。'
        : '条件に合うパーツがありません。検索語や絞り込みを変えてください。') + '</li>';
      return;
    }
    $('pbList').innerHTML = items.map(function (p) {
      var selected = sel.indexOf(p.id) >= 0;
      var st = hasOthers ? statusOf(p) : null;
      var stHtml = st ? '<span class="pb-st pb-st--' + st.status + '" title="' + esc(st.reasons.map(function (r) { return r.label + '：' + r.message; }).join('\n')) + '">' + STATUS_LABEL[st.status] + '</span>' : '';
      var tags = (p.kind === 'generic' ? '<span class="pb-tag pb-tag--generic">機種未指定</span> ' : '')
        + (p.specs && p.specs.market === 'used' ? '<span class="pb-tag pb-tag--used">中古向け</span> ' : '');
      var def = catDef(S.cat);
      var btn = selected && !def.multi
        ? '<button type="button" class="pb-btn pb-btn--sm" data-remove="' + S.cat + '|' + esc(p.id) + '">選択中（外す）</button>'
        : '<button type="button" class="pb-btn pb-btn--sm pb-btn--add" data-add="' + S.cat + '|' + esc(p.id) + '">' + (selected ? '＋もう1つ' : '＋ 入れる') + '</button>';
      var reasons = st && st.status !== 'ok' ? '<div class="pb-item__more"><small>' + esc(st.reasons.slice(0, 2).map(function (r) { return r.message; }).join(' ')) + '</small></div>' : '';
      return '<li class="pb-item" data-selected="' + (selected ? 1 : 0) + '">'
        + '<div class="pb-item__top"><span class="pb-item__icon" aria-hidden="true">' + ICONS[def.icon] + '</span>'
        + '<div class="pb-item__main"><div class="pb-item__maker">' + esc(p.maker) + (p.model ? ' · ' + esc(p.model) : '') + (p.released ? ' · ' + esc(p.released) : '') + '</div>'
        + '<div class="pb-item__name">' + tags + esc(p.name) + '</div>'
        + '<div class="pb-item__specs">' + specChips(p) + '</div></div></div>'
        + '<div class="pb-item__foot">' + priceHtml(p) + '<div class="pb-item__btns">' + stHtml + btn + '</div></div>'
        + reasons
        + '<details class="pb-item__more"><summary>仕様と出典</summary>' + specTable(p) + '</details>'
        + '</li>';
    }).join('');
  }

  /* ==================================================================
   *  ③ 構成
   * ================================================================== */
  function renderBuildSwitch() {
    var el = $('pbBuildSwitch');
    if (!S.builds.B) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = ['A', 'B'].map(function (k) {
      return '<button type="button" role="radio" data-build="' + k + '" aria-checked="' + (S.active === k) + '">構成' + k + '</button>';
    }).join('');
  }

  function renderBuild() {
    var build = cur(), calc = S.calc[S.active];
    var nameEl = $('pbName');
    if (doc.activeElement !== nameEl) nameEl.value = build.name || '';
    // 合計
    var pr = calc.score.prices;
    var unpricedNames = pr.unpriced.map(function (u) { return u.name; });
    var refNames = pr.refRows.map(function (r) { return r.name; });
    // 構成に無い必須パーツ（合計の限界として出す）
    var missingCats = Db.CATEGORIES.filter(function (d) { return d.required && !(build.items[d.id] || []).length; }).map(function (d) { return d.short; });
    var notes = ['確認日つきの価格（実売確認価格・参考中央値）だけの合計です。現在の販売価格ではありません。'];
    if (refNames.length) notes.push('確認日の無い参考価格だけのパーツ ' + refNames.length + '点（約' + man(pr.refTotal) + '）は合計に入れていません: ' + esc(refNames.join('、')));
    if (unpricedNames.length) notes.push('価格未登録 ' + unpricedNames.length + '点（合計に含まない）: ' + esc(unpricedNames.join('、')));
    if (missingCats.length) notes.push('未選択のパーツ: ' + esc(missingCats.join('・')));
    notes.push('パーツを個別に買う場合の目安で、OS（Windows）・組み立て・保証の費用は含みません。PC BUILD CHECK の参考価格（BTO完成品の目安）とは基準が違うため一致しません。');
    if (pr.rows.some(function (r) { return r.price.stale; })) notes.push('確認から時間がたった価格を含みます。');
    var extra = refNames.length + unpricedNames.length;
    var val = pr.rows.length ? '約' + man(pr.total) + (extra ? '<small class="pb-total__plus">＋確認できない' + extra + '点</small>' : '') : '—';
    $('pbTotal').innerHTML = '<span class="pb-total__label">確認できた価格の合計' + (S.builds.B ? '（構成' + S.active + '）' : '') + (extra || missingCats.length ? '（一部のパーツだけ）' : '') + '</span>'
      + '<span class="pb-total__val">' + val + '</span>'
      + '<span class="pb-total__note">' + notes.join(' ') + '</span>';

    // 互換性サマリー
    var c = calc.compat;
    var sumHtml = '<strong>互換性</strong>';
    if (!c.results.length) sumHtml += '<span class="pb-note">2つ以上のパーツを選ぶと判定します</span>';
    else sumHtml += '<span class="pb-st pb-st--' + c.overall + '">' + (c.overall === 'ok' ? 'すべて対応' : (c.overall === 'ng' ? '非対応あり' : '要確認あり')) + '</span>'
      + '<span class="pb-note" style="margin:0">対応 ' + c.summary.ok + ' / 要確認 ' + c.summary.check + ' / 非対応 ' + c.summary.ng + '</span>';
    $('pbCompatSummary').innerHTML = sumHtml;
    var badge = $('pbTabBadge');
    badge.textContent = c.summary.ng ? String(c.summary.ng) : (c.summary.check ? '!' : (c.results.length ? '✓' : ''));
    badge.setAttribute('data-status', c.overall);

    // 選択中パーツ
    $('pbSelected').innerHTML = Db.CATEGORIES.map(function (def) {
      var arr = build.items[def.id] || [];
      if (!arr.length) {
        if (def.id === 'gpuboard' && !(build.items.gpu || []).length) return '';
        var hint = def.id === 'cooler' ? '（付属クーラーで使う場合は不要）' : (def.id === 'gpu' ? '（なしなら内蔵GPU）' : (def.required ? '' : '（任意）'));
        return '<li class="pb-sel pb-sel--empty"><span class="pb-sel__icon" aria-hidden="true">' + ICONS[def.icon] + '</span>'
          + '<div><div class="pb-sel__cat">' + esc(def.label) + '</div><div class="pb-sel__name">未選択 <small class="pb-note">' + hint + '</small></div></div>'
          + '<button type="button" class="pb-btn pb-btn--sm" data-goto="' + def.id + '">選ぶ</button></li>';
      }
      return arr.map(function (e) {
        var p = part(e.id);
        if (!p) return '';
        var boardPriced = def.id === 'gpuboard' && calc.score.prices.boardPriced;
        var price = p.price && isNum(p.price.value) && (def.id !== 'gpuboard' || boardPriced)
          ? '約' + yen(p.price.value * (e.qty || 1)) + '（' + (TIER_LABEL[p.price.tier] || '') + (p.price.valid ? '' : '・合計に含まない') + '）'
          : (def.id === 'gpuboard' ? 'GPUの参考価格に含む' : '参考価格 未登録');
        if (def.id === 'gpu' && calc.score.prices.boardPriced) price = 'グラボ製品の価格で数えています';
        var qty = def.qty ? '<span class="pb-qty"><button type="button" aria-label="' + esc(p.name) + 'を1つ減らす" data-qty="' + def.id + '|' + esc(p.id) + '|-1">−</button><span>' + (e.qty || 1) + '</span><button type="button" aria-label="' + esc(p.name) + 'を1つ増やす" data-qty="' + def.id + '|' + esc(p.id) + '|1">＋</button></span>' : '';
        return '<li class="pb-sel"><span class="pb-sel__icon" aria-hidden="true">' + ICONS[def.icon] + '</span>'
          + '<div><div class="pb-sel__cat">' + esc(def.label) + (p.kind === 'generic' ? ' <span class="pb-tag pb-tag--generic">機種未指定</span>' : '') + '</div>'
          + '<div class="pb-sel__name"><button type="button" data-goto="' + def.id + '">' + esc(p.name) + '</button></div>'
          + '<div class="pb-sel__price">' + esc(price) + '</div></div>'
          + '<div class="pb-sel__ctrl">' + qty + '<button type="button" class="pb-icon-btn" aria-label="' + esc(p.name) + 'を外す" data-remove="' + def.id + '|' + esc(p.id) + '">✕</button></div></li>';
      }).join('');
    }).join('');

    renderCompat(c);
    renderPreview(build, c);
    renderShops(build);
  }

  function renderCompat(c) {
    var html = '<h3>互換性チェックの詳細</h3>';
    if (c.missing.length) html += '<p class="pb-missing">未選択の必須パーツ：' + esc(c.missing.map(function (id) { return catDef(id).label; }).join('、')) + '</p>';
    if (c.unknownIds.length) html += '<p class="pb-warnings">登録されていないパーツが含まれています：' + esc(c.unknownIds.join(', ')) + '</p>';
    if (!c.results.length) html += '<p class="pb-note">パーツを2つ以上選ぶと、組み合わせを判定します。</p>';
    html += '<ul class="pb-compat-list">' + c.results.map(function (r) {
      return '<li class="pb-compat-item" data-status="' + r.status + '"><div class="pb-compat-item__head"><span class="pb-st pb-st--' + r.status + '">' + STATUS_LABEL[r.status] + '</span>' + esc(r.label) + '</div>'
        + '<p>' + esc(r.message) + '</p>' + (r.note ? '<p class="pb-compat-note">' + esc(r.note) + '</p>' : '') + '</li>';
    }).join('') + '</ul>';
    $('pbCompat').innerHTML = html;
  }

  function renderPreview(build, c) {
    function f(cat) { var e = (build.items[cat] || [])[0]; return e ? part(e.id) : null; }
    var cs = f('case'), mb = f('motherboard'), gpu = f('gpu'), board = f('gpuboard'), cooler = f('cooler'), psu = f('psu'), cpu = f('cpu');
    var mem = (build.items.memory || [])[0];
    var memPart = mem ? part(mem.id) : null;
    var st = 0, fans = 0;
    (build.items.storage || []).forEach(function (e) { st += e.qty || 1; });
    (build.items.fan || []).forEach(function (e) { fans += e.qty || 1; });
    var svg = Charts.preview({
      caseShape: cs ? cs.specs.shape : 'none',
      mb: !!mb, mbForm: mb ? mb.specs.formFactor : null,
      gpu: !!gpu, gpuLabel: board ? board.name.replace(/^.*?(RTX|RX)/, '$1') : (gpu ? gpu.name.replace(/^(GeForce|Radeon)\s+/, '') : ''),
      gpuMm: board ? board.specs.lengthMm : null, caseGpuMm: cs ? cs.specs.maxGpuMm : null, gpuFans: board ? board.specs.fans : 2,
      igpu: cpu && cpu.specs.igpu && cpu.specs.igpu !== 'none',
      cooler: cooler ? cooler.specs.type : null, radMm: cooler ? cooler.specs.radiatorMm : null,
      psu: !!psu, psuW: psu ? psu.specs.watt : null,
      ramModules: memPart && isNum(memPart.specs.modules) ? memPart.specs.modules * (mem.qty || 1) : 0,
      storage: st, fans: fans, caseFans: cs && isNum(cs.specs.includedFanCount) ? cs.specs.includedFanCount : 0,
    });
    $('pbPreview').innerHTML = '<h3>外観の模式図</h3>' + svg
      + '<p class="pb-preview__cap">※ 模式図（イメージ）です。実際の外観・配置・大きさの比率とは異なります。GPUの長さだけは、ケースの上限に対する比率で描いています' + (board && cs ? '（赤く表示＝上限超過）' : '') + '。メーカー製品画像は権利確認ができていないため使っていません。</p>';
  }

  function renderShops(build) {
    var A = global.SippoAffiliate;
    var html = '<h3>販売サイトで探す</h3>';
    var rows = [];
    Db.CATEGORIES.forEach(function (def) {
      (build.items[def.id] || []).forEach(function (e) {
        var p = part(e.id);
        if (!p) return;
        var affId = affiliateIdFor(p);
        var btns = A && A.isReady && A.isReady() && affId ? A.renderAffiliateButtons(affId, { page: 'pc-builder', placement: 'build-parts', disclosure: false }) : '';
        var shopPrices = (p.shops || []).filter(function (s) { return s && s.url && isNum(s.price) && s.checkedAt; }).map(function (s) {
          return '<div class="pb-shop-price">' + esc(s.shop) + '：' + yen(s.price) + '（' + esc(s.checkedAt) + '確認）</div>';
        }).join('');
        if (!btns && !shopPrices) return;
        rows.push('<div class="pb-shop-item"><div class="pb-shop-item__name">' + esc(def.short) + '：' + esc(p.name) + '</div>' + shopPrices + btns + '</div>');
      });
    });
    if (!rows.length) {
      html += '<p class="pb-note">パーツを選ぶと、Amazon・楽天市場などで探せるリンクを表示します。</p>';
    } else {
      html += '<p class="pb-note">広告リンクを含みます。リンク先は各ショップの検索結果です（商品ページへ直接つながるリンクはボタンに「価格を見る」と表示）。PC BUILDER に表示している価格は価格比較サイトで確認した目安で、Amazon・楽天などの販売価格・在庫ではありません。購入前にリンク先で価格と型番を確認してください。</p>' + rows.join('');
    }
    $('pbShops').innerHTML = html;
    if (A && A.bindTracking && A.isReady && A.isReady()) A.bindTracking();
  }

  /* ---------------- アフィリエイト（共通基盤を使う） ---------------- */
  function affiliateIdFor(p) {
    var A = global.SippoAffiliate;
    if (!A || !A.getProduct) return null;
    if (p.affiliateId && A.getProduct(p.affiliateId)) return p.affiliateId;
    var runtime = 'pb-' + p.id;
    return A.getProduct(runtime) ? runtime : null;
  }

  function initAffiliate() {
    var A = global.SippoAffiliate;
    if (!A || !A.init) return;
    A.init().then(function () {
      // 商品マスターに無いパーツは「検索リンクだけ」の商品として実行時に登録する。
      // URLは作らず、キーワード検索（アフィリエイトID付き）に限定する＝誤った商品ページへ送らない。
      S.db.list.forEach(function (p) {
        if (p.category === 'gpu') return;
        if (p.affiliateId && A.getProduct(p.affiliateId)) return;
        // 型番があれば型番で検索する（同名の別容量・別色の商品に着地しにくい）。複数型番の表記（A / B）は先頭だけ
        var model = p.model ? String(p.model).split('/')[0].trim() : '';
        var kw = p.kind === 'generic' ? p.name.replace(/（.*?）/g, '') : (p.maker + ' ' + (model || p.name.replace(/（.*?）/g, '')));
        A.addAffiliateProduct('pb-' + p.id, {
          name: p.name, category: p.category, brand: p.maker,
          amazon: { url: '', asin: '', keyword: kw }, rakuten: { url: '', keyword: kw }, yahoo: { url: '' },
          status: 'search-only',
        });
      });
      renderShops(cur());
    }).catch(function () { /* 購入リンクが出ないだけで本体は動く */ });
  }

  /* ==================================================================
   *  ② 性能
   * ================================================================== */
  function renderPerf() {
    var a = S.calc.A.score, b = S.calc.B ? S.calc.B.score : null;
    doc.querySelectorAll('#pbRes button').forEach(function (btn) { btn.setAttribute('aria-checked', String(btn.getAttribute('data-res') === S.res)); });
    var axes = Score.AXES.map(function (ax) { return { id: ax.id, label: ax.short, a: a.axes[ax.id], b: b ? b.axes[ax.id] : null }; });
    Charts.radar($('pbRadar'), axes, !!b);
    var nameA = S.builds.A.name || '構成A', nameB = b ? (S.builds.B.name || '構成B') : '';
    $('pbLegend').innerHTML = '<span><i></i>' + esc(nameA) + '</span>' + (b ? '<span><i class="b"></i>' + esc(nameB) + '</span>' : '')
      + '<span>＊=参考値（推定を含む）／—=評価不可（0点ではないので線を途切れさせています）／どの点数も実測ではありません</span>' + (isEmpty(S.builds.A) ? '<span>パーツを選ぶとグラフが伸びます</span>' : '');

    $('pbAxes').innerHTML = Score.AXES.map(function (ax) {
      var sa = a.axes[ax.id], sb = b ? b.axes[ax.id] : null;
      var va = isNum(sa.score) ? sa.score : null, vb = sb && isNum(sb.score) ? sb.score : null;
      var diff = va != null && vb != null ? vb - va : null;
      var label = ax.id === 'game' || ax.id === 'stream' ? ax.label + '（' + RES_LABEL[S.res] + '）' : ax.label;
      return '<li class="pb-axis"><div class="pb-axis__row"><div class="pb-axis__name">' + esc(label)
        + ' <span class="pb-grade pb-grade--' + sa.grade + '">' + GRADE_LABEL[sa.grade] + '</span></div>'
        + '<div class="pb-axis__vals"><span class="pb-axis__val">' + (va == null ? '—' : va) + '</span>'
        + (b ? '<span class="pb-axis__val pb-axis__val--b">' + (vb == null ? '—' : vb) + '</span>' : '')
        + (diff != null ? '<span class="pb-axis__diff ' + (diff > 0 ? 'up' : (diff < 0 ? 'down' : '')) + '">B' + (diff > 0 ? '+' : '') + diff + '</span>' : '')
        + '</div></div>'
        + '<div class="pb-axis__bar" aria-hidden="true"><span style="width:' + (va || 0) + '%"></span>' + (b ? '<span class="b" style="width:' + (vb || 0) + '%"></span>' : '') + '</div>'
        + (sa.reasons && sa.reasons.length ? '<p class="pb-axis__why">' + esc(sa.reasons.join(' / ')) + '</p>' : '')
        + '</li>';
    }).join('');
    renderDetail();
  }

  var DETAIL_TABS = [
    { id: 'res', label: '解像度別' },
    { id: 'cpugpu', label: 'CPU・GPU' },
    { id: 'power', label: '消費電力' },
    { id: 'mem', label: 'メモリ・VRAM' },
    { id: 'price', label: '価格内訳' },
    { id: 'budget', label: '予算±' },
    { id: 'compare', label: 'A/B比較' },
  ];

  function renderDetail() {
    $('pbDetailTabs').innerHTML = DETAIL_TABS.map(function (t) {
      return '<button type="button" role="tab" data-detail="' + t.id + '" aria-selected="' + (S.detailTab === t.id) + '">' + esc(t.label) + '</button>';
    }).join('');
    var a = S.calc.A.score, b = S.calc.B ? S.calc.B.score : null;
    var cmp = !!b, html = '';
    switch (S.detailTab) {
      case 'res':
        html = Charts.bars(['fhd', 'wqhd', '4k'].map(function (r) {
          return { label: RES_LABEL[r] + 'ゲーム', a: a.gameByRes[r].score, b: b ? b.gameByRes[r].score : null, unit: '点' };
        }), { compare: cmp })
          + '<p class="pb-note">同じ構成でも解像度が上がるほどGPUの負担が増え、点数が下がります。75点前後が「その解像度を主用途として検討できる」目安です。</p>'
          + '<p class="pb-msg">ゲーム別のFPSは、Sippoに実測データが無いため表示していません（推測の数値を作らないため）。'
          + (S.importInfo && S.importInfo.game ? ' <a href="' + esc(S.importInfo.game.url) + '">' + esc(S.importInfo.game.title) + ' の必要スペックと解像度別の目安</a>はGAME PC GUIDEで確認できます。' : ' ゲームごとの必要スペックは <a href="/game-pc-guide/">GAME PC GUIDE</a> で確認できます。') + '</p>';
        break;
      case 'cpugpu':
        html = Charts.bars([
          { label: 'GPU描画性能', a: a.detail.gpuRaster, b: b ? b.detail.gpuRaster : null, unit: '' },
          { label: 'CPUゲーム性能', a: a.detail.cpuGame, b: b ? b.detail.cpuGame : null, unit: '' },
          { label: 'CPUマルチ（推定）', a: a.detail.cpuMt, b: b ? b.detail.cpuMt : null, unit: '' },
        ], { compare: cmp })
          + '<p class="pb-note">GPU描画性能＝GPU GUIDEの描画性能指数（RTX 5090＝100）。CPUゲーム性能＝PC UPGRADEのCPU性能指数。CPUマルチ＝コア数×クロックからの推定（16コア32スレッド5.7GHz＝100）。「—」は値が未登録です。</p>';
        break;
      case 'power':
        html = powerDetail(S.calc.A, S.builds.A, 'A') + (b ? powerDetail(S.calc.B, S.builds.B, 'B') : '');
        break;
      case 'mem':
        html = Charts.bars([
          { label: 'メモリ', a: a.detail.memoryGB, b: b ? b.detail.memoryGB : null, unit: 'GB', max: 128, marker: 32, markerLabel: '32GB' },
          { label: 'VRAM', a: a.detail.vram, b: b ? b.detail.vram : null, unit: 'GB', max: 32, marker: 12, markerLabel: '12GB' },
        ], { compare: cmp }) + '<p class="pb-note">白い線はメモリ32GB・VRAM12GB（WQHD以上の高画質で余裕が出やすい目安）。</p>';
        break;
      case 'price':
        html = priceDetail(a.prices, 'A') + (b ? priceDetail(b.prices, 'B') : '');
        break;
      case 'budget':
        html = budgetDetail();
        break;
      case 'compare':
        html = compareDetail();
        break;
    }
    $('pbDetail').innerHTML = html;
  }

  function powerDetail(calc, build, key) {
    var p = calc.compat.power;
    var psuE = (build.items.psu || [])[0];
    var psu = psuE ? part(psuE.id) : null;
    var w = psu && isNum(psu.specs.watt) ? psu.specs.watt : null;
    var watt = calc.compat.results.filter(function (r) { return r.id === 'psuwatt'; })[0];
    var official = watt && watt.officialPsuW;
    var title = S.builds.B ? '<strong>構成' + key + '</strong>' : '';
    if (!(build.items.cpu || []).length) return '<p class="pb-msg">' + title + ' CPUを選ぶと推定消費電力を表示します。</p>';
    var segs = [
      { label: 'CPU', value: p.cpuW || 0, color: '#38bdf8' },
      { label: 'GPU', value: p.gpuW || 0, color: '#818cf8' },
      { label: 'その他', value: p.otherW, color: '#64748b' },
    ];
    var html = '<div style="margin-bottom:12px">' + title
      + Charts.stack(segs, Math.max(p.totalW, w || 0), { aria: '推定消費電力の内訳', format: function (v) { return Math.round(v) + 'W'; } })
      + Charts.bars([{ label: '推定負荷', a: Math.round(p.totalW), unit: 'W', max: Math.max(w || 0, official || 0, p.totalW) * 1.1, marker: w, markerLabel: '電源容量', bText: '' }])
      + '<p class="pb-note">' + (w ? '電源容量 ' + w + 'W（白線）' : '電源未選択') + (official ? '／GPUメーカー推奨 ' + official + 'W以上' : '') + (p.complete ? '' : '／CPUまたはGPUの消費電力が未登録のため、合計は分かっている分だけです')
      + '。' + esc(p.note) + '</p></div>';
    return html;
  }

  function priceDetail(prices, key) {
    var title = S.builds.B ? '<strong>構成' + key + '</strong> ' : '';
    var unpriced = prices.unpriced.filter(function (u) { return u.category !== 'gpuboard' || prices.boardPriced; });
    if (!prices.rows.length && !prices.refRows.length) return '<p class="pb-msg">' + title + '参考価格のあるパーツがまだありません。</p>';
    var byCat = {};
    prices.rows.forEach(function (r) { byCat[r.category] = (byCat[r.category] || 0) + r.value; });
    var segs = Object.keys(byCat).map(function (k) { return { label: catDef(k).short, value: byCat[k], color: PRICE_COLORS[k] || PRICE_COLORS.gpu || '#94a3b8' }; });
    var cost = S.calc[key] && S.calc[key].score.axes.cost;
    var steps = cost && cost.sensitivity && cost.sensitivity.steps;
    function row(r, inTotal) {
      return '<tr' + (inTotal ? '' : ' class="is-ref"') + '><td>' + esc(r.name) + (r.qty > 1 ? ' ×' + r.qty : '') + '</td><td class="num">' + yen(r.value) + '</td><td><b>' + esc(TIER_LABEL[r.price.tier] || '') + '</b>' + (inTotal ? '' : '（合計に含まない）') + '<br>' + priceSource(r.price) + (r.price.stale ? '<br><span class="pb-price__warn">確認から' + esc(r.price.ageDays) + '日たっています</span>' : '') + '</td></tr>';
    }
    return '<div style="margin-bottom:12px">' + title + '確認できた価格の合計 約' + man(prices.total)
      + (prices.refRows.length || unpriced.length ? '（参考価格だけのもの・未登録のもの ' + (prices.refRows.length + unpriced.length) + '点を除く）' : '')
      + (segs.length ? Charts.stack(segs, prices.total, { aria: '価格の内訳', format: function (v) { return '約' + man(v); } }) : '')
      + '<table class="pb-table" style="margin-top:8px"><thead><tr><th>パーツ</th><th class="num">価格</th><th>価格の種類・確認日・出典</th></tr></thead><tbody>'
      + prices.rows.map(function (r) { return row(r, true); }).join('')
      + prices.refRows.map(function (r) { return row(r, false); }).join('')
      + unpriced.map(function (u) { var why = suspendedNote(u.category); return '<tr class="is-ref"><td>' + esc(u.name) + '</td><td class="num">—</td><td>参考価格 未登録' + (why ? '（' + esc(why) + '）' : '') + '</td></tr>'; }).join('')
      + '</tbody></table>'
      + '<p class="pb-note">実売確認価格＝型番が一致した製品の掲載最安値。参考中央値＝同じ種類・容量（GPUは同じチップ）の製品の最安値の中央値。参考価格（未確認）＝確認日の無い既存の目安で、合計とコスパには入れません。いずれも価格比較サイトで手で確認した値で、Amazon・楽天などの販売価格ではありません。</p>'
      + (steps ? '<table class="pb-table" style="margin-top:8px"><thead><tr><th>合計が変わったとき</th><th class="num">コスパ</th></tr></thead><tbody>'
        + steps.slice().reverse().map(function (x) { return '<tr><td>' + Math.round(x.ratio * 100) + '%上がる</td><td class="num">' + x.up + '点</td></tr>'; }).join('')
        + '<tr><td><b>いま</b></td><td class="num"><b>' + cost.score + '点</b></td></tr>'
        + steps.map(function (x) { return '<tr><td>' + Math.round(x.ratio * 100) + '%下がる</td><td class="num">' + x.down + '点</td></tr>'; }).join('')
        + '</tbody></table><p class="pb-note">コスパは価格に反比例するので、価格が大きく動く時期は点数も大きく動きます（100点で頭打ち）。</p>' : '')
      + '</div>';
  }

  function suspendedNote(category) {
    var p = S.db.rules.pricing && S.db.rules.pricing.suspendFallback;
    return p && typeof p[category] === 'string' ? '既存の目安価格は実売と大きく違うため使っていません' : '';
  }

  function budgetDetail() {
    var build = cur();
    var alts = Score.gpuAlternatives(build, S.db, S.res, 2);
    if (!(build.items.gpu || []).length) return '<p class="pb-msg">GPUを選ぶと、予算を上下させたとき（GPUを近い価格帯に替えたとき）の違いを表示します。</p>';
    if (!alts.length) return '<p class="pb-msg">確認日つきの価格があるGPUどうしでしか比べません。このGPU、または比べる候補に確認日つきの価格がありません。</p>';
    var base = S.calc[S.active].score.axes.game.score;
    return '<p class="pb-note" style="margin-top:0">GPUだけを参考価格が近い新品GPUに替えた場合の、' + RES_LABEL[S.res] + 'ゲーム性能の変化です（今：' + (isNum(base) ? base + '点' : '評価不可') + '）。</p>'
      + '<table class="pb-table"><thead><tr><th>GPU</th><th class="num">予算の差</th><th class="num">ゲーム性能</th><th></th></tr></thead><tbody>'
      + alts.map(function (x) {
        var d = x.scoreDiff;
        return '<tr><td>' + esc(x.name) + '</td><td class="num ' + (x.priceDiff > 0 ? 'down' : 'up') + '">' + (x.priceDiff > 0 ? '+' : '−') + man(Math.abs(x.priceDiff)) + '</td>'
          + '<td class="num">' + (isNum(x.score) ? x.score + '点' : '—') + (isNum(d) ? ' <span class="' + (d > 0 ? 'up' : (d < 0 ? 'down' : '')) + '">(' + (d > 0 ? '+' : '') + d + ')</span>' : '') + '</td>'
          + '<td><button type="button" class="pb-btn pb-btn--sm" data-add="gpu|' + esc(x.id) + '">替える</button></td></tr>';
      }).join('') + '</tbody></table>'
      + '<p class="pb-note">価格はチップ別の参考中央値（確認日つき）で比べています。確認日つきの価格が無いGPUは候補に入れていません。100点で頭打ちになるため、上位GPU同士の差は小さく見えます。</p>';
  }

  function compareDetail() {
    if (!S.builds.B) return '<p class="pb-msg">「⇄ 構成Bと比較」を押すと、今の構成をコピーした構成Bを作れます。パーツを替えて、性能・価格・互換性の差を比べられます。</p>';
    var A = S.builds.A, B = S.builds.B, sa = S.calc.A.score, sb = S.calc.B.score;
    var rows = Db.CATEGORIES.map(function (def) {
      function names(b) { return (b.items[def.id] || []).map(function (e) { var p = part(e.id); return p ? p.name + (e.qty > 1 ? ' ×' + e.qty : '') : e.id; }).join('、') || '—'; }
      var na = names(A), nb = names(B);
      if (na === '—' && nb === '—') return '';
      return '<tr' + (na !== nb ? ' style="background:rgba(245,165,36,0.06)"' : '') + '><th>' + esc(def.short) + '</th><td>' + esc(na) + '</td><td>' + esc(nb) + '</td></tr>';
    }).join('');
    var axes = Score.AXES.map(function (ax) {
      var x = sa.axes[ax.id].score, y = sb.axes[ax.id].score;
      var d = isNum(x) && isNum(y) ? y - x : null;
      return '<tr><th>' + esc(ax.short) + '</th><td class="num">' + (isNum(x) ? x : '評価不可') + '</td><td class="num">' + (isNum(y) ? y : '評価不可') + '</td><td class="num ' + (d > 0 ? 'up' : (d < 0 ? 'down' : '')) + '">' + (d == null ? '—' : (d > 0 ? '+' : '') + d) + '</td></tr>';
    }).join('');
    var pd = sb.prices.total - sa.prices.total;
    return '<table class="pb-table"><thead><tr><th></th><th>' + esc(A.name || '構成A') + '</th><th>' + esc(B.name || '構成B') + '</th></tr></thead><tbody>' + rows + '</tbody></table>'
      + '<table class="pb-table" style="margin-top:10px"><thead><tr><th>項目</th><th class="num">A</th><th class="num">B</th><th class="num">差（B−A）</th></tr></thead><tbody>' + axes
      + '<tr><th>参考価格</th><td class="num">' + man(sa.prices.total) + '</td><td class="num">' + man(sb.prices.total) + '</td><td class="num ' + (pd > 0 ? 'down' : 'up') + '">' + (pd > 0 ? '+' : (pd < 0 ? '−' : '')) + man(Math.abs(pd)) + '</td></tr>'
      + '<tr><th>互換性</th><td class="num">' + STATUS_LABEL[S.calc.A.compat.overall] + '</td><td class="num">' + STATUS_LABEL[S.calc.B.compat.overall] + '</td><td></td></tr>'
      + '</tbody></table><p class="pb-note">価格は確認日つきの価格だけの合計です（参考価格だけ・未登録のパーツは含みません）。</p>';
  }

  /* ==================================================================
   *  そのほかの描画
   * ================================================================== */
  function renderPresets() {
    var el = $('pbPresetList');
    if (!S.presets.length) { $('pbPresets').hidden = true; return; }
    el.innerHTML = S.presets.map(function (p) {
      return '<button type="button" class="pb-preset" data-preset="' + esc(p.id) + '">' + esc(p.name) + '<small>' + esc(p.desc) + '</small></button>';
    }).join('');
  }

  function renderScoreHelp() {
    var el = $('pbScoreHelp');
    if (!el) return;
    el.innerHTML = Score.AXES.map(function (ax) { return '<div class="pb-score-card"><strong>' + esc(ax.label) + '</strong>' + esc(ax.help) + '</div>'; }).join('');
  }

  function applyPreset(id) {
    var p = S.presets.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    var items = {};
    Object.keys(p.items).forEach(function (cat) {
      items[cat] = p.items[cat].filter(function (e) { return S.db.byId[e.id]; }).map(function (e) { return { id: e.id, qty: e.qty || 1 }; });
    });
    S.builds[S.active] = { name: p.name, items: items };
    if (p.res) S.res = p.res;
    track('pcb_preset', { preset: id });
    toast('「' + p.name + '」を読み込みました');
    update();
  }

  var toastTimer = 0;
  function toast(msg) {
    var el = $('pbToast');
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-show'); }, 2200);
  }

  function track(name, paramsObj) {
    try { if (typeof global.gtag === 'function') global.gtag('event', name, paramsObj || {}); } catch (e) { /* 計測は失敗しても無視 */ }
  }

  /* ---------------- 保存・共有 ---------------- */
  function shareUrl() {
    var q = Codec.toQuery(S.builds.A, { name: S.builds.A.name, res: S.res, compare: S.builds.B && !isEmpty(S.builds.B) ? S.builds.B : null, compareName: S.builds.B ? S.builds.B.name : '' });
    return { url: global.location.origin + global.location.pathname + '?' + q.query, tooLong: q.tooLong };
  }

  function copyShare() {
    if (isEmpty(S.builds.A)) { toast('パーツを選んでから共有してください'); return; }
    var s = shareUrl();
    var done = function () { toast(s.tooLong ? 'URLをコピーしました（長いURLです。一部のSNSでは途中で切れる場合があります）' : '共有URLをコピーしました'); };
    track('pcb_share', {});
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(s.url).then(done, function () { global.prompt('このURLをコピーしてください', s.url); });
    } else {
      global.prompt('このURLをコピーしてください', s.url);
    }
  }

  function saveCurrent() {
    var b = cur();
    if (isEmpty(b)) { toast('パーツを選んでから保存してください'); return; }
    var rec = Codec.saveBuild({ id: b.savedId, name: b.name || '名前のない構成', res: S.res, build: b });
    if (rec) { b.savedId = rec.id; track('pcb_save', {}); toast('「' + rec.name + '」をこのブラウザに保存しました'); }
    else toast('保存できませんでした（ブラウザの設定で保存が無効になっている可能性があります）');
  }

  function openSaved() {
    var dlg = $('pbSavedDialog');
    var list = Codec.loadSaved();
    $('pbSavedList').innerHTML = list.length ? '<div class="pb-saved">' + list.map(function (r) {
      var n = 0;
      Object.keys(r.build.items || {}).forEach(function (k) { n += (r.build.items[k] || []).length; });
      return '<div class="pb-saved__row"><div><strong>' + esc(r.name) + '</strong><small>' + esc(String(r.savedAt).slice(0, 16).replace('T', ' ')) + ' · ' + n + 'パーツ</small></div>'
        + '<div class="pb-saved__btns"><button type="button" class="pb-btn pb-btn--sm" data-load="' + esc(r.id) + '|A">開く</button>'
        + '<button type="button" class="pb-btn pb-btn--sm" data-load="' + esc(r.id) + '|B">構成Bとして比較</button>'
        + '<button type="button" class="pb-btn pb-btn--sm pb-btn--ghost" data-delete-saved="' + esc(r.id) + '">削除</button></div></div>';
    }).join('') + '</div>' : '<p class="pb-msg">まだ保存した構成はありません。</p>';
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }

  function loadSaved(id, slotKey) {
    var r = Codec.loadSaved().filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    var items = {};
    Object.keys(r.build.items || {}).forEach(function (cat) {
      if (!Db.CATEGORY_MAP[cat]) return;
      items[cat] = (r.build.items[cat] || []).filter(function (e) { return e && S.db.byId[e.id]; });
    });
    var dropped = Object.keys(r.build.items || {}).reduce(function (n, cat) { return n + (r.build.items[cat] || []).filter(function (e) { return !e || !S.db.byId[e.id]; }).length; }, 0);
    S.builds[slotKey] = { name: r.name, items: items, savedId: r.id };
    S.active = slotKey;
    if (r.res && RES_LABEL[r.res]) S.res = r.res;
    var dlg = $('pbSavedDialog');
    if (dlg.close) dlg.close(); else dlg.removeAttribute('open');
    toast('「' + r.name + '」を開きました' + (dropped ? '（登録が無くなったパーツ ' + dropped + '件を除外）' : ''));
    update();
  }

  function toggleCompare() {
    if (!S.builds.B) {
      S.builds.B = { name: (S.builds.A.name ? S.builds.A.name + 'のコピー' : '構成B'), items: JSON.parse(JSON.stringify(S.builds.A.items)) };
      S.active = 'B';
      S.detailTab = 'compare';
      toast('構成Bを作りました。パーツを替えて比べてみましょう');
    } else {
      if (!global.confirm('構成Bを閉じますか？（構成Aはそのまま残ります）')) return;
      S.builds.B = null;
      S.active = 'A';
    }
    update();
  }

  function showPane(name) {
    $('pbApp').setAttribute('data-pane', name);
    doc.querySelectorAll('.pb-mobile-tabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-pane') === name)); });
    // 切り替えた内容が画面外にあると「何も起きない」ように見えるので、パネルの先頭へ
    var tabs = doc.querySelector('.pb-mobile-tabs');
    if (tabs && global.getComputedStyle(tabs).display !== 'none') {
      var top = $('pbApp').getBoundingClientRect().top + global.pageYOffset - tabs.offsetHeight - 70;
      if (global.pageYOffset > top || $('pbApp').getBoundingClientRect().top > global.innerHeight * 0.6) global.scrollTo(0, Math.max(0, top));
    }
  }

  /* ==================================================================
   *  イベント
   * ================================================================== */
  function bindEvents() {
    doc.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target : e.target.parentElement;
      var el;
      if ((el = t.closest('[data-cat]')) && el.classList.contains('pb-cat')) { S.cat = el.getAttribute('data-cat'); S.filters.text = ''; $('pbSearch').value = ''; renderCats(); renderList(); return; }
      if ((el = t.closest('[data-add]'))) { var a = el.getAttribute('data-add').split('|'); addPart(a[0], a[1]); return; }
      if ((el = t.closest('[data-remove]'))) { var r = el.getAttribute('data-remove').split('|'); removePart(r[0], r[1]); return; }
      if ((el = t.closest('[data-qty]'))) { var q = el.getAttribute('data-qty').split('|'); setQty(q[0], q[1], Number(q[2])); return; }
      if ((el = t.closest('[data-goto]'))) { S.cat = el.getAttribute('data-goto'); showPane('parts'); renderCats(); renderList(); $('pane-parts').scrollIntoView({ block: 'nearest' }); return; }
      if ((el = t.closest('[data-res]'))) { S.res = el.getAttribute('data-res'); update(); return; }
      if ((el = t.closest('[data-build]')) && el.closest('#pbBuildSwitch')) { S.active = el.getAttribute('data-build'); update(); return; }
      if ((el = t.closest('[data-detail]'))) { S.detailTab = el.getAttribute('data-detail'); renderDetail(); return; }
      if ((el = t.closest('[data-preset]'))) { applyPreset(el.getAttribute('data-preset')); return; }
      if ((el = t.closest('[data-game-build]'))) { applyGameBuild(Number(el.getAttribute('data-game-build'))); return; }
      if ((el = t.closest('[data-load]'))) { var l = el.getAttribute('data-load').split('|'); loadSaved(l[0], l[1]); return; }
      if ((el = t.closest('[data-delete-saved]'))) { Codec.deleteSaved(el.getAttribute('data-delete-saved')); openSaved(); return; }
      if ((el = t.closest('[data-close]'))) { var d = el.closest('dialog'); if (d && d.close) d.close(); return; }
      if ((el = t.closest('.pb-mobile-tabs [data-pane]'))) { showPane(el.getAttribute('data-pane')); return; }
      if ((el = t.closest('[data-action]'))) {
        var act = el.getAttribute('data-action');
        if (act === 'save') saveCurrent();
        else if (act === 'share') copyShare();
        else if (act === 'saved') openSaved();
        else if (act === 'compare') toggleCompare();
        else if (act === 'reset') { if (global.confirm('構成' + S.active + 'のパーツをすべて外しますか？')) { cur().items = {}; update(); } }
        else if (act === 'no-gpu') { cur().items.gpu = []; cur().items.gpuboard = []; toast('GPUを外しました（内蔵GPUで映像を出す構成）'); update(); }
        else if (act === 'close-import') { S.importInfo = null; S.warnings = []; renderImport(); }
      }
    });
    var searchTimer = 0;
    $('pbSearch').addEventListener('input', function (e) { clearTimeout(searchTimer); var v = e.target.value; searchTimer = setTimeout(function () { S.filters.text = v; renderList(); }, 120); });
    $('pbMaker').addEventListener('change', function (e) { S.filters.maker = e.target.value; renderList(); });
    $('pbSort').addEventListener('change', function (e) { S.filters.sort = e.target.value; renderList(); });
    $('pbPriceMax').addEventListener('change', function (e) { S.filters.priceMax = e.target.value; renderList(); });
    $('pbOnlyCompat').addEventListener('change', function (e) { S.filters.onlyCompat = e.target.checked; renderList(); });
    $('pbHideUsed').addEventListener('change', function (e) { S.filters.hideUsed = e.target.checked; renderList(); });
    $('pbName').addEventListener('input', function (e) { cur().name = Codec.cleanName(e.target.value); clearTimeout(urlTimer); urlTimer = setTimeout(function () { syncUrl(); renderPerfLegendOnly(); }, 300); });
  }

  function renderPerfLegendOnly() {
    var b = S.builds.B;
    $('pbLegend').innerHTML = '<span><i></i>' + esc(S.builds.A.name || '構成A') + '</span>' + (b ? '<span><i class="b"></i>' + esc(b.name || '構成B') + '</span>' : '') + '<span>＊=参考値（推定を含む）／—=評価不可（0点ではないので線を途切れさせています）／どの点数も実測ではありません</span>';
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window !== 'undefined' ? window : this);
