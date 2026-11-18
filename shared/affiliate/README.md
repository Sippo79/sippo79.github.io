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

リンク切れ・販売終了に備え、**直リンク → 検索リンク → 非表示** の3段階で解決します。

| 値 | 動作 |
|---|---|
| `active` | 直リンク（`url` または `asin`）を優先。無ければ検索へフォールバック |
| `search-only` | 直リンクを使わず、アフィリエイトID付きの**検索URL**のみ |
| `sold-out` | 売り切れ。直リンクを捨てて**検索URLへフォールバック** |
| `discontinued` | 販売終了。直リンクを捨てて**検索URLへフォールバック** |
| `disabled` | **購入ボタンを一切表示しない** |
| `preparing` / `paused` | 【旧仕様・互換維持】ボタンを出さない。新規は `disabled` 推奨 |

- **未設定は `search-only` 扱い**（既存商品の挙動を変えないため）。
- フォールバック時の検索語は `keyword`（未設定なら `name`）。
  Amazonは `tag=` 付き、楽天はアフィリエイトID付きのURLになります。
- `keyword: ""` を明示すると**検索フォールバックもしません**
  （そのショップでは扱いが無い商品など、誤誘導を避けたいとき）。
- フォールバックしたボタンは文言が自動で「〇〇で**探す**」に変わります
  （商品ページだと誤認させないため。`isExact` で制御）。

### `linkType`（ボタン文言の出し分け）

短縮URL（`amzn.to` / `a.r10.to` / `yahoo.jp`）は、見ただけでは
**商品ページ行きなのか検索結果行きなのか分かりません**。
実際に開いて確認した結果を `linkType` に記録します。

| `linkType` | 遷移先 | ボタン文言 |
|---|---|---|
| `exact` | 商品詳細ページ | 〇〇で**商品を見る**（`item` があれば商品カード） |
| `search` | 検索結果ページ | 「RTX 5070搭載製品を〇〇で**探す**」（一覧では「〇〇で探す」） |

### 商品カード（`item`、2026-11-18〜）

直リンクの遷移先が**どのメーカーのどの製品か**を、そのショップの `item` に記録します。
`item` がある直リンクだけが「写真・メーカー名・製品名・型番・販売店ボタン」のカードになります。
GPUのページ（テーマ: RTX 5070）で、実際に売っている製品（MSI GeForce RTX 5070 12G VENTUS 2X）を
取り違えさせないためです。

```json
"rakuten": {
  "url": "https://a.r10.to/hkSdhv",
  "linkType": "exact",
  "item": {
    "maker": "MSI",
    "name": "GeForce RTX 5070 12G VENTUS 2X",
    "model": "",
    "destination": "https://product.rakuten.co.jp/product/-/fbd5…/",
    "checkedAt": "2026-11-18",
    "checkedBy": "短縮リンクの転送先ページ（楽天市場）の商品名で確認",
    "image": null
  }
}
```

- **確認方法**: 短縮リンクの転送先（`curl -s -o /dev/null -w "%{redirect_url}" <短縮URL>` の `pc=`）を、
  アフィリエイト経由でなく直接開いて商品名を見る。**製品名に別のGPU名（SUPER / Ti 違い等）が出たら `item` を付けず、
  `retiredUrl` に退避して検索へ**（`scripts/test-affiliate-cards.js` が GPU名との一致を検査する）。
- `model` は製品名と別の型番（例: `VD7358`）が確認できたときだけ。推測で埋めない。
- **写真 `image`** は利用許諾を確認できたものだけ:
  `{ "src": "https://…", "width": 600, "height": 400, "alt": "…", "source": "提供元", "license": "利用条件", "href": "（提供元が指定するリンク先）" }`。
  `source`・`license` が無い／https でない写真は表示しない。`href` があるときは、それがカードのボタンと同じURLの場合だけ
  写真をリンクにして表示し、違うなら写真を出さない。商品ページから画像URLを抜き出したり、別モデルや生成画像で代用しない。
