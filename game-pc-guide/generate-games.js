/**
 * GAME PC GUIDE ジェネレーター（2026-10-18〜。旧 Generate-StaticGames.ps1 の後継）
 *
 *   node game-pc-guide/generate-games.js
 *
 * 【データの持ち方】
 *   data/games.json          … 一覧・構成（PC BUILD CHECK もこのファイルを読む）
 *   data/price-bands.json    … PC本体の予算目安。価格はここだけで管理する
 *   content/<slug>/guide.json … ゲームごとの書き下ろし本文（公式スペック・ポイント・FAQ・出典）
 *   content/<slug>/head.html・top.html・body.html … 旧来の書き下ろしHTML（現在 GTA5 のみ）。
 *                              guide.json に legacyHtml:true があるとこちらを本文に使う
 *   ../gpu-guide/gpus.json   … GPUのVRAM・性能スコア・個別ページURL
 *
 * 【このスクリプトが書き換えるもの】
 *   games/<slug>.html                          … 全ページ（生成物。直接編集しない）
 *   index.html の GENERATED:* マーカーの中      … 一覧カード・注目タイトル・ItemList
 *   llms.txt の GENERATED:games マーカーの中
 *   sitemap.xml                                 … lastmod は「ページ内容が変わった日」。data/page-dates.json に
 *                                                 ページごとの内容ハッシュを持ち、内容が同じなら日付を動かさない
 *                                                 （CSS/JSの版番号は内容に含めない）。再生成しても差分は出ない
 *   CSS/JS の URL の ?v=…                        … ファイル内容のハッシュ。Service Worker が古いCSSを返さないように
 *   data/games.json の builds[].price / budget / budgetMin / budgetMax
 *     … price-bands.json から計算して書き戻す（手で書かない）
 *
 * 【止まる条件】データの不整合（存在しない予算帯・関連ゲーム・解像度の書き忘れ、
 *   置き換え漏れのプレースホルダーなど）を見つけたら何も書き出さずに終了する。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SITE = "https://sippo-pc.jp";
const BASE = SITE + "/game-pc-guide";

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
const games = readJson(path.join(ROOT, "data", "games.json"));
const prices = readJson(path.join(ROOT, "data", "price-bands.json"));
const gpuCatalog = readJson(path.join(ROOT, "..", "gpu-guide", "gpus.json"));

const errors = [];
const fail = (msg) => errors.push(msg);

/* ------------------------------------------------------------------ */
/*  共通ヘルパー                                                        */
/* ------------------------------------------------------------------ */

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const slugOf = (g) => g.slug || g.id;

function jpDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return `${y}年${m}月${d}日`;
}
function jpMonth(iso) {
  const [y, m] = String(iso).split("-").map(Number);
  return `${y}年${m}月`;
}
const PRICE_MONTH = jpMonth(prices.checked);

const crypto = require("crypto");
const hashOf = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
/** CSS/JS の版番号（中身のハッシュ）。中身が変わったときだけ URL が変わる */
const assetVer = (file) => hashOf(fs.readFileSync(path.join(ROOT, file))).slice(0, 10);
const VER = { css: assetVer("style.css"), js: assetVer("script.js"), aff: assetVer("game-affiliate.js") };
/** 日本時間の今日（lastmod 用） */
const TODAY = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
const DATES_PATH = path.join(ROOT, "data", "page-dates.json");
const pageDates = fs.existsSync(DATES_PATH) ? readJson(DATES_PATH) : {};
const LASTMOD = "__LASTMOD__";
/** 内容ハッシュの計算から除くもの：更新日そのものと、CSS/JSの版番号 */
const contentKey = (html) => hashOf(html.split(LASTMOD).join("").replace(/\?v=[0-9a-f]{10}/g, ""));
/** 内容が前回と同じなら前回の日付、変わっていれば今日 */
function resolveDate(key, html) {
  const h = contentKey(html);
  const prev = pageDates[key];
  const date = prev && prev.hash === h ? prev.modified : TODAY;
  pageDates[key] = { hash: h, modified: date };
  return date;
}

/** {{band:xxx}} と {{priceChecked}} を置き換える（本文・HTMLパーツ共通） */
function fill(text, where) {
  return String(text)
    .replace(/\{\{band:([a-z0-9-]+)\}\}/g, (m, key) => {
      const b = prices.bands[key];
      if (!b) {
        fail(`${where}: 存在しない予算帯 ${m}`);
        return m;
      }
      return b.label;
    })
    .replace(/\{\{priceChecked\}\}/g, PRICE_MONTH);
}

/* GPU名 → gpus.json。正規化規則は shared/gpu/gpu-links.js と同じ */
const gpuIndex = {};
for (const g of gpuCatalog) {
  const k = (s) => String(s).toLowerCase().replace(/^geforce\s+/, "").replace(/^amd\s+radeon\s+/, "").replace(/^radeon\s+/, "").replace(/^amd\s+/, "").replace(/[^a-z0-9]/g, "");
  gpuIndex[g.id.replace(/[^a-z0-9]/g, "")] = g;
  if (g.name) gpuIndex[k(g.name)] = g;
}
function findGpu(name) {
  if (!name) return null;
  const k = String(name).toLowerCase().replace(/^geforce\s+/, "").replace(/^amd\s+radeon\s+/, "").replace(/^radeon\s+/, "").replace(/^amd\s+/, "").replace(/[^a-z0-9]/g, "");
  return gpuIndex[k] || null;
}
const gpuById = (id) => gpuCatalog.find((g) => g.id === id) || null;
const gpuUrl = (g) => `${SITE}/gpu-guide/gpu/${g.id}/`;

function gpuHtml(name, vramOverride) {
  const g = findGpu(name);
  const vram = vramOverride ? `VRAM ${vramOverride.replace(/版$/, "")}` : g ? `VRAM ${g.vram}GB` : "";
  const label = g ? `<a class="build-gpu-link" href="${gpuUrl(g)}">${esc(name)}</a>` : esc(name);
  return vram ? `${label}<span class="spec-sub">${esc(vram)}</span>` : label;
}

const LOAD_LABEL = { 1: "軽い", 2: "普通", 3: "重い", 4: "非常に重い" };
const GENRE_GROUPS = {
  shooter: "FPS・TPS",
  action: "アクション・RPG",
  mmo: "MMO",
  survival: "サバイバル・クラフト",
  competitive: "MOBA・格闘",
};
const USES = { fps: "高fps重視", quality: "高画質重視" };

