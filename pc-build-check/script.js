const form = document.querySelector(".diagnosis-form");
const resultArea = document.querySelector("#result-area");
const affiliateSection = document.querySelector("#affiliate-section");
const popularJumpSection = document.querySelector("#popular-jump-section");
const popularJumpButton = document.querySelector("#popular-jump-button");
const popularBuildsSection = document.querySelector("#popular-builds");
const affiliateButtons = {
  bto: document.querySelector("#affiliate-bto"),
  amazon: document.querySelector("#affiliate-amazon"),
  rakuten: document.querySelector("#affiliate-rakuten"),
  monitor: document.querySelector("#affiliate-monitor"),
};

const affiliateLinks = {
  bto: "",
  amazonParts: "",
  rakutenParts: "",
  monitor: "",
};

const affiliateFallbackLinks = {
  bto: "https://www.dospara.co.jp/TC30",
  amazonParts: "https://www.amazon.co.jp/s?k=グラフィックボード",
  rakutenParts: "https://search.rakuten.co.jp/search/mall/グラフィックボード/",
  monitor: "https://www.amazon.co.jp/s?k=ゲーミングモニター",
};

const gpuAffiliateLinks = [
  {
    match: ["rtx 3050"],
    amazon: "https://amzn.to/4unpTv3",
  },
  {
    match: ["rtx 3060"],
    exclude: ["rtx 3060 ti"],
    amazon: "https://amzn.to/4vfHO7x",
  },
  {
    match: ["rtx 4060 ti"],
    amazon: "https://amzn.to/49wDhoR",
    rakuten: "https://a.r10.to/hPZffm",
  },
  {
    match: ["rtx 4060"],
    exclude: ["rtx 4060 ti"],
    amazon: "https://amzn.to/4wYIVdm",
    rakuten: "https://a.r10.to/hPgdeX",
  },
  {
    match: ["rtx 4070"],
    exclude: ["rtx 4070 super", "rtx 4070 ti super"],
    amazon: "https://amzn.to/4vhVmzx",
  },
  {
    match: ["rtx 4070 super"],
    amazon: "https://amzn.to/4nTl5vy",
    rakuten: "https://a.r10.to/hPZfxv",
  },
  {
    match: ["rtx 4080"],
    exclude: ["rtx 4080 super"],
    amazon: "https://amzn.to/4dDK7vf",
    rakuten: "https://a.r10.to/hRijvW",
  },
  {
    match: ["rtx 4080 super"],
    amazon: "https://amzn.to/4u0bDI7",
  },
  {
    match: ["rtx 5060"],
    exclude: ["rtx 5060 ti"],
    amazon: "https://amzn.to/42YIO41",
    rakuten: "https://a.r10.to/hk5Kq2",
  },
  {
    match: ["rtx 5060 ti"],
    amazon: "https://amzn.to/4wXYAtA",
    rakuten: "https://a.r10.to/hYQ01W",
  },
  {
    match: ["rtx 5070"],
    exclude: ["rtx 5070 ti"],
    amazon: "https://amzn.to/49u0cRO",
    rakuten: "https://a.r10.to/hkKZsl",
  },
  {
    match: ["rtx 5070 ti"],
    amazon: "https://amzn.to/4wTXy1G",
    rakuten: "https://a.r10.to/hgOCmU",
  },
  {
    match: ["rtx 5080"],
    amazon: "https://amzn.to/4uJYm7S",
    rakuten: "https://a.r10.to/hgP6kS",
  },
  {
    match: ["rtx 5090"],
    rakuten: "https://a.r10.to/hYATKB",
  },
  {
    match: ["rx 9060 xt"],
    amazon: "https://amzn.to/4dX3w9t",
  },
  {
    match: ["rx 7800 xt"],
    amazon: "https://amzn.to/3RxIK8V",
  },
  {
    match: ["rx 7600"],
    exclude: ["rx 7600 xt"],
    amazon: "https://amzn.to/4uzVPwZ",
  },
  {
    match: ["rx 7700 xt"],
    amazon: "https://amzn.to/432paUQ",
  },
  {
    match: ["rx 9070"],
    exclude: ["rx 9070 xt"],
    amazon: "https://amzn.to/3RSnbQl",
    rakuten: "https://a.r10.to/hkxoJc",
  },
  {
    match: ["rx 9070 xt"],
    amazon: "https://amzn.to/3Q5xL69",
    rakuten: "https://a.r10.to/h5xl0b",
  },
];

