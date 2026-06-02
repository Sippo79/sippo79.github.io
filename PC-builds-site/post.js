const POSTS_JSON_PATH = "posts.json";
const NICE_STORAGE_KEY = "pcbuild_nice_v1";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function loadPosts() {
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
  if (Array.isArray(post?.images) && post.images.length > 0) {
    return post.images;
  }

  if (post?.image) {
    return [post.image];
  }

  return [];
}

function loadNiceState() {
  try {
    return JSON.parse(localStorage.getItem(NICE_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveNiceState(state) {
  localStorage.setItem(NICE_STORAGE_KEY, JSON.stringify(state));
}

function getNiceInfo(postId) {
  const state = loadNiceState();
  const current = state[postId] || { count: 0, liked: false };

  return {
    count: Number(current.count || 0),
    liked: Boolean(current.liked),
  };
}

function toggleNice(postId) {
  const state = loadNiceState();
  const current = state[postId] || { count: 0, liked: false };
  const liked = !current.liked;
  const count = Math.max(0, Number(current.count || 0) + (liked ? 1 : -1));

  state[postId] = { count, liked };
  saveNiceState(state);

  return state[postId];
}

function renderGallery(images, title) {
  if (images.length === 0) {
    return `
      <div class="post-detail-noimage">
        画像はありません
      </div>
    `;
  }

  return `
    <div class="post-detail-gallery">
      ${images.map((src, index) => `
        <div class="post-detail-image-wrap">
          <img
            src="${escapeHtml(src)}"
            alt="${escapeHtml(title)} ${index + 1}"
            class="post-detail-image"
            ${index === 0 ? 'loading="eager"' : 'loading="lazy"'}
            decoding="async"
          >
        </div>
      `).join("")}
    </div>
  `;
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
  const nice = getNiceInfo(postId);
  const images = getImages(post);
  const specsHtml = renderSpecs(post);
  const metaChips = renderMetaChips(post);
  const benchmarkSection = renderBenchmarkSection(post);
  const commentSection = renderCommentSection(post);

  container.innerHTML = `
    <article class="post-detail-card">
      <header class="post-detail-header">
        <h1 class="post-detail-title">${escapeHtml(post.title || "無題の投稿")}</h1>

        ${post.tagline ? `
          <p class="post-detail-tagline">${escapeHtml(post.tagline)}</p>
        ` : ""}

        <div class="post-detail-meta">
          ${metaChips}
        </div>
      </header>

      ${renderGallery(images, post.title || "投稿画像")}

      <section class="post-detail-section">
        <div class="post-detail-section-head">
          <h2>構成スペック</h2>

          <button
            class="nice-btn${nice.liked ? " is-liked" : ""}"
            type="button"
            data-detail-nice-id="${escapeHtml(postId)}"
            aria-pressed="${String(nice.liked)}"
          >
            👍 Nice <span class="nice-count">${nice.count}</span>
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

      ${benchmarkSection}
      ${commentSection}
    </article>
  `;

  bindDetailNiceButton();
}

function bindDetailNiceButton() {
  const btn = document.querySelector("[data-detail-nice-id]");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const postId = btn.dataset.detailNiceId;
    if (!postId) return;

    const next = toggleNice(postId);

    btn.classList.toggle("is-liked", next.liked);
    btn.setAttribute("aria-pressed", String(next.liked));

    const countEl = btn.querySelector(".nice-count");
    if (countEl) {
      countEl.textContent = String(next.count);
    }
  });
}

async function runPostDetailPage() {
  try {
    const id = getPostIdFromUrl();

    if (!id) {
      renderMessageCard("投稿が見つかりませんでした", "URL の id を確認してください。");
      return;
    }

    const posts = await loadPosts();

    const foundIndex = posts.findIndex((post, index) => {
      return getPostId(post, index) === String(id);
    });

    if (foundIndex === -1) {
      renderMessageCard("投稿が見つかりませんでした", "URL の id を確認してください。");
      return;
    }

    renderPost(posts[foundIndex], foundIndex);
  } catch (error) {
    console.error(error);
    renderMessageCard("エラーが発生しました", error?.message || "不明なエラーです。");
  }
}

document.addEventListener("DOMContentLoaded", runPostDetailPage);