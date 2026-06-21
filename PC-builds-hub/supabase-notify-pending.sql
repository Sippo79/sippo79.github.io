-- =====================================================================
-- PC Builds Hub — 投稿承認依頼の通知（pending 通知）
-- ---------------------------------------------------------------------
-- posts に status='pending' が現れたとき（新規投稿 / draft→pending など）、
-- Supabase Edge Function `notify-pending-post` を pg_net で非同期に呼び出す。
-- Edge Function が Discord Webhook へ整形済みメッセージを送る。
--
-- 設計の要点：
--   * pg_net は「非同期キュー」。HTTP の成否は INSERT/UPDATE のトランザクション
--     に影響しない → 通知が失敗しても投稿処理自体は壊れない。
--   * 秘密情報（Edge Function を叩く共有シークレット）は Vault に保存し、
--     フロント／このSQL本文には平文で書かない。
--   * status を確定させる既存トリガー protect_post_columns より「後」に走らせる
--     ため、トリガー名を末尾寄り（trg_z_...）にしてある（BEFORE トリガーは
--     名前の昇順で実行される）。
--
-- Supabase ダッシュボード → SQL Editor に貼り付けて実行してください。
-- 何度実行しても安全な冪等設計です。
-- =====================================================================

-- pg_net（非同期 HTTP）拡張 -------------------------------------------
--   ※ pg_net は API 関数を専用スキーマ `net` に作成する（net.http_post）。
--      スキーマを明示指定（with schema ...）すると環境によって失敗するため、
--      Supabase 標準どおりスキーマ指定なしで有効化する。
create extension if not exists pg_net;

-- 重複通知ガード列 ----------------------------------------------------
-- pending で通知済みかどうかを記録する。pending 以外に遷移したら null に
-- 戻すので、rejected→pending などの「再申請」では改めて通知される。
alter table public.posts
  add column if not exists admin_notified_at timestamptz;

-- =====================================================================
-- 共有シークレットの登録（Vault）
--   Edge Function 側 Secret `NOTIFY_WEBHOOK_SECRET` と同じ値を入れる。
--   ※ 下の 'PUT-A-LONG-RANDOM-STRING-HERE' を必ず長いランダム文字列に
--      置き換えてから一度だけ実行してください（値は再表示されません）。
--   ※ create_secret は同名 secret があると失敗する（upsert ではない）。
--      入れ直す場合は下の update_secret を使うこと。
-- =====================================================================
-- 例（初回のみ実行・値は自分で生成して置換）：
--
--   select vault.create_secret(
--     'PUT-A-LONG-RANDOM-STRING-HERE',   -- secret 本体
--     'notify_webhook_secret',           -- 参照名（関数から読む名前）
--     'pending通知 Edge Function 用の共有シークレット'
--   );
--
-- 値を入れ直したいとき：
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'notify_webhook_secret'),
--     'NEW-LONG-RANDOM-STRING'
--   );

-- =====================================================================
-- 通知トリガー関数
--   BEFORE INSERT/UPDATE。new を直接書き換えて admin_notified_at を
--   同一行書き込みで更新する（余分な UPDATE を発生させない）。
-- =====================================================================
create or replace function public.notify_pending_post()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret   text;
  v_func_url text := 'https://ndckywicmdrmdtfeywdu.supabase.co/functions/v1/notify-pending-post';
begin
  -- admin_notified_at はサーバー（本関数）が一元管理する。ユーザーが PostgREST
  -- 経由で偽装した new 値は信用せず、必ず下のロジックで上書きする。

  -- pending 以外（draft / approved / rejected）に確定した場合：
  --   通知済みフラグを解除して終了（次に pending へ戻ったとき再通知できる）。
  if new.status is distinct from 'pending' then
    new.admin_notified_at := null;
    return new;
  end if;

  -- ここから new.status = 'pending'
  -- 「直前(OLD)も pending かつ通知済み」なら重複させない（updated_at 更新や
  --  軽微な再 UPDATE での二重通知を防ぐ）。判定は OLD 値（サーバー管理値）で行う。
  if tg_op = 'UPDATE'
     and old.status = 'pending'
     and old.admin_notified_at is not null then
    new.admin_notified_at := old.admin_notified_at;  -- 据え置き（再通知しない）
    return new;
  end if;

  -- 共有シークレットを Vault から取得（未登録なら空文字＝Edge 側で 401）。
  begin
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'notify_webhook_secret'
    limit 1;
  exception when others then
    v_secret := null;  -- Vault 未設定でも投稿は止めない
  end;

  -- 非同期 HTTP 送信（キューに積むだけ。失敗しても本トランザクションは成功する）。
  begin
    perform net.http_post(
      url     := v_func_url,
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-webhook-secret', coalesce(v_secret, '')
      ),
      body    := jsonb_build_object('record', to_jsonb(new)),
      timeout_milliseconds := 5000
    );
  exception when others then
    -- pg_net 自体の呼び出しに失敗しても投稿は通す（通知はベストエフォート）。
    null;
  end;

  -- 通知済みとして記録（重複防止）。
  new.admin_notified_at := now();
  return new;
end;
$$;

-- =====================================================================
-- トリガー（INSERT 用 / UPDATE 用を分離）
--   * INSERT：new.status='pending' のときだけ発火。
--   * UPDATE：pending に「なった or だった」ときだけ発火（Nice 等の無関係な
--     UPDATE では発火しない → Edge Function を無駄に呼ばない）。
--   * 名前を trg_z_ にして protect_post_columns より後に実行させる。
-- =====================================================================
drop trigger if exists trg_z_notify_pending_insert on public.posts;
create trigger trg_z_notify_pending_insert
  before insert on public.posts
  for each row
  when (new.status = 'pending')
  execute function public.notify_pending_post();

drop trigger if exists trg_z_notify_pending_update on public.posts;
create trigger trg_z_notify_pending_update
  before update on public.posts
  for each row
  when (new.status = 'pending' or old.status = 'pending')
  execute function public.notify_pending_post();

-- =====================================================================
-- 動作確認用（任意）：自分の投稿を draft→pending にして発火させる例
--   update public.posts set status = 'pending'
--     where id = 'YOUR_POST_UUID' and user_id = auth.uid();
--
-- pg_net の送信結果ログ（最近の応答）：
--   select id, status_code, content, created
--   from net._http_response order by id desc limit 10;
-- =====================================================================
