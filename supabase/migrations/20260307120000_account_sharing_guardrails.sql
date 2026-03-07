-- ============================================================================
-- Account-sharing guardrails
-- ============================================================================
-- Adds configurable anti-sharing limits and a server-side device activity ledger
-- used by the start-session edge function.

alter table public.platform_settings
  add column if not exists anti_sharing_enabled boolean not null default true,
  add column if not exists anti_sharing_max_concurrent_sessions_per_product integer not null default 1,
  add column if not exists anti_sharing_device_window_days integer not null default 30,
  add column if not exists anti_sharing_max_devices_per_window integer not null default 3;

update public.platform_settings
set
  anti_sharing_enabled = coalesce(anti_sharing_enabled, true),
  anti_sharing_max_concurrent_sessions_per_product = coalesce(anti_sharing_max_concurrent_sessions_per_product, 1),
  anti_sharing_device_window_days = coalesce(anti_sharing_device_window_days, 30),
  anti_sharing_max_devices_per_window = coalesce(anti_sharing_max_devices_per_window, 3)
where id = 1;

alter table public.platform_settings
  alter column anti_sharing_enabled set not null,
  alter column anti_sharing_max_concurrent_sessions_per_product set not null,
  alter column anti_sharing_device_window_days set not null,
  alter column anti_sharing_max_devices_per_window set not null;

alter table public.platform_settings
  drop constraint if exists platform_settings_anti_sharing_concurrent_range;
alter table public.platform_settings
  add constraint platform_settings_anti_sharing_concurrent_range
  check (anti_sharing_max_concurrent_sessions_per_product between 1 and 10);

alter table public.platform_settings
  drop constraint if exists platform_settings_anti_sharing_device_window_range;
alter table public.platform_settings
  add constraint platform_settings_anti_sharing_device_window_range
  check (anti_sharing_device_window_days between 1 and 365);

alter table public.platform_settings
  drop constraint if exists platform_settings_anti_sharing_max_devices_range;
alter table public.platform_settings
  add constraint platform_settings_anti_sharing_max_devices_range
  check (anti_sharing_max_devices_per_window between 1 and 20);

create table if not exists public.user_device_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  device_key text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_ip text,
  last_user_agent text,
  last_product_id uuid references public.products(id) on delete set null,
  seen_count integer not null default 1 check (seen_count >= 1),
  metadata jsonb not null default '{}'::jsonb,
  unique (user_id, device_key)
);

create index if not exists user_device_activity_user_last_seen_idx
  on public.user_device_activity (user_id, last_seen_at desc);
create index if not exists user_device_activity_last_product_idx
  on public.user_device_activity (last_product_id);

alter table public.user_device_activity enable row level security;

drop policy if exists "User device activity view own" on public.user_device_activity;
create policy "User device activity view own"
on public.user_device_activity
for select
using (auth.uid() = user_id);
