#!/usr/bin/env node
/* =====================================================================
 *  アフィリエイト直リンク 死活チェック（診断のみ）
 *  ---------------------------------------------------------------------
 *  使い方:
 *    node scripts/check-affiliate-links.js
 *    node scripts/check-affiliate-links.js --shop amazon
 *    node scripts/check-affiliate-links.js --csv report.csv
 *    node scripts/check-affiliate-links.js --limit 20 --concurrency 3
 *
 *  ★このスクリプトは商品マスターを一切書き換えません。★
 *  Amazon / 楽天は Bot 対策・リダイレクト・地域判定があるため、
 *  HTTPステータスだけでは「本当にリンク切れか」を確定できません。
 *  したがって自動で sold-out に変更することはせず、
 *  「要確認」としてレポートに出すだけに留めます。
 *  最終判断は必ず人間がブラウザで開いて行ってください。
 *
 *  判定:
 *    正常       2xx で最終URLが正しいショップのドメイン内
 *    要確認     3xx の行き先が怪しい / 403・429（Bot対策の可能性）/
 *               タイムアウト / 商品ページからトップに飛ばされた 等
 *    リンク切れ  404 / 410（明確に存在しない）
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const MASTER_PATH = path.join(__dirname, '..', 'shared', 'affiliate', 'affiliate-master.json');

/* ---------------- 引数 ---------------- */
function parseArgs(argv) {
  const args = { shop: '', csv: '', limit: 0, concurrency: 4, timeout: 15000 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--shop') args.shop = String(argv[++i] || '').toLowerCase();
    else if (a === '--csv') args.csv = String(argv[++i] || '');
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10) || 0;
    else if (a === '--concurrency') args.concurrency = Math.max(1, parseInt(argv[++i], 10) || 4);
    else if (a === '--timeout') args.timeout = Math.max(1000, parseInt(argv[++i], 10) || 15000);
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
  }
  return args;
}

function printHelp() {
  console.log([
    'アフィリエイト直リンク 死活チェック（診断のみ / マスターは書き換えません）',
    '',
    '  node scripts/check-affiliate-links.js [options]',
    '',
    '  --shop <amazon|rakuten|yahoo>  対象ショップを限定',
    '  --csv  <path>                  結果をCSVに保存',
    '  --limit <n>                    先頭n件だけ確認（お試し用）',
    '  --concurrency <n>              同時リクエスト数（既定4／上げすぎ注意）',
    '  --timeout <ms>                 1件あたりのタイムアウト（既定15000）',
  ].join('\n'));
}

/* ---------------- 判定ヘルパ ---------------- */
const SHOP_LABEL = { amazon: 'Amazon', rakuten: '楽天', yahoo: 'Yahoo' };

/* 最終URLがそのショップの正しいドメインに着地しているか */
const SHOP_HOST_PATTERN = {
  amazon: /(^|\.)amazon\.co\.jp$/i,
  rakuten: /(^|\.)rakuten\.co\.jp$/i,
  yahoo: /(^|\.)(yahoo\.co\.jp|lohaco\.yahoo\.co\.jp)$/i,
};

