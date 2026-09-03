/* =====================================================================
 *  GPU GUIDE — GPU個別ページ 静的生成 (generate-gpu-pages.js)
 *  ---------------------------------------------------------------------
 *  実行: node gpu-guide/generate-gpu-pages.js
 *        node gpu-guide/generate-gpu-pages.js --dry-run   （検証のみ・本番反映しない）
 *
 *  【何をするものか】
 *   gpus.json の全GPUについて gpu-guide/gpu/<id>/index.html を生成する。
 *   これまで GPU 詳細は gpu.html?id=<id> というクエリURL1本しか無く、
 *   soft404 を避けるため noindex を常設していた。そのため
 *   「RTX 3060 性能」のような型番検索にまったく載らなかった。
 *   静的URLを作ることで、GPUごとのページを検索対象にする。
 *
 *  【設計方針】
 *   1. 本文はサーバ側（このスクリプト）でHTMLに焼き込む。
 *      JSが動かなくても GPU名・概要・スペック・性能・長所/注意点が読める。
 *      ここをJS描画にすると静的化した意味が無くなる。
 *   2. 数値・評価は gpus.json / cpu-recommendations.json のみを根拠にする。
 *      **無いデータは書かない**（FPS値やレビュー文を創作しない）。
 *   3. データが無い項目はセクションごと出さない。
 *      空見出しを並べると内容の薄いページになる。
 *   4. 他サービスへの導線は**データの有無に関係なく必ず出す**。
 *      旧 gpu-detail.js は CPU相性データが無い35GPUで
 *      クロスリンクごと消えていた。その依存を静的側では持たない。
 *   5. **一時ディレクトリに生成 → 自動検証 → 合格したら本番へ反映**。
 *      Phase 1 で generator が古く、再生成で広告表記・アフィリエイトが
 *      75ページから消える事故が起きたため、生成物を無検証で
 *      本番へ上書きしない。
 *
 *  【触るときの注意】
 *   - URL は gpus.json の id をそのまま使う（表示名から作らない）。
 *     名前が変わってもURLが変わらないようにするため。
 *   - 既存 gpu.html?id= は削除しない（被リンク・ブックマーク対策）。
 *   - 生成物 gpu-guide/gpu/<id>/index.html を直接編集しない。
 *     内容を変えるときはこのファイルを直して再実行する。
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const SITE = 'https://sippo-pc.jp';
const BASE = `${SITE}/gpu-guide`;
const OUT_DIR = path.join(DIR, 'gpu');
const TMP_DIR = path.join(DIR, '.generated-preview');

const DRY_RUN = process.argv.includes('--dry-run');

/* ------------------------------------------------------------------
 *  入力
 * ------------------------------------------------------------------ */
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

const gpus = readJson(path.join(DIR, 'gpus.json'));
const cpuRecs = readJson(path.join(DIR, 'cpu-recommendations.json'));

/* 解像度適性の共通基準。判定式をここに再実装しない（ズレの原因になる）。
 * gpus.json の target がこの導出と一致することは test-gpu-data.js が検証している。 */
const GpuTarget = require(path.join(DIR, '..', 'shared', 'gpu', 'gpu-target.js'));

/* ------------------------------------------------------------------
 *  ユーティリティ
 * ------------------------------------------------------------------ */

/** HTMLテキストとして安全にする */
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** JSON-LD の文字列値として安全にする（JSON.stringify に任せる） */
function jsonLd(obj) {
  // </script> でHTMLを閉じさせない
  return JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');
}

/** 配列として扱える中身があるか */
function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** 12345 → "12,345" */
function comma(value) {
  const n = num(value);
  return n === null ? '' : n.toLocaleString('ja-JP');
}

/* ------------------------------------------------------------------
 *  表示ロジック（gpu-detail.js と同じ基準にそろえる）
 * ------------------------------------------------------------------ */

function rankOf(score) {
  if (score >= 95) return 'ULTRA';
  if (score >= 85) return 'HIGH';
  if (score >= 70) return 'MIDDLE HIGH';
  if (score >= 55) return 'MIDDLE';
  return 'ENTRY';
}

function targetText(target) {
  if (target === 'FHD') return 'フルHDゲーミング向け';
  if (target === 'WQHD') return 'WQHDゲーミング向け';
  if (target === '4K') return '4K・重量級ゲーム向け';
  return 'ゲーミング向け';
}

function powerSupply(power) {
  if (power >= 500) return '850W-1000W以上';
  if (power >= 350) return '750W-850W以上';
  if (power >= 250) return '650W-750W以上';
  return '550W-650W以上';
}

/* 解像度ごとの向き不向き。
 *
 * ★「FHD向けだからWQHDでは使えない」という書き方をしない。
 *   実際には設定を落とせば動くため、断定は誤情報になる。
 *   gpus.json の target を基準に、
 *   「得意 / 狙える / 設定調整が必要」の3段階で表す。 */
const RES_LEVEL = { FHD: 1, WQHD: 2, '4K': 3 };
const RES_ROWS = [
  { key: 'FHD', label: 'フルHD（1920×1080）' },
  { key: 'WQHD', label: 'WQHD（2560×1440）' },
  { key: '4K', label: '4K（3840×2160）' },
];

