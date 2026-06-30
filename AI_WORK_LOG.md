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

## 2026-06-30 — pc-consult 申し込みセクションの見た目修正＋スマホ最適化

- **修正目的**: 申し込みセクションのステータスバッジ（「いま申し込めるのは 500円ワンコイン相談 です…」）が、PC・スマホで語句の途中改行や不自然な間延びを起こして崩れていたため修正。あわせて新しい申し込み導線（`.apply__main` / `.apply__presub` 等）の iPhone を含むスマホ表示を最適化する。**文言・導線の役割（500円のみ申し込み可・他は準備中・無料は補助）は変更なし、見た目のみ**。
- **変更ファイル**:
  - `pc-consult/style.css`（`.apply__status` の組み直し、レスポンシブ追記）
  - `pc-consult/index.html`（ステータス文言の微調整・マークアップ整理）
  - `AI_WORK_LOG.md`（本記録）
- **変更内容**:
  - **ステータスバッジ崩れの修正**: `.apply__status` を `display:inline-flex`（`<strong>` がフレックス子要素化して折り返さず間延びしていた原因）→ `display:block; text-align:center` のテキストブロックに変更。ドット（`.apply__status-dot`）は `inline-block` でテキスト先頭に配置。`word-break:keep-all` + `<strong>{white-space:nowrap}` で「500円ワンコイン相談」が語中改行しないように。角丸を pill（999px）→ 20px に変更し複数行でも自然な形に。
  - 文言を「いま申し込めるのは**500円ワンコイン相談**だけ。まずは気軽に相談できます。」に簡潔化（不要な空白を除去）。
  - **スマホ最適化（720px / 400px）**: `.apply__main`（白カード）・`.apply__main-price`・`.apply__main-desc`・`.apply__lead--guide`・`.apply__presub`・`.apply__presub-text` の余白とフォントサイズを段階的に縮小。補助リンクは狭い画面で `white-space:normal` にして溢れ防止。`.plan-button.is-disabled`（受付準備中ラベル）も小型スマホでサイズ調整。
- **影響範囲**: `pc-consult/` 申し込みセクションの見た目（CSS）とステータス文言のみ。**機能・導線・フォームURL・申し込み可否のロジックは不変**（500円のみ申し込み可、2,000/3,000円は準備中、無料は補助導線のまま）。決済・カート追加なし、Supabase非関与。他セクション・他サイトへの影響なし。
- **未対応・次にやること**:
  - 公開後、iPhone 実機（Safari）で申し込みセクションのバッジ・白カード・準備中ラベルの折り返しを目視確認推奨。
- **別AIへの引き継ぎ注意点**:
  - `.apply__status` は `inline-flex` に戻さない（`<strong>` がフレックス子要素になり再び崩れる）。テキストブロック＋インラインドットの構成を維持。
  - 今回は見た目調整のみ。500円のみ申し込み可・他プラン準備中・無料は補助導線という方針は不変。

## 2026-06-30 — pc-consult 申し込み導線を500円のみに限定（2,000/3,000円プランを準備中化・無料問い合わせを補助導線へ）

- **修正目的**: 前回修正後も、2,000円/3,000円プランの「このプランで相談する」ボタンと無料問い合わせボタンが申し込みボタンと同格に見え、ユーザーが迷う状態だった。**実際に申し込める導線を500円ワンコイン相談だけに絞る**。3カードはサービス紹介として残しつつ、2,000円/3,000円は準備中化。無料問い合わせは削除せず補助導線へ格下げ。決済・カートの新規追加なし、フォームURL変更なし。
- **変更ファイル**:
  - `pc-consult/index.html`（サービスカードのボタン3つ、申し込みセクションの構造）
  - `pc-consult/style.css`（`.plan-button.is-disabled` 追加、申し込みセクションの `.apply__main` / `.apply__lead--guide` / `.apply__presub` 系を追加）
  - `PROJECT_STATUS.md`（運用制約：申し込み可能なのは500円のみ・他プラン準備中・無料は補助導線、を明記）
  - `AI_WORK_LOG.md`（本記録）
