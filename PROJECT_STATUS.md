# PROJECT_STATUS — sippo-pc.jp 現状スナップショット

> このファイルは **サイト全体の現状・仕様** を 1 枚にまとめたもの。
> 詳細な各サイト解説・運用ルールは `README.md` を参照。作業履歴は `AI_WORK_LOG.md`。
> **URL構成 / 使用技術 / Supabase関連 / デザイン方針 / 現在の課題** が変わったら必ず更新する。

最終更新: 2026-06-30（sitemap インデックス化）

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
| シッポPC相談室 | https://sippo-pc.jp/pc-consult/ | PC購入前チェック・構成相談の**無料モニター受付** | `pc-consult/` |
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
- **申し込み導線**: PC相談室は **Googleフォーム**へ誘導（決済なし）
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
- **SEO**: `meta description` / OGP / semantic HTML を維持。`canonical` / `og:url` / `sitemap.xml` を正式URLに合わせる。

---

## 6. 運用上の制約（重要）

- 静的 HTML/CSS/JS で運用（ビルドツールなし）。
- **新規課金サービス・有料 API は導入しない。** 従量課金が発生する変更は実装前に必ず事前確認。
- **決済機能・購入ボタン・カート機能は追加しない**（Stripe / PayPay 等不可）。
- **PC相談室は「無料モニター・受付準備中」**として扱う。文言を勝手に有料化しない。
- **中古PC販売は未実施。** 古物商許可が必要な実販売は別途確認。
- PC環境に影響する操作（`npm install` / `git reset` / shell command 等）は事前確認。

---

## 7. 現在の課題 / 未対応

- ~~直下 sitemap.xml に子サイトが含まれていない~~ → **2026-06-30 解消**（インデックス化、上記「2. URL構成」参照）。公開後に Search Console で再送信・認識確認を推奨。
- ディレクトリ名の大文字小文字（特に `pc-builds-hub`）が GitHub Pages 上で一致しているか定期確認。
- 親サイト内リンクに絶対パスと相対パスが混在。ディレクトリURLで統一する方針途上。
- PC相談室は決済未実装（Googleフォーム誘導のみ）。正式有料受付は未開始。
- `shared/gpu/` `shared/templates/` は将来用でほぼ空。

---

## 8. 関連ドキュメント

- `README.md` — 各サイトの詳細・ディレクトリ構成・運用ルール
- `AI_WORK_LOG.md` — 作業履歴（修正のたびに追記）
- `pc-builds-hub/SETUP_SUPABASE.md` — Supabase 構築手順
