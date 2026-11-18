# 共通パーツデータ（shared/catalog/）運用ガイド

GPU・CPU の **仕様・価格・共通スコア・出典・確認日** を1か所で管理する正本です（2026-11-14〜）。
GPU GUIDE・PC BUILDER・PC UPGRADE は、同じ製品の同じ基礎情報をここから取得します。

> ✋ 生成物（`gpu-guide/gpus.json`、`upgrade/upgrade-engine.js` の `GENERATED` ブロック、`revisions.json`）は**手で直さない**。
> 直すのは必ず下の「正本」。生成物を直接直すと `node scripts/catalog/validate.js` が致命的エラーにします。

---

## 1. ファイルと役割

| ファイル | 種類 | 中身 |
|---|---|---|
| `shared/catalog/gpu.json` | **正本** | GPUチップ 70件（GPU GUIDE 掲載65件＋UPGRADE の入力候補だけの5件） |
| `shared/catalog/cpu.json` | **正本** | CPU 56件（PC BUILDER 掲載分） |
| `shared/catalog/sources.json` | **正本** | 出典の登録簿（ラベル・URL・種類・価格の条件）。確認日はここではなく各値に持つ |
| `shared/catalog/config.json` | **正本（設定）** | 価格の有効期間（`pricing.staleAfterDays`＝45日）・合計に入れる価格の種類・サイト別の代表価格ルール・項目ごとの影響先 |
| `shared/catalog/schema.json` | **正本（定義）** | 項目名・型・単位・範囲・意味。検証はこれを使う |
| `shared/catalog/catalog.js` | 共通ロジック | ブラウザと Node の両方で使う関数（代表価格・古さの判定・PC BUILDER 互換アダプター） |
| `gpu-guide/data/gpu-editorial.json` | **GPU GUIDE 固有** | 説明文・おすすめ理由・比較先・タグ・GPU GUIDE 独自の総合評価（score）・中古おすすめ度・**掲載順** |
| `gpu-guide/gpus.json` | 生成物 | 正本＋GPU GUIDE 固有から生成（従来と同じ形。PC BUILD CHECK・GAME PC GUIDE・UPGRADE・GPU GUIDE が読む） |
| `upgrade/upgrade-engine.js` の `GPU_POWER` / `GPU_POWER_SPEC` / `GPU_PRICE` | 生成物 | `<GENERATED:catalog-…>` マーカーの間だけ生成 |
| `shared/catalog/revisions.json` | 生成物 | レコードごとの版とデータ更新日（内容のハッシュで自動更新） |
| `scripts/catalog/build.js` | 生成 | 検証 → 生成物の更新（`--check` は確認だけ、`--pages` は静的ページも再生成） |
| `scripts/catalog/validate.js` | 検証 | 致命的／要確認／把握用 に分けて報告（`--json` で全件） |
| `scripts/catalog/test-catalog.js` | テスト | 反映・互換・価格・検出のテスト |

## 2. 参照のしかた（直接参照とビルド時反映の違い）

| サイト | 方式 | 正本を直したあと |
|---|---|---|
| **PC BUILDER** | **直接参照**（ブラウザが `/shared/catalog/*.json` を読み、`catalog.js` の互換アダプターで従来の形にする） | 公開（push）すれば次の読み込みから反映。生成は不要 |
| **GPU GUIDE**（一覧・`gpu.html`） | ビルド時反映（`gpus.json`） | `node scripts/catalog/build.js` → 公開 |
| **GPU GUIDE**（個別65ページ） | ビルド時反映（静的HTML。価格・公式推奨電源は正本から） | `build.js` のあと `node gpu-guide/generate-gpu-pages.js`（または `build.js --pages`） |
| **PC UPGRADE**（診断・型番記事） | ビルド時反映（`upgrade-engine.js` の生成ブロック） | `build.js`（記事は `node upgrade/generate-pages.js`。`--pages` に含む） |
| **PC BUILD CHECK / GAME PC GUIDE** | 間接（`gpus.json` 経由） | `rasterScore`・`price`（reference）を変えたときだけ、各サイトの生成も必要（`pc-build-check/generate-builds.ps1`・`game-pc-guide/generate-games.js`。⚠️実行前に PROJECT_STATUS の注意を読む） |

> GitHub Pages は `max-age=600` のため、公開直後の約10分は古いファイルが返ることがあります。

## 3. データの形

### 3.1 製品（gpu.json / cpu.json の `products[]`）