function loadMeter(n) {
  const bars = [1, 2, 3, 4].map((i) => `<span${i <= n ? ' class="on"' : ""}></span>`).join("");
  return `<span class="load-meter load-${n}" role="img" aria-label="PC負荷 4段階中${n}（${LOAD_LABEL[n]}）">${bars}</span>`;
}

function statusChip(g) {
  if (g.status === "early-access") return '<span class="chip chip--ea">早期アクセス</span>';
  if (g.status === "upcoming") return '<span class="chip chip--ea">発売前</span>';
  if (isNew(g)) return '<span class="chip chip--new">新作</span>';
  return "";
}

/** 「新作」= 確認日から1年以内に発売・正式版になったタイトル（主観の人気順位は作らない）
 *  確認日は「価格の確認日」と「各ページの公式スペック確認日」のうち最も新しい日。
 *  価格の確認日より後に発売された新作（2026-10-23 の MW4 など）も、公式情報を確認した時点で新作に入る。
 *  実行日を使わないのは、同じデータなら何度生成しても同じ出力にするため */
let newBaseDate = null;
function isNew(g) {
  if (!g.releaseDate) return false;
  if (!newBaseDate) newBaseDate = [prices.checked, ...Object.values(guides).map((x) => x.checked).filter(Boolean)].sort().pop();
  const days = (new Date(newBaseDate) - new Date(g.releaseDate)) / 86400000;
  return days >= 0 && days <= 365;
}

/* ------------------------------------------------------------------ */
/*  データの読み込みと検証                                              */
/* ------------------------------------------------------------------ */

const bySlug = {};
for (const g of games) {
  bySlug[slugOf(g)] = g;
  bySlug[g.id] = g;
}

const guides = {};
for (const g of games) {
  const slug = slugOf(g);
  const dir = path.join(ROOT, "content", slug);
  const gp = path.join(dir, "guide.json");
  if (!fs.existsSync(gp)) {
    fail(`${slug}: content/${slug}/guide.json がありません`);
    continue;
  }
  const guide = readJson(gp);
  guide.parts = {};
  for (const part of ["head", "top", "body"]) {
    const p = path.join(dir, part + ".html");
    if (fs.existsSync(p)) guide.parts[part] = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "").trimEnd();
  }
  guides[slug] = guide;

  if (!LOAD_LABEL[g.load]) fail(`${slug}: load は1〜4`);
  if (LOAD_LABEL[g.load] !== g.level) fail(`${slug}: level「${g.level}」と load ${g.load} が一致しません`);
  if (!GENRE_GROUPS[g.genreGroup]) fail(`${slug}: genreGroup が不正`);
  if (!Array.isArray(g.builds) || !g.builds.length) fail(`${slug}: builds が空`);
  (g.builds || []).forEach((b, i) => {
    if (!prices.bands[b.band]) fail(`${slug}: builds[${i}].band「${b.band}」が price-bands.json にありません`);
    // PC BUILD CHECK が target から解像度を読むので、FHD / WQHD / 4K のどれかを必ず書く
    if (!/FHD|WQHD|4K/.test(b.target)) fail(`${slug}: builds[${i}].target に FHD / WQHD / 4K がありません`);
    if (!b.memory) fail(`${slug}: builds[${i}].memory がありません`);
  });
  if (!(guide.pick >= 0 && guide.pick < (g.builds || []).length)) fail(`${slug}: pick が builds の範囲外`);
  for (const r of guide.related || []) if (!bySlug[r]) fail(`${slug}: related「${r}」というゲームはありません`);
  if (!guide.legacyHtml) {
    for (const key of ["seoTitle", "metaDescription", "lead", "specTables", "sources", "resolutions", "points", "faq"]) {
      if (!guide[key] || (Array.isArray(guide[key]) && !guide[key].length)) fail(`${slug}: guide.json に ${key} がありません`);
    }
    if ((guide.points || []).length < 2) fail(`${slug}: ゲーム固有のポイントは2つ以上`);
  }
  // 任意：本文の追加セクション（sections）と、シリーズ・関連ページへの案内（seeAlso）
  for (const [i, s] of (guide.sections || []).entries()) {
    if (!s.id || !s.title || !s.toc) fail(`${slug}: sections[${i}] に id / title / toc がありません`);
    if (!(s.cards || []).length && !s.table && !s.alert) fail(`${slug}: sections[${i}] が空です`);
  }
  if (guide.seeAlso && !(guide.seeAlso.title && guide.seeAlso.href && guide.seeAlso.label)) fail(`${slug}: seeAlso に title / href / label がありません`);
  if (guide.recGpuId && !gpuById(guide.recGpuId)) {
    // GPU GUIDE に無い古いGPU（GTX 970 など）はスコア表示を出さないだけ。エラーにはしない
    guide.recGpuId = null;
  }
}

for (const [k, b] of Object.entries(prices.bands)) {
  if (!["observed", "estimated"].includes(b.evidence)) fail(`price-bands.json: ${k} の evidence は observed / estimated のどちらか`);
  if (!b.basis) fail(`price-bands.json: ${k} に basis（根拠）がありません`);
}

/* 予算を price-bands.json から計算して games.json に書き戻す */
for (const g of games) {
  for (const b of g.builds || []) if (prices.bands[b.band]) b.price = prices.bands[b.band].label;
  const bands = (g.builds || []).map((b) => prices.bands[b.band]).filter(Boolean);
  if (!bands.length) continue;
  g.budgetMin = Math.min(...bands.map((b) => b.min));
  g.budgetMax = Math.max(...bands.map((b) => b.max));
  g.budget = `${g.budgetMin}万〜${g.budgetMax}万円前後`;
}

/* ------------------------------------------------------------------ */
/*  共通パーツ                                                          */
/* ------------------------------------------------------------------ */

function header(prefix) {
  return `  <a class="skip-link" href="#main">本文へスキップ</a>
  <header class="site-header">
    <div class="container header-inner">
      <a href="${prefix}index.html" class="site-logo">GAME PC <span>GUIDE</span></a>
      <nav class="header-nav" aria-label="サイト内メニュー">
        <div data-sippo-servicenav></div>
        <a href="${prefix}index.html#games" class="header-link">ゲーム一覧</a>
        <a href="${prefix}index.html#beginner" class="header-link">初心者ガイド</a>
      </nav>
    </div>
  </header>`;
}

