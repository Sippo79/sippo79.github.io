/* =====================================================================
 *  シッポPC 共通アフィリエイト設定
 *  ---------------------------------------------------------------------
 *  ★ ここが「AmazonアソシエイトIDはどこ？」「楽天IDはどこ？」の答えです。
 *
 *  このファイルに入れてよいのは【公開前提の値だけ】です。
 *  GitHub Pages で配信される = ブラウザから丸見えになります。
 *
 *  ✅ 入れてよい:
 *     - Amazon アソシエイトID（トラッキングID / tag=◯◯-22）
 *       → リンクに必ず載る値なので、そもそも秘密にできません。
 *     - 楽天アフィリエイトID
 *       → 同上。アフィリエイトURLに載る公開値です。
 *
 *  🚫 絶対に入れてはいけない:
 *     - Amazon PA-API の Access Key / Secret Key
 *     - 楽天ウェブサービスの accessKey（2026年新仕様の秘密鍵）
 *     - その他あらゆる Secret / Private Token
 *     → これらが必要になったら Supabase Edge Functions 等の
 *       サーバー側に置くこと。詳細は shared/affiliate/README.md を参照。
 *
 *  未設定（空文字）のままでもサイトは壊れません。
 *  その場合は「タグなしの通常URL」または「ボタン非表示」になります。
 * ===================================================================== */
(function (global) {
  'use strict';

  var CONFIG = {
    amazon: {
      /* AmazonアソシエイトのトラッキングID。例: "sippopc-22"
         アソシエイト管理画面 → 右上のトラッキングID で確認できます。
         未設定の場合、Amazonリンクは「タグなしURL」になります
         （＝リンクは開くが収益にはならない）。 */
      associateTag: 'sippo79-22',

      /* Amazon.co.jp のホスト。通常は変更不要。 */
      host: 'https://www.amazon.co.jp',
    },

    rakuten: {
      /* 楽天アフィリエイトID。例: "1a2b3c4d.5e6f7g8h.9i0j1k2l.3m4n5o6p"
         楽天アフィリエイト管理画面 → アフィリエイトID で確認できます。
         未設定でも楽天検索URLは生成されます（＝収益にはならない）。 */
      affiliateId: '56aa006c.76706573.56aa006d.849ed47b',

      /* 楽天ウェブサービス（商品検索API）の applicationId。
         ★注意★ 2026年の新仕様で、APIは applicationId に加えて
         「accessKey（秘密鍵）」が必須になりました。accessKey は
         クライアントサイドに置けないため、本サイト（GitHub Pages の
         静的サイト）では商品検索APIを使用しません。
         将来サーバーサイド（Supabase Edge Functions 等）を用意した
         場合に備えて、設定欄だけ残しています。 */
      applicationId: '',

      /* 楽天市場の検索ベースURL。通常は変更不要。 */
      searchBase: 'https://search.rakuten.co.jp/search/mall/',
    },

    yahoo: {
      /* Yahoo!ショッピングは現状「短縮アフィリエイトURL（yahoo.jp/xxxx）を
         商品マスターに直接登録する」運用のみ。IDによる自動生成はしません。 */
      enabled: true,
    },

    /* -----------------------------------------------------------------
     *  リンク生成のふるまい
     * ----------------------------------------------------------------- */
    behavior: {
      /* 商品マスターに個別URL（amzn.to 等）もASINも無い商品で、
         キーワード検索URLへのフォールバックを許可するか。
         true  = 「Amazonで検索」ボタンを出す（誤商品リンクにはならない）
         false = ボタン自体を出さない */
      allowSearchFallback: true,

      /* 外部リンクに付与する rel。広告表記の観点から sponsored 必須。 */
      rel: 'nofollow sponsored noopener noreferrer',

      /* GA4 へのクリック計測を行うか（gtag が無ければ自動的に無効）。 */
      tracking: true,
    },
  };

  /* 既に別ファイルで上書きされていればそちらを尊重する（多重読込対策） */
  global.SIPPO_AFFILIATE_CONFIG = global.SIPPO_AFFILIATE_CONFIG || CONFIG;
})(typeof window !== 'undefined' ? window : this);
