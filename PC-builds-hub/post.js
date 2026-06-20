const POSTS_JSON_PATH = "posts.json";
const FALLBACK_IMAGE = "images/no-image.svg";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function loadPosts() {
  // データ取得は api.js (PCBuildsAPI) に集約。
  // Supabase 設定があれば DB から、なければ posts.json から取得される。
  if (
    typeof window !== "undefined" &&
    window.PCBuildsAPI &&
    typeof window.PCBuildsAPI.loadPosts === "function"
  ) {
    return window.PCBuildsAPI.loadPosts();
  }

  // フォールバック（api.js 未読み込み時）
  const res = await fetch(POSTS_JSON_PATH, { cache: "no-store" });

  if (!res.ok) {
    throw new Error("posts.json の読み込みに失敗しました");
  }

  return res.json();
}

function getPostIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function getPostId(post, index = 0) {
  return String(post?.id ?? post?.slug ?? post?.title ?? index);
}

function getImages(post) {
  let list = [];
  if (Array.isArray(post?.image_urls) && post.image_urls.length > 0) {
    list = post.image_urls;
  } else if (Array.isArray(post?.images) && post.images.length > 0) {
    list = post.images;
  } else if (post?.image_url) {
    list = [post.image_url];
  } else if (post?.image) {
    list = [post.image];
  }
  list = Array.from(new Set(
    list.map((value) => String(value || "").trim()).filter(Boolean)
  )).slice(0, 5);
  if (list.length) return list;

  // 画像なし投稿はフォールバックSVGを表示
  return ["images/no-image.svg"];
}

// ログイン誘導（現在ページへ戻る redirect 付き）
function promptLoginForLike() {
  const here = (location.pathname.split("/").pop() || "index.html") + location.search;
  if (window.confirm("いいねするにはログインが必要です。ログインページへ移動しますか？")) {
    location.href = "login.html?redirect=" + encodeURIComponent(here);
  }
}