const FOOTER = `  <footer class="site-footer">
    <div class="container">
      <p class="site-footer__affiliate-note">当サイトはアフィリエイト広告（Amazonアソシエイト・楽天アフィリエイト等）を利用しています。リンク先で商品を購入すると運営者に収益が発生する場合があります。Amazonのアソシエイトとして、当サイトは適格販売により収入を得ています。</p>
      <p class="site-footer__note">掲載している公式スペックは各ゲームの公式情報の確認日時点のものです。PCの価格は変動するため、購入前に販売店で最新の価格と構成をご確認ください。</p>
      <p>© GAME PC GUIDE ／ <a href="https://sippo-pc.jp/">Sippo（シッポ）</a></p>
    </div>
  </footer>`;

const GTAG = `  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-NDQ8GTKGHC"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    gtag('config', 'G-NDQ8GTKGHC');
  </script>`;

const SW = `  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/game-pc-guide/sw.js', { scope: '/game-pc-guide/' })
          .catch(() => {});
      });
    }
  </script>`;

function jsonLd(obj) {
  // </script> を壊さないよう < をエスケープ
  return `  <script type="application/ld+json">\n${JSON.stringify(obj, null, 2).replace(/</g, "\\u003c")}\n  </script>`;
}

const strip = (s) => String(s).replace(/<[^>]+>/g, "");

