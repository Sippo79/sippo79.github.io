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

## 2026-09-04 — Service Worker の版上げ忘れを修正（GPU詳細ボタンが旧リンクのままだった）

- **修正目的**: 診断結果の「詳細スペックを見る」を押すと、診断で出たGPUの個別ページではなくGPU一覧に着地する、という報告への対応。
- **変更ファイル**: `pc-build-check/sw.js`, `pc-build-check/test-service-worker.js`（新規）
- **変更内容**:
  - **原因は Service Worker のキャッシュ版上げ忘れだった**。リンク生成のコード（`script.js` / `shared/gpu/gpu-links.js`）自体は Phase 3 以降正しく、ローカルでは11種すべてのGPUが個別ページへ解決できていた。しかし `sw.js` の `CACHE_NAME` が **Phase 6 の `v6` のまま** で、`script.js` はキャッシュ優先配信のため、**再訪ユーザーには Phase 6 時点の古い script.js が配られ続けていた**。その版のボタンは旧 `/gpu-guide/?gpu=` を指すため、GPU一覧に着地していた。同じ理由で Phase 8 の参考価格も表示されていなかった。
  - `CACHE_NAME` を `pc-build-check-v7` へ更新（Phase 7・8 の分をまとめて反映）。旧キャッシュは `activate` で自動削除される。
  - Phase 8 で追加した `/shared/parts/build-price.js` と `/shared/parts/part-prices.json` をキャッシュ対象に追加。
  - `part-prices.json` を `builds.json` と同じ**ネットワーク優先**にした。価格は更新されるデータなので、版上げを待たずに最新を取りに行く必要がある。
  - **テストで検出できていなかったので `test-service-worker.js` を新規追加**（43件）。キャッシュ対象ファイルの実在／`index.html` が読むローカル資産の取りこぼし／更新されうるデータがネットワーク優先か／`activate` での旧キャッシュ削除を検証する。このテストにより、**`affiliate-recommend.js`・`sippo-nav.js`・`sippo-nav.css` の3件がキャッシュ対象から漏れていた**ことも判明したため追加した。
  - 検証: 旧 `v6` キャッシュを持つユーザーが再訪する状況をブラウザで再現し、`v6` が自動削除され `v7` になること、ボタンが個別ページ（`/gpu-guide/gpu/rx-7600/` 等）へ着地すること、参考価格が表示されることを確認した。
- **影響範囲**: PC BUILD CHECK の再訪ユーザー。次回アクセス時に新しいキャッシュへ入れ替わり、GPU詳細ボタンと参考価格が正しく動く。HTMLの内容自体は変更なし。
- **未対応・次にやること**:
  - 公開後、実機で「詳細スペックを見る」を押して個別ページに着地することを確認（ユーザー側で実施）。**もし旧画面が出る場合は、スーパーリロード（Ctrl+F5）か、DevTools > Application > Service Workers の Unregister で確実に更新できる。**
- **別AIへの引き継ぎ注意点**:
  - ⚠️ **`script.js` / `style.css` / `shared/` 配下を変更したら、必ず `pc-build-check/sw.js` の `CACHE_NAME` を上げること。** 上げ忘れると再訪ユーザーだけ古い挙動のままになり、ローカル確認では絶対に気づけない（今回まさにそれ）。
  - `node pc-build-check/test-service-worker.js` はキャッシュ対象の漏れは検出するが、**版上げ忘れそのものは検出できない**（何を変えたら上げるべきかは人の判断のため）。コード変更時の手順として覚えておくこと。

## 2026-09-04 — 構成の参考価格を追加し「予算と実額の食い違い」を解消（Phase 8 / 完了）

- **修正目的**: 「20万円構成」と表示しているのに実際のパーツ合計が大きく20万円を超える、という最重要課題の解消。予算はPC全体価格の意味のまま維持する。
- **変更ファイル**:
  - `shared/parts/part-prices.json`（新規・価格マスター）
  - `shared/parts/build-price.js`（新規・参考価格の計算を集約）
  - `pc-build-check/compute-prices.js`（新規・PowerShellから同じ計算を呼ぶ橋渡し）
  - `pc-build-check/test-build-price.js`（新規・価格テスト349件）
  - `pc-build-check/script.js` / `index.html` / `style.css`（診断結果に参考価格を表示）
  - `pc-build-check/generate-builds.ps1` → `builds/*.html` 75件 + `sitemap.xml`（静的ページに参考価格を表示）
  - **`pc-build-check/builds.json` は変更していない**（Phase 7 の構成内容をそのまま維持）
- **変更内容**:
  - **既存の価格資産をまず調査**した。`gpu-guide/gpus.json` に全65GPUの price（うち43件は中古相場も）、`upgrade/upgrade-engine.js` の PRICE_HINT にメモリ/SSD/電源/クーラーの概算があった。一方 `shared/affiliate/affiliate-master.json` は149商品すべて価格を持たず（アフィリエイト用途のため）、CPUは `cpu_mid`/`cpu_high` の2段階しかなく75構成の7種CPUを区別できなかった。**不足分（CPU7種・メモリ・ストレージ・マザボ・BTO上乗せ）だけ**を新規マスターに追加し、GPU価格は `gpus.json` を唯一の情報源として二重管理を避けた。
  - **価格の基準を「同等構成のBTO完成品の実売目安」に定めた**。当初パーツ個別合計で計算したところ、CPU・GPU以外だけで約71,000円かかり、10万円ではGPUに16,000円しか残らず（現行最安の新品GPUはRTX 5050の35,000円）、「10万円・新品パーツ」は数字上そもそも成立しなかった。サイトは既にBTOメーカーへ誘導しており、affiliate-master も「エントリー/10万円台=RTX 5060」「ミドル/20万円前後=RTX 5070」と想定していたため、BTO実売価格帯を基準に採用した。BTO上乗せ（ケース・電源・冷却・OS・組立）はアンカー2点から逆算し、いずれも約25,000〜26,000円で一致したため25,000円とした（個別小売で同じ枠を買うと43,000円かかる＝BTOの方が安いという実態を反映）。
  - この基準変更で乖離の中央値は **+43%/+37% → +13.5%** に改善し、20万帯 +6%・25万帯 -6% とほぼ一致した。残る乖離は10万帯（中央+28%）と15万帯（+25%）に集中する。
  - **予算を超える構成でも、構成を作り替えず超過を明示する方針にした**。超過29件のうち16件は「10万円×4K」のように予算内では成立しない条件で、既に解像度不足の警告が出ていた。メモリ・SSDを1段階下げても予算内には収まらず性能だけが落ちたため、パーツ削減は採用していない。**「足りない場合は足りないと正直に表示する」というサイトの基本方針に揃えた**。
  - 診断結果と静的75ページの両方に参考価格を表示。計算は `shared/parts/build-price.js` の1か所だけが持ち、静的生成側は `compute-prices.js` 経由で同じ関数を呼ぶ（コピペしていない）。ブラウザ実測で両者の金額が一致することを確認した。
  - 価格は「約〇万円」の粒度で表示し、必ず「※価格は販売店・時期によって変動します。同等構成のBTO完成品のおおよその価格帯を示す目安で、特定商品の販売価格ではありません。」を添える。1円単位で出すと固定価格に見えるため意図的に粗くしている。
  - 価格データが1つでも欠けたら参考価格を出さない（欠けたまま合計すると必ず安く見えるため）。node が無い環境ではページ生成は通り、価格表示だけが省かれる。
- **影響範囲**: PC BUILD CHECK の診断結果と静的75ページに参考価格ブロックが増える。生成ページの差分は **815行の追加のみ・削除0行**（アフィリエイト/PWA/ナビ等の既存要素は全て維持）。既存テスト1,997件は全て通過（回帰なし）。`builds.json` を変更していないため Phase 7 の成果（中古GPU 0件 / GPU比率 最大59% / 単調性違反 0件）はそのまま維持されている。
- **未対応・次にやること**:
  - **PC BUILD CHECK は一旦「完成」として扱う。以降は機能追加を続けず、Search Console・クリック計測・実ユーザー行動を見て必要な改善だけ行う。**
  - 価格は相場変動するため、`part-prices.json` の `_meta.updated` と各 `updated` を定期的に見直す。値を直せば診断結果と静的75ページの両方が同時に更新される（再生成が必要）。
  - 10万帯・15万帯の乖離（中央+28%/+25%）は、予算内で成立しない条件を正直に出している結果であり、数値としては残る。予算選択肢の下限見直しは今回のスコープ外（URL・構成ID・sitemap に波及するため）。
- **別AIへの引き継ぎ注意点**:
  - **価格の計算式を他の場所へコピーしないこと。** `shared/parts/build-price.js` が唯一の実装で、診断画面・静的生成・テストの3者が同じ関数を呼んでいる。片方だけ直すと「診断では約24万円、ページでは約26万円」のような矛盾が起きる。
  - **GPU価格を `part-prices.json` に書かないこと。** GPU価格は `gpu-guide/gpus.json` が正。テストで二重管理を検出している。
  - **アフィリエイトの価格情報と構成参考価格は別物。** `affiliate-master.json` は商品リンク用で価格を持たない。混ぜないこと。
  - 参考価格は「BTO完成品の目安」であって自作パーツ合計ではない。`_meta.basis` に `bto` と明記してある。基準を変える場合は表示文言（PRICE_DISCLAIMER）も必ず揃えること。
  - 予算超過の判定は `OVER_TOLERANCE`（+15%）の1か所だけ。テストの失敗条件は別で、明らかな異常のみを見る +100%（HARD_LIMIT）にしてある。価格改定のたびにテストが壊れないための意図的な二段構え。
  - 予算内に収まっている構成では「予算内です」と言い切らない（価格変動で簡単に嘘になるため、文言を出さない設計にしてある）。

## 2026-09-03 — PC BUILD CHECK 75構成の品質監査（Phase 7）

- **修正目的**:
  PC BUILD CHECK は動的な推薦エンジンではなく**完成構成カタログ**（Phase 6 で確認）。
  この設計を維持したまま、**登録済み75構成そのものが妥当か**を全面監査する。

- **★調査で分かったデータの制約**:
  `builds.json` のフィールドは **id / budget / usage / resolution / title /
  cpu / gpu / ram / storage / comment / motherboardGuide** の11個だけ。
  依頼にあった **PSU・ケース・クーラー・OS・price・badges・warnings は存在しない**。
  そのため「build PSU >= GPU推奨PSU」「パーツ価格合計 vs 表示価格」は
  検証するデータが無い。推奨電源は結果画面で性能プロファイルから出す値なので、
  **その推奨値がGPU消費電力に対して十分か**という形で検証した（不足0件）。

- **監査結果（変更前）**:
  | 項目 | 結果 |
  |---|---|
  | マトリクス完全性 | 5×5×3=75 と一致・欠損0・重複0 |
  | 中古前提GPUの採用 | **4件**（10万円構成） |
  | GPU価格が予算の70%超 | **6件**（最大89%） |
  | 予算↑でGPU性能↓ | **6件** |
  | 予算↑でCPU性能↓ | **5件** |
  | 解像度↑でGPU性能↓ | **11件** |
  | CPU/GPUバランス極端 | 0件 |
  | 推奨電源の不足 | 0件 |
  | 全GPU/CPUの参照解決 | 100% |

- **変更内容（計28件）**:
  1. **中古GPU4件を現行GPUへ置換**（RX 6600 / RTX 3050 / RTX 3060 → **RX 7600**）
     ★RTX 5050 は使わなかった。rasterScore 46 は Phase 4 の内部回帰**推定値**で、
       RX 6600(42) / RTX 3060(43) との差が +4/+3 と僅差。
       推定値が置換の判断を左右するのを避け、実測系の RX 7600(48) を採った。
  2. **予算を圧迫して物理的に成立しない6件のGPUを引き下げ**
     10万/4K に ¥89,000（予算の89%）のGPUが入っており、
     残額¥11,000ではCPU・MB・RAM・SSD・電源・ケースを賄えなかった。
     ★「4Kに届かない」ことは Phase 1 の解像度警告が伝えるので、
       無理に高価なGPUを積む必要はない。
  3. **単調性の是正（GPU 15件 / CPU 5件相当）**
     予算を上げたのに性能が下がる、解像度を上げたのに性能が下がる構成を、
     **下位条件と同じパーツ以上を保つ**という最小限の是正で解消。
     予算を使い切ることは目的にしていないため、据え置きになる組も多い。
  4. **RTX 5050 に `scoreSource: "internal_estimate"` を付与**（Phase 5 からの宿題）。
     既存64GPUには何も付けない（勝手に verified 扱いしないため）。

- **効果**:
  | 項目 | 変更前 → 変更後 |
  |---|---|
  | 中古前提GPU | 4件 → **0件** |
  | GPU価格が予算の70%超 | 6件 → **0件**（最大66%） |
  | 予算↑でGPU性能↓ | 6件 → **0件** |
  | 予算↑でCPU性能↓ | 5件 → **0件** |
  | 解像度↑でGPU性能↓ | 11件 → **0件** |

- **★解決できなかった問題（重要・Phase 8候補）**:
  **概算総額が予算を超える構成が57/75件ある**。
  CPU・MB・RAM・SSD・電源・ケースを控えめに見積もっても、
  例えば「20万円構成」が概算26万円になる。
  ただし **`builds.json` にも他のどのデータにも各パーツの価格が無い**ため、
  これを機械的に正すことができない（GPU価格だけは gpus.json にある）。
  価格を推測で埋めるのは Phase 1 以来の方針（根拠のない数値を作らない）に反する。
  → **パーツ価格データを持つかどうかがサービス設計の判断**になるため、
     今回は構造的な問題として報告に留め、GPU比率という検証可能な指標で
     「明らかに成立しない構成」だけを是正した。

- **変更ファイル**:
  - `pc-build-check/builds.json`（構成28件分の cpu / gpu / comment）
  - `pc-build-check/builds/*.html`（64ページ再生成）/ `sitemap.xml`
  - `pc-build-check/test-build-check.js`（**構成品質テスト**を追加 132→145件）
  - `gpu-guide/gpus.json`（RTX 5050 に `scoreSource` を1行追加）
  - ★`script.js` / `style.css` は無変更。SWも版を上げていない
    （`builds.json` はネットワーク優先で取得するため）

- **今後のズレ防止**（`test-build-check.js` が検証）:
  - 標準構成に `market: "used"` のGPUが入ったら落ちる
    （Phase 6 の「万一入ったら明示する」表示は安全策として残してある＝二重の防御）
  - GPU価格が予算の70%を超えたら落ちる
  - 予算↑・解像度↑で性能が下がったら落ちる
  - CPU/GPUバランスが 0.5〜1.8 を外れたら落ちる
  - comment に実際のCPU/GPU名が入っていなければ落ちる

- **テスト結果**:
  - `node pc-build-check/test-build-check.js` … **145件成功 / 0件失敗**（132→145）
  - `node gpu-guide/test-gpu-data.js` … **75件成功 / 0件失敗**（維持）
  - `node gpu-guide/test-gpu-pages.js` … **1,643件成功 / 0件失敗**（維持）
  - `node upgrade/test-upgrade-engine.js` … **73件成功 / 0件失敗**（維持）
  - `node scripts/test-cross-links.js` … **61件成功 / 0件失敗**（維持）
  - ブラウザ実測（PC 1280px / スマホ 390px・16ケース）:
    **JSエラー0・横スクロールなし・404なし**。中古注意の表示0件、購入導線あり、
    診断→GPU詳細（/gpu-guide/gpu/rx-7600/）の遷移も確認。
  - 解像度警告は 20→22件（10万/15万の4K構成が適正価格のGPUになったため。
    「その予算では4Kは厳しい」と正直に伝える方向の変化）。

- **別AIへの引き継ぎ注意点**:
  - **PC BUILD CHECK に推奨エンジンを足さない**（2026-09-03 決定）。
    現在GPU入力・fps入力・候補ランキングは `/upgrade/` の役割。
  - **`builds.json` を直したら必ず `node pc-build-check/test-build-check.js` を通す**。
    中古GPU・GPU比率・単調性・CPU/GPUバランスを機械検証している。
  - 構成を足すときは comment に実際のCPU/GPU名を入れること（テストが見ている）。

---

## 2026-09-03 — GPU推奨精度の監査と中古GPU表示の修正（Phase 6）

- **修正目的**:
  「この条件なら本当にこのGPUを勧めるべきか」を総当りで検証し、
  説明可能なルールベースを保ったまま推奨の質を確かめる。

- **⚠️ 調査で分かった前提のズレ（重要）**:
  依頼は「PC BUILD CHECK の GPU推奨アルゴリズム」の改善だったが、
  実際には **PC BUILD CHECK に推奨アルゴリズムは存在しない**。
  - 入力は予算・用途・解像度の3つだけ（fps・ゲーム負荷・現在GPUの入力欄は無い）
  - 処理は `builds.json` の3キー完全一致による**表引き1行**のみ
  - `required` / 候補抽出 / 順位付けは1つも実装されていない
  依頼にあった「要求性能→候補→順位付け」「現在GPUからの向上率」
  「予算内での費用対効果」は、すべて **`/upgrade/` の upgrade-engine.js** の機能。
  そこで **Phase 6 は upgrade-engine.js の推奨品質の検証**を主対象とした。

- **推奨アルゴリズム（upgrade-engine.js）の実処理**:
  ```
  required = RESOLUTION_TARGETS[res].base × FPS_MULTIPLIER[fps] × USAGE_WEIGHT[usage]
  ratio    = current / required
    ratio >= 1.00 → keep（交換不要）
    ratio >= 0.70 → keep（十分）
    それ未満       → 候補を探す
  候補: gain(=候補/現在) < 1.15 は除外 → satisfaction=(min(after,1.10)/1.10)^4
        score = satisfaction×100 / (価格/万円)
  並び: ①予算内 ②快適水準(0.55)到達 ③score
  ```
  依頼が求めた headroom（COMFORT_BANDS）・sidegrade防止（GAIN.pointless）・
  overkill防止（usefulRatio の頭打ち）・予算を上限として扱うことは**すべて実装済み**だった。

- **総当り検証の結果（20,160ケース）**:
  現在GPU70種 × 解像度3 × 目標fps4 × 用途4 × 予算6 を全通し。
  | 検証項目 | 違反 |
  |---|---|
  | 現在より遅いGPUを勧める | 0件 |
  | 同一GPUへの交換を勧める | 0件 |
  | 予算を超える提案 | 0件 |
  | 15%未満の伸びを交換として勧める | 0件 |
  | 解像度を上げて推奨性能が下がる | 0件 |
  | 目標fpsを上げて推奨性能が下がる | 0件 |
  | 予算増だけで過剰GPUへ飛ぶ | 0件 |
  | 推奨/必要性能の倍率 1.5超 | 0件（最大1.40倍） |
  → **推奨アルゴリズム自体に修正すべき欠陥は見つからなかった**。

- **★試して取り下げた変更（記録として残す）**:
  「予算未指定だと WQHD/240fps で RTX 5090（45万円）が出るのは過剰では」と考え、
  快適水準に届く候補の中で費用対効果の良い方を選ぶ処理を入れた。
  → 既存テスト2件（ケースE「4K重量級ではハイエンドGPUも候補になる」ほか）が落ちた。
     4K/144fps 重量級に対して afterRatio 0.57 の GPU を勧めてしまう回帰だった。
  → 条件を絞って再試行したが、改めて数値で確認すると
     **RTX 5090 が出るのは「他のどのGPUでも目標に届かず、かつ予算の制約が無い」
     ケースだけ**（RX 9070 XT でも到達0.6〜0.7）。論理的に妥当な答えであり、
     過剰推奨ではなかった。**変更を revert し、エンジンは無修正のまま**とした。
  → 教訓: 既存テストが落ちたときに期待値を書き換えず原因を追ったことで、
     自分の思い込みによる改悪を入れずに済んだ。

