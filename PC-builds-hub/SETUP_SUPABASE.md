# PC Builds Hub — Supabase 導入手順

このドキュメントは「静的なPC構成ギャラリー」を、Supabase を使った
**会員登録して投稿できるサイト**へ段階的に移行するための手順です。

現状（このコミット時点）はまだ **Phase 1 の土台のみ**です。
Supabase 未設定でも、これまでどおり `posts.json` を読んで動きます。

---

## アーキテクチャ概要

```
HTML (GitHub Pages / 静的)
  └─ <script> 読み込み順:
       1. (任意) Supabase SDK (CDN)
       2. (任意) supabase-config.js   ← URL / anon key
       3. api.js                      ← データ取得の唯一の窓口
       4. main.js / post.js           ← api.js を経由して取得
```

- **api.js** がデータ取得を集約。Supabase が設定されていれば DB から、
  なければ `posts.json` から取得します（自動フォールバック）。
- フロントは GitHub Pages の静的ホスティングのまま。サーバーは不要です。

---

## Phase 1: Supabase の土台作り（接続まで）

### 1. プロジェクト作成
1. <https://supabase.com> でプロジェクトを作成。
2. **Project Settings → API** から以下を控える：
   - `Project URL`
   - `anon` `public` key（公開鍵。フロントに置いてOK）
   - ※ `service_role` key は**絶対にフロントに置かない**。

### 2. スキーマ作成
1. Supabase の **SQL Editor** を開く。
2. リポジトリ内の [`supabase-schema.sql`](supabase-schema.sql) を全文貼り付けて実行。
   - profiles / posts / likes テーブル
   - `updated_at` 自動更新トリガー
   - `nice_count` 自動同期トリガー（likes ↔ posts）
   - サインアップ時の profiles 自動作成
   - RLS 有効化＋ポリシー
   - 画像用 Storage バケット `post-images`

### 3. 接続設定
1. `supabase-config.example.js` を **`supabase-config.js`** にコピー。
2. `url` と `anonKey` を自分の値に書き換える。
3. （公開リポジトリで鍵を出したくない場合）`.gitignore` に `supabase-config.js` を追加。

### 4. SDK と設定の読み込み（設定済み・404 は出ません）
各HTML（index / all-posts / post）には、`api.js` の **すぐ前**に既に
以下が入っています：

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="supabase-config.js"></script>
<script src="api.js"></script>
```

`supabase-config.js` は**ダミー値入りの実体ファイルとして同梱済み**なので、
404 は出ません。`url` / `anonKey` が `YOUR_…` のままの間は、
api.js が自動的に `posts.json` で動作します（＝今の状態）。

**有効化するには `supabase-config.js` の値を本物に書き換えるだけ**です。
HTML の編集は不要です。

> SDK は CDN から読み込みます。オフライン等で読み込めなくても
> api.js は `posts.json` にフォールバックするので画面は壊れません。

### 5. 初期データ投入（posts.json の 15 件）
1. 一度サインアップして `auth.users` に自分の user を作る。
2. [`supabase-seed.sql`](supabase-seed.sql) の `YOUR_LOGIN_EMAIL` を
   自分のメールに置き換え、SQL Editor で実行。
   - SQL Editor は管理権限で動くため RLS をバイパスして投入できます。
   - メールが見つからない場合は 0 行挿入（安全）。
3. `select count(*) from public.posts where status='approved';` が **15** ならOK。

> 別解（method B：posts.json を読むスクリプトで一括投入）は Node や
> service_role key が必要で手間が増えるため、まずは上の SQL 方式を推奨します。

### 6. 接続確認チェックリスト
- [ ] Supabase プロジェクトを作成した
- [ ] `supabase-schema.sql` を実行した（エラーなし）
- [ ] `supabase-config.js` の `url` / `anonKey` を本物に書き換えた
- [ ] HTML の SDK / config 読み込みが有効（同梱済み・確認のみ）
- [ ] `supabase-seed.sql` で初期データを投入した（count = 15）
- [ ] `index.html` で新着カードが表示される
- [ ] `all-posts.html` で一覧・検索・絞り込み・ソートが動く
- [ ] `post.html?id=xxx` で詳細が表示される（存在しないIDはエラーカード）
- [ ] DevTools Console に `[api] Supabase から approved 投稿を取得: 15 件`（localhost 時）
- [ ] `supabase-config.js` を一時的にダミー値へ戻すと `posts.json` にフォールバックする

> デバッグログは **localhost / file: のときだけ** 出ます（本番では静か）。
> ユーザー向け画面には技術エラーを出さず、読み込み不可時も空状態メッセージのみ表示します。

---

## 既存 posts.json → posts テーブルのキー対応

| posts.json | posts テーブル | 備考 |
|---|---|---|
| `comment` | `description` | |
| `ram` | `memory` | |
| `case` | `case_name` | `case` は予約語回避 |
| `image` | `image_url` | |
| `benchTitle` | `bench_title` | |
| `benchScore` | `bench_score` | |
| `user` | （`profiles.display_name`） | join で取得 |
| 同名 | `cpu/gpu/motherboard/storage/psu/cooler/resolution/usage/tags/badge` | |

api.js の `mapRowToPost()` がこの対応を吸収するので、
main.js / post.js 側のコードは変更不要です。

---

## 投稿ステータス設計

| status | 意味 | 公開一覧/詳細 | 本人 | 管理者 |
|---|---|---|---|---|
| `draft` | 下書き | ✕ | ◯ | ◯ |
| `pending` | 承認待ち | ✕ | ◯ | ◯ |
| `approved` | 公開中 | ◯ | ◯ | ◯ |
| `rejected` | 却下 | ✕ | ◯ | ◯ |

- 公開一覧・詳細は `approved` のみ（RLS で強制）。
- 投稿はデフォルト `pending`（承認制）。
- 管理者（`profiles.role = 'admin'`）は全 status を閲覧・更新可能。

管理者にするには、対象ユーザーがサインアップ後（どちらでも可）：
```sql
-- UUID で指定
update public.profiles set role = 'admin' where id = 'AUTH_USER_UUID';

