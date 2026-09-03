/* =====================================================================
 *  PC BUILD CHECK 診断ロジック 回帰テスト (test-build-check.js)
 *  ---------------------------------------------------------------------
 *  実行: node pc-build-check/test-build-check.js
 *        node pc-build-check/test-build-check.js --snapshot <出力先.json>
 *
 *  【何をするものか】
 *   予算5 × 用途5 × 解像度3 = 75通りすべてを診断し、
 *     ・診断不能（該当構成なし）が出ないか
 *     ・GPUプロファイルの判定が正しいか（Ti等のサフィックス誤判定）
 *     ・選択解像度に対する適性判定と警告が正しく出るか
 *     ・タイトルと解像度が矛盾していないか
 *     ・builds.json に到達不能なレコードが無いか
 *   を検証する。
 *
 *  【設計方針】
 *   script.js の定義をコピーしない。ブラウザ用の script.js を読み込んで
 *   その場で評価し、"本番と同じ関数" をテストする。
 *   コピーするとテストだけ通って本番が壊れる、が起きるため。
 * ===================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var DIR = __dirname;

/* builds.json は PowerShell 生成のため BOM 付き。読み込み時に取り除く。 */
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

var builds = readJson(path.join(DIR, 'builds.json'));
var gpus = readJson(path.join(DIR, '..', 'gpu-guide', 'gpus.json'));

/* ------------------------------------------------------------------
 *  script.js をNode上で評価する。
 *  script.js は先頭で document.querySelector を呼ぶため、
 *  DOMの最小スタブを渡す（DOM操作の結果はテストしない）。
 * ------------------------------------------------------------------ */
function loadScript() {
  var src = fs.readFileSync(path.join(DIR, 'script.js'), 'utf8');

  var noopEl = {
    classList: { toggle: function () {}, add: function () {}, remove: function () {} },
    addEventListener: function () {},
    scrollIntoView: function () {},
    setAttribute: function () {},
    appendChild: function () {},
    innerHTML: '',
    textContent: '',
    value: '',
  };

  var sandbox = {
    document: {
      querySelector: function () { return noopEl; },
      querySelectorAll: function () { return []; },
      createElement: function () { return noopEl; },
      head: noopEl,
      addEventListener: function () {},
    },
    window: { addEventListener: function () {} },
    sessionStorage: { getItem: function () { return null; }, setItem: function () {} },
    fetch: function () { return Promise.reject(new Error('no fetch in test')); },
    setTimeout: function () {},
    console: { log: function () {}, warn: function () {}, error: function () {} },
  };
  sandbox.window.document = sandbox.document;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'script.js' });
  return sandbox;
}

var S = loadScript();

/* テスト対象の関数を取り出す（script.js が module.exports 相当で公開しているもの） */
var API = S.window.PcBuildCheckLogic;
if (!API) {
  console.error('script.js が window.PcBuildCheckLogic を公開していません。');
  process.exit(1);
}

var BUDGETS = ['100000', '150000', '200000', '250000', '300000'];
var USAGES = ['fps', 'mmo', 'stream', 'creative', 'daily'];
var RESOLUTIONS = ['fhd', 'wqhd', '4k'];

/* ------------------------------------------------------------------
 *  1パターン分の診断結果を、テスト・スナップショット用に組み立てる
 * ------------------------------------------------------------------ */
