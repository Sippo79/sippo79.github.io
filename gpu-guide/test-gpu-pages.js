/* =====================================================================
 *  GPU GUIDE 個別ページ 検証テスト (test-gpu-pages.js)
 *  ---------------------------------------------------------------------
 *  実行: node gpu-guide/test-gpu-pages.js
 *
 *  generate-gpu-pages.js が生成した gpu-guide/gpu/<id>/index.html を、
 *  **本番ディレクトリの実ファイルに対して** 検証する。
 *  （generator 内の検証は生成直後のプレビューが対象。こちらは
 *   「いま本番に置かれているもの」が正しいかを見る二重チェック。）
 *
 *  Phase 1 で generator が古く、再生成でアフィリエイト・広告表記が
 *  静的ページから消える事故が起きたため、欠落検査を必ず含める。
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const ROOT = path.join(DIR, '..');
const BASE = 'https://sippo-pc.jp/gpu-guide';
const GPU_DIR = path.join(DIR, 'gpu');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

const gpus = readJson(path.join(DIR, 'gpus.json'));

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { pass++; return; }
  fail++;
  failures.push(name + (detail ? '  → ' + detail : ''));
}

/* --- 1. GPU数とページ数が一致する --------------------------------- */
const dirs = fs.existsSync(GPU_DIR)
  ? fs.readdirSync(GPU_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
ok('gpu/ ディレクトリが存在する', dirs.length > 0, '件数 ' + dirs.length);
ok('GPU数 = 静的ページ数', dirs.length === gpus.length, dirs.length + ' / ' + gpus.length);

/* --- 2. id が一意 -------------------------------------------------- */
(function () {
  const ids = gpus.map((g) => g.id);
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
  ok('gpus.json の id が一意', dup.length === 0, dup.join(', '));
})();

/* --- 3〜13. 各ページの中身 ------------------------------------------ */
const pages = {};
gpus.forEach((gpu) => {
  const file = path.join(GPU_DIR, gpu.id, 'index.html');
  const exists = fs.existsSync(file);
  ok('ページが存在する: ' + gpu.id, exists);
  if (!exists) return;

  const html = fs.readFileSync(file, 'utf8');
  pages[gpu.id] = html;
  const url = `${BASE}/gpu/${gpu.id}/`;

  // title / description
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
  ok('title あり: ' + gpu.id, Boolean(title && title.trim()));
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  ok('description あり: ' + gpu.id, Boolean(desc && desc.trim()));

  // H1 は1つだけ
  const h1s = html.match(/<h1[^>]*>/g) || [];
  ok('H1 が1件: ' + gpu.id, h1s.length === 1, String(h1s.length));

  // canonical 自己参照
  const canon = (html.match(/rel="canonical" href="([^"]*)"/) || [])[1];
  ok('canonical 自己参照: ' + gpu.id, canon === url, canon);

  // noindex 無し
  ok('noindex 無し: ' + gpu.id, !/name="robots"[^>]*noindex/i.test(html));

  // BreadcrumbList
  ok('BreadcrumbList あり: ' + gpu.id, html.indexOf('"BreadcrumbList"') > -1);

  // JSON-LD が構文的に正しい
  const lds = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  ok('JSON-LD が2件以上: ' + gpu.id, lds.length >= 2, String(lds.length));
  lds.forEach((block, i) => {
    const body = block.replace(/<script type="application\/ld\+json">/, '').replace(/<\/script>/, '');
    let okJson = true;
    try { JSON.parse(body.replace(/\\u003c/g, '<')); } catch (e) { okJson = false; }
    ok(`JSON-LD[${i}] が妥当: ` + gpu.id, okJson);
  });

  // クロスリンク（CPU相性データの有無に関係なく必須）
  ok('PC BUILD CHECK リンク: ' + gpu.id, html.indexOf('href="/pc-build-check/"') > -1);
  ok('Upgrade リンク: ' + gpu.id, html.indexOf('href="/upgrade/"') > -1);
  ok('GAME PC GUIDE リンク: ' + gpu.id, html.indexOf('href="/game-pc-guide/"') > -1);
  ok('GPU GUIDE 戻りリンク: ' + gpu.id, html.indexOf('href="../../index.html"') > -1);

  // 本文がHTMLに存在する（JS無しで読める）
  ok('GPU名が本文にある: ' + gpu.id, html.indexOf(gpu.name) > -1);
  ok('VRAMが本文にある: ' + gpu.id, html.indexOf(gpu.vram + 'GB') > -1);
  ok('消費電力が本文にある: ' + gpu.id, html.indexOf(gpu.power + 'W') > -1);

  // アフィリエイト・広告表記（Phase 1 の事故対策）
  ok('affiliate.css: ' + gpu.id, html.indexOf('/shared/affiliate/affiliate.css') > -1);
  ok('affiliate-config.js: ' + gpu.id, html.indexOf('/shared/affiliate/affiliate-config.js') > -1);
  ok('affiliate.js: ' + gpu.id, html.indexOf('/shared/affiliate/affiliate.js') > -1);
  ok('広告表記: ' + gpu.id, html.indexOf('site-footer__affiliate-note') > -1);
  ok('data-sippo-theme: ' + gpu.id, html.indexOf('data-sippo-theme="dark"') > -1);

  // 壊れた値が出ていない
  ['undefined', '[object Object]', 'NaN'].forEach((bad) => {
    ok(`${bad} が出ていない: ` + gpu.id, html.indexOf('>' + bad + '<') < 0 && html.indexOf(bad + '</') < 0);
  });
});

/* --- 14. 内部リンク切れが無い --------------------------------------- */
(function () {
  const broken = [];
  Object.keys(pages).forEach((id) => {
    const dir = path.join(GPU_DIR, id);
    const html = pages[id];
    const re = /(?:href|src)="([^"#?][^"]*)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      let u = m[1];
      if (/^(https?:|mailto:|tel:|data:|\/\/)/.test(u)) continue;
      u = u.split('#')[0].split('?')[0];
      if (!u) continue;
      const target = u.startsWith('/') ? path.join(ROOT, u) : path.join(dir, u);
      if (!fs.existsSync(target) && !fs.existsSync(path.join(target, 'index.html'))) {
        broken.push(id + ' -> ' + m[1]);
      }
    }
  });
  ok('内部リンク切れが無い', broken.length === 0, broken.slice(0, 8).join(' / '));
})();