-- メールアドレスで指定（安全・おすすめ）
update public.profiles p
set role = 'admin'
from auth.users u
where u.id = p.id and u.email = 'YOUR_EMAIL';
```

---

## Phase 2: 認証（会員登録 / ログイン / ログアウト）

### 追加されたファイル
| ファイル | 役割 |
|---|---|
| `auth.js` | Auth 共通処理（`window.PCBuildsAuth`）。api.js のクライアントを共有。 |
| `login.html` / `login.js` | ログイン・新規登録（同一ページでモード切替）。 |
| `mypage.html` / `mypage.js` | 最低限のマイページ（メール / 表示名 / role 表示・ログアウト）。 |
| （更新）`index/all-posts/post.html` | ヘッダーに `data-auth-ui`、all-posts に掲載CTA `data-submit-cta`。 |

### profiles 連携（確認済み）
- `supabase-schema.sql` の `handle_new_user()` トリガーで、**サインアップ時に
  `profiles` が自動作成**されます（`auth.users.id` = `profiles.id`）。
- 表示名は `signUp(..., { data: { display_name } })` 経由で
  `raw_user_meta_data->>'display_name'` に入り、profiles に反映されます。
- `role` の初期値は `'user'`。管理者化は上記 SQL を SQL Editor で手動実行。

### メール認証 ON / OFF の違い
Supabase ダッシュボード → **Authentication → Providers → Email** の
"Confirm email" 設定で挙動が変わります。
- **ON（既定）**：新規登録後にセッションが作られない → 確認メールのリンクを
  開くまでログインできない。login.js は「確認メールを開いてください」と案内。
- **OFF**：登録と同時にログイン状態 → そのまま redirect 先へ移動。
- 開発で手早く試すなら一時的に OFF が便利（本番は ON 推奨）。

### テスト手順
**新規登録**
1. `login.html` を開く →「新規登録はこちら」→ 表示名・メール・パスワード入力。
2. 「新規登録」押下 → 成功メッセージ。
3. （確認）`select * from public.profiles;` に行ができている。

**ログイン**
1. `login.html` でメール・パスワード →「ログイン」。
2. 「ログインしました」→ `redirect` 先（既定 `mypage.html`）へ移動。

**ログアウト**
1. ヘッダーまたは mypage の「ログアウト」→ `index.html` に戻る。

**セッション復元**
1. ログイン後にページをリロード → ヘッダーが「表示名 / マイページ / ログアウト」
   のまま（Supabase JS が localStorage にセッションを保持・自動更新）。

**ヘッダー / CTA 切替**
- 未ログイン：ヘッダー＝「ログイン / 新規登録」、all-posts CTA＝
  「ログインして投稿準備へ」。
- ログイン中：ヘッダー＝「表示名 / マイページ / ログアウト」、CTA＝「マイページへ」。

### よくあるエラーと対処
| 症状 | 原因 | 対処 |
|---|---|---|
| 「Supabase設定が未完了」と出る | config がダミー値 / SDK 未読込 | `supabase-config.js` に本物の値を設定 |
| ログイン後すぐログアウト状態 | メール未確認（Confirm email ON） | 確認メールのリンクを開く or 一時的に OFF |
| 「メールアドレスまたはパスワードを確認してください」 | 資格情報誤り / 未確認 | 入力確認・メール認証確認 |
| profiles に行ができない | スキーマ未実行 / トリガー未作成 | `supabase-schema.sql` を再実行 |
| mypage で role が user のまま | 管理者化 SQL 未実行 | 上記の admin 化 SQL を実行 |

### Supabase 未設定時の挙動（Phase 2）
- index / all-posts / post：`posts.json` で通常表示（変化なし）。
- `login.html`：「ログイン機能は準備中（Supabase設定が未完了）」と表示し、
  フォームは無効化（操作してもエラーにならない）。
- `mypage.html`：ログイン不可の案内のみ表示（login へは飛ばさない）。
- ヘッダーは未ログイン表示（閲覧機能はそのまま）。

---

## Phase 6: 管理者承認画面

### 追加されたファイル
| ファイル | 役割 |
|---|---|
| `admin.html` / `admin.js` | 管理者専用の投稿承認画面（pending 確認 → approved / rejected）。 |
| （更新）`api.js` | `isAdmin` / `getPendingPosts` / `getAdminPostsByStatus` / `updatePostStatus` を追加。 |
| （更新）`mypage.html` / `mypage.js` | 管理者のときだけ「管理者メニュー → 投稿承認画面へ」を表示。 |
| （更新）`auth.js` | 管理者はヘッダー表示名の横に「管理者」チップ。 |

### 管理者 role の付与方法
対象ユーザーが一度サインアップした後、SQL Editor で実行：
```sql
-- メールアドレスで指定（おすすめ）
update public.profiles p
set role = 'admin'
from auth.users u
where u.id = p.id and u.email = 'YOUR_EMAIL';

