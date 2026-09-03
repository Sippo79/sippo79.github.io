/* =====================================================================
 *  シッポPC 共通 GPUリンク解決 (shared/gpu/gpu-links.js)
 *  ---------------------------------------------------------------------
 *  「GPUの表示名」から「GPU GUIDE の個別ページURL」を1か所で解決する。
 *
 *  【解決したい問題】
 *   Phase 2 で GPU 個別ページを静的化した（/gpu-guide/gpu/<id>/）が、
 *   PC BUILD CHECK などからは旧来の
 *       /gpu-guide/?gpu=<GPU名>
 *   という形式でリンクしていた。GPU GUIDE トップはこのクエリを解釈しないため、
 *   ユーザーはGPU一覧に着地して目的のGPUを自分で探し直す羽目になっていた。
 *
 *  【設計方針】
 *   1. **マスターは gpus.json ただ1つ**。
 *      GPU名→idの対応表を各ページに手書きしない（増えるとすぐ腐る）。
 *   2. 正規化は「表記ゆれの吸収」に留め、**曖昧一致はしない**。
 *      サイト内の実表記を調べたところ、
 *        - pc-build-check/builds.json … "GeForce RTX 5070 Ti" 形式（15種）
 *        - game-pc-guide/data/games.json … "RTX 5070 Ti" 形式（7種）
 *        - shared/affiliate, upgrade-engine … "rtx5070ti" 形式
 *      の3系統しかない。いずれも
 *        小文字化 → GeForce/Radeon/AMD の接頭辞を除去 → 英数字以外を除去
 *      で同じキーに落ちる。これ以上の推測一致（部分一致など）は
 *      別GPUに誤ヒットする危険があるので入れない。
 *   3. **解決できなければ null を返す**。
 *      呼び出し側は「リンクを張らない」か「GPU GUIDEトップへ」を選ぶ。
 *      間違ったGPUページへ飛ばすくらいならリンクしない方が良い。
 *
 *  【使い方】
 *   ブラウザ:
 *     <script src="/shared/gpu/gpu-links.js"></script>
 *     SippoGpuLinks.setCatalog(gpusJsonArray);      // gpus.json を渡す
 *     SippoGpuLinks.detailUrl('GeForce RTX 5070 Ti'); // → '/gpu-guide/gpu/rtx-5070-ti/'
 *
 *   Node（生成スクリプト・テスト）:
 *     const L = require('../shared/gpu/gpu-links.js');
 *     L.setCatalog(require('../gpu-guide/gpus.json'));
 *     L.detailUrl('RTX 5070 Ti');
 *
 *  ★URL仕様（/gpu-guide/gpu/<id>/）を変えるときはこのファイルだけを直す。
 * ===================================================================== */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SippoGpuLinks = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* GPU個別ページURLの組み立て。ここが唯一のURL仕様。 */
  var DETAIL_BASE = '/gpu-guide/gpu/';
  var GUIDE_TOP = '/gpu-guide/';

  var catalog = [];      // gpus.json の中身
  var keyToId = null;    // 正規化キー → id（遅延構築）

  /**
   * GPU名・idを比較用のキーへ正規化する。
   *   "GeForce RTX 5070 Ti" → "rtx5070ti"
   *   "RTX 5070 Ti"         → "rtx5070ti"
   *   "rtx-5070-ti"         → "rtx5070ti"
   * 表記ゆれの吸収だけを行い、部分一致・推測は一切しない。
   */
  function normalizeKey(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/^geforce\s+/, '')
      .replace(/^amd\s+radeon\s+/, '')
      .replace(/^radeon\s+/, '')
      .replace(/^amd\s+/, '')
      .replace(/[^a-z0-9]/g, '');
  }

  /** gpus.json を読み込ませる（配列） */
  function setCatalog(list) {
    catalog = Array.isArray(list) ? list : [];
    keyToId = null;
    return catalog.length;
  }

  function buildIndex() {
    if (keyToId) return keyToId;
    keyToId = {};
    for (var i = 0; i < catalog.length; i++) {
      var g = catalog[i];
      if (!g || !g.id) continue;
      // id と name の両方から引けるようにする（どちらも同じキーに落ちる）
      keyToId[normalizeKey(g.id)] = g.id;
      if (g.name) keyToId[normalizeKey(g.name)] = g.id;
    }
    return keyToId;
  }

  function isReady() {
    return catalog.length > 0;
  }

  /**
   * GPU名（または id）から gpus.json の id を引く。
   * @returns {string|null} 見つからなければ null（推測しない）
   */
  function resolveId(nameOrId) {
    if (!nameOrId || !isReady()) return null;
    var key = normalizeKey(nameOrId);
    if (!key) return null;
    return buildIndex()[key] || null;
  }

  /** id から個別ページURLを作る（実在確認はしない） */
  function urlForId(id) {
    return id ? DETAIL_BASE + id + '/' : null;
  }

  /**
   * GPU名（または id）から個別ページURLを返す。
   * @returns {string|null} 解決できなければ null
   */
  function detailUrl(nameOrId) {
    return urlForId(resolveId(nameOrId));
  }

  /**
   * 解決できたら個別ページURL、できなければ GPU GUIDE トップを返す。
   * 「必ずどこかへ飛ばしたい」導線用。
   */
  function detailUrlOrTop(nameOrId) {
    return detailUrl(nameOrId) || GUIDE_TOP;
  }

  return {
    normalizeKey: normalizeKey,
    setCatalog: setCatalog,
    isReady: isReady,
    resolveId: resolveId,
    urlForId: urlForId,
    detailUrl: detailUrl,
    detailUrlOrTop: detailUrlOrTop,
    DETAIL_BASE: DETAIL_BASE,
    GUIDE_TOP: GUIDE_TOP,
  };
});
