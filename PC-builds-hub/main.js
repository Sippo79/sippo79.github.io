const PER_PAGE = 6;

// =====================
//  Tag system
// =====================

// タグ名 → URL slug（SEO用・タグ別ページ準備）
const TAG_SLUGS = {
  AMD: "amd", Intel: "intel",
  Corsair: "corsair", NZXT: "nzxt", "Lian Li": "lian-li",
  Fractal: "fractal", "be quiet!": "be-quiet",
  "白PC": "white-pc", RGB: "rgb", "ガラスケース": "glass-case",
  "映え": "aesthetic",
  "水冷": "water-cooling", "空冷": "air-cooling",
  "ゲーミング": "gaming", "配信": "streaming", "配信向け": "streaming",
  "クリエイター": "creator", "クリエイティブ": "creative",
  "静音": "silent", "コスパ": "budget", "バランス": "balanced",
  "ハイエンド": "high-end", "ハイパフォーマンス": "high-performance",
  "4K": "4k", FHD: "fhd", DDR5: "ddr5",
};

// タグ名 → CSSカラークラス
const TAG_COLORS = {
  AMD: "tag-amd",
  Intel: "tag-intel",
  Corsair: "tag-corsair",
  NZXT: "tag-nzxt",
  "Lian Li": "tag-brand",
  Fractal: "tag-brand",
  "be quiet!": "tag-brand",
  "白PC": "tag-white",
  RGB: "tag-rgb",
  "映え": "tag-rgb",
  "水冷": "tag-water",
};

let ALL_POSTS = [];

