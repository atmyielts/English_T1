-- ============================================================================
-- IELTS Practice relaunch v2
-- ----------------------------------------------------------------------------
-- Adds transformed practice metadata and learner mastery tracking.
-- ============================================================================

alter table public.ielts_practice_blueprints
  add column if not exists experience_kind text not null default 'guided_set';

alter table public.ielts_practice_blueprints
  drop constraint if exists ielts_practice_blueprints_experience_kind_check;

alter table public.ielts_practice_blueprints
  add constraint ielts_practice_blueprints_experience_kind_check
  check (experience_kind in (
    'strategy',
    'repair_drill',
    'guided_set',
    'timed_mini',
    'writing_rewrite',
    'mastery_check'
  ));

alter table public.ielts_practice_delivery_builds
  add column if not exists experience_kind text not null default 'guided_set';

alter table public.ielts_practice_delivery_builds
  drop constraint if exists ielts_practice_delivery_builds_experience_kind_check;

alter table public.ielts_practice_delivery_builds
  add constraint ielts_practice_delivery_builds_experience_kind_check
  check (experience_kind in (
    'strategy',
    'repair_drill',
    'guided_set',
    'timed_mini',
    'writing_rewrite',
    'mastery_check'
  ));

create index if not exists ielts_practice_blueprints_kind_idx
  on public.ielts_practice_blueprints(product_id, language_id, status, experience_kind, updated_at desc);

create index if not exists ielts_practice_delivery_builds_kind_idx
  on public.ielts_practice_delivery_builds(product_id, language_id, status, experience_kind, updated_at desc);

create table if not exists public.ielts_practice_mastery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,

  section_type text not null check (section_type in ('reading', 'listening', 'writing')),
  question_type text not null,

  attempts integer not null default 0 check (attempts >= 0),
  last_accuracy_ratio numeric,
  best_accuracy_ratio numeric,
  rolling_accuracy_ratio numeric,
  mastery_level numeric not null default 0 check (mastery_level >= 0 and mastery_level <= 1),
  mastery_status text not null default 'new'
    check (mastery_status in ('new', 'weak', 'building', 'stable', 'mastered')),

  last_practice_session_id uuid references public.ielts_practice_sessions(id) on delete set null,
  last_session_id uuid references public.sessions(id) on delete set null,
  last_attempt_id uuid references public.ielts_practice_attempts(id) on delete set null,

  metadata jsonb not null default '{}'::jsonb,
  last_practiced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, language_id, section_type, question_type),
  constraint ielts_practice_mastery_accuracy_range check (
    (last_accuracy_ratio is null or (last_accuracy_ratio >= 0 and last_accuracy_ratio <= 1))
    and (best_accuracy_ratio is null or (best_accuracy_ratio >= 0 and best_accuracy_ratio <= 1))
    and (rolling_accuracy_ratio is null or (rolling_accuracy_ratio >= 0 and rolling_accuracy_ratio <= 1))
  )
);

create index if not exists ielts_practice_mastery_user_idx
  on public.ielts_practice_mastery(user_id, language_id, mastery_status, updated_at desc);

create index if not exists ielts_practice_mastery_section_idx
  on public.ielts_practice_mastery(product_id, language_id, section_type, question_type);

drop trigger if exists ielts_practice_mastery_updated_at on public.ielts_practice_mastery;
create trigger ielts_practice_mastery_updated_at
before update on public.ielts_practice_mastery
for each row
execute procedure public.handle_user_updated_at();

alter table public.ielts_practice_mastery enable row level security;

drop policy if exists "IELTS practice mastery select own" on public.ielts_practice_mastery;
create policy "IELTS practice mastery select own"
on public.ielts_practice_mastery
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "IELTS practice mastery write own" on public.ielts_practice_mastery;
create policy "IELTS practice mastery write own"
on public.ielts_practice_mastery
for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

update public.products
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'practice_runtime', 'transformed-sessions-v2',
  'supported_sections', jsonb_build_array('reading', 'listening', 'writing'),
  'diagnostic_schema_version', 'ielts.practice.diagnostic.v2'
)
where metadata->>'slug' = 'ielts-practice';
