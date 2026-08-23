/* =====================================================================
 *  シッポPC アップグレード診断エンジン (upgrade-engine.js)
 *  ---------------------------------------------------------------------
 *  「今のPCのどこを交換すべきか」「そもそも交換すべきでないか」を判定する
 *  純粋なロジック層。DOMには一切触れない（描画は upgrade-diagnose.js）。
 *
 *  【最重要の設計方針】
 *   1. 交換を勧めないことを"正しい答え"として扱う。
 *      売りたいものを勧めるのではなく、変えなくていい部分は
 *      はっきり「現状維持でOK」と言う。これが信頼性の核。
 *   2. 分からない項目を許容する。初心者は自分のCPU名も電源容量も
 *      知らないことが多い。未入力は「判定不能」として正直に返し、
 *      勝手に仮定して断定しない。
 *   3. 交換点数が多くなったら買い替えを勧める。GPU/CPU/MB/メモリ/電源を
 *      全部替えるなら、それはもう新しいPCを買うのと同じ。
 *
 *  【依存】
 *   - なし（単体で動く。Nodeからも読める）
 *   - GPU性能の目安は shared/affiliate/affiliate-recommend.js の GPU_TIERS と
 *     同じ尺度を使う。あちらが読み込まれていればそれを優先し、
 *     無ければ自前の同等テーブルを使う（ページ単体でも壊れないように）。
 * ===================================================================== */
