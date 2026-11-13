/**
 * GA4 計測の検証（node scripts/test-analytics.js）
 *
 *  1. 公開HTMLが共通ローダー（/shared/analytics/sippo-analytics.js）を「ちょうど1回」読み込み、
 *     gtag.js の直書き・config の重複・使わない測定ID（G-M8SF678NH0）が無い（＝ページビューの二重計測なし）
 *  2. 生成スクリプトも同じ1行を出力する（再生成で旧タグに戻らない）
 *  3. ローダーの動作（偽のブラウザ環境で実行）
 *     - 本番（https://sippo-pc.jp）でだけ Google に送る。ローカル・http・オプトアウト時は送らない
 *     - content_group（サービス名）を付ける
 *     - page_location から #… とトークン類のクエリを除く
 *     - イベントからメールアドレス等を除く・長すぎる値を切る
 *     - 相談室・別サービスへのリンクを計測し、アフィリエイト/data-track 付きリンクは二重に送らない
 *  4. 追加したイベント（GPU検索・ゲーム絞り込み）が入力文字列を送らない
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const LOADER = '/shared/analytics/sippo-analytics.js';
const LOADER_TAG = '<script src="/shared/analytics/sippo-analytics.js"></script>';
// 使う測定ID（従来のプロパティ）。2026-11-13 に一度 G-M8SF678NH0 へ切り替えたが、旧プロパティのデータを使うため同日に戻した
const NEW_ID = 'G-NDQ8GTKGHC';
// 使わない測定ID（どこにも残っていないことを確認する）
const OLD_ID = 'G-M8SF678NH0';

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail) { if (cond) pass++; else { fail++; failures.push(name + (detail ? '  → ' + detail : '')); } }

function walk(dir, acc = [], rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('_') || e.name === 'node_modules') continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), acc, r); else acc.push(r);
  }
  return acc;
}
const files = walk(ROOT);
const html = files.filter((f) => f.endsWith('.html'));

/* ================= 1. 公開HTML ================= */
// 計測しないHTML（部品・オフライン表示・ツール・テスト用・未使用の重複ファイル）。増えたらここで気づけるよう明示する
const NO_TAG = new Set([
  'game-pc-guide/content/gta5/body.html', 'game-pc-guide/content/gta5/head.html', 'game-pc-guide/content/gta5/top.html',
  'game-pc-guide/offline.html', 'game-pc-guide/tools/ogp.html',
  'pc-build-check/builds/4k-creative-30man-2.html', 'pc-builds-hub/rls-test.html',
]);
const tagged = [];
for (const f of html) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const n = s.split(LOADER_TAG).length - 1;
  if (NO_TAG.has(f)) { ok(`計測しないページ: ${f}`, n === 0 && !/gtag\/js/.test(s)); continue; }
  tagged.push(f);
  ok(`ローダーを1回だけ読む: ${f}`, n === 1, `回数=${n}`);
  const head = (s.match(/<head[\s\S]*?<\/head>/i) || [''])[0];
  if (n === 1) ok(`ローダーは <head> 内: ${f}`, head.includes(LOADER_TAG));
  ok(`gtag.js を直書きしない: ${f}`, !/googletagmanager\.com\/gt[am]/.test(s));
  ok(`gtag('config') を直書きしない: ${f}`, !/gtag\(\s*['"]config['"]/.test(s));
  ok(`使わない測定IDが無い: ${f}`, !s.includes(OLD_ID));
}
ok('計測対象ページ数（全公開ページ − 計測しない7件）', tagged.length === html.length - NO_TAG.size && tagged.length >= 199, String(tagged.length));
ok('測定IDはローダーだけに書く（HTMLに直書きしない）', html.every((f) => !fs.readFileSync(path.join(ROOT, f), 'utf8').includes(NEW_ID)));

const publicJs = files.filter((f) => f.endsWith('.js') && !/(^|\/)(test-|generate-)/.test(path.basename(f)) && !f.startsWith('scripts/'));
ok('公開JSに使わない測定IDが無い', publicJs.every((f) => !fs.readFileSync(path.join(ROOT, f), 'utf8').includes(OLD_ID)), publicJs.filter((f) => fs.readFileSync(path.join(ROOT, f), 'utf8').includes(OLD_ID)).join(','));
ok('公開JSの中で測定IDを持つのはローダーだけ', publicJs.filter((f) => fs.readFileSync(path.join(ROOT, f), 'utf8').includes(NEW_ID)).join() === LOADER.slice(1));
ok('API認証用の鍵（サービスアカウント）を公開領域に置いていない', !files.some((f) => /\.json$/.test(f) && /"private_key"|"type":\s*"service_account"/.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))));