const gpuPerformanceProfiles = [
  {
    match: ["rtx 3050"],
    fps: {
      fhd: { apex: "90-120", valorant: "220-300", fortnite: "80-110", minecraft: "180-260" },
      wqhd: { apex: "60-85", valorant: "170-240", fortnite: "55-80", minecraft: "130-200" },
      "4k": { apex: "35-50", valorant: "100-150", fortnite: "30-45", minecraft: "75-120" },
    },
    capabilities: ["FHDゲーム向き", "軽めの動画編集OK", "普段使い快適"],
    recommendedResolution: "FHD / 1080p",
    psu: "550W",
  },
  {
    match: ["rtx 3060", "rx 6600"],
    fps: {
      fhd: { apex: "120-160", valorant: "280-380", fortnite: "100-140", minecraft: "220-320" },
      wqhd: { apex: "80-115", valorant: "210-300", fortnite: "70-100", minecraft: "160-240" },
      "4k": { apex: "45-65", valorant: "130-190", fortnite: "40-60", minecraft: "95-150" },
    },
    capabilities: ["FHD 144fpsゲーム可能", "WQHD入門", "動画編集OK"],
    recommendedResolution: "FHD / 1080p",
    psu: "550W",
  },
  {
    match: ["rtx 5060", "rx 9060 xt", "rtx 4060 ti", "rx 7600 xt", "rtx 4060", "rx 7600"],
    fps: {
      fhd: { apex: "150-210", valorant: "330-450", fortnite: "130-180", minecraft: "260-380" },
      wqhd: { apex: "105-150", valorant: "260-360", fortnite: "90-130", minecraft: "200-300" },
      "4k": { apex: "60-85", valorant: "160-240", fortnite: "50-75", minecraft: "120-190" },
    },
    capabilities: ["FHD 144fpsゲーム可能", "WQHD快適", "配信可能", "動画編集OK"],
    recommendedResolution: "FHD-WQHD / 1080p-1440p",
    psu: "600W",
  },
  {
    match: ["rtx 5060 ti", "rtx 5070", "rx 9070 xt", "rx 9070", "rtx 4070 ti super", "rtx 4070 super", "rtx 4070", "rx 7800 xt", "rx 7700 xt"],
    fps: {
      fhd: { apex: "220-300", valorant: "420-550", fortnite: "180-240", minecraft: "340-500" },
      wqhd: { apex: "160-230", valorant: "330-460", fortnite: "135-190", minecraft: "260-390" },
      "4k": { apex: "95-140", valorant: "220-320", fortnite: "80-120", minecraft: "170-270" },
    },
    capabilities: ["FHD 240fpsクラス", "WQHD快適", "4K入門", "配信可能", "動画編集OK"],
    recommendedResolution: "WQHD / 1440p",
    psu: "700W",
  },
  {
    match: ["rtx 5080", "rtx 5070 ti", "rtx 4080 super"],
    fps: {
      fhd: { apex: "260-360", valorant: "500-650", fortnite: "220-300", minecraft: "420-620" },
      wqhd: { apex: "210-300", valorant: "420-560", fortnite: "175-250", minecraft: "330-500" },
      "4k": { apex: "140-200", valorant: "290-420", fortnite: "115-170", minecraft: "230-360" },
    },
    capabilities: ["FHD 240fps以上", "WQHD高fps快適", "4Kゲーム可能", "配信可能", "動画編集OK"],
    recommendedResolution: "WQHD-4K / 1440p-2160p",
    psu: "750W",
  },
];

const defaultPerformanceProfile = {
  fps: {
    fhd: { apex: "90-140", valorant: "200-320", fortnite: "80-130", minecraft: "160-260" },
    wqhd: { apex: "65-100", valorant: "160-260", fortnite: "55-90", minecraft: "120-210" },
    "4k": { apex: "40-65", valorant: "100-180", fortnite: "35-60", minecraft: "80-140" },
  },
  capabilities: ["FHDゲーム可能", "普段使い快適", "軽めの制作作業OK"],
  recommendedResolution: "FHD / 1080p",
  psu: "550W",
};

const gameLabels = {
  apex: "Apex Legends",
  valorant: "VALORANT",
  fortnite: "Fortnite",
  minecraft: "Minecraft",
};

