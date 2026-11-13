# shared/analytics — SippoPC の GA4 計測

全サービス共通の Google Analytics 4 計測です。**測定IDと送信条件は `sippo-analytics.js` の1か所だけ**で管理します。

- 測定ID: `G-NDQ8GTKGHC`（従来から使っているプロパティ。2026-11-13 に一度 `G-M8SF678NH0` へ切り替えたが、旧プロパティのデータを使うため同日に元へ戻した。`G-M8SF678NH0` はどこにも使っていない）
- 各ページの `<head>` に書くのはこの1行だけ（gtag.js のタグを直接書かない）:

```html
<!-- Google Analytics 4（測定ID・送信条件は /shared/analytics/sippo-analytics.js に集約） -->
<script src="/shared/analytics/sippo-analytics.js"></script>
```

生成スクリプト（`gpu-guide/generate-gpu-pages.js`・`game-pc-guide/generate-games.js`・`upgrade/generate-pages.js`・`pc-build-check/generate-builds.ps1`）も同じ1行を出力します。

> ⚠️ 測定ID（G-…）は公開してよい値です。Sippo CONTROL が GA4 Data API を読むための**サービスアカウント鍵（JSON）とは別物**で、
> 鍵はこのリポジトリに置きません（`_control/secrets/` のみ・git管理外）。

## ローダーがしていること

| 項目 | 内容 |
|---|---|
| 送信する環境 | ドメインが `sippo-pc.jp` / `www.sippo-pc.jp` のときだけ（https・http とも。GitHub Pages の「Enforce HTTPS」が未設定で http でも表示されるため）。ローカル（127.0.0.1・localhost）・file://・github.io では Google に何も送らない（`gtag` 関数は存在するので既存コードは壊れない） |
| ページビュー | `gtag('config')` の自動 page_view を1回だけ。手動の page_view は送らない |
| サービス別 | page_view に `content_group`（`home` / `gpu-guide` / `pc-build-check` / `game-pc-guide` / `pc-builder` / `upgrade` / `pc-builds-hub` / `pc-consult` / `other`）を付ける。ID は `shared/nav/sippo-nav.js`・Sippo CONTROL と同じ |
| 個人情報・認証情報 | `page_location` / `page_referrer` / `link_url` から `#…` と `code`・`token`・`access_token`・`email` 等のクエリを除く（PC Builds Hub のパスワード再設定URL対策）。イベントのパラメータからメールアドレスらしい値・`email` / `password` / `phone` 等のキーを除き、値は100文字に切る |
| 運営者の除外 | `https://sippo-pc.jp/?sippo_ga=off` を一度開くと、そのブラウザでは以後送らない（`?sippo_ga=on` で戻す）。`?sippo_ga=debug` で GA4 の DebugView 用 `debug_mode` を付ける（`?sippo_ga=nodebug` で解除） |
| サイト内導線 | 相談室へのリンク → `consult_cta_click`、別サービスへのリンク → `cross_service_click`（`data-affiliate-track` / `data-track` / `data-no-track` 付きのリンクと外部リンクは送らない＝二重計測しない） |

ローダーを変更したら、キャッシュ優先で配る Service Worker の版を上げてください（`pc-build-check/sw.js`・`gpu-guide/sw.js`・`game-pc-guide/sw.js`）。

## イベント一覧