function resolutionVerdict(gpuTarget, rowKey) {
  const have = RES_LEVEL[gpuTarget] || 1;
  const want = RES_LEVEL[rowKey];
  if (want < have) {
    return { badge: '余裕あり', text: '高めの設定でも余裕を持って動かしやすい解像度です。' };
  }
  if (want === have) {
    return { badge: '得意', text: 'このGPUがいちばん力を発揮しやすい解像度です。' };
  }
  if (want === have + 1) {
    return { badge: '狙える', text: '画質設定やアップスケーリング（DLSS/FSR）の調整で狙えます。' };
  }
  return { badge: '設定調整が必要', text: '重いゲームでは画質を下げるなどの調整が前提になります。' };
}

/* ------------------------------------------------------------------
 *  SEO文言
 * ------------------------------------------------------------------
 *  「GPU名だけ差し替えた同じ文章」を64本作らないよう、
 *  target / market / VRAM などデータの違いで文が変わるようにする。
 * ------------------------------------------------------------------ */

function isUsedOriented(gpu) {
  return gpu.market === 'used' || hasItems(gpu.tags) && gpu.tags.includes('中古向け');
}

function buildTitle(gpu) {
  const t = gpu.target;
  if (isUsedOriented(gpu)) {
    return `${gpu.name}の性能とスペック｜中古で買う前に見る目安 | GPU GUIDE`;
  }
  return `${gpu.name}の性能・スペック・${t}での目安 | GPU GUIDE`;
}

function buildDescription(gpu) {
  const parts = [];
  parts.push(
    `${gpu.name}（${gpu.brand}）のゲーム性能スコア${gpu.rasterScore}、総合${gpu.score}、VRAM ${gpu.vram}GB、消費電力${gpu.power}W。`
  );
  parts.push(`${targetText(gpu.target)}の位置づけです。`);
  if (isUsedOriented(gpu)) {
    const lo = comma(gpu.usedPriceMin);
    const hi = comma(gpu.usedPriceMax);
    if (lo && hi) parts.push(`中古相場の目安は約${lo}〜${hi}円。`);
    parts.push('中古で買うときの確認ポイントもまとめています。');
  } else {
    const p = comma(gpu.price);
    if (p) parts.push(`価格目安は約${p}円。`);
    parts.push('解像度別の目安や相性のよいCPUも確認できます。');
  }
  return parts.join('');
}

/* ------------------------------------------------------------------
 *  セクション生成
 * ------------------------------------------------------------------ */

function renderTags(tags) {
  if (!hasItems(tags)) return '';
  // 一覧カードと同じ .gpu-tag-list を使う（新しいクラスを増やさない）
  return `
            <div class="gpu-tag-list">
              ${tags.map((t) => `<span>${esc(t)}</span>`).join('\n              ')}
            </div>`;
}

function renderScoreBreakdown(gpu) {
  const items = [
    ['ゲーム性能', num(gpu.rasterScore), '通常のゲームFPSの目安'],
    ['機能', num(gpu.featureScore), 'DLSS・レイトレ・省電力など'],
    ['中古おすすめ', num(gpu.usedScore), '中古価格・年式・故障リスク込み'],
    ['総合', num(gpu.score), 'ゲーム性能と機能面を含めた目安'],
  ].filter(([, score]) => score !== null);

  return `
        <div class="score-breakdown" aria-label="スコア内訳">
          ${items.map(([label, score, desc]) => `<div class="score-breakdown-item">
            <div class="score-breakdown-head">
              <span>${esc(label)}</span>
              <strong>${score}/100</strong>
            </div>
            <div class="performance-bar"><span style="width: ${score}%;"></span></div>
            <p>${esc(desc)}</p>
          </div>`).join('\n          ')}
        </div>`;
}

function renderSpecs(gpu) {
  const priceLabel = isUsedOriented(gpu) ? '中古価格目安' : '価格目安';
  const priceValue = (() => {
    if (isUsedOriented(gpu)) {
      const lo = comma(gpu.usedPriceMin);
      const hi = comma(gpu.usedPriceMax);
      if (lo && hi) return `約${lo}〜${hi}円`;
    }
    const p = comma(gpu.price);
    return p ? `約${p}円` : '価格未設定';
  })();

  return `
      <section class="section">
        <div class="section-heading">
          <p class="section-label">SPEC</p>
          <h2>${esc(gpu.name)} の基本スペック</h2>
        </div>
        <div class="gpu-info-grid">
          <article class="gpu-info-card">
            <p class="info-label">VRAM</p>
            <h3>${esc(gpu.vram)}GB</h3>
            <p>高画質設定や重量級ゲームではVRAM容量が重要です。</p>
          </article>
          <article class="gpu-info-card">
            <p class="info-label">${esc(priceLabel)}</p>
            <h3>${esc(priceValue)}</h3>
            <p>価格は時期によって変動するため、あくまで目安として見てください。</p>
          </article>
          <article class="gpu-info-card">
            <p class="info-label">消費電力目安</p>
            <h3>${esc(gpu.power)}W</h3>
            <p>電源容量やケース内の冷却もあわせて確認したいポイントです。</p>
          </article>
          <article class="gpu-info-card">
            <p class="info-label">推奨電源</p>
            <h3>${esc(powerSupply(num(gpu.power) || 0))}</h3>
            <p>CPUや他パーツ構成によって必要な電源容量は変わります。</p>
          </article>
        </div>
      </section>`;
}

