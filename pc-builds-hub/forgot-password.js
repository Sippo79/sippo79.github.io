// =====================================================================
//  PC Builds Hub — forgot-password.js
//  パスワード再設定メールの送信画面。
//  Supabase未設定時はフォームを無効化し、案内のみ表示（壊さない）。
//
//  セキュリティ方針：
//    アカウントの有無を第三者に判別させないため、送信結果は
//    「登録済み / 未登録」に関わらず常に同じ成功メッセージを表示する。
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
    console.info.apply(console, ["[forgot]"].concat([].slice.call(arguments)));
  }

  const els = {
    message: document.getElementById("forgotMessage"),
    form: document.getElementById("forgotForm"),
    email: document.getElementById("email"),
    sendBtn: document.getElementById("sendBtn"),
  };

  // 登録の有無を問わず同じ文言（アカウント存在の推測を防ぐ）
  const SENT_MESSAGE =
    "パスワード再設定用のメールを送信しました。メール内のリンクから新しいパスワードを設定してください。" +
    "（メールが届かない場合は、迷惑メールフォルダもご確認ください）";

  let submitting = false;

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

  function disableForm(disabled) {
    [els.email, els.sendBtn].forEach(function (el) {
      if (el) el.disabled = disabled;
    });
  }

  // 送信中は文言を差し替え、二重送信を防ぐ
  function setSending(sending) {
    submitting = sending;
    disableForm(sending);
    if (els.sendBtn) {
      els.sendBtn.textContent = sending ? "送信中..." : "再設定メールを送信";
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return; // 連打ガード
    clearMessage();

    if (!Auth || !Auth.isAuthAvailable()) {
      showMessage("Supabase設定が未完了のため、パスワード再設定はまだ使えません", "error");
      return;
    }

    const email = (els.email.value || "").trim();

    const emailError = Auth.validateEmail(email);
    if (emailError) {
      showMessage(emailError, "error");
      return;
    }

    setSending(true);
    try {
      const { error } = await Auth.resetPasswordForEmail(email);
      if (error) throw error;

      // 成功：フォームを閉じて、同じ文言のみ表示する
      showMessage(SENT_MESSAGE, "success");
      if (els.form) els.form.hidden = true;
      log("再設定メール送信リクエスト完了");
    } catch (error) {
      // 調査用に console には残す（画面には内部情報を出さない）
      console.error("[forgot] resetPasswordForEmail 失敗", error);

      const msg = (error && (error.message || error.error_description)) || "";
      // レート制限・通信エラーは、その旨を伝えないと利用者が対処できない
      if (/rate limit|too many requests|after \d+ seconds/i.test(msg) ||
          /Failed to fetch|NetworkError|network request failed/i.test(msg)) {
        showMessage(Auth.friendlyError(error), "error");
      } else {
        // それ以外は成功時と同じ文言にして、アカウントの有無を推測させない
        showMessage(SENT_MESSAGE, "success");
        if (els.form) els.form.hidden = true;
      }
    } finally {
      setSending(false);
    }
  }

  function init() {
    if (els.form) els.form.addEventListener("submit", handleSubmit);

    // ログイン画面から引き継いだメールアドレスを初期表示
    try {
      const prefill = new URLSearchParams(location.search).get("email");
      if (prefill && els.email) els.email.value = prefill;
    } catch (_) {
      /* URL が壊れていても画面は動かす */
    }

    const available = !!(Auth && Auth.isAuthAvailable());
    log("Auth有効:", available);

    if (!available) {
      showMessage(
        "Supabase設定が未完了のため、パスワード再設定機能はまだ使えません。",
        "info"
      );
      disableForm(true);
      return;
    }

    if (els.email && !els.email.value) els.email.focus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
