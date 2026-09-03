/* =====================================================================
 *  サイト間導線（GPUリンク）検証テスト (scripts/test-cross-links.js)
 *  ---------------------------------------------------------------------
 *  実行: node scripts/test-cross-links.js
 *
 *  Phase 3 の目的は「GPUが特定できる場所からは、GPU一覧ではなく
 *  そのGPUの個別ページへ直接送る」こと。
 *  ここではリポジトリ全体を走査して、
 *    ・旧形式 /gpu-guide/?gpu= が内部リンクとして残っていないか
 *    ・新形式 /gpu-guide/gpu/<id>/ の遷移先が実在するか
 *    ・GPU名→id の解決が全サイトで一貫しているか
 *  を検証する。
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GPU_DIR = path.join(ROOT, 'gpu-guide', 'gpu');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

const gpus = readJson(path.join(ROOT, 'gpu-guide', 'gpus.json'));
const builds = readJson(path.join(ROOT, 'pc-build-check', 'builds.json'));
const games = readJson(path.join(ROOT, 'game-pc-guide', 'data', 'games.json'));

const Links = require(path.join(ROOT, 'shared', 'gpu', 'gpu-links.js'));
Links.setCatalog(gpus);

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { pass++; return; }
  fail++;
  failures.push(name + (detail ? '  → ' + detail : ''));
}

/* HTMLファイルを再帰的に集める */
function walkHtml(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name === '.generated-preview') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkHtml(p, acc);
    else if (e.name.endsWith('.html')) acc.push(p);
  }
  return acc;
}

const allHtml = walkHtml(ROOT);

/* ==================================================================
 *  1. GPUリンク解決（shared/gpu/gpu-links.js）
 * ================================================================== */
