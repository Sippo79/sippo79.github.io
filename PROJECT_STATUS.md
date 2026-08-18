# PROJECT_STATUS — sippo-pc.jp 現状スナップショット

> このファイルは **サイト全体の現状・仕様** を 1 枚にまとめたもの。
> 詳細な各サイト解説・運用ルールは `README.md` を参照。作業履歴は `AI_WORK_LOG.md`。
> **URL構成 / 使用技術 / Supabase関連 / デザイン方針 / 現在の課題** が変わったら必ず更新する。

最終更新: 2026-08-18（アフィリエイトID設定＋リンク切れフォールバック機能・診断スクリプトを追加）

---

## 0. 作業前チェックリスト（別AI・作業者向け）

修正に入る前に、以下を毎回確認すること。事故防止のための最小ルール。

- [ ] **作業前に `git status` を確認**し、未コミットの変更や想定外の差分がないか把握する。
- [ ] **対象ファイルを読んでから修正する**（推測で書き換えない）。
- [ ] HTML / CSS / JS / JSON の**通常の修正は実施してよい**。
- [ ] ⚠️ `npm install` / `pip install` / `git reset` / VSCode拡張の変更 / **PC環境に影響するコマンドは事前確認**してから実行。
- [ ] **Supabase関連は RLS / auth / `data-*` 属性 / id を壊さない**（`pc-builds-hub/` の認証・投稿・Nice・管理者機能）。
- [ ] **OGP画像に SVG を使わない**（SNSで表示されない。png/jpg を使う）。
- [ ] **`canonical` / `og:url` / sitemap は正式URL**（末尾スラッシュ付きディレクトリURL）に合わせる。
- [ ] 修正後は **`AI_WORK_LOG.md` に記録**する（最新を一番上に追記）。
- [ ] **URL構成 / 技術構成 / Supabase仕様 / デザイン方針 / 運用制約 / 課題が変わったら `PROJECT_STATUS.md` も更新**する。

---

## 1. 概要

シッポ（Sippo）= **PC初心者のPC選びをサポートする静的サイト群**。
親サイト（ポータル）を入口に、複数の子サイトへ移動できる構成。1 リポジトリで運用。

- 公開ドメイン: <https://sippo-pc.jp/>
- 公開方法: **GitHub Pages**（リポジトリ `sippo79.github.io`）
- 構成: ビルドツールなしの **静的 HTML / CSS / JavaScript**
- このリポジトリがメインの運用場所（旧リポジトリはアーカイブ済み）

---

## 2. URL構成

| サイト | URL | 役割 | ローカルディレクトリ |
|---|---|---|---|
| シッポ親サイト | https://sippo-pc.jp/ | 各子サイトへのポータル（入口） | `/`（`index.html`） |
| シッポPC相談室 | https://sippo-pc.jp/pc-consult/ | PC購入前チェック・構成相談。**メイン窓口＝500円ワンコイン相談**（申し込みはSquare決済リンク→決済完了後にGoogleフォームへ自動遷移→フォーム送信で受付完了）。**サブプラン＝1,500円 ゲーム向けPC構成・購入相談**（申し込みはココナラ商品ページ）。無料窓口は申し込み前の事前問い合わせ用 | `pc-consult/` |
| PC構成投稿サイト | https://sippo-pc.jp/pc-builds-hub/ | ユーザーのPC構成の投稿・閲覧（**Supabase連携**） | `pc-builds-hub/` |
| GPU GUIDE | https://sippo-pc.jp/gpu-guide/ | GPU性能・価格帯・用途別の比較 | `gpu-guide/` |
| PC BUILD CHECK | https://sippo-pc.jp/pc-build-check/ | 予算・用途・解像度からPC構成を診断 | `pc-build-check/` |
| GAME PC GUIDE | https://sippo-pc.jp/game-pc-guide/ | ゲーム別おすすめPC構成 | `game-pc-guide/` |