-- UUID で指定
update public.profiles set role = 'admin' where id = 'AUTH_USER_UUID';
```
反映後、再ログイン（またはリロード）すると mypage に管理者メニューが出ます。

### admin.html の使い方 / 承認手順
1. 管理者でログイン → mypage の「投稿承認画面へ」または直接 `admin.html`。
2. 承認待ち（pending）の投稿カードが一覧表示される（タイトル / 投稿者 / 作成日 /
   CPU・GPU・メモリ・解像度・用途 / タグ / コメント / 画像）。
3. **「承認して公開」** → `status='approved'`：トップ・一覧・詳細に表示される。
4. **「差し戻す」** → `status='rejected'`：公開されない（投稿者は mypage で確認可）。
5. 操作後は一覧が自動再取得される（pending から外れた投稿は消える）。

### アクセス制御
- 未ログイン：`login.html?redirect=admin.html` へ誘導。
- ログイン済みでも管理者でない：「このページは管理者のみ利用できます」と表示し、
  データ取得・更新を行わない。
- Supabase 未設定：「管理機能は準備中（Supabase設定が未完了）」と表示。

### RLS は対応済み（`supabase-schema.sql`）
既存スキーマで充足しています（追加SQLは不要）：
- `posts_select_public`：`approved` は誰でも / 本人は自分の全 status / **`is_admin()` は全件**。
- `posts_update_own`：本人 **または `is_admin()`** が更新可（承認操作はこれで通る）。
- 一般ユーザーは他人の pending を読めず、他人の status も変更できない。

> もし古いスキーマで `is_admin()` 分岐が無い場合は、`supabase-schema.sql` を
> 再実行してください（冪等なので安全に上書きされます）。

### よくあるエラーと対処
| 症状 | 確認ポイント |
|---|---|
| admin.html で「管理者のみ」 | `profiles.role='admin'` になっているか（付与SQL→再ログイン） |
| 一覧が読めない / 更新できない | RLS（`is_admin()` 分岐）→ スキーマ再実行。`role` の綴り |
| 承認しても公開されない | `status` が `approved` になったか。`getApprovedPosts` は approved のみ |
| 「権限がありません」 | 別アカウント（非管理者）でログインしていないか |

---

## posts.json の扱い（重要）

`posts.json` は **削除せず、Supabase 未設定／取得失敗時のフォールバック**として残します。

- **本番運用**：Supabase が設定済みなら、公開表示は **Supabase の `approved` 投稿が優先**。
- **フォールバック**：Supabase 未設定・ダミー値・取得エラーのときだけ `posts.json` を表示。
- **どちらで表示中か**：localhost / file: のとき DevTools Console に出ます。
  - `[api] データソース: Supabase（approved） N 件`
  - `[api] データソース: posts.json（フォールバック） N 件`
- ユーザー向け画面には内部実装（どちらのデータか）は出しません。

---

## Phase 4: 公開表示の安定化

### 変更点
- `getApprovedPosts()`：`status='approved'` のみ・`created_at` 降順・`limit 200`。
- 並び替え「新着順」は **`created_at` 優先**（DB投稿）、無ければ `post-NNN` 連番
  （posts.json）でフォールバック。UUID の id でも崩れません。
- `mapRowToPost()` 強化：
  - `image_url` が空 → `images/no-image.svg`（画像なし投稿のフォールバック）
  - `display_name` が無い → `匿名ユーザー`
  - `tags` が null → 空配列、数値が無い → 空文字（0 表示の誤解を回避）
- 画像なし投稿は、カード・詳細とも `images/no-image.svg` を表示（壊れません）。
- `pending` / `rejected` / `draft` は一覧・トップ・詳細に出ません
  （詳細URLを直接開いても approved 以外は「構成が見つかりませんでした」）。

### 検索・絞り込み・ソートの方針
- Phase 4 では **クライアント側のまま維持**（解像度 / 用途 / タグ / フリーワード /
  新着順）。Supabase から取得した approved 投稿にもそのまま効きます。
- 「お気に入り順（この端末）」は localStorage のまま。
- **将来（投稿数が増えたら）**：`getApprovedPosts()` に
  `.ilike()` / `.eq()` / `.contains('tags', [...])` / `.range()` を足して
  DB側フィルタ・ページングへ移行可能（api.js の取得関数だけ差し替えれば、
  main.js / post.js の表示はそのまま）。

### 公開後の確認 SQL
```sql
-- approved（公開中）件数
select count(*) from public.posts where status = 'approved';

