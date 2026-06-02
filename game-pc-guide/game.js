const gameTitle = document.getElementById("gameTitle");
const gameGenre = document.getElementById("gameGenre");
const gameDescription = document.getElementById("gameDescription");
const gameImage = document.getElementById("gameImage");
const buildGrid = document.getElementById("buildGrid");
const gameRecommended = document.getElementById("gameRecommended");
const gameBudget = document.getElementById("gameBudget");
const gamePoint = document.getElementById("gamePoint");
const gameCaution = document.getElementById("gameCaution");
const params = new URLSearchParams(window.location.search);
const gameId = params.get("id");

async function loadGameDetail() {
  try {
    const response = await fetch("./data/games.json");
    const games = await response.json();

    const game = games.find(item => item.id === gameId);

    if (!game) {
      showNotFound();
      return;
    }

    renderGameDetail(game);

    gameRecommended.textContent = game.recommended || "-";
    gameBudget.textContent = game.budget || "-";
    gamePoint.textContent = game.point || "-";
    gameCaution.textContent = game.caution || "-";
  } catch (error) {
    console.error("Failed to load game detail", error);
    showError();
  }
}

function renderGameDetail(game) {
  document.title = `${game.title}\u304a\u3059\u3059\u3081PC | \u5fc5\u8981\u30b9\u30da\u30c3\u30af\u3068\u521d\u5fc3\u8005\u5411\u3051\u69cb\u6210`;

  const metaDescription = document.getElementById("metaDescription");

  if (metaDescription) {
    metaDescription.setAttribute(
      "content",
      `${game.title}\u3092\u5feb\u9069\u306b\u904a\u3076\u305f\u3081\u306e\u304a\u3059\u3059\u3081\u30b2\u30fc\u30df\u30f3\u30b0PC\u69cb\u6210\u3001\u5fc5\u8981\u30b9\u30da\u30c3\u30af\u3001\u4e88\u7b97\u76ee\u5b89\u3092\u521d\u5fc3\u8005\u5411\u3051\u306b\u7d39\u4ecb\u3057\u307e\u3059\u3002`
    );
  }

  if (gameImage && game.image) {
    gameImage.src = game.image;
    gameImage.alt = game.title;
  }

  gameGenre.textContent = `${game.genre} / ${game.level}`;
  gameTitle.textContent = `${game.title}\u304a\u3059\u3059\u3081PC`;
  gameDescription.textContent = game.description;

  const builds = game.builds || [];

  buildGrid.innerHTML = builds.map(build => `
    <article class="build-card">
      <p class="build-label">${build.name}</p>
      <h3>${build.target}</h3>

      <ul class="build-specs">
        <li>
          <span>\u4e88\u7b97\u76ee\u5b89</span>
          <strong>${build.price}</strong>
        </li>
        <li>
          <span>CPU</span>
          <strong>${build.cpu}</strong>
        </li>
        <li>
          <span>GPU</span>
          <strong>${build.gpu}</strong>
        </li>
      </ul>
      <p class="build-comment">${build.comment || ""}</p>
    </article>
  `).join("");

  if (window.renderAffiliateSection) {
    window.renderAffiliateSection("detailAffiliateSection");
  }
}

function showNotFound() {
  gameTitle.textContent = "\u30b2\u30fc\u30e0\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093";
  gameDescription.textContent = "URL\u304c\u9593\u9055\u3063\u3066\u3044\u308b\u304b\u3001games.json\u306b\u30c7\u30fc\u30bf\u304c\u767b\u9332\u3055\u308c\u3066\u3044\u307e\u305b\u3093\u3002";
  buildGrid.innerHTML = "";
}

function showError() {
  gameTitle.textContent = "\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f";
  gameDescription.textContent = "games.json\u306e\u5834\u6240\u3084\u8a18\u8ff0\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002";
  buildGrid.innerHTML = "";
}

loadGameDetail();