```jsonc
{
  "id": "rtx-5070",                // 安定ID（変えない。共有URL・保存済み構成・個別ページURLに使われている）
  "category": "gpu", "kind": "chip",
  "maker": "NVIDIA", "name": "GeForce RTX 5070", "aliases": [],
  "series": "RTX 50", "market": "new",           // new=新品で流通 / used=中古中心
  "listings": ["gpu-guide", "pc-builder", "upgrade"],   // どのサイトに出すか
  "specGroups": [                                 // 根拠（出典・確認日）が同じ値のまとまり
    { "fields": { "vramGB": 12, "boardPowerW": 250 }, "basis": "official",
      "source": "nvidia-rtx-5070-family", "checkedAt": "2026-11-09" },
    { "fields": { "recommendedSystemPowerW": 650, "powerConnectorsReference": "…" }, "basis": "official", … }
  ],
  "scores": { "sippoRaster": { "value": 78, "version": "v1", "basis": "estimated", "source": "legacy-gpus-json", "checkedAt": null } },
  "prices": [ { "type": "market-median", "amount": 163000, "currency": "JPY", "condition": "new",
                "checkedAt": "2026-10-31", "source": "kakaku-gpu", "target": "…", "low": 155000, "high": 206000, "sampleSize": 11 } ]
}
```

- **basis**（値の根拠）: `official`（公式）/ `secondary`（Wikipedia 等の二次情報）/ `measured`（実測）/ `estimated`（推定・Sippo独自評価）/ `unverified`（未確認）。
- **null ＝ 未確認**。0 や推測で埋めない（PC BUILDER は「要確認」「評価不可」にする）。
- **checkedAt ＝ 外部の出典を実際に確認した日**。データを移した日・書き換えた日ではない。
  データを書き換えた日は `revisions.json` の `dataUpdatedAt`（自動）。変更内容は git の履歴。
- 意味の違う数値は別項目: GPU の `boardPowerW`（カード単体の消費電力 TGP/TBP）と `recommendedSystemPowerW`（公式のシステム推奨電源）、CPU の `tdpW` と `maxPowerW`（Intel の Maximum Turbo Power。AMD は null）。
- **GPUチップとグラボ製品は別物**。メーカー別カードの長さ・厚さ・実物の補助電源・製品ごとの推奨電源は `pc-builder/data/parts.json` の `gpuboard` に置く。
- 項目の型・単位・範囲は `schema.json`。定義に無い項目名はエラーになる（単位の付け忘れ対策）。

### 3.2 価格の種類と代表価格

| type | 意味 | 合計・コスパに入れるか |
|---|---|---|
| `lowest` | 型番一致の掲載最安値 | 入れる（有効期間内のみ） |
| `market-median` | 掲載製品の価格目安：価格比較サイトのランキングに掲載された同チップ（VRAM指定時は同容量）製品の最安値の中央値（low/high/sampleSize つき）。市場全体の相場・販売数量で重み付けした値・購入できる価格の保証ではない | 入れる（有効期間内のみ） |
| `reference` | 社内の目安（**確認日なし**。PC BUILD CHECK の BTO 計算と、実売相場の無い・期限切れのGPUの GPU GUIDE「価格目安」に使う） | 入れない |
| `used-range` | 中古相場（min〜max） | 入れない |
| `launch-msrp` / `bto-estimate` | 発売時価格 / BTO 組み込み目安（予約） | 入れない |

- 同じ種類が複数あれば **確認日が最も新しいもの** を使う（古い記録は履歴として残してよい）。
- **代表価格の採用ルール**（`config.json` の `pricing.representative`）:
  - PC BUILDER: `lowest` → `market-median`。どちらも無ければ `reference` を「おおまかな目安（合計に含めない）」。
  - GPU GUIDE（2026-11-15〜）: 新品で有効期間内の `market-median` があれば見出しは「実売相場」（確認日・出典つき）。無い・期限切れなら `reference` を「価格目安（確認日なし）」とし、期限切れの実売相場は「更新待ち」と併記。中古中心は `used-range`。gpus.json には `price`（reference）と `marketPrice`・`marketPriceCheckedAt`・`marketPriceValidUntil` を**別項目**で出す（一覧の表示・価格順・予算絞り込みは表示価格、コスパ順位と個別ページの長所・注意点は全GPU共通の `price` で比べる）。
  - UPGRADE（2026-11-15〜）: GPU の交換費用（`PRICE_HINT` の GPU 分）は `upgrade-engine.js` の生成ブロック `GPU_PRICE`（新品GPUの最新 `market-median`・確認日つき）。手書きしない。
  - PC BUILD CHECK: `reference`（BTO 基準。変えていない。実売相場に替えると75構成中68構成が予算+15%超になるため、予算区分の見直しとセットで判断する）。画面には価格の基準時期を出す。
