-- ============================================================================
-- CROSS-APP STREAK + XP: ecosystem-wide habit + gamification primitives
-- ============================================================================
-- One shared streak counter that increments when the user does *anything*
-- meaningful on any of the 14 schood apps. Surfaced in each app's top nav
-- so users feel they're using one platform, not 14 disconnected sites.
--
-- Two additive tables:
--
--   user_daily_activity — one row per (user, day). Row exists iff user did
--     at least one tracked action that day. Used to compute streak length.
--
--   user_streak_state — one row per user. Holds current_streak, longest_streak,
--     total_xp. Derived from user_daily_activity but cached here so the nav
--     badge doesn't have to scan history on every render.
--
-- The user-streak edge function (POST /ping) maintains both atomically.

create table if not exists public.user_daily_activity (
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  attempts_count integer not null default 0,
  minutes_studied integer not null default 0,
  xp_earned integer not null default 0,
  apps_touched text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index if not exists user_daily_activity_user_day_idx
  on public.user_daily_activity(user_id, day desc);

alter table public.user_daily_activity enable row level security;

drop policy if exists "User daily activity select own" on public.user_daily_activity;
create policy "User daily activity select own"
on public.user_daily_activity
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "User daily activity write own" on public.user_daily_activity;
create policy "User daily activity write own"
on public.user_daily_activity
for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

create table if not exists public.user_streak_state (
  user_id uuid primary key references public.users(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  total_xp integer not null default 0,
  last_activity_date date,
  updated_at timestamptz not null default now()
);

alter table public.user_streak_state enable row level security;

drop policy if exists "User streak state select own" on public.user_streak_state;
create policy "User streak state select own"
on public.user_streak_state
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "User streak state write own" on public.user_streak_state;
create policy "User streak state write own"
on public.user_streak_state
for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());