- **実際に見つけて直した問題**:
  **PC BUILD CHECK が中古前提GPUを新品構成として黙って提示していた**。
  `builds.json` の75構成のうち4件（すべて10万円構成）が
  RX 6600 / RTX 3050 / RTX 3060 を使っている。これらは `gpus.json` で
  `market: "used"` かつタグ「中古向け」だが、構成ページにも診断結果にも
  中古である旨の記載が**1文字も無かった**。
  「10万円で新品PCを組む」つもりのユーザーが店で新品を探せない食い違いになる。
  - 構成を差し替えず、**事実を伝える**方針で対応（Phase 1〜5 と同じ）。
  - 診断結果に `renderUsedGpuNotice()` を追加。
  - 構成75ページは generator の注意点リストに1行足して再生成（該当4ページのみ変化）。
  - 判定は `gpus.json` の `market` が唯一の材料。GPU名を列挙しないので
    データが変われば自動で追従する。
  - なお **upgrade-engine の交換候補10件には中古GPUは1件も含まれていない**
    （新品前提の提案として正しい）。

- **変更ファイル**:
  - `pc-build-check/script.js`（中古GPU注意書き）/ `style.css` / `sw.js`（v5→v6）
  - `pc-build-check/generate-builds.ps1` → 構成4ページ再生成
  - `upgrade/test-upgrade-engine.js`（**推奨マトリクス20,160ケースの不変条件**を追加）
  - `gpu-guide/test-gpu-data.js`（中古GPUの注意書き整合・候補の価格性能逆転検出を追加）
  - ★`upgrade/upgrade-engine.js` は**無変更**（診断ロジックを触っていない）

- **テスト結果**:
  - `node upgrade/test-upgrade-engine.js` … **73件成功 / 0件失敗**（64→73）
    うち推奨マトリクス20,160ケースの不変条件7項目を含む
  - `node gpu-guide/test-gpu-data.js` … **75件成功 / 0件失敗**（68→75）
  - `node gpu-guide/test-gpu-pages.js` … **1,643件成功 / 0件失敗**（維持）
  - `node pc-build-check/test-build-check.js` … **132件成功 / 0件失敗**（維持）
  - `node scripts/test-cross-links.js` … **61件成功 / 0件失敗**（維持）
  - ブラウザ実測（PC 1280px / スマホ 390px）: **JSエラー0・横スクロールなし・404なし**。
    RTX 5080 に4K/144fpsで「現状維持でOK」、RX 9070 XT に「十分な性能」を返すことを確認
    （過剰な買い替え誘導をしていない）。

- **未対応・次にやること（Phase 7候補）**:
  - **PC BUILD CHECK に推奨アルゴリズムを入れるか**は要判断。
    現状の表引き75通りは「人が選んだ構成」であり、精度の検証ができない。
    ただし入力を増やす（fps・現在GPU）と `/upgrade/` と役割が重なるため、
    設計判断が必要。今回は勝手に作らず報告に留めた。
  - RTX 5050 の `scoreSource`（推定値である旨のデータ上の明示）は今回も未実装。
  - `builds.json` の中古GPU4件を現行GPUへ差し替えるかはデータ方針の判断。
    10万円構成なら RTX 5050（¥35,000・rasterScore 46）が新品で選べ、
    現行3件（RX 6600=42 / RTX 3050=27 / RTX 3060=43）より性能も高い。

- **別AIへの引き継ぎ注意点**:
  - **PC BUILD CHECK に「GPU推奨エンジン」は無い**。表引きである点を誤解しないこと。
    推奨ロジックを触るなら `/upgrade/upgrade-engine.js`。
  - **upgrade-engine の推奨は20,160ケースの不変条件テストで守られている**。
    ロジックを変えたら必ず `node upgrade/test-upgrade-engine.js` を通すこと。
  - 中古GPU判定は `gpus.json` の `market`。GPU名をコードに列挙しない。

---

## 2026-09-03 — GPU解像度適性の基準を統一（Phase 5）

- **修正目的**:
  Phase 4 で見つけた「同じ性能でも `target` の基準がズレている」問題を解消する。
  `target` は **PC BUILD CHECK の「解像度が足りない」警告の唯一の根拠**なので、
  ラベルのズレがそのまま診断の誤りになっていた。

- **調査で分かったこと**:
  - `target` の決め方は**どこにも文書化されていなかった**（README / PROJECT_STATUS になし。
    git履歴も一括アップロードのみで、フィールド単位の経緯が追えない）。
    → 手入力で、入力した時期ごとに暗黙の基準が違っていたと判断。
  - market別に見ると基準が明確に割れていた:
    ```
    現行GPU: FHD上限 raster 68 / WQHD下限 raster 70
    中古GPU: FHD上限 raster 55 / WQHD下限 raster 50
    ```
    同じ raster 68 でも RTX 5060 Ti=FHD、RX 6800=WQHD。
  - **VRAM では説明できない**。RTX 5060 Ti(16GB)=FHD、RTX 4070(12GB)=WQHD と
    VRAMが多い方が下の判定になっていた。
  - PC BUILD CHECK は `rasterScore` を一切見ず **`target` ラベルだけ**で警告を出していた。

- **比較した基準案**:
  | 案 | 内容 | 結果 |
  |---|---|---|
  | A | rasterScore のみ | 採用 |
  | B | rasterScore + VRAMガード | **案Aと結果が1件も変わらない**（8GB未満は既に全てFHDに落ちるためガードが機能しない） |
  | C | rasterScore + featureScore + VRAM | 複雑になるだけで説明できなくなる |
  → **単純で説明できる案Aを採用**。VRAM不足は target を下げるのではなく、
    長所・注意点（Phase 4 で導入したデータ導出）で個別に伝える。

- **採用した基準**（`shared/gpu/gpu-target.js`）:
  ```
  rasterScore >= 85 → 4K
  rasterScore >= 65 → WQHD
  それ未満          → FHD
  ```
  閾値は「境界±1に張り付くGPUが最も少ない」点を選んだ（1点差で判定が変わる不自然さを避ける）。
  候補 62/65/68/70 を比較し、WQHD境界に1件しか無い 65 を採用。
  **market・世代は判定に使わない**（「中古だからWQHD」は説明不能なため）。

- **target の定義**（明文化）:
  - FHD … 最新ゲームをフルHDで現実的に狙える性能帯
  - WQHD … WQHDを主用途として検討しやすい性能帯
  - 4K … 4Kを主用途として検討できる性能帯
  ★「出力できる最大解像度」ではない。RTX 3060 でも4K出力自体はできる。

- **変更ファイル**:
  - `shared/gpu/gpu-target.js`（**新規**・判定の唯一の情報源）
  - `gpu-guide/gpus.json`（target 17件変更。`recommendedResolution` も同時更新）
  - `gpu-guide/generate-gpu-pages.js`（判定理由の一文を追加）→ 65ページ再生成
  - `pc-build-check/script.js` / `index.html` / `sw.js`（共通モジュールを参照）
  - `gpu-guide/test-gpu-data.js`（target整合テストを追加 50→68件）

- **target 変更 17件**:
  ```
  WQHD→FHD  (中古10件) RX 5700 XT(50) RTX 2070 SUPER(51) GTX 1080 Ti(53)
                       RTX 2080(53) RX 6700(53) RTX 2080 SUPER(56)
                       RX 6700 XT(58) RX 6750 XT(61) RTX 3070(62) RTX 2080 Ti(62)
  4K→WQHD   (中古4件)  RX 6900 XT(79) RTX 3080 Ti(80) RTX 3090(82) RX 6950 XT(82)
  FHD→WQHD  (現行1件)  RTX 5060 Ti(68)
  WQHD→4K   (現行2件)  RTX 5070 Ti(88) RX 9070 XT(91)
  ```
  （括弧内は rasterScore）

- **PC BUILD CHECK 診断の変化**:
  - 75パターン中 **23件で表示が変化**、警告は **32件 → 20件**。
  - **新たに警告が出るようになったケースは0件**（緩和方向のみ）。
  - **提示GPU・CPUの変化は0件**（構成そのものは変えていない）。
  - 消えた12件はすべて**誤警告**だった。例:
    `4K/20万/fps` で RX 9070 XT（raster 91）に「4Kは厳しめ」と出ていたのが解消。
  - 「警告を消したのに適性が足りない」ケースは0件（機械検証済み）。
  - ★既存132件のテストは**期待値を1つも書き換えずに通過**した。
    これらは判定結果ではなく整合ルールを検証しているため。

- **今後のズレ防止**:
  - `test-gpu-data.js` に「保存値 === deriveTarget()」を全件検証を追加。
    GPUを追加して target を手入力ミスすると**テストが落ちる**。
  - 同じ rasterScore なら同じ target であること、market間で基準がズレていないこと、
    FHD/WQHD/4K帯が重ならないことも検証。
  - 境界値（64/65/66・84/85/86・0・100）を回帰テストとして固定。

- **テスト結果**:
  - `node gpu-guide/test-gpu-data.js` … **68件成功 / 0件失敗**（50→68）
  - `node gpu-guide/test-gpu-pages.js` … **1,643件成功 / 0件失敗**（維持）
  - `node pc-build-check/test-build-check.js` … **132件成功 / 0件失敗**（維持）
  - `node upgrade/test-upgrade-engine.js` … **64件成功 / 0件失敗**（維持）
  - `node scripts/test-cross-links.js` … **61件成功 / 0件失敗**（維持）
  - ブラウザ実測（PC 1280px / スマホ 390px）: **JSエラー0・横スクロールなし・404なし**。
    全ページでバッジと「得意」行が一致、解像度フィルタは該当targetのみを返すことを確認。

- **他サービスへの影響確認**:
  - Upgrade: `RESOLUTION_TARGETS`（fhd42 / wqhd62 / 4k88）と新targetの対応を確認。
    FHD帯は全てFHD、4K帯は全て4Kで矛盾なし。**エンジンは変更していない**。
  - GAME PC GUIDE: 推奨GPUの適性より高い解像度を勧めているケース **0件**。

- **未対応・次にやること**:
  - `rasterScore` 自体は外部ベンチマーク由来ではなく独自指数のまま。
    今回は既存指数内での整合を優先した（全GPU再採点はしていない）。
  - RTX 5050 の scoreSource（推定値であることの明示）は未実装 → Phase 6 候補。

- **別AIへの引き継ぎ注意点**:
  - **閾値を変えるときは `shared/gpu/gpu-target.js` だけを直す**。
    `gpus.json` の target は導出値と一致していることをテストが保証する。
  - **`gpus.json` の target を手で書き換えない**。rasterScore を直せば target は導出で決まる。
  - GPUを追加したら `node gpu-guide/test-gpu-data.js` で target のズレを検出できる。

---

## 2026-09-03 — GPU GUIDE のデータ精度・比較価値を強化（Phase 4）

- **修正目的**:
  Phase 2 で「GPUごとに検索から入れるページ」、Phase 3 で「他サービスからの導線」を作った。
  Phase 4 は **来たユーザーがそのページだけでGPUの立ち位置を理解し、比較し、
  次の行動を決められる状態**にすること。項目を増やすことは目的にしない。

- **変更ファイル**:
  - `gpu-guide/gpus.json`（RTX 5050 を追加。64→65件）
  - `gpu-guide/cpu-recommendations.json`（RTX 5050 / RX 9060 XT を追加。28→30件）
  - `gpu-guide/generate-gpu-pages.js`（長所・注意点の導出／比較カードの情報追加）
  - `gpu-guide/style.css`（比較カードの性能差バッジ）
  - `gpu-guide/gpu/<id>/index.html`（65件再生成）/ `sitemap.xml`（66URL）
  - `gpu-guide/test-gpu-data.js`（**新規**・データ整合性テスト50件）
  - `scripts/test-cross-links.js`（件数のハードコードを廃し、データ由来に変更）

- **監査結果（変更前）**:
  - フィールド欠損は **中古系9項目が現行GPU21件で欠損**。偏りを調べたところ
    ブランド差ではなく世代差（RTX 40/50・RX 7000/9000 = 現行）で、**意図的な設計**。
  - ただし `pros` / `cons` は中古固有の概念ではないのに現行GPUに無く、
    **新品購入を検討して来た人のページにだけ長所・注意点が1つも出ていなかった**。
  - サイト全体のGPU参照 **205件中10件が未解決**。内訳は
    ① `rtx5050`（Upgradeの交換候補＋ゲーム5件で推奨）＝**実害あり**
    ② `rtx4090` 等5件（upgrade の GPU_TIERS ＝「今持っているGPU」の入力辞書。
       掲載対象外でも診断は成立する）＝実害なし
    ③ affiliate master の3件（掲載していない商品）＝実害なし
  - データ矛盾（重複id/name・範囲外スコア・compare自己参照・存在しない参照・
    brand不一致・価格レンジ逆転）は **0件**。
  - 同一世代内での型番とスコアの逆転も **0件**。

- **変更内容**:
  1. **RTX 5050 を追加**（64→65件）。参照側が実在する以上データ側を埋めるのが筋。
     数値はすべてリポジトリ内データが根拠：
     power 130 / price 35000 は `upgrade-engine.js`、name/brand は `affiliate-master.json`。
     rasterScore 46 は GPU_TIERS(44) と gpus.json の rasterScore を**全65件で最小二乗回帰**
     （raster = 0.9411×tier + 4.809、R²=0.964）して算出。
     score 57 は全件から導いた `score ≒ 0.75×raster + 0.25×feature`（平均誤差1.88）。
     **推測値は作っていない**。
  2. **長所・注意点をデータから導出**。手書きの pros/cons があればそれを優先し、
     無い現行GPU22件は VRAM容量・消費電力・機能スコア・価格性能比という
     **gpus.json にある数値から言える事実だけ**を出す。
     「速い」「おすすめ」のような主観評価もレビュー文も作らない。
     比較の母集団は現行同士・中古同士に分ける（世代混在で割安判定が壊れるため）。
  3. **比較カードに判断材料を追加**。旧実装はブランド名とGPU名だけで
     「なぜ比べるのか」が分からなかった。rasterScore の差を%で示し、VRAMと価格を添えた。
     ±3%未満は「ほぼ同等」として誤差を優劣に見せない。
  4. **CPU相性を現行GPU全件へ**。28→30件。追加した2件は同じFHD帯の現行GPUに
     既に入っている3段構成（コスパ／バランス／ハイエンド）に合わせ、
     文面だけ各GPUの実データ（VRAM・消費電力）に沿って書き分けた。
  5. **テストの件数ハードコードを廃止**。GPU数・構成数・ゲーム数を
     すべて JSON の件数から導くようにした（GPUが増えても追従する）。

- **効果**:
  - 本文が最も薄いページ **1798字 → 2152字**、現行GPU平均 **2382字 → 2661字**。
  - h2が4個しかないページが消滅（全65ページが6〜7個）。
  - title / description は **65/65 すべてユニーク**。

- **あえて変更しなかったもの（重要）**:
  - **`target` の判定基準のズレ**。同じ rasterScore でも現行GPUの方が
    中古GPUより厳しい target が付いている（5組で不一致。例: RTX 5060 Ti raster68=FHD /
    RX 6800 raster68=WQHD）。しかし `target` は
    **GPU GUIDE の解像度フィルタ・ランキングと、PC BUILD CHECK の
    「解像度が足りない」警告の両方を動かしている**。
    ここを触ると診断結果が変わるため、Phase 4 の対象外と判断した。→ Phase 5 候補。
  - **ゲーム別FPS値**。データが無いので作らない（方針維持）。
  - **価格の更新日・出典フィールド**。現在 gpus.json に無い。
    表示は「価格目安」「時期によって変動する」と明記済みで誤認は招かないため、
    フィールド追加は見送り。→ Phase 5 候補。

- **テスト結果**:
  - `node gpu-guide/test-gpu-data.js` … **50件成功 / 0件失敗**（新規）
  - `node gpu-guide/test-gpu-pages.js` … **1,643件成功 / 0件失敗**（65ページ化で増加）
  - `node pc-build-check/test-build-check.js` … **132件成功 / 0件失敗**（維持）
  - `node upgrade/test-upgrade-engine.js` … **64件成功 / 0件失敗**（維持）
  - `node scripts/test-cross-links.js` … **61件成功 / 0件失敗**（維持）
  - ブラウザ実測（PC 1280px / スマホ 390px・GPU10種）:
    **JSエラー0・横スクロールなし・404なし・img alt欠落0**。
    検索5パターン（型番フル/小文字/GeForce付/数字のみ/0件）、
    フィルタ組み合わせと解除、ランキング4種、
    検索→カード→比較GPU→Upgrade の実操作すべて成功。

- **別AIへの引き継ぎ注意点**:
  - **`target` を変更するときは PC BUILD CHECK の警告への影響を必ず確認する**
    （`pc-build-check/script.js` の `getResolutionFit` が参照している）。
  - 長所・注意点は generator が**データから導出**している。
    文章を足したいときは `gpus.json` の `pros`/`cons` に書けばそちらが優先される。
  - **GPUを追加したら `cpu-recommendations.json` にも足す**。
    現行GPUにCPU相性が無いと `test-gpu-data.js` が落ちる（意図的な検出）。
  - テストはGPU数をハードコードしていない。`gpus.json` に足せば期待値も追従する。

---

## 2026-09-03 — サイト間導線をGPU個別ページへ直結（Phase 3）

- **修正目的**:
  Phase 2 で GPU 個別ページを静的化したのに、PC BUILD CHECK などからは
  旧形式 `/gpu-guide/?gpu=<GPU名>` でリンクしたままだった。
  GPU GUIDE トップはこの `gpu` クエリを解釈しないため、
  **「GPU詳細を見る」を押すとフィルタ無しのGPU一覧に着地**し、
  ユーザーが目的のGPUを自分で探し直す状態だった（ボタン文言との不一致）。
  サイト内でGPUが特定できる場所は、すべて個別ページへ直接つなぐ。

- **変更ファイル**:
  - `shared/gpu/gpu-links.js`（**新規**・GPU名→個別ページURLの共通解決）
  - `scripts/test-cross-links.js`（**新規**・導線テスト60件）
  - `pc-build-check/script.js` / `index.html`（診断結果を静的URLへ＋Upgrade導線追加）
  - `pc-build-check/generate-builds.ps1` → 構成75ページ再生成
  - `game-pc-guide/Generate-StaticGames.ps1` → ゲーム25ページ再生成
  - `game-pc-guide/style.css` / `sw.js`（GPUリンクのスタイル・キャッシュ版）
  - `upgrade/upgrade-diagnose.js` / `index.html` / `style.css`（おすすめGPUの詳細リンク）
  - `gpu-guide/index.html`（`?gpu=` 後方互換）/ `gpu.html`（他サービス導線）
  - `pc-build-check/sw.js`（キャッシュ版 v4→v5・`gpu-links.js` を追加）
  - `generate-builds.ps1`（ルート直下の**古いコピー**に実行ガード）

- **変更内容**:
  1. **GPU名→id 解決を1か所に集約** … `shared/gpu/gpu-links.js` を新設。
     サイト内のGPU表記は実測で3系統しかない
     （`GeForce RTX 5070 Ti` / `RTX 5070 Ti` / `rtx5070ti`）。
     小文字化 → GeForce/Radeon/AMD 接頭辞除去 → 英数字以外除去 で同じキーに落ちる。
     **マスターは gpus.json 1つ**。対応表を各ページに手書きしない。
     **部分一致はしない**（`RTX 50` のような入力で誤ヒットさせない）。
     解決できなければ `null` を返し、呼び出し側が「リンクしない」か
     「GPU GUIDEトップへ」を選ぶ。**間違ったGPUページへ送らない**。
  2. **PC BUILD CHECK 診断結果** … `createGpuGuideUrl()` が静的URLを返すように変更。
     ボタン文言も実態に合わせ「Radeon RX 9070 の詳細スペックを見る」に。
     解決できないGPUのときだけ「グラボを比較して選ぶ」＋トップへ。
     あわせて**Upgradeへの導線を新設**（診断結果には1本も無かった）。
  3. **構成詳細75ページ** … generator が生成時にidを解決して直リンクを埋め込む。
     Upgradeカードも追加（4導線に）。`?gpu=` は**0件**になった。
  4. **ゲーム25ページ** … 構成表のGPU名を個別ページへリンク（`.build-gpu-link`）。
     `gpus.json` に無い `RTX 5050` は**リンクにしない**（誤リンクを作らない）。
     関連サイトに PC UPGRADE カードを追加（3サービスへ）。
  5. **Upgrade診断** … おすすめGPU／現状維持時の現GPUから詳細ページへリンク。
     **診断ロジック・エンジンは一切変更していない**（結果でURLも変えない方針を維持）。
  6. **`?gpu=` 後方互換** … リンク元を全部直しても検索結果・SNS・履歴に残るため、
     GPU GUIDEトップでも受け止める。`gpus.json` で**実在確認してから**遷移し、
     不正名・空・fetch失敗・JS無効では**何もしない＝通常のトップが見える**。
     canonicalは書き換えない（`?gpu=` を別ページ扱いさせない）。
  7. **旧 gpu.html に他サービス導線を追加** … 通常は静的ページへ遷移するが、
     JS無効・GPU未発見時はここが最終画面になる。行き止まりにしない。

