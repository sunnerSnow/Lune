-- Luné 資料表（lune schema）：Profile、經期、每日紀錄、限流。
-- 本機 PGlite 與正式 Postgres（Neon）都執行本檔；可重複執行（if not exists、drop policy if exists）。
--
-- 規則（與 src/lib/services/*、src/lib/cycle/* 對應）：
-- * 所有資料以 user_id 隔離；RLS 以 auth.uid() = user_id 為第二道防線，服務層每個查詢仍自己帶 user_id。
-- * 經期與每日紀錄以複合外鍵 (profile_id, user_id) → profiles (id, user_id) 綁定：不能把紀錄掛到別人的 Profile。
-- * 同一個 Profile 的經期日期區間不得重疊（btree_gist 排除約束；進行中的經期視為延伸到無限遠），
--   所以進行中的經期一定是最新的一筆，而且最多一筆（另有部分唯一索引，錯誤訊息比較好對應）。
-- * 每日紀錄同一個 Profile 同一天只有一筆（唯一約束），再次記錄是更新。
-- * 日期一律是 date（日曆日期，沒有時區）；經期狀態由 end_date 是否為 null 推導，不另存欄位。

create schema if not exists lune;
create extension if not exists btree_gist;

create or replace function lune.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles：同一個帳號可管理多個 Profile（例如自己、家人）；週期預設值也放這裡（規格的 settings 合併進來）
-- ---------------------------------------------------------------------------
create table if not exists lune.profiles (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  display_name          text not null check (char_length(btrim(display_name)) between 1 and 30),
  avatar_color          text check (avatar_color is null or avatar_color in ('rose', 'lavender', 'peach', 'sage', 'sky', 'sand')),
  default_cycle_length  int check (default_cycle_length is null or default_cycle_length between 15 and 90),
  default_period_length int check (default_period_length is null or default_period_length between 1 and 14),
  prediction_enabled    boolean not null default true,
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint profiles_id_user_uq unique (id, user_id)
);
create index if not exists profiles_user_idx on lune.profiles (user_id, created_at);
drop trigger if exists profiles_updated_at on lune.profiles;
create trigger profiles_updated_at before update on lune.profiles for each row execute function lune.set_updated_at();

-- ---------------------------------------------------------------------------
-- periods：一筆＝一次經期（規格稱 cycles）；end_date 為 null 表示進行中
-- ---------------------------------------------------------------------------
create table if not exists lune.periods (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  profile_id uuid not null,
  start_date date not null,
  end_date   date,
  notes      text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint periods_profile_fk foreign key (profile_id, user_id)
    references lune.profiles (id, user_id) on delete cascade,
  -- 結束日不得早於開始日；單次經期最長 60 天（含頭尾），擋住明顯打錯的資料
  constraint periods_dates_ck check (end_date is null or (end_date >= start_date and end_date - start_date <= 59)),
  -- 同一個 Profile 的經期不得重疊（上界 null 表示無限遠：進行中的經期蓋住之後所有日期）
  constraint periods_no_overlap exclude using gist (
    profile_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
);
create unique index if not exists periods_one_open_uq on lune.periods (profile_id) where end_date is null;
create index if not exists periods_profile_start_idx on lune.periods (profile_id, start_date desc);
create index if not exists periods_user_idx on lune.periods (user_id);
drop trigger if exists periods_updated_at on lune.periods;
create trigger periods_updated_at before update on lune.periods for each row execute function lune.set_updated_at();

-- ---------------------------------------------------------------------------
-- daily_logs：每日身體紀錄（經血量、症狀、心情、備註都是選填，但不能整筆都空）
-- ---------------------------------------------------------------------------
create table if not exists lune.daily_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  profile_id uuid not null,
  log_date   date not null,
  flow       text check (flow is null or flow in ('none', 'light', 'medium', 'heavy')),
  symptoms   text[] not null default '{}' check (
               symptoms <@ array['cramps','back_pain','headache','breast_tenderness','fatigue','swelling','acne','nausea','bloating','other','none']::text[]
               and cardinality(symptoms) <= 11
               -- 「無症狀」與其他症狀互斥
               and (not ('none' = any (symptoms)) or cardinality(symptoms) = 1)
             ),
  mood       text check (mood is null or mood in ('happy', 'neutral', 'low', 'anxious', 'irritable', 'calm')),
  notes      text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_logs_profile_fk foreign key (profile_id, user_id)
    references lune.profiles (id, user_id) on delete cascade,
  constraint daily_logs_profile_date_uq unique (profile_id, log_date),
  constraint daily_logs_not_empty_ck check (
    flow is not null or cardinality(symptoms) > 0 or mood is not null or notes is not null
  )
);
create index if not exists daily_logs_user_idx on lune.daily_logs (user_id);
drop trigger if exists daily_logs_updated_at on lune.daily_logs;
create trigger daily_logs_updated_at before update on lune.daily_logs for each row execute function lune.set_updated_at();

-- ---------------------------------------------------------------------------
-- rate_limits：登入／註冊嘗試的固定視窗計數；只有伺服器讀寫
-- ---------------------------------------------------------------------------
create table if not exists lune.rate_limits (
  key          text primary key,
  count        int not null default 0,
  window_start timestamptz not null default now()
);
create index if not exists rate_limits_window_idx on lune.rate_limits (window_start);

-- ---------------------------------------------------------------------------
-- 權限與 RLS
-- ---------------------------------------------------------------------------
grant usage on schema lune to authenticated;
revoke all on all tables in schema lune from authenticated, anon;

grant select, insert, update, delete on lune.profiles   to authenticated;
grant select, insert, update, delete on lune.periods    to authenticated;
grant select, insert, update, delete on lune.daily_logs to authenticated;

alter table lune.profiles    enable row level security;
alter table lune.periods     enable row level security;
alter table lune.daily_logs  enable row level security;
alter table lune.rate_limits enable row level security;

drop policy if exists profiles_own on lune.profiles;
create policy profiles_own on lune.profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists periods_own on lune.periods;
create policy periods_own on lune.periods for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists daily_logs_own on lune.daily_logs;
create policy daily_logs_own on lune.daily_logs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
