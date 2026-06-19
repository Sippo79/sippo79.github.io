const gpuDetail = document.getElementById("gpuDetail");

let allGpus = [];

function showDetailSkeleton() {
  if (!gpuDetail) return;
  gpuDetail.innerHTML = `
    <div class="gpu-detail-layout">
      <div class="gpu-detail-main">
        <div class="skeleton-card-top" style="margin-bottom:18px;">
          <div class="skeleton-line" style="width:72px;height:26px;border-radius:999px;"></div>
          <div class="skeleton-line" style="width:88px;height:26px;border-radius:999px;"></div>
        </div>
        <div class="skeleton-line" style="width:80%;height:52px;margin-bottom:16px;"></div>
        <div class="skeleton-line" style="width:100%;height:14px;margin-bottom:8px;"></div>
        <div class="skeleton-line" style="width:90%;height:14px;margin-bottom:8px;"></div>
        <div class="skeleton-line" style="width:70%;height:14px;margin-bottom:24px;"></div>
        <div class="skeleton-line" style="width:100%;height:8px;border-radius:999px;"></div>
      </div>
      <div class="gpu-detail-side" style="display:flex;flex-direction:column;gap:14px;justify-content:center;">
        <div class="skeleton-line" style="width:60%;height:14px;"></div>
        <div class="skeleton-line" style="width:80%;height:40px;"></div>
        <div class="skeleton-line" style="width:100%;height:14px;"></div>
        <div class="skeleton-line" style="width:85%;height:14px;"></div>
      </div>
    </div>
  `;
}

async function loadGpuDetail() {
  const params = new URLSearchParams(window.location.search);
  const gpuId = params.get("id");

  if (!gpuId) {
    showNotFound();
    return;
  }

  showDetailSkeleton();

  // affiliate-master.json は gpu-guide フォルダ内に直接配置する方式
  // （shared/ フォルダは編集の source of truth。デプロイ前にここへコピーする）
  const AFFILIATE_MASTER_PATH = "./affiliate-master.json";

  try {
    const [gpusRes, cpuRes, masterRes] = await Promise.all([
      fetch("gpus.json"),
      fetch("cpu-recommendations.json"),
      fetch(AFFILIATE_MASTER_PATH),
    ]);

    if (!gpusRes.ok) throw new Error("GPUデータの読み込みに失敗しました");

    allGpus = await gpusRes.json();
    const cpuData = cpuRes.ok ? await cpuRes.json() : {};
    // masterRes が失敗してもページ全体は崩れない（null で graceful fallback）
    const masterData = masterRes.ok ? await masterRes.json() : null;

    // デバッグ: アフィリエイトデータの読み込み状況を確認
    if (!masterData) {
      console.warn("[GPU GUIDE] affiliate-master.json の読み込みに失敗しました。購入リンクが非表示になります。", AFFILIATE_MASTER_PATH);
    }

    const gpu = allGpus.find((item) => item.id === gpuId);

    if (!gpu) {
      showNotFound();
      return;
    }

    renderGpuDetail(gpu, cpuData, masterData);
  } catch (error) {
    gpuDetail.innerHTML = `
      <div class="empty-message">
        GPUデータを読み込めませんでした。
      </div>
    `;
    console.error(error);
  }
}

function getRank(score) {
  if (score >= 95) return "ULTRA";
  if (score >= 85) return "HIGH";
  if (score >= 70) return "MIDDLE HIGH";
  if (score >= 55) return "MIDDLE";
  return "ENTRY";
}

function getTargetText(target) {
  if (target === "FHD") return "フルHDゲーミング向け";
  if (target === "WQHD") return "WQHDゲーミング向け";
  if (target === "4K") return "4K・重量級ゲーム向け";
  return "ゲーミング向け";
}

function getPowerSupply(power) {
  if (power >= 500) return "850W-1000W以上";
  if (power >= 350) return "750W-850W以上";
  if (power >= 250) return "650W-750W以上";
  return "550W-650W以上";
}

function renderGpuTags(tags = [], limit = 8) {
  if (!Array.isArray(tags) || tags.length === 0) return "";

  return `
    <div class="gpu-tag-list detail-tag-list">
      ${tags.slice(0, limit).map((tag) => `<span>${tag}</span>`).join("")}
    </div>
  `;
}

function formatUsedPriceRange(gpu) {
  const min = Number(gpu.usedPriceMin);
  const max = Number(gpu.usedPriceMax);

  if (!Number.isFinite(min) || !Number.isFinite(max)) return "";

  return `中古目安：${min.toLocaleString()}円〜${max.toLocaleString()}円前後`;
}