/** 画像の実寸（JPEG / WebP のヘッダーから読む）。width・height 属性を実寸に合わせるため */
function imageSize(rel) {
  const b = fs.readFileSync(path.join(ROOT, rel));
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  if (b.toString("ascii", 0, 4) === "RIFF") {
    const t = b.toString("ascii", 12, 16);
    if (t === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (t === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (t === "VP8L") { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
  }
  fail(`${rel}: 画像の寸法を読めません（JPEG / WebP 以外？）`);
  return [16, 9];
}
const sizeAttr = (rel) => { const [w, h] = imageSize(rel); return `width="${w}" height="${h}"`; };

/* ------------------------------------------------------------------ */
/*  ゲーム画像の表示可否（data/image-rights.json）                       */
/* ------------------------------------------------------------------ */
//  画像は記録で display:true のものだけを一覧カード・ヒーローに出す。表示できるのは
//    ・grade が A / B（許諾を確認できた）
//    ・displayBasis が "operator-decision"（許諾は未確認だが運営者の判断で表示。2026-10-18〜）
//  のどちらか。displayPolicy.neverDisplay のタイトルは何があっても出さない。
//  OGP・構造化データの画像はゲーム画像を使わず、常に共通の ogp.jpg。
//  表示しないゲームはゲームの著作物を含まない「タイトルタイル」（CSSと自作の図形アイコンのみ）で代替する。
const rights = readJson(path.join(ROOT, "data", "image-rights.json"));
const NEVER = new Set((rights.displayPolicy && rights.displayPolicy.neverDisplay) || []);
const SITE_OGP = { url: `${BASE}/images/ogp.jpg`, width: 1200, height: 630 };
/** 1タイトル分の画像ファイル（ヒーロー1200px・サムネ640px・ミニ192px。原本 .jpg は保管用） */
const imageSet = (g) => {
  const base = String(g.image).replace(/.(jpe?g|png|webp)$/i, "");
  return { jpg: base + ".jpg", hero: base + ".webp", thumb: base + "-thumb.webp", mini: base + "-mini.webp" };
};
const allowedToShow = (g) => {
  const r = rights.images[g.id];
  return !!(r && r.display === true && !NEVER.has(g.id) && (["A", "B"].includes(r.grade) || r.displayBasis === "operator-decision"));
};
/** 表示してよく、かつ画像ファイルが揃っているときだけ true（欠けていてもタイル表示で生成は続ける） */
function showImage(g) {
  if (!allowedToShow(g)) return false;
  const set = imageSet(g);
  return ["hero", "thumb", "mini"].every((k) => fs.existsSync(path.join(ROOT, set[k])));
}
for (const g of games) {
  const r = rights.images[g.id];
  const set = imageSet(g);
  if (!r) fail(`image-rights.json に ${g.id} の記録がありません`);
  else if (NEVER.has(g.id) && r.display) fail(`image-rights.json: ${g.id} は非表示維持（neverDisplay）なのに display:true`);
  else if (r.display === true && !allowedToShow(g)) fail(`image-rights.json: ${g.id} は判定 ${r.grade} で表示の根拠（displayBasis）が無いのに display:true`);
  // 表示しない画像は公開ディレクトリに置かない
  else if (!allowedToShow(g)) {
    for (const k of Object.keys(set)) if (fs.existsSync(path.join(ROOT, set[k]))) fail(`image-rights.json: ${g.id} は表示しない画像なので ${set[k]} を公開ディレクトリから外してください`);
  } else if (!showImage(g)) {
    console.warn(`注意: ${g.id} は表示する設定だが画像ファイルが揃っていないため、タイル表示にしました`);
  }
}
/** img 要素（srcset で表示幅に合った解像度を選ばせる） */
function gameImg(g, prefix, kind) {
  const set = imageSet(g);
  if (kind === "mini") {
    return `<img src="${prefix}${esc(set.mini)}" alt="" ${sizeAttr(set.mini)} loading="lazy" decoding="async">`;
  }
  const [tw] = imageSize(set.thumb);
  const [hw] = imageSize(set.hero);
  const srcset = `${prefix}${esc(set.thumb)} ${tw}w, ${prefix}${esc(set.hero)} ${hw}w`;
  if (kind === "hero") {
    return `<img src="${prefix}${esc(set.hero)}" srcset="${srcset}" sizes="(max-width: 900px) calc(100vw - 32px), 520px" alt="${esc(g.title)}のタイトル画像" ${sizeAttr(set.hero)} decoding="async" fetchpriority="high" />`;
  }
  return `<img src="${prefix}${esc(set.thumb)}" srcset="${srcset}" sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 900px) 50vw, 360px" alt="" ${sizeAttr(set.thumb)} loading="lazy" decoding="async">`;
}

/** ジャンルごとの図形アイコン（自作の幾何学図形。ゲームの著作物は含まない） */
const TILE_ICON = {
  shooter: '<circle cx="24" cy="24" r="14"/><circle cx="24" cy="24" r="3"/><path d="M24 2v10M24 36v10M2 24h10M36 24h10"/>',
  action: '<path d="M10 38 34 14M30 10l8 8M14 30l4 4M8 40l4-4"/><path d="M34 14l4-8-8 4"/>',
  mmo: '<circle cx="17" cy="18" r="6"/><circle cx="31" cy="18" r="6"/><path d="M6 38c1-7 6-11 11-11s10 4 11 11M20 38c1-7 6-11 11-11s10 4 11 11"/>',
  survival: '<path d="M24 6 40 15v18L24 42 8 33V15z"/><path d="M8 15l16 9 16-9M24 24v18"/>',
  competitive: '<path d="M27 4 12 27h11l-3 17 16-24H25z"/>',
};
function titleTile(g, size) {
  return `<div class="title-tile title-tile--${g.genreGroup}${size ? " title-tile--" + size : ""}" aria-hidden="true"><svg class="title-tile__icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${TILE_ICON[g.genreGroup] || TILE_ICON.action}</svg><span class="title-tile__name">${esc(g.title)}</span><span class="title-tile__genre">${esc(g.genre)}</span></div>`;
}

function thumbOf(g) {
  return String(g.image).replace(/\.(jpe?g|png|webp)$/i, "-thumb.webp");
}

function heroImageOf(g) {
  const webp = String(g.image).replace(/\.(jpe?g|png)$/i, ".webp");
  return fs.existsSync(path.join(ROOT, webp)) ? webp : g.image;
}

function pickBuild(g) {
  return g.builds[guides[slugOf(g)].pick] || g.builds[0];
}

/** 一覧・関連ゲームで使うカード */
function card(g, prefix, headingTag) {
  const slug = slugOf(g);
  const pick = pickBuild(g);
  const band = prices.bands[pick.band];
  const search = [g.title, g.genre, g.level, ...(g.aliases || []), GENRE_GROUPS[g.genreGroup]].join(" ").toLowerCase();
  const h = headingTag || "h3";
  return `<li class="game-card" data-search="${esc(search)}" data-genre="${g.genreGroup}" data-load="${g.load}" data-budget="${band.min}" data-uses="${(g.uses || []).join(" ")}">
  <a class="game-card__link" href="${prefix}games/${slug}.html">
    <div class="game-card__thumb">${showImage(g) ? gameImg(g, prefix, "card") : titleTile(g)}</div>
    <div class="game-card__body">
      <p class="game-card__tags"><span class="chip">${esc(g.genre)}</span>${statusChip(g)}</p>
      <${h} class="game-card__title">${esc(g.title)}</${h}>
      <p class="game-card__text">${esc(g.cardText)}</p>
      <dl class="game-card__meta">
        <div><dt>PC負荷</dt><dd>${loadMeter(g.load)}${esc(g.level)}</dd></div>
        <div><dt>目安</dt><dd>${esc(g.recommended)}</dd></div>
        <div><dt>おすすめGPU</dt><dd>${esc(pick.gpu)}${pick.gpuAlt ? ` / ${esc(pick.gpuAlt)}` : ""}</dd></div>
        <div><dt>PC予算</dt><dd class="price">${esc(band.label)}</dd></div>
      </dl>
    </div>
  </a>
</li>`;
}

/* ------------------------------------------------------------------ */
/*  ゲーム個別ページ                                                    */
/* ------------------------------------------------------------------ */

function buildCards(g, guide) {
  const rec = guide.recGpuId ? gpuById(guide.recGpuId) : null;
  return g.builds
    .map((b, i) => {
      const band = prices.bands[b.band];
      const gi = findGpu(b.gpu);
      const isPick = i === guide.pick;
      let meter = "";
      if (gi) {
        // 公式推奨GPU（多くは旧世代）と比べるので、DLSSなどの機能面を含まない描画性能（rasterScore）を使う
        const label = rec ? `描画性能スコア ${gi.rasterScore}（公式推奨GPU ${rec.name.replace(/^(GeForce|Radeon) /, "")} は ${rec.rasterScore}）` : `描画性能スコア ${gi.rasterScore}`;
        meter = `
              <div class="score">
                <div class="score__head"><span>描画性能スコア（GPU GUIDE）</span><strong>${gi.rasterScore}</strong></div>
                <div class="score__track" role="img" aria-label="${esc(label)}">
                  <span class="score__bar" style="width:${gi.rasterScore}%"></span>${rec ? `<span class="score__mark" style="left:${rec.rasterScore}%" title="公式推奨GPU"></span>` : ""}
                </div>
                ${rec ? `<p class="score__note"><span class="score__dot" aria-hidden="true"></span>線＝公式推奨GPU（${esc(rec.name.replace(/^(GeForce|Radeon) /, ""))}）</p>` : ""}
              </div>`;
      }
      return `            <article class="build-card${isPick ? " is-pick" : ""}">
              <p class="build-label">${esc(b.name)}${isPick ? '<span class="pick-badge">迷ったらこれ</span>' : ""}</p>
              <h3>${esc(b.target)}</h3>${b.who ? `
              <p class="build-who"><span>こんな人に</span>${esc(b.who)}</p>` : ""}
              <dl class="build-specs">
                <div><dt>CPU</dt><dd>${esc(b.cpu)}</dd></div>
                <div><dt>GPU</dt><dd>${gpuHtml(b.gpu, b.gpuVram)}</dd></div>
                ${b.gpuAlt ? `<div><dt>AMDなら</dt><dd>${gpuHtml(b.gpuAlt, b.gpuAltVram)}</dd></div>` : ""}
                <div><dt>メモリ</dt><dd>${esc(b.memory)}</dd></div>
                <div class="build-price"><dt>PC本体の予算</dt><dd>${esc(band.label)}${band.evidence === "estimated" ? '<span class="spec-sub">推定</span>' : ""}</dd></div>
              </dl>${meter}
              <p class="build-comment">${esc(fill(b.comment, g.id))}</p>
            </article>`;
    })
    .join("\n");
}

function specTable(t) {
  const head = `<tr><th scope="col">項目</th>${t.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr>`;
  const rows = t.rows
    .map((r) => {
      const cells = r.slice(1).map((v, i) => `<td data-label="${esc(t.columns[i])}"${/^記載なし/.test(v) ? ' class="is-na"' : ""}>${esc(v)}</td>`).join("");
      return `<tr><th scope="row">${esc(r[0])}</th>${cells}</tr>`;
    })
    .join("\n                ");
  return `          <h3 class="guide-subtitle">${esc(t.title)}</h3>
          <div class="table-wrap" tabindex="0" role="region" aria-label="${esc(t.title)}">
            <table class="spec-table spec-table--stack${t.columns.length >= 3 ? " spec-table--wide" : ""}">
              <thead>${head}</thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
          ${t.note ? `<p class="guide-note">${esc(t.note)}</p>` : ""}`;
}

/** guide.json の sections（任意）。ゲーム固有の詳しい解説を、既存の部品（guide-point・表・注意枠）で組む */
function extraSection(s, where) {
  const cards = (s.cards || [])
    .map(
      (c) =>
        `            <div class="guide-point">\n              <h3>${esc(c.title)}</h3>\n${c.text ? `              <p>${esc(fill(c.text, where))}</p>\n` : ""}${
          c.list ? `              <ul>\n${c.list.map((li) => `                <li>${esc(fill(li, where))}</li>`).join("\n")}\n              </ul>\n` : ""
        }            </div>`
    )
    .join("\n");
  const alert = s.alert
    ? `          <div class="guide-alert" role="note">
            <p class="guide-alert-title">${esc(s.alert.title)}</p>
${[].concat(s.alert.text).map((t) => `            <p>${esc(fill(t, where))}</p>`).join("\n")}
          </div>`
    : "";
  const links = (s.links || []).length
    ? `          <p class="guide-note">${esc(s.linksLabel || "あわせて確認")}：${s.links.map((l) => `<a href="${esc(l.href)}"${/^https?:\/\/(?!sippo-pc\.jp)/.test(l.href) ? ' target="_blank" rel="noopener noreferrer"' : ""}>${esc(l.text)}</a>`).join(" ／ ")}</p>`
    : "";
  return `        <section class="seo-guide-section" aria-labelledby="${esc(s.id)}">
          <div class="section-heading">
            <p class="section-label">${esc(s.label || "GUIDE")}</p>
            <h2 id="${esc(s.id)}">${esc(s.title)}</h2>
            ${s.intro ? `<p>${esc(fill(s.intro, where))}</p>` : ""}
          </div>
${s.table ? specTable(s.table) + "\n" : ""}${cards ? `          <div class="guide-points guide-points--${s.columns === 3 ? 3 : 2}">\n${cards}\n          </div>\n` : ""}${alert ? alert + "\n" : ""}${links}
        </section>`;
}

/** guide.json の seeAlso（任意）。シリーズの別ページなど、続けて読みたいページへの案内 */
function seeAlsoBlock(guide) {
  const s = guide.seeAlso;
  if (!s) return "";
  return `
          <aside class="hint-box guide-seealso" aria-label="${esc(s.title)}">
            <p class="hint-box-title">${esc(s.title)}</p>
            ${s.text ? `<p>${esc(s.text)}</p>` : ""}
            <p><a href="${esc(s.href)}">${esc(s.label)}</a></p>
          </aside>`;
}

function relatedBlock(g, guide) {
  const rel = (guide.related || []).map((s) => bySlug[s]).filter(Boolean);
  if (!rel.length) return "";
  return `        <section class="seo-guide-section" aria-labelledby="relatedTitle">
          <div class="section-heading">
            <p class="section-label">RELATED GAMES</p>
            <h2 id="relatedTitle">${esc(g.title)}と近いジャンル・遊び方のゲーム</h2>
          </div>
          <ul class="game-grid game-grid--related">
${rel.map((r) => card(r, "../", "h3")).join("\n")}
          </ul>
        </section>`;
}

function servicesBlock(g) {
  const pick = pickBuild(g);
  const gi = findGpu(pick.gpu);
  return `        <section class="next-steps" aria-labelledby="nextTitle">
          <h2 id="nextTitle" class="next-steps__title">次にやること</h2>
          <div class="related-site-grid">
            <a href="https://sippo-pc.jp/upgrade/" class="related-site-button related-site-upgrade">
              <span class="related-site-mini">PC UPGRADE</span>
              <span>今のPCで足りるか確認する</span>
              <small>今のCPU・GPUを入力して、交換で済むか買い替えるべきかを判定</small>
            </a>
            <a href="${gi ? gpuUrl(gi) : "https://sippo-pc.jp/gpu-guide/"}" class="related-site-button related-site-gpu">
              <span class="related-site-mini">GPU GUIDE</span>
              <span>${gi ? esc(pick.gpu) + "の性能・価格を見る" : "GPUを比較する"}</span>
              <small>おすすめ構成のGPUをほかのGPUと比べる</small>
            </a>
            <a href="https://sippo-pc.jp/pc-build-check/" class="related-site-button related-site-build">
              <span class="related-site-mini">PC BUILD CHECK</span>
              <span>予算からPC構成を診断する</span>
              <small>予算・用途・解像度から構成を選び、遊びたいゲームとの相性も確認</small>
            </a>
            <a href="https://sippo-pc.jp/pc-consult/" class="related-site-button related-site-consult">
              <span class="related-site-mini">ASK SIPPO</span>
              <span>買う前に相談する</span>
              <small>候補のPCや中古PCで${esc(g.title)}が遊べるか、シッポPC相談室で確認</small>
            </a>
          </div>
        </section>`;
}

function sourcesBlock(guide) {
  return `        <section class="sources" aria-labelledby="sourcesTitle">
          <h2 id="sourcesTitle" class="sources__title">出典と確認日</h2>
          <ul>
${guide.sources.map((s) => `            <li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a>（${jpDate(s.checked || guide.checked)}確認）</li>`).join("\n")}
            <li>PC本体の予算目安：${esc(prices.basis)}（${jpDate(prices.checked)}確認）${prices.sources.map((s) => ` <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a>`).join(" ／")}</li>
            <li>描画性能スコア：<a href="https://sippo-pc.jp/gpu-guide/">GPU GUIDE</a>のラスタースコア（DLSSなどの機能面を除いた描画性能の相対値。実測fpsではなく、GPU同士の目安の比較用）</li>
          </ul>
        </section>`;
}

function renderPage(g) {
  const slug = slugOf(g);
  const guide = guides[slug];
  const canonical = `${BASE}/games/${slug}.html`;
  const pageName = `${g.title} おすすめPC`;
  const pick = pickBuild(g);
  const pickBand = prices.bands[pick.band];
  const legacy = !!guide.legacyHtml;
  const where = `content/${slug}`;

  /* --- 構造化データ（書き下ろしHTML側が自前で持っている型は出さない） --- */
  const headPart = guide.parts.head ? fill(guide.parts.head, where) : "";
  const ld = [];
  if (!/"BreadcrumbList"/.test(headPart)) {
    ld.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Sippo", item: SITE + "/" },
        { "@type": "ListItem", position: 2, name: "GAME PC GUIDE", item: BASE + "/" },
        { "@type": "ListItem", position: 3, name: pageName, item: canonical },
      ],
    });
  }
  if (!/"Article"|"WebPage"/.test(headPart)) {
    ld.push({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: guide.seoTitle,
      description: guide.metaDescription,
      url: canonical,
      inLanguage: "ja",
      dateModified: LASTMOD,
      image: SITE_OGP.url,
      about: { "@type": "VideoGame", name: g.title },
      isPartOf: { "@type": "WebSite", name: "GAME PC GUIDE", url: BASE + "/" },
      publisher: { "@type": "Organization", name: "Sippo", url: SITE + "/" },
    });
  }
  if (!legacy && guide.faq.length && !/"FAQPage"/.test(headPart)) {
    ld.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: guide.faq.map((f) => ({
        "@type": "Question",
        name: fill(f.q, where),
        acceptedAnswer: { "@type": "Answer", text: fill(f.a, where) },
      })),
    });
  }

  /* --- 目次 --- */
  const toc = legacy
    ? null
    : [
        ["summaryTitle", "結論：迷ったらこの構成"],
        ["specsTitle", "公式の必要・推奨スペック"],
        ["buildsTitle", "Sippoのおすすめ構成"],
        ["resolutionTitle", "FHD・WQHD・4K別の目安"],
        ["pointsTitle", `${g.title}ならではのポイント`],
        ...(guide.sections || []).map((s) => [s.id, s.toc]),
        ["faqTitle", "よくある質問"],
      ];

  const tocHtml = toc
    ? `        <nav class="guide-toc" aria-label="このページの目次">
          <p class="guide-toc-title">目次</p>
          <ol>
${toc.map(([id, label]) => `            <li><a href="#${id}">${esc(label)}</a></li>`).join("\n")}
          </ol>
        </nav>`
    : "";

  const affiliate = `        <!-- 購入導線。中身は game-affiliate.js が共通基盤を使って描画する。
             商品を特定できない場合はこのセクションごと削除される。 -->
        <section class="affiliate-section" aria-labelledby="affiliateTitle"></section>`;

  const buildsSection = `        <section class="seo-guide-section" aria-labelledby="buildsTitle">
          <div class="section-heading">
            <p class="section-label section-label--sippo">SIPPO PICK</p>
            <h2 id="buildsTitle">${esc(g.title)}向けおすすめPC構成</h2>
            <p>ここからは公式スペックではなく、<strong>Sippoが快適さと予算のバランスで選んだ構成</strong>です。fpsは画質設定や場面で大きく変わるため、実測していない数値は載せていません。</p>
          </div>
          <div class="build-grid build-grid--${g.builds.length}">
${buildCards(g, guide)}
          </div>
          <p class="guide-note">予算はBTOの完成品（Windows付き）を想定した${esc(PRICE_MONTH)}時点の目安です。2026年はメモリとSSDの値上がりで価格が動きやすく、セールや構成の違いで数万円変わります。「推定」の付いた価格帯は、同じ構成の販売例を確認できず、近い構成の価格から推定した目安です。描画性能スコアはGPU GUIDEの数値で、DLSSなどの機能を除いた描画性能の相対値です（fpsではありません）。AMDの欄は、同じ価格帯で選べるRadeonの候補です。<a href="https://sippo-pc.jp/pc-build-check/">PC BUILD CHECK</a>の参考価格も同じくBTO完成品の目安ですが、パーツごとの価格から計算した概算で、価格を確認した時期も違うため、このページの目安より低く出ることがあります。</p>
        </section>`;

  let main;
  if (legacy) {
    const top = guide.parts.top ? fill(guide.parts.top, where) : "";
    let body = guide.parts.body ? fill(guide.parts.body, where) : "";
    body = body.includes("{{AFFILIATE}}") ? body.replace("{{AFFILIATE}}", affiliate.trim()) : `${body}\n\n${affiliate}`;
    main = `${top}

${buildsSection}

${body}`;
  } else {
    const rec = guide.recGpuId ? gpuById(guide.recGpuId) : null;
    const res = guide.resolutions
      .map(
        (r) =>
          `                <tr><th scope="row">${esc(r.res)}</th><td data-label="GPUの目安">${esc(r.gpu)}</td><td data-label="狙える目標">${esc(r.target)}</td><td data-label="補足">${esc(r.note)}</td></tr>`
      )
      .join("\n");
    main = `        <section class="guide-summary" aria-labelledby="summaryTitle">
          <div class="section-heading">
            <p class="section-label">QUICK ANSWER</p>
            <h2 id="summaryTitle">${esc(g.title)}を遊ぶPCの結論</h2>
          </div>
          <ul class="summary-grid">
            <li class="summary-item summary-item--pick">
              <span class="summary-key">迷ったらこの構成（Sippo）</span>
              <strong>${esc(pick.cpu)} + ${esc(pick.gpu)}${pick.gpuVram ? `（${esc(pick.gpuVram)}）` : ""}</strong>
              <small>${esc(pick.target)}・メモリ${esc(pick.memory)}・${esc(pickBand.label)}</small>
            </li>
            <li class="summary-item">
              <span class="summary-key">公式の推奨GPU</span>
              <strong>${esc(officialRecGpu(guide))}</strong>
              <small>${rec && findGpu(pick.gpu) ? `描画性能スコア（GPU GUIDE）は ${rec.rasterScore}。おすすめ構成の${esc(pick.gpu)}は ${findGpu(pick.gpu).rasterScore}` : "詳しくは下の公式スペック表へ"}</small>
            </li>
            <li class="summary-item">
              <span class="summary-key">目標にしたい環境</span>
              <strong>${esc(g.recommended)}</strong>
              <small>${esc(g.point)}</small>
            </li>
            <li class="summary-item summary-item--caution">
              <span class="summary-key">気をつけたいこと</span>
              <strong>${esc(g.caution)}</strong>
            </li>
          </ul>${seeAlsoBlock(guide)}
        </section>

        <section class="seo-guide-section" aria-labelledby="specsTitle">
          <div class="section-heading">
            <p class="section-label section-label--official">OFFICIAL SPEC</p>
            <h2 id="specsTitle">${esc(g.title)}の公式必要・推奨スペック</h2>
            <p>${guide.specUnverified ? "下の表は参考値です。公式の一次情報で最新の数値を確認できなかったため、購入前に必ず公式サイトを確認してください。" : `ゲームの公式情報に掲載されている動作環境です（${jpDate(guide.checked)}確認）。「最低」は起動して遊べる下限、「推奨」は標準的な画質で遊ぶ目安で、高画質・高fpsを保証するものではありません。公式に記載のない項目は「記載なし」としています。`}</p>
          </div>
${guide.specTables.map(specTable).join("\n")}
          <p class="guide-source">出典：${guide.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a>`).join("／")}</p>
        </section>

