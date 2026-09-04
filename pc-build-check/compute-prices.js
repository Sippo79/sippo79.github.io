/*
 * pc-build-check/compute-prices.js
 *
 * 静的ページ生成（generate-builds.ps1）から呼ばれ、75構成の参考価格を JSON で返す。
 *
 * 価格の計算そのものは shared/parts/build-price.js が持つ。ここは
 * 「PowerShell から同じ計算を使うための橋渡し」だけを担当し、金額を持たない。
 * 診断画面（script.js）も同じモジュールを読むので、両者の数字は必ず一致する。
 *
 * 実行: node compute-prices.js
 * 出力: [{ id, total, text, overText }, ...]
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BP = require(path.join(ROOT, "shared", "parts", "build-price.js"));

function readJson(relPath) {
  // builds.json は BOM 付きなので、そのままでは JSON.parse が落ちる。
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), "utf8").replace(/^﻿/, ""));
}

const prices = readJson("shared/parts/part-prices.json");
const gpuList = readJson("gpu-guide/gpus.json");
const builds = readJson("pc-build-check/builds.json");

const rows = builds.map((build) => {
  const estimate = BP.calculateBuildEstimate(build, { prices, gpuList });
  if (!estimate || estimate.total === null) {
    return { id: String(build.id), total: null, text: "", overText: "" };
  }
  const fit = BP.evaluateBudgetFit(estimate.total, build.budget);
  return {
    id: String(build.id),
    total: estimate.total,
    text: BP.formatEstimate(estimate.total),
    overText: fit && fit.isOver ? fit.text : "",
  };
});

process.stdout.write(JSON.stringify(rows));