function renderResolutionTable(gpu) {
  return `
      <section class="section">
        <div class="section-heading">
          <p class="section-label">RESOLUTION</p>
          <h2>解像度ごとの目安</h2>
          <p>${esc(gpu.name)}は${esc(targetText(gpu.target))}です。${esc(GpuTarget.explainTarget(gpu))}下は目安で、ゲームや画質設定によって変わります。</p>
        </div>
        <div class="gpu-res-table" role="table" aria-label="解像度ごとの目安">
          ${RES_ROWS.map((row) => {
            const v = resolutionVerdict(gpu.target, row.key);
            const isTarget = row.key === gpu.target;
            return `<div class="gpu-res-row${isTarget ? ' is-target' : ''}" role="row">
            <span class="gpu-res-name" role="cell">${esc(row.label)}</span>
            <span class="gpu-res-badge" role="cell">${esc(v.badge)}</span>
            <span class="gpu-res-note" role="cell">${esc(v.text)}</span>
          </div>`;
          }).join('\n          ')}
        </div>
      </section>`;
}

/* ------------------------------------------------------------------
 *  長所・注意点をデータから導く
 * ------------------------------------------------------------------
 *  gpus.json の `pros` / `cons` は中古前提の43件にしか入っておらず、
 *  現行GPU22件のページには長所・注意点が1つも出ていなかった
 *  （＝新品購入を検討して来た人にいちばん必要な情報が無い状態）。
 *
 *  ★レビュー文を創作しない。**データから機械的に言える事実だけ**を出す。
 *    VRAM容量・消費電力・機能スコア・価格性能比は gpus.json にある値なので、
 *    同じ母集団の中での位置づけとして事実を述べられる。
 *    「速い」「おすすめ」のような主観評価は入れない。
 *
 *  閾値は全65件の分布から決めている（コスパ中央値15.4 / 上位25%は18.1）。
 * ------------------------------------------------------------------ */

/** 価格性能比（rasterScore / 万円）。価格が無ければ null */
function valuePerYen(gpu) {
  const price = num(gpu.price);
  const raster = num(gpu.rasterScore);
  if (!price || price <= 0 || raster === null) return null;
  return raster / (price / 10000);
}

/** 同じ母集団（現行 / 中古）の中でのコスパ中央値 */
function medianValue(list) {
  const vals = list.map(valuePerYen).filter((v) => v !== null).sort((a, b) => a - b);
  return vals.length ? vals[Math.floor(vals.length / 2)] : null;
}

function derivedPros(gpu, peers) {
  const out = [];
  const vram = num(gpu.vram);
  const power = num(gpu.power);
  const feature = num(gpu.featureScore);

  // VRAM は「重いテクスチャで効く」ことが明確な指標なので容量で言い切れる
  if (vram >= 20) out.push(`VRAM ${vram}GBと非常に大容量で、高解像度テクスチャや制作用途にも余裕がある`);
  else if (vram >= 16) out.push(`VRAM ${vram}GBと余裕があり、高解像度テクスチャを使うゲームでも安心しやすい`);
  else if (vram >= 12) out.push(`VRAM ${vram}GBあり、この価格帯では容量に余裕がある`);

  // 消費電力は電源・ケースの制約に直結する
  if (power > 0 && power <= 150) out.push(`消費電力${power}Wと控えめで、電源やケースの制約が小さい`);

  // 機能スコアは DLSS/レイトレ/省電力などの世代機能の評価
  if (feature >= 90) out.push('DLSS・レイトレーシングなど最新世代の機能をひととおり使える');

  // 価格性能比は同じ母集団の中央値と比べる
  const v = valuePerYen(gpu);
  const med = medianValue(peers);
  if (v !== null && med !== null && v >= med * 1.15) {
    out.push('同じ価格帯の中では、価格に対するゲーム性能が高め');
  }
  return out;
}

function derivedCons(gpu, peers) {
  const out = [];
  const vram = num(gpu.vram);
  const power = num(gpu.power);
  const feature = num(gpu.featureScore);

  if (vram > 0 && vram <= 8) {
    out.push(`VRAMが${vram}GBのため、重量級タイトルの高解像度テクスチャでは設定調整が必要になる場面がある`);
  }
  if (power >= 300) {
    out.push(`消費電力が${power}Wと大きく、電源容量とケース内のエアフローを確認したい`);
  }
  if (feature > 0 && feature < 75) {
    out.push('アップスケーリングやレイトレーシングの世代機能は、新しい世代のGPUより不利になりやすい');
  }
  const v = valuePerYen(gpu);
  const med = medianValue(peers);
  if (v !== null && med !== null && v <= med * 0.8) {
    out.push('価格に対するゲーム性能で見ると、下位モデルの方が割安になりやすい');
  }
  return out;
}

/**
 * 長所・注意点。gpus.json に手書きの pros/cons があればそれを優先し、
 * 無いGPU（現行22件）はデータから導いた事実で補う。
 */