- **変更内容**:
  - **500円プラン（ワンコイン購入前チェック）**: カードのボタンは有効のまま、文言を「このプランで相談する」→「500円ワンコイン相談に申し込む」に変更。リンク先は既存の500円フォーム（`forms.gle/KfEsjsgaL49My3gu5`）のまま。
  - **2,000円 / 3,000円プラン**: `<a href="#apply" class="btn btn--ghost ...">このプランで相談する</a>` を、押せないラベル `<span class="service-card__btn plan-button is-disabled" aria-disabled="true">受付準備中</span>` に置換。`#apply` への申し込みリンクを除去し、CSSで破線枠・カーソルdefault・`pointer-events:none` の「準備中ラベル」見た目に。
  - **申し込みセクション**: 旧・無料/500円の2カラム横並び比較（`apply__compare`）を廃止し、**上下関係**に再構成。メインに白カードの500円導線（`.apply__main` ＋ 主CTAボタン）→「500円相談からお願いします」の誘導文 → サブに**小さめの補助枠**（`.apply__presub`）で事前問い合わせ（無料）を**テキストリンク**として配置。500円相談と同格の大ボタンにはしない。
  - 旧 `.apply__compare` / `.apply__plan` / `.apply__free` / `.apply__actions--sub` のCSS定義は未使用だが破壊回避のため残置（HTMLからは参照を除去済み）。
- **影響範囲**: `pc-consult/` のサービスカードのボタンと申し込みセクションの表示・導線のみ。**決済・カート・購入ボタンの新規追加なし**、フォームURL（500円/無料）変更なし、Supabase非関与。新規CSSは単一カラム構成でスマホ可変高に追従、`service-card__btn` は従来通り `width:100%`・`min-height:48px` を維持しレイアウト崩れなし。他サイトへの影響なし。
- **未対応・次にやること**:
  - 2,000円/3,000円プランの受付を開始する際は、準備中ラベルを専用フォーム導線に差し替え（その際 `PROJECT_STATUS.md` の制約も更新）。
  - 公開後、スマホ実機で3カードのボタン高さ・申し込みセクションの上下関係を目視確認推奨。
  - 未使用化した `.apply__compare` 系CSSは、次回整理時に削除を検討（今回は安全側で残置）。
- **別AIへの引き継ぎ注意点**:
  - **申し込み可能な導線は500円ワンコイン相談だけ**。2,000円/3,000円は「受付準備中」ラベル（`aria-disabled="true"` / `pointer-events:none`）で、押せる申し込みボタンに戻さないこと。
  - **無料問い合わせは補助導線**（事前確認用）。500円相談と同格の大ボタンに戻さない。フォームURLは既存のまま維持。
  - 決済機能・カートは追加しない。500円相談は既存Googleフォーム受付であり新規課金実装ではない。

## 2026-06-30 — pc-consult 相談導線を「500円ワンコイン相談」に一本化／無料窓口を「事前問い合わせ」へ役割変更

- **修正目的**: `pc-consult/` で500円窓口と無料窓口の違いが分かりにくく「無料でいい」と迷われやすかったため、**メイン導線を500円ワンコイン相談に一本化**。無料窓口は削除せず、**「申し込み前の事前問い合わせ（確認用）」**に役割変更し、PC構成チェック・中古PC診断・購入相談は500円相談へ誘導する。決済・カートの新規追加はなし（文言と導線の整理のみ）。
- **変更ファイル**:
  - `pc-consult/index.html`（ヘッダーCTA / Heroボタン・注記 / 申し込みセクションのステータス・比較カード・無料導線文言・タイトル・リード / フッター / セクションコメント）
  - `pc-consult/main.js`（準備中プレースホルダーの alert 文言を「無料モニター」→「500円ワンコイン相談」に更新。※現状この alert は発火する `.apply a[href="#"]` が無く実質非表示）
  - `pc-consult/style.css`（コメント1行のみ。スタイル定義の変更なし）
  - `PROJECT_STATUS.md`（URL構成表のpc-consult役割、運用制約のPC相談室の扱いを現方針に更新）
  - `AI_WORK_LOG.md`（本記録）
- **変更内容**:
  - メインCTA（ヘッダー・Hero・申し込みボタン）を「500円ワンコイン相談」に統一。Hero注記・申し込みステータスを「500円ワンコイン相談 受付中」に変更。
  - 申し込みセクションの比較カードを **「事前問い合わせ（無料）＝申し込み前の確認用」/「500円ワンコイン相談＝構成チェック・中古PC診断・購入相談・買い判断」** に書き換え。無料側は「PC構成チェック・中古PC診断・購入相談は対象外（500円相談へ）」を明記。
  - 無料フォームへのボタン文言を「無料相談はこちら」→「事前問い合わせ（無料）はこちら」に変更（**リンク先URLは既存のまま**：500円=`forms.gle/KfEsjsgaL49My3gu5`、無料=既存Googleフォーム）。
  - フッター文言・HTMLコメントも新方針に合わせて更新。やわらかく安心感のあるトーン（「気軽に」「買う前の不安を減らす」）を維持し、「無料では見ません」等の冷たい表現は不使用。
