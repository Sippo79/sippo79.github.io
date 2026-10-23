/**
 * GAME PC GUIDE「新作・正式版」判定の回帰テスト（2026-10-23〜）
 *   node game-pc-guide/test-new-release.js
 *
 *  A. 判定関数（new-release.js）… 当日・期間内・最終日・翌日・未来・未登録・不正な形式・正式版・年末年始・日本時間
 *  B. 実データ（games.json）… 日付の形式、MW4、2026-10-23 時点の新作欄、期限切れの順番
 *  C. 生成（一時フォルダにコピーして GAME_GUIDE_TODAY で日付を固定）
 *     … 確認日・価格確認日だけ変えても新作欄が変わらない、不正な日付で止まる、未登録でも生成できる、再生成で同じ出力
 *  実際のサイトのファイルは書き換えない。
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const NR = require("./new-release.js");

const root = __dirname;
let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) passed++;
  else {
    failed++;
    console.error("  NG: " + name + (detail ? "（" + detail + "）" : ""));
  }
}
const g = (o) => Object.assign({ status: "released" }, o);

/* ---------------- A. 判定関数 ---------------- */
console.log("A. 判定関数");
const mw = g({ releaseDate: "2026-10-23" });
check("1. 発売日当日は新作", NR.isNewRelease(mw, "2026-10-23"));
check("2. 掲載期間内は新作", NR.isNewRelease(mw, "2027-03-01"));
check("3. 掲載最終日（365日後）は新作", NR.isNewRelease(mw, "2027-10-23"));
check("3. 掲載最終日の計算", NR.newUntil(mw) === "2027-10-23", NR.newUntil(mw));
check("4. 最終日の翌日は新作ではない", !NR.isNewRelease(mw, "2027-10-24"));
check("5. 発売日が未来なら新作ではない", !NR.isNewRelease(mw, "2026-10-22"));
check("5. 発売前（upcoming）は日付が過ぎていても新作ではない", !NR.isNewRelease(g({ status: "upcoming", releaseDate: "2026-10-01" }), "2026-10-23"));
check("6. 発売日未登録は新作ではない", !NR.isNewRelease(g({}), "2026-10-23"));
check("6. 未登録の掲載最終日は null", NR.newUntil(g({})) === null);
for (const bad of ["2026/10/23", "20261023", "2026-02-30", "2026-13-01", "2026-10-23T00:00:00Z", "", 20261023]) {
  check(`7. 不正な形式（${JSON.stringify(bad)}）は新作ではない`, !NR.isNewRelease(g({ releaseDate: bad }), "2026-10-23"));
  check(`7. 不正な形式（${JSON.stringify(bad)}）は isValidDate が false`, !NR.isValidDate(bad));
}
check("7. 今日の日付が不正なら新作ではない", !NR.isNewRelease(mw, "2026-10-32"));
check("8・9. 確認日・価格確認日の項目があっても判定は変わらない",
  NR.isNewRelease(g({ releaseDate: "2020-01-01", checked: "2026-10-23", priceChecked: "2026-10-23", modified: "2026-10-23" }), "2026-10-23") === false &&
  NR.isNewRelease(g({ releaseDate: "2026-10-23", checked: "2000-01-01" }), "2026-10-23") === true);
const pal = g({ releaseDate: "2024-01-19", fullReleaseDate: "2026-07-10" });
check("10. 正式版の日があればそれで判定（早期アクセス開始が古くても新作）", NR.isNewRelease(pal, "2026-10-23"));
check("10. 正式版の掲載最終日", NR.newUntil(pal) === "2027-07-10", NR.newUntil(pal));
check("10. 正式版のラベル", NR.releaseLabel(pal) === "正式版");
check("10. 早期アクセス中は新作チップの対象外", !NR.isNewRelease(g({ status: "early-access", releaseDate: "2026-09-10" }), "2026-10-23"));
check("10. 早期アクセスのラベル", NR.releaseLabel(g({ status: "early-access" })) === "早期アクセス開始");
const nye = g({ releaseDate: "2025-12-31" });
check("11. 年末に発売→翌年元日は新作", NR.isNewRelease(nye, "2026-01-01"));
check("11. 年末に発売→掲載最終日は翌年の大みそか", NR.newUntil(nye) === "2026-12-31", NR.newUntil(nye));
check("11. 年末に発売→翌々年の元日は新作ではない", !NR.isNewRelease(nye, "2027-01-01"));
check("11. 元日発売→前日の大みそかは新作ではない", !NR.isNewRelease(g({ releaseDate: "2027-01-01" }), "2026-12-31"));
check("11. 日本時間の日付境界（UTC 12/31 15:00 = JST 1/1 0:00）", NR.jstToday(new Date("2026-12-31T15:00:00Z")) === "2027-01-01");
check("11. 日本時間の日付境界（UTC 12/31 14:59 = JST 12/31 23:59）", NR.jstToday(new Date("2026-12-31T14:59:59Z")) === "2026-12-31");
check("11. うるう日に発売", NR.newUntil(g({ releaseDate: "2028-02-29" })) === "2029-02-28");
check("並び順：新しい順・同じ日は登録順",
  NR.newReleaseList([g({ id: "a", releaseDate: "2026-01-01" }), g({ id: "b", releaseDate: "2026-05-01" }), g({ id: "c", releaseDate: "2026-05-01" })], "2026-10-23").map((x) => x.id).join() === "b,c,a");