function getProsCons(gpu, peers) {
  const pros = hasItems(gpu.pros) ? gpu.pros : derivedPros(gpu, peers);
  const cons = hasItems(gpu.cons) ? gpu.cons : derivedCons(gpu, peers);
  return { pros, cons };
}

function renderProsCons(gpu, peers) {
  const { pros, cons } = getProsCons(gpu, peers);
  if (!hasItems(pros) && !hasItems(cons)) return '';
  gpu = Object.assign({}, gpu, { pros: pros, cons: cons });
  return `
      <section class="section">
        <div class="section-heading">
          <p class="section-label">PROS / CONS</p>
          <h2>${esc(gpu.name)} の長所と注意点</h2>
        </div>
        <div class="gpu-detail-extra-grid">
          ${hasItems(gpu.pros) ? `<article class="gpu-extra-card">
            <p class="info-label">長所</p>
            <h3>ここが強い</h3>
            <ul class="gpu-list">
              ${gpu.pros.map((p) => `<li>${esc(p)}</li>`).join('\n              ')}
            </ul>
          </article>` : ''}
          ${hasItems(gpu.cons) ? `<article class="gpu-extra-card">
            <p class="info-label">注意点</p>
            <h3>ここは気をつける</h3>
            <ul class="gpu-list">
              ${gpu.cons.map((c) => `<li>${esc(c)}</li>`).join('\n              ')}
            </ul>
          </article>` : ''}
        </div>
      </section>`;
}

function renderScoreNote(gpu) {
  if (!gpu.scoreNote) return '';
  return `
      <div class="hint-box score-note-box">
        <div class="hint-box-icon" aria-hidden="true">💡</div>
        <p class="hint-box-body"><strong>このGPUの注意。</strong> ${esc(gpu.scoreNote)}</p>
      </div>`;
}

function renderUsedSection(gpu) {
  // 現行GPUに中古の見出しを無理やり出さない
  if (!isUsedOriented(gpu)) return '';
  if (!gpu.usedNote && !gpu.caution && !hasItems(gpu.usedCheckPoints)) return '';

  const lo = comma(gpu.usedPriceMin);
  const hi = comma(gpu.usedPriceMax);
  const range = lo && hi ? `中古相場の目安：約${lo}〜${hi}円` : '';

  return `
      <section class="section">
        <article class="gpu-extra-card gpu-used-caution-card">
          <p class="info-label">USED GPU CHECK</p>
          <h2>中古で買うときの注意</h2>
          ${range ? `<p class="used-price-range">${esc(range)}</p>` : ''}
          ${gpu.usedRecommendRank ? `<p class="used-rank">中古おすすめ度：<strong>${esc(gpu.usedRecommendRank)}</strong></p>` : ''}
          ${gpu.usedNote ? `<p>${esc(gpu.usedNote)}</p>` : ''}
          ${gpu.caution ? `<p>${esc(gpu.caution)}</p>` : ''}
          ${hasItems(gpu.usedCheckPoints) ? `<ul class="gpu-list">
            ${gpu.usedCheckPoints.map((p) => `<li>${esc(p)}</li>`).join('\n            ')}
          </ul>` : ''}
        </article>
      </section>`;
}

function renderGamesAndCpus(gpu, byId) {
  /* 比較カード。
   *
   * ★旧実装はブランド名とGPU名しか出しておらず、
   *   「なぜこのGPUと比べるのか」「どちらを選ぶべきか」が分からなかった。
   *   比較の判断に直結する事実（性能差・VRAM・価格）だけを足す。
   *   性能差は rasterScore の差をそのまま%で示す（推測値ではない）。
   *   カードが大きくなりすぎないよう、項目はこの3つに絞る。 */
  const baseRaster = num(gpu.rasterScore);
  const compareCards = (gpu.compare || [])
    .map((id) => byId[id])
    .filter(Boolean)
    .map((t) => {
      const tr = num(t.rasterScore);
      let deltaHtml = '';
      if (baseRaster && tr) {
        const pct = Math.round(((tr - baseRaster) / baseRaster) * 100);
        // ±3%未満は「ほぼ同等」。誤差レベルの差を優劣として見せない。
        const label = Math.abs(pct) < 3
          ? 'ゲーム性能ほぼ同等'
          : `ゲーム性能 ${pct > 0 ? '+' : ''}${pct}%`;
        const cls = Math.abs(pct) < 3 ? 'is-same' : (pct > 0 ? 'is-up' : 'is-down');
        deltaHtml = `<span class="compare-delta ${cls}">${esc(label)}</span>`;
      }
      const priceText = comma(t.price) ? `約${comma(t.price)}円` : '価格未設定';
      return `<a href="../${esc(t.id)}/" class="compare-link-card">
              <span>${esc(t.brand)}</span>
              <strong>${esc(t.name)}</strong>
              ${deltaHtml}
              <span class="compare-meta">VRAM ${esc(t.vram)}GB ・ ${esc(priceText)}</span>
            </a>`;
    });

  return `
      <section class="section">
        <div class="gpu-detail-extra-grid">
          ${hasItems(gpu.games) ? `<article class="gpu-extra-card">
            <p class="info-label">おすすめゲーム</p>
            <h3>このGPUで遊びやすいゲーム</h3>
            <ul class="gpu-list">
              ${gpu.games.map((g) => `<li>${esc(g)}</li>`).join('\n              ')}
            </ul>
            <p class="gpu-extra-note">※フレームレートはゲーム・画質設定・CPUによって変わります。</p>
          </article>` : ''}
          ${hasItems(gpu.cpus) ? `<article class="gpu-extra-card">
            <p class="info-label">おすすめCPU</p>
            <h3>組み合わせやすいCPU</h3>
            <ul class="gpu-list">
              ${gpu.cpus.map((c) => `<li>${esc(c)}</li>`).join('\n              ')}
            </ul>
          </article>` : ''}
          ${compareCards.length ? `<article class="gpu-extra-card gpu-extra-card-wide">
            <p class="info-label">比較されやすいGPU</p>
            <h3>近い性能帯のGPU</h3>
            <div class="compare-link-grid">
              ${compareCards.join('\n              ')}
            </div>
          </article>` : ''}
        </div>
      </section>`;
}