- **影響範囲**: `pc-consult/` の表示テキストと導線整理のみ。**決済・カート・購入ボタンの新規追加なし**、フォームURLの変更なし、Supabase 非関与（pc-consultはSupabase未使用）。レイアウト崩れなし（CSSクラスは既存のまま、テキスト量増は可変高で吸収）。他子サイト・親サイトへの影響なし。
- **未対応・次にやること**:
  - 公開後、無料フォーム（Googleフォーム）側の説明文も「事前問い合わせ」用にユーザー側で調整推奨（フォーム本文はサイト外のため未編集）。
  - 「ゲーミングPC構成相談（2,000円〜）」「中古PC探し代行（3,000円〜）」カードのCTAは現状 `#apply`（申し込みセクション内アンカー）。受付開始時に専用フォームへ差し替え。
- **別AIへの引き継ぎ注意点**:
  - **無料窓口は「事前問い合わせ（申し込み前の確認用）」**。具体的なPC構成チェック・中古PC診断・購入相談は **500円ワンコイン相談**へ誘導する役割分担を崩さないこと。
  - **決済機能・カートは追加しない**。500円相談は既存のGoogleフォーム受付であり、新規の有料化・課金実装ではない。料金体系を勝手に変えない。
  - フォームURL（500円/無料）は既存のものを維持。差し替える場合は両方の導線を確認。

## 2026-06-30 — PROJECT_STATUS の作業前チェックリスト追加と未対応タスク整理

- **修正目的**: 別AI・今後の作業者が事故らないよう、`PROJECT_STATUS.md` に作業前チェックリストを追加。あわせて未対応タスクを優先度付きに整理し、本番反映状況が一目で分かる欄を新設する（ドキュメント整備のみ）。
- **変更ファイル**:
  - `PROJECT_STATUS.md`
  - `AI_WORK_LOG.md`（本記録の追記）
- **変更内容**:
  - `PROJECT_STATUS.md` 冒頭に **「0. 作業前チェックリスト」** を新設（git status 確認 / 対象ファイルを読んでから修正 / HTML・CSS・JS・JSON は通常修正可 / `npm install`・`pip install`・`git reset`・VSCode拡張変更・PC環境影響コマンドは事前確認 / Supabase の RLS・auth・`data-*`・id を壊さない / OGPにSVGを使わない / canonical・og:url・sitemap は正式URL / 修正後は AI_WORK_LOG へ記録 / 仕様変更時は PROJECT_STATUS も更新）。
  - 「7. 現在の課題 / 未対応」を **優先度付き（A/B/C）に再整理**。A=Search Console 再送信、B=pc-builds-hub 専用OGP作成・pc-build-check ogp.jpg の 1200x630 化、C=親サイト内リンクの絶対/相対パス整理・`shared/gpu`/`shared/templates` の用途整理 など。既存項目は消さず再配置。
  - 「8. 本番反映状況」を新設（sitemapインデックス化・meta/OGP/canonical総点検・「ジサコ！」削除＝本番反映済み、Search Console 再送信＝ユーザー側未実施、pc-builds-hub専用OGP・pc-build-check ogp.jpg 1200x630化＝未対応）。
  - 旧「8. 関連ドキュメント」は **「9. 関連ドキュメント」** に繰り下げ。
- **影響範囲**: **ドキュメントのみ**。サイト本体の HTML/CSS/JS/JSON・公開挙動・デザイン・Supabase 機能には一切影響なし。
- **未対応・次にやること**:
  - 優先度A: Search Console に `https://sippo-pc.jp/sitemap.xml` を再送信（ユーザー側）。
  - 優先度B: pc-builds-hub 専用 OGP 画像（1200x630 png/jpg）作成・差し替え／ pc-build-check の `ogp.jpg` を 1200x630 に再書き出し。
  - 優先度C: 親サイト内リンクの絶対/相対パス整理、`shared/gpu`・`shared/templates` の用途整理。
- **別AIへの引き継ぎ注意点**:
  - 修正前に **`PROJECT_STATUS.md` の「0. 作業前チェックリスト」を必ず確認**する。
  - 課題に着手・解消したら、「7. 現在の課題」と「8. 本番反映状況」の両方を更新して整合を保つこと。

## 2026-06-30 — 主要ページの meta/OGP/canonical 総点検＋別サイト記述「ジサコ！」の全削除

- **修正目的**:
  1. 主要6ページ（親 / pc-consult / pc-builds-hub / gpu-guide / pc-build-check / game-pc-guide）の title・description・OGP・canonical・Twitter Card を総点検し、SNS表示とタグ完成度を統一。
  2. **pc-build-check に誤って混入していた別サイト「ジサコ！」「AI自作PC構成チェック」の記述をサイト全体から完全削除**し、自サイト名「PC BUILD CHECK」に統一。
