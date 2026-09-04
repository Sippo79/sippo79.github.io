/*
 * pc-build-check/test-service-worker.js
 *
 * Service Worker のキャッシュ設定のテスト。
 *
 * なぜ必要か:
 *   PC BUILD CHECK は script.js / style.css をキャッシュ優先で配っている。
 *   中身を変えたのに sw.js の CACHE_NAME を上げ忘れると、
 *   **再訪ユーザーには古いJS/CSSが配られ続ける**。
 *   実際に Phase 7・8 で上げ忘れ、「GPU詳細ボタンが旧リンクのまま
 *   GPU一覧に着地する」「参考価格が出ない」が起きた。
 *
 *   版上げ忘れそのものは機械的に検出できない（何を変えたら上げるべきかは人の判断）。
 *   そこで、事故に直結する次の3点を検証する:
 *     1. キャッシュ対象のファイルが実在する（消えたファイルを配ろうとしていない）
 *     2. index.html が読み込むローカル資産がキャッシュ対象から漏れていない
 *     3. 更新されうるデータはネットワーク優先になっている（版上げ待ちにしない）
 *
 * 実行: node test-service-worker.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "..");

const sw = fs.readFileSync(path.join(HERE, "sw.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(HERE, "index.html"), "utf8");

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) pass += 1;
  else failures.push(detail ? `${name} … ${detail}` : name);
}

/* ---------- キャッシュ名 ---------- */

const cacheNameMatch = sw.match(/const CACHE_NAME = ['"]([^'"]+)['"]/);
check("CACHE_NAME が定義されている", Boolean(cacheNameMatch));
const cacheName = cacheNameMatch ? cacheNameMatch[1] : "";
check("CACHE_NAME にバージョンが付いている", /-v\d+$/.test(cacheName), cacheName);
// 別サイト名（ジサコ！）の混入を防ぐ。過去に 'jisako-v3' の誤用があった。
check("CACHE_NAME が正式名 pc-build-check で始まる", /^pc-build-check-/.test(cacheName), cacheName);

/* ---------- キャッシュ対象の実在 ---------- */

const assetsBlock = sw.slice(sw.indexOf("const STATIC_ASSETS = ["), sw.indexOf("];", sw.indexOf("const STATIC_ASSETS = [")));
const assets = [...assetsBlock.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);

check("STATIC_ASSETS を読み取れる", assets.length > 0, `${assets.length}件`);

function resolveAsset(asset) {
  // './xxx' はこのディレクトリ、'/shared/xxx' はリポジトリルート基準
  if (asset === "./") return path.join(HERE, "index.html");
  if (asset.startsWith("./")) return path.join(HERE, asset.slice(2));
  if (asset.startsWith("/")) return path.join(ROOT, asset.slice(1));
  return path.join(HERE, asset);
}

assets.forEach((asset) => {
  check(
    `キャッシュ対象が実在する: ${asset}`,
    fs.existsSync(resolveAsset(asset)),
    resolveAsset(asset)
  );
});

/* ---------- index.html が読む資産の取りこぼし ---------- */

/*
 * index.html が読み込むローカルの js / css が STATIC_ASSETS に無いと、
 * オフライン時にその機能だけ動かない（例: 参考価格が出ない）。
 * 外部CDN・解析タグは対象外。
 */
const referenced = [
  ...[...indexHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => m[1]),
  ...[...indexHtml.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/g)].map((m) => m[1]),
  ...[...indexHtml.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["']/g)].map((m) => m[1]),
];

const localRefs = referenced.filter((src) => !/^https?:\/\//.test(src) && !src.startsWith("//"));

function normalizeForCompare(p) {
  return p.replace(/^\.\//, "").replace(/^\//, "");
}
const assetSet = new Set(assets.map(normalizeForCompare));

localRefs.forEach((ref) => {
  check(
    `index.html が読む資産がキャッシュ対象: ${ref}`,
    assetSet.has(normalizeForCompare(ref)),
    "STATIC_ASSETS に無い"
  );
});

/* ---------- 更新されうるデータはネットワーク優先 ---------- */

/*
 * builds.json（構成）と part-prices.json（価格）は中身が更新される。
 * キャッシュ優先にすると、版を上げるまで古い構成・古い価格が配られる。
 */
const networkFirstBlock = sw.slice(0, sw.indexOf("/* 外部リソース"));
["builds.json", "part-prices.json"].forEach((file) => {
  check(
    `更新されうるデータがネットワーク優先: ${file}`,
    networkFirstBlock.includes(file),
    "キャッシュ優先のままだと古い値が残る"
  );
});

/* ---------- 古いキャッシュの削除 ---------- */

check(
  "activate で古いキャッシュを削除している",
  /activate[\s\S]{0,400}caches\.delete/.test(sw),
  "版を上げても旧キャッシュが残る"
);

/* ---------- 結果 ---------- */

console.log("");
console.log("=== Service Worker テスト ===");
console.log(`  CACHE_NAME: ${cacheName}`);
console.log(`  キャッシュ対象: ${assets.length}件 / index.html のローカル参照: ${localRefs.length}件`);
console.log("");
console.log(`  成功: ${pass}  失敗: ${failures.length}`);
if (failures.length) {
  console.log("");
  failures.forEach((f) => console.log("  ✗ " + f));
}
process.exit(failures.length ? 1 : 0);