- **⚠️ 途中で見つけた問題と対処**:
  1. **`game-pc-guide/Generate-StaticGames.ps1` が古かった**（Phase 1 と同じ型の事故）。
     そのまま再生成したところ、25ページから
     **PWA meta・ヘッダーの「GPU比較/PC診断」リンク・戻るナビ・
     `viewport-fit=cover`・画像の loading/decoding が消えた**。
     差分確認で気付き、`git checkout` で戻してから generator 側に復元して再生成。
     → 復元後は25/25で全要素の存在を確認済み。
  2. 同 generator は `$today` がハードコード（2026-05-29）で、
     再生成のたび sitemap の `lastmod` が**過去へ巻き戻っていた**
     （本番は 2026-05-31）。実行日を使うよう修正。
  3. 同 generator は `Set-Content -Encoding UTF8` でBOMを付けていた
     （本番ページはBOM無し）。`UTF8Encoding $false` で書くよう修正。
  4. **ルート直下の `generate-builds.ps1` が旧形式 `?gpu=` を持つ古いコピー**だった。
     H1一意化・廃止スラグ・マザーボード表も欠けており、実行すると75ページが退行する。
     中身は直さず**実行ガード**（`-Force` 無しは exit 1）を追加。

- **テスト結果**:
  - `node scripts/test-cross-links.js` … **60件成功 / 0件失敗**（新規）
  - `node gpu-guide/test-gpu-pages.js` … **1,618件成功 / 0件失敗**（維持）
  - `node pc-build-check/test-build-check.js` … **132件成功 / 0件失敗**（維持）
  - `node upgrade/test-upgrade-engine.js` … **64件成功 / 0件失敗**（維持）
  - ブラウザ実測（PC 1280px / スマホ 390px）: **JSエラー0・横スクロールなし・404なし**。
    クリック導線を実測し、構成詳細→GPU詳細／ゲーム→GPU詳細／診断結果→GPU詳細／
    GPU詳細→4サービス／一覧→GPU詳細 がすべて正しい着地。
    `?gpu=` 有効名→個別ページ、無効名・空→トップ正常表示も確認。

- **未対応・次にやること**:
  - **共通ナビ（`shared/nav/`）は今回も追加しなかった**。
    調査の結果、詳細ページ3種すべてが既に文脈リンクで4サービスへ到達できており
    （今回 gpu.html とゲームページの欠けを埋めて全ページ○になった）、
    ここにドロップダウンを重ねると**同じ導線が二重になりUIを圧迫する**と判断した。
    追加するなら「現在地表示」の価値が主目的になるので、必要性が出てから。
  - `RTX 5050` が `gpus.json` に無い（ゲーム5件・upgrade候補1件で参照）。
    データ追加は Phase 4 以降で判断。

- **別AIへの引き継ぎ注意点**:
  - **GPU詳細のURL仕様を変えるときは `shared/gpu/gpu-links.js` を直す**。
    PowerShell 側（`generate-builds.ps1` / `Generate-StaticGames.ps1`）にも
    同じ正規化規則が入っているので**3か所を必ず揃える**。ズレると
    「一覧には出るのにリンクが解決しない」が起きる。
  - **generator を回す前に必ず生成物とHEADの差分を確認する**。
    今回も game-pc-guide の generator が古く、要素が消える事故が起きた。
  - **ルート直下の `generate-builds.ps1` と `gpu-guide/generate-sitemap.ps1` は
    廃止済み**（実行ガード付き）。使わないこと。

---

## 2026-09-02 — GPU GUIDE の個別ページを静的化（Phase 2）

- **修正目的**:
  GPU詳細が `gpu.html?id=<id>` というクエリURL1本に64件同居し、soft404回避のため
  `noindex` を常設していたため、**「RTX 3060 性能」のような型番検索にまったく載らなかった**。
  GSC上も GPU GUIDE は表示227・クリック3（CTR 1.3%）とトップ1枚で漠然と拾われる状態だった。
  64GPUを `/gpu-guide/gpu/<id>/` として静的化し、GPUごとに検索対象になる構造へ変更する。

- **変更ファイル**:
  - `gpu-guide/generate-gpu-pages.js`（**新規**・生成＋自動検証）
  - `gpu-guide/test-gpu-pages.js`（**新規**・本番ファイルの検証 1,618件）
  - `gpu-guide/gpu/<id>/index.html`（**新規生成 64件**）
  - `gpu-guide/script.js`（一覧カード・ランキング行のリンクを静的URLへ）
  - `gpu-guide/gpu-detail.js`（比較カードのリンクを静的URLへ）
  - `gpu-guide/gpu.html`（**旧URL互換スクリプト**を追加。削除はしない）
  - `gpu-guide/style.css`（個別ページ用のCSSを追記。**197行追加・0行削除**）
  - `gpu-guide/sitemap.xml`（1 → 65URL）
  - `gpu-guide/sw.js`（キャッシュ版 v4 → v5）
  - `gpu-guide/generate-sitemap.ps1`（**廃止ガード**を追加）

- **変更内容**:
  1. **URL設計** … `/gpu-guide/gpu/<id>/`。idは `gpus.json` の既存idをそのまま使う
     （表示名からslugを作らない＝名前が変わってもURLが変わらない）。
  2. **本文を静的HTMLに焼き込み** … GPU名・概要・タグ・スコア内訳・スペック4項目・
     解像度別の目安・長所/注意点・中古情報・ゲーム・CPU・比較GPU・導線をサーバ側で出力。
     **JSが動かなくても主要コンテンツが読める**（購入ボタンだけJSで後付け）。
  3. **一時ディレクトリ → 自動検証 → 本番反映** … Phase 1 の退行事故を踏まえ、
     `.generated-preview/` に生成して検証を通ったときだけ `gpu/` へ反映する。
     `--dry-run` で反映せず検証だけもできる。検証NGなら本番に触れずに exit 1。
  4. **条件付き表示** … 中古情報は `market: used` のGPUのみ（現行GPUに中古見出しを出さない）。
     CPU相性は `cpu-recommendations.json` にある28件のみ。長所/注意点も持つGPUのみ。
     **空見出しを並べない**。
  5. **クロスリンクをCPUデータから完全に切り離した** … 旧 `gpu-detail.js` は
     `renderCpuSection()` の内側にPC BUILD CHECK/GAME PC GUIDEのリンクを置いていたため、
     CPU相性データの無い36GPUでリンクごと消えていた。静的側は「次にできること」を
     独立セクションにし、**全64ページで PC BUILD CHECK / Upgrade / GAME PC GUIDE /
     GPU GUIDE戻り の4導線を必ず出す**（テストで固定化）。
  6. **SEO** … title は `market` で文面を変える（中古狙いのGPUは「中古で買う前に見る目安」、
     現行GPUは「性能・スペック・<target>での目安」）。description はスコア・VRAM・電力・
     価格（中古なら相場レンジ）をデータから組み立てるため、GPUごとに内容が変わる。
     canonical は自己参照のディレクトリURL。**noindexは入れない**。
  7. **構造化データ** … `BreadcrumbList` + `TechArticle`。
     **Product は使わない**（実体は解説ページで offers/review/aggregateRating を持たないため、
     捏造して成立させない）。**FAQPage も出さない**（ページ上に見えるFAQが無いため）。
  8. **旧URL互換** … `gpu.html?id=` は削除せず `noindex, follow` のまま維持。
     `gpus.json` で **実在を確認してから** `location.replace()` で静的URLへ寄せ、
     同時に canonical も静的URLへ差し替える。**不正idは飛ばさず従来のエラー表示**
     （404へ飛ばさないため）。fetch失敗・JS無効でも従来の `gpu-detail.js` 描画が
     残るので行き止まりにならない。
  9. **解像度の表現** … 「FHD向けだからWQHDでは使えない」のような断定をしない。
     target を基準に「余裕あり / 得意 / 狙える / 設定調整が必要」の4段階で表す。
  10. **FPS値を作らない** … `gpus.json` にゲーム別FPSが無いため、ゲーム名は出すが
      具体的なfps数値は書かない（「※フレームレートはゲーム・画質設定・CPUによって
      変わります」と明示）。

- **影響範囲**:
  GPU GUIDE のみ。PC BUILD CHECK / Upgrade / GAME PC GUIDE のロジック・データは無変更。
  アフィリエイトは既存の `shared/affiliate/` をそのまま使い、構造は変更していない。

- **⚠️ 途中で起こした問題と対処**:
  1. `gpu-guide/generate-sitemap.ps1` は `*.html` を再帰的に拾うだけなので、
     実行すると `gpu/<id>/index.html` という**index.html付きURL**で sitemap を
     上書きし、各ページの canonical（ディレクトリURL）と食い違うことが判明。
     → **廃止ガード（`param([switch]$Force)` で既定は exit 1）を追加**。
     sitemap は `generate-gpu-pages.js` が生成する。
  2. その廃止ガードを一度スクリプト置換で入れた際、クォートを壊して
     PowerShellのパースエラーにしてしまった。`git checkout` で戻し、
     編集ツールで入れ直して `-Force` 側の構文も含め動作確認済み。

- **テスト結果**:
  - `node gpu-guide/test-gpu-pages.js` … **1,618件成功 / 0件失敗**（新規）
  - `node pc-build-check/test-build-check.js` … **132件成功 / 0件失敗**（回帰・維持）
  - `node upgrade/test-upgrade-engine.js` … **64件成功 / 0件失敗**（回帰・維持）
  - 64ページ全数チェック: affiliate.css / affiliate-config.js / affiliate.js /
    広告表記 / `data-sippo-theme` / canonical / BreadcrumbList / TechArticle /
    3サービスへのリンク = **すべて 64/64**。noindex混入 **0件**。
  - ブラウザ（Chromium / PC 1280px・スマホ 390px）: **JSエラー0件・横スクロールなし**。
    一覧カード64枚すべて新URLへリンクし、クリック遷移も確認。
    旧URL `?id=rtx-3060` → `/gpu-guide/gpu/rtx-3060/` へ遷移、
    不正id `?id=does-not-exist` は従来のエラー表示のまま（404にしない）を確認。

- **未対応・次にやること**:
  - **Phase 3（導線整備）へ進んでよい状態**。
  - `/gpu-guide/?gpu=<GPU名>` を GPU GUIDE 側が読んでいない問題は**まだ残っている**。
    PC BUILD CHECK の診断結果・構成詳細75ページの「GPU詳細を見る」が
    GPU一覧トップに着地する。静的個別ページができたので、
    **Phase 3 でGPU名→idを引いて `/gpu-guide/gpu/<id>/` へ直リンクするのが本筋**。
  - 共通ナビの101ページ展開（`pc-build-check/builds/*.html` 75 /
    `game-pc-guide/games/*.html` 25 / `gpu.html`）も未着手。
    今回作った64ページには共通ナビを入れていない（Phase 3 で他ページとまとめて判断）。

- **別AIへの引き継ぎ注意点**:
  - **生成物 `gpu-guide/gpu/<id>/index.html` を直接編集しない**。
    内容変更は `generate-gpu-pages.js` を直して再実行する。
  - **`gpu-guide/generate-sitemap.ps1` を実行しない**（廃止・ガード済み）。
    sitemap は `node gpu-guide/generate-gpu-pages.js` が更新する。
  - **`gpu.html` を削除しない**。旧URLの被リンク・ブックマーク受け皿。
  - **`style.css` を更新したら `sw.js` の `CACHE_NAME` を上げる**。
    上げないと再訪ユーザーに旧CSSが配られ、新ページが未スタイルで表示される。
  - GPUを追加するときは `gpus.json` に足して `node gpu-guide/generate-gpu-pages.js`
    を実行するだけでページ・sitemapが増える。

---

## 2026-09-02 — PC BUILD CHECK の診断精度・表示整合性を修正（Phase 1）

- **修正目的**:
  PC BUILD CHECK が「4Kを選んだのにFHD向けGPUを提示し、しかも何の注意も出さない」
  状態だったため、**足りないときは足りないと正直に表示する**（`/upgrade/` と同じ方針）
  形に直す。あわせて型番の部分一致による性能誤判定と、データの重複・矛盾を解消する。

- **変更ファイル**:
  - `pc-build-check/script.js`（プロファイル判定・解像度適性・結果表示）
  - `pc-build-check/style.css`（注意書きUI `.resolution-notice` ほか）
  - `pc-build-check/builds.json`（重複解消・タイトル機械生成）
  - `pc-build-check/generate-builds.ps1`（廃止スラグ対応＋**アフィリエイト記述の復元**）
  - `pc-build-check/builds/*.html`（75件再生成）/ `sitemap.xml`
  - `pc-build-check/index.html`（全構成一覧のリンク差し替え）
  - `pc-build-check/test-build-check.js`（**新規**・回帰テスト132件）
  - `gpu-guide/gpus.json`（Radeon RX 9060 XT を1件追加）

- **変更内容**:
  1. **Ti誤判定の修正**（最長キー優先）
     `getPerformanceProfile()` が `includes()` の先頭ヒットを採用していたため、
     `"rtx 5060 ti".includes("rtx 5060")` が成立して RTX 5060 Ti が
     profile 3 ではなく profile 2 に落ちていた（RTX 5070 Ti も同様）。
     **マッチしたキーのうち最長のものを採用**する方式に変更。
     下位モデル名は上位モデル名の接頭辞なので、Ti / SUPER / Ti SUPER / XT / XTX
     すべてに一般化でき、定義の並び順にも依存しない。19パターンの表示が是正された。
  2. **解像度適性の判定を追加**（`getResolutionFit()`）
     `gpu-guide/gpus.json` の `target` と選択解像度を突き合わせ、
     足りなければ注意書きを出す。**構成は隠さず、高価なGPUへの差し替えもしない**。
     予算を守った結果として足りないなら、その事実と代替案（WQHD/FHDで使う）を示す。
     gpus.json が読めない場合は `unknown` を返し、**勝手に「足りている」と言わない**。
  3. **解像度レベルの導入**（`RESOLUTION_LEVELS` = fhd:1 / wqhd:2 / 4k:3）
     文字列のif文を増やさず大小比較できるようにした。UWQHD等は1行追加で対応可能。
     `"FHD"`（gpus.json）と `"fhd"`（フォーム）を同じ尺度で読む正規化も込み。
  4. **結果表示の役割分離**
     旧「推奨解像度」1項目に全部を詰め込んでいたのをやめ、
     **「選んだ条件」「このグラボの得意な解像度」「推奨電源容量」**の3カードに分割。
  5. **矛盾する文面の抑制**（★調査で追加発見した問題）
     不足警告を出すのに「4Kで最高画質を堪能できます」が並ぶ自己矛盾があった。
     警告時は `comfortMessage` / `whyMessage` を出さず、快適バッジと
     「こんな人に向いています」も実際に快適な解像度に合わせる。テストで固定化。
  6. **builds.json の整理**
     - `4k/creative/300000` の重複（id14 / id66、CPU違いのみ）を解消。
       **id66 を欠番だった `4k/stream/200000` へ振り替え**、
       「該当する構成がありません」になっていた1パターンも同時に解消（74→75件）。
     - タイトルを `解像度 + 用途 + GPUの性格付け` から**機械生成**。
       後半の「最新世代WQHD向け」等はGPUの性格付けであり内容は誤りではなかったが、
       先頭の解像度と別の解像度を並べていたため矛盾に見えていた。
       後半から解像度表記を外して解消（62件書き換え・矛盾0件）。
  7. **Radeon RX 9060 XT を gpus.json に追加**
     builds.json では使われているのに GPU GUIDE に存在せず、詳細ページへ飛べなかった。
     性能値は**リポジトリ内の既存データのみ**を根拠にした（推測値を作らない）:
     rasterScore 61（upgrade-engine の GPU_TIERS 62 を rtx-5060=58 / rtx-5060-ti=68 で線形補間）、
     power 160 / price 55000（GPU_POWER・PRICE_HINT）、
     featureScore 88（同じRDNA4の rx-9070 と同値）、vram 16。
  8. **廃止スラグの仕組みを generator に追加**
     重複解消で不要になった `4k-creative-30man-2.html` は**削除せず**、
     canonical を統合先へ向けた案内ページに置換（既存インデックスURLを404にしない）。
     sitemap には載せない。`$retiredSlugs` に1行足せば今後も同じ扱いにできる。

- **影響範囲**:
  PC BUILD CHECK の診断結果・静的75ページ・sitemap。GPU GUIDE は gpus.json に1件追加のみ
  （表示ロジックは無変更、64件に増加）。**Upgrade・Game PC Guide・アフィリエイト構造は無変更**。

- **⚠️ 途中で起こした事故と復旧（重要）**:
  `pc-build-check/generate-builds.ps1` は**それ自体が古く**、本番ページにある
  アフィリエイト記述（`affiliate.css` / `data-sippo-theme="dark"` /
  広告表記 / `affiliate-config.js` / `affiliate.js` / `build-affiliate.js`）を
  **1つも含んでいなかった**。そのまま再生成した結果、75ページから収益リンクと
  景表法対応の広告表記が消えた。差分確認で気付き、**ページを git checkout で戻し、
  generator 側にこれらを復元してから再生成**した。
  → 復元後は 75/76ページすべてに広告表記・アフィリエイト基盤が入っていることを確認済み。
  **教訓: generator を回す前に「生成物とHEADの差分」を必ず確認すること。**

- **テスト結果**:
  - `node pc-build-check/test-build-check.js` … **132件成功 / 0件失敗**（新規）
  - `node upgrade/test-upgrade-engine.js` … **64件成功 / 0件失敗**（回帰・変化なし）
  - 修正前後の75パターン差分: **GPU変更0件 / CPU変更0件**（意図しない構成変化なし）。
    変化したのは profile 19件・タイトル61件・診断可能になった1件のみ。
  - ブラウザ確認（Chromium / PC 1280px・スマホ 390px）: JSエラー0件・横スクロールなし。

- **未対応・次にやること**:
  - Phase 2（GPU GUIDE 個別ページの静的化）へ進んで問題ない状態。
  - `gpu-guide/?gpu=` のクエリを GPU GUIDE 側が読んでいない問題は**未修正**
    （「GPU詳細を見る」がGPU一覧トップに着地する）。Phase 2 で静的個別ページを
    作ってから直すのが筋なので、今回は意図的に触っていない。
  - 共通ナビの101ページ展開（Phase 3）も未着手。

- **別AIへの引き継ぎ注意点**:
  - **`getPerformanceProfile()` を `includes()` の先頭ヒットに戻さないこと**（Ti誤判定が再発する）。
  - **不足警告を出すときに「選んだ解像度で快適」と断言する文面を足さないこと**。
    テスト（項目11）で固定化してある。
  - **ルート直下の `generate-builds.ps1` は使わない**（さらに古い別コピー）。
    使うのは必ず `pc-build-check/generate-builds.ps1`。
  - builds.json は PowerShell の `ConvertTo-Json` 出力（BOM付き・CRLF・桁揃え）。
    `JSON.stringify` で書き直すと全行差分になるため、値だけをテキスト置換すること。

---

## 2026-08-23 — GPU推奨ロジックを「費用対効果」ベースへ全面見直し（過剰推奨の修正）

- **修正目的**:
  RX 9070 / WQHD / 144fps / 重量級 / 予算20万円 と入力すると
  **RTX 5090（約45万円）を勧め、そのまま「PC買い替え推奨」**に落ちていた。
  高性能GPUを既に持っている人ほど不要な交換を勧めてしまう状態だったため、
  「要求スペックを100%満たす最高性能GPUを選ぶ診断」から
  **「実際にお金を払って交換する価値があるかを判断する診断」**へ変更する。