-- pending（承認待ち）件数
select count(*) from public.posts where status = 'pending';

-- 自分の投稿
select id, title, status, created_at from public.posts
where user_id = 'YOUR_AUTH_USER_UUID' order by created_at desc;

-- 公開する（承認）／ 非公開に戻す
update public.posts set status = 'approved' where id = 'POST_UUID';
update public.posts set status = 'pending'  where id = 'POST_UUID';

-- 画像URLが null/空 の投稿（フォールバック画像で表示される）
select id, title from public.posts where image_url is null or image_url = '';

-- user_id が null でないこと（投稿は必ず所有者を持つ）
select count(*) as orphan_posts from public.posts where user_id is null;

-- posts と profiles の紐づき（投稿者名が引けるか）
select p.id, p.title, pr.display_name
from public.posts p
left join public.profiles pr on pr.id = p.user_id
order by p.created_at desc
limit 20;
```

---

## Phase 3: 投稿申請（投稿フォーム / 画像アップロード）

### 追加されたファイル
| ファイル | 役割 |
|---|---|
| `submit.html` / `submit.js` | ログインユーザー用の投稿フォーム。必ず `status='pending'` で保存。 |
| （更新）`api.js` | `createPost` / `getMyPosts` / `uploadPostImage` / `normalizePostInput` を追加。 |
| （更新）`mypage.html` / `mypage.js` | 「構成を投稿する」ボタン＋自分の投稿一覧（ステータス表示）。 |
| （更新）`auth.js` | all-posts の掲載CTAを submit.html 導線に変更。 |

### 投稿フォームの使い方
1. ログイン後、ヘッダーまたは all-posts の「構成を投稿する」→ `submit.html`。
2. 必須（タイトル / CPU / GPU / メモリ / 解像度 / 用途）を入力。
3. 任意項目（説明・各パーツ・予算・タグ・ベンチ・画像）を入力。
4. 「投稿を申請する」→ `status='pending'` で保存され、承認後に公開。

> 未ログインで `submit.html` を開くと `login.html?redirect=submit.html` へ誘導されます。
> Supabase 未設定時はフォーム非表示＋「投稿機能は準備中」案内になります。

### 画像の扱い
- 優先：画像ファイル（jpg/jpeg/png/webp・5MBまで）を Storage `post-images` の
  `user_id/タイムスタンプ-乱数.拡張子` にアップロードし、公開URLを `image_url` に保存。
- ファイルのアップロードに**失敗した場合は投稿を中断**し、「画像URL欄に切り替えるか
  画像なしで」と案内（勝手に画像なし投稿にはしません）。
- 画像URL欄のみ／画像なしでも投稿可能（`image_url` は任意）。

### 投稿テスト手順
1. ログイン → `submit.html` で必須項目を入力して送信。
2. 「投稿申請を受け付けました…」が出ればOK。
3. **公開一覧には出ません**（`pending` のため。これは正常）。

### 確認用 SQL
```sql
-- pending 投稿ができているか
select id, title, status, user_id, created_at
from public.posts
where status = 'pending'
order by created_at desc;

