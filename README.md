# Sippo PC Sites

シッポ（Sippo）は、**PC初心者のPC選びをサポートする**ためのサイト群です。
PC構成診断・GPU比較・ゲーム別おすすめPC・PC構成投稿・PC購入相談室などを 1 つのリポジトリにまとめ、
シッポ親サイトを入口（ポータル）として各サイトへ移動できる構成にしています。

- 公開ドメイン: <https://sippo-pc.jp/>
- 公開方法: **GitHub Pages**（`sippo79.github.io` リポジトリ）
- 構成: ビルドツールなしの **静的 HTML / CSS / JavaScript**
- このリポジトリが**メインの運用場所**です。使わなくなった旧リポジトリはアーカイブ済み。

> 🐾 開発の前提・デザイン・SEO ルールは [`claide.md`](claide.md) も参照してください。

---

## 1. 公開 URL 一覧

| サイト | URL | 役割 |
|---|---|---|
| シッポ親サイト | <https://sippo-pc.jp/> | 各子サイト・サービスへのポータル（入口） |
| シッポPC相談室 | <https://sippo-pc.jp/pc-consult/> | PC購入前チェック・構成相談の **無料モニター受付**ページ |
| PC構成投稿サイト | <https://sippo-pc.jp/pc-builds-hub/> | ユーザーのPC構成の投稿・閲覧サイト |
| GPU GUIDE | <https://sippo-pc.jp/gpu-guide/> | GPU性能・価格帯・用途別の比較サイト |
| PC BUILD CHECK | <https://sippo-pc.jp/pc-build-check/> | 予算・用途・解像度からPC構成を診断するサイト |
| GAME PC GUIDE | <https://sippo-pc.jp/game-pc-guide/> | ゲーム別におすすめPC構成を探せるサイト |

> ⚠️ **要確認（ディレクトリ名の大文字小文字）**
> ローカルでは PC構成投稿サイトのフォルダが `PC-builds-hub/`（先頭が大文字）で見えていますが、
> 公開 URL は小文字 `/pc-builds-hub/` です。GitHub Pages（Linux）は大文字小文字を区別するため、
> **リポジトリ上のディレクトリ名が `pc-builds-hub`（小文字）になっているか**を確認してください。
> 一致していないと `/pc-builds-hub/` が 404 になります。

---

## 2. ディレクトリ構成

実際のファイル構成（主要部分）です。存在するものだけを記載しています。

```
/
├─ index.html              # シッポ親サイト（ポータル）
├─ style.css               # 親サイト用スタイル
├─ script.js               # 親サイト用スクリプト
├─ sw.js                   # 親サイト用 Service Worker（PWA）
├─ manifest.json
├─ favicon.png
├─ llms.txt / robots.txt / sitemap.xml
├─ claide.md               # プロジェクトの開発ルール
│
├─ pc-consult/             # シッポPC相談室（無料モニター受付）
├─ pc-builds-hub/          # PC構成投稿サイト（Supabase連携アプリ）※フォルダ名の大小は上記「要確認」参照
├─ gpu-guide/              # GPU GUIDE
├─ pc-build-check/         # PC BUILD CHECK
├─ game-pc-guide/          # GAME PC GUIDE
│
├─ assets/                 # 親サイト共通画像（マスコット sippo/、アイコン、OGP）
├─ shared/                 # サイト横断の共有データ（affiliate/ など）
└─ tools/                  # 画像生成などの開発用 PowerShell スクリプト
```

補足:
- `shared/` 内は `affiliate/`（`affiliate-master.json` ほか）が中身あり。`shared/gpu/`・`shared/templates/` は現状ほぼ空（将来用）。
- 各子サイトは基本的に `index.html` / `style.css` / `script.js`（または `main.js`）と、データ用 `*.json`、SEO 用 `robots.txt` / `sitemap.xml` / `llms.txt` を持つ独立サイト構成です。

---

## 3. 各サイトの概要