function diagnose(budget, usage, resolution) {
  var build = builds.find(function (b) {
    return b.budget === budget && b.usage === usage && b.resolution === resolution;
  });
  if (!build) return { budget: budget, usage: usage, resolution: resolution, found: false };

  var profile = API.getPerformanceProfile(build.gpu);
  var fit = API.getResolutionFit(build.gpu, resolution, gpus);

  return {
    budget: budget,
    usage: usage,
    resolution: resolution,
    found: true,
    id: build.id,
    title: build.title,
    cpu: build.cpu,
    gpu: build.gpu,
    ram: build.ram,
    storage: build.storage,
    profileIndex: API.getPerformanceProfileIndex(build.gpu),
    gpuTargetLabel: profile.recommendedResolution,
    psu: profile.psu,
    fps: profile.fps[resolution] || profile.fps.fhd,
    capabilities: profile.capabilities,
    fitLevel: fit.level,
    fitGpuTarget: fit.gpuTarget,
    fitWarns: fit.warns,
    fitHeadline: fit.headline,
    suggestLabel: fit.suggestLabel,
    // 画面に出す文面。警告時に矛盾した断言を出していないかを見る。
    // ここは script.js 側の分岐と同じ条件をなぞる必要がある。
    comfortMessage: fit.warns ? null : API.getComfortMessage(usage, resolution),
    whyMessage: fit.warns ? null : API.getWhyMessage(usage, resolution, build.gpu),
    comfortLabel: fit.warns && fit.suggestLabel
      ? fit.suggestLabel + 'で快適に遊べる'
      : API.getComfortLabel(resolution),
    forWhomText: API.getForWhomText(usage, resolution, fit),
  };
}

function runAll() {
  var rows = [];
  BUDGETS.forEach(function (b) {
    USAGES.forEach(function (u) {
      RESOLUTIONS.forEach(function (r) {
        rows.push(diagnose(b, u, r));
      });
    });
  });
  return rows;
}

/* ==================================================================
 *  スナップショット出力モード
 * ================================================================== */
var snapshotIndex = process.argv.indexOf('--snapshot');
if (snapshotIndex > -1) {
  var out = process.argv[snapshotIndex + 1];
  if (!out) {
    console.error('--snapshot には出力先ファイルパスが必要です。');
    process.exit(1);
  }
  fs.writeFileSync(out, JSON.stringify(runAll(), null, 1), 'utf8');
  console.log('スナップショットを書き出しました: ' + out + ' (' + runAll().length + '件)');
  process.exit(0);
}

/* ==================================================================
 *  テスト本体
 * ================================================================== */
var pass = 0;
var fail = 0;
var failures = [];

function ok(name, cond, detail) {
  if (cond) { pass++; return; }
  fail++;
  failures.push(name + (detail ? '  → ' + detail : ''));
}

var rows = runAll();

/* --- 1. 全75パターンが診断できること -------------------------------- */
ok('75パターンすべてで構成が見つかる', rows.length === 75, '件数 ' + rows.length);
rows.forEach(function (r) {
  ok('診断不能なし: ' + r.budget + '/' + r.usage + '/' + r.resolution, r.found);
});

/* --- 2. builds.json に重複・到達不能レコードが無いこと ---------------- */
(function () {
  var seen = {};
  var dup = [];
  builds.forEach(function (b) {
    var key = b.resolution + '/' + b.usage + '/' + b.budget;
    if (seen[key]) dup.push(key + ' (id ' + seen[key] + ' と id ' + b.id + ')');
    else seen[key] = b.id;
  });
  ok('builds.json に条件の重複が無い', dup.length === 0, dup.join(', '));

  var reachable = {};
  rows.forEach(function (r) { if (r.found) reachable[r.id] = true; });
  var unreachable = builds.filter(function (b) { return !reachable[b.id]; })
    .map(function (b) { return 'id ' + b.id; });
  ok('診断から到達できないレコードが無い', unreachable.length === 0, unreachable.join(', '));
})();

/* --- 3. GPUプロファイルのサフィックス誤判定が無いこと ------------------
 *  「Ti / SUPER / XT が付く上位モデルが、付かない下位モデルの
 *   プロファイルに吸われていないか」を型番ベースで検証する。
 *  今の2件だけを名指しするのではなく、プロファイル定義に
 *  列挙されている全キーについて総当りで確認する。
 * ------------------------------------------------------------------ */
