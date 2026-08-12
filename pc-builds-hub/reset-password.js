// =====================================================================
//  PC Builds Hub — reset-password.js
//  再設定メールのリンクから遷移し、新しいパスワードを設定する画面。
//
//  リカバリーセッションの扱い（supabase-js v2）:
//   - クライアントは api.js で detectSessionInUrl: true（既定）で生成される。
//     そのため SDK が読み込み時にURLを解釈し、セッションを復元したうえで
//     PASSWORD_RECOVERY イベントを発火する。ここでは自前でトークンを
//     パースせず、SDK の結果（onAuthStateChange / getSession）を待つ。
//   - リンクの形式は Supabase の設定・メールテンプレートにより2種類ある：
//       PKCE   … ?code=xxxx           （現在の既定）
//       implicit … #access_token=…&type=recovery（旧テンプレート）
//     どちらでも動くよう、両方の痕跡を「リカバリー遷移」として扱う。
//   - 期限切れ / 使用済みリンクは ?error=… または #error=… で戻ってくる。
//   - 通常ログイン中のユーザーが直接この画面を開いただけの場合は、
//     パスワード変更を行わせない（リカバリー遷移のときだけフォームを出す）。
//     これにより login → mypage の通常導線と競合しない。
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
    console.info.apply(console, ["[reset]"].concat([].slice.call(arguments)));
  }

  const els = {
    lead: document.getElementById("resetLead"),
    message: document.getElementById("resetMessage"),
    form: document.getElementById("resetForm"),
    newPassword: document.getElementById("newPassword"),
    confirmPassword: document.getElementById("confirmPassword"),
    updateBtn: document.getElementById("updateBtn"),
    retryRow: document.getElementById("retryRow"),
    toLoginRow: document.getElementById("toLoginRow"),
  };

  let submitting = false;
  let done = false; // 変更完了後に onAuthStateChange で画面を戻さないためのフラグ

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

  function setLead(text) {
    if (els.lead) els.lead.textContent = text;
  }

  function showForm(show) {
    if (els.form) els.form.hidden = !show;
  }

  function showRetry(show) {
    if (els.retryRow) els.retryRow.hidden = !show;
  }

  function showToLogin(show) {
    if (els.toLoginRow) els.toLoginRow.hidden = !show;
  }

  function disableForm(disabled) {
    [els.newPassword, els.confirmPassword, els.updateBtn].forEach(function (el) {
      if (el) el.disabled = disabled;
    });
  }

  // 送信中は文言を差し替え、二重送信を防ぐ
  function setUpdating(updating) {
    submitting = updating;
    disableForm(updating);
    if (els.updateBtn) {
      els.updateBtn.textContent = updating ? "変更中..." : "パスワードを変更";
    }
  }

  // --- URL からリカバリー遷移かどうかを判定 ---------------------------
  // SDK が detectSessionInUrl で URL を消してしまう前に読み取る必要があるため、
  // スクリプト読み込み直後（= このIIFE評価時）に一度だけ取得しておく。
  const urlInfo = (function () {
    const hash = (location.hash || "").replace(/^#/, "");
    const hashParams = new URLSearchParams(hash);
    const queryParams = new URLSearchParams(location.search || "");

    const errorCode =
      queryParams.get("error_code") || hashParams.get("error_code") || "";
    const errorDesc =
      queryParams.get("error_description") || hashParams.get("error_description") || "";
    const errorName = queryParams.get("error") || hashParams.get("error") || "";

    return {
      // PKCE（?code=…）: 認証コードがあればリカバリー遷移とみなす
      hasCode: !!queryParams.get("code"),
      // implicit（#access_token=…&type=recovery）
      hasRecoveryHash:
        hashParams.get("type") === "recovery" && !!hashParams.get("access_token"),
      hasError: !!(errorName || errorCode || errorDesc),
      errorCode: errorCode,
      errorDesc: errorDesc,
      errorName: errorName,
    };
  })();

  function isRecoveryLink() {
    return urlInfo.hasCode || urlInfo.hasRecoveryHash;
  }

  // 期限切れ / 使用済みリンクの案内文（Supabase から戻る error パラメータ用）
  function linkErrorMessage() {
    const text = (urlInfo.errorCode + " " + urlInfo.errorDesc + " " + urlInfo.errorName).toLowerCase();
    if (/expired|otp_expired/.test(text)) {
      return "このリンクは有効期限が切れています。お手数ですが、もう一度再設定メールを送信してください。";
    }
    if (/access_denied|invalid/.test(text)) {
      return "このリンクは無効か、すでに使用済みです。お手数ですが、もう一度再設定メールを送信してください。";
    }
    return "リンクを確認できませんでした。お手数ですが、もう一度再設定メールを送信してください。";
  }

  // 無効なリンクとして画面を確定させる
  function renderInvalid(text) {
    setLead("パスワードを変更できませんでした。");
    showForm(false);
    showToLogin(false);
    showRetry(true);
    showMessage(text, "error");
  }

  // 入力可能な状態にする
  function renderReady() {
    setLead("新しいパスワードを入力してください。");
    clearMessage(); // 前の状態のメッセージが残らないようにする
    showRetry(false);
    showToLogin(false);
    showForm(true);
    if (els.newPassword) els.newPassword.focus();
  }

  // --- パスワード更新 -------------------------------------------------
  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return; // 連打ガード
    clearMessage();

    const password = els.newPassword.value || "";
    const confirm = els.confirmPassword.value || "";

    // 入力チェックは auth.js の共通ルール（新規登録と同じ条件）を使う
    const error = Auth.validatePassword(password, confirm);
    if (error) {
      showMessage(error, "error");
      return;
    }

    setUpdating(true);
    try {
      const { error: updateError } = await Auth.updatePassword(password);
      if (updateError) throw updateError;

      done = true;
      setLead("パスワードの変更が完了しました。");
      showForm(false);
      showRetry(false);
      showMessage("パスワードを変更しました。新しいパスワードでログインしてください。", "success");
      showToLogin(true);
      log("パスワード更新成功");

      // リカバリーセッションのまま放置せず、明示的にサインアウトする。
      // 新しいパスワードでログインし直してもらうことで、通常ログインと
      // リカバリー状態が混ざらないようにする。
      try {
        await Auth.signOut();
      } catch (_) {
        /* サインアウト失敗は画面の妨げにしない */
      }
    } catch (err) {
      console.error("[reset] updateUser 失敗", err);
      showMessage(Auth.friendlyError(err), "error");
      setUpdating(false);
      return;
    }
    setUpdating(false);
  }

  // --- 初期化 ---------------------------------------------------------
  async function init() {
    if (els.form) els.form.addEventListener("submit", handleSubmit);
    showForm(false);
    showRetry(false);
    showToLogin(false);

    if (!Auth || !Auth.isAuthAvailable()) {
      setLead("パスワード再設定機能は準備中です。");
      showMessage(
        "Supabase設定が未完了のため、パスワード再設定機能はまだ使えません。",
        "info"
      );
      return;
    }

    // 1) Supabase から error 付きで戻ってきた場合（期限切れ / 使用済み）
    if (urlInfo.hasError) {
      log("リンクエラー:", urlInfo.errorCode || urlInfo.errorName, urlInfo.errorDesc);
      renderInvalid(linkErrorMessage());
      return;
    }

    // 2) リカバリーの痕跡が無い場合は、この画面を直接開いただけとみなす。
    //    通常ログイン中でもここでパスワード変更はさせない（副作用防止）。
    if (!isRecoveryLink()) {
      log("リカバリー遷移ではない");
      setLead("このページは、パスワード再設定メールのリンクから開いてください。");
      showMessage(
        "パスワード再設定用のリンクから開かれていません。再設定メールの送信からやり直してください。",
        "info"
      );
      showRetry(true);
      return;
    }

    // 3) リカバリー遷移：SDK がURLを処理してセッションを復元するのを待つ。
    //    PASSWORD_RECOVERY / SIGNED_IN のどちらでも準備完了とみなす。
    setLead("リンクを確認しています…");

    let settled = false;
    function ready() {
      if (settled || done) return;
      settled = true;
      log("リカバリーセッション確認 → 入力フォーム表示");
      renderReady();
    }

    Auth.onAuthStateChange(function (event, session) {
      log("authStateChange:", event, session ? "session あり" : "session なし");
      if (done) return; // 変更完了後の signOut で画面を戻さない
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
        ready();
      }
    });

    // すでにセッション復元が済んでいる場合（イベントを取り逃した場合）の保険。
    // PKCE のコード交換は非同期なので、少し待ってから確認する。
    for (let i = 0; i < 20 && !settled; i++) {
      const session = await Auth.getSession();
      if (session) {
        ready();
        return;
      }
      await new Promise(function (resolve) {
        setTimeout(resolve, 150);
      });
    }

    if (!settled) {
      log("セッションを確認できなかった");
      renderInvalid(
        "このリンクは無効か、有効期限が切れています。お手数ですが、もう一度再設定メールを送信してください。"
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