**URLルール**:
- できるだけ `index.html` なしの **ディレクトリURL** に統一（例: `/pc-consult/`）。実ファイル `index.html` は残し、`/.../index.html` でもアクセス可。
- `canonical` / `og:url` / `sitemap.xml` は正式URL（ディレクトリURL）に合わせる。
- ⚠️ GitHub Pages（Linux）は大文字小文字を区別。ディレクトリ名は**小文字**（例 `pc-builds-hub`）で一致させること。不一致だと 404。

**サイトマップ構成（2026-06-30〜）**:
- 直下 `sitemap.xml` は **サイトマップインデックス**（`<sitemapindex>`）。以下5本を束ねる:
  - `sitemap-main.xml`（親サイト + `/pc-consult/`）
  - `gpu-guide/sitemap.xml` / `pc-build-check/sitemap.xml` / `game-pc-guide/sitemap.xml` / `pc-builds-hub/sitemap.xml`（各子サイトが個別ページまで網羅、多くは生成スクリプト由来）
- 親サイト/pc-consult のURLを足すときは `sitemap-main.xml` を編集（直下 sitemap.xml はインデックスなので実URLを書かない）。
- 直下 `robots.txt` の `Sitemap:` はインデックス1本（`https://sippo-pc.jp/sitemap.xml`）に集約。

---

## 3. 使用技術

- **フロント**: 素の HTML / CSS / JavaScript（フレームワーク・ビルドツールなし）
- **ホスティング**: GitHub Pages（カスタムドメイン `CNAME` = sippo-pc.jp）
- **PWA**: 親サイトおよび一部子サイトで Service Worker (`sw.js`) / `manifest.json`
- **データ**: 各子サイトは JSON 駆動（`gpus.json` / `builds.json` / `games/` など）
- **生成スクリプト**: 一部ページは PowerShell スクリプトで静的生成
  - `generate-builds.ps1`（PC BUILD CHECK）
  - `game-pc-guide/Generate-StaticGames.ps1`（GAME PC GUIDE）
  - 各サイトの `generate-sitemap.ps1` / `.js`
- **バックエンド**: 原則なし。例外は PC構成投稿サイトの **Supabase**（次項）
- **申し込み導線**: PC相談室の500円ワンコイン相談は **Squareの決済リンク**へ誘導。Square側で決済完了後にGoogleフォームへ自動遷移する設定が完了済み（フォーム送信まで完了して受付完了）。サイト側に決済機能・カートは実装していない（Square側の既存決済リンクへの外部遷移のみ）。無料の事前問い合わせは引き続きGoogleフォーム直リンク。
- **アフィリエイト**: **共通基盤 `shared/affiliate/`**（2026-08-18〜）
  - `affiliate-master.json` … 商品マスター（**URL追加・変更はここだけを編集**。全サイトへ反映）
  - `affiliate-config.js` … アソシエイトID / 楽天アフィリエイトID（**公開してよい値のみ**）
  - `affiliate.js` … リンク生成・商品名の表記ゆれ吸収・共通UI・クリック計測
  - `affiliate-recommend.js` … アップグレード提案（今のGPU→おすすめ）
  - `affiliate.css` … 購入ボタン共通スタイル（暗いサイトは `<body data-sippo-theme="dark">`）
  - 詳しい管理方法は `shared/affiliate/README.md`

---

## 3-2. アフィリエイト（サイト全体 / 2026-08-18〜）

- **方式**: **実行時に外部APIを呼ばない**。アフィリエイトID付きURLをその場で組み立てる。
  - **Amazon PA-API は未使用** … 利用条件が「直近30日以内に3件以上の適格販売」。実績を作るまで使えない。
  - **楽天の商品検索APIは未使用** … 2026年の仕様変更で秘密鍵 `accessKey` が必須になり、
    静的サイト（GitHub Pages）のフロントからは安全に呼べないため。
  - 結果として **APIキーが無くてもサイトは完全に動く**。API障害の影響も受けない。
