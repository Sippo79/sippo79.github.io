// =====================================================================
//  PC Builds Hub — login.js
//  ログイン / 新規登録を 1 ページで扱う。
//  Supabase未設定時はフォームを無効化し、案内のみ表示（壊さない）。
// =====================================================================

(function () {
  "use strict";

  const Auth = window.PCBuildsAuth;

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
    console.info.apply(console, ["[login]"].concat([].slice.call(arguments)));
  }

  const els = {
    title: document.getElementById("authTitle"),
    lead: document.getElementById("authLead"),
    message: document.getElementById("authMessage"),
    form: document.getElementById("authForm"),
    displayNameField: document.getElementById("displayNameField"),
    displayName: document.getElementById("displayName"),
    email: document.getElementById("email"),
    password: document.getElementById("password"),
    primaryBtn: document.getElementById("primaryBtn"),
    switchPrompt: document.getElementById("switchPrompt"),
    switchModeBtn: document.getElementById("switchModeBtn"),
    toMypageLink: document.getElementById("toMypageLink"),
  };

  let mode = "login"; // "login" | "signup"

  // URL の ?mode=signup のときだけ新規登録モード。それ以外は通常ログイン。
  function getInitialMode() {
    const sp = new URLSearchParams(location.search);
    return sp.get("mode") === "signup" ? "signup" : "login";
  }

  function getRedirect() {
    const sp = new URLSearchParams(location.search);
    const r = sp.get("redirect");
    // 同一サイト内の相対パスのみ許可（オープンリダイレクト防止）
    if (!r || /^https?:\/\//i.test(r) || r.startsWith("//")) return "mypage.html";
    return r;
  }

  function showMessage(text, type) {
    if (!els.message) return;
    els.message.textContent = text;
    els.message.className = "auth-message" + (type ? " auth-message-" + type : "");
    els.message.hidden = false;
  }

  function clearMessage() {
    if (!els.message) return;
    els.message.hidden = true;
    els.message.textContent = "";
  }

  function setMode(next) {
    mode = next;
    const isSignup = mode === "signup";
    els.title.textContent = isSignup ? "新規登録" : "ログイン";
    els.lead.textContent = isSignup
      ? "メールアドレス・パスワード・表示名を入力してください。"
      : "メールアドレスとパスワードでログインしてください。";
    els.displayNameField.hidden = !isSignup;
    els.primaryBtn.textContent = isSignup ? "新規登録" : "ログイン";
    els.password.setAttribute(
      "autocomplete",
      isSignup ? "new-password" : "current-password"
    );
    els.switchPrompt.textContent = isSignup
      ? "すでにアカウントをお持ちの場合："
      : "アカウントをお持ちでない場合：";
    els.switchModeBtn.textContent = isSignup
      ? "ログインはこちら"
      : "新規登録はこちら";
    clearMessage();
  }

  function disableForm(disabled) {
    [els.email, els.password, els.displayName, els.primaryBtn, els.switchModeBtn].forEach(
      function (el) {
        if (el) el.disabled = disabled;
      }
    );
  }

  function friendlyError(error) {
    const msg = (error && (error.message || error.error_description)) || "";
    if (/Invalid login credentials/i.test(msg)) {
      return "メールアドレスまたはパスワードを確認してください";
    }
    if (/already registered|already exists|User already/i.test(msg)) {
      return "このメールアドレスは既に登録されています";
    }
    if (/Password should be at least/i.test(msg)) {
      return "パスワードは6文字以上で入力してください";
    }
    if (/Email not confirmed/i.test(msg)) {
      return "メール認証が未完了です。確認メールのリンクを開いてください";
    }
    return "エラーが発生しました。時間をおいて再度お試しください";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    clearMessage();

    if (!Auth || !Auth.isAuthAvailable()) {
      showMessage("Supabase設定が未完了のため、ログイン機能はまだ使えません", "error");
      return;
    }

    const email = (els.email.value || "").trim();
    const password = els.password.value || "";
    const displayName = (els.displayName.value || "").trim();

    if (!email || !password) {
      showMessage("メールアドレスとパスワードを入力してください", "error");
      return;
    }

    disableForm(true);
    try {
      if (mode === "signup") {
        const { data, error } = await Auth.signUp(email, password, displayName);
        if (error) throw error;
        // メール認証ONの場合は session が無い。OFFなら即ログイン状態。
        if (data && data.session) {
          showMessage("会員登録が完了しました。移動します…", "success");
          setTimeout(function () {
            location.href = getRedirect();
          }, 800);
        } else {
          showMessage(
            "会員登録を受け付けました。確認メールが届いている場合は、メール内のリンクを開いてください",
            "success"
          );
        }
      } else {
        const { error } = await Auth.signIn(email, password);
        if (error) throw error;
        showMessage("ログインしました。移動します…", "success");
        setTimeout(function () {
          location.href = getRedirect();
        }, 600);
      }
    } catch (error) {
      showMessage(friendlyError(error), "error");
    } finally {
      disableForm(false);
    }
  }

  function showMypageLink(show) {
    if (els.toMypageLink) els.toMypageLink.hidden = !show;
  }

  async function init() {
    setMode(getInitialMode()); // ?mode=signup なら新規登録フォームを初期表示
    showMypageLink(false); // 既定では非表示（未ログイン時に出さない）

    if (els.form) els.form.addEventListener("submit", handleSubmit);
    if (els.switchModeBtn) {
      els.switchModeBtn.addEventListener("click", function () {
        setMode(mode === "login" ? "signup" : "login");
      });
    }

    const available = !!(Auth && Auth.isAuthAvailable());
    log("Auth有効:", available);

    if (!available) {
      // Supabase 未設定：フォーム無効化＋理由を明示。マイページ導線は出さない。
      showMessage(
        "Supabase設定が未完了のため、ログイン機能はまだ使えません。",
        "info"
      );
      disableForm(true);
      showMypageLink(false);
      return;
    }

    // すでにログイン済みか確認（null はログイン済み扱いにしない）
    let user = null;
    try {
      user = await Auth.getCurrentUser();
    } catch (e) {
      log("getCurrentUser 失敗:", (e && e.message) || "error");
      user = null;
    }
    log("ログイン状態:", user ? "ログイン済み" : "未ログイン");

    if (user) {
      // ログイン済みのときだけマイページ導線を表示
      showMypageLink(true);
      showMessage("すでにログイン済みです。マイページへ移動できます。", "info");
    } else {
      showMypageLink(false);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
