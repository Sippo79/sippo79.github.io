/*
 * pc-build-check/generate-index-sections.js
 *
 * index.html の「Sample Result」「シッポのおすすめ構成」「解像度別 全構成一覧」を
 * builds.json から生成して差し込む。
 *
 * なぜ必要か:
 *   以前はこの3か所を index.html に手書きしていたため、builds.json（=個別ページ）を
 *   更新しても反映されず、「トップでは RTX 4070 SUPER、個別ページでは RX 9070 XT」
 *   のような食い違いが75件中27件＋おすすめ構成3件すべてで起きていた。
 *
 * 方針:
 *   - 検索エンジンが読めるよう、JSで描画せず静的HTMLとして書き込む（SEOを維持）。
 *   - 書き換えるのはマーカーコメントで挟んだ範囲だけ。ほかの本文には触れない。
 *   - おすすめ構成の並び順・バッジ・一言は builds.json の featured に持たせる（構成と一緒に管理）。
 *     ★運営が選んだおすすめであって、アクセス数などの実測ランキングではない。
 *       「人気」「ランキング」「〇位」など実測と誤解される表記にしないこと。
 *   - 参考価格は shared/parts/build-price.js、構成の判定は build-profile.js と同じものを使う。
 *
 * 実行:
 *   node generate-index-sections.js          … index.html を更新
 *   node generate-index-sections.js --check  … 更新が必要なら exit 1（テスト用）
 * generate-builds.ps1 の最後でも自動で呼ばれる。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "..");
const Profile = require("./build-profile.js");
const esc = Profile.esc;

function readJson(relPath) {
  // builds.json は BOM 付き（PowerShell で扱うため）。
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), "utf8").replace(/^﻿/, ""));
}

const builds = readJson("pc-build-check/builds.json");
const ctx = {
  prices: readJson("shared/parts/part-prices.json"),
  gpuList: readJson("gpu-guide/gpus.json"),
};

const USAGE_ORDER = ["fps", "mmo", "stream", "creative", "daily"];
const RES_GROUPS = [
  { key: "fhd", summary: "フルHD（1080p）向けの構成" },
  { key: "wqhd", summary: "WQHD（1440p）向けの構成" },
  { key: "4k", summary: "4K（2160p）向けの構成" },
];
const USAGE_LIST_LABEL = {
  fps: "FPSゲーム",
  mmo: "MMO・RPG",
  stream: "配信・録画",
  creative: "動画編集・制作",
  daily: "普段使い",
};

function featuredBuilds() {
  return builds
    .filter((b) => b.featured && Number.isFinite(Number(b.featured.rank)))
    .sort((a, b) => a.featured.rank - b.featured.rank);
}

/* ---------- Sample Result（ヒーロー右のカード） ---------- */
function renderSample() {
  const top = featuredBuilds()[0];
  if (!top) throw new Error("builds.json に featured.rank の構成がありません（Sample Result の元データ）");
  const a = Profile.analyze(top, ctx);
  return `
          <p class="card-label">Sample Result</p>
          <h2>${esc(a.resolutionLabel)} ${esc(a.usageLabel)}向け</h2>
          <ul>
            <li><span>CPU</span> ${esc(a.cpu)}</li>
            <li><span>GPU</span> ${esc(a.gpu)}</li>
            <li><span>メモリ</span> ${esc(a.ram)}</li>
            <li><span>予算</span> ${a.budgetMan}万円前後</li>${a.priceText ? `
            <li><span>参考価格</span> ${esc(a.priceText)}</li>` : ""}
          </ul>
          <a class="hero-card-link" href="./builds/${esc(a.slug)}.html">この構成の詳細を見る →</a>
`;
}

