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
let gpuData = [];

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
    fps: "フルHDでApexやフォートナイトなどの人気FPSを、安心して遊びたい人に向いています。",
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
function renderConsultCta() {
  return `
    <div class="result-consult">
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
      <a class="result-consult-btn" href="/pc-consult/">シッポに相談してみる →</a>
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
function renderNextActions(gpuGuideUrl, gpuName) {
  const hasDetail = hasGpuDetailPage(gpuName);
  const gpuLabel = hasDetail ? `${gpuName} の詳細を見る` : "GPUを比較して選ぶ";
  const gpuNote = hasDetail
    ? "性能スコア・VRAM・相性のよいCPU"
    : "性能・価格帯からGPUを探せます";

  return `
    <div class="next-action-section">
      <p class="next-action-label">次のステップ</p>
      <div class="next-action-grid">
        <a class="next-action-btn" href="${gpuGuideUrl}">
          <span class="next-action-icon">🔍</span>
          <span class="next-action-text">
            <strong>${gpuLabel}</strong>
            <small>${gpuNote}</small>
          </span>
        </a>
        <a class="next-action-btn" href="/game-pc-guide/">
          <span class="next-action-icon">🎮</span>
          <span class="next-action-text">
            <strong>ゲーム別おすすめPCを見る</strong>
            <small>遊びたいゲームから逆引き</small>
          </span>
        </a>
        <a class="next-action-btn" href="/upgrade/">
          <span class="next-action-icon">🔧</span>
          <span class="next-action-text">
            <strong>今のPCを活かせるか調べる</strong>
            <small>買い替えずパーツ交換で足りるか診断</small>
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
loadGpuData();

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

  resultArea.innerHTML = `
    <div class="result-card">
      <p class="result-label">Diagnosis Result</p>

      <h3>${result.title}</h3>

      <div class="result-summary">
        <div class="result-badges">${badgesHtml}</div>
        <p class="result-forwhom">${forWhomText}</p>
      </div>

      <p class="specs-label">詳しい構成（パーツ）<small>むずかしい用語は下の「PC選びのかんたんな見方」で説明しています</small></p>
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

      ${renderResolutionNotice(resolutionFit)}

      ${renderUsedGpuNotice(result.gpu)}

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
            <strong>${gpuTargetHeadline(resolutionFit, performanceProfile)}</strong>
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

        <a class="gpu-detail-button" href="${gpuGuideUrl}">
          ${hasGpuDetailPage(result.gpu)
            ? `${result.gpu} の詳細スペックを見る →`
            : "グラボを比較して選ぶ →"}
        </a>
      </div>

      ${renderNextActions(gpuGuideUrl, result.gpu)}

      ${renderConsultCta()}
    </div>
  `;

  // 購入リンクが1つも無いときはセクションを出さない（空の枠を残さない）。
  // 「人気構成ランキングへ」ボタンは購入リンクの有無に関係なく出す。
  affiliateSection.classList.toggle("hidden", !hasAffiliateLinks);
  popularJumpSection.classList.remove("hidden");

  resultArea.scrollIntoView({ behavior: "smooth", block: "nearest" });

  const nextActionPopular = document.querySelector("#next-action-popular");
  if (nextActionPopular) {
    nextActionPopular.addEventListener("click", (e) => {
      e.preventDefault();
      popularBuildsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
});

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
