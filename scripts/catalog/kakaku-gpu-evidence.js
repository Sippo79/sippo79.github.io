#!/usr/bin/env node
'use strict';
/**
 * 価格.com「グラフィックボード・ビデオカード 人気売れ筋ランキング」1〜5ページの保存HTMLから、
 * GPUチップごとの「掲載製品の最安値の中央値」の取得記録（evidence）を作る。
 *
 *   node scripts/catalog/kakaku-gpu-evidence.js <保存HTMLのフォルダ> <取得日時ISO> <出力JSON>
 *
 *   保存HTML: gpu1.html〜gpu5.html（Shift_JIS を UTF-8 に変換したもの。取得は手動または curl）
 *
 * ★この値は「ランキングに掲載された、価格表示のある製品の最安値の中央値」。
 *   市場全体の相場でも、販売数量で重み付けした値でもない。購入できる価格の保証でもない。
 * ★記録は取得した日のHTMLから作る。HTMLが残っていない過去の値の記録は作らない（再現できないため）。
 *
 * 集計ルール（RULES に同じものを書き出す）:
 *  - 「搭載チップ」欄がチップ名と一致する製品だけ。VRAM を指定したチップ（RTX 5060 Ti・RX 9060 XT）は「メモリ」欄の容量も一致するものだけ
 *  - 除外: 最安値の表示が無い（在庫・販売なし）／接続が PCI Express でない（外付けBOX）／BTF（背面コネクタ対応マザーボード専用）／
 *          WB（水冷ブロックのみで単体では冷却できない）／同じ製品IDの重複
 *  - 含める: 販売店限定モデル・簡易水冷一体型（そのまま取り付けられる通常の製品のため）
 *  - 中央値: 価格を昇順に並べた中央（偶数件は中央2件の平均）。表示値は千円単位に四捨五入。5件未満は smallSample
 */
const fs = require('fs');
const path = require('path');

const CHIPS = {
  'rtx-5050': { chip: 'NVIDIA/GeForce RTX 5050', vramGB: null },
  'rtx-5060': { chip: 'NVIDIA/GeForce RTX 5060', vramGB: null },
  'rtx-5060-ti': { chip: 'NVIDIA/GeForce RTX 5060 Ti', vramGB: 16 },
  'rtx-5070': { chip: 'NVIDIA/GeForce RTX 5070', vramGB: null },
  'rtx-5070-ti': { chip: 'NVIDIA/GeForce RTX 5070 Ti', vramGB: null },
  'rtx-5080': { chip: 'NVIDIA/GeForce RTX 5080', vramGB: null },
  'rtx-5090': { chip: 'NVIDIA/GeForce RTX 5090', vramGB: null },
  'rx-7600': { chip: 'AMD/Radeon RX 7600', vramGB: null },
  'rx-9060-xt': { chip: 'AMD/Radeon RX 9060 XT', vramGB: 16 },
  'rx-9070': { chip: 'AMD/Radeon RX 9070', vramGB: null },
  'rx-9070-xt': { chip: 'AMD/Radeon RX 9070 XT', vramGB: null },
};

const RULES = [
  '「搭載チップ」欄がチップ名と完全一致する製品だけ（RX 9070 GRE は RX 9070 と別チップ）。',
  'VRAM を指定したチップ（RTX 5060 Ti・RX 9060 XT は 16GB）は「メモリ」欄の容量が一致する製品だけ。8GB版は除外。',
  '最安値の表示が無い製品（在庫・販売なし）は除外。',
  '接続が PCI Express でない製品（Thunderbolt の外付けBOX）は除外。',
  'BTF（背面コネクタ対応マザーボード専用）・WB（水冷ブロックのみ）の製品は除外（そのまま一般的なPCに取り付けられないため）。',
  '同じ製品ID（kakaku.com/item/Kxxxx）の重複は1件にする。',
  '販売店限定モデル・簡易水冷一体型は含める。',
  '中央値は価格を昇順に並べた中央（偶数件は中央2件の平均）。表示値は千円単位に四捨五入。5件未満は少数サンプル（smallSample）。',
];