/* ---------- シッポのおすすめ構成 ---------- */
function renderPopular() {
  return featuredBuilds()
    .map((b) => {
      const a = Profile.analyze(b, ctx);
      const badges = (b.featured.badges || [])
        .map((label) => `<span class="build-badge ${badgeClass(label)}">${esc(label)}</span>`)
        .join("\n                  ");
      return `
            <article class="popular-build-card">
              <div class="popular-rank">おすすめ<br>${esc(b.featured.rank)}</div>
              <div class="popular-build-body">
                <div class="build-badges">
                  ${badges}
                </div>
                <h3>${esc(b.title)}</h3>
                <dl class="popular-build-specs">
                  <div>
                    <dt>予算目安</dt>
                    <dd>${a.budgetMan}万円前後</dd>
                  </div>
                  <div>
                    <dt>用途</dt>
                    <dd>${esc(a.usageLabel)}</dd>
                  </div>
                  <div>
                    <dt>CPU</dt>
                    <dd>${esc(a.cpu)}</dd>
                  </div>
                  <div>
                    <dt>GPU（グラボ）</dt>
                    <dd>${esc(a.gpu)}</dd>
                  </div>
                  <div>
                    <dt>メモリ / SSD</dt>
                    <dd>${esc(a.ram)} / ${esc(a.storage.replace(/\s*NVMe SSD$/, ""))}</dd>
                  </div>${a.priceText ? `
                  <div>
                    <dt>参考価格</dt>
                    <dd>${esc(a.priceText)}</dd>
                  </div>` : ""}
                </dl>
                <p>${esc(b.featured.note || "")}</p>
                <a href="./builds/${esc(a.slug)}.html" class="popular-detail-link">この構成の詳細を見る →</a>
              </div>
            </article>
`;
    })
    .join("");
}

/* 既存のバッジ色（style.css の badge-*）に合わせる。知らないラベルは既定色。 */
function badgeClass(label) {
  if (/いちおし/.test(label)) return "badge-popular";
  if (/FPS/.test(label)) return "badge-fps";
  if (/コスパ/.test(label)) return "badge-cospa";
  if (/初心者/.test(label)) return "badge-beginner";
  if (/クリエイター/.test(label)) return "badge-creative";
  if (/長く/.test(label)) return "badge-longrun";
  return "badge-popular";
}

/* ---------- 解像度別 全構成一覧 ---------- */
function renderAllBuilds() {
  const budgets = Profile.listBudgets(builds);
  return RES_GROUPS.map((group) => {
    const items = [];
    USAGE_ORDER.forEach((usage) => {
      budgets.forEach((budget) => {
        const b = Profile.findBuild(builds, budget, usage, group.key);
        if (!b) return;
        items.push(
          `            <li><a href="./builds/${esc(Profile.slugOf(b))}.html">${esc(USAGE_LIST_LABEL[usage])}向けPC構成 ${Profile.budgetMan(budget)}万円前後 ${esc(b.gpu)}</a></li>`
        );
      });
    });
    return `
        <details class="all-builds-group">
          <summary>${esc(group.summary)}</summary>
          <ul class="all-builds-list">
${items.join("\n")}
          </ul>
        </details>`;
  }).join("") + "\n";
}

/* ---------- 差し込み ---------- */
function replaceBetween(html, name, body) {
  const start = `<!-- GENERATED:${name} START`;
  const end = `<!-- GENERATED:${name} END -->`;
  const i = html.indexOf(start);
  const j = html.indexOf(end);
  if (i < 0 || j < 0 || j < i) throw new Error(`index.html にマーカー GENERATED:${name} がありません`);
  const startEnd = html.indexOf("-->", i) + 3;
  // index.html は CRLF/LF が混在している。マーカー直前の行に合わせ、差分を実際の変更だけにする。
  const prevNl = html.lastIndexOf("\n", i);
  const eol = prevNl > 0 && html[prevNl - 1] === "\r" ? "\r\n" : "\n";
  return html.slice(0, startEnd) + body.replace(/\r?\n/g, eol) + html.slice(j);
}

function build(html) {
  let out = html;
  out = replaceBetween(out, "sample", renderSample() + "          ");
  out = replaceBetween(out, "popular", renderPopular() + "            ");
  out = replaceBetween(out, "all-builds", renderAllBuilds() + "        ");
  return out;
}

if (require.main === module) {
  const file = path.join(HERE, "index.html");
  const current = fs.readFileSync(file, "utf8");
  const next = build(current);
  if (process.argv.includes("--check")) {
    if (next !== current) {
      console.error("index.html が builds.json と一致していません。node pc-build-check/generate-index-sections.js を実行してください。");
      process.exit(1);
    }
    console.log("index.html は builds.json と一致しています");
  } else {
    fs.writeFileSync(file, next);
    console.log("index.html の生成範囲（sample / popular / all-builds）を更新しました");
  }
}

module.exports = { build, renderSample, renderPopular, renderAllBuilds, featuredBuilds };
