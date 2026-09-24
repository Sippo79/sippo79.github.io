/* =====================================================================
 *  PC BUILD CHECK 構成プロフィール・データ一元化テスト (test-build-profile.js)
 *  ---------------------------------------------------------------------
 *  実行: node pc-build-check/test-build-profile.js
 *
 *  【何を守るテストか】
 *   1. データの一元化
 *      - トップ（Sample Result / 人気構成 / 全構成一覧）が builds.json と一致している
 *        （以前は手書きで、75件中27件＋人気構成3件が旧GPUのまま残っていた）
 *      - 個別75ページの部品が builds.json と一致している
 *   2. build-profile.js の判定が75構成すべてで成立する
 *      - 得意分野・構成タイプ・理由が欠けない（マスターの欠落を検出）
 *      - ±5万円比較が同じ用途・解像度の実在構成だけを指し、最低/最高予算で片側になる
 *      - 3構成比較が常に実在構成で、今の構成を含む
 *      - 予算を上げてGPU性能が下がる「逆転」が無い
 *   3. ゲーム連携・こだわり条件・URL共有が壊れない
 *      - games.json の全ゲームで判定でき、リンク先ページが実在する
 *      - URLの不正な値は捨てられる
 * ===================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var DIR = __dirname;
var ROOT = path.resolve(DIR, '..');
var P = require('./build-profile.js');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^\uFEFF/, ''));
}

var builds = readJson('pc-build-check/builds.json');
var prices = readJson('shared/parts/part-prices.json');
var gpuList = readJson('gpu-guide/gpus.json');
var games = readJson('game-pc-guide/data/games.json');
var ctx = { prices: prices, gpuList: gpuList };
var indexHtml = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');

var pass = 0;
var failures = [];
function check(name, cond, detail) {
  if (cond) pass += 1;
  else failures.push(detail ? name + ' … ' + detail : name);
}

var BUDGETS = P.listBudgets(builds);
var USAGES = Object.keys(P.USAGE_LABELS);
var RESES = Object.keys(P.RES_LABELS);

/* ------------------------------------------------------------------
 *  0. マスターの揃い
 * ------------------------------------------------------------------ */
check('予算は5段階（10万〜30万円・5万円刻み）', BUDGETS.join(',') === '100000,150000,200000,250000,300000', BUDGETS.join(','));
check('75構成ある', builds.length === 75, String(builds.length));

var cpuNames = {};
builds.forEach(function (b) { cpuNames[b.cpu] = true; });
Object.keys(cpuNames).forEach(function (cpu) {
  var e = prices.cpu[cpu];
  check('CPUの仕様がpart-prices.jsonにある: ' + cpu,
    e && Number.isFinite(e.cores) && Number.isFinite(e.threads) && typeof e.x3d === 'boolean',
    JSON.stringify(e));
});

builds.forEach(function (b) {
  check('GPUがgpus.jsonにある: ' + b.gpu, Boolean(P.findGpu(b.gpu, gpuList)));
});

/* ------------------------------------------------------------------
 *  1. 全組み合わせで診断でき、判定が欠けない
 * ------------------------------------------------------------------ */
var slugs = {};
BUDGETS.forEach(function (bd) {
  USAGES.forEach(function (u) {
    RESES.forEach(function (r) {
      var label = bd / 10000 + '万/' + u + '/' + r;
      var b = P.findBuild(builds, String(bd), u, r);
      check('構成が存在する: ' + label, Boolean(b));
      if (!b) return;
      var a = P.analyze(b, ctx);
      slugs[a.slug] = (slugs[a.slug] || 0) + 1;
      check('参考価格が出る: ' + label, Boolean(a.priceText));
      check('得意分野が6項目: ' + label, a.strengths.length === 6, a.strengths.map(function (s) { return s.key; }).join(','));
      check('得意分野のレベルが1〜5: ' + label, a.strengths.every(function (s) { return s.level >= 1 && s.level <= 5 && s.text; }));
      check('構成タイプが1〜3個: ' + label, a.types.length >= 1 && a.types.length <= 3);
      check('主タイプ（GPU重視/CPU重視/バランス）が先頭: ' + label, ['gpu', 'cpu', 'balance'].indexOf(a.types[0] && a.types[0].key) > -1);
      check('理由がCPU/GPU/メモリ/SSDの4つ: ' + label, a.reasons.length === 4);
      check('理由に部品の実値が入る（メモリ）: ' + label, a.reasons.some(function (x) { return x.key === 'memory' && x.text.indexOf(String(a.ramGb)) > -1; }));
      check('静的ページが存在する: ' + a.slug, fs.existsSync(path.join(DIR, 'builds', a.slug + '.html')));
    });
  });
});
check('スラグが75件すべて一意', Object.keys(slugs).length === 75 && Object.keys(slugs).every(function (k) { return slugs[k] === 1; }));