function renderCpuPairing(gpu) {
  const rec = cpuRecs[gpu.id];
  if (!rec || !hasItems(rec.picks)) return '';

  return `
      <section class="section">
        <div class="section-heading">
          <p class="section-label">CPU PAIRING</p>
          <h2>${esc(gpu.name)}におすすめのCPU</h2>
          ${rec.seo_text ? `<p>${esc(rec.seo_text)}</p>` : ''}
        </div>
        <div class="cpu-rec-grid">
          ${rec.picks.map((p) => `<article class="cpu-rec-card cpu-rec-card-${esc(p.tier_type)}">
            <span class="cpu-tier-badge cpu-tier-${esc(p.tier_type)}">${esc(p.tier)}</span>
            <h3 class="cpu-rec-name">${esc(p.cpu)}</h3>
            <p class="cpu-rec-reason">${esc(p.reason)}</p>
            <ul class="cpu-rec-specs">
              <li class="cpu-rec-spec-item"><span>想定用途</span><strong>${esc(p.use_case)}</strong></li>
              <li class="cpu-rec-spec-item"><span>解像度目安</span><strong>${esc(p.resolution)}</strong></li>
            </ul>
            <p class="cpu-rec-bottleneck">${esc(p.bottleneck_note)}</p>
          </article>`).join('\n          ')}
        </div>
      </section>`;
}

/* 次にできること。
 *
 * ★CPU相性データの有無に関係なく必ず出す。
 *   旧 gpu-detail.js は renderCpuSection() の中にこの導線を置いていたため、
 *   CPUデータの無い35GPUではリンクごと消えていた。同じ失敗をしない。 */
function renderNextActions(gpu) {
  return `
      <section class="section next-actions">
        <div class="section-heading">
          <p class="section-label">NEXT STEP</p>
          <h2>次にできること</h2>
          <p>${esc(gpu.name)}が気になったら、次はこちらが便利です。</p>
        </div>
        <div class="next-action-grid">
          <a class="next-action-card" href="/pc-build-check/">
            <span class="next-action-icon" aria-hidden="true">🧩</span>
            <span class="next-action-body">
              <strong>これからPCを組む・買う</strong>
              <small>予算と用途から、おすすめ構成を診断できます（PC BUILD CHECK）</small>
            </span>
          </a>
          <a class="next-action-card" href="/upgrade/">
            <span class="next-action-icon" aria-hidden="true">🔧</span>
            <span class="next-action-body">
              <strong>今のPCから交換したい</strong>
              <small>交換する価値があるかを判定します（PC UPGRADE）</small>
            </span>
          </a>
          <a class="next-action-card" href="/game-pc-guide/">
            <span class="next-action-icon" aria-hidden="true">🎮</span>
            <span class="next-action-body">
              <strong>遊びたいゲームから選びたい</strong>
              <small>ゲーム別に必要なスペックを逆引きできます（GAME PC GUIDE）</small>
            </span>
          </a>
          <a class="next-action-card" href="/gpu-guide/#compare">
            <span class="next-action-icon" aria-hidden="true">📊</span>
            <span class="next-action-body">
              <strong>他のGPUと比べたい</strong>
              <small>性能・価格・解像度で絞り込んで比較できます（GPU GUIDE）</small>
            </span>
          </a>
        </div>
      </section>`;
}

function renderPurchase(gpu) {
  // 購入ボタンは共通基盤 SippoAffiliate がクライアント側で描画する。
  // 商品を特定できない場合は何も描画されない（空の枠が残らないよう
  // 見出しごと JS 側で出す）。マスターを唯一の参照元にする既存方針を守る。
  return `
      <section class="section purchase-section" id="purchaseSection" hidden>
        <div class="section-heading">
          <p class="section-label">SHOP SEARCH</p>
          <h2>${esc(gpu.name)} の価格を確認する</h2>
          <p>スペックを確認したうえで、実際の販売価格をチェックできます。価格は変動するため各ショップでご確認ください。</p>
        </div>
        <div id="purchaseLinks"></div>
      </section>`;
}