- **変更ファイル**:
  - `upgrade/upgrade-engine.js`（GPU判定ロジック本体・買い替え判定）
  - `upgrade/upgrade-diagnose.js`（予算オーバー参考候補の表示）
  - `upgrade/style.css`（同上のスタイル `.u-part__over`）
  - `upgrade/test-upgrade-engine.js`（ケースA〜E等のテスト追加 45→64件）

- **変更内容**:
  1. **目標fpsを絶対条件にしない**
     `COMFORT_BANDS`（ideal 100% / recommended 70% / comfortable 55%）を新設。
     144fps指定は「144Hzモニターを活かしたい希望」として扱い、
     重量級ゲームでの常時144fps維持を必須要件にしない。
     目標の70%以上に達していれば `keep`（現状維持）を返す。
  2. **重量級ゲームの係数を緩和** `USAGE_WEIGHT.heavy` 1.25 → 1.12。
     RT/PT指定欄が無い以上、パストレ最高設定という最悪条件を仮定しない。
     高〜最高設定＋アップスケーリング利用を基準にした。
  3. **候補選定を全面刷新** `rankGpuCandidates()` を新設。
     旧: 「要求性能を満たす中でいちばん安いもの」を機械的に選択。
     新: 性能向上率・予算・費用対効果・目標到達度を総合評価してスコア順に並べる。
     並び順は ①予算内 ②快適水準(55%)到達 ③スコア の3段階。
     目標を超える性能は `usefulRatio` で頭打ちにするため、
     **最上位GPUは価格の分だけ自動的に不利**になる（製品名は一切見ていない）。
  4. **性能向上率のしきい値** `GAIN`（pointless 1.15 / small 1.30 / worth 1.50）。
     15%未満の伸びは候補にすら入れない（RX 9070 → RX 9070 XT 等を防ぐ）。
     15〜30%は `consider`（効果小）止まりにする。
  5. **費用対効果** `COST_PER_GAIN`（good 2600 / fair 5200 円/1%）。
     「1%伸ばすのにいくら払うか」で評価し、悪ければ `upgrade` にせず
     `consider`（費用対効果は低め）に落とす。
  6. **予算を強い制約に** 予算内に候補が無い場合は
     **無理に勧めず `keep` を返す**（旧実装は予算フィルタが空振りすると
     そのまま予算外GPUを返すバグがあった）。
     参考として最安候補を `referenceId` で返し、UI側は
     「予算オーバー（参考）」枠に分離して表示（購入ボタンは出さない）。
  7. **到達不能な目標**（4K/240fps/重量級 等）は `recommended`(70%) に
     どの候補も届かないため `consider`＋目標見直し提案を返す。
  8. **買い替え判定** 「4点以上replace」の条件から `cpuWeak` を外した。
     GPU推奨の適正化で交換費用が下がり、金額だけでは
     「実質組み直し」の状況を捕まえられなくなったため。
  9. **GPUデータの欠落を補完** `RTX 4090` / `RTX 4070 Ti` / `RTX 3090 Ti` が
     `GPU_TIERS`・`GPU_POWER` に無く unknown 判定になっていたので追加
     （現在所有GPUとしてのみ。販売終了品なので購入候補リストには入れない）。

- **影響範囲**:
  - テスト 64件すべて成功（既存45件は無改変で通過）。
  - 全2304通り（GPU16 × 解像度3 × fps4 × 用途3 × 予算4）を総当たりで検証し、
    例外0件 / 予算超過の「おすすめ」0件 / 性能が下がる提案0件。
  - 期待結果（ケースA〜E）:
    - A: RX 9070 / WQHD144 / 重量級 / 20万 → **現状維持**（RTX 5090は出ない）
    - B: RTX 3060 / 同条件 → RX 9070 XT（13.5万・予算内）
    - C: GTX 1660 SUPER / WQHD144 / 12万 → RX 9070（11万・明確に交換推奨）
    - D: RTX 4090 / WQHD144 → 現状維持
    - E: RTX 3060 / 4K144 / 予算なし → RTX 5090（ハイエンドも候補になり得る）
  - CPU・メモリ・電源・ストレージ判定は未変更。
    GPU交換時の電源容量判定は `recommendId` 経由なので従来どおり動作。
  - アフィリエイト処理・UI構造・スマホ表示は変更なし
    （追加した `.u-part__over` は既存トークンのみ使用）。

- **未対応・次にやること**:
  - `PRICE_HINT` は手動更新の固定値（日本国内新品実売の中央値寄り）。
    相場変動時は要見直し。外部API連携は未導入。
  - RT/PT・アップスケーリングの利用有無を入力項目にすれば、
    要求性能の推定精度をさらに上げられる。
  - 中古GPU・型落ち品（RTX 4070 SUPER 等）は購入候補に入れていない。

- **別AIへの引き継ぎ注意点**:
  - **特定のGPU名をハードコードで除外してはいけない。**
    RTX 5090が選ばれなくなったのは、費用対効果と
    「目標超過分を価値として数えない」評価の結果であり、
    今後 RTX 6090 等が追加されても同じロジックで自然に処理される。
  - `GPU_CANDIDATES` はおすすめ順ではなく「現行の購入候補一覧」。
    新GPUは `GPU_TIERS` / `GPU_POWER` / `PRICE_HINT` / `GPU_CANDIDATES`
    の4箇所に追加すればロジック変更なしで機能する。
  - `COMFORT_BANDS` / `GAIN` / `COST_PER_GAIN` が判定の要。
    ここを緩めると「過剰推奨」が再発するので、変更時はテスト必須。

---

## 2026-08-19 — アップグレード診断にオートコンプリート・判定情報を追加＋SEO記事3本

- **修正目的**:
  1. GPU/CPUの型番入力を初心者でも使えるようにする（オートコンプリート）
  2. 診断の「確からしさ」と「あと何を調べればよいか」を伝える（判定情報）
  3. 型番検索からの流入を診断へつなげる（SEO記事）

- **変更ファイル**:
  - 新規: `upgrade/upgrade-autocomplete.js`（オートコンプリート）、
    `upgrade/articles-data.js`（記事データ）、
    記事3ページ `upgrade/{rtx3060,ryzen5-5600x,bto-gpu}/index.html`（生成物）
  - 変更: `shared/affiliate/affiliate-master.json`（CPU16件追加）、
    `upgrade/upgrade-engine.js`（tier追加・誤マッチ修正・判定情報）、
    `upgrade/upgrade-diagnose.js`（判定情報の描画）、
    `upgrade/generate-pages.js`（記事対応・Article schema）、
    `upgrade/style.css`、`upgrade/index.html`、`upgrade/sitemap.xml`、
    `upgrade/test-upgrade-engine.js`（29→45件）

- **★調査で見つかった既存の不具合と修正**:
  - **「Ryzen 5 5600X」が「Ryzen 5 5600」として判定されていた。**
    `resolveKey()` の部分一致がCPUのサフィックス（X / X3D / K / F / G）を
    弾いておらず、別CPUを同一視していた。X3Dは通常版より大幅に速いため
    判定結果が変わる。GPU側（Ti / XT）は元から弾いていた。
    → サフィックス判定に CPU 分を追加。登録済み全112型番が
    自分自身に解決できることをテストで担保。
  - **サイトの入力例が「例：Ryzen 5 5600X」なのに、その型番が商品マスターに無かった。**
    → 5600X / 5600X3D / 12600K / 12700F / 13600K / 13700K など
    人気型番16件を追加（CPU 29→45件）。status は `search-only`
    （誤った直リンクより検索フォールバックの方が安全）。既存133商品は無変更。
  - **未登録の型番を入力すると「アップグレードは不要」と表示されていた。**
    メモリ/ストレージ/電源だけが keep になり、GPU/CPUが不明でも
    「問題なし」と読めてしまう状態だった（`insufficient` は unknown 3件以上が条件で、
    このケースは2件のため素通りしていた）。
    → GPUとCPUの両方が不明なら、他が keep でも `insufficient` を返すよう修正。
    判定情報も、GPUが不明なら「簡易診断」以下に制限。

- **変更内容**:
  - **オートコンプリート**: 候補は `shared/affiliate/affiliate-master.json` から生成。
    新しい一覧を持たない（二重管理を作らない）。
    正規化は `affiliate.js` / `upgrade-engine.js` と同じ規則にそろえてあるため、
    `RTX3060` / `rtx 3060` / `3060` / 全角 いずれも一致する。
    ARIA combobox（↑↓ / Enter / Escape / hover）。最大8件でスクロール。
    **候補から選ぶのは任意**で、一覧に無い型番も自由に入力できる。
    選択したときだけ正式名称へ置き換えて表記ゆれを減らす。
  - **判定情報**: 4段階（情報不足 / 簡易診断 / 標準診断 / 詳細診断）。
    **「精度◯%」のような数値は出さない**（統計的な正確さを算出していないため）。
    重み付けは実際に判定へ効く度合いに合わせた（GPU=3、CPU/電源=2、他=1）。
    「あと何が分かると良いか」を理由つきで上位3件表示する。
    既存の `insufficient` 判定を壊さず、そちらを優先する。
  - **SEO記事3本**: 既存サイトとの重複を確認して選定。
    GPU GUIDEは「GPU単体の性能比較」で、「今持っている人が交換すべきか」
    という切り口は無いため重複しない。
    電源W数の記事は `/upgrade/psu/` と重複するため作らず、内部リンクで強化。
    **実測データが無いため、性能の数値は書いていない**
    （「FPSが2倍」等は不可）。記事の結論は診断エンジンの判定と一致させてある
    （例: RTX 3060 + フルHD/60fps はエンジンでも `keep`＝現状維持でOK）。
    購入導線は既存 `shared/affiliate/` のみを使用。

- **影響範囲**:
  - HTMLの `name` 属性・option・診断ロジックの入出力・affiliate処理・
    共通ナビ・canonical・既存sitemapのURLは変更していない。
  - 商品マスターは**追加のみ**（既存133商品はバイト単位で無変更を確認）。
    CRLFを保って書き戻したため、差分は追加380行・削除2行（_metaのみ）。
  - `resolveKey` の変更は全112型番の自己解決テストで回帰なしを確認。

- **テスト内容と結果**:
  - 診断エンジン **45件すべて成功**（29件→16件追加）
  - オートコンプリート: 指定された12ケース（RTX 3060 / RTX3060 / 3060 /
    Ryzen 5 5600X / 5600X / 存在しないGPU / 自由入力 ほか）すべて成功。
    **候補に出る全GPU/CPU（112件）が診断エンジンで解決できることを担保**
  - 診断UI 20項目すべて成功（判定情報の表示・%非表示・XSSエスケープ）
  - 内部リンク609件を検査 → 今回追加分の切れ0件
  - sitemap 11URL すべて実ファイルが存在
  - レスポンシブ: 320〜1440pxで候補リストが入力欄幅に追従しはみ出さないことを確認。
    タップ領域44px以上、入力欄16px（iOS自動ズーム回避）、最大高さ296px＋スクロール。

- **未対応・次にやること**:
  - `/upgrade/` 専用OGP画像は未作成（親共通を暫定流用中）。
  - 記事は今回3本のみ。RTX 4060 / メモリ16→32GB / GALLERIA個別モデルなどは
    `articles-data.js` に追加すれば増やせる。
  - 既存の `pc-builds-hub/posts.json` が参照する `images/Test1.jpg` が
    存在しない（**今回の変更とは無関係の既存問題**）。

- **別AIへの引き継ぎ注意点**:
  - ⚠️ オートコンプリートの候補は**商品マスターが唯一の情報源**。
    GPU/CPUを追加するときは `affiliate-master.json` に足す。
    別ファイルに一覧を作らないこと。
  - ⚠️ **候補の正規化規則は3ファイルでそろえる必要がある**
    （`affiliate.js` / `upgrade-engine.js` / `upgrade-autocomplete.js`）。
    ここがズレると「候補に出たのに診断で認識されない」が起きる。
    テストで全件の解決を確認しているので、変更したら必ず実行すること。
  - ⚠️ 判定情報に**「精度◯%」のような数値を足さない**。
    入力量から統計的な正確さは出せないため、根拠のない数字になる。
  - ⚠️ 記事に**実測していない性能数値を書かない**。
    シッポPCはベンチマークを持っていない。記事の結論は診断エンジンの
    判定と一致させること（食い違うと信用を失う）。
  - 記事の追加は `upgrade/articles-data.js` に1件足して
    `node upgrade/generate-pages.js` を実行する。生成物は直接編集しない。

---

## 2026-08-19 — アップグレード診断フォームの入力欄の縦位置を整列（CSSのみ）

- **修正目的**: 同じ行に並ぶ input / select の縦位置がそろっておらず、
  フォームが崩れて見えていた。補足文の有無・行数に関係なくそろえる。

- **変更ファイル**: `upgrade/style.css` のみ（**HTMLは無変更**）

- **原因**:
  - `.u-field` が `display: block` で、高さが内容依存だった。
  - 補足文（`.u-field__hint`）はラベル内にあるため、補足がある項目は
    ラベル部が約23.6px高くなり、その分 input の開始位置が下がっていた。
  - grid は `.u-field` の外枠を同じ高さに伸ばすが、input はラベル直後に
    置かれるため、開始位置のズレがそのまま残っていた。
  - 補足文が2行に折り返すとズレはさらに拡大する（＝固定値での補正は不可）。

- **変更内容**:
  - `.u-field` を `display: flex; flex-direction: column;` にする。
  - `.u-field > .u-input, .u-field > .u-select` に `margin-top: auto` を付け、
    入力欄を項目の下端へ寄せる。grid の stretch で行内の高さがそろうため、
    **補足の行数に関わらず入力欄の上端が一致する**。
  - `@media (max-width: 520px)` で `margin-top` を 0 に戻す。
    1列表示では隣に並ぶ相手がいないため、auto を残すと余白として見えるため。
  - **固定height / min-height / transform / position でのずらしは使っていない**
    （内容が変わっても崩れないようにするため）。

- **影響範囲**:
  - HTMLを触っていないため、`name` 属性・option・診断ロジック・
    リセット処理・affiliate処理・URL・SEO・構造化データはすべて無影響。
  - JSはフォームを `form.elements[name]` でしか参照しておらず、
    クラス名や入れ子構造に依存していないことを確認済み。

- **テスト内容と結果**:
  - 320/375/390/430/768/1024/1280/1440px で input 上端位置を計算 →
    **全幅でズレ 0.0px**。スマホ（320〜430px）は1列で自然な縦並び。
  - 将来の変更に対する耐性を5パターンで確認（補足2行に折返し／全項目に補足追加／
    ラベル2行／補足を全削除）→ **いずれもズレ0px**。
  - 診断エンジン29件・診断UI16項目 → すべて成功（修正前と同じ）。

- **未対応・次にやること**: なし（レイアウトのみの修正）。

- **別AIへの引き継ぎ注意点**:
  - 入力欄の整列は `margin-top: auto` に依存している。
    `.u-field` の `display: flex` を戻すと再びズレるので注意。
  - 520pxの閾値は `.u-grid-2` の `minmax(220px, 1fr)` と `gap: 14px` から
    逆算した値。カラム幅やgapを変えるならこの閾値も見直すこと。

---

## 2026-08-19 — PCアップグレード診断サイト（/upgrade/）を新設＋サイト全体のサービスナビを共通化

- **修正目的**:
  - 「今のPCが重い」ユーザーが、買い替える前にアップグレードで解決できるかを
    自分で判断できるサイトを新設する（相談・アフィリエイト・SEOの導線を兼ねる）。
  - サイトが6つに増え、各ページに関連サイトのボタンが並び始めていたため、
    サービス間の移動導線を1か所に集約して整理する。

- **変更ファイル**:
  - 新規（サイト本体）: `upgrade/index.html`（トップ＋診断）、
    `upgrade/style.css`、`upgrade/upgrade-engine.js`（判定ロジック）、
    `upgrade/upgrade-diagnose.js`（診断UI）、`upgrade/upgrade-products.js`（購入導線）
  - 新規（生成・テスト）: `upgrade/generate-pages.js`、`upgrade/test-upgrade-engine.js`
  - 新規（生成物7ページ）: `upgrade/{gpu,cpu,memory,ssd,psu,cooler,vs-new-pc}/index.html`
  - 新規（SEO）: `upgrade/sitemap.xml`
  - 新規（共通ナビ）: `shared/nav/sippo-nav.js`、`shared/nav/sippo-nav.css`
  - 変更: `index.html`（アップグレード導線カード＋フッター＋共通ナビ）、`style.css`（ナビの配置調整）、
    `gpu-guide/index.html`、`pc-build-check/index.html`、`game-pc-guide/index.html`、
    `pc-builds-hub/index.html`、`pc-consult/index.html`（各ヘッダーに共通ナビ）、
    `sitemap.xml`（upgrade のサイトマップを追加）

- **変更内容**:
  - **診断エンジン**: GPU/CPU/メモリ/ストレージ/電源を個別に判定し、総合判断を出す。
    設計上いちばん重視したのは「勧めすぎないこと」。
    - 性能が足りていれば `keep`（現状維持でOK）を返す
    - 交換候補は「必要性能を満たす中でいちばん控えめなもの」を選ぶ
    - 交換4点以上＋CPU不安、または合計20万円超なら `replace`（買い替え推奨）
    - 入力が3項目以上不明なら `insufficient`（判定しない）を返す。
      **未入力を「問題なし」と読ませないため**、交換不要より優先して返す
    - GPU交換時は電源容量を必ず判定し、不明なら「要確認」を出す（事故防止）
  - **購入導線**: すべて既存の `shared/affiliate/` を使用。独自のリンク生成は作っていない。
    エンジンが提案しうる商品IDが全件マスターに存在することをテストで担保。
  - **共通サービスナビ**: サービス定義を `sippo-nav.js` の `SERVICES` 1か所に集約。
    「サービス名」ではなく「やりたいこと」を主見出しにし、現在地は
    リンクにせず「表示中」と表示する。サイト追加時はここに1件足すだけ。
  - **既存ヘッダーの整理**: 各サイトの「Sippoに相談」単独ボタンを共通ナビに置換。
    GAME PC GUIDE はヘッダーに並んでいた外部リンク2本（GPU比較／PC診断）も
    共通ナビに集約した。

- **影響範囲**:
  - 既存6サイトの変更は **合計67行の追加のみ**（削除は共通ナビへ置換した分だけ）。
    URL・canonical・OGP・sitemapの既存分・Supabase連携・affiliate処理は一切変更していない。
  - `pc-builds-hub` は `data-auth-ui` を含む認証UIに触れていない
    （`auth.js` が参照するのは `[data-auth-ui]` と `[data-submit-cta]` のみで、どちらも無傷）。
  - 共通ナビはJSで描画する「上乗せ」の導線。JSが動かなくても各ページの
    フッターに静的リンクが残るため、移動できなくなることはない。

- **テスト内容と結果**:
  - `node upgrade/test-upgrade-engine.js` … **29件すべて成功**
    （交換不要の判定・押し売り防止・未入力の非断定・買い替え判定・電源の安全判定・
    型番の取り違え防止・商品マスターとの整合・異常入力）
  - 診断UIをDOMスタブで実行し、判定別の描画・購入ボタン・XSSエスケープを確認
  - 共通ナビを5パターン（各サイト＋自動判定）で描画確認
  - 内部リンク491件を検査 → 今回追加分のリンク切れ **0件**
  - sitemapのXML妥当性と、全URLに実ファイルが存在することを確認
  - レスポンシブ: 320/375/390/430/768/1440px でコンテンツ幅を計算し、
    全グリッドが収まることを確認。入力欄16px（iOS自動ズーム回避）、
    タップ領域44px以上、safe-area対応、テーブルは枠内スクロール。

- **未対応・次にやること**:
  - **`/upgrade/` 専用のOGP画像が未作成**。現在は親共通 `assets/ogp.png` を暫定流用中。
  - アップグレード事例（Before→After の実測FPS）ページは**未作成**。
    実測データが無い状態で数値を書くと嘘になるため、意図的に作っていない。
    実際に交換した事例が集まってから `generate-pages.js` に追加する想定。
  - 既存の `pc-builds-hub/posts.json` が参照する `images/Test1.jpg` が存在しない
    （**今回の変更とは無関係の既存問題**。サンプル投稿データ由来）。