- 写真が無い・読み込めないときは、写真枠を外して文字とボタンだけのカードになる（リンクはそのまま使える）。
- 同じ製品（maker・name・model が一致）のリンクだけを1枚のカードにまとめる。
- `compact: true`（一覧・PC BUILDER・`renderProductList`）では1行の小さいカード。
- 計測属性・`affiliate_click` のパラメータは従来どおり（カード化でクリックが二重に数えられることはない）。

### 楽天の発行画像リンク（`item.imageLink`、2026-11-18〜）

楽天アフィリエイトで発行した **「画像のみ」（link_type=pict）の商品リンクHTML** を、**1文字も変えずに**カードの写真欄に入れます。
楽天ガイドラインは「発行HTMLの変更」「a・img タグの属性の追加・削除・変更」「指定サイズ以外への変更」を禁止しているため、
画像URLだけを抜き出して独自の `<img>` にしたり、CSS で画像を拡縮したりしません（カードの列幅＝132px＝128px＋margin 2px×2 を合わせる）。

```json
"item": {
  "maker": "MSI", "name": "GeForce RTX 3080 VENTUS 3X 10G OC", "model": "VD7358", …,
  "imageLink": {
    "type": "rakuten-pict",
    "size": "128x128",
    "html": "<a href=\"https://hb.afl.rakuten.co.jp/ichiba/…&link_type=pict&ut=…\" target=\"_blank\" rel=\"nofollow sponsored noopener\" style=\"word-wrap:break-word;\"><img src=\"https://hbb.afl.rakuten.co.jp/hgb/…&s=128x128&t=pict\" border=\"0\" style=\"margin:2px\" alt=\"\" title=\"\"></a>",
    "destination": "https://item.rakuten.co.jp/palmsamerica/ayhrpsrksx/",
    "destinationShop": "パームスアメリカ",
    "destinationTitle": "MSI GeForce RTX 3080 VENTUS 3X 10G OC グラフィックスボード VD7358",
    "issuedAt": "2026-11-18", "checkedAt": "2026-11-18", "checkedBy": "…"
  }
}
```

**残りの製品を登録する手順**
1. 楽天アフィリエイトの「商品リンク」で、リンクタイプ **画像のみ**・サイズ **128×128** を選んで発行する（画像＋テキストは価格・セール文言が入るので使わない）。
2. 発行HTMLの `pc=` を URL デコードした転送先の楽天商品ページを開き、**メーカー・製品名・型番が `item` と同じ**か確認する（OC版・別容量・訳あり／外箱ダメージ品は登録しない）。
3. HTML をそのまま `html` に貼り、`destination`（＝`pc=` の値）・`destinationShop`・`destinationTitle`（転送先の商品名）・日付を入れる。
4. `node scripts/test-affiliate-cards.js` を実行（HTMLの形・pict・サイズ・転送先の一致・訳あり語を検査）。共通 affiliate.js/css を変えた場合のみ各サイトの SW 版を上げる（master だけの変更は network-first で反映）。

- 描画時にも形を検査し（`issuedImageLink()`）、少しでも違えば写真を出さず従来の写真なしカードになる。
- **一覧（`compact`：PC BUILDER・PC BUILD CHECK・GAME PC GUIDE）では表示しない**（行を大きくしない）。
- クリック計測: 発行HTMLの `<a>` には属性を足せないので、外側の枠 `.sippo-aff-item-media--issued` に `data-affiliate-wrap` と計測属性を置き、`bindTracking()` がその中の `<a>` のクリックを `affiliate_click` として1回だけ送る（`link_url` は画像リンクのURL、`shop` は `rakuten`）。
- 販売店ボタンは従来の短縮リンク（`url`）のまま。画像リンクの転送先は特定ショップの商品ページ、短縮リンクは楽天の製品ページ（複数ショップ）のことがある（同じ製品であることは確認済み）。
- 画像が読み込めないときは枠ごと外して写真なしカードに戻る。