- **アフィリエイトID**（設定済み / 2026-08-18）:
  Amazon アソシエイト `sippo79-22`、楽天アフィリエイトID `56aa006c.76706573.56aa006d.849ed47b`。
  どちらもアフィリエイトURLに必ず載る**公開前提の値**なので `affiliate-config.js` に置いてよい。
- **リンクの優先順位**（**直リンク → 検索リンク → 非表示** の3段階）:
  - Amazon: ①商品マスターの個別URL（既存の `amzn.to`）→ ②ASIN から `/dp/{ASIN}/ref=nosim?tag=` → ③キーワード検索
  - 楽天: ①商品マスターの個別URL（既存の `a.r10.to`）→ ②楽天市場の検索URL（IDがあれば `hb.afl.rakuten.co.jp` でラップ）
- **リンク切れ・販売終了へのフォールバック**（2026-08-18〜）:
  直リンク先が売り切れ・掲載終了になっても行き止まりにせず、**同じ商品の検索結果へ逃がす**。
  `status` で制御する（商品全体・ショップ単位のどちらにも書ける。ショップ側が優先）:

  | `status` | 動作 |
  |---|---|
  | `active` | 直リンクを優先。無ければ検索へ |
  | `search-only` | 検索リンクのみ（既定。`status` 未設定もこれ） |
  | `sold-out` / `discontinued` | 直リンクを捨てて**検索へフォールバック** |
  | `disabled` | 購入ボタンを一切出さない |
  | `preparing` / `paused` | 【旧仕様・互換維持】出さない。新規は `disabled` 推奨 |

  フォールバック時はボタン文言が自動で「〇〇で**探す**」に変わる（商品ページと誤認させない）。
- **`linkType`（ボタン文言の出し分け / 2026-08-18〜）**: 短縮URLの遷移先を実測して記録する。
  `exact`（商品詳細ページ）＝「〇〇で価格を見る」/ `search`（検索結果ページ）＝「〇〇で探す」。
  **未設定・不明は `search` 扱い**（安全側。「価格を見る」と言って検索結果を開かないため）。
  判定は全ショップ共通の `isExactLink()` に集約。フォールバック中は `linkType` に関わらず `search`。
  現状の実測値: **Amazon 25件・Yahoo 20件＝すべて `search`** / **楽天 17件＝すべて `exact`**。
- **リンク切れ診断**: `node scripts/check-affiliate-links.js`。
  登録済みの直リンクを実際に叩き、`正常 / 要確認 / リンク切れ` を一覧化する。
  **マスターは自動書き換えしない**（誤判定で正常な収益リンクを止めないため）。
  ★**楽天・Amazonは売り切れでも HTTP 200 を返す**ため、ステータスコードだけでは検知できない。
  本文の「現在こちらの商品は取扱いがありません」等も見て判定している（`SOLD_OUT_PATTERNS`）。
  売り切れを見つけたら、直リンクを `retiredUrl` に退避 → `url` を空にして `status: "sold-out"`。
- **導入済みサイト**: GPU GUIDE（GPU詳細）/ GAME PC GUIDE（ゲーム別25ページ）/
  PC BUILD CHECK（診断結果＋構成詳細75ページ）/ PC Builds Hub（投稿詳細）。
  PC相談は基盤の読み込みのみで、**相談メニュー・料金・申し込み導線は変更していない**。
- **クリック計測**: 既存GA4（`G-NDQ8GTKGHC`）に `affiliate_click` イベント。
  `product_id` / `product_name` / `shop` / `page` / `placement` / `link_url` / `page_path` を送る。
  `placement` で「どの位置のリンクが押されるか」を分析できる。