/* ------------------------------------------------------------------
 *  構造化データ
 * ------------------------------------------------------------------
 *  ★Product は使わない。実体はショップの商品ページではなく解説ページで、
 *    offers / review / aggregateRating を持たないため。
 *    ページ内容に合う TechArticle + BreadcrumbList のみにする。
 *    見えていないFAQを作らないので FAQPage も出さない。
 * ------------------------------------------------------------------ */
function buildStructuredData(gpu, url, title, description) {
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'GPU GUIDE', item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: 'GPU一覧', item: `${BASE}/#compare` },
      { '@type': 'ListItem', position: 3, name: gpu.name, item: url },
    ],
  };

  const article = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: title,
    description: description,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    inLanguage: 'ja',
    about: { '@type': 'Thing', name: gpu.name },
    publisher: {
      '@type': 'Organization',
      name: 'GPU GUIDE',
      url: `${BASE}/`,
    },
  };

  return [breadcrumb, article];
}

/* ------------------------------------------------------------------
 *  ページ全体
 * ------------------------------------------------------------------ */
/* 比較の母集団。現行GPUは現行同士、中古GPUは中古同士で比べる。
 * 世代も価格帯も違う母集団と混ぜると「割安/割高」の判断が意味を失うため。 */
function peersOf(gpu) {
  const isUsed = gpu.market === 'used';
  return gpus.filter((g) => (g.market === 'used') === isUsed);
}