/* ------------------------------------------------------------------
 *  2. ±5万円比較
 * ------------------------------------------------------------------ */
var identicalPairs = 0;
builds.forEach(function (b) {
  var a = P.analyze(b, ctx);
  var n = P.neighbors(builds, b);
  var bd = Number(b.budget);
  check('最低予算は下の比較なし: ' + a.slug, bd === BUDGETS[0] ? !n.down : Boolean(n.down));
  check('最高予算は上の比較なし: ' + a.slug, bd === BUDGETS[BUDGETS.length - 1] ? !n.up : Boolean(n.up));
  [['down', n.down, -1], ['up', n.up, 1]].forEach(function (x) {
    var other = x[1];
    if (!other) return;
    check('比較先は同じ用途・解像度・±5万円: ' + a.slug + ' ' + x[0],
      other.usage === b.usage && other.resolution === b.resolution && Number(other.budget) === bd + x[2] * P.BUDGET_STEP);
    var oa = P.analyze(other, ctx);
    var exp = x[0] === 'up' ? P.explainUp(a, oa) : P.explainDown(a, oa);
    check('比較の見出しと説明がある: ' + a.slug + ' ' + x[0], Boolean(exp.headline && exp.text));
    if (exp.diff.identical) identicalPairs += 1;
    else check('差分があるなら変更点が1つ以上: ' + a.slug + ' ' + x[0], exp.diff.changes.length > 0 && Boolean(exp.diff.main));
    if (x[0] === 'up') {
      check('予算を上げてGPU性能が下がらない: ' + a.slug, exp.diff.gpuPct === null || exp.diff.gpuPct >= 0, String(exp.diff.gpuPct));
    } else if (!exp.diff.identical) {
      check('下げる比較は妥協点を挙げる: ' + a.slug, exp.points.length > 0);
    }
  });
});
// 同じパーツの隣接構成（例: 4K FPS 20万と25万）は「同じです」と正直に出す。数の変化を検知する。
// 2026-09-24 に6組を解消。予算を5万円上げて何も変わらない組を作らない。
check('パーツが同じ隣接構成が無い', identicalPairs === 0, String(identicalPairs));

/* ------------------------------------------------------------------
 *  3. 3構成比較
 * ------------------------------------------------------------------ */
builds.forEach(function (b) {
  var t = P.trio(builds, b);
  var slug = P.slugOf(b);
  check('3構成そろう: ' + slug, t.length === 3);
  check('今の構成を含む: ' + slug, t.some(function (x) { return x.role === 'current' && P.slugOf(x.build) === slug; }));
  check('予算の昇順: ' + slug, t.every(function (x, i) { return i === 0 || Number(t[i - 1].build.budget) < Number(x.build.budget); }));
  check('同じ用途・解像度: ' + slug, t.every(function (x) { return x.build.usage === b.usage && x.build.resolution === b.resolution; }));
});

/* ------------------------------------------------------------------
 *  4. ゲーム連携（GAME PC GUIDE の games.json を再利用）
 * ------------------------------------------------------------------ */
games.forEach(function (g) {
  var file = path.join(ROOT, 'game-pc-guide', 'games', (g.slug || g.id) + '.html');
  check('ゲームページが実在する: ' + g.id, fs.existsSync(file), file);
  check('gameUrlがslugを使う: ' + g.id, P.gameUrl(g) === '/game-pc-guide/games/' + (g.slug || g.id) + '.html');
});
var gameChecks = 0;
builds.forEach(function (b) {
  var a = P.analyze(b, ctx);
  games.forEach(function (g) {
    var f = P.gameFit(a, g, gpuList);
    gameChecks += 1;
    if (!f) { failures.push('ゲーム判定できない: ' + a.slug + ' × ' + g.id); return; }
    if (['ok', 'partial', 'short'].indexOf(f.status) < 0 || !f.text) failures.push('ゲーム判定の形が不正: ' + a.slug + ' × ' + g.id);
    else pass += 1;
  });
});
check('ゲーム判定を全組み合わせで実行', gameChecks === builds.length * games.length);
// 目安: 30万円のRTX 5080構成は Cyberpunk の上位目安（RTX 5080）に届く
var top = P.analyze(P.findBySlug(builds, 'wqhd-fps-30man'), ctx);
var cyber = games.filter(function (g) { return g.id === 'cyberpunk2077'; })[0];
check('RTX 5080構成はCyberpunkの最上位目安に届く', P.gameFit(top, cyber, gpuList).next === null);