-- 自分の投稿だけ（user_id を自分のものに）
select id, title, status from public.posts where user_id = 'YOUR_AUTH_USER_UUID';

-- 公開する：承認（Phase 6 で画面化予定。今は手動）
update public.posts set status = 'approved' where id = 'POST_UUID';
```
`approved` にすると、一覧・詳細に表示されるようになります。

### Storage の確認
- ダッシュボード → Storage → `post-images` にファイルが入っているか。
- バケットが無い場合は `supabase-schema.sql` を再実行（バケット作成＋ポリシー込み）。

### うまくいかないとき
| 症状 | 確認ポイント |
|---|---|
| 投稿が一覧に出ない | `status` が `pending` なら**正常**。`approved` で公開される |
| 「権限エラーで保存できませんでした」 | ログイン状態 / RLS（`posts_insert_own`）/ `user_id=auth.uid()` |
| 画像保存先が見つからない | `post-images` バケット未作成 → スキーマ再実行。または URL欄で代替 |
| マイページに他人の投稿が出る | 通常起きない（RLS で本人分のみ）。出る場合はRLS設定を確認 |
| 画像アップロードが大きすぎ/拒否 | 5MB以内・jpg/jpeg/png/webp のみ |

> 管理者による承認画面は **Phase 6** で実装予定です。それまでは上の
> `update ... set status='approved'` で手動公開できます。

---

## 今後のフェーズ（未実装）

| Phase | 内容 | 追加ファイル | 状態 |
|---|---|---|---|
| 2 | 会員登録 / ログイン / ログアウト / ログイン状態表示 / 最低限のマイページ | `auth.js` `login.html` `login.js` `mypage.html` `mypage.js` | ✅ 完了 |
| 3 | 投稿フォーム（status=pending 保存）/ 画像アップロード（Storage、URL/画像なしも可） | `submit.html` `submit.js`（api/mypage/auth 拡張） | ✅ 完了 |
| 4 | 公開表示の安定化（approved取得・新着順created_at・画像フォールバック・posts.jsonフォールバック明確化） | （api/main/post 拡張, `images/no-image.svg`） | ✅ 完了 |
| 5 | Nice を localStorage → likes テーブルへ（ログイン必須、未ログインは案内） | （api.js 拡張） | 未 |
| 6 | 管理者承認画面（pending 確認、approved/rejected 更新） | `admin.html` `admin.js`（api/mypage/auth 拡張） | ✅ 完了 |

---

## 注意

- 本番の URL / anon key はコード本体に直書きせず `supabase-config.js` に置く。
- Service Worker（`sw.js`）はキャッシュ名を更新すると旧キャッシュを破棄します。
  JS/設定を変えた時は `CACHE_NAME` のバージョンを上げてください（例 `v3` → `v4`）。
- すべて相対パス。GitHub Pages のサブパス公開でも動作します。