(function () {
  var defs = API.gpuPerformanceProfiles;
  defs.forEach(function (def, expectedIndex) {
    def.match.forEach(function (key) {
      var actual = API.getPerformanceProfileIndex(key);
      ok(
        'プロファイル定義キー "' + key + '" が自分の定義に到達する',
        actual === expectedIndex,
        '期待 profile ' + expectedIndex + ' / 実際 ' + actual
      );
    });
  });
})();

/* --- 4. 代表的なTi/SUPERモデルの明示的な確認 -------------------------
 *  STEP 1 で指定された4モデルは、回帰しやすいので名指しでも押さえる。
 * ------------------------------------------------------------------ */
(function () {
  var cases = [
    ['GeForce RTX 5060', 'GeForce RTX 5060 Ti'],
    ['GeForce RTX 5070', 'GeForce RTX 5070 Ti'],
    ['GeForce RTX 4060', 'GeForce RTX 4060 Ti'],
    ['GeForce RTX 4070', 'GeForce RTX 4070 SUPER'],
    ['Radeon RX 7600', 'Radeon RX 7600 XT'],
    ['Radeon RX 9070', 'Radeon RX 9070 XT'],
  ];
  cases.forEach(function (pair) {
    var baseIdx = API.getPerformanceProfileIndex(pair[0]);
    var upIdx = API.getPerformanceProfileIndex(pair[1]);
    ok(
      pair[1] + ' が ' + pair[0] + ' と同じか上のプロファイルになる',
      upIdx >= baseIdx,
      pair[0] + '=' + baseIdx + ' / ' + pair[1] + '=' + upIdx
    );
  });

  // 定義上の期待値（gpuPerformanceProfiles の並びに対する絶対位置）
  ok('RTX 5060 Ti は profile 3', API.getPerformanceProfileIndex('GeForce RTX 5060 Ti') === 3,
    '実際 ' + API.getPerformanceProfileIndex('GeForce RTX 5060 Ti'));
  ok('RTX 5070 Ti は profile 4', API.getPerformanceProfileIndex('GeForce RTX 5070 Ti') === 4,
    '実際 ' + API.getPerformanceProfileIndex('GeForce RTX 5070 Ti'));
  ok('RTX 5060 は profile 2', API.getPerformanceProfileIndex('GeForce RTX 5060') === 2,
    '実際 ' + API.getPerformanceProfileIndex('GeForce RTX 5060'));
  ok('RTX 5070 は profile 3', API.getPerformanceProfileIndex('GeForce RTX 5070') === 3,
    '実際 ' + API.getPerformanceProfileIndex('GeForce RTX 5070'));
})();

/* --- 5. 解像度レベルの順序 ------------------------------------------- */
(function () {
  var lv = API.getResolutionLevel;
  ok('FHD < WQHD', lv('fhd') < lv('wqhd'));
  ok('WQHD < 4K', lv('wqhd') < lv('4k'));
  ok('GPU側の表記 FHD も同じ尺度で読める', lv('FHD') === lv('fhd'));
  ok('GPU側の表記 4K も同じ尺度で読める', lv('4K') === lv('4k'));
  ok('未知の表記は null を返す（勝手に仮定しない）', lv('8K') === null);
})();