/* ------------------------------------------------------------------
 *  5. こだわり条件
 * ------------------------------------------------------------------ */
var prefKeys = P.PREFS.map(function (p) { return p.key; });
builds.forEach(function (b) {
  var a = P.analyze(b, ctx);
  var ev = P.evaluatePrefs(a, prefKeys);
  check('判定できる条件は true/false で返る: ' + a.slug, ev.every(function (x) { return x.ok === true || x.ok === false; }));
  prefKeys.filter(function (k) { return P.PREFS.filter(function (p) { return p.key === k; })[0].test; }).forEach(function (k) {
    var cand = P.findPrefCandidate(builds, a, [k], ctx);
    if (!cand) return;
    check('候補は条件を満たす: ' + a.slug + ' ' + k, P.evaluatePrefs(cand, [k])[0].ok === true);
    check('候補は同じ解像度・同予算か+5万円: ' + a.slug + ' ' + k,
      cand.resolution === a.resolution && (cand.budget === a.budget || cand.budget === a.budget + P.BUDGET_STEP));
  });
});
check('未知の条件は捨てる', P.sanitizePrefs(['nvidia', 'hack', 'nvidia']).join(',') === 'nvidia');

/* ------------------------------------------------------------------
 *  6. URL共有
 * ------------------------------------------------------------------ */
builds.forEach(function (b) {
  var q = P.toQuery({ budget: b.budget, usage: b.usage, resolution: b.resolution, game: 'apex', prefs: ['nvidia', 'ssd2'] });
  var s = P.fromQuery('?' + q, builds);
  check('URL往復で同じ条件: ' + P.slugOf(b),
    s.budget === String(b.budget) && s.usage === b.usage && s.resolution === b.resolution && s.game === 'apex' && s.prefs.join(',') === 'nvidia,ssd2', q);
});
var bad = P.fromQuery('?b=12&u=<script>&r=8k&g=../../x&p=evil&compare=fhd-fps-10man,javascript:alert(1)', builds);
check('存在しない予算は捨てる', bad.budget === null);
check('不正な用途は捨てる', bad.usage === null);
check('不正な解像度は捨てる', bad.resolution === null);
check('不正なゲームIDは捨てる', bad.game === null);
check('不正な条件は捨てる', bad.prefs.length === 0);
check('比較URLは正しいスラグだけ', bad.compare.join(',') === 'fhd-fps-10man');
check('壊れたエンコードでも落ちない', P.fromQuery('?b=%E0%A4%A&u=fps', builds).usage === 'fps');

/* ------------------------------------------------------------------
 *  7. トップ（index.html）が builds.json と一致（データの一元化）
 * ------------------------------------------------------------------ */
var gen = cp.spawnSync(process.execPath, [path.join(DIR, 'generate-index-sections.js'), '--check'], { encoding: 'utf8' });
check('index.html の生成範囲が最新（generate-index-sections.js --check）', gen.status === 0, (gen.stderr || '').trim());

var allBuildsHtml = indexHtml.slice(indexHtml.indexOf('GENERATED:all-builds START'), indexHtml.indexOf('GENERATED:all-builds END'));
builds.forEach(function (b) {
  var slug = P.slugOf(b);
  var re = new RegExp('href="\\./builds/' + slug + '\\.html">([^<]+)</a>');
  var m = allBuildsHtml.match(re);
  check('全構成一覧にある: ' + slug, Boolean(m));
  if (m) check('全構成一覧のGPUが最新: ' + slug, m[1].slice(-b.gpu.length) === b.gpu, m[1] + ' / ' + b.gpu);
});

