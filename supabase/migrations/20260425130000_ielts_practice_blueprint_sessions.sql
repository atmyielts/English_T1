-- ============================================================================
-- IELTS Practice relaunch: blueprint/build/session runtime
-- ----------------------------------------------------------------------------
-- Add a production-ready practice domain that wraps real platform sessions.
-- Legacy exercise/attempt tables remain in place for migration compatibility.
-- ============================================================================

create table if not exists public.ielts_practice_blueprints (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  language_id uuid not null references public.languages(id) on delete restrict,

  title text not null,
  section_type text not null check (section_type in ('reading', 'listening', 'writing')),

  source_product_id uuid references public.products(id) on delete set null,
  source_experience_id uuid references public.experiences(id) on delete set null,
  source_section_id uuid references public.sections(id) on delete set null,

  target_question_types text[] not null default '{}'::text[],
  estimated_minutes integer not null default 20 check (estimated_minutes > 0),

  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  metadata jsonb not null default '{}'::jsonb,

  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ielts_practice_blueprints_status_idx
  on public.ielts_practice_blueprints(product_id, language_id, status, updated_at desc);

create index if not exists ielts_practice_blueprints_source_idx
  on public.ielts_practice_blueprints(source_experience_id, source_section_id);

create table if not exists public.ielts_practice_delivery_builds (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null references public.ielts_practice_blueprints(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  language_id uuid not null references public.languages(id) on delete restrict,

  source_product_id uuid references public.products(id) on delete set null,
  source_experience_id uuid references public.experiences(id) on delete set null,
  source_section_id uuid references public.sections(id) on delete set null,
  delivery_experience_id uuid references public.experiences(id) on delete cascade,

  build_version integer not null default 1 check (build_version > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived', 'failed')),

  build_summary jsonb not null default '{}'::jsonb,
  validation_summary jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (blueprint_id, build_version)
);

create index if not exists ielts_practice_delivery_builds_status_idx
  on public.ielts_practice_delivery_builds(product_id, language_id, status, updated_at desc);

create index if not exists ielts_practice_delivery_builds_blueprint_idx
  on public.ielts_practice_delivery_builds(blueprint_id, created_at desc);

alter table public.ielts_practice_blueprints
  add column if not exists latest_delivery_build_id uuid references public.ielts_practice_delivery_builds(id) on delete set null;

create table if not exists public.ielts_practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,

  blueprint_id uuid not null references public.ielts_practice_blueprints(id) on delete restrict,
  delivery_build_id uuid not null references public.ielts_practice_delivery_builds(id) on delete restrict,
  delivery_experience_id uuid not null references public.experiences(id) on delete restrict,
  session_id uuid not null references public.sessions(id) on delete cascade,

  plan_item_id uuid references public.ielts_practice_plan_items(id) on delete set null,

  status text not null default 'started'
    check (status in ('started', 'in_progress', 'completed', 'abandoned', 'expired', 'failed')),
  latest_outcome_id uuid,
  latest_auto_evaluation_id uuid references public.evaluations(id) on delete set null,
  latest_ai_evaluation_id uuid references public.evaluations(id) on delete set null,

  review_metadata jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (session_id)
);

create index if not exists ielts_practice_sessions_user_idx
  on public.ielts_practice_sessions(user_id, language_id, created_at desc);

create index if not exists ielts_practice_sessions_plan_item_idx
  on public.ielts_practice_sessions(plan_item_id)
  where plan_item_id is not null;

create index if not exists ielts_practice_sessions_status_idx
  on public.ielts_practice_sessions(product_id, language_id, status, updated_at desc);

alter table public.ielts_practice_plan_items
  alter column exercise_id drop not null;

alter table public.ielts_practice_plan_items
  add column if not exists blueprint_id uuid references public.ielts_practice_blueprints(id) on delete restrict;

alter table public.ielts_practice_plan_items
  add column if not exists delivery_build_id uuid references public.ielts_practice_delivery_builds(id) on delete restrict;

alter table public.ielts_practice_plan_items
  add column if not exists practice_session_id uuid references public.ielts_practice_sessions(id) on delete set null;

drop index if exists ielts_practice_plan_items_unique_daily_exercise;

create unique index if not exists ielts_practice_plan_items_unique_daily_exercise
  on public.ielts_practice_plan_items(user_id, language_id, plan_date, exercise_id)
  where exercise_id is not null;

create unique index if not exists ielts_practice_plan_items_unique_daily_build
  on public.ielts_practice_plan_items(user_id, language_id, plan_date, delivery_build_id)
  where delivery_build_id is not null;

create unique index if not exists ielts_practice_sessions_plan_item_unique
  on public.ielts_practice_sessions(plan_item_id)
  where plan_item_id is not null;

alter table public.ielts_practice_plan_items
  drop constraint if exists ielts_practice_plan_items_runtime_target_check;

alter table public.ielts_practice_plan_items
  add constraint ielts_practice_plan_items_runtime_target_check
  check (
    exercise_id is not null
    or blueprint_id is not null
    or delivery_build_id is not null
  );

drop trigger if exists ielts_practice_blueprints_updated_at on public.ielts_practice_blueprints;
create trigger ielts_practice_blueprints_updated_at
before update on public.ielts_practice_blueprints
for each row
execute procedure public.handle_user_updated_at();

drop trigger if exists ielts_practice_delivery_builds_updated_at on public.ielts_practice_delivery_builds;
create trigger ielts_practice_delivery_builds_updated_at
before update on public.ielts_practice_delivery_builds
for each row
execute procedure public.handle_user_updated_at();

drop trigger if exists ielts_practice_sessions_updated_at on public.ielts_practice_sessions;
create trigger ielts_practice_sessions_updated_at
before update on public.ielts_practice_sessions
for each row
execute procedure public.handle_user_updated_at();

alter table public.ielts_practice_blueprints enable row level security;
alter table public.ielts_practice_delivery_builds enable row level security;
alter table public.ielts_practice_sessions enable row level security;

drop policy if exists "IELTS practice blueprints select admin" on public.ielts_practice_blueprints;
create policy "IELTS practice blueprints select admin"
on public.ielts_practice_blueprints
for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

drop policy if exists "IELTS practice blueprints manage admin" on public.ielts_practice_blueprints;
create policy "IELTS practice blueprints manage admin"
on public.ielts_practice_blueprints
for all
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

drop policy if exists "IELTS practice builds select admin" on public.ielts_practice_delivery_builds;
create policy "IELTS practice builds select admin"
on public.ielts_practice_delivery_builds
for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

drop policy if exists "IELTS practice builds manage admin" on public.ielts_practice_delivery_builds;
create policy "IELTS practice builds manage admin"
on public.ielts_practice_delivery_builds
for all
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

drop policy if exists "IELTS practice sessions select own" on public.ielts_practice_sessions;
create policy "IELTS practice sessions select own"
on public.ielts_practice_sessions
for select
using (user_id = auth.uid());

drop policy if exists "IELTS practice sessions write own" on public.ielts_practice_sessions;
create policy "IELTS practice sessions write own"
on public.ielts_practice_sessions
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());
