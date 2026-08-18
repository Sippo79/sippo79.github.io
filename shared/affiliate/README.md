# シッポPC 共通アフィリエイト基盤

Amazon・楽天市場・Yahoo!ショッピングの購入導線を、**サイト横断で1か所にまとめて管理する仕組み**です。

---

## いちばん最初に読むところ（早見表）

| 知りたいこと | 場所 |
|---|---|
| **AmazonアソシエイトIDはどこ？** | `affiliate-config.js` の `amazon.associateTag` |
| **楽天アフィリエイトIDはどこ？** | `affiliate-config.js` の `rakuten.affiliateId` |
| **商品一覧はどこ？** | `affiliate-master.json` の `products` |
| **リンク生成はどこ？** | `affiliate.js` の `buildAmazonUrl()` / `buildRakutenUrl()` |
| **クリック計測はどこ？** | `affiliate.js` の `trackClick()`（GA4 `affiliate_click` イベント） |
| **ボタンの見た目はどこ？** | `affiliate.css`（クラス名は全部 `sippo-aff-` 始まり） |
| **アップグレード提案はどこ？** | `affiliate-recommend.js` |

---

## ファイル構成

```
shared/affiliate/
├─ affiliate-config.js      … アフィリエイトID等の設定（公開してよい値だけ）
├─ affiliate-master.json    … 商品マスター（★ここを編集すれば全サイトに反映）
├─ affiliate.js             … 本体。リンク生成・商品検索・描画・クリック計測
├─ affiliate-recommend.js   … アップグレード提案（今のGPU → おすすめ）
├─ affiliate.css            … 購入ボタンの共通スタイル
└─ README.md                … このファイル
```

---

## 使い方（各サイトからの呼び出し）

HTMLで**この順番**に読み込みます。

```html
<link rel="stylesheet" href="/shared/affiliate/affiliate.css">

<script src="/shared/affiliate/affiliate-config.js"></script>
<script src="/shared/affiliate/affiliate.js"></script>
<!-- アップグレード提案を使うページだけ -->
<script src="/shared/affiliate/affiliate-recommend.js"></script>
```

暗い背景のサイト（gpu-guide / game-pc-guide / pc-build-check / pc-builds-hub）は
`<body>` に `data-sippo-theme="dark"` を付けてください。ボタンの色が暗色用に切り替わります。

### 商品IDから購入ボタンを出す

```js
SippoAffiliate.init().then(function () {
  document.getElementById('box').innerHTML =
    SippoAffiliate.renderAffiliateButtons('rtx5070', {
      page: 'gpu-guide',        // 計測用：どのサイトか
      placement: 'product-card' // 計測用：ページ内のどの位置か
    });
});
```

### 商品名から出す（表記ゆれ対応）

```js
// "RTX 5070" / "GeForce RTX 5070" / "NVIDIA GeForce RTX 5070" すべてOK
SippoAffiliate.renderAffiliateButtonsByName(gpu.name, { page: 'gpu-guide', placement: 'hero' });
```

### PC構成のパーツをまとめて出す

```js
SippoAffiliate.renderProductList([
  { label: 'GPU', name: build.gpu },
  { label: 'CPU', name: build.cpu }
], { page: 'pc-build-check', placement: 'build-result' });
```

### アップグレード提案

```js
SippoRecommend.renderUpgrade({
  currentGpu: 'RTX 3060',
  page: 'pc-builds-hub',
  placement: 'post-detail-upgrade'
});
// → 「今のGPU RTX 3060 → おすすめ RTX 5060 Ti / 改善 ★★★」＋購入ボタン
```

**重要**：どの関数も、商品を特定できない場合や表示できるリンクが無い場合は
**空文字を返します**。返り値をそのまま `innerHTML` に入れて構いません。
壊れたボタンや `#` リンクは絶対に出ません。

---

## 商品を追加する（例：RTX 6070 が発売されたら）

`affiliate-master.json` の `products` に**1件足すだけ**です。
これだけで GPU GUIDE・GAME PC GUIDE・PC BUILD CHECK・PC Builds Hub の
すべてで購入ボタンが出るようになります。