function parse(dir) {
  const out = [];
  for (let p = 1; p <= 5; p++) {
    const h = fs.readFileSync(path.join(dir, `gpu${p}.html`), 'utf8');
    for (const b of h.split('<div class="rkgBoxHead').slice(1)) {
      const g = (re) => { const m = b.match(re); return m ? m[1].trim() : null; };
      const specs = {};
      for (const m of b.matchAll(/p-specLabel_itemTtlIn">([^<]*)<\/span><\/dt>\s*<dd class="p-specLabel_itemTxt">([^<]*)/g)) specs[m[1]] = m[2].trim();
      const name = g(/rkgBoxNameItem">([^<]*)/);
      if (!name) continue;
      const price = g(/<span class="price"><a[^>]*>&#165;([\d,]+)/);
      const itemId = g(/kakaku\.com\/item\/(K\d+)/);
      out.push({ page: p, rank: Number(g(/<span class="num">(\d+)<\/span>/)), maker: g(/rkgBoxNameMaker">([^<]*)/), name,
        itemId, url: itemId ? `https://kakaku.com/item/${itemId}/` : null, price: price ? Number(price.replace(/,/g, '')) : null,
        chip: specs['搭載チップ'] || null, memory: specs['メモリ'] || null, interface: specs['IF'] || null });
    }
  }
  return out;
}

function median(v) {
  const s = [...v].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return null;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function build(dir, fetchedAt, meta) {
  const all = parse(dir);
  const chips = {};
  for (const [id, def] of Object.entries(CHIPS)) {
    const seen = new Set();
    const included = [];
    const excluded = [];
    for (const x of all.filter((y) => y.chip === def.chip)) {
      const rec = { rank: x.rank, page: x.page, itemId: x.itemId, url: x.url, maker: x.maker, name: x.name, memory: x.memory, interface: x.interface, price: x.price };
      const vram = Number((String(x.memory || '').match(/(\d+)GB/) || [])[1]);
      let reason = null;
      if (def.vramGB && vram !== def.vramGB) reason = `VRAM ${vram || '不明'}GB（対象は ${def.vramGB}GB版）`;
      else if (x.price === null) reason = '最安値の表示なし（在庫・販売なし）';
      else if (!/PCI Express/.test(x.interface || '')) reason = `接続が PCI Express でない（${x.interface || '不明'}・外付けBOX）`;
      else if (/BTF/.test(x.name)) reason = 'BTF（背面コネクタ対応マザーボード専用）';
      else if (/(^|[\s-])WB([\s-]|$)/.test(x.name)) reason = 'WB（水冷ブロックのみ）';
      else if (seen.has(x.itemId)) reason = '同じ製品IDの重複';
      seen.add(x.itemId);
      (reason ? excluded : included).push(reason ? { ...rec, reason } : rec);
    }
    const prices = included.map((x) => x.price);
    const raw = median(prices);
    chips[id] = {
      chip: def.chip, vramGB: def.vramGB, listed: included.length + excluded.length, sampleSize: included.length,
      medianRaw: raw, amount: raw === null ? null : Math.round(raw / 1000) * 1000,
      low: prices.length ? Math.min(...prices) : null, high: prices.length ? Math.max(...prices) : null,
      smallSample: included.length < 5, included, excluded,
    };
  }
  return {
    _meta: {
      purpose: 'GPUチップごとの「価格.com 人気売れ筋ランキング掲載製品の最安値の中央値」の取得記録。shared/catalog/gpu.json の market-median（evidence がこのファイル）の根拠。scripts/catalog/validate.js がここから中央値を再計算して照合する。',
      population: 'ランキング1〜5ページ（200製品）に掲載され、最安値が表示された製品だけ。市場全体の相場・販売数量で重み付けした値ではない。購入できる価格を保証しない。',
      source: 'kakaku-gpu-2026-11-15',
      pages: [1, 2, 3, 4, 5].map((p) => p === 1 ? 'https://kakaku.com/pc/videocard/ranking_0550/' : `https://kakaku.com/pc/videocard/ranking_0550/?page=${p}`),
      fetchedAt,
      rankingUpdated: meta.rankingUpdated,
      rankingPeriod: meta.rankingPeriod,
      timingNote: 'rankingPeriod は価格.com がランキング順位を集計した期間。各製品の最安値は fetchedAt に表示されていた値（集計期間の価格ではない）。',
      priceConditions: '価格.comの最安値表示（税込の総額表示）。送料・在庫は含まない。',
      rules: RULES,
      generatedBy: 'node scripts/catalog/kakaku-gpu-evidence.js',
    },
    chips,
  };
}

module.exports = { build, parse, median, CHIPS, RULES };

if (require.main === module) {
  const [dir, fetchedAt, out] = process.argv.slice(2);
  if (!dir || !fetchedAt || !out) { console.error('使い方: node scripts/catalog/kakaku-gpu-evidence.js <HTMLフォルダ> <取得日時ISO> <出力JSON>'); process.exit(2); }
  const html1 = fs.readFileSync(path.join(dir, 'gpu1.html'), 'utf8');
  const m = html1.match(/更新日：(\d{4})\/(\d{2})\/(\d{2}) \( (\d{4})\/(\d{2})\/(\d{2}) 〜 (\d{4})\/(\d{2})\/(\d{2}) の集計結果です\)/);
  const meta = m ? { rankingUpdated: `${m[1]}-${m[2]}-${m[3]}`, rankingPeriod: `${m[4]}-${m[5]}-${m[6]}〜${m[7]}-${m[8]}-${m[9]}` } : { rankingUpdated: null, rankingPeriod: null };
  const ev = build(dir, fetchedAt, meta);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(ev, null, 2) + '\n');
  for (const [id, c] of Object.entries(ev.chips)) console.log(id.padEnd(12), `n=${c.sampleSize}/${c.listed}`, 'raw', c.medianRaw, '→', c.amount, `(${c.low}〜${c.high})`, c.smallSample ? '少数' : '', 'excluded:', c.excluded.map((x) => x.reason).join(' / '));
}
