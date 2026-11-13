-- 提醒通知（Web Push）：Profile 的提醒設定、每台裝置的推播訂閱、已送出的提醒。
-- 可重複執行（if not exists、drop policy if exists）。對應 src/lib/reminders/*、src/lib/push.ts。
--
-- * 提醒設定跟著 Profile（規格：切換 Profile 後提醒設定一起切換）；推播訂閱跟著帳號與裝置。
-- * 排程每天台灣時間早上 9 點跑一次（vercel.json），挑出今天該提醒的 Profile，送到這個帳號訂閱的每台裝置。
-- * reminder_sends 記錄「哪個 Profile 的哪一則提醒已經送過」，排程重跑或同一天跑兩次也不會重複送。

-- ---------------------------------------------------------------------------
-- profiles：提醒設定
--   remind_before_days：預測區間開始前幾天提醒（1–3）；null＝不提醒
--   remind_inactive：超過 35 天沒有新增或修改任何紀錄時提醒
-- ---------------------------------------------------------------------------
alter table lune.profiles add column if not exists remind_before_days smallint default 2;
alter table lune.profiles add column if not exists remind_inactive boolean not null default true;
alter table lune.profiles drop constraint if exists profiles_remind_before_days_ck;
alter table lune.profiles add constraint profiles_remind_before_days_ck
  check (remind_before_days is null or remind_before_days between 1 and 3);

-- ---------------------------------------------------------------------------
-- push_subscriptions：一台裝置（瀏覽器）一筆。endpoint 是瀏覽器廠商推播服務給的網址，
-- p256dh／auth 是加密通知內容用的公鑰與密鑰（推播服務看不到內容）。
-- 同一台裝置換帳號登入後重新開啟通知，訂閱會轉到新帳號（endpoint 唯一）。
-- ---------------------------------------------------------------------------
create table if not exists lune.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  endpoint     text not null unique check (char_length(endpoint) <= 1000 and endpoint like 'https://%'),
  p256dh       text not null check (char_length(p256dh) <= 200),
  auth         text not null check (char_length(auth) <= 100),
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists push_subscriptions_user_idx on lune.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- reminder_sends：已送出的提醒；只有伺服器讀寫
--   kind：upcoming（預測快到了）／inactive（很久沒記錄）
--   ref_date：upcoming 是這次週期的開始日（一個週期只提醒一次）；inactive 是最後一次記錄的日期（每段空窗只提醒一次）
-- ---------------------------------------------------------------------------
create table if not exists lune.reminder_sends (
  profile_id uuid not null references lune.profiles (id) on delete cascade,
  kind       text not null check (kind in ('upcoming', 'inactive')),
  ref_date   date not null,
  sent_at    timestamptz not null default now(),
  primary key (profile_id, kind, ref_date)
);
create index if not exists reminder_sends_sent_idx on lune.reminder_sends (sent_at);

-- ---------------------------------------------------------------------------
-- 權限與 RLS：使用者只能看到、刪除自己的訂閱；新增訂閱與排程都由伺服器身分執行
-- （新增時要把同一個 endpoint 從別的帳號轉過來，RLS 下做不到）。reminder_sends 不開放給 authenticated。
-- ---------------------------------------------------------------------------
revoke all on lune.push_subscriptions from authenticated, anon;
revoke all on lune.reminder_sends from authenticated, anon;
grant select, delete on lune.push_subscriptions to authenticated;

alter table lune.push_subscriptions enable row level security;
alter table lune.reminder_sends     enable row level security;

drop policy if exists push_subscriptions_own on lune.push_subscriptions;
create policy push_subscriptions_own on lune.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
