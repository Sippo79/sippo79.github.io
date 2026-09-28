/* =====================================================================
 *  GPU型番アップグレード記事のレンダラー (gpu-article.js)
 *  ---------------------------------------------------------------------
 *  generate-pages.js から呼ばれ、articles-data.js の `gpuUpgrade` を持つ記事
 *  （例: /upgrade/rtx3060/）の本文を静的HTMLとして組み立てる。
 *  ブラウザでは読み込まない（生成時だけ動く Node モジュール）。
 *
 *  【★数値・記号の出どころ（最重要）】
 *   記事に出す ◎○△× ／「RTX 3060比 大・中・小」／CPUの釣り合い／推奨電源 は、
 *   すべて診断エンジン（upgrade-engine.js）から生成時に計算する。
 *   記事に手書きしないのは、診断結果と記事が食い違うと信用を失うため。
 *     - ◎○△×      … requiredGpuTier() と comfortLevel()（診断と同じ閾値）
 *     - RTX 3060比  … GPU_TIERS の比を GAIN の閾値で言葉にする（%は出さない。
 *                     GPU_TIERS はラフな相対値で、実測ベンチマークではないため）
 *     - CPUの釣り合い … judgeCpu()
 *     - 推奨電源・補助電源 … GPU_POWER_SPEC（NVIDIA / AMD 公式仕様）
 *   GPU名・VRAM・GPU GUIDE のURLは gpu-guide/gpus.json（GPUマスター）から引く。
 *   価格はHTMLに書かない（相場で変わるため。価格の目安は GPU GUIDE の各ページへ）。
 *
 *  【他のGPUへ展開するとき】
 *   articles-data.js に `gpuUpgrade: { from: 'rtx3070', ... }` を持つ記事を
 *   1件足すだけでよい。◎○△×・比較表・電源表・CPU表は from から自動で変わる。
 *   書く必要があるのは、判断フロー・強み弱み・候補の推薦理由などの文章だけ。
 *
 *  文章中の差し込み記法（数値を手書きさせないため）:
 *    {{psu:rtx5070}}   … 公式推奨電源(W)
 *    {{name:rtx5070}}  … 表示名（例: RTX 5070）
 * ===================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var E = require('./upgrade-engine.js');
var GPUS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'gpu-guide', 'gpus.json'), 'utf8'));

/* ------------------------------------------------------------------ */
/*  基本ユーティリティ                                                  */
/* ------------------------------------------------------------------ */

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** エンジンID（rtx5060ti）→ gpus.json のエントリ（id: rtx-5060-ti） */
function guideEntry(engineId) {
  for (var i = 0; i < GPUS.length; i++) {
    if (GPUS[i].id.replace(/-/g, '') === engineId) return GPUS[i];
  }
  return null;
}

/** 表示名。gpus.json の正式名から GeForce / Radeon を落とした短い名前 */
function shortName(engineId) {
  var g = guideEntry(engineId);
  if (!g) throw new Error('gpus.json に無いGPUです: ' + engineId);
  return g.name.replace(/^(NVIDIA\s+)?GeForce\s+/, '').replace(/^(AMD\s+)?Radeon\s+/, '');
}

function guideUrl(engineId) {
  var g = guideEntry(engineId);
  return g ? '/gpu-guide/gpu/' + g.id + '/' : '';
}

function powerSpec(engineId) {
  var s = E.GPU_POWER_SPEC[engineId];
  if (!s) throw new Error('GPU_POWER_SPEC に公式値が無いGPUです: ' + engineId);
  return s;
}

/** 文章中の {{psu:id}} / {{name:id}} を差し込む */
function fill(text) {
  return String(text == null ? '' : text)
    .replace(/\{\{psu:([a-z0-9]+)\}\}/g, function (_, id) { return String(powerSpec(id).psu); })
    .replace(/\{\{name:([a-z0-9]+)\}\}/g, function (_, id) { return esc(shortName(id)); });
}

/* ------------------------------------------------------------------ */
/*  判定（すべて診断エンジンに委ねる）                                  */
/* ------------------------------------------------------------------ */

var LEVEL = {
  ideal:       { mark: '◎', word: '余裕あり' },
  recommended: { mark: '○', word: '十分' },
  comfortable: { mark: '△', word: '設定調整で遊べる' },
  short:       { mark: '×', word: '力不足' },
};

