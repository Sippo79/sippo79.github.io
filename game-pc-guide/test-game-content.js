/**
 * GAME PC GUIDE の検証（2026-10-18〜 全ページ・データ整合性まで対象）
 *   node game-pc-guide/test-game-content.js
 *
 * 生成後の games/*.html・index.html と、元データ（games.json / guide.json / price-bands.json）を照合する。
 *
 * 【NG（終了コード1）】
 *  - title / description / canonical / h1 が1つずつない、canonical がURLと違う
 *  - 見出しの階層飛ばし（h2 を飛ばして h3 など）
 *  - id の重複、ページ内リンク（#id）の飛び先が無い
 *  - {{...}} の置き換え漏れ、購入導線の枠が1つでない
 *  - JSON-LD がパースできない、FAQPage と表示中のFAQが一致しない
 *  - サイト内リンク・画像の参照先ファイルが無い、img に alt 属性が無い
 *  - 構成の予算が price-bands.json と違う、VRAMの表記が GPU GUIDE と矛盾する
 *  - 60fps上限のゲーム（guide.json の fpsCap）の構成・目安に 144fps / 240fps が書かれている
 *  - 一覧のカード数・リンク・sitemap がゲーム数と合わない
 * 【注意（終了コードは0のまま）】
 *  - 公式スペックの確認日が180日以上前
 *  - 構成のGPU/CPUが購入導線の商品マスターで引けない（ボタンが出ない）
 *  - 3ページ以上で同じ文が使われている（テンプレ文の量産）
 */
"use strict";

const fs = require("fs");
const path = require("path");

const root = __dirname;
const siteRoot = path.join(root, "..");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, ""));

const games = readJson(path.join(root, "data", "games.json"));
const prices = readJson(path.join(root, "data", "price-bands.json"));
const gpus = readJson(path.join(siteRoot, "gpu-guide", "gpus.json"));
const master = readJson(path.join(siteRoot, "shared", "affiliate", "affiliate-master.json"));

let failures = 0;
const warnings = [];
function check(ok, msg) {
  if (ok) return;
  failures++;
  console.error("  NG: " + msg);
}
const warn = (msg) => warnings.push(msg);