- **変更ファイル**:
  - `pc-build-check/index.html`（og:title / og:site_name / twitter:title / apple-mobile-web-app-title / JSON-LD name 置換、alternateName 削除、title 自サイト名化、og:image:width 実寸1199へ）
  - `pc-build-check/manifest.json`（name/short_name）, `pc-build-check/sw.js`（コメント）
  - `pc-build-check/generate-builds.ps1` と **リポジトリ直下 `generate-builds.ps1`**（どちらも builds 生成元。og:site_name を修正）
  - `pc-build-check/builds/*.html` **75件**（og:site_name 一括置換、生成元と一致）
  - `pc-builds-hub/index.html`（og:image/twitter:image を SVG→`assets/ogp.png`、twitter:card/title/description・og:locale・og:image:width/height 追加）
  - `index.html`・`pc-consult/index.html`（og:image:width/height・og:locale・twitter:title/description/image 追加）
  - `game-pc-guide/index.html`（og:locale・og:image:width/height=1200x800 追加）
- **変更内容**: 「ジサコ！」は**別サイト**（ユーザーのサイトではない）と判明したため、HTML/JSON/JS/PS1 から全除去（残存0件を確認）。あわせて全6ページの不足タグを、完成度の高い gpu-guide を基準に補完。OGP画像はSVGを廃止し、各ページ実在の png/jpg に統一、実寸に合わせて width/height を宣言（親/pc-consult/pc-builds-hub=1200x630、game-pc-guide=1200x800、pc-build-check=1199x630）。
- **影響範囲**: 各ページの `<head>` メタ情報・SNSシェア表示・PWA表示名・構造化データ。本文表示・機能ロジックには影響なし。検証済み: 全サイトで「ジサコ／AI自作PC構成チェック」0件、OGPにSVG不使用、manifest.json・JSON-LD ともに妥当、各ページ title/og/twitter のブランド名が1種に整合。
- **未対応・次にやること**:
  - pc-builds-hub の OGP は親共通 `assets/ogp.png` を**暫定流用**。後日 pc-builds-hub 専用 OGP 画像（1200x630 png/jpg）を作成して差し替え。
  - pc-build-check の ogp.jpg は実寸 1199x630（1px半端）。気になる場合は 1200x630 に再書き出し。
  - 公開後、Twitter Card Validator / OGP確認ツールで pc-builds-hub・pc-build-check を確認推奨。
- **別AIへの引き継ぎ注意点**:
  - **「ジサコ！」は別サイトの名称。今後サイトに復活させない。** pc-build-check の正式名は「PC BUILD CHECK」。
  - builds サブページは `generate-builds.ps1`（pc-build-check 配下版が最新／直下にも旧版あり、両方修正済み）で生成。手編集すると再生成で戻るため、文言変更は**生成スクリプト側**を直すこと。
  - OGP画像に **SVGは使わない**（SNSで表示されない）。png/jpg を使い、og:image:width/height は実寸に合わせる。

## 2026-06-30 — sitemap 変更を本番（GitHub Pages）へデプロイ・公開確認

- **修正目的**: 上記 sitemap インデックス化を本番反映し、公開URLで動作確認する。
- **変更ファイル**: なし（既存コミットの push のみ）。
- **変更内容**:
  - `git pull --rebase` でリモートの先行コミット（GitHub 直アップロード分）上に作業を載せ替え、`main` へ push。
  - push 時に GitHub のメールプライバシー保護（GH007）で一度拒否。コミット author を実メール → リポジトリ既存と同じ noreply（`284007883+Sippo79@users.noreply.github.com`）に付け替えて再 push し成功。
- **影響範囲**: 本番公開（GitHub Pages）。公開URLで以下を確認済み:
  - `https://sippo-pc.jp/sitemap.xml` … HTTP 200・`<sitemapindex>`・子 sitemap 5本を参照
  - `https://sippo-pc.jp/sitemap-main.xml` … HTTP 200・親 + pc-consult の2URL
  - `https://sippo-pc.jp/robots.txt` … `Sitemap: https://sippo-pc.jp/sitemap.xml` を指す
  - 参照先5 sitemap すべて HTTP 200（リンク切れなし）
- **未対応・次にやること**:
  - Google Search Console に `https://sippo-pc.jp/sitemap.xml` を再送信（ユーザー側で実施予定）。
- **別AIへの引き継ぎ注意点**:
  - このリポジトリへ push する際は、コミット author メールを **noreply（`...@users.noreply.github.com`）** にすること。実メールだと GH007 で push 拒否される。
  - `git config user.email "284007883+Sippo79@users.noreply.github.com"` をリポジトリローカルに設定済み。

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
