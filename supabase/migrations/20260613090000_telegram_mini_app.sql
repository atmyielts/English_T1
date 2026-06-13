-- Telegram Mini App V1: preferences + lightweight action audit.

create table if not exists public.telegram_user_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  notifications_enabled boolean not null default true,
  assignment_reminders boolean not null default true,
  class_reminders boolean not null default true,
  score_notifications boolean not null default true,
  certificate_notifications boolean not null default true,
  digest_frequency text not null default 'daily'
    check (digest_frequency in ('off', 'daily', 'weekly')),
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text not null default 'Asia/Tashkent',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_app_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  telegram_user_id text,
  action text not null,
  status text not null default 'ok' check (status in ('ok', 'error', 'unauthorized', 'unlinked')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists telegram_app_events_user_created_idx
  on public.telegram_app_events(user_id, created_at desc);
create index if not exists telegram_app_events_tg_created_idx
  on public.telegram_app_events(telegram_user_id, created_at desc);
create index if not exists telegram_app_events_action_created_idx
  on public.telegram_app_events(action, created_at desc);

alter table public.telegram_user_preferences enable row level security;
alter table public.telegram_app_events enable row level security;

drop policy if exists "Telegram prefs read own" on public.telegram_user_preferences;
create policy "Telegram prefs read own"
  on public.telegram_user_preferences for select
  using (user_id = auth.uid());

drop policy if exists "Telegram prefs update own" on public.telegram_user_preferences;
create policy "Telegram prefs update own"
  on public.telegram_user_preferences for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Telegram prefs insert own" on public.telegram_user_preferences;
create policy "Telegram prefs insert own"
  on public.telegram_user_preferences for insert
  with check (user_id = auth.uid());

drop policy if exists "Telegram events read own" on public.telegram_app_events;
create policy "Telegram events read own"
  on public.telegram_app_events for select
  using (user_id = auth.uid());

drop trigger if exists telegram_user_preferences_updated_at on public.telegram_user_preferences;
create trigger telegram_user_preferences_updated_at
  before update on public.telegram_user_preferences
  for each row execute function public.set_updated_at();