const friendlyCapabilities = {
  "FHDゲーム向き": "フルHDゲームを快適にプレイ",
  "軽めの動画編集OK": "簡単な動画編集も対応",
  "普段使い快適": "ネット・動画・作業も快適",
  "FHD 144fpsゲーム可能": "フルHDで高フレームレート達成",
  "WQHD入門": "高精細モニターにも対応可",
  "動画編集OK": "動画編集ソフトも動かせる",
  "FHD 144fpsゲーム可能": "フルHDで滑らか144fps達成",
  "WQHD快適": "1440p高精細でも快適にプレイ",
  "配信可能": "ゲーム配信・録画にも対応",
  "FHD 240fpsクラス": "フルHDで超滑らか240fps達成",
  "4K入門": "4K高解像度ゲームも体験可能",
  "FHD 240fps以上": "フルHDで最高クラスのfps",
  "WQHD高fps快適": "1440pで高フレームレートを維持",
  "4Kゲーム可能": "4K解像度のゲームを快適にプレイ",
  "FHDゲーム可能": "フルHDゲームを問題なく動かせる",
  "普段使い快適": "ネット・動画・日常作業を快適にこなせる",
  "軽めの制作作業OK": "写真編集・軽い動画処理も対応",
};

const usageComfortMessages = {
  fps: {
    fhd: "Apex LegendsやVALORANTを高フレームレートで快適にプレイできます。フルHDモニターとの組み合わせでコスパ最高の環境が作れます。",
    wqhd: "1440p高精細モニターでFPSを快適に楽しめます。敵が見やすく、視認性と美しさを両立できます。",
    "4k": "4K解像度でFPSゲームを楽しめます。フレームレートより高画質を重視したい方向けです。",
  },
  mmo: {
    fhd: "FF14や原神などのMMO・RPGを美しい画質でゆったり楽しめます。長時間プレイでも疲れにくい安定した動作が期待できます。",
    wqhd: "1440pの高精細画面でMMO・RPGの世界観をより豊かに楽しめます。広いUIが表示できて操作性も向上します。",
    "4k": "4K解像度でMMOやRPGの美麗なグラフィックを最高画質で堪能できます。",
  },
  stream: {
    fhd: "ゲームをプレイしながら同時に配信・録画ができます。視聴者に安定した映像を届けられる構成です。",
    wqhd: "1440p高画質でのゲームプレイと配信を両立できます。配信クオリティも向上します。",
    "4k": "高解像度でのゲーム配信・録画に対応できます。本格的な配信環境を構築したい方向けです。",
  },
  creative: {
    fhd: "Premiere ProやDaVinci Resolveなどの動画編集ソフトを快適に動かせます。編集作業の待ち時間を短縮できます。",
    wqhd: "動画編集の広い作業画面を活かせる構成です。タイムラインが見やすく、制作効率が上がります。",
    "4k": "4K動画素材の編集・書き出しもこなせるクリエイター向けの高性能構成です。",
  },
  daily: {
    fhd: "ネット閲覧・動画視聴・テレワークはもちろん、軽めのゲームまでストレスなく動かせます。",
    wqhd: "1440pの広い画面で作業・動画・ゲームを快適に楽しめます。普段使いには十分すぎる性能です。",
    "4k": "4K動画の視聴や高精細な作業環境を手軽に実現できます。マルチタスクも余裕でこなせます。",
  },
};

