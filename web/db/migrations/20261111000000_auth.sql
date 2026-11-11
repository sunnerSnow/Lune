-- 帳號（Better Auth）：auth schema、使用者／session／帳號／驗證表、RLS 用的 auth.uid()、authenticated 與 anon 角色。
-- 本機 PGlite 與正式 Postgres（Neon）都執行本檔；可重複執行。
--
-- * 表的欄位依 Better Auth 的 user／session／account／verification 模型（snake_case），id 一律 uuid。
-- * 只有伺服器（表的擁有者）會讀寫這些表；authenticated 角色對 auth schema 沒有任何權限。
-- * auth.uid()：從交易內的 request.jwt.claim.sub（withUser 設定）取使用者 ID，給 lune schema 的 RLS policy 用。

create schema if not exists auth;

create table if not exists auth.users (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  email          text not null,
  email_verified boolean not null default false,
  image          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists users_email_uq on auth.users (lower(email));

create table if not exists auth.sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  token      text not null unique,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on auth.sessions (user_id);

create table if not exists auth.accounts (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users (id) on delete cascade,
  account_id              text not null,
  provider_id             text not null,
  access_token            text,
  refresh_token           text,
  id_token                text,
  access_token_expires_at  timestamptz,
  refresh_token_expires_at timestamptz,
  scope                   text,
  password                text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists accounts_user_idx on auth.accounts (user_id);

create table if not exists auth.verifications (
  id         uuid primary key default gen_random_uuid(),
  identifier text not null,
  value      text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists verifications_identifier_idx on auth.verifications (identifier);

-- RLS 用的身分：從交易內的 request.jwt.claim.sub 或 request.jwt.claims 取使用者 ID（withUser 會設定）
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

-- 角色：authenticated（withUser 在交易內 set local role）、anon（保留給未來的公開讀取）
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

-- 連線用的角色要能 SET ROLE 成 authenticated。
-- PostgreSQL 16 起，非 superuser 建立角色只會自動拿到 ADMIN，沒有 SET；pg_has_role(..., 'MEMBER') 也會因此誤判，
-- 所以無條件 grant（已是成員只會 NOTICE，不會失敗）。npm run db:migrate 結尾會實際 set role 驗證。
do $$
begin
  execute format('grant authenticated to %I', current_user);
end
$$;

revoke all on schema auth from anon, authenticated;
revoke all on all tables in schema auth from anon, authenticated;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
