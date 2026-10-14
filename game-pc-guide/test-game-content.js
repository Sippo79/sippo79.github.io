/**
 * 書き下ろし本文（content/<slug>/）を持つゲームページの検証。
 *   node game-pc-guide/test-game-content.js
 *
 * 生成後の games/<slug>.html を読んで、手で書いた本文が壊れていないかを見る。
 *  - title / description / canonical / h1 が1つずつある
 *  - id の重複がなく、ページ内リンク（#id）の飛び先がある
 *  - JSON-LD がすべてパースでき、FAQPage と表示中のFAQが一字一句一致する
 *  - サイト内リンク（相対・https://sippo-pc.jp/）の飛び先ファイルが実在する
 *  - {{AFFILIATE}} の置き忘れがなく、購入導線の枠が1つだけある
 */
"use strict";

const fs = require("fs");
const path = require("path");

const root = __dirname;
const siteRoot = path.join(root, "..");
const contentDir = path.join(root, "content");

let failures = 0;
function check(ok, msg) {
  if (ok) return;
  failures++;
  console.error("  NG: " + msg);
}

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

const slugs = fs.existsSync(contentDir)
  ? fs.readdirSync(contentDir).filter((d) => fs.statSync(path.join(contentDir, d)).isDirectory())
  : [];

for (const slug of slugs) {
  const file = path.join(root, "games", slug + ".html");
  console.log("games/" + slug + ".html");
  check(fs.existsSync(file), "生成ページが無い（Generate-StaticGames.ps1 を実行したか）");
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, "utf8");

  // SEOタグ
  check((html.match(/<title>[^<]+<\/title>/g) || []).length === 1, "title が1つではない");
  check((html.match(/<meta name="description" content="[^"]+"/g) || []).length === 1, "description が1つではない");
  check(html.includes('<link rel="canonical" href="https://sippo-pc.jp/game-pc-guide/games/' + slug + '.html"'), "canonical がURLと一致しない");
  check((html.match(/<h1[\s>]/g) || []).length === 1, "h1 が1つではない");

  // id とページ内リンク
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  check(dup.length === 0, "id の重複: " + dup.join(", "));
  for (const m of html.matchAll(/href="#([^"]+)"/g)) {
    check(ids.includes(m[1]), "ページ内リンクの飛び先が無い: #" + m[1]);
  }

  // 置き換え漏れ・購入導線
  check(!html.includes("{{"), "{{...}} の置き換え漏れ");
  check((html.match(/class="affiliate-section"/g) || []).length === 1, "購入導線の枠が1つではない");

  // JSON-LD と FAQ
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
  const shown = [...html.matchAll(/<details class="faq-item">\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)]
    .map((m) => ({ q: decode(m[1]), a: decode(m[2]) }));
  if (faqLd || shown.length) {
    check(!!faqLd, "表示中のFAQがあるのに FAQPage が無い");
    const ld = faqLd ? faqLd.mainEntity.map((e) => ({ q: e.name, a: e.acceptedAnswer.text })) : [];
    check(ld.length === shown.length, "FAQ の件数が違う（JSON-LD " + ld.length + " / 表示 " + shown.length + "）");
    ld.forEach((e, i) => {
      const s = shown[i] || {};
      check(e.q === s.q, "FAQ " + (i + 1) + " の質問が違う");
      check(e.a === s.a, "FAQ " + (i + 1) + " の回答が違う");
    });
  }

  // サイト内リンク
  for (const m of html.matchAll(/href="([^"#][^"]*)"/g)) {
    const href = m[1];
    let target = null;
    if (href.startsWith("https://sippo-pc.jp/")) {
      target = siteFileFor(href.slice("https://sippo-pc.jp".length));
    } else if (href.startsWith("/")) {
      target = siteFileFor(href);
    } else if (!/^[a-z]+:/i.test(href)) {
      target = path.join(root, "games", href.split("#")[0]);
    }
    if (target) check(fs.existsSync(target), "リンク先が無い: " + href);
  }
}

if (!slugs.length) console.log("content/ に書き下ろし本文はありません");
if (failures) {
  console.error(failures + " 件の問題があります");
  process.exit(1);
}
console.log("OK");
