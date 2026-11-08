/* =====================================================================
 *  Sippo PC BUILDER  組み立ての流れ (pb-flow.js)
 *  ---------------------------------------------------------------------
 *  画面に出す「案内」を決める純粋なロジック層（DOM には触れない）。
 *   - categoryStates() … 各カテゴリが 必須／任意／不要 か、今の状態（未選択・選択済み・要確認・非対応）
 *   - nextCategory()   … 次に選ぶとよいカテゴリ
 *   - cardBrief()      … 一覧のカードに最初から出す仕様（最大2つ。互換性に直結するもの）
 *   - cardSpecs()      … 「詳細を見る」の中に出す主要スペック（値が無ければ「未確認」）
 *   - insights()       … 5角形グラフの下に出す短い説明（スコアと理由から言えることだけ）
 *  必須かどうかは構成で変わる（内蔵GPUがあればGPUは任意、付属クーラーがあればクーラーは任意）。
 * ===================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SippoPBFlow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /** カテゴリの役割（初心者向けの一言） */
  var ROLES = {
    cpu: 'パソコンの頭脳',
    gpu: 'ゲーム映像を描く',
    gpuboard: '同じGPUのメーカー別製品',
    motherboard: 'パーツをつなぐ土台',
    memory: '作業を支える机の広さ',
    storage: 'データを保存する',
    psu: 'パーツに電気を送る',
    case: 'パーツを収める箱',
    cooler: 'CPUを冷やす',
    fan: 'ケース内の空気を入れ替える',
    expansion: '無線LANなどを後から足す',
  };

  /** 選ぶ順番（初心者向け）。CPU → GPU → マザボ → メモリ → SSD → 電源 → ケース → クーラー */
  var ORDER = ['cpu', 'gpu', 'motherboard', 'memory', 'storage', 'psu', 'case', 'cooler', 'gpuboard', 'fan', 'expansion'];

  var RANK = { ok: 0, check: 1, ng: 2 };
  var MISSING_ONLY = { display: 1, nocooler: 1 };

  function first(build, db, cat) {
    var e = ((build && build.items && build.items[cat]) || [])[0];
    return e && db.byId[e.id] ? db.byId[e.id] : null;
  }
  function count(build, cat) { return ((build && build.items && build.items[cat]) || []).length; }

  /**
   * 各カテゴリの「必要度」と状態。
   * need: 'required'（必須）/ 'recommended'（おすすめ：必須の数には入れないが次の案内に出す）/ 'optional'（任意）/ 'locked'（前のパーツを選ぶと選べる）
   * state: 'empty' / 'ok' / 'check' / 'ng'（選択済みのときは関係する互換性チェックの最悪値）
   */
  function categoryStates(build, db, categories, compat) {
    var cpu = first(build, db, 'cpu');
    var hasGpu = count(build, 'gpu') > 0;
    var out = {};
    categories.forEach(function (def) {
      var need = def.required ? 'required' : 'optional';
      var note = '';
      if (def.id === 'gpu') {
        // 内蔵GPUがあれば無くても組めるが、ゲームをするなら必要なので「おすすめ」として案内する（必須の数には入れない）
        if (cpu && cpu.specs.igpu && cpu.specs.igpu !== 'none') { need = 'recommended'; note = 'ゲームをするなら選びましょう。CPUに内蔵GPUがあるので、なしでも映像は出せます（ゲーム性能は評価不可になります）'; }
        else { need = 'required'; note = cpu && cpu.specs.igpu === 'none' ? 'このCPUは内蔵GPUが無いので必要です' : 'ゲームをするなら必要です'; }
      } else if (def.id === 'gpuboard') {
        need = hasGpu ? 'optional' : 'locked';
        note = hasGpu ? '選ぶと長さ・補助電源まで判定できます' : 'GPUを選ぶと選べます';
      } else if (def.id === 'cooler') {
        if (cpu && typeof cpu.specs.boxCooler === 'string' && cpu.specs.boxCooler) { need = 'optional'; note = '付属クーラー（' + cpu.specs.boxCooler + '）で使えます'; }
        else { need = 'required'; note = cpu && cpu.specs.boxCooler === false ? 'このCPUは付属クーラーがありません' : '付属クーラーの有無が分からないCPUでは選ぶのが安全です'; }
      }
      var n = count(build, def.id);
      var state = 'empty';
      if (n) {
        state = 'ok';
        ((compat && compat.results) || []).forEach(function (r) {
          // 「まだ選んでいない」ことを知らせるだけの判定（映像出力・クーラー未選択）は、
          // 選んだパーツの非対応ではないので状態に入れない（必要度 need の方で案内する）
          if (MISSING_ONLY[r.id]) return;
          if (r.involves && r.involves.indexOf(def.id) >= 0 && RANK[r.status] > RANK[state]) state = r.status;
        });
      }
      out[def.id] = { id: def.id, need: need, note: note, state: state, count: n, role: ROLES[def.id] || '' };
    });
    return out;
  }

  /** 必須パーツの進み具合 */
  function progress(states) {
    var req = Object.keys(states).filter(function (k) { return states[k].need === 'required'; });
    var done = req.filter(function (k) { return states[k].count > 0; });
    return { done: done.length, total: req.length, complete: req.length > 0 && done.length === req.length };
  }

  /** 次に選ぶとよいカテゴリ（必須・おすすめで未選択のうち ORDER の先頭）。skip に入れたカテゴリは除く。全部そろえば null */
  function nextCategory(states, current, skip) {
    var cand = ORDER.filter(function (k) { return states[k] && (states[k].need === 'required' || states[k].need === 'recommended') && !states[k].count && !(skip && skip[k]); });
    if (!cand.length) return null;
    var after = cand.filter(function (k) { return ORDER.indexOf(k) > ORDER.indexOf(current); });
    return after.length ? after[0] : cand[0];
  }

  /* ---------------- 製品カードの主要スペック ---------------- */
  function v(x, unit) { return x == null || x === '' ? null : String(x) + (unit || ''); }
  function cap(gb) { return isNum(gb) ? (gb >= 1000 ? (gb / 1000) + 'TB' : gb + 'GB') : null; }

  /** 製品カードに大きく出す項目（最大4つ）。値が無い項目は value:null（画面では「未確認」） */
  function cardSpecs(p, db) {
    var s = (p && p.specs) || {};
    switch (p && p.category) {
      case 'cpu': return [
        { label: 'コア / スレッド', value: isNum(s.cores) ? s.cores + ' / ' + (isNum(s.threads) ? s.threads : '?') : null },
        { label: 'ソケット', value: v(s.socket) },
        { label: 'ゲーム性能指数', value: v(s.gameTier) },
        { label: '内蔵GPU', value: s.igpu === 'none' ? 'なし' : (s.igpu ? 'あり' : null) },
      ];
      case 'gpu': return [
        { label: '描画性能指数', value: v(s.raster) },
        { label: 'VRAM', value: v(s.vram, 'GB') },
        { label: '想定の解像度', value: v(s.target) },
        { label: '消費電力', value: v(s.powerW, 'W') },
      ];
      case 'gpuboard': {
        var chip = db && p.chip ? db.byId[p.chip] : null;
        return [
          { label: 'GPU', value: chip ? chip.name.replace(/^(GeForce|Radeon)\s+/, '') : v(p.chip) },
          { label: '長さ', value: v(s.lengthMm, 'mm') },
          { label: '補助電源', value: s.pin16 ? '16ピン×' + s.pin16 : (s.pin8 ? '8ピン×' + s.pin8 : (isNum(s.pin8) || isNum(s.pin16) ? 'なし' : null)) },
          { label: '推奨電源', value: v(s.recommendedPsuW, 'W') },
        ];
      }
      case 'motherboard': return [
        { label: 'ソケット / チップセット', value: s.socket ? s.socket + (s.chipset ? ' / ' + s.chipset : '') : null },
        { label: 'サイズ', value: v(s.formFactor) },
        { label: 'メモリ', value: s.memoryType ? s.memoryType + (isNum(s.memorySlots) ? '・' + s.memorySlots + 'スロット' : '') : null },
        { label: 'M.2スロット', value: v(s.m2Slots, '本') },
      ];
      case 'memory': return [
        { label: '規格・速度', value: s.type ? s.type + (isNum(s.speed) ? '-' + s.speed : '') : null },
        { label: '容量', value: isNum(s.capacityGB) ? s.capacityGB + 'GB' + (isNum(s.modules) && s.modules > 1 ? '（' + (s.capacityGB / s.modules) + 'GB×' + s.modules + '）' : '') : null },
        { label: 'CL', value: v(s.cas) },
        { label: '電圧', value: v(s.voltage) },
      ];
      case 'storage': return [
        { label: '容量', value: cap(s.capacityGB) },
        { label: '接続', value: v(s.interface) || (s.kind === 'hdd' ? 'SATA HDD' : null) },
        { label: '読み込み', value: v(s.seqReadMBs, 'MB/s') },
        { label: '書き込み耐久（TBW）', value: v(s.tbw, 'TB') },
      ];
      case 'psu': return [
        { label: '容量', value: v(s.watt, 'W') },
        { label: '効率', value: v(s.efficiency) },
        { label: '規格・奥行き', value: s.formFactor ? s.formFactor + (isNum(s.depthMm) ? '・' + s.depthMm + 'mm' : '') : null },
        { label: 'GPU用16ピン', value: isNum(s.h12v2x6) ? (s.h12v2x6 ? s.h12v2x6 + '本' : 'なし') : null },
      ];
      case 'case': return [
        { label: '対応マザボ', value: Array.isArray(s.supportedMb) ? s.supportedMb.join(' / ') : null },
        { label: 'GPUの長さ', value: isNum(s.maxGpuMm) ? s.maxGpuMm + 'mmまで' : null },
        { label: 'クーラーの高さ', value: isNum(s.maxCoolerMm) ? s.maxCoolerMm + 'mmまで' : null },
        { label: '付属ファン', value: isNum(s.includedFanCount) ? s.includedFanCount + '個' : null },
      ];
      case 'cooler': return [
        { label: '種類', value: s.type === 'aio' ? '簡易水冷' : (s.type === 'air' ? '空冷' : null) },
        { label: s.type === 'aio' ? 'ラジエーター' : '高さ', value: s.type === 'aio' ? v(s.radiatorMm, 'mm') : v(s.heightMm, 'mm') },
        { label: '対応ソケット', value: Array.isArray(s.sockets) ? s.sockets.slice(0, 4).join(' / ') + (s.sockets.length > 4 ? ' ほか' : '') : null },
        { label: 'ファン', value: v(s.fans) },
      ];
      case 'fan': return [
        { label: 'サイズ', value: v(s.sizeMm, 'mm') },
        { label: '最大回転数', value: v(s.maxRpm, 'rpm') },
        { label: '風量', value: v(s.airflow) },
        { label: '騒音', value: v(s.noise) },
      ];
      case 'expansion': return [{ label: '使うスロット', value: s.slot === 'pcie-x1' ? 'PCIe x1' : v(s.slot) }];
      default: return [];
    }
  }

  /* ---------------- グラフの下の短い説明 ---------------- */
  var RES_LABEL = { fhd: 'フルHD', wqhd: 'WQHD', '4k': '4K' };
  var AXIS_JA = { game: 'ゲーム性能', video: '動画編集', stream: '配信', expand: '拡張性', cost: 'コスパ' };

  /**
   * スコアの結果から、根拠のある一言だけを返す（最大5つ）。
   * kind: 'good'（強み）/ 'warn'（注意）/ 'info'（評価できない理由など）
   * 75点は gpu-target.js の「その解像度を主用途として検討できる下限」に合わせた基準（pb-score.js と同じ）。
   */
  function insights(score, res, gpu) {
    var out = [];
    if (!score || !score.axes) return out;
    var ax = score.axes, rl = RES_LABEL[res] || res;
    if (isNum(ax.game.score)) {
      if (ax.game.score >= 75) out.push({ kind: 'good', text: rl + 'のゲームを主な用途として検討できる目安（75点）に届いています（実測FPSではありません）' });
      else if (ax.game.score < 50) out.push({ kind: 'warn', text: rl + 'のゲームには余裕が少なめです（目安は75点）。解像度を下げるか、GPUの見直しを検討してください' });
      (ax.game.reasons || []).forEach(function (r) {
        if (/CPUが先に限界/.test(r)) out.push({ kind: 'warn', text: 'CPUとGPUの性能バランスに注意：この解像度ではCPUが先に限界になりやすい組み合わせです' });
        if (/メモリ\d+GBは/.test(r)) out.push({ kind: 'warn', text: 'メモリが少なめです（最近のゲームは16GB以上が目安）' });
        if (/VRAM/.test(r)) out.push({ kind: 'warn', text: r });
      });
    }
    if (isNum(ax.video.score) && ax.video.score >= 70) out.push({ kind: 'good', text: '動画編集にも向いた構成です（コア数とクロックからの推定・参考値）' });
    if (gpu && Array.isArray(gpu.specs.encoder) && gpu.specs.encoder.indexOf('av1') >= 0) out.push({ kind: 'good', text: 'GPUがAV1のハードウェアエンコードに対応しています（配信・録画でCPUの負担を減らせます）' });
    var na = Object.keys(AXIS_JA).filter(function (k) { return ax[k] && ax[k].grade === 'na'; });
    na.forEach(function (k) {
      var why = (ax[k].reasons || [])[0] || '';
      out.push({ kind: 'info', text: AXIS_JA[k] + 'は評価不可（N/A）：' + why });
    });
    // 重複を除いて最大5つ（注意を先に）
    var seen = {};
    var order = { warn: 0, info: 1, good: 2 };
    return out.filter(function (x) { if (seen[x.text]) return false; seen[x.text] = 1; return true; })
      .sort(function (a, b) { return order[a.kind] - order[b.kind]; }).slice(0, 5);
  }

  /**
   * 一覧のカードに最初から出す「選ぶときに必要な仕様」だけ（最大2つ。2026-11-08〜）。
   * 互換性に直結する項目（ソケット・規格・サイズ）を優先し、細かい性能値は「詳細を見る」へ回す。
   * 値が無ければ null（画面では「情報なし」）。推測で埋めない。
   */
  function cardBrief(p, db) {
    var s = (p && p.specs) || {};
    switch (p && p.category) {
      case 'cpu': return [{ label: 'ソケット', value: v(s.socket) }];
      case 'gpu': return [{ label: 'VRAM', value: v(s.vram, 'GB') }];
      case 'gpuboard': return [
        { label: '長さ', value: v(s.lengthMm, 'mm') },
        { label: '補助電源', value: s.pin16 ? '16ピン×' + s.pin16 : (s.pin8 ? '8ピン×' + s.pin8 : (isNum(s.pin8) || isNum(s.pin16) ? 'なし' : null)) },
      ];
      case 'motherboard': return [
        { label: 'ソケット', value: v(s.socket) },
        { label: 'サイズ', value: v(s.formFactor) },
      ];
      case 'memory': return [
        { label: '規格', value: v(s.type) },
        { label: '容量', value: isNum(s.capacityGB) ? s.capacityGB + 'GB' + (isNum(s.modules) && s.modules > 1 ? '（' + (s.capacityGB / s.modules) + 'GB×' + s.modules + '）' : '') : null },
      ];
      case 'storage': return [
        { label: '容量', value: cap(s.capacityGB) },
        { label: '種類', value: s.kind === 'nvme' ? 'M.2 NVMe' : (s.kind === 'sata-ssd' ? '2.5インチ SATA' : (s.kind === 'hdd' ? '3.5インチ HDD' : null)) },
      ];
      case 'psu': return [{ label: '容量', value: v(s.watt, 'W') }];
      case 'case': return [{ label: '対応サイズ', value: Array.isArray(s.supportedMb) ? s.supportedMb.join(' / ') : null }];
      case 'cooler': return [
        { label: '種類', value: s.type === 'aio' ? '簡易水冷' : (s.type === 'air' ? '空冷' : null) },
      ].concat(s.type === 'aio' && isNum(s.radiatorMm) ? [{ label: 'ラジエーター', value: s.radiatorMm + 'mm' }] : []);
      case 'fan': return [{ label: 'サイズ', value: v(s.sizeMm, 'mm') }];
      case 'expansion': return [{ label: '使うスロット', value: s.slot === 'pcie-x1' ? 'PCIe x1' : v(s.slot) }];
      default: return [];
    }
  }

  return { ROLES: ROLES, ORDER: ORDER, MISSING_ONLY: MISSING_ONLY, categoryStates: categoryStates, progress: progress, nextCategory: nextCategory, cardSpecs: cardSpecs, cardBrief: cardBrief, insights: insights };
});