function decode(s) {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function siteFileFor(urlPath) {
  const clean = urlPath.split("#")[0].split("?")[0];
  const p = path.join(siteRoot, decodeURIComponent(clean));
  if (clean.endsWith("/")) return path.join(p, "index.html");
  return p;
}

function checkHtml(file, html, expectCanonical) {
  check((html.match(/<title>[^<]+<\/title>/g) || []).length === 1, "title が1つではない");
  check((html.match(/<meta name="description" content="[^"]+"/g) || []).length === 1, "description が1つではない");
  if (expectCanonical) check(html.includes(`<link rel="canonical" href="${expectCanonical}"`), "canonical がURLと一致しない");
  check((html.match(/<h1[\s>]/g) || []).length === 1, "h1 が1つではない");

  // 見出しの階層飛ばし
  let prev = 1;
  for (const m of html.matchAll(/<h([1-6])[\s>]/g)) {
    const lv = Number(m[1]);
    check(lv <= prev + 1, `見出しの階層飛ばし（h${prev} の次に h${lv}）`);
    prev = lv;
  }

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  check(dup.length === 0, "id の重複: " + [...new Set(dup)].join(", "));
  for (const m of html.matchAll(/href="#([^"]+)"/g)) check(ids.includes(m[1]), "ページ内リンクの飛び先が無い: #" + m[1]);

  check(!/\{\{[^}]*\}\}/.test(html.replace(/<!--[\s\S]*?-->/g, "")), "{{...}} の置き換え漏れ");

  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let faqLd = null;
  for (const b of blocks) {
    try {
      const data = JSON.parse(b);
      if (data["@type"] === "FAQPage") faqLd = data;
    } catch (e) {
      check(false, "JSON-LD がパースできない: " + e.message);
    }
  }
  const shown = [...html.matchAll(/<details class="faq-item">\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)].map((m) => ({ q: decode(m[1]), a: decode(m[2]) }));
  if (faqLd || shown.length) {
    check(!!faqLd, "表示中のFAQがあるのに FAQPage が無い");
    const ld = faqLd ? faqLd.mainEntity.map((e) => ({ q: e.name, a: e.acceptedAnswer.text })) : [];
    check(ld.length === shown.length, `FAQ の件数が違う（JSON-LD ${ld.length} / 表示 ${shown.length}）`);
    ld.forEach((e, i) => {
      const s = shown[i] || {};
      check(e.q === s.q, `FAQ ${i + 1} の質問が違う`);
      check(e.a === s.a, `FAQ ${i + 1} の回答が違う`);
    });
  }

  const baseDir = path.dirname(file);
  for (const m of html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)) {
    const href = m[1];
    let target = null;
    if (href.startsWith("https://sippo-pc.jp/")) target = siteFileFor(href.slice("https://sippo-pc.jp".length));
    else if (href.startsWith("/")) target = siteFileFor(href);
    else if (!/^[a-z]+:/i.test(href) && !href.startsWith("?")) target = path.join(baseDir, href.split("#")[0].split("?")[0]);
    if (target) check(fs.existsSync(target), "参照先が無い: " + href);
  }
  for (const m of html.matchAll(/<img\b[^>]*>/g)) check(/\salt="/.test(m[0]), "alt属性の無い img: " + m[0].slice(0, 80));
}

/* --- ゲームページ --- */
const today = new Date(prices.checked);
const sentenceOwners = {};

for (const g of games) {
  const slug = g.slug || g.id;
  const file = path.join(root, "games", slug + ".html");
  console.log("games/" + slug + ".html");
  check(fs.existsSync(file), "生成ページが無い（generate-games.js を実行したか）");
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, "utf8");
  checkHtml(file, html, `https://sippo-pc.jp/game-pc-guide/games/${slug}.html`);
  check((html.match(/class="affiliate-section"/g) || []).length === 1, "購入導線の枠が1つではない");

  const guide = readJson(path.join(root, "content", slug, "guide.json"));

  // 予算・VRAM・fps上限
  for (const b of g.builds) {
    const band = prices.bands[b.band];
    check(band && b.price === band.label, `${b.name}: price が price-bands.json と一致しない（generate-games.js を実行したか）`);
    for (const [name, vram] of [[b.gpu, b.gpuVram], [b.gpuAlt, b.gpuAltVram]]) {
      if (!name) continue;
      const k = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const gi = gpus.find((x) => x.id.replace(/[^a-z0-9]/g, "") === k);
      if (!gi) {
        warn(`${slug}: ${name} が GPU GUIDE に無い（リンク・スコアが出ない）`);
        continue;
      }
      if (vram) {
        // 8GB/16GB の2モデルがあるGPUだけ、版の指定を許す
        const n = Number(String(vram).replace(/[^0-9]/g, ""));
        check([8, 16].includes(n) && /5060 ?ti|9060 ?xt/i.test(name), `${slug}: ${name} に ${vram} の指定は不自然`);
      }
    }
    for (const part of [b.gpu, b.cpu]) {
      const k = part.toLowerCase().replace(/[^a-z0-9]/g, "");
      const hit = Object.values(master.products || master).some((p) => p && p.name && p.name.toLowerCase().replace(/[^a-z0-9]/g, "").endsWith(k));
      if (!hit) warn(`${slug}: ${part} が購入導線の商品マスターで引けない可能性`);
    }
    if (guide.fpsCap) check(!/144|240/.test(b.target), `${slug}: fps上限${guide.fpsCap}のゲームの構成に高fpsの目標「${b.target}」`);
  }
  if (guide.fpsCap) check(!/144|240/.test(g.recommended), `${slug}: fps上限${guide.fpsCap}のゲームの目安に高fps表記「${g.recommended}」`);

  const age = (today - new Date(guide.checked)) / 86400000;
  if (age > 180) warn(`${slug}: 公式スペックの確認日が${Math.round(age)}日前（${guide.checked}）`);

  // テンプレ文の量産チェック用に、本文の文を集める
  const texts = [
    guide.lead,
    ...(guide.points || []).map((p) => p.text),
    ...(guide.faq || []).map((f) => f.a),
    ...g.builds.map((b) => b.comment),
  ].filter(Boolean);
  for (const t of texts) {
    for (const s of t.split(/(?<=。)/)) {
      const key = s.replace(/\{\{[^}]+\}\}/g, "").trim();
      if (key.length < 20) continue;
      (sentenceOwners[key] = sentenceOwners[key] || new Set()).add(slug);
    }
  }
}

for (const [s, owners] of Object.entries(sentenceOwners)) {
  if (owners.size >= 3) warn(`同じ文が${owners.size}ページで使われています: 「${s.slice(0, 40)}…」`);
}

