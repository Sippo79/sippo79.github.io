const form = document.querySelector(".diagnosis-form");
const resultArea = document.querySelector("#result-area");
const affiliateSection = document.querySelector("#affiliate-section");
const popularJumpSection = document.querySelector("#popular-jump-section");
const popularJumpButton = document.querySelector("#popular-jump-button");
const popularBuildsSection = document.querySelector("#popular-builds");
// 診断結果の購入導線を描画する箱（中身は共通基盤が生成する）
const affiliateResultBox = document.querySelector("#affiliate-result-links");

// ============================================================
// [参考データ] 旧方式のアフィリエイトリンク定義
//
// これらのURLは shared/affiliate/affiliate-master.json へ
// すべて取り込み済みです（既存リンクは失われていません）。
// 現在の購入導線は共通基盤 SippoAffiliate が商品マスターから
// 生成するため、以下の定義は参照されていません。
//
// URLの追加・変更は shared/affiliate/affiliate-master.json を
// 編集してください（このファイルではありません）。
// 移行確認が完了したら、この定義ブロックは削除して構いません。
// ============================================================
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
  },
  {
    match: ["rtx 5080"],
    amazon: "https://amzn.to/4uJYm7S",
    rakuten: "https://a.r10.to/hgP6kS",
  },
  {
    match: ["rtx 5090"],
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
    fhd: (gpu) => `FPSゲームで重要なのはフレームレートです。${gpu}はフルHD解像度でのフレームレートが高く、Apex LegendsやVALORANTで高fpsを出しやすいGPUです。`,
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
let gpuData = [];
let partPrices = null;

// 診断結果の購入導線は共通アフィリエイト基盤（shared/affiliate）が描画する。
// 旧方式（#affiliate-amazon 等の固定ボタン）は使わず、診断された構成の
// 各パーツごとにリンクを出す。商品を特定できないパーツは出さない。

/** 共通基盤の読み込みを開始する（失敗してもページは壊さない） */
function setupAffiliateLinks() {
  if (window.SippoAffiliate) {
    window.SippoAffiliate.init().catch(() => false);
  }
}

/**
 * 診断結果の構成から購入導線を描画する。
 * 出せる商品が1件も無ければセクションを非表示のままにする。
 * @returns {boolean} 描画できたか
 */
function updateAffiliateLinksForBuild(build) {
  if (!affiliateResultBox || !window.SippoAffiliate) return false;

  const html = window.SippoAffiliate.renderProductList(
    [
      { label: "GPU", name: build.gpu },
      { label: "CPU", name: build.cpu },
    ],
    {
      page: "pc-build-check",
      placement: "build-result",
      disclosure: false, // 広告表記はセクション下部に1回だけ出す
    }
  );

  affiliateResultBox.innerHTML = html;
  return Boolean(html);
}

function toggleAffiliateSection(isVisible) {
  affiliateSection.classList.toggle("hidden", !isVisible);
  popularJumpSection.classList.toggle("hidden", !isVisible);
}

function normalizeText(value) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------
 *  GPU名 → 性能プロファイルの対応付け
 * ------------------------------------------------------------------
 *  ★ここは過去に事故った箇所。安易に includes() へ戻さないこと。
 *
 *  旧実装は gpuPerformanceProfiles を上から順に見て
 *  「キーが含まれていれば採用」していた。そのため
 *
 *      "geforce rtx 5060 ti".includes("rtx 5060")  → true
 *
 *  となり、profile 3 に明示的に列挙されている RTX 5060 Ti が
 *  先に現れる profile 2 の "rtx 5060" に吸われていた
 *  （RTX 5070 Ti / RTX 5070 も同様）。結果として想定fps・
 *  推奨解像度・推奨電源が1段階低く表示されていた。
 *
 *  【対策】マッチしたキーの中から "最も長いキー" を採用する。
 *  下位モデル名は上位モデル名の接頭辞になっている
 *  （"rtx 5060" ⊂ "rtx 5060 ti"）ため、長い方を選べば
 *  Ti / SUPER / Ti SUPER / XT / XTX すべてで正しく上位を選べる。
 *  定義の並び順に依存しないので、プロファイルへの追記順も問わない。
 * ------------------------------------------------------------------ */

/** GPU名にマッチする最長キーを持つプロファイルの添字を返す（無ければ -1） */
function getPerformanceProfileIndex(gpu) {
  const normalizedGpu = normalizeText(gpu || "");
  let bestIndex = -1;
  let bestLength = 0;

  gpuPerformanceProfiles.forEach((profile, index) => {
    profile.match.forEach((keyword) => {
      if (!normalizedGpu.includes(keyword)) return;
      // 同じ長さで競合したときは先に定義された方を優先（従来の挙動を維持）
      if (keyword.length > bestLength) {
        bestLength = keyword.length;
        bestIndex = index;
      }
    });
  });

  return bestIndex;
}

function getPerformanceProfile(gpu) {
  const index = getPerformanceProfileIndex(gpu);
  return index < 0 ? defaultPerformanceProfile : gpuPerformanceProfiles[index];
}

function getResolutionLabel(resolution) {
  const labels = {
    fhd: "FHD / 1080p",
    wqhd: "WQHD / 1440p",
    "4k": "4K / 2160p",
  };

  return labels[resolution] || "FHD / 1080p";
}

/* ==================================================================
 *  解像度の適性判定
 * ==================================================================
 *  【何のためのものか】
 *   「4Kを選んだのに FHD向けGPU が提示される」問題への対応。
 *   構成を隠したり、予算を超える高価なGPUに差し替えたりはしない。
 *   予算を守った結果として性能が足りないなら、
 *   その事実を正直に伝える（/upgrade/ と同じ方針）。
 *
 *  【混同しないこと】結果画面では次の3つを別々に扱う。
 *     1. ユーザーが選んだ解像度      … result.resolution
 *     2. GPU本来の適性              … gpus.json の target
 *     3. この構成でおすすめする解像度 … 上2つから導く判定
 *   旧実装は「推奨解像度」1項目に全部を詰め込んでいたため、
 *   4K選択なのに「FHD / 1080p」とだけ出て意味が通らなかった。
 * ================================================================== */

/* 解像度の重さ順。数値の間隔に意味は無く、大小比較にのみ使う。
 * UWQHD や 4K高fps を足すときは、ここに1行足せば
 * 比較ロジック側は変更不要（文字列のif文を増やさないための表）。 */
/* ★解像度の尺度は shared/gpu/gpu-target.js と共有する。
 *   ここに独自の対応表を持つと、GPU GUIDE 側と基準がズレたときに
 *   「一覧ではWQHD向けなのに診断では足りないと言われる」が起きる。
 *   共通モジュールが読めない場合だけ同等の表にフォールバックする。 */
const RESOLUTION_LEVELS =
  (typeof window !== "undefined" && window.SippoGpuTarget
    && window.SippoGpuTarget.RESOLUTION_LEVELS) || {
    fhd: 1,
    wqhd: 2,
    "4k": 3,
  };

/* gpus.json の target 表記（"FHD" / "WQHD" / "4K"）と
 * フォームの value（"fhd" / "wqhd" / "4k"）を同じ尺度で読むための正規化。 */
function getResolutionLevel(value) {
  if (!value) return null;
  const key = String(value).toLowerCase().trim();
  return Object.prototype.hasOwnProperty.call(RESOLUTION_LEVELS, key)
    ? RESOLUTION_LEVELS[key]
    : null; // 未知の表記は勝手に仮定せず null（判定不能）にする
}

/** レベル値 → 表示用ラベル */
function getResolutionShortLabel(level) {
  const found = Object.keys(RESOLUTION_LEVELS).find(
    (key) => RESOLUTION_LEVELS[key] === level
  );
  const labels = { fhd: "フルHD", wqhd: "WQHD", "4k": "4K" };
  return labels[found] || "フルHD";
}

/** gpus.json から GPU を名前で引く（表記ゆれを吸収する） */
function findGpuData(gpuName, gpuList) {
  if (!gpuName || !Array.isArray(gpuList)) return null;
  const key = normalizeGpuKey(gpuName);
  return gpuList.find((item) => normalizeGpuKey(item.name) === key) || null;
}

/* "GeForce RTX 5070 Ti" → "rtx5070ti"
 * GPU GUIDE 側の gpuNameToSharedKey と同じ考え方でそろえる。 */
function normalizeGpuKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/^geforce\s+/, "")
    .replace(/^amd\s+radeon\s+/, "")
    .replace(/^radeon\s+/, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * 選んだ解像度に対して、そのGPUが足りているかを判定する。
 *
 * @returns {{
 *   level: 'unknown'|'short'|'match'|'over',
 *   warns: boolean,          // 不足警告を出すか
 *   gpuTarget: string|null,  // GPU本来の適性（"FHD" 等）
 *   selectedLabel: string,   // 選んだ解像度の表示名
 *   suggestLabel: string|null, // 代わりに勧める解像度
 *   headline: string|null,
 *   detail: string|null
 * }}
 */
function getResolutionFit(gpuName, selectedResolution, gpuList) {
  const gpuData = findGpuData(gpuName, gpuList);
  const wantLevel = getResolutionLevel(selectedResolution);
  const haveLevel = gpuData ? getResolutionLevel(gpuData.target) : null;
  const selectedLabel = getResolutionShortLabel(wantLevel);

  // GPUデータが無い／適性が読めない場合は判定しない。
  // 「分からない」を「足りている」と読ませないため、警告も出さない代わりに
  // 足りている風の表示も出さない。
  if (!gpuData || haveLevel === null || wantLevel === null) {
    return {
      level: "unknown",
      warns: false,
      gpuTarget: gpuData ? gpuData.target || null : null,
      selectedLabel: selectedLabel,
      suggestLabel: null,
      headline: null,
      detail: null,
    };
  }

  if (haveLevel < wantLevel) {
    const suggestLabel = getResolutionShortLabel(haveLevel);
    return {
      level: "short",
      warns: true,
      gpuTarget: gpuData.target,
      selectedLabel: selectedLabel,
      suggestLabel: suggestLabel,
      headline: `この予算では${selectedLabel}を快適に狙うのは厳しめです`,
      detail:
        `${selectedLabel}を選びましたが、この予算で選べる${gpuData.name}は` +
        `${suggestLabel}向けのグラボです。${selectedLabel}でも映りますが、` +
        `重いゲームでは画質を下げる必要が出てきます。` +
        `${suggestLabel}のモニターで使うなら、この構成のまま気持ちよく遊べます。`,
    };
  }

  if (haveLevel > wantLevel) {
    return {
      level: "over",
      warns: false,
      gpuTarget: gpuData.target,
      selectedLabel: selectedLabel,
      suggestLabel: null,
      headline: null,
      detail: null,
    };
  }

  return {
    level: "match",
    warns: false,
    gpuTarget: gpuData.target,
    selectedLabel: selectedLabel,
    suggestLabel: null,
    headline: null,
    detail: null,
  };
}

/* GPU詳細ページのURL。
 *
 * ★旧実装は `/gpu-guide/?gpu=<GPU名>` を返していたが、GPU GUIDE トップは
 *   この `gpu` クエリを解釈しないため、ユーザーはGPU一覧に着地して
 *   目的のGPUを自分で探し直す羽目になっていた（「GPU詳細を見る」の詐称）。
 *   Phase 2 で個別ページを静的化したので、直接そこへ送る。
 *
 * 名前→idの解決は共通の SippoGpuLinks（shared/gpu/gpu-links.js）に任せる。
 * 解決できないGPUだけ GPU GUIDE トップへフォールバックする
 * （間違ったGPUページへ飛ばさない）。 */
function createGpuGuideUrl(gpu) {
  const links = window.SippoGpuLinks;
  if (links && links.isReady()) {
    const url = links.detailUrl(gpu);
    if (url) return url;
  }
  return "/gpu-guide/";
}

/** そのGPUの個別ページが存在するか（ボタン文言の出し分けに使う） */
function hasGpuDetailPage(gpu) {
  const links = window.SippoGpuLinks;
  return Boolean(links && links.isReady() && links.detailUrl(gpu));
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

// 解像度から快適度ラベル（短い一言）を作る
function getComfortLabel(resolution) {
  if (resolution === "4k") return "4K高画質も楽しめる";
  if (resolution === "wqhd") return "WQHDの高画質で快適";
  return "フルHDで快適に遊べる";
}

// 予算・用途・解像度から初心者向けバッジを組み立てる
function getBeginnerBadges(result, profile) {
  const badges = [];
  const budget = parseInt(result.budget, 10) || 0;
  const caps = (profile && profile.capabilities) || [];
  const res = result.resolution;
  const usage = result.usage;
  const isGaming = usage === "fps" || usage === "mmo" || usage === "stream";

  if (budget <= 130000) badges.push("コスパ重視");
  if (budget <= 150000 && isGaming && res === "fhd") badges.push("はじめてのゲーミングPC向け");
  if (budget >= 150000 && budget <= 200000 && res === "fhd") badges.push("迷ったらこれ");
  if (budget >= 220000) badges.push("長く使える");
  if (usage === "stream" || caps.indexOf("配信可能") > -1) badges.push("配信も少しやりたい人向け");
  if (res === "wqhd" || res === "4k") badges.push("画質重視");
  if (usage === "fps") badges.push("高フレームレート向き");

  const unique = badges.filter((b, i) => badges.indexOf(b) === i);
  if (unique.length === 0) unique.push("迷ったらこれ");
  return unique.slice(0, 4);
}

// 用途・解像度から「こんな人に向いています」を作る
/* @param {object} [fit] 解像度適性。足りていない場合は
 *   「このクラス以上が安心です」のような、選んだ解像度を保証する
 *   言い回しを付けない（注意書きと矛盾するため）。 */
function getForWhomText(usage, resolution, fit) {
  const base = {
    fps: "Apexやフォートナイトなどの人気FPSを、安心して遊びたい人に向いています。",
    mmo: "FF14や原神などを、きれいな画面でゆったり遊びたい人に向いています。",
    stream: "ゲームをしながら、配信や録画も少しやってみたい人に向いています。",
    creative: "ゲームに加えて、動画編集などの作業もこなしたい人に向いています。",
    daily: "ネットや動画が中心で、軽めのゲームも楽しみたい人に向いています。",
  };
  let text = base[usage] || "自分に合うPCを無理なく選びたい人に向いています。";
  if (fit && fit.warns) return text;
  if (resolution === "wqhd") text += " 少し大きめできれいな画面（WQHD）で遊びたい人にもおすすめです。";
  if (resolution === "4k") text += " 4Kの最高画質で遊びたいなら、このクラス以上が安心です。";
  return text;
}

/** 不足時に代わりに勧める解像度の表示名（未判定なら空文字） */
function fitSuggestText(fit) {
  return fit && fit.suggestLabel ? fit.suggestLabel : "";
}

/* 「このグラボの得意な解像度」に出す見出し。
 *
 * プロファイル側の recommendedResolution は "FHD-WQHD / 1080p-1440p" のような
 * 幅のある表現で、GPU GUIDE (gpus.json) の target とは粒度が違う。
 * 両方を並べると「FHD-WQHD なのに フルHDがおすすめ」と食い違って見えるため、
 * gpus.json の target が読めているときはそちらを正とする。
 * （GPU性能データの正は GPU GUIDE 側、という方針にそろえる） */
function gpuTargetHeadline(fit, profile) {
  if (fit && fit.gpuTarget) {
    const level = getResolutionLevel(fit.gpuTarget);
    if (level !== null) return `${getResolutionShortLabel(level)}向け`;
  }
  return profile.recommendedResolution;
}

/**
 * 解像度が足りないときの注意書き。
 *
 * 構成を隠さず、不安を煽らず、「どうすればいいか」まで書く。
 * 足りている場合は何も出さない（余計な表示を増やさない）。
 */
/* このGPUが中古前提のモデルかどうか。
 *
 * ★GPU GUIDE の gpus.json は現行GPUと中古GPUの両方を載せている
 *   （情報データベースとしての役割）。一方 PC BUILD CHECK は
 *   「これから買うPCの構成」を出すので、役割が違う。
 *   builds.json の一部（10万円構成4件）に中古前提のGPUが入っており、
 *   これを何の断りもなく新品構成として見せると
 *   「店で新品が見つからない」という食い違いが起きる。
 *   構成を差し替えるのではなく、事実として伝える。 */
function isUsedMarketGpu(gpuName) {
  const links = window.SippoGpuLinks;
  if (!links || !links.isReady() || !Array.isArray(gpuData)) return false;
  const id = links.resolveId(gpuName);
  if (!id) return false;
  const gpu = gpuData.find((g) => g.id === id);
  return Boolean(gpu && gpu.market === "used");
}

/** 中古前提GPUを提示するときの注意書き。該当しなければ空文字。 */
/* 参考価格ブロック。
 *
 * 計算は shared/parts/build-price.js に集約している。ここで金額を組み立てない
 * （静的75ページ側と同じ数字を出すため）。
 *
 * 予算を超える構成でも、構成を作り替えるのではなく事実として超過を伝える。
 * 「10万円で4K」のように予算内では成立しない条件が実在するため、
 * 予算に収めた見た目を優先すると、今度は性能不足を隠すことになる。
 */
function renderPriceEstimate(build) {
  const api = window.SippoBuildPrice;
  if (!api || !partPrices || !build) return "";

  const estimate = api.calculateBuildEstimate(build, {
    prices: partPrices,
    gpuList: gpuData,
  });
  // 価格が1つでも欠けたら出さない。欠けたまま合計すると必ず安く見える。
  if (!estimate || estimate.total === null) return "";

  const fit = api.evaluateBudgetFit(estimate.total, build.budget);
  const overHtml = fit && fit.isOver
    ? `
      <p class="price-estimate-over">
        <span class="price-estimate-over-icon" aria-hidden="true">⚠️</span>
        ${fit.text}
      </p>`
    : "";

  return `
    <section class="price-estimate${fit && fit.isOver ? " price-estimate--over" : ""}">
      <div class="price-estimate-head">
        <span class="price-estimate-label">参考価格</span>
        <strong class="price-estimate-value">${api.formatEstimate(estimate.total)}</strong>
      </div>
      ${overHtml}
      <p class="price-estimate-note">${api.PRICE_DISCLAIMER}</p>
    </section>`;
}

/* 強化版の結果では金額を部品カード（想定価格）に出すので、ここでは
 * 予算超過の注意と価格の注記だけを出す（同じ金額を2回並べない）。 */
function renderPriceNotes(build) {
  const api = window.SippoBuildPrice;
  if (!api || !partPrices || !build) return "";
  const estimate = api.calculateBuildEstimate(build, { prices: partPrices, gpuList: gpuData });
  if (!estimate || estimate.total === null) return "";
  const fit = api.evaluateBudgetFit(estimate.total, build.budget);
  if (fit && fit.isOver) return renderPriceEstimate(build);
  return `<p class="price-estimate-note pb-price-note">${api.PRICE_DISCLAIMER}</p>`;
}

function renderUsedGpuNotice(gpuName) {
  if (!isUsedMarketGpu(gpuName)) return "";

  return `
    <div class="used-gpu-notice">
      <div class="used-gpu-notice-head">
        <span class="used-gpu-notice-icon" aria-hidden="true">🔍</span>
        <h4>${gpuName} は中古で探すのが前提のグラボです</h4>
      </div>
      <p class="used-gpu-notice-text">
        この価格帯で性能を確保するための選択です。新品での流通は少なくなっているため、
        中古ショップやフリマでの購入が中心になります。
        中古を避けたい場合は、予算を上げた構成も見てみてください。
      </p>
      <ul class="used-gpu-notice-points">
        <li>ファンの異音・高温・分解歴を確認する</li>
        <li>保証が短い、または無い場合がある</li>
        <li>状態や時期によって相場が変わる</li>
      </ul>
    </div>
  `;
}

function renderResolutionNotice(fit) {
  if (!fit || !fit.warns) return "";

  return `
    <div class="resolution-notice">
      <div class="resolution-notice-head">
        <span class="resolution-notice-icon" aria-hidden="true">💡</span>
        <h4>${fit.headline}</h4>
      </div>
      <p class="resolution-notice-text">${fit.detail}</p>
      <ul class="resolution-notice-options">
        <li><strong>${fit.suggestLabel}のモニターで使う</strong>ならこの構成のままでOKです</li>
        <li><strong>${fit.selectedLabel}にこだわる</strong>なら、予算を上げた構成も見てみてください</li>
      </ul>
    </div>
  `;
}

// 診断結果の下に置く相談導線（既存の /pc-consult/ へ誘導）
/* 相談室の申し込みは外部フォーム（Square→Googleフォーム／ココナラ）なので自動入力はできない。
 * 代わりに診断条件をURLで渡し、相談室側で「相談メモ」（コピーして貼れる文章）を表示する。
 * 渡すのは予算・用途・解像度の区分だけ。CPU/GPUは相談室側が builds.json から引く。 */
function renderConsultCta(query) {
  const href = query ? `/pc-consult/?from=pc-build-check&${query}#apply` : "/pc-consult/";
  return `
    <div class="result-consult pb-reveal">
      <div class="result-consult-head">
        <span class="result-consult-emoji" aria-hidden="true">🐾</span>
        <h4>この構成で迷ったら、相談できます</h4>
      </div>
      <p class="result-consult-text">「この構成で本当に大丈夫？」と思ったら、PCにくわしくなくて大丈夫。やさしい言葉で、いっしょに確認します。</p>
      <ul class="result-consult-list">
        <li>この構成で本当に大丈夫か確認したい</li>
        <li>中古PC候補がこの性能に近いか見てほしい</li>
        <li>予算内でどれを選べばいいか相談したい</li>
        <li>パーツ名が分からなくてもOK</li>
      </ul>
      <a class="result-consult-btn" href="${href}" data-track="pcbc_to_consult" data-location="result-cta">この構成で買って大丈夫か相談する →</a>
      <p class="result-consult-note">相談室のページに、今回の診断内容をまとめた「相談メモ」が表示されます。コピーして申し込みフォームに貼れます。</p>
    </div>
  `;
}

function renderMotherboardGuide(motherboardGuide) {
  if (!motherboardGuide) {
    return `
      <section class="result-panel motherboard-guide">
        <div class="result-panel-heading">
          <p class="result-label">Motherboard</p>
          <h4>マザーボード目安</h4>
        </div>
        <p class="motherboard-fallback">CPUに対応したソケットの製品を選択してください。</p>
        <p class="motherboard-note">※マザーボードはCPUソケット・チップセット・メモリ規格の互換性を確認してください。</p>
      </section>
    `;
  }

  return `
    <section class="result-panel motherboard-guide">
      <div class="result-panel-heading">
        <p class="result-label">Motherboard</p>
        <h4>マザーボード目安</h4>
      </div>
      <dl class="motherboard-guide-list">
        <div>
          <dt>ソケット</dt>
          <dd>${motherboardGuide.socket}</dd>
        </div>
        <div>
          <dt>チップセット</dt>
          <dd>${motherboardGuide.chipset}</dd>
        </div>
        <div>
          <dt>メモリ規格</dt>
          <dd>${motherboardGuide.memoryType}</dd>
        </div>
        <div>
          <dt>注意点</dt>
          <dd>${motherboardGuide.note}</dd>
        </div>
      </dl>
      <p class="motherboard-note">※マザーボードはCPUソケット・チップセット・メモリ規格の互換性を確認してください。同じチップセットでもDDR4版とDDR5版があるため、メモリ規格に注意してください。</p>
    </section>
  `;
}

/* 診断結果の下に出す「次のステップ」。
 * GPUが特定できるときは、GPU一覧ではなく **そのGPUの詳細ページ** へ直接送る。
 * ボタン文言も実際の遷移先に合わせる（「GPU詳細」と言って一覧に着地させない）。 */
function renderNextActions(gpuGuideUrl, gpuName, game) {
  const hasDetail = hasGpuDetailPage(gpuName);
  const gpuLabel = hasDetail ? `${gpuName} の詳細を見る` : "GPUを比較して選ぶ";
  const gpuNote = hasDetail
    ? "性能スコア・VRAM・相性のよいCPU"
    : "性能・価格帯からGPUを探せます";
  // 遊びたいゲームを選んでいれば、GAME PC GUIDE のそのゲームのページへ直接送る
  const P = window.SippoBuildProfile;
  const gameHref = game && P ? P.gameUrl(game) : "/game-pc-guide/";
  const gameLabel = game ? `${escapeHtml(game.title)}のおすすめPCを見る` : "ゲーム別おすすめPCを見る";
  const gameNote = game ? "GAME PC GUIDEで必要スペックを確認" : "遊びたいゲームから逆引き";

  return `
    <div class="next-action-section pb-reveal">
      <p class="next-action-label">次のステップ</p>
      <div class="next-action-grid">
        <a class="next-action-btn" href="${gpuGuideUrl}" data-track="pcbc_to_gpu_guide" data-location="next-actions">
          <span class="next-action-icon">🔍</span>
          <span class="next-action-text">
            <strong>${gpuLabel}</strong>
            <small>${gpuNote}</small>
          </span>
        </a>
        <a class="next-action-btn" href="${gameHref}" data-track="pcbc_to_game_guide" data-location="next-actions">
          <span class="next-action-icon">🎮</span>
          <span class="next-action-text">
            <strong>${gameLabel}</strong>
            <small>${gameNote}</small>
          </span>
        </a>
        <a class="next-action-btn" href="/upgrade/" data-track="pcbc_to_upgrade" data-location="next-actions">
          <span class="next-action-icon">🔧</span>
          <span class="next-action-text">
            <strong>今のPCを活かせるか調べる</strong>
            <small>買い替えずパーツ交換で足りるか診断</small>
          </span>
        </a>
        <a class="next-action-btn" href="#popular-builds" id="next-action-popular">
          <span class="next-action-icon">🏆</span>
          <span class="next-action-text">
            <strong>シッポのおすすめ構成を見る</strong>
            <small>運営が選んだ定番の構成</small>
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

/* GPU GUIDE のGPUデータ。解像度適性の判定にだけ使う。
 * 取得に失敗しても診断は従来どおり動く（適性判定だけ unknown になる）。
 * GPU GUIDE 側のデータを唯一の情報源にするため、
 * ここでGPUの性能値を持たない。 */
async function loadGpuData() {
  try {
    const response = await fetch("/gpu-guide/gpus.json");
    if (!response.ok) throw new Error("gpus.json fetch failed");
    gpuData = await response.json();
    // GPU名→個別ページURLの解決にも同じデータを使う（マスターは gpus.json 1つ）
    if (window.SippoGpuLinks) window.SippoGpuLinks.setCatalog(gpuData);
  } catch {
    gpuData = [];
  }
}

/* 参考価格の内訳データ。取得に失敗したら参考価格を出さないだけで、
 * 診断そのものは従来どおり動く。ここに価格の数値を持たない。 */
async function loadPartPrices() {
  try {
    const response = await fetch("/shared/parts/part-prices.json");
    if (!response.ok) throw new Error("part-prices.json fetch failed");
    partPrices = await response.json();
  } catch {
    partPrices = null;
  }
}

/* GAME PC GUIDE のゲーム一覧。「遊びたいゲーム」の選択肢と、診断結果の
 * 「このゲームならどこまで狙えるか」に使う。ゲーム名やURLをここに持たない
 * （ゲームを追加したら games.json だけ直せば両サイトに反映される）。
 * 必要になるまで読み込まない（詳細設定を開いたとき／診断したとき）。 */
let games = [];
let gamesPromise = null;
function loadGames() {
  if (!gamesPromise) {
    gamesPromise = fetch("/game-pc-guide/data/games.json")
      .then((response) => (response.ok ? response.json() : []))
      .then((list) => {
        games = Array.isArray(list) ? list : [];
        return games;
      })
      .catch(() => {
        games = [];
        return games;
      });
  }
  return gamesPromise;
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
// 診断・比較で「データが揃うまで待つ」ために Promise を持っておく
const buildsReady = loadBuilds();
const gpuReady = loadGpuData();
const pricesReady = loadPartPrices();

popularJumpButton.addEventListener("click", () => {
  popularBuildsSection.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
});

/* ==================================================================
 *  診断結果の強化（得意分野・理由・構成タイプ・±5万円・3構成比較・
 *  ゲーム・こだわり条件・URL共有・比較リスト）
 * ==================================================================
 *  判定と文言はすべて build-profile.js（window.SippoBuildProfile）が持つ。
 *  ここは「並べて見せる」ことだけを担当し、部品名・価格・閾値を書かない。
 *  静的75ページ（generate-builds.ps1）も同じ判定を使うので、
 *  ここで独自に言い換えると診断結果と個別ページで説明が食い違う。
 * ================================================================== */

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch {
    return false;
  }
}

/* GA4 計測。既存と同じ gtag('event', ...) 方式。計測は「おまけ」なので
 * 何があっても画面の動作を止めない（未読み込み・ブロック時は黙って何もしない）。 */
function trackEvent(name, params) {
  try {
    if (typeof window.gtag === "function") window.gtag("event", name, params || {});
  } catch {
    /* 計測失敗は無視 */
  }
}

function profileCtx() {
  return { prices: partPrices, gpuList: gpuData };
}

function toast(message) {
  const el = document.querySelector("#pcbc-toast");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("is-visible");
  // 同じ文言を連続で出しても読み上げ・アニメーションが走るよう一度外してから付ける
  void el.offsetWidth;
  el.classList.add("is-visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("is-visible"), 2600);
}

function shortStorage(storage) {
  return String(storage || "").replace(/\s*NVMe SSD$/, "");
}

/* ---------- 部品カード（あなたにはこの構成） ---------- */

function renderSpecGrid(a, gpuGuideUrl, fitHeadline) {
  const items = [
    { key: "cpu", icon: "🧠", label: "CPU", value: a.cpu },
    {
      key: "gpu",
      icon: "🎮",
      label: "GPU（グラボ）",
      value: a.gpu,
      extra: `<a class="pb-spec-link" href="${gpuGuideUrl}" data-track="pcbc_to_gpu_guide" data-location="spec-card">GPU GUIDEで見る →</a>`,
    },
    { key: "memory", icon: "🗂️", label: "メモリ", value: a.ram },
    { key: "storage", icon: "⚡", label: "SSD", value: a.storage },
    { key: "price", icon: "💴", label: "想定価格", value: a.priceText || `${a.budgetMan}万円前後`, total: a.priceText ? a.total : null, sub: a.priceText ? "参考価格（BTO完成品の目安）" : "予算の目安" },
    { key: "usage", icon: "🎯", label: "用途", value: a.usageLabel },
    { key: "res", icon: "🖥️", label: "推奨解像度", value: fitHeadline, sub: `選んだ条件: ${a.resolutionLabel}` },
  ];
  return `
    <ul class="pb-spec-grid">
      ${items.map((item, i) => `
        <li class="pb-spec pb-spec--${item.key} pb-assemble" style="--i:${i}">
          <span class="pb-spec-icon" aria-hidden="true">${item.icon}</span>
          <span class="pb-spec-label">${escapeHtml(item.label)}</span>
          <strong class="pb-spec-value"${item.total ? ` data-total="${item.total}"` : ""}>${escapeHtml(item.value)}</strong>
          ${item.sub ? `<small class="pb-spec-sub">${escapeHtml(item.sub)}</small>` : ""}
          ${item.extra || ""}
        </li>`).join("")}
    </ul>`;
}

function renderTypes(a) {
  if (!a.types.length) return "";
  return `
    <div class="pb-types pb-assemble" style="--i:7">
      <span class="pb-types-label">構成タイプ</span>
      ${a.types.map((t) => `<span class="pb-type pb-type--${escapeHtml(t.key)}">${escapeHtml(t.label)}</span>`).join("")}
    </div>`;
}

/* ---------- このPCの得意分野 ---------- */

function renderStrengths(a) {
  if (!a.strengths.length) return "";
  return `
    <section class="pb-section pb-reveal">
      <div class="pb-section-head">
        <p class="result-label">Strengths</p>
        <h4>このPCの得意分野</h4>
      </div>
      <ul class="pb-strengths">
        ${a.strengths.map((s, i) => `
          <li class="pb-strength" style="--i:${i}">
            <span class="pb-strength-label">${escapeHtml(s.label)}</span>
            <span class="pb-strength-bar" aria-hidden="true"><span style="width:${s.level * 20}%"></span></span>
            <strong class="pb-strength-text pb-level-${s.level}">${escapeHtml(s.text)}</strong>
          </li>`).join("")}
      </ul>
      <p class="pb-note">GPU単体の細かい性能比較は <a href="/gpu-guide/" data-track="pcbc_to_gpu_guide" data-location="strengths-note">GPU GUIDE</a> で見られます。ここでは「構成全体として何が得意か」をざっくり示しています。</p>
    </section>`;
}

/* ---------- この構成にした理由 ---------- */

function renderReasons(a, whyMessage) {
  if (!a.reasons.length && !whyMessage) return "";
  return `
    <section class="pb-section pb-reveal">
      <div class="pb-section-head">
        <p class="result-label">Why This Build</p>
        <h4>この構成にした理由</h4>
      </div>
      ${whyMessage ? `<p class="why-text">${whyMessage}</p>` : ""}
      <dl class="pb-reasons">
        ${a.reasons.map((r) => `<div><dt>${escapeHtml(r.label)}</dt><dd>${escapeHtml(r.text)}</dd></div>`).join("")}
      </dl>
    </section>`;
}

/* ---------- ±5万円比較 ---------- */

function renderDiffPanel(kind, cur, other) {
  const P = window.SippoBuildProfile;
  const isUp = kind === "up";
  const exp = isUp ? P.explainUp(cur, other) : P.explainDown(cur, other);
  const d = exp.diff;
  const priceDiff = P.formatPriceDiff(d.priceDiff);
  const unchanged = [
    ["GPU", "gpu"], ["CPU", "cpu"], ["メモリ", "ram"], ["SSD", "storage"],
  ].filter(([, f]) => cur[f] === other[f]).map(([label, f]) => `${label} ${f === "storage" ? shortStorage(cur[f]) : cur[f]}`);

  return `
    <div class="pb-diff-panel" data-panel="${kind}" role="tabpanel" ${isUp ? "" : "hidden"}>
      <div class="pb-diff-head">
        <div class="pb-diff-col">
          <span>今の構成</span>
          <strong>${cur.budgetMan}万円前後</strong>
          ${cur.priceText ? `<small>参考 ${escapeHtml(cur.priceText)}</small>` : ""}
        </div>
        <span class="pb-diff-arrow" aria-hidden="true">→</span>
        <div class="pb-diff-col is-target">
          <span>${isUp ? "5万円上げると" : "5万円下げると"}</span>
          <strong>${other.budgetMan}万円前後</strong>
          ${other.priceText ? `<small>参考 ${escapeHtml(other.priceText)}${priceDiff ? `（${escapeHtml(priceDiff)}）` : ""}</small>` : ""}
        </div>
      </div>
      <p class="pb-diff-headline">${escapeHtml(exp.headline)}</p>
      ${d.changes.length ? `
      <ul class="pb-diff-list">
        ${d.changes.map((c) => `
          <li>
            <span class="pb-diff-part">${escapeHtml(c.label)}</span>
            <span class="pb-diff-from">${escapeHtml(c.key === "storage" ? shortStorage(c.from) : c.from)}</span>
            <span class="pb-diff-to-arrow" aria-hidden="true">↓</span>
            <span class="pb-diff-to">${escapeHtml(c.key === "storage" ? shortStorage(c.to) : c.to)}</span>
          </li>`).join("")}
      </ul>` : ""}
      ${!isUp && exp.points && exp.points.length ? `
      <ul class="pb-points">${exp.points.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>` : ""}
      <p class="pb-diff-text">${escapeHtml(exp.text)}</p>
      ${unchanged.length && d.changes.length ? `<p class="pb-diff-same">変わらないもの: ${escapeHtml(unchanged.join(" / "))}</p>` : ""}
      <div class="pb-diff-actions">
        <button type="button" class="pb-btn pb-btn--primary" data-goto-slug="${escapeHtml(other.slug)}" data-goto-source="budget-${kind}">${other.budgetMan}万円の構成で診断し直す</button>
        <button type="button" class="pb-btn" data-compare-add="${escapeHtml(other.slug)}">＋ 比較候補に追加</button>
        <a class="pb-btn pb-btn--ghost" href="./builds/${escapeHtml(other.slug)}.html">詳細ページ</a>
      </div>
    </div>`;
}

function renderBudgetCompare(cur) {
  const P = window.SippoBuildProfile;
  const n = P.neighbors(builds, cur.build);
  const ctx = profileCtx();
  const down = n.down ? P.analyze(n.down, ctx) : null;
  const up = n.up ? P.analyze(n.up, ctx) : null;
  if (!down && !up) return "";

  // 片側しか無い（最低/最高予算）ときはタブを出さず、その1枚だけ見せる
  const tabs = down && up ? `
      <div class="pb-seg" role="tablist" aria-label="予算の比較方向">
        <button type="button" role="tab" class="pb-seg-btn" data-dir="down" aria-selected="false">− 5万円（${down.budgetMan}万円）</button>
        <button type="button" role="tab" class="pb-seg-btn is-active" data-dir="up" aria-selected="true">＋ 5万円（${up.budgetMan}万円）</button>
      </div>` : "";
  const edgeNote = !down
    ? `<p class="pb-edge-note">${cur.budgetMan}万円がいちばん安い予算帯なので、5万円上げた場合だけ表示しています。</p>`
    : !up
      ? `<p class="pb-edge-note">${cur.budgetMan}万円がいちばん高い予算帯なので、5万円下げた場合だけ表示しています。</p>`
      : "";

  let panels = "";
  if (down) panels += renderDiffPanel("down", cur, down).replace(/ hidden>/, up ? " hidden>" : ">");
  if (up) panels += renderDiffPanel("up", cur, up);

  return `
    <section class="pb-section pb-budget pb-reveal" data-budget-compare>
      <div class="pb-section-head">
        <p class="result-label">Budget ±5</p>
        <h4>予算を5万円変えると？</h4>
      </div>
      <p class="pb-lead">同じ${escapeHtml(cur.usageLabel)}・${escapeHtml(cur.resolutionLabel)}向けで、予算だけを変えた構成と比べます。<strong>何に5万円を払うのか</strong>が分かります。</p>
      ${tabs}
      ${edgeNote}
      ${panels}
    </section>`;
}

/* ---------- 近い予算の3構成 ---------- */

function renderTrio(cur) {
  const P = window.SippoBuildProfile;
  const ctx = profileCtx();
  const list = P.trio(builds, cur.build).map((t) => ({ ...t, a: P.analyze(t.build, ctx) }));
  if (list.length < 2) return "";

  const diffClass = (a, field) => (a.slug !== cur.slug && a[field] !== cur[field] ? " is-diff" : "");
  const cards = list.map((t, i) => {
    const a = t.a;
    const isCur = a.slug === cur.slug;
    return `
      <article class="pb-trio-card pb-trio-card--${t.role}${isCur ? " is-current" : ""}" style="--i:${i}">
        <span class="pb-trio-role">${escapeHtml(t.roleLabel)}</span>
        <strong class="pb-trio-budget">${a.budgetMan}万円前後</strong>
        <small class="pb-trio-price">${a.priceText ? `参考 ${escapeHtml(a.priceText)}` : "&nbsp;"}</small>
        <dl class="pb-trio-specs">
          <div class="${diffClass(a, "cpu")}"><dt>CPU</dt><dd>${escapeHtml(a.cpu)}</dd></div>
          <div class="${diffClass(a, "gpu")}"><dt>GPU</dt><dd>${escapeHtml(a.gpu)}</dd></div>
          <div class="${diffClass(a, "ram")}"><dt>メモリ</dt><dd>${escapeHtml(a.ram)}</dd></div>
          <div class="${diffClass(a, "storage")}"><dt>SSD</dt><dd>${escapeHtml(shortStorage(a.storage))}</dd></div>
          <div class="${a.slug !== cur.slug && a.gpuTargetLabel !== cur.gpuTargetLabel ? " is-diff" : ""}"><dt>得意な解像度</dt><dd>${escapeHtml(a.gpuTargetLabel ? `${a.gpuTargetLabel}向け` : "—")}</dd></div>
          <div><dt>特徴</dt><dd>${escapeHtml(a.types.map((x) => x.label).join("・") || "—")}</dd></div>
        </dl>
        <div class="pb-trio-actions">
          ${isCur
            ? `<span class="pb-trio-now">表示中の構成</span>`
            : `<button type="button" class="pb-btn pb-btn--primary" data-goto-slug="${escapeHtml(a.slug)}" data-goto-source="trio">この構成で診断</button>`}
          <button type="button" class="pb-btn" data-compare-add="${escapeHtml(a.slug)}">＋ 比較に追加</button>
        </div>
      </article>`;
  }).join("");

  return `
    <section class="pb-section pb-trio pb-reveal">
      <div class="pb-section-head">
        <p class="result-label">Compare</p>
        <h4>近い予算の${list.length}構成を比べる</h4>
      </div>
      <p class="pb-lead">色の付いた項目が、今の構成と違うところです。</p>
      <p class="pb-scroll-hint" aria-hidden="true"><span>←</span> 横にスワイプして比べられます <span>→</span></p>
      <div class="pb-trio-track" tabindex="0" aria-label="近い予算の構成比較（横にスクロールできます）">${cards}</div>
    </section>`;
}

/* ---------- 遊びたいゲーム ---------- */

/* 用途に近いジャンルの人気ゲームを最大3つ。ゲームを選んでいればそれを先頭に。 */
function pickGamesFor(usage, selectedId) {
  if (!games.length) return [];
  const genreFor = {
    fps: ["FPS", "TPS"],
    mmo: ["MMO", "RPG", "オープンワールド", "アクションRPG"],
  };
  const genres = genreFor[usage];
  const popular = games.filter((g) => g.popular);
  const pool = genres ? popular.filter((g) => genres.indexOf(g.genre) > -1) : popular;
  const list = [];
  const selected = games.find((g) => g.id === selectedId);
  if (selected) list.push(selected);
  (pool.length ? pool : popular).forEach((g) => {
    if (list.length < 3 && list.indexOf(g) < 0) list.push(g);
  });
  return list;
}

function renderGameFit(cur, selectedId) {
  const P = window.SippoBuildProfile;
  const list = pickGamesFor(cur.usage, selectedId)
    .map((g) => P.gameFit(cur, g, gpuData))
    .filter(Boolean);
  if (!list.length) return "";
  const statusLabel = { ok: "遊びやすい", partial: "設定次第", short: "少し厳しめ" };
  return `
    <section class="pb-section pb-games pb-reveal">
      <div class="pb-section-head">
        <p class="result-label">Games</p>
        <h4>${selectedId ? "遊びたいゲームで見ると" : "人気ゲームで見ると"}</h4>
      </div>
      <ul class="pb-game-list">
        ${list.map((f) => `
          <li class="pb-game pb-game--${f.status}${f.game.id === selectedId ? " is-selected" : ""}">
            <div class="pb-game-head">
              <strong>${escapeHtml(f.title)}</strong>
              <span class="pb-game-status">${statusLabel[f.status]}</span>
            </div>
            <p>${escapeHtml(f.text)}</p>
            <a href="${escapeHtml(f.url)}" data-track="pcbc_to_game_guide" data-location="game-fit">GAME PC GUIDEで詳しく見る →</a>
          </li>`).join("")}
      </ul>
      <p class="pb-note">GAME PC GUIDEの目安構成とGPU GUIDEの性能スコアを比べた判定です。${selectedId ? "" : "「もう少し細かく指定する」から遊びたいゲームを選べます。"}</p>
    </section>`;
}

/* ---------- こだわり条件 ---------- */

function renderPrefs(cur, prefKeys) {
  const P = window.SippoBuildProfile;
  const keys = P.sanitizePrefs(prefKeys);
  if (!keys.length) return "";
  const ctx = profileCtx();
  const checks = P.evaluatePrefs(cur, keys);
  const allOk = checks.every((c) => c.ok !== false);
  const rows = checks.map((c) => `
    <li class="pb-pref ${c.ok === true ? "is-ok" : c.ok === false ? "is-ng" : "is-unknown"}">
      <span class="pb-pref-mark" aria-hidden="true">${c.ok === true ? "✓" : c.ok === false ? "△" : "?"}</span>
      ${escapeHtml(c.label)}
      <small>${c.ok === true ? "この構成で満たせます" : c.ok === false ? "この構成では満たしきれません" : "判定できませんでした"}</small>
    </li>`).join("");

  let suggestion = "";
  if (!allOk) {
    const cand = P.findPrefCandidate(builds, cur, keys, ctx);
    suggestion = cand
      ? `
      <div class="pb-pref-cand">
        <p class="pb-pref-cand-head">条件に合わせるなら、この構成が近いです</p>
        <p class="pb-pref-cand-title">${escapeHtml(cand.title)}（${cand.budgetMan}万円前後${cand.priceText ? `・参考 ${escapeHtml(cand.priceText)}` : ""}）</p>
        <p class="pb-pref-cand-spec">CPU ${escapeHtml(cand.cpu)} / GPU ${escapeHtml(cand.gpu)} / メモリ ${escapeHtml(cand.ram)} / SSD ${escapeHtml(shortStorage(cand.storage))}</p>
        <div class="pb-diff-actions">
          <button type="button" class="pb-btn pb-btn--primary" data-goto-slug="${escapeHtml(cand.slug)}" data-goto-source="prefs">この構成で診断し直す</button>
          <button type="button" class="pb-btn" data-compare-add="${escapeHtml(cand.slug)}">＋ 比較候補に追加</button>
        </div>
      </div>`
      : `<p class="pb-pref-none">同じ予算〜5万円上までの構成では、すべての条件を満たすものが見つかりませんでした。優先したい条件をしぼるか、<a href="/pc-consult/" data-track="pcbc_to_consult" data-location="prefs">シッポPC相談室</a>で相談してみてください。</p>`;
  }

  let cheapNote = "";
  if (keys.indexOf("cheap") > -1) {
    const down = P.neighbors(builds, cur.build).down;
    if (!down) {
      cheapNote = `<p class="pb-pref-cheap">💡 ${cur.budgetMan}万円がいちばん安い予算帯です。さらに抑えるなら、<a href="/upgrade/" data-track="pcbc_to_upgrade" data-location="prefs-cheap">今のPCを活かすアップグレード</a>も検討してみてください。</p>`;
    } else {
      const d = P.analyze(down, ctx);
      cheapNote = d.fit !== "short"
        ? `<p class="pb-pref-cheap">💡 価格重視なら、5万円下の<strong>${d.budgetMan}万円の構成</strong>でも${escapeHtml(cur.resolutionLabel)}に対応できます。上の「予算を5万円変えると？」で何を妥協するか確認できます。</p>`
        : `<p class="pb-pref-cheap">💡 5万円下の構成だと${escapeHtml(cur.resolutionLabel)}では厳しめになります。価格を抑えるなら、解像度をひとつ下げるのも手です。</p>`;
    }
  }

  return `
    <section class="pb-section pb-prefs pb-reveal">
      <div class="pb-section-head">
        <p class="result-label">Your Wishes</p>
        <h4>こだわり条件のチェック</h4>
      </div>
      <ul class="pb-pref-list">${rows}</ul>
      ${suggestion}
      ${cheapNote}
    </section>`;
}

/* ---------- すでにPCを持っている場合 ---------- */

function renderUpgradeBox() {
  return `
    <div class="pb-upgrade pb-reveal">
      <span class="pb-upgrade-icon" aria-hidden="true">🔧</span>
      <div class="pb-upgrade-body">
        <strong>すでにPCを持っている場合</strong>
        <p>新しく買わなくても、GPUやメモリの交換だけで改善できる可能性があります。買い替える前に一度チェックしてみてください。</p>
      </div>
      <a class="pb-btn pb-btn--primary" href="/upgrade/" data-track="pcbc_to_upgrade" data-location="upgrade-box">PCアップグレード診断へ →</a>
    </div>`;
}

/* ---------- 共有・比較の操作ボタン ---------- */

function renderResultActions(cur) {
  return `
    <div class="pb-result-actions pb-anim" style="--i:8">
      <button type="button" class="pb-btn" data-compare-add="${escapeHtml(cur.slug)}">＋ 比較候補に追加</button>
      <button type="button" class="pb-btn" data-share-result>🔗 この診断結果を共有</button>
      <a class="pb-btn pb-btn--ghost" href="./builds/${escapeHtml(cur.slug)}.html">この構成の詳細ページ</a>
    </div>`;
}

/* ==================================================================
 *  診断の実行
 * ================================================================== */

let currentState = null;

function readFormState() {
  const prefs = Array.from(document.querySelectorAll('input[name="pref"]:checked')).map((el) => el.value);
  return {
    budget: form.budget.value,
    usage: form.usage.value,
    resolution: form.resolution.value,
    game: form.game ? form.game.value : "",
    prefs,
  };
}

function applyStateToForm(state) {
  if (state.budget) form.budget.value = state.budget;
  if (state.usage) form.usage.value = state.usage;
  if (state.resolution) form.resolution.value = state.resolution;
  document.querySelectorAll('input[name="pref"]').forEach((el) => {
    el.checked = (state.prefs || []).indexOf(el.value) > -1;
  });
  if (form.game && state.game) {
    // 選択肢が未生成なら、生成後に反映する（populateGameSelect が拾う）
    form.game.dataset.pending = state.game;
    form.game.value = state.game;
  }
  if ((state.prefs && state.prefs.length) || state.game) {
    const adv = document.querySelector("#advanced-options");
    if (adv) adv.open = true;
  }
  syncFilledFields();
}

function stateQuery(state) {
  const P = window.SippoBuildProfile;
  return P ? P.toQuery(state) : "";
}

function shareUrlFor(state) {
  return `${location.origin}${location.pathname}?${stateQuery(state)}`;
}

/* 診断条件をアドレスバーに残す（再読み込み・共有で同じ結果を再現できる）。
 * canonical は常に /pc-build-check/ なので、クエリ付きURLが別ページとして
 * インデックスされることはない。sitemap にも載せない。 */
function writeStateToUrl(state) {
  try {
    history.replaceState(null, "", `${location.pathname}?${stateQuery(state)}`);
  } catch {
    /* file:// など replaceState できない環境では何もしない */
  }
}

/* ==================================================================
 *  モーション（見た目の演出だけ。診断結果の中身には一切関与しない）
 * ==================================================================
 *  - transform / opacity だけを動かす（レイアウトを揺らさない）
 *  - 毎フレームのDOM更新は価格のカウントアップ1か所だけ（requestAnimationFrame）
 *  - prefers-reduced-motion のときは JS 側の演出も全部スキップし、最終状態をすぐ出す
 *    （CSS 側は style.css 共通ルールで animation / transition を即時完了させている）
 * ================================================================== */

/* クラスを付け直してアニメーションを1回だけ再生する（連打しても最初から） */
function replayClass(el, cls, ms) {
  if (!el || prefersReducedMotion()) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  clearTimeout(el._replayTimer);
  el._replayTimer = setTimeout(() => el.classList.remove(cls), ms || 700);
}

/* 診断中のステップ表示。本当の処理時間を示すものではないので、合計1秒弱に収める。
 * 最後の「構成が決まりました！」はデータが揃ってから出す（先走って完了を言わない）。 */
const CHECK_STEPS = ["予算を確認中…", "用途に合うCPUを選択…", "GPU性能をチェック…"];
const CHECK_DONE = "構成が決まりました！";

function showChecking() {
  resultArea.innerHTML = `
    <div class="pb-checking" role="status" aria-live="polite">
      <img class="pb-checking-sippo" src="https://sippo-pc.jp/assets/sippo/sippo-thinking.webp" alt="" width="64" height="64" decoding="async">
      <div class="pb-checking-body">
        <p class="pb-checking-text">構成をチェック中…</p>
        <ol class="pb-check-steps" aria-hidden="true">
          ${CHECK_STEPS.map((s) => `<li class="pb-check-step"><span class="pb-check-mark">✓</span>${s}</li>`).join("")}
        </ol>
      </div>
    </div>`;
}

/* ステップを順に進める。stepMs×3 経過で resolve（完了表示は finishChecking が出す） */
function playCheckingSteps(stepMs) {
  const steps = resultArea.querySelectorAll(".pb-check-step");
  const text = resultArea.querySelector(".pb-checking-text");
  if (!steps.length || stepMs <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    steps.forEach((li, i) => {
      setTimeout(() => {
        if (i > 0) steps[i - 1].classList.add("is-done");
        li.classList.add("is-active");
        if (text) text.textContent = CHECK_STEPS[i];
      }, i * stepMs);
    });
    setTimeout(resolve, steps.length * stepMs);
  });
}

async function finishChecking(holdMs) {
  const box = resultArea.querySelector(".pb-checking");
  if (!box || holdMs <= 0) return;
  box.querySelectorAll(".pb-check-step").forEach((li) => li.classList.add("is-done"));
  const text = box.querySelector(".pb-checking-text");
  if (text) text.textContent = CHECK_DONE + " 🐾";
  box.classList.add("is-done");
  const img = box.querySelector(".pb-checking-sippo");
  if (img) img.src = "https://sippo-pc.jp/assets/sippo/sippo-happy.webp";
  await wait(holdMs);
}

/* 表示中の結果を軽くフェードアウトしてから差し替える（「診断し直す」用） */
async function leaveCurrentResult() {
  const card = resultArea.querySelector(".result-card");
  if (!card || prefersReducedMotion()) return;
  card.classList.add("is-leaving");
  await wait(180);
}

/* 想定価格のカウントアップ。表示は既存と同じ「約〇万円」の粒度を守る
 * （途中だけ小数1桁、最後は build-price.js の formatEstimate と同じ文字列に戻す）。 */
function countUpPrice(el, total, finalText, delayMs) {
  if (!el || !Number.isFinite(total) || prefersReducedMotion() || typeof requestAnimationFrame !== "function") return;
  const duration = 650;
  el.textContent = "約0万円";
  setTimeout(() => {
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      if (t < 1) {
        el.textContent = `約${((total * eased) / 10000).toFixed(1)}万円`;
        requestAnimationFrame(tick);
      } else {
        el.textContent = finalText;
        replayClass(el, "is-counted", 500);
      }
    };
    requestAnimationFrame(tick);
  }, delayMs);
}

/* 診断完了の足跡（🐾 を3つ、ほんの一瞬）。PC幅だけ。紙吹雪のような量は出さない。 */
function showPawPrints(anchor) {
  if (!anchor || prefersReducedMotion()) return;
  if (window.matchMedia && !window.matchMedia("(min-width: 641px)").matches) return;
  const wrap = document.createElement("span");
  wrap.className = "pb-paws";
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = "<span>🐾</span><span>🐾</span><span>🐾</span>";
  anchor.appendChild(wrap);
  setTimeout(() => wrap.remove(), 1600);
}

/* 結果の各セクションを、画面に入ったときに一度だけ表示する */
let revealObserver = null;
function setupReveal(root) {
  const targets = root.querySelectorAll(".pb-reveal");
  if (!targets.length) return;
  if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
    targets.forEach((el) => el.classList.add("is-revealed"));
    return;
  }
  if (revealObserver) revealObserver.disconnect();
  revealObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-revealed");
      obs.unobserve(entry.target); // 一度出したら二度と隠さない
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  targets.forEach((el) => revealObserver.observe(el));
}

/* 結果を描画した直後に走らせる演出 */
function playResultMotion() {
  const card = resultArea.querySelector(".result-card--enhanced");
  if (!card) return;
  setupReveal(card);
  if (prefersReducedMotion()) return;
  const price = card.querySelector(".pb-spec--price .pb-spec-value");
  if (price && price.dataset.total) {
    // 価格カードの出現（5枚目＝約0.5秒後）に合わせて数え始める
    countUpPrice(price, Number(price.dataset.total), price.textContent, 480);
  }
  showPawPrints(card.querySelector(".pb-result-head"));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ゲーム一覧は無くても診断は出せる。遅いときは待ちすぎない。 */
function gamesWithin(ms) {
  return Promise.race([loadGames(), wait(ms)]);
}

async function runDiagnosis(state, options) {
  const opts = options || {};
  // 演出の長さ。通常は約0.7秒（ステップ170ms×3＋完了表示180ms）、
  // 「診断し直す」は短め、URLから開いたときと reduced motion は演出なし。
  const still = prefersReducedMotion() || opts.instant;
  const stepMs = still ? 0 : opts.quick ? 110 : 170;
  const holdMs = still ? 0 : opts.quick ? 140 : 180;

  setButtonLoading(true);
  await leaveCurrentResult();
  showChecking();
  if (opts.scroll !== false) resultArea.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "nearest" });

  await Promise.all([
    buildsReady, gpuReady, pricesReady, gamesWithin(1500),
    playCheckingSteps(stepMs),
  ]);
  if (builds.length === 0) await loadBuilds();
  await finishChecking(holdMs);
  setButtonLoading(false);

  const result = builds.find((build) => {
    return (
      build.budget === state.budget &&
      build.usage === state.usage &&
      build.resolution === state.resolution
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

  currentState = state;
  renderResult(result, state);
  playResultMotion();
  writeStateToUrl(state);
  trackEvent("pcbc_diagnose", {
    budget: state.budget,
    usage: state.usage,
    resolution: state.resolution,
    game: state.game || "",
    prefs: (state.prefs || []).join(","),
    source: opts.source || "form",
  });
  if (opts.scroll !== false) {
    resultArea.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }
}

function renderResult(result, state) {
  const P = window.SippoBuildProfile;
  const resolution = state.resolution;
  const usage = state.usage;

  const performanceProfile = getPerformanceProfile(result.gpu);
  const fpsByGame =
    performanceProfile.fps[resolution] || performanceProfile.fps.fhd || defaultPerformanceProfile.fps.fhd;
  const selectedResolutionLabel = getResolutionLabel(resolution);
  // 選択解像度に対してGPUが足りているか。gpus.json が読めていなければ unknown。
  const resolutionFit = getResolutionFit(result.gpu, resolution, gpuData);
  const gpuGuideUrl = createGpuGuideUrl(result.gpu);
  // 購入導線を描画。出せる商品が無ければ false → セクションは出さない
  const hasAffiliateLinks = updateAffiliateLinksForBuild(result);

  // 「なぜこの構成？」は選んだ解像度で通用する前提の文面
  // （例:「RTX 4060は4Kでも高画質設定での動作を実現できる」）。
  // 性能が足りていないときに出すと注意書きと正面から矛盾するため、
  // 足りているときだけ出す。代わりに注意書き側が理由を説明する。
  const whyMessage = resolutionFit.warns
    ? null
    : getWhyMessage(usage, resolution, result.gpu);
  // 快適さの一言は「選んだ解像度で快適に遊べる」と断言する文面なので、
  // 性能が足りていないと判定したときに出すと注意書きと矛盾する。
  // （例:「4Kで最高画質を堪能できます」の直下に「4Kは厳しめです」が並ぶ）
  // 足りているときだけ出す。
  const comfortMessage = resolutionFit.warns
    ? null
    : getComfortMessage(usage, resolution);

  const beginnerBadges = getBeginnerBadges(result, performanceProfile);
  // 快適バッジも選んだ解像度を前提にしているため、
  // 足りていないときは "実際に快適な解像度" を出す（嘘をつかない）。
  const comfortLabel = resolutionFit.warns && resolutionFit.suggestLabel
    ? `${resolutionFit.suggestLabel}で快適に遊べる`
    : getComfortLabel(resolution);
  const forWhomText = getForWhomText(usage, resolution, resolutionFit);
  const badgesHtml =
    `<span class="result-badge result-badge--comfort">😊 ${comfortLabel}</span>` +
    beginnerBadges.map((b) => `<span class="result-badge">${b}</span>`).join("");

  // build-profile.js が読めない場合（古いキャッシュ等）でも、従来の結果は必ず出す
  const cur = P ? P.analyze(result, profileCtx()) : null;
  const fitHeadline = gpuTargetHeadline(resolutionFit, performanceProfile);
  const selectedGame = state.game ? games.find((g) => g.id === state.game) : null;
  const query = stateQuery(state);

  resultArea.innerHTML = `
    <div class="result-card result-card--enhanced">
      <div class="pb-result-head pb-anim" style="--i:0">
        <img class="pb-result-sippo" src="https://sippo-pc.jp/assets/sippo/sippo-happy.webp" alt="" width="64" height="64" decoding="async">
        <div>
          <p class="result-label">Diagnosis Result</p>
          <p class="pb-result-lead">あなたにはこの構成がおすすめです</p>
          <h3>${result.title}</h3>
        </div>
      </div>

      <div class="result-summary pb-anim" style="--i:1">
        <div class="result-badges">${badgesHtml}</div>
        <p class="result-forwhom">${forWhomText}</p>
      </div>

      ${cur ? `
      <p class="specs-label">あなたにはこの構成<small>むずかしい用語は下の「PC選びのかんたんな見方」で説明しています</small></p>
      ${renderSpecGrid(cur, gpuGuideUrl, fitHeadline)}
      ${renderTypes(cur)}
      ${renderResultActions(cur)}
      ` : `
      <p class="specs-label">詳しい構成（パーツ）<small>むずかしい用語は下の「PC選びのかんたんな見方」で説明しています</small></p>
      <ul class="result-specs">
        <li><span>CPU</span>${result.cpu}</li>
        <li><span>GPU（グラボ）</span>${result.gpu}</li>
        <li><span>メモリ</span>${result.ram}</li>
        <li><span>ストレージ</span>${result.storage}</li>
      </ul>`}

      ${cur ? renderPriceNotes(result) : renderPriceEstimate(result)}

      ${renderResolutionNotice(resolutionFit)}

      ${renderUsedGpuNotice(result.gpu)}

      ${comfortMessage ? `
      <div class="comfort-message">
        <span class="comfort-icon">✅</span>
        <p>${comfortMessage}</p>
      </div>` : ''}

      ${cur ? renderStrengths(cur) : ""}

      ${cur ? renderReasons(cur, whyMessage) : whyMessage ? `
      <section class="why-panel">
        <div class="why-panel-heading">
          <p class="result-label">Why This Build</p>
          <h4>なぜこの構成？</h4>
        </div>
        <p class="why-text">${whyMessage}</p>
      </section>` : ''}

      ${cur ? renderBudgetCompare(cur) : ""}

      ${cur ? renderTrio(cur) : ""}

      ${cur ? renderGameFit(cur, state.game) : ""}

      ${cur ? renderPrefs(cur, state.prefs) : ""}

      <details class="pb-more pb-reveal">
        <summary>もっと詳しいデータ（想定fps・電源・マザーボード）</summary>
      <div class="result-insights">
        <!-- 「選んだ条件」「GPUの得意な解像度」「この構成でのおすすめ」は
             それぞれ別物なので、1つのカードにまとめない。 -->
        <div class="result-metrics">
          <div class="metric-card">
            <span>選んだ条件</span>
            <strong>${selectedResolutionLabel}</strong>
            <small>あなたが選んだ解像度</small>
          </div>
          <div class="metric-card${resolutionFit.warns ? " metric-card--warn" : ""}">
            <span>このグラボの得意な解像度</span>
            <strong>${fitHeadline}</strong>
            <small>${
              resolutionFit.warns
                ? `${fitSuggestText(resolutionFit)}のモニターがおすすめです`
                : "選んだ条件に対応できます"
            }</small>
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

        ${renderMotherboardGuide(result.motherboardGuide)}

        <a class="gpu-detail-button" href="${gpuGuideUrl}" data-track="pcbc_to_gpu_guide" data-location="detail-button">
          ${hasGpuDetailPage(result.gpu)
            ? `${result.gpu} の詳細スペックを見る →`
            : "グラボを比較して選ぶ →"}
        </a>
      </div>
      </details>

      ${renderUpgradeBox()}

      ${renderNextActions(gpuGuideUrl, result.gpu, selectedGame)}

      ${renderConsultCta(query)}
    </div>
  `;

  // 購入リンクが1つも無いときはセクションを出さない（空の枠を残さない）。
  // 「おすすめ構成へ」ボタンは購入リンクの有無に関係なく出す。
  affiliateSection.classList.toggle("hidden", !hasAffiliateLinks);
  popularJumpSection.classList.remove("hidden");

  const nextActionPopular = document.querySelector("#next-action-popular");
  if (nextActionPopular) {
    nextActionPopular.addEventListener("click", (e) => {
      e.preventDefault();
      popularBuildsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const state = readFormState();

  if (!state.budget || !state.usage || !state.resolution) {
    resultArea.innerHTML = `
      <div class="result-card">
        <p>すべての項目を選択してください。</p>
      </div>
    `;
    toggleAffiliateSection(false);
    return;
  }

  await runDiagnosis(state, { source: "form" });
});

/* 別の構成（±5万円・3構成比較・こだわり候補）で診断し直す。
 * フォームの値も書き換え、URLにも反映する（戻ったときに迷わないように）。 */
function diagnoseSlug(slug, source) {
  const P = window.SippoBuildProfile;
  const build = P && P.findBySlug(builds, slug);
  if (!build) return;
  const state = {
    budget: build.budget,
    usage: build.usage,
    resolution: build.resolution,
    game: currentState ? currentState.game : "",
    prefs: currentState ? currentState.prefs : [],
  };
  applyStateToForm(state);
  trackEvent("pcbc_switch_build", { source: source || "", slug });
  // 旧結果をフェードアウト → 短い診断演出 → 新しい結果が組み上がる
  runDiagnosis(state, { source: source || "switch", quick: true });
}

/* ==================================================================
 *  比較リスト（最大3構成・localStorage）
 * ==================================================================
 *  ユーザー登録なし・サーバー不要。保存するのは構成のスラグだけ。
 *  共有したいときは ?compare=slug,slug のURLにする（保存先はURL）。
 * ================================================================== */

const COMPARE_KEY = "sippo-pcbc-compare-v1";
const COMPARE_MAX = 3;
const SLUG_PATTERN = /^(fhd|wqhd|4k)-[a-z]+-\d+man$/;

function readCompareList() {
  try {
    const raw = JSON.parse(localStorage.getItem(COMPARE_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((s) => SLUG_PATTERN.test(s)).slice(0, COMPARE_MAX) : [];
  } catch {
    return [];
  }
}

function writeCompareList(list) {
  try {
    localStorage.setItem(COMPARE_KEY, JSON.stringify(list.slice(0, COMPARE_MAX)));
  } catch {
    /* プライベートブラウズ等で保存できなくても、画面の操作は続ける */
  }
  updateCompareBar();
}

function addToCompare(slug) {
  const list = readCompareList();
  if (list.indexOf(slug) > -1) {
    toast("すでに比較リストに入っています");
    return;
  }
  if (list.length >= COMPARE_MAX) {
    toast(`比較できるのは${COMPARE_MAX}つまでです。どれかを外してから追加してください`);
    replayClass(document.querySelector("#compare-bar"), "is-full", 500);
    openCompareDialog();
    return;
  }
  list.push(slug);
  writeCompareList(list);
  trackEvent("pcbc_compare_add", { slug, count: list.length });
  toast(`比較リストに追加しました（${list.length}/${COMPARE_MAX}）`);
  replayClass(document.querySelector("#compare-bar"), "is-bump", 600);
  replayClass(document.querySelector(".pb-result-sippo"), "is-react", 600);
}

function removeFromCompare(slug) {
  writeCompareList(readCompareList().filter((s) => s !== slug));
}

function updateCompareBar() {
  const bar = document.querySelector("#compare-bar");
  if (!bar) return;
  const count = readCompareList().length;
  const countEl = bar.querySelector("[data-compare-count]");
  if (countEl) countEl.textContent = String(count);
  document.body.classList.toggle("has-compare-bar", count > 0);
  clearTimeout(bar._hideTimer);
  if (count > 0) {
    // 空→1件目のときだけ下からスッと出す
    if (bar.hidden) {
      bar.hidden = false;
      replayClass(bar, "is-entering", 500);
    }
    bar.classList.remove("is-leaving");
  } else if (!bar.hidden) {
    if (prefersReducedMotion()) {
      bar.hidden = true;
    } else {
      bar.classList.add("is-leaving");
      bar._hideTimer = setTimeout(() => {
        bar.hidden = true;
        bar.classList.remove("is-leaving");
      }, 220);
    }
  }
}

function renderCompareTable(slugs) {
  const P = window.SippoBuildProfile;
  const ctx = profileCtx();
  const list = slugs.map((s) => P.findBySlug(builds, s)).filter(Boolean).map((b) => P.analyze(b, ctx));
  if (!list.length) {
    return `<p class="compare-empty">比較リストは空です。診断結果の「＋ 比較候補に追加」から、最大${COMPARE_MAX}つまで入れられます。</p>`;
  }
  const strengthRows = (P.STRENGTH_DEFS || []).map((def) => ({
    label: def.label,
    cell: (a) => {
      const s = a.strengths.find((x) => x.key === def.key);
      return s ? `<span class="pb-mini-bar" aria-hidden="true"><span style="width:${s.level * 20}%"></span></span>${escapeHtml(s.text)}` : "—";
    },
  }));
  const rows = [
    { label: "予算", cell: (a) => `<strong>${a.budgetMan}万円前後</strong>` },
    { label: "参考価格", cell: (a) => escapeHtml(a.priceText || "—") },
    { label: "用途", cell: (a) => escapeHtml(a.usageLabel) },
    { label: "選んだ解像度", cell: (a) => escapeHtml(a.resolutionLabel) },
    { label: "CPU", cell: (a) => escapeHtml(a.cpu), diff: "cpu" },
    { label: "GPU", cell: (a) => escapeHtml(a.gpu), diff: "gpu" },
    { label: "GPUの得意な解像度", cell: (a) => escapeHtml(a.gpuTargetLabel ? `${a.gpuTargetLabel}向け` : "—") },
    { label: "メモリ", cell: (a) => escapeHtml(a.ram), diff: "ram" },
    { label: "SSD", cell: (a) => escapeHtml(shortStorage(a.storage)), diff: "storage" },
    { label: "構成タイプ", cell: (a) => escapeHtml(a.types.map((t) => t.label).join("・") || "—") },
  ].concat(strengthRows);

  const head = list.map((a) => `
    <th scope="col">
      <span class="compare-col-title">${escapeHtml(a.title)}</span>
      <button type="button" class="compare-remove" data-compare-remove="${escapeHtml(a.slug)}" aria-label="${escapeHtml(a.title)}を比較から外す">外す</button>
    </th>`).join("");
  const body = rows.map((row) => {
    const values = list.map((a) => (row.diff ? a[row.diff] : null));
    const differs = row.diff && values.some((v) => v !== values[0]);
    return `<tr${differs ? ' class="is-diff"' : ""}><th scope="row">${escapeHtml(row.label)}</th>${list.map((a) => `<td>${row.cell(a)}</td>`).join("")}</tr>`;
  }).join("");
  const links = `<tr class="compare-links"><th scope="row">詳しく</th>${list.map((a) => `
    <td>
      <button type="button" class="pb-btn pb-btn--primary" data-goto-slug="${escapeHtml(a.slug)}" data-goto-source="compare">この構成で診断</button>
      <a class="pb-btn pb-btn--ghost" href="./builds/${escapeHtml(a.slug)}.html">詳細ページ</a>
    </td>`).join("")}</tr>`;

  return `
    <p class="pb-scroll-hint compare-scroll-hint" aria-hidden="true"><span>←</span> 横にスクロールできます <span>→</span></p>
    <div class="compare-table-wrap" tabindex="0" aria-label="構成の比較表">
      <table class="compare-table">
        <thead><tr><th scope="col" class="compare-corner">項目</th>${head}</tr></thead>
        <tbody>${body}${links}</tbody>
      </table>
    </div>
    <p class="pb-note">色の付いた行は、構成によってパーツが違うところです。</p>`;
}

/* shared = URLで共有された比較を見ているとき（自分のリストは書き換えない） */
let compareDialogShared = null;

async function openCompareDialog(sharedSlugs) {
  const dialog = document.querySelector("#compare-dialog");
  if (!dialog) return;
  await Promise.all([buildsReady, gpuReady, pricesReady]);
  compareDialogShared = sharedSlugs && sharedSlugs.length ? sharedSlugs : null;
  refreshCompareDialog();
  if (typeof dialog.showModal === "function") {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
  trackEvent("pcbc_compare_open", { count: (compareDialogShared || readCompareList()).length, shared: Boolean(compareDialogShared) });
}

function refreshCompareDialog() {
  const body = document.querySelector("#compare-dialog-body");
  if (!body) return;
  const slugs = compareDialogShared || readCompareList();
  const sharedNote = compareDialogShared
    ? `<div class="compare-shared-note">共有された比較を表示しています。<button type="button" class="pb-btn" data-compare-save-shared>自分の比較リストに保存</button></div>`
    : "";
  body.innerHTML = sharedNote + renderCompareTable(slugs);
  const shareBtn = document.querySelector("[data-compare-share]");
  if (shareBtn) shareBtn.hidden = slugs.length < 2;
}

function closeCompareDialog() {
  const dialog = document.querySelector("#compare-dialog");
  if (!dialog) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

/* ==================================================================
 *  共有
 * ================================================================== */

async function shareUrl(url, title, text, kind) {
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      trackEvent("pcbc_share", { method: "web_share", kind });
      return;
    }
  } catch (err) {
    if (err && err.name === "AbortError") return; // ユーザーが閉じただけ
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("URLをコピーしました。SNSやメッセージに貼り付けて共有できます");
    trackEvent("pcbc_share", { method: "copy", kind });
  } catch {
    // クリップボードが使えない環境では、URLを見せて手でコピーしてもらう
    window.prompt("このURLをコピーして共有してください", url);
    trackEvent("pcbc_share", { method: "prompt", kind });
  }
}

function shareCurrentResult() {
  if (!currentState) return;
  const P = window.SippoBuildProfile;
  const build = P && P.findBuild(builds, currentState.budget, currentState.usage, currentState.resolution);
  const text = build
    ? `PC BUILD CHECKの診断結果：${P.budgetMan(build.budget)}万円前後・${P.USAGE_LABELS[build.usage]}・${P.RES_LABELS[build.resolution]}なら「${build.cpu} / ${build.gpu}」`
    : "PC BUILD CHECKの診断結果";
  shareUrl(shareUrlFor(currentState), "PC BUILD CHECKの診断結果", text, "result");
}

function shareCompare() {
  const slugs = compareDialogShared || readCompareList();
  if (slugs.length < 2) return;
  const url = `${location.origin}${location.pathname}?compare=${slugs.join(",")}`;
  shareUrl(url, "PC BUILD CHECKの構成比較", "PC BUILD CHECKで構成を比較しました", "compare");
}

/* ==================================================================
 *  詳細設定（もう少し細かく指定する）
 * ================================================================== */

function renderPrefChips() {
  const box = document.querySelector("#pref-chips");
  const P = window.SippoBuildProfile;
  if (!box || !P) return;
  box.innerHTML = P.PREFS.map((p) => `
    <label class="pref-chip">
      <input type="checkbox" name="pref" value="${escapeHtml(p.key)}">
      <span>${escapeHtml(p.label)}</span>
    </label>`).join("");
}

async function populateGameSelect() {
  const select = document.querySelector("#game-select");
  if (!select || select.dataset.ready === "1") return;
  const list = await loadGames();
  if (!list.length) {
    select.innerHTML = `<option value="">ゲーム一覧を読み込めませんでした</option>`;
    return;
  }
  const option = (g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.title)}</option>`;
  const popular = list.filter((g) => g.popular);
  const others = list.filter((g) => !g.popular);
  select.innerHTML = `<option value="">選ばない</option>` +
    (popular.length ? `<optgroup label="人気のゲーム">${popular.map(option).join("")}</optgroup>` : "") +
    (others.length ? `<optgroup label="そのほかのゲーム">${others.map(option).join("")}</optgroup>` : "");
  select.dataset.ready = "1";
  const pending = select.dataset.pending;
  if (pending && list.some((g) => g.id === pending)) select.value = pending;
  syncFilledFields();
}

/* 選んだ項目のカードを少し浮かせる（入力に反応するアニメーション） */
function syncFilledFields() {
  document.querySelectorAll(".diagnosis-form .form-field").forEach((field) => {
    const select = field.querySelector("select");
    field.classList.toggle("is-filled", Boolean(select && select.value));
  });
}

/* 予算・用途・解像度の3つがそろった瞬間に、診断ボタンへ一度だけ光を通す */
let formWasReady = false;
function syncReadyButton() {
  const ready = Boolean(form.budget.value && form.usage.value && form.resolution.value);
  if (ready && !formWasReady) replayClass(diagnosisButton, "is-ready-flash", 900);
  formWasReady = ready;
}

/* ==================================================================
 *  初期化
 * ================================================================== */

function initEnhancements() {
  if (!window.SippoBuildProfile) return; // 読み込めなければ従来の診断だけ動かす

  renderPrefChips();
  updateCompareBar();

  const introSippo = document.querySelector(".sippo-intro__img");
  form.addEventListener("change", (e) => {
    if (!e.target || e.target.tagName !== "SELECT") return;
    syncFilledFields();
    // 選んだ項目が軽くポップし、案内役のシッポが小さく跳ねる
    replayClass(e.target.closest(".form-field"), "is-just-filled", 400);
    replayClass(introSippo, "is-hop", 500);
    syncReadyButton();
  });
  // 診断開始でシッポが軽く左右に揺れる
  form.addEventListener("submit", () => replayClass(introSippo, "is-wiggle", 600));

  const adv = document.querySelector("#advanced-options");
  if (adv) {
    adv.addEventListener("toggle", () => {
      if (adv.open) populateGameSelect();
    });
  }

  // 結果エリア・比較ダイアログ内のボタンはイベント委譲でまとめて扱う
  document.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;

    const seg = target.closest(".pb-seg-btn");
    if (seg) {
      const section = seg.closest("[data-budget-compare]");
      const dir = seg.getAttribute("data-dir");
      section.querySelectorAll(".pb-seg-btn").forEach((b) => {
        const on = b === seg;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      section.querySelectorAll(".pb-diff-panel").forEach((panel) => {
        const show = panel.getAttribute("data-panel") === dir;
        panel.hidden = !show;
        // +5万円は右から、−5万円は左から入る。変わった部品だけが光る（CSS側）
        if (show) replayClass(panel, dir === "up" ? "is-enter-right" : "is-enter-left", 1200);
      });
      trackEvent("pcbc_budget_compare", { direction: dir });
      return;
    }

    const gotoBtn = target.closest("[data-goto-slug]");
    if (gotoBtn) {
      closeCompareDialog();
      diagnoseSlug(gotoBtn.getAttribute("data-goto-slug"), gotoBtn.getAttribute("data-goto-source"));
      return;
    }

    const addBtn = target.closest("[data-compare-add]");
    if (addBtn) {
      addToCompare(addBtn.getAttribute("data-compare-add"));
      return;
    }

    const removeBtn = target.closest("[data-compare-remove]");
    if (removeBtn) {
      const slug = removeBtn.getAttribute("data-compare-remove");
      if (compareDialogShared) compareDialogShared = compareDialogShared.filter((s) => s !== slug);
      else removeFromCompare(slug);
      // 外した列だけ縮めて消してから表を作り直す（保存は先に済ませている）
      const th = removeBtn.closest("th");
      const table = removeBtn.closest("table");
      if (th && table && !prefersReducedMotion()) {
        const col = Array.prototype.indexOf.call(th.parentNode.children, th);
        table.querySelectorAll("tr").forEach((tr) => {
          if (tr.children[col]) tr.children[col].classList.add("is-removing");
        });
        setTimeout(refreshCompareDialog, 200);
      } else {
        refreshCompareDialog();
      }
      return;
    }

    if (target.closest("[data-compare-save-shared]")) {
      writeCompareList(compareDialogShared || []);
      compareDialogShared = null;
      refreshCompareDialog();
      toast("比較リストに保存しました");
      return;
    }

    if (target.closest("[data-compare-open]")) {
      openCompareDialog();
      return;
    }
    if (target.closest("[data-compare-close]")) {
      closeCompareDialog();
      return;
    }
    if (target.closest("[data-compare-clear]")) {
      if (compareDialogShared) compareDialogShared = [];
      else writeCompareList([]);
      refreshCompareDialog();
      return;
    }
    if (target.closest("[data-compare-share]")) {
      shareCompare();
      return;
    }
    if (target.closest("[data-share-result]")) {
      shareCurrentResult();
      return;
    }

    // 他サービスへの遷移計測（GPU GUIDE / GAME PC GUIDE / Upgrade / 相談室）。遷移は止めない。
    // 相談室（pc-consult/main.js）と同じ規約: イベント名 = data-track / 掲載位置 = data-location。
    const tracked = target.closest("a[data-track]");
    if (tracked) {
      trackEvent(tracked.getAttribute("data-track"), {
        service_location: tracked.getAttribute("data-location") || "",
        link_url: tracked.href,
        link_text: (tracked.textContent || "").trim().slice(0, 100),
        page_path: location.pathname,
      });
    }
  });

  // ダイアログの外側（背景）クリックで閉じる
  const dialog = document.querySelector("#compare-dialog");
  if (dialog) {
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) closeCompareDialog();
    });
  }

  // 別タブで比較リストを変えたときに件数をそろえる
  window.addEventListener("storage", (e) => {
    if (e.key === COMPARE_KEY) updateCompareBar();
  });

  // URLに診断条件があれば、同じ条件で診断を再現する（共有URL・再読み込み）
  const state = window.SippoBuildProfile.fromQuery(location.search);
  if (state.game) {
    populateGameSelect();
  }
  if (state.budget && state.usage && state.resolution) {
    applyStateToForm(state);
    buildsReady.then(() => runDiagnosis(state, { source: "url", instant: true }));
  }
  if (state.compare.length) {
    openCompareDialog(state.compare);
  }
}

if (typeof location !== "undefined") {
  initEnhancements();
}


/* ==================================================================
 *  テスト用の公開
 * ==================================================================
 *  診断ロジックを node から検証できるようにする
 *  （pc-build-check/test-build-check.js が参照）。
 *  ブラウザの動作には影響しない。
 * ================================================================== */
if (typeof window !== "undefined") {
  window.PcBuildCheckLogic = {
    gpuPerformanceProfiles,
    defaultPerformanceProfile,
    normalizeText,
    normalizeGpuKey,
    findGpuData,
    getPerformanceProfile,
    getPerformanceProfileIndex,
    getResolutionLevel,
    getResolutionShortLabel,
    getResolutionLabel,
    getResolutionFit,
    getComfortMessage,
    getWhyMessage,
    getComfortLabel,
    getForWhomText,
  };
}