(function (global) {
  'use strict';

  /* ==================================================================
   *  1. 参照データ
   * ================================================================== */

  /**
   * GPU性能の目安（相対値）。affiliate-recommend.js の GPU_TIERS と同尺度。
   * 厳密なベンチマークではなく「どれくらい変わるか」を示すためのラフな目安。
   */
  var GPU_TIERS = {
    gtx1650: 20, gtx1650super: 24, gtx1660: 26, gtx1660super: 29, gtx1660ti: 30,
    gtx10606gb: 22, gtx1070: 30, gtx1070ti: 34, gtx1080: 36, gtx1080ti: 46,
    rtx2060: 34, rtx2060super: 39, rtx3050: 32,
    rx570: 16, rx5808gb: 19, rx590: 21, rx5500xt: 22, rx5600xt: 33,
    rx5700: 38, rx5700xt: 43, rx6500xt: 24, rx6600: 38,
    rtx2070: 40, rtx2070super: 44, rtx3060: 42, rtx3060ti: 52,
    rx6600xt: 45, rx6650xt: 47, rx6700: 50, rx6700xt: 55, rx7600: 48, rx7600xt: 52,
    rtx4060: 50, rtx4060ti: 57,
    rtx2080: 48, rtx2080super: 52, rtx2080ti: 58, rtx3070: 58, rtx3070ti: 62, rtx3080: 70,
    rx6750xt: 60, rx6800: 64, rx6800xt: 70, rx6900xt: 74, rx6950xt: 78,
    rx7700xt: 63, rx7800xt: 72,
    rtx4070: 68, rtx4070super: 76, rtx5050: 44, rtx5060: 60, rtx5060ti: 68,
    rtx3080ti: 76, rtx3090: 78, rtx3090ti: 84, rtx4070ti: 80, rtx4070tisuper: 84,
    rtx4080: 88, rtx4080super: 92, rtx4090: 115,
    rx7900gre: 78, rx7900xt: 86, rx7900xtx: 94, rx9060xt: 62, rx9070: 84, rx9070xt: 90,
    rtx5070: 82, rtx5070ti: 91, rtx5080: 100, rtx5090: 125,
  };

  /**
   * GPUのおおよその消費電力(W)。電源容量が足りるかの判定に使う。
   * メーカー公表のTGP/TBPを目安にした概算値。
   */
  var GPU_POWER = {
    gtx1650: 75, gtx1650super: 100, gtx1660: 120, gtx1660super: 125, gtx1660ti: 120,
    gtx10606gb: 120, gtx1070: 150, gtx1070ti: 180, gtx1080: 180, gtx1080ti: 250,
    rtx2060: 160, rtx2060super: 175, rtx3050: 130,
    rx570: 150, rx5808gb: 185, rx590: 175, rx5500xt: 130, rx5600xt: 150,
    rx5700: 180, rx5700xt: 225, rx6500xt: 107, rx6600: 132,
    rtx2070: 175, rtx2070super: 215, rtx3060: 170, rtx3060ti: 200,
    rx6600xt: 160, rx6650xt: 176, rx6700: 175, rx6700xt: 230, rx7600: 165, rx7600xt: 190,
    rtx4060: 115, rtx4060ti: 160,
    rtx2080: 215, rtx2080super: 250, rtx2080ti: 250, rtx3070: 220, rtx3070ti: 290, rtx3080: 320,
    rx6750xt: 250, rx6800: 250, rx6800xt: 300, rx6900xt: 300, rx6950xt: 335,
    rx7700xt: 245, rx7800xt: 263,
    rtx4070: 200, rtx4070super: 220, rtx5050: 130, rtx5060: 145, rtx5060ti: 180,
    rtx3080ti: 350, rtx3090: 350, rtx3090ti: 450, rtx4070ti: 285, rtx4070tisuper: 285,
    rtx4080: 320, rtx4080super: 320, rtx4090: 450,
    rx7900gre: 260, rx7900xt: 315, rx7900xtx: 355, rx9060xt: 160, rx9070: 220, rx9070xt: 304,
    rtx5070: 250, rtx5070ti: 300, rtx5080: 360, rtx5090: 575,
  };

  /**
   * CPU性能の目安（ゲーム時の相対値）。GPUのボトルネック判定に使う。
   * ゲーム性能なのでコア数よりシングル性能・キャッシュを重視した並びにしている。
   */
  var CPU_TIERS = {
    ryzen53600: 38, ryzen55500: 40, ryzen55600: 47, ryzen55600g: 42,
    ryzen55600x: 49, ryzen55600x3d: 60,
    ryzen57500f: 58, ryzen57600x: 62, ryzen59600x: 70, ryzen59500f: 64,
    ryzen73700x: 42, ryzen75700x: 50, ryzen75700x3d: 62,
    ryzen75800x: 54, ryzen75800x3d: 68,
    ryzen77700: 64, ryzen77800x3d: 82, ryzen79700x: 70, ryzen79800x3d: 95,
    ryzen95900x: 58, ryzen97900: 66, ryzen97900x: 70,
    ryzen97950x: 76, ryzen97950x3d: 88,
    ryzen99900x: 74, ryzen99950x3d: 96,
    corei512400: 44, corei512400f: 45, corei512600k: 56,
    corei513400f: 52, corei513600k: 68,
    corei514400f: 54, corei514500: 58, corei514600kf: 66,
    corei712700f: 58, corei712700k: 64, corei713700f: 63, corei713700k: 72,
    corei714700f: 74, corei714700k: 76,
    corei913900k: 80, corei914900k: 82,
    coreultra5245k: 66, coreultra7265k: 76, coreultra9285k: 84,
  };

  /* 解像度ごとの「快適に遊べる目安のGPU性能」 */
  var RESOLUTION_TARGETS = {
    fhd:  { label: 'フルHD (1920×1080)', base: 42 },
    wqhd: { label: 'WQHD (2560×1440)',  base: 62 },
    '4k': { label: '4K (3840×2160)',     base: 88 },
  };

  /* 目標FPSによる必要性能の倍率
   *
   * ★この倍率は「理想値（100%達成ライン）」であって、合格ラインではない。
   *   144fps という入力は「144Hzモニターを活かしたい」という"希望"であり、
   *   「重量級ゲームで常時144fpsを絶対に切らない」という要件ではない。
   *   実際の合格ラインは COMFORT_BANDS 側で幅を持たせて判定する。
   */
  var FPS_MULTIPLIER = {
    60:  1.0,
    120: 1.35,
    144: 1.5,
    240: 1.9,
  };

  /* 用途ごとの重さ係数（同じ解像度でも要求性能が変わる）
   *
   * ★heavy は「Cyberpunk などを高〜最高設定で遊ぶ」を基準にする。
   *   パストレーシング最高設定のような最悪条件を基準にしない。
   *   現在の診断項目にRT/PTの指定が無い以上、最悪条件を仮定すると
   *   ほぼ全員に最上位GPUが必要という非現実的な結論になるため。
   *   また近年はDLSS/FSRやフレーム生成の利用が一般的で、
   *   ネイティブ描画のみを前提にすると要求性能を過大評価する。
   */
  var USAGE_WEIGHT = {
    light:  0.75, // VALORANT / LoL / Apex など軽めの競技系
    normal: 1.0,  // 一般的な3Dゲーム
    heavy:  1.12, // Cyberpunk / MHWilds などの重量級（高〜最高設定・アップスケーリング前提）
    creative: 1.0, // 動画編集・制作用途
  };

  /* ------------------------------------------------------------------
   *  目標達成度の許容幅
   * ------------------------------------------------------------------
   *  「目標fpsの何%まで届いていれば良しとするか」。
   *  目標を100%満たさないと不合格、という運用をやめるための表。
   *  ratio = 現在のGPU性能 / 理想値（requiredGpuTier）
   */
  var COMFORT_BANDS = {
    ideal:      1.00, // 理想（目標をそのまま満たす）
    recommended:0.70, // 十分おすすめできる（設定そのままでほぼ目標付近）
    comfortable:0.55, // 快適に遊べる（画質調整・アップスケーリングで到達）
    // これ未満はアップグレード候補
  };

  /* ------------------------------------------------------------------
   *  性能向上率のしきい値（今のGPUから替える価値があるか）
   * ------------------------------------------------------------------
   *  GPU_TIERS は相対スコアなので、比 (候補 / 現在) をそのまま使う。
   */
  var GAIN = {
    pointless: 1.15, // これ未満の伸びは体感できない＝交換非推奨
    small:     1.30, // 効果小
    worth:     1.50, // 交換候補
    // 1.50以上は「明確なアップグレード」
  };

  /* ------------------------------------------------------------------
   *  費用対効果の判定基準
   * ------------------------------------------------------------------
   *  「性能1%を伸ばすのにいくら払うか」で見る。
   *    costPerGain = 価格(円) / (伸び率% )
   *  例) 5万円で30%伸びる → 50000/30 ≒ 1,667円/%
   *      15万円で15%伸びる → 150000/15 = 10,000円/%
   *  数値の絶対値に意味は無く、候補同士を比べるための指標。
   */
  var COST_PER_GAIN = {
    good: 2600,  // これ以下なら費用対効果が良い
    fair: 5200,  // これ以下なら許容範囲
    // これを超えると「交換できるがおすすめはしない」
  };

  /* アップグレード先GPUの候補（控えめな順）
   *
   * ★ここは「現行世代で新品購入できるGPU」の一覧であり、
   *   おすすめ順ではない。どれを選ぶかは pickGpuCandidate() が
   *   性能向上率・価格・費用対効果から決める。
   *   新しいGPU（RTX 6000番台など）は、ここと GPU_TIERS / GPU_POWER /
   *   PRICE_HINT に追加すれば、ロジックを変えずに候補へ加わる。
   */
  var GPU_CANDIDATES = [
    'rtx5050', 'rtx5060', 'rx9060xt', 'rtx5060ti', 'rtx5070',
    'rx9070', 'rx9070xt', 'rtx5070ti', 'rtx5080', 'rtx5090',
  ];

  /* パーツのおおよその費用目安（円）。相場は変動するため「目安」として扱う。
   *
   * ★価格の基準：日本国内の新品実売価格の"よく見る帯"（中央値寄り）。
   *   最安値でも希望小売価格でもない。特価やセールは織り込まない。
   *   ここが実勢と乖離すると費用対効果の判定がずれるため、
   *   相場が大きく動いたときは見直すこと。
   */
  var PRICE_HINT = {
    rtx5050: 35000, rtx5060: 50000, rx9060xt: 55000, rtx5060ti: 75000,
    rtx5070: 110000, rx9070: 110000, rx9070xt: 135000, rtx5070ti: 160000,
    rtx5080: 230000, rtx5090: 450000,
    memory_ddr4_32: 12000, memory_ddr5_32: 16000, memory_ddr5_64: 34000,
    ssd_1tb: 12000, ssd_2tb: 20000, ssd_4tb: 40000,
    psu_650: 10000, psu_750: 14000, psu_850: 18000, psu_1000: 26000,
    cooler_air: 6000, cooler_aio: 18000,
    cpu_mid: 40000, cpu_high: 70000,
  };

  /* ==================================================================
   *  2. ユーティリティ
   * ================================================================== */

  /**
   * 商品名の表記ゆれを吸収して比較用キーにする。
   * affiliate.js の normalize と同じ規則にそろえてある
   * （同じ入力から同じIDが出ないと購入ボタンと突き合わせられないため）。
   */
  function normalize(value) {
    return String(value == null ? '' : value)
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
      })
      .toLowerCase()
      .replace(/\b(nvidia|geforce|amd|radeon|intel)\b/g, '')
      .replace(/\b(asus|msi|gigabyte|zotac|palit|colorful|sapphire|powercolor|xfx|inno3d|galax|elsa|玄人志向)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * 入力されたGPU名から内部IDを引く。
   * "RTX 5070" と "RTX 5070 Ti" を取り違えないよう、
   * 一致部分の直後に数字や ti/xt が続く場合は不一致として扱う。
   */
  function resolveKey(name, table) {
    if (!name) return null;
    var key = normalize(name);
    if (!key) return null;
    if (table[key]) return key;

    // 部分一致（長いキーを優先＝より具体的な型番を優先）。
    //
    // 前方一致だけだと "ASUS TUF RTX 4070 SUPER" のような入力を拾えない。
    // ベンダー名(ASUS)は正規化で落とせるが、サブブランド(TUF/GAMING/OC 等)は
    // 種類が多く列挙しきれないため、型番がどこに現れても拾えるようにする。
    //
    // ただし部分一致は取り違えの危険があるので、一致部分の直後に
    // 「型番を伸ばす文字」が続く場合は、より具体的な別製品なので弾く。
    //
    //   GPU: ti / super / xt / xtx / gre  … "rtx5070" ≠ "RTX 5070 Ti"
    //   CPU: x / x3d / k / kf / f / g     … "ryzen55600" ≠ "Ryzen 5 5600X"
    //
    // ★CPU側のサフィックスを弾いていなかったため、
    //   "Ryzen 5 5600X" が "Ryzen 5 5600"（別CPU）として判定されていた。
    //   X3D は通常版より大幅に速く、判定結果が変わってしまうため必ず区別する。
    var candidates = Object.keys(table).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var at = key.indexOf(c);
      if (at === -1) continue;
      var rest = key.slice(at + c.length);
      if (/^(ti|super|xtx|xt|gre|x3d|x|kf|k|f|g|[0-9])/.test(rest)) continue;
      return c;
    }
    return null;
  }

  /** 数値化（未入力・不明は null を返す。0と未入力を区別する） */
  function num(value) {
    if (value === null || value === undefined || value === '' || value === 'unknown') return null;
    var n = Number(String(value).replace(/[^0-9.]/g, ''));
    return isNaN(n) ? null : n;
  }

  /* ==================================================================
   *  3. 個別判定
   * ================================================================== */

  /**
   * 必要なGPU性能の目安を求める。
   * 解像度 × 目標FPS × 用途の重さ で決まる。
   */
  function requiredGpuTier(input) {
    var res = RESOLUTION_TARGETS[input.resolution] || RESOLUTION_TARGETS.fhd;
    var mult = FPS_MULTIPLIER[num(input.targetFps)] || 1.0;
    var weight = USAGE_WEIGHT[input.usage] || 1.0;
    return res.base * mult * weight;
  }

  /**
   * 目標に対する現在GPUの充足度を、段階ラベルで返す。
   * 「100%満たすか否か」の二択にしないための関数。
   */
  function comfortLevel(ratio) {
    if (ratio >= COMFORT_BANDS.ideal) return 'ideal';
    if (ratio >= COMFORT_BANDS.recommended) return 'recommended';
    if (ratio >= COMFORT_BANDS.comfortable) return 'comfortable';
    return 'short';
  }

  /**
   * 交換候補GPUを評価して並べる。
   *
   * 【この関数がこの診断の中心】
   *  従来は「要求性能を満たす中でいちばん安いもの」を機械的に選んでいたため、
   *  目標を高めに設定しただけで最上位GPUしか候補に残らなかった。
   *  ここでは
   *    ・現在GPUからの性能向上率（伸びない交換はそもそも無意味）
   *    ・予算に収まるか
   *    ・費用対効果（1%伸ばすのにいくら払うか）
   *    ・目標にどこまで近づくか
   *  を全部見たうえで並べる。特定の製品名は一切見ない。
   *
   * @returns {Array} 評価済み候補（おすすめ順）
   */
  function rankGpuCandidates(currentTier, required, budget) {
    var list = [];

    for (var i = 0; i < GPU_CANDIDATES.length; i++) {
      var cid = GPU_CANDIDATES[i];
      var tier = GPU_TIERS[cid];
      var price = PRICE_HINT[cid];
      if (!tier || !price) continue;

      var gain = tier / currentTier;          // 1.30 なら30%向上
      if (gain < GAIN.pointless) continue;    // 体感できない伸びは候補にしない

      var gainPct = (gain - 1) * 100;
      var costPerGain = price / gainPct;      // 1%伸ばすのにいくらか
      var afterRatio = tier / required;       // 交換後の目標充足度

      // 目標を大きく超える性能は"使い切れない"ため、価値として数えない。
      // これがあると「とりあえず最上位」が自動的に不利になる。
      var usefulRatio = Math.min(afterRatio, COMFORT_BANDS.ideal + 0.10);

      // 目標への到達度を「満足度」に変換する。
      //
      //   ・COMFORT_BANDS.recommended（7割）に届かないうちは、
      //     お金を払っても目標に足りないままなので満足度は低い。
      //   ・7割〜100%の区間がいちばん価値が高い（払った分だけ体感が変わる）。
      //   ・100%を超えた分は頭打ちにする（使い切れないため）。
      //
      // 単純な「性能/価格」にすると常に最安のGPUが勝ってしまい、
      // 「WQHD 144Hzを目指す人に、かろうじて動くだけのGPUを勧める」
      // という逆方向の失敗が起きる。
      // そこで到達度は4乗して「目標に近いこと」を強く評価する。
      // 一方 usefulRatio に上限があるため、目標を超える性能には
      // いくら払っても満足度が増えず、最上位GPUは価格の分だけ不利になる。
      var reach = usefulRatio / (COMFORT_BANDS.ideal + 0.10);
      var satisfaction = Math.pow(reach, 4);

      list.push({
        id: cid,
        tier: tier,
        price: price,
        gain: gain,
        gainPct: gainPct,
        costPerGain: costPerGain,
        afterRatio: afterRatio,
        usefulRatio: usefulRatio,
        satisfaction: satisfaction,
        overBudget: budget ? price > budget : false,
        // 総合スコア：目標への到達度（満足度）を、支払う金額で割る。
        // 「目標に届く候補ほど高く」「同じ到達度なら安いほど高く」なる。
        // 目標を超えた性能は satisfaction が頭打ちになるので、
        // 高額な最上位GPUは価格の分だけ自動的に不利になる。
        score: (satisfaction * 100) / (price / 10000),
      });
    }

    // 並び順は3段階。
    //
    //   1. 予算内を優先（予算は最も強い制約）
    //   2. 「快適に遊べる水準（comfortable）」に届くかを優先
    //   3. その中でスコア（費用対効果）の高い順
    //
    // 2 が無いと、常に最安のGPUが勝ってしまう。
    // 4Kのような重い目標なのにエントリーGPUを勧める、という
    // 従来とは逆方向の失敗を防ぐための段階。
    // 逆に 2 を満たす候補が複数あれば、その中では安い方が選ばれるので、
    // 「目標に届く範囲でいちばん無駄がないGPU」に落ち着く。
    list.sort(function (a, b) {
      if (a.overBudget !== b.overBudget) return a.overBudget ? 1 : -1;
      var aOk = a.afterRatio >= COMFORT_BANDS.comfortable;
      var bOk = b.afterRatio >= COMFORT_BANDS.comfortable;
      if (aOk !== bOk) return aOk ? -1 : 1;
      return b.score - a.score;
    });

    return list;
  }

  /** 費用対効果のラベル */
  function valueLabel(costPerGain) {
    if (costPerGain <= COST_PER_GAIN.good) return 'good';
    if (costPerGain <= COST_PER_GAIN.fair) return 'fair';
    return 'poor';
  }

  /**
   * GPUの判定。
   * 「足りているなら勧めない」を最優先にする。
   *
   * 判定は次の順で行う。
   *   1. 今のGPUで目標に足りているか（充足度は段階で見る）
   *   2. 足りない場合、交換して意味のある候補があるか（性能向上率）
   *   3. その候補は予算内か
   *   4. その候補は払うだけの価値があるか（費用対効果）
   * どこかで「勧めるに値しない」と分かった時点で、現状維持を返す。
   */
  function judgeGpu(input) {
    var id = resolveKey(input.gpu, GPU_TIERS);

    // GPUが分からない＝この診断の根幹が決まらない。正直に返す。
    if (!id) {
      return {
        part: 'gpu',
        label: 'GPU（グラフィックボード）',
        status: 'unknown',
        headline: 'GPUが分からないため判定できません',
        detail: input.gpu
          ? '入力された「' + input.gpu + '」を認識できませんでした。型番の表記を確認してください。'
          : 'GPUは今回の判定でいちばん影響が大きいパーツです。分かる場合は入力すると精度が上がります。',
        priority: 0,
      };
    }

    var current = GPU_TIERS[id];
    var required = requiredGpuTier(input);
    var ratio = current / required;
    var level = comfortLevel(ratio);
    var budget = num(input.budget);

    /* --- 1. 目標を満たしている → 交換しない ------------------------- */
    if (level === 'ideal') {
      return {
        part: 'gpu', label: 'GPU（グラフィックボード）', currentId: id,
        status: 'keep',
        headline: '現状維持でOK',
        detail: '目標としている環境に対して、今のGPUは性能が足りている見込みです。'
          + '今より上のGPUに替えても体感差が小さい可能性が高いため、いま交換する必要は薄いです。',
        ratioToTarget: ratio,
        comfort: level,
        priority: 0,
      };
    }

    /* --- 2. 目標の7割以上 → 実用上は十分。設定で埋められる ----------- */
    // 「目標fpsを常時維持できるか」ではなく「快適に遊べるか」で見る。
    // このクラスのGPUに対して上位GPUを勧めても、
    // 支払う金額に見合う体感差にならないことがほとんど。
    if (level === 'recommended') {
      return {
        part: 'gpu', label: 'GPU（グラフィックボード）', currentId: id,
        status: 'keep',
        headline: '現状維持でOK（十分な性能です）',
        detail: '今のGPUは、目標としている環境に対して十分な性能を持っています。'
          + '重量級のタイトルで目標fpsを常時維持できない場面はあり得ますが、'
          + '画質設定の調整やDLSS / FSR などのアップスケーリング、フレーム生成を使えば'
          + '快適に遊べる見込みです。'
          + 'この水準から体感できるほど性能を上げるには高額なGPUが必要になり、'
          + '支払う金額に見合いにくいため、いまの交換はおすすめしません。',
        ratioToTarget: ratio,
        comfort: level,
        priority: 0,
      };
    }

    /* --- 3. 足りない → 交換候補を評価する --------------------------- */
    var ranked = rankGpuCandidates(current, required, budget);

    // 意味のある伸びが得られる候補が1つも無い＝すでに上位クラスを使っている
    if (ranked.length === 0) {
      return {
        part: 'gpu', label: 'GPU（グラフィックボード）', currentId: id,
        status: 'keep',
        headline: '現状維持でOK（交換に見合う上位GPUがありません）',
        detail: '今のGPUはすでに上位クラスのため、交換して体感できるほど'
          + '性能が伸びる選択肢が現行製品にありません。'
          + '目標としている環境に対しては余裕が少ない場面もありますが、'
          + '画質設定やアップスケーリングでの調整をおすすめします。',
        ratioToTarget: ratio,
        comfort: level,
        priority: 0,
      };
    }

    var affordable = ranked.filter(function (c) { return !c.overBudget; });

    /* --- 3-a. 予算内に候補が無い → 無理に勧めない ------------------- */
    if (budget && affordable.length === 0) {
      var cheapest = ranked.slice().sort(function (a, b) { return a.price - b.price; })[0];
      return {
        part: 'gpu', label: 'GPU（グラフィックボード）', currentId: id,
        status: 'keep',
        headline: '予算内では交換をおすすめできません',
        detail: 'ご指定の予算内では、今のGPUから明確な性能向上が得られる交換候補がありません。'
          + '現時点ではGPU交換をおすすめしません。'
          + '画質設定の調整やDLSS / FSR、フレーム生成を活用することで、'
          + '今のGPUのままでも快適にプレイできる可能性があります。',
        ratioToTarget: ratio,
        comfort: level,
        overBudgetOnly: true,
        // 参考候補（予算オーバーであることを明示して別枠で見せる）
        referenceId: cheapest ? cheapest.id : null,
        referencePrice: cheapest ? cheapest.price : null,
        priority: 1,
      };
    }

    /* --- 3-b. 予算内（または予算未指定）の最良候補を選ぶ ------------- */
    var pool = budget ? affordable : ranked;
    var best = pool[0];
    var value = valueLabel(best.costPerGain);

    // 費用対効果が悪すぎる → 「交換できるが、おすすめはしない」
    // 例) 10〜20%しか伸びないのに15万円以上かかるケース。
    if (value === 'poor') {
      return {
        part: 'gpu', label: 'GPU（グラフィックボード）', currentId: id,
        recommendId: best.id,
        status: 'consider',
        headline: '交換は可能ですが、費用対効果は低めです',
        detail: '交換候補はありますが、今のGPUからの性能向上は約'
          + Math.round(best.gainPct) + '%にとどまる一方、費用は約'
          + Math.round(best.price / 10000) + '万円かかります。'
          + '支払う金額に対して体感できる差が小さいため、積極的にはおすすめしません。'
          + 'まずは画質設定やアップスケーリングでの調整をお試しください。',
        ratio: best.gain,
        ratioToTarget: ratio,
        comfort: level,
        gainPct: best.gainPct,
        costPerGain: best.costPerGain,
        valueLabel: value,
        priority: 2,
      };
    }

    // 伸びが小さい（15〜30%）→ 交換候補ではあるが必須ではない
    if (best.gain < GAIN.small) {
      return {
        part: 'gpu', label: 'GPU（グラフィックボード）', currentId: id,
        recommendId: best.id,
        status: 'consider',
        headline: '交換の効果は小さめです',
        detail: '今のGPUからの性能向上は約' + Math.round(best.gainPct) + '%程度で、'
          + '劇的に変わるとまでは言えません。'
          + '現状に強い不満がある場合のみ検討してください。',
        ratio: best.gain,
        ratioToTarget: ratio,
        comfort: level,
        gainPct: best.gainPct,
        costPerGain: best.costPerGain,
        valueLabel: value,
        priority: 2,
      };
    }

    /* --- 3-c. 目標が現行GPUでは到達不能 ------------------------------ */
    // どの候補を選んでも「十分おすすめできる水準」に届かない場合、
    // それは製品の問題ではなく目標設定が過剰である可能性が高い。
    // （4K/240fps・重量級 などは現行の最上位GPUでも届かない）
    // 高額GPUを勧めて解決したように見せるのは不誠実なので、
    // まず目標の見直しを提案する。
    //
    // ★ここは comfortable（55%）ではなく recommended（70%）で判定する。
    //   55%まで許すと「最上位GPUを買えば一応マシになる」という理由で
    //   到達不能な目標に高額GPUを勧めてしまうため。
    if (best.afterRatio < COMFORT_BANDS.recommended) {
      return {
        part: 'gpu', label: 'GPU（グラフィックボード）', currentId: id,
        recommendId: best.id,
        status: 'consider',
        headline: '目標設定が高すぎる可能性があります',
        detail: '設定された解像度・FPSは、現行の最上位GPUでも到達が難しい水準です。'
          + 'GPUを交換しても目標には届かない見込みのため、'
          + 'まず目標FPSまたは解像度の見直しをおすすめします。'
          + 'DLSS / FSR やフレーム生成の利用を前提にすると、'
          + 'より現実的な構成で目的を達成できる可能性があります。',
        ratio: best.gain,
        ratioToTarget: ratio,
        comfort: level,
        gainPct: best.gainPct,
        costPerGain: best.costPerGain,
        valueLabel: value,
        priority: 3,
        overTarget: true,
      };
    }

    /* --- 3-d. 交換をおすすめする ------------------------------------ */
    var meetsFully = best.afterRatio >= COMFORT_BANDS.ideal;
    var reachesComfort = best.afterRatio >= COMFORT_BANDS.recommended;

    var detail;
    if (meetsFully) {
      detail = '目標としている環境に対して、今のGPUでは性能が不足する見込みです。'
        + 'このクラスに交換すると、目標に届く見込みがあります。'
        + '（性能向上の目安：約' + Math.round(best.gainPct) + '%）';
    } else if (reachesComfort) {
      detail = '目標としている環境に対して、今のGPUでは性能が不足する見込みです。'
        + 'このクラスへの交換で大きく改善し、画質設定やDLSS / FSR の調整を併用すれば'
        + '快適に遊べる水準に届きます。'
        + '（性能向上の目安：約' + Math.round(best.gainPct) + '%）';
    } else {
      detail = '目標としている環境に対して、今のGPUでは性能が大きく不足しています。'
        + 'このクラスへの交換で体感は大きく変わりますが、'
        + '設定した解像度・FPSを最高画質のまま満たすには届かない可能性があります。'
        + 'DLSS / FSR の利用や画質設定の調整を前提にお考えください。'
        + '（性能向上の目安：約' + Math.round(best.gainPct) + '%）';
    }

    // 予算のせいで上位候補を落とした場合は、その事実を伝える
    if (budget && ranked.length > affordable.length) {
      detail += 'なお、ご指定の予算を超える上位GPUもありますが、'
        + '予算内でもっとも効果的な候補を提示しています。';
    }

    return {
      part: 'gpu', label: 'GPU（グラフィックボード）', currentId: id,
      recommendId: best.id,
      status: 'upgrade',
      headline: '交換をおすすめします',
      detail: detail,
      ratio: best.gain,
      ratioToTarget: ratio,
      comfort: level,
      gainPct: best.gainPct,
      costPerGain: best.costPerGain,
      valueLabel: value,
      priority: 5,
      meetsTarget: meetsFully,
      budgetLimited: !!(budget && ranked.length > affordable.length),
    };
  }


  /**
   * CPUの判定。GPUを替えたときに足を引っ張らないかを見る。
   * CPU単体で遅いかではなく「GPUとの釣り合い」で判断する。
   */
  function judgeCpu(input, gpuResult) {
    var id = resolveKey(input.cpu, CPU_TIERS);

    if (!id) {
      return {
        part: 'cpu', label: 'CPU', status: 'unknown',
        headline: 'CPUが分からないため判定できません',
        detail: 'CPUは「GPUを替えても性能が出るか（ボトルネックにならないか）」の判断に使います。'
          + 'タスクマネージャーの[パフォーマンス]タブで確認できます。',
        priority: 0,
      };
    }

    var cpuTier = CPU_TIERS[id];
    // 交換後のGPUを基準にする。今のGPUで釣り合っていても、
    // 強いGPUに替えた途端にCPUが足を引っ張ることがあるため。
    var targetGpuId = (gpuResult && gpuResult.recommendId) || (gpuResult && gpuResult.currentId);
    var gpuTier = targetGpuId ? GPU_TIERS[targetGpuId] : null;

    if (!gpuTier) {
      return {
        part: 'cpu', label: 'CPU', currentId: id, status: 'unknown',
        headline: 'GPUが不明なため釣り合いを判定できません',
        detail: 'CPUの要否は組み合わせるGPUによって変わります。',
        priority: 0,
      };
    }

    // 高解像度ほどGPU側が重くなるため、CPUの影響は小さくなる。
    // 逆にFHD高FPSではCPUの影響が大きい。
    var tolerance = 0.62;
    if (input.resolution === 'wqhd') tolerance = 0.52;
    if (input.resolution === '4k') tolerance = 0.42;
    if (num(input.targetFps) >= 144) tolerance += 0.10;

    var need = gpuTier * tolerance;

    if (cpuTier >= need) {
      return {
        part: 'cpu', label: 'CPU', currentId: id,
        status: 'keep',
        headline: '現状維持でOK',
        detail: '今のCPUは、想定するGPUと組み合わせても大きく足を引っ張らない見込みです。'
          + 'CPU交換はマザーボードやメモリの交換を伴うことが多く費用が膨らむため、'
          + '必要になるまでは替えないのが得策です。',
        priority: 0,
      };
    }

    // 不足している場合でも、まず「本当に交換すべきか」を添える
    var severity = cpuTier / need;
    return {
      part: 'cpu', label: 'CPU', currentId: id,
      status: severity < 0.7 ? 'upgrade' : 'consider',
      headline: severity < 0.7
        ? 'CPUがボトルネックになる可能性が高いです'
        : 'CPUがやや足を引っ張る可能性があります',
      detail: '想定するGPUに対してCPU性能が不足気味です。'
        + 'ただしCPU交換は【マザーボード・メモリの同時交換】が必要になる場合があり、'
        + '費用が大きく変わります。現在のマザーボードで対応するCPUに載せ替えられるかを'
        + '先に確認してください（BIOS更新が必要な場合もあります）。',
      priority: severity < 0.7 ? 4 : 2,
      needsMotherboardCheck: true,
    };
  }

  /** メモリの判定 */
  function judgeMemory(input) {
    var gb = num(input.memory);
    if (gb === null) {
      return {
        part: 'memory', label: 'メモリ (RAM)', status: 'unknown',
        headline: 'メモリ容量が分からないため判定できません',
        detail: 'タスクマネージャーの[パフォーマンス]→[メモリ]で容量を確認できます。',
        priority: 0,
      };
    }

    var heavy = input.usage === 'heavy' || input.usage === 'creative';
    var recommendId = input.memoryType === 'ddr5' ? 'ddr5_32gb' : 'ddr4_32gb';

    if (gb <= 8) {
      return {
        part: 'memory', label: 'メモリ (RAM)', status: 'upgrade',
        recommendId: recommendId,
        headline: '増設をおすすめします（優先度：高）',
        detail: '8GB以下は現在のゲームや制作用途では不足しやすく、'
          + 'カクつきや読み込みの遅さの原因になります。'
          + '費用が比較的安く効果が分かりやすいため、優先度は高めです。'
          + '※既存メモリとの混在より、2枚組での交換をおすすめします。',
        priority: 5,
        priceHint: input.memoryType === 'ddr5' ? PRICE_HINT.memory_ddr5_32 : PRICE_HINT.memory_ddr4_32,
      };
    }

    if (gb <= 16) {
      if (heavy) {
        return {
          part: 'memory', label: 'メモリ (RAM)', status: 'consider',
          recommendId: recommendId,
          headline: '32GBへの増設を検討する価値があります',
          detail: '16GBでも多くのゲームは動作しますが、重量級ゲームや'
            + '動画編集・配信を同時に行う場合は32GBが安心です。'
            + '今すぐ困っていないなら、後回しでも構いません。',
          priority: 2,
          priceHint: input.memoryType === 'ddr5' ? PRICE_HINT.memory_ddr5_32 : PRICE_HINT.memory_ddr4_32,
        };
      }
      return {
        part: 'memory', label: 'メモリ (RAM)', status: 'keep',
        headline: '現状維持でOK',
        detail: '16GBは現在のゲーム用途では標準的な容量です。'
          + '今の用途であれば、増設しても体感差は小さい見込みです。',
        priority: 0,
      };
    }

    return {
      part: 'memory', label: 'メモリ (RAM)', status: 'keep',
      headline: '現状維持でOK',
      detail: gb + 'GBは十分な容量です。これ以上増やしても体感差はほぼありません。',
      priority: 0,
    };
  }

  /** ストレージの判定 */
  function judgeStorage(input) {
    var gb = num(input.storage);
    var type = input.storageType; // 'ssd' | 'hdd' | 'unknown'

    // HDDにゲームを入れている場合は容量よりまず種別の問題
    if (type === 'hdd') {
      return {
        part: 'storage', label: 'ストレージ', status: 'upgrade',
        recommendId: 'ssd_nvme_1tb',
        headline: 'SSDへの換装をおすすめします（優先度：高）',
        detail: 'HDDにゲームやWindowsが入っている場合、読み込みの遅さやカクつきの'
          + '大きな原因になります。SSDへの換装は費用対効果がはっきり出やすい改善です。',
        priority: 5,
        priceHint: PRICE_HINT.ssd_1tb,
      };
    }

    if (gb === null) {
      return {
        part: 'storage', label: 'ストレージ', status: 'unknown',
        headline: 'ストレージ容量が分からないため判定できません',
        detail: 'エクスプローラーの[PC]から、Cドライブの空き容量を確認できます。',
        priority: 0,
      };
    }

    if (gb <= 512) {
      return {
        part: 'storage', label: 'ストレージ', status: 'consider',
        recommendId: 'ssd_nvme_1tb',
        headline: '増設を検討する価値があります',
        detail: '最近のゲームは1本100GBを超えることもあり、512GB以下だと'
          + '数本入れるだけで埋まります。ゲームを消しながら遊んでいるなら増設が有効です。'
          + '※既存のSSDを外す必要はなく、空きスロットに追加できる場合が多いです。',
        priority: 3,
        priceHint: PRICE_HINT.ssd_1tb,
      };
    }

    return {
      part: 'storage', label: 'ストレージ', status: 'keep',
      headline: '現状維持でOK',
      detail: gb + 'GBあれば当面は不足しにくい容量です。'
        + '足りなくなった時点で追加すれば十分です。',
      priority: 0,
    };
  }

  /**
   * 電源の判定。
   * GPUを替える場合、これを見落とすと「動かない」事故になるため重要。
   */
  function judgePsu(input, gpuResult) {
    var watt = num(input.psu);
    var targetGpuId = gpuResult && gpuResult.recommendId;

    // GPUを替えないなら、今動いている以上は電源も足りている
    if (!targetGpuId) {
      if (watt === null) {
        return {
          part: 'psu', label: '電源ユニット', status: 'unknown',
          headline: '電源容量は不明ですが、今回は判定不要です',
          detail: 'GPUを交換しない前提であれば、現在動作している電源で問題ありません。',
          priority: 0,
        };
      }
      return {
        part: 'psu', label: '電源ユニット', status: 'keep',
        headline: '現状維持でOK',
        detail: 'GPUを交換しない前提であれば、電源の交換も不要です。',
        priority: 0,
      };
    }

    var gpuWatt = GPU_POWER[targetGpuId] || 250;
    // システム全体の目安 = GPU + CPU/その他(約150W) に余裕(1.35倍)を見る。
    // 電源は定格の50〜60%付近で効率が最も良いため、ぴったりは狙わない。
    var needed = Math.ceil(((gpuWatt + 150) * 1.35) / 50) * 50;

    if (watt === null) {
      return {
        part: 'psu', label: '電源ユニット', status: 'check',
        headline: '【要確認】電源容量を確認してください',
        detail: 'GPUを交換する場合、電源容量が足りないと起動しない・'
          + 'ゲーム中に落ちるといった不具合が起きます。'
          + '推奨容量の目安は ' + needed + 'W 以上です。'
          + '電源ユニット本体のラベルに定格出力が記載されています。'
          + '補助電源コネクタ（8pin / 12VHPWR）の数も併せて確認してください。',
        priority: 4,
        neededWatt: needed,
      };
    }

    if (watt >= needed) {
      return {
        part: 'psu', label: '電源ユニット', status: 'keep',
        headline: '現状維持でOK',
        detail: '現在の ' + watt + 'W は、交換予定のGPUに対して十分な容量です'
          + '（目安 ' + needed + 'W 以上）。'
          + 'ただし補助電源コネクタの形状・本数は別途確認してください。',
        priority: 0,
        neededWatt: needed,
      };
    }

    return {
      part: 'psu', label: '電源ユニット', status: 'upgrade',
      recommendId: needed >= 1000 ? 'psu_1000w' : (needed >= 850 ? 'psu_850w' : (needed >= 750 ? 'psu_750w' : 'psu_650w')),
      headline: '交換が必要です（GPU交換とセット）',
      detail: '現在の ' + watt + 'W では、交換予定のGPUに対して容量が不足します'
        + '（目安 ' + needed + 'W 以上）。'
        + '容量不足のままGPUを載せると、起動しない・高負荷時に電源が落ちる原因になります。'
        + 'GPUと同時に交換してください。',
      priority: 5,
      neededWatt: needed,
      priceHint: needed >= 1000 ? PRICE_HINT.psu_1000 : (needed >= 850 ? PRICE_HINT.psu_850 : (needed >= 750 ? PRICE_HINT.psu_750 : PRICE_HINT.psu_650)),
    };
  }

  /* ==================================================================
   *  4. 総合判定
   * ================================================================== */

  /**
   * 「アップグレードすべきか、買い替えるべきか」の総合判断。
   *
   * 交換が必要なパーツが多いほど、アップグレードの利点は薄れる。
   * GPU + CPU + メモリ + 電源…と積み上がるなら、それは実質的に
   * PCを組み直すのと同じで、費用も新品PCに近づく。
   * その場合は正直に「買い替えの方がおすすめ」と言う。
   */
  function judgeOverall(results, input) {
    var upgrades = results.filter(function (r) { return r.status === 'upgrade'; });
    var total = 0;
    var hasEstimate = false;

    // 【最優先】入力が少なすぎる場合は、結論を出さない。
    // 未入力を「問題なし」と読ませてしまうのが最も危険な誤りなので、
    // 交換不要という判断より先に「まだ判定できない」を返す。
    var unknownParts = results.filter(function (r) { return r.status === 'unknown'; });

    // GPUとCPUの両方が判定できていない場合は、他が「現状維持」でも結論を出さない。
    // この2つはアップグレード判断の中心なので、
    // ここが空のまま「交換不要」と表示すると、
    // 「PCに問題は無い」と誤解させてしまう。
    //
    // ※メモリ/ストレージ/電源は未入力でも keep 側に倒れる作りなので、
    //   unknown の"件数"だけでは、この状況を捕まえられない
    //   （未登録の型番を入力したときに実際に起きる）。
    var gpuUnknown = results.some(function (r) {
      return r.part === 'gpu' && r.status === 'unknown';
    });
    var cpuUnknown = results.some(function (r) {
      return r.part === 'cpu' && r.status === 'unknown';
    });

    if (gpuUnknown && cpuUnknown && upgrades.length === 0) {
      return {
        verdict: 'insufficient',
        headline: '判定するには情報が足りません',
        detail: 'GPUとCPUのどちらも確認できていないため、'
          + 'アップグレードの要否を判断できません。'
          + '「交換不要」という意味ではありません。'
          + '型番が認識されなかった可能性もあるため、'
          + '入力欄に途中まで打って候補から選べるかお試しください。'
          + '一覧に無いパーツの場合は、そのままでも診断できますが、'
          + '性能の判定はできません。',
        estimatedCost: null,
        partsToChange: 0,
        unknownCount: unknownParts.length,
      };
    }

    if (unknownParts.length >= 3 && upgrades.length === 0) {
      return {
        verdict: 'insufficient',
        headline: '判定するには情報が足りません',
        detail: '入力いただいた情報だけでは、アップグレードの要否を判断できません。'
          + '「現状維持でOK」という意味ではなく、まだ判定できていない項目が'
          + unknownParts.length + '件あります。'
          + '分かる範囲で追加入力すると精度が上がります。'
          + '調べ方が分からない場合は、下の「PC構成の調べ方」を参照してください。',
        estimatedCost: null,
        partsToChange: 0,
        unknownCount: unknownParts.length,
      };
    }

    upgrades.forEach(function (r) {
      var price = r.priceHint || (r.recommendId && PRICE_HINT[r.recommendId]);
      if (price) { total += price; hasEstimate = true; }
    });

    var cpuNeedsChange = results.some(function (r) {
      return r.part === 'cpu' && r.status === 'upgrade';
    });

    // CPU交換はマザーボード＋メモリを巻き込みやすい。
    // その状態でGPUも替えるなら、残るのはケースと電源だけ＝実質新品。
    var gpuNeedsChange = results.some(function (r) {
      return r.part === 'gpu' && r.status === 'upgrade';
    });

    if (cpuNeedsChange && gpuNeedsChange) {
      return {
        verdict: 'replace',
        headline: 'PCの買い替えをおすすめします',
        detail: 'GPUとCPUの両方が不足しており、CPUを交換する場合は'
          + 'マザーボード・メモリの交換も必要になる可能性が高い構成です。'
          + 'ここまで交換すると、流用できるのはケース・電源・ストレージ程度になり、'
          + '費用も新しいPCを購入するのと大きく変わらなくなります。'
          + '保証やサポートを考えても、買い替えの方が有利な場面です。',
        estimatedCost: hasEstimate ? total : null,
        partsToChange: upgrades.length,
      };
    }

    if (upgrades.length === 0) {
      var optionals = results.filter(function (r) {
        return r.status === 'consider' || r.status === 'optional';
      });
      if (optionals.length === 0) {
        return {
          verdict: 'keep',
          headline: '今のところアップグレードは不要です',
          detail: '入力いただいた内容では、目標としている環境に対して'
            + '現在の構成で足りている見込みです。'
            + '無理に交換しても体感できる差は小さいと考えられます。'
            + '不満が出てきた時点で、改めて診断してみてください。',
          estimatedCost: 0,
          partsToChange: 0,
        };
      }
      return {
        verdict: 'optional',
        headline: '必須の交換はありません（任意の改善のみ）',
        detail: '必ず交換すべきパーツはありません。'
          + '下記は「replace した方が快適になる可能性がある」程度の項目です。'
          + '予算に余裕がある場合や、実際に不満を感じている場合のみ検討してください。',
        estimatedCost: hasEstimate ? total : null,
        partsToChange: 0,
      };
    }

    // 4点以上の交換は、金額が20万円に届いていなくても買い替え側に倒す。
    // GPU・メモリ・ストレージ・電源まで替えると、流用できるのは
    // ケースとCPU・マザーボードだけ＝実質的に組み直しであり、
    // しかも土台となるCPU・マザーボードは古いままなので投資に見合いにくい。
    //
    // ★以前は「CPUにも不安がある場合」を条件に加えていたが、
    //   CPUが十分でも4点replaceするなら実質同じ状況なので条件から外した。
    //   （GPU推奨の適正化で交換費用が下がり、金額だけでは
    //     この状況を捕まえられなくなったため）
    var cpuWeak = results.some(function (r) {
      return r.part === 'cpu' && (r.status === 'upgrade' || r.status === 'consider');
    });
    if (upgrades.length >= 4) {
      return {
        verdict: 'replace',
        headline: 'PCの買い替えをおすすめします',
        detail: '交換をおすすめするパーツが' + upgrades.length + '点あります。'
          + (cpuWeak ? 'さらにCPUにも性能面の不安が残る構成です。' : '')
          + 'これだけ交換すると流用できるのはケースとCPU・マザーボード程度で、'
          + '実質的にPCを組み直すのと変わりません。'
          + '土台となるCPU・マザーボードは古いままのため、'
          + '費用のわりに満足度が上がりにくい状態です。'
          + (hasEstimate ? '交換費用の目安は約' + Math.round(total / 10000) + '万円で、' : '')
          + '同程度の予算で新しいPCを検討する方が有利になりやすい場面です。',
        estimatedCost: hasEstimate ? total : null,
        partsToChange: upgrades.length,
      };
    }

    // 交換費用がゲーミングPC1台の相場（約20万円）に近づいたら、
    // パーツ点数に関わらず買い替えを勧める。
    // 「4点で18万円」は、新品PCを買った方が保証も付いて有利なため。
    if (hasEstimate && total >= 200000) {
      return {
        verdict: 'replace',
        headline: 'PCの買い替えをおすすめします',
        detail: '交換をおすすめするパーツの合計費用が約' + Math.round(total / 10000) + '万円となり、'
          + 'ゲーミングPCを新しく購入する場合と大きく変わらない金額です。'
          + '新品PCであれば全体に保証が付き、パーツ同士の相性や取り付けの手間もありません。'
          + '費用が近い場合は、買い替えの方が有利になりやすい場面です。',
        estimatedCost: total,
        partsToChange: upgrades.length,
      };
    }

    if (upgrades.length >= 3) {
      return {
        verdict: 'borderline',
        headline: '交換点数が多め。買い替えとの比較をおすすめします',
        detail: '交換をおすすめするパーツが' + upgrades.length + '点あります。'
          + '合計費用によっては、新しいPCを購入した方が結果的に満足度が高い場合があります。'
          + '下の「買い替えとの比較」で費用を確認してください。',
        estimatedCost: hasEstimate ? total : null,
        partsToChange: upgrades.length,
      };
    }

    return {
      verdict: 'upgrade',
      headline: 'アップグレードがおすすめです',
      detail: '交換をおすすめするパーツは' + upgrades.length + '点です。'
        + 'この範囲であれば、PCを買い替えるより費用を抑えつつ'
        + '目的を達成できる見込みです。',
      estimatedCost: hasEstimate ? total : null,
      partsToChange: upgrades.length,
    };
  }

  /* ==================================================================
   *  5. 公開API
   * ================================================================== */

  /**
   * 診断を実行する。
   *
   * @param {Object} input
   *   gpu         {string} 現在のGPU名（例 "RTX 3060"）／空欄可
   *   cpu         {string} 現在のCPU名／空欄可
   *   memory      {number|string} メモリ容量GB／空欄可
   *   memoryType  {string} 'ddr4' | 'ddr5' | 'unknown'
   *   storage     {number|string} 容量GB／空欄可
   *   storageType {string} 'ssd' | 'hdd' | 'unknown'
   *   psu         {number|string} 電源容量W／空欄可
   *   resolution  {string} 'fhd' | 'wqhd' | '4k'
   *   targetFps   {number} 60 | 120 | 144 | 240
   *   usage       {string} 'light' | 'normal' | 'heavy' | 'creative'
   *   budget      {number} 予算（円）／空欄可
   *
   * @returns {Object} { overall, parts, unknowns, input }
   */
  /* ==================================================================
   *  6. 判定情報の充実度
   * ==================================================================
   *  「この診断がどれくらいの情報にもとづいているか」をユーザーに伝える。
   *
   *  ★ 精度◯% のような数値は出さない。
   *    入力から統計的な正確さを算出しているわけではないので、
   *    数字にすると根拠のない安心・不安を与えてしまう。
   *    「何が分かっていて、何が分かっていないか」を示すに留める。
   *
   *  重み付けは【実際に判定へ効く度合い】に合わせている:
   *    - gpu / resolution / targetFps / usage
   *        → requiredGpuTier() に直接入る。ここが無いと基本の判定ができない
   *    - cpu   → ボトルネック判定に使う
   *    - psu   → GPU交換の可否（事故防止）に使う
   *    - memory / storage → それぞれ独立に判定。他へ影響しない補助項目
   * ------------------------------------------------------------------ */

  /* 各項目の重みと、「分かると何が良くなるか」の説明 */
  var CONFIDENCE_FIELDS = [
    {
      key: 'gpu', weight: 3, label: 'GPU（グラフィックボード）',
      benefit: 'ゲーム性能の判定と、交換候補の提案ができます',
    },
    {
      key: 'cpu', weight: 2, label: 'CPU',
      benefit: 'GPUとのバランス（ボトルネック）を確認できます',
    },
    {
      key: 'psu', weight: 2, label: '電源容量',
      benefit: '新しいGPUへ交換できるかを確認できます',
    },
    {
      key: 'resolution', weight: 1, label: '解像度', always: true,
      benefit: '必要な性能の基準が決まります',
    },
    {
      key: 'targetFps', weight: 1, label: '目標FPS', always: true,
      benefit: '必要な性能の基準が決まります',
    },
    {
      key: 'usage', weight: 1, label: '主な用途', always: true,
      benefit: 'ゲームの重さに応じた判定ができます',
    },
    {
      key: 'memory', weight: 1, label: 'メモリ容量',
      benefit: 'メモリ不足が原因かどうかを判定できます',
    },
    {
      key: 'storage', weight: 1, label: 'ストレージ',
      benefit: '読み込みの遅さが原因かどうかを判定できます',
    },
  ];

  /**
   * 入力の充実度から4段階のレベルを返す。
   *
   * @returns {Object} { level, label, headline, detail, score, maxScore,
   *                     known[], missing[] }
   */
  function judgeConfidence(input) {
    var src = input || {};
    var score = 0;
    var maxScore = 0;
    var known = [];
    var missing = [];

    CONFIDENCE_FIELDS.forEach(function (f) {
      maxScore += f.weight;

      var value = src[f.key];
      var filled;

      if (f.key === 'gpu' || f.key === 'cpu') {
        // 型番は「書いてあるだけ」では不十分。認識できて初めて判定に使える。
        var table = f.key === 'gpu' ? GPU_TIERS : CPU_TIERS;
        filled = !!(value && resolveKey(value, table));
      } else {
        filled = num(value) !== null || (f.always && !!value);
      }

      if (filled) {
        score += f.weight;
        known.push(f.label);
      } else {
        missing.push({ label: f.label, benefit: f.benefit, weight: f.weight });
      }
    });

    // 影響の大きい項目から並べる（先に調べてほしい順）
    missing.sort(function (a, b) { return b.weight - a.weight; });

    var ratio = maxScore ? score / maxScore : 0;
    var level, label, headline, detail;

    // GPUもCPUも分からない場合は、何段階目かに関わらず「情報不足」。
    // この2つが無いと、アップグレードの判定そのものが成り立たないため。
    var hasGpu = !!(src.gpu && resolveKey(src.gpu, GPU_TIERS));
    var hasCpu = !!(src.cpu && resolveKey(src.cpu, CPU_TIERS));

    if (!hasGpu && !hasCpu) {
      level = 1;
      label = '情報不足';
      headline = '判定に必要な情報が足りません';
      detail = 'GPUまたはCPUのどちらかが分かると、アップグレードの判定ができるようになります。'
        + '型番は入力欄に途中まで打つと候補が出ます。';
    } else if (!hasGpu) {
      // GPUはアップグレード判定の中心。ここが無いまま
      // 「標準診断」と表示すると、判定の確からしさを過大に見せてしまう。
      // 他の項目がどれだけ埋まっていても簡易扱いにする。
      level = 2;
      label = '簡易診断';
      headline = 'GPUが確認できていないため、限定的な判定です';
      detail = 'GPUはゲーム性能に最も影響するパーツです。'
        + '入力された型番を認識できなかった場合は、'
        + '入力欄に途中まで打って候補から選べるかお試しください。'
        + '一覧に無いパーツの場合、性能の判定はできません。';
    } else if (ratio >= 0.85) {
      level = 4;
      label = '詳細診断';
      headline = '主要な情報がそろっています';
      detail = 'GPU・CPU・電源・遊びたい環境がそろっているため、'
        + '交換の要否から電源の可否まで具体的に判断できています。';
    } else if (ratio >= 0.6) {
      level = 3;
      label = '標準診断';
      headline = '判定に必要な情報はそろっています';
      detail = '主要な項目が入力されているため、交換すべきかどうかは判断できています。'
        + '下の項目が分かると、さらに詳しく確認できます。';
    } else {
      level = 2;
      label = '簡易診断';
      headline = '分かる範囲での簡易的な判定です';
      detail = '入力された情報だけで判定しています。'
        + '下の項目が分かると、判断できる範囲が広がります。';
    }

    return {
      level: level,
      maxLevel: 4,
      label: label,
      headline: headline,
      detail: detail,
      score: score,
      maxScore: maxScore,
      known: known,
      // 「あと何が分かると良いか」。上位3件に絞って示す（多すぎると読まれない）
      missing: missing.slice(0, 3),
      missingCount: missing.length,
    };
  }

  function diagnose(input) {
    var src = input || {};

    var gpu = judgeGpu(src);
    var cpu = judgeCpu(src, gpu);
    var memory = judgeMemory(src);
    var storage = judgeStorage(src);
    var psu = judgePsu(src, gpu);

    var parts = [gpu, cpu, memory, storage, psu];
    var overall = judgeOverall(parts, src);
    var confidence = judgeConfidence(src);

    // 未入力のせいで判定できなかった項目を集める。
    // 「分からないものは分からない」と明示するために使う。
    var unknowns = parts
      .filter(function (p) { return p.status === 'unknown' || p.status === 'check'; })
      .map(function (p) { return p.label; });

    // 表示順は優先度の高い順。ただし同順位なら元の並び（GPU→CPU→…）を保つ。
    var ordered = parts.slice().sort(function (a, b) {
      return (b.priority || 0) - (a.priority || 0);
    });

    return {
      overall: overall,
      parts: ordered,
      unknowns: unknowns,
      confidence: confidence,
      input: src,
    };
  }

  var API = {
    diagnose: diagnose,
    // テスト・再利用のために内部も公開する
    GPU_TIERS: GPU_TIERS,
    CPU_TIERS: CPU_TIERS,
    GPU_POWER: GPU_POWER,
    PRICE_HINT: PRICE_HINT,
    RESOLUTION_TARGETS: RESOLUTION_TARGETS,
    resolveKey: resolveKey,
    normalize: normalize,
    requiredGpuTier: requiredGpuTier,
    judgeConfidence: judgeConfidence,
  };

  global.SippoUpgradeEngine = API;

  // Nodeからも読めるようにする（テスト用）
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  }
})(typeof window !== 'undefined' ? window : this);