/** 解像度・fps・用途に対する、そのGPUの充足度（診断と同じ計算） */
function level(engineId, res, fps, usage) {
  var tier = E.GPU_TIERS[engineId];
  if (!tier) throw new Error('GPU_TIERS に無いGPUです: ' + engineId);
  var required = E.requiredGpuTier({ resolution: res, targetFps: fps, usage: usage });
  return E.comfortLevel(tier / required);
}

/**
 * 今のGPUからの伸びを言葉にする。
 * 閾値は診断エンジンの GAIN（pointless 1.15 / small 1.30 / worth 1.50）に揃える。
 * 1.9倍以上は affiliate-recommend.js の★4（はっきり違いを感じられる）と同じ線。
 */
var GAIN_LARGE = 1.9;
function gain(fromId, toId) {
  var r = E.GPU_TIERS[toId] / E.GPU_TIERS[fromId];
  if (r < E.GAIN.pointless) return { key: 'same', word: 'ほぼ同じ' };
  if (r < E.GAIN.small) return { key: 'small', word: '小' };
  if (r < E.GAIN.worth) return { key: 'mid', word: '中' };
  if (r < GAIN_LARGE) return { key: 'large', word: '大' };
  return { key: 'xl', word: '非常に大きい' };
}

var SCENARIOS = [
  { res: 'fhd',  fps: 60,  label: 'フルHD', sub: '60fps' },
  { res: 'fhd',  fps: 144, label: 'フルHD', sub: '144fps' },
  { res: 'wqhd', fps: 60,  label: 'WQHD',   sub: '60fps' },
  { res: 'wqhd', fps: 144, label: 'WQHD',   sub: '144fps' },
  { res: '4k',   fps: 60,  label: '4K',     sub: '60fps' },
];

/* ------------------------------------------------------------------ */
/*  部品                                                                */
/* ------------------------------------------------------------------ */

function markHtml(lv) {
  return '<span class="u-ga-mark u-ga-mark--' + lv + '" aria-hidden="true">' + LEVEL[lv].mark + '</span>'
    + '<span class="visually-hidden">' + LEVEL[lv].word + '</span>';
}

function sectionHead(label, id, title, lead) {
  return '        <div class="u-section__head">\n'
    + '          <p class="u-label">' + esc(label) + '</p>\n'
    + '          <h2 id="' + esc(id) + '-title">' + esc(title) + '</h2>\n'
    + (lead ? '          <p>' + fill(lead) + '</p>\n' : '')
    + '        </div>\n';
}

function section(id, alt, inner) {
  return '    <section class="u-section u-section--tight' + (alt ? ' u-section--alt' : '') + '" id="' + id + '"'
    + ' aria-labelledby="' + id + '-title">\n'
    + '      <div class="container">\n'
    + inner
    + '      </div>\n'
    + '    </section>\n';
}

/* ------------------------------------------------------------------ */
/*  1. ファーストビュー（H1・結論・解像度別の判定カード・診断CTA・目次）  */
/* ------------------------------------------------------------------ */