const whyThisBuildMessages = {
  fps: {
    fhd: (gpu) => `FPSゲームで重要なのはフレームレートです。${gpu}はフルHD解像度でのフレームレートが高く、Apex LegendsやVALORANTで高fpsを出しやすいGPUです。3Dキャッシュ付きCPUとの組み合わせでゲーム性能をさらに引き出しています。`,
    wqhd: (gpu) => `WQHDはフルHDより高精細で、FPSの視認性が向上します。${gpu}はWQHD解像度でも十分なフレームレートを維持できるため、高画質と高fpsを両立したい方に適した構成です。`,
    "4k": (gpu) => `4K解像度でのFPSは非常に高いGPU性能が必要です。${gpu}はその要求に応えられる最上位クラスのGPUです。画質を最優先にしたい方向けの構成です。`,
  },
  mmo: {
    fhd: (gpu) => `MMO・RPGはフレームレートよりも安定した動作と美しいグラフィックが重要です。${gpu}はフルHDでの安定動作に優れており、長時間プレイでも快適な環境を維持できます。`,
    wqhd: (gpu) => `WQHDモニターはMMO・RPGのUI表示領域が広がり、情報管理がしやすくなります。${gpu}はWQHDでの安定動作に適しており、高精細なグラフィックも楽しめます。`,
    "4k": (gpu) => `4K解像度はMMO・RPGの美しい世界観を最大限に引き出します。${gpu}は4Kでも高画質設定での動作を実現できる性能を持っています。`,
  },
  stream: {
    fhd: (gpu) => `配信・録画にはCPUの処理性能が特に重要です。このCPU・GPU構成はゲームプレイと配信エンコードを同時にこなせるよう選定しています。RTX系GPUはNVIDIAのNVENCエンコーダーが使えるため、CPU負荷を抑えた高品質配信が可能です。`,
    wqhd: (gpu) => `WQHD環境での配信は高画質映像を視聴者に届けやすくなります。${gpu}のハードウェアエンコーダーにより、ゲームの動作を妨げずに高品質な配信ができます。`,
    "4k": (gpu) => `4K配信・録画には最高クラスのCPUとGPU性能が求められます。この構成はその要求を満たしており、将来の配信スタイルの変化にも対応できる余裕があります。`,
  },
  creative: {
    fhd: (gpu) => `動画編集ではCPUのコア数とメモリ容量が重要です。このCPUは多コア設計で、${gpu}のGPUアクセラレーションと組み合わせることで、書き出し速度を大幅に向上させられます。`,
    wqhd: (gpu) => `WQHD環境は動画編集の作業スペースが広がり、タイムラインの視認性が向上します。${gpu}はGPUエンコードに対応しており、Premiere ProやDaVinci Resolveでの書き出しを高速化できます。`,
    "4k": (gpu) => `4K動画の編集・書き出しには高いCPU性能・メモリ・GPU性能が必要です。この構成はすべての要件を満たしており、4Kクリエイター向けのバランスの取れた構成です。`,
  },
  daily: {
    fhd: (gpu) => `普段使い・軽めのゲームには過剰なスペックは不要です。この構成は必要十分な性能をコスパ良く実現しており、ネット・動画・テレワーク・軽いゲームまで快適にこなせます。`,
    wqhd: (gpu) => `WQHD環境は普段使いでも広い作業スペースが得られ、マルチタスクが快適になります。この構成はその環境を実現しつつ、軽いゲームも十分楽しめる余裕があります。`,
    "4k": (gpu) => `4Kモニターで動画視聴や資料作成を行うとその鮮明さに驚くはずです。この構成は4K表示を快適にこなせる性能を持ちながら、普段使いでも無駄がありません。`,
  },
};

let builds = [];

function setupAffiliateLinks() {
  affiliateButtons.bto.href = getAffiliateUrl(affiliateLinks.bto, affiliateFallbackLinks.bto);
  affiliateButtons.amazon.href = getAffiliateUrl(
    affiliateLinks.amazonParts,
    affiliateFallbackLinks.amazonParts
  );
  affiliateButtons.rakuten.href = getAffiliateUrl(
    affiliateLinks.rakutenParts,
    affiliateFallbackLinks.rakutenParts
  );
  affiliateButtons.monitor.href = getAffiliateUrl(affiliateLinks.monitor, affiliateFallbackLinks.monitor);
}

function updateAffiliateLinksForBuild(build) {
  const normalizedGpu = normalizeText(build.gpu);
  const gpuLink = gpuAffiliateLinks.find((link) => {
    const isMatched = link.match.some((keyword) => normalizedGpu.includes(keyword));
    const isExcluded = link.exclude?.some((keyword) => normalizedGpu.includes(keyword));
    return isMatched && !isExcluded;
  });

  affiliateButtons.bto.href = getAffiliateUrl(gpuLink?.bto || affiliateLinks.bto, affiliateFallbackLinks.bto);
  affiliateButtons.amazon.href = getAffiliateUrl(
    gpuLink?.amazon || affiliateLinks.amazonParts,
    affiliateFallbackLinks.amazonParts
  );
  affiliateButtons.rakuten.href = getAffiliateUrl(
    gpuLink?.rakuten || affiliateLinks.rakutenParts,
    affiliateFallbackLinks.rakutenParts
  );
  affiliateButtons.monitor.href = getAffiliateUrl(
    gpuLink?.monitor || affiliateLinks.monitor,
    affiliateFallbackLinks.monitor
  );
}

function toggleAffiliateSection(isVisible) {
  affiliateSection.classList.toggle("hidden", !isVisible);
  popularJumpSection.classList.toggle("hidden", !isVisible);
}

function getAffiliateUrl(url, fallbackUrl) {
  if (!url || url === "#" || url.includes("example.com")) {
    return fallbackUrl;
  }

  return url;
}