- **別AIへの引き継ぎ注意点**:
  - ⚠️ `upgrade/{gpu,cpu,...}/index.html` は **生成物**。直接編集しないこと。
    内容を変えるときは `upgrade/generate-pages.js` の `PAGES` を編集して
    `node upgrade/generate-pages.js` を再実行する。
  - ⚠️ 診断結果は**URLを変更しない**（ページ内描画のみ）。
    過去にクエリURLをsitemapへ載せて未登録になった経緯があるため、
    `?gpu=...` のような結果URLを作ってsitemapに載せないこと。
  - ⚠️ 診断エンジンの「勧めすぎない」ルール（`enoughTier` / 最も控えめな候補を選ぶ /
    `insufficient` を優先）は**このサイトの信頼性の核**。
    交換提案を増やす方向の変更をするときは `test-upgrade-engine.js` が
    落ちないことを必ず確認すること。
  - サービスを追加するときは `shared/nav/sippo-nav.js` の `SERVICES` に1件足すだけで
    全サイトのナビに反映される。各ページを手で直さないこと。

---

## 2026-08-18 — 旧データのコピーに残っていた売り切れ楽天リンクを一掃（GPU GUIDE / PC BUILD CHECK）

- **修正目的**: GPU GUIDE の RX 9070 で、楽天リンクが売り切れページのままという指摘を受けた。調べたところ、**先の修正は `shared/affiliate/affiliate-master.json` の `products` しか直しておらず、旧データのコピーに同じ死んだURLが残っていた**。リポジトリ全体を総点検して一掃する。
- **前回の見落とし（反省点）**: 「商品マスターは `shared/affiliate/` の1ファイル」という前提で作業していたが、実際には**同じURLが5ファイルに散在**していた。前回の診断スクリプトも `shared` の `products` しか見ておらず、旧コピーは対象外だった。
  - `shared/affiliate/affiliate-master.json` の **`legacy.gpus`**（`products` とは別系統のデータ）
  - `gpu-guide/affiliate-master.json`（GPU GUIDE 専用の旧コピー）
  - `gpu-guide/affiliate-links.js`（さらに古い直書きの定義）
  - `pc-build-check/script.js`（構成診断用に直書きされた定義）
- **変更ファイル**:
  - 修正: `shared/affiliate/affiliate-master.json`（`legacy.gpus` の3件）
  - 修正: `gpu-guide/affiliate-master.json`（3件）
  - 修正: `gpu-guide/affiliate-links.js`（3件）
  - 修正: `pc-build-check/script.js`（**新たに5件**）
- **変更内容**:
  - **リポジトリ全体を総点検**した。`.js` / `.json` / `.html` を走査して短縮URL（`a.r10.to` / `amzn.to` / `yahoo.jp` 等）を **94件** 抽出し、全件に実アクセスして本文まで確認した。
  - その結果、**PC BUILD CHECK 側に未修正の売り切れが4件**見つかった（前回まで一度も点検していなかったファイル）:

    | 対象 | URL | 状態 |
    |---|---|---|
    | RTX 5090 | `a.r10.to/hYATKB` | 販売期間外 |
    | RTX 5070 Ti | `a.r10.to/hgOCmU` | 取扱いがありません |
    | RX 9070 | `a.r10.to/hkxoJc` | 取扱いがありません |
    | RTX 4060 Ti | `a.r10.to/hPZffm` | **HTTP 404** |

  - 併せて、GPU GUIDE 側の旧コピー3ファイルに残っていた RX 9070 / RX 7700 XT / RX 7900 XTX の死んだURLも除去した（`pc-build-check` の RTX 4080 を含め計10か所）。
  - **URLを別商品に差し替えることはしていない**。誤リンクを作らないため、値を空にして「その商品の楽天直リンクは無い」状態にした。`pc-build-check/script.js` は `rakuten` キー自体を省略する書き方が既存パターン（例: RTX 4070）だったので、それに合わせて行ごと削除した。
  - 復活時に戻せるよう、JSON側は `rakutenRetiredUrl` に退避、JS側はコメントに旧URLを残した。
  - なお **RTX 5090 / RTX 5070 Ti / RTX 4060 Ti は `shared` 側では別の生きたURLが登録済み**で、そちらは正常だった（`pc-build-check` の旧コピーだけが古かった）。
- **影響範囲**:
  - **実際にユーザーが見る画面は `SippoAffiliate`（shared）経由**であることをコードで確認した。`gpu-guide/script.js` の `renderPurchaseSearchLinksFromMaster()` や `renderPurchaseSearchLinks()` は**どこからも呼ばれていない死んだコード**で、GPU詳細ページは `renderAffiliateButtonsByName()` を使っている。
  - ただし旧コピーは `gpu.html` 等から読み込まれたままなので、将来の参照ミスや再利用で復活する危険があった。今回除去したことでその危険も消えた。
  - 該当4GPU（RX 9070 / RTX 4080 / RX 7700 XT / RX 7900 XTX）は楽天ボタンが「楽天市場で探す」＝アフィリエイトID付きの商品名検索になり、行き止まりが解消。
  - 既存テスト96項目（フォールバック51＋linkType45）は全PASS。
  - 修正後にリポジトリ全体を再スキャンし、**生きているリンク欄に死んだURLは0件**。残る検出はすべて `retiredUrl` / `rakutenRetiredUrl`（意図的な退避）とコメント内の記録のみ。
- **未対応・次にやること**:
  - **旧データのコピー4系統を整理する**のが本筋。現状 `shared` と重複しており、二重管理で今回のような取りこぼしが起きる。`gpu-guide/affiliate-links.js` / `gpu-guide/affiliate-master.json` / `pc-build-check/script.js` の直書き定義と `legacy.gpus` は、参照元が無いことを確認したうえで削除を検討する（今回は影響範囲が広いため未実施）。
  - 診断スクリプトは現状 `shared` の `products` のみが対象。旧コピーも見るように広げるか、旧コピー自体を無くすかは上記の整理とセットで判断する。
- **別AIへの引き継ぎ注意点**:
  - **「マスターは1ファイル」と思い込まないこと**。アフィリエイトURLを直すときは必ず `grep -rn "<短縮URLのID>" --include=*.js --include=*.json --include=*.html .` でリポジトリ全体を確認する。今回の見落としの原因はこれ。
  - **`pc-build-check/script.js` と `gpu-guide/affiliate-links.js` にもURLが直書きされている**。`shared` を直しただけでは終わらない。
  - `retiredUrl` / `rakutenRetiredUrl` は復活用の控えなので消さない。総点検スクリプトを書くときはこれらを「生きたリンク」と誤検出しないよう除外すること。

---

## 2026-08-18 — 短縮URLの遷移先を実測して linkType を追加し、ボタン文言を実態に統一

- **修正目的**: `amzn.to` / `a.r10.to` / `yahoo.jp` の短縮URLは、見ただけでは「商品ページ行き」なのか「検索結果行き」なのか分からない。実際に調べたところ **Amazon 25件・Yahoo 20件はすべて検索結果ページ**だったのに、ボタンには「Amazonで価格を見る」と表示されており、**実態と文言が食い違っていた**。全件の遷移先を実測して `linkType` に記録し、文言を実態に合わせる。
- **変更ファイル**:
  - 修正: `shared/affiliate/affiliate.js`（共通判定 `isExactLink()` を追加し、3ショップの `isExact` を集約）
  - 修正: `shared/affiliate/affiliate-master.json`（直リンク62件に `linkType` を付与。**既存URLは1件も変更なし**）
  - 修正: `scripts/check-affiliate-links.js`（`linkType` が実態とズレていないかを検査）
  - 修正: `shared/affiliate/README.md`（`linkType` の説明）
- **変更内容**:
  - **全62件の短縮URLを実際に開いて遷移先を実測**し、`linkType` を付与した。結果は次のとおりで、**判別不能なものは0件**だった:

    | ショップ | 件数 | 実測結果 |
    |---|---|---|
    | Amazon | 25件 | **すべて `search`**（`/s?k=...` の検索結果） |
    | Yahoo | 20件 | **すべて `search`**（`/search/...` の検索結果） |
    | 楽天 | 17件 | **すべて `exact`**（商品ページ / 商品価格ナビ） |

  - **ボタン文言を統一**。`exact` →「〇〇で価格を見る」、`search` →「〇〇で探す」。これにより Amazon・Yahoo の45件が正しく「探す」表記になり、**「価格を見る」と言って検索結果を開く**状態が解消された。
  - **判定を `isExactLink()` に共通化**した。従来は Amazon / 楽天 / Yahoo でバラバラの式が書かれており、特に **Yahoo は無条件 `isExact: true`** というハードコードだった（今回の食い違いの主因）。現在は全ショップがこの1関数を通る。
  - **`isExactLink()` が `true` を返す条件**（全部満たすときだけ）:
    1. 売り切れ等でフォールバックしていない
    2. 実際に使う直リンクが存在する（マスターのURL、またはAmazonのASIN）
    3. その遷移先が商品ページ（`linkType === 'exact'`）
  - **未設定・不明な値は `search` に倒す**（ご指示どおり安全側）。「価格を見る」と言って検索結果を開く方がユーザーを裏切るため。大文字 `EXACT` も正しく認識する。
  - **既存リンクURLは一切変更していない**。`linkType` は文言の出し分けにのみ使い、遷移先はそのまま。HEAD と全商品を突き合わせ、URL・`asin`・`keyword`・`status`・`retiredUrl` の変更が**0件**であることを機械的に検証済み。
  - **診断スクリプトに `linkType` 検査を追加**。スキャン時に実際の着地点を分類し、マスターの `linkType` と食い違っていれば「要確認 / linkType 不一致（マスター: exact / 実際: search）」と報告する。CSVにも `link_type` / `actual_link_type` 列を追加。リンクを貼り替えて種別が変わったときに気づける。
- **影響範囲**:
  - **新規テスト45項目すべてPASS**（`exact`/`search` の文言・未設定と不正値の安全側倒し・大文字・ASIN・フォールバック時の無視・注記テキスト・GA4属性維持・実データ整合）。
  - 既存のフォールバックテスト51項目も全PASS（**合計96項目**）。1件だけNGが出たが、これは「`linkType` 未設定なら `isExact=true`」という**旧仕様を前提にした古いアサーション**だったため、新仕様に合わせて修正した（コード側の不具合ではない）。
  - 実データ133商品で生成リンク286件・二重エンコード0件・空リンク0件を維持。`linkType` と `isExact` とボタン文言が**全件整合**していることを確認。
  - 修正後に全62件を再スキャンし、**`linkType` 不一致0件**を確認（61件正常 / 要確認1件）。要確認の1件は Yahoo の一時的な HTTP 500 で、再試行3回とも 200 で正常・遷移先も記録どおりだった（対応不要）。
  - GA4 の `affiliate_click` 計測・`rel="nofollow sponsored"` は変更なし。
- **未対応・次にやること**:
  - Amazon 25件・Yahoo 20件は現在「検索結果ページ」への短縮リンクのまま。**文言は実態に合ったので誤解は解消**したが、収益性を上げたいなら商品ページの直リンクに貼り替える手もある。その場合は `linkType` を `exact` に直すこと（貼り替えないなら現状のままで問題なし）。
- **別AIへの引き継ぎ注意点**:
  - **`isExact` を各ショップで個別に計算しない**。必ず `isExactLink()` を通すこと。以前 Yahoo だけ無条件 `true` にしていたのが文言食い違いの原因だった。
  - **`linkType` 未設定を `exact` 扱いにしない**。安全側は `search`。ここを反転すると「価格を見る」と表示して検索結果を開く事故が再発する。
  - **リンクを貼り替えたら `linkType` も必ず見直す**。診断スクリプトが不一致を検出するので、定期実行していれば気づける。

---

## 2026-08-18 — 楽天の売り切れ直リンク4件を検索フォールバックへ切替＋診断スクリプトの本文判定を追加

- **修正目的**: 楽天の直リンク先が「現在こちらの商品は取扱いがありません」になっている商品が実際に見つかった（RX 9070）。同時に、前回追加した診断スクリプトが**この状態を検知できていなかった**ことが判明したため、検知ロジックを強化する。
- **変更ファイル**:
  - 修正: `scripts/check-affiliate-links.js`（本文パターン判定 `SOLD_OUT_PATTERNS` / `findSoldOutMark()` を追加）
  - 修正: `shared/affiliate/affiliate-master.json`（楽天の売り切れ直リンク4件を `sold-out` 化）
  - 修正: `shared/affiliate/README.md`（本文判定の説明・売り切れ時の直し方）
- **変更内容**:
  - **【診断スクリプトの欠陥修正】HTTPステータスだけでは売り切れを検知できなかった**。楽天の「商品価格ナビ」は商品の取扱いが終わっても **HTTP 200 を返す**（本文に「現在こちらの商品は取扱いがありません」と出るだけ）。前回の実装は 404/410 しか見ておらず、この状態を**すべて「正常」と誤判定していた**。本文も読んで売り切れ表示を検出するようにした。
  - パターンは `SOLD_OUT_PATTERNS` にショップ別で定義（楽天「取扱いがありません」「販売期間外」等 / Amazon「現在在庫切れです」等 / Yahoo）。新しい表示を見つけたらここに追記する。
  - 誤検知を避けるため、**本文一致でも「リンク切れ」ではなく「要確認」**に留める方針は維持（自動書き換えもしない）。
  - あわせて、商品ページのつもりが検索結果ページに着地しているリンクを `（検索結果ページに着地）` と備考に出すようにした。
  - **実際に見つかった売り切れ4件を修正**（すべて楽天。ブラウザおよび本文で個別に確認済み）:

    | product_id | 商品名 | 本文表示 |
    |---|---|---|
    | `rx9070` | Radeon RX 9070 | 現在こちらの商品は取扱いがありません |
    | `rtx4080` | GeForce RTX 4080 | 販売期間外 |
    | `rx7700xt` | Radeon RX 7700 XT | 現在こちらの商品は取扱いがありません |
    | `rx7900xtx` | Radeon RX 7900 XTX | 現在こちらの商品は取扱いがありません |

  - 直し方は**直リンクを消さず `retiredUrl` に退避**し、`url` を空＋`status: "sold-out"`（ショップ単位）。復活したら戻せる。Amazon / Yahoo 側は無傷のまま。
  - なお `rx7700xt` と `rx7900xtx` の楽天リンクは**どちらも同じ商品ページ**（`ca23cede...`）を指していた。登録時のコピペミスと思われ、片方は元々別GPUへの誤リンクだった。今回どちらも検索フォールバックになったため誤リンクも解消。
- **影響範囲**:
  - 該当4商品の楽天ボタンが「楽天市場で**探す**」（商品名での検索）に変わり、行き止まりが解消。アフィリエイトIDは検索URLにも付くので**収益機会は維持**。
  - 例: RX 9070 の楽天フォールバック先を実測 → HTTP 200 / **441件ヒット** / `scid=af_pc_etc` 付与を確認。
  - 修正後に**全3ショップの直リンク62件を再スキャン**し、楽天17件・Amazon25件・Yahoo20件すべて `正常`、`要確認` 0件・`リンク切れ` 0件を確認。
  - 既存テスト51項目は引き続き全PASS。全133商品でリンク286件・二重エンコード0件・空リンク0件も維持。
- **未対応・次にやること**:
  - **Amazonの `amzn.to` 25件はほぼすべて「検索結果ページ」への短縮リンク**だった（商品ページではない）。切れる心配は無い代わりに、ボタン文言が「Amazonで価格を見る」なのに実際は検索結果が開く。文言を実態に合わせるか、商品ページの直リンクに貼り替えるかは要判断（今回は未変更）。
  - Yahoo 20件も同様に検索結果ページ着地。
- **別AIへの引き継ぎ注意点**:
  - **楽天・Amazonの「売り切れ」はHTTP 200で返る**。ステータスコードだけの死活監視は無意味なので、`SOLD_OUT_PATTERNS` による本文判定を消さないこと。
  - **`retiredUrl` は消さない**。復活時に戻すための控え（コードからは参照していない）。
  - 本文パターンを増やすときは**具体的な文言**にすること。「在庫」「終了」のような短い語で部分一致させると、正常な商品ページのレビュー文等に当たって誤検知する。

---

## 2026-08-18 — アフィリエイト リンク切れ・販売終了フォールバックと、リンク切れ診断スクリプト

- **修正目的**: 商品の直リンク先（`amzn.to` / `a.r10.to` 等）が売り切れ・掲載終了・無効になると、ユーザーが「商品が見つかりません」で行き止まりになる。直リンクが使えない場合に**同じ商品の検索結果へ自動で逃がす**仕組みを入れ、機会損失をなくす。あわせて、既存の直リンクが今も生きているかを後から点検できる診断スクリプトを用意する。
- **変更ファイル**:
  - 修正: `shared/affiliate/affiliate.js`（ステータス解決レイヤーを追加し、3ショップのURL生成と `getAffiliateLinks()` を対応）
  - 修正: `shared/affiliate/affiliate-master.json`（`_meta.statusValues` の説明を更新。**商品133件のデータは一切変更なし**）
  - 修正: `shared/affiliate/README.md`（`status` 一覧・ショップ単位status・診断スクリプトの使い方）
  - 新規: `scripts/check-affiliate-links.js`（直リンクの死活チェック。依存パッケージなし）
  - 修正: `PROJECT_STATUS.md`（アフィリエイト仕様・運用ルール・課題・進捗表）
- **変更内容**:
  - **「直リンク → 検索リンク → 非表示」の3段階**に整理。判定は `resolveStatus()` / `isHiddenStatus()` / `canUseDirectUrl()` の1か所に集約し、各 `build*Url()` はその方針に従うだけにした。

    | `status` | 動作 |
    |---|---|
    | `active` | 直リンク（`url` / `asin`）を優先。無ければ検索へフォールバック |
    | `search-only` | 直リンクを使わず検索リンクのみ |
    | `sold-out` | 直リンクを捨てて検索リンクへフォールバック |
    | `discontinued` | 直リンクを捨てて検索リンクへフォールバック |
    | `disabled` | 購入ボタンを一切出さない |
    | `preparing` / `paused` | 【旧仕様・互換維持】出さない。新規は `disabled` 推奨 |

  - **既存互換を最優先**した。`status` 未設定は従来どおり `search-only` 扱い、`preparing` / `paused` も従来どおり非表示のまま。現在のマスターは `active` 25件 / `search-only` 108件で、**この2つの挙動は一切変わっていない**（＝既存の表示は無変更）。
  - **`discontinued` だけ意図的に挙動を変更**した。従来は「ボタンを出さない」だったが、指示により「検索へフォールバック」へ。旧世代GPU等でも「後継・中古を探す」導線が残る。該当商品は現在0件のため実表示への影響なし。**完全に隠したい商品は `disabled` を使う**。
  - **ショップ単位の `status` に対応**。`amazon` / `rakuten` / `yahoo` の各ノード内にも `status` を書け、そちらが商品全体より優先される。「Amazonだけ売り切れ、楽天は在庫あり」を表現できる。
  - **フォールバック時のボタン文言を実態に合わせた**。`isExact` を「マスターにURLがあるか」だけでなくステータスも見て決めるようにしたので、フォールバックしたリンクは必ず「〇〇で**探す**（検索結果を開きます）」になる。売り切れ商品に「価格を見る」と出してユーザーを騙さない。
  - **Yahoo!** は短縮アフィリエイトURLの直リンク運用のみでID検索生成をしないため、フォールバック対象ステータスでは非表示にする（誤誘導しない）。
  - **診断スクリプト `scripts/check-affiliate-links.js`** を追加。`node scripts/check-affiliate-links.js` で `product_id` / 商品名 / shop / URL / HTTP状態 / `正常・要確認・リンク切れ` を一覧化する。`--shop` `--limit` `--csv` `--concurrency` `--timeout` に対応。Node 18+ の標準 `fetch` のみで動き、**外部パッケージ不要**（`package.json` 無しの現構成を維持）。
  - **診断は絶対に自動で status を書き換えない**設計にした。Amazon/楽天はBot対策で 403・429 を返すことがあり、HTTPだけでは断定できない。404/410 のみ「リンク切れ」、403/429/5xx/タイムアウト/トップページ着地は「**要確認**」として報告するに留める。**誤判定で正常な収益リンクを止める方が損失が大きい**ため。