- **⚠️ 守るべきルール**:
  - **URLの追加・変更は `shared/affiliate/affiliate-master.json` だけを編集**する。各HTMLに直書きしない。
  - **`affiliate-config.js` に秘密情報を書かない**。Amazon の Secret Key、楽天の `accessKey` は
    フロントに置けない（必要になったら Supabase Edge Functions の環境変数へ）。
  - **価格をHTMLに固定表示しない**（古い価格が残る事故を防ぐ）。
  - **Amazon / 楽天の商品画像は使わない**。既存画像＋購入ボタンのみ。
  - **誤リンクするくらいならリンクを出さない**。商品を特定できない場合は非表示が正しい動作。
  - **リンク切れを自動判定で停めない**。Amazon/楽天はBot対策で 403 等を返すため、
    HTTPチェックだけでは確定できない。必ず目視確認してから手で `status` を変える。
  - **楽天の `pc=` / `m=` はエンコード回数に注意**。生の検索URLを1回だけ `encodeURIComponent` する
    （エンコード済みURLを再利用すると二重エンコードで検索結果が0件になる）。
  - **規約違反のスクレイピングはしない**。
- **広告表記**: 景表法のステマ規制・Amazonアソシエイト規約に対応し、
  親サイト＋子サイト105ページのフッターと購入ボタン直下に表示済み。

---

## 4. Supabase関連（PC構成投稿サイト `pc-builds-hub/` のみ）

- **用途**: 投稿一覧 / 詳細 / 投稿・編集 / ログイン / マイページ / Nice（いいね）/ 管理者機能
- **未設定時**: `posts.json` でフォールバック表示
- **設定ファイル**:
  - `supabase-config.js`（実値 / 接続情報）
  - `supabase-config.example.js`（雛形）
  - `supabase-*.sql`（スキーマ / シード / RLS）
- **セキュリティ**: **RLS（Row Level Security）前提**で設計。`supabase-*.sql` と整合させる。
  公開鍵（anon key）以外の秘密情報は**コミットしない**。
- **構築手順**: `pc-builds-hub/SETUP_SUPABASE.md`
- ⚠️ **触るときの注意**: 認証・投稿・Nice・管理者機能を壊さない。UI 変更時も `auth.js` 等が参照する `data-*` 属性 / id を消さない。ログイン復帰先フォールバック（`|| "index.html"`）を安易に書き換えない。

---

## 5. デザイン方針

- **基調**: 明るめ・親しみやすい・淡いブルー〜パープル系
- **フォント**: M PLUS Rounded 1c
- **UI**: 丸みのあるカード＋グラス UI
- **マスコット**: sippo（`assets/sippo/`）
- 補足: 子サイト本編（GPU GUIDE / PC BUILD CHECK / GAME PC GUIDE）は**ダーク UI**のものもある。各サイトの既存トーンに合わせ、既存デザインを壊さない。
- **SEO / OGP**: `meta description` / OGP / semantic HTML を維持。`canonical` / `og:url` / `sitemap.xml` を正式URLに合わせる。各 index.html は title / description / canonical / og一式（type,site_name,title,description,url,image,image:width,image:height,locale）/ Twitter Card 一式を揃える（基準 = gpu-guide）。**OGP画像に SVG は使わない**（SNSで表示されない）。png/jpg を使い、`og:image:width/height` は実画像の実寸に合わせる。
- **ブランド名**: pc-build-check の正式名は **「PC BUILD CHECK」**。かつて誤って混入していた **「ジサコ！」「AI自作PC構成チェック」は別サイトの名称であり、本サイトでは使用しない**（2026-06-30 に全削除済み）。game-pc-guide の正式名は **「GAME PC GUIDE」**（「GAME GUIDE」表記は誤り。2026-07-01 に親サイト内の表記ゆれを解消済み）。

---

## 6. 運用上の制約（重要）