/* ================= 2. 生成スクリプト ================= */
for (const g of ['gpu-guide/generate-gpu-pages.js', 'game-pc-guide/generate-games.js', 'upgrade/generate-pages.js', 'pc-build-check/generate-builds.ps1']) {
  const s = fs.readFileSync(path.join(ROOT, g), 'utf8');
  ok(`生成スクリプトがローダーを出力: ${g}`, s.includes('<script src="/shared/analytics/sippo-analytics.js"></script>'));
  // GAME PC GUIDE だけは lastmod 互換のためにハッシュ計算用の旧形式タグ（LEGACY_GTAG）を持つ。出力には使わない
  const withoutLegacy = s.replace(/const LEGACY_GTAG = `[\s\S]*?`;/, '');
  ok(`生成スクリプトが gtag.js を直書きしない・測定IDを持たない: ${g}`, !withoutLegacy.includes(OLD_ID) && !withoutLegacy.includes(NEW_ID) && !/googletagmanager\.com\/gtag\/js/.test(withoutLegacy));
}

/* ================= 3. ローダーの動作 ================= */
const loaderSrc = fs.readFileSync(path.join(ROOT, LOADER.slice(1)), 'utf8');

function makeEl(href, attrs = {}, ancestors = []) {
  // ancestors: [{ match: selector-ish 文字列の判定関数, el }]
  const el = {
    href, attrs: { href, ...attrs },
    getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; },
    hasAttribute(k) { return k in this.attrs; },
    closest(sel) {
      if (sel === 'a[href]') return this;
      for (const a of ancestors) if (a.test(sel)) return a.el;
      return null;
    },
  };
  return el;
}

function run(url, { storage = {}, referrer = '', load = 1 } = {}) {
  const u = new URL(url);
  const injected = []; const listeners = {}; const logs = [];
  const store = { ...storage };
  const win = {
    location: { href: u.href, protocol: u.protocol, hostname: u.hostname, pathname: u.pathname, search: u.search },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    document: {
      referrer,
      head: { appendChild: (n) => injected.push(n) },
      createElement: (t) => ({ tagName: t }),
      addEventListener: (type, fn) => { listeners[type] = fn; },
    },
    console: { debug: (...a) => logs.push(a) },
    URL, URLSearchParams, Date,
  };
  win.window = win;
  const ctx = vm.createContext(win);
  for (let i = 0; i < load; i++) vm.runInContext(loaderSrc, ctx);
  const dl = () => (win.dataLayer || []).map((a) => Array.from(a));
  const click = (el) => listeners.click && listeners.click({ target: el });
  return { win, injected, dl, click, store, logs };
}