function normalizeText(value) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getPerformanceProfile(gpu) {
  const normalizedGpu = normalizeText(gpu);
  return (
    gpuPerformanceProfiles.find((profile) =>
      profile.match.some((keyword) => normalizedGpu.includes(keyword))
    ) || defaultPerformanceProfile
  );
}

function getResolutionLabel(resolution) {
  const labels = {
    fhd: "FHD / 1080p",
    wqhd: "WQHD / 1440p",
    "4k": "4K / 2160p",
  };

  return labels[resolution] || "FHD / 1080p";
}

function createGpuGuideUrl(gpu) {
  return `https://sippo79.github.io/gpu-guide/?gpu=${encodeURIComponent(gpu)}`;
}

function renderFpsItems(fpsByGame) {
  return Object.entries(gameLabels)
    .map(([key, label]) => {
      const fps = fpsByGame[key] || "-";
      return `
        <li class="fps-item">
          <span class="fps-game">${label}</span>
          <strong>${fps}<small>fps</small></strong>
        </li>
      `;
    })
    .join("");
}

function renderCapabilityItems(capabilities) {
  return capabilities
    .map((capability) => {
      const friendly = friendlyCapabilities[capability] || capability;
      return `<li title="${capability}">${friendly}</li>`;
    })
    .join("");
}

function getWhyMessage(usage, resolution, gpu) {
  const usageMap = whyThisBuildMessages[usage];
  if (!usageMap) return null;
  const fn = usageMap[resolution] || usageMap.fhd;
  return fn ? fn(gpu) : null;
}

function getComfortMessage(usage, resolution) {
  const usageMap = usageComfortMessages[usage];
  if (!usageMap) return null;
  return usageMap[resolution] || usageMap.fhd || null;
}

function renderNextActions(gpuGuideUrl) {
  return `
    <div class="next-action-section">
      <p class="next-action-label">次のステップ</p>
      <div class="next-action-grid">
        <a class="next-action-btn" href="${gpuGuideUrl}" target="_blank" rel="noopener">
          <span class="next-action-icon">🔍</span>
          <span class="next-action-text">
            <strong>GPU詳細を見る</strong>
            <small>グラボの性能・比較情報</small>
          </span>
        </a>
        <a class="next-action-btn" href="https://sippo79.github.io/game-pc-guide/" target="_blank" rel="noopener">
          <span class="next-action-icon">🎮</span>
          <span class="next-action-text">
            <strong>ゲーム別おすすめPCを見る</strong>
            <small>遊びたいゲームから逆引き</small>
          </span>
        </a>
        <a class="next-action-btn" href="#popular-builds" id="next-action-popular">
          <span class="next-action-icon">🏆</span>
          <span class="next-action-text">
            <strong>人気構成ランキングを見る</strong>
            <small>みんなが選ぶ定番構成</small>
          </span>
        </a>
      </div>
    </div>
  `;
}

const diagnosisButton = document.querySelector("#diagnosis-button");

function showSkeleton() {
  resultArea.innerHTML = `
    <div class="skeleton-card">
      <div class="skeleton-line skeleton-title"></div>
      <div class="skeleton-line skeleton-spec"></div>
      <div class="skeleton-line skeleton-spec"></div>
      <div class="skeleton-line skeleton-spec"></div>
      <div class="skeleton-line skeleton-spec"></div>
      <div class="skeleton-line skeleton-comment"></div>
    </div>
  `;
}

function setButtonLoading(isLoading) {
  if (!diagnosisButton) return;
  if (isLoading) {
    diagnosisButton.classList.add("btn-loading");
    diagnosisButton.textContent = "診断中...";
  } else {
    diagnosisButton.classList.remove("btn-loading");
    diagnosisButton.textContent = "この条件で診断する";
  }
}

async function loadBuilds() {
  try {
    const response = await fetch("builds.json");
    builds = await response.json();
  } catch {
    builds = [];
  }
}

/* =========================
   PWA Install Prompt
========================= */

let deferredInstallPrompt = null;
const installPromptEl = document.querySelector("#install-prompt");
const installBtnYes = document.querySelector("#install-btn-yes");
const installBtnNo = document.querySelector("#install-btn-no");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;

  const dismissed = sessionStorage.getItem("install-prompt-dismissed");
  if (!dismissed && installPromptEl) {
    setTimeout(() => {
      installPromptEl.classList.add("visible");
    }, 3000);
  }
});

if (installBtnYes) {
  installBtnYes.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installPromptEl.classList.remove("visible");
  });
}