function renderHero(page) {
  var d = page.gpuUpgrade;
  var from = d.from;
  var fromName = shortName(from);

  var cards = SCENARIOS.map(function (s, i) {
    var normal = level(from, s.res, s.fps, 'normal');
    var light = level(from, s.res, s.fps, 'light');
    var heavy = level(from, s.res, s.fps, 'heavy');
    // 軽いゲームで評価が上がる場合は「○〜△」のように幅で見せる（ゲーム次第であることが伝わる）
    var markText = LEVEL[light].mark === LEVEL[normal].mark
      ? LEVEL[normal].mark
      : LEVEL[light].mark + '〜' + LEVEL[normal].mark;
    var word = d.verdictWords[normal];
    if (light !== normal && normal === 'comfortable') word = d.verdictWords.mixed;
    var hint = (d.scenarioHints || [])[i] || '';
    return '            <li class="u-ga-scn__item u-ga-scn__item--' + normal + '">\n'
      + '              <span class="u-ga-scn__cond">' + esc(s.label) + ' <span class="mono">' + esc(s.sub) + '</span></span>\n'
      + '              <span class="u-ga-scn__mark" aria-hidden="true">' + markText + '</span>\n'
      + '              <strong class="u-ga-scn__word">' + esc(word) + '</strong>\n'
      + '              <span class="u-ga-scn__sub">競技系 ' + LEVEL[light].mark + ' ／ 重量級 ' + LEVEL[heavy].mark + '</span>\n'
      + (hint ? '              <span class="u-ga-scn__hint">' + fill(hint) + '</span>\n' : '')
      + '            </li>\n';
  }).join('');

  var toc = (d.toc || []).map(function (t) {
    return '<li><a href="#' + esc(t.id) + '">' + esc(t.label) + '</a></li>';
  }).join('');

  return '    <section class="u-section u-section--tight u-ga-hero">\n'
    + '      <div class="container">\n'
    + '        <p class="u-label">' + esc(d.heroLabel) + '</p>\n'
    + '        <h1 class="u-ga-h1">' + esc(page.h1) + '</h1>\n'
    + '        <p class="u-ga-lead">' + fill(page.lead) + '</p>\n'
    + '\n'
    + '        <div class="u-ga-verdict" aria-labelledby="verdict-title">\n'
    + '          <div class="u-ga-verdict__head">\n'
    + '            <h2 id="verdict-title">' + esc(d.verdictTitle) + '</h2>\n'
    + '            <p>一般的な3Dゲームを標準〜高画質で遊ぶ場合の目安です。</p>\n'
    + '          </div>\n'
    + '          <ul class="u-ga-scn">\n'
    + cards
    + '          </ul>\n'
    + '          <p class="u-ga-legend">'
    + '<span>◎ 余裕あり</span><span>○ 十分</span><span>△ 設定調整で遊べる</span><span>× 力不足</span>'
    + '<span class="u-ga-legend__basis">判定は<a href="/upgrade/#diagnose">アップグレード診断</a>と同じ基準です（実測値ではありません）</span>'
    + '</p>\n'
    + '        </div>\n'
    + '\n'
    + '        <div class="u-ga-diag">\n'
    + '          <p class="u-ga-diag__text"><strong>あなたの環境では交換が必要？</strong>'
    + '今のCPU・電源・遊び方を入力すると、' + esc(fromName) + 'のままでよいか、交換するならどこまで必要かを判定します。'
    + '交換が不要なら「現状維持でOK」と表示します。</p>\n'
    + '          <div class="u-ga-diag__actions">\n'
    + '            <a class="u-btn u-btn--primary" href="/upgrade/#diagnose">アップグレード診断へ</a>\n'
    + '            <a class="u-ga-textlink" href="#candidates">先に交換候補を見る</a>\n'
    + '          </div>\n'
    + '        </div>\n'
    + (toc
      ? '        <nav class="u-ga-toc" aria-label="このページの目次">\n'
        + '          <p class="u-ga-toc__title">目次</p>\n'
        + '          <ol>' + toc + '</ol>\n'
        + '        </nav>\n'
      : '')
    + '      </div>\n'
    + '    </section>\n';
}

/* ------------------------------------------------------------------ */
/*  2. 30秒で判断（分岐フロー）                                          */
/* ------------------------------------------------------------------ */

function renderQuick(d) {
  var q = d.quick;
  var rows = q.rows.map(function (r) {
    return '          <li class="u-ga-flow__row u-ga-flow__row--' + esc(r.tone) + '">\n'
      + '            <span class="u-ga-flow__if">' + fill(r.when) + '</span>\n'
      + '            <span class="u-ga-flow__arrow" aria-hidden="true"></span>\n'
      + '            <span class="u-ga-flow__then"><strong>' + fill(r.then) + '</strong>'
      + (r.note ? '<small>' + fill(r.note) + '</small>' : '') + '</span>\n'
      + '          </li>\n';
  }).join('');
  return section('quick', false,
    sectionHead('QUICK CHECK', 'quick', q.title, q.lead)
    + '        <ol class="u-ga-flow">\n' + rows + '        </ol>\n'
    + (q.foot ? '        <p class="u-ga-foot">' + fill(q.foot) + '</p>\n' : ''));
}

/* ------------------------------------------------------------------ */
/*  3. 強み・弱み ＋ DLSS機能の対応表                                    */
/* ------------------------------------------------------------------ */

