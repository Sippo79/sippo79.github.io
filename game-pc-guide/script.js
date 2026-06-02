// Filter state
let currentFilter = 'all';

function getGameFilterTags(game) {
  const tags = ['all'];
  if (game.popular) tags.push('popular');
  if (game.genre === 'FPS' || game.genre === 'MOBA') tags.push('fps');
  if (game.level && (game.level.includes('重め') || game.level.includes('超重い'))) tags.push('heavy');
  return tags;
}

function renderFilterButtons() {
  const filterArea = document.getElementById('gameFilter');
  if (!filterArea) return;

  const filters = [
    { key: 'all', label: '全て' },
    { key: 'popular', label: '人気' },
    { key: 'fps', label: 'FPS' },
    { key: 'heavy', label: '重量級' },
  ];

  filterArea.innerHTML = filters.map(f => `
    <button class="filter-btn${currentFilter === f.key ? ' active' : ''}" data-filter="${f.key}">
      ${f.label}
    </button>
  `).join('');

  filterArea.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      renderFilterButtons();
      const keyword = gameSearchInput ? gameSearchInput.value.trim().toLowerCase() : '';
      renderGames(applyFilters(allGames, currentFilter, keyword));
    });
  });
}

function applyFilters(games, filter, keyword) {
  return games.filter(game => {
    const tags = getGameFilterTags(game);
    const matchFilter = tags.includes(filter);
    const matchKeyword = !keyword || (
      game.title.toLowerCase().includes(keyword) ||
      game.genre.toLowerCase().includes(keyword) ||
      game.level.toLowerCase().includes(keyword) ||
      game.description.toLowerCase().includes(keyword)
    );
    return matchFilter && matchKeyword;
  });
}

const affiliateLinks = {
  bto: "",
  amazonParts: "",
  rakutenParts: "",
  monitor: "",
  mouse: ""
};

window.affiliateLinks = affiliateLinks;

const gameGrid = document.getElementById("gameGrid");
const gameSearchInput = document.getElementById("gameSearchInput");

let allGames = [];

function createAffiliateSection() {
  const links = [
    {
      key: "bto",
      label: "\u3053\u306e\u30b2\u30fc\u30e0\u5411\u3051BTO\u30d1\u30bd\u30b3\u30f3\u3092\u63a2\u3059",
      description: "\u63a8\u5968\u30b9\u30da\u30c3\u30af\u306b\u8fd1\u3044\u5b8c\u6210\u54c1PC\u3092\u30c1\u30a7\u30c3\u30af"
    },
    {
      key: "amazonParts",
      label: "Amazon\u3067PC\u30d1\u30fc\u30c4\u3092\u898b\u308b",
      description: "CPU\u30fbGPU\u30fb\u30e1\u30e2\u30ea\u306a\u3069\u3092\u307e\u3068\u3081\u3066\u63a2\u3059"
    },
    {
      key: "rakutenParts",
      label: "\u697d\u5929\u3067PC\u30d1\u30fc\u30c4\u3092\u898b\u308b",
      description: "\u30dd\u30a4\u30f3\u30c8\u9084\u5143\u3082\u898b\u306a\u304c\u3089\u30d1\u30fc\u30c4\u3092\u6bd4\u8f03"
    },
    {
      key: "monitor",
      label: "\u30b2\u30fc\u30df\u30f3\u30b0\u30e2\u30cb\u30bf\u30fc\u3092\u898b\u308b",
      description: "144Hz\u4ee5\u4e0a\u3084WQHD\u74b0\u5883\u3092\u6574\u3048\u305f\u3044\u4eba\u5411\u3051"
    },
    {
      key: "mouse",
      label: "\u30b2\u30fc\u30df\u30f3\u30b0\u30de\u30a6\u30b9\u3092\u898b\u308b",
      description: "FPS\u3084\u9577\u6642\u9593\u30d7\u30ec\u30a4\u306e\u64cd\u4f5c\u611f\u3092\u6539\u5584"
    }
  ];

  const hasActiveAffiliateLink = links.some(link => Boolean(affiliateLinks[link.key]));

  if (!hasActiveAffiliateLink) return '';

  function renderAffiliateButton(link) {
    const affiliateUrl = affiliateLinks[link.key];

    if (!affiliateUrl) {
      return `
          <span
            class="affiliate-button affiliate-button-${link.key} affiliate-button-disabled"
            aria-disabled="true"
          >
            <span>${link.label}</span>
            <small>ショップ連携準備中</small>
            <em>近日対応予定</em>
          </span>
      `;
    }

    return `
          <a
            class="affiliate-button affiliate-button-${link.key}"
            href="${affiliateUrl}"
            target="_blank"
            rel="nofollow sponsored noopener noreferrer"
          >
            <span>${link.label}</span>
            <small>${link.description}</small>
          </a>
    `;
  }

  return `
    <section class="affiliate-section" aria-labelledby="affiliateTitle">
      <div class="affiliate-heading">
        <p class="section-label">SHOP LINKS</p>
        <h2 id="affiliateTitle">${hasActiveAffiliateLink ? "\u304a\u3059\u3059\u3081\u8cfc\u5165\u5148" : "\u30b7\u30e7\u30c3\u30d7\u9023\u643a\u6e96\u5099\u4e2d"}</h2>
        <p>${hasActiveAffiliateLink ? "\u5fc5\u8981\u306a\u30b9\u30da\u30c3\u30af\u3084\u5468\u8fba\u6a5f\u5668\u3092\u3001\u6c17\u306b\u306a\u3063\u305f\u30bf\u30a4\u30df\u30f3\u30b0\u3067\u8efd\u304f\u78ba\u8a8d\u3067\u304d\u307e\u3059\u3002" : "\u73fe\u5728\u3001\u8ca9\u58f2\u30b5\u30a4\u30c8\u3078\u306e\u30ea\u30f3\u30af\u3092\u6e96\u5099\u3057\u3066\u3044\u307e\u3059\u3002\u516c\u958b\u5f8c\u306f\u3053\u306e\u30a8\u30ea\u30a2\u304b\u3089\u78ba\u8a8d\u3067\u304d\u307e\u3059\u3002"}</p>
      </div>

      <div class="affiliate-link-grid">
        ${links.map(renderAffiliateButton).join("")}
      </div>

      <p class="affiliate-disclosure${hasActiveAffiliateLink ? "" : " affiliate-disclosure-hidden"}">
        \u5f53\u30b5\u30a4\u30c8\u3067\u306f\u30a2\u30d5\u30a3\u30ea\u30a8\u30a4\u30c8\u5e83\u544a\u3092\u5229\u7528\u3057\u3066\u3044\u307e\u3059\u3002\u30ea\u30f3\u30af\u5148\u3067\u5546\u54c1\u3092\u8cfc\u5165\u3059\u308b\u3068\u3001\u904b\u55b6\u8005\u306b\u53ce\u76ca\u304c\u767a\u751f\u3059\u308b\u5834\u5408\u304c\u3042\u308a\u307e\u3059\u3002
        Amazon\u306e\u30a2\u30bd\u30b7\u30a8\u30a4\u30c8\u3068\u3057\u3066\u3001\u5f53\u30b5\u30a4\u30c8\u306f\u9069\u683c\u8ca9\u58f2\u306b\u3088\u308a\u53ce\u5165\u3092\u5f97\u3066\u3044\u307e\u3059\u3002
      </p>
    </section>
  `;
}