- **影響範囲**:
  - GA4 の `affiliate_click` 計測は**完全に維持**（`data-affiliate-*` 属性・`rel="nofollow sponsored"` とも変更なし）。
  - APIもスクレイピングも使わず、GitHub Pages の静的構成のまま。
  - 検証: 新規テスト51項目すべてPASS。`active`＋直リンク / `search-only` / `sold-out` / `discontinued` / `disabled` / Amazonのみ / 楽天のみ / 両方なし / 日本語キーワード / 半角スペース入り英語キーワード の指定10ケースに加え、旧ステータス互換・ショップ単位status・GA4属性維持・`status`未設定 も確認。
  - 実データ133商品での回帰も実施し、生成リンク286件で **二重エンコード0件 / 空・`#` リンク0件**、既存のAmazon直リンク25件・楽天直リンク21件が**そのまま維持**されていることを確認。
  - 診断スクリプトは実リンクで動作確認済み（`amzn.to` / `a.r10.to` のリダイレクト追跡を含め6件すべて `正常`）。存在しない楽天URLを一時的に注入したテストでは、**実在の21件を誤検知せず**、注入分だけを `リンク切れ`（HTTP 404）として検出できた（テスト後マスターは復元済み）。
- **未対応・次にやること**:
  - 公開後、実際にボタンを押して Amazonアソシエイト / 楽天アフィリエイトの管理画面に**クリックが計上されるか**を一度確認する。
  - 月1回程度 `node scripts/check-affiliate-links.js` を実行し、`リンク切れ` / `要確認` を目視してから `status` を手で更新する運用にする。
  - 診断はGitHub Actions等での自動化も可能だが、Bot対策でCI環境からは403が増える見込みのため、**手元での手動実行を推奨**。
- **別AIへの引き継ぎ注意点**:
  - **ステータス判定を各所にばら撒かない**。`HIDDEN_STATUSES` / `FALLBACK_STATUSES` の2つの表と `resolveStatus()` だけを直せば全ショップに効く構造にしてある。
  - **`preparing` / `paused` を消さない**。現在マスターでは未使用だが、互換のため残している旧ステータス。
  - **`getAffiliateLinks()` で `sold-out` / `discontinued` を早期 return してはいけない**。そこで切るとフォールバックが働かず、修正前の「行き止まり」に逆戻りする。非表示にしてよいのは `disabled` / `preparing` / `paused` だけ。
  - **診断スクリプトに自動修正機能を足さない**。誤判定で正常な収益リンクを止めるリスクの方が高い。判断は人間が行う。
  - 楽天の `pc=` / `m=` のエンコードは1回だけ（前回修正分）。ここも触らないこと。

---

## 2026-08-18 — アフィリエイトID設定と、楽天リンクの二重エンコード修正

- **修正目的**: 取得済みの Amazon アソシエイトID / 楽天アフィリエイトIDを共通設定に登録して収益計測を有効化する。あわせて、楽天の検索フォールバックURLが**二重エンコード**されており、スペースを含む商品名で楽天の検索結果が0件になる不具合を修正する。
- **変更ファイル**:
  - 修正: `shared/affiliate/affiliate-config.js`（Amazon / 楽天のID登録）
  - 修正: `shared/affiliate/affiliate.js`（`buildRakutenUrl()` の二重エンコード修正）
- **変更内容**:
  - **アフィリエイトIDを登録**。`amazon.associateTag` = `sippo79-22`、`rakuten.affiliateId` = `56aa006c.76706573.56aa006d.849ed47b`。どちらもアフィリエイトURLに必ず載る**公開前提の値**なので設定ファイルに置いてよい（PA-APIのSecret / 楽天の accessKey は引き続き置かない）。`rakuten.applicationId` は空のまま（商品検索APIは未使用）。
  - **楽天リンクの二重エンコードを修正**。従来は `encodeURIComponent(keyword)` で組み立て済みの `searchUrl` を、さらに `pc=` / `m=` に渡す際にもう一度 `encodeURIComponent` していたため、半角スペースが `%20` → `%2520` に化けていた。楽天側でデコードすると検索語がリテラルの `GeForce%20RTX%205070` になり、**スペースを含む商品名（＝ほぼ全商品）で検索結果が0件**になっていた。
  - 修正方式: `pc=` / `m=` に渡す値は、**生キーワードから組み立てた `rawSearchUrl` を1回だけ** `encodeURIComponent` する形に変更。アフィリエイトIDが未設定のとき返す「素の検索URL」は従来どおりエンコード済みの `searchUrl`（そのままブラウザで開くURLなので正しい）。
- **影響範囲**:
  - 楽天の**検索フォールバック**リンクのみ挙動が変わる（＝壊れていたものが直る）。商品マスターに個別URL（`a.r10.to` 等）が登録済みの商品は従来どおり素通しで、影響なし。
  - Amazonリンク（ASIN直リンク / 検索フォールバック / `amzn.to` 直リンク）には**一切影響なし**。
  - 検証: 商品マスター133件すべてでリンク生成を実行し、楽天133件・Amazon133件が生成され、**二重エンコード残存 0件**を確認。加えて、スペース入り英語名 / 日本語商品名 / 記号（`&`）入り / 楽天・Amazonの直リンク素通し / `enabled:false` / `keyword:""` / アフィリID未設定時のフォールバック の17項目を個別テストし全てPASS。
- **未対応・次にやること**:
  - Yahoo!ショッピングは引き続き「短縮アフィリエイトURLを商品マスターに直接登録する」運用（IDによる自動生成なし）。
  - 楽天商品検索APIは2026年新仕様で `accessKey`（秘密鍵）必須のため、静的サイトからは使用不可。使う場合は Supabase Edge Functions 等のサーバー側を用意すること。
  - 実際のクリック → 楽天／Amazon管理画面での計上を、公開後に一度実データで確認しておくと安心。
- **別AIへの引き継ぎ注意点**:
  - `pc=` / `m=` に渡すURLを触るときは**エンコード回数に注意**。`base + keyword` の生文字列を1回だけ `encodeURIComponent` するのが正解。「見やすくしよう」と `searchUrl`（エンコード済み）を再利用すると、今回直したバグが再発する。
  - `affiliate-config.js` に置いてよいのは**リンクに載る公開値だけ**。Secret / accessKey は絶対に置かない。

---

## 2026-08-18 — シッポPC全体へ Amazon＋楽天アフィリエイト共通基盤を実装

- **修正目的**: これまで各サイトがバラバラにアフィリエイトURLを持っていた（gpu-guide は独自コピーの `affiliate-master.json`、pc-build-check は `script.js` 内に直書き、game-pc-guide は**存在しないパス**を参照していて全ボタンが「準備中」のまま）。商品追加・リンク差し替えを1か所でできる共通基盤に統合し、GPU GUIDE / GAME PC GUIDE / PC BUILD CHECK / PC Builds Hub に購入導線を通す。将来の「PCアップグレード相談」ページでもそのまま使える土台にする。
- **変更ファイル**:
  - 新規: `shared/affiliate/affiliate-config.js`（アフィリエイトIDの設定＝公開してよい値のみ）
  - 新規: `shared/affiliate/affiliate.js`（本体：リンク生成・商品検索・共通UI・クリック計測）
  - 新規: `shared/affiliate/affiliate-recommend.js`（アップグレード提案）
  - 新規: `shared/affiliate/affiliate.css`（購入ボタンの共通スタイル。明/暗テーマ対応）
  - 新規: `pc-build-check/build-affiliate.js`（構成詳細75ページ用。スペック表から型番を読む）
  - 大幅改修: `shared/affiliate/affiliate-master.json`（商品マスター。GPU中心の旧構造 → 11カテゴリ133商品）
  - 全面書き換え: `game-pc-guide/game-affiliate.js`（壊れたパス参照を修正し共通基盤へ移行）
  - 全面書き換え: `shared/affiliate/README.md`（管理方法・実装方式の根拠・計測仕様）
  - 修正: `gpu-guide/gpu-detail.js` `gpu-guide/gpu.html` `gpu-guide/sw.js`
  - 修正: `pc-build-check/script.js` `pc-build-check/index.html` `pc-build-check/sw.js`
  - 修正: `pc-builds-hub/post.js` `pc-builds-hub/post.html` `pc-builds-hub/index.html`
  - 修正: `pc-consult/index.html`（基盤の読み込みのみ。相談メニューは一切変更なし）
  - 修正: 広告表記の追加 — `index.html` `style.css` / 各サイト `style.css` / 子サイト105ページ
  - 修正: 生成スクリプト `generate-builds.ps1` `game-pc-guide/Generate-StaticGames.ps1`（再生成しても壊れないように追従）
- **変更内容**:
  - **商品マスターを1本化**。`shared/affiliate/affiliate-master.json` の `products` に133商品（GPU 67 / CPU 29 / メモリ・SSD・電源・クーラー・ケース・マザボ・モニター・周辺機器・ゲーミングPC）。**既存のアフィリエイトURL（`amzn.to` / `a.r10.to` / `yahoo.jp`）は1本も失わずに移行**（gpu-guide の旧マスター＋pc-build-check の直書き分をマージ）。旧構造は `legacy` キーに温存。
  - **実行時にAPIを叩かない方式を採用**。Amazon PA-API は「直近30日で3件の適格販売」が利用条件で現時点では使えない。楽天の商品検索APIは2026年の仕様変更で秘密鍵 `accessKey` が必須になり、静的サイトのフロントからは安全に呼べない。よって「アフィリエイトID付きURLをその場で組み立てる」方式にした。**APIキーが無くてもサイトは完全に動く**。
  - Amazonは ①登録済み個別URL → ②ASINから `/dp/{ASIN}/ref=nosim?tag=` → ③キーワード検索 の優先順。楽天は ①登録済み個別URL → ②検索URL（IDがあれば `hb.afl.rakuten.co.jp` でラップ）。
  - **共通UI**: `SippoAffiliate.renderAffiliateButtons(productId, {page, placement})` に商品IDを渡すだけでボタンHTMLが返る。表示できるリンクが無ければ**空文字**を返すので、壊れたボタンや `#` リンクは出ない。
  - **クリック計測**: 既存のGA4（`G-NDQ8GTKGHC`）を再利用し `affiliate_click` イベントを送る。`product_id` / `product_name` / `shop` / `page` / `placement` / `link_url` / `page_path` を記録。`placement` により「どの位置のリンクが押されるか」を分析できる。`gtag` が無くても遷移は妨げない。
  - **誤リンク防止を最優先**。商品名は正規化して照合（`GeForce` `NVIDIA` `ASUS` 等を除去、全角→半角）。`RTX 5070` と `RTX 5070 Ti` を取り違えないよう、一致部分の直後が数字なら不一致扱い。特定できなければ**リンクを出さない**。
  - **価格は一切ハードコードしない**（古い価格が残る事故を防ぐ）。ボタン文言は「価格を見る」「探す」。商品画像もAmazon/楽天のものは使わず、既存画像のまま。
  - **アップグレード提案**（`SippoRecommend`）: 今のGPU → おすすめ → 期待できる改善★ → 購入ボタン。**現役の上位GPU（RTX 4070 / RTX 3080 クラス以上）には提案を出さない**、**候補は最も控えめなものを選ぶ**（RTX 5090 を押し売りしない）。PC Builds Hub の投稿詳細に導入済み。
  - **広告表記**（景表法のステマ規制・Amazonアソシエイト規約）を親サイト＋子サイト105ページのフッターに追加。購入ボタンの直下にも表示。
- **影響範囲**:
  - GPU GUIDE: GPU詳細ページの購入セクションを共通基盤に置換。**63GPU全てで購入リンクが出る**（従来は「準備中」表示が多数）。一覧ページはカード全体が `<a>` のため変更なし（SEO重視でコンテンツを主役に維持）。
  - GAME PC GUIDE: **参照パスが壊れていて全ボタンが「準備中」だった不具合を解消**。25ゲーム全ページで推奨構成のGPU/CPUの購入リンクが出るようになった（1ページ最大4件に制限し広告だらけにしない）。
  - PC BUILD CHECK: 診断結果を構成パーツ単位のリンクに変更。構成詳細75ページにも新規で購入導線を追加。**SW のキャッシュ名が旧称 `jisako-v3` のままだったので `pc-build-check-v4` に是正**（「ジサコ！」は別サイト名）。
  - PC Builds Hub: 投稿詳細にパーツ購入リンク＋アップグレード提案を追加。ユーザー投稿は表記ゆれが多いため、特定できたものだけ表示する。**Supabase の認証・投稿・Nice・RLS には一切触れていない**。
  - PC相談: 基盤の読み込みのみ。**料金・プラン・申し込み導線は一切変更していない**。
  - Service Worker のキャッシュ版数を更新（gpu-guide v4 / game-pc-guide v2 / pc-build-check v4）。
- **未対応・次にやること**:
  - ⚠️ **ユーザー側の作業が必要**: `shared/affiliate/affiliate-config.js` に **Amazon アソシエイトID** と **楽天アフィリエイトID** を入力する。未入力でもサイトは動くが、検索フォールバック経由のリンクが**タグ無し＝収益にならない**（既存の `amzn.to` / `a.r10.to` 短縮リンクはIDが埋め込み済みなので影響なし）。
  - 個別商品URL（ASIN等）が未登録の商品は「検索で探す」表示。順次 `affiliate-master.json` の `amazon.asin` / `url` を埋めると商品ページ直リンクになる。
  - 「ゲーミングPCアップグレード相談」ページは未作成。`SippoRecommend.renderUpgrade()` をそのまま使える状態にしてある。
  - Amazon PA-API は売上実績（30日で3件）を満たしたら利用申請可能。その場合も差し替えは `buildAmazonUrl()` の1か所で済む。
- **別AIへの引き継ぎ注意点**:
  - **アフィリエイトURLの追加・変更は `shared/affiliate/affiliate-master.json` だけを編集する**。各HTMLにURLをベタ書きしないこと。
  - **`affiliate-config.js` に秘密情報を書かない**。入れてよいのはアソシエイトID／楽天アフィリエイトID（どちらもURLに載る公開値）だけ。Amazon の Secret Key や楽天の `accessKey` は絶対に置かない（GitHubにpushされる）。
  - 描画系の関数は**表示できない場合に空文字を返す**契約。呼び出し側で `if (html)` を見てセクションごと出し分けている箇所があるので、この契約を壊さないこと。
  - **暗い背景のサイトは `<body>` に `data-sippo-theme="dark"`** が必要（無いと明るいテーマのボタンになり読みにくい）。
  - 生成スクリプト（`generate-builds.ps1` / `Generate-StaticGames.ps1`）にも同じ変更を入れてある。**再生成する場合は先にスクリプト側を確認**すること。
  - `pc-build-check/script.js` の `gpuAffiliateLinks` 配列は「移行済みの参考データ」としてコメント付きで残してある（現在は未参照）。削除して構わない。

---

## 2026-08-13 — パスワード再設定（パスワードを忘れた場合）機能の追加

- **修正目的**: PC Builds Hub にログイン機能はあるが、パスワードを忘れた利用者が自力で復旧できなかった。Supabase Auth の標準機能でパスワード再設定フローを追加する。
- **変更ファイル**:
  - 新規: `pc-builds-hub/forgot-password.html` / `forgot-password.js` / `reset-password.html` / `reset-password.js`
  - 変更: `pc-builds-hub/auth.js` / `login.html` / `login.js` / `style.css` / `sw.js` / `robots.txt`
- **変更内容**:
  - `auth.js` に `resetPasswordForEmail()` / `updatePassword()` を追加。redirectTo は既存 `getEmailRedirectTo()` と同じ考え方で `new URL("reset-password.html", location.href)` により解決するため、本番・localhost 双方でハードコードなしに動く。
  - 入力ルール（`PASSWORD_MIN_LENGTH=6` / `validateEmail` / `validatePassword`）とエラー日本語化（`friendlyError`）を `auth.js` に集約。login.js の重複定義を削除し、新規登録と再設定で条件が二重管理にならないようにした。
  - `login.html` にログインボタン直下の「パスワードを忘れた場合」リンクを追加（新規登録モードでは非表示）。入力済みメールを `?email=` で引き継ぐ。
  - `reset-password.js` はリカバリー遷移（`#access_token…&type=recovery` / `?code=`）のときだけ入力欄を表示。通常ログイン中に直接開いてもパスワード変更させないため、通常ログイン導線と競合しない。変更成功後は明示的に signOut し、リカバリーセッションを残さない。
  - メール送信結果はアカウントの有無に関わらず同一文言（存在推測の防止）。ただしレート制限・通信エラーのみ個別表示。
  - 二重送信防止（disabled +「送信中...」/「変更中...」）。
- **既存バグの修正（今回の実装に必要だったため）**: `style.css` に `[hidden]{display:none!important}` を追加。`.auth-form` / `.auth-field` 等が `display:flex` を持つため HTML の `hidden` 属性が打ち消され、**ログインモードでも「表示名」欄が表示されたまま**になっていた。`submit.html` / `edit.html` / `admin.html` / `mypage.html` の `hidden` 要素も同様に効いていなかったものが正常化した。
- **影響範囲**: pc-builds-hub のみ。閲覧機能・投稿・管理画面のロジックは未変更。`sw.js` は新ページ追加のため precache に追記し `v10 → v11`。`robots.txt` に新規2ページの Disallow を追加（login.html と同方針）。
- **検証**: ローカル配信 + ヘッドレスChrome で 33項目（新機能17 / 既存回帰16）すべてPASS。実Supabaseに対し、確認済みテストアカウントで「変更成功 → 旧PWでログイン不可(400) → 新PWでログイン可(200)」まで実測。期限切れ/無効リンク・直アクセス・確認欄不一致・6文字未満・連打も確認。
- **未対応・次にやること**:
  - **Supabase Dashboard 側の設定が必要**: Authentication → URL Configuration → Redirect URLs に `https://sippo-pc.jp/pc-builds-hub/reset-password.html` を追加すること（未追加だとメールのリンクが Site URL に飛び、再設定画面が開かない）。
  - 現在 Site URL は `https://sippo-pc.jp`。メールテンプレートは既定のまま（implicit フロー = `#access_token…&type=recovery`）で動作確認済み。
- **別AIへの引き継ぎ注意点**:
  - CDN の supabase-js v2（UMD）は既定が `flowType: implicit`。PKCE 前提の実装例をそのまま持ち込まないこと。`reset-password.js` は両形式に対応済み。
  - パスワード条件を変える場合は `auth.js` の `PASSWORD_MIN_LENGTH` のみを変更する（login.html の `minlength` 表示値も合わせる）。
  - Supabase の無料SMTPはメール送信レート制限（約2通/時）があり、連続テストで 429 `over_email_send_rate_limit` になる。

## 2026-07-28 — サイト全体にGoogleタグ（GA4 gtag.js）を設置

- **修正目的**: シッポPCサイト全体のページ閲覧数と、pc-consultで実装済みのクリックイベント（`click_square_500` / `click_coconala_1500`）をGA4で計測できるようにする。
- **測定ID**: `G-NDQ8GTKGHC`（全ページ共通）
- **変更ファイル**: HTML **115ファイル** ＋ 生成スクリプト **3ファイル**（計118／追加1298行・**削除0行**）
  - 親サイト `index.html` / `pc-consult/` / `pc-build-check/`（+ `builds/` 75件）/ `game-pc-guide/`（+ `games/` 25件）/ `gpu-guide/` / `pc-builds-hub/`
  - `generate-builds.ps1`, `pc-build-check/generate-builds.ps1`, `game-pc-guide/Generate-StaticGames.ps1`
- **変更内容**:
  - 各HTMLの `</head>` 直前にGoogle公式のgtag.jsスニペットを挿入。既存のtitle/meta/OGP/CSS/JS/構造化データには一切触れていない（**削除行0**＝純粋な追記のみ）。
  - **生成スクリプト3本のheadテンプレートにも同じタグを追加**。これを入れないと `builds/` 75件・`games/` 25件を再生成した瞬間にタグが消えるため。PowerShellのヒアストリング内だがスニペットに `$` を含まないため補間の影響なし（構文チェック済み）。
  - BOM有無（76ファイルBOM付き / 41なし）と CRLF をファイルごとに完全維持し、差分をタグ追加行のみに限定した。