/* ---------------- B. 実データ ---------------- */
console.log("B. 実データ");
const games = JSON.parse(fs.readFileSync(path.join(root, "data", "games.json"), "utf8"));
check("登録タイトル数は30", games.length === 30, String(games.length));
for (const x of games) {
  for (const k of ["releaseDate", "fullReleaseDate"]) if (x[k] != null) check(`${x.id}: ${k} が実在する日付`, NR.isValidDate(x[k]), x[k]);
}
const mw4 = games.find((x) => x.id === "modern-warfare-4");
check("MW4の発売日は2026-10-23", mw4 && NR.releaseDateOf(mw4) === "2026-10-23");
const ids = (today) => NR.newReleaseList(games, today).map((x) => x.id).join(",");
const EXPECT_1023 = "modern-warfare-4,wardogs,onimusha,palworld,biohazard-requiem,cod,tarkov";
check("2026-10-23 の新作欄（MW4が先頭）", ids("2026-10-23") === EXPECT_1023, ids("2026-10-23"));
check("2026-10-22（MW4発売前日）は MW4 なし", !ids("2026-10-22").includes("modern-warfare-4"));
check("2026-11-15 は Tarkov の掲載最終日", ids("2026-11-15").includes("tarkov"));
check("2026-11-16 に Tarkov が外れる", !ids("2026-11-16").includes("tarkov"));
check("2026-11-22 に CoD が外れる", !ids("2026-11-22").includes("cod"));
check("早期アクセス中の WARDOGS は期間に関係なく載る", ids("2030-01-01") === "wardogs", ids("2030-01-01"));