/* --- 一覧・sitemap --- */
console.log("index.html");
const indexFile = path.join(root, "index.html");
const index = fs.readFileSync(indexFile, "utf8");
checkHtml(indexFile, index, "https://sippo-pc.jp/game-pc-guide/");
check((index.match(/<li class="game-card"/g) || []).length === games.length, "一覧のカード数がゲーム数と違う");
for (const g of games) check(index.includes(`href="games/${g.slug || g.id}.html"`), `一覧に ${g.title} へのリンクが無い`);

console.log("sitemap.xml");
const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
for (const g of games) check(sitemap.includes(`/games/${g.slug || g.id}.html</loc>`), `sitemap に ${g.slug || g.id} が無い`);
check(!/\.html\?/.test(sitemap) && !sitemap.includes("game.html"), "sitemap にクエリURL・旧ページが混ざっている");

/* --- 2026-10-18 監査で追加した検査 --- */
console.log("監査項目");
const crypto = require("crypto");
const ver = (f) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, f))).digest("hex").slice(0, 16).slice(0, 10);
const VER = { css: ver("style.css"), js: ver("script.js"), aff: ver("game-affiliate.js") };
const pageDates = readJson(path.join(root, "data", "page-dates.json"));
const findGpu = (n) => gpus.find((x) => x.id.replace(/[^a-z0-9]/g, "") === String(n).toLowerCase().replace(/[^a-z0-9]/g, ""));

function imgSize(file) {
  const b = fs.readFileSync(file);
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
  return null;
}
function checkImages(file, html) {
  for (const m of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/g)) {
    const src = m[1];
    if (/^https?:/.test(src)) continue;
    const abs = path.join(path.dirname(file), src);
    const w = (m[0].match(/\bwidth="(\d+)"/) || [])[1];
    const h = (m[0].match(/\bheight="(\d+)"/) || [])[1];
    check(w && h, `${path.basename(file)}: width/height の無い img: ${src}`);
    const real = fs.existsSync(abs) && imgSize(abs);
    if (real && w && h) check(Number(w) === real[0] && Number(h) === real[1], `${path.basename(file)}: ${src} の width/height（${w}x${h}）が実寸（${real.join("x")}）と違う`);
  }
}

// 拡張子と中身の一致（og:image に使う .jpg が実は WebP、を防ぐ）
for (const f of fs.readdirSync(path.join(root, "images"))) {
  const b = fs.readFileSync(path.join(root, "images", f));
  if (/\.jpe?g$/i.test(f)) check(b[0] === 0xff && b[1] === 0xd8, `images/${f} の中身がJPEGではない`);
  if (/\.webp$/i.test(f)) check(b.toString("ascii", 0, 4) === "RIFF", `images/${f} の中身がWebPではない`);
}