### シッポ親サイト（`/`）
- **目的**: 各子サイト・サービスへの入口となるポータル。
- **主な機能**: サービス紹介カード、PC相談室・PC構成投稿サイトへの導線、ロードマップ表示。
- **主なファイル**: `index.html` / `style.css` / `script.js` / `sw.js`。
- **注意点**: 各子サイトへのリンクは絶対パス（`https://sippo-pc.jp/.../`）と相対パス（`/pc-consult/` など）が混在。ディレクトリ URL（`index.html` なし）で統一する方針。

### シッポPC相談室（`/pc-consult/`）
- **目的**: PC購入前チェック・構成相談の受付。
- **主な機能**: サービス説明、相談の流れ、**Google フォームによる無料モニター申し込み**導線、相談テンプレ。
- **主なファイル**: `pc-consult/index.html` / `main.js` / `style.css`。
- **注意点**: 現在は **無料モニター・受付準備中**（正式な有料受付は未開始）。決済は未実装で、申し込みは Google フォームへ誘導するのみ。文言を「有料受付中」に変えないこと。

### PC構成投稿サイト（`/pc-builds-hub/`）
- **目的**: ユーザーが自分のPC構成を投稿し、他の人の構成を閲覧・参考にできる投稿サイト。
- **主な機能**: 投稿一覧 / 投稿詳細 / 投稿・編集 / ログイン / マイページ / Nice（いいね）/ 管理者機能。**Supabase 連携**で動作（未設定時は `posts.json` でフォールバック表示）。
- **主なファイル**:
  - 画面: `index.html`（トップ）, `all-posts.html`（一覧）, `post.html`（詳細）, `submit.html` / `edit.html`（投稿・編集）, `login.html`, `mypage.html`, `admin.html`, `rls-test.html`（RLS検証用）
  - ロジック: `api.js`（データ取得/Supabase）, `auth.js`（認証）, `main.js`, `post.js`, `submit.js`, `edit.js`, `login.js`, `mypage.js`, `admin.js`
  - 設定/データ: `supabase-config.js`（実値）, `supabase-config.example.js`（雛形）, `posts.json`（フォールバック）, `supabase-*.sql`（スキーマ/シード/RLS）
  - その他: `sw.js` / `sw-register.js`（PWA）, `manifest.json`, `generate-sitemap.js` / `.ps1`, `SETUP_SUPABASE.md`（構築手順）
- **⚠️ 触るときの注意（重要）**:
  - **Supabase 連携・ログイン・投稿・Nice・管理者機能を壊さないこと。** UI 変更時も `data-*` 属性や id（`auth.js` などが参照）を消さない。
  - `supabase-config.js` には接続情報が入る。**公開鍵（anon key）以外の秘密情報をコミットしない。** RLS（Row Level Security）前提で設計されているため、`supabase-*.sql` と整合させる。
  - ログイン復帰先の計算（`auth.js` / `main.js` / `post.js` の `|| "index.html"` フォールバック）は機能上の保険。安易に書き換えない。
  - 詳細なセットアップは `pc-builds-hub/SETUP_SUPABASE.md` を参照。

### GPU GUIDE（`/gpu-guide/`）
- **目的**: GPU の性能・価格帯・用途別比較。
- **主な機能**: GPU 一覧/詳細、解像度別ランキング、相性 CPU 表示。アフィリエイトリンク対応。
- **主なファイル**: `index.html`, `gpu.html`, `gpu-detail.js`, `script.js`, データ `gpus.json` / `cpu-recommendations.json`, `affiliate-links.js` / `affiliate-master.json`。
- **注意点**: データは JSON 駆動。`generate-sitemap.ps1` で sitemap を更新。

### PC BUILD CHECK（`/pc-build-check/`）
- **目的**: 予算・用途・解像度からおすすめ構成を診断。
- **主な機能**: 条件選択 → 構成診断、構成詳細表示。
- **主なファイル**: `index.html`, `script.js`, データ `builds.json` + `builds/`, `builds.css`, 生成 `generate-builds.ps1`。
- **注意点**: 構成データは `builds.json` / `builds/` を編集。診断ロジックと JSON の整合に注意。