/* --- 6. 解像度適性の警告が正しく出る／出ないこと ---------------------- */
(function () {
  // 4K選択でFHD向けGPU → 警告が出る
  var short = API.getResolutionFit('GeForce RTX 4060', '4k', gpus);
  ok('4K選択 × RTX 4060 で不足警告が出る', short.warns === true, 'level=' + short.level);
  ok('4K選択 × RTX 4060 の適性は FHD と判定される', short.gpuTarget === 'FHD', short.gpuTarget);

  // FHD選択でFHD向けGPU → 警告は出ない
  var okFhd = API.getResolutionFit('GeForce RTX 4060', 'fhd', gpus);
  ok('FHD選択 × RTX 4060 では警告が出ない', okFhd.warns === false, 'level=' + okFhd.level);

  // FHD選択で高性能GPU → 余裕はあるが警告ではない
  var over = API.getResolutionFit('GeForce RTX 5080', 'fhd', gpus);
  ok('FHD選択 × RTX 5080 では警告が出ない', over.warns === false, 'level=' + over.level);

  // WQHD選択でWQHD向けGPU → 警告なし
  var wq = API.getResolutionFit('GeForce RTX 5070', 'wqhd', gpus);
  ok('WQHD選択 × RTX 5070 では警告が出ない', wq.warns === false, 'level=' + wq.level);

  // WQHD選択でFHD向けGPU → 警告あり
  var wqShort = API.getResolutionFit('GeForce RTX 4060', 'wqhd', gpus);
  ok('WQHD選択 × RTX 4060 で不足警告が出る', wqShort.warns === true, 'level=' + wqShort.level);

  // gpus.json に無いGPU → 判定不能。勝手に「足りている」と言わない
  var unknown = API.getResolutionFit('GeForce RTX 9999', '4k', gpus);
  ok('未知のGPUは unknown を返す', unknown.level === 'unknown', unknown.level);
  ok('未知のGPUで誤った警告を出さない', unknown.warns === false);
})();

/* --- 7. builds.json の全GPUが gpus.json に存在すること ----------------
 *  存在しないとGPU GUIDEへ送れず、適性判定も unknown になる。
 * ------------------------------------------------------------------ */
(function () {
  var missing = [];
  var names = {};
  builds.forEach(function (b) { names[b.gpu] = true; });
  Object.keys(names).forEach(function (name) {
    if (!API.findGpuData(name, gpus)) missing.push(name);
  });
  ok('builds.json のGPUがすべて gpus.json に存在する', missing.length === 0, missing.join(', '));
})();

/* --- 8. タイトルと選択解像度が矛盾しないこと --------------------------
 *  「4K ○○向け 最新世代WQHD向け」のような自己矛盾を検出する。
 *  タイトル中に出てくる解像度表記が、その構成の resolution と
 *  食い違っていないかを見る。
 * ------------------------------------------------------------------ */
(function () {
  var label = { fhd: 'FHD', wqhd: 'WQHD', '4k': '4K' };
  var bad = [];
  builds.forEach(function (b) {
    var expected = label[b.resolution];
    ['FHD', 'WQHD', '4K'].forEach(function (tag) {
      // 「WQHD向け」「4K向け」等の"向け"表記だけを対象にする
      if (b.title.indexOf(tag + '向け') > -1 && tag !== expected) {
        bad.push('id ' + b.id + ' (' + b.resolution + '): ' + b.title);
      }
    });
  });
  ok('タイトルと解像度の矛盾が無い', bad.length === 0, bad.slice(0, 5).join(' / '));
})();

/* --- 9. 結果に出す3つの役割が混ざっていないこと ------------------------
 *  選択条件 / GPU適性 / 判定 が別々に取れることを確認する。
 * ------------------------------------------------------------------ */
(function () {
  var r = rows.filter(function (x) { return x.resolution === '4k' && x.budget === '100000'; })[0];
  ok('低予算4Kのケースが存在する', Boolean(r));
  if (r) {
    ok('低予算4K: 選択条件は 4k のまま保持される', r.resolution === '4k');
    ok('低予算4K: GPU適性は 4K 未満と判定される',
      API.getResolutionLevel(r.fitGpuTarget) < API.getResolutionLevel('4k'),
      'gpuTarget=' + r.fitGpuTarget);
    ok('低予算4K: 不足警告が出る', r.fitWarns === true);
  }
})();

/* --- 10. 4K選択時の警告有無が適性と一致すること ----------------------- */
(function () {
  var mismatch = [];
  rows.forEach(function (r) {
    if (!r.found || r.fitLevel === 'unknown') return;
    var want = API.getResolutionLevel(r.resolution);
    var have = API.getResolutionLevel(r.fitGpuTarget);
    var shouldWarn = have < want;
    if (r.fitWarns !== shouldWarn) {
      mismatch.push(r.budget + '/' + r.usage + '/' + r.resolution + ' warns=' + r.fitWarns);
    }
  });
  ok('警告の有無がGPU適性と一致する', mismatch.length === 0, mismatch.slice(0, 5).join(' / '));
})();

