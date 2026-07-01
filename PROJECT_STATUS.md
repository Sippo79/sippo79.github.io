# PROJECT_STATUS — sippo-pc.jp 現状スナップショット

> このファイルは **サイト全体の現状・仕様** を 1 枚にまとめたもの。
> 詳細な各サイト解説・運用ルールは `README.md` を参照。作業履歴は `AI_WORK_LOG.md`。
> **URL構成 / 使用技術 / Supabase関連 / デザイン方針 / 現在の課題** が変わったら必ず更新する。

最終更新: 2026-07-01（pc-consult 500円ワンコイン相談をSquare決済リンク経由に変更）

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
| シッポPC相談室 | https://sippo-pc.jp/pc-consult/ | PC購入前チェック・構成相談。**メイン窓口＝500円ワンコイン相談**（申し込みはSquare決済リンク→決済完了後にGoogleフォームへ自動遷移→フォーム送信で受付完了。無料窓口は申し込み前の事前問い合わせ用） | `pc-consult/` |
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
- **アフィリエイト**: `shared/affiliate/affiliate-master.json` 等で管理

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
- **PC相談室で実際に申し込める導線は「500円ワンコイン相談」のみ**（申し込みフロー：シッポサイト→**Square決済リンク**（`https://square.link/u/f9NW4Ctc`）→決済完了後にGoogleフォーム（`https://forms.gle/KfEsjsgaL49My3gu5`）へ自動遷移→フォーム送信で受付完了。Googleフォームへの遷移はSquare側の設定に依存し、サイト側からGoogleフォームへ直接リンクはしない）。サービス紹介の「ゲーミングPC構成相談（2,000円〜）」「中古PC探し代行（3,000円〜）」カードは**受付準備中**（ボタンは押せない「受付準備中」ラベル・申し込みリンクなし）。無料窓口は「申し込み前の事前問い合わせ」用で、メインCTAより目立たせない**補助導線**（小さめテキストリンク、Googleフォーム直リンクのまま）として配置。PC構成チェック・中古PC診断・購入相談は500円相談へ誘導。**サイト側に新規の決済機能・カートは実装しない**（Square側の既存決済リンクへ外部遷移させるのみ）。料金体系を勝手に変えない（準備中プランの受付開始・500円超の有料化・新サービス追加は事前確認）。
- **中古PC販売は未実施。** 古物商許可が必要な実販売は別途確認。
- PC環境に影響する操作（`npm install` / `git reset` / shell command 等）は事前確認。

---

## 7. 現在の課題 / 未対応（優先度付き）

優先度: **A=早めに対応 / B=できれば対応 / C=様子見・将来対応**

### 優先度A
- **Search Console に `https://sippo-pc.jp/sitemap.xml` を再送信**し、認識を確認する（インデックス化後の反映確認。ユーザー側で実施）。

### 優先度B
- **`pc-builds-hub` 専用 OGP 画像を作成して差し替え**。現在は親共通 `assets/ogp.png`（1200x630）を**暫定流用**中。
- **`pc-build-check/ogp.jpg` を 1200x630 に再書き出し**。現状の実寸は 1199x630（1px半端）。

### 優先度C
- 親サイト内リンクの**絶対パス / 相対パス混在を整理**（ディレクトリURLで統一する方針途上）。
- `shared/gpu/` `shared/templates/` の**今後の使い道を整理**（現在はほぼ空の将来用ディレクトリ）。
- ディレクトリ名の大文字小文字（特に `pc-builds-hub`）が GitHub Pages 上で一致しているか定期確認。
- PC相談室は決済未実装（Googleフォーム誘導のみ）。正式有料受付は未開始（※運用方針であり、勝手に有料化しない）。
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

---

## 9. 関連ドキュメント

- `README.md` — 各サイトの詳細・ディレクトリ構成・運用ルール
- `AI_WORK_LOG.md` — 作業履歴（修正のたびに追記）
- `pc-builds-hub/SETUP_SUPABASE.md` — Supabase 構築手順
