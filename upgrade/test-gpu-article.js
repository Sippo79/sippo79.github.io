/* =====================================================================
 *  GPU型番記事のテスト (test-gpu-article.js)
 *  ---------------------------------------------------------------------
 *  実行: node upgrade/test-gpu-article.js
 *  （先に node upgrade/generate-pages.js で生成しておくこと）
 *
 *  articles-data.js の `gpuUpgrade` を持つ記事（/upgrade/rtx3060/ など）について、
 *  「診断と記事が食い違わない」「根拠のない数値を載せない」「リンクが切れない」を検証する。
 *  GPU名・件数はハードコードしない（記事データから導く）ので、
 *  RTX 3070 などの記事を足しても同じテストがそのまま効く。
 * ===================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var E = require('./upgrade-engine.js');
var GA = require('./gpu-article.js');
var ARTICLES = require('./articles-data.js').ARTICLES;
var MASTER = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'affiliate', 'affiliate-master.json'), 'utf8'));
var PRODUCT_IDS = {};
// products は配列・id キーのオブジェクトどちらの形でも読めるようにする
var productList = Array.isArray(MASTER.products) ? MASTER.products
  : Object.keys(MASTER.products || {}).map(function (k) { return Object.assign({ id: k }, MASTER.products[k]); });
productList.forEach(function (p) { PRODUCT_IDS[p.id] = true; });

var pass = 0;
var fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; return; }
  fail++;
  console.log('  ✗ ' + name + (detail !== undefined ? '  → ' + detail : ''));
}

function decode(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}
function text(html) {
  return decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

var targets = ARTICLES.filter(function (a) { return a.gpuUpgrade; });
check('gpuUpgrade を持つ記事が1件以上ある', targets.length > 0);

targets.forEach(function (page) {
  var d = page.gpuUpgrade;
  var label = '[' + page.slug + '] ';
  var file = path.join(__dirname, page.slug, 'index.html');
  var html = fs.readFileSync(file, 'utf8');
  var mainHtml = html.slice(html.indexOf('<main>'), html.indexOf('</main>'));
  var body = text(mainHtml);

  /* ---------------- SEO の基本 ---------------- */
  check(label + 'H1 はちょうど1つ', (html.match(/<h1[\s>]/g) || []).length === 1);
  check(label + 'canonical がページURL', html.indexOf('<link rel="canonical" href="https://sippo-pc.jp/upgrade/' + page.slug + '/">') !== -1);
  check(label + 'title が60字以内', page.title.length <= 60, page.title.length);
  check(label + 'description が70〜160字', page.description.length >= 70 && page.description.length <= 160, page.description.length);
  check(label + 'dateModified を持つ', !!page.dateModified);

  /* ---------------- FAQ 構造化データ = 画面のFAQ ---------------- */
  var ld = (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || []).map(function (s) {
    return JSON.parse(s.replace(/<\/?script[^>]*>/g, ''));
  });
  var faqLd = ld.filter(function (x) { return x['@type'] === 'FAQPage'; })[0];
  var domQ = [];
  // summary の中身はタグを含まない前提にして、購入ボタンの <summary> から跨がないようにする
  var re = /<summary>([^<]*)<\/summary>\s*<div class="u-faq__body">([\s\S]*?)<\/div>/g;
  var m;
  while ((m = re.exec(html))) domQ.push({ q: text(m[1]), a: text(m[2]) });
  check(label + 'FAQPage がある', !!faqLd);
  check(label + 'FAQ件数が画面と一致', faqLd && faqLd.mainEntity.length === domQ.length, faqLd && faqLd.mainEntity.length + ' / ' + domQ.length);
  (faqLd ? faqLd.mainEntity : []).forEach(function (q, i) {
    check(label + 'FAQ ' + (i + 1) + ' の質問・回答が画面と一致',
      domQ[i] && q.name === domQ[i].q && q.acceptedAnswer.text === domQ[i].a, q.name);
  });

  /* ---------------- 差し込み漏れ・禁止表現 ---------------- */
  check(label + '{{...}} の差し込み漏れがない', html.indexOf('{{') === -1);
  check(label + '具体的な価格（円）を本文に書いていない', !/[0-9][0-9,]{3,}\s*円/.test(body), (body.match(/[0-9][0-9,]{3,}\s*円/) || [])[0]);
  check(label + '性能の倍率・%向上を書いていない',
    !/[+＋]\s*\d+\s*%|\d+\s*%\s*(向上|アップ|速い)|\d(\.\d+)?\s*倍/.test(body),
    (body.match(/[+＋]\s*\d+\s*%|\d+\s*%\s*(向上|アップ|速い)|\d(\.\d+)?\s*倍/) || [])[0]);
  check(label + '「絶対」「必ず」を使っていない', !/絶対|必ず/.test(body), (body.match(/.{0,12}(絶対|必ず).{0,12}/) || [])[0]);
  // 「実測」は否定形（実測値ではありません 等）でしか使わない
  var jissoku = body.match(/実測[^。）]{0,20}/g) || [];
  check(label + '「実測」は否定の文脈だけ',
    jissoku.every(function (s) { return /ではありません|ではない|を持っていない/.test(s); }), jissoku.join(' | '));

  /* ---------------- 判定が診断エンジンと一致する ---------------- */
  check(label + 'scenarioHints が5件', (d.scenarioHints || []).length === GA.SCENARIOS.length);
  var marks = (mainHtml.match(/<span class="u-ga-scn__mark" aria-hidden="true">([^<]+)<\/span>/g) || [])
    .map(function (s) { return s.replace(/<[^>]+>/g, ''); });
  check(label + '判定カードが5枚', marks.length === GA.SCENARIOS.length, marks.length);
  GA.SCENARIOS.forEach(function (s, i) {
    var normal = GA.LEVEL[GA.level(d.from, s.res, s.fps, 'normal')].mark;
    check(label + '判定カード ' + s.label + ' ' + s.sub + ' が診断と一致',
      marks[i] && marks[i].slice(-1) === normal, marks[i] + ' / ' + normal);
  });

  // 記事冒頭の結論「フルHD・60fpsなら交換不要」を、診断そのもので裏付ける
  var fhd60 = E.diagnose({ gpu: GA.shortName(d.from), resolution: 'fhd', targetFps: 60, usage: 'normal', cpu: 'Ryzen 5 5600', memory: 16, storage: 1000, psu: 650 });
  var fhd60Gpu = fhd60.parts.filter(function (p) { return p.part === 'gpu'; })[0];
  check(label + '冒頭の結論（FHD60は交換不要）が診断と一致',
    /交換不要|まだ使え/.test(text(page.lead)) === (fhd60Gpu.status === 'keep'), fhd60Gpu.status);

  /* ---------------- 交換候補の妥当性 ---------------- */
  var candidates = [];
  d.candidates.groups.forEach(function (g) { g.gpus.forEach(function (c) { candidates.push(c.id); }); });
  candidates.forEach(function (id) {
    var gn = GA.gain(d.from, id);
    check(label + id + ' は伸びが小さすぎない（小・ほぼ同じを勧めない）', gn.key !== 'same' && gn.key !== 'small', gn.word);
    check(label + id + ' は gpus.json にある', !!GA.guideEntry(id));
    check(label + id + ' は公式の電源仕様がある', !!E.GPU_POWER_SPEC[id]);
    check(label + id + ' は商品マスターにある（購入ボタンが出る）', !!PRODUCT_IDS[id]);
    check(label + id + ' の GPU GUIDE ページが存在する',
      fs.existsSync(path.join(ROOT, 'gpu-guide', 'gpu', GA.guideEntry(id).id, 'index.html')));
  });
  // 目的別の並びは、段が進むほど性能が上がっていること（逆転すると選び方の説明と矛盾する）
  var groupMax = d.candidates.groups.map(function (g) {
    return Math.max.apply(null, g.gpus.map(function (c) { return E.GPU_TIERS[c.id]; }));
  });
  var groupMin = d.candidates.groups.map(function (g) {
    return Math.min.apply(null, g.gpus.map(function (c) { return E.GPU_TIERS[c.id]; }));
  });
  for (var gi = 1; gi < groupMin.length; gi++) {
    check(label + '目的 ' + (gi + 1) + ' は前の段より上位のGPU', groupMin[gi] > groupMax[gi - 1] || groupMin[gi] >= groupMin[gi - 1],
      groupMin[gi] + ' vs ' + groupMax[gi - 1]);
  }
  d.candidates.avoid.forEach(function (a) {
    var gn = GA.gain(d.from, a.id);
    check(label + '非推奨 ' + a.id + ' は本当に伸びが小さい', gn.key === 'same' || gn.key === 'small', gn.word);
    check(label + '非推奨 ' + a.id + ' を候補に入れていない', candidates.indexOf(a.id) === -1);
  });
  // 購入ボタンの枠が候補GPUと1対1
  var slots = (mainHtml.match(/data-upgrade-product="([^"]+)"/g) || []).map(function (s) { return s.split('"')[1]; });
  check(label + '購入ボタン枠が候補と一致', slots.join(',') === candidates.join(','), slots.join(','));

  /* ---------------- 電源の数値が公式仕様表と一致する ---------------- */
  var psuFaq = page.faq.filter(function (f) { return /電源/.test(f.q); })[0];
  if (psuFaq) {
    var filled = GA.fill(psuFaq.a);
    (psuFaq.a.match(/\{\{psu:([a-z0-9]+)\}\}/g) || []).forEach(function (tok) {
      var id = tok.slice(6, -2);
      check(label + 'FAQの電源 ' + id + ' が公式値', filled.indexOf(E.GPU_POWER_SPEC[id].psu + 'W') !== -1);
    });
  }
  // 診断の電源判定も公式値を下回らない（記事と診断で数字が違う、を防ぐ）
  candidates.forEach(function (id) {
    var r = E.diagnose({ gpu: GA.shortName(d.from), cpu: 'Ryzen 7 7800X3D', memory: 32, storage: 2000, psu: 300,
      resolution: '4k', targetFps: 144, usage: 'normal' });
    var psu = r.parts.filter(function (p) { return p.part === 'psu'; })[0];
    var gpu = r.parts.filter(function (p) { return p.part === 'gpu'; })[0];
    if (gpu.recommendId && E.GPU_POWER_SPEC[gpu.recommendId]) {
      check(label + '診断の推奨電源が公式値以上（' + gpu.recommendId + '）',
        psu.neededWatt >= E.GPU_POWER_SPEC[gpu.recommendId].psu, psu.neededWatt);
    }
  });

  /* ---------------- 内部リンク・ページ内リンク ---------------- */
  var hrefs = (html.match(/href="([^"]+)"/g) || []).map(function (s) { return decode(s.slice(6, -1)); });
  hrefs.forEach(function (h) {
    if (h.charAt(0) === '#') {
      check(label + 'ページ内リンク ' + h + ' の行き先がある', h.length > 1 && html.indexOf('id="' + h.slice(1) + '"') !== -1);
      return;
    }
    if (h.charAt(0) !== '/' || h.indexOf('//') === 0) return;
    var p = h.split('#')[0].split('?')[0];
    var f = path.join(ROOT, p);
    var ok = fs.existsSync(f) && (fs.statSync(f).isFile() || fs.existsSync(path.join(f, 'index.html')));
    check(label + '内部リンク ' + h + ' が存在する', ok);
  });
  check(label + '診断へのCTAがファーストビューにある',
    mainHtml.indexOf('href="/upgrade/#diagnose"') !== -1 &&
    mainHtml.indexOf('href="/upgrade/#diagnose"') < mainHtml.indexOf('id="quick"'));
});

/* ---------------- 他のページへの副作用がない ---------------- */
// generate-pages.js を require すると生成が走るため、出力ディレクトリを直接見る
var gaSlugs = targets.map(function (p) { return p.slug; });
fs.readdirSync(__dirname).forEach(function (slug) {
  var f = path.join(__dirname, slug, 'index.html');
  if (gaSlugs.indexOf(slug) !== -1 || !fs.existsSync(f)) return;
  var html = fs.readFileSync(f, 'utf8');
  check('[' + slug + '] 型番記事専用の部品が混ざっていない', html.indexOf('u-ga-') === -1);
  check('[' + slug + '] H1 はちょうど1つ', (html.match(/<h1[\s>]/g) || []).length === 1);
});

console.log('');
console.log('  --------------------------');
console.log('  成功: ' + pass);
console.log('  失敗: ' + fail);
process.exit(fail ? 1 : 0);