### GAME PC GUIDE（`/game-pc-guide/`）
- **目的**: 遊びたいゲームから必要スペック・おすすめ構成を逆引き。
- **主な機能**: ゲーム一覧/詳細、必要スペック表示。オフライン対応（`offline.html`）。
- **主なファイル**: `index.html`, `game.html`, `game.js`, `script.js`, データ `games/` / `data/`, `Generate-StaticGames.ps1`, `game-affiliate.js`。
- **注意点**: ゲームページは PowerShell スクリプトで静的生成する運用。手書き編集と再生成の重複に注意。

---

## 4. 運用ルール

- 基本は **静的 HTML / CSS / JavaScript** で運用する（ビルドツールなし）。
- **新規課金サービスや有料 API は導入しない。**
- **API 利用料・従量課金が発生する変更は、実装前に必ず事前確認する。**
- **決済機能・購入ボタン・カート機能は現時点では追加しない**（Stripe / PayPay 等も不可）。
- **PC相談室は、正式な有料受付前の「無料モニター・受付準備中」**として扱う（文言・導線を勝手に有料化しない）。
- **中古PC販売はまだ行っていない。**
- **古物商許可が必要になる実販売は、別途確認してから進める。**
- PC環境に影響する操作（`npm install` / `pip install` / shell command / `git reset` / VSCode 拡張変更 など）は事前確認（`claide.md` 準拠）。

---

## 5. 開発メモ

- **デザイン基調**: 明るめ・親しみやすい・淡いブルー〜パープル系。フォントは **M PLUS Rounded 1c**、丸みのあるカード＋グラス UI を基本にする。既存デザインを壊さない。
  - 補足: 子サイト本編（GPU GUIDE / PC BUILD CHECK / GAME PC GUIDE）はダーク UI のものもある。各サイトの既存トーンに合わせる。
- **ポータル設計**: シッポ親サイトは各子サイトへの導線を持つ入口として扱う。
- **相談導線**: 子サイト間にも、必要に応じて **PC相談室（`/pc-consult/`）への導線**を設置する（現状、親・GPU GUIDE・PC BUILD CHECK・GAME PC GUIDE・PC構成投稿サイトに設置済み）。
- **URL 統一**: できるだけ `index.html` なしの**ディレクトリ URL** に統一する（例: `/pc-builds-hub/`, `/pc-consult/`）。サイト内リンクも同方針。ただし実ファイル `index.html` は残し、`/.../index.html` でもアクセスできる状態を維持する。
- **SEO**: `canonical` / `og:url` / `sitemap.xml` は正式 URL（ディレクトリ URL）に合わせる。`meta description` / OGP / semantic HTML を維持。

---

## 6. 更新履歴（直近）

- PC相談室を `/pc-consult/` で公開。
- Google フォームによる**無料モニター受付導線**を追加。
- 親サイト・GPU GUIDE・PC BUILD CHECK・GAME PC GUIDE から**PC相談室への導線**を追加。
- 親サイトに**PC構成投稿サイトへの導線**を追加。
- PC構成投稿サイトの正規 URL を `/pc-builds-hub/` に統一（`canonical` / `og:url` 追加、サイト内リンクをディレクトリ URL 化）。
- 使わなくなった**旧リポジトリをアーカイブ**し、本リポジトリをメインの運用場所に集約。

---

## 7. このリポジトリで作業する AI / 開発者へ

- 変更は基本 HTML/CSS/JS/JSON の範囲。**課金・決済・販売に関わる変更は実装前に必ず確認**を取る。
- `pc-builds-hub/` は Supabase 連携アプリのため、**認証・投稿・Nice・管理者まわりの動作を壊さない**こと（上記「3. 各サイトの概要」参照）。
- 迷ったら断定せず「要確認」として残す。`claide.md` の開発・デザイン・SEO ルールに従う。