${buildsSection}

        <section class="seo-guide-section" aria-labelledby="resolutionTitle">
          <div class="section-heading">
            <p class="section-label section-label--sippo">RESOLUTION</p>
            <h2 id="resolutionTitle">FHD・WQHD・4K別 ${esc(g.title)}に必要なGPUの目安</h2>
            <p>解像度ごとのGPUの目安です。実測ベンチマークではなく、公式スペックとGPU同士の性能差から整理したSippoの目安です。</p>
          </div>
          <div class="table-wrap" tabindex="0" role="region" aria-label="解像度別のGPUの目安">
            <table class="spec-table spec-table--stack spec-table--res">
              <thead><tr><th scope="col">解像度</th><th scope="col">GPUの目安</th><th scope="col">狙える目標</th><th scope="col">補足</th></tr></thead>
              <tbody>
${res}
              </tbody>
            </table>
          </div>
          ${guide.tech ? `<p class="guide-note guide-note--tech"><strong>画質設定・アップスケーリング：</strong>${esc(guide.tech)}</p>` : ""}
        </section>

        <section class="seo-guide-section" aria-labelledby="pointsTitle">
          <div class="section-heading">
            <p class="section-label">GAME POINTS</p>
            <h2 id="pointsTitle">${esc(g.title)}のPC選びで知っておきたいこと</h2>
          </div>
          <div class="guide-points guide-points--${guide.points.length}">
