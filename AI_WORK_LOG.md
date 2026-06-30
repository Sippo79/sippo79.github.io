# AI_WORK_LOG — sippo-pc.jp 作業ログ

> sippoサイトを修正したら、このファイルに**新しい記録を上（最新が上）に**追記する。
> サイト全体の状態・仕様（URL構成 / 使用技術 / Supabase関連 / デザイン方針 / 現在の課題）が
> 変わった場合は `PROJECT_STATUS.md` も更新すること。
>
> 各記録は以下のテンプレートに従う:
>
> ```
> ## YYYY-MM-DD — <タイトル>
> - **修正目的**:
> - **変更ファイル**:
> - **変更内容**:
> - **影響範囲**:
> - **未対応・次にやること**:
> - **別AIへの引き継ぎ注意点**:
> ```

---

## 2026-06-30 — sitemap をインデックス化して全子サイトを網羅

- **修正目的**: リポジトリ直下 `sitemap.xml` が親サイトと `/pc-consult/` の 2URL のみで、gpu-guide / pc-build-check / game-pc-guide / pc-builds-hub が検索エンジンに伝わっていなかったため、全サイトを網羅させる。
- **変更ファイル**:
  - `sitemap.xml`（直下・書き換え）
  - `sitemap-main.xml`（新規）
  - `robots.txt`（直下・整理）
- **変更内容**:
  - 直下 `sitemap.xml` を **サイトマップインデックス**（`<sitemapindex>`）化。`sitemap-main.xml` + 各子サイトの既存 sitemap（gpu-guide / pc-build-check / game-pc-guide / pc-builds-hub）の計5本を束ねた。
  - 親サイトと `/pc-consult/` の URL は新規 `sitemap-main.xml` に移管（旧 sitemap.xml の内容を継承、lastmod を 2026-06-30 に更新）。
  - 各子サイトは元から個別ページまで網羅した詳細 sitemap.xml を持っていたため、インデックスから参照する形にして **URL重複を回避**。
  - 直下 `robots.txt` の `Sitemap:` 宣言を、インデックス1本（`https://sippo-pc.jp/sitemap.xml`）に整理（従来は子サイト sitemap を個別宣言、かつ pc-builds-hub が抜けていた）。子サイトの個別 robots.txt はクロール制御としてそのまま維持。
- **影響範囲**: SEO（クローラのサイトマップ発見）。HTML/CSS/JS の挙動・表示には影響なし。検証済み: 全6 sitemap が整形式XML / canonical（全て末尾スラッシュ付きディレクトリURL）と sitemap トップURLが一致 / 大文字・ドメイン・パスの表記揺れなし / 参照先ファイルは全て実在（GitHub Pages の大文字小文字区別に適合）。
- **未対応・次にやること**:
  - 公開後、Google Search Console に `https://sippo-pc.jp/sitemap.xml` を（再）送信して認識を確認。
  - pc-builds-hub / gpu-guide / pc-build-check 等の sitemap は生成スクリプト（`generate-sitemap.ps1` 等）由来。今後ページ追加時はスクリプト再実行で各 sitemap を更新（インデックス側は通常変更不要）。
- **別AIへの引き継ぎ注意点**:
  - 直下 `sitemap.xml` は **インデックス**。実URLを足すファイルではない。親サイト/pc-consult の URL を増やすときは `sitemap-main.xml` を編集する。
  - 子サイトのページURLは各子サイト配下の sitemap.xml（多くは自動生成）に入る。手編集する場合は生成スクリプトとの二重管理に注意。
  - robots.txt の `Sitemap:` はインデックス1本に集約済み。子サイト sitemap を robots に個別宣言で戻さないこと（インデックスが既に束ねている）。

## 2026-06-30 — 作業ログ / プロジェクトステータスの運用開始

- **修正目的**: 複数AI（Claude / GPT 等）での引き継ぎ運用のため、作業履歴とプロジェクト現状を文書化する仕組みを導入。
- **変更ファイル**: `AI_WORK_LOG.md`（新規）, `PROJECT_STATUS.md`（新規）
- **変更内容**:
  - `AI_WORK_LOG.md` を新規作成。追記テンプレート（日付/修正目的/変更ファイル/変更内容/影響範囲/未対応/引き継ぎ注意点）を定義。
  - `PROJECT_STATUS.md` を新規作成。現状の URL構成・使用技術・Supabase関連・デザイン方針・運用制約・現在の課題を `README.md` を基に整理。
- **影響範囲**: ドキュメントのみ。サイトの HTML/CSS/JS/JSON や公開挙動への影響なし。
- **未対応・次にやること**:
  - `sitemap.xml`（直下）が親サイトと `/pc-consult/` のみ。他子サイトの追加を検討。
  - 親サイト内リンクの絶対/相対パス混在をディレクトリURLへ統一。
- **別AIへの引き継ぎ注意点**:
  - 以降、sippoサイトを修正したら**必ず**このファイルへ追記し、仕様変更時は `PROJECT_STATUS.md` も更新する。
  - 詳細仕様・各サイトの注意点は `README.md`、Supabase は `pc-builds-hub/SETUP_SUPABASE.md` を正とする。