/* ---------------- C. 生成 ---------------- */
console.log("C. 生成（一時フォルダ）");
const siteRoot = path.join(root, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gpg-newrel-"));
const tgpg = path.join(tmp, "game-pc-guide");
fs.cpSync(root, tgpg, { recursive: true });
fs.mkdirSync(path.join(tmp, "gpu-guide"));
fs.copyFileSync(path.join(siteRoot, "gpu-guide", "gpus.json"), path.join(tmp, "gpu-guide", "gpus.json"));

function gen(today) {
  try {
    execFileSync(process.execPath, [path.join(tgpg, "generate-games.js")], { env: Object.assign({}, process.env, { GAME_GUIDE_TODAY: today }), stdio: "pipe" });
    return true;
  } catch (e) {
    return false;
  }
}
const read = (rel) => fs.readFileSync(path.join(tgpg, rel), "utf8");
const newBlock = () => (read("index.html").match(/<!-- GENERATED:new START -->([\s\S]*?)<!-- GENERATED:new END -->/) || [])[1] || "";
const blockIds = () => [...newBlock().matchAll(/href="games\/([^.]+)\.html"/g)].map((m) => m[1]).join(",");
const editJson = (rel, fn) => { const p = path.join(tgpg, rel); const o = JSON.parse(fs.readFileSync(p, "utf8")); fn(o); fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n"); };
const snapshot = () => ["index.html", "sitemap.xml", "llms.txt", "data/games.json", "data/page-dates.json", ...fs.readdirSync(path.join(tgpg, "games")).map((f) => "games/" + f)].map((f) => f + ":" + read(f)).join("\n");

try {
  check("12. 2026-10-23 で生成できる", gen("2026-10-23"));
  const base = newBlock();
  check("12. 生成した新作欄が判定関数と一致", blockIds() === EXPECT_1023, blockIds());
  check("12. MW4は「2026年10月 発売」・掲載最終日つき", /data-new-until="2027-10-23"><a class="new-item" href="games\/modern-warfare-4\.html">[\s\S]*?2026年10月 発売/.test(base));
  check("12. Palworldは「2026年7月 正式版」", /games\/palworld\.html[\s\S]*?2026年7月 正式版/.test(base));
  check("12. 一覧カードは30枚", (read("index.html").match(/<li class="game-card"/g) || []).length === 30);
  const snap1 = snapshot();
  check("12. 同じ日に再生成しても出力が同じ", gen("2026-10-23") && snapshot() === snap1);

  // 8. 古いゲーム（apex・2019年）のスペック確認日だけを新しくする
  editJson("content/apex/guide.json", (o) => { o.checked = "2026-10-23"; });
  editJson("content/minecraft/guide.json", (o) => { o.checked = "2027-12-31"; });
  check("8. スペック確認日だけ更新しても新作欄は同じ", gen("2026-10-23") && newBlock() === base);
  check("8. apex・minecraft は新作にならない", !/games\/(apex|minecraft)\.html/.test(newBlock()));

  // 9. 価格確認日だけを先に進める
  editJson("data/price-bands.json", (o) => { o.checked = "2027-12-31"; });
  check("9. 価格確認日だけ更新しても新作欄は同じ", gen("2026-10-23") && newBlock() === base);

  // 生成日が進むと期限切れのタイトルが外れる（再生成の効果）
  check("2026-11-22 に生成すると CoD・Tarkov が外れる", gen("2026-11-22") && !/games\/(cod|tarkov)\.html/.test(newBlock()) && blockIds().startsWith("modern-warfare-4"), blockIds());

  // 5. 発売予定のタイトル
  editJson("data/games.json", (a) => { const x = a.find((y) => y.id === "modern-warfare-4"); x.status = "upcoming"; x.releaseDate = "2026-12-01"; });
  check("5. 発売予定は新作欄に載らない", gen("2026-10-23") && !newBlock().includes("modern-warfare-4"));
  check("5. 発売予定のカードは「発売前」", /games\/modern-warfare-4\.html">[\s\S]*?chip--ea">発売前/.test(read("index.html")));
  check("5. 発売日を過ぎても status が upcoming のままなら載らない", gen("2026-12-05") && !newBlock().includes("modern-warfare-4"));

  // 6. 発売日未登録
  editJson("data/games.json", (a) => { const x = a.find((y) => y.id === "modern-warfare-4"); x.status = "released"; delete x.releaseDate; });
  check("6. 発売日未登録でも生成でき、新作欄に載らない", gen("2026-10-23") && !newBlock().includes("modern-warfare-4"));

  // 7. 不正な形式は生成を止める（何も書き出さない）
  editJson("data/games.json", (a) => { a.find((y) => y.id === "modern-warfare-4").releaseDate = "2026/10/23"; });
  const before = read("index.html");
  check("7. 不正な発売日で生成が止まる", gen("2026-10-23") === false);
  check("7. 止まったときは何も書き出さない", read("index.html") === before);
  editJson("data/games.json", (a) => { a.find((y) => y.id === "modern-warfare-4").releaseDate = "2026-10-23"; });
  check("7. 不正な GAME_GUIDE_TODAY で生成が止まる", gen("2026-10-32") === false);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

/* ---------------- D. 一覧の script.js（閲覧時の期限切れ） ---------------- */
console.log("D. script.js");
const js = fs.readFileSync(path.join(root, "script.js"), "utf8");
check("script.js が data-new-until を日本時間の今日と比べる", /data-new-until/.test(js) && /Asia\/Tokyo/.test(js));
const idx = fs.readFileSync(path.join(root, "index.html"), "utf8");
const untils = [...idx.matchAll(/data-new-until="([^"]+)"/g)].map((m) => m[1]);
check("一覧の掲載最終日はすべて YYYY-MM-DD", untils.length > 0 && untils.every(NR.isValidDate), untils.join(","));

console.log(`\n新作判定テスト  成功: ${passed}  失敗: ${failed}`);
process.exit(failed ? 1 : 0);
