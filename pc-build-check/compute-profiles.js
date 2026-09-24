/*
 * pc-build-check/compute-profiles.js
 *
 * 静的ページ生成（generate-builds.ps1）から呼ばれ、75構成それぞれの
 *   - 構成タイプ（ヒーローのタグ）
 *   - このPCの得意分野
 *   - この構成にした理由
 *   - 予算を5万円変えると？（前後の構成へのリンク付き）
 * を HTML 断片として JSON で返す。
 *
 * 判定と文言は build-profile.js が持つ（診断画面と同じ関数）。ここは
 * 「PowerShell から同じ判定を使うための橋渡し」と静的ページ用の組版だけを担当する。
 * compute-prices.js と同じ考え方。
 *
 * 実行: node compute-profiles.js
 * 出力: [{ id, slug, typesHtml, sectionsHtml, diagnoseQuery }, ...]
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const Profile = require("./build-profile.js");
const esc = Profile.esc;

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), "utf8").replace(/^﻿/, ""));
}

const builds = readJson("pc-build-check/builds.json");
const ctx = {
  prices: readJson("shared/parts/part-prices.json"),
  gpuList: readJson("gpu-guide/gpus.json"),
};

function renderTypes(a) {
  if (!a.types.length) return "";
  return `
        <div class="build-page-types" aria-label="構成タイプ">
          ${a.types.map((t) => `<span class="pb-type pb-type--${esc(t.key)}">${esc(t.label)}</span>`).join("\n          ")}
        </div>`;
}

function renderStrengths(a) {
  if (!a.strengths.length) return "";
  const rows = a.strengths.map((s) => `
          <li class="pb-strength">
            <span class="pb-strength-label">${esc(s.label)}</span>
            <span class="pb-strength-bar" aria-hidden="true"><span style="width:${s.level * 20}%"></span></span>
            <strong class="pb-strength-text">${esc(s.text)}</strong>
          </li>`).join("");
  return `
      <section class="build-card pb-strengths-card">
        <p class="section-label">Strengths</p>
        <h2>このPCの得意分野</h2>
        <ul class="pb-strengths">${rows}
        </ul>
        <p class="pb-note">※GPU GUIDEの性能スコアと、CPUのコア数・メモリ容量から出したざっくりした目安です。</p>
      </section>
`;
}

function renderReasons(a) {
  if (!a.reasons.length) return "";
  return `
      <section class="build-card">
        <p class="section-label">Why This Build</p>
        <h2>この構成にした理由</h2>
        <dl class="pb-reasons">${a.reasons.map((r) => `
          <div><dt>${esc(r.label)}</dt><dd>${esc(r.text)}</dd></div>`).join("")}
        </dl>
      </section>
`;
}

function renderChanges(changes) {
  if (!changes.length) return "";
  return `
              <ul class="pb-changes">${changes.map((c) => `
                <li><span>${esc(c.label)}</span>${esc(c.from)} <b aria-hidden="true">→</b> ${esc(c.to)}</li>`).join("")}
              </ul>`;
}

function renderNeighbor(kind, cur, other) {
  const isUp = kind === "up";
  const exp = isUp ? Profile.explainUp(cur, other) : Profile.explainDown(cur, other);
  const priceDiff = Profile.formatPriceDiff(exp.diff.priceDiff);
  const points = !isUp && exp.points && exp.points.length
    ? `
              <ul class="pb-points">${exp.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`
    : "";
  return `
            <a class="pb-neighbor pb-neighbor--${kind}" href="${esc(other.slug)}.html">
              <span class="pb-neighbor-label">${isUp ? "5万円上げると" : "5万円下げると"}（${other.budgetMan}万円前後${other.priceText ? `・参考価格 ${esc(other.priceText)}` : ""}）</span>
              <strong class="pb-neighbor-head">${esc(exp.headline)}</strong>${renderChanges(exp.diff.changes)}${points}
              <p>${esc(exp.text)}${priceDiff ? `（参考価格の差: ${esc(priceDiff)}）` : ""}</p>
              <span class="pb-neighbor-link">${other.budgetMan}万円の構成を見る →</span>
            </a>`;
}

function renderBudgetCompare(a) {
  const n = Profile.neighbors(builds, a.build);
  if (!n.down && !n.up) return "";
  const parts = [];
  if (n.down) parts.push(renderNeighbor("down", a, Profile.analyze(n.down, ctx)));
  if (n.up) parts.push(renderNeighbor("up", a, Profile.analyze(n.up, ctx)));
  const query = Profile.toQuery({ budget: a.budget, usage: a.usage, resolution: a.resolution });
  return `
      <section class="build-card pb-budget-card">
        <p class="section-label">Budget ±5</p>
        <h2>予算を5万円変えると？</h2>
        <p class="pb-lead">同じ${esc(a.usageLabel)}・${esc(a.resolutionLabel)}向けで、予算だけを変えた構成との違いです。</p>
        <div class="pb-neighbors">${parts.join("")}
        </div>
        <a class="pb-diagnose-link" href="../index.html?${esc(query)}#diagnosis">診断画面で近い予算の3構成を並べて比較する →</a>
      </section>
`;
}

const rows = builds.map((build) => {
  const a = Profile.analyze(build, ctx);
  return {
    id: String(build.id),
    slug: a.slug,
    typesHtml: renderTypes(a),
    sectionsHtml: renderStrengths(a) + renderReasons(a),
    budgetHtml: renderBudgetCompare(a),
    diagnoseQuery: Profile.toQuery({ budget: a.budget, usage: a.usage, resolution: a.resolution }),
  };
});

process.stdout.write(JSON.stringify(rows));