/* 「商品が無いのでトップ/エラーに飛ばされた」ことを示唆するURLか */
function looksLikeLandingPage(shop, url) {
  let u;
  try { u = new URL(url); } catch (e) { return false; }
  const p = u.pathname;
  if (shop === 'amazon') {
    if (/cs_404|\/errors?\//i.test(u.href)) return true;
    if (p === '/' || p === '') return true;
  }
  if (shop === 'rakuten') {
    if (p === '/' || p === '') return true;
    if (/^\/(error|notfound)/i.test(p)) return true;
  }
  if (shop === 'yahoo') {
    if (p === '/' || p === '') return true;
  }
  return false;
}

/* affiliate.js の isRealUrl と同じ判定（プレースホルダURLを除外する） */
function isRealUrl(url) {
  if (!url) return false;
  const u = String(url);
  if (u === '#') return false;
  if (u.indexOf('xxxxx') !== -1) return false;
  if (u.indexOf('example.com') !== -1) return false;
  return /^https?:\/\//.test(u);
}

/* ---------------- 1件チェック ---------------- */
async function checkOne(entry, args) {
  const { url, shop } = entry;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeout);

  const result = Object.assign({}, entry, {
    httpStatus: '', finalUrl: '', verdict: '', note: '', ms: 0,
  });

  try {
    // HEAD は Amazon/楽天で弾かれやすいので GET。本文は読み捨てる。
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // 実ブラウザに近いUAでないと 403 を返すサイトが多い
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9',
      },
    });
    result.httpStatus = res.status;
    result.finalUrl = res.url || '';
    try { await res.arrayBuffer(); } catch (e) { /* 本文は使わない */ }

    const code = res.status;
    let host = '';
    try { host = new URL(result.finalUrl || url).hostname; } catch (e) { host = ''; }
    const hostOk = SHOP_HOST_PATTERN[shop] ? SHOP_HOST_PATTERN[shop].test(host) : true;

    if (code === 404 || code === 410) {
      result.verdict = 'リンク切れ';
      result.note = 'HTTP ' + code + '（ページが存在しない）';
    } else if (code === 403 || code === 429 || code === 503) {
      // Amazon/楽天のBot対策で頻発する。リンク切れとは断定しない。
      result.verdict = '要確認';
      result.note = 'HTTP ' + code + '（Bot対策の可能性。ブラウザで目視確認）';
    } else if (code >= 500) {
      result.verdict = '要確認';
      result.note = 'HTTP ' + code + '（サーバー側エラー。時間をおいて再確認）';
    } else if (code >= 200 && code < 300) {
      if (!hostOk) {
        result.verdict = '要確認';
        result.note = '想定外のドメインに着地: ' + host;
      } else if (looksLikeLandingPage(shop, result.finalUrl || url)) {
        result.verdict = '要確認';
        result.note = '商品ページではなくトップ/エラーページに着地した可能性';
      } else {
        result.verdict = '正常';
        result.note = '';
      }
    } else {
      result.verdict = '要確認';
      result.note = 'HTTP ' + code;
    }
  } catch (err) {
    result.httpStatus = '-';
    result.verdict = '要確認';
    if (err && err.name === 'AbortError') {
      result.note = 'タイムアウト（' + args.timeout + 'ms）';
    } else {
      result.note = '通信エラー: ' + (err && err.message ? err.message : String(err));
    }
  } finally {
    clearTimeout(timer);
    result.ms = Date.now() - started;
  }
  return result;
}

