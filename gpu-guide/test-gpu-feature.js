/* =====================================================================
 *  GPU GUIDE 追加コンテンツ 検証テスト (test-gpu-feature.js)
 *  ---------------------------------------------------------------------
 *  実行: node gpu-guide/test-gpu-feature.js
 *
 *  content/<id>.json を持つGPUページ（2026-11-09〜 RX 9070）と、
 *  そのとき直した全GPU共通の表記を、本番の生成物に対して検証する。
 *   - 追加セクションが再生成後も残っているか（生成物の直接編集で消えないか）
 *   - 数値が唯一の情報源（gpus.json / prices.json / GPU_POWER_SPEC）と一致するか
 *   - 実機レビューに実測値（fps・温度・騒音・消費電力の数値）を創作していないか
 *   - 構造化データに存在しない評価（Review / AggregateRating）が無いか
 *   - AMDのページに DLSS を「使える機能」として書いていないか
 *   - 推奨電源が公式値を下回っていないか
 *   - 生成が決定的（同じ入力で同じ出力）か
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = __dirname;
const ROOT = path.join(DIR, '..');
const GPU_DIR = path.join(DIR, 'gpu');
const BASE = 'https://sippo-pc.jp/gpu-guide';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

const gpus = readJson(path.join(DIR, 'gpus.json'));
const prices = readJson(path.join(ROOT, 'pc-builder', 'data', 'prices.json'));
const POWER = require(path.join(ROOT, 'upgrade', 'upgrade-engine.js')).GPU_POWER_SPEC;
const byId = {};
gpus.forEach((g) => { byId[g.id] = g; });

let pass = 0;
let fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; return; }
  fail++;
  failures.push(name + (detail ? '  → ' + detail : ''));
}

function page(id) {
  return fs.readFileSync(path.join(GPU_DIR, id, 'index.html'), 'utf8');
}
function section(html, id) {
  const start = html.indexOf(`id="${id}"`);
  if (start < 0) return '';
  const end = html.indexOf('</section>', start);
  return html.slice(start, end);
}
function lds(html) {
  return (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [])
    .map((b) => JSON.parse(b.replace(/<script type="application\/ld\+json">/, '').replace(/<\/script>/, '').replace(/\\u003c/g, '<')));
}
const yen = (n) => `約${Number(n).toLocaleString('ja-JP')}円`;

/* ------------------------------------------------------------------
 *  1. content/<id>.json があるページ
 * ------------------------------------------------------------------ */
const CONTENT_DIR = path.join(DIR, 'content');
const featureIds = fs.existsSync(CONTENT_DIR)
  ? fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
  : [];
ok('追加コンテンツが1件以上ある', featureIds.length > 0);

