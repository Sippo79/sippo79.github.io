// =====================================================================
//  PC Builds Hub — mypage.js
//  最低限のマイページ。未ログインは login へ誘導、Auth無効は案内のみ。
//  Phase 2 では「アカウント情報の表示 + ログアウト」まで。
// =====================================================================

(function () {
  "use strict";

  const Auth = window.PCBuildsAuth;
  const API = window.PCBuildsAPI;

  const DEBUG = (function () {
    try {
      const h = location.hostname;
      return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "" || location.protocol === "file:";
    } catch (_) {
      return false;
    }
  })();
  function log() {
    if (!DEBUG) return;
    console.info.apply(console, ["[mypage]"].concat([].slice.call(arguments)));
  }

  const els = {
    message: document.getElementById("mypageMessage"),
    content: document.getElementById("mypageContent"),
    email: document.getElementById("infoEmail"),
    displayName: document.getElementById("infoDisplayName"),
    myPostsList: document.getElementById("myPostsList"),
    adminMenu: document.getElementById("adminMenu"),
  };

  const STATUS_INFO = {
    draft: { label: "下書き", cls: "status-draft", note: "まだ申請されていません" },
    pending: { label: "承認待ち", cls: "status-pending", note: "管理者の確認中です" },
    approved: { label: "公開中", cls: "status-approved", note: "" },
    rejected: { label: "非公開 / 差し戻し", cls: "status-rejected", note: "公開されていません" },
  };

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value) {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "/" + p(d.getMonth() + 1) + "/" + p(d.getDate());
  }

  function renderMyPosts(posts) {
    if (!els.myPostsList) return;
    if (!posts || posts.length === 0) {
      els.myPostsList.innerHTML =
        '<div class="my-posts-empty">まだ投稿がありません。「構成を投稿する」から申請できます。</div>';
      return;
    }
    els.myPostsList.innerHTML = posts
      .map(function (p) {
        const info = STATUS_INFO[p.status] || { label: p.status || "不明", cls: "status-draft", note: "" };
        const id = String(p.id == null ? "" : p.id);
        const idEnc = encodeURIComponent(id);
        const idAttr = escapeHtml(id);
        const titleHtml = escapeHtml(p.title || "無題のPC構成");
        const date = formatDate(p.created_at);

        // 承認待ち/差し戻し時の状態説明（控えめに）
        const noteHtml = info.note
          ? '<div class="my-post-meta"><span class="my-post-note">' + escapeHtml(info.note) + "</span></div>"
          : "";

        // 操作ボタン：詳細（approvedのみ）/ 編集 / 削除
        const detailBtn =
          p.status === "approved" && id
            ? '<a class="btn my-post-btn" href="post.html?id=' + idEnc + '">詳細を見る</a>'
            : "";
        const editBtn = id
          ? '<a class="btn my-post-btn" href="edit.html?id=' + idEnc + '">編集</a>'
          : "";
        const deleteBtn = id
          ? '<button type="button" class="btn my-post-btn my-post-delete" data-action="delete-post" data-id="' + idAttr + '">削除</button>'
          : "";

        // 承認済みのみ：編集すると再審査で一時非公開になる旨を案内。
        const rereviewNote =
          p.status === "approved"
            ? '<p class="my-post-rereview">公開中の投稿を編集すると、再審査のため一時的に非公開になります。</p>'
            : "";

        return (
          '<div class="my-post-row">' +
          '<div class="my-post-head">' +
          '<div class="my-post-main">' +
          '<span class="my-post-title">' + titleHtml + "</span>" +
          (date ? '<span class="my-post-date">' + escapeHtml(date) + "</span>" : "") +
          "</div>" +
          '<span class="status-badge ' + info.cls + '">' + escapeHtml(info.label) + "</span>" +
          "</div>" +
          noteHtml +
          '<div class="my-post-actions">' + detailBtn + editBtn + deleteBtn + "</div>" +
          rereviewNote +
          "</div>"
        );
      })
      .join("");
  }

  // 削除（本人の投稿のみ。確認ダイアログ必須）
  async function handleMyPostsClick(e) {
    const btn = e.target.closest('[data-action="delete-post"]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id || !API || typeof API.deleteMyPost !== "function") return;

    const ok = window.confirm("この投稿を削除します。元に戻せません。よろしいですか？");
    if (!ok) return;

    btn.disabled = true;
    try {
      await API.deleteMyPost(id);
      showMessage("投稿を削除しました。", "success");
      await loadMyPosts(); // 一覧を再取得（削除分が消える）
    } catch (err) {
      showMessage("削除に失敗しました（" + ((err && err.message) || "error") + "）。", "error");
      btn.disabled = false;
    }
  }

  async function loadMyPosts() {
    if (!els.myPostsList || !API || typeof API.getMyPosts !== "function") return;
    els.myPostsList.innerHTML = '<div class="my-posts-empty">読み込み中…</div>';
    try {
      const posts = await API.getMyPosts();
      renderMyPosts(posts);
    } catch (e) {
      els.myPostsList.innerHTML =
        '<div class="my-posts-empty">投稿一覧を読み込めませんでした。時間をおいて再度お試しください。</div>';
    }
  }

  function showMessage(text, type) {
    if (!els.message) return;
    els.message.textContent = text;
    els.message.className = "mypage-message" + (type ? " auth-message-" + type : "");
    els.message.hidden = false;
  }

  function showContent(show) {
    if (els.content) els.content.hidden = !show;
  }

  async function init() {
    const available = !!(Auth && Auth.isAuthAvailable());
    log("Auth有効:", available);

    // Supabase 未設定：案内のみ（ログインへは飛ばさない・空画面にしない）
    if (!available) {
      showContent(false);
      showMessage(
        "マイページ機能は準備中です（Supabase設定が未完了）。設定が完了するとご利用いただけます。",
        "info"
      );
      log("判定: 未設定 → 案内表示");
      return;
    }

    // 未ログイン：login へ誘導（null はログイン済み扱いにしない）
    let user = null;
    try {
      user = await Auth.getCurrentUser();
    } catch (e) {
      log("getCurrentUser 失敗:", (e && e.message) || "error");
      user = null;
    }
    log("ログイン状態:", user ? "ログイン済み" : "未ログイン");
    if (!user) {
      log("判定: 未ログイン → login.html?redirect=mypage.html へ");
      location.href = "login.html?redirect=" + encodeURIComponent("mypage.html");
      return;
    }
    log("判定: ログイン済み → マイページ表示");

    // プロフィール取得（失敗しても画面は壊さない）
    let profile = null;
    try {
      profile = await Auth.getProfile();
    } catch (_) {
      profile = null;
    }

    const displayName =
      (profile && profile.display_name) ||
      (user.user_metadata && user.user_metadata.display_name) ||
      "(未設定)";
    // role は管理メニュー表示の判定にのみ使用し、DOM には表示しない（内部情報の露出防止）
    const role = (profile && profile.role) || "user";

    if (els.email) els.email.textContent = user.email || "-";
    if (els.displayName) els.displayName.textContent = displayName;

    // 管理者だけ管理メニューを表示
    if (els.adminMenu && role === "admin") {
      els.adminMenu.hidden = false;
    }

    if (!profile) {
      showMessage(
        "プロフィール情報を取得できませんでした（基本情報のみ表示）。",
        "info"
      );
    }
    showContent(true);

    // 削除ボタンの委任ハンドラ（再描画後も有効。一度だけ登録）
    if (els.myPostsList) {
      els.myPostsList.addEventListener("click", handleMyPostsClick);
    }

    // 自分の投稿一覧（profiles 取得失敗とは独立して表示）
    loadMyPosts();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
