// =====================================================================
//  PC Builds Hub — Auth レイヤー (auth.js)
//  ---------------------------------------------------------------------
//  Supabase Auth の共通処理を window.PCBuildsAuth に集約。
//  - クライアントは api.js (PCBuildsAPI.getSupabaseClient) を共有して使う。
//  - Supabase 未設定 / SDK未読込 / ダミー値のときは「Auth無効」として扱い、
//    サイト全体を壊さない（閲覧機能はそのまま）。
//  - service_role key は使わない。anon key + RLS 前提。
//
//  読み込み順：SDK → supabase-config.js → api.js → auth.js → (各ページjs)
// =====================================================================

(function (global) {
  "use strict";

  // --- 開発用ログ（localhost / file: のみ）--------------------------
  const DEBUG = (function () {
    try {
      const h = global.location && global.location.hostname;
      return (
        h === "localhost" ||
        h === "127.0.0.1" ||
        h === "0.0.0.0" ||
        h === "" ||
        (global.location && global.location.protocol === "file:")
      );
    } catch (_) {
      return false;
    }
  })();
  function log() {
    if (!DEBUG) return;
    console.info.apply(console, ["[auth]"].concat([].slice.call(arguments)));
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // --- 入力ルール（login / forgot / reset で共有する唯一の定義）------
  //  Supabase Auth 側の既定（最低6文字）に合わせる。条件を変える場合は
  //  ここだけを直せば、新規登録・パスワード再設定の両方に反映される。
  const PASSWORD_MIN_LENGTH = 6;
  const PASSWORD_HINT = "パスワードは" + PASSWORD_MIN_LENGTH + "文字以上で入力してください";

  // 「明らかに不正な形式」を弾く程度の簡易チェック（厳密判定はSupabase側）
  function validateEmail(email) {
    const v = String(email == null ? "" : email).trim();
    if (!v) return "メールアドレスを入力してください";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      return "メールアドレスの形式が正しくありません";
    }
    return null; // null = OK
  }

  // 新しいパスワード＋確認欄の検証。confirm を省略すると一致確認はしない。
  function validatePassword(password, confirm) {
    const p = String(password == null ? "" : password);
    if (!p) return "新しいパスワードを入力してください";
    if (p.length < PASSWORD_MIN_LENGTH) return PASSWORD_HINT;
    if (arguments.length >= 2) {
      if (!confirm) return "確認用のパスワードを入力してください";
      if (p !== confirm) return "パスワードが一致しません";
    }
    return null; // null = OK
  }

  // --- クライアント取得（api.js と共有）------------------------------
  function getClient() {
    if (
      global.PCBuildsAPI &&
      typeof global.PCBuildsAPI.getSupabaseClient === "function"
    ) {
      return global.PCBuildsAPI.getSupabaseClient();
    }
    return null;
  }

  function isAuthAvailable() {
    return getClient() !== null;
  }

  // --- セッション / ユーザー -----------------------------------------
  async function getSession() {
    const c = getClient();
    if (!c) return null;
    try {
      const { data } = await c.auth.getSession();
      return (data && data.session) || null;
    } catch (e) {
      log("getSession 失敗:", e);
      return null;
    }
  }

  async function getCurrentUser() {
    const session = await getSession();
    return session ? session.user : null;
  }

  async function getProfile() {
    const c = getClient();
    if (!c) return null;
    const user = await getCurrentUser();
    if (!user) return null;
    try {
      const { data, error } = await c
        .from("profiles")
        .select("display_name, role, avatar_url, bio")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data;
    } catch (e) {
      log("profiles 取得失敗（画面は継続）:", e);
      return null;
    }
  }

  // --- 認証アクション -------------------------------------------------
  // 認証メールのリンク押下後に戻る先（= 投稿サイトのマイページ）。
  // signUp は login.html 上で実行され、mypage.html は同じディレクトリにあるため、
  // 現在ページ基準で解決する。これでドメイン直下でも /pc-builds-hub/ 配下でも
  // 正しい絶対URL（例：https://sippo-pc.jp/mypage.html）になる。
  function getEmailRedirectTo() {
    try {
      return new URL("mypage.html", global.location.href).href;
    } catch (_) {
      return undefined; // 解決できない場合は Supabase の Site URL 既定にフォールバック
    }
  }

  async function signUp(email, password, displayName) {
    const c = getClient();
    if (!c) throw new Error("AUTH_UNAVAILABLE");
    return c.auth.signUp({
      email: email,
      password: password,
      options: {
        // display_name は維持しつつ、確認メールの戻り先を投稿サイトに固定
        data: { display_name: displayName || "" },
        emailRedirectTo: getEmailRedirectTo(),
      },
    });
  }

  async function signIn(email, password) {
    const c = getClient();
    if (!c) throw new Error("AUTH_UNAVAILABLE");
    return c.auth.signInWithPassword({ email: email, password: password });
  }

  // --- パスワード再設定 -----------------------------------------------
  // 再設定メールのリンク押下後に戻る先（= reset-password.html）。
  // signUp の emailRedirectTo と同じく現在ページ基準で解決するため、
  // 本番（https://sippo-pc.jp/…）でも localhost でもそのまま動く。
  function getResetRedirectTo() {
    try {
      return new URL("reset-password.html", global.location.href).href;
    } catch (_) {
      return undefined; // 解決できない場合は Supabase の Site URL 既定にフォールバック
    }
  }

  async function resetPasswordForEmail(email) {
    const c = getClient();
    if (!c) throw new Error("AUTH_UNAVAILABLE");
    return c.auth.resetPasswordForEmail(email, {
      redirectTo: getResetRedirectTo(),
    });
  }

  async function updatePassword(newPassword) {
    const c = getClient();
    if (!c) throw new Error("AUTH_UNAVAILABLE");
    return c.auth.updateUser({ password: newPassword });
  }

  async function signOut() {
    const c = getClient();
    if (!c) return { error: null };
    try {
      return await c.auth.signOut();
    } catch (e) {
      log("signOut 失敗:", e);
      return { error: e };
    }
  }

  // --- エラー文言（日本語）--------------------------------------------
  //  Supabase から返る英語メッセージを、利用者向けの日本語へ変換する。
  //  login / forgot / reset で同じ文言を使うため、ここに集約。
  function friendlyError(error) {
    const msg = (error && (error.message || error.error_description)) || "";

    if (/Invalid login credentials/i.test(msg)) {
      return "メールアドレスまたはパスワードを確認してください";
    }
    if (/already registered|already exists|User already/i.test(msg)) {
      return "このメールアドレスは既に登録されています";
    }
    if (/Password should be at least/i.test(msg)) {
      return PASSWORD_HINT;
    }
    if (/New password should be different|should be different from the old/i.test(msg)) {
      return "現在と同じパスワードは設定できません。別のパスワードを入力してください";
    }
    if (/Email not confirmed/i.test(msg)) {
      return "メール認証が未完了です。確認メールのリンクを開いてください";
    }
    // リカバリーリンクの期限切れ / 使用済み / 改ざん
    if (/expired|invalid|not found|otp/i.test(msg) && /token|link|code|otp/i.test(msg)) {
      return "このリンクは無効か、有効期限が切れています。お手数ですが、もう一度メールの再送をお試しください";
    }
    if (/Auth session missing|session_not_found|JWT expired/i.test(msg)) {
      return "セッションの有効期限が切れました。もう一度メールの再送をお試しください";
    }
    // 短時間に何度も送信した場合（Supabase のレート制限）
    if (/rate limit|too many requests|after \d+ seconds/i.test(msg)) {
      return "リクエストが多すぎます。しばらく時間をおいて再度お試しください";
    }
    // fetch 失敗（オフライン / 通信断）
    if (/Failed to fetch|NetworkError|network request failed/i.test(msg)) {
      return "通信に失敗しました。ネットワーク環境をご確認のうえ、再度お試しください";
    }
    return "エラーが発生しました。時間をおいて再度お試しください";
  }

  function onAuthStateChange(callback) {
    const c = getClient();
    if (!c) return null;
    try {
      return c.auth.onAuthStateChange(function (event, session) {
        if (typeof callback === "function") callback(event, session);
      });
    } catch (e) {
      log("onAuthStateChange 失敗:", e);
      return null;
    }
  }

  // --- ログイン必須ページ用 -----------------------------------------
  // 未ログインなら login.html?redirect=... へ。Auth無効時は誘導しない。
  async function requireLogin(redirectTo) {
    if (!isAuthAvailable()) return null;
    const user = await getCurrentUser();
    if (!user) {
      const here =
        redirectTo ||
        (global.location.pathname.split("/").pop() || "index.html") +
          global.location.search;
      global.location.href = "login.html?redirect=" + encodeURIComponent(here);
      return null;
    }
    return user;
  }

  // --- ヘッダー / 掲載CTA の一括反映 ---------------------------------
  function renderAuthArea(el, ctx) {
    if (ctx.user) {
      // 権限（管理者）バッジはヘッダーに表示しない（内部情報の露出防止）。
      // 管理者向け導線はマイページの「管理メニュー」に集約。
      el.innerHTML =
        '<span class="auth-name" title="' +
        escapeHtml(ctx.name) +
        '">' +
        escapeHtml(ctx.name) +
        "</span>" +
        '<a class="btn" href="mypage.html">マイページ</a>' +
        '<button class="btn" type="button" data-auth-logout>ログアウト</button>';
    } else {
      // 未ログイン（Auth無効時も同じ。閲覧はそのまま使える）
      el.innerHTML =
        '<a class="btn" href="login.html">ログイン</a>' +
        '<a class="btn btn-primary" href="login.html?mode=signup">新規登録</a>';
    }
  }

  function renderSubmitCta(el, ctx) {
    if (!ctx.available) {
      // Supabase 未設定：案内のみ（ボタンなし）
      el.innerHTML =
        '<span class="submit-cta-text">投稿機能は準備中です</span>';
      return;
    }
    if (ctx.user) {
      el.innerHTML =
        '<span class="submit-cta-text">あなたのPC構成を投稿申請できます</span>' +
        '<a class="btn btn-primary" href="submit.html">構成を投稿する</a>';
    } else {
      el.innerHTML =
        '<span class="submit-cta-text">ログインすると、PC構成を投稿できます</span>' +
        '<a class="btn btn-primary" href="login.html?redirect=submit.html">ログインして投稿する</a>';
    }
  }

  async function updateAuthUI() {
    const authEls = document.querySelectorAll("[data-auth-ui]");
    const ctaEls = document.querySelectorAll("[data-submit-cta]");
    if (!authEls.length && !ctaEls.length) return;

    const available = isAuthAvailable();
    let user = null;
    let profile = null;
    if (available) {
      user = await getCurrentUser();
      if (user) profile = await getProfile();
    }
    const name =
      (profile && profile.display_name) ||
      (user && (user.user_metadata && user.user_metadata.display_name)) ||
      (user && user.email) ||
      "";
    const role = (profile && profile.role) || "user";

    const ctx = { available: available, user: user, name: name, role: role };
    authEls.forEach(function (el) {
      renderAuthArea(el, ctx);
    });
    ctaEls.forEach(function (el) {
      renderSubmitCta(el, ctx);
    });
  }

  // --- ログアウトのクリック委任 -------------------------------------
  document.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-auth-logout]");
    if (!btn) return;
    e.preventDefault();
    signOut().finally(function () {
      global.location.href = "./";
    });
  });

  // --- 初期化：UI反映 + 認証状態変化で再反映 ------------------------
  async function logAuthState() {
    if (!DEBUG) return;
    const available = isAuthAvailable();
    log("Auth有効:", available);
    if (!available) {
      log("Supabase config: 未設定 / ダミー値 → 閲覧機能はそのまま動作します。");
      return;
    }
    try {
      const session = await getSession();
      log("セッション:", session ? "あり" : "なし");
    } catch (e) {
      log("状態取得に失敗:", (e && e.message) || "error");
    }
  }

  function init() {
    updateAuthUI();
    onAuthStateChange(function () {
      updateAuthUI();
    });
    logAuthState();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.PCBuildsAuth = {
    isAuthAvailable: isAuthAvailable,
    getClient: getClient,
    getSession: getSession,
    getCurrentUser: getCurrentUser,
    getProfile: getProfile,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    resetPasswordForEmail: resetPasswordForEmail,
    updatePassword: updatePassword,
    onAuthStateChange: onAuthStateChange,
    updateAuthUI: updateAuthUI,
    requireLogin: requireLogin,
    // 入力ルール / エラー文言（login・forgot・reset で共有）
    PASSWORD_MIN_LENGTH: PASSWORD_MIN_LENGTH,
    PASSWORD_HINT: PASSWORD_HINT,
    validateEmail: validateEmail,
    validatePassword: validatePassword,
    friendlyError: friendlyError,
  };
})(window);