/* --- 11. 不足警告と本文が矛盾しないこと ------------------------------
 *  「4Kで最高画質を堪能できます」の直下に「4Kは厳しめです」が
 *  並ぶような自己矛盾を防ぐ。警告を出すときは、選んだ解像度で
 *  快適に遊べると断言する文面を出さない。
 * ------------------------------------------------------------------ */
(function () {
  var bad = [];
  rows.forEach(function (r) {
    if (!r.found || !r.fitWarns) return;
    // 警告時に出してはいけない文面が null になっているか
    if (r.comfortMessage) bad.push(r.budget + '/' + r.usage + '/' + r.resolution + ' comfortMessage');
    if (r.whyMessage) bad.push(r.budget + '/' + r.usage + '/' + r.resolution + ' whyMessage');
    // 快適バッジは「実際に快適な解像度」を指していること
    if (r.comfortLabel && r.suggestLabel && r.comfortLabel.indexOf(r.suggestLabel) !== 0) {
      bad.push(r.budget + '/' + r.usage + '/' + r.resolution + ' comfortLabel=' + r.comfortLabel);
    }
    // 「このクラス以上が安心」等の保証表現を付けていないこと
    if (r.forWhomText && r.forWhomText.indexOf('このクラス以上が安心') > -1) {
      bad.push(r.budget + '/' + r.usage + '/' + r.resolution + ' forWhomText');
    }
  });
  ok('不足警告時に矛盾する文面を出さない', bad.length === 0, bad.slice(0, 6).join(' / '));

  // 逆に、足りているときは従来どおり出ていること（消しすぎ防止）
  var okRows = rows.filter(function (r) { return r.found && !r.fitWarns; });
  ok('足りているときは快適メッセージが出る',
    okRows.every(function (r) { return Boolean(r.comfortMessage); }),
    '出ていない件数 ' + okRows.filter(function (r) { return !r.comfortMessage; }).length);
  ok('足りているときは「なぜこの構成？」が出る',
    okRows.every(function (r) { return Boolean(r.whyMessage); }),
    '出ていない件数 ' + okRows.filter(function (r) { return !r.whyMessage; }).length);
})();

/* ==================================================================
 *  12. 構成データの品質（Phase 7）
 * ==================================================================
 *  PC BUILD CHECK は動的な推薦エンジンではなく、
 *  事前設計した完成構成を引く**カタログ型**。
 *  そのため構成データそのものの品質をここで守る。
 * ================================================================== */