${guide.points.map((p) => `            <div class="guide-point">\n              <h3>${esc(p.title)}</h3>\n              <p>${esc(fill(p.text, where))}</p>\n            </div>`).join("\n")}
          </div>
        </section>
${(guide.sections || []).map((s) => "\n" + extraSection(s, where)).join("\n")}
${affiliate}

        <section class="seo-guide-section" aria-labelledby="faqTitle">
          <div class="section-heading">
            <p class="section-label">FAQ</p>
            <h2 id="faqTitle">${esc(g.title)}のPCに関するよくある質問</h2>
          </div>
          <div class="faq-list">
${guide.faq.map((f) => `            <details class="faq-item">\n              <summary>${esc(fill(f.q, where))}</summary>\n              <p>${esc(fill(f.a, where))}</p>\n            </details>`).join("\n")}
          </div>
        </section>`;
  }

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />

  <title>${esc(guide.seoTitle)}</title>
  <meta name="description" content="${esc(guide.metaDescription)}" />
  <link rel="canonical" href="${canonical}" />

  <meta property="og:title" content="${esc(guide.seoTitle)}" />
  <meta property="og:description" content="${esc(guide.metaDescription)}" />
  <meta property="og:image" content="${SITE_OGP.url}" />
  <meta property="og:image:width" content="${SITE_OGP.width}" />
  <meta property="og:image:height" content="${SITE_OGP.height}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:site_name" content="GAME PC GUIDE" />
  <meta property="og:locale" content="ja_JP" />
  <meta name="twitter:card" content="summary_large_image" />

${showImage(g) ? `  <link rel="preload" as="image" href="../${esc(imageSet(g).hero)}" imagesrcset="../${esc(imageSet(g).thumb)} ${imageSize(imageSet(g).thumb)[0]}w, ../${esc(imageSet(g).hero)} ${imageSize(imageSet(g).hero)[0]}w" imagesizes="(max-width: 900px) calc(100vw - 32px), 520px" fetchpriority="high" />
` : ""}  <link rel="stylesheet" href="../style.css?v=${VER.css}" />
  <link rel="stylesheet" href="/shared/nav/sippo-nav.css" />
  <link rel="stylesheet" href="/shared/affiliate/affiliate.css" />
  <link rel="icon" type="image/png" href="../images/favicon.png" />

  <!-- PWA -->
  <link rel="manifest" href="../manifest.json" />
  <meta name="theme-color" content="#0b1120" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="GAME PC" />
  <link rel="apple-touch-icon" href="../images/favicon.png" />

${GTAG}

  <!-- 生成物（generate-games.js）。直接編集しないこと。本文は content/${slug}/ を直す -->
${ld.map(jsonLd).join("\n")}
${headPart ? headPart + "\n" : ""}</head>

<body data-sippo-theme="dark" data-sippo-site="game-pc-guide">
${header("../")}

  <main id="main">
    <div class="container">
      <nav class="breadcrumb" aria-label="パンくずリスト">
        <ol>
          <li><a href="https://sippo-pc.jp/">Sippo</a></li>
          <li><a href="../index.html">GAME PC GUIDE</a></li>
          <li aria-current="page">${esc(pageName)}</li>
        </ol>
      </nav>
    </div>

    <section class="gp-hero">
      <div class="container gp-hero__inner">
        <div class="gp-hero__media">
          ${showImage(g) ? gameImg(g, "../", "hero") : titleTile(g, "hero")}
        </div>
        <div class="gp-hero__text">
          <p class="gp-hero__chips"><span class="chip">${esc(g.genre)}</span><span class="chip chip--load">${loadMeter(g.load)}PC負荷：${esc(g.level)}</span>${statusChip(g)}</p>
          <h1>${esc(pageName)}</h1>
          <p class="gp-hero__lead">${esc(fill(guide.lead, where))}</p>
          <dl class="gp-hero__facts">
            <div><dt>迷ったらこの構成</dt><dd>${esc(pick.gpu)}${pick.gpuVram ? `（${esc(pick.gpuVram)}）` : ""} ／ ${esc(pickBand.label)}</dd></div>
            <div><dt>公式スペック確認日</dt><dd>${jpDate(guide.checked)}</dd></div>
          </dl>
        </div>
      </div>
    </section>

    <div class="container detail-layout">
      <div class="detail-main">
${tocHtml}
${main}

${legacy ? "" : sourcesBlock(guide)}

${relatedBlock(g, guide)}

${servicesBlock(g)}

        <p class="page-dates">このページの最終更新：<time datetime="${LASTMOD}">${LASTMOD}</time> ／ 公式スペックの確認：${jpDate(guide.checked)} ／ 価格の確認：${jpDate(prices.checked)}</p>
        <p class="detail-back-nav"><a href="../index.html#games" class="secondary-btn">← ほかのゲームを探す</a></p>
      </div>
    </div>
  </main>

${FOOTER}
  <!-- 共通アフィリエイト基盤（shared/affiliate）。設定→本体→利用側の順 -->
  <script src="/shared/affiliate/affiliate-config.js" defer></script>
  <script src="/shared/affiliate/affiliate.js" defer></script>
  <script src="../game-affiliate.js?v=${VER.aff}" defer></script>
  <script src="/shared/nav/sippo-nav.js" defer></script>
${SW}
</body>
</html>
`;
  if (/\{\{[^}]*\}\}/.test(html)) fail(`${slug}: 置き換え漏れのプレースホルダーがあります`);
  const lastmod = resolveDate("games/" + slug, html);
  const out = html.split(`">${LASTMOD}</time>`).join(`">${jpDate(lastmod)}</time>`).split(LASTMOD).join(lastmod);
  return { slug, html: out, lastmod };
}