| イベント | 送る場所 | パラメータ | 意味 |
|---|---|---|---|
| `page_view` | ローダー（自動） | `content_group` | ページ閲覧 |
| `affiliate_click` | `shared/affiliate/affiliate.js` | `product_id` `product_name` `shop` `page` `placement` `link_url` `page_path` | アフィリエイトリンクのクリック（収益ではない） |
| `click_square_500` / `click_coconala_1500` | `pc-consult/main.js`（`data-track`） | `service_location` `link_url` `link_text` `page_path` | 相談の申し込みボタン |
| `consult_memo_copy` | `pc-consult/main.js` | `from` `budget` `usage` `resolution` | PC BUILD CHECK からの相談メモのコピー |
| `consult_cta_click` | ローダー | `from_service` `placement` `link_path` | 他サービスから相談室へのリンク |
| `pcbc_to_consult` / `pcbc_to_gpu_guide` / `pcbc_to_game_guide` / `pcbc_to_upgrade` | `pc-build-check/script.js`（`data-track`） | `service_location` `link_url` `link_text` `page_path` | PC BUILD CHECK の診断結果から他サービスへ |
| `cross_service_click` | ローダー | `from_service` `to_service` `placement` | 別サービスへのリンク（上の pcbc_to_* 以外） |
| `gpu_search_select` | `gpu-guide/gpu-search.js` | `gpu_id` `source` | ヘッダー検索で選ばれたGPU（入力文字列は送らない） |
| `game_filter` | `game-pc-guide/script.js` | `filter` `value` | 一覧の絞り込み（選択式の項目のみ。自由入力は送らない） |
| `pcbc_diagnose` ほか `pcbc_*` | `pc-build-check/script.js` | 診断条件など | 診断・比較・共有 |
| `pcb_*` | `pc-builder/js/pb-app.js` | `category` `part_id` など | パーツ追加・プリセット・共有・保存 |
| `upgrade_diagnose` | `upgrade/upgrade-diagnose.js` | `verdict` `parts_to_change` `resolution` | アップグレード診断の実行 |

相談室への誘導の合計は `consult_cta_click` ＋ `pcbc_to_consult`（同じクリックが両方に入ることはない）。

## GA4 管理画面で必要な設定

1. **データストリームの拡張計測**（管理 → データストリーム → ウェブ → 拡張計測機能の歯車）
   - 「ページビュー」の詳細設定で **「ブラウザの履歴イベントに基づくページの変更」をオフ**（必須）。
     PC BUILDER・PC BUILD CHECK・GAME PC GUIDE・相談室は操作のたびに `history.replaceState`、PC Builds Hub は `pushState` を使うため、オンのままだとページビューが何重にも数えられる。
   - 「離脱クリック」はオンのままでよい（外部リンク全般が `click` として記録される。アフィリエイトの分析は `affiliate_click` を使い、`click` と足し合わせない）。
   - 「サイト内検索」はオンでよい（GAME PC GUIDE の `?q=` が検索語として記録される）。
2. **カスタムディメンション**（管理 → カスタム定義 → カスタムディメンションを作成。範囲はすべて「イベント」）

   | ディメンション名 | イベントパラメータ | 用途 |
   |---|---|---|
   | 商品ID | `product_id` | 商品別のアフィリエイトクリック（Sippo CONTROL が自動で使う） |
   | ショップ | `shop` | Amazon / 楽天 / Yahoo 別 |
   | 設置位置 | `placement` | どの位置のボタン・リンクが押されたか |
   | 遷移元サービス | `from_service` | 相談・別サービスへの誘導元 |
   | 遷移先サービス | `to_service` | サービス間の移動 |
   | GPU ID | `gpu_id` | GPU検索で選ばれたGPU |
   | 絞り込み項目 | `filter` | GAME PC GUIDE の絞り込み |

   登録した日以降のデータだけが使える（過去にさかのぼらない）。標準プロパティの上限はイベント範囲50件。
3. **内部トラフィックの除外**（任意）: 管理 → データストリーム → タグ設定 → 内部トラフィックの定義 で運営者のIPを登録し、データフィルタを有効にする（ブラウザ単位で止めたいだけなら `?sippo_ga=off` で足りる）。
4. **データ保持期間**: 管理 → データ収集 → データ保持 で「14か月」に（既定2か月だと探索レポートで過去を見られない）。
5. **Google シグナル**はオフのままを推奨（オンにすると広告関連の告知範囲が広がる）。

## テスト

```
node scripts/test-analytics.js
```

全公開HTMLがローダーをちょうど1回読むこと、旧タグ・旧IDが残っていないこと、生成スクリプトの出力、
ローダーの動作（本番だけ送信・オプトアウト・個人情報の除去・二重計測しない導線計測・サービス判定が Sippo CONTROL と一致）を検査します。
