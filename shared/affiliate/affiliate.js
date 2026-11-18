/* =====================================================================
 *  シッポPC 共通アフィリエイト基盤 (affiliate.js)
 *  ---------------------------------------------------------------------
 *  全サイト（gpu-guide / game-pc-guide / pc-build-check / pc-builds-hub /
 *  pc-consult）から共通で使う「商品ID → 購入ボタン」の仕組み。
 *
 *  【使い方（最短）】
 *    <script src="/shared/affiliate/affiliate-config.js"></script>
 *    <script src="/shared/affiliate/affiliate.js"></script>
 *    <script>
 *      SippoAffiliate.init().then(function () {
 *        document.getElementById('box').innerHTML =
 *          SippoAffiliate.renderAffiliateButtons('rtx5070', {
 *            page: 'gpu-guide', placement: 'product-card'
 *          });
 *      });
 *    </script>
 *
 *  【設計方針】
 *   - 実行時に外部APIを叩かない（＝APIキー不要・障害の影響を受けない）。
 *     Amazon PA-API は「直近30日で3件の売上」が利用条件で、まだ使えない。
 *     楽天の商品検索APIは2026年新仕様で秘密鍵 accessKey が必須になり、
 *     静的サイト（GitHub Pages）のフロントからは安全に呼べない。
 *     → 「アフィリエイトID付きURLをその場で組み立てる」方式を採用。
 *   - 価格は一切ハードコードしない（古い価格が残る事故を防ぐ）。
 *   - 商品が特定できないときはリンクを出さない（誤リンク防止を最優先）。
 *   - master の取得に失敗してもページは壊れない（空文字を返すだけ）。
 * ===================================================================== */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------
   *  内部状態
   * ------------------------------------------------------------------ */
  var master = null;        // 読み込んだ商品マスター
  var products = {};        // master.products のショートカット
  var loadPromise = null;   // init() の多重実行を防ぐ
  var searchIndex = null;   // 表記ゆれ吸収用の検索インデックス（遅延構築）

  function config() {
    return global.SIPPO_AFFILIATE_CONFIG || {
      amazon: { associateTag: '', host: 'https://www.amazon.co.jp' },
      rakuten: { affiliateId: '', searchBase: 'https://search.rakuten.co.jp/search/mall/' },
      yahoo: { enabled: true },
      behavior: { allowSearchFallback: true, rel: 'nofollow sponsored noopener noreferrer', tracking: true },
    };
  }

  /* ------------------------------------------------------------------
   *  ユーティリティ
   * ------------------------------------------------------------------ */

  /** HTML特殊文字をエスケープしてXSSを防ぐ */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * 商品名の表記ゆれを吸収する正規化。
   *   "NVIDIA GeForce RTX 5070"  → "rtx5070"
   *   "RTX 5070"                 → "rtx5070"
   *   "ＲＴＸ　５０７０"          → "rtx5070"
   * ベンダー名・記号・空白をすべて落として比較用のキーにする。
   */
  function normalize(value) {
    return String(value == null ? '' : value)
      // 全角英数字を半角へ
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
      })
      .toLowerCase()
      // ベンダー名・接頭辞を除去（RTX 5070 と GeForce RTX 5070 を同一視する）
      .replace(/\b(nvidia|geforce|amd|radeon|intel)\b/g, '')
      // 販売店が付ける修飾語を除去（ASUS TUF RTX 5070 OC → rtx5070）
      .replace(/\b(asus|msi|gigabyte|zotac|palit|colorful|sapphire|powercolor|xfx|inno3d|galax|elsa|玄人志向)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  /** URLがプレースホルダー（未設定の目印）でないか判定する */
  function isRealUrl(url) {
    if (!url) return false;
    var u = String(url);
    if (u === '#') return false;
    if (u.indexOf('xxxxx') !== -1) return false;
    if (u.indexOf('example.com') !== -1) return false;
    return /^https?:\/\//.test(u);
  }

  /* ------------------------------------------------------------------
   *  商品ステータス
   *  ------------------------------------------------------------------
   *  リンク切れ・販売終了に備えて「直リンク → 検索リンク → 非表示」の
   *  3段階で解決する。判定はこの1か所に集約する（各ショップの
   *  build*Url() はここで決まった方針に従うだけ）。
   *
   *    active        直リンクを優先。無ければ検索へフォールバック。
   *    search-only   直リンクを使わず検索リンクのみ。
   *    sold-out      売り切れ。直リンクを捨てて検索へフォールバック。
   *    discontinued  販売終了。直リンクを捨てて検索へフォールバック。
   *    disabled      購入ボタンを一切出さない。
   *
   *  【互換性】旧ステータス preparing / paused は従来どおり「非表示」。
   *  status 未設定は従来どおり search-only 扱い（既存商品の挙動を変えない）。
   * ------------------------------------------------------------------ */

  /* 購入ボタンを一切出さないステータス */
  var HIDDEN_STATUSES = {
    disabled: true,
    preparing: true,   // 旧仕様との互換（まだ表示させない）
    paused: true,      // 旧仕様との互換（一時的に非表示）
  };

  /* 直リンクを信用せず、検索リンクへ逃がすステータス */
  var FALLBACK_STATUSES = {
    'search-only': true,
    'sold-out': true,
    discontinued: true,
  };

  /** 商品（またはショップ単位）のステータスを正規化して返す */
  function normalizeStatus(value) {
    if (!value) return '';
    return String(value).trim().toLowerCase();
  }

  /**
   * ショップ単位で有効なステータスを求める。
   * 商品全体の status を既定値とし、ショップ側に status があれば上書きする。
   * （例: Amazonだけ売り切れ、楽天は在庫あり —— を表現できる）
   */
  function resolveStatus(product, shopKey) {
    var shop = (product && product[shopKey]) || {};
    var shopStatus = normalizeStatus(shop.status);
    if (shopStatus) return shopStatus;
    return normalizeStatus(product && product.status) || 'search-only';
  }

  /** そのステータスは購入ボタンを出してよいか */
  function isHiddenStatus(status) {
    return HIDDEN_STATUSES[status] === true;
  }

  /** そのステータスは直リンクを使ってよいか（false なら検索へ逃がす） */
  function canUseDirectUrl(status) {
    return FALLBACK_STATUSES[status] !== true;
  }

  /* ------------------------------------------------------------------
   *  リンク種別（linkType）
   *  ------------------------------------------------------------------
   *  商品マスターの直リンクは、短縮URL（amzn.to / a.r10.to / yahoo.jp）の
   *  ままだと「商品ページ行き」なのか「検索結果行き」なのか分からない。
   *  実際に遷移先を確認した結果を各ショップの linkType に持たせる。
   *
   *    "exact"   商品詳細ページへ飛ぶ  → ボタン文言「〇〇で商品を見る」（item があれば商品カード）
   *    "search"  検索結果ページへ飛ぶ  → ボタン文言「〇〇で探す」
   *
   *  未設定（判別できていない）ものは **search 扱い**にする。
   *  「商品を見る」と言って検索結果を開く方がユーザーを裏切るため、
   *  迷ったら控えめな "探す" に倒すのが安全側。
   * ------------------------------------------------------------------ */

  /**
   * そのショップのリンクが「商品詳細ページ直リンク」と言い切れるかを返す。
   * ここが Amazon / 楽天 / Yahoo で共通の判定口。ボタン文言はこれだけで決まる。
   *
   * true になるのは次を全部満たすときだけ:
   *   1. 売り切れ等でフォールバックしていない（＝直リンクを使っている）
   *   2. 実際に使う直リンクが存在する（マスターのURL、またはAmazonのASIN）
   *   3. その直リンクの遷移先が商品ページ（linkType === 'exact'）
   *      ※ASIN から組み立てたURLは定義上かならず商品ページなので exact
   */
  function isExactLink(product, shopKey) {
    if (!product) return false;

    // 1. フォールバック中（sold-out 等）は実態が「検索」なので必ず false
    if (!canUseDirectUrl(resolveStatus(product, shopKey))) return false;

    var shop = product[shopKey] || {};

    // 2-a. ASIN から組み立てた /dp/{ASIN} は必ず商品ページ
    if (shopKey === 'amazon' && !isRealUrl(shop.url) && shop.asin) return true;

    // 2-b. マスターに直リンクが無ければ検索フォールバック＝false
    if (!isRealUrl(shop.url)) return false;

    // 3. 実測した遷移先の種別。未設定は安全側で search 扱い（false）。
    return normalizeStatus(shop.linkType) === 'exact';
  }

  /* ------------------------------------------------------------------
   *  リンク生成 — Amazon
   * ------------------------------------------------------------------ */

  /**
   * Amazonの購入URLを組み立てる。優先順位は次のとおり。
   *   1. 商品マスターの個別URL（既存の amzn.to 短縮リンク等）をそのまま使う
   *   2. ASINがあれば公式形式 /dp/{ASIN}/ref=nosim?tag={ID} を組み立てる
   *   3. キーワード検索URL（誤った商品にリンクするより安全）
   * 生成できないときは空文字を返す（＝ボタンを出さない）。
   */
  function buildAmazonUrl(product) {
    if (!product) return '';
    var cfg = config();
    var amazon = product.amazon || {};
    var status = resolveStatus(product, 'amazon');

    // 0. 非表示ステータス（disabled 等）ならボタンごと出さない
    if (isHiddenStatus(status)) return '';

    // 1. 登録済みの個別URL（短縮URLにはタグが埋まっているのでそのまま使う）
    //    売り切れ・販売終了ステータスのときは直リンクを信用せず、下の検索へ逃がす
    if (canUseDirectUrl(status) && isRealUrl(amazon.url)) return amazon.url;

    var tag = cfg.amazon.associateTag || '';
    var host = cfg.amazon.host || 'https://www.amazon.co.jp';

    // 2. ASIN があれば商品ページへ直リンク（Amazon公式のテキストリンク形式）
    //    ASIN も「直リンク」なので、フォールバック対象ステータスでは使わない
    if (canUseDirectUrl(status) && amazon.asin) {
      var dp = host + '/dp/' + encodeURIComponent(amazon.asin) + '/ref=nosim';
      return tag ? dp + '?tag=' + encodeURIComponent(tag) : dp;
    }

    // 3. キーワード検索（直リンクが使えないときの安全な導線）
    //    商品側で enabled:false または keyword:"" が明示されていれば出さない
    //    （Amazonでは扱っていない商品を「検索」で誤誘導しないため）
    if (amazon.enabled === false) return '';
    if (!cfg.behavior.allowSearchFallback) return '';
    var keyword = amazon.keyword === '' ? '' : (amazon.keyword || product.name);
    if (!keyword) return '';
    var search = host + '/s?k=' + encodeURIComponent(keyword);
    return tag ? search + '&tag=' + encodeURIComponent(tag) : search;
  }

  /* ------------------------------------------------------------------
   *  リンク生成 — 楽天市場
   * ------------------------------------------------------------------ */

  /**
   * 楽天の購入URLを組み立てる。
   *   1. 商品マスターの個別URL（既存の a.r10.to 短縮リンク等）
   *   2. 楽天市場の検索URL
   * 楽天アフィリエイトIDがある場合は hb.afl.rakuten.co.jp 経由の
   * アフィリエイトURLでラップする（公式のリンク形式）。
   */
  function buildRakutenUrl(product) {
    if (!product) return '';
    var cfg = config();
    var rakuten = product.rakuten || {};
    var status = resolveStatus(product, 'rakuten');

    // 0. 非表示ステータス（disabled 等）ならボタンごと出さない
    if (isHiddenStatus(status)) return '';

    // 1. 登録済みの個別URL（短縮URLにはIDが埋まっているのでそのまま使う）
    //    売り切れ・販売終了ステータスのときは下の検索へ逃がす
    if (canUseDirectUrl(status) && isRealUrl(rakuten.url)) return rakuten.url;

    // 1-b. 楽天で発行した画像リンクしか無い製品（linkType:"image-only"）はボタンを出さない。
    //      写真（発行HTML）だけで案内し、検索リンクも作らない（renderAffiliateButtons 参照）
    if (canUseDirectUrl(status) && normalizeStatus(rakuten.linkType) === 'image-only') return '';

    // 2. 検索URL
    //    商品側で enabled:false または keyword:"" が明示されていれば出さない
    if (rakuten.enabled === false) return '';
    if (!cfg.behavior.allowSearchFallback) return '';
    var keyword = rakuten.keyword === '' ? '' : (rakuten.keyword || product.name);
    if (!keyword) return '';
    var base = cfg.rakuten.searchBase || 'https://search.rakuten.co.jp/search/mall/';

    // 直リンク用（アフィリエイトIDなし）はキーワードをエンコードしてそのまま使う
    var searchUrl = base + encodeURIComponent(keyword) + '/';

    var affiliateId = cfg.rakuten.affiliateId || '';
    if (!affiliateId) return searchUrl;

    // 楽天アフィリエイトのリンク形式（IDが設定されているときのみ）
    // ★pc= / m= に渡す値は「生の検索URL」を 1回だけ encodeURIComponent する。
    //   すでにエンコード済みの searchUrl を渡すと二重エンコードになり
    //   （半角スペースが %20 → %2520）、楽天側で検索語が壊れて 0件になる。
    var rawSearchUrl = base + keyword + '/';
    return 'https://hb.afl.rakuten.co.jp/hgc/' + encodeURIComponent(affiliateId) +
      '/?pc=' + encodeURIComponent(rawSearchUrl) +
      '&m=' + encodeURIComponent(rawSearchUrl);
  }

  /* ------------------------------------------------------------------
   *  リンク生成 — Yahoo!ショッピング
   *  （個別の短縮アフィリエイトURLが登録されている場合のみ）
   * ------------------------------------------------------------------ */
  function buildYahooUrl(product) {
    if (!product) return '';
    if (!config().yahoo.enabled) return '';
    var yahoo = product.yahoo || {};
    var status = resolveStatus(product, 'yahoo');

    // Yahoo!は「登録済みの短縮アフィリエイトURL」のみを扱う。
    // IDによる検索URL自動生成はしないため、直リンクが使えなければ非表示。
    if (isHiddenStatus(status)) return '';
    if (!canUseDirectUrl(status)) return '';
    return isRealUrl(yahoo.url) ? yahoo.url : '';
  }

  /* ------------------------------------------------------------------
   *  商品マスターの読み込み
   * ------------------------------------------------------------------ */

  /**
   * affiliate-master.json のパスを推測する。
   * サイトごとにディレクトリ階層が違うため、明示指定がなければ
   * 絶対パス（/shared/affiliate/…）を使う。ローカルの file:// では
   * 絶対パスが効かないので、その場合だけ相対パスを試す。
   */
  function defaultMasterPaths() {
    var paths = ['/shared/affiliate/affiliate-master.json'];
    if (global.location && global.location.protocol === 'file:') {
      // ローカル確認用。階層をさかのぼって探す。
      paths = [
        'shared/affiliate/affiliate-master.json',
        '../shared/affiliate/affiliate-master.json',
        '../../shared/affiliate/affiliate-master.json',
      ];
    }
    return paths;
  }

  /**
   * 商品マスターを読み込む。全サイトの入口。
   * 失敗しても reject しない（＝呼び出し側でページが壊れない）。
   * @param {Object} [options] - { masterPath: string }
   * @returns {Promise<boolean>} 読み込めたかどうか
   */
  function init(options) {
    if (loadPromise) return loadPromise;

    var paths = (options && options.masterPath)
      ? [options.masterPath]
      : defaultMasterPaths();

    loadPromise = (function tryPath(index) {
      if (index >= paths.length) {
        console.warn('[SippoAffiliate] 商品マスターを読み込めませんでした。購入ボタンは非表示になります。');
        return Promise.resolve(false);
      }
      return fetch(paths[index])
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (json) {
          master = json;
          products = (json && json.products) || {};
          searchIndex = null; // データが変わったのでインデックスを作り直す
          return true;
        })
        .catch(function () {
          return tryPath(index + 1);
        });
    })(0);

    return loadPromise;
  }

  /** 商品マスターが読み込まれているか */
  function isReady() {
    return Boolean(master && products && Object.keys(products).length > 0);
  }

  /* ------------------------------------------------------------------
   *  商品の検索（表記ゆれ対応）
   * ------------------------------------------------------------------ */

  /** 正規化キー → 商品ID の索引を作る（初回だけ実行） */
  function buildSearchIndex() {
    if (searchIndex) return searchIndex;
    searchIndex = {};
    Object.keys(products).forEach(function (id) {
      var p = products[id];
      var keys = [id, p.name, p.shortName].concat(p.aliases || []);
      keys.forEach(function (k) {
        var n = normalize(k);
        // 先に登録されたもの（＝より正式な名前）を優先する
        if (n && !searchIndex[n]) searchIndex[n] = id;
      });
    });
    return searchIndex;
  }

  /** 商品IDから商品を取得する */
  function getProduct(productId) {
    if (!productId || !isReady()) return null;
    return products[productId] || null;
  }

  /**
   * 商品名から商品IDを引く（表記ゆれ対応）。
   *   "RTX 5070" / "GeForce RTX 5070" / "NVIDIA GeForce RTX 5070" → "rtx5070"
   *
   * ⚠️ 誤リンク防止のため、確実に一致したときだけIDを返す。
   *    あいまいなときは null を返し、呼び出し側はボタンを出さない。
   *
   * @param {string} name - 商品名（ユーザー投稿の表記ゆれを含んでよい）
   * @returns {string|null} 商品ID
   */
  function findProductIdByName(name) {
    if (!name || !isReady()) return null;
    var index = buildSearchIndex();
    var n = normalize(name);
    if (!n) return null;

    // 1. 完全一致（最も信頼できる）
    if (index[n]) return index[n];

    // 2. 前方一致 — 販売店の修飾語が後ろに付くケース
    //    例: "rtx5070ti搭載モデル" → "rtx5070ti"
    //    ⚠️ 長いキーから試す。そうしないと "rtx5070ti" が "rtx5070" に誤マッチする。
    var keys = Object.keys(index).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      // 短すぎるキーでの部分一致は誤爆しやすいので使わない
      if (key.length < 5) continue;
      if (n.indexOf(key) !== -1) {
        // 一致した部分の直後に数字が続く場合は別商品の可能性が高い
        // 例: n="rtx50701" に key="rtx5070" が一致 → 誤り
        var after = n.charAt(n.indexOf(key) + key.length);
        if (after && /[0-9]/.test(after)) continue;
        return index[key];
      }
    }

    return null;
  }

  /**
   * 商品名から商品そのものを引く（見つからなければ null）
   */
  function findProductByName(name) {
    var id = findProductIdByName(name);
    return id ? products[id] : null;
  }

  /* ------------------------------------------------------------------
   *  リンク一覧の取得
   * ------------------------------------------------------------------ */

  /**
   * 商品IDから、表示できるショップリンクの配列を返す。
   * 表示できるものが無ければ空配列（＝ボタンを出さない）。
   *
   * @param {string} productId
   * @returns {Array<{shop, shopName, url, isExact}>}
   */
  function getAffiliateLinks(productId) {
    var product = getProduct(productId);
    if (!product) return [];

    // 商品全体が非表示ステータス（disabled / preparing / paused）なら何も出さない。
    // ※ sold-out / discontinued はここでは切らない。各 build*Url() が
    //    直リンクを捨てて検索リンクへフォールバックする。
    if (isHiddenStatus(normalizeStatus(product.status))) return [];

    var links = [];

    // isExact = 商品詳細ページへ飛ぶか（false は検索結果ページ）。
    // 判定は全ショップ共通の isExactLink() に集約してある。
    // フォールバック中・linkType 未設定は false（＝「探す」表記）になる。
    var amazonUrl = buildAmazonUrl(product);
    if (amazonUrl) {
      links.push({
        shop: 'amazon',
        shopName: 'Amazon',
        url: amazonUrl,
        isExact: isExactLink(product, 'amazon'),
      });
    }

    var rakutenUrl = buildRakutenUrl(product);
    if (rakutenUrl) {
      links.push({
        shop: 'rakuten',
        shopName: '楽天市場',
        url: rakutenUrl,
        isExact: isExactLink(product, 'rakuten'),
      });
    }

    var yahooUrl = buildYahooUrl(product);
    if (yahooUrl) {
      links.push({
        shop: 'yahoo',
        shopName: 'Yahoo!ショッピング',
        url: yahooUrl,
        isExact: isExactLink(product, 'yahoo'),
      });
    }

    return links;
  }

  /* ------------------------------------------------------------------
   *  クリック計測（GA4）
   * ------------------------------------------------------------------ */

  /**
   * アフィリエイトリンクのクリックをGA4へ送る。
   * gtag が無い（＝GA未設置）場合は黙って何もしない。
   * 計測は「おまけ」であり、絶対に遷移を妨げない。
   */
  function trackClick(detail) {
    try {
      if (!config().behavior.tracking) return;
      if (typeof global.gtag !== 'function') return;

      global.gtag('event', 'affiliate_click', {
        product_id: detail.productId || '',
        product_name: detail.productName || '',
        shop: detail.shop || '',
        page: detail.page || '',
        placement: detail.placement || '',
        link_url: detail.url || '',
        page_path: global.location ? global.location.pathname : '',
      });
    } catch (err) {
      /* 計測失敗は無視する（遷移を優先） */
    }
  }

  /**
   * ページ全体のアフィリエイトリンクにクリック計測を仕込む。
   * data-affiliate-track 属性を持つ <a> が対象。
   * イベント委譲なので、あとから追加された要素にも効く。
   */
  var delegationBound = false;
  function bindTracking() {
    if (delegationBound || typeof document === 'undefined') return;
    delegationBound = true;

    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest ? event.target : null;
      if (!target) return;
      var link = target.closest('a[data-affiliate-track]');
      // 楽天で発行した画像リンクは <a> に属性を足せない（ガイドラインで禁止）ので、
      // 外側の枠（data-affiliate-wrap）に計測属性を置き、その中の <a> のクリックを数える。
      var attrs = link;
      if (!link) {
        var a = target.closest('a[href]');
        var wrap = a && a.closest('[data-affiliate-wrap]');
        if (!wrap) return;
        link = a;
        attrs = wrap;
      }

      trackClick({
        productId: attrs.getAttribute('data-affiliate-product') || '',
        productName: attrs.getAttribute('data-affiliate-name') || '',
        shop: attrs.getAttribute('data-affiliate-shop') || '',
        page: attrs.getAttribute('data-affiliate-page') || '',
        placement: attrs.getAttribute('data-affiliate-placement') || '',
        url: link.href || '',
      });
    }, true); // capture: 他のハンドラが止めても計測できるように

    // 商品写真の読み込みに失敗したら写真枠ごと外す（空の枠を残さない）。
    // error はバブリングしないので capture で拾う。ボタンはそのまま使える。
    document.addEventListener('error', function (event) {
      var img = event.target;
      if (!img || img.tagName !== 'IMG' || !img.closest) return;
      var own = img.classList && img.classList.contains('sippo-aff-item-img');
      if (!own && !img.closest('.sippo-aff-item-media--issued')) return;
      var media = img.closest('.sippo-aff-item-media');
      var card = img.closest('.sippo-aff-item');
      if (media && media.parentNode) media.parentNode.removeChild(media);
      if (card) {
        card.classList.remove('sippo-aff-item--issued');
        card.classList.add('sippo-aff-item--noimg');
      }
    }, true);
  }

  /* ------------------------------------------------------------------
   *  共通UI — 購入ボタンの描画
   * ------------------------------------------------------------------ */

  /**
   * 商品IDを渡すだけで購入ボタンのHTMLを返す、共通UIの入口。
   *
   *   SippoAffiliate.renderAffiliateButtons('rtx5070', {
   *     page: 'gpu-guide',        // どのサイトか
   *     placement: 'product-card' // ページ内のどの位置か
   *   })
   *
   * 表示できるリンクが1つも無ければ空文字を返す。
   * → 呼び出し側はそのまま innerHTML に入れてよい（壊れたボタンは出ない）。
   *
   * @param {string} productId
   * @param {Object} [options]
   *   page       {string} 計測用のページ識別子
   *   placement  {string} 計測用の掲載位置（hero / spec-table / build-result 等）
   *   compact    {boolean} 小さめのボタンにする
   *   heading    {string} 見出しテキスト（空なら見出しなし）
   *   disclosure {boolean} 広告表記を付けるか（既定 true）
   * @returns {string} HTML
   */
  /* ------------------------------------------------------------------
   *  商品カード用のデータ
   *  ------------------------------------------------------------------
   *  直リンク（linkType:"exact"）の遷移先が「どのメーカーのどの製品か」は
   *  各ショップの item に記録する。item がある直リンクだけを商品カードにする。
   *  GPU名（例: RTX 5070）と、実際に売っている製品
   *  （例: MSI GeForce RTX 5070 12G VENTUS 2X）を取り違えさせないため。
   * ------------------------------------------------------------------ */

  /** 同じ製品かどうかの比較キー（メーカー＋製品名＋型番） */
  function itemKey(item) {
    return [item.maker, item.name, item.model].map(function (v) {
      return String(v || '').toLowerCase().replace(/[\s　]+/g, ' ').trim();
    }).join('|');
  }

  /**
   * 写真の情報が使える形か。利用条件（source / license）が書かれていない写真、
   * https でない写真は使わない（＝写真なしのカードになる）。
   */
  function usableImage(image) {
    if (!image || typeof image !== 'object') return null;
    if (!/^https:\/\//.test(String(image.src || ''))) return null;
    if (!image.source || !image.license) return null;
    return image;
  }

  /**
   * 楽天で発行した「画像のみ」の商品リンクHTML（item.imageLink）が使える形か。
   * 発行されたままの形（<a …><img …></a> の1組だけ・link_type=pict・指定サイズ・
   * 転送先が destination と一致）なら html をそのまま返す。少しでも違えば null
   * （＝写真なしのカード）。HTMLは変更しない（楽天ガイドラインで改変が禁止のため）。
   */
  var ISSUED_PICT = /^<a href="(https:\/\/hb\.afl\.rakuten\.co\.jp\/ichiba\/[^"<>\s]+)" target="_blank" rel="nofollow sponsored noopener" style="word-wrap:break-word;"><img src="(https:\/\/hbb\.afl\.rakuten\.co\.jp\/hgb\/[^"<>\s]+)" border="0" style="margin:2px" alt="[^"<>]*" title="[^"<>]*"><\/a>$/;
  function queryParam(url, name) {
    var m = String(url).replace(/&amp;/g, '&').match(new RegExp('[?&]' + name + '=([^&#]*)'));
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (e) { return ''; }
  }
  function issuedImageLink(item) {
    var link = item && item.imageLink;
    if (!link || typeof link !== 'object' || link.type !== 'rakuten-pict') return null;
    var html = String(link.html || '');
    var m = html.match(ISSUED_PICT);
    if (!m) return null;
    var size = String(link.size || '');
    if (!/^\d+x\d+$/.test(size)) return null;
    if (queryParam(m[1], 'link_type') !== 'pict') return null;
    if (queryParam(m[2], 't') !== 'pict' || queryParam(m[2], 's') !== size) return null;
    if (!link.destination || queryParam(m[1], 'pc') !== link.destination) return null;
    return { html: html, size: size, href: m[1].replace(/&amp;/g, '&') };
  }

  /**
   * 直リンクを「同じ製品」ごとにまとめたカードの配列を返す。
   * まとめるのは item の maker・name・model がすべて一致したリンクだけ。
   * @returns {Array<{item, links:Array}>}
   */
  function groupItemLinks(product, links) {
    var cards = [];
    var byKey = {};
    links.forEach(function (link) {
      if (!link.isExact) return;
      var item = (product[link.shop] || {}).item;
      if (!item || !item.name) return;
      var key = itemKey(item);
      if (!byKey[key]) {
        byKey[key] = { item: item, links: [] };
        cards.push(byKey[key]);
      }
      byKey[key].links.push(link);
    });
    return cards;
  }

  /**
   * 直リンクの行き先の種類。item.destinationType を優先し、無ければ遷移先URLから判定する。
   *   'compare' … 同じ製品の複数ショップを並べたページ（楽天の製品ページ product.rakuten.co.jp/product/）
   *   'item'    … 特定ショップの商品ページ
   */
  function destinationKind(item) {
    if (!item) return 'item';
    if (item.destinationType === 'compare' || item.destinationType === 'item') return item.destinationType;
    return /^https:\/\/product\.rakuten\.co\.jp\/product\//.test(String(item.destination || '')) ? 'compare' : 'item';
  }

  /**
   * 楽天の発行画像リンクだけで紹介する製品（rakuten.linkType:"image-only"）の item。
   * 販売店ボタン（短縮リンク）が無いので、写真のリンクが唯一の行き先になる。
   * 発行HTMLが使える形で、楽天の掲載が止まっていない（disabled・sold-out 等でない）ときだけ返す。
   */
  function imageOnlyItem(product) {
    var rakuten = (product && product.rakuten) || {};
    if (normalizeStatus(rakuten.linkType) !== 'image-only') return null;
    if (isHiddenStatus(normalizeStatus(product.status))) return null;
    var status = resolveStatus(product, 'rakuten');
    if (isHiddenStatus(status) || !canUseDirectUrl(status)) return null;
    return rakuten.item && rakuten.item.name && issuedImageLink(rakuten.item) ? rakuten.item : null;
  }

  /** 検索リンクの見出し語（GPUは「〇〇搭載製品」、それ以外は商品名そのもの） */
  function searchSubject(product) {
    var name = product.shortName || product.name || '';
    return product.category === 'gpu' ? name + '搭載製品' : name;
  }

  function renderAffiliateButtons(productId, options) {
    var opts = options || {};
    var product = getProduct(productId);
    if (!product) return '';

    var links = getAffiliateLinks(productId);
    // 画像リンクだけの製品は写真が唯一の行き先なので、写真を出さない一覧（compact）では出さない
    var imageOnly = opts.compact ? null : imageOnlyItem(product);
    if (links.length === 0 && !imageOnly) return '';

    var cfg = config();
    var page = opts.page || '';
    var placement = opts.placement || '';
    var showDisclosure = opts.disclosure !== false;
    var compact = Boolean(opts.compact);

    /* 計測属性は従来とまったく同じ（affiliate_click のパラメータを変えない） */
    function trackAttrs(link) {
      return ' href="' + esc(link.url) + '"'
        + ' target="_blank"'
        + ' rel="' + esc(cfg.behavior.rel) + '"'
        + ' data-affiliate-track="1"'
        + ' data-affiliate-product="' + esc(productId) + '"'
        + ' data-affiliate-name="' + esc(product.name) + '"'
        + ' data-affiliate-shop="' + esc(link.shop) + '"'
        + ' data-affiliate-page="' + esc(page) + '"'
        + ' data-affiliate-placement="' + esc(placement) + '"';
    }

    function button(link, label, note) {
      return '<a class="sippo-aff-btn sippo-aff-btn-' + esc(link.shop) + '"' + trackAttrs(link) + '>'
        + '<span class="sippo-aff-btn-label">' + esc(label) + '</span>'
        + (note ? '<small class="sippo-aff-btn-note">' + esc(note) + '</small>' : '')
        + '</a>';
    }

    /* 1. 商品カード（遷移先の製品が分かっている直リンク） */
    var cards = groupItemLinks(product, links);
    if (imageOnly) cards.push({ item: imageOnly, links: [] });
    var carded = {};
    var cardsHtml = cards.map(function (card) {
      var item = card.item;
      card.links.forEach(function (l) { carded[l.shop] = true; });
      var image = usableImage(item.image);
      var title = (item.maker ? item.maker + ' ' : '') + item.name;
      // 一覧（compact）では発行リンクの写真を出さない（行を大きくしない）
      var issued = compact ? null : issuedImageLink(item);

      // 写真。提供元がリンク先を指定している（href）場合は、そのURLが
      // このカードのボタンと同じときだけ写真をリンクにする。違うなら写真を出さない。
      var mediaHtml = '';
      if (issued) {
        // 発行HTMLは1文字も変えずに入れる。計測属性は外側の枠に置く（bindTracking 参照）。
        mediaHtml = '<div class="sippo-aff-item-media sippo-aff-item-media--issued" data-affiliate-wrap="1"'
          + ' data-affiliate-product="' + esc(productId) + '"'
          + ' data-affiliate-name="' + esc(product.name) + '"'
          + ' data-affiliate-shop="rakuten"'
          + ' data-affiliate-page="' + esc(page) + '"'
          + ' data-affiliate-placement="' + esc(placement) + '">'
          + issued.html
          + '</div>';
      } else if (image) {
        var imgTag = '<img class="sippo-aff-item-img" src="' + esc(image.src) + '"'
          + ' alt="' + esc(image.alt || title) + '"'
          + (image.width ? ' width="' + esc(image.width) + '"' : '')
          + (image.height ? ' height="' + esc(image.height) + '"' : '')
          + ' loading="lazy" decoding="async" referrerpolicy="no-referrer">';
        if (image.href) {
          var target = card.links.filter(function (l) { return l.url === image.href; })[0];
          mediaHtml = target
            ? '<a class="sippo-aff-item-media" tabindex="-1" aria-hidden="true"' + trackAttrs(target) + '>' + imgTag + '</a>'
            : '';
        } else {
          mediaHtml = '<div class="sippo-aff-item-media">' + imgTag + '</div>';
        }
      }

      // ボタンの文言は実際の行き先に合わせる:
      //   特定ショップの商品ページ →「〇〇で商品を見る」
      //   同じ製品の複数ショップを並べたページ（楽天の製品ページ）→「〇〇で価格を比較」
      var buttonsHtml = card.links.map(function (link) {
        var linkItem = (product[link.shop] || {}).item || item;
        if (destinationKind(linkItem) === 'compare') {
          return button(link, link.shopName + 'で価格を比較', compact ? '' : '同じ製品を扱う複数ショップの価格比較ページが開きます');
        }
        return button(link, link.shopName + 'で商品を見る', compact ? '' : link.shopName + 'の商品ページが開きます');
      }).join('');
      // 販売店ボタンが無い（画像リンクだけの）製品は、写真が押せることを案内する
      if (!card.links.length) {
        buttonsHtml = '<p class="sippo-aff-item-hint">商品画像を押すと、楽天市場のショップページが開きます</p>';
      }

      return '<div class="sippo-aff-item' + (issued ? ' sippo-aff-item--issued' : mediaHtml ? '' : ' sippo-aff-item--noimg') + '">'
        + mediaHtml
        + '<div class="sippo-aff-item-body">'
        + '<p class="sippo-aff-item-eyebrow">リンク先の商品'
        + (product.category === 'gpu' ? '（' + esc(product.shortName || product.name) + '搭載の一製品）' : '')
        + '</p>'
        + (item.maker ? '<p class="sippo-aff-item-maker">' + esc(item.maker) + '</p>' : '')
        + '<p class="sippo-aff-item-name">' + esc(item.name) + '</p>'
        + (item.model ? '<p class="sippo-aff-item-model">型番 <span>' + esc(item.model) + '</span></p>' : '')
        // ショップが表記する販売状態（例: 並行輸入品）。詳細カードだけに出す（一覧の行は増やさない）
        + (item.saleNote && !compact ? '<p class="sippo-aff-item-note">' + esc(item.saleNote) + '</p>' : '')
        + '</div>'
        + '<div class="sippo-aff-item-actions">' + buttonsHtml + '</div>'
        + '</div>';
    }).join('');

    /* 2. 残りのリンク（検索・カテゴリ、または遷移先の製品が未記録の直リンク） */
    var rest = links.filter(function (l) { return !carded[l.shop]; });
    var subject = searchSubject(product);
    var restHtml = rest.map(function (link) {
      if (link.isExact) {
        // 遷移先の製品が記録されていない直リンク（従来どおりの表示）
        return button(link, link.shopName + 'で商品を見る', compact ? '商品ページが開きます' : link.shopName + 'の商品ページが開きます（製品は購入前に確認してください）');
      }
      // 検索リンク: 特定の商品ではないことが文言で分かるようにする
      return compact
        ? button(link, link.shopName + 'で探す', '検索結果が開きます')
        : button(link, subject + 'を' + link.shopName + 'で探す', link.shopName + 'の検索結果が開きます（特定の商品ではありません）');
    }).join('');

    var headingHtml = opts.heading
      ? '<p class="sippo-aff-heading">' + esc(opts.heading) + '</p>'
      : '';

    var disclosureHtml = showDisclosure
      ? '<p class="sippo-aff-disclosure">' + esc(DISCLOSURE_TEXT) + '</p>'
      : '';

    var restHeading = (cardsHtml && restHtml && !compact)
      ? '<p class="sippo-aff-subheading">ほかのメーカーの製品も含めて検索で探す</p>'
      : '';

    return '<div class="sippo-aff' + (compact ? ' sippo-aff-compact' : '') + '"'
      + ' data-affiliate-block="1">'
      + headingHtml
      + (cardsHtml ? '<div class="sippo-aff-items">' + cardsHtml + '</div>' : '')
      + restHeading
      + (restHtml ? '<div class="sippo-aff-buttons">' + restHtml + '</div>' : '')
      // 商品ごとの購入時の注意（例: 16GB版の検索リンクだが8GB版も出るので容量を確認）
      + (product.purchaseNote ? '<p class="sippo-aff-purchase-note">' + esc(product.purchaseNote) + '</p>' : '')
      + disclosureHtml
      + '</div>';
  }

  /**
   * 商品名から購入ボタンを描画する（表記ゆれ対応）。
   * 商品を特定できない場合は空文字を返す＝誤リンクは出さない。
   */
  function renderAffiliateButtonsByName(name, options) {
    var id = findProductIdByName(name);
    return id ? renderAffiliateButtons(id, options) : '';
  }

  /**
   * 複数商品をまとめて描画する（PC構成の各パーツなど）。
   * @param {Array<{id?:string, name?:string, label?:string}>} items
   */
  function renderProductList(items, options) {
    if (!Array.isArray(items) || items.length === 0) return '';
    var opts = options || {};

    var rows = items.map(function (item) {
      var id = item.id || findProductIdByName(item.name);
      if (!id) return '';
      var product = getProduct(id);
      if (!product) return '';

      var buttons = renderAffiliateButtons(id, {
        page: opts.page,
        placement: opts.placement,
        compact: true,
        disclosure: false, // まとめて1回だけ出すので個別には付けない
      });
      if (!buttons) return '';

      return '<div class="sippo-aff-row">'
        + '<div class="sippo-aff-row-head">'
        + (item.label ? '<span class="sippo-aff-row-label">' + esc(item.label) + '</span>' : '')
        + '<strong class="sippo-aff-row-name">' + esc(product.name) + '</strong>'
        + '</div>'
        + buttons
        + '</div>';
    }).filter(Boolean);

    if (rows.length === 0) return '';

    return '<div class="sippo-aff-list" data-affiliate-block="1">'
      + (opts.heading ? '<p class="sippo-aff-heading">' + esc(opts.heading) + '</p>' : '')
      + rows.join('')
      + (opts.disclosure === false ? '' : '<p class="sippo-aff-disclosure">' + esc(DISCLOSURE_TEXT) + '</p>')
      + '</div>';
  }

  /* ------------------------------------------------------------------
   *  広告表記
   *  景品表示法のステマ規制（2023年10月〜）およびAmazonアソシエイト
   *  運営規約により、アフィリエイトリンクを含むことの明示が必要。
   * ------------------------------------------------------------------ */
  var DISCLOSURE_TEXT =
    '【PR】当サイトはアフィリエイト広告を利用しています。リンク先で商品を購入すると運営者に収益が発生する場合があります。'
    + 'Amazonのアソシエイトとして、当サイトは適格販売により収入を得ています。';

  function getDisclosureText() {
    return DISCLOSURE_TEXT;
  }

  function renderDisclosure() {
    return '<p class="sippo-aff-disclosure">' + esc(DISCLOSURE_TEXT) + '</p>';
  }

  /* ------------------------------------------------------------------
   *  商品追加ヘルパー（実行時に一時的な商品を足す）
   *  恒久的な追加は affiliate-master.json を編集すること。
   * ------------------------------------------------------------------ */

  /**
   * 実行時に商品を1件登録する。
   * 主な用途は動作確認と、まだマスターに無い商品の一時対応。
   * ページを再読み込みすると消えるので、恒久追加は
   * shared/affiliate/affiliate-master.json を編集すること。
   *
   *   SippoAffiliate.addAffiliateProduct('rtx6070', {
   *     name: 'GeForce RTX 6070',
   *     category: 'gpu',
   *     amazon: { keyword: 'GeForce RTX 6070' },
   *     rakuten: { keyword: 'GeForce RTX 6070' }
   *   });
   */
  function addAffiliateProduct(productId, definition) {
    if (!productId || !definition) return false;
    if (!master) { master = { products: {} }; products = master.products; }

    products[productId] = {
      name: definition.name || productId,
      shortName: definition.shortName || definition.name || productId,
      category: definition.category || 'other',
      brand: definition.brand || '',
      aliases: definition.aliases || [],
      amazon: definition.amazon || { url: '', asin: '', keyword: definition.name || productId },
      rakuten: definition.rakuten || { url: '', keyword: definition.name || productId },
      yahoo: definition.yahoo || { url: '' },
      status: definition.status || 'search-only',
      updatedAt: definition.updatedAt || '',
    };
    searchIndex = null; // 索引を作り直す
    return true;
  }

  /* ------------------------------------------------------------------
   *  公開API
   * ------------------------------------------------------------------ */
  var SippoAffiliate = {
    // 初期化
    init: init,
    isReady: isReady,

    // 商品の取得
    getProduct: getProduct,
    findProductIdByName: findProductIdByName,
    findProductByName: findProductByName,
    getAllProducts: function () { return products; },
    getProductsByCategory: function (category) {
      return Object.keys(products)
        .filter(function (id) { return products[id].category === category; })
        .map(function (id) { return Object.assign({ id: id }, products[id]); });
    },

    // リンク生成
    buildAmazonUrl: buildAmazonUrl,
    buildRakutenUrl: buildRakutenUrl,
    buildYahooUrl: buildYahooUrl,
    getAffiliateLinks: getAffiliateLinks,
    // 商品カード: 遷移先の製品が分かっている直リンクを製品ごとにまとめたもの
    getItemCards: function (productId) {
      var product = getProduct(productId);
      return product ? groupItemLinks(product, getAffiliateLinks(productId)) : [];
    },

    // 描画（共通UI）
    renderAffiliateButtons: renderAffiliateButtons,
    renderAffiliateButtonsByName: renderAffiliateButtonsByName,
    renderProductList: renderProductList,
    renderDisclosure: renderDisclosure,
    getDisclosureText: getDisclosureText,

    // 計測
    bindTracking: bindTracking,
    trackClick: trackClick,

    // 商品追加
    addAffiliateProduct: addAffiliateProduct,

    // ステータス判定（診断スクリプト・運用ツールからも使う）
    isExactLink: isExactLink,
    resolveStatus: resolveStatus,
    isHiddenStatus: isHiddenStatus,
    canUseDirectUrl: canUseDirectUrl,

    // テスト用（内部関数の公開）
    _normalize: normalize,
    _isRealUrl: isRealUrl,
    _normalizeStatus: normalizeStatus,
    _usableImage: usableImage,
    _issuedImageLink: issuedImageLink,
  };

  global.SippoAffiliate = SippoAffiliate;

  // 計測は読み込み時点で仕込んでおく（描画のタイミングに依存しない）
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindTracking);
    } else {
      bindTracking();
    }
  }
})(typeof window !== 'undefined' ? window : this);
