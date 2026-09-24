/*
 * pc-build-check/build-profile.js
 *
 * 「この構成がどんなPCか」を判定する唯一の場所。
 *   - 構成タイプ（GPU重視型 / バランス型 …）
 *   - このPCの得意分野（ゲーム性能・配信・動画編集 …）
 *   - この構成にした理由（CPU / GPU / メモリ / SSD）
 *   - ±5万円比較（何に5万円払うのか / 何を妥協するのか）
 *   - 近い予算3構成の比較
 *   - 遊びたいゲームでの目安（GAME PC GUIDE の games.json を読む）
 *   - 詳細設定（こだわり条件）の判定
 *
 * 設計方針
 *  - 数値や部品名をここに書かない。判定材料は次の既存マスターだけ:
 *      pc-build-check/builds.json      … 75構成（CPU/GPU/メモリ/SSD/予算/用途/解像度）
 *      gpu-guide/gpus.json             … GPUの性能スコア・得意解像度・VRAM・メーカー
 *      shared/parts/part-prices.json   … 参考価格の内訳・CPUのコア数/X3D
 *      game-pc-guide/data/games.json   … ゲームごとの目安構成
 *    構成やGPUを更新したら、ここを触らなくても表示が追従する。
 *  - 診断画面（script.js）と静的75ページ（generate-builds.ps1 → compute-profiles.js）と
 *    トップの静的一覧（generate-index-sections.js）が同じ関数を使う。
 *    片方だけ文言や判定を変えると、トップと個別ページで説明が食い違う。
 *  - 判定は「初心者に伝わる粗さ」に留める。細かい独自スコアは作らない。
 *    GPU単体の詳しい性能比較は GPU GUIDE の役割。
 *  - 分からないものは分からないまま扱う（null）。それらしい値を捏造しない。
 *
 * ブラウザでは <script> で読み込むと window.SippoBuildProfile に生える
 * （先に /shared/parts/build-price.js を読み込むこと）。
 * Node（テスト・静的生成）では require() できる。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../shared/parts/build-price.js"));
  } else {
    root.SippoBuildProfile = factory(root.SippoBuildPrice);
  }
})(typeof self !== "undefined" ? self : this, function (BuildPrice) {
  "use strict";

  /* ---------- 表示ラベル（フォームの value と対応） ---------- */

  var USAGE_LABELS = {
    fps: "FPSゲーム",
    mmo: "MMO・RPG",
    stream: "配信・録画",
    creative: "動画編集・制作",
    daily: "普段使い",
  };
  var RES_LABELS = { fhd: "フルHD", wqhd: "WQHD", "4k": "4K" };
  var RES_LEVELS = { fhd: 1, wqhd: 2, "4k": 3 };
  // ±5万円比較の刻み。予算の選択肢（10万〜30万円・5万円刻み）と同じ。
  var BUDGET_STEP = 50000;

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ---------- 構成の識別 ---------- */

  function budgetMan(budget) {
    return Math.round(Number(budget) / 10000);
  }

  /* 静的ページのスラグ。generate-builds.ps1 の Get-Slug と同じ規則
   * （解像度-用途-予算man）。builds.json は条件ごとに1件なので衝突しない。 */
  function slugOf(build) {
    return build.resolution + "-" + build.usage + "-" + budgetMan(build.budget) + "man";
  }

  function findBuild(builds, budget, usage, resolution) {
    if (!Array.isArray(builds)) return null;
    var bd = String(budget);
    for (var i = 0; i < builds.length; i += 1) {
      var b = builds[i];
      if (String(b.budget) === bd && b.usage === usage && b.resolution === resolution) return b;
    }
    return null;
  }

  function findBySlug(builds, slug) {
    if (!Array.isArray(builds)) return null;
    for (var i = 0; i < builds.length; i += 1) {
      if (slugOf(builds[i]) === slug) return builds[i];
    }
    return null;
  }

  /** builds.json に実在する予算を昇順で返す（選択肢をここに固定しない） */
  function listBudgets(builds) {
    var seen = {};
    var list = [];
    (builds || []).forEach(function (b) {
      var n = Number(b.budget);
      if (!seen[n]) { seen[n] = true; list.push(n); }
    });
    return list.sort(function (a, b) { return a - b; });
  }

  /* ---------- 部品の読み取り ---------- */

  function parseGb(text) {
    var m = String(text || "").match(/(\d+(?:\.\d+)?)\s*GB/i);
    return m ? Number(m[1]) : null;
  }

  function parseTb(text) {
    var s = String(text || "");
    var tb = s.match(/(\d+(?:\.\d+)?)\s*TB/i);
    if (tb) return Number(tb[1]);
    var gb = s.match(/(\d+)\s*GB/i);
    return gb ? Number(gb[1]) / 1000 : null;
  }

  function findGpu(name, gpuList) {
    if (!Array.isArray(gpuList) || !name) return null;
    var key = BuildPrice.normalizeGpuName(name);
    for (var i = 0; i < gpuList.length; i += 1) {
      if (BuildPrice.normalizeGpuName(gpuList[i] && gpuList[i].name) === key) return gpuList[i];
    }
    return null;
  }

  function resLevelOf(value) {
    if (!value) return null;
    var key = String(value).toLowerCase().trim();
    return Object.prototype.hasOwnProperty.call(RES_LEVELS, key) ? RES_LEVELS[key] : null;
  }

  function resLabelOfLevel(level) {
    for (var k in RES_LEVELS) {
      if (RES_LEVELS[k] === level) return RES_LABELS[k];
    }
    return null;
  }

  function isNvidia(gpuInfo, gpuName) {
    if (gpuInfo && gpuInfo.brand) return String(gpuInfo.brand).toUpperCase() === "NVIDIA";
    return /geforce|rtx|gtx/i.test(String(gpuName || ""));
  }

  /* ---------- 得意分野 ---------- */

  /* 5段階。数字はバーの長さにだけ使い、画面では言葉で伝える。
   * 閾値は gpus.json の score（GPU GUIDE と同じ尺度）とCPUのコア数から決める。 */
  var STRENGTH_DEFS = [
    {
      key: "gaming",
      label: "ゲーム性能",
      texts: { 1: "控えめ", 2: "軽め〜中量級向け", 3: "十分", 4: "強い", 5: "かなり強い" },
    },
    {
      key: "highfps",
      label: "高FPSゲーム",
      texts: { 1: "苦手", 2: "軽いゲームなら", 3: "対応できる", 4: "得意", 5: "かなり得意" },
    },
    {
      key: "stream",
      label: "配信・録画",
      texts: { 1: "苦手", 2: "軽めならOK", 3: "問題なし", 4: "余裕あり", 5: "かなり余裕" },
    },
    {
      key: "edit",
      label: "動画編集",
      texts: { 1: "苦手", 2: "軽い編集ならOK", 3: "問題なし", 4: "得意", 5: "かなり得意" },
    },
    {
      key: "fourk",
      label: "4Kゲーム",
      texts: { 1: "厳しめ", 2: "軽いゲームなら", 3: "タイトル次第", 4: "得意", 5: "かなり得意" },
    },
    {
      key: "future",
      label: "将来性",
      texts: { 1: "控えめ", 2: "ふつう", 3: "しばらく安心", 4: "余裕あり", 5: "かなり余裕" },
    },
  ];

  function clampLevel(n) {
    return Math.max(1, Math.min(5, n));
  }

  function gpuTier(score) {
    if (score < 60) return 2;
    if (score < 72) return 3;
    if (score < 85) return 4;
    return 5;
  }

  function strengthLevels(a) {
    var score = a.gpuInfo ? Number(a.gpuInfo.score) : null;
    var cores = a.cpuInfo ? Number(a.cpuInfo.cores) : null;
    var levels = {};

    if (Number.isFinite(score)) {
      levels.gaming = gpuTier(score);
      levels.highfps = clampLevel(gpuTier(score) + (a.cpuInfo && a.cpuInfo.x3d ? 1 : 0));
      var target = resLevelOf(a.gpuInfo.target);
      if (target === 3) levels.fourk = score >= 93 ? 5 : 4;
      else if (target === 2) levels.fourk = score >= 83 ? 3 : 2;
      else if (target === 1) levels.fourk = 1;
    }

    if (Number.isFinite(cores) && a.ramGb) {
      var base = cores >= 12 ? 4 : cores >= 8 ? 3 : 2;
      var stream = base + (a.ramGb >= 32 ? 1 : 0);
      if (a.ramGb < 32) stream = Math.min(stream, 2);
      levels.stream = clampLevel(stream);

      var edit = base + (a.ramGb >= 64 ? 1 : 0);
      if (a.ramGb < 32) edit = Math.min(edit, 2);
      levels.edit = clampLevel(edit);
    }

    if (a.socket && a.ramGb) {
      // 新しいソケット（AM5）はCPUだけ後から載せ替えやすい。VRAMと性能の余裕も加点。
      var future = a.socket === "AM4" ? 1 : 2;
      if (a.ramGb >= 32) future += 1;
      if (a.gpuInfo && Number(a.gpuInfo.vram) >= 16) future += 1;
      if (Number.isFinite(score) && score >= 85) future += 1;
      levels.future = clampLevel(future);
    }

    return levels;
  }

  function buildStrengths(a) {
    var levels = strengthLevels(a);
    var score = a.gpuInfo ? Number(a.gpuInfo.score) : null;
    return STRENGTH_DEFS.filter(function (def) {
      return levels[def.key] != null;
    }).map(function (def) {
      var level = levels[def.key];
      var text = def.texts[level];
      if (def.key === "gaming" && score >= 93) text = "最上位クラス";
      return { key: def.key, label: def.label, level: level, text: text };
    });
  }

  /* ---------- 構成タイプ ---------- */

  // GPUへの配分が大きい構成。30万円帯のRTX 5080構成（約55〜59%）などが該当する。
  var GPU_HEAVY_SHARE = 0.45;
  // CPUがGPUの65%以上の価格。配信・編集向けに多コアCPUを載せた構成が該当する。
  var CPU_HEAVY_RATIO = 0.65;
  // 参考価格1万円あたりのGPUスコア。上位2〜3割程度が「コスパ重視型」になる水準。
  var VALUE_SCORE_PER_MAN = 4.3;

  function buildTypes(a) {
    var types = [];
    if (a.gpuShare != null && a.gpuShare >= GPU_HEAVY_SHARE) {
      types.push({ key: "gpu", label: "GPU重視型" });
    } else if (a.cpuGpuRatio != null && a.cpuGpuRatio >= CPU_HEAVY_RATIO) {
      types.push({ key: "cpu", label: "CPU重視型" });
    } else if (a.gpuShare != null) {
      types.push({ key: "balance", label: "バランス型" });
    }

    var target = a.gpuInfo ? resLevelOf(a.gpuInfo.target) : null;
    if (a.resolution === "4k" && target === 3) types.push({ key: "4k", label: "4K重視" });
    if (a.cpuInfo && a.cpuInfo.x3d && (a.usage === "fps" || a.resolution === "fhd")) {
      types.push({ key: "highfps", label: "高FPS特化" });
    }
    if (a.ramGb >= 64 || (a.cpuInfo && a.cpuInfo.cores >= 12)) {
      types.push({ key: "creator", label: "クリエイター寄り" });
    }
    if (a.valueScore != null && a.valueScore >= VALUE_SCORE_PER_MAN) {
      types.push({ key: "value", label: "コスパ重視型" });
    }
    return types.slice(0, 3);
  }

  /* ---------- この構成にした理由 ---------- */

  function gpuReason(a) {
    var res = RES_LABELS[a.resolution] || "";
    var share = a.gpuShare != null ? "構成全体の費用の約" + Math.round(a.gpuShare * 100) + "%をGPUに配分しています。" : "";
    var text;
    switch (a.usage) {
      case "fps":
        text = res + "で高FPSを出しやすくするため、" + (share || "GPUを優先しています。");
        break;
      case "mmo":
        text = res + "できれいな画質を保ちやすいよう、" + (share || "GPUを優先しています。");
        break;
      case "stream":
        text = "配信しながらでも" + res + "で遊べるよう" +
          (isNvidia(a.gpuInfo, a.gpu) ? "、配信用のエンコーダー（NVENC）が使えるGeForceを選び" : "") +
          "、" + (share || "GPUにも予算を回しています。");
        break;
      case "creative":
        text = "動画の書き出しやプレビューをGPUで速くするため、" + (share || "GPUにも予算を回しています。");
        break;
      default:
        text = "普段使いには十分な性能で、ゲームも" + res + "で楽しめるGPUです。" + share;
    }
    var fit = resolutionFit(a);
    if (fit === "short") {
      text += "（この予算では" + resLabelOfLevel(resLevelOf(a.gpuInfo.target)) + "向けのGPUが上限です）";
    }
    return text;
  }

  function cpuReason(a) {
    var c = a.cpuInfo;
    if (!c) return null;
    if (c.x3d) return "ゲームのフレームレートを伸ばしやすい3D V-Cache搭載CPU。GPUの性能をしっかり引き出せます。";
    if (c.cores >= 12) return c.cores + "コアで、配信や動画の書き出しなど重い作業を同時にこなせます。";
    if (c.cores >= 8) return c.cores + "コアで、ゲームをしながらの配信やブラウザ作業にも余裕があります。";
    if (a.socket === "AM4") return "価格を抑えやすい" + c.cores + "コア（AM4世代）。浮いた予算をGPUに回しています。";
    return "ゲームには十分な" + c.cores + "コア。GPUの性能を活かしつつ、GPUへ予算を回しやすいバランスです。";
  }

  function memoryReason(a) {
    if (!a.ramGb) return null;
    if (a.ramGb >= 64) return "動画編集や配信など、重い作業を同時にこなせるよう" + a.ramGb + "GB。";
    if (a.ramGb >= 32) return "今のゲーミングPCとして余裕を持たせて" + a.ramGb + "GB。ゲーム中にブラウザや通話を開いても安心です。";
    return "予算内に収めるため" + a.ramGb + "GB。ゲーム中心なら足ります。あとから32GBへ増やすこともできます。";
  }

  function storageReason(a) {
    if (!a.storageTb) return null;
    if (a.storageTb >= 4) return "動画素材や録画データをたっぷり保存できる" + a.storageTb + "TB。";
    if (a.storageTb >= 2) return "最近の大型ゲームを何本も入れても余裕が出る" + a.storageTb + "TB。";
    return "ゲーム数本＋普段使いなら" + a.storageTb + "TBが基準です。";
  }

  function buildReasons(a) {
    return [
      { key: "gpu", label: "GPU", text: a.gpuInfo ? gpuReason(a) : null },
      { key: "cpu", label: "CPU", text: cpuReason(a) },
      { key: "memory", label: "メモリ", text: memoryReason(a) },
      { key: "storage", label: "SSD", text: storageReason(a) },
    ].filter(function (r) { return r.text; });
  }

  /* ---------- 解像度の適性 ---------- */

  /** 'short' | 'match' | 'over' | null（判定不能） */
  function resolutionFit(a) {
    if (!a.gpuInfo) return null;
    var have = resLevelOf(a.gpuInfo.target);
    var want = resLevelOf(a.resolution);
    if (have == null || want == null) return null;
    if (have < want) return "short";
    if (have > want) return "over";
    return "match";
  }

  /* ---------- 1構成の解析 ---------- */

  /**
   * @param {object} build   builds.json の1件
   * @param {object} ctx     { prices: part-prices.json, gpuList: gpus.json }
   */
  function analyze(build, ctx) {
    if (!build) return null;
    var c = ctx || {};
    var guide = build.motherboardGuide || {};
    var cpuEntry = c.prices && c.prices.cpu ? c.prices.cpu[build.cpu] : null;
    var cpuInfo = cpuEntry && Number.isFinite(Number(cpuEntry.cores))
      ? { cores: Number(cpuEntry.cores), threads: Number(cpuEntry.threads) || null, x3d: Boolean(cpuEntry.x3d) }
      : null;
    var gpuInfo = findGpu(build.gpu, c.gpuList);

    var estimate = c.prices
      ? BuildPrice.calculateBuildEstimate(build, { prices: c.prices, gpuList: c.gpuList })
      : null;
    var total = estimate && estimate.total ? estimate.total : null;
    var partPrice = {};
    if (estimate && estimate.breakdown) {
      estimate.breakdown.forEach(function (p) { partPrice[p.key] = p.price; });
    }

    var a = {
      build: build,
      slug: slugOf(build),
      budget: Number(build.budget),
      budgetMan: budgetMan(build.budget),
      usage: build.usage,
      usageLabel: USAGE_LABELS[build.usage] || build.usage,
      resolution: build.resolution,
      resolutionLabel: RES_LABELS[build.resolution] || build.resolution,
      title: build.title,
      cpu: build.cpu,
      gpu: build.gpu,
      ram: build.ram,
      storage: build.storage,
      ramGb: parseGb(build.ram),
      storageTb: parseTb(build.storage),
      socket: guide.socket || null,
      memoryType: guide.memoryType || null,
      cpuInfo: cpuInfo,
      gpuInfo: gpuInfo,
      total: total,
      priceText: total ? BuildPrice.formatEstimate(total) : null,
      partPrice: partPrice,
      gpuShare: total && partPrice.gpu ? partPrice.gpu / total : null,
      cpuGpuRatio: partPrice.cpu && partPrice.gpu ? partPrice.cpu / partPrice.gpu : null,
      valueScore: total && gpuInfo ? Number(gpuInfo.score) / (total / 10000) : null,
    };
    a.gpuTargetLabel = gpuInfo ? resLabelOfLevel(resLevelOf(gpuInfo.target)) : null;
    a.fit = resolutionFit(a);
    a.strengths = buildStrengths(a);
    a.types = buildTypes(a);
    a.reasons = buildReasons(a);
    return a;
  }

  /* ---------- ±5万円比較 ---------- */

  function neighbors(builds, build) {
    var bd = Number(build.budget);
    return {
      down: findBuild(builds, bd - BUDGET_STEP, build.usage, build.resolution),
      up: findBuild(builds, bd + BUDGET_STEP, build.usage, build.resolution),
    };
  }

  var PART_DEFS = [
    { key: "gpu", label: "GPU", field: "gpu", priceKey: "gpu" },
    { key: "cpu", label: "CPU", field: "cpu", priceKey: "cpu" },
    { key: "memory", label: "メモリ", field: "ram", priceKey: "memory" },
    { key: "storage", label: "SSD", field: "storage", priceKey: "storage" },
  ];

  function pctChange(from, to) {
    if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0) return null;
    return Math.round(((to - from) / from) * 100);
  }

  /**
   * 2構成の差分。from → to の順で読む。
   * @returns {{ identical, changes[], main, gpuPct, priceDiff, fromFit, toFit }}
   */
  function diff(fromA, toA) {
    var changes = PART_DEFS.filter(function (p) {
      return fromA[p.field] !== toA[p.field];
    }).map(function (p) {
      return {
        key: p.key,
        label: p.label,
        from: fromA[p.field],
        to: toA[p.field],
        priceDelta: Number.isFinite(toA.partPrice[p.priceKey]) && Number.isFinite(fromA.partPrice[p.priceKey])
          ? toA.partPrice[p.priceKey] - fromA.partPrice[p.priceKey]
          : null,
      };
    });

    // 「主な差」= 価格差がいちばん大きい部品。金額が取れなければ変更の先頭（GPU優先）。
    var main = null;
    changes.forEach(function (ch) {
      if (!main) { main = ch; return; }
      if (Math.abs(ch.priceDelta || 0) > Math.abs(main.priceDelta || 0)) main = ch;
    });

    var fromScore = fromA.gpuInfo ? Number(fromA.gpuInfo.score) : null;
    var toScore = toA.gpuInfo ? Number(toA.gpuInfo.score) : null;

    return {
      identical: changes.length === 0,
      changes: changes,
      main: main,
      gpuPct: pctChange(fromScore, toScore),
      priceDiff: fromA.total && toA.total ? toA.total - fromA.total : null,
      fromFit: fromA.fit,
      toFit: toA.fit,
    };
  }

  function formatPriceDiff(yen) {
    if (!Number.isFinite(yen)) return null;
    var man = Math.round(Math.abs(yen) / 10000);
    if (man === 0) return "ほぼ同じ";
    return (yen > 0 ? "+" : "−") + "約" + man + "万円";
  }

  /* 「+5万円で何が良くなるのか」を1〜2文で。 */
  function explainUp(cur, up) {
    var d = diff(cur, up);
    var res = cur.resolutionLabel;
    if (d.identical) {
      return {
        diff: d,
        headline: "パーツは今の構成と同じです",
        text: up.budgetMan + "万円の構成も中身は同じです。この条件では" + cur.budgetMan + "万円前後で十分な性能に届いています。",
      };
    }
    var m = d.main;
    var text;
    if (m.key === "gpu") {
      text = "主な差はGPU性能です" + (d.gpuPct > 0 ? "（目安で約" + d.gpuPct + "%アップ）" : "") + "。";
      if (d.fromFit === "short" && d.toFit !== "short") {
        text += "今の構成は" + res + "では厳しめなので、" + res + "で遊ぶなら+5万円の価値が大きいです。";
      } else if (cur.usage === "fps") {
        text += res + "で高FPSを重視するなら+5万円のメリットがあります。一方、今のfpsで満足なら" + cur.budgetMan + "万円の構成でも十分です。";
      } else if (cur.usage === "creative" || cur.usage === "stream") {
        text += "ゲームの画質やGPUを使う書き出しが速くなります。作業が中心で重いゲームをしないなら、" + cur.budgetMan + "万円の構成でも十分です。";
      } else {
        text += "重いゲームでも画質を上げやすくなります。今遊びたいゲームが快適なら、" + cur.budgetMan + "万円の構成でも十分です。";
      }
    } else if (m.key === "cpu") {
      text = "主な差はCPUです（" + m.from + " → " + m.to + "）。";
      if (up.cpuInfo && up.cpuInfo.x3d && !(cur.cpuInfo && cur.cpuInfo.x3d)) {
        text += "ゲームのフレームレートが伸びやすくなります。";
      } else if (up.cpuInfo && cur.cpuInfo && up.cpuInfo.cores > cur.cpuInfo.cores) {
        text += "コア数が増え、配信や動画編集などの同時作業に強くなります。";
      } else {
        text += "CPUの処理に余裕が出ます。";
      }
      var gpuChange = d.changes.filter(function (c) { return c.key === "gpu"; })[0];
      if (gpuChange && d.gpuPct > 0) {
        text += "GPUも" + gpuChange.to + "に上がります（目安で約" + d.gpuPct + "%アップ）。";
      } else if (!gpuChange) {
        text += "GPUは同じなので、ゲームの画質は大きく変わりません。";
      }
    } else if (m.key === "memory") {
      text = "主な差はメモリです（" + m.from + " → " + m.to + "）。動画編集や配信を同時にする人向けの余裕です。ゲームだけなら差は感じにくいです。";
    } else {
      text = "主な差はSSD容量です（" + m.from + " → " + m.to + "）。ゲームや動画をたくさん保存したい人向けです。性能はほぼ変わりません。";
    }
    return { diff: d, headline: "いちばん大きな違いは" + m.label + "です", text: text };
  }

  /* 「−5万円で何を妥協するのか」を箇条書きで。 */
  function explainDown(cur, down) {
    var d = diff(cur, down);
    if (d.identical) {
      return {
        diff: d,
        headline: "パーツは今の構成と同じです",
        points: [],
        text: down.budgetMan + "万円の構成も中身は同じです。予算を抑えたいなら" + down.budgetMan + "万円前後で探しても同じ性能が狙えます。",
      };
    }
    var points = [];
    d.changes.forEach(function (ch) {
      if (ch.key === "gpu") {
        var p = d.gpuPct;
        var line = p != null && p < 0 ? "GPU性能が目安で約" + Math.abs(p) + "%下がります" : "GPUが " + ch.to + " に変わります";
        if (d.toFit === "short" && d.fromFit !== "short") line += "（" + cur.resolutionLabel + "では画質を下げる場面が増えます）";
        points.push(line);
      } else if (ch.key === "cpu") {
        if (cur.cpuInfo && cur.cpuInfo.x3d && !(down.cpuInfo && down.cpuInfo.x3d)) {
          points.push("高FPSを伸ばす3D V-Cache搭載CPUではなくなります（" + ch.to + "）");
        } else if (cur.cpuInfo && down.cpuInfo && down.cpuInfo.cores < cur.cpuInfo.cores) {
          points.push("CPUが" + cur.cpuInfo.cores + "コア→" + down.cpuInfo.cores + "コアになり、配信・編集の余裕が減ります");
        } else {
          points.push("CPUが " + ch.to + " に変わります");
        }
      } else if (ch.key === "memory") {
        points.push("メモリが" + ch.from + "→" + ch.to + "に減ります");
      } else if (ch.key === "storage") {
        points.push("SSDが" + parseTb(ch.from) + "TB→" + parseTb(ch.to) + "TBに減ります");
      }
    });
    if (cur.socket === "AM5" && down.socket === "AM4") {
      points.push("旧世代（AM4）になり、将来CPUだけ載せ替えるのが難しくなります");
    }
    var fitOk = down.fit !== "short";
    return {
      diff: d,
      headline: "5万円下げると妥協するところ",
      points: points,
      text: fitOk
        ? "それでも" + cur.resolutionLabel + "に対応できるGPUなので、予算を優先するなら十分な選択肢です。"
        : cur.resolutionLabel + "で遊ぶなら、今の構成を選ぶほうが安心です。",
    };
  }

  /* ---------- 近い予算の3構成 ---------- */

  /**
   * 今の構成を中心に、同じ用途・解像度の近い予算3つを返す。
   * 最低/最高予算では片側に寄せる（存在しない構成は作らない）。
   * @returns {Array<{ build, role, roleLabel }>}
   */
  function trio(builds, build) {
    var bd = Number(build.budget);
    var at = function (offset) {
      return findBuild(builds, bd + offset * BUDGET_STEP, build.usage, build.resolution);
    };
    var picks;
    if (at(-1) && at(1)) picks = [[-1, at(-1)], [0, build], [1, at(1)]];
    else if (!at(-1)) picks = [[0, build], [1, at(1)], [2, at(2)]];
    else picks = [[-2, at(-2)], [-1, at(-1)], [0, build]];

    return picks.filter(function (p) { return p[1]; }).map(function (p) {
      var o = p[0];
      var role = o < 0 ? "save" : o > 0 ? "plus" : "current";
      var roleLabel = o === 0 ? "今回のおすすめ" : o < 0 ? (o === -1 ? "節約するなら" : "もっと節約") : (o === 1 ? "余裕を持たせるなら" : "さらに余裕を");
      return { build: p[1], role: role, roleLabel: roleLabel };
    });
  }

  /* ---------- 遊びたいゲーム ---------- */

  function parseTargetRes(target) {
    var s = String(target || "").toUpperCase();
    // 「WQHD〜4K」のような幅は下側（確実に狙える方）で読む
    if (s.indexOf("FHD") > -1) return 1;
    if (s.indexOf("WQHD") > -1) return 2;
    if (s.indexOf("4K") > -1) return 3;
    return 1; // 「通常プレイ向け」など解像度の書かれていない目安はフルHD相当
  }

  function gameUrl(game) {
    return "/game-pc-guide/games/" + (game.slug || game.id) + ".html";
  }

  /**
   * games.json の目安構成（GPU）と、この構成のGPUを GPU GUIDE のスコアで比べる。
   * 「このゲームならどこまで狙えるか」を初心者向けの一言にする。
   */
  function gameFit(a, game, gpuList) {
    if (!a || !game || !a.gpuInfo) return null;
    var score = Number(a.gpuInfo.score);
    var tiers = (game.builds || []).map(function (t) {
      var g = findGpu(t.gpu, gpuList);
      return g ? { target: t.target, gpu: t.gpu, score: Number(g.score), resLevel: parseTargetRes(t.target) } : null;
    }).filter(Boolean).sort(function (x, y) { return x.score - y.score; });
    if (!tiers.length) return null;

    var reached = tiers.filter(function (t) { return score >= t.score; });
    var best = reached.length ? reached[reached.length - 1] : null;
    var next = tiers.filter(function (t) { return score < t.score; })[0] || null;
    var want = resLevelOf(a.resolution);

    var status;
    var text;
    if (!best) {
      status = "short";
      text = "目安の「" + tiers[0].target + "」には少し性能が足りません。画質を下げれば遊べる場合があります。";
    } else if (want != null && best.resLevel < want && !next) {
      status = "ok";
      text = "「" + best.target + "」が狙えます。";
    } else if (want != null && best.resLevel < want) {
      status = "partial";
      text = "「" + best.target + "」なら快適です。" + a.resolutionLabel + "で遊ぶなら画質設定を少し下げると安心です。";
    } else {
      status = "ok";
      text = "「" + best.target + "」が狙えます。";
    }
    if (best && next) text += "「" + next.target + "」まで狙うならもう一段上のGPUが目安です。";

    return {
      game: game,
      title: game.title,
      url: gameUrl(game),
      status: status,
      best: best,
      next: next,
      text: text,
    };
  }

  /* ---------- 詳細設定（こだわり条件） ---------- */

  /* 75構成のデータで判定できる条件だけを置く。
   * 判定できない条件（例: ケースの色、静音性）は増やさない。 */
  var PREFS = [
    { key: "nvidia", label: "GeForce（NVIDIA）がいい", test: function (a) { return a.gpuInfo ? isNvidia(a.gpuInfo, a.gpu) : null; } },
    { key: "rt", label: "レイトレーシング重視", test: function (a) { return a.gpuInfo ? isNvidia(a.gpuInfo, a.gpu) && Number(a.gpuInfo.score) >= 75 : null; } },
    { key: "fps", label: "高FPS重視", test: function (a) { return levelOf(a, "highfps") == null ? null : levelOf(a, "highfps") >= 5; } },
    { key: "stream", label: "配信もする", test: function (a) { return levelOf(a, "stream") == null ? null : levelOf(a, "stream") >= 4 || (levelOf(a, "stream") >= 3 && isNvidia(a.gpuInfo, a.gpu)); } },
    { key: "edit", label: "動画編集もする", test: function (a) { return levelOf(a, "edit") == null ? null : levelOf(a, "edit") >= 3; } },
    { key: "ssd2", label: "SSDは2TB以上ほしい", test: function (a) { return a.storageTb == null ? null : a.storageTb >= 2; } },
    { key: "long", label: "長く使いたい", test: function (a) { return levelOf(a, "future") == null ? null : levelOf(a, "future") >= 4; } },
    // 価格重視は「条件を満たす/満たさない」ではなく、5万円下の構成を勧めるかどうかで扱う
    { key: "cheap", label: "とにかく価格を抑えたい", test: null },
  ];

  function levelOf(a, key) {
    for (var i = 0; i < a.strengths.length; i += 1) {
      if (a.strengths[i].key === key) return a.strengths[i].level;
    }
    return null;
  }

  function prefByKey(key) {
    for (var i = 0; i < PREFS.length; i += 1) if (PREFS[i].key === key) return PREFS[i];
    return null;
  }

  function sanitizePrefs(keys) {
    var seen = {};
    return (keys || []).filter(function (k) {
      if (!prefByKey(k) || seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  /** こだわり条件ごとに ✓/✗ を返す（判定不能は ok:null） */
  function evaluatePrefs(a, keys) {
    return sanitizePrefs(keys).filter(function (k) { return prefByKey(k).test; }).map(function (k) {
      var p = prefByKey(k);
      return { key: k, label: p.label, ok: p.test(a) };
    });
  }

  /**
   * 今の構成がこだわり条件を満たさないとき、同じ解像度で条件を満たす構成を探す。
   * 探す範囲は「同じ予算」→「+5万円」まで。用途は問わない（同じ予算なら用途違いの構成も候補）。
   * 見つからなければ null（無理に遠い構成を勧めない）。
   */
  function findPrefCandidate(builds, cur, keys, ctx) {
    var testable = sanitizePrefs(keys).filter(function (k) { return prefByKey(k).test; });
    if (!testable.length) return null;
    var curScore = cur.gpuInfo ? Number(cur.gpuInfo.score) : 0;
    var pool = [];
    (builds || []).forEach(function (b) {
      if (b.resolution !== cur.resolution) return;
      var gap = Number(b.budget) - cur.budget;
      if (gap !== 0 && gap !== BUDGET_STEP) return;
      if (slugOf(b) === cur.slug) return;
      var a = analyze(b, ctx);
      var allOk = testable.every(function (k) { return prefByKey(k).test(a) === true; });
      if (allOk) pool.push(a);
    });
    pool.sort(function (x, y) {
      if (x.budget !== y.budget) return x.budget - y.budget;
      if ((x.usage === cur.usage) !== (y.usage === cur.usage)) return x.usage === cur.usage ? -1 : 1;
      var xs = x.gpuInfo ? Math.abs(Number(x.gpuInfo.score) - curScore) : 99;
      var ys = y.gpuInfo ? Math.abs(Number(y.gpuInfo.score) - curScore) : 99;
      return xs - ys;
    });
    return pool[0] || null;
  }

  /* ---------- URL（共有・相談室への引き継ぎ） ---------- */

  /* 診断条件をURLへ入れる。値はフォームの value と同じ語彙で、
   * 予算だけ万円単位に縮める（?b=25&u=fps&r=wqhd）。 */
  function toQuery(state) {
    var parts = [];
    if (state.budget) parts.push("b=" + budgetMan(state.budget));
    if (state.usage) parts.push("u=" + encodeURIComponent(state.usage));
    if (state.resolution) parts.push("r=" + encodeURIComponent(state.resolution));
    if (state.game) parts.push("g=" + encodeURIComponent(state.game));
    var prefs = sanitizePrefs(state.prefs);
    if (prefs.length) parts.push("p=" + prefs.join(","));
    return parts.join("&");
  }

  /** URLの検索文字列から診断条件を読む。知らない値は捨てる（そのままDOMへ入れない）。 */
  function fromQuery(search, builds) {
    var params = {};
    String(search || "").replace(/^\?/, "").split("&").forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf("=");
      var k = i < 0 ? kv : kv.slice(0, i);
      var v = i < 0 ? "" : kv.slice(i + 1);
      try { params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, " ")); } catch (e) { /* 壊れた値は無視 */ }
    });
    var budget = null;
    var man = Number(params.b);
    if (Number.isFinite(man) && man > 0) {
      var yen = man * 10000;
      if (!builds || listBudgets(builds).indexOf(yen) > -1) budget = String(yen);
    }
    var usage = Object.prototype.hasOwnProperty.call(USAGE_LABELS, params.u) ? params.u : null;
    var resolution = Object.prototype.hasOwnProperty.call(RES_LABELS, params.r) ? params.r : null;
    var game = /^[a-z0-9-]{1,40}$/.test(params.g || "") ? params.g : null;
    var prefs = sanitizePrefs(String(params.p || "").split(","));
    var compare = String(params.compare || "").split(",").filter(function (s) {
      return /^(fhd|wqhd|4k)-[a-z]+-\d+man$/.test(s);
    }).slice(0, 3);
    return { budget: budget, usage: usage, resolution: resolution, game: game, prefs: prefs, compare: compare };
  }

  return {
    USAGE_LABELS: USAGE_LABELS,
    RES_LABELS: RES_LABELS,
    RES_LEVELS: RES_LEVELS,
    BUDGET_STEP: BUDGET_STEP,
    STRENGTH_DEFS: STRENGTH_DEFS,
    PREFS: PREFS,
    esc: esc,
    budgetMan: budgetMan,
    slugOf: slugOf,
    findBuild: findBuild,
    findBySlug: findBySlug,
    listBudgets: listBudgets,
    parseGb: parseGb,
    parseTb: parseTb,
    findGpu: findGpu,
    analyze: analyze,
    neighbors: neighbors,
    diff: diff,
    explainUp: explainUp,
    explainDown: explainDown,
    formatPriceDiff: formatPriceDiff,
    trio: trio,
    parseTargetRes: parseTargetRes,
    gameUrl: gameUrl,
    gameFit: gameFit,
    sanitizePrefs: sanitizePrefs,
    evaluatePrefs: evaluatePrefs,
    findPrefCandidate: findPrefCandidate,
    toQuery: toQuery,
    fromQuery: fromQuery,
  };
});