for (const g of games) {
  const slug = g.slug || g.id;
  const file = path.join(root, "games", slug + ".html");
  const html = fs.readFileSync(file, "utf8");
  const guide = readJson(path.join(root, "content", slug, "guide.json"));

  // CSS/JS は内容ハッシュつきURL（SWが古いCSSを返さないように）
  check(html.includes(`style.css?v=${VER.css}"`), `${slug}: style.css の版番号が古い（generate-games.js を実行したか）`);
  check(html.includes(`game-affiliate.js?v=${VER.aff}"`), `${slug}: game-affiliate.js の版番号が古い`);

  // 更新日：sitemap・JSON-LD・表示が page-dates.json と一致
  const d = pageDates["games/" + slug];
  check(d && /^\d{4}-\d{2}-\d{2}$/.test(d.modified), `${slug}: page-dates.json に日付が無い`);
  if (d) {
    const sm = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
    check(sm.includes(`/games/${slug}.html</loc>\n    <lastmod>${d.modified}</lastmod>`), `${slug}: sitemap の lastmod が ${d.modified} ではない`);
    if (!guide.legacyHtml) check(html.includes(`"dateModified": "${d.modified}"`), `${slug}: JSON-LD の dateModified が ${d.modified} ではない`);
    check(html.includes(`<time datetime="${d.modified}">`), `${slug}: 表示中の最終更新日が ${d.modified} ではない`);
  }

  checkImages(file, html);

  // 推定の予算帯は「推定」と表示している
  for (const b of g.builds) if (prices.bands[b.band].evidence === "estimated") check(html.includes(`${prices.bands[b.band].label}<span class="spec-sub">推定</span>`), `${slug}: 推定の予算帯（${b.band}）に「推定」が無い`);

  // 構成の説明文の比較表現と、描画性能スコア（rasterScore）の大小が矛盾しない
  const rec = guide.recGpuId && gpus.find((x) => x.id === guide.recGpuId);
  if (rec) {
    for (const b of g.builds) {
      const x = findGpu(b.gpu);
      if (!x) continue;
      if (/届かない|下回|より下/.test(b.comment)) check(x.rasterScore < rec.rasterScore, `${slug}: 「${b.gpu}は公式推奨より下」と書いているが描画性能スコアは ${x.rasterScore} ≥ ${rec.rasterScore}`);
      if (/(上回|超え|同等以上|一段上)/.test(b.comment) && !/下回|届かない|より下/.test(b.comment)) check(x.rasterScore >= rec.rasterScore, `${slug}: 「${b.gpu}は公式推奨以上」と書いているが描画性能スコアは ${x.rasterScore} < ${rec.rasterScore}`);
    }
  }
}
// 画像の権利（data/image-rights.json）：表示を許可していない画像をどのページも参照しない
const rights = readJson(path.join(root, "data", "image-rights.json"));
const allowedFiles = new Set();
for (const g of games) {
  const r = rights.images[g.id];
  check(!!r, `image-rights.json に ${g.id} の記録が無い`);
  if (!r) continue;
  check(["A", "B", "C", "D"].includes(r.grade) && r.basis, `image-rights.json: ${g.id} の判定・根拠が無い`);
  check(!(r.display && !["A", "B"].includes(r.grade)), `image-rights.json: ${g.id} は判定${r.grade}なのに表示する設定`);
  const base = r.file.replace(/\.jpg$/, "");
  if (!r.display) for (const f of [base + ".jpg", base + ".webp", base + "-thumb.webp"]) check(!fs.existsSync(path.join(root, "images", f)), `表示を許可していない画像（判定${r.grade}）が公開ディレクトリに残っている: images/${f}`);
  if (r.display) [base + ".jpg", base + ".webp", base + "-thumb.webp"].forEach((f) => allowedFiles.add(f));
  const page = fs.readFileSync(path.join(root, "games", (g.slug || g.id) + ".html"), "utf8");
  if (!r.display) check(page.includes('content="https://sippo-pc.jp/game-pc-guide/images/ogp.jpg"'), `${g.id}: 画像を出さないゲームの og:image がサイト共通画像になっていない`);
}
for (const s of Object.values(rights.siteImages)) if (s.display) allowedFiles.add(s.file);
const pagesToScan = [path.join(root, "index.html"), ...fs.readdirSync(path.join(root, "games")).map((f) => path.join(root, "games", f))];
for (const p of pagesToScan) {
  const html = fs.readFileSync(p, "utf8");
  for (const m of html.matchAll(/images\/([a-z0-9-]+(?:-thumb)?\.(?:jpg|webp))/g)) {
    check(allowedFiles.has(m[1]), `${path.basename(p)}: 表示を許可していない画像を参照: images/${m[1]}`);
  }
}

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
check(indexHtml.includes(`style.css?v=${VER.css}"`) && indexHtml.includes(`script.js?v=${VER.js}"`), "index.html: CSS/JS の版番号が古い");
checkImages(path.join(root, "index.html"), indexHtml);
for (const [k, b] of Object.entries(prices.bands)) check(["observed", "estimated"].includes(b.evidence) && b.basis, `price-bands.json: ${k} に根拠（evidence / basis）が無い`);

// 再生成しても出力が変わらない（更新日が勝手に動かない）。--no-regen で省略できる
if (!process.argv.includes("--no-regen")) {
  const outFiles = () => [
    ...fs.readdirSync(path.join(root, "games")).map((f) => path.join(root, "games", f)),
    path.join(root, "index.html"), path.join(root, "sitemap.xml"), path.join(root, "llms.txt"),
    path.join(root, "data", "games.json"), path.join(root, "data", "page-dates.json"),
  ];
  const snap = () => outFiles().map((f) => f + ":" + crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex")).join("\n");
  const before = snap();
  require("child_process").execFileSync(process.execPath, [path.join(root, "generate-games.js")], { stdio: "ignore" });
  check(before === snap(), "再生成すると出力が変わる（生成し直していないデータの変更があるか、生成が不安定）");
}

if (warnings.length) {
  console.log("\n注意（" + warnings.length + "件）:");
  for (const w of warnings) console.log("  - " + w);
}
if (failures) {
  console.error("\n" + failures + " 件の問題があります");
  process.exit(1);
}
console.log("\nOK");