// 簡易トースト（依存なし・自動消滅）
function showLikeHint(text) {
  let el = document.querySelector(".like-toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "like-toast";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add("is-show");
  clearTimeout(showLikeHint._t);
  showLikeHint._t = setTimeout(() => el.classList.remove("is-show"), 2500);
}

function renderGallery(images, title) {
  // 最大5枚に制限。getImages が必ず1枚以上返すが念のためフォールバック。
  const list = (Array.isArray(images) && images.length ? images : ["images/no-image.svg"]).slice(0, 5);
  const main = list[0];

  // メイン画像（先頭のみ eager + 高優先で読み込み、残りサムネは lazy）
  const mainHtml = `
    <div class="post-detail-image-wrap">
      <img
        id="postMainImage"
        src="${escapeHtml(main)}"
        alt="${escapeHtml(title)}"
        class="post-detail-image"
        loading="eager"
        fetchpriority="high"
        decoding="async"
        onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'"
      >
    </div>
  `;

  // 2枚以上のときだけサムネイル列を表示（クリックでメインを切替）
  const thumbsHtml = list.length > 1 ? `
    <div class="post-detail-thumbs" role="list" aria-label="画像サムネイル">
      ${list.map((src, index) => `
        <button
          type="button"
          class="post-detail-thumb${index === 0 ? " is-active" : ""}"
          role="listitem"
          data-full="${escapeHtml(src)}"
          aria-label="${escapeHtml(title)} ${index + 1}枚目を表示"
        >
          <img
            src="${escapeHtml(src)}"
            alt=""
            loading="lazy"
            decoding="async"
            onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'"
          >
        </button>
      `).join("")}
    </div>
  ` : "";

  return `
    <div class="post-detail-gallery">
      ${mainHtml}
      ${thumbsHtml}
    </div>
  `;
}

// サムネイルクリックでメイン画像を差し替え（src 文字列代入＝innerHTML不使用でXSS安全）
function bindGalleryThumbs() {
  const main = document.getElementById("postMainImage");
  const thumbs = document.querySelectorAll(".post-detail-thumb");
  if (!main || thumbs.length === 0) return;

  thumbs.forEach(function (thumb) {
    thumb.addEventListener("click", function () {
      const full = thumb.dataset.full;
      if (!full) return;
      main.src = full;
      thumbs.forEach(function (t) {
        t.classList.remove("is-active");
        t.setAttribute("aria-pressed", "false");
      });
      thumb.classList.add("is-active");
      thumb.setAttribute("aria-pressed", "true");
    });
  });
}

function renderSpecRow(label, value) {
  if (value === undefined || value === null || value === "") return "";

  return `
    <div class="post-spec-row">
      <dt class="post-spec-label">${escapeHtml(label)}</dt>
      <dd class="post-spec-value">${escapeHtml(value)}</dd>
    </div>
  `;
}

function renderMetaChips(post) {
  return [
    post.resolution ? `<span class="post-chip">${escapeHtml(post.resolution)}</span>` : "",
    post.usage ? `<span class="post-chip">${escapeHtml(post.usage)}</span>` : "",
    post.user ? `<span class="post-chip">by ${escapeHtml(post.user)}</span>` : "",
  ].join("");
}

function renderSpecs(post) {
  return [
    renderSpecRow("CPU", post.cpu),
    renderSpecRow("GPU", post.gpu),
    renderSpecRow("RAM", post.ram),
    renderSpecRow("解像度", post.resolution),
    renderSpecRow("用途", post.usage),
    renderSpecRow("マザーボード", post.motherboard),
    renderSpecRow("ストレージ", post.storage),
    renderSpecRow("ケース", post.case),
    renderSpecRow("電源", post.psu),
    renderSpecRow("CPUクーラー", post.cooler),
  ].join("");
}

function renderBenchmarkSection(post) {
  const rows = [
    renderSpecRow("項目", post.benchTitle),
    renderSpecRow("スコア", post.benchScore),
  ].join("");

  if (!rows) {
    return `
      <section class="post-detail-section">
        <h2>ベンチマーク</h2>
        <div class="post-detail-box">
          ベンチマーク情報は未記載です。
        </div>
      </section>
    `;
  }

  return `
    <section class="post-detail-section">
      <h2>ベンチマーク</h2>
      <dl class="post-specs">
        ${rows}
      </dl>
    </section>
  `;
}

function renderCommentSection(post) {
  if (!post.comment) {
    return "";
  }

  return `
    <section class="post-detail-section">
      <h2>コメント</h2>
      <div class="post-detail-box">
        ${escapeHtml(post.comment)}
      </div>
    </section>
  `;
}

// シッポPC相談室への控えめな導線カード（静的・外部API不使用）
function renderConsultCard() {
  return `
    <aside class="consult-card" aria-label="シッポPC相談室への案内">
      <div class="consult-card__icon" aria-hidden="true">🐾</div>
      <div class="consult-card__body">
        <h2 class="consult-card__title">この構成、買う前に不安なら</h2>
        <p class="consult-card__desc">この投稿と似たPCを買う前に、価格・用途・ゲームとの相性をチェックできます。</p>
      </div>
      <a class="btn btn-primary consult-card__btn" href="/pc-consult/">PC相談室で確認する →</a>
    </aside>
  `;
}

function renderMessageCard(title, message) {
  const container = document.querySelector("#post-detail");
  if (!container) return;

  container.innerHTML = `
    <section class="post-detail-card">
      <h1 class="post-detail-title">${escapeHtml(title)}</h1>
      <div class="post-detail-box">
        ${escapeHtml(message)}
      </div>
    </section>
  `;
}

function renderPost(post, index = 0) {
  const container = document.querySelector("#post-detail");
  if (!container) return;

  const postId = getPostId(post, index);
  const niceCount = Number(post.niceCount ?? post.nice ?? post.likes ?? 0) || 0;
  const images = getImages(post);
  const specsHtml = renderSpecs(post);
  const metaChips = renderMetaChips(post);

  // --- 初期表示に必要な「本文」だけを 1 回の innerHTML で描画 ---
  container.innerHTML = `
    <article class="post-detail-card">
      <header class="post-detail-header">
        ${post.sample === true ? `<span class="post-sample-badge">サンプル投稿</span>` : ""}
        <h1 class="post-detail-title">${escapeHtml(post.title || "無題のPC構成")}</h1>

        ${post.tagline ? `
          <p class="post-detail-tagline">${escapeHtml(post.tagline)}</p>
        ` : ""}

        <div class="post-detail-meta">
          ${metaChips}
        </div>
      </header>

      ${renderGallery(images, post.title || "PC構成画像")}

      <section class="post-detail-section">
        <div class="post-detail-section-head">
          <h2>構成スペック</h2>

          <button
            class="nice-btn"
            type="button"
            data-detail-nice-id="${escapeHtml(postId)}"
            aria-pressed="false"
            title="いいね（ログインで他の人と共有）"
          >
            <span class="nice-icon">♡</span> Nice <span class="nice-count">${niceCount}</span>
          </button>
        </div>

        <dl class="post-specs">
          ${specsHtml || `
            <div class="post-spec-row">
              <dd class="post-spec-value">スペック情報がありません</dd>
            </div>
          `}
        </dl>
      </section>
    </article>
  `;

  // Nice ボタン・ギャラリーのサムネ切替は本文描画直後に即バインド
  bindDetailNiceButton();
  refreshDetailLikeState(postId); // ログインユーザーのいいね状態を反映（非同期）
  bindGalleryThumbs();

  // --- 補足セクション（ベンチマーク / コメント）は本文表示後に遅延描画 ---
  // 初期描画を軽くするため、最初のペイント後に 1 回だけ追記する。
  const article = container.querySelector(".post-detail-card");
  if (article) {
    const deferredHtml = renderBenchmarkSection(post) + renderCommentSection(post) + renderConsultCard();
    requestAnimationFrame(() => {
      article.insertAdjacentHTML("beforeend", deferredHtml);
    });
  }
}

// 描画後にログインユーザーの「いいね済み」状態を取得してボタンへ反映
async function refreshDetailLikeState(postId) {
  const api = window.PCBuildsAPI;
  if (!api || typeof api.isSupabaseEnabled !== "function" || !api.isSupabaseEnabled()) return;
  const btn = document.querySelector("[data-detail-nice-id]");
  if (!btn) return;
  try {
    const liked = await api.hasLiked(postId);
    if (liked) {
      btn.classList.add("is-liked");
      btn.setAttribute("aria-pressed", "true");
      const icon = btn.querySelector(".nice-icon");
      if (icon) icon.textContent = "♥";
    }
  } catch (_) {
    /* 取得失敗時は未いいね表示のまま（壊さない） */
  }
}

function bindDetailNiceButton() {
  const btn = document.querySelector("[data-detail-nice-id]");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const postId = btn.dataset.detailNiceId;
    if (!postId) return;

    const api = window.PCBuildsAPI;
    if (!api || typeof api.isSupabaseEnabled !== "function" || !api.isSupabaseEnabled()) {
      showLikeHint("オンラインいいねは現在利用できません。");
      return;
    }
    if (btn.disabled) return;

    btn.disabled = true;
    try {
      const res = await api.toggleLike(postId);
      btn.classList.toggle("is-liked", res.liked);
      btn.setAttribute("aria-pressed", String(res.liked));
      const countEl = btn.querySelector(".nice-count");
      if (countEl) countEl.textContent = String(res.count);
      const iconEl = btn.querySelector(".nice-icon");
      if (iconEl) iconEl.textContent = res.liked ? "♥" : "♡";
    } catch (err) {
      const msg = String((err && err.message) || "");
      if (msg === "NOT_LOGGED_IN") {
        promptLoginForLike();
      } else if (msg === "INVALID_POST") {
        showLikeHint("この投稿にはいいねできません。");
      } else {
        showLikeHint("いいねに失敗しました。時間をおいて再度お試しください。");
      }
    } finally {
      btn.disabled = false;
    }
  });
}

// 1 件だけ取得する。api.js があれば getPostById（該当 1 件のみ取得）を使い、
// 無い場合のみ posts.json を取得して find する（重複 fetch を避ける）。
async function loadPostById(id) {
  if (
    typeof window !== "undefined" &&
    window.PCBuildsAPI &&
    typeof window.PCBuildsAPI.getPostById === "function"
  ) {
    return window.PCBuildsAPI.getPostById(id);
  }

  // フォールバック（api.js 未読み込み時のみ）
  const posts = await loadPosts();
  const target = String(id);
  return (
    posts.find((post, index) => getPostId(post, index) === target) || null
  );
}

async function runPostDetailPage() {
  try {
    const id = getPostIdFromUrl();

    if (!id) {
      renderMessageCard("構成が見つかりませんでした", "URL の id を確認してください。");
      return;
    }

    const post = await loadPostById(id);

    if (!post) {
      renderMessageCard("構成が見つかりませんでした", "URL の id を確認してください。");
      return;
    }

    renderPost(post);
  } catch (error) {
    console.error(error);
    renderMessageCard("エラーが発生しました", error?.message || "不明なエラーです。");
  }
}

document.addEventListener("DOMContentLoaded", runPostDetailPage);