function renderUsedCautionSection(gpu) {
  if (!gpu.usedNote && !gpu.caution) return "";

  const checkPoints = Array.isArray(gpu.usedCheckPoints) && gpu.usedCheckPoints.length > 0
    ? gpu.usedCheckPoints
    : [
        "ファン異音・高温・サビ・分解歴を確認",
        "マイニング利用歴がある個体に注意",
        "補助電源コネクタと電源容量を確認",
        "古いGPUは保証が短い、または無いことが多い",
      ];
  const priceRange = formatUsedPriceRange(gpu);

  return `
    <section class="section">
      <article class="gpu-extra-card gpu-used-caution-card">
        <p class="info-label">USED GPU CHECK</p>
        <h2>中古で買うときの注意</h2>
        ${priceRange ? `<p class="used-price-range">${priceRange}</p>` : ""}
        ${gpu.usedRecommendRank ? `<p class="used-rank">中古おすすめ度：<strong>${gpu.usedRecommendRank}</strong></p>` : ""}
        ${gpu.usedNote ? `<p>${gpu.usedNote}</p>` : ""}
        ${gpu.caution ? `<p>${gpu.caution}</p>` : ""}
        <ul class="gpu-list">
          ${checkPoints.map((point) => `<li>${point}</li>`).join("")}
        </ul>
      </article>
    </section>
  `;
}

function setMetaTag(attr, attrValue, content) {
  const el = document.querySelector(`meta[${attr}="${attrValue}"]`);
  if (el) el.setAttribute("content", content);
}

function updateOgp(gpu) {
  const title = `${gpu.name}の性能スコア・VRAM・用途｜GPU GUIDE`;
  const description = `${gpu.name}（${gpu.brand}）の性能スコア${gpu.score}、VRAM ${gpu.vram}GB。${gpu.summary}`;
  const url = `https://sippo-pc.jp/gpu-guide/gpu.html?id=${gpu.id}`;

  document.title = title;
  setMetaTag("name", "description", description);
  setMetaTag("property", "og:title", title);
  setMetaTag("property", "og:description", description);
  setMetaTag("property", "og:url", url);
}

function renderCpuSection(gpu, cpuData) {
  const rec = cpuData[gpu.id];
  if (!rec || !rec.picks || rec.picks.length === 0) return "";

  const cardsHtml = rec.picks.map((pick) => `
    <article class="cpu-rec-card cpu-rec-card-${pick.tier_type}">
      <span class="cpu-tier-badge cpu-tier-${pick.tier_type}">${pick.tier}</span>
      <h3 class="cpu-rec-name">${pick.cpu}</h3>
      <p class="cpu-rec-reason">${pick.reason}</p>
      <ul class="cpu-rec-specs">
        <li class="cpu-rec-spec-item">
          <span>想定用途</span>
          <strong>${pick.use_case}</strong>
        </li>
        <li class="cpu-rec-spec-item">
          <span>解像度目安</span>
          <strong>${pick.resolution}</strong>
        </li>
      </ul>
      <p class="cpu-rec-bottleneck">${pick.bottleneck_note}</p>
    </article>
  `).join("");

  return `
    <section class="section">
      <div class="section-heading">
        <p class="section-label">CPU PAIRING</p>
        <h2>${gpu.name}におすすめのCPU</h2>
        <p>${rec.seo_text}</p>
      </div>
      <div class="cpu-rec-grid">
        ${cardsHtml}
      </div>
      <div class="cpu-rec-links">
        <a href="https://sippo-pc.jp/pc-build-check/"
           class="related-site-button"
           target="_blank"
           rel="noopener noreferrer">
          <span class="related-site-mini">PC BUILD CHECK</span>
          <span>PC構成診断で確認する</span>
          <small>予算・用途からおすすめ構成を診断</small>
        </a>
        <a href="https://sippo-pc.jp/game-pc-guide/"
           class="related-site-button"
           target="_blank"
           rel="noopener noreferrer">
          <span class="related-site-mini">GAME PC GUIDE</span>
          <span>ゲーム別おすすめPCを見る</span>
          <small>遊びたいゲームごとに必要スペックを確認</small>
        </a>
      </div>
    </section>
  `;
}