featureIds.forEach((id) => {
  const f = readJson(path.join(CONTENT_DIR, id + '.json'));
  const g = byId[id];
  ok(`content の id が gpus.json に存在する: ${id}`, Boolean(g));
  if (!g) return;
  const html = page(id);

  // 再生成後も残っている（生成処理に実装されている）
  ['verdict', 'versus', 'review', 'vram-ai', 'model', 'faq', 'sources'].forEach((sec) => {
    if (f[sec === 'vram-ai' ? 'vramAi' : sec] || sec === 'sources' || sec === 'faq') {
      ok(`セクション #${sec} がある: ${id}`, html.indexOf(`id="${sec}"`) > -1);
    }
  });
  (f.toc || []).forEach((t) => ok(`目次 #${t.id} の飛び先がある: ${id}`, html.indexOf(`id="${t.id}"`) > -1));
  ok(`未解決の差し込みが無い: ${id}`, html.indexOf('{{') < 0);

  // 結論は冒頭（スペック表より前）にある
  ok(`結論がスペックより前にある: ${id}`,
    html.indexOf('id="verdict"') > -1 && html.indexOf('id="verdict"') < html.indexOf('の基本スペック'));

  // SEO：URL・index可能性は維持、title/description は content と一致
  const canon = (html.match(/rel="canonical" href="([^"]*)"/) || [])[1];
  ok(`canonical は従来URLのまま: ${id}`, canon === `${BASE}/gpu/${id}/`);
  ok(`noindex が無い: ${id}`, !/name="robots"[^>]*noindex/i.test(html));
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  ok(`title が content の seo.title: ${id}`, f.seo ? title === f.seo.title : true, title);
  const ogTitle = (html.match(/property="og:title" content="([^"]*)"/) || [])[1];
  ok(`og:title = title: ${id}`, ogTitle === title);
  ok(`h1 は1つ: ${id}`, (html.match(/<h1[^>]*>/g) || []).length === 1);

  // 構造化データ：FAQ は画面と一致、存在しない評価を入れない
  const blocks = lds(html);
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  ok(`FAQPage がある: ${id}`, Boolean(faq));
  if (faq) {
    ok(`FAQPage の件数 = 画面のFAQ: ${id}`,
      faq.mainEntity.length === (html.match(/<details class="gf-faq-item">/g) || []).length
      && faq.mainEntity.length === f.faq.length);
    faq.mainEntity.forEach((q, i) => {
      ok(`FAQ[${i}] の質問が画面にある: ${id}`, html.indexOf(`<summary>${q.name}</summary>`) > -1, q.name);
      ok(`FAQ[${i}] の回答に差し込み残りが無い: ${id}`, q.acceptedAnswer.text.indexOf('{{') < 0);
    });
  }
  const ldText = JSON.stringify(blocks);
  ok(`構造化データに Review / AggregateRating が無い: ${id}`, !/"(Review|AggregateRating)"|aggregateRating|reviewRating|ratingValue/.test(ldText));
  ok(`TechArticle に dateModified がある: ${id}`, blocks.some((b) => b['@type'] === 'TechArticle' && b.dateModified === f._meta.updated));

  // 実機レビューに実測値を創作していない（fps・温度・騒音・W・速度の数値）
  const review = section(html, 'review');
  ok(`実機レビューがある: ${id}`, review.length > 0);
  ok(`実機レビューにfpsの数値が無い: ${id}`, !/\d+\s*(fps|FPS)/.test(review));
  ok(`実機レビューに温度・騒音の数値が無い: ${id}`, !/\d+\s*(℃|°C|dB)/.test(review));
  ok(`実機レビューに消費電力の数値が無い: ${id}`, !/\d+\s*W(?![a-zA-Z])/.test(review));
  ok(`実機レビューにトークン速度の数値が無い: ${id}`, !/\d+\s*(tokens?\/s|it\/s|トークン)/.test(review));
  ok(`実機レビューに計測していない旨がある: ${id}`, review.indexOf('計測していません') > -1);
  ok(`実機レビューが「GPUだけの効果」と断定していない: ${id}`, review.indexOf('GPUだけの効果とは言い切れません') > -1);
  ok(`実機レビューは一般化しない（全環境で起きるとは言わない）: ${id}`, review.indexOf('すべてのRX 9070やAMD環境で起きるという意味ではありません') > -1);

  // 推測URLの外部レビューへのリンクを入れていない（note は実在確認できたときだけ）
  ok(`note へのリンクが無い（実在URL未確認）: ${id}`, !/href="https?:\/\/note\.com/.test(html));

  // 導線：PC BUILDER（GPU選択状態）、比較、他サービス
  ok(`PC BUILDER へ GPU 指定で遷移する: ${id}`, html.indexOf(`href="/pc-builder/?gpuid=${id}"`) > -1);
  ['/pc-build-check/', '/game-pc-guide/', '/gpu-guide/#compare'].forEach((h) =>
    ok(`導線 ${h}: ${id}`, html.indexOf(`href="${h}"`) > -1));
  ok(`アフィリエイト基盤と広告表記を保持: ${id}`,
    html.indexOf('/shared/affiliate/affiliate.js') > -1 && html.indexOf('site-footer__affiliate-note') > -1);

  // 比較相手・関連GPUへのリンクが実在ページを指す
  const vs = f.versus;
  if (vs) {
    [vs.targetId].concat((vs.others || []).map((o) => o.id)).forEach((t) => {
      ok(`比較先 ${t} へのリンク: ${id}`, section(html, 'versus').indexOf(`href="../${t}/"`) > -1);
      ok(`比較先 ${t} のページが実在: ${id}`, fs.existsSync(path.join(GPU_DIR, t, 'index.html')));
    });
  }
});

/* ------------------------------------------------------------------
 *  2. RX 9070 固有：数値が唯一の情報源と一致する
 * ------------------------------------------------------------------ */
(function () {
  if (featureIds.indexOf('rx-9070') < 0) return;
  const html = page('rx-9070');
  const vs = section(html, 'versus');
  const p9070 = prices.gpuChips['rx-9070'];
  const p5070 = prices.gpuChips['rtx-5070'];

  ok('RX 9070：比較表の参考価格 = prices.json', vs.indexOf(yen(p9070.value)) > -1 && vs.indexOf(yen(p5070.value)) > -1);
  ok('RX 9070：比較表に価格の確認日がある', vs.indexOf('2026年10月31日確認') > -1 || vs.indexOf(p9070.checkedAt) > -1);
  ok('RX 9070：比較表のスコア = gpus.json', vs.indexOf(`${byId['rx-9070'].rasterScore}/100`) > -1 && vs.indexOf(`${byId['rtx-5070'].rasterScore}/100`) > -1);
  ok('RX 9070：比較表の推奨電源 = 公式値', vs.indexOf(`${POWER.rx9070.psu}W以上`) > -1 && vs.indexOf(`${POWER.rtx5070.psu}W以上`) > -1);
  ok('RX 9070：スコアは実測FPSではないと明記', section(html, 'verdict').indexOf('実測のFPSではなく') > -1);
  ok('RX 9070：VRAM 16GB / 12GB を比較している', vs.indexOf('16GB GDDR6') > -1 && vs.indexOf('12GB GDDR7') > -1);
  ok('RX 9070：性能の勝敗は条件で変わると説明', vs.indexOf('ゲーム・設定・機能') > -1);

  // 製品固有（ASRock）と GPU共通（AMD）の推奨電源を区別している
  const model = section(html, 'model');
  ok('Steel Legend：700W（ASRock）と650W（AMD）を区別', model.indexOf('700W（ASRockの推奨）') > -1 && model.indexOf(`${POWER.rx9070.psu}W以上（AMDの最小推奨）`) > -1);
  ok('Steel Legend：サイズ 298 × 131 × 58mm', model.indexOf('298 × 131 × 58mm') > -1);
  ok('Steel Legend：2.9スロット・8ピン×2', model.indexOf('2.9スロット') > -1 && model.indexOf('8ピン×2') > -1);
  ok('Steel Legend：実機撮影と称する写真を載せていない', !/<img[^>]*(steel|legend|asrock)/i.test(html) && html.indexOf('実機撮影') < 0);

  // ローカルAI：「16GBならどのAIでも動く」と書かない／NVIDIAが便利な場合を明記
  const ai = section(html, 'vram-ai');
  ok('ローカルAI：16GBでも全AIが動くわけではないと明記', ai.indexOf('どのAIでも動くわけではありません') > -1);
  ok('ローカルAI：Windowsの制約を明記', ai.indexOf('Windows') > -1 && ai.indexOf('PyTorch') > -1);
  ok('ローカルAI：NVIDIAが便利な場合を明記', ai.indexOf('NVIDIAの方が便利な場合もあります') > -1);

  // RX 9070 自身の機能として DLSS を書いていない（DLSS は比較相手側・説明でのみ登場）
  const spec = section(html, 'verdict');
  ok('RX 9070：評価カードでDLSSを「使える」と書いていない', !/DLSS[^。]{0,20}(使えます|に対応)/.test(spec.replace(/DLSSは[^。]*使えません/g, '')));
  ok('RX 9070：解像度表の補足はFSRのみ', html.indexOf('アップスケーリング（DLSS/FSR）') < 0);

  // CPU相性の過度な断定を外した
  ok('RX 9070：CPU相性に「ボトルネックになることはなく」「完全に発揮」が無い',
    html.indexOf('ボトルネックになることはなく') < 0 && html.indexOf('完全に発揮') < 0 && html.indexOf('最強構成') < 0);

  // PC BUILDER が ?gpuid=rx-9070 を受け取れる（遷移先で RX 9070 が選択済みになる）
  const Db = require(path.join(ROOT, 'pc-builder', 'js', 'pb-db.js'));
  const Import = require(path.join(ROOT, 'pc-builder', 'js', 'pb-import.js'));
  const db = Db.buildDb({
    parts: readJson(path.join(ROOT, 'pc-builder', 'data', 'parts.json')),
    rules: readJson(path.join(ROOT, 'pc-builder', 'data', 'rules.json')),
    gpus,
    partPrices: readJson(path.join(ROOT, 'shared', 'parts', 'part-prices.json')),
    engine: require(path.join(ROOT, 'upgrade', 'upgrade-engine.js')),
    gpuTarget: require(path.join(ROOT, 'shared', 'gpu', 'gpu-target.js')),
    prices,
    now: new Date('2026-11-09T12:00:00+09:00'),
  });
  const r = Import.resolve(db, { gpuid: 'rx-9070' });
  ok('PC BUILDER：?gpuid=rx-9070 で RX 9070 が選択される',
    Boolean(r && r.slots[0] && r.slots[0].part && r.slots[0].part.id === 'rx-9070'));
})();

/* ------------------------------------------------------------------
 *  3. 全GPU共通の表記（2026-11-09 に直したもの）
 * ------------------------------------------------------------------ */
gpus.forEach((g) => {
  const html = page(g.id);
  ok(`スコアは実測FPSではないと明記: ${g.id}`, html.indexOf('実測のFPSではありません') > -1);
  ok(`Review / AggregateRating が無い: ${g.id}`, !/"(Review|AggregateRating)"|aggregateRating/.test(html));
  if (g.brand !== 'NVIDIA' || !/RTX/.test(g.name)) {
    ok(`DLSS非対応GPUの解像度表にDLSSが無い: ${g.id}`, html.indexOf('アップスケーリング（DLSS/FSR）') < 0);
    ok(`DLSS非対応GPUの長所にDLSSが無い: ${g.id}`, html.indexOf('DLSS・レイトレーシングなど最新世代の機能') < 0);
  }
  const spec = POWER[g.id.replace(/-/g, '')];
  if (spec) {
    ok(`推奨電源は公式値: ${g.id}`, html.indexOf(`<h3>${spec.psu}W以上</h3>`) > -1, String(spec.psu));
  }
});

/* ------------------------------------------------------------------
 *  4. 逆リンク：関連GPUのページから追加コンテンツのページへ
 * ------------------------------------------------------------------ */
featureIds.forEach((id) => {
  const f = readJson(path.join(CONTENT_DIR, id + '.json'));
  Object.keys(f.backlinks || {}).forEach((from) => {
    const b = f.backlinks[from];
    const anchor = typeof b === 'string' ? 'versus' : (b.anchor || 'versus');
    ok(`${from} → ${id}#${anchor} の案内がある`, page(from).indexOf(`href="../${id}/#${anchor}"`) > -1);
    ok(`${id} に #${anchor} がある`, page(id).indexOf(`id="${anchor}"`) > -1);
  });
});

/* ------------------------------------------------------------------
 *  5. 生成が決定的（再生成で同じ出力・本番と一致）
 * ------------------------------------------------------------------ */
(function () {
  const preview = path.join(DIR, '.generated-preview');
  try {
    execFileSync(process.execPath, [path.join(DIR, 'generate-gpu-pages.js'), '--dry-run'], { stdio: 'pipe' });
    const diff = gpus.filter((g) =>
      fs.readFileSync(path.join(preview, g.id, 'index.html'), 'utf8') !== page(g.id)).map((g) => g.id);
    ok('再生成した結果が本番の生成物と一致する（生成物を直接編集していない）', diff.length === 0, diff.slice(0, 6).join(', '));
  } catch (e) {
    ok('generate-gpu-pages.js --dry-run が成功する', false, String(e.message).slice(0, 200));
  } finally {
    if (fs.existsSync(preview)) fs.rmSync(preview, { recursive: true, force: true });
  }
})();

/* ------------------------------------------------------------------ */
console.log('');
console.log('  GPU GUIDE 追加コンテンツ テスト結果');
console.log('  ----------------------------------');
console.log('  成功: ' + pass);
console.log('  失敗: ' + fail);
if (failures.length) {
  console.log('');
  failures.slice(0, 40).forEach((f) => console.log('  × ' + f));
  if (failures.length > 40) console.log('  ... 他 ' + (failures.length - 40) + ' 件');
}
console.log('');
process.exit(fail === 0 ? 0 : 1);
