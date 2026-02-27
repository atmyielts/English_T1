-- ============================================================================
-- Learner skill profile projection (Phase 2 consumer target)
-- ----------------------------------------------------------------------------
-- This projection is updated from domain_event_outbox exam.result events and
-- provides a stable, query-friendly personalization surface.
-- ============================================================================

create table if not exists public.learner_skill_profiles (
  user_id uuid not null references public.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,

  schema_version text not null default 'profile.v1',
  signals_count integer not null default 0,
  sessions_count integer not null default 0,

  profile jsonb not null default '{}'::jsonb,
  latest_result jsonb,

  latest_event_id uuid references public.domain_event_outbox(id) on delete set null,
  latest_event_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, product_id)
);

create index if not exists learner_skill_profiles_product_idx
  on public.learner_skill_profiles(product_id, updated_at desc);

create index if not exists learner_skill_profiles_user_idx
  on public.learner_skill_profiles(user_id, updated_at desc);

drop trigger if exists learner_skill_profiles_updated_at on public.learner_skill_profiles;
create trigger learner_skill_profiles_updated_at
before update on public.learner_skill_profiles
for each row
execute procedure public.handle_user_updated_at();

create table if not exists public.learner_skill_profile_events (
  event_id uuid primary key references public.domain_event_outbox(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),

  unique (user_id, product_id, session_id)
);

create index if not exists learner_skill_profile_events_user_product_idx
  on public.learner_skill_profile_events(user_id, product_id, occurred_at desc);

alter table public.learner_skill_profiles enable row level security;
alter table public.learner_skill_profile_events enable row level security;

drop policy if exists "Learner skill profiles select own" on public.learner_skill_profiles;
create policy "Learner skill profiles select own"
on public.learner_skill_profiles
for select
using (auth.uid() = user_id);

drop policy if exists "Learner skill profiles select admin" on public.learner_skill_profiles;
create policy "Learner skill profiles select admin"
on public.learner_skill_profiles
for select
using (public.is_admin());

drop policy if exists "Learner skill profile events select admin" on public.learner_skill_profile_events;
create policy "Learner skill profile events select admin"
on public.learner_skill_profile_events
for select
using (public.is_admin());
