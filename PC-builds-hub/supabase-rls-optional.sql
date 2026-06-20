-- =====================================================================
-- PC Builds Hub — RLS 追加強化案（L2〜L4 / 任意・未適用）
-- ---------------------------------------------------------------------
-- これは「情報開示の最小化」を狙う任意の追加施策の SQL 案です。
-- 公開範囲の方針判断が必要なため、本体 supabase-schema.sql には未統合。
-- 採用する項目だけ Supabase SQL Editor で実行してください（冪等）。
--
--  L2: profiles の anon への開示を最小化（role/bio を匿名に見せない）
--  L3: likes の閲覧を本人/管理者に限定（誰がどの投稿を like したか隠す）
--  L4: like は approved 投稿にのみ付与可能にする
--
-- 前提：supabase-schema.sql 適用済み（is_admin() 等が存在すること）。
-- service_role は使用しない。すべて RLS / 通常権限で完結。
-- =====================================================================


-- =====================================================================
-- L2. profiles：匿名ユーザーには公開情報のみ見せる
-- ---------------------------------------------------------------------
-- 問題：profiles_select_all (using true) は role / bio まで anon に開示し、
--       「誰が管理者か」が判明する。
-- 方針：
--   (A) ポリシーだけでは「行の可否」しか制御できず列単位の制限は不可。
--       そこで anon 向けの公開用ビュー public.public_profiles を用意し、
--       フロントは表示名/アバターをこのビューから取得する運用にする。
--   (B) 生 profiles の select は「本人 または 管理者」に限定する。
--
--   ※ フロント影響：投稿カードの表示名取得を public_profiles 経由にする
--      必要がある（api.js の posts 結合先など）。採用時は別途調整。
-- =====================================================================

-- 公開して良い列だけのビュー（security_invoker でビュー閲覧者の権限で評価）
drop view if exists public.public_profiles;
create view public.public_profiles
  with (security_invoker = true) as
  select id, display_name, avatar_url
  from public.profiles;

-- anon/authenticated がビューを読めるように（ビューは RLS を持てないため grant で制御）
grant select on public.public_profiles to anon, authenticated;

-- 生 profiles の全列 select は本人または管理者のみに絞る
drop policy if exists profiles_select_all on public.profiles;
drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
  for select using (auth.uid() = id or public.is_admin());


-- =====================================================================
-- L3. likes：誰がどの投稿を like したかを匿名に晒さない
-- ---------------------------------------------------------------------
-- 問題：likes_select_all (using true) は like 行（user_id 含む）を anon に開示。
-- 方針：select は「本人 または 管理者」に限定。
--       公開側の表示件数は posts.nice_count（トリガー集計）を使うため、
--       likes 明細を匿名に見せる必要はない。
--
--   ※ フロント影響：現状フロントは likes を直接 select していない（カードの
--      Nice 表示は posts.nice_count / localStorage）。基本そのまま動く想定。
-- =====================================================================
drop policy if exists likes_select_all on public.likes;
drop policy if exists likes_select_self_or_admin on public.likes;
create policy likes_select_self_or_admin on public.likes
  for select using (auth.uid() = user_id or public.is_admin());


-- =====================================================================
-- L4. like は approved 投稿にのみ付与可能にする
-- ---------------------------------------------------------------------
-- 問題：likes_insert_own は user_id 一致のみ確認し、対象投稿の status を見ない。
--       pending/rejected/draft の投稿にも like を付けられる。
-- 方針：insert の WITH CHECK に「対象 post が approved」条件を追加。
--       本人確認は維持。
-- =====================================================================
drop policy if exists likes_insert_own on public.likes;
create policy likes_insert_own on public.likes
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.posts p
      where p.id = likes.post_id
        and p.status = 'approved'
    )
  );

-- delete はそのまま（本人のみ）。再掲は不要。

-- =====================================================================
-- ロールバックの目安（採用を取りやめる場合）
--   L2: drop view if exists public.public_profiles;
--       drop policy if exists profiles_select_self_or_admin on public.profiles;
--       create policy profiles_select_all on public.profiles for select using (true);
--   L3: drop policy if exists likes_select_self_or_admin on public.likes;
--       create policy likes_select_all on public.likes for select using (true);
--   L4: drop policy if exists likes_insert_own on public.likes;
--       create policy likes_insert_own on public.likes
--         for insert with check (auth.uid() = user_id);
-- =====================================================================