function renderProsCons(d) {
  var p = d.prosCons;
  function list(items) {
    return items.map(function (it) {
      return '              <li><strong>' + fill(it.title) + '</strong><span>' + fill(it.text) + '</span></li>\n';
    }).join('');
  }
  var features = p.features.map(function (f) {
    return '              <tr>\n'
      + '                <th scope="row">' + esc(f.name) + '<small>' + fill(f.desc) + '</small></th>\n'
      + '                <td class="' + (f.supported ? 'is-yes' : 'is-no') + '">'
      + (f.supported ? '<span aria-hidden="true">○</span> 使える' : '<span aria-hidden="true">―</span> 使えない') + '</td>\n'
      + '                <td>' + esc(f.from) + '</td>\n'
      + '              </tr>\n';
  }).join('');

  return section('proscons', true,
    sectionHead('STRENGTHS / WEAKNESSES', 'proscons', p.title, p.lead)
    + '        <div class="u-ga-pc">\n'
    + '          <div class="u-ga-pc__col u-ga-pc__col--pro">\n'
    + '            <h3>強み</h3>\n'
    + '            <ul>\n' + list(p.pros) + '            </ul>\n'
    + '          </div>\n'
    + '          <div class="u-ga-pc__col u-ga-pc__col--con">\n'
    + '            <h3>弱み</h3>\n'
    + '            <ul>\n' + list(p.cons) + '            </ul>\n'
    + '          </div>\n'
    + '        </div>\n'
    + '        <h3 class="u-ga-h3">' + esc(p.featureTitle) + '</h3>\n'
    + '        <p class="u-ga-text">' + fill(p.featureLead) + '</p>\n'
    + '        <div class="u-table-wrap">\n'
    + '          <table class="u-table u-ga-feat">\n'
    + '            <thead><tr><th scope="col">機能</th><th scope="col">' + esc(shortName(d.from)) + '</th><th scope="col">対応世代</th></tr></thead>\n'
    + '            <tbody>\n' + features + '            </tbody>\n'
    + '          </table>\n'
    + '        </div>\n'
    + '        <p class="u-ga-source">' + fill(p.featureSource) + '</p>\n'
    + (p.callout
      ? '        <div class="u-ga-callout">\n'
        + '          <p class="u-ga-callout__title">' + fill(p.callout.title) + '</p>\n'
        + '          <p>' + fill(p.callout.text) + '</p>\n'
        + '        </div>\n'
      : ''));
}

/* ------------------------------------------------------------------ */
/*  4. 交換候補（目的別）                                                */
/* ------------------------------------------------------------------ */

function gpuCard(from, c) {
  var g = guideEntry(c.id);
  var gn = gain(from, c.id);
  var spec = powerSpec(c.id);
  return '            <div class="u-ga-gpu">\n'
    + '              <div class="u-ga-gpu__top">\n'
    + '                <h4>' + esc(shortName(c.id)) + (c.variant ? ' <small>' + esc(c.variant) + '</small>' : '') + '</h4>\n'
    + '                <span class="u-ga-gain u-ga-gain--' + gn.key + '">' + esc(shortName(from)) + '比 <b>' + esc(gn.word) + '</b></span>\n'
    + '              </div>\n'
    + '              <ul class="u-ga-specs">\n'
    + '                <li>VRAM <b>' + esc(g.vram) + 'GB</b></li>\n'
    + '                <li>推奨電源 <b>' + spec.psu + 'W〜</b></li>\n'
    + '                <li>' + esc(g.brand === 'AMD' ? 'FSR' : 'DLSS') + '</li>\n'
    + '              </ul>\n'
    + '              <p class="u-ga-gpu__why">' + fill(c.why) + '</p>\n'
    + (c.caution ? '              <p class="u-ga-gpu__caution">' + fill(c.caution) + '</p>\n' : '')
    + '              <div class="u-ga-gpu__foot">\n'
    + '                <a class="u-ga-textlink" href="' + guideUrl(c.id) + '">GPU GUIDEで詳しく見る（価格の目安）</a>\n'
    + '                <details class="u-ga-shop">\n'
    + '                  <summary>ショップで価格を見る</summary>\n'
    + '                  <div class="u-ga-shop__body" data-upgrade-product="' + esc(c.product || c.id) + '"></div>\n'
    + '                </details>\n'
    + '              </div>\n'
    + '            </div>\n';
}