// =====================
//  Utilities
// =====================

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// タグ名（#あり/なし両対応）→ slug
function tagToSlug(tag) {
  const clean = String(tag).replace(/^#/, "");
  return TAG_SLUGS[clean] ?? clean.toLowerCase().replace(/[^\w぀-鿿゠-ヿ一-鿿]/g, "-");
}

// slug → タグ名（逆引き）
function slugToTag(slug) {
  const entry = Object.entries(TAG_SLUGS).find(([, s]) => s === slug);
  return entry ? entry[0] : slug;
}

function getTagColorClass(tag) {
  const clean = String(tag).replace(/^#/, "");
  return TAG_COLORS[clean] ?? "";
}

function toggleTag(slug, currentTags) {
  return currentTags.includes(slug)
    ? currentTags.filter((t) => t !== slug)
    : [...currentTags, slug];
}

// =====================
//  Data loading
// =====================

async function loadPosts() {
  // データ取得は api.js (PCBuildsAPI) に集約。
  // Supabase 設定があれば DB から、なければ posts.json から取得される。
  if (global_PCBuildsAPI()) {
    return window.PCBuildsAPI.loadPosts();
  }
  // フォールバック（api.js 未読み込み時）
  const res = await fetch("posts.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`posts.json load failed: ${res.status}`);
  return await res.json();
}

function global_PCBuildsAPI() {
  return typeof window !== "undefined" &&
    window.PCBuildsAPI &&
    typeof window.PCBuildsAPI.loadPosts === "function";
}

function global_ShowcaseAPI() {
  return typeof window !== "undefined" &&
    window.PCBuildsAPI &&
    typeof window.PCBuildsAPI.getShowcasePost === "function";
}

function getPostImage(post) {
  // 一覧カードは「1枚目（メイン）」のみ。
  let image = normalizePostImages(post)[0] || "";
  if (!image) return "images/no-image.svg"; // 画像なし投稿のフォールバック
  return image.replace(/images\/test(\d+)/i, "images/Test$1");
}

function normalizePostImages(post) {
  if (!post) return [];
  let list = [];
  if (Array.isArray(post.image_urls) && post.image_urls.length > 0) {
    list = post.image_urls;
  } else if (Array.isArray(post.images) && post.images.length > 0) {
    list = post.images;
  } else if (post.image_url) {
    list = [post.image_url];
  } else if (post.image) {
    list = [post.image];
  }
  return Array.from(new Set(
    list.map((value) => String(value || "").trim()).filter(Boolean)
  )).slice(0, 5);
}

function getPostTarget(post) {
  const parts = [post.resolution, post.usage]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "-";
}

// =====================
//  URL params
// =====================

function getParams() {
  const sp = new URLSearchParams(location.search);
  const page = Number(sp.get("page") || "1");
  const tagParam = sp.get("tag") || "";
  const tags = tagParam ? tagParam.split(",").filter(Boolean) : [];

  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    res: sp.get("res") || "all",
    use: sp.get("use") || "all",
    sort: sp.get("sort") || "new",
    tags,
  };
}

function setParams(next) {
  const current = getParams();
  const merged = { ...current, ...next };

  const sp = new URLSearchParams();
  sp.set("page", String(merged.page || 1));
  if (merged.res && merged.res !== "all") sp.set("res", merged.res);
  if (merged.use && merged.use !== "all") sp.set("use", merged.use);
  if (merged.sort && merged.sort !== "new") sp.set("sort", merged.sort);
  if (merged.tags && merged.tags.length > 0) sp.set("tag", merged.tags.join(","));

  history.pushState(null, "", `all-posts.html?${sp.toString()}`);
}

// =====================
//  Filtering & sorting
// =====================

function applyFilters(posts, params) {
  return posts.filter((post) => {
    const okRes = params.res === "all" || post.resolution === params.res;
    const okUse = params.use === "all" || post.usage === params.use;
    const okTag =
      !params.tags || params.tags.length === 0 ||
      (Array.isArray(post.tags) &&
        params.tags.some((slug) =>
          post.tags.some((t) => tagToSlug(t) === slug)
        ));
    return okRes && okUse && okTag;
  });
}

function applySearch(posts, query) {
  if (!query.trim()) return posts;
  const q = query.toLowerCase();
  return posts.filter(
    (post) =>
      (post.title || "").toLowerCase().includes(q) ||
      (post.cpu || "").toLowerCase().includes(q) ||
      (post.gpu || "").toLowerCase().includes(q) ||
      (post.user || "").toLowerCase().includes(q) ||
      (Array.isArray(post.tags) && post.tags.some((t) => t.toLowerCase().includes(q)))
  );
}

function getBenchValue(post) {
  if (typeof post.benchScore === "number") return post.benchScore;
  const num = Number(String(post.bench).replace(/[^\d.]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function sortPosts(posts, sortType) {
  const copied = [...posts];

  if (sortType === "nice") {
    copied.sort((a, b) => {
      const aNice = Number(a.niceCount ?? a.nice ?? a.likes ?? 0) || 0;
      const bNice = Number(b.niceCount ?? b.nice ?? b.likes ?? 0) || 0;
      return bNice - aNice;
    });
    return copied;
  }

  // 新着順：created_at（DB投稿）優先。無ければ post-NNN の連番で。
  copied.sort((a, b) => {
    const at = a.created_at ? Date.parse(a.created_at) : NaN;
    const bt = b.created_at ? Date.parse(b.created_at) : NaN;
    if (!Number.isNaN(at) && !Number.isNaN(bt)) return bt - at;

    const aNum = Number(String(a.id ?? "").replace(/\D/g, ""));
    const bNum = Number(String(b.id ?? "").replace(/\D/g, ""));
    if (Number.isFinite(aNum) && Number.isFinite(bNum) && (aNum || bNum)) {
      return bNum - aNum;
    }
    return 0;
  });

  return copied;
}

function paginate(items, page, perPage) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * perPage;

  return {
    total,
    totalPages,
    page: safePage,
    items: items.slice(start, start + perPage),
  };
}

// =====================
//  Nice / likes（Supabase でオンライン共有）
//  ・カウントは posts.nice_count（DBトリガーが集計）を表示。
//  ・「いいね済み」はログインユーザーの likes 行から取得して見た目に反映。
//  ・未ログイン時はログインを促す。localStorage は使用しない。
// =====================

// レンダリング済みカードの .nice-btn に、現在ユーザーのいいね状態を反映。
async function markLikedButtons(root) {
  const api = window.PCBuildsAPI;
  if (!api || typeof api.isSupabaseEnabled !== "function" || !api.isSupabaseEnabled()) return;

  const scope = root || document;
  const btns = Array.prototype.slice.call(scope.querySelectorAll(".nice-btn[data-nice-id]"));
  if (btns.length === 0) return;

  const ids = btns.map((b) => b.dataset.niceId);
  let likedSet;
  try {
    likedSet = await api.getMyLikedPostIds(ids);
  } catch (_) {
    return;
  }
  btns.forEach((b) => {
    if (likedSet.has(String(b.dataset.niceId))) {
      b.classList.add("is-liked");
      b.setAttribute("aria-pressed", "true");
      const icon = b.querySelector(".nice-icon");
      if (icon) icon.textContent = "♥";
    }
  });
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

// いいねボタン押下（オンライン共有）
async function handleLikeClick(btn) {
  const postId = btn.dataset.niceId;
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
}

// =====================
//  Popular tags
// =====================

function getTopTags(posts, n = 14) {
  const counts = {};
  posts.forEach((post) => {
    if (!Array.isArray(post.tags)) return;
    post.tags.forEach((tag) => {
      const clean = String(tag).replace(/^#/, "");
      counts[clean] = (counts[clean] || 0) + 1;
    });
  });
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([tag, count]) => ({ tag, count, slug: tagToSlug(tag) }));
}

function renderPopularTags(el, posts, activeTags) {
  if (!el || !posts.length) return;
  const topTags = getTopTags(posts, 14);

  el.innerHTML = topTags
    .map(({ tag, count, slug }) => {
      const isActive = activeTags.includes(slug);
      const colorClass = getTagColorClass(tag);
      return `<button
        class="pop-tag${isActive ? " active" : ""}${colorClass ? ` ${colorClass}` : ""}"
        type="button"
        data-tag-slug="${escapeHtml(slug)}"
        aria-pressed="${isActive}"
      >#${escapeHtml(tag)} <span class="pop-tag-count">${count}</span></button>`;
    })
    .join("");
}

// =====================
//  Card helpers
// =====================

function getPostBadge(post) {
  const badge = String(post.badge || "");
  const map = {
    "人気":       { icon: "🔥", label: "人気",       type: "popular"  },
    "注目":       { icon: "⭐", label: "注目",       type: "featured" },
    "ハイエンド": { icon: "👑", label: "ハイエンド", type: "highend"  },
    "編集部Pick": { icon: "🎯", label: "編集部Pick", type: "pick"     },
  };
  if (map[badge]) return map[badge];

  const niceCount = Number(post.niceCount ?? post.nice ?? post.likes ?? 0) || 0;
  if (niceCount >= 5) return { icon: "🔥", label: "人気", type: "popular" };

  return null;
}

function getUsageClass(usage) {
  const map = {
    "ゲーム":       "usage-game",
    "配信":         "usage-stream",
    "クリエイティブ": "usage-creative",
    "白PC・光るPC": "usage-rgb",
  };
  return map[usage] || "usage-default";
}

function getResClass(res) {
  const map = { "FHD": "res-fhd", "1440p": "res-1440p", "4K": "res-4k" };
  return map[res] || "res-default";
}

function buildCardHTML(post, index) {
  const postId    = String(post.id ?? post.slug ?? post.title ?? index);
  const niceCount = Number(post.niceCount ?? post.nice ?? post.likes ?? 0) || 0;
  const badge     = getPostBadge(post);
  const rawTags   = Array.isArray(post.tags) ? post.tags : [];
  const tags      = rawTags.map((t) => String(t).replace(/^#/, ""));
  const usageClass = getUsageClass(post.usage);
  const resClass   = getResClass(post.resolution);
  const imageCount = normalizePostImages(post).length;
  const imageCountHTML = imageCount > 1 ? `
    <span class="card-image-count">+${escapeHtml(imageCount - 1)}</span>` : "";

  const badgeHTML = badge ? `
    <div class="card-image-badges">
      <span class="card-badge badge-${escapeHtml(badge.type)}">${badge.icon} ${escapeHtml(badge.label)}</span>
    </div>` : "";

  // sample: true は posts.json フォールバック専用フラグ（Supabase 投稿には付かない）
  const sampleHTML = post.sample === true ? `
    <span class="card-sample-badge">サンプル投稿</span>` : "";

  const resHTML = post.resolution ? `
    <span class="card-res-badge ${escapeHtml(resClass)}">${escapeHtml(post.resolution)}</span>` : "";

  const MAX_VISIBLE = 4;
  const visibleTags = tags.slice(0, MAX_VISIBLE);
  const extraCount  = tags.length - MAX_VISIBLE;

  const tagsHTML = tags.length > 0 ? `
    <div class="card-tags-strip">
      ${visibleTags.map((t) => {
        const colorClass = getTagColorClass(t);
        return `<span class="card-tag${colorClass ? ` ${colorClass}` : ""}">#${escapeHtml(t)}</span>`;
      }).join("")}
      ${extraCount > 0 ? `<span class="card-tag-more">+${extraCount}</span>` : ""}
    </div>` : "";

  const usageHTML = post.usage ? `
    <span class="usage-badge ${escapeHtml(usageClass)}">${escapeHtml(post.usage)}</span>` : "";

  return `
    <article class="card" data-post-id="${escapeHtml(postId)}" tabindex="0">
      <div class="card-image">
        <img
          src="${escapeHtml(getPostImage(post))}"
          alt="${escapeHtml(post.title)}"
          loading="lazy"
          decoding="async"
        >
        <div class="card-hover-overlay">
          <span class="card-hover-cta">詳細を見る →</span>
        </div>
        ${sampleHTML}
        ${badgeHTML}
        ${imageCountHTML}
        ${resHTML}
      </div>

      ${tagsHTML}

      <div class="card-content">
        <h3 class="card-title">${escapeHtml(post.title || "無題のPC構成")}</h3>
        <p class="card-user">by ${escapeHtml(post.user || "unknown")}</p>

        <div class="spec-gpu-feature">
          <span class="spec-gpu-label">GPU</span>
          <span class="spec-gpu-val">${escapeHtml(post.gpu || "-")}</span>
        </div>

        <div class="spec-mini-grid">
          <div class="spec-mini-item">
            <span class="spec-mini-label">CPU</span>
            <span class="spec-mini-val">${escapeHtml(post.cpu || "-")}</span>
          </div>
          <div class="spec-mini-item">
            <span class="spec-mini-label">RAM</span>
            <span class="spec-mini-val">${escapeHtml(post.ram || "-")}</span>
          </div>
        </div>

        <div class="card-meta-tags">
          ${usageHTML}
        </div>
      </div>

      <div class="card-actions">
        <a href="post.html?id=${encodeURIComponent(postId)}" class="detail-link">詳細を見る</a>
        <button
          class="nice-btn"
          type="button"
          data-nice-id="${escapeHtml(postId)}"
          aria-pressed="false"
          title="いいね（ログインで他の人と共有）"
        ><span class="nice-icon">♡</span><span class="nice-count">${niceCount}</span></button>
      </div>
    </article>`;
}

function renderCards(gridEl, items) {
  gridEl.innerHTML = items.map(buildCardHTML).join("");
  markLikedButtons(gridEl); // ログインユーザーのいいね状態を反映（非同期・任意）
}

function renderLatestCards(gridEl, items) {
  if (!gridEl) return;

  if (items.length === 0) {
    gridEl.innerHTML = `
      <div class="empty-state">
        まだ表示できるPC構成がありません。
      </div>`;
    return;
  }

  gridEl.innerHTML = items.map(buildCardHTML).join("");
  markLikedButtons(gridEl); // 同上
}

// =====================
//  Index page
// =====================

function buildShowcaseSpec(label, value) {
  return `
    <div class="hero-spec">
      <div class="hero-spec-label">${escapeHtml(label)}</div>
      <div class="hero-spec-value">${escapeHtml(value || "-")}</div>
    </div>`;
}

function renderShowcasePost(post) {
  const card = document.querySelector(".index-page .hero-card");
  if (!card || !post) return;

  const postId = String(post.id || "");
  const image = getPostImage(post);
  const niceCount = Number(post.niceCount || 0);
  const author = post.user ? `<p class="hero-card-user">by ${escapeHtml(post.user)}</p>` : "";
  const detailLink = postId
    ? `<a class="detail-link showcase-detail-link" href="post.html?id=${encodeURIComponent(postId)}">詳細を見る</a>`
    : "";

  if (postId) {
    card.dataset.showcasePostId = postId;
    card.tabIndex = 0;
    card.setAttribute("role", "link");
    card.setAttribute("aria-label", `${post.title || "Featured Build"} の詳細を見る`);
  }

  card.innerHTML = `
    <div class="hero-card-glow"></div>
    <div class="hero-card-content">
      <div class="hero-card-heading">
        <p class="hero-card-title">Featured Build</p>
        <span class="hero-card-badge">Showcase</span>
      </div>
      <div class="hero-card-title-row">
        <h2 class="hero-card-main">${escapeHtml(post.title || "Featured Build")}</h2>
        ${author}
      </div>
      <div class="hero-specs">
        ${buildShowcaseSpec("CPU", post.cpu)}
        ${buildShowcaseSpec("GPU", post.gpu)}
        ${buildShowcaseSpec("RAM", post.ram)}
        ${buildShowcaseSpec("Target", getPostTarget(post))}
      </div>
      <div class="hero-card-meta">
        <span class="hero-card-nice">Nice ${escapeHtml(niceCount)}</span>
        ${detailLink}
      </div>
    </div>
    <div class="hero-card-image">
      <img src="${escapeHtml(image)}" alt="${escapeHtml(post.title || "Featured Build")}" onerror="this.onerror=null;this.src='images/no-image.svg';" />
    </div>`;
}

async function renderDynamicShowcase() {
  if (!global_ShowcaseAPI()) return;

  try {
    const post = await window.PCBuildsAPI.getShowcasePost();
    if (post) renderShowcasePost(post);
  } catch (_) {
    // Keep the static showcase as the fallback.
  }
}

async function runIndexPage() {
  const latestEl = document.getElementById("latestPosts");
  if (!latestEl) return;

  try {
    renderDynamicShowcase();

    if (ALL_POSTS.length === 0) {
      ALL_POSTS = await loadPosts();
    }

    const latest = sortPosts(ALL_POSTS, "new").slice(0, 6);
    renderLatestCards(latestEl, latest);
  } catch (error) {
    console.error(error);
    latestEl.innerHTML = `
      <div class="empty-state">
        PC構成を読み込めませんでした。時間をおいて再度お試しください。
      </div>`;
  }
}

// =====================
//  All-posts page
// =====================

function renderPager(pagerEl, page, totalPages, params) {
  const createLink = (label, target, active = false, disabled = false) => {
    const a = document.createElement("a");
    a.className = `page-btn${active ? " active" : ""}`;
    a.textContent = label;

    if (disabled) {
      a.href = "#";
      a.style.opacity = "0.4";
      a.style.pointerEvents = "none";
      return a;
    }

    const sp = new URLSearchParams();
    sp.set("page", String(target));
    if (params.res !== "all") sp.set("res", params.res);
    if (params.use !== "all") sp.set("use", params.use);
    if (params.sort !== "new") sp.set("sort", params.sort);
    if (params.tags && params.tags.length > 0) sp.set("tag", params.tags.join(","));
    a.href = `all-posts.html?${sp.toString()}`;

    return a;
  };

  pagerEl.innerHTML = "";
  pagerEl.appendChild(createLink("«", page - 1, false, page === 1));

  for (let i = 1; i <= totalPages; i += 1) {
    pagerEl.appendChild(createLink(String(i), i, i === page));
  }

  pagerEl.appendChild(createLink("»", page + 1, false, page === totalPages));
}

function updateActiveChips(params) {
  document.querySelectorAll("[data-res]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.res === params.res);
  });

  document.querySelectorAll("[data-use]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.use === params.use);
  });

  document.querySelectorAll("[data-tag-slug]").forEach((btn) => {
    const isActive = params.tags.includes(btn.dataset.tagSlug);
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", String(isActive));
  });
}

async function runAllPostsPage() {
  const gridEl  = document.getElementById("postsGrid");
  const pagerEl = document.getElementById("pagination");
  const tagsEl  = document.getElementById("popularTagsList");
  if (!gridEl || !pagerEl) return;

  if (ALL_POSTS.length === 0) {
    ALL_POSTS = await loadPosts();
  }

  const params  = getParams();
  const searchEl = document.getElementById("searchBox");
  const query   = searchEl ? searchEl.value.trim() : "";

  let filtered = applyFilters(ALL_POSTS, params);
  if (query) filtered = applySearch(filtered, query);

  const sorted   = sortPosts(filtered, params.sort);
  const pageData = paginate(sorted, params.page, PER_PAGE);

  if (pageData.page !== params.page) {
    setParams({ page: pageData.page });
  }

  renderPopularTags(tagsEl, ALL_POSTS, params.tags);

  if (pageData.items.length === 0) {
    gridEl.innerHTML = `<div class="empty-state">条件に一致する構成が見つかりませんでした。</div>`;
  } else {
    renderCards(gridEl, pageData.items);
  }

  renderPager(pagerEl, pageData.page, pageData.totalPages, params);
  updateActiveChips(params);

  const sortSelect = document.getElementById("sortSelect");
  if (sortSelect) sortSelect.value = params.sort;
}

// =====================
//  Event handlers
// =====================

document.addEventListener("change", (e) => {
  const sortSelect = e.target.closest("#sortSelect");
  if (!sortSelect) return;
  setParams({ page: 1, sort: sortSelect.value });
  runAllPostsPage();
});

document.addEventListener("input", (e) => {
  if (e.target.closest("#searchBox")) {
    runAllPostsPage();
  }
});

document.addEventListener("click", (e) => {
  // Nice button（オンライン共有：Supabase）
  const niceBtn = e.target.closest(".nice-btn");
  if (niceBtn) {
    handleLikeClick(niceBtn);
    return;
  }

  // Popular tag filter
  const tagBtn = e.target.closest("[data-tag-slug]");
  if (tagBtn) {
    const slug = tagBtn.dataset.tagSlug;
    if (!slug) return;
    const params = getParams();
    const newTags = toggleTag(slug, params.tags);
    setParams({ page: 1, tags: newTags });
    runAllPostsPage();
    return;
  }

  // Reset all filters
  const resetBtn = e.target.closest("#resetFilters");
  if (resetBtn) {
    const searchBox = document.getElementById("searchBox");
    if (searchBox) searchBox.value = "";
    setParams({ page: 1, res: "all", use: "all", tags: [] });
    runAllPostsPage();
    return;
  }

  // Resolution filter
  const resBtn = e.target.closest("[data-res]");
  if (resBtn) {
    setParams({ page: 1, res: resBtn.dataset.res });
    runAllPostsPage();
    return;
  }

  // Usage filter
  const useBtn = e.target.closest("[data-use]");
  if (useBtn) {
    setParams({ page: 1, use: useBtn.dataset.use });
    runAllPostsPage();
    return;
  }

  // Detail link — let browser handle
  const detailLink = e.target.closest(".detail-link");
  if (detailLink) return;

  const showcaseCard = e.target.closest(".hero-card[data-showcase-post-id]");
  if (showcaseCard) {
    const postId = showcaseCard.dataset.showcasePostId;
    if (postId) {
      window.location.href = `post.html?id=${encodeURIComponent(postId)}`;
    }
    return;
  }

  // Card click → detail
  const card = e.target.closest(".card");
  if (card) {
    const postId = card.dataset.postId;
    if (postId) {
      window.location.href = `post.html?id=${encodeURIComponent(postId)}`;
    }
  }
});

document.addEventListener("keydown", (e) => {
  const showcaseCard = e.target.closest(".hero-card[data-showcase-post-id]");
  if (showcaseCard && (e.key === "Enter" || e.key === " ")) {
    const postId = showcaseCard.dataset.showcasePostId;
    if (postId) {
      e.preventDefault();
      window.location.href = `post.html?id=${encodeURIComponent(postId)}`;
    }
    return;
  }

  const card = e.target.closest(".card[tabindex='0']");
  if (!card || (e.key !== "Enter" && e.key !== " ")) return;

  const postId = card.dataset.postId;
  if (!postId) return;

  e.preventDefault();
  window.location.href = `post.html?id=${encodeURIComponent(postId)}`;
});

window.addEventListener("popstate", runAllPostsPage);

document.addEventListener("DOMContentLoaded", () => {
  runIndexPage();
  runAllPostsPage();
});