var popular = builds.filter(function (b) { return b.featured; }).sort(function (x, y) { return x.featured.rank - y.featured.rank; });
check('おすすめ構成が3件', popular.length === 3);
popular.forEach(function (b) {
  var slug = P.slugOf(b);
  var start = indexHtml.indexOf('<div class="popular-rank">おすすめ<br>' + b.featured.rank + '</div>');
  var card = start > -1 ? indexHtml.slice(start, indexHtml.indexOf('</article>', start)) : '';
  check('おすすめ構成カードがある: ' + slug, Boolean(card));
  check('おすすめ構成のCPUが最新: ' + slug, card.indexOf('<dd>' + b.cpu + '</dd>') > -1);
  check('おすすめ構成のGPUが最新: ' + slug, card.indexOf('<dd>' + b.gpu + '</dd>') > -1);
  check('おすすめ構成のリンク先: ' + slug, card.indexOf('href="./builds/' + slug + '.html"') > -1);
});
var sampleStart = indexHtml.indexOf('GENERATED:sample START');
var sample = indexHtml.slice(sampleStart, indexHtml.indexOf('GENERATED:sample END'));
check('Sample Result がおすすめ1番の構成', sample.indexOf(popular[0].gpu) > -1 && sample.indexOf(popular[0].cpu) > -1);
check('旧GPU表記（RTX 4070 / RX 7800 XTクラス）が残っていない', sample.indexOf('クラス') < 0);

/* ------------------------------------------------------------------
 *  8. 個別75ページ（生成物）が builds.json と一致し、新しい節を持つ
 * ------------------------------------------------------------------ */
builds.forEach(function (b) {
  var a = P.analyze(b, ctx);
  var html = fs.readFileSync(path.join(DIR, 'builds', a.slug + '.html'), 'utf8');
  var vals = [];
  html.replace(/class="spec-val[^"]*">([^<]+)</g, function (_, v) { vals.push(v); return _; });
  check('個別ページの部品が builds.json と一致: ' + a.slug,
    vals[0] === b.cpu && vals[1] === b.gpu && vals[2] === b.ram && vals[3] === b.storage, vals.join(' / '));
  check('個別ページに「このPCの得意分野」: ' + a.slug, html.indexOf('このPCの得意分野') > -1);
  check('個別ページに「この構成にした理由」: ' + a.slug, html.indexOf('この構成にした理由') > -1);
  check('個別ページに「予算を5万円変えると？」: ' + a.slug, html.indexOf('予算を5万円変えると？') > -1);
  check('個別ページに構成タイプ: ' + a.slug, html.indexOf('class="build-page-types"') > -1);
  check('個別ページに相談室への導線: ' + a.slug, html.indexOf('/pc-consult/?from=pc-build-check&') > -1);
  var n = P.neighbors(builds, b);
  [n.down, n.up].filter(Boolean).forEach(function (o) {
    var os = P.slugOf(o);
    check('個別ページから±5万円の構成へリンク: ' + a.slug + '→' + os, html.indexOf('href="' + os + '.html"') > -1);
  });
  check('canonical は変えていない: ' + a.slug, html.indexOf('<link rel="canonical" href="https://sippo-pc.jp/pc-build-check/builds/' + a.slug + '.html" />') > -1);
});

/* ------------------------------------------------------------------
 *  9. index.html の内部リンク・SEO要素
 * ------------------------------------------------------------------ */
var hrefs = [];
indexHtml.replace(/href="\.\/builds\/([^"]+)"/g, function (_, f) { hrefs.push(f); return _; });
check('index.html の構成リンクが78件以上（全75＋人気3＋Sample）', hrefs.length >= 79, String(hrefs.length));
hrefs.forEach(function (f) {
  check('リンク先が実在: builds/' + f, fs.existsSync(path.join(DIR, 'builds', f)));
});
check('title を維持', indexHtml.indexOf('<title>PC BUILD CHECK | 予算別おすすめゲーミングPC構成診断</title>') > -1);
check('canonical を維持', indexHtml.indexOf('<link rel="canonical" href="https://sippo-pc.jp/pc-build-check/" />') > -1);
check('h1 を維持', /<h1 class="hero-title">[\s\S]*?予算から[\s\S]*?おすすめPCを[\s\S]*?チェック[\s\S]*?<\/h1>/.test(indexHtml));
check('build-profile.js を script.js より前に読む',
  indexHtml.indexOf('src="build-profile.js"') > -1 && indexHtml.indexOf('src="build-profile.js"') < indexHtml.indexOf('src="script.js"'));
check('build-price.js を build-profile.js より前に読む',
  indexHtml.indexOf('/shared/parts/build-price.js') < indexHtml.indexOf('src="build-profile.js"'));
