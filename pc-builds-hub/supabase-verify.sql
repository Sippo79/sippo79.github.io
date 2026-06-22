-- =====================================================================
-- PC Builds Hub — スキーマ反映 確認クエリ集 (supabase-verify.sql)
-- ---------------------------------------------------------------------
-- 目的：supabase-schema.sql が正しく反映されているかを Supabase SQL Editor で
--       読み取り専用に確認する。
--
-- 使い方：
--   ・SQL Editor は複数文を実行すると「最後の結果」しか表示しないことがある。
--     各クエリ（-- ▼ で始まるブロック）を 1 つずつ選択(ハイライト)して実行する
--     のが確実。まず【0. 総合チェック】だけ流せば全体の合否が一覧で出る。
--
-- 安全性：
--   ・すべて SELECT（カタログ参照）のみ。UPDATE / DELETE / DROP は一切なし。
--   ・service_role key は不要・不使用（SQL Editor のカタログ参照のみ）。
--   ・データ行は読まない（pg_catalog / storage.buckets のメタデータのみ）。
-- =====================================================================


-- =====================================================================
-- ▼ 0. 総合チェック（まずこれを実行）
--   各 item の ok=true なら OK。false（NG）は反映漏れ＝supabase-schema.sql の
--   再実行が必要。下の詳細クエリ(1〜6)で中身を確認する。
-- =====================================================================
with checks as (
  -- RLS 有効化
  select 'RLS: posts 有効'    as item, coalesce((select relrowsecurity from pg_class where oid = 'public.posts'::regclass), false) as ok
  union all select 'RLS: profiles 有効', coalesce((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), false)
  union all select 'RLS: likes 有効',    coalesce((select relrowsecurity from pg_class where oid = 'public.likes'::regclass), false)

  -- 関数
  union all select 'fn: is_admin()',                exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='is_admin')
  union all select 'fn: protect_post_columns()',    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='protect_post_columns')
  union all select 'fn: protect_profile_columns()', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='protect_profile_columns')
  union all select 'fn: sync_nice_count()',         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sync_nice_count')

  -- トリガー
  union all select 'trg: trg_protect_post_columns',    exists(select 1 from pg_trigger where tgname='trg_protect_post_columns' and not tgisinternal)
  union all select 'trg: trg_protect_profile_columns', exists(select 1 from pg_trigger where tgname='trg_protect_profile_columns' and not tgisinternal)
  union all select 'trg: trg_likes_sync_count',        exists(select 1 from pg_trigger where tgname='trg_likes_sync_count' and not tgisinternal)

  -- 重要ポリシーの中身（昇格防止の肝）
  union all select 'policy: posts_insert は status=pending を強制', exists(
    select 1 from pg_policies where schemaname='public' and tablename='posts'
      and policyname='posts_insert_own' and coalesce(with_check,'') ilike '%pending%')
  union all select 'policy: profiles_update_self 存在', exists(
    select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_update_self')

  -- sync_nice_count が SECURITY DEFINER であること（RLS下でも nice_count 同期できる）
  union all select 'sync_nice_count は SECURITY DEFINER', coalesce(
    (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='sync_nice_count' limit 1), false)

  -- Storage バケット制限
  union all select 'storage: post-images バケット存在', exists(select 1 from storage.buckets where id='post-images')
  union all select 'storage: file_size_limit=5MB',       exists(select 1 from storage.buckets where id='post-images' and file_size_limit=5242880)
  union all select 'storage: MIME=jpeg/png/webp',        exists(select 1 from storage.buckets where id='post-images'
      and allowed_mime_types @> array['image/jpeg','image/png','image/webp'])
  union all select 'storage: insert ポリシー存在', exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='post_images_insert')
  union all select 'storage: delete ポリシー存在', exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='post_images_delete')
)
select item,
       ok,
       case when ok then 'OK' else 'NG ← 要確認(再実行)' end as result
from checks
order by ok asc, item;   -- NG(false) が上に来るので、上に出たものを直す


-- =====================================================================
-- ▼ 1. RLS 有効状態（posts/profiles/likes）
--   読み方：rls_enabled が全て true なら OK。
--           false があれば「alter table ... enable row level security」未反映。
-- =====================================================================
select c.relname            as table_name,
       c.relrowsecurity     as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('posts', 'profiles', 'likes')
