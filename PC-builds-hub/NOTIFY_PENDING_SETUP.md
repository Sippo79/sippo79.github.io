# 投稿承認依頼の通知（pending 通知）セットアップ

`posts` に `status='pending'` の投稿が現れたとき、管理者の Discord に承認依頼を
通知します。**新規課金サービスは使いません**（pg_net / Vault / Edge Function は
すべて Supabase の無料枠内）。

## 構成（データの流れ）

```
ユーザー投稿 (status=pending)
   └─ posts への INSERT / UPDATE
        └─ PostgreSQL トリガー trg_z_notify_pending_*  ← 条件を SQL で厳密に判定
             └─ pg_net.http_post（非同期キュー：失敗しても投稿は壊れない）
                  └─ Edge Function notify-pending-post（秘密情報はここだけ）
                       ├─ profiles から display_name を取得（service_role）
                       └─ Discord Webhook へ整形メッセージを送信
```

- **秘密情報はフロント（GitHub Pages）に一切置きません。**
  - Discord Webhook URL・共有シークレットは Edge Function の Secrets。
  - トリガー→Edge Function の呼び出しシークレットは Supabase Vault。
- `supabase-config.js` には引き続き **URL と anon key のみ**（変更不要）。

## 通知条件

| ケース | 通知 |
|---|---|
| 新規 INSERT で `status='pending'` | ✅ する |
| `draft → pending`（申請） | ✅ する |
| `rejected → pending` / `approved → pending`（再申請・再審査） | ✅ する |
| `approved` / `rejected` / `draft` のまま | ❌ しない |
| Nice や軽微な更新で `pending` のまま | ❌ しない（`admin_notified_at` で重複防止） |

`admin_notified_at` 列で「通知済み」を記録し、pending 以外に遷移すると解除されます。

---

## セットアップ手順（Supabase Dashboard）

### 1. Discord Webhook を用意
1. Discord で通知を受けたいチャンネル → **設定 → 連携サービス → ウェブフック → 新しいウェブフック**
2. **ウェブフックURLをコピー**（これが `DISCORD_WEBHOOK_URL`）

### 2. 共有シークレットを決める
ランダムな長い文字列を1つ生成（例：パスワードマネージャや `openssl rand -hex 32`）。
これを **Edge Function 側 `NOTIFY_WEBHOOK_SECRET`** と **Vault `notify_webhook_secret`**
の **両方に同じ値** で設定します。

### 3. SQL を実行（SQL Editor）
1. `supabase-notify-pending.sql` を SQL Editor に貼り付け。
2. ファイル内の Vault 登録コメント部分のコマンドを、手順2のシークレットに置換して
   一度だけ実行：
   ```sql
   select vault.create_secret(
     'ここに手順2のシークレット',
     'notify_webhook_secret',
     'pending通知 Edge Function 用の共有シークレット'
   );
   ```
3. 残り（拡張・列追加・関数・トリガー）を実行。冪等なので複数回実行しても安全。

> 関数内の `v_func_url` は本プロジェクト用 URL
> `https://ndckywicmdrmdtfeywdu.supabase.co/functions/v1/notify-pending-post`
> が設定済みです。プロジェクトを変えた場合のみ書き換えてください。

### 4. Edge Function をデプロイ
Supabase CLI（無料）を使います。
```bash
# 初回のみ
supabase login
supabase link --project-ref ndckywicmdrmdtfeywdu

# Secrets を登録（フロントには出ない・サーバー側のみ）
supabase secrets set DISCORD_WEBHOOK_URL="（手順1のURL）"
supabase secrets set NOTIFY_WEBHOOK_SECRET="（手順2のシークレット）"
supabase secrets set ADMIN_URL="https://<あなたのGitHub Pages>/admin.html"

# デプロイ（JWT 検証なしは config.toml で指定済み）
supabase functions deploy notify-pending-post
```

> `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` は Supabase が自動で注入するため
> 手動設定は不要です。

---

## ローカルでの確認方法

### A. Edge Function を単体で叩く（最短）
```bash
# .env.local（gitignore 済みパターンに合致）に確認用の値を置く
#   DISCORD_WEBHOOK_URL=...
#   NOTIFY_WEBHOOK_SECRET=test-secret
#   ADMIN_URL=http://localhost:4000/admin.html
supabase functions serve notify-pending-post --env-file ./supabase/.env.local

# 別ターミナルから疑似ペイロードを送信
curl -i -X POST http://localhost:54321/functions/v1/notify-pending-post \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: test-secret" \
  -d '{"record":{"id":"00000000-0000-0000-0000-000000000000","user_id":"<任意のprofiles.id>","title":"テスト構成","usage":"ゲーム","resolution":"1440p","budget":250000,"status":"pending","created_at":"2026-06-21T12:00:00Z"}}'
```
- シークレット不一致なら `401`、`status!='pending'` なら `skipped`。
- 正常なら Discord にメッセージが届き、レスポンスは `{"ok":true}`。

> ローカルでは `SUPABASE_SERVICE_ROLE_KEY` が無いため display_name は
> 「（名称未設定ユーザー）」になります（送信自体は成功）。`supabase start` で
> ローカルDBを併用すれば実名も解決できます。

### B. 本番DBで実地テスト
1. テスト用アカウントで通常どおり投稿（`submit.html`）→ INSERT で発火。
2. 送信結果を確認：
   ```sql
   select id, status_code, content, created
   from net._http_response order by id desc limit 10;
   ```
   `status_code = 200` なら Edge Function 到達 OK。
3. Edge Function のログは Dashboard → Edge Functions → Logs で確認。

---

## 失敗時の安全性（投稿処理は壊れない）

- `pg_net.http_post` は**リクエストをキューに積むだけ**で、HTTP の成否は
  INSERT/UPDATE のトランザクションに影響しません。
- トリガー関数内の HTTP 呼び出しと Vault 参照は `begin ... exception ... null`
  で囲ってあり、万一例外でも投稿は成立します。
- Edge Function は Discord 障害・設定漏れでも**常に 200** を返し、副作用を
  投稿側へ波及させません（通知はベストエフォート）。

## 既存機能への影響

- **既存ファイルの変更なし。** 追加のみ：
  - `supabase-notify-pending.sql`（SQL）
  - `supabase/functions/notify-pending-post/index.ts`（Edge Function）
  - `supabase/config.toml`（CLI 用最小設定）
  - 本ドキュメント
- `posts` への追加は `admin_notified_at` 列のみ（NULL 許容・既定 NULL）。
  既存の SELECT/INSERT/UPDATE・RLS・nice_count・承認フローには影響しません。
- 新トリガーは名前を `trg_z_...` にして `protect_post_columns`（status 確定）
  より**後**に実行され、status 判定の整合性を保ちます。