function officialRecGpu(guide) {
  const t = guide.specTables && guide.specTables[0];
  if (!t) return "-";
  const row = t.rows.find((r) => r[0] === "GPU");
  if (!row) return "-";
  const col = t.columns.findIndex((c) => /推奨/.test(c));
  return row[1 + (col >= 0 ? col : t.columns.length - 1)];
}

/* ------------------------------------------------------------------ */
/*  一覧ページ（index.html の GENERATED マーカー）                        */
/* ------------------------------------------------------------------ */

/** マーカーの間を差し替える。同じマーカーが複数あれば全部。inline は文中用（改行を入れない） */
function replaceBlock(src, name, content, file, inline) {
  const re = new RegExp(`(<!-- GENERATED:${name} START[^>]*-->)[\\s\\S]*?(<!-- GENERATED:${name} END -->)`, "g");
  if (!re.test(src)) {
    fail(`${file}: GENERATED:${name} マーカーがありません`);
    return src;
  }
  return src.replace(re, (m, a, b) => (inline ? `${a}${content}${b}` : `${a}\n${content}\n${b}`));
}

function renderIndex(src) {
  const cards = games.map((g) => card(g, "", "h3")).join("\n");
  const newGames = games.filter((g) => isNew(g) || g.status === "early-access").sort((a, b) => (a.releaseDate < b.releaseDate ? 1 : -1));
  const featured = newGames
    .map(
      (g) => `<li><a class="new-item" href="games/${slugOf(g)}.html">${showImage(g) ? gameImg(g, "", "mini") : titleTile(g, "mini")}<span class="new-item__body"><span class="new-item__date">${jpMonth(g.releaseDate)}${g.status === "early-access" ? " 早期アクセス開始" : g.id === "palworld" ? " 正式版" : " 発売"}</span><span class="new-item__title">${esc(g.title)}</span><span class="new-item__meta">${esc(g.level)} ／ ${esc(prices.bands[pickBuild(g).band].label)}</span></span></a></li>`
    )
    .join("\n");
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "ゲーム別おすすめゲーミングPC一覧",
    numberOfItems: games.length,
    itemListElement: games.map((g, i) => ({ "@type": "ListItem", position: i + 1, name: `${g.title} おすすめPC`, url: `${BASE}/games/${slugOf(g)}.html` })),
  };
  let out = src;
  out = replaceBlock(out, "cards", cards, "index.html");
  out = replaceBlock(out, "new", featured, "index.html");
  out = replaceBlock(out, "itemlist", jsonLd(itemList), "index.html");
  out = replaceBlock(out, "count", String(games.length), "index.html", true);
  out = replaceBlock(out, "pricemonth", PRICE_MONTH, "index.html", true);
  out = replaceBlock(
    out,
    "pricebands",
    ["entry", "fhd", "wqhd", "high"]
      .map((k) => `<tr><th scope="row">${esc(prices.bands[k].example)}</th><td>${esc(prices.bands[k].label)}${prices.bands[k].evidence === "estimated" ? "（推定）" : ""}</td></tr>`)
      .join("\n"),
    "index.html"
  );
  return out;
}