function renderGpuDetail(gpu, cpuData = {}, masterData = null) {
  const rank = getRank(gpu.score);
  // shared/affiliate/affiliate-master.json 参照方式（新方式）
  const purchaseLinks = window.gpuGuideAffiliate.renderPurchaseSearchLinksFromMaster(gpu.name, masterData);
  const affiliateDisclosure = window.gpuGuideAffiliate.renderAffiliateDisclosure();
  const tagHtml = renderGpuTags(gpu.tags);

  updateOgp(gpu);

  gpuDetail.innerHTML = `
    <div class="gpu-detail-layout">
      <article class="gpu-detail-main">
        <div class="gpu-card-top">
          <span class="gpu-brand">${gpu.brand}</span>
          <span class="gpu-resolution">${gpu.target}向け</span>
        </div>

        <h1>${gpu.name}</h1>

        <p class="gpu-detail-lead">
          ${gpu.summary}
        </p>

        ${tagHtml}

        <div class="gpu-score-box detail-score">
          <div class="gpu-score-head">
            <span>性能スコア</span>
            <strong>${gpu.score}/100</strong>
          </div>

          <div class="performance-bar">
            <span style="width: ${gpu.score}%;"></span>
          </div>
        </div>
      </article>

      <aside class="gpu-detail-side">
        <p class="detail-label">GPU RANK</p>
        <h2>${rank}</h2>
        <p>${getTargetText(gpu.target)}</p>
      </aside>
    </div>

    <div class="hint-box" style="margin-top:18px;">
      <div class="hint-box-icon" aria-hidden="true">💡</div>
      <p class="hint-box-body">
        <strong>かんたん解説。</strong> 「性能スコア」は強さのざっくり目安（最大100）、「GPU RANK」はそのランク帯です。
        価格は時期で変わるので、あくまで目安として見てくださいね。
      </p>
    </div>

    <section class="section">
      <div class="gpu-info-grid">
        <article class="gpu-info-card">
          <p class="info-label">VRAM</p>
          <h3>${gpu.vram}GB</h3>
          <p>高画質設定や重量級ゲームではVRAM容量が重要です。</p>
        </article>

        <article class="gpu-info-card">
          <p class="info-label">価格目安</p>
          <h3>${gpu.price.toLocaleString()}円前後</h3>
          <p>価格は時期によって変動するため、あくまで目安として見てください。</p>
        </article>

        <article class="gpu-info-card">
          <p class="info-label">消費電力目安</p>
          <h3>${gpu.power}W</h3>
          <p>電源容量やケース内の冷却もあわせて確認したいポイントです。</p>
        </article>

        <article class="gpu-info-card">
          <p class="info-label">推奨電源</p>
          <h3>${getPowerSupply(gpu.power)}</h3>
          <p>CPUや他パーツ構成によって必要な電源容量は変わります。</p>
        </article>
      </div>
    </section>

    ${renderUsedCautionSection(gpu)}

    <section class="section purchase-section">
      <div class="section-heading">
        <p class="section-label">SHOP SEARCH</p>
        <h2>おすすめ購入先</h2>
        <p>${gpu.name} のGPU単体、搭載BTOパソコン、相性のよいモニターを検索できます。</p>
      </div>

      <div class="purchase-link-grid">
        ${purchaseLinks}
      </div>

      ${affiliateDisclosure}
    </section>

    <section class="section">
      <div class="gpu-detail-extra-grid">
        <article class="gpu-extra-card">
          <p class="info-label">おすすめゲーム</p>
          <h3>このGPUで遊びやすいゲーム</h3>
          <ul class="gpu-list">
            ${(gpu.games || []).map((game) => `<li>${game}</li>`).join("")}
          </ul>
        </article>

        <article class="gpu-extra-card">
          <p class="info-label">おすすめCPU</p>
          <h3>組み合わせやすいCPU</h3>
          <ul class="gpu-list">
            ${(gpu.cpus || []).map((cpu) => `<li>${cpu}</li>`).join("")}
          </ul>
        </article>

        <article class="gpu-extra-card gpu-extra-card-wide">
          <p class="info-label">比較されやすいGPU</p>
          <h3>近い性能帯のGPU</h3>
          <div class="compare-link-grid">
            ${(gpu.compare || []).map((id) => {
              const targetGpu = allGpus.find((item) => item.id === id);

              if (!targetGpu) return "";

              return `
                <a href="gpu.html?id=${targetGpu.id}" class="compare-link-card">
                  <span>${targetGpu.brand}</span>
                  <strong>${targetGpu.name}</strong>
                </a>
              `;
            }).join("")}
          </div>
        </article>
      </div>
    </section>

    ${renderCpuSection(gpu, cpuData)}

    <section class="section">
      <div class="detail-cta-inner">
        <p class="section-label">OTHER GPUs</p>
        <h2 class="detail-cta-heading">他のGPUと比較する</h2>
        <p class="detail-cta-text">性能・価格・解像度別にGPUを絞り込んで一覧比較できます。</p>
        <a href="index.html#compare" class="primary-btn">GPU比較表を見る →</a>
      </div>
    </section>
  `;
}

function showNotFound() {
  gpuDetail.innerHTML = `
    <div class="empty-message">
      GPUが見つかりませんでした。URLを確認してください。
    </div>
  `;
}

loadGpuDetail();