function renderCandidates(d) {
  var c = d.candidates;
  var groups = c.groups.map(function (grp, i) {
    return '          <article class="u-ga-group">\n'
      + '            <header class="u-ga-group__head">\n'
      + '              <span class="u-ga-group__no mono">' + String(i + 1).padStart(2, '0') + '</span>\n'
      + '              <div>\n'
      + '                <h3>' + esc(grp.title) + '</h3>\n'
      + '                <p>' + fill(grp.lead) + '</p>\n'
      + '              </div>\n'
      + '            </header>\n'
      + '            <div class="u-ga-gpus">\n'
      + grp.gpus.map(function (x) { return gpuCard(d.from, x); }).join('')
      + '            </div>\n'
      + '          </article>\n';
  }).join('');

  var avoid = c.avoid.map(function (a) {
    var gn = gain(d.from, a.id);
    return '            <li><strong>' + esc(shortName(a.id)) + '</strong>'
      + '<span class="u-ga-gain u-ga-gain--' + gn.key + '">' + esc(shortName(d.from)) + '比 <b>' + esc(gn.word) + '</b></span>'
      + '<span class="u-ga-avoid__why">' + fill(a.why) + '</span></li>\n';
  }).join('');

  return section('candidates', true,
    sectionHead('WHAT TO CHOOSE', 'candidates', c.title, c.lead)
    + '        <div class="u-ga-groups">\n' + groups + '        </div>\n'
    + '        <div class="u-ga-avoid">\n'
    + '          <h3>' + esc(c.avoidTitle) + '</h3>\n'
    + '          <p>' + fill(c.avoidLead) + '</p>\n'
    + '          <ul>\n' + avoid + '          </ul>\n'
    + '        </div>\n'
    + '        <p class="u-ga-foot">' + fill(c.foot) + '</p>\n');
}

/* ------------------------------------------------------------------ */
/*  5. 比較表（スマホではカード表示に切り替わる）                         */
/* ------------------------------------------------------------------ */