(function () {
  var pathMod = require('path');
  var gpuList = readJson(pathMod.join(DIR, '..', 'gpu-guide', 'gpus.json'));
  var Links = require(pathMod.join(DIR, '..', 'shared', 'gpu', 'gpu-links.js'));
  Links.setCatalog(gpuList);
  var gpuById = {};
  gpuList.forEach(function (g) { gpuById[g.id] = g; });
  var gpuOf = function (name) { return gpuById[Links.resolveId(name)]; };

  // CPU性能指標は upgrade-engine の CPU_TIERS を使う（独自指数を作らない）
  var engSrc = fs.readFileSync(pathMod.join(DIR, '..', 'upgrade', 'upgrade-engine.js'), 'utf8');
  var cpuTiers = {};
  var cm = engSrc.match(/var CPU_TIERS = \{([\s\S]*?)\};/);
  if (cm) {
    var re = /([a-z0-9]+):\s*(\d+)/g;
    var m;
    while ((m = re.exec(cm[1])) !== null) cpuTiers[m[1]] = Number(m[2]);
  }
  var cpuTier = function (s) { return cpuTiers[String(s).toLowerCase().replace(/[^a-z0-9]/g, '')]; };

  // --- 全GPU/CPUが参照解決できる ---
  var badGpu = builds.filter(function (b) { return !gpuOf(b.gpu); }).map(function (b) { return b.id + ':' + b.gpu; });
  ok('全構成のGPUが gpus.json で解決できる', badGpu.length === 0, badGpu.slice(0, 5).join(', '));
  var badCpu = builds.filter(function (b) { return cpuTier(b.cpu) === undefined; }).map(function (b) { return b.id + ':' + b.cpu; });
  ok('全構成のCPUが CPU_TIERS で解決できる', badCpu.length === 0, badCpu.slice(0, 5).join(', '));

  /* --- 中古前提GPUを標準構成に使わない -------------------------------
   * PC BUILD CHECK は「中古可」の設定を持たないため、
   * market:"used" のGPUを黙って新品構成に入れない。
   * ★万一入った場合にユーザーへ明示する仕組み（renderUsedGpuNotice）は
   *   Phase 6 で入れてあり、二重の安全策にしている。 */
  var usedBuilds = builds.filter(function (b) {
    var g = gpuOf(b.gpu);
    return g && g.market === 'used';
  }).map(function (b) { return b.id + ':' + b.gpu; });
  ok('標準構成に中古前提GPUを使っていない', usedBuilds.length === 0, usedBuilds.join(', '));
  // 安全策そのものが消えていないことも確認
  var pbcSrc = fs.readFileSync(pathMod.join(DIR, 'script.js'), 'utf8');
  ok('中古GPUの注意表示の仕組みは残っている', pbcSrc.indexOf('renderUsedGpuNotice') > -1);

  /* --- GPU価格が予算を圧迫しすぎない -------------------------------
   * GPUだけで予算の大半を使うとCPU・MB・RAM・SSD・電源・ケースを賄えない。
   * 実データの分布（最大66%）から70%を上限とする。 */
  var tooExpensive = builds.filter(function (b) {
    var g = gpuOf(b.gpu);
    return g && g.price / Number(b.budget) > 0.70;
  }).map(function (b) {
    var g = gpuOf(b.gpu);
    return b.id + ':' + Math.round(g.price / Number(b.budget) * 100) + '%';
  });
  ok('GPU価格が予算の70%を超えない', tooExpensive.length === 0, tooExpensive.slice(0, 5).join(', '));

  /* --- 単調性: 予算を上げて性能が下がらない ------------------------- */
  (function () {
    var badG = [];
    var badC = [];
    USAGES.forEach(function (u) {
      RESOLUTIONS.forEach(function (r) {
        var series = BUDGETS.map(function (bu) {
          return builds.find(function (b) { return b.budget === bu && b.usage === u && b.resolution === r; });
        }).filter(Boolean);
        for (var i = 1; i < series.length; i++) {
          var a = series[i - 1];
          var b = series[i];
          var ga = gpuOf(a.gpu);
          var gb = gpuOf(b.gpu);
          if (ga && gb && gb.rasterScore < ga.rasterScore) {
            badG.push(u + '/' + r + ' ' + a.budget + '→' + b.budget);
          }
          var ca = cpuTier(a.cpu);
          var cb = cpuTier(b.cpu);
          if (ca !== undefined && cb !== undefined && cb < ca) {
            badC.push(u + '/' + r + ' ' + a.budget + '→' + b.budget);
          }
        }
      });
    });
    ok('予算を上げてGPU性能が下がらない', badG.length === 0, badG.slice(0, 4).join(' / '));
    ok('予算を上げてCPU性能が下がらない', badC.length === 0, badC.slice(0, 4).join(' / '));
  })();

  /* --- 単調性: 同一予算で解像度を上げて性能が下がらない -------------- */
  (function () {
    var bad = [];
    BUDGETS.forEach(function (bu) {
      USAGES.forEach(function (u) {
        var series = RESOLUTIONS.map(function (r) {
          return builds.find(function (b) { return b.budget === bu && b.usage === u && b.resolution === r; });
        }).filter(Boolean);
        for (var i = 1; i < series.length; i++) {
          var ga = gpuOf(series[i - 1].gpu);
          var gb = gpuOf(series[i].gpu);
          if (ga && gb && gb.rasterScore < ga.rasterScore) {
            bad.push(bu + '/' + u + ' ' + series[i - 1].resolution + '→' + series[i].resolution);
          }
        }
      });
    });
    ok('解像度を上げてGPU性能が下がらない', bad.length === 0, bad.slice(0, 4).join(' / '));
  })();

  /* --- CPU/GPUバランスが極端でない --------------------------------
   * どちらか一方だけに寄った構成を検出する。
   * 実データの分布（0.69〜1.48）から 0.5〜1.8 を許容範囲とする。 */
  (function () {
    var bad = [];
    builds.forEach(function (b) {
      var g = gpuOf(b.gpu);
      var c = cpuTier(b.cpu);
      if (!g || c === undefined || !g.rasterScore) return;
      var ratio = c / g.rasterScore;
      if (ratio < 0.5 || ratio > 1.8) {
        bad.push(b.id + ':' + ratio.toFixed(2) + ' (' + b.cpu + '+' + b.gpu + ')');
      }
    });
    ok('CPU/GPUバランスが極端でない', bad.length === 0, bad.slice(0, 4).join(' / '));
  })();

  /* --- 推奨電源がGPU消費電力に対して足りる ------------------------
   * builds.json に電源は無く、結果画面の推奨値は性能プロファイル由来。
   * その推奨値がGPU単体の消費電力に対して十分かを見る。 */
  (function () {
    var bad = [];
    builds.forEach(function (b) {
      var g = gpuOf(b.gpu);
      if (!g || !g.power) return;
      var prof = API.getPerformanceProfile(b.gpu);
      var m = String(prof.psu).match(/(\d+)/);
      if (!m) return;
      // GPU単体の1.8倍未満だとCPU等を足したとき余裕が無い
      if (Number(m[1]) < g.power * 1.8) {
        bad.push(b.gpu + ' ' + g.power + 'W → 推奨' + prof.psu);
      }
    });
    ok('推奨電源がGPU消費電力に対して十分', bad.length === 0, [...new Set(bad)].slice(0, 4).join(' / '));
  })();

  /* --- 説明文が実際の構成と一致する ------------------------------- */
  (function () {
    var badGpu = builds.filter(function (b) { return b.comment.indexOf(b.gpu) < 0; }).map(function (b) { return b.id; });
    ok('comment に実際のGPU名が入っている', badGpu.length === 0, badGpu.slice(0, 5).join(', '));
    var badCpu = builds.filter(function (b) { return b.comment.indexOf(b.cpu) < 0; }).map(function (b) { return b.id; });
    ok('comment に実際のCPU名が入っている', badCpu.length === 0, badCpu.slice(0, 5).join(', '));
  })();

  /* --- RAM / ストレージが予算に対して不自然でない ------------------ */
  (function () {
    // 低予算に64GB、高予算に16GBのような極端な配分を検出
    var bad = builds.filter(function (b) {
      var bu = Number(b.budget);
      if (bu <= 100000 && b.ram === '64GB') return true;
      if (bu >= 250000 && b.ram === '16GB') return true;
      return false;
    }).map(function (b) { return b.id + ':' + (Number(b.budget) / 10000) + '万/' + b.ram; });
    ok('RAM容量が予算に対して極端でない', bad.length === 0, bad.slice(0, 5).join(', '));
  })();
})();

/* ------------------------------------------------------------------ */
console.log('');
console.log('  PC BUILD CHECK 診断ロジック テスト結果');
console.log('  --------------------------------------');
console.log('  成功: ' + pass);
console.log('  失敗: ' + fail);
if (failures.length) {
  console.log('');
  failures.forEach(function (f) { console.log('  × ' + f); });
}
console.log('');
process.exit(fail === 0 ? 0 : 1);