if (installBtnNo) {
  installBtnNo.addEventListener("click", () => {
    installPromptEl.classList.remove("visible");
    sessionStorage.setItem("install-prompt-dismissed", "1");
  });
}

setupAffiliateLinks();
toggleAffiliateSection(false);
loadBuilds();

popularJumpButton.addEventListener("click", () => {
  popularBuildsSection.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const budget = form.budget.value;
  const usage = form.usage.value;
  const resolution = form.resolution.value;

  if (!budget || !usage || !resolution) {
    resultArea.innerHTML = `
      <div class="result-card">
        <p>すべての項目を選択してください。</p>
      </div>
    `;
    toggleAffiliateSection(false);
    return;
  }

  setButtonLoading(true);

  if (builds.length === 0) {
    showSkeleton();
    resultArea.scrollIntoView({ behavior: "smooth", block: "nearest" });
    await loadBuilds();
  }

  setButtonLoading(false);

  const result = builds.find((build) => {
    return (
      build.budget === budget &&
      build.usage === usage &&
      build.resolution === resolution
    );
  });

  if (!result) {
    resultArea.innerHTML = `
      <div class="result-card">
        <p class="result-label">Diagnosis Result</p>
        <h3>該当する構成がありません</h3>
        <p class="result-comment">
          条件に合う構成データを現在追加中です。
        </p>
      </div>
    `;

    toggleAffiliateSection(false);
    return;
  }

  const performanceProfile = getPerformanceProfile(result.gpu);
  const fpsByGame =
    performanceProfile.fps[resolution] || performanceProfile.fps.fhd || defaultPerformanceProfile.fps.fhd;
  const selectedResolutionLabel = getResolutionLabel(resolution);
  const gpuGuideUrl = createGpuGuideUrl(result.gpu);
  updateAffiliateLinksForBuild(result);

  const whyMessage = getWhyMessage(usage, resolution, result.gpu);
  const comfortMessage = getComfortMessage(usage, resolution);

  resultArea.innerHTML = `
    <div class="result-card">
      <p class="result-label">Diagnosis Result</p>

      <h3>${result.title}</h3>

      <ul class="result-specs">
        <li><span>CPU</span>${result.cpu}</li>
        <li><span>GPU（グラボ）</span>${result.gpu}</li>
        <li><span>メモリ</span>${result.ram}</li>
        <li><span>ストレージ</span>${result.storage}</li>
      </ul>

      ${comfortMessage ? `
      <div class="comfort-message">
        <span class="comfort-icon">✅</span>
        <p>${comfortMessage}</p>
      </div>` : ''}

      ${whyMessage ? `
      <section class="why-panel">
        <div class="why-panel-heading">
          <p class="result-label">Why This Build</p>
          <h4>なぜこの構成？</h4>
        </div>
        <p class="why-text">${whyMessage}</p>
      </section>` : ''}

      <div class="result-insights">
        <div class="result-metrics">
          <div class="metric-card">
            <span>推奨解像度</span>
            <strong>${performanceProfile.recommendedResolution}</strong>
            <small>選択条件: ${selectedResolutionLabel}</small>
          </div>
          <div class="metric-card">
            <span>推奨電源容量</span>
            <strong>${performanceProfile.psu}</strong>
            <small>余裕を見た目安です</small>
          </div>
        </div>

        <section class="result-panel">
          <div class="result-panel-heading">
            <p class="result-label">Estimated FPS</p>
            <h4>主要ゲームの想定fps</h4>
            <span>目安</span>
          </div>
          <ul class="fps-grid">
            ${renderFpsItems(fpsByGame)}
          </ul>
        </section>

        <section class="result-panel">
          <div class="result-panel-heading">
            <p class="result-label">Can Do</p>
            <h4>このPCでできること</h4>
          </div>
          <ul class="capability-list">
            ${renderCapabilityItems(performanceProfile.capabilities)}
          </ul>
        </section>

        <a class="gpu-detail-button" href="${gpuGuideUrl}" target="_blank" rel="noopener">
          グラボの詳細スペックを見る →
        </a>
      </div>

      ${renderNextActions(gpuGuideUrl)}
    </div>
  `;

  toggleAffiliateSection(true);

  resultArea.scrollIntoView({ behavior: "smooth", block: "nearest" });

  const nextActionPopular = document.querySelector("#next-action-popular");
  if (nextActionPopular) {
    nextActionPopular.addEventListener("click", (e) => {
      e.preventDefault();
      popularBuildsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
});
