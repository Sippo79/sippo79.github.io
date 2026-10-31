/* =====================================================================
 *  Sippo PC BUILDER  グラフ描画 (pb-charts.js)
 *  ---------------------------------------------------------------------
 *  外部ライブラリを使わず SVG / HTML で描く。
 *   - radar()   … 5角形グラフ（構成A・Bの重ね描き、アニメーション付き）
 *   - bars()    … 横棒グラフ（A/B比較、目盛りマーカー付き）
 *   - stack()   … 積み上げ棒（価格内訳・消費電力）
 *   - preview() … PC外観の模式図（実物の外観ではない）
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
   *  PC外観の模式図（2D）。実物の外観・寸法比とは異なる「イメージ」。
   *  ケースの形（ミドルタワー / デュアルチャンバー / Mini-ITX / mATX）、
   *  マザーボードの大きさ、GPUの長さ（ケース上限に対する比率）、
   *  クーラーの種類、ファン数、ストレージ数で絵が変わる。
   * ------------------------------------------------------------ */
  function preview(p) {
    var shape = p.caseShape || 'none';
    var W = 300, H = 250;
    var box = { mid: [60, 14, 180, 222], dual: [30, 40, 240, 180], itx: [70, 70, 160, 110], matx: [55, 50, 190, 160], none: [60, 14, 180, 222] }[shape] || [60, 14, 180, 222];
    var x = box[0], y = box[1], w = box[2], h = box[3];
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="選んだ構成の模式図（イメージ）">';
    s += '<rect class="' + (shape === 'none' ? 'ghost' : 'case-shell') + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="10"/>';
    if (shape !== 'none') s += '<rect class="case-glass" x="' + (x + 8) + '" y="' + (y + 8) + '" width="' + (w - 16) + '" height="' + (h - 16) + '" rx="6"/>';
    // PSU（下部）
    var psuH = shape === 'itx' ? 0 : 34;
    if (psuH) s += '<rect class="' + (p.psu ? 'psu' : 'ghost') + '" x="' + (x + 12) + '" y="' + (y + h - psuH - 10) + '" width="' + (w * 0.42) + '" height="' + psuH + '" rx="4"/>'
      + '<text x="' + (x + 18) + '" y="' + (y + h - 22) + '">' + (p.psu ? 'PSU ' + esc(p.psuW ? p.psuW + 'W' : '') : '電源') + '</text>';
    // マザーボード
    var ffScale = { 'E-ATX': 1, 'ATX': 0.92, 'Micro-ATX': 0.72, 'Mini-ITX': 0.5 }[p.mbForm] || 0.85;
    var mbW = (w - 46) * ffScale, mbH = (h - psuH - 40) * (shape === 'itx' ? 0.9 : ffScale);
    var mbX = x + 18, mbY = y + 16;
    if (shape === 'dual') { mbW = (w * 0.55) * ffScale; mbH = (h - 40) * ffScale; }
    s += '<rect class="' + (p.mb ? 'mb' : 'ghost') + '" x="' + mbX + '" y="' + mbY + '" width="' + mbW.toFixed(1) + '" height="' + mbH.toFixed(1) + '" rx="4"/>';
    // CPUクーラー
    var cx = mbX + mbW * 0.5, cy = mbY + mbH * 0.28;
    if (p.cooler === 'aio') {
      s += '<rect class="cpu-cool" x="' + (cx - 12) + '" y="' + (cy - 12) + '" width="24" height="24" rx="5"/>';
      var radLen = Math.min(w - 30, (p.radMm || 240) / 360 * (w - 40));
      s += '<rect class="rad" x="' + (x + 14) + '" y="' + (y + 4) + '" width="' + radLen.toFixed(1) + '" height="10" rx="3"/>';
      s += '<text x="' + (x + 16) + '" y="' + (y + 28) + '">ラジエーター ' + esc(p.radMm || '') + 'mm</text>';
    } else if (p.cooler === 'air') {
      s += '<rect class="cpu-cool" x="' + (cx - 16) + '" y="' + (cy - 20) + '" width="32" height="40" rx="4"/>';
      s += '<circle class="fan" cx="' + cx + '" cy="' + cy + '" r="11"/>';
    } else {
      s += '<rect class="ghost" x="' + (cx - 12) + '" y="' + (cy - 12) + '" width="24" height="24" rx="4"/><text x="' + (cx - 10) + '" y="' + (cy + 4) + '">CPU</text>';
    }
    // メモリ
    var ram = Math.min(4, p.ramModules || 0);
    for (var i = 0; i < 4; i++) {
      s += '<rect class="' + (i < ram ? 'ram' : 'ghost') + '" x="' + (cx + 22 + i * 5) + '" y="' + (cy - 22) + '" width="3" height="40" rx="1"/>';
    }
    // GPU（ケース上限に対する長さの比率で描く）
    if (p.gpu) {
      var maxLen = w - 26;
      var ratio = isNum(p.gpuMm) && isNum(p.caseGpuMm) ? p.gpuMm / p.caseGpuMm : 0.75;
      var gl = Math.max(50, Math.min(maxLen * 1.08, maxLen * ratio));
      var gy = mbY + mbH * 0.62;
      s += '<rect class="' + (ratio > 1 ? 'gpu-over' : 'gpu') + '" x="' + (x + 12) + '" y="' + gy.toFixed(1) + '" width="' + gl.toFixed(1) + '" height="20" rx="4"/>';
      var gf = Math.min(3, p.gpuFans || 2);
      for (var f = 0; f < gf; f++) s += '<circle class="fan" cx="' + (x + 12 + gl * (f + 0.5) / gf).toFixed(1) + '" cy="' + (gy + 10).toFixed(1) + '" r="7"/>';
      s += '<text x="' + (x + 14) + '" y="' + (gy + 32).toFixed(1) + '">' + esc(p.gpuLabel || 'GPU') + (isNum(p.gpuMm) ? ' ' + p.gpuMm + 'mm' : '') + '</text>';
    } else {
      s += '<text x="' + (x + 14) + '" y="' + (mbY + mbH * 0.7).toFixed(1) + '">' + (p.igpu ? '内蔵GPUで映像出力' : 'GPU未選択') + '</text>';
    }
    // 前面ファン
    var fans = Math.min(4, (p.fans || 0) + (p.caseFans || 0));
    for (var k = 0; k < fans; k++) {
      var fx = x + w - 18, fy = y + 30 + k * 34;
      if (fy < y + h - 20) s += '<circle class="fan" cx="' + fx + '" cy="' + fy + '" r="12"/>';
    }
    // ストレージ
    var ss = Math.min(4, p.storage || 0);
    for (var j = 0; j < ss; j++) s += '<rect class="ssd" x="' + (mbX + 8 + j * 14) + '" y="' + (mbY + mbH - 12) + '" width="10" height="5" rx="1"/>';
    if (shape === 'none') s += '<text x="' + (x + 30) + '" y="' + (y + h / 2) + '">ケースを選ぶと形が変わります</text>';
    s += '</svg>';
    return s;
  }

  global.SippoPBCharts = { radar: radar, bars: bars, stack: stack, preview: preview, esc: esc, _radarPaths: radarPaths };
  if (typeof module === 'object' && module.exports) module.exports = global.SippoPBCharts;
})(typeof window !== 'undefined' ? window : this);