- 静的 HTML/CSS/JS で運用（ビルドツールなし）。
- **新規課金サービス・有料 API は導入しない。** 従量課金が発生する変更は実装前に必ず事前確認。
- **決済機能・購入ボタン・カート機能は追加しない**（Stripe / PayPay 等不可）。
- **PC相談室で実際に申し込める導線は2つ**（2026-07-27〜）。①**500円ワンコイン相談＝主力**（申し込みフロー：シッポサイト→**Square決済リンク**（`https://square.link/u/f9NW4Ctc`）→決済完了後にGoogleフォーム（`https://forms.gle/KfEsjsgaL49My3gu5`）へ自動遷移→フォーム送信で受付完了。Googleフォームへの遷移はSquare側の設定に依存し、サイト側からGoogleフォームへ直接リンクはしない）。②**1,500円 ゲーム向けPC構成・購入相談＝サブプラン**（申し込みは**ココナラ商品ページ** `https://coconala.com/services/4240996` へ外部遷移のみ。決済・やり取りはココナラ側で完結し、サイト側は関与しない）。役割分けは 500円＝買うPCが1台決まっている人の購入前チェック / 1,500円＝まだ決まっていない人への構成提案。**申し込み先が商品ごとに違うため導線を混ぜない**。「中古PC探し代行（3,000円〜）」カードのみ**受付準備中**（ボタンは押せない「受付準備中」ラベル・申し込みリンクなし）。無料窓口は「申し込み前の事前問い合わせ」用で、メインCTAより目立たせない**補助導線**（小さめテキストリンク、Googleフォーム直リンクのまま）として配置。PC構成チェック・中古PC診断・購入相談は500円相談へ誘導。**サイト側に新規の決済機能・カートは実装しない**（Square側の既存決済リンクへ外部遷移させるのみ）。料金体系を勝手に変えない（準備中プランの受付開始・500円超の有料化・新サービス追加は事前確認）。
- **中古PC販売は未実施。** 古物商許可が必要な実販売は別途確認。
- PC環境に影響する操作（`npm install` / `git reset` / shell command 等）は事前確認。

---

## 7. 現在の課題 / 未対応（優先度付き）

優先度: **A=早めに対応 / B=できれば対応 / C=様子見・将来対応**

### 優先度A
- **実クリックの計上確認**（ユーザー側で実施）。公開後に実際にボタンを押し、
  Amazonアソシエイト / 楽天アフィリエイトの管理画面にクリックが計上されるかを一度確認する。
- **定期的なリンク切れチェック**: 月1回程度 `node scripts/check-affiliate-links.js` を実行し、
  `リンク切れ` / `要確認` を目視してから `status` を手で更新する。
- **Search Console に `https://sippo-pc.jp/sitemap.xml` を再送信**し、認識を確認する（インデックス化後の反映確認。ユーザー側で実施）。

### 優先度B
- **`pc-builds-hub` 専用 OGP 画像を作成して差し替え**。現在は親共通 `assets/ogp.png`（1200x630）を**暫定流用**中。
- **`pc-build-check/ogp.jpg` を 1200x630 に再書き出し**。現状の実寸は 1199x630（1px半端）。

### 優先度C
- 親サイト内リンクの**絶対パス / 相対パス混在を整理**（ディレクトリURLで統一する方針途上）。
- `shared/gpu/` `shared/templates/` の**今後の使い道を整理**（現在はほぼ空の将来用ディレクトリ）。
- ディレクトリ名の大文字小文字（特に `pc-builds-hub`）が GitHub Pages 上で一致しているか定期確認。
- PC相談室はサイト側に決済機能を実装していない（Square決済リンク／ココナラ商品ページへの外部遷移のみ）。500円・1,500円の2プランが受付中（※料金体系は運用方針であり、勝手に変更・有料化しない）。
- `pc-build-check/builds/*.html`（75件）・`game-pc-guide/games/*.html`（25件）の個別ページに、親サイトへの関連リンクが未追加（各生成スクリプト `generate-builds.ps1` / `Generate-StaticGames.ps1` 側の修正＋再生成が必要）。
- 親サイト `#consult` セクションは、ココナラ／X・Instagram DMの旧フローと `pc-consult/`（500円ワンコイン相談）が並存中。どちらを主導線にするかは今後ユーザー判断（2026-07-01 時点ではpc-consult導線を追加するのみで両方維持）。

