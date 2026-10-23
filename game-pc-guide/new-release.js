/**
 * GAME PC GUIDE「新作・正式版」の判定（2026-10-23〜）
 *
 * generate-games.js と test-new-release.js が使う。判定に使う日付は「発売日」と「今日（日本時間）」だけ。
 * 価格の確認日・公式スペックの確認日・ページの更新日は使わない
 * （以前は確認日の最新を「今日」の代わりにしていたため、確認日しだいで新作の顔ぶれが変わっていた）。
 *
 *  ・判定に使う日 = fullReleaseDate（早期アクセスから正式版になった日）があればそれ、なければ releaseDate
 *  ・新作 = 判定に使う日の当日から NEW_DAYS 日後まで（両端を含む）
 *  ・status "upcoming"（発売前）・日付が未来・日付が無いタイトルは新作にしない
 *  ・status "early-access" は日付に関係なく一覧の新作欄に載せる（早期アクセス中のタイトルとして）。新作チップは付けない
 */
"use strict";

const NEW_DAYS = 365;
const DAY_MS = 86400000;

/** "YYYY-MM-DD" で、実在する日付なら UTC の通算日。そうでなければ null */
function dayNumber(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return t / DAY_MS;
}

const isValidDate = (iso) => dayNumber(iso) !== null;

/** 日本時間の「今日」（YYYY-MM-DD） */
function jstToday(now) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(now || new Date());
}

/** 判定に使う日（正式版の日があればそれ） */
function releaseDateOf(g) {
  return g.fullReleaseDate || g.releaseDate || null;
}

/** 新作の掲載最終日（YYYY-MM-DD）。日付が無い・不正なら null */
function newUntil(g) {
  const n = dayNumber(releaseDateOf(g));
  return n === null ? null : new Date((n + NEW_DAYS) * DAY_MS).toISOString().slice(0, 10);
}

/** today（YYYY-MM-DD・日本時間）の時点で新作か */
function isNewRelease(g, today) {
  if (g.status === "upcoming" || g.status === "early-access") return false;
  const rel = dayNumber(releaseDateOf(g));
  const now = dayNumber(today);
  if (rel === null || now === null) return false;
  const days = now - rel;
  return days >= 0 && days <= NEW_DAYS;
}

/** 新作欄に載せるタイトル（判定に使う日の新しい順。同じ日は games.json の順） */
function newReleaseList(games, today) {
  return games
    .filter((g) => isNewRelease(g, today) || (g.status === "early-access" && isValidDate(g.releaseDate)))
    .map((g, i) => ({ g, i, d: releaseDateOf(g) }))
    .sort((a, b) => (a.d === b.d ? a.i - b.i : a.d < b.d ? 1 : -1))
    .map((x) => x.g);
}

/** 新作欄の日付ラベル */
function releaseLabel(g) {
  if (g.status === "early-access") return "早期アクセス開始";
  if (g.fullReleaseDate) return "正式版";
  return "発売";
}

module.exports = { NEW_DAYS, isValidDate, jstToday, releaseDateOf, newUntil, isNewRelease, newReleaseList, releaseLabel };