function renderLlms(src) {
  const lines = games
    .map((g) => `- [${g.title} おすすめPC](${BASE}/games/${slugOf(g)}.html): ${g.genre} / PC負荷「${g.level}」。目安 ${g.recommended}。${g.cardText}`)
    .join("\n");
  return replaceBlock(src, "games", lines, "llms.txt");
}

/* ------------------------------------------------------------------ */
/*  実行                                                                */
/* ------------------------------------------------------------------ */

const pages = errors.length ? [] : games.map(renderPage);
const indexPath = path.join(ROOT, "index.html");
const llmsPath = path.join(ROOT, "llms.txt");
const indexHtml = errors.length ? "" : renderIndex(fs.readFileSync(indexPath, "utf8"));
const llms = errors.length ? "" : renderLlms(fs.readFileSync(llmsPath, "utf8"));

if (errors.length) {
  console.error("データに問題があるため、何も書き出していません:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

const write = (p, s) => fs.writeFileSync(p, s, "utf8"); // BOMなし・LF
fs.mkdirSync(path.join(ROOT, "games"), { recursive: true });
for (const p of pages) write(path.join(ROOT, "games", p.slug + ".html"), p.html);
const indexFinal = indexHtml
  .replace(/href="style\.css(\?v=[0-9a-f]+)?"/, `href="style.css?v=${VER.css}"`)
  .replace(/src="script\.js(\?v=[0-9a-f]+)?"/, `src="script.js?v=${VER.js}"`);
const indexLastmod = resolveDate("index", indexFinal);
write(indexPath, indexFinal);
write(llmsPath, llms);
write(path.join(ROOT, "data", "games.json"), JSON.stringify(games, null, 2) + "\n");

write(DATES_PATH, JSON.stringify(Object.fromEntries(Object.keys(pageDates).sort().map((k) => [k, pageDates[k]])), null, 2) + "\n");
const latest = indexLastmod;
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE}/</loc>
    <lastmod>${latest}</lastmod>
  </url>
${pages.map((p) => `  <url>\n    <loc>${BASE}/games/${p.slug}.html</loc>\n    <lastmod>${p.lastmod}</lastmod>\n  </url>`).join("\n")}
</urlset>
`;
write(path.join(ROOT, "sitemap.xml"), sitemap);

console.log(`Created ${pages.length} game pages, index.html, llms.txt, sitemap.xml (prices: ${prices.checked})`);