### ボタン文言は行き先に合わせる（`item.destinationType`、2026-11-18〜）

| destinationType | ボタンの行き先 | 文言（補足） |
|---|---|---|
| `item` | 特定ショップの商品ページ（item.rakuten.co.jp） | 楽天市場で**商品を見る**（楽天市場の商品ページが開きます） |
| `compare` | 同じ製品の複数ショップを並べた楽天の製品ページ（product.rakuten.co.jp/product/） | 楽天市場で**価格を比較**（同じ製品を扱う複数ショップの価格比較ページが開きます） |

- `destinationType` は短縮リンクの転送先（`destination`）と一致させる（テストで検査）。未設定なら `destination` のURLから判定する。
- 写真（発行画像リンク）は特定ショップの商品ページ、ボタンは価格比較ページ、という組み合わせもある（RTX 4060・RTX 5080・RX 9070 XT）。どちらも同じ製品であることを確認済み。
- 検索リンクは従来どおり「〇〇搭載製品を△△で探す」。

### 販売状態の注記（`item.saleNote`）・保留の記録（`item.imageLinkHeld`）

- `saleNote`: ショップが表記する販売状態（例: 個人輸入扱い・米国から発送／並行輸入品）。**詳細カードだけ**に小さく表示し、一覧（compact）には出さない。写真とボタンの行き先がどちらもその状態のときに付ける。
- `imageLinkHeld`: 照合で不一致・判断できなかった発行リンクの記録（`reason`・`destination`・`destinationTitle`・`checkedAt`）。**html は保存しない**（表示に使わない）。正しい商品で発行し直したら `imageLink` を入れて `imageLinkHeld` を消す。

### 画像リンクだけで紹介する製品（`rakuten.linkType: "image-only"`、2026-11-18〜）

紹介する製品を発行画像リンクの商品に合わせ、**その製品の販売店ボタン（短縮リンク）がまだ無い**ときの形。現在は RTX 5070（MSI 12G VENTUS 2X OC / VD9071・SPW楽天市場店）と RTX 5060（MSI 8G VENTUS 2X OC V1 / JAN 4711377460880・パソコン工房）。

- `rakuten.url` は空。別モデル行きだった旧短縮リンクは `previousUrl`／`previousNote` に控える（表示に使わない）。**計測URLを推測で作らない**。
- `item` は発行リンクの転送先の製品（`destination` は `imageLink.destination` と同じ、`destinationType: "item"`）。
- 詳細カード: 写真（発行HTMLそのまま）＋メーカー名・製品名・型番＋「商品画像を押すと、楽天市場のショップページが開きます」。楽天のボタンも、楽天の検索リンクも出さない。
- 一覧（compact・PC BUILDER）: 写真を出さないので、この製品の楽天リンクは出さない（Amazon・Yahoo!の検索ボタンだけ）。
- 楽天の `status` を `sold-out` 等にすると写真リンクも出さず、従来どおり楽天の検索へ逃がす。発行HTMLが壊れているとカードごと出さない。
- 新製品の短縮リンクを発行したら `url` に入れて `linkType: "exact"` に戻す（転送先を確認して `destination`／`destinationType` を合わせる）。

```json
"amazon":  { "url": "https://amzn.to/xxxx", "linkType": "search", "keyword": "GeForce RTX 5070" },
"rakuten": { "url": "https://a.r10.to/xxxx", "linkType": "exact",  "keyword": "GeForce RTX 5070" }
```

- **未設定・不明な値は `search` 扱い**（安全側）。「商品を見る」と言って
  検索結果を開く方がユーザーを裏切るため、迷ったら控えめな「探す」に倒します。
- **フォールバック中（`sold-out` 等）は `linkType` に関わらず必ず `search`**。
  実態が検索なので、`exact` と書いてあっても無視されます。
