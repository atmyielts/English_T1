-- ============================================================================
-- WRITING AI: SETTINGS + USAGE LIMITS
-- ============================================================================

alter table public.platform_settings
  add column if not exists writing_ai_enabled boolean not null default true,
  add column if not exists writing_ai_daily_limit integer not null default 3;

-- Track billable AI calls (so rate limits are enforceable and auditable).
create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null, -- e.g. 'grade-writing'
  session_id uuid references public.sessions(id) on delete set null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_user_kind_created_idx on public.ai_usage_events(user_id, kind, created_at desc);

alter table public.ai_usage_events enable row level security;

drop policy if exists "AI usage view own" on public.ai_usage_events;
create policy "AI usage view own"
on public.ai_usage_events
for select
using (auth.uid() = user_id);