/* --- 15〜16. sitemap ------------------------------------------------ */
(function () {
  const sitemapPath = path.join(DIR, 'sitemap.xml');
  ok('sitemap.xml が存在する', fs.existsSync(sitemapPath));
  if (!fs.existsSync(sitemapPath)) return;
  const xml = fs.readFileSync(sitemapPath, 'utf8');
  const locs = (xml.match(/<loc>([^<]*)<\/loc>/g) || []).map((s) => s.replace(/<\/?loc>/g, ''));

  const missing = gpus.filter((g) => locs.indexOf(`${BASE}/gpu/${g.id}/`) < 0).map((g) => g.id);
  ok('sitemap に全GPUページが載っている', missing.length === 0, missing.slice(0, 6).join(', '));
  ok('sitemap に gpu.html?id= が入っていない', locs.every((l) => l.indexOf('gpu.html') < 0));
  ok('sitemap のURL数が 1 + GPU数', locs.length === gpus.length + 1, locs.length + ' / ' + (gpus.length + 1));
  ok('sitemap にトップが含まれる', locs.indexOf(`${BASE}/`) > -1);

  // canonical と sitemap が一致する
  const mismatch = [];
  Object.keys(pages).forEach((id) => {
    const canon = (pages[id].match(/rel="canonical" href="([^"]*)"/) || [])[1];
    if (locs.indexOf(canon) < 0) mismatch.push(id);
  });
  ok('全canonicalがsitemapに存在する', mismatch.length === 0, mismatch.slice(0, 6).join(', '));
})();

/* --- 17. 一覧カードが新URLへリンクしている -------------------------- */
(function () {
  const script = fs.readFileSync(path.join(DIR, 'script.js'), 'utf8');
  // コメント中の言及ではなく、実際のリンク生成に旧URLが残っていないかを見る
  ok('一覧カードが gpu.html?id= へリンクしていない',
    !/href=["'`][^"'`]*gpu\.html\?id=/.test(script));
  ok('一覧カードが getGpuDetailUrl を使っている', script.indexOf('getGpuDetailUrl(gpu)') > -1);
  // 生成されるURLが実在するか（全GPUで確認）
  const bad = gpus.filter((g) => !fs.existsSync(path.join(GPU_DIR, g.id, 'index.html'))).map((g) => g.id);
  ok('一覧の遷移先が全GPUで実在する', bad.length === 0, bad.slice(0, 6).join(', '));
})();

/* --- 18. 旧 gpu.html の互換 ----------------------------------------- */
(function () {
  const gpuHtml = fs.readFileSync(path.join(DIR, 'gpu.html'), 'utf8');
  ok('旧 gpu.html が残っている', gpuHtml.length > 0);
  ok('旧 gpu.html は noindex のまま', /name="robots"[^>]*noindex/i.test(gpuHtml));
  ok('旧 gpu.html に互換スクリプトがある', gpuHtml.indexOf("'/gpu-guide/gpu/'") > -1);
  ok('旧 gpu.html は実在確認してから遷移する', gpuHtml.indexOf('gpus.json') > -1);
  // JSが動かなくても従来表示が残ること＝gpu-detail.js の読み込みが残っている
  ok('旧 gpu.html は従来の描画も維持している', gpuHtml.indexOf('gpu-detail.js') > -1);
})();

/* ------------------------------------------------------------------ */
console.log('');
console.log('  GPU GUIDE 個別ページ テスト結果');
console.log('  --------------------------------');
console.log('  成功: ' + pass);
console.log('  失敗: ' + fail);
if (failures.length) {
  console.log('');
  failures.slice(0, 40).forEach((f) => console.log('  × ' + f));
  if (failures.length > 40) console.log('  ... 他 ' + (failures.length - 40) + ' 件');
}
console.log('');
process.exit(fail === 0 ? 0 : 1);