### 解消済み（参考）
- ~~直下 sitemap.xml に子サイトが含まれていない~~ → **2026-06-30 解消**（インデックス化、上記「2. URL構成」参照）。
- ~~GPU GUIDE / PC BUILD CHECK の「関連サイト」が自分自身にリンクしていた（コピペミス）~~ → **2026-07-01 解消**（親サイトへのリンクに置換）。
- ~~game-pc-guide の関連サイトグリッドに親サイトへのリンクがなかった~~ → **2026-07-01 解消**。
- ~~親サイト内に「GAME GUIDE」表記が残存（正式名は「GAME PC GUIDE」）~~ → **2026-07-01 解消**。
- ~~pc-consult の500円ワンコイン相談がGoogleフォームへ直接遷移していた~~ → **2026-07-01 解消**（Square決済リンク経由に変更。決済完了後にGoogleフォームへ自動遷移する設定はSquare側で完了済み）。

---

## 8. 本番反映状況

GitHub Pages（本番）への反映状況。「本番反映済み」= 公開URLで確認済み。

| 項目 | 状況 |
|---|---|
| sitemapインデックス化 | ✅ 本番反映済み |
| meta / OGP / canonical 総点検 | ✅ 本番反映済み |
| 「ジサコ！」記述削除 | ✅ 本番反映済み |
| Search Console sitemap再送信 | ⏳ ユーザー側で未実施 |
| pc-builds-hub専用OGP | ❌ 未作成（親共通OGPを暫定流用中） |
| pc-build-check ogp.jpg の 1200x630 化 | ❌ 未対応 |
| pc-consult 500円相談のSquare決済リンク化 | ⏳ コミット・push待ち（本番未反映） |
| pc-consult 1,500円 ゲーム向けPC構成・購入相談（ココナラ導線）の追加 | ⏳ コミット・push待ち（本番未反映） |
| 共通アフィリエイト基盤 `shared/affiliate/` の実装 | ✅ 完了（push済み） |
| アフィリエイトID（Amazon / 楽天）の入力 | ✅ 完了（`sippo79-22` / 楽天ID 設定済み） |
| 楽天検索URLの二重エンコード修正 | ✅ 完了（push済み） |
| リンク切れ・販売終了フォールバック（`status` 拡張） | ✅ 完了 |
| リンク切れ診断 `scripts/check-affiliate-links.js` | ✅ 完了（手動実行・自動書き換えなし） |
| 楽天の売り切れ直リンク4件を検索フォールバック化 | ✅ 完了（rx9070 / rtx4080 / rx7700xt / rx7900xtx） |
| 診断スクリプトの本文判定（HTTP200の売り切れ検知） | ✅ 完了 |
| 実クリックの計上確認（管理画面） | ⏳ 公開後にユーザー側で確認 |
| 短縮URLの遷移先実測と `linkType` 付与（62件） | ✅ 完了（Amazon25・Yahoo20=search / 楽天17=exact） |
| ボタン文言の実態統一（exact=価格を見る / search=探す） | ✅ 完了（`isExactLink()` に共通化） |
| Amazon/Yahooを商品ページ直リンクへ貼り替え | ⏳ 任意（文言は実態に合ったので急ぎではない） |

---

## 9. 関連ドキュメント

- `README.md` — 各サイトの詳細・ディレクトリ構成・運用ルール
- `AI_WORK_LOG.md` — 作業履歴（修正のたびに追記）
- `pc-builds-hub/SETUP_SUPABASE.md` — Supabase 構築手順