function buildPage(gpu, byId) {
  const url = `${BASE}/gpu/${gpu.id}/`;
  const title = buildTitle(gpu);
  const description = buildDescription(gpu);
  const ld = buildStructuredData(gpu, url, title, description);
  const raster = num(gpu.rasterScore) || 0;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />

  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />

  <link rel="stylesheet" href="../../common.css" />
  <link rel="stylesheet" href="../../style.css" />
  <link rel="stylesheet" href="/shared/affiliate/affiliate.css">

  <!-- OGP -->
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${esc(url)}" />
  <meta property="og:image" content="${BASE}/ogp.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name" content="GPU GUIDE" />
  <meta property="og:locale" content="ja_JP" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${BASE}/ogp.png" />

  <!-- Favicon -->
  <link rel="icon" type="image/x-icon" href="../../favicon.ico" />
  <link rel="icon" type="image/png" sizes="32x32" href="../../favicon-32x32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="../../favicon-16x16.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="../../apple-touch-icon.png" />
  <meta name="theme-color" content="#090b14" />

  <!-- SEO -->
  <link rel="canonical" href="${esc(url)}" />

  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-NDQ8GTKGHC"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-NDQ8GTKGHC');
  </script>

  <script type="application/ld+json">
${jsonLd(ld[0])}
  </script>
  <script type="application/ld+json">
${jsonLd(ld[1])}
  </script>
</head>
<body data-sippo-theme="dark">
  <header class="site-header">
    <div class="container header-inner">
      <a href="../../index.html" class="site-logo">GPU <span>GUIDE</span></a>
      <nav class="header-nav">
        <a class="sippo-nav" href="${SITE}/#consult" target="_blank" rel="noopener noreferrer" aria-label="Sippo（シッポ）公式サイトへ｜PC選びの相談ハブ">
          <img class="sippo-nav__icon" src="${SITE}/assets/sippo/sippo-normal.webp" alt="" width="22" height="22" loading="lazy" decoding="async">
          <span class="sippo-nav__text">Sippoに相談</span>
        </a>
        <a href="../../index.html#compare" class="header-link">比較表</a>
        <a href="../../index.html#recommend" class="header-link">おすすめ</a>
        <a href="../../index.html#guide" class="header-link">選び方</a>
      </nav>
    </div>
  </header>

  <main>
    <section class="gpu-detail-hero">
      <div class="container">
        <nav class="gpu-breadcrumb" aria-label="パンくずリスト">
          <a href="../../index.html">GPU GUIDE</a>
          <span aria-hidden="true">›</span>
          <a href="../../index.html#compare">GPU一覧</a>
          <span aria-hidden="true">›</span>
          <span aria-current="page">${esc(gpu.name)}</span>
        </nav>

        <div class="gpu-detail-layout">
          <article class="gpu-detail-main">
            <div class="gpu-card-top">
              <span class="gpu-brand">${esc(gpu.brand)}</span>
              <span class="gpu-resolution">${esc(gpu.target)}向け</span>
            </div>

            <h1>${esc(gpu.name)}</h1>

            <p class="gpu-detail-lead">${esc(gpu.summary)}</p>
${renderTags(gpu.tags)}

            <div class="gpu-score-box detail-score">
              <div class="gpu-score-head">
                <span>ゲーム性能スコア</span>
                <strong>${raster}/100</strong>
              </div>
              <div class="performance-bar"><span style="width: ${raster}%;"></span></div>
            </div>
${renderScoreBreakdown(gpu)}
          </article>

          <aside class="gpu-detail-side">
            <p class="detail-label">GPU RANK</p>
            <!-- ランク表記は見出しではなく "値" なので、見た目は既存の
                 h2 と同じにしつつ、文書構造上は見出しにしない
                 （h2 が本文のセクション見出しだけになるようにする）。 -->
            <p class="gpu-rank-value">${esc(rankOf(raster))}</p>
            <p>${esc(targetText(gpu.target))}</p>
            <dl class="gpu-side-facts">
              <div><dt>世代</dt><dd>${esc(gpu.generation)}</dd></div>
              <div><dt>VRAM</dt><dd>${esc(gpu.vram)}GB</dd></div>
              <div><dt>消費電力</dt><dd>${esc(gpu.power)}W</dd></div>
${gpu.releaseYear ? `              <div><dt>発売年</dt><dd>${esc(gpu.releaseYear)}年</dd></div>` : ''}
            </dl>
          </aside>
        </div>

        <div class="hint-box">
          <div class="hint-box-icon" aria-hidden="true">💡</div>
          <p class="hint-box-body">
            <strong>スコアの見方。</strong> ゲーム性能は通常のゲームFPSの目安、機能はDLSS・レイトレ・省電力などの評価、
            中古おすすめは中古価格・年式・故障リスク込みの目安です。総合スコア（${num(gpu.score)}/100）はゲーム性能と機能面を含めた評価です。
          </p>
        </div>
${renderScoreNote(gpu)}
      </div>
    </section>

    <div class="container">
${renderSpecs(gpu)}
${renderResolutionTable(gpu)}
${renderProsCons(gpu, peersOf(gpu))}
${renderUsedSection(gpu)}
${renderPurchase(gpu)}
${renderGamesAndCpus(gpu, byId)}
${renderCpuPairing(gpu)}
${renderNextActions(gpu)}

      <p class="gpu-detail-backlink"><a href="../../index.html" class="back-link">← GPU一覧に戻る</a></p>
    </div>
  </main>

  <footer class="site-footer">
    <div class="container">
      <p class="site-footer__affiliate-note">当サイトはアフィリエイト広告（Amazonアソシエイト・楽天アフィリエイト等）を利用しています。リンク先で商品を購入すると運営者に収益が発生する場合があります。Amazonのアソシエイトとして、当サイトは適格販売により収入を得ています。</p>
      <p>&copy; 2026 GPU GUIDE</p>
    </div>
  </footer>

  <!-- 共通アフィリエイト基盤（shared/affiliate）。設定→本体の順に読む -->
  <script src="/shared/affiliate/affiliate-config.js"></script>
  <script src="/shared/affiliate/affiliate.js"></script>
  <script>
    // 購入導線だけをクライアント側で描画する。
    // 本文（スペック・性能・長所/注意点）は静的HTMLに焼いてあるので、
    // ここが動かなくてもページの主要コンテンツは読める。
    (function () {
      var NAME = ${JSON.stringify(gpu.name)};
      function render() {
        if (!window.SippoAffiliate) return;
        window.SippoAffiliate.init().then(function () {
          var html = window.SippoAffiliate.renderAffiliateButtonsByName(NAME, {
            page: 'gpu-guide',
            placement: 'gpu-detail-purchase'
          });
          if (!html) return; // 商品を特定できないときは何も出さない
          document.getElementById('purchaseLinks').innerHTML = html;
          document.getElementById('purchaseSection').hidden = false;
        }).catch(function () {});
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', render);
      } else {
        render();
      }
    })();
  </script>
</body>
</html>
`;
}

/* ==================================================================
 *  生成 → 検証 → 反映
 * ================================================================== */

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function generateInto(root) {
  rmDir(root);
  const byId = {};
  gpus.forEach((g) => { byId[g.id] = g; });

  gpus.forEach((gpu) => {
    const dir = path.join(root, gpu.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), buildPage(gpu, byId), 'utf8');
  });
  return gpus.length;
}

/* ------------------------------------------------------------------
 *  自動検証
 *  ★ここを通らなければ本番へは反映しない
 * ------------------------------------------------------------------ */
function verify(root) {
  const problems = [];
  const seenCanonical = new Set();
  let count = 0;

  gpus.forEach((gpu) => {
    const file = path.join(root, gpu.id, 'index.html');
    if (!fs.existsSync(file)) { problems.push(`${gpu.id}: index.html が無い`); return; }
    count++;
    const html = fs.readFileSync(file, 'utf8');
    const url = `${BASE}/gpu/${gpu.id}/`;

    // --- 必須メタ ---
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
    if (!title || !title.trim()) problems.push(`${gpu.id}: title が空`);
    const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
    if (!desc || !desc.trim()) problems.push(`${gpu.id}: description が空`);

    // --- H1 はちょうど1つ ---
    const h1s = html.match(/<h1[^>]*>/g) || [];
    if (h1s.length !== 1) problems.push(`${gpu.id}: h1 が ${h1s.length} 個`);

    // --- canonical 自己参照 ---
    const canon = (html.match(/rel="canonical" href="([^"]*)"/) || [])[1];
    if (canon !== url) problems.push(`${gpu.id}: canonical 不一致 (${canon})`);
    if (seenCanonical.has(canon)) problems.push(`${gpu.id}: canonical 重複`);
    seenCanonical.add(canon);

    // --- noindex が混入していない ---
    if (/name="robots"[^>]*noindex/i.test(html)) problems.push(`${gpu.id}: noindex が入っている`);

    // --- 必須コンテンツ（JS無しで読めること） ---
    if (html.indexOf(esc(gpu.name)) < 0) problems.push(`${gpu.id}: GPU名が本文に無い`);
    if (html.indexOf(esc(gpu.summary)) < 0) problems.push(`${gpu.id}: summary が本文に無い`);
    if (html.indexOf(`${gpu.vram}GB`) < 0) problems.push(`${gpu.id}: VRAM が本文に無い`);
    if (html.indexOf(`${gpu.power}W`) < 0) problems.push(`${gpu.id}: 消費電力が本文に無い`);

    // --- 構造化データ ---
    const lds = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
    if (lds.length < 2) problems.push(`${gpu.id}: JSON-LD が ${lds.length} 個`);
    lds.forEach((block, i) => {
      const body = block.replace(/<script type="application\/ld\+json">/, '').replace(/<\/script>/, '');
      try { JSON.parse(body.replace(/\\u003c/g, '<')); }
      catch (e) { problems.push(`${gpu.id}: JSON-LD[${i}] が不正 (${e.message})`); }
    });
    if (html.indexOf('"BreadcrumbList"') < 0) problems.push(`${gpu.id}: BreadcrumbList が無い`);

    // --- クロスリンク（CPUデータの有無に関係なく必須） ---
    [['/pc-build-check/', 'PC BUILD CHECK'],
     ['/upgrade/', 'Upgrade'],
     ['/game-pc-guide/', 'GAME PC GUIDE']].forEach(([href, label]) => {
      if (html.indexOf(`href="${href}"`) < 0) problems.push(`${gpu.id}: ${label} へのリンクが無い`);
    });
    if (html.indexOf('href="../../index.html"') < 0) problems.push(`${gpu.id}: GPU GUIDE への戻りリンクが無い`);

    // --- アフィリエイト・広告表記（Phase 1 の事故対策） ---
    [['/shared/affiliate/affiliate.css', 'affiliate.css'],
     ['/shared/affiliate/affiliate-config.js', 'affiliate-config.js'],
     ['/shared/affiliate/affiliate.js', 'affiliate.js'],
     ['site-footer__affiliate-note', '広告表記'],
     ['data-sippo-theme="dark"', 'data-sippo-theme']].forEach(([needle, label]) => {
      if (html.indexOf(needle) < 0) problems.push(`${gpu.id}: ${label} が欠落`);
    });

    // --- 壊れた値が出ていないか ---
    ['undefined', 'null', '[object Object]', 'NaN'].forEach((bad) => {
      // 属性値やJSON-LD内の正当な null は無いはずなので単純検査でよい
      if (html.indexOf(`>${bad}<`) > -1 || html.indexOf(`"${bad}"`) > -1 && bad !== 'null') {
        problems.push(`${gpu.id}: HTML に ${bad} が出ている`);
      }
    });

    // --- 相対パス（生成先の深さ ../../ が正しいか） ---
    ['../../common.css', '../../style.css', '../../index.html'].forEach((rel) => {
      if (html.indexOf(rel) < 0) problems.push(`${gpu.id}: ${rel} の参照が無い`);
    });
  });

  if (count !== gpus.length) problems.push(`生成数不一致: ${count} / ${gpus.length}`);
  return { count, problems };
}

/* ------------------------------------------------------------------
 *  sitemap
 * ------------------------------------------------------------------ */
function writeSitemap() {
  const urls = [`${BASE}/`].concat(gpus.map((g) => `${BASE}/gpu/${g.id}/`));
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  urls.forEach((u) => {
    lines.push('  <url>');
    lines.push(`    <loc>${u}</loc>`);
    lines.push('  </url>');
  });
  lines.push('</urlset>');
  fs.writeFileSync(path.join(DIR, 'sitemap.xml'), lines.join('\n') + '\n', 'utf8');
  return urls.length;
}

/* ------------------------------------------------------------------
 *  main
 * ------------------------------------------------------------------ */
function main() {
  console.log('GPU: ' + gpus.length + ' 件');

  // 1) 一時ディレクトリへ生成
  console.log('一時ディレクトリへ生成中: ' + path.relative(process.cwd(), TMP_DIR));
  const made = generateInto(TMP_DIR);
  console.log('  生成: ' + made + ' ページ');

  // 2) 検証
  const { count, problems } = verify(TMP_DIR);
  console.log('  検証: ' + count + ' ページ / 問題 ' + problems.length + ' 件');
  if (problems.length) {
    problems.slice(0, 40).forEach((p) => console.error('    × ' + p));
    if (problems.length > 40) console.error('    ... 他 ' + (problems.length - 40) + ' 件');
    console.error('\n検証に失敗したため本番へ反映しませんでした。');
    rmDir(TMP_DIR);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('\n--dry-run のため本番へは反映しません。');
    console.log('プレビュー: ' + path.relative(process.cwd(), TMP_DIR));
    return;
  }

  // 3) 本番へ反映
  rmDir(OUT_DIR);
  fs.renameSync(TMP_DIR, OUT_DIR);
  console.log('本番へ反映: ' + path.relative(process.cwd(), OUT_DIR));

  // 4) sitemap
  const n = writeSitemap();
  console.log('sitemap.xml を更新: ' + n + ' URL');

  console.log('\n完了。');
}

main();
