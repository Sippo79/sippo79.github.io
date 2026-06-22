#!/usr/bin/env node
/**
 * PC Builds Hub — sitemap 生成スクリプト
 * =====================================================================
 * 静的ページ＋「承認済み(status='approved')」の投稿詳細URLだけを並べた
 * sitemap.xml を生成します。
 *
 * 特徴：
 *  - 新規の有料API / 外部有料サービス / 従量課金は一切使いません。
 *    既存の Supabase（無料の anon key + RLS）の REST API を読むだけです。
 *  - 外部 npm パッケージ不要。Node.js 18+ の標準 fetch のみで動きます。
 *  - 認証なし(anon)でアクセスするため、RLS により取得できるのは
 *    status='approved' の投稿のみ。未承認 / 下書き / 却下は構造的に出ません。
 *    （※下の eq.approved は二重の安全策）
 *
 * 使い方：
 *    node generate-sitemap.js
 *  生成後、sitemap.xml をコミットして GitHub Pages にデプロイしてください。
 * =====================================================================
 */

"use strict";

const fs = require("fs");
const path = require("path");

// --- 設定 -----------------------------------------------------------
const SITE_BASE = "https://sippo-pc.jp/pc-builds-hub/"; // 末尾スラッシュ必須
const OUTPUT_FILE = path.join(__dirname, "sitemap.xml");
const CONFIG_FILE = path.join(__dirname, "supabase-config.js");
const POST_LIMIT = 5000; // 念のための上限

// サイトマップに必ず含める静的ページ（検索流入が不要なページは入れない）。
// login.html / mypage.html / submit.html / edit.html / admin.html は除外。
const STATIC_PAGES = [
  { loc: "", changefreq: "daily", priority: "1.0" }, // = サイトルート(index)
  { loc: "all-posts.html", changefreq: "daily", priority: "0.9" },
  { loc: "post.html", changefreq: "weekly", priority: "0.3" },
];

// --- supabase-config.js から URL / anon key を読む（単一情報源） -------
function readSupabaseConfig() {
  let text;
  try {
    text = fs.readFileSync(CONFIG_FILE, "utf8");
  } catch (e) {
    return { url: "", anonKey: "" };
  }
  const url = (text.match(/url\s*:\s*["'`]([^"'`]+)["'`]/) || [])[1] || "";
  const anonKey = (text.match(/anonKey\s*:\s*["'`]([^"'`]+)["'`]/) || [])[1] || "";
  return { url: url.trim(), anonKey: anonKey.trim() };
}

function isPlaceholder(value) {
  return !value || /YOUR_|example|xxxx/i.test(value);
}

// --- XML エスケープ -------------------------------------------------
function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toIsoDate(value) {
  const d = value ? new Date(value) : null;
  if (!d || isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// --- 承認済み投稿の取得（Supabase REST / anon） ---------------------
async function fetchApprovedPosts(cfg) {
  if (isPlaceholder(cfg.url) || isPlaceholder(cfg.anonKey)) {
    console.warn(
      "[generate-sitemap] Supabase 未設定のため、静的ページのみ出力します。"
    );
    return [];
  }
  if (typeof fetch !== "function") {
    throw new Error("Node.js 18 以上が必要です（標準 fetch を使用します）。");
  }

  const endpoint =
    cfg.url.replace(/\/+$/, "") +
    "/rest/v1/posts" +
    "?select=id,updated_at,created_at" +
    "&status=eq.approved" + // 承認済みのみ（RLS と二重の安全策）
    "&order=created_at.desc" +
    "&limit=" +
    POST_LIMIT;

  const res = await fetch(endpoint, {
    headers: {
      apikey: cfg.anonKey,
      Authorization: "Bearer " + cfg.anonKey,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(
      "Supabase 取得失敗: " + res.status + " " + (await res.text())
    );
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

// --- sitemap.xml 構築 ----------------------------------------------
function buildUrlEntry({ loc, lastmod, changefreq, priority }) {
  const lines = ["  <url>", "    <loc>" + xmlEscape(loc) + "</loc>"];
  if (lastmod) lines.push("    <lastmod>" + lastmod + "</lastmod>");
  if (changefreq) lines.push("    <changefreq>" + changefreq + "</changefreq>");
  if (priority) lines.push("    <priority>" + priority + "</priority>");
  lines.push("  </url>");
  return lines.join("\n");
}

function buildSitemap(posts) {
  const entries = [];

  for (const page of STATIC_PAGES) {
    entries.push(
      buildUrlEntry({
        loc: SITE_BASE + page.loc,
        changefreq: page.changefreq,
        priority: page.priority,
      })
    );
  }

  for (const post of posts) {
    if (!post || !post.id) continue;
    entries.push(
      buildUrlEntry({
        loc: SITE_BASE + "post.html?id=" + encodeURIComponent(post.id),
        lastmod: toIsoDate(post.updated_at || post.created_at),
        changefreq: "weekly",
        priority: "0.7",
      })
    );
  }

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    "<!-- 自動生成: generate-sitemap.js（手で編集しないでください） -->\n" +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.join("\n") +
    "\n</urlset>\n"
  );
}

// --- メイン ---------------------------------------------------------
(async function main() {
  try {
    const cfg = readSupabaseConfig();
    const posts = await fetchApprovedPosts(cfg);
    const xml = buildSitemap(posts);
    fs.writeFileSync(OUTPUT_FILE, xml, "utf8");
    console.log(
      "[generate-sitemap] 出力完了: " +
        OUTPUT_FILE +
        " （静的 " +
        STATIC_PAGES.length +
        " 件 + 承認済み投稿 " +
        posts.length +
        " 件）"
    );
  } catch (e) {
    console.error("[generate-sitemap] 失敗:", e.message || e);
    process.exit(1);
  }
})();