- **有効期間**: `pricing.staleAfterDays`（既定45日、種類別は `staleAfterDaysByType`）。過ぎた価格は「古い（更新待ち）」となり、合計・コスパから外れる。PC BUILDER の他カテゴリ（`pc-builder/data/prices.json`）も同じ日数。
- 価格が分からない製品は **価格を登録しない**（0円にしない）。合計では「確認できないパーツ」として件数表示される。
- 価格の条件（税込・送料）は出典ごとに `sources.json` の `priceConditions`、個別に違えば価格側に `taxIncluded` / `shippingIncluded`。

### 3.2.1 掲載価格の取得記録（evidence）と再現性（2026-11-15〜）

- `market-median` に `evidence`（例 `shared/catalog/evidence/kakaku-gpu-2026-11-15.json`）・`medianRaw`（丸め前）・`vramGB`（対象容量）を持たせる。取得記録には製品名・URL・VRAM・価格・除外理由・取得日時・ランキング集計期間が入り、`validate.js` が記録から中央値・製品数・範囲を再計算して照合する（不一致は致命的）。
- 取得記録は `node scripts/catalog/kakaku-gpu-evidence.js <保存HTMLフォルダ> <取得日時> <出力>` で作る（集計ルールはスクリプト冒頭と記録の `_meta.rules`）。HTMLが残っていない過去の値の記録は作らない（2026-10-31 の値は再計算できない履歴）。
- 画面の言葉: GPU GUIDE「掲載製品の価格目安」／未確認の価格は「価格目安（未確認）」。コスパの順位・長所注意点の価格評価は、有効な掲載価格があり掲載製品5件以上のGPUだけ（未確認や少数サンプルの価格では順位を付けない）。

### 3.3 性能スコア

尺度が違う評価は混ぜない。

| 指標 | 置き場所 | 用途 |
|---|---|---|
| `sippoRaster`（ゲーム性能の相対指数 v1） | 正本 `scores` | GPU GUIDE・PC BUILDER・PC BUILD CHECK・GAME PC GUIDE・UPGRADE記事。`target`（FHD/WQHD/4K）はこれから導出 |
| `sippoFeature`（機能評価 v1） | 正本 `scores` | GPU GUIDE・PC BUILDER |
| GPU GUIDE 総合 `score`・中古おすすめ `usedScore` | `gpu-editorial.json`（GPU GUIDE 固有） | GPU GUIDE のみ |
| UPGRADE の `GPU_TIERS`・`CPU_TIERS` | `upgrade/upgrade-engine.js`（手書き・別尺度） | UPGRADE 診断・PC BUILDER の CPU ゲーム指数。**共通化していない**（尺度が違うため）。正本の GPU が `GPU_TIERS` に無いと警告 |

尺度や算出方法を変えたら `version` を上げ、`schema.json` の `versions` に足す。

## 4. 更新手順

### 4.1 価格を更新する（例: RTX 5070 の実売相場）
1. 価格比較サイト等を手で確認する（自動取得はしない）。
2. `shared/catalog/gpu.json` の該当 `prices[]` に**新しい記録を追加**（または既存の記録を書き換え）し、`amount`・`checkedAt`（確認した日）・`low`/`high`/`sampleSize`・`source` を入れる。CPU は `cpu.json` の `lowest`。
3. 出典が新しければ `sources.json` に登録する。
4. 実行:
   ```
   node scripts/catalog/build.js --pages     # 検証 → gpus.json・UPGRADE・更新履歴 → GPU GUIDE 個別ページ・UPGRADE 記事
   node scripts/catalog/test-catalog.js
   node pc-builder/test-pc-builder.js
   node gpu-guide/test-gpu-feature.js
   ```
5. `git diff` で変わったページを確認して公開。

> `reference`（GPU GUIDE の価格目安＝PC BUILD CHECK の BTO 計算に使う値）を変えると、PC BUILD CHECK の予算区分の検証（`pc-build-check/test-build-price.js`・`test-build-profile.js`）に影響する。構成の見直しとセットで行う。

### 4.2 仕様を確認・修正する（例: 未確認の値を公式ページで確認した）
1. 公式ページで値を読む（読めない値は null のまま。推測しない）。
2. 出典を `sources.json` に登録（URL必須）。
3. その値を、`basis: "official"`・`source`・`checkedAt`（確認した日）を持つ `specGroups` に移す（移行元の `unverified` グループからは削除）。
4. `node scripts/catalog/build.js --pages` → テスト。