- **設置しなかったページ（2件）とその理由**:
  - `pc-builds-hub/rls-test.html` … RLS動作確認用の**開発ページ**。本番の計測データを汚すため除外。
  - `game-pc-guide/offline.html` … Service Workerの**オフライン表示専用**。ネットワーク不通時に出るページなのでGA送信自体が不可能。
  - なお `noindex` ページ（`gpu.html` / `game.html` / hubのlogin・admin・mypage等）には**設置した**。noindexは検索インデックス制御であり、実ユーザーが閲覧する動線の計測は必要なため。`404.html` は現状リポジトリに存在しない。
- **検証（ヘッドレスChrome + CDPネットワーク傍受で実測）**:
  - 全115ファイルにタグあり・**重複ゼロ**（`script[src*=googletagmanager]` が全ページちょうど1個、測定IDの出現も各2回＝src/config のみ）。
  - 6サイトすべてで `typeof window.gtag === 'function'`、`page_view` が `tid=G-NDQ8GTKGHC` で送信されることを確認。
  - クリック計測：4リンク×1クリックで `click_square_500` 2件・`click_coconala_1500` 2件（**1クリック=1回**、重複なし）。`service_location` は `service_card` / `apply_section` を正しく区別。PC(1280px)・SP(390px)両方で確認。
  - gtagに渡る実データも確認：`{service_location, link_url, link_text, page_path:"/pc-consult/"}` の4パラメータすべて正常。
  - コンソールエラー **0件**、横スクロール（レイアウト崩れ）なし。生成ページ（builds/games）もPC・SP両方で正常。
- **未対応・次にやること**:
  - GA4管理画面で `click_square_500` / `click_coconala_1500` をカスタムイベントとして確認し、必要ならキーイベント（コンバージョン）に登録。
  - `service_location` / `link_url` / `link_text` / `page_path` は**カスタム定義（カスタムディメンション）に登録しないと**探索レポートで分解できない。GA4側の設定作業が別途必要。
  - データ反映はリアルタイムレポートで即時、通常レポートは24〜48時間程度かかる。
- **別AIへの引き継ぎ注意点**:
  - **新しいHTMLページを追加したら、同じスニペットを `</head>` 直前に入れる**こと。測定IDは `G-NDQ8GTKGHC` で全ページ共通。
  - **`builds/` `games/` を再生成する場合は生成スクリプト側にタグが入っていることを前提にしてよい**（3本とも対応済み）。逆にスクリプトからタグを消すと再生成で全ページから消えるため注意。
  - `gtag` 関数を他の場所で再定義しないこと（`pc-consult/main.js` は `window.gtag` を**呼ぶだけ**で定義していない）。
  - 開発用ページ（rls-test）とオフライン用ページは意図的に除外している。安易に足さないこと。

---

## 2026-07-27 — 申し込みボタンのクリック計測（GA4イベント）を実装

- **修正目的**: 500円Square商品と1,500円ココナラ商品のクリック数を GA4 で個別に把握し、さらに「サービスカード」「申し込みセクション」のどちらから押されたかを識別できるようにする。
- **変更ファイル**:
  - `pc-consult/index.html`（対象リンク4本に `data-track` / `data-location` を付与）
  - `pc-consult/main.js`（`initClickTracking()` を追加）
- **変更内容**:
  - 計測対象4リンクに data 属性を付与。①500円Square/カード ②1,500円ココナラ/カード ③500円Square/申し込み ④1,500円ココナラ/申し込み。イベント名は `click_square_500` / `click_coconala_1500`、掲載位置は `service_card` / `apply_section`。
  - `main.js` に `initClickTracking()` を追加し `init()` から呼び出し。`a[data-track]` のみを対象に click を購読し、`gtag('event', <data-track>, {service_location, link_url, link_text, page_path})` を送信。
  - **preventDefault は使用しない**（外部リンクの新規タブ遷移を妨げないため）。`dataset.trackBound` フラグで同一リンクへの二重登録を防止。`typeof window.gtag !== 'function'` で早期 return し、送信処理全体を try/catch で囲って計測失敗が遷移や他機能を止めないようにした。
  - URL・`target="_blank"`・`rel="noopener noreferrer"`・クラス名・ボタンデザインは一切変更なし。
- **影響範囲**: `/pc-consult/` のみ。既存の reveal アニメ・stagger・スムーススクロール・仮リンク警告は未変更（回帰確認済み）。HTML/CSSの見た目に変化なし。
- **⚠️ 重要 — GA4タグ自体は未設置**: 調査の結果、リポジトリにも本番サイトにも gtag.js / GTM / 測定ID は**存在しない**（`/` と `/pc-consult/` の実レスポンスで確認）。そのため現時点ではイベントは**送信されない**（gtag未定義で安全に何もしない）。ユーザー判断により「計測コードのみ先行実装」で確定。**GA4タグ（測定ID `G-XXXXXXXXXX`）を設置した時点から、コード変更なしで自動的に計測が始まる。**
- **検証**: ヘッドレスChrome（CDP）で実測。①4リンク×クリック → ちょうど4イベント（PC 1280px / SP 390px 両方）②gtag未定義でクリックしても例外ゼロ ③DOMContentLoad再発火（再初期化）後も1クリック=1イベント ④同一リンク3クリック=3イベント ⑤全4リンクで `defaultPrevented === false`（遷移を妨げていない）⑥コンソールのエラー・警告ゼロ ⑦`node --check` 構文OK。
- **未対応・次にやること**:
  - **GA4測定IDの発行と gtag.js の設置**（これをやるまで数値は貯まらない）。設置後、GA4管理画面で `click_square_500` / `click_coconala_1500` をカスタムイベントとして確認し、必要ならキーイベント（コンバージョン）登録。
  - `service_location` / `link_url` / `link_text` / `page_path` をGA4のカスタム定義に登録しないと、探索レポートで分解できない点に注意。
  - 親サイトや他の子サイトには計測を入れていない（今回のスコープ外）。
- **別AIへの引き継ぎ注意点**:
  - 計測対象を増やすときは **HTMLに `data-track` と `data-location` を足すだけでよい**（main.js は汎用実装のため変更不要）。
  - `initClickTracking()` では **preventDefault を絶対に足さない**。`target="_blank"` の遷移が壊れる。
  - 計測は「おまけ」であり、GA未設置・送信失敗でもサイト機能を止めない設計。この安全側の姿勢を崩さないこと。

---

## 2026-07-27 — ゲーム向けPC構成・購入相談（ココナラ 1,500円）を公開・受付開始

- **修正目的**: サービス一覧2枚目の「ゲーミングPC構成相談 2,000円〜／受付準備中」カードを、ココナラで実際に出品中の1,500円商品（APEX・RUST向けゲーミングPC提案）に差し替え、実際に申し込める状態にする。あわせて「500円のみ受付中」という矛盾文言を一掃する。
- **変更ファイル**:
  - `pc-consult/index.html`
  - `pc-consult/style.css`
- **変更内容**:
  - サービスカードB：「ゲーム向けPC 構成・購入相談 / 1,500円」に変更。ポイントを「APEX・RUSTなどゲーム別に提案 / BTO・自作PCのどちらも対応 / PC初心者にもやさしく解説」に差し替え。`plan-button is-disabled`（受付準備中ラベル）を、500円カードと同じ `btn btn--primary service-card__btn` のココナラリンク（`target="_blank"` / `rel="noopener noreferrer"`）に置換。
  - 申し込みセクションに `.apply__sub` サブプランブロックを新設（1,500円・ココナラ導線）。500円のSquare導線＝白カード（主力）を維持し、その**下**に半透明カードで配置して主従を明示。
  - 500円と1,500円の役割分けを明記：500円＝「買うPCが1台決まっている人向け」、1,500円＝「まだ決まっていない人向け」。サービス一覧上部・各カード説明・申し込みセクションの3箇所に補足。
  - 矛盾文言を修正：サービス一覧上部の案内、申し込みセクションの `apply__status`（「いま申し込めるのは500円だけ」→両方受付中）、ヒーロー注釈、フッターのコピーライト行。「受付準備中」は3,000円の中古PC探し代行カードのみに残した。
  - CSS追加は最小限：`.apply__sub` 一式（既存 `.apply__plan` 系のトーンを踏襲）と、`.price-note` の flex 折返し対応（`flex-wrap:wrap` + `.price-note__body{flex:1 1 0;min-width:0}`）のみ。既存のクラス名・デザイン・レスポンシブ設計は変更なし。
- **影響範囲**: `/pc-consult/` の表示と導線のみ。Square決済URL（`https://square.link/u/f9NW4Ctc`）・GoogleフォームURL・無料事前問い合わせURL・3,000円カード・JS（`main.js`）はすべて未変更。`main.js` の仮リンク警告は `.apply a[href="#"]` のみ対象のため、新規の実URLリンクには影響しない。
- **検証**: ヘッドレスChrome（CDP）で 360 / 390 / 768 / 1280px を実測。`documentElement.scrollWidth === clientWidth` を全幅で確認（横スクロールなし）。外部リンク5件すべて `target=_blank` + `rel=noopener noreferrer` で解決、ココナラURLは HTTP 200。コンソールエラーなし。HTMLの開閉タグ対応をパースで検証済み。
- **未対応・次にやること**:
  - `/pc-consult/` の `<title>` / meta description / OGP / 構造化データ（Service）は「500円」訴求のままにしてある。1,500円商品もSEOで拾いたい場合は別途検討（今回はSEO情報の基本構成を変更しない方針のため据え置き）。
  - 中古PC探し代行・比較（3,000円）は引き続き準備中。
- **別AIへの引き継ぎ注意点**:
  - **申し込み先が商品ごとに異なる**：500円＝Square決済→Googleフォーム自動遷移、1,500円＝ココナラ商品ページ。片方の導線を他方に流用しないこと。
  - 500円が主力商品。1,500円は `.apply__sub` のサブプラン扱いで、視覚的な主従（白カード vs 半透明カード）を崩さない。
  - ココナラURLはクエリ付き（`?ref=top_histories&...`）。HTML内では `&amp;` でエスケープ済み。

---

## 2026-07-25 — 相談導線の整理（各サイトの「シッポPC相談室」バナー/本文リンクを削除）＋ selectの高さ揃え

- **修正目的**: `/pc-consult/` への相談導線が各サイトに大きなバナー＋本文リンクで複数箇所に出て過剰だったため、要所（ヘッダー・各サイト固有のCTA・フッター）に集約して整理する。あわせて pc-build-check のフォームで補足文の行数差により3つのselectの高さが不揃いになる見た目を修正。
- **変更ファイル**:
  - `game-pc-guide/index.html`（相談バナー`.consult-banner`ブロックを削除。コメントに集約方針を残す）
  - `gpu-guide/index.html`（同上のバナー削除＋本文中の「購入前チェック」リンク1件を削除）
  - `pc-build-check/index.html`（同上のバナー削除＋中古PC補足の「購入前チェック」リンク1件を削除）
  - `pc-build-check/style.css`（`.form-field select` に `margin-top:auto` を追加。末尾ブロックの改行コードを統一）
- **変更内容**: 3サイトの大型相談バナー（`.consult-banner` とそのローカル`<style>`）を撤去し、代わりに集約方針を示すHTMLコメントを設置。gpu-guide/pc-build-check の本文中インライン相談リンクも削除。CSSはグリッド等高セル内でselectを下端寄せ（`margin-top:auto`）して補足文の行数差があっても高さを揃えた。
- **影響範囲**: 表示（相談バナーが各サイトから消える／フォームselectの高さが揃う）のみ。JS挙動・Supabase連携・診断ロジックには影響なし。ヘッダー・固有CTA・フッターの相談導線は維持。
- **未対応・次にやること**: 特になし。相談導線を再度増やす場合は「バナー乱立で過剰」だった経緯を踏まえ要所限定にする。
- **別AIへの引き継ぎ注意点**: `.consult-banner` は意図的に削除済み。相談導線を復活させる場合はサイト全体で重複しないよう要所（ヘッダー/固有CTA/フッター）に限定すること。

---

## 2026-07-24 — SEO(第2フェーズ): soft404の根本対策（SPA詳細ページを方針Aで検索対象外に統一）

- **修正目的**: sitemap除外だけではsoft404の根治にならない（GH Pagesは静的でクエリ無効ID時も常に200、過去クロール履歴/外部/内部リンク経由で空ページに到達しうる）。方針A（GPU個別・投稿詳細を検索対象外）にコードを統一する。
- **調査結果**: 無効ID時 `gpu.html?id=` `post.html?id=` は全て**HTTP200**。noindexは旧実装ではJSで動的挿入＝レンダリング未実行だと空ページ扱いでsoft404リスク。さらに有効ID時にJSがcanonicalをクエリURLへ書き換えており、sitemap除外(A)と**矛盾**していた。
- **変更ファイル**:
  - `gpu-guide/gpu.html`（初期HTMLに `<meta name="robots" content="noindex, follow">` 常設）
  - `pc-builds-hub/post.html`（同上）
  - `gpu-guide/gpu-detail.js`（canonicalをクエリURLへ書き換える処理を削除。title/og:urlは維持）
  - `pc-builds-hub/post.js`（同上のcanonical書き換えを削除。document.titleは維持）
- **変更内容**: 詳細SPAは初期HTML(静的)で確実にnoindex。canonicalは素のgpu.html/post.htmlへ固定。build/game本体・gpu-guide index・all-posts.htmlはindexableのまま（follow導線を残す）。sitemapにnoindexページ混入なしを再検証。
- **影響範囲**: 表示・Supabase連携・投稿閲覧/いいね機能は不変（`node --check`でgpu-detail.js/post.js構文OK）。検索面ではGPU個別/投稿詳細が明示的に検索対象外になる。
- **未対応・次にやること**: 個別GPU/投稿詳細を将来検索対象化する場合は方針B（静的HTML生成＋自己参照canonical＋静的内部リンク＋sitemap追加＋noindex除去）をセットで実装。GH Pages「Enforce HTTPS」ONは引き続き要対応。
- **別AIへの引き継ぎ注意点**: 方針は**A（検索対象外）で確定**。gpu.html/post.htmlのnoindexを外すのは静的化とセットのときだけ。JS側の`showNotFound`/`renderMessageCard`のnoindex注入は二重でも無害なため残置。

## 2026-07-24 — SEO: インデックス未登録の主要因を修正（SPAクエリURL掃除・重複H1/title一意化）

- **修正目的**: GSC「検出/クロール済み・インデックス未登録」「ソフト404」「重複」の主要因を解消する。SPAのクエリURL(`gpu.html?id=` / `post.html?id=`)がsitemapに載って重複・soft404化していた点と、buildページのH1/titleが一部重複していた点が原因。
- **変更ファイル**:
  - `gpu-guide/sitemap.xml` / `gpu-guide/generate-sitemap.ps1`（`gpu.html?id=*` 27件と素の`gpu.html`を除外。indexはディレクトリ正規URLに統一）
  - `pc-builds-hub/sitemap.xml` / `pc-builds-hub/generate-sitemap.ps1`（`post.html?id=*` を除外。トップ+all-postsのみ）
  - `pc-builds-hub/post.html`（自己参照canonical追加＝素のpost.htmlへ正規化）
  - `pc-build-check/generate-builds.ps1`（H1にCPU/GPU/予算を付与し一意化、衝突ページはtitleにもCPU付与、ページ固有の導入文を追加）
  - `pc-build-check/builds/*.html` 75件（再生成）＋ `pc-build-check/builds.css`（`.build-intro`追加）
  - `pc-build-check/sitemap.xml`（再生成／75件一致）
  - `sitemap.xml`（変更した子サイトのlastmodを2026-07-24へ）
- **変更内容**: sitemapは200を返すcanonical URLのみに整理。noindexページ混入なし。build/gameページの構造(静的・自己参照canonical・index静的リンク)は維持。重複title/H1/descriptionを全て0件に。真の重複ページ(4k-creative-30man と -2、CPUのみ違い)はCPUで区別。
- **影響範囲**: pc-build-check配下75ページのH1/導入文の表示が変化（デザインは踏襲）。gpu-guide/pc-builds-hubのsitemap掲載URLが減少。既存の評価済みURL(build/game本体)のURL自体は不変。
- **未対応・次にやること**:
  - GitHub Pagesの「Enforce HTTPS」をONにする（http://が現状301せず200。コード外の設定操作）。
  - gpu個別GPU / hub投稿詳細を検索対象にしたい場合は静的化(SSR)してから改めてsitemapへ。
  - GSCで各sitemap再送信＋主要URLのインデックス登録リクエスト。
- **別AIへの引き継ぎ注意点**: `generate-builds.ps1` は **`pc-build-check/` 配下が正**（root直下の同名は古い＝マザーボード欄なし。編集しない）。sitemapに `?id=` クエリURLを二度と載せないこと（重複/soft404の原因）。詳細は memory `sippo-seo-indexing-root-causes`。

## 2026-07-19 — push前SEO最終レビュー（noindex調整・空シェルURLのsitemap除外）

- **修正目的**: SEO修正のpush前レビューで見つかった細部の是正。
- **変更ファイル**: `pc-builds-hub/{login,submit,edit,mypage,admin,rls-test}.html` / `gpu-guide/gpu-detail.js` / `gpu-guide/sitemap.xml` / `pc-builds-hub/post.js` / `pc-builds-hub/sitemap.xml` / `pc-builds-hub/generate-sitemap.ps1` / `sitemap.xml`
- **変更内容**:
  - hub管理系6ページの `noindex, nofollow` を `noindex, follow` に変更（nofollowにする理由がないため）。
  - gpu-detail.js の showNotFound / post.js の renderMessageCard で、ID不正・IDなし・エラー時に meta robots noindex を動的注入（空シェルのインデックス防止）。
  - 「見つかりません」表示になる素の `gpu.html`・`post.html` を各sitemapから除外。hubのsitemap生成スクリプトからも post.html の静的エントリを削除（再生成しても復活しない）。
- **影響範囲**: 表示・機能への影響なし。post.html / all-posts.html はindex対象のまま。
- **未対応・次にやること**: gpu-guide/generate-sitemap.ps1 は現行の手動キュレーション版sitemapと出力形式が異なる（実運用されていない模様）。再生成運用するなら要整備。
- **別AIへの引き継ぎ注意点**: pc-build-check/sitemap.xml の lastmod は手動付与。generate-builds.ps1 は lastmod を出力しないため、再生成すると lastmod は消える（虚偽の日付にはならない）。

---

## 2026-07-19 — SEO総点検（旧ドメインcanonical修正・noindex整備・内部リンク強化・構造化データ）

- **修正目的**: Google検索での表示回数を増やすため、クロール・インデックスを妨げる問題を優先的に修正する。
- **変更ファイル**:
  - `pc-build-check/builds/*.html`（全75ファイル）
  - `pc-build-check/index.html` / `pc-build-check/style.css` / `pc-build-check/sitemap.xml`
  - `generate-builds.ps1` / `pc-build-check/generate-builds.ps1`
  - `gpu-guide/sitemap.xml` / `gpu-guide/gpu-detail.js`
  - `game-pc-guide/game.html` / `game-pc-guide/offline.html`
  - `pc-builds-hub/{login,submit,edit,mypage,admin,rls-test}.html`（noindex追加）
  - `pc-builds-hub/post.html` / `pc-builds-hub/all-posts.html` / `pc-builds-hub/post.js`
  - `sitemap.xml`（index。lastmod更新）