// 本番
{
  const r = run('https://sippo-pc.jp/gpu-guide/gpu/rtx-5070/?from=x#section', { referrer: 'https://www.google.com/' });
  ok('本番: gtag.js を1回だけ読み込む', r.injected.length === 1 && r.injected[0].src === 'https://www.googletagmanager.com/gtag/js?id=' + NEW_ID && r.injected[0].async === true);
  const cfg = r.dl().find((a) => a[0] === 'config');
  ok('本番: 新しい測定IDで config', cfg && cfg[1] === NEW_ID);
  ok('本番: content_group にサービス名', cfg && cfg[2].content_group === 'gpu-guide');
  ok('本番: page_location から # を除く', cfg && cfg[2].page_location === 'https://sippo-pc.jp/gpu-guide/gpu/rtx-5070/?from=x');
  ok('本番: send_page_view を無効にしない（ページビューは config の1回）', cfg && cfg[2].send_page_view !== false && r.dl().filter((a) => a[0] === 'config').length === 1);
  ok('本番: 手動の page_view を送らない（二重計測防止）', !r.dl().some((a) => a[0] === 'event' && a[1] === 'page_view'));
  ok('本番: debug_mode は既定で付けない', cfg && !('debug_mode' in cfg[2]));
  ok('本番: SippoAnalytics.enabled', r.win.SippoAnalytics.enabled === true && r.win.SippoAnalytics.measurementId === NEW_ID);
}
{
  const r = run('https://sippo-pc.jp/', { load: 2 });
  ok('二重に読み込んでも config は1回', r.dl().filter((a) => a[0] === 'config').length === 1 && r.injected.length === 1);
  ok('トップのサービス名は home', r.win.SippoAnalytics.service === 'home');
}
{
  const r = run('https://www.sippo-pc.jp/upgrade/');
  ok('www でも本番扱い', r.injected.length === 1);
}
// ローカル・本番以外
{
  // HTTPS 強制が未設定のため http でも本番として計測する（以前の直書きタグと同じ範囲）
  const r = run('http://sippo-pc.jp/gpu-guide/');
  ok('http の本番ドメインも計測する（HTTPS強制までの計測漏れ防止）', r.injected.length === 1 && r.win.SippoAnalytics.enabled === true);
}
for (const u of ['http://127.0.0.1:5500/gpu-guide/', 'http://localhost:8080/', 'file:///C:/site/index.html', 'https://sippo79.github.io/', 'https://example.com/gpu-guide/', 'https://sippo-pc.jp.evil.example/']) {
  const r = run(u);
  r.win.gtag('event', 'affiliate_click', { product_id: 'rtx5070' });
  ok(`送信しない環境: ${u}`, r.injected.length === 0 && r.dl().length === 0 && r.win.SippoAnalytics.enabled === false);
  ok(`送信しない環境でも gtag は存在（既存コードが壊れない）: ${u}`, typeof r.win.gtag === 'function');
}
// オプトアウト
{
  const a = run('https://sippo-pc.jp/?sippo_ga=off');
  ok('?sippo_ga=off で以後送らない', a.injected.length === 0 && a.store['sippo-ga-optout'] === '1');
  const b = run('https://sippo-pc.jp/gpu-guide/', { storage: { 'sippo-ga-optout': '1' } });
  ok('オプトアウト中は別ページでも送らない', b.injected.length === 0);
  const c = run('https://sippo-pc.jp/?sippo_ga=on', { storage: { 'sippo-ga-optout': '1' } });
  ok('?sippo_ga=on で再開', c.injected.length === 1 && !('sippo-ga-optout' in c.store));
  const d = run('https://sippo-pc.jp/?sippo_ga=debug');
  ok('?sippo_ga=debug で DebugView 用の debug_mode', d.dl().find((x) => x[0] === 'config')[2].debug_mode === true);
}
// 個人情報・認証情報
{
  const r = run('https://sippo-pc.jp/pc-builds-hub/reset-password.html?code=abc123&type=recovery&keep=1#access_token=SECRET', { referrer: 'https://sippo-pc.jp/pc-builds-hub/login.html?email=a%40b.com' });
  const cfg = r.dl().find((a) => a[0] === 'config')[2];
  ok('page_location からトークン類を除く', !/abc123|recovery|SECRET|access_token/.test(cfg.page_location) && /keep=1/.test(cfg.page_location), cfg.page_location);
  ok('page_referrer からメールアドレスを除く', !/a%40b|a@b/.test(cfg.page_referrer || ''), cfg.page_referrer);
  r.win.gtag('event', 'test_event', { email: 'a@b.com', note: 'mail me: taro@example.com', user_name: 'taro', ok: 'fine', n: 3, long: 'x'.repeat(300), obj: { a: 1 }, link_url: 'https://sippo-pc.jp/x?token=t1#h' });
  const ev = r.dl().find((a) => a[0] === 'event' && a[1] === 'test_event')[2];
  ok('メールアドレスのキーを送らない', !('email' in ev) && !('user_name' in ev));
  ok('メールアドレスを含む値を送らない', !('note' in ev));
  ok('通常の値は送る', ev.ok === 'fine' && ev.n === 3);
  ok('長い値は100文字に切る', ev.long.length === 100);
  ok('入れ子のオブジェクトは送らない', !('obj' in ev));
  ok('link_url からトークンと # を除く', ev.link_url === 'https://sippo-pc.jp/x');
}
// サイト内導線のクリック
{
  const r = run('https://sippo-pc.jp/gpu-guide/gpu/rtx-5070/');
  const footer = (el) => [{ test: (s) => s === 'footer', el }];
  const count = (name) => r.dl().filter((a) => a[0] === 'event' && a[1] === name).length;
  r.click(makeEl('/pc-consult/', {}, [{ test: (s) => s === '[data-track-placement]', el: { getAttribute: () => 'result_cta' } }]));
  const ev = r.dl().find((a) => a[1] === 'consult_cta_click');
  ok('相談室へのリンクを計測', ev && ev[2].from_service === 'gpu-guide' && ev[2].placement === 'result_cta' && ev[2].link_path === '/pc-consult/');
  r.click(makeEl('https://sippo-pc.jp/upgrade/', {}, footer({})));
  const cs = r.dl().find((a) => a[1] === 'cross_service_click');
  ok('別サービスへのリンクを計測', cs && cs[2].to_service === 'upgrade' && cs[2].placement === 'footer');
  const before = r.dl().length;
  r.click(makeEl('/pc-consult/', { 'data-track': 'pcbc_to_consult' }));
  r.click(makeEl('https://amzn.to/xxxx', { 'data-affiliate-track': '' }));
  r.click(makeEl('https://amzn.to/xxxx'));
  r.click(makeEl('/gpu-guide/gpu/rtx-5080/'));
  r.click(makeEl('/favicon.png'));
  ok('既存計測・外部・同じサービスのリンクは送らない（二重計測防止）', r.dl().length === before, String(r.dl().length - before));
  ok('consult_cta_click は1回だけ', count('consult_cta_click') === 1);
  const r2 = run('https://sippo-pc.jp/pc-consult/');
  r2.click(makeEl('/pc-consult/#apply'));
  ok('相談室の中のリンクは相談誘導として数えない', r2.dl().filter((a) => a[0] === 'event').length === 0);
  r.win.SippoAnalytics.track('Bad Name!', {});
  ok('不正なイベント名は送らない', !r.dl().some((a) => a[1] === 'Bad Name!'));
}
// サービス判定が Sippo CONTROL と一致（_control は公開リポジトリに含めないため、ある環境でだけ照合する）
if (fs.existsSync(path.join(ROOT, '_control/lib/services.js'))) {
  const ctrl = require(path.join(ROOT, '_control/lib/services.js'));
  const r = run('https://sippo-pc.jp/');
  const paths = ['/', '/index.html', '/gpu-guide/', '/gpu-guide/gpu/rx-9070/', '/pc-build-check/builds/fhd-fps-15man.html', '/game-pc-guide/games/apex.html', '/pc-builder/', '/upgrade/rtx3060/', '/pc-builds-hub/all-posts.html', '/pc-consult/', '/favicon.png', '/pc-builder'];
  ok('サービス判定が Sippo CONTROL と一致', paths.every((p) => r.win.SippoAnalytics._serviceOf(p) === ctrl.serviceOf(p)), paths.filter((p) => r.win.SippoAnalytics._serviceOf(p) !== ctrl.serviceOf(p)).join());
}

