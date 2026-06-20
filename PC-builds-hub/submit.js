(function () {
  "use strict";

  const Auth = window.PCBuildsAuth;
  const API = window.PCBuildsAPI;
  const REDIRECT_SELF = "submit.html";
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const COMPRESS_MAX_DIM = 1600;
  const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp"];
  const MAX_IMAGES = 5;
  const MAX_TITLE = 120;
  const MAX_DESC = 2000;

  const els = {
    message: document.getElementById("submitMessage"),
    form: document.getElementById("submitForm"),
    done: document.getElementById("submitDone"),
    submitBtn: document.getElementById("submitBtn"),
    imageFile: document.getElementById("imageFile"),
  };

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

  function scrollToMessage() {
    if (els.message) els.message.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value : "";
  }

  function collectInput() {
    return {
      title: val("title"),
      description: val("description"),
      cpu: val("cpu"),
      gpu: val("gpu"),
      memory: val("memory"),
      motherboard: val("motherboard"),
      storage: val("storage"),
      case_name: val("case_name"),
      psu: val("psu"),
      cooler: val("cooler"),
      budget: val("budget"),
      resolution: val("resolution"),
      usage: val("usage"),
      tags: val("tags"),
      bench_title: val("bench_title"),
      bench_score: val("bench_score"),
      image_url: val("image_url"),
    };
  }

  function validate(n) {
    const required = [
      ["title", "構成タイトル"],
      ["cpu", "CPU"],
      ["gpu", "GPU"],
      ["memory", "メモリ"],
      ["resolution", "想定解像度"],
      ["usage", "用途"],
    ];
    for (const item of required) {
      if (!n[item[0]]) return item[1] + "は必須です。";
    }
    if (n.title && n.title.length > MAX_TITLE) return "タイトルは" + MAX_TITLE + "文字以内で入力してください。";
    if (n.description && n.description.length > MAX_DESC) return "説明は" + MAX_DESC + "文字以内で入力してください。";
    if (n.budget != null && n.budget < 0) return "予算は0以上で入力してください。";
    if (n.bench_score != null && n.bench_score < 0) return "ベンチマークスコアは0以上で入力してください。";
    return null;
  }

  function validateImageFile(file) {
    if (!file) return null;
    const dot = file.name.lastIndexOf(".");
    const ext = (dot >= 0 ? file.name.slice(dot + 1) : "").toLowerCase();
    if (ALLOWED_EXT.indexOf(ext) === -1) return "画像は jpg / jpeg / png / webp のみ対応しています。";
    if (!/^image\//.test(file.type || "")) return "画像ファイルのみ選択できます。";
    if (file.size > MAX_IMAGE_BYTES) return "画像サイズが大きすぎます（1枚5MBまで）。";
    return null;
  }

  function validateImageFiles(files) {
    const list = Array.prototype.slice.call(files || []);
    if (list.length > MAX_IMAGES) return "画像は最大" + MAX_IMAGES + "枚までです。";
    for (let i = 0; i < list.length; i++) {
      const err = validateImageFile(list[i]);
      if (err) return err;
    }
    return null;
  }

  async function compressImage(file) {
    try {
      if (!file || !/^image\//.test(file.type || "") || typeof createImageBitmap !== "function") return file;
      const bitmap = await createImageBitmap(file);
      let w = bitmap.width;
      let h = bitmap.height;
      if (w > COMPRESS_MAX_DIM || h > COMPRESS_MAX_DIM) {
        const scale = Math.min(COMPRESS_MAX_DIM / w, COMPRESS_MAX_DIM / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, w, h);
      if (bitmap.close) bitmap.close();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
      if (!blob || blob.size >= file.size) return file;
      const base = file.name.replace(/\.[^.]+$/, "") || "image";
      return new File([blob], base + ".jpg", { type: "image/jpeg" });
    } catch (_) {
      return file;
    }
  }

  function setSubmitting(on) {
    if (!els.submitBtn) return;
    els.submitBtn.disabled = on;
    els.submitBtn.textContent = on ? "送信中..." : "投稿を申請する";
  }

  function friendlyError(error) {
    const msg = (error && (error.message || error.error_description)) || "";
    const code = (error && error.code) || "";
    if (/AUTH_UNAVAILABLE/.test(msg)) return "Supabase設定が未完了のため投稿できません。";
    if (/NOT_LOGGED_IN/.test(msg)) return "ログインが必要です。";
    if (code === "PGRST204" || /schema cache|Could not find the .* column/i.test(msg)) return "DBスキーマの反映が必要です。image_urls カラムを追加してください。";
    if (/row-level security|RLS|violates row-level/i.test(msg)) return "権限エラーで保存できませんでした。";
    if (/Bucket not found|storage/i.test(msg)) return "画像保存先が見つかりません。";
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return "ネットワークエラーです。時間をおいて再度お試しください。";
    return "投稿に失敗しました" + (msg ? "（" + msg + "）" : "。時間をおいて再度お試しください。");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    clearMessage();
    if (!Auth || !Auth.isAuthAvailable() || !API) {
      showMessage("投稿機能は準備中です（Supabase設定が未完了）。", "error");
      return;
    }

    const raw = collectInput();
    const normalized = API.normalizePostInput(raw);
    const vErr = validate(normalized);
    if (vErr) {
      showMessage(vErr, "error");
      scrollToMessage();
      return;
    }

    const files = Array.prototype.slice.call((els.imageFile && els.imageFile.files) || []);
    const imgErr = validateImageFiles(files);
    if (imgErr) {
      showMessage(imgErr, "error");
      scrollToMessage();
      return;
    }

    setSubmitting(true);
    try {
      const user = await Auth.getCurrentUser();
      if (!user) {
        location.href = "login.html?redirect=" + encodeURIComponent(REDIRECT_SELF);
        return;
      }

      let imageUrls = normalized.images || [];
      if (files.length) {
        const preparedFiles = [];
        for (let i = 0; i < files.slice(0, MAX_IMAGES).length; i++) {
          preparedFiles.push(await compressImage(files[i]));
        }
        const uploadedUrls = await API.uploadPostImages(preparedFiles, user.id);
        imageUrls = uploadedUrls.concat(imageUrls).slice(0, MAX_IMAGES);
      }

      const payload = Object.assign({}, raw, {
        image_url: imageUrls[0] || "",
        image_urls: imageUrls,
        images: imageUrls,
      });
      await API.createPost(payload);

      if (els.form) els.form.hidden = true;
      if (els.done) els.done.hidden = false;
      showMessage("投稿申請を受け付けました。管理者の確認後に公開されます。", "success");
      scrollToMessage();
    } catch (error) {
      showMessage(friendlyError(error), "error");
      scrollToMessage();
      setSubmitting(false);
    }
  }

  async function init() {
    if (!Auth || !Auth.isAuthAvailable() || !API) {
      showMessage("投稿機能は準備中です（Supabase設定が未完了）。", "info");
      if (els.form) els.form.hidden = true;
      return;
    }
    const user = await Auth.getCurrentUser().catch(() => null);
    if (!user) {
      location.href = "login.html?redirect=" + encodeURIComponent(REDIRECT_SELF);
      return;
    }
    if (els.form) {
      els.form.hidden = false;
      els.form.addEventListener("submit", handleSubmit);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