- **変更内容**:
  - **【最重要】構成75ページの canonical / og:url / og:image が旧ドメイン `https://2tom.jp/...` のままだったのを `https://sippo-pc.jp/pc-build-check/...` に修正**。あわせて `/icons/`・`/manifest.json` のルート絶対パス（404になっていた）を `../icons/`・`../manifest.json` に修正。
  - gpu-guide/sitemap.xml から gpus.json に存在しない `rx-9060-xt`（ソフト404）を削除し、存在する `rx-9070-xt` に差し替え。
  - gpu-detail.js の updateOgp で canonical も `gpu.html?id=xxx` に動的更新するよう追加（sitemap のURLと一致させるため）。
  - pc-builds-hub のログイン/投稿/編集/マイページ/管理/RLSテストの6ページに `noindex, nofollow` を追加。game-pc-guide の旧動的ページ `game.html`（静的25ページと重複・リンクなし）に `noindex, follow`、`offline.html` に `noindex` を追加。
  - pc-build-check トップに「解像度別 全構成一覧」セクション（#all-builds、details/summary の静的リンク75本）を追加。従来は静的リンクが3本のみでクロール導線が弱かった。対応CSSを style.css 末尾に追加。
  - title・H1が完全同一だった `4k-creative-30man.html` と `-2.html` を CPU名（Ryzen 9 7900 / 7900X）で差別化。
  - 構成75ページに BreadcrumbList JSON-LD を追加（可視パンくずと同一内容）。**生成スクリプト2本のテンプレートにも同じものを追加済み**（再生成しても維持される）。
  - pc-builds-hub: post.html / all-posts.html に meta description、all-posts.html に canonical を追加。post.js で投稿タイトルを document.title / canonical（?id=付きURL）に反映。
  - pc-build-check/sitemap.xml の全URLに lastmod 2026-07-19 を追加。sitemap index の該当2件の lastmod を更新。
- **影響範囲**: 見た目の変更は pc-build-check トップの一覧セクション追加のみ。Supabase・診断ロジック・URLは不変更。SWキャッシュ済みユーザーには旧HTMLが一時残る。
- **未対応・次にやること**:
  - Search Console で sitemap 再送信と `2tom.jp` 側のカバレッジ確認（2tom.jp が今も生きているならリダイレクト設定を検討）。
  - gpu-guide のランキング/比較表はJS描画のみ（レンダリング依存）。必要なら主要GPUの静的リンク一覧を index に追加。
  - game-pc-guide の game.html は noindex にしたが、不要なら将来削除を検討。
- **別AIへの引き継ぎ注意点**:
  - `4k-creative-30man(-2)` のtitle差別化は builds.json 由来ではなくHTML直接編集。**generate-builds.ps1 を再実行すると元に戻る**ので、再生成時は builds.json 側で差別化するか再適用が必要。
  - 構成ページの canonical は生成スクリプト側では既に sippo-pc.jp になっており、再生成しても後退しない。

---

## 2026-07-09 — サイト全体のパフォーマンス改善（スクロールのカクつき・初回表示・スマホ軽快さ）

- **修正目的**: 全サイト共通で「開いた直後が重い」「スクロールが引っかかる」「スマホでのっそりする」症状を、デザインの方向性（明るめ・ガラスUI・シッポのマスコット感）を維持したまま改善する。
- **変更ファイル**:
  - `style.css` / `script.js` / `index.html`（親サイト）
  - `pc-consult/style.css`
  - `gpu-guide/common.css`
  - `game-pc-guide/style.css` / `game-pc-guide/images/favicon.png`（512px→180pxに縮小、250KB→37KB）
  - `pc-build-check/style.css`
  - `pc-builds-hub/style.css`
- **変更内容**:
  - **`filter: blur(60〜70px)` の常時アニメする hero blob を廃止**（親サイト・pc-consult）。透明フェードの radial-gradient で「ぼかし風」を再現し、見た目をほぼ維持したまま描画コストを大幅削減。スマホでは blob のアニメーション自体も停止。
  - **`background-attachment: fixed` を撤去**（gpu-guide/common.css・game-pc-guide）。スクロール毎の全画面再描画の原因。`body::before { position: fixed; z-index: -1 }` の固定レイヤーに置き換え、見た目は同一。
  - **backdrop-filter の整理**: 全サイトの sticky ヘッダーの blur を 10px に統一し、スマホ（820px以下）では blur を切って不透明背景（.94〜.96）で代替。親サイトの `.glass` は 18px→10px（スマホは blur なし）、hero チップ・相談FAB は blur を外して不透明度アップで代替。pc-builds-hub のほぼ不透明なパネル2箇所は blur を除去（視認差なし）。pc-build-check のインストールプロンプトは 20px→10px。
  - **常時アニメーションのスマホ停止**（親サイト820px以下）: blob浮遊 / チップ浮遊 / マスコットリング呼吸 / バッジ点滅 / SCROLLバー / 肉球ゆらぎ 等を停止。マスコット本体のふわふわ（mascotFloat）だけは残してマスコット感を維持。
  - **影の軽量化**: `--shadow-card` 0 20px 60px→0 12px 32px、`--shadow-pop` 0 30px 80px→0 16px 40px 等、方向性を変えずに縮小。
  - **出現アニメーション短縮**: `.reveal` を 0.9s/34px/90ms → 0.55s/22px/60ms に。体感の「のっそり感」を軽減。
  - **script.js**: scroll リスナー2本（ヘッダー・相談FAB）を requestAnimationFrame 1本に統合。マスコットのアイドルタイマーが mousemove 毎に張り直されていたのを1秒間隔に間引き。`will-change` の乱用（`.btn` 全ボタン等）を削除。
  - **index.html**: LCP のマスコット画像に `fetchpriority="high"` を追加。
  - **prefers-reduced-motion 対応を追加**: game-pc-guide / gpu-guide / pc-build-check / pc-builds-hub（従来は親サイトと pc-consult のみ対応）。
- **影響範囲**: 全サイトの見た目（影がやや控えめ・blob の輪郭がわずかに変化）と描画パフォーマンス。URL構造・SEO・OGP・sitemap・文言は無変更。ローカルサーバーで全ページ HTTP 200 確認、`node --check` で JS 構文確認、ヘッドレスChrome で親サイト（PC/スマホ幅）・game-pc-guide・pc-consult のスクリーンショット比較を実施し、変更前後でレイアウト差異なし。副作用チェックとして、全6ページで console error なし・スマホ幅390pxで横スクロールなし（実測 scrollWidth==clientWidth）・ハンバーガードロワー開閉正常・`.reveal` 全45要素の表示到達を確認済み。なお、ヘッドレスChromeは最小ウィンドウ幅500pxの制約があり、390px指定のスクリーンショットは「500pxで描画→390pxに切り抜き」となって右端が切れて見えるが、実レイアウトの問題ではない（検証時の注意点）。
- **未対応・次にやること**:
  - Google Fonts（M PLUS Rounded 1c）が親サイトでレンダリングブロック。`font-display: swap` は有効だが、サブセット化や self-host でさらに改善可能。
  - `gpu-guide/ogp.png`（1.1MB）と `pc-build-check/ogp.jpg`（526KB）はSNS共有時のみ読まれるがサイズ過大。圧縮推奨。
  - `assets/sippo/_originals/`・`_full/`（計約9MB）はどこからも参照されておらずページ速度に影響しないが、リポジトリ容量として整理候補。
  - game-pc-guide の各ゲーム画像（150〜260KB のjpg）は WebP 化でさらに半減できる。
- **別AIへの引き継ぎ注意点**:
  - hero の blob は **`filter: blur()` を使わず透明フェードの radial-gradient で表現する方針**。blur() を復活させないこと。
  - ダーク系サブサイトの固定背景は `body::before`（position: fixed）方式。`background-attachment: fixed` に戻さないこと（スクロールが重くなる）。
  - スマホ（820px以下）はヘッダー等の backdrop-filter を切って不透明背景で代替する方針で全サイト統一済み。
  - `gpu-guide/script.js` の `console.log`（affiliate デバッグ）は「問題解決後も残す」と明記されているため意図的に残した。

## 2026-07-01 — pc-consult 500円CTAのボタン文言をユーザー確認により差し戻し

- **修正目的**: 直前のコミット（Square決済リンク導入）で `#apply` メインCTAの文言を「Squareで支払って相談フォームへ進む」に変更したが、ユーザーより「Squareへの遷移はすぐに支払いとなるわけではないため、以前の『ワンコイン相談へ進む』的な文言のままで良い」との指摘があり、ボタン文言のみ元に戻す。リンク先（Square決済リンク）・決済後フローの補足説明文は変更しない。
- **変更ファイル**: `pc-consult/index.html`
- **変更内容**: `#apply` メインCTAボタンの文言を「Squareで支払って相談フォームへ進む」→「500円ワンコイン相談を申し込む」に戻し、`#services` カードのCTA文言と統一。`href`（`https://square.link/u/f9NW4Ctc`）・CTA直下の決済後フロー説明文（お支払い後の自動遷移・受付完了・お名前確認の案内）は無変更。
- **影響範囲**: ボタンの表示テキストのみ。リンク先・導線・料金体系・他ファイルへの影響なし。
- **未対応・次にやること**: なし。
- **別AIへの引き継ぎ注意点**: `#apply` メインCTAの文言は「500円ワンコイン相談を申し込む」で統一（強い「支払う」表現は使わない方針）。リンク先はSquare決済リンクのまま維持すること。

## 2026-07-01 — pc-consult 500円ワンコイン相談をSquare決済リンク経由に変更

- **修正目的**: Square側で「決済完了後にGoogleフォームへ自動遷移する」設定が完了したため、サイト側の500円ワンコイン相談の申し込み導線を「シッポサイト→Googleフォーム直接」から「シッポサイト→Square決済→決済完了後にGoogleフォームへ自動遷移→フォーム送信で受付完了」に変更する。サイト側に決済機能・カート機能は一切実装せず、Square側の既存決済リンクへ外部遷移させるだけ。2,000円/3,000円プランは引き続き準備中、無料の事前問い合わせ導線は無変更。
- **変更ファイル**:
  - `pc-consult/index.html`
  - `AI_WORK_LOG.md`（本記録）
  - `PROJECT_STATUS.md`（申し込み導線の説明を更新）
- **変更内容**:
  - 500円ワンコイン相談のメインCTAだったGoogleフォーム直リンク（`https://forms.gle/KfEsjsgaL49My3gu5`）を、Squareの決済リンク（`https://square.link/u/f9NW4Ctc`）に差し替え。対象は2箇所：`#services` セクションの「ワンコイン購入前チェック」カードのボタン、`#apply` 申し込みセクションのメインCTAボタン。
  - `#apply` メインCTAのボタン文言を「500円ワンコイン相談を申し込む」→「Squareで支払って相談フォームへ進む」に変更。
  - `#apply` メインCTAの直下に、決済後の流れを説明する補足文（「お支払い後、自動で相談フォームへ移動します。フォーム送信まで完了すると受付完了です。」「決済時のお名前とフォームのお名前が違う場合は、フォーム内で分かるように入力してください。」「内容と決済を確認でき次第、順番に返信します。」）を追加。既存の `.apply__main-desc` クラスを流用し、CSS追加なしでスマホのレスポンシブ縮小ルールをそのまま継承させた。
  - Hero直下の補足文・`#services` の price-note にも、Square決済→フォーム自動遷移の流れを一言で追記。
  - `#apply` セクション冒頭のHTMLコメントを、Square決済リンク経由の運用フローに合わせて更新（Googleフォームは決済後の遷移先としてSquare側で設定済みである旨を明記）。
  - **無料の事前問い合わせ用フォームリンク**（`docs.google.com/forms/...`）・**2,000円/3,000円プランの「受付準備中」ラベル**（`plan-button is-disabled`）は変更していない。
- **影響範囲**: `pc-consult/index.html` の500円CTA・説明文言のみ。`pc-consult/style.css` / `pc-consult/main.js` は変更不要と判断し無変更（`main.js` の準備中プレースホルダー処理は `href="#"` のみ対象のため今回のリンク差し替えと無関係）。`canonical` / `og:url` / OGP画像 / sitemap は無変更。Supabase（`pc-builds-hub/`）・Googleフォームの実体（無料窓口）・料金体系は無変更。他子サイト・親サイトへの影響なし。
- **確認結果**:
  - `pc-consult/index.html` 内の500円メインCTA（`#services`カード・`#apply`メインCTA）がSquare決済リンク（`https://square.link/u/f9NW4Ctc`）を指していることを確認。Googleフォーム直リンクは無料の事前問い合わせ（`docs.google.com/forms/...`）のみ残存し、500円メインCTAとしては残っていないことを確認。
  - 2,000円/3,000円プランは `is-disabled` のまま変更なしを確認。
  - div開閉タグ数一致、ローカルサーバーでHTTP 200表示を確認。
  - 追加した補足文言は既存 `.apply__main-desc` クラス（720px以下で `font-size:.92rem` に自動縮小）を流用しているため、スマホ表示崩れのリスクは低いと判断（実機確認は別途推奨）。
  - `canonical` / `og:url` に diff なしを確認。Supabase関連ファイルは今回のdiffに含まれないことを確認（`git status` で `pc-consult/index.html` のみ変更）。
- **未対応・次にやること**:
  - 実際にSquareで500円決済→Googleフォームへの自動遷移が本番で正しく動作するか、公開後に実際の決済フローで一度動作確認することを推奨（サイト側のリンク差し替えのみのため、Square側の遷移設定自体はサイト修正の範囲外）。
  - スマホ実機（iPhone Safari 等）で `#apply` メインCTA直下の補足文の折り返し・余白を目視確認推奨。
- **別AIへの引き継ぎ注意点**:
  - **500円ワンコイン相談のメインCTAはSquare決済リンク（`https://square.link/u/f9NW4Ctc`）**。Googleフォーム直リンク（`https://forms.gle/KfEsjsgaL49My3gu5`）に戻さないこと（Square決済完了後の遷移先としてSquare側で設定済みのため、サイト側から直接リンクする必要はない）。
  - 無料の事前問い合わせフォーム（`docs.google.com/forms/...`）は500円導線と別物なので混同しないこと。
  - Square決済リンクのURLが変わった場合は、`#services` カードボタンと `#apply` メインCTAボタンの両方を更新すること（2箇所）。

---

## 2026-07-01 — 親子サイト間のSEO・内部リンク強化（総合ハブ導線）

- **修正目的**: 統合後にSearch Consoleのクエリ・表示回数が伸び悩んでいるため、「シッポ＝PC初心者向けの総合入口」であることをGoogleとユーザーの両方に伝わりやすくする。具体的には (1) 子サイト同士の横断リンクに漏れがあった箇所の修正、(2) 親サイトの導線強化、(3) ブランド名表記ゆれの解消を行った。決済・カート・料金体系・Googleフォーム・Supabase機能には一切触れていない。
- **変更ファイル**:
  - `gpu-guide/index.html`（関連サイトグリッドの自己リンクバグ修正）
  - `pc-build-check/index.html`（関連サイトグリッドの自己リンクバグ修正）
  - `game-pc-guide/index.html`（関連サイトグリッドに親サイトカード追加）
  - `game-pc-guide/style.css`（関連サイトグリッドを3カラム化するスコープ付きCSS追加）
  - `index.html`（「まずはここから」を3→4ステップ化してGPU GUIDEを追加、GAME GUIDE表記統一、フッターnav追加、#consultセクションにpc-consult導線を追加）
  - `AI_WORK_LOG.md`（本記録）
- **変更内容**:
  1. **関連サイトの自己リンクバグ修正**: `gpu-guide/index.html` と `pc-build-check/index.html` の「関連サイト」セクションが、それぞれ自分自身（GPU GUIDE→GPU GUIDE、PC BUILD CHECK→PC BUILD CHECK）にリンクしていた（コピペミス）。自己リンクを削除し、代わりに親サイト（`https://sippo-pc.jp/`）への「PC選びの総合ハブ」カードに置き換えた。
  2. **game-pc-guideの関連サイトグリッドに親サイトカードを追加**: 従来はPC BUILD CHECK / GPU GUIDEの2枚のみで親サイトへのリンクがなかったため、3枚目として親サイトカードを追加。グリッドを2列→3列に変更（`.related-sites-section .related-site-grid` としてスコープを絞り、25本あるゲーム別詳細ページ側の2列グリッド `.detail-related-sites .related-site-grid` には影響しないようにした）。モバイル breakpoint（900px以下）でも同様にスコープして1列に収まるよう調整。
  3. **これにより GAME PC GUIDE ⇄ GPU GUIDE ⇄ PC BUILD CHECK が相互リンク＋全サイトから親サイトへのリンクが揃った**（各サイトの `consult-banner` で `/pc-consult/` への導線は既存のまま維持）。
  4. **親サイト「まずはここから」を3→4ステップに拡張**: 従来は「ゲームを選ぶ→予算診断→相談」でGPU比較が抜けていたため、「①遊びたいゲームを選ぶ→②GPU性能を比較する→③予算に合う構成をチェック→④不安なら購入前に相談する」の4ステップに変更し、GPU GUIDEへの導線を明示。アンカーテキストも「APEXやモンハンワイルズなど」「RTX 5060 / RTX 4060 / RX 7600 など」のように具体的なキーワードを含む自然な文言に。
  5. **ブランド名表記統一**: 親サイト内に残っていた「GAME GUIDE」（正しくは「GAME PC GUIDE」）の表記4箇所（サービスカードのコメント・見出し、ロードマップ本文、フッターnav）を統一。
  6. **フッターnavにPC構成投稿サイト・シッポPC相談室へのリンクを追加**（従来は3子サイトのみでpc-builds-hub・pc-consultが漏れていた）。
  7. **`#consult` セクションの導線強化**: STEP2の連絡方法一覧に「500円ワンコイン相談で購入前チェック →」（`/pc-consult/`）を追加。STEP3の「PC相談室」カードの文言を「500円ワンコイン相談」を明記する形に強化（リンク先・料金体系は変更なし、文言のみ）。
- **影響範囲**: 対象ファイルの内部リンク・見出し文言・CSSグリッド定義のみ。**canonical / og:url / sitemap / URLルールは無変更**。決済・カート・料金体系・GoogleフォームURLは無変更。Supabase（`pc-builds-hub/`）は今回未変更（既存の関連サイトリンクは変更前から実装済みと確認）。`pc-build-check/builds/*.html`（75件）・`game-pc-guide/games/*.html`（25件）の個別ページ側テンプレートは今回対象外（後述）。
- **確認結果**:
  - 変更4ファイルすべてdiv開閉タグ数一致を確認。
  - ローカルサーバーで `index.html` / `gpu-guide/index.html` / `game-pc-guide/index.html` / `pc-build-check/index.html` がHTTP 200で表示できることを確認。
  - `git diff --ignore-space-at-eol` で実質差分のみ確認済み（`game-pc-guide/style.css` は改行コード起因でraw diffが大きく見えたが、実差分は意図した7行のみ）。
  - サイト全体で「GAME GUIDE」の表記漏れが0件になったことを確認。
- **未対応・次にやること**:
  - `pc-build-check/builds/*.html`（75件・`generate-builds.ps1` 生成）には関連サイトブロックが無い。追加する場合は生成スクリプト側 (`pc-build-check/generate-builds.ps1` と直下 `generate-builds.ps1`) を修正し再生成すること（手編集すると次回生成で消える）。
  - `game-pc-guide/games/*.html`（25件・`Generate-StaticGames.ps1` 生成）の関連サイトブロックはPC BUILD CHECK・GPU GUIDEの2つのみで親サイトへのリンクなし。追加する場合は `game-pc-guide/Generate-StaticGames.ps1` を修正し再生成すること。
  - 親サイトの `#consult` セクションは、STEP2/3でココナラ・X/Instagram DMの旧フローとpc-consult（500円ワンコイン）が並存する形になっている。今回はpc-consult導線を追加するのみに留めたが、将来的にどちらを主導線にするかはユーザー判断が必要（ユーザーに確認済み：今回はpc-consult追加のみで対応）。
  - 優先度A/B（Search Console再送信・pc-builds-hub専用OGP・pc-build-check ogp.jpg 1200x630化）は本作業では未着手（PROJECT_STATUSの既存タスクのまま）。
- **別AIへの引き継ぎ注意点**:
  - **関連サイトグリッドに自己リンクを入れない**こと（今回のバグの再発防止）。各子サイトの「関連サイト」は「自分以外の子サイト2つ＋親サイト」の3枚構成に統一した。
  - `game-pc-guide/style.css` の `.related-site-grid` は **index.html（3列）と games/*.html 詳細ページ（2列, `.detail-related-sites` 配下）で共有クラス**。詳細ページ用のグリッド列数を変えたい場合は `.detail-related-sites .related-site-grid` 側を編集し、`.related-sites-section .related-site-grid`（index用）と混同しないこと。
  - ブランド名は「GAME PC GUIDE」が正式表記（「GAME GUIDE」は使わない）。

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