```json
"rtx6070": {
  "name": "GeForce RTX 6070",
  "shortName": "RTX 6070",
  "category": "gpu",
  "brand": "NVIDIA",
  "gpu": "GeForce RTX 6070",
  "aliases": [],
  "amazon":  { "url": "", "asin": "", "keyword": "GeForce RTX 6070" },
  "rakuten": { "url": "", "keyword": "GeForce RTX 6070" },
  "yahoo":   { "url": "" },
  "status": "search-only",
  "updatedAt": "2026-08-18"
}
```

- **キー**（`rtx6070`）は小文字英数字のみ。`GeForce` / `Radeon` / 空白 / 記号を
  すべて取り除いた形にしてください。この形が表記ゆれ吸収のキーになります。
- **`url` を空のままでも動きます**。その場合は「Amazonで探す」＝
  アソシエイトID付きの検索URLになります（誤った商品にリンクするより安全）。
- 後から個別の商品リンク（`amzn.to/...` など）を取得したら `url` に入れ、
  `status` を `active` にしてください。

GPU GUIDE で表示したい場合は `gpu-guide/gpus.json` にもGPU情報の追加が必要です
（こちらは性能スコアや解説文など、購入導線とは別のコンテンツ側のデータ）。

アップグレード提案の対象にしたい場合は `affiliate-recommend.js` の
`GPU_TIERS` に性能の目安を、乗り換え先候補にするなら `UPGRADE_CANDIDATES` にも追加します。

---

## `status` の意味

| 値 | 動作 |
|---|---|
| `active` | 個別のアフィリエイトURLが登録済み。そのURLへリンクする |
| `search-only` | 個別URL未登録。アソシエイトID付きの**検索URL**へリンクする |
| `preparing` / `paused` / `discontinued` | **ボタンを出さない** |

---

## Amazon / 楽天の実装方式と、その理由

### 採用した方式：**URLをその場で組み立てる（実行時にAPIを叩かない）**

**Amazon**（優先順に判定）

1. `amazon.url` に登録済みの個別URL（既存の `amzn.to/...` 短縮リンク）→ そのまま使う
2. `amazon.asin` があれば公式形式 `https://www.amazon.co.jp/dp/{ASIN}/ref=nosim?tag={ID}`
3. どちらも無ければキーワード検索 `https://www.amazon.co.jp/s?k={keyword}&tag={ID}`

**楽天**

1. `rakuten.url` に登録済みの個別URL（既存の `a.r10.to/...` 短縮リンク）→ そのまま使う
2. 無ければ楽天市場の検索URL。`affiliateId` が設定されていれば
   `hb.afl.rakuten.co.jp` 経由のアフィリエイトURLでラップする

### なぜ公式APIを使わないのか

- **Amazon PA-API 5.0** … 利用には「アクティブなアソシエイトアカウントで
  **直近30日以内に3件以上の適格販売**」が必要。実績を作るまで使えません。
  実績ができるまでは通常のアソシエイトリンクで運用するのが公式の想定手順です。
- **楽天ウェブサービス（商品検索API）** … 2026年の仕様変更で、`applicationId` に加えて
  **`accessKey`（秘密鍵）が必須**になりました。秘密鍵はブラウザに置けないため、
  GitHub Pages の静的サイトのフロントからは安全に呼べません
  （サーバーサイド専用の扱いになっています）。

そのため**実行時に外部APIを呼ばない設計**にしています。結果として：

- APIキーが無くてもサイトは完全に動く
- API障害・レート制限・仕様変更の影響を受けない
- ページ表示が速い（追加のネットワーク往復なし）

将来 PA-API が使えるようになった場合も、`affiliate-master.json` の
`amazon.asin` を埋めていけば商品ページへの直リンクに切り替わります。
リンク生成の入口は `buildAmazonUrl()` 1か所なので、差し替えも局所的です。

### 規約上の注意

- 商品情報のスクレイピングは**していません**（規約違反になるため）。
- 商品画像は Amazon / 楽天のものを**使っていません**。各サイトの既存画像を使い、
  購入ボタンだけを追加しています。
- 価格は**一切ハードコードしていません**。古い価格が残る事故を防ぐため、
  ボタンの文言は「価格を見る」「探す」に統一しています。

---

## 秘密情報の扱い

