/*
 * pc-build-check/test-build-price.js
 *
 * 構成参考価格のテスト。
 *
 * 守りたいこと
 *  1. 価格データが壊れていない（欠け・ゼロ・マイナス・更新日なしを出さない）
 *  2. 75構成すべてで参考価格が出せる（1件でも出せないと表示が虫食いになる）
 *  3. 予算と概算の乖離が、説明できない水準まで広がっていない
 *  4. 計算が1か所（shared/parts/build-price.js）に閉じている
 *
 * 実行: node test-build-price.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BP = require(path.join(ROOT, "shared", "parts", "build-price.js"));

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), "utf8").replace(/^﻿/, ""));
}

const prices = readJson("shared/parts/part-prices.json");
const gpuList = readJson("gpu-guide/gpus.json");
const builds = readJson("pc-build-check/builds.json");

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass += 1;
  } else {
    failures.push(detail ? `${name} … ${detail}` : name);
  }
}

/* ---------- 1. 価格データの健全性 ---------- */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

check("価格マスターに更新日がある", DATE_RE.test(prices._meta && prices._meta.updated), String(prices._meta && prices._meta.updated));
check("価格の基準が明示されている", prices._meta && prices._meta.basis === "bto", String(prices._meta && prices._meta.basis));

// 価格エントリを再帰的に集める（_ 始まりのキーは注記なので対象外）
function collectEntries(node, trail, out) {
  if (!node || typeof node !== "object") return out;
  if (Object.prototype.hasOwnProperty.call(node, "price")) {
    out.push({ path: trail, entry: node });
    return out;
  }
  Object.keys(node).forEach((key) => {
    if (key.charAt(0) === "_") return;
    collectEntries(node[key], trail ? trail + "." + key : key, out);
  });
  return out;
}

const entries = collectEntries(
  { cpu: prices.cpu, memory: prices.memory, storage: prices.storage, motherboard: prices.motherboard, btoOverhead: prices.btoOverhead },
  "",
  []
);

check("価格エントリが存在する", entries.length > 0, `${entries.length}件`);

entries.forEach((item) => {
  check(
    `価格が正の数: ${item.path}`,
    Number.isFinite(item.entry.price) && item.entry.price > 0,
    String(item.entry.price)
  );
  check(
    `更新日がある: ${item.path}`,
    DATE_RE.test(item.entry.updated),
    String(item.entry.updated)
  );
});

/* ---------- 2. 価格の二重管理をしていない ---------- */

// GPU価格は gpu-guide/gpus.json が唯一の情報源。
// 価格マスター側にGPUの価格表を持たせると、値がずれたときに気づけない。
check(
  "価格マスターがGPU価格を持っていない",
  !prices.gpu && !prices.gpus,
  "part-prices.json に gpu / gpus キーがある"
);

/* ---------- 3. 全構成で参考価格が出せる ---------- */

const results = builds.map((build) => {
  const estimate = BP.calculateBuildEstimate(build, { prices, gpuList });
  return { build, estimate };
});

results.forEach(({ build, estimate }) => {
  check(
    `参考価格を算出できる: id${build.id}`,
    estimate && estimate.total !== null,
    estimate ? `不足: ${estimate.missing.join(", ")}` : "null"
  );
});

/* ---------- 4. 予算との乖離 ---------- */

/*
 * 許容幅の根拠。
 *
 * 予算選択肢は「10万円前後」という表記なので、多少の上振れは表記の範囲内。
 * ただし無制限ではないため、2段階で見る。
 *
 *  ・OVER_TOLERANCE(+15%) を超えたら、画面に超過を明示する（＝隠さない）。
 *    ここはテストの失敗条件ではない。「10万円で4K」のように、
 *    そもそも予算内で成立しない条件が実在し、それらは正直に超過を出すのが正しいため。
 *
 *  ・一方、超過を明示すべき構成で明示できていないのは不具合なので、失敗にする。
 *
 *  ・さらに、価格改定のたびにテストが壊れないよう、
 *    「構成の作りとして明らかにおかしい」水準（実測の最大乖離 +80% を踏まえ +100%）
 *    を超えた場合だけ失敗にする。
 */
const HARD_LIMIT = 1.0;

results.forEach(({ build, estimate }) => {
  if (!estimate || estimate.total === null) return;
  const fit = BP.evaluateBudgetFit(estimate.total, build.budget);
  check(`予算判定を返す: id${build.id}`, fit !== null);
  if (!fit) return;

  check(
    `乖離が上限内: id${build.id}`,
    fit.ratio <= HARD_LIMIT,
    `予算${Number(build.budget).toLocaleString()}円 に対し概算${estimate.total.toLocaleString()}円 (+${(fit.ratio * 100).toFixed(0)}%)`
  );

  // 超過している構成では、必ず超過文言が用意されていること（黙って超えない）
  if (fit.ratio > BP.OVER_TOLERANCE) {
    check(
      `超過を明示している: id${build.id}`,
      fit.isOver && typeof fit.text === "string" && fit.text.length > 0,
      "超過なのに文言が空"
    );
  }
  // 収まっている構成で「予算内です」と言い切らないこと（価格変動で嘘になる）
  if (!fit.isOver) {
    check(`収まっている構成では文言を出さない: id${build.id}`, fit.text === null, String(fit.text));
  }
});

/* ---------- 5. 表示の体裁 ---------- */

check("参考価格は「約〇万円」表記", BP.formatEstimate(238000) === "約24万円", BP.formatEstimate(238000));
check("金額が出せないときは null", BP.formatEstimate(NaN) === null);
check("価格の変動に触れている", /変動/.test(BP.PRICE_DISCLAIMER));
check("販売価格と誤認させない断り書きがある", /販売価格ではありません/.test(BP.PRICE_DISCLAIMER));

// 予算・価格が壊れた入力で例外を投げない（診断画面を落とさない）
check("予算が不正でも落ちない", BP.evaluateBudgetFit(200000, "abc") === null);
check("価格が不正でも落ちない", BP.evaluateBudgetFit(NaN, 200000) === null);
check("価格データなしでは算出しない", BP.calculateBuildEstimate(builds[0], {}) === null);

/* ---------- 結果 ---------- */

console.log("");
console.log("=== 構成参考価格テスト ===");
const overCount = results.filter(({ build, estimate }) => {
  if (!estimate || estimate.total === null) return false;
  const fit = BP.evaluateBudgetFit(estimate.total, build.budget);
  return fit && fit.isOver;
}).length;
console.log(`  参考価格を算出できた構成: ${results.filter((r) => r.estimate && r.estimate.total !== null).length} / ${builds.length}`);
console.log(`  予算超過として明示する構成: ${overCount}`);
console.log("");
console.log(`  成功: ${pass}  失敗: ${failures.length}`);
if (failures.length) {
  console.log("");
  failures.forEach((f) => console.log("  ✗ " + f));
}
process.exit(failures.length ? 1 : 0);
