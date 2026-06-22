-- =====================================================================
-- PC Builds Hub — Supabase schema
-- ---------------------------------------------------------------------
-- Supabase ダッシュボード → SQL Editor に貼り付けて実行してください。
-- 何度実行しても安全なように冪等（if not exists / drop ... if exists）にしています。
-- =====================================================================

-- 拡張（gen_random_uuid 用）-------------------------------------------
create extension if not exists "pgcrypto";

-- =====================================================================
-- profiles : auth.users と 1:1 のプロフィール
-- =====================================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  bio          text,
  role         text not null default 'user' check (role in ('user', 'admin')),
  created_at   timestamptz not null default now()
);

-- =====================================================================
-- posts : PC構成の投稿
--   ※ posts.json から移行しやすいよう、対応キーをコメントで明記
-- =====================================================================
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  description text,                       -- posts.json: comment
  cpu         text,
  gpu         text,
  motherboard text,
  memory      text,                       -- posts.json: ram
  storage     text,
  psu         text,
  case_name   text,                       -- posts.json: case
  cooler      text,
  budget      integer,                    -- 円（任意）
  resolution  text,                       -- 'FHD' | '1440p' | '4K'
  usage       text,                       -- 'ゲーム' | '配信' | 'クリエイティブ' | '白PC・光るPC'
  tags        text[] not null default '{}',
  image_url   text,                       -- posts.json: image
  image_urls  text[] not null default '{}',
  bench_title text,                       -- posts.json: benchTitle
  bench_score numeric,                    -- posts.json: benchScore
  badge       text,                       -- posts.json: badge
  status      text not null default 'pending'
              check (status in ('draft', 'pending', 'approved', 'rejected')),
  nice_count  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists posts_status_created_idx on public.posts (status, created_at desc);
create index if not exists posts_user_idx           on public.posts (user_id);

alter table public.posts
  add column if not exists image_urls text[] not null default '{}';

-- =====================================================================
-- likes : Nice（同一ユーザー×投稿は1件まで）
-- =====================================================================
create table if not exists public.likes (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)              -- 重複Nice防止
);

create index if not exists likes_post_idx on public.likes (post_id);

-- =====================================================================
-- updated_at 自動更新トリガー
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_posts_updated_at on public.posts;
create trigger trg_posts_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- =====================================================================
-- nice_count 自動同期（likes の増減を posts.nice_count に反映）
-- =====================================================================
-- SECURITY DEFINER：Nice したユーザーは投稿の所有者ではないため、
-- 通常権限では RLS / 列保護トリガーで posts を更新できない。所有者以外でも
-- nice_count だけは正規に増減できるよう definer 実行＋バイパスフラグを立てる。
create or replace function public.sync_nice_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.bypass_post_guard', 'on', true); -- txn ローカル（is_local=true）
  if (tg_op = 'INSERT') then
    update public.posts set nice_count = nice_count + 1 where id = new.post_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.posts set nice_count = greatest(nice_count - 1, 0) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_likes_sync_count on public.likes;
create trigger trg_likes_sync_count
  after insert or delete on public.likes
  for each row execute function public.sync_nice_count();

-- =====================================================================
-- サインアップ時に profiles を自動作成
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 管理者判定ヘルパー（RLS から使用）
-- =====================================================================
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.posts    enable row level security;
alter table public.likes    enable row level security;

-- --- profiles --------------------------------------------------------
drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all on public.profiles
  for select using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- 【重要】列単位の権限昇格防止：
--   profiles_update_self は自分の行の更新を許すが、それだけでは role 列も
--   書き換えられてしまい、一般ユーザーが自分を admin に昇格できてしまう。
--   role / id は非管理者には OLD のまま固定する（管理者の昇格/降格は許可）。
--   role 変更は原則 SQL Editor（サービス権限）で行う運用。
create or replace function public.protect_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;  -- 既存管理者によるロール変更は許可
  end if;
  new.role := old.role;  -- 自己昇格(admin化)を不可能にする
  new.id   := old.id;    -- 主キー/認証リンクの改変を不可能にする
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_columns on public.profiles;
create trigger trg_protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- --- posts -----------------------------------------------------------
-- 読み取り：approved は誰でも / 本人は自分の全status / 管理者は全件
drop policy if exists posts_select_public on public.posts;
create policy posts_select_public on public.posts
  for select using (
    status = 'approved'
    or auth.uid() = user_id
    or public.is_admin()
  );

-- 作成：ログインユーザーが「自分名義 かつ status='pending'」でのみ作成可能。
--   ※ ここが肝。status を検証しないと、ユーザーが api.js を迂回して
--      status='approved' を直接 insert し、承認なしで自己公開できてしまう。
--   ※ nice_count / badge も初期値を強制（不正な水増し・編集部バッジ詐称を防ぐ）。
drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own on public.posts
  for insert with check (
    auth.uid() = user_id
    and status = 'pending'
    and nice_count = 0
    and badge is null
  );