### 4.3 製品を追加する
- **GPU**: `gpu.json` に追加（`listings` を決める）→ GPU GUIDE に出すなら `gpu-guide/data/gpu-editorial.json` に説明文・`score` などを追加（配列の位置＝掲載順）→ UPGRADE に出すなら `upgrade-engine.js` の `GPU_TIERS`（手書き）にも追加 → `build.js --pages`。
- **CPU**: `cpu.json` に追加（`family` は `pc-builder/data/rules.json` の `cpuFamilies` にある値）→ `build.js` → `node pc-builder/validate-parts.js` → テスト。
- IDは英小文字・数字・ハイフン。**一度公開したIDは変えない**（共有URL・保存済み構成・`/gpu-guide/gpu/<id>/` が壊れる）。名前の別表記は `aliases` に足す。

### 4.4 有効期間を変える
`config.json` の `pricing.staleAfterDays`（全体）または `staleAfterDaysByType`。PC BUILDER は次の読み込みから、GPU GUIDE の「更新待ち」表記は次の生成から反映。

## 5. 検証

```
node scripts/catalog/validate.js            # 人間用の要約（致命的があれば終了コード1）
node scripts/catalog/validate.js --json     # 全件（該当ID・項目・現在値・出典・確認日・理由・影響する参照先）
node scripts/catalog/build.js --check       # 生成物が正本と一致しているか（書き込まない）
```

| 重大度 | 例 | 対応 |
|---|---|---|
| 致命的（error） | ID重複・参照切れ・型/単位の誤り・定義に無い項目・不正な価格（0円・負・通貨）や日付（形式・未来）・合計に入れる価格に確認日なし・PC BUILDER の旧ファイルへの書き戻し（二重管理）・PC BUILD CHECK（`part-prices.json`）との仕様の矛盾・生成物や更新履歴の不一致 | 直すまで公開しない（`build.js` は書き込みを中止する） |
| 要確認（warning） | 価格が古い・公式値の出典URLや確認日が無い・参考価格と実売相場の大きな差・UPGRADE 独自指数の欠け | サイトは動く。優先して確認 |
| 把握用（info） | 未確認（null）の値・移行元のまま（出典記録なし）の値・確認日なしの参考価格・合計に使える価格が無い製品・暫定の推定スコア | 0や推測で埋めない。確認できたら 4.2 の手順で更新 |

Sippo CONTROL（ローカル）の「パーツデータ」画面にも同じ検証結果が優先順で出て、GPT分析出力に `catalog_issues.csv`・`catalog_validation.json` が入る。

## 6. 共通化していないもの（意図的）

| 場所 | 中身 | 理由・影響 |
|---|---|---|
| `shared/parts/part-prices.json` の `cpu` | PC BUILD CHECK の BTO 基準価格と `cores`/`threads`/`x3d` | 価格は BTO 基準で別物。仕様の3項目は正本と一致することを検証（不一致は致命的） |
| `upgrade/upgrade-engine.js` の `GPU_TIERS`・`CPU_TIERS`・`PRICE_HINT`（GPU以外） | UPGRADE 独自の性能尺度・メモリ/SSD/電源などの交換費用の目安（確認日なし） | 尺度・基準が違う。正本の GPU が `GPU_TIERS` に揃っているかは検証。PRICE_HINT の GPU 分は 2026-11-15 から生成ブロック `GPU_PRICE`（正本）から入る |
| `pc-builder/data/parts.json`・`prices.json` | CPU・GPU 以外のパーツ（マザボ・メモリ等）と価格 | 今回は GPU・CPU を優先。同じ形（specGroups・prices）で `shared/catalog/<category>.json` に移せる |
| `shared/affiliate/affiliate-master.json` | 購入リンク | 価格・仕様を持たないリンク用データ |
| `gpu-guide/cpu-recommendations.json` | GPU GUIDE の CPU 相性（編集内容） | サイト固有の推薦 |

## 7. 問題が起きたとき

- `build.js` が「致命的なエラーがあるため生成を中止」→ 表示された項目を正本で直す（生成物は変更されていない）。
- 公開後に表示がおかしい → `git revert <コミット>` で戻して push（生成物も一緒に戻る）。正本だけを戻した場合は `node scripts/catalog/build.js --pages` を実行して生成物を合わせる。
- PC BUILDER が「データを読み込めませんでした」→ `/shared/catalog/*.json` の JSON 構文エラーか配置漏れ。`node scripts/catalog/validate.js` で確認。