/* ---------------- 並列実行（簡易プール） ---------------- */
async function runPool(items, worker, concurrency, onProgress) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  async function run() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
      done++;
      if (onProgress) onProgress(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

/* ---------------- 表示ヘルパ ---------------- */
/* 日本語（全角）を2桁として数え、列がずれないように詰める */
function pad(str, width) {
  const s = String(str == null ? '' : str);
  let w = 0;
  for (const ch of s) w += /[　-鿿＀-￯]/.test(ch) ? 2 : 1;
  return s + ' '.repeat(Math.max(0, width - w));
}

function truncate(str, max) {
  const s = String(str == null ? '' : str);
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* ---------------- main ---------------- */
async function main() {
  const args = parseArgs(process.argv);

  if (typeof fetch !== 'function') {
    console.error('このスクリプトは Node.js 18 以上が必要です（グローバル fetch を使用）。');
    console.error('現在のバージョン: ' + process.version);
    process.exit(2);
  }

  let master;
  try {
    master = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));
  } catch (err) {
    console.error('商品マスターを読み込めませんでした: ' + MASTER_PATH);
    console.error(err.message);
    process.exit(2);
  }

  const products = master.products || {};
  const targets = [];

  Object.keys(products).forEach((id) => {
    const p = products[id];
    ['amazon', 'rakuten', 'yahoo'].forEach((shop) => {
      if (args.shop && args.shop !== shop) return;
      const node = p[shop];
      // 直リンクが無い商品は対象外（検索フォールバックは切れようがない）
      if (!node || !isRealUrl(node.url)) return;
      targets.push({
        productId: id,
        name: p.name || id,
        shop,
        shopLabel: SHOP_LABEL[shop] || shop,
        status: node.status || p.status || 'search-only',
        url: node.url,
      });
    });
  });

  const list = args.limit > 0 ? targets.slice(0, args.limit) : targets;

  console.log('');
  console.log('アフィリエイト直リンク 死活チェック');
  console.log('  商品マスター : ' + path.relative(process.cwd(), MASTER_PATH));
  console.log('  登録商品数   : ' + Object.keys(products).length);
  console.log('  直リンク対象 : ' + list.length + ' 件' + (args.limit ? '（--limit 適用）' : ''));
  console.log('  同時実行数   : ' + args.concurrency + ' / タイムアウト ' + args.timeout + 'ms');
  console.log('');

  if (list.length === 0) {
    console.log('チェック対象の直リンクがありません（検索フォールバックのみの商品は対象外です）。');
    return;
  }

  process.stdout.write('確認中... ');
  const results = await runPool(list, (item) => checkOne(item, args), args.concurrency, (done, total) => {
    if (done % 5 === 0 || done === total) {
      process.stdout.write('\r確認中... ' + done + '/' + total + '   ');
    }
  });
  process.stdout.write('\r' + ' '.repeat(40) + '\r');

  /* 一覧（要確認・リンク切れを上に） */
  const rank = { 'リンク切れ': 0, '要確認': 1, '正常': 2 };
  results.sort((a, b) => (rank[a.verdict] - rank[b.verdict]) || a.productId.localeCompare(b.productId));

  console.log(pad('product_id', 24) + pad('商品名', 30) + pad('shop', 8) + pad('HTTP', 6) + pad('判定', 12) + '備考');
  console.log('-'.repeat(120));
  results.forEach((r) => {
    console.log(
      pad(truncate(r.productId, 22), 24) +
      pad(truncate(r.name, 26), 30) +
      pad(r.shopLabel, 8) +
      pad(r.httpStatus, 6) +
      pad(r.verdict, 12) +
      truncate(r.note, 46)
    );
  });

  /* URLは長いので、対応が要るものだけ詳細を出す */
  const attention = results.filter((r) => r.verdict !== '正常');
  if (attention.length) {
    console.log('');
    console.log('── 要対応の詳細 ' + '─'.repeat(50));
    attention.forEach((r) => {
      console.log('');
      console.log('  [' + r.verdict + '] ' + r.productId + ' / ' + r.name + '（' + r.shopLabel + '）');
      console.log('    status  : ' + r.status);
      console.log('    登録URL : ' + r.url);
      if (r.finalUrl && r.finalUrl !== r.url) console.log('    最終URL : ' + r.finalUrl);
      if (r.note) console.log('    備考    : ' + r.note);
    });
  }

  /* 集計 */
  const counts = results.reduce((acc, r) => {
    acc[r.verdict] = (acc[r.verdict] || 0) + 1;
    return acc;
  }, {});
  console.log('');
  console.log('── 集計 ' + '─'.repeat(58));
  console.log('  正常       : ' + (counts['正常'] || 0));
  console.log('  要確認     : ' + (counts['要確認'] || 0));
  console.log('  リンク切れ : ' + (counts['リンク切れ'] || 0));
  console.log('  合計       : ' + results.length);
  console.log('');
  console.log('※ このスクリプトは商品マスターを書き換えません。');
  console.log('※ Amazon/楽天はBot対策で 403 等を返すため、HTTPだけでは断定できません。');
  console.log('   「要確認」は必ずブラウザで開いて目視確認してから、');
  console.log('   status を sold-out / discontinued / disabled に手で変更してください。');
  console.log('');

  /* CSV出力 */
  if (args.csv) {
    const header = ['product_id', 'name', 'shop', 'status', 'url', 'http_status', 'final_url', 'verdict', 'note'];
    const lines = [header.join(',')];
    results.forEach((r) => {
      lines.push([
        r.productId, r.name, r.shopLabel, r.status, r.url,
        r.httpStatus, r.finalUrl, r.verdict, r.note,
      ].map(csvCell).join(','));
    });
    // Excelでの文字化けを防ぐため BOM 付きで書く
    fs.writeFileSync(args.csv, '﻿' + lines.join('\r\n') + '\r\n', 'utf8');
    console.log('CSVを書き出しました: ' + args.csv);
    console.log('');
  }

  // リンク切れがあっても異常終了はしない（診断が目的。CIを落とさない）
}

main().catch((err) => {
  console.error('予期しないエラー:', err);
  process.exit(1);
});