-- 更新：本人（自分の投稿の編集）または 管理者（承認操作のため）。
--   ※ WITH CHECK だけでは「status を approved に書き換える自己承認」を防げない
--      （RLS は OLD/NEW を比較できないため）。実際の昇格防止は下の
--      protect_post_columns トリガーで列単位に行う。
drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts
  for update using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

-- =====================================================================
-- 列単位の昇格防止トリガー（RLS の WITH CHECK を補完）
--   非管理者の UPDATE では status / user_id / badge / nice_count /
--   created_at を OLD のまま固定する（＝自己承認・所有者書換え・Nice水増し・
--   バッジ詐称を不可能にする）。
--   nice_count は likes トリガー経由の正規変更のみ、セッションローカルの
--   バイパスフラグで許可する。
-- =====================================================================
create or replace function public.protect_post_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- 管理者は status の昇格／差し戻しなど全変更を許可
  if public.is_admin() then
    return new;
  end if;

  -- 非管理者：所有者・バッジ・作成日時は改変不可（昇格・詐称防止）
  new.user_id    := old.user_id;
  new.badge      := old.badge;
  new.created_at := old.created_at;

  -- nice_count は likes トリガー（バイパスフラグ on）のときだけ変更を許可
  if current_setting('app.bypass_post_guard', true) is distinct from 'on' then
    new.nice_count := old.nice_count;
  end if;

  -- status の決定（ここで一元管理。ユーザー入力の status は一切信用しない）：
  --   ・公開中(approved) または 差し戻し(rejected) の投稿の「公開内容」を編集した
  --     → 再審査のため pending に差し戻す（本人による再申請扱い）
  --   ・それ以外（内容変更なし / pending・draft / likes トリガー経由）
  --     → OLD のまま固定（pending は pending・draft は draft を温存。
  --        ＝ユーザーによる approved への自己昇格は不可能）
  if old.status in ('approved', 'rejected')
     and current_setting('app.bypass_post_guard', true) is distinct from 'on'
     and (
          new.title       is distinct from old.title
       or new.description is distinct from old.description   -- 本文（posts.json: comment）
       or new.cpu         is distinct from old.cpu
       or new.gpu         is distinct from old.gpu
       or new.motherboard is distinct from old.motherboard
       or new.memory      is distinct from old.memory
       or new.storage     is distinct from old.storage
       or new.psu         is distinct from old.psu
       or new.case_name   is distinct from old.case_name
       or new.cooler      is distinct from old.cooler
       or new.budget      is distinct from old.budget
       or new.resolution  is distinct from old.resolution
       or new.usage       is distinct from old.usage
       or new.tags        is distinct from old.tags
       or new.image_url   is distinct from old.image_url
       or new.image_urls  is distinct from old.image_urls
       or new.bench_title is distinct from old.bench_title
       or new.bench_score is distinct from old.bench_score
     )
  then
    new.status := 'pending';   -- 公開内容が変わったので再審査へ
  else
    new.status := old.status;  -- 据え置き（自己昇格は不可）
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_post_columns on public.posts;
create trigger trg_protect_post_columns
  before update on public.posts
  for each row execute function public.protect_post_columns();

-- 削除：本人 または 管理者
drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own on public.posts
  for delete using (auth.uid() = user_id or public.is_admin());

-- --- likes -----------------------------------------------------------
drop policy if exists likes_select_all on public.likes;
create policy likes_select_all on public.likes
  for select using (true);

drop policy if exists likes_insert_own on public.likes;
create policy likes_insert_own on public.likes
  for insert with check (auth.uid() = user_id);

drop policy if exists likes_delete_own on public.likes;
create policy likes_delete_own on public.likes
  for delete using (auth.uid() = user_id);

-- =====================================================================
-- Storage : 投稿画像バケット（Phase 3 の画像アップロード用）
-- =====================================================================
-- サーバ側でも容量(5MB)と MIME を強制する（クライアント検証は迂回可能なため）。
-- 既存バケットにも反映されるよう on conflict で更新する。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-images', 'post-images', true,
  5242880,                                              -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']        -- jpg/png/webp のみ
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists post_images_read on storage.objects;
create policy post_images_read on storage.objects
  for select using (bucket_id = 'post-images');

-- アップロードは「自分の所有 かつ 先頭フォルダが自分の uid」のみ許可。
-- （api.js は `${uid}/...` に保存する。他人の名前空間への投入を防ぐ多層防御）
drop policy if exists post_images_insert on storage.objects;
create policy post_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'post-images'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists post_images_delete on storage.objects;
create policy post_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'post-images'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =====================================================================
-- 管理者を作る（任意）：自分の user を admin にする例
--   先にサインアップして auth.users に行ができてから実行してください。
--   update public.profiles set role = 'admin' where id = 'YOUR_AUTH_USER_UUID';
-- =====================================================================