(function () {
  ok('カタログが読み込める', Links.isReady(), String(gpus.length));

  // 全64件が id からも name からも解決できる
  const badId = gpus.filter((g) => Links.resolveId(g.id) !== g.id).map((g) => g.id);
  ok('全GPUが id から解決できる', badId.length === 0, badId.slice(0, 5).join(', '));
  const badName = gpus.filter((g) => Links.resolveId(g.name) !== g.id).map((g) => g.id);
  ok('全GPUが name から解決できる', badName.length === 0, badName.slice(0, 5).join(', '));

  // 生成URLの実体が存在する
  const missing = gpus.filter((g) => {
    const url = Links.detailUrl(g.id);
    if (!url) return true;
    return !fs.existsSync(path.join(ROOT, url.replace(/^\//, ''), 'index.html'));
  }).map((g) => g.id);
  ok('全GPUの静的ページが実在する', missing.length === 0, missing.slice(0, 5).join(', '));

  // 表記ゆれの吸収（実際にサイト内で使われている3系統）
  ok('"GeForce RTX 5070 Ti" が解決できる', Links.resolveId('GeForce RTX 5070 Ti') === 'rtx-5070-ti');
  ok('"RTX 5070 Ti" が解決できる', Links.resolveId('RTX 5070 Ti') === 'rtx-5070-ti');
  ok('"rtx5070ti" が解決できる', Links.resolveId('rtx5070ti') === 'rtx-5070-ti');
  ok('"Radeon RX 9070 XT" が解決できる', Links.resolveId('Radeon RX 9070 XT') === 'rx-9070-xt');
  ok('"RX 9070 XT" が解決できる', Links.resolveId('RX 9070 XT') === 'rx-9070-xt');

  // Phase 4 で RTX 5050 を gpus.json へ追加したので、解決できるようになった
  ok('"RTX 5050" が解決できる（Phase 4で追加）', Links.resolveId('RTX 5050') === 'rtx-5050');
  // 未登録は推測せず null（誤ったGPUページへ送らない）
  ok('未登録GPUは null を返す', Links.resolveId('GeForce RTX 9999 Ti') === null);
  ok('空文字は null を返す', Links.resolveId('') === null);
  ok('null入力は null を返す', Links.resolveId(null) === null);
  // 部分一致で誤ヒットしないこと
  ok('"RTX 50" のような部分文字列で誤ヒットしない', Links.resolveId('RTX 50') === null);
})();

/* ==================================================================
 *  2. 旧形式 /gpu-guide/?gpu= が内部リンクに残っていない
 * ================================================================== */
(function () {
  const offenders = [];
  allHtml.forEach((f) => {
    const html = fs.readFileSync(f, 'utf8');
    // href/src 属性の中に ?gpu= があるものだけを見る
    const re = /(?:href|src)="([^"]*\?gpu=[^"]*)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      offenders.push(path.relative(ROOT, f) + ' -> ' + m[1]);
    }
  });
  ok('HTMLに ?gpu= の内部リンクが無い', offenders.length === 0, offenders.slice(0, 6).join(' / '));

  // 生成スクリプト・JSのリンク生成側も確認（互換処理のコードは除外）
  // ルート直下の generate-builds.ps1 は「古いコピー」で、
  // 実行ガード付きの廃止ファイル。中身は直さず、ガードが効いていることを見る。
  const srcFiles = [
    'pc-build-check/script.js',
    'pc-build-check/generate-builds.ps1',
    'game-pc-guide/Generate-StaticGames.ps1',
    'upgrade/upgrade-diagnose.js',
  ];
  const srcOffenders = [];
  srcFiles.forEach((rel) => {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) return;
    const text = fs.readFileSync(p, 'utf8');
    // 実際にURLを組み立てている箇所（gpu-guide/?gpu=）のみ検出。
    // コメント内の言及は行頭が # や * や // のものとして除外する。
    text.split(/\r?\n/).forEach((line, i) => {
      if (!/gpu-guide\/\?gpu=/.test(line)) return;
      if (/^\s*(#|\/\/|\*)/.test(line)) return; // コメント行は除外
      srcOffenders.push(rel + ':' + (i + 1));
    });
  });
  ok('リンク生成コードに ?gpu= が残っていない', srcOffenders.length === 0, srcOffenders.join(', '));

  // 廃止した古いgeneratorが誤って実行されないようガードされていること
  [['generate-builds.ps1', 'ルート直下の古い generate-builds.ps1'],
   ['gpu-guide/generate-sitemap.ps1', '廃止した generate-sitemap.ps1']].forEach(([rel, label]) => {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) return;
    const text = fs.readFileSync(p, 'utf8');
    ok(label + ' に実行ガードがある',
      text.indexOf('param([switch]$Force)') > -1 && /exit 1/.test(text));
  });
})();

/* ==================================================================
 *  3. PC BUILD CHECK（静的75ページ）
 * ================================================================== */
(function () {
  const dir = path.join(ROOT, 'pc-build-check', 'builds');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html') && !f.includes('30man-2'));
  ok('構成ページ数が builds.json と一致', files.length === builds.length, files.length + ' / ' + builds.length);

  const byId = {};
  builds.forEach((b) => { byId[b.id] = b; });

  const bad = [];
  const noLink = [];
  files.forEach((f) => {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    const m = html.match(/https:\/\/sippo-pc\.jp\/gpu-guide\/gpu\/([a-z0-9-]+)\//);
    if (!m) { noLink.push(f); return; }
    if (!fs.existsSync(path.join(GPU_DIR, m[1], 'index.html'))) bad.push(f + ' -> ' + m[1]);
  });
  ok('全構成ページがGPU個別ページへリンクしている', noLink.length === 0, noLink.slice(0, 5).join(', '));
  ok('構成ページのGPUリンク先が実在する', bad.length === 0, bad.slice(0, 5).join(', '));

  // ページのGPUと、リンク先のGPUが一致しているか（取り違え検出）
  const mismatch = [];
  builds.forEach((b) => {
    const expected = Links.resolveId(b.gpu);
    if (!expected) return;
    // slug からファイル名を逆引きできないので、GPU名で該当ページを走査
    files.forEach((f) => {
      const html = fs.readFileSync(path.join(dir, f), 'utf8');
      if (html.indexOf('<strong>' + b.gpu + ' の詳細を見る</strong>') < 0) return;
      const m = html.match(/gpu-guide\/gpu\/([a-z0-9-]+)\//);
      if (m && m[1] !== expected) mismatch.push(f + ': ' + b.gpu + ' -> ' + m[1]);
    });
  });
  ok('構成ページのGPUリンクが該当GPUを指している', mismatch.length === 0, mismatch.slice(0, 5).join(' / '));

  // Upgradeへの導線が追加されている
  const noUpgrade = files.filter((f) => {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    return html.indexOf('https://sippo-pc.jp/upgrade/') < 0;
  });
  ok('全構成ページにUpgradeへの導線がある', noUpgrade.length === 0, noUpgrade.slice(0, 5).join(', '));

  // アフィリエイト・広告表記が消えていないこと（Phase 1 の事故対策）
  ['/shared/affiliate/affiliate.css', 'site-footer__affiliate-note',
   'data-sippo-theme="dark"', '/shared/affiliate/affiliate-config.js'].forEach((needle) => {
    const miss = files.filter((f) => fs.readFileSync(path.join(dir, f), 'utf8').indexOf(needle) < 0);
    ok('構成ページに ' + needle + ' がある', miss.length === 0, miss.slice(0, 3).join(', '));
  });
})();

/* ==================================================================
 *  4. PC BUILD CHECK（診断結果のリンク生成）
 * ================================================================== */
(function () {
  const script = fs.readFileSync(path.join(ROOT, 'pc-build-check', 'script.js'), 'utf8');
  ok('診断結果が SippoGpuLinks を使っている', script.indexOf('SippoGpuLinks') > -1);
  ok('診断結果に ?gpu= の組み立てが残っていない',
    !/gpu-guide\/\?gpu=\$\{/.test(script));
  ok('診断結果にUpgradeへの導線がある', script.indexOf('href="/upgrade/"') > -1);

  const index = fs.readFileSync(path.join(ROOT, 'pc-build-check', 'index.html'), 'utf8');
  ok('index.html が gpu-links.js を読み込んでいる',
    index.indexOf('/shared/gpu/gpu-links.js') > -1);
  // script.js より前に読まれること（順序が逆だと未定義になる）
  ok('gpu-links.js は script.js より前に読まれる',
    index.indexOf('/shared/gpu/gpu-links.js') < index.indexOf('src="script.js"'));

  // builds.json の全GPUが解決できる（解決できないとトップへ落ちる）
  const unresolved = [...new Set(builds.map((b) => b.gpu))].filter((n) => !Links.resolveId(n));
  ok('builds.json の全GPUが解決できる', unresolved.length === 0, unresolved.join(', '));
})();

/* ==================================================================
 *  5. Upgrade
 * ================================================================== */
(function () {
  const diag = fs.readFileSync(path.join(ROOT, 'upgrade', 'upgrade-diagnose.js'), 'utf8');
  ok('Upgradeが SippoGpuLinks を使っている', diag.indexOf('SippoGpuLinks') > -1);
  ok('UpgradeにGPU詳細リンクの描画がある', diag.indexOf('gpuDetailLink') > -1);

  const idx = fs.readFileSync(path.join(ROOT, 'upgrade', 'index.html'), 'utf8');
  ok('upgrade/index.html が gpu-links.js を読み込んでいる',
    idx.indexOf('/shared/gpu/gpu-links.js') > -1);
  ok('gpu-links.js は upgrade-diagnose.js より前に読まれる',
    idx.indexOf('/shared/gpu/gpu-links.js') < idx.indexOf('upgrade-diagnose.js'));

  // エンジンの交換候補が GPU GUIDE で引けるか（引けないと詳細リンクが出ない）
  const engine = fs.readFileSync(path.join(ROOT, 'upgrade', 'upgrade-engine.js'), 'utf8');
  const m = engine.match(/var GPU_CANDIDATES = \[([\s\S]*?)\];/);
  ok('GPU_CANDIDATES を読み取れる', Boolean(m));
  if (m) {
    const ids = [...m[1].matchAll(/'([a-z0-9]+)'/g)].map((x) => x[1]);
    const resolvable = ids.filter((id) => Links.resolveId(id));
    // 全件でなくてよい（gpus.json に無い型番もある）。過半数が引ければ導線として機能する。
    ok('交換候補GPUの大半がGPU GUIDEで引ける',
      resolvable.length >= Math.ceil(ids.length * 0.8),
      resolvable.length + ' / ' + ids.length);
  }
})();

/* ==================================================================
 *  6. GAME PC GUIDE
 * ================================================================== */
(function () {
  const dir = path.join(ROOT, 'game-pc-guide', 'games');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));
  ok('ゲームページ数が games.json と一致', files.length === games.length, files.length + ' / ' + games.length);

  // GPUリンクの遷移先が実在する
  const bad = [];
  let linked = 0;
  files.forEach((f) => {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    const re = /class="build-gpu-link" href="https:\/\/sippo-pc\.jp\/gpu-guide\/gpu\/([a-z0-9-]+)\//g;
    let m;
    let found = false;
    while ((m = re.exec(html)) !== null) {
      found = true;
      if (!fs.existsSync(path.join(GPU_DIR, m[1], 'index.html'))) bad.push(f + ' -> ' + m[1]);
    }
    if (found) linked++;
  });
  ok('ゲームページのGPUリンク先が実在する', bad.length === 0, bad.slice(0, 5).join(', '));
  ok('GPUリンクを持つゲームページがある', linked > 0, String(linked) + ' / 25');

  // gpus.json に無いGPU（RTX 5050）はリンクにしない＝誤リンクを作らない
  const unresolvable = new Set();
  games.forEach((g) => (g.builds || []).forEach((b) => {
    if (!Links.resolveId(b.gpu)) unresolvable.add(b.gpu);
  }));
  const wrongly = [];
  unresolvable.forEach((name) => {
    files.forEach((f) => {
      const html = fs.readFileSync(path.join(dir, f), 'utf8');
      if (new RegExp('build-gpu-link[^>]*>' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '<').test(html)) {
        wrongly.push(f + ': ' + name);
      }
    });
  });
  ok('解決できないGPUをリンクにしていない', wrongly.length === 0, wrongly.slice(0, 5).join(', '));

  // 既存要素が消えていないこと（generator 退行の検出）
  ['/shared/affiliate/affiliate.css', 'detail-back-nav', 'header-link-ext',
   'apple-mobile-web-app-title', 'viewport-fit=cover'].forEach((needle) => {
    const miss = files.filter((f) => fs.readFileSync(path.join(dir, f), 'utf8').indexOf(needle) < 0);
    ok('ゲームページに ' + needle + ' がある', miss.length === 0, miss.slice(0, 3).join(', '));
  });
})();

/* ==================================================================
 *  7. GPU GUIDE 側
 * ================================================================== */
(function () {
  const script = fs.readFileSync(path.join(ROOT, 'gpu-guide', 'script.js'), 'utf8');
  ok('一覧カードが静的URLを使う', script.indexOf('getGpuDetailUrl(gpu)') > -1);
  ok('一覧カードが gpu.html?id= へリンクしない',
    !/href=["'`][^"'`]*gpu\.html\?id=/.test(script));

  const detail = fs.readFileSync(path.join(ROOT, 'gpu-guide', 'gpu-detail.js'), 'utf8');
  ok('比較カードが静的URLを使う', detail.indexOf('href="gpu/${targetGpu.id}/"') > -1);

  // トップの ?gpu= 後方互換
  const index = fs.readFileSync(path.join(ROOT, 'gpu-guide', 'index.html'), 'utf8');
  ok('GPU GUIDEトップに ?gpu= 互換処理がある', index.indexOf("params.get('gpu')") > -1);
  ok('互換処理は実在確認してから遷移する', index.indexOf("fetch('gpus.json'") > -1);
  ok('互換処理は canonical を書き換えない',
    index.indexOf("link[rel=\"canonical\"]") < 0 || index.indexOf('setAttribute') < 0);

  // 旧 gpu.html は互換のまま
  const gpuHtml = fs.readFileSync(path.join(ROOT, 'gpu-guide', 'gpu.html'), 'utf8');
  ok('旧 gpu.html が残っている', gpuHtml.length > 0);
  ok('旧 gpu.html は noindex のまま', /name="robots"[^>]*noindex/i.test(gpuHtml));
})();

/* ==================================================================
 *  8. 静的GPUページ側の内部リンク品質
 * ================================================================== */
(function () {
  const selfLink = [];
  const dead = [];
  const dup = [];
  gpus.forEach((g) => {
    const file = path.join(GPU_DIR, g.id, 'index.html');
    if (!fs.existsSync(file)) return;
    const html = fs.readFileSync(file, 'utf8');
    const targets = [...html.matchAll(/class="compare-link-card"[^>]*>/g)];
    const hrefs = [...html.matchAll(/<a href="\.\.\/([a-z0-9-]+)\/" class="compare-link-card"/g)]
      .map((m) => m[1]);
    // 自分自身への比較リンクは意味が無い
    if (hrefs.indexOf(g.id) > -1) selfLink.push(g.id);
    // 存在しないGPUへのリンク
    hrefs.forEach((t) => {
      if (!fs.existsSync(path.join(GPU_DIR, t, 'index.html'))) dead.push(g.id + ' -> ' + t);
    });
    // 重複リンク
    const seen = {};
    hrefs.forEach((t) => { seen[t] = (seen[t] || 0) + 1; });
    Object.keys(seen).forEach((t) => { if (seen[t] > 1) dup.push(g.id + ' -> ' + t); });
  });
  ok('比較リンクに自己参照が無い', selfLink.length === 0, selfLink.slice(0, 5).join(', '));
  ok('比較リンクの遷移先が実在する', dead.length === 0, dead.slice(0, 5).join(', '));
  ok('比較リンクが重複していない', dup.length === 0, dup.slice(0, 5).join(', '));
})();

/* ==================================================================
 *  9. 今回触った範囲の内部リンク切れ
 * ================================================================== */
(function () {
  const targets = allHtml.filter((f) => {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    return rel.startsWith('gpu-guide/') || rel.startsWith('pc-build-check/')
      || rel.startsWith('game-pc-guide/') || rel.startsWith('upgrade/');
  });
  const broken = [];
  const doubleSlash = [];
  targets.forEach((f) => {
    const html = fs.readFileSync(f, 'utf8');
    const re = /(?:href|src)="([^"#?][^"]*)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      let u = m[1];
      if (/\/\/[^/]/.test(u) && !/^https?:/.test(u)) doubleSlash.push(path.relative(ROOT, f) + ' -> ' + u);
      if (/^(https?:|mailto:|tel:|data:|\/\/)/.test(u)) continue;
      u = u.split('#')[0].split('?')[0];
      if (!u) continue;
      const t = u.startsWith('/') ? path.join(ROOT, u) : path.join(path.dirname(f), u);
      if (!fs.existsSync(t) && !fs.existsSync(path.join(t, 'index.html'))) {
        broken.push(path.relative(ROOT, f) + ' -> ' + m[1]);
      }
    }
  });
  ok('リンク切れが無い', broken.length === 0, [...new Set(broken)].slice(0, 6).join(' / '));
  ok('二重スラッシュのURLが無い', doubleSlash.length === 0, doubleSlash.slice(0, 5).join(' / '));
})();

/* ------------------------------------------------------------------ */
console.log('');
console.log('  サイト間導線（GPUリンク）テスト結果');
console.log('  ------------------------------------');
console.log('  成功: ' + pass);
console.log('  失敗: ' + fail);
if (failures.length) {
  console.log('');
  failures.slice(0, 40).forEach((f) => console.log('  × ' + f));
  if (failures.length > 40) console.log('  ... 他 ' + (failures.length - 40) + ' 件');
}
console.log('');
process.exit(fail === 0 ? 0 : 1);
