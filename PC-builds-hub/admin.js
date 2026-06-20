// =====================================================================
//  PC Builds Hub — admin.js（Phase 6）
//  管理者のみ：pending 投稿の確認 / approved・rejected への変更。
//  - 管理者以外はアクセス拒否（データ取得・更新しない）
//  - status 以外は変更しない / 削除・編集はしない
//  - service_role 不使用、anon key + RLS 前提
// =====================================================================

(function () {
  "use strict";

  const Auth = window.PCBuildsAuth;
  const API = window.PCBuildsAPI;

  const els = {
    message: document.getElementById("adminMessage"),
    content: document.getElementById("adminContent"),
    list: document.getElementById("adminList"),
    count: document.getElementById("pendingCount"),
    reloadBtn: document.getElementById("reloadBtn"),
  };

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showMessage(text, type) {
    if (!els.message) return;
    els.message.textContent = text;
    els.message.className = "auth-message" + (type ? " auth-message-" + type : "");
    els.message.hidden = false;
  }

  function formatDate(value) {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return (
      d.getFullYear() + "/" + p(d.getMonth() + 1) + "/" + p(d.getDate()) +
      " " + p(d.getHours()) + ":" + p(d.getMinutes())
    );
  }

  function specRow(label, value) {
    if (value == null || value === "") return "";
    return (
      '<div class="admin-spec"><span class="admin-spec-label">' +
      escapeHtml(label) +
      '</span><span class="admin-spec-val">' +
      escapeHtml(value) +
      "</span></div>"
    );
  }

  function cardHtml(p) {
    const id = String(p.id == null ? "" : p.id);
    const tags = Array.isArray(p.tags) ? p.tags : [];
    const tagsHtml = tags.length
      ? '<div class="admin-tags">' +
        tags.map((t) => '<span class="card-tag">#' + escapeHtml(t) + "</span>").join("") +
        "</div>"
      : "";
    const img = String(p.image || "").trim();
    const imgHtml = img
      ? '<div class="admin-card-img"><img src="' +
        escapeHtml(img) +
        '" alt="' +
        escapeHtml(p.title || "投稿画像") +
        '" loading="lazy" decoding="async"></div>'
      : "";

    return (
      '<article class="admin-card" data-post-id="' + escapeHtml(id) + '">' +
      '<div class="admin-card-head">' +
      '<h2 class="admin-card-title">' + escapeHtml(p.title || "無題のPC構成") + "</h2>" +
      '<span class="status-badge status-pending">承認待ち</span>' +
      "</div>" +
      '<p class="admin-card-meta">by ' + escapeHtml(p.user || "匿名ユーザー") +
      (p.created_at ? " ・ " + escapeHtml(formatDate(p.created_at)) : "") + "</p>" +
      imgHtml +
      '<div class="admin-specs">' +
      specRow("CPU", p.cpu) +
      specRow("GPU", p.gpu) +
      specRow("メモリ", p.ram) +
      specRow("解像度", p.resolution) +
      specRow("用途", p.usage) +
      "</div>" +
      tagsHtml +
      (p.comment ? '<p class="admin-comment">' + escapeHtml(p.comment) + "</p>" : "") +
      '<div class="admin-actions">' +
      '<button type="button" class="btn btn-primary" data-action="approve" data-id="' + escapeHtml(id) + '">承認して公開</button>' +
      '<button type="button" class="btn btn-reject" data-action="reject" data-id="' + escapeHtml(id) + '">差し戻す</button>' +
      "</div>" +
      "</article>"
    );
  }

  function renderList(posts) {
    if (els.count) {
      els.count.textContent = "承認待ち：" + posts.length + " 件";
    }
    if (!posts.length) {
      els.list.innerHTML =
        '<div class="my-posts-empty">承認待ちの投稿はありません。</div>';
      return;
    }
    els.list.innerHTML = posts.map(cardHtml).join("");
  }

  async function loadPending() {
    if (!els.list) return;
    els.list.innerHTML = '<div class="my-posts-empty">読み込み中…</div>';
    try {
      const posts = await API.getPendingPosts();
      // エラーは無いが0件のとき（RLS/管理者判定の可能性）も切り分けられるよう件数を出力
      console.info("[admin] 承認待ち取得:", (posts || []).length, "件");
      renderList(posts);
    } catch (e) {
      // 必要最小限（code/message）のみ出力（ユーザー情報は出さない）
      console.error("[admin] 承認待ちの取得に失敗:", {
        code: e && e.code,
        message: e && e.message,
      });
      const detail = [e && e.code, e && e.message].filter(Boolean).join(": ");
      els.list.innerHTML =
        '<div class="my-posts-empty">一覧を読み込めませんでした。権限・接続をご確認ください。' +
        (detail ? "<br><small>詳細：" + escapeHtml(detail) + "</small>" : "") +
        "</div>";
    }
  }

  function setButtonsDisabled(card, disabled) {
    if (!card) return;
    card.querySelectorAll("button[data-action]").forEach((b) => {
      b.disabled = disabled;
    });
  }

  async function handleAction(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (!id) return;

    const card = btn.closest(".admin-card");
    const status = action === "approve" ? "approved" : "rejected";

    setButtonsDisabled(card, true);
    try {
      await API.updatePostStatus(id, status);
      showMessage(
        status === "approved"
          ? "承認しました。投稿は公開（approved）されました。"
          : "差し戻しました。投稿は非公開（rejected）になりました。",
        "success"
      );
      await loadPending(); // 操作後に再取得
    } catch (err) {
      const msg = (err && err.message) || "";
      let text = "更新に失敗しました。時間をおいて再度お試しください。";
      if (/INVALID_STATUS/.test(msg)) text = "不正なステータス指定です。";
      else if (/AUTH_UNAVAILABLE/.test(msg)) text = "Supabase設定が未完了です。";
      else if (/row-level security|RLS|violates/i.test(msg)) {
        text = "権限がありません（管理者のみ更新できます）。";
      }
      showMessage(text, "error");
      setButtonsDisabled(card, false);
    }
  }

  async function init() {
    // Supabase 未設定
    if (!Auth || !Auth.isAuthAvailable() || !API) {
      showMessage(
        "管理機能は準備中です（Supabase設定が未完了）。設定が完了すると利用できます。",
        "info"
      );
      return;
    }

    // 未ログイン → login へ
    let user = null;
    try {
      user = await Auth.getCurrentUser();
    } catch (_) {
      user = null;
    }
    if (!user) {
      location.href = "login.html?redirect=" + encodeURIComponent("admin.html");
      return;
    }

    // 管理者判定
    let admin = false;
    try {
      admin = await API.isAdmin();
    } catch (_) {
      admin = false;
    }
    if (!admin) {
      showMessage("このページは管理者のみ利用できます。", "error");
      return;
    }

    // 管理画面表示
    if (els.content) els.content.hidden = false;
    if (els.reloadBtn) els.reloadBtn.addEventListener("click", loadPending);
    if (els.list) els.list.addEventListener("click", handleAction);
    await loadPending();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
