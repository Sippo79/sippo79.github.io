/* =====================================================================
 *  Sippo PC BUILDER  互換性チェック (pb-compat.js)
 *  ---------------------------------------------------------------------
 *  選んだパーツが「実際に組めるか」を判定する純粋なロジック層。
 *
 *  【判定は3段階】
 *    ok    … 対応。両方のパーツに根拠となる値があり、条件を満たす
 *    ng    … 非対応。根拠となる値があり、条件を満たさない
 *    check … 要確認。値が足りない／条件付き（BIOS・変換アダプタ・取り付け位置など）
 *
 *  ★根拠となる値が null のとき ok を返してはいけない（必ず check）。
 *    この規則は test-pc-builder.js が全チェックについて検証している。
 *
 *  build の形:
 *    { items: { cpu: [{id, qty}], gpu: [...], gpuboard: [...], motherboard: [...],
 *               memory: [...], storage: [...], psu: [...], case: [...],
 *               cooler: [...], fan: [...], expansion: [...] } }
 * ===================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SippoPBCompat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var OK = 'ok', NG = 'ng', CHECK = 'check';
  var RANK = { ok: 0, check: 1, ng: 2 };

  /* 消費電力の推定に使う定数（推定モデル。docs に記載）
   *  - AMD の TDP から PPT（ソケットの最大電力）を求める係数。AMD は PPT = TDP × 1.35 と定めている
   *    （65W → 88W、105W → 142W、170W → 230W）。
   *  - BASE … マザーボード・メモリ・SSD・USB機器などの合計の目安
   *  - 電源容量に対する推定負荷の上限（これを超えると余裕不足） */
  var POWER = {
    AMD_PPT_RATIO: 1.35,
    BASE_W: 50,
    HDD_W: 8,
    FAN_W: 3,
    NG_RATIO: 0.9,
    CHECK_RATIO: 0.7,
  };

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function entries(build, cat) {
    var arr = (build && build.items && build.items[cat]) || [];
    return arr.filter(function (e) { return e && e.id; });
  }

  function first(build, db, cat) {
    var e = entries(build, cat)[0];
    return e ? db.byId[e.id] || null : null;
  }

  function withParts(build, db, cat) {
    return entries(build, cat).map(function (e) {
      return { part: db.byId[e.id] || null, qty: Math.max(1, Math.floor(Number(e.qty) || 1)) };
    }).filter(function (x) { return x.part; });
  }

  function res(id, label, status, message, involves, extra) {
    return Object.assign({ id: id, label: label, status: status, message: message, involves: involves }, extra || {});
  }

  /* ---------------------------------------------------------------
   *  消費電力の推定
   * --------------------------------------------------------------- */
  function cpuPowerW(cpu) {
    if (!cpu) return null;
    var s = cpu.specs || {};
    if (isNum(s.maxPowerW)) return s.maxPowerW; // Intel: Maximum Turbo Power
    if (cpu.maker === 'AMD' && isNum(s.tdpW)) return Math.round(s.tdpW * POWER.AMD_PPT_RATIO);
    return null;
  }

  function estimatePower(build, db) {
    var cpu = first(build, db, 'cpu');
    var gpu = first(build, db, 'gpu');
    var hdd = 0, fans = 0;
    withParts(build, db, 'storage').forEach(function (x) { if (x.part.specs.kind === 'hdd') hdd += x.qty; });
    withParts(build, db, 'fan').forEach(function (x) { fans += x.qty; });
    var cpuW = cpuPowerW(cpu);
    var gpuW = gpu ? (isNum(gpu.specs.powerW) ? gpu.specs.powerW : null) : 0;
    var other = POWER.BASE_W + hdd * POWER.HDD_W + fans * POWER.FAN_W;
    var complete = cpu ? (cpuW != null && gpuW != null) : false;
    var total = (cpuW || 0) + (gpuW || 0) + other;
    return {
      cpuW: cpuW, gpuW: gpuW, otherW: other, totalW: total, complete: complete,
      note: 'CPUはAMD=TDP×1.35、Intel=最大ターボ電力。GPUはGPU GUIDEの消費電力。その他は' + POWER.BASE_W + 'W＋HDD' + POWER.HDD_W + 'W/台＋ファン' + POWER.FAN_W + 'W/個の目安。',
    };
  }

  /* ---------------------------------------------------------------
   *  個別チェック
   * --------------------------------------------------------------- */
  var CHECKS = [];
  function def(fn) { CHECKS.push(fn); }

  // 1. CPU とマザーボードのソケット
  def(function (b, db) {
    var cpu = first(b, db, 'cpu'), mb = first(b, db, 'motherboard');
    if (!cpu || !mb) return null;
    var a = cpu.specs.socket, m = mb.specs.socket;
    if (!a || !m) return res('socket', 'CPUソケット', CHECK, 'ソケットの情報が不足しています。', ['cpu', 'motherboard']);
    if (a === m) return res('socket', 'CPUソケット', OK, 'CPUとマザーボードはどちらも ' + a + ' です。', ['cpu', 'motherboard']);
    return res('socket', 'CPUソケット', NG, 'CPUは ' + a + '、マザーボードは ' + m + ' です。物理的に取り付けできません。', ['cpu', 'motherboard']);
  });

  // 2. マザーボードの CPU 対応・BIOS
  def(function (b, db) {
    var cpu = first(b, db, 'cpu'), mb = first(b, db, 'motherboard');
    if (!cpu || !mb) return null;
    if (cpu.specs.socket && mb.specs.socket && cpu.specs.socket !== mb.specs.socket) return null; // ソケットで既に非対応
    var fam = cpu.family;
    var fams = mb.specs.cpuFamilies;
    var rules = db.rules || {};
    var famLabel = fam && rules.cpuFamilies && rules.cpuFamilies[fam] ? rules.cpuFamilies[fam].label : (fam || '不明');
    if (!fam || !Array.isArray(fams)) {
      return res('bios', 'CPU対応・BIOS', CHECK, 'CPU世代またはマザーボードの対応CPU情報が不足しています。メーカーのCPUサポートリストを確認してください。', ['cpu', 'motherboard']);
    }
    if (fams.indexOf(fam) < 0) {
      return res('bios', 'CPU対応・BIOS', CHECK, mb.name + ' の対応CPU表記に ' + famLabel + ' が見当たりません。CPUサポートリストで確認してください。', ['cpu', 'motherboard']);
    }
    var chip = rules.chipsets && rules.chipsets[mb.specs.chipset];
    if (chip && Array.isArray(chip.nativeFamilies) && chip.nativeFamilies.indexOf(fam) >= 0) {
      return res('bios', 'CPU対応・BIOS', OK, famLabel + ' は ' + mb.specs.chipset + ' の登場時点で発売済みの世代で、対応CPUに含まれます。', ['cpu', 'motherboard']);
    }
    return res('bios', 'CPU対応・BIOS', CHECK, famLabel + ' には対応していますが、出荷時のBIOSが古いと起動しない場合があります。購入前に「BIOSの対応バージョン」と、BIOSフラッシュバック機能の有無を確認してください。', ['cpu', 'motherboard'],
      { note: chip ? chip.note : '' });
  });

  // 3. メモリ規格（DDR4 / DDR5）
  def(function (b, db) {
    var mem = first(b, db, 'memory'), mb = first(b, db, 'motherboard'), cpu = first(b, db, 'cpu');
    if (!mem || (!mb && !cpu)) return null;
    var t = mem.specs.type;
    if (!t) return res('memtype', 'メモリ規格', CHECK, 'メモリの規格が不明です。', ['memory', 'motherboard', 'cpu']);
    if (mb) {
      if (!mb.specs.memoryType) return res('memtype', 'メモリ規格', CHECK, 'マザーボードのメモリ規格が不明です。', ['memory', 'motherboard']);
      if (mb.specs.memoryType !== t) return res('memtype', 'メモリ規格', NG, 'マザーボードは ' + mb.specs.memoryType + '、メモリは ' + t + ' です。差し込めません。', ['memory', 'motherboard']);
    }
    if (cpu && Array.isArray(cpu.specs.memoryTypes) && cpu.specs.memoryTypes.indexOf(t) < 0) {
      return res('memtype', 'メモリ規格', NG, cpu.name + ' は ' + cpu.specs.memoryTypes.join(' / ') + ' 対応です（' + t + ' は非対応）。', ['memory', 'cpu']);
    }
    if (!mb) return res('memtype', 'メモリ規格', CHECK, 'マザーボードを選ぶと判定できます。', ['memory', 'motherboard']);
    var note = '';
    var cpuSpeed = cpu && cpu.specs.memorySpeed ? cpu.specs.memorySpeed : '';
    if (isNum(mem.specs.speed) && cpuSpeed) {
      var m = cpuSpeed.match(new RegExp(t + '-(\\d+)'));
      if (m && mem.specs.speed > Number(m[1])) note = 'メモリの速度（' + mem.specs.speed + '）はCPUの定格（' + t + '-' + m[1] + '）を超えるため、XMP/EXPOによるオーバークロック設定で動かす前提です。';
    }
    return res('memtype', 'メモリ規格', OK, 'マザーボードとメモリはどちらも ' + t + ' です。', ['memory', 'motherboard', 'cpu'], { note: note });
  });

  // 4. メモリ枚数・容量
  def(function (b, db) {
    var memEntries = withParts(b, db, 'memory'), mb = first(b, db, 'motherboard');
    if (!memEntries.length || !mb) return null;
    var x = memEntries[0];
    var modules = isNum(x.part.specs.modules) ? x.part.specs.modules * x.qty : null;
    var cap = isNum(x.part.specs.capacityGB) ? x.part.specs.capacityGB * x.qty : null;
    var slots = mb.specs.memorySlots, max = mb.specs.maxMemoryGB;
    if (modules == null || !isNum(slots)) {
      return res('memslots', 'メモリの枚数・容量', CHECK, 'マザーボードのメモリスロット数（またはメモリの枚数）が未登録です。', ['memory', 'motherboard']);
    }
    if (modules > slots) return res('memslots', 'メモリの枚数・容量', NG, 'メモリは ' + modules + '枚、スロットは ' + slots + '本です。', ['memory', 'motherboard']);
    if (cap != null && isNum(max) && cap > max) return res('memslots', 'メモリの枚数・容量', NG, '合計 ' + cap + 'GB はマザーボードの上限 ' + max + 'GB を超えます。', ['memory', 'motherboard']);
    if (cap != null && !isNum(max)) return res('memslots', 'メモリの枚数・容量', CHECK, '枚数は収まりますが、最大容量が未登録です。', ['memory', 'motherboard']);
    var note = modules === 4 ? '4枚挿しは2枚挿しより動作速度が下がる場合があります。' : '';
    return res('memslots', 'メモリの枚数・容量', OK, modules + '枚 / ' + slots + 'スロット、合計 ' + cap + 'GB（上限 ' + max + 'GB）。', ['memory', 'motherboard'], { note: note });
  });

  // 5. マザーボードとケースのフォームファクター
  var FF_ORDER = ['Mini-ITX', 'Micro-ATX', 'ATX', 'E-ATX'];
  def(function (b, db) {
    var mb = first(b, db, 'motherboard'), cs = first(b, db, 'case');
    if (!mb || !cs) return null;
    var ff = mb.specs.formFactor, sup = cs.specs.supportedMb;
    if (!ff) return res('formfactor', 'マザーボードとケースのサイズ', CHECK, 'マザーボードのサイズ（ATX / Micro-ATX など）が未指定です。', ['motherboard', 'case']);
    if (!Array.isArray(sup)) return res('formfactor', 'マザーボードとケースのサイズ', CHECK, 'ケースの対応マザーボードが未登録です。', ['motherboard', 'case']);
    if (sup.indexOf(ff) >= 0) return res('formfactor', 'マザーボードとケースのサイズ', OK, cs.name + ' は ' + ff + ' に対応しています。', ['motherboard', 'case']);
    return res('formfactor', 'マザーボードとケースのサイズ', NG, cs.name + ' の対応は ' + sup.join(' / ') + ' です。' + ff + ' は入りません。', ['motherboard', 'case']);
  });

  // 6. GPU の長さ・厚さとケース
  def(function (b, db) {
    var gpu = first(b, db, 'gpu'), board = first(b, db, 'gpuboard'), cs = first(b, db, 'case'), cooler = first(b, db, 'cooler');
    if (!gpu || !cs) return null;
    var max = cs.specs.maxGpuMm;
    if (!board) return res('gpulen', 'グラボの長さ', CHECK, 'グラボの長さは製品ごとに違います。「グラボ製品」を選ぶと判定できます（' + cs.name + ' の上限は ' + (isNum(max) ? max + 'mm' : '未登録') + '）。', ['gpu', 'gpuboard', 'case']);
    var len = board.specs.lengthMm;
    if (!isNum(len) || !isNum(max)) return res('gpulen', 'グラボの長さ', CHECK, 'グラボの長さまたはケースの上限が未登録です。', ['gpuboard', 'case']);
    if (len > max) return res('gpulen', 'グラボの長さ', NG, 'グラボ ' + len + 'mm はケースの上限 ' + max + 'mm を超えます。', ['gpuboard', 'case']);
    var thick = board.specs.thickMm, maxThick = cs.specs.maxGpuThickMm;
    if (isNum(maxThick) && isNum(thick) && thick > maxThick) return res('gpulen', 'グラボの長さ・厚さ', NG, 'グラボの厚さ ' + thick + 'mm がケースの上限 ' + maxThick + 'mm を超えます。', ['gpuboard', 'case']);
    var notes = [];
    if (cs.specs.gpuNote) notes.push(cs.specs.gpuNote);
    if (cooler && cooler.specs.type === 'aio' && isNum(cs.specs.gpuMmWithFrontRad) && len > cs.specs.gpuMmWithFrontRad) {
      return res('gpulen', 'グラボの長さ', CHECK, 'ラジエーターを前面に付けると上限が ' + cs.specs.gpuMmWithFrontRad + 'mm に下がり、グラボ ' + len + 'mm が入りません。ラジエーターは前面以外に付けてください。', ['gpuboard', 'case', 'cooler']);
    }
    var margin = max - len;
    return res('gpulen', 'グラボの長さ', OK, 'グラボ ' + len + 'mm / ケース上限 ' + max + 'mm（余裕 ' + margin + 'mm）。', ['gpuboard', 'case'], { note: notes.join(' ') });
  });

  // 7. グラボ製品とGPUチップの一致
  def(function (b, db) {
    var gpu = first(b, db, 'gpu'), board = first(b, db, 'gpuboard');
    if (!board) return null;
    if (!gpu) return res('gpuboard', 'グラボ製品', CHECK, 'グラボ製品に対応するGPUが選ばれていません。', ['gpu', 'gpuboard']);
    if (board.chip !== gpu.id) return res('gpuboard', 'グラボ製品', NG, board.name + ' は ' + gpu.name + ' ではありません。', ['gpu', 'gpuboard']);
    return null;
  });

  // 8. CPUクーラーの対応ソケット
  def(function (b, db) {
    var cpu = first(b, db, 'cpu'), cooler = first(b, db, 'cooler');
    if (!cpu || !cooler) return null;
    var socks = cooler.specs.sockets, s = cpu.specs.socket;
    if (!Array.isArray(socks) || !s) return res('coolersocket', 'クーラーの対応ソケット', CHECK, 'クーラーの対応ソケットが未登録です（機種未指定のクーラーは購入時に確認してください）。', ['cpu', 'cooler']);
    if (socks.indexOf(s) >= 0) return res('coolersocket', 'クーラーの対応ソケット', OK, cooler.name + ' は ' + s + ' に対応しています。', ['cpu', 'cooler']);
    return res('coolersocket', 'クーラーの対応ソケット', NG, cooler.name + ' の対応ソケットは ' + socks.join(' / ') + ' です（' + s + ' は非対応）。', ['cpu', 'cooler']);
  });

  // 9. 空冷クーラーの高さ
  def(function (b, db) {
    var cooler = first(b, db, 'cooler'), cs = first(b, db, 'case');
    if (!cooler || !cs || cooler.specs.type === 'aio') return null;
    var h = cooler.specs.heightMm, max = cs.specs.maxCoolerMm;
    if (!isNum(h) || !isNum(max)) return res('coolerheight', 'クーラーの高さ', CHECK, 'クーラーの高さまたはケースの上限が未登録です。', ['cooler', 'case']);
    if (h > max) return res('coolerheight', 'クーラーの高さ', NG, 'クーラー ' + h + 'mm はケースの上限 ' + max + 'mm を超えます。', ['cooler', 'case']);
    var note = cooler.specs.heightNote || '';
    if (max - h < 5) return res('coolerheight', 'クーラーの高さ', CHECK, 'クーラー ' + h + 'mm / 上限 ' + max + 'mm で余裕が5mm未満です。ファン込みの実寸を確認してください。', ['cooler', 'case'], { note: note });
    return res('coolerheight', 'クーラーの高さ', OK, 'クーラー ' + h + 'mm / ケース上限 ' + max + 'mm。', ['cooler', 'case'], { note: note });
  });

  // 10. 簡易水冷のラジエーター
  var POS_LABEL = { front: '前面', top: '天面', rear: '背面', side: '側面', bottom: '底面' };
  def(function (b, db) {
    var cooler = first(b, db, 'cooler'), cs = first(b, db, 'case');
    if (!cooler || !cs || cooler.specs.type !== 'aio') return null;
    var size = cooler.specs.radiatorMm, rads = cs.specs.radiators;
    if (!isNum(size) || !rads) return res('radiator', 'ラジエーター', CHECK, 'ラジエーターのサイズまたはケースの対応位置が未登録です。', ['cooler', 'case']);
    var pos = Object.keys(rads).filter(function (k) { return Array.isArray(rads[k]) && rads[k].indexOf(size) >= 0; });
    if (!pos.length) return res('radiator', 'ラジエーター', NG, cs.name + ' には ' + size + 'mm ラジエーターを付けられる位置がありません。', ['cooler', 'case']);
    var note = '厚さ・メモリやVRMヒートシンクとの干渉は位置によって変わります。';
    return res('radiator', 'ラジエーター', OK, size + 'mm ラジエーターは ' + pos.map(function (p) { return POS_LABEL[p] || p; }).join('・') + ' に取り付けできます。', ['cooler', 'case'], { note: note });
  });

  // 11. CPUクーラー未選択
  def(function (b, db) {
    var cpu = first(b, db, 'cpu'), cooler = first(b, db, 'cooler');
    if (!cpu || cooler) return null;
    if (cpu.specs.boxCooler) return res('nocooler', 'CPUクーラー', OK, cpu.name + ' には ' + cpu.specs.boxCooler + ' が付属します（付属クーラーで使う前提）。', ['cpu', 'cooler']);
    return res('nocooler', 'CPUクーラー', CHECK, 'CPUクーラーが未選択です。' + cpu.name + ' に付属クーラーがあるかは確認できていません。', ['cpu', 'cooler']);
  });

  // 12. 映像出力（GPUなし構成）
  def(function (b, db) {
    var cpu = first(b, db, 'cpu'), gpu = first(b, db, 'gpu');
    if (!cpu || gpu) return null;
    var ig = cpu.specs.igpu;
    if (ig === 'none') return res('display', '映像出力', NG, cpu.name + ' は内蔵GPUが無いため、GPU（グラボ）が必要です。', ['cpu', 'gpu']);
    if (!ig) return res('display', '映像出力', CHECK, cpu.name + ' の内蔵GPUの有無が未登録です。', ['cpu', 'gpu']);
    return res('display', '映像出力', OK, '内蔵GPU（' + ig + '）で映像を出します。マザーボード側の映像端子（HDMI / DisplayPort）を使います。', ['cpu', 'gpu', 'motherboard']);
  });

  // 13. 電源の規格・長さとケース
  def(function (b, db) {
    var psu = first(b, db, 'psu'), cs = first(b, db, 'case');
    if (!psu || !cs) return null;
    var ff = psu.specs.formFactor, forms = cs.specs.psuForm;
    if (!ff || !Array.isArray(forms)) return res('psufit', '電源の取り付け', CHECK, '電源またはケースの電源規格が未登録です。', ['psu', 'case']);
    if (forms.indexOf(ff) < 0) {
      if (ff === 'SFX' && forms.indexOf('ATX') >= 0) return res('psufit', '電源の取り付け', CHECK, 'ATXケースにSFX電源を付けるには変換ブラケットが必要な場合があります。', ['psu', 'case']);
      return res('psufit', '電源の取り付け', NG, cs.name + ' の電源規格は ' + forms.join(' / ') + ' です（' + ff + ' は非対応）。', ['psu', 'case']);
    }
    if (cs.specs.psuFormVerified === false) return res('psufit', '電源の取り付け', CHECK, 'ケースの電源規格が公式ページで明記されていません。', ['psu', 'case']);
    var d = psu.specs.depthMm, max = cs.specs.maxPsuMm;
    if (!isNum(d) || !isNum(max)) return res('psufit', '電源の取り付け', CHECK, ff + ' 規格は一致しています。' + (isNum(d) ? '' : '電源の奥行きが未登録') + (!isNum(d) && !isNum(max) ? '・' : '') + (isNum(max) ? '' : 'ケースの電源長の上限が未登録') + 'のため、収まるかは判定できません' + (isNum(max) ? '（ケースの上限 ' + max + 'mm）' : '') + '。', ['psu', 'case']);
    if (d > max) return res('psufit', '電源の取り付け', NG, '電源の奥行き ' + d + 'mm がケースの上限 ' + max + 'mm を超えます。', ['psu', 'case']);
    return res('psufit', '電源の取り付け', OK, ff + ' 電源 ' + d + 'mm / ケース上限 ' + max + 'mm。', ['psu', 'case']);
  });

  // 14. 電源容量
  def(function (b, db) {
    var psu = first(b, db, 'psu'), cpu = first(b, db, 'cpu');
    if (!psu || !cpu) return null;
    var w = psu.specs.watt;
    var p = estimatePower(b, db);
    var gpu = first(b, db, 'gpu'), board = first(b, db, 'gpuboard');
    var official = board && isNum(board.specs.recommendedPsuW) ? board.specs.recommendedPsuW
      : (gpu && isNum(gpu.specs.officialPsuW) ? gpu.specs.officialPsuW : null);
    var extra = { power: p, officialPsuW: official };
    if (!isNum(w)) return res('psuwatt', '電源容量', CHECK, '電源の容量が未登録です。', ['psu'], extra);
    if (!p.complete) {
      var known = Math.round(p.totalW);
      if (known > w * POWER.NG_RATIO) return res('psuwatt', '電源容量', NG, '分かっている分だけで約 ' + known + 'W あり、' + w + 'W 電源では足りません。', ['psu', 'cpu', 'gpu'], extra);
      return res('psuwatt', '電源容量', CHECK, (p.cpuW == null ? 'CPU' : 'GPU') + 'の消費電力データが未登録のため、容量の余裕を判定できません。', ['psu', 'cpu', 'gpu'], extra);
    }
    var ratio = p.totalW / w;
    extra.ratio = ratio;
    if (ratio > POWER.NG_RATIO) return res('psuwatt', '電源容量', NG, '推定 ' + Math.round(p.totalW) + 'W に対して ' + w + 'W 電源では余裕がありません（' + Math.round(ratio * 100) + '%）。', ['psu', 'cpu', 'gpu'], extra);
    if (official && w < official) return res('psuwatt', '電源容量', CHECK, 'GPUメーカーの推奨は ' + official + 'W 以上です（この電源は ' + w + 'W）。推定負荷は ' + Math.round(p.totalW) + 'W です。', ['psu', 'gpu', 'gpuboard'], extra);
    if (ratio > POWER.CHECK_RATIO) return res('psuwatt', '電源容量', CHECK, '推定 ' + Math.round(p.totalW) + 'W / ' + w + 'W（' + Math.round(ratio * 100) + '%）。余裕が少なめです。', ['psu', 'cpu', 'gpu'], extra);
    return res('psuwatt', '電源容量', OK, '推定 ' + Math.round(p.totalW) + 'W / ' + w + 'W（' + Math.round(ratio * 100) + '%）' + (official ? '。GPUメーカー推奨 ' + official + 'W 以上も満たしています' : '') + '。', ['psu', 'cpu', 'gpu'], extra);
  });

  // 15. GPU 補助電源コネクタ
  def(function (b, db) {
    var gpu = first(b, db, 'gpu'), board = first(b, db, 'gpuboard'), psu = first(b, db, 'psu');
    if (!gpu || !psu) return null;
    if (!board) return res('gpupower', 'GPU補助電源', CHECK, '補助電源の形状は製品ごとに違います（リファレンス仕様: ' + (gpu.specs.connectorRef || '未登録') + '）。グラボ製品を選ぶと判定できます。', ['gpu', 'gpuboard', 'psu']);
    var n8 = board.specs.pin8, n16 = board.specs.pin16, p8 = psu.specs.pcie8, p16 = psu.specs.h12v2x6;
    if (!isNum(n8) || !isNum(n16)) return res('gpupower', 'GPU補助電源', CHECK, 'グラボの補助電源コネクタが未登録です。', ['gpuboard', 'psu']);
    if (!isNum(p8) || !isNum(p16)) return res('gpupower', 'GPU補助電源', CHECK, '電源のPCIe / 12V-2x6 ケーブル本数が未登録です（機種未指定の電源は購入時に確認してください）。', ['gpuboard', 'psu']);
    if (n16 > 0) {
      if (p16 >= n16) return res('gpupower', 'GPU補助電源', OK, '16ピン（12V-2x6）×' + n16 + ' を電源のネイティブケーブルで接続できます。', ['gpuboard', 'psu']);
      if (p8 >= 2) return res('gpupower', 'GPU補助電源', CHECK, '電源に16ピンケーブルが無いため、8ピン→16ピン変換アダプタが必要です。グラボに同梱されているか確認してください。', ['gpuboard', 'psu']);
      return res('gpupower', 'GPU補助電源', NG, 'グラボは16ピン（12V-2x6）が必要ですが、電源にケーブルがありません。', ['gpuboard', 'psu']);
    }
    if (n8 > 0) {
      if (p8 >= n8) {
        var note = psu.specs.pcieShared ? '電源の8ピンの一部は12V-2x6からの変換ケーブルです。' : '';
        return res('gpupower', 'GPU補助電源', psu.specs.pcieShared && n8 > p8 - 2 ? CHECK : OK, '8ピン×' + n8 + ' / 電源のPCIe 8ピン ' + p8 + '本。', ['gpuboard', 'psu'], { note: note });
      }
      return res('gpupower', 'GPU補助電源', NG, 'グラボは8ピン×' + n8 + ' が必要ですが、電源は ' + p8 + '本です。', ['gpuboard', 'psu']);
    }
    return res('gpupower', 'GPU補助電源', OK, '補助電源コネクタは不要です。', ['gpuboard', 'psu']);
  });

  // 16. M.2 スロット
  def(function (b, db) {
    var mb = first(b, db, 'motherboard');
    var st = withParts(b, db, 'storage');
    if (!mb || !st.length) return null;
    var n = 0, unknownLen = false;
    st.forEach(function (x) { if (x.part.specs.formFactor === 'M.2') { n += x.qty; if (!x.part.specs.m2Length) unknownLen = true; } });
    if (!n) return null;
    var slots = mb.specs.m2Slots;
    if (!isNum(slots)) return res('m2', 'M.2スロット', CHECK, 'M.2 SSD ' + n + '枚。マザーボードのM.2スロット数が未登録です。', ['storage', 'motherboard']);
    if (n > slots) return res('m2', 'M.2スロット', NG, 'M.2 SSD ' + n + '枚に対してスロットは ' + slots + '本です。', ['storage', 'motherboard']);
    if (unknownLen) return res('m2', 'M.2スロット', CHECK, '本数は収まります（' + n + '/' + slots + '）が、SSDの長さ規格（2280など）が公式表記で確認できていません。', ['storage', 'motherboard'], { note: mb.specs.notes || '' });
    return res('m2', 'M.2スロット', OK, 'M.2 SSD ' + n + '枚 / スロット ' + slots + '本。', ['storage', 'motherboard'], { note: mb.specs.notes || '' });
  });

  // 17. SATA ポート
  def(function (b, db) {
    var mb = first(b, db, 'motherboard');
    var st = withParts(b, db, 'storage');
    if (!mb || !st.length) return null;
    var n = 0;
    st.forEach(function (x) { if (x.part.specs.interface === 'SATA') n += x.qty; });
    if (!n) return null;
    var ports = mb.specs.sataPorts;
    if (!isNum(ports)) return res('sata', 'SATAポート', CHECK, 'SATA機器 ' + n + '台。マザーボードのSATAポート数が未登録です。', ['storage', 'motherboard']);
    if (n > ports) return res('sata', 'SATAポート', NG, 'SATA機器 ' + n + '台に対してポートは ' + ports + '個です。', ['storage', 'motherboard']);
    return res('sata', 'SATAポート', OK, 'SATA機器 ' + n + '台 / ポート ' + ports + '個（M.2と排他になるポートがないかマニュアルで確認してください）。', ['storage', 'motherboard']);
  });

  // 18. ドライブベイ
  def(function (b, db) {
    var cs = first(b, db, 'case');
    var st = withParts(b, db, 'storage');
    if (!cs || !st.length) return null;
    var h = 0, s = 0;
    st.forEach(function (x) { if (x.part.specs.formFactor === '3.5') h += x.qty; if (x.part.specs.formFactor === '2.5') s += x.qty; });
    if (!h && !s) return null;
    var b35 = cs.specs.bay35, b25 = cs.specs.bay25;
    if ((h && !isNum(b35)) || (s && !isNum(b25))) return res('bays', 'ドライブベイ', CHECK, 'ケースのドライブベイ数が未登録です。', ['storage', 'case']);
    if (h > b35) return res('bays', 'ドライブベイ', NG, '3.5インチHDD ' + h + '台に対してベイは ' + b35 + '個です。', ['storage', 'case']);
    if (s > b25) return res('bays', 'ドライブベイ', NG, '2.5インチSSD ' + s + '台に対して取り付け場所は ' + b25 + '個です。', ['storage', 'case']);
    if (cs.specs.bayNote) return res('bays', 'ドライブベイ', CHECK, '台数は上限内ですが、' + cs.specs.bayNote + 'のため組み合わせを確認してください。', ['storage', 'case']);
    return res('bays', 'ドライブベイ', OK, '3.5インチ ' + h + '/' + b35 + '、2.5インチ ' + s + '/' + b25 + '。', ['storage', 'case']);
  });

  // 19. ケースファンの取り付け数
  def(function (b, db) {
    var cs = first(b, db, 'case');
    var fans = withParts(b, db, 'fan');
    if (!cs || !fans.length) return null;
    var by = {};
    fans.forEach(function (x) { var k = x.part.specs.sizeMm; by[k] = (by[k] || 0) + x.qty; });
    var worst = OK, msgs = [];
    Object.keys(by).forEach(function (size) {
      var mounts = cs.specs['fan' + size];
      var n = by[size];
      if (!isNum(mounts)) { worst = maxStatus(worst, CHECK); msgs.push(size + 'mmファンの取り付け数が未登録'); return; }
      var included = isNum(cs.specs.includedFanCount) ? cs.specs.includedFanCount : null;
      if (n > mounts) { worst = maxStatus(worst, NG); msgs.push(size + 'mm ' + n + '個は取り付け可能数 ' + mounts + '個を超えます'); return; }
      if (included == null || n + included > mounts) { worst = maxStatus(worst, CHECK); msgs.push(size + 'mm ' + n + '個（上限 ' + mounts + '個。付属ファンやラジエーターと場所を共用）'); return; }
      msgs.push(size + 'mm ' + n + '個 / 上限 ' + mounts + '個');
    });
    var mb = first(b, db, 'motherboard'), total = 0;
    fans.forEach(function (x) { total += x.qty; });
    var note = '';
    if (mb && isNum(mb.specs.fanHeaders) && total > mb.specs.fanHeaders - 1) note = 'マザーボードのファン端子（' + mb.specs.fanHeaders + '個）より多いため、ファンハブや分岐ケーブルが必要です。';
    return res('fans', 'ケースファン', worst, msgs.join('。') + '。', ['fan', 'case', 'motherboard'], { note: note });
  });

  // 20. 拡張カードのスロット
  def(function (b, db) {
    var mb = first(b, db, 'motherboard');
    var ex = withParts(b, db, 'expansion');
    if (!mb || !ex.length) return null;
    var n = 0;
    ex.forEach(function (x) { if (x.part.specs.slot === 'pcie-x1') n += x.qty; });
    if (!n) return null;
    var x1 = mb.specs.pcieX1Slots, x16 = mb.specs.pcieX16Slots;
    if (!isNum(x1) || !isNum(x16)) return res('expslot', '拡張スロット', CHECK, 'マザーボードの拡張スロット数が未登録です。', ['expansion', 'motherboard']);
    var free = x1 + Math.max(0, x16 - (first(b, db, 'gpu') ? 1 : 0));
    if (n > free) return res('expslot', '拡張スロット', NG, '拡張カード ' + n + '枚に対して空きスロットは ' + free + '本です。', ['expansion', 'motherboard']);
    return res('expslot', '拡張スロット', CHECK, '空きスロット ' + free + '本。厚いグラボで下のスロットが塞がらないか確認してください。', ['expansion', 'motherboard', 'gpuboard']);
  });

  function maxStatus(a, b) { return RANK[b] > RANK[a] ? b : a; }

  /* ---------------------------------------------------------------
   *  全体判定
   * --------------------------------------------------------------- */
  function missingRequired(build, db, categories) {
    return categories.filter(function (c) { return c.required && !entries(build, c.id).length; }).map(function (c) { return c.id; });
  }

  function checkBuild(build, db, categories) {
    var results = [];
    CHECKS.forEach(function (fn) {
      var r = null;
      try { r = fn(build, db); } catch (e) { r = res('error', '判定エラー', CHECK, '判定中に問題が起きました: ' + e.message, []); }
      if (r) results.push(r);
    });
    // 存在しないID（古い共有URLなど）
    var unknown = [];
    Object.keys((build && build.items) || {}).forEach(function (cat) {
      entries(build, cat).forEach(function (e) { if (!db.byId[e.id]) unknown.push(e.id); });
    });
    var summary = { ok: 0, ng: 0, check: 0 };
    results.forEach(function (r) { summary[r.status] += 1; });
    var overall = summary.ng ? NG : (summary.check ? CHECK : OK);
    return {
      results: results.sort(function (a, b) { return RANK[b.status] - RANK[a.status]; }),
      summary: summary,
      overall: overall,
      missing: categories ? missingRequired(build, db, categories) : [],
      unknownIds: unknown,
      power: estimatePower(build, db),
    };
  }

  /**
   * そのパーツを入れたときに「関係するチェック」の最悪結果を返す。
   * 一覧の「対応製品だけ表示」に使う。
   */
  function statusIfAdded(build, db, category, partId) {
    var trial = { items: {} };
    Object.keys((build && build.items) || {}).forEach(function (k) { trial.items[k] = (build.items[k] || []).slice(); });
    trial.items[category] = [{ id: partId, qty: 1 }];
    if (category === 'gpu') {
      var board = (trial.items.gpuboard || [])[0];
      if (board && db.byId[board.id] && db.byId[board.id].chip !== partId) trial.items.gpuboard = [];
    }
    if (category === 'gpuboard' && db.byId[partId]) trial.items.gpu = [{ id: db.byId[partId].chip, qty: 1 }];
    var worst = OK, reasons = [];
    CHECKS.forEach(function (fn) {
      var r = null;
      try { r = fn(trial, db); } catch (e) { r = null; }
      if (r && r.involves.indexOf(category) >= 0 && (r.status !== OK)) {
        worst = maxStatus(worst, r.status);
        reasons.push(r);
      }
    });
    return { status: worst, reasons: reasons };
  }

  return {
    OK: OK, NG: NG, CHECK: CHECK,
    POWER: POWER,
    checkBuild: checkBuild,
    statusIfAdded: statusIfAdded,
    estimatePower: estimatePower,
    cpuPowerW: cpuPowerW,
    _checks: CHECKS,
  };
});
