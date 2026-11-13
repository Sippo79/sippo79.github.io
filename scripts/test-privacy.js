/**
 * プライバシーポリシー（/privacy/）の検証（node scripts/test-privacy.js）
 *
 *  1. ページ：title / description / canonical / OGP / h1 / noindex でない / GA4 ローダー1回 / CSS・JS の実在
 *  2. 内容：下書きの【要確認】等が残っていない、目次のリンク先が実在、外部リンクに rel=noopener、
 *     サイトの実装と矛盾しない（アフィリエイト3社・Supabase・相談の外部サービス・計測停止の仕組み）、
 *     管理ツール（_control）や認証情報に触れていない
 *  3. 導線：フッターを持つ全公開ページと生成スクリプトが /privacy/ へリンクしている
 *  4. サイトマップ：sitemap-main.xml に正規URLで1回だけ載り、インデックスから参照されている
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const URL_ = 'https://sippo-pc.jp/privacy/';
const LINK = 'href="/privacy/"';
let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail) { if (cond) pass++; else { fail++; failures.push(name + (detail ? '  → ' + detail : '')); } }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ================= 1. ページ ================= */
const html = read('privacy/index.html');
const head = (html.match(/<head[\s\S]*?<\/head>/i) || [''])[0];
const meta = (attr, name) => ((head.match(new RegExp(`<meta[^>]*${attr}="${name}"[^>]*content="([^"]*)"`)) || [])[1]);
ok('title', /<title>プライバシーポリシー \| Sippo（シッポ）<\/title>/.test(head));
ok('meta description', (meta('name', 'description') || '').length >= 50);
ok('canonical は正式URL（末尾スラッシュ）', head.includes(`<link rel="canonical" href="${URL_}">`));
ok('og:url = canonical', meta('property', 'og:url') === URL_);
for (const p of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:image', 'og:image:width', 'og:image:height', 'og:locale']) ok('OGP ' + p, !!meta('property', p));
for (const p of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) ok('Twitter ' + p, !!meta('name', p));
ok('OGP画像は SVG でない', !/\.svg/.test(meta('property', 'og:image') || ''));
ok('noindex にしない', !/noindex/i.test(html));
ok('h1 はちょうど1つ', (html.match(/<h1\b/g) || []).length === 1);
ok('GA4 ローダーを1回だけ読む', html.split('<script src="/shared/analytics/sippo-analytics.js"></script>').length === 2 && !/googletagmanager/.test(html));
ok('トップページ専用の /script.js を読まない（相対パスの画像が404になるため）', !html.includes('"/script.js"'));
for (const a of ['/style.css', '/shared/nav/sippo-nav.css', '/privacy/privacy.css', '/shared/nav/sippo-nav.js', '/privacy/privacy.js', '/assets/icon-192.png', '/favicon.png']) {
  ok('参照ファイルが実在: ' + a, html.includes(`"${a}"`) && fs.existsSync(path.join(ROOT, a.slice(1))));
}
ok('ヘッダーとフッターは親サイトと同じ部品', /<header class="header" id="header">/.test(html) && /<footer class="footer">/.test(html) && html.includes('data-sippo-servicenav'));
ok('フッターの広告表記は親サイトと同じ文言', (() => {
  const re = /<p class="footer__affiliate-note">[^<]*<\/p>/;
  return (read('index.html').match(re) || ['x'])[0] === (html.match(re) || ['y'])[0];
})());
const json = (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
ok('構造化データ（パンくず）が正しいJSON', (() => { try { return JSON.parse(json)['@type'] === 'BreadcrumbList'; } catch { return false; } })());

/* ================= 2. 内容 ================= */
const body = html.replace(/<head[\s\S]*?<\/head>/i, '');
ok('【要確認】などの下書きの印が残っていない', !/【|要確認|公開前確認|TODO/.test(body));
ok('管理ツール・認証情報に触れていない', !/_control|secrets|service_account|private_key|access-token/.test(html));
ok('アフィリエイト用のIDを本文に書かない', !/sippo79-22|56aa006c/.test(html));
ok('制定日がある', /制定日：\d{4}年\d{1,2}月\d{1,2}日/.test(body));
const ids = new Set([...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const hashLinks = [...body.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
ok('ページ内リンクの行き先が実在', hashLinks.length >= 11 && hashLinks.every((h) => ids.has(h)), hashLinks.filter((h) => !ids.has(h)).join());
const blanks = [...body.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].map((m) => m[0]);
ok('別タブのリンクは rel="noopener noreferrer"', blanks.length > 0 && blanks.every((a) => /rel="noopener noreferrer"/.test(a)));
ok('内部リンクの行き先が実在', [...body.matchAll(/href="(\/[^"#?]*)/g)].map((m) => m[1]).every((p) => {
  const rel = p.replace(/^\//, ''); const f = rel === '' || rel.endsWith('/') ? path.join(rel, 'index.html') : rel;
  return fs.existsSync(path.join(ROOT, f));
}));

// サイトの実装との整合
const shops = Object.keys(Object.values(JSON.parse(read('shared/affiliate/affiliate-master.json')).products)
  .reduce((acc, p) => { for (const k of ['amazon', 'rakuten', 'yahoo']) if (p[k]) acc[k] = 1; return acc; }, {}));
const SHOP_NAME = { amazon: 'Amazon アソシエイト', rakuten: '楽天アフィリエイト', yahoo: 'Yahoo!ショッピング' };
for (const s of shops) ok('利用中のアフィリエイトを記載: ' + SHOP_NAME[s], body.includes(SHOP_NAME[s]));
ok('Amazon アソシエイトの必須表記', body.includes('Amazonのアソシエイトとして、当サイトは適格販売により収入を得ています。'));
ok('Google アナリティクスとオプトアウト手段を記載', /Google アナリティクス/.test(body) && body.includes('tools.google.com/dlpage/gaoptout'));
const loader = read('shared/analytics/sippo-analytics.js');
ok('計測停止ボタンがローダーの仕組み（?sippo_ga=off / on）と一致', body.includes('?sippo_ga=off') && body.includes('?sippo_ga=on') && loader.includes("flag === 'off'") && loader.includes("flag === 'on'"));
ok('状態表示がローダーと同じ保存キーを読む', read('privacy/privacy.js').includes("'sippo-ga-optout'") && loader.includes("'sippo-ga-optout'"));
ok('PC構成投稿サイトの記載が Supabase の保存項目と一致', (() => {
  const schema = read('pc-builds-hub/supabase-schema.sql');
  return /display_name/.test(schema) && /avatar_url/.test(schema) && /\bbio\b/.test(schema) && /表示名/.test(body) && /アイコン画像/.test(body) && /自己紹介/.test(body) && /Supabase/.test(body);
})());
const consult = read('pc-consult/index.html') + read('index.html');
ok('相談の外部サービスの記載が実際の導線と一致', ['square.link', 'coconala.com', 'docs.google.com/forms'].every((d) => consult.includes(d)) && ['Square', 'ココナラ', 'Google フォーム'].every((w) => body.includes(w)));
const rootMail = (read('index.html').match(/href="mailto:([^"]+)"/) || [])[1];
ok('問い合わせ先は親サイトのフッターと同じ', !!rootMail && body.includes(`href="mailto:${rootMail}"`));

/* ================= 3. フッターからの導線 ================= */
function walk(dir, acc = [], rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('_') || e.name === 'node_modules') continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), acc, r); else if (e.name.endsWith('.html')) acc.push(r);
  }
  return acc;
}
const pages = walk(ROOT);
let footers = 0; const missing = [];
for (const f of pages) {
  const s = read(f);
  const footer = (s.match(/<footer[\s\S]*?<\/footer>/i) || [])[0];
  if (!footer) continue;
  footers++;
  if (!footer.includes(LINK)) missing.push(f);
  if ((footer.split(LINK).length - 1) > 1) missing.push(f + '（重複）');
}
ok('フッターを持つ全公開ページがプライバシーポリシーへリンク', missing.length === 0 && footers >= 200, missing.slice(0, 10).join(', ') + ` / ${footers}ページ`);
for (const g of ['gpu-guide/generate-gpu-pages.js', 'game-pc-guide/generate-games.js', 'upgrade/generate-pages.js', 'pc-build-check/generate-builds.ps1']) {
  ok('生成スクリプトもリンクを出力: ' + g, read(g).includes('<a href="/privacy/">プライバシーポリシー</a>'));
}
for (const [css, sel] of [['gpu-guide/common.css', '.site-footer a'], ['pc-build-check/style.css', '.site-footer a'], ['pc-builds-hub/style.css', '.page-footer a']]) {
  ok('フッターのリンクに下線: ' + css, new RegExp(sel.replace('.', '\\.') + '\\s*\\{[^}]*text-decoration:\\s*underline').test(read(css)));
}

/* ================= 4. サイトマップ ================= */
const main = read('sitemap-main.xml');
ok('sitemap-main.xml に1回だけ載る', main.split(`<loc>${URL_}</loc>`).length === 2);
ok('sitemap-main.xml が整形式', /^<\?xml[\s\S]*<urlset[\s\S]*<\/urlset>\s*$/.test(main) && (main.match(/<url>/g) || []).length === (main.match(/<\/url>/g) || []).length);
ok('サイトマップインデックスが sitemap-main.xml を参照', read('sitemap.xml').includes('<loc>https://sippo-pc.jp/sitemap-main.xml</loc>'));
const allSitemaps = ['sitemap-main.xml', ...['gpu-guide', 'pc-build-check', 'game-pc-guide', 'pc-builds-hub', 'upgrade', 'pc-builder'].map((d) => d + '/sitemap.xml')];
ok('他のサイトマップには載せない（重複なし）', allSitemaps.slice(1).every((f) => !read(f).includes('/privacy/')));

console.log('\nプライバシーポリシー テスト');
if (failures.length) { console.log('\n失敗:'); failures.forEach((f) => console.log('  ✗ ' + f)); }
console.log(`\n  成功: ${pass}   失敗: ${fail}`);
process.exitCode = fail ? 1 : 0;
