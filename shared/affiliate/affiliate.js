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

    // isExact = 商品ページ直リンクかどうか（false は検索結果ページ）。
    // フォールバックした場合は実態が「検索」なので必ず false になるよう、
    // マスターの有無だけでなくステータスも見る（ボタン文言でユーザーを騙さない）。
    var amazonUrl = buildAmazonUrl(product);
    if (amazonUrl) {
      var amazonDirect = canUseDirectUrl(resolveStatus(product, 'amazon'));
      links.push({
        shop: 'amazon',
        shopName: 'Amazon',
        url: amazonUrl,
        isExact: amazonDirect && (isRealUrl(product.amazon && product.amazon.url) || Boolean(product.amazon && product.amazon.asin)),
      });
    }

    var rakutenUrl = buildRakutenUrl(product);
    if (rakutenUrl) {
      var rakutenDirect = canUseDirectUrl(resolveStatus(product, 'rakuten'));
      links.push({
        shop: 'rakuten',
        shopName: '楽天市場',
        url: rakutenUrl,
        isExact: rakutenDirect && isRealUrl(product.rakuten && product.rakuten.url),
      });
    }

    var yahooUrl = buildYahooUrl(product);
    if (yahooUrl) {
      links.push({ shop: 'yahoo', shopName: 'Yahoo!ショッピング', url: yahooUrl, isExact: true });
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
      var link = event.target && event.target.closest
        ? event.target.closest('a[data-affiliate-track]')
        : null;
      if (!link) return;

      trackClick({
        productId: link.getAttribute('data-affiliate-product') || '',
        productName: link.getAttribute('data-affiliate-name') || '',
        shop: link.getAttribute('data-affiliate-shop') || '',
        page: link.getAttribute('data-affiliate-page') || '',
        placement: link.getAttribute('data-affiliate-placement') || '',
        url: link.href || '',
      });
    }, true); // capture: 他のハンドラが止めても計測できるように
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
  function renderAffiliateButtons(productId, options) {
    var opts = options || {};
    var product = getProduct(productId);
    if (!product) return '';

    var links = getAffiliateLinks(productId);
    if (links.length === 0) return '';

    var cfg = config();
    var page = opts.page || '';
    var placement = opts.placement || '';
    var showDisclosure = opts.disclosure !== false;

    var buttonsHtml = links.map(function (link) {
      // 商品ページ直リンクか検索かで文言を変える（ユーザーを騙さない）
      var label = link.isExact
        ? link.shopName + 'で価格を見る'
        : link.shopName + 'で探す';
      var note = link.isExact
        ? '商品ページを開きます'
        : link.shopName + 'の検索結果を開きます';

      return '<a class="sippo-aff-btn sippo-aff-btn-' + esc(link.shop) + '"'
        + ' href="' + esc(link.url) + '"'
        + ' target="_blank"'
        + ' rel="' + esc(cfg.behavior.rel) + '"'
        + ' data-affiliate-track="1"'
        + ' data-affiliate-product="' + esc(productId) + '"'
        + ' data-affiliate-name="' + esc(product.name) + '"'
        + ' data-affiliate-shop="' + esc(link.shop) + '"'
        + ' data-affiliate-page="' + esc(page) + '"'
        + ' data-affiliate-placement="' + esc(placement) + '"'
        + '>'
        + '<span class="sippo-aff-btn-label">' + esc(label) + '</span>'
        + '<small class="sippo-aff-btn-note">' + esc(note) + '</small>'
        + '</a>';
    }).join('');

    var headingHtml = opts.heading
      ? '<p class="sippo-aff-heading">' + esc(opts.heading) + '</p>'
      : '';

    var disclosureHtml = showDisclosure
      ? '<p class="sippo-aff-disclosure">' + esc(DISCLOSURE_TEXT) + '</p>'
      : '';

    return '<div class="sippo-aff' + (opts.compact ? ' sippo-aff-compact' : '') + '"'
      + ' data-affiliate-block="1">'
      + headingHtml
      + '<div class="sippo-aff-buttons">' + buttonsHtml + '</div>'
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
    resolveStatus: resolveStatus,
    isHiddenStatus: isHiddenStatus,
    canUseDirectUrl: canUseDirectUrl,

    // テスト用（内部関数の公開）
    _normalize: normalize,
    _isRealUrl: isRealUrl,
    _normalizeStatus: normalizeStatus,
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