window.createAffiliateSection = createAffiliateSection;

function renderAffiliateSection(targetId) {
  const target = document.getElementById(targetId);

  if (target) {
    target.innerHTML = createAffiliateSection();
  }
}

window.renderAffiliateSection = renderAffiliateSection;

function showSkeletonCards(count = 6) {
  const skeletons = Array.from({ length: count }, () => `
    <div class="skeleton-card">
      <div class="skeleton-thumb"></div>
      <div class="skeleton-body">
        <div class="skeleton-line short"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line mid"></div>
        <div class="skeleton-line short"></div>
      </div>
    </div>
  `).join('');
  gameGrid.innerHTML = skeletons;
}

async function loadGames() {
  showSkeletonCards();

  try {
    const response = await fetch("./data/games.json");
    const games = await response.json();

    allGames = games;
    renderFilterButtons();
    renderGames(allGames);
  } catch (error) {
    console.error("Failed to load games.json", error);

    gameGrid.innerHTML = `
      <p style="color:#ff8080;">
        \u30b2\u30fc\u30e0\u30c7\u30fc\u30bf\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002
      </p>
    `;
  }
}

function renderGames(games) {
  if (games.length === 0) {
    gameGrid.innerHTML = `
      <p class="empty-message">
        \u8a72\u5f53\u3059\u308b\u30b2\u30fc\u30e0\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002
      </p>
    `;
    return;
  }

  const staticPagePaths = {
    mhwilds: "games/monster-hunter.html"
  };

  gameGrid.innerHTML = games.map(game => `
    <a href="${staticPagePaths[game.id] || `games/${game.id}.html`}" class="game-card">
      <div class="game-thumb">
        ${game.image
          ? `
            <img
              src="${game.image}"
              alt="${game.title}"
              loading="lazy"
              decoding="async"
              onerror="this.parentElement.innerHTML='<div class=&quot;game-thumb-placeholder&quot;><span>${game.genre}</span></div>'"
            >
          `
          : `
            <div class="game-thumb-placeholder">
              <span>${game.genre}</span>
            </div>
          `
        }
      </div>

      <div class="game-card-body">
        ${game.popular ? '<p class="game-popular-badge">\u4eba\u6c17</p>' : ''}
        <div class="game-card-top">
          <span class="game-tag">${game.genre}</span>
          <span class="game-level">${game.level}</span>
        </div>

        <h3>${game.title}</h3>
        <p>${game.description}</p>

        <span class="game-link">\u304a\u3059\u3059\u3081PC\u3092\u898b\u308b &rarr;</span>
      </div>
    </a>
  `).join("");
}

function filterGames() {
  const keyword = gameSearchInput ? gameSearchInput.value.trim().toLowerCase() : '';
  renderGames(applyFilters(allGames, currentFilter, keyword));
}

if (gameSearchInput) {
  gameSearchInput.addEventListener("input", filterGames);
}

if (gameGrid) {
  loadGames();
  renderAffiliateSection("affiliateSection");
}