`affiliate-config.js` に入れてよいのは**公開前提の値だけ**です。

✅ 入れてよい
- Amazon アソシエイトID（`tag=` としてURLに載るので、そもそも秘密にできない）
- 楽天アフィリエイトID（同上）

🚫 絶対に入れてはいけない（GitHubにpushされます）
- Amazon PA-API の Access Key / Secret Key
- 楽天ウェブサービスの `accessKey`
- その他あらゆる Secret / Private Token

将来サーバーサイドが必要になった場合は、既存の Supabase を使い
**Supabase Edge Functions の環境変数**に置いてください
（`pc-builds-hub/supabase-config.js` と同じ考え方：フロントに置くのは公開鍵だけ）。

---

## クリック計測

購入ボタンのクリックは GA4（`G-NDQ8GTKGHC`、サイト全体で同一）へ
`affiliate_click` イベントとして送られます。

送信されるパラメータ：

| パラメータ | 内容 | 例 |
|---|---|---|
| `product_id` | 商品ID | `rtx5070` |
| `product_name` | 商品名 | `GeForce RTX 5070` |
| `shop` | ショップ | `amazon` / `rakuten` / `yahoo` |
| `page` | どのサイトか | `gpu-guide` |
| `placement` | ページ内の位置 | `product-card` |
| `link_url` | 遷移先URL | `https://amzn.to/...` |
| `page_path` | ページのパス | `/gpu-guide/gpu.html` |

`placement` を見れば「**どの位置のリンクが最もクリックされるか**」を分析できます。

現在使われている `placement` の値：

| placement | 場所 |
|---|---|
| `gpu-detail-purchase` | GPU GUIDE のGPU詳細ページ |
| `game-recommended-parts` | GAME PC GUIDE のゲーム別ページ |
| `build-result` | PC BUILD CHECK の診断結果 |
| `build-detail-spec` | PC BUILD CHECK の構成詳細ページ（75件） |
| `post-detail-parts` | PC Builds Hub の投稿詳細 |
| `post-detail-upgrade` | PC Builds Hub のアップグレード提案 |
| `upgrade-result` | アップグレード提案（既定値） |
| `consult-result` | PC相談の結果提示（今後） |

### 確認方法

GA4 → レポート → リアルタイム、または 探索 で
イベント名 `affiliate_click` を指定し、`shop` / `page` / `placement` で
ディメンションを分けて確認します。

**計測は必ず「おまけ」扱い**です。`gtag` が無い・エラーが起きた場合も、
リンクの遷移は絶対に妨げません（`try/catch` で握りつぶしています）。

---

## 誤リンク防止の考え方

> **誤った商品のアフィリエイトリンクを表示するくらいなら、リンクを表示しない。**

これを最優先しています。特に PC Builds Hub はユーザーが商品名を自由入力するため、
表記ゆれが避けられません。

- 商品名は正規化して照合します（`GeForce` `NVIDIA` `AMD` `Radeon` や
  販売店の修飾語 `ASUS` `MSI` などを除去し、記号・空白も落とす）。
- 完全一致 → 前方/部分一致（長いキーを優先）の順に判定します。
- **`RTX 5070` と `RTX 5070 Ti` を取り違えない**よう、一致部分の直後に数字が
  続く場合は不一致として扱います。
- 少しでも特定できない場合は `null` を返し、**ボタンを出しません**。

---

## 動作確認（テスト）

`shared/affiliate/` 配下は素のJSなので、Nodeの `vm` で読み込んでテストできます。
過去に実施した確認項目：

- Amazon / 楽天リンク生成（個別URL・ASIN・キーワード検索の3経路）
- 商品未登録 / Amazonのみ / 楽天のみ / 両方なし のフォールバック
- アフィリエイトID未設定でもページが壊れないこと
- 商品マスターの取得失敗時に例外を投げず空文字を返すこと
- `gtag` が無くてもクリック処理が落ちないこと
- 表記ゆれ（全角・ベンダー名付き・販売店修飾語付き）の吸収
- 商品名のHTMLエスケープ（XSS対策）
- 実データ（`gpus.json` 63件 / `builds.json` 75件 / `games.json` 25件）での
  マッチング率と誤リンクの有無