- ASIN から組み立てた `/dp/{ASIN}` は定義上かならず商品ページなので `exact` 扱い。
- 判定は `isExactLink()` に集約されており、**Amazon / 楽天 / Yahoo で共通**です。

遷移先が変わった（商品ページを貼り直した等）ときは `linkType` も直してください。

### ショップ単位の `status`

`status` は商品全体だけでなく、`amazon` / `rakuten` / `yahoo` の
**各ショップの中にも書けます**（ショップ側が優先）。
「Amazonだけ売り切れ、楽天は在庫あり」を表現できます。

```json
"rtx5070": {
  "name": "GeForce RTX 5070",
  "amazon":  { "url": "https://amzn.to/xxxx", "status": "sold-out", "keyword": "GeForce RTX 5070" },
  "rakuten": { "url": "https://a.r10.to/xxxx", "keyword": "GeForce RTX 5070" },
  "status": "active"
}
```

→ Amazonは「探す」（検索）、楽天は従来どおり直リンク。

---

## リンク切れの診断（`scripts/check-affiliate-links.js`）

登録済みの**直リンクだけ**を実際に叩いて生死を一覧化します。
検索フォールバックの商品は「切れようがない」ので対象外です。

```bash
node scripts/check-affiliate-links.js                 # 全件
node scripts/check-affiliate-links.js --shop amazon   # Amazonだけ
node scripts/check-affiliate-links.js --limit 20      # お試しで20件
node scripts/check-affiliate-links.js --csv report.csv # CSV出力
```

`product_id` / 商品名 / `shop` / URL / HTTP状態 / **正常・要確認・リンク切れ**
を表で出力します。

| 判定 | 意味 |
|---|---|
| 正常 | 2xx で最終URLがそのショップのドメイン内、かつ本文に売り切れ表示が無い |
| 要確認 | 403 / 429 / タイムアウト / トップページ着地 / **HTTP 200 だが本文が「取扱いがありません」等** |
| リンク切れ | 404 / 410（明確に存在しない） |

### ★ HTTPステータスだけでは検知できない

楽天の「商品価格ナビ」は、商品の取扱いが終わっても **HTTP 200 を返します**。

```
https://product.rakuten.co.jp/product/-/xxxx/
→ HTTP 200 なのに「現在こちらの商品は取扱いがありません」
```

そのため本スクリプトは**本文も読んで**売り切れ表示を検出します
（`SOLD_OUT_PATTERNS`）。新しい表示パターンを見つけたらここに追記してください。
ただし本文一致でも**「リンク切れ」ではなく「要確認」**に留めます（誤検知を避けるため）。

### 売り切れを見つけたときの直し方

直リンクを**消さずに `retiredUrl` へ退避**し、`url` を空にして
`status: "sold-out"` を付けます（そのショップだけ検索フォールバックになる）。

```json
"rakuten": {
  "url": "",
  "keyword": "Radeon RX 9070",
  "retiredUrl": "https://a.r10.to/hk2Oby",
  "status": "sold-out",
  "note": "2026-08-18 直リンク先が「取扱いがありません」表示のため検索フォールバックへ切替"
}
```

`retiredUrl` は復活したときに戻すための控えです（コードは参照しません）。

**★このスクリプトは商品マスターを書き換えません。**
Amazon / 楽天はBot対策やリダイレクトがあり、HTTPステータスだけでは
「本当にリンク切れか」を確定できません。誤判定で**正常な収益リンクを
止めてしまう方が損失が大きい**ため、自動で `sold-out` にはしません。
必ずブラウザで目視確認してから、手で `status` を変更してください。

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
  ボタンの文言は「商品を見る」「探す」に統一しています。

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

購入ボタンのクリックは GA4（測定ID `G-NDQ8GTKGHC`。2026-11-13〜 `shared/analytics/sippo-analytics.js` に集約、サイト全体で同一）へ
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
