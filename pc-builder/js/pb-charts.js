/* =====================================================================
 *  Sippo PC BUILDER  グラフ描画 (pb-charts.js)
 *  ---------------------------------------------------------------------
 *  外部ライブラリを使わず SVG / HTML で描く。
 *   - radar()   … 5角形グラフ（構成A・Bの重ね描き、アニメーション付き）
 *   - bars()    … 横棒グラフ（A/B比較、目盛りマーカー付き）
 *   - stack()   … 積み上げ棒（価格内訳・消費電力）
 *   - preview() … 完成イメージ（PC内部を横から見た模式図。実物の外観ではない）
 *  文字列はすべて esc() を通してから埋め込む。
 * ===================================================================== */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var reduceMotion = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /* ------------------------------------------------------------
   *  5角形グラフ
   * ------------------------------------------------------------ */
  var R = 112, CX = 180, CY = 168;
  var radarState = { a: null, b: null, raf: 0, mask: { a: null, b: null } };

  function pointAt(i, n, v) {
    var ang = -Math.PI / 2 + i * 2 * Math.PI / n;
    var r = R * Math.max(0, Math.min(100, v)) / 100;
    return [CX + r * Math.cos(ang), CY + r * Math.sin(ang)];
  }

  function polyStr(vals) {
    return vals.map(function (v, i) { var p = pointAt(i, vals.length, v); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
  }

  /**
   * 5角形グラフ。
   *  - 基準枠（20〜100の目盛り）と5本の軸は常に描く。
   *  - 点数のある軸どうしが隣り合う区間だけを塗る（中心・軸i・軸i+1 の三角形の集まり）。
   *    5項目すべてあれば普通の5角形になり、評価不可（N/A）の軸がある区間は塗らない。
   *    評価不可を0点や推測値で補って図形を閉じることはしない。
   *  - 評価不可の軸は点線の軸と「N/A」のラベルで示す（0点と区別する）。0点は中心に点を打つ。
   * @param {SVGElement} svg
   * @param {Array} axes  [{label, a:{score,grade}, b:{score,grade}|null}]
   */
  function radar(svg, axes, hasB) {
    var n = axes.length;
    var html = '';
    var valid = function (s) { return !!(s && isNum(s.score)); };
    var maskA = axes.map(function (ax) { return valid(ax.a); });
    var maskB = axes.map(function (ax) { return hasB && valid(ax.b); });
    radarState.mask = { a: maskA, b: hasB ? maskB : null };
    [20, 40, 60, 80, 100].forEach(function (v) {
      html += '<polygon class="grid-ring' + (v === 100 ? ' grid-ring--outer' : '') + '" points="' + polyStr(axes.map(function () { return v; })) + '"/>';
    });
    axes.forEach(function (ax, i) {
      var p = pointAt(i, n, 100);
      var na = !maskA[i] && !(hasB && maskB[i]);
      html += '<line class="grid-axis' + (na ? ' grid-axis--na' : '') + '" x1="' + CX + '" y1="' + CY + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '"/>';
    });
    // 目盛りは頂点の点数表示と重ならないよう、中心のすぐ横に50だけ置く
    var p50 = pointAt(0, n, 50);
    html += '<text class="ring-label" x="' + (p50[0] + 4) + '" y="' + (p50[1] + 3) + '">50</text>';
    if (hasB) html += '<path class="fill-b" data-poly="b" d=""/><path class="edge-b" data-edge="b" d=""/>';
    html += '<path class="fill-a" data-poly="a" d=""/><path class="edge-a" data-edge="a" d=""/>';
    axes.forEach(function (ax, i) {
      var lp = pointAt(i, n, 128);
      var anchor = Math.abs(lp[0] - CX) < 10 ? 'middle' : (lp[0] > CX ? 'start' : 'end');
      var dy = lp[1] < CY - 60 ? -6 : (lp[1] > CY + 40 ? 12 : 0);
      var sa = maskA[i] ? String(ax.a.score) + (ax.a.grade === 'estimate' ? '*' : '') : 'N/A';
      var sb = hasB ? (maskB[i] ? String(ax.b.score) + (ax.b.grade === 'estimate' ? '*' : '') : 'N/A') : '';
      html += '<text class="axis-label" text-anchor="' + anchor + '" x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + dy).toFixed(1) + '">' + esc(ax.label) + '</text>';
      html += '<text text-anchor="' + anchor + '" x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + dy + 15).toFixed(1) + '">'
        + '<tspan class="axis-score' + (maskA[i] ? '' : ' axis-score--na') + '" fill="' + (maskA[i] ? 'var(--accent-2)' : 'var(--faint)') + '">' + esc(sa) + '</tspan>'
        + (hasB ? '<tspan class="axis-score' + (maskB[i] ? '' : ' axis-score--na') + '" fill="' + (maskB[i] ? 'var(--b)' : 'var(--faint)') + '"> / ' + esc(sb) + '</tspan>' : '')
        + '</text>';
      html += '<circle class="dot-a" data-dot="a" data-i="' + i + '" r="3.6" cx="' + CX + '" cy="' + CY + '"' + (maskA[i] ? '' : ' style="display:none"') + '/>';
      if (hasB) html += '<circle class="dot-b" data-dot="b" data-i="' + i + '" r="3.2" cx="' + CX + '" cy="' + CY + '"' + (maskB[i] ? '' : ' style="display:none"') + '/>';
      if (!maskA[i]) {
        // 評価不可の目印：軸の外側寄りに小さな「N/A」札（中心には置かない＝0点と紛らわしいため）
        var np = pointAt(i, n, 62);
        html += '<g class="na-mark" transform="translate(' + np[0].toFixed(1) + ' ' + np[1].toFixed(1) + ')"><rect x="-14" y="-8" width="28" height="16" rx="4"/><text text-anchor="middle" y="4">N/A</text></g>';
      }
    });
    if (!maskA.some(Boolean) && !(hasB && maskB.some(Boolean))) {
      html += '<text class="radar-empty" text-anchor="middle" x="' + CX + '" y="' + (CY + 4) + '">パーツを選ぶと表示されます</text>';
    }
    // <title>/<desc> を残したまま中身を差し替える
    Array.prototype.slice.call(svg.querySelectorAll(':scope > :not(title):not(desc)')).forEach(function (el) { el.remove(); });
    var g = document.createElementNS(NS, 'g');
    g.innerHTML = html;
    svg.appendChild(g);

    var toA = axes.map(function (ax, i) { return maskA[i] ? ax.a.score : 0; });
    var toB = axes.map(function (ax, i) { return maskB[i] ? ax.b.score : 0; });
    animate(svg, toA, hasB ? toB : null);
  }

  /** 点数のある隣り合う軸どうしの「塗り」と「辺」のパス。評価不可の軸をまたぐ区間は描かない */
  function radarPaths(vals, mask) {
    var n = vals.length, fill = '', edge = '';
    for (var j = 0; j < n; j++) {
      var k = (j + 1) % n;
      if (!mask[j] || !mask[k]) continue;
      var p1 = pointAt(j, n, vals[j]), p2 = pointAt(k, n, vals[k]);
      var a = p1[0].toFixed(1) + ',' + p1[1].toFixed(1), b = p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
      fill += 'M' + CX + ',' + CY + 'L' + a + 'L' + b + 'Z';
      edge += 'M' + a + 'L' + b;
    }
    return { fill: fill, edge: edge };
  }

  function animate(svg, toA, toB) {
    var fromA = radarState.a || toA.map(function () { return 0; });
    var fromB = radarState.b || (toB ? toB.map(function () { return 0; }) : null);
    radarState.a = toA; radarState.b = toB;
    if (radarState.raf) cancelAnimationFrame(radarState.raf);
    var start = null, dur = reduceMotion ? 0 : 520;
    function frame(ts) {
      if (start == null) start = ts;
      var t = dur ? Math.min(1, (ts - start) / dur) : 1;
      var e = 1 - Math.pow(1 - t, 3);
      var a = toA.map(function (v, i) { return fromA[i] + (v - fromA[i]) * e; });
      draw(svg, 'a', a);
      if (toB) {
        var fb = fromB && fromB.length === toB.length ? fromB : toB.map(function () { return 0; });
        draw(svg, 'b', toB.map(function (v, i) { return fb[i] + (v - fb[i]) * e; }));
      }
      if (t < 1) radarState.raf = requestAnimationFrame(frame);
    }
    if (typeof requestAnimationFrame === 'function') radarState.raf = requestAnimationFrame(frame);
    else { draw(svg, 'a', toA); if (toB) draw(svg, 'b', toB); }
  }

  function draw(svg, key, vals) {
    var mask = radarState.mask[key];
    if (!mask) return;
    var p = radarPaths(vals, mask);
    var fill = svg.querySelector('[data-poly="' + key + '"]'), edge = svg.querySelector('[data-edge="' + key + '"]');
    if (fill) fill.setAttribute('d', p.fill);
    if (edge) edge.setAttribute('d', p.edge);
    var dots = svg.querySelectorAll('[data-dot="' + key + '"]');
    for (var i = 0; i < dots.length; i++) {
      var idx = Number(dots[i].getAttribute('data-i'));
      var pt = pointAt(idx, vals.length, vals[idx]);
      dots[i].setAttribute('cx', pt[0].toFixed(1));
      dots[i].setAttribute('cy', pt[1].toFixed(1));
    }
  }

  /* ------------------------------------------------------------
   *  横棒グラフ
   *  rows: [{label, a, b, max, unit, marker, markerLabel, aText, bText}]
   * ------------------------------------------------------------ */
  function bars(rows, opts) {
    var o = opts || {};
    return '<div class="pb-bars" role="list">' + rows.map(function (r) {
      var max = r.max || o.max || 100;
      function w(v) { return isNum(v) ? Math.max(0, Math.min(100, v / max * 100)) : 0; }
      var hasB = isNum(r.b) || r.bText;
      var aText = r.aText != null ? r.aText : (isNum(r.a) ? r.a + (r.unit || '') : '—');
      var bText = r.bText != null ? r.bText : (isNum(r.b) ? r.b + (r.unit || '') : (hasB ? '—' : ''));
      return '<div class="pb-bar" role="listitem">'
        + '<span class="pb-bar__label">' + esc(r.label) + '</span>'
        + '<span class="pb-bar__track" aria-hidden="true">'
        + '<span class="pb-bar__fill' + (o.compare ? ' half' : '') + '" style="width:' + w(r.a).toFixed(1) + '%"></span>'
        + (o.compare ? '<span class="pb-bar__fill b" style="width:' + w(r.b).toFixed(1) + '%"></span>' : '')
        + (isNum(r.marker) ? '<span class="pb-bar__marker" style="left:' + w(r.marker).toFixed(1) + '%" title="' + esc(r.markerLabel || '') + '"></span>' : '')
        + '</span>'
        + '<span class="pb-bar__val">' + esc(aText) + (o.compare ? '<small>' + esc(bText) + '</small>' : '') + '</span>'
        + '</div>';
    }).join('') + '</div>';
  }

  /* 積み上げ棒 segs: [{label, value, color}] */
  function stack(segs, total, opts) {
    var o = opts || {};
    var sum = total || segs.reduce(function (s, x) { return s + (x.value || 0); }, 0) || 1;
    return '<div class="pb-stack" role="img" aria-label="' + esc(o.aria || '内訳') + '">' + segs.map(function (s) {
      return '<span style="width:' + (Math.max(0, s.value) / sum * 100).toFixed(2) + '%;background:' + s.color + '" title="' + esc(s.label) + '"></span>';
    }).join('') + '</div>'
      + '<div class="pb-stack-legend">' + segs.map(function (s) {
        return '<span><i style="background:' + s.color + '"></i>' + esc(s.label) + ' ' + esc(o.format ? o.format(s.value) : s.value) + '</span>';
      }).join('') + '</div>';
  }

  /* ------------------------------------------------------------
   *  完成イメージ（PC内部を横から見た模式図。2026-11-08 に全面改修）
   *  - SVGだけで描く（画像・ライブラリ・常時アニメーションなし）。
   *  - 実物の外観・寸法比・取り付け位置を再現するものではない「イメージ」。
   *    データで分かっていることだけを形に反映する：
   *      ケースの形（shape）／マザボの大きさ（formFactor）／メモリの枚数とスロット数
   *      GPUの長さ（ケース上限に対する比率。上限線つき）・厚さ（スロット数）・ファン数・補助電源の種類
   *      クーラーの種類（空冷＝ヒートシンク＋ファン／簡易水冷＝ポンプ＋ラジエーター）とラジエーターの長さ
   *      ラジエーターの位置（ケースの対応位置から一例を選ぶ）／電源の容量・奥行き／ファン・ストレージの数
   *    分からない値（GPU製品が未選択でファン数不明など）は点線の「汎用」表現にして、具体的な形を作らない。
   *  - 未選択のパーツは点線のプレースホルダー。選んでいるカテゴリ（focus）は光らせる。
   *  - 各パーツの <g> に data-goto を付ける（クリックでそのカテゴリを選び直せる）。
   *  opt.id は SVG 内の id の接頭辞（同じページに2枚描くときに id が衝突しないように）。
   * ------------------------------------------------------------ */
  var PV_LABEL = { cpu: 'CPU', cooler: 'CPUクーラー', motherboard: 'マザーボード', memory: 'メモリ', gpu: 'GPU', gpuboard: 'グラボ製品', storage: 'SSD・HDD', psu: '電源', case: 'ケース', fan: 'ケースファン', expansion: '拡張カード' };
  // 横から見たときの大きさ（mm：横×縦）。比率の目安で、実寸の再現ではない
  var MB_MM = { 'E-ATX': [305, 330], ATX: [244, 305], 'Micro-ATX': [244, 244], 'Mini-ITX': [170, 170] };
  var CASE_BOX = { mid: [52, 22, 284, 352], full: [40, 8, 306, 380], matx: [66, 58, 256, 304], dual: [22, 66, 350, 270], itx: [96, 112, 206, 208], none: [52, 22, 284, 352] };

  function f1(v) { return (Math.round(v * 10) / 10).toString(); }
  function rect(cls, x, y, w, h, r, extra) {
    return '<rect class="' + cls + '" x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(Math.max(0, w)) + '" height="' + f1(Math.max(0, h)) + '"' + (r ? ' rx="' + r + '"' : '') + (extra || '') + '/>';
  }
  function txt(cls, x, y, s, anchor) {
    return '<text class="' + cls + '" x="' + f1(x) + '" y="' + f1(y) + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(s) + '</text>';
  }
  /** ファン：円形のファンを sx・sy で潰して「斜めから見た」形にする（symbol を再利用） */
  function fanUse(uid, cls, cx, cy, d, sx, sy) {
    var w = d * sx, h = d * sy;
    return '<use href="#' + uid + '-fan" class="' + cls + '" x="' + f1(cx - w / 2) + '" y="' + f1(cy - h / 2) + '" width="' + f1(w) + '" height="' + f1(h) + '"/>';
  }
  function fanSymbol(uid) {
    var blades = '';
    for (var i = 0; i < 6; i++) {
      var a = i * Math.PI / 3;
      var P = function (r, t) { return f1(Math.cos(a + t) * r) + ',' + f1(Math.sin(a + t) * r); };
      blades += 'M' + P(5, 0) + 'Q' + P(13, 0.35) + ' ' + P(16.5, 0.85) + 'Q' + P(10, 0.95) + ' ' + P(5, 0.75) + 'Z';
    }
    return '<symbol id="' + uid + '-fan" viewBox="-20 -20 40 40" preserveAspectRatio="none">'
      + '<rect x="-19.5" y="-19.5" width="39" height="39" rx="6" fill="#0b111d" fill-opacity=".55" stroke="currentColor" stroke-opacity=".55"/>'
      + '<circle r="17.5" fill="none" stroke="currentColor" stroke-width="1.4"/>'
      + '<path d="' + blades + '" fill="currentColor" fill-opacity=".38"/>'
      + '<circle r="5" fill="#0b111d" stroke="currentColor" stroke-width="1.2"/></symbol>';
  }

  /**
   * ラジエーターをどこに描くか。ケースの対応位置（data）に、そのサイズが含まれる位置を
   * 天面 → 前面 → 側面 → 底面 の順で1つ選ぶ（あくまで一例）。ケースが無い・合う位置が無いときは天面に描く。
   * listed: ケースのデータで対応が確認できた位置（無ければ null）／draw: 絵の上の位置
   */
  function radMount(mounts, mm, shape) {
    var order = ['top', 'front', 'side', 'bottom'], listed = null;
    if (mounts && isNum(mm)) { for (var i = 0; i < order.length; i++) if ((mounts[order[i]] || []).indexOf(mm) >= 0) { listed = order[i]; break; } }
    var draw = listed || 'top';
    var tower = shape !== 'dual' && shape !== 'itx';
    if (shape === 'itx') draw = 'top';
    if (draw === 'side' && shape !== 'dual') draw = 'front';
    if (draw === 'bottom' && tower) draw = 'front';
    return { listed: listed, draw: draw };
  }

  function preview(p, opt) {
    p = p || {};
    opt = opt || {};
    var uid = String(opt.id || 'pv').replace(/[^a-zA-Z0-9_-]/g, '');
    var shape = CASE_BOX[p.caseShape] ? p.caseShape : 'none';
    var noCase = shape === 'none';
    var tower = shape === 'mid' || shape === 'full' || shape === 'matx' || noCase;
    var focus = p.focus || '';
    var fresh = p.fresh || {};
    var names = p.names || {};
    var O = CASE_BOX[shape];
    var ox = O[0], oy = O[1], ow = O[2], oh = O[3];
    var D = shape === 'itx' ? 11 : 15; // 奥行き（内側の背面板までの見かけの距離）
    var ix = ox + D, iy = oy + D, iw = ow - 2 * D, ih = oh - 2 * D;

    // ---- 区画：電源シュラウド（タワー型）／前面ファンの場所 ----
    var shroudH = tower ? Math.round(ih * 0.2) : 0;
    var shroudY = iy + ih - shroudH;
    var frontZ = shape === 'itx' ? 0 : (shape === 'dual' ? 46 : 40);
    var bottomZ = shape === 'dual' ? 34 : 0;
    var topZ = shape === 'itx' ? 8 : 24;

    // ---- マザーボード ----
    var mbForm = MB_MM[p.mbForm] ? p.mbForm : (shape === 'itx' ? 'Mini-ITX' : 'ATX');
    var mm = MB_MM[mbForm];
    var availH = (tower ? shroudY : iy + ih - bottomZ) - iy - topZ - 8;
    var availW = iw - frontZ - 14;
    var k = Math.min(availH / 305, availW / 244);
    if (shape === 'itx') k = Math.min(availH / 175, availW / 175);
    var mbW = Math.min(mm[0] * k, availW), mbH = Math.min(mm[1] * k, availH);
    var mbX = ix + 8, mbY = iy + topZ;
    var kk = k / 0.75; // 部品の大きさの基準（ミドルタワー・ATX のとき 1 前後）
    if (shape === 'itx') kk = Math.min(kk, 0.95);
    var small = mbForm === 'Mini-ITX';
    var cx = mbX + mbW * (small ? 0.42 : 0.4), cy = mbY + mbH * (small ? 0.3 : 0.23);
    var slotY = mbY + mbH * ({ ATX: 0.53, 'E-ATX': 0.5, 'Micro-ATX': 0.56, 'Mini-ITX': 0.8 })[mbForm];

    // ---- 部品ごとの <g>（選択状態・強調・新規追加） ----
    function g(cat, sel, body, title) {
      var cls = 'pp pp-' + cat + (sel ? ' is-sel' : ' is-ghost') + (focus === cat || (focus === 'gpuboard' && cat === 'gpu') ? ' is-focus' : '') + (fresh[cat] ? ' is-new' : '');
      var t = (PV_LABEL[cat] || cat) + '：' + (sel ? (names[cat] || '選択済み') : '未選択') + '（クリックで選ぶ）';
      return '<g class="' + cls + '" data-goto="' + (cat === 'gpu' && p.boardSel ? 'gpuboard' : cat) + '"' + (sel ? ' filter="url(#' + uid + '-sh)"' : '') + '><title>' + esc(title || t) + '</title>' + body + '</g>';
    }
    var anchors = {}; // 強調ラベルの位置

    var s = '<svg class="pv" viewBox="0 0 400 400" role="img" aria-labelledby="' + uid + '-t" xmlns="http://www.w3.org/2000/svg">'
      + '<title id="' + uid + '-t">選んだ構成の完成イメージ（模式図）</title>';

    // ---- 共通の定義（グラデーション・影・ファン） ----
    s += '<defs>'
      + '<linearGradient id="' + uid + '-shell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26324a"/><stop offset="1" stop-color="#121a2a"/></linearGradient>'
      + '<linearGradient id="' + uid + '-back" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#101827"/><stop offset="1" stop-color="#0a101b"/></linearGradient>'
      + '<linearGradient id="' + uid + '-wallT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2840"/><stop offset="1" stop-color="#131c2e"/></linearGradient>'
      + '<linearGradient id="' + uid + '-wallB" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#0c121e"/><stop offset="1" stop-color="#121a2b"/></linearGradient>'
      + '<linearGradient id="' + uid + '-wallL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#18223a"/><stop offset="1" stop-color="#101827"/></linearGradient>'
      + '<linearGradient id="' + uid + '-wallR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#1a2540"/><stop offset="1" stop-color="#101827"/></linearGradient>'
      + '<linearGradient id="' + uid + '-metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a97b0"/><stop offset=".5" stop-color="#55627c"/><stop offset="1" stop-color="#3a455c"/></linearGradient>'
      + '<linearGradient id="' + uid + '-pcb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c2a44"/><stop offset="1" stop-color="#131e33"/></linearGradient>'
      + '<linearGradient id="' + uid + '-gpu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4762"/><stop offset=".55" stop-color="#232e45"/><stop offset="1" stop-color="#1a2336"/></linearGradient>'
      + '<linearGradient id="' + uid + '-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bfe8ff" stop-opacity=".10"/><stop offset=".35" stop-color="#bfe8ff" stop-opacity=".02"/><stop offset="1" stop-color="#bfe8ff" stop-opacity=".06"/></linearGradient>'
      + '<filter id="' + uid + '-sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity=".55"/></filter>'
      + fanSymbol(uid)
      + '</defs>';

    // ---- ケース（外枠・奥行きのある内壁・背面板） ----
    var caseBody = '';
    if (!noCase) {
      caseBody += rect('feet', ox + 18, oy + oh - 2, 34, 7, 3) + rect('feet', ox + ow - 52, oy + oh - 2, 34, 7, 3);
      caseBody += rect('bezel', ox + ow - 4, oy + 8, 11, oh - 16, 4); // 前面パネルの厚み（右が前面）
      caseBody += '<rect class="shell" x="' + ox + '" y="' + oy + '" width="' + ow + '" height="' + oh + '" rx="14" fill="url(#' + uid + '-shell)"/>';
    } else {
      caseBody += '<rect class="shell-ghost" x="' + ox + '" y="' + oy + '" width="' + ow + '" height="' + oh + '" rx="14"/>';
    }
    var a = 4; // 外枠の内側
    var X0 = ox + a, Y0 = oy + a, X1 = ox + ow - a, Y1 = oy + oh - a;
    function poly(cls, pts, fill) { return '<polygon class="' + cls + '" points="' + pts.map(function (q) { return f1(q[0]) + ',' + f1(q[1]); }).join(' ') + '"' + (fill ? ' fill="url(#' + uid + '-' + fill + ')"' : '') + '/>'; }
    caseBody += poly('wall', [[X0, Y0], [X1, Y0], [ix + iw, iy], [ix, iy]], noCase ? '' : 'wallT')
      + poly('wall', [[X0, Y1], [X1, Y1], [ix + iw, iy + ih], [ix, iy + ih]], noCase ? '' : 'wallB')
      + poly('wall', [[X0, Y0], [ix, iy], [ix, iy + ih], [X0, Y1]], noCase ? '' : 'wallL')
      + poly('wall', [[X1, Y0], [ix + iw, iy], [ix + iw, iy + ih], [X1, Y1]], noCase ? '' : 'wallR');
    caseBody += '<rect class="backplate" x="' + ix + '" y="' + iy + '" width="' + iw + '" height="' + ih + '" rx="3"' + (noCase ? '' : ' fill="url(#' + uid + '-back)"') + '/>';
    // 配線穴（背面板の飾り。どのケースにもある汎用的な形）
    if (!noCase && shape !== 'itx') {
      for (var gr = 0; gr < 3; gr++) caseBody += rect('grommet', mbX + mbW + 8, mbY + 18 + gr * (mbH / 3.2), 7, mbH / 5, 3);
    }
    s += '<g class="pp pp-case' + (noCase ? ' is-ghost' : ' is-sel') + (focus === 'case' ? ' is-focus' : '') + (fresh['case'] ? ' is-new' : '') + '" data-goto="case"><title>' + esc('ケース：' + (noCase ? '未選択' : (names['case'] || '選択済み')) + '（クリックで選ぶ）') + '</title>' + caseBody + '</g>';
    anchors['case'] = [ox + ow / 2, oy - 2];

    // ---- 電源シュラウド（タワー型の下部） ----
    if (tower) {
      s += rect('shroud', ix, shroudY, iw, shroudH, 2) + '<line class="shroud-lip" x1="' + ix + '" y1="' + f1(shroudY) + '" x2="' + (ix + iw) + '" y2="' + f1(shroudY) + '"/>';
      for (var sv = 0; sv < 5; sv++) s += rect('vent', ix + iw * 0.5 + sv * 9, shroudY + 6, 5, shroudH * 0.32, 2);
    }

    // ---- マザーボード ----
    var mbBody = '';
    if (p.mb) {
      mbBody += '<rect class="mb' + (p.mbFits === false ? ' mb--ng' : '') + '" x="' + f1(mbX) + '" y="' + f1(mbY) + '" width="' + f1(mbW) + '" height="' + f1(mbH) + '" rx="3" fill="url(#' + uid + '-pcb)"/>';
      // 背面I/O・VRMヒートシンク・チップセット（汎用的な配置）
      mbBody += '<rect class="metal" x="' + f1(mbX + 2) + '" y="' + f1(mbY + 5) + '" width="' + f1(13 * kk) + '" height="' + f1(Math.min(mbH * 0.36, 74 * kk)) + '" rx="2" fill="url(#' + uid + '-metal)"/>';
      mbBody += '<rect class="metal" x="' + f1(cx - 34 * kk) + '" y="' + f1(cy - 40 * kk) + '" width="' + f1(58 * kk) + '" height="' + f1(9 * kk) + '" rx="2" fill="url(#' + uid + '-metal)"/>';
      mbBody += '<rect class="metal" x="' + f1(cx - 42 * kk) + '" y="' + f1(cy - 31 * kk) + '" width="' + f1(9 * kk) + '" height="' + f1(52 * kk) + '" rx="2" fill="url(#' + uid + '-metal)"/>';
      if (!small) mbBody += rect('chipset', mbX + mbW * 0.7, mbY + mbH * 0.8, 20 * kk, 18 * kk, 3);
      mbBody += rect('trace', mbX + mbW * 0.12, mbY + mbH * 0.42, mbW * 0.5, 1.2, 0) + rect('trace', mbX + mbW * 0.18, mbY + mbH * 0.45, mbW * 0.36, 1.2, 0);
      if (p.mbFits === false) mbBody += txt('over-t', mbX + mbW / 2, mbY + mbH - 6, (p.mbForm || '') + 'はこのケースに入りません', 'middle');
    } else {
      mbBody += rect('ghost', mbX, mbY, mbW, mbH, 4) + txt('ghost-t', mbX + mbW / 2, mbY + mbH * 0.44, 'マザーボード', 'middle');
    }
    // PCIeスロット（x16 と下の空きスロット）
    var extraSlots = p.mb && isNum(p.pcieSlots) ? Math.max(0, Math.min(3, p.pcieSlots - 1)) : 2;
    mbBody += rect('slot', mbX + mbW * 0.1, slotY - 1.5, mbW * 0.68, 4, 1);
    for (var es = 1; es <= extraSlots; es++) {
      var ey = slotY + es * 21 * kk;
      if (ey < mbY + mbH - 8) mbBody += rect('slot slot--sub', mbX + mbW * 0.1, ey - 1.5, mbW * (es % 2 ? 0.25 : 0.68), 3.5, 1);
    }
    s += g('motherboard', !!p.mb, mbBody);
    anchors.motherboard = [mbX + mbW * 0.78, mbY + mbH * 0.45];

    // ---- メモリ（スロット数・枚数） ----
    var slots = p.mb && isNum(p.memSlots) ? Math.max(1, Math.min(4, p.memSlots)) : 4;
    var ram = Math.min(slots, Math.max(0, p.ramModules || 0));
    var ramLen = Math.min(133 * k, mbH * 0.55), rx0 = cx + 34 * kk, rsp = 7 * kk, ramTop = cy - ramLen / 2;
    var ramBody = '';
    for (var ri = 0; ri < slots; ri++) {
      var rxx = rx0 + ri * rsp;
      if (ri < ram) ramBody += rect('ram', rxx, ramTop, 4.6 * kk, ramLen, 1.5) + rect('ram-top', rxx, ramTop, 4.6 * kk, 5, 1.5);
      else ramBody += rect(ram ? 'ram-empty' : 'ghost', rxx + 1, ramTop + 3, 2.6 * kk, ramLen - 6, 1);
    }
    if (!ram) ramBody += txt('ghost-t', rx0 + slots * rsp + 3, ramTop + ramLen / 2, 'メモリ');
    s += g('memory', ram > 0, ramBody);
    anchors.memory = [rx0 + slots * rsp / 2, ramTop];

    // ---- M.2 SSD（1枚目はCPUとGPUの間、2枚目以降はGPUの下） ----
    var gpuThick = p.gpu ? Math.max(20, Math.min(46, (isNum(p.gpuSlots) ? p.gpuSlots : 2.5) * 20.3 * k)) : 30 * kk;
    var m2n = Math.min(3, Math.max(0, p.m2 || 0));
    var sataN = Math.min(4, Math.max(0, p.sata || 0));
    var stoBody = '';
    var m2W = 80 * k * 0.72, m2Pos = [[mbX + mbW * 0.2, slotY - 13 * kk], [mbX + mbW * 0.42, slotY + gpuThick + 9 * kk], [mbX + mbW * 0.42, slotY + gpuThick + 21 * kk]];
    for (var mi = 0; mi < Math.max(1, m2n); mi++) {
      var mp = m2Pos[mi];
      if (mp[1] > mbY + mbH - 5 && p.mb) continue;
      stoBody += mi < m2n ? rect('m2', mp[0], mp[1], m2W, 6.5 * kk, 1.5) + rect('m2-chip', mp[0] + m2W * 0.18, mp[1] + 1.5, m2W * 0.3, 3.5 * kk, 1) + rect('m2-chip', mp[0] + m2W * 0.56, mp[1] + 1.5, m2W * 0.24, 3.5 * kk, 1)
        : rect('ghost', mp[0], mp[1], m2W, 6.5 * kk, 1.5) + txt('ghost-t', mp[0] + m2W + 4, mp[1] + 6, 'SSD');
    }
    anchors.storage = [m2Pos[0][0] + m2W / 2, m2Pos[0][1]];

    // ---- 電源 ----
    var psuBody = '';
    var psuForm = /SFX/.test(p.psuForm || '') ? 'SFX' : 'ATX';
    var psuDepth = isNum(p.psuDepthMm) ? p.psuDepthMm : (psuForm === 'SFX' ? 100 : 150);
    var psuX, psuY, psuW, psuH;
    if (tower) {
      psuH = Math.min(shroudH - 10, (psuForm === 'SFX' ? 64 : 86) * k * 0.82);
      psuW = Math.min(iw * 0.6, psuDepth * k * 0.95);
      psuX = ix + 6; psuY = iy + ih - psuH - 5;
    } else if (shape === 'itx') {
      psuW = Math.min(iw * 0.4, psuDepth * k * 0.75); psuH = 64 * k * 0.6;
      psuX = ix + iw - psuW - 6; psuY = iy + ih - psuH - 6;
    } else { // デュアルチャンバー：電源はマザーボードの裏側の部屋（見えない）
      psuW = 112; psuH = 28; psuX = ix + iw - frontZ - psuW - 4; psuY = iy + ih - bottomZ - psuH - 6;
    }
    var hidden = shape === 'dual';
    if (p.psu) {
      psuBody += '<rect class="psu' + (hidden ? ' psu--behind' : '') + '" x="' + f1(psuX) + '" y="' + f1(psuY) + '" width="' + f1(psuW) + '" height="' + f1(psuH) + '" rx="3"' + (hidden ? '' : ' fill="url(#' + uid + '-gpu)"') + '/>';
      if (!hidden) for (var pv = 0; pv < 4; pv++) psuBody += rect('psu-vent', psuX + psuW - 22 + pv * 4.5, psuY + 5, 2.2, psuH - 10, 1);
      psuBody += txt('pv-t', psuX + 7, psuY + psuH / 2 + 3.5, (hidden ? '電源（裏側）' : '電源') + (isNum(p.psuW) ? ' ' + p.psuW + 'W' : ''));
    } else {
      psuBody += rect('ghost', psuX, psuY, psuW, psuH, 3) + txt('ghost-t', psuX + 7, psuY + psuH / 2 + 3.5, hidden ? '電源（裏側）' : '電源');
    }
    s += g('psu', !!p.psu, psuBody);
    anchors.psu = [psuX + psuW / 2, psuY];

    // ---- SATAストレージ（ドライブケージ。デュアル・小型は裏側扱い） ----
    if (sataN) {
      var cageX = tower ? ix + iw - 66 : ix + 10, cageY = tower ? shroudY + 8 : iy + ih - bottomZ - 12;
      for (var si = 0; si < sataN; si++) {
        var hdd = (p.sataKinds || [])[si] === 'hdd';
        var bh = hdd ? 9 : 6, by = tower ? cageY + si * 11 : cageY - si * 10;
        if (tower && by + bh > iy + ih - 3) break;
        stoBody += rect(hdd ? 'hdd' : 'sata', cageX, by, hdd ? 40 : 32, bh, 1.5);
      }
    }
    s += g('storage', m2n + sataN > 0, stoBody);

    // ---- CPU・クーラー ----
    var coolBody = '', cpuBody = '';
    var sock = 26 * kk;
    if (p.cpu) cpuBody += rect('cpu', cx - sock / 2, cy - sock / 2, sock, sock, 3) + rect('cpu-ihs', cx - sock * 0.36, cy - sock * 0.36, sock * 0.72, sock * 0.72, 2) + txt('cpu-t', cx, cy + 3, 'CPU', 'middle');
    else cpuBody += rect('ghost', cx - sock / 2, cy - sock / 2, sock, sock, 3) + txt('ghost-t', cx, cy + 3, 'CPU', 'middle');
    s += g('cpu', !!p.cpu, cpuBody);
    anchors.cpu = [cx, cy - sock / 2];

    var radInfo = null;
    if (p.cooler === 'air') {
      var hw = 50 * kk, hh = 62 * kk, hx = cx - hw / 2 - 4 * kk, hy = cy - hh / 2;
      coolBody += '<path class="pipe" d="M' + f1(hx + hw * 0.25) + ',' + f1(hy + 2) + 'q0,-9 7,-9t7,9M' + f1(hx + hw * 0.55) + ',' + f1(hy + 2) + 'q0,-9 7,-9t7,9"/>';
      coolBody += '<rect class="sink" x="' + f1(hx) + '" y="' + f1(hy) + '" width="' + f1(hw) + '" height="' + f1(hh) + '" rx="3" fill="url(#' + uid + '-metal)"/>';
      for (var fi = hy + 4; fi < hy + hh - 2; fi += 3.4) coolBody += '<line class="fin" x1="' + f1(hx + 2) + '" y1="' + f1(fi) + '" x2="' + f1(hx + hw - 2) + '" y2="' + f1(fi) + '"/>';
      coolBody += rect('fan-frame', hx + hw + 1, hy + 1, 9 * kk, hh - 2, 2) + fanUse(uid, 'fan fan--cool', hx + hw + 5.5 * kk, cy, hh * 0.92, 0.26, 1);
      anchors.cooler = [cx, hy - 10];
    } else if (p.cooler === 'aio') {
      var rmm = isNum(p.radMm) ? p.radMm : 240;
      var nFans = rmm >= 360 ? 3 : (rmm >= 240 ? 2 : 1);
      var pos = radMount(p.radMounts, rmm, shape).draw;
      radInfo = { pos: pos, mm: rmm, fans: nFans };
      var pump = 30 * kk;
      coolBody += rect('pump', cx - pump / 2, cy - pump / 2, pump, pump, 7) + '<circle class="pump-ring" cx="' + f1(cx) + '" cy="' + f1(cy) + '" r="' + f1(pump * 0.3) + '"/>';
      var horiz = pos === 'top' || pos === 'bottom';
      var runMax = horiz ? iw - (pos === 'top' ? frontZ : 0) - 34 : (tower ? shroudY : iy + ih - bottomZ) - iy - 22;
      var L = Math.min(runMax, rmm * (horiz ? 0.56 : 0.6) * Math.min(1, kk));
      var rxA, ryA, rwA, rhA, fsx, fsy, fanD = L / nFans;
      if (pos === 'top') { rxA = ix + 30; ryA = iy + 2; rwA = L; rhA = 9; }
      else if (pos === 'bottom') { rxA = ix + 26; ryA = iy + ih - 11; rwA = L; rhA = 9; }
      else { rxA = ix + iw - 12; ryA = iy + 14; rwA = 9; rhA = L; }
      // ホース（ポンプ → ラジエーターの端）
      var endX = horiz ? rxA + rwA - 12 : rxA, endY = horiz ? (pos === 'top' ? ryA + rhA : ryA) : ryA + 14;
      coolBody += '<path class="hose" d="M' + f1(cx + pump * 0.2) + ',' + f1(cy - pump / 2) + 'C' + f1(cx + 40) + ',' + f1(cy - 60) + ' ' + f1(endX - 30) + ',' + f1(endY + 50) + ' ' + f1(endX) + ',' + f1(endY) + '"/>'
        + '<path class="hose" d="M' + f1(cx + pump * 0.45) + ',' + f1(cy - pump * 0.2) + 'C' + f1(cx + 60) + ',' + f1(cy - 40) + ' ' + f1(endX - 14) + ',' + f1(endY + 60) + ' ' + f1(endX + (horiz ? 8 : 0)) + ',' + f1(endY + (horiz ? 0 : 10)) + '"/>';
      coolBody += '<rect class="rad" x="' + f1(rxA) + '" y="' + f1(ryA) + '" width="' + f1(rwA) + '" height="' + f1(rhA) + '" rx="2" fill="url(#' + uid + '-metal)"/>';
      for (var hi = 0; hi < (horiz ? rwA : rhA); hi += 3) {
        coolBody += horiz ? '<line class="fin" x1="' + f1(rxA + hi) + '" y1="' + f1(ryA + 1) + '" x2="' + f1(rxA + hi) + '" y2="' + f1(ryA + rhA - 1) + '"/>'
          : '<line class="fin" x1="' + f1(rxA + 1) + '" y1="' + f1(ryA + hi) + '" x2="' + f1(rxA + rwA - 1) + '" y2="' + f1(ryA + hi) + '"/>';
      }
      for (var rf = 0; rf < nFans; rf++) {
        if (horiz) { fsx = 1; fsy = 0.3; coolBody += fanUse(uid, 'fan fan--cool', rxA + fanD * (rf + 0.5), pos === 'top' ? ryA + rhA + 6 : ryA - 6, fanD * 0.92, fsx, fsy); }
        else { fsx = 0.3; fsy = 1; coolBody += fanUse(uid, 'fan fan--cool', rxA - 6, ryA + fanD * (rf + 0.5), fanD * 0.92, fsx, fsy); }
      }
      anchors.cooler = horiz ? [rxA + rwA / 2, ryA + (pos === 'top' ? rhA + 14 : -14)] : [rxA - 20, ryA + rhA / 2];
    } else if (p.boxCooler) {
      coolBody += '<circle class="ghost ghost--box" cx="' + f1(cx) + '" cy="' + f1(cy) + '" r="' + f1(21 * kk) + '"/>' + txt('ghost-t', cx, cy + 25 * kk + 8, '付属クーラー', 'middle');
      anchors.cooler = [cx, cy - 21 * kk];
    } else {
      coolBody += '<rect class="ghost" x="' + f1(cx - 25 * kk) + '" y="' + f1(cy - 31 * kk) + '" width="' + f1(50 * kk) + '" height="' + f1(62 * kk) + '" rx="4"/>' + txt('ghost-t', cx, cy + 31 * kk - 4, 'クーラー', 'middle');
      anchors.cooler = [cx, cy - 31 * kk];
    }
    s += g('cooler', p.cooler === 'air' || p.cooler === 'aio', coolBody);

    // ---- ケースファン（付属＋追加。前面→背面→天面 の順に並べる。位置はイメージ） ----
    var incl = isNum(p.caseFans) ? p.caseFans : 0, added = Math.max(0, p.fans || 0);
    var spots = [];
    var fanD2 = Math.min(46, Math.max(34, (p.fanMm === 140 ? 140 : 120) * k * 0.42));
    var radBlocks = radInfo ? radInfo.pos : '';
    function addCol(x, y0, y1, n, sx, sy) { var step = fanD2 + 6; for (var q = 0; q < n && y0 + step * q + fanD2 / 2 < y1; q++) spots.push([x, y0 + step * q + fanD2 / 2, sx, sy]); }
    function addRow(y, x0, x1, n, sx, sy) { var step = fanD2 + 8; for (var q = 0; q < n && x0 + step * q + fanD2 / 2 < x1; q++) spots.push([x0 + step * q + fanD2 / 2, y, sx, sy]); }
    if (tower) {
      if (radBlocks !== 'front') addCol(ix + iw - frontZ / 2, iy + 22, shroudY, shape === 'matx' ? 2 : 3, 0.42, 1);
      spots.push([ix + 6, mbY + 34 * kk, 0.36, 0.9]);
      if (radBlocks !== 'top') addRow(iy + 7, ix + 44, ix + iw - frontZ - 4, 2, 0.95, 0.32);
    } else if (shape === 'dual') {
      addRow(iy + ih - bottomZ / 2, ix + 22, ix + iw - frontZ - 6, radBlocks === 'bottom' ? 0 : 3, 0.95, 0.32);
      if (radBlocks !== 'side') addCol(ix + iw - frontZ / 2, iy + 20, iy + ih - 8, 3, 0.42, 1);
      spots.push([ix + 6, mbY + 34 * kk, 0.36, 0.9]);
      if (radBlocks !== 'top') addRow(iy + 7, ix + 44, ix + iw - frontZ - 4, 3, 0.95, 0.32);
    } else {
      addRow(iy + 7, ix + 30, ix + iw - 10, radBlocks === 'top' ? 0 : 2, 0.95, 0.32);
    }
    var fanBody = '';
    var totalFans = Math.min(spots.length, incl + added);
    for (var fsI = 0; fsI < totalFans; fsI++) {
      var sp = spots[fsI];
      fanBody += fanUse(uid, 'fan ' + (fsI < incl ? 'fan--inc' : 'fan--add'), sp[0], sp[1], fanD2, sp[2], sp[3]);
    }
    if (!totalFans && spots.length) {
      var gsp = spots[0];
      fanBody += '<ellipse class="ghost" cx="' + f1(gsp[0]) + '" cy="' + f1(gsp[1]) + '" rx="' + f1(fanD2 * gsp[2] / 2) + '" ry="' + f1(fanD2 * gsp[3] / 2) + '"/>';
    }
    s += g('fan', added > 0, fanBody, 'ケースファン：' + (added ? '追加 ' + added + '個' : '追加なし') + (isNum(p.caseFans) ? '・ケース付属 ' + p.caseFans + '個' : '') + '（クリックで選ぶ）');
    anchors.fan = spots[0] ? [spots[0][0], spots[0][1] - fanD2 * spots[0][3] / 2] : [ix + iw - 20, iy + 20];

    // ---- GPU（長さはケースの上限に対する比率。上限線を引く） ----
    var gpuBody = '';
    var rearX = ix + 2, limitX = ix + iw - frontZ - 2, span = limitX - rearX;
    var gy = slotY - 2;
    if (p.gpu) {
      var ratio = null, gl;
      if (isNum(p.gpuMm) && isNum(p.caseGpuMm) && p.caseGpuMm > 0) { ratio = p.gpuMm / p.caseGpuMm; gl = span * Math.min(1.08, ratio); }
      else if (isNum(p.gpuMm)) gl = Math.min(span, p.gpuMm * k * 0.85);
      else gl = span * 0.7;
      gl = Math.max(70, gl);
      var over = ratio != null && ratio > 1;
      var known = isNum(p.gpuFans) && p.gpuFans > 0;
      gpuBody += rect('bracket', rearX - 3, gy - 5, 5, gpuThick + 10, 1) + rect('pcie-gold', rearX + gl * 0.12, gy - 3.5, gl * 0.4, 3, 0);
      gpuBody += '<rect class="gpu' + (over ? ' gpu--over' : '') + (p.boardSel ? '' : ' gpu--generic') + '" x="' + f1(rearX + 2) + '" y="' + f1(gy) + '" width="' + f1(gl) + '" height="' + f1(gpuThick) + '" rx="5" fill="url(#' + uid + '-gpu)"/>';
      gpuBody += rect('gpu-plate', rearX + 4, gy + 1.5, gl - 4, 3, 1.5);
      var nf = known ? Math.min(3, p.gpuFans) : 2;
      var fd = Math.min(gpuThick * 0.86, (gl - 20) / nf - 6);
      for (var gf = 0; gf < nf; gf++) gpuBody += fanUse(uid, 'fan ' + (known ? 'fan--gpu' : 'fan--generic'), rearX + 12 + (gl - 18) * (gf + 0.5) / nf, gy + gpuThick / 2 + 1.5, fd, 1, 1);
      // 補助電源（グラボ製品のデータがあるときだけ）
      if (p.boardSel && (p.pin16 > 0 || p.pin8 > 0)) {
        var pcx = rearX + gl * 0.66;
        if (p.pin16 > 0) gpuBody += rect('conn conn--16', pcx, gy - 6, 14, 6, 1.5);
        else for (var pc = 0; pc < Math.min(3, p.pin8); pc++) gpuBody += rect('conn', pcx + pc * 13, gy - 6, 11, 6, 1.5);
      }
      if (isNum(p.caseGpuMm)) {
        gpuBody += '<line class="limit' + (over ? ' limit--over' : '') + '" x1="' + f1(limitX) + '" y1="' + f1(gy - 24) + '" x2="' + f1(limitX) + '" y2="' + f1(gy + gpuThick + 8) + '"/>'
          + txt('limit-t' + (over ? ' limit-t--over' : ''), limitX - 3, gy - 15, 'GPU上限 ' + p.caseGpuMm + 'mm', 'end');
      }
      if (over) gpuBody += txt('over-t', rearX + gl / 2, gy + gpuThick + 13, 'ケースの上限を超えています', 'middle');
    } else {
      gpuBody += rect('ghost', rearX + 2, gy, span * 0.7, gpuThick, 5) + txt('ghost-t', rearX + 12, gy + gpuThick / 2 + 3.5, p.igpu ? 'GPUなし（内蔵GPUで映像出力）' : 'GPU');
    }
    s += g('gpu', !!p.gpu, gpuBody);
    anchors.gpu = [rearX + span * 0.35, gy];
    anchors.gpuboard = anchors.gpu;

    // ---- 拡張カード（GPUの下のスロット） ----
    // 未選択のときは、選んでいる最中（focus）だけ点線で場所を示す（ふだんは絵をごちゃつかせない）
    var exY = slotY + gpuThick + 18 * kk;
    if (p.expansion) s += g('expansion', true, rect('bracket', rearX - 3, exY - 3, 5, 18, 1) + rect('exp', rearX + 2, exY, 52 * kk, 13, 3));
    else if (focus === 'expansion') s += g('expansion', false, rect('ghost', rearX + 2, exY, 52 * kk, 13, 3) + txt('ghost-t', rearX + 58 * kk, exY + 10, '拡張カード'));
    anchors.expansion = [rearX + 26 * kk, exY];

    // ---- ガラスのサイドパネル（反射は固定。操作を邪魔しない） ----
    if (!noCase) {
      s += '<g class="glass" aria-hidden="true"><rect x="' + (X0 + 1) + '" y="' + (Y0 + 1) + '" width="' + (X1 - X0 - 2) + '" height="' + (Y1 - Y0 - 2) + '" rx="11" fill="url(#' + uid + '-glass)"/>'
        + '<polygon class="glare" points="' + f1(X0 + ow * 0.18) + ',' + f1(Y0 + 2) + ' ' + f1(X0 + ow * 0.3) + ',' + f1(Y0 + 2) + ' ' + f1(X0 + 2) + ',' + f1(Y0 + oh * 0.4) + ' ' + f1(X0 + 2) + ',' + f1(Y0 + oh * 0.24) + '"/>'
        + '<polygon class="glare glare--thin" points="' + f1(X0 + ow * 0.36) + ',' + f1(Y0 + 2) + ' ' + f1(X0 + ow * 0.39) + ',' + f1(Y0 + 2) + ' ' + f1(X0 + 2) + ',' + f1(Y0 + oh * 0.52) + ' ' + f1(X0 + 2) + ',' + f1(Y0 + oh * 0.48) + '"/></g>';
    } else {
      s += txt('ghost-t ghost-t--case', ox + ow / 2, oy + oh + 0 - 6, 'ケース未選択（形はイメージ）', 'middle');
    }

    // ---- 選んでいるカテゴリの吹き出し（場所を覚える手助け） ----
    var fk = focus === 'gpuboard' ? 'gpuboard' : focus;
    if (fk && anchors[fk]) {
      var lab = PV_LABEL[fk] + 'はここ';
      var lw = lab.length * 10.5 + 16, ax = Math.max(8 + lw / 2, Math.min(392 - lw / 2, anchors[fk][0])), ay = Math.max(20, anchors[fk][1] - 8);
      s += '<g class="pv-callout" aria-hidden="true"><path d="M' + f1(ax - 5) + ',' + f1(ay - 1) + 'L' + f1(ax) + ',' + f1(ay + 5) + 'L' + f1(ax + 5) + ',' + f1(ay - 1) + 'Z"/>'
        + '<rect x="' + f1(ax - lw / 2) + '" y="' + f1(ay - 19) + '" width="' + f1(lw) + '" height="19" rx="9.5"/>' + txt('pv-callout-t', ax, ay - 5.5, lab, 'middle') + '</g>';
    }
    s += '</svg>';
    return s;
  }

  global.SippoPBCharts = { radar: radar, bars: bars, stack: stack, preview: preview, radMount: radMount, esc: esc, _radarPaths: radarPaths };
  if (typeof module === 'object' && module.exports) module.exports = global.SippoPBCharts;
})(typeof window !== 'undefined' ? window : this);