check('GA4 タグを維持', indexHtml.indexOf("gtag('config', 'G-NDQ8GTKGHC')") > -1);

/* ------------------------------------------------------------------
 *  10. 予算別診断としてのデータ品質（2026-09-24 追加）
 *   - 参考価格が選んだ予算の「前後」に収まる（build-price.js の OVER_TOLERANCE と同じ線）
 *   - 同じ用途・解像度で予算を上げたとき、GPU・CPU・メモリ・SSD・参考価格が下がらない
 *     （GPUは GPU GUIDE の score と rasterScore の両方、CPUは Upgrade 診断の CPU_TIERS）
 * ------------------------------------------------------------------ */
var BuildPrice = require('../shared/parts/build-price.js');
builds.forEach(function (b) {
  var a = P.analyze(b, ctx);
  var fit = BuildPrice.evaluateBudgetFit(a.total, a.budget);
  check('参考価格が予算の許容範囲内: ' + a.slug, fit && !fit.isOver,
    a.priceText + ' / ' + a.budgetMan + '万円（+' + Math.round((fit ? fit.ratio : 0) * 100) + '%）');
});

var engSrc = fs.readFileSync(path.join(ROOT, 'upgrade', 'upgrade-engine.js'), 'utf8');
var cpuTiers = {};
(engSrc.match(/var CPU_TIERS = \{([\s\S]*?)\};/) || ['', ''])[1].replace(/([a-z0-9]+):\s*(\d+)/g, function (_, k, v) { cpuTiers[k] = Number(v); return _; });
function cpuTier(name) { return cpuTiers[String(name).toLowerCase().replace(/[^a-z0-9]/g, '')]; }

USAGES.forEach(function (u) {
  RESES.forEach(function (r) {
    var ladder = BUDGETS.map(function (bd) { return P.analyze(P.findBuild(builds, String(bd), u, r), ctx); });
    for (var i = 1; i < ladder.length; i += 1) {
      var lo = ladder[i - 1];
      var hi = ladder[i];
      var label = u + '/' + r + ' ' + lo.budgetMan + '→' + hi.budgetMan + '万';
      check('予算を上げてGPUスコアが下がらない: ' + label, Number(hi.gpuInfo.score) >= Number(lo.gpuInfo.score), lo.gpu + ' → ' + hi.gpu);
      check('予算を上げてGPUのrasterScoreが下がらない: ' + label, Number(hi.gpuInfo.rasterScore) >= Number(lo.gpuInfo.rasterScore), lo.gpu + ' → ' + hi.gpu);
      check('予算を上げてCPUが下がらない: ' + label, cpuTier(hi.cpu) >= cpuTier(lo.cpu), lo.cpu + ' → ' + hi.cpu);
      check('予算を上げてメモリが減らない: ' + label, hi.ramGb >= lo.ramGb, lo.ram + ' → ' + hi.ram);
      check('予算を上げてSSDが減らない: ' + label, hi.storageTb >= lo.storageTb, lo.storage + ' → ' + hi.storage);
      check('予算を上げて参考価格が上がる: ' + label, hi.total > lo.total, lo.priceText + ' → ' + hi.priceText);
      check('予算を上げてゲーム性能の段階が下がらない: ' + label,
        hi.strengths.filter(function (s) { return s.key === 'gaming'; })[0].level >= lo.strengths.filter(function (s) { return s.key === 'gaming'; })[0].level);
    }
  });
});

/* おすすめ構成は運営の選定。実測ランキングと誤解される表記を出さない */
var featuredHtml = indexHtml.slice(indexHtml.indexOf('id="popular-builds"'), indexHtml.indexOf('GENERATED:popular END'))
  .replace('ランキングではありません', ''); // 「実測ランキングではない」という断り書きは除く
check('おすすめ構成に「人気」「ランキング」「〇位」の表記が無い', !/人気|ランキング|\d位/.test(featuredHtml), (featuredHtml.match(/人気|ランキング|\d位/) || [''])[0]);
check('builds.json に popular（実測と誤解される名前）が残っていない', builds.every(function (b) { return !b.popular; }));

console.log('');
console.log('  PC BUILD CHECK 構成プロフィール・一元化テスト');
console.log('  --------------------------------------------');
console.log('  成功: ' + pass);
console.log('  失敗: ' + failures.length);
if (failures.length) {
  console.log('');
  failures.slice(0, 50).forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
}
console.log('');
