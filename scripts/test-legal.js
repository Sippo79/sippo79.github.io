/**
 * 特定商取引法に基づく表記（/legal/）と、内部ファイルの公開防止の検証
 *
 *   node scripts/test-legal.js            … 構造・リンク・個人情報の非掲載・公開防止を検査（未決定項目は件数を表示）
 *   node scripts/test-legal.js --release  … 公開前の確認用。【要決定】が1つでも残っていれば失敗する
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RELEASE = process.argv.includes('--release');
const URL_ = 'https://sippo-pc.jp/legal/';
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail) { if (cond) pass++; else { fail++; failures.push(name + (detail ? '  → ' + detail : '')); } }

/* ================= 1. ページ ================= */
const html = read('legal/index.html');
const head = (html.match(/<head[\s\S]*?<\/head>/i) || [''])[0];
const body = html.replace(/<head[\s\S]*?<\/head>/i, '');
const text = body.replace(/<[^>]+>/g, ' ');
const meta = (attr, name) => ((head.match(new RegExp(`<meta[^>]*${attr}="${name}"[^>]*content="([^"]*)"`)) || [])[1]);
ok('title', /<title>特定商取引法に基づく表記 \| Sippo（シッポ）<\/title>/.test(head));
ok('description', (meta('name', 'description') || '').length >= 50);
ok('canonical = 正式URL', head.includes(`<link rel="canonical" href="${URL_}">`) && meta('property', 'og:url') === URL_);
for (const p of ['og:title', 'og:description', 'og:image', 'og:image:width', 'og:image:height', 'og:locale']) ok('OGP ' + p, !!meta('property', p));
ok('noindex にしない', !/noindex/i.test(html));
ok('h1 はちょうど1つ', (html.match(/<h1\b/g) || []).length === 1);
ok('GA4 ローダーを1回だけ読む', html.split('<script src="/shared/analytics/sippo-analytics.js"></script>').length === 2 && !/googletagmanager/.test(html));
ok('プライバシーポリシーと同じ見た目（privacy.css・privacy.js を共用）', html.includes('"/privacy/privacy.css"') && html.includes('"/privacy/privacy.js"'));
ok('トップ専用の /script.js を読まない', !html.includes('"/script.js"'));
for (const a of ['/style.css', '/shared/nav/sippo-nav.css', '/privacy/privacy.css', '/legal/legal.css', '/shared/nav/sippo-nav.js', '/privacy/privacy.js']) ok('参照ファイルが実在: ' + a, fs.existsSync(path.join(ROOT, a.slice(1))));
const ids = new Set([...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
ok('ページ内リンクの行き先が実在', [...body.matchAll(/href="#([^"]+)"/g)].every((m) => ids.has(m[1])));
ok('別タブのリンクは rel="noopener noreferrer"', [...body.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].every((m) => /rel="noopener noreferrer"/.test(m[0])));
ok('構造化データ（パンくず）が正しいJSON', (() => { try { return JSON.parse((html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1])['@type'] === 'BreadcrumbList'; } catch { return false; } })());

/* ================= 2. 記載事項（消費者庁「通信販売広告について」の項目） ================= */
for (const [label, re] of [
  ['販売価格', /販売価格/], ['代金以外に必要な料金', /代金以外に必要な料金/], ['支払方法', /支払方法/], ['支払時期', /支払時期/],
  ['提供時期', /提供時期/], ['キャンセル・返金（申込みの撤回・解除）', /キャンセル・返金/], ['申込みの方法', /申込みの方法/],
  ['クーリング・オフが無い旨', /クーリング・オフの制度はありません/], ['事業者の氏名・所在地・電話番号の扱い', /販売事業者（氏名）[\s\S]*所在地[\s\S]*電話番号/],
]) ok('記載事項: ' + label, re.test(text));
ok('請求時開示の表示（遅滞なく・電子メールで）', /氏名、所在地、電話番号は、ご請求があった場合に、遅滞なく電子メールでお知らせします/.test(text));
ok('屋号だけで済ませていない（氏名は請求時開示と明記）', /販売事業者（氏名）\s*ご請求があった場合に/.test(text));

// 実際の販売形態と一致
const consult = read('pc-consult/index.html');
ok('500円（税込）・1件の表示が相談室ページと一致', /500円（税込）。1回のお支払いで、候補PC 1件の診断です/.test(text) && /料金は500円（税込）で、候補PC 1件の診断です/.test(consult.replace(/<[^>]+>/g, '')));
ok('前払い（Square決済後にフォーム）の流れが相談室ページと一致', /前払い/.test(text) && /お支払い後、自動で相談フォームへ移動します/.test(consult) && /square\.link/.test(consult));
// 運営者が確定した販売条件（2026-11-14 確定：回答期限は暦日で7日以内）。文言を変えるときは相談室ページと両方を直す
ok('回答期限：決済とフォーム送信の両方の完了から7日以内', /決済と相談フォームの送信が両方完了してから\s*7日以内/.test(text));
ok('回答期限：土日祝日も含めて数える（暦日）', /7日は土日祝日も含めて数えます/.test(text));
ok('回答期限：起点（翌日を1日目）と具体例', /両方が完了した日の翌日を1日目とします/.test(text) && /11月2日（月）に両方完了 → 11月9日（月）までにお送りします/.test(text));
ok('回答期限：例の日付が7日後で正しい', (() => { const d = new Date('2026-11-02T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 7); return d.getUTCMonth() === 10 && d.getUTCDate() === 9 && d.getUTCDay() === 1; })());
ok('情報不足：速やかに追加情報を求める', /速やかにメールで追加の情報をお願いします/.test(text));
ok('情報不足：回答期限を一方的に延ばさない', /回答期限を一方的に延ばすことはありません/.test(text) && !/そろった日から数え/.test(text));
ok('期限変更は利用者の同意を得てから', /ご同意をいただいたうえで変更します/.test(text));
ok('旧表記（営業日）が表記ページに残っていない', !/営業日/.test(text));
ok('返金：送信前のキャンセルは原則全額返金', /診断結果をお送りする前にキャンセルをお申し出いただいた場合は、原則として全額を返金します/.test(text));
ok('返金：送信後の利用者都合は原則不可', /診断結果をお送りした後は、お客様のご都合による返金は原則としてお受けしていません/.test(text));
ok('返金：期限を守れない場合は連絡して全額返金', /回答期限（7日以内）を守れない場合は、こちらからご連絡し、全額を返金します/.test(text));
ok('返金：運営者都合も全額返金', /運営者の都合でサービスを提供できない場合も、全額を返金します/.test(text));
ok('返金：原則 Square を通じて返金', /原則として Square を通じて/.test(text));
ok('返金：法令上の権利を制限しない', /法令によりお客様に認められる契約の解除や返金の権利を制限するものではありません/.test(text));
ok('キャンセルの連絡先は既存の問い合わせメール', /キャンセル・返金のご連絡は\s*sippo\.pc@gmail\.com/.test(text));
const consultText = consult.replace(/<[^>]+>/g, ' ');
ok('相談室ページの回答期限が表記と一致（7日以内・土日祝日も含む）', /両方完了してから\s*7日以内\s*（土日祝日も含めて数えます）/.test(consultText));
ok('相談室ページに旧表記（営業日・確認でき次第）が無い', !/営業日/.test(consultText) && !/確認でき次第、順番に返信/.test(consultText));
ok('相談室ページのキャンセル説明が表記と矛盾しない', /診断結果をお送りする前ならキャンセル・全額返金ができます/.test(consultText) && /期限内に返信できない場合も全額返金します/.test(consultText));
// 公開ページ全体に旧表記（5営業日）が残っていない
ok('公開ページに旧表記「5営業日」が残っていない', (() => { const bad = []; const w = (d, rel = '') => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.') || e.name.startsWith('_') || e.name === 'node_modules') continue; const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) w(path.join(d, e.name), r); else if (/\.(html|js)$/.test(e.name) && !r.startsWith('scripts/') && /5営業日/.test(fs.readFileSync(path.join(d, e.name), 'utf8'))) bad.push(r); } }; w(ROOT); return bad.length === 0; })());
ok('1,500円はココナラの取引（条件はココナラの規約）と明記', /1,500円/.test(text) && /ココナラの利用規約とサービスページの表示に従います/.test(text));
const coco = (consult.match(/https:\/\/coconala\.com\/services\/\d+/) || [])[0];
ok('ココナラのリンクが相談室ページと同じサービス', !!coco && html.includes(`href="${coco}"`));

/* ================= 3. 個人情報を掲載していない ================= */
ok('電話番号を掲載していない', !/0\d{1,4}[-‐ー]\d{1,4}[-‐ー]\d{3,4}|\b0[5789]0\d{8}\b/.test(text));
ok('郵便番号・住所を掲載していない', !/〒|\b\d{3}-\d{4}\b|(都|道|府|県)[^、。\s]{1,10}(市|区|町|村)/.test(text));
const mails = [...new Set([...html.matchAll(/[\w.+-]+@[\w-]+\.[\w.]+/g)].map((m) => m[0]))];
ok('メールアドレスは公開用の1つだけ', mails.length === 1 && mails[0] === 'sippo.pc@gmail.com', mails.join());
ok('管理ツール・認証情報に触れていない', !/_control|secrets|service_account|private_key/.test(html));

/* ================= 4. 導線・サイトマップ ================= */
const LINK = 'href="/legal/"';
const apply = (consult.match(/<a href="https:\/\/square\.link[^"]*"[\s\S]{0,1200}?<\/div>\s*<p[^>]*>[\s\S]*?<\/p>/) || [''])[0];
ok('相談室：500円の申込みボタンのすぐ下からリンク', apply.includes(LINK));
ok('相談室：フッターからリンク', ((consult.match(/<footer[\s\S]*?<\/footer>/) || [''])[0]).includes(LINK));
ok('トップ：フッターからリンク', ((read('index.html').match(/<footer[\s\S]*?<\/footer>/) || [''])[0]).includes(LINK));
ok('プライバシーポリシー：本文とフッターからリンク', read('privacy/index.html').split(LINK).length - 1 >= 2);
const sm = read('sitemap-main.xml');
ok('sitemap-main.xml に1回だけ載る', sm.split(`<loc>${URL_}</loc>`).length === 2);
ok('sitemap-main.xml の <url> の開閉が一致', (sm.match(/<url>/g) || []).length === (sm.match(/<\/url>/g) || []).length);

/* ================= 5. 内部ファイルの公開防止 ================= */
// (a) GitHub Pages：_config.yml の exclude
const cfg = read('_config.yml');
const excludes = [];
let inEx = false;
for (const line of cfg.split(/\r?\n/)) {
  if (/^exclude:\s*$/.test(line)) { inEx = true; continue; }
  if (inEx && /^\S/.test(line)) inEx = false;
  const m = inEx && line.match(/^\s+-\s+(.+?)\s*$/);
  if (m) excludes.push(m[1].replace(/^['"]|['"]$/g, ''));
}
ok('_config.yml の YAML が単純な形（タブなし・exclude のみ）', !/\t/.test(cfg) && excludes.length > 0 && cfg.split(/\r?\n/).filter((l) => /^\S/.test(l) && !/^#/.test(l)).every((l) => /^exclude:\s*$/.test(l)));
for (const need of ['_control', 'AI_WORK_LOG.md', 'PROJECT_STATUS.md', 'README.md', 'pc-builds-hub/supabase-schema.sql', 'pc-builds-hub/SETUP_SUPABASE.md']) ok('Pages で配信しない: ' + need, excludes.includes(need));
ok('除外の対象がすべて実在（綴り間違いなし）', excludes.every((e) => fs.existsSync(path.join(ROOT, e))), excludes.filter((e) => !fs.existsSync(path.join(ROOT, e))).join());
function walk(dir, acc = [], rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('_') || e.name === 'node_modules') continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (excludes.some((x) => r === x || r.startsWith(x + '/'))) continue;
    if (e.isDirectory()) walk(path.join(dir, e.name), acc, r); else if (/\.(html|js|css|json|webmanifest|xml)$/.test(e.name)) acc.push(r);
  }
  return acc;
}
const published = walk(ROOT);
const refsExcluded = [];
for (const f of published) {
  const s = read(f);
  for (const x of excludes) {
    const re = new RegExp(`(href|src)=["'](https://sippo-pc\\.jp)?/?${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(["'/?#])`);
    if (re.test(s)) refsExcluded.push(`${f} → ${x}`);
  }
}
ok('公開ページが除外したファイルを参照していない（表示が壊れない）', refsExcluded.length === 0, refsExcluded.slice(0, 5).join(', '));
// (b) GitHub リポジトリ：_control はフォルダごと追跡しない
const gi = read('.gitignore');
ok('.gitignore で _control/ をフォルダごと除外', /^_control\/$/m.test(gi));
let tracked = [];
try { tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split(/\r?\n/); } catch { /* git が無い環境 */ }
ok('_control 配下が git で追跡されていない', !tracked.some((t) => t.startsWith('_control/')));
ok('サービスアカウント鍵らしきファイルが追跡されていない', !tracked.some((t) => /service-account.*\.json$|sa-key.*\.json$/i.test(t)));

/* ================= 6. 公開前の未決定項目・運営者の確認 ================= */
const todos = [...body.matchAll(/<span class="legal__todo">([\s\S]*?)<\/span>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
const checklist = JSON.parse(read('scripts/release-checklist.json'));
const sq = checklist.square;
// 確認状況とページの記載が矛盾しないこと（常に検査）
ok('支払方法：クレジットカードを記載（Square 公式仕様で常に有効）', sq.creditCard.status === 'confirmed' && /支払方法\s*クレジットカード/.test(text));
ok('支払方法：Google Pay の記載が確認状況と一致', (sq.googlePay.status === 'confirmed') === /Google Pay/.test(text));
ok('支払方法：Apple Pay は確認できるまで記載しない（enabled のときだけ記載）', (sq.applePay.status === 'enabled') === /Apple Pay/.test(text));
ok('支払方法：確認していない決済方法（PayPay・コンビニ・銀行振込など）を書かない', !/PayPay|コンビニ|銀行振込|Square Pay|後払い/.test(text.replace(/Square の決済ページ/g, '')));
if (sq.quantity.status === 'rule-published') ok('数量2以上の扱いを記載', /数量/.test(text));
// 公開前ゲート：ページの未決定印と、運営者の確認がすべて済んでいること
const pending = [];
if (todos.length) pending.push(...todos);
if (!['enabled', 'disabled'].includes(sq.applePay.status)) pending.push('Square：Apple Pay の有効/無効を確認（scripts/release-checklist.json の square.applePay）');
if (sq.descriptionAndPolicy.status !== 'done') pending.push('Square：決済リンクの説明文・加盟店ポリシーに販売条件を登録（square.descriptionAndPolicy）');
if (!['fixed-1', 'rule-published'].includes(sq.quantity.status)) pending.push('Square：数量を1に固定、または数量2以上の扱いを決めて表記（square.quantity）');
if (sq.chargedTotal.status !== 'verified-500') pending.push('Square：決済画面の合計が500円（加算なし）であることを確認（square.chargedTotal）');
if (RELEASE) ok('公開前：未決定・未確認の項目が残っていない', pending.length === 0, pending.join(' / '));

console.log('\n特定商取引法表記・公開防止 テスト');
if (failures.length) { console.log('\n失敗:'); failures.forEach((f) => console.log('  ✗ ' + f)); }
if (pending.length) { console.log(`\n  公開前に運営者が行う確認・設定（${pending.length}件。済んだら scripts/release-checklist.json を更新し、--release で確認）:`); pending.forEach((t) => console.log('   - ' + t)); }
console.log(`\n  成功: ${pass}   失敗: ${fail}`);
process.exitCode = fail ? 1 : 0;
