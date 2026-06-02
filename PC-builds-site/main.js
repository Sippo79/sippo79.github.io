const PER_PAGE = 6;
const NICE_STORAGE_KEY = "pcbuild_nice_v1";

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
  const res = await fetch("posts.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`posts.json load failed: ${res.status}`);
  return await res.json();
}

function getPostImage(post) {
  const image = String(post.image || "");
  return image.replace(/images\/test(\d+)/i, "images/Test$1");
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
      const aNice = getNiceInfo(String(a.id ?? "")).count;
      const bNice = getNiceInfo(String(b.id ?? "")).count;
      return bNice - aNice;
    });
    return copied;
  }

  copied.sort((a, b) => {
    const aNum = Number(a.id.replace("post-", ""));
    const bNum = Number(b.id.replace("post-", ""));
    return bNum - aNum;
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
//  Nice / likes
// =====================

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
  return state[postId] || { count: 0, liked: false };
}

function toggleNice(postId) {
  const state = loadNiceState();
  const current = state[postId] || { count: 0, liked: false };
  const liked = !current.liked;
  const count = Math.max(0, current.count + (liked ? 1 : -1));

  state[postId] = { count, liked };
  saveNiceState(state);

  return state[postId];
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

  const niceCount = getNiceInfo(String(post.id ?? "")).count;
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
  const nice      = getNiceInfo(postId);
  const niceCount = nice.count || Number(post.nice || post.likes || 0) || 0;
  const badge     = getPostBadge(post);
  const rawTags   = Array.isArray(post.tags) ? post.tags : [];
  const tags      = rawTags.map((t) => String(t).replace(/^#/, ""));
  const usageClass = getUsageClass(post.usage);
  const resClass   = getResClass(post.resolution);

  const badgeHTML = badge ? `
    <div class="card-image-badges">
      <span class="card-badge badge-${escapeHtml(badge.type)}">${badge.icon} ${escapeHtml(badge.label)}</span>
    </div>` : "";

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
        ${badgeHTML}
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
          class="nice-btn${nice.liked ? " is-liked" : ""}"
          type="button"
          data-nice-id="${escapeHtml(postId)}"
          aria-pressed="${nice.liked ? "true" : "false"}"
        ><span class="nice-icon">${nice.liked ? "♥" : "♡"}</span><span class="nice-count">${niceCount}</span></button>
      </div>
    </article>`;
}

function renderCards(gridEl, items) {
  gridEl.innerHTML = items.map(buildCardHTML).join("");
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
}

// =====================
//  Index page
// =====================

async function runIndexPage() {
  const latestEl = document.getElementById("latestPosts");
  if (!latestEl) return;

  try {
    if (ALL_POSTS.length === 0) {
      ALL_POSTS = await loadPosts();
    }

    const latest = sortPosts(ALL_POSTS, "new").slice(0, 6);
    renderLatestCards(latestEl, latest);
  } catch (error) {
    console.error(error);
    latestEl.innerHTML = `
      <div class="empty-state">
        PC構成を読み込めませんでした。posts.json を確認してください。
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
    gridEl.innerHTML = `<div class="empty-state">条件に一致する投稿が見つかりませんでした。</div>`;
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
  // Nice button
  const niceBtn = e.target.closest(".nice-btn");
  if (niceBtn) {
    const postId = niceBtn.dataset.niceId;
    if (!postId) return;

    const next = toggleNice(postId);
    niceBtn.classList.toggle("is-liked", next.liked);
    niceBtn.setAttribute("aria-pressed", String(next.liked));

    const countEl = niceBtn.querySelector(".nice-count");
    if (countEl) countEl.textContent = String(next.count);

    const iconEl = niceBtn.querySelector(".nice-icon");
    if (iconEl) iconEl.textContent = next.liked ? "♥" : "♡";
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
