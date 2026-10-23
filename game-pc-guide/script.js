/**
 * GAME PC GUIDE 一覧の絞り込み（2026-10-18〜）
 *
 * カードは generate-games.js が index.html に静的に書き出している。
 * ここでは data-* 属性を見て表示・非表示を切り替えるだけで、データの取得はしない
 * （JSが動かない環境でも全ゲームが表示され、検索エンジンにもそのまま読まれる）。
 *
 * 絞り込み条件は URL のクエリ（?q=&genre=&load=&budget=&use=）に保存する。
 * ゲームページを開いて「戻る」で帰ってきたときに、同じ条件で一覧が復元される。
 */
(function () {
  "use strict";

  // 新作欄・「新作」チップの期限切れ。新作は generate-games.js が生成した日に決まるので、
  // 生成し直す前に掲載最終日（data-new-until・日本時間）を過ぎたものは閲覧時に外す
  (function () {
    var today;
    try { today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date()); } catch (e) { return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return;
    Array.prototype.forEach.call(document.querySelectorAll("[data-new-until]"), function (el) {
      if (el.getAttribute("data-new-until") < today && el.parentNode) el.parentNode.removeChild(el);
    });
    var section = document.getElementById("new");
    var list = section && section.querySelector(".new-list");
    if (list && !list.children.length) section.style.display = "none";
  })();

  var form = document.getElementById("gameFilter");
  var grid = document.getElementById("gameGrid");
  if (!form || !grid) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll(".game-card"));
  var countEl = document.getElementById("filterCount");
  var emptyEl = document.getElementById("gameEmpty");
  var fields = {
    q: document.getElementById("gameSearchInput"),
    genre: document.getElementById("filterGenre"),
    load: document.getElementById("filterLoad"),
    budget: document.getElementById("filterBudget"),
    use: document.getElementById("filterUse"),
  };

  // 予算の区分（data-budget は「迷ったらこれ」構成の予算の下限・万円）
  var BUDGET = {
    low: function (v) { return v < 20; },
    mid: function (v) { return v >= 20 && v < 30; },
    high: function (v) { return v >= 30; },
  };

  /** 全角英数・カタカナのゆれを吸収して比較する */
  function normalize(s) {
    return String(s || "")
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); })
      .replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); })
      .toLowerCase()
      .replace(/[\s・\-ー:：]/g, "");
  }

  // カードの検索用テキストは一度だけ正規化しておく
  cards.forEach(function (card) {
    card._search = normalize(card.getAttribute("data-search"));
  });

  function values() {
    var v = {};
    Object.keys(fields).forEach(function (k) { v[k] = fields[k] ? fields[k].value.trim() : ""; });
    return v;
  }

  function apply(updateUrl) {
    var v = values();
    var q = normalize(v.q);
    var shown = 0;

    cards.forEach(function (card) {
      var ok =
        (!q || card._search.indexOf(q) > -1) &&
        (!v.genre || card.getAttribute("data-genre") === v.genre) &&
        (!v.load || card.getAttribute("data-load") === v.load) &&
        (!v.budget || (BUDGET[v.budget] && BUDGET[v.budget](Number(card.getAttribute("data-budget"))))) &&
        (!v.use || (" " + card.getAttribute("data-uses") + " ").indexOf(" " + v.use + " ") > -1);
      card.hidden = !ok;
      if (ok) shown += 1;
    });

    var filtered = Object.keys(v).some(function (k) { return v[k]; });
    if (countEl) {
      countEl.innerHTML = filtered
        ? "<strong>" + shown + "</strong> / " + cards.length + " タイトル"
        : "全 <strong>" + cards.length + "</strong> タイトル";
    }
    if (emptyEl) emptyEl.hidden = shown !== 0;

    if (updateUrl && window.history && history.replaceState) {
      var params = new URLSearchParams();
      Object.keys(v).forEach(function (k) { if (v[k]) params.set(k, v[k]); });
      var qs = params.toString();
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    }
  }

  function reset() {
    Object.keys(fields).forEach(function (k) { if (fields[k]) fields[k].value = ""; });
    apply(true);
    if (fields.q) fields.q.focus();
  }

  // URL の条件を復元（クイックリンク・戻るボタン・ヒーローの検索フォームから来た場合）
  var params = new URLSearchParams(location.search);
  Object.keys(fields).forEach(function (k) {
    var val = params.get(k);
    if (val && fields[k]) {
      // select に無い値は無視する
      if (fields[k].tagName === "SELECT" && !fields[k].querySelector('option[value="' + val.replace(/"/g, "") + '"]')) return;
      fields[k].value = val;
    }
  });
  apply(false);

  form.addEventListener("input", function () { apply(true); });
  form.addEventListener("change", function () { apply(true); });

  var resetBtns = document.querySelectorAll("#filterReset, [data-filter-reset]");
  Array.prototype.forEach.call(resetBtns, function (b) { b.addEventListener("click", reset); });

  // ヒーローの検索フォーム：ページを読み直さずに一覧の検索欄へ渡す
  var hero = document.querySelector("[data-hero-search]");
  if (hero && fields.q) {
    var heroInput = hero.querySelector("input");
    if (params.get("q") && heroInput) heroInput.value = params.get("q");
    hero.addEventListener("submit", function (e) {
      e.preventDefault();
      fields.q.value = heroInput ? heroInput.value : "";
      apply(true);
      var target = document.getElementById("games");
      if (target) target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  }
})();