order by c.relname;


-- =====================================================================
-- ▼ 2. ポリシー一覧（public + storage.objects）
--   読み方：想定ポリシーが揃っているか名前で確認。
--     profiles : profiles_select_all / profiles_insert_self / profiles_update_self
--     posts    : posts_select_public / posts_insert_own / posts_update_own / posts_delete_own
--     likes    : likes_select_all / likes_insert_own / likes_delete_own
--     objects  : post_images_read / post_images_insert / post_images_delete
--   cmd(操作)・roles(対象ロール)・qual(USING)・with_check(WITH CHECK) も確認できる。
--   特に posts_insert_own の with_check に status = 'pending' が含まれること。
-- =====================================================================
select schemaname,
       tablename,
       policyname,
       cmd,
       roles,
       qual        as using_expr,
       with_check  as with_check_expr
from pg_policies
where (schemaname = 'public'  and tablename in ('posts', 'profiles', 'likes'))
   or (schemaname = 'storage' and tablename = 'objects' and policyname like 'post_images_%')
order by schemaname, tablename, policyname;


-- =====================================================================
-- ▼ 3. 関数の存在と属性（is_admin / protect_* / sync_nice_count ほか）
--   読み方：4 つの主要関数が並ぶこと。
--     security_definer=true が必要なのは：is_admin / protect_post_columns /
--     protect_profile_columns / sync_nice_count / handle_new_user。
--     search_path に public が固定されていること（注入対策）。
-- =====================================================================
select n.nspname                                   as schema,
       p.proname                                   as function_name,
       pg_get_function_identity_arguments(p.oid)   as args,
       p.prosecdef                                 as security_definer,
       p.proconfig                                 as settings  -- 例: {search_path=public}
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_admin',
    'protect_post_columns',
    'protect_profile_columns',
    'sync_nice_count',
    'handle_new_user',
    'set_updated_at'
  )
order by p.proname;


-- =====================================================================
-- ▼ 4. トリガー一覧（posts / profiles / likes / auth.users）
--   読み方：以下が存在すること（tgenabled='O' は有効）。
--     posts    : trg_protect_post_columns (BEFORE UPDATE) / trg_posts_updated_at
--     profiles : trg_protect_profile_columns (BEFORE UPDATE)
--     likes    : trg_likes_sync_count (AFTER INSERT/DELETE)
--     auth.users: trg_on_auth_user_created (AFTER INSERT)
--   trigger_def に発火条件(BEFORE UPDATE 等)と呼ぶ関数が表示される。
-- =====================================================================
select c.relname            as table_name,
       t.tgname             as trigger_name,
       case t.tgenabled when 'O' then 'enabled' when 'D' then 'DISABLED' else t.tgenabled::text end as status,
       pg_get_triggerdef(t.oid) as trigger_def
from pg_trigger t
join pg_class c     on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and (
       (n.nspname = 'public' and c.relname in ('posts', 'profiles', 'likes'))
    or (n.nspname = 'auth'   and c.relname = 'users')
  )
order by c.relname, t.tgname;


-- =====================================================================
-- ▼ 5. protect_post_columns の中身を目視確認（再審査ロジック等）
--   読み方：定義本文に以下が含まれることを確認。
--     - is_admin() 早期 return（管理者は素通り）
--     - new.status / new.user_id / new.badge / new.created_at の固定
--     - old.status = 'approved' のとき pending へ戻す再審査ブロック
--   protect_profile_columns 側は new.role / new.id を固定していること。
-- =====================================================================
select p.proname as function_name,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('protect_post_columns', 'protect_profile_columns')
order by p.proname;


-- =====================================================================
-- ▼ 6. Storage バケット post-images の制限
--   読み方：
--     public            = true
--     file_size_limit   = 5242880  （= 5 MB）
--     allowed_mime_types= {image/jpeg,image/png,image/webp}
--   null や想定外の値なら M1（容量/MIME制限）が未反映 → schema 再実行。
-- =====================================================================
select id,
       name,
       public,
       file_size_limit,
       allowed_mime_types
from storage.buckets
where id = 'post-images';