/* ================= 4. 追加イベント ================= */
{
  const s = fs.readFileSync(path.join(ROOT, 'gpu-guide/gpu-search.js'), 'utf8');
  const line = s.split('\n').find((l) => l.includes("'gpu_search_select'")) || '';
  ok('GPU検索：選んだGPUのIDだけを送る', /gpu_id: item\.id/.test(line) && !/input\.value|query/.test(line));
  const g = fs.readFileSync(path.join(ROOT, 'game-pc-guide/script.js'), 'utf8');
  const block = (g.match(/form\.addEventListener\("change", function \(e\) \{[\s\S]*?\}\);/) || [''])[0];
  ok('ゲーム絞り込み：選択式の項目だけ送る（自由入力は送らない）', /game_filter/.test(block) && /tagName !== "SELECT"/.test(block));
  const sw = fs.readFileSync(path.join(ROOT, 'pc-build-check/sw.js'), 'utf8');
  ok('PC BUILD CHECK の SW がローダーをキャッシュ対象に持つ', sw.includes("'/shared/analytics/sippo-analytics.js'"));
}

console.log('\nGA4 計測テスト');
if (failures.length) { console.log('\n失敗:'); failures.slice(0, 40).forEach((f) => console.log('  ✗ ' + f)); }
console.log(`\n  成功: ${pass}   失敗: ${fail}`);
process.exitCode = fail ? 1 : 0;