function renderCompare(d) {
  var t = d.compare;
  var ids = [d.from].concat(t.ids);
  var head = '<th scope="col">GPU</th><th scope="col">' + esc(shortName(d.from)) + '比</th><th scope="col">VRAM</th>'
    + SCENARIOS.map(function (s) {
      return '<th scope="col" class="u-ga-cmp__m">' + esc(s.label) + '<br><span class="mono">' + esc(s.sub) + '</span></th>';
    }).join('')
    + '<th scope="col">向いている人</th>';

  var rows = ids.map(function (id) {
    var isBase = id === d.from;
    var g = guideEntry(id);
    var gn = isBase ? null : gain(d.from, id);
    var marks = SCENARIOS.map(function (s) {
      var lv = level(id, s.res, s.fps, 'normal');
      // スマホのカード表示で見出しを2行にそろえる（改行は CSS の pre-line で効く）
      return '<td class="u-ga-cmp__m" data-label="' + esc(s.label + '&#10;' + s.sub).replace(/&amp;#10;/, '&#10;') + '">' + markHtml(lv) + '</td>';
    }).join('');
    return '              <tr' + (isBase ? ' class="is-base"' : '') + '>'
      + '<th scope="row"><a href="' + guideUrl(id) + '">' + esc(shortName(id)) + '</a>'
      + (isBase ? '<small>今のGPU</small>' : '') + '</th>'
      + '<td class="u-ga-cmp__gain" data-label="' + esc(shortName(d.from)) + '比">'
      + (isBase ? '基準' : '<span class="u-ga-gain u-ga-gain--' + gn.key + '"><b>' + esc(gn.word) + '</b></span>') + '</td>'
      + '<td class="u-ga-cmp__vram" data-label="VRAM">' + esc(g.vram) + 'GB</td>'
      + marks
      + '<td class="u-ga-cmp__for" data-label="向いている人">' + fill(t.suits[id] || '') + '</td>'
      + '</tr>\n';
  }).join('');

  return section('compare', false,
    sectionHead('COMPARE', 'compare', t.title, t.lead)
    + '        <div class="u-ga-cmp-wrap">\n'
    + '          <table class="u-ga-cmp">\n'
    + '            <caption class="visually-hidden">' + esc(t.title) + '</caption>\n'
    + '            <thead><tr>' + head + '</tr></thead>\n'
    + '            <tbody>\n' + rows + '            </tbody>\n'
    + '          </table>\n'
    + '        </div>\n'
    + '        <p class="u-ga-legend u-ga-legend--table">'
    + '<span>◎ 余裕あり</span><span>○ 十分</span><span>△ 設定調整で遊べる</span><span>× 力不足</span></p>\n'
    + '        <p class="u-ga-foot">' + fill(t.foot) + '</p>\n');
}

/* ------------------------------------------------------------------ */
/*  6. 交換しても速くならないケース（CPUボトルネック）                    */
/* ------------------------------------------------------------------ */

var CPU_WORD = {
  keep:     { cls: 'ok',   text: 'OK' },
  consider: { cls: 'warn', text: 'やや不足' },
  upgrade:  { cls: 'bad',  text: '不足' },
};

function renderBottleneck(d) {
  var b = d.bottleneck;
  var checks = b.checks.map(function (c) {
    return '          <li class="u-ga-check u-ga-check--' + esc(c.tone) + '">\n'
      + '            <span class="u-ga-check__if">' + fill(c.when) + '</span>\n'
      + '            <span class="u-ga-check__then">' + fill(c.then) + '</span>\n'
      + '          </li>\n';
  }).join('');

  var m = b.cpuMatrix;
  var head = '<th scope="col">今のCPU ＼ 交換先</th>' + m.gpus.map(function (g) {
    return '<th scope="col">' + esc(shortName(g)) + '</th>';
  }).join('');
  var rows = m.cpus.map(function (cpu) {
    return '              <tr><th scope="row">' + esc(cpu) + '</th>' + m.gpus.map(function (g) {
      var r = E.judgeCpu({ cpu: cpu, resolution: m.res, targetFps: m.fps }, { recommendId: g });
      var w = CPU_WORD[r.status];
      if (!w) throw new Error('CPUの判定結果を表にできません: ' + cpu + ' / ' + r.status);
      return '<td class="u-ga-cpu u-ga-cpu--' + w.cls + '">' + w.text + '</td>';
    }).join('') + '</tr>\n';
  }).join('');

  return section('bottleneck', true,
    sectionHead('BOTTLENECK', 'bottleneck', b.title, b.lead)
    + '        <div class="u-ga-2col">\n'
    + '          <div class="u-card">\n'
    + '            <h3 class="u-ga-h3">' + esc(b.whyTitle) + '</h3>\n'
    + b.why.map(function (p) { return '            <p class="u-ga-text">' + fill(p) + '</p>\n'; }).join('')
    + '          </div>\n'
    + '          <div class="u-card">\n'
    + '            <h3 class="u-ga-h3">' + esc(b.checkTitle) + '</h3>\n'
    + '            <p class="u-ga-text">' + fill(b.checkLead) + '</p>\n'
    + '            <ul class="u-ga-checks">\n' + checks + '            </ul>\n'
    + '            <p class="u-ga-note">' + fill(b.checkNote) + '</p>\n'
    + '          </div>\n'
    + '        </div>\n'
    + '        <h3 class="u-ga-h3">' + esc(m.title) + '</h3>\n'
    + '        <p class="u-ga-text">' + fill(m.lead) + '</p>\n'
    + '        <div class="u-table-wrap">\n'
    + '          <table class="u-table u-ga-cputable">\n'
    + '            <thead><tr>' + head + '</tr></thead>\n'
    + '            <tbody>\n' + rows + '            </tbody>\n'
    + '          </table>\n'
    + '        </div>\n'
    + '        <p class="u-ga-foot">' + fill(m.foot) + '</p>\n'
    + '        <ul class="u-ga-others">\n'
    + b.others.map(function (o) {
      return '          <li><strong>' + fill(o.title) + '</strong><span>' + fill(o.text) + '</span></li>\n';
    }).join('')
    + '        </ul>\n');
}

/* ------------------------------------------------------------------ */
/*  7. 電源                                                              */
/* ------------------------------------------------------------------ */

function renderPsu(d) {
  var p = d.psu;
  var ids = [d.from].concat(p.ids);
  var rows = ids.map(function (id) {
    var s = powerSpec(id);
    return '              <tr' + (id === d.from ? ' class="is-base"' : '') + '><th scope="row">' + esc(shortName(id))
      + (id === d.from ? '<small>今のGPU</small>' : '') + '</th>'
      + '<td class="mono">' + s.psu + 'W〜</td><td>' + esc(s.connector) + '</td></tr>\n';
  }).join('');

  return section('psu', false,
    sectionHead('POWER SUPPLY', 'psu', p.title, p.lead)
    + '        <ol class="u-ga-steps">\n'
    + p.checklist.map(function (c) {
      return '          <li><strong>' + fill(c.title) + '</strong><span>' + fill(c.text) + '</span></li>\n';
    }).join('')
    + '        </ol>\n'
    + '        <h3 class="u-ga-h3">' + esc(p.tableTitle) + '</h3>\n'
    + '        <div class="u-table-wrap">\n'
    + '          <table class="u-table u-ga-psutable">\n'
    + '            <thead><tr><th scope="col">GPU</th><th scope="col">メーカー推奨の電源容量</th><th scope="col">補助電源（リファレンス仕様）</th></tr></thead>\n'
    + '            <tbody>\n' + rows + '            </tbody>\n'
    + '          </table>\n'
    + '        </div>\n'
    + '        <p class="u-ga-source">' + fill(p.source) + '</p>\n'
    + '        <p class="u-ga-foot">' + fill(p.foot) + '</p>\n');
}

/* ------------------------------------------------------------------ */
/*  8. GPU交換 vs 買い替え                                               */
/* ------------------------------------------------------------------ */

function renderReplace(d) {
  var r = d.replace;
  function card(c, mod) {
    return '          <div class="u-ga-vs__card u-ga-vs__card--' + mod + '">\n'
      + '            <h3>' + esc(c.title) + '</h3>\n'
      + '            <ul>\n'
      + c.items.map(function (i) { return '              <li>' + fill(i) + '</li>\n'; }).join('')
      + '            </ul>\n'
      + '            <p>' + fill(c.foot) + '</p>\n'
      + '          </div>\n';
  }
  return section('replace', true,
    sectionHead('UPGRADE OR REPLACE', 'replace', r.title, r.lead)
    + '        <div class="u-ga-vs">\n'
    + card(r.upgrade, 'upgrade')
    + card(r.newPc, 'replace')
    + '        </div>\n'
    + '        <div class="u-ga-callout u-ga-callout--info">\n'
    + '          <p class="u-ga-callout__title">' + fill(r.rule.title) + '</p>\n'
    + '          <p>' + fill(r.rule.text) + '</p>\n'
    + '        </div>\n');
}

/* ------------------------------------------------------------------ */
/*  9. ゲームのタイプ別                                                  */
/* ------------------------------------------------------------------ */

function renderGames(d) {
  var g = d.games;
  var cards = g.types.map(function (t) {
    var names = t.titles.map(function (x) {
      return x.href ? '<a href="' + esc(x.href) + '">' + esc(x.name) + '</a>' : esc(x.name);
    }).join('、');
    return '          <div class="u-ga-game u-ga-game--' + esc(t.tone) + '">\n'
      + '            <div class="u-ga-game__top"><h3>' + esc(t.type) + '</h3><span class="u-ga-game__tag">' + esc(t.tag) + '</span></div>\n'
      + '            <p class="u-ga-game__titles">例：' + names + '</p>\n'
      + '            <p class="u-ga-text">' + fill(t.text) + '</p>\n'
      + '          </div>\n';
  }).join('');
  return section('games', false,
    sectionHead('BY GAME TYPE', 'games', g.title, g.lead)
    + '        <div class="u-ga-games">\n' + cards + '        </div>\n'
    + '        <p class="u-ga-foot">' + fill(g.foot) + '</p>\n');
}

/* ------------------------------------------------------------------ */
/*  まとめ                                                              */
/* ------------------------------------------------------------------ */

/** H1直下のファーストビュー */
function hero(page) {
  return renderHero(page);
}

/** 本文（FAQ・CTA・関連ページは generate-pages.js 側の共通部品を使う） */
function body(page) {
  var d = page.gpuUpgrade;
  return renderQuick(d)
    + renderProsCons(d)
    + renderCandidates(d)
    + renderCompare(d)
    + renderBottleneck(d)
    + renderPsu(d)
    + renderReplace(d)
    + renderGames(d);
}

module.exports = {
  hero: hero,
  body: body,
  fill: fill,
  // テスト用
  level: level,
  gain: gain,
  shortName: shortName,
  guideEntry: guideEntry,
  SCENARIOS: SCENARIOS,
  LEVEL: LEVEL,
};
