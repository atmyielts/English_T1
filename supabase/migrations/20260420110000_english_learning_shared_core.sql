-- ============================================================================
-- Non-exam English shared-core foundation
-- ----------------------------------------------------------------------------
-- Adds the first shared learning backbone for English services:
-- - learner goals
-- - content registry
-- - attempts + normalized feedback
-- - error memory
-- - mastery state
-- - recommendations
-- - daily plans
-- ----------------------------------------------------------------------------
-- This is intentionally language-scoped and additive so it can coexist with
-- the existing universal platform foundation and current English services.
-- ============================================================================

create table if not exists public.learner_language_goals (
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  target_cefr text check (target_cefr in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  goal_keys text[] not null default '{}'::text[],
  daily_time_minutes integer not null default 40
    check (daily_time_minutes between 5 and 240),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, language_id)
);

create index if not exists learner_language_goals_product_idx
  on public.learner_language_goals(product_id, updated_at desc);

drop trigger if exists learner_language_goals_updated_at on public.learner_language_goals;
create trigger learner_language_goals_updated_at
before update on public.learner_language_goals
for each row execute function public.set_updated_at();

alter table public.learner_language_goals enable row level security;

drop policy if exists "Learner language goals select own" on public.learner_language_goals;
create policy "Learner language goals select own"
on public.learner_language_goals
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Learner language goals write own" on public.learner_language_goals;
create policy "Learner language goals write own"
on public.learner_language_goals
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Learner language goals select admin" on public.learner_language_goals;
create policy "Learner language goals select admin"
on public.learner_language_goals
for select
to authenticated
using (public.is_admin());

create table if not exists public.learning_content_registry_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  service_key text not null,
  content_type text not null,
  source_table text,
  source_record_id uuid,
  source_ref text not null,
  title text not null,
  description text,
  skill_key text not null,
  subskill_keys text[] not null default '{}'::text[],
  cefr_level text
    check (cefr_level is null or cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  difficulty numeric not null default 0.5
    check (difficulty >= 0 and difficulty <= 1),
  estimated_minutes integer not null default 10
    check (estimated_minutes > 0 and estimated_minutes <= 240),
  learning_objective text,
  tags text[] not null default '{}'::text[],
  dependency_keys text[] not null default '{}'::text[],
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  payload_json jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_content_registry_source_ref_not_empty check (length(trim(source_ref)) > 0)
);

create unique index if not exists learning_content_registry_scope_ref_idx
  on public.learning_content_registry_items(language_id, service_key, content_type, source_ref);

create unique index if not exists learning_content_registry_source_record_idx
  on public.learning_content_registry_items(product_id, source_table, source_record_id)
  where source_record_id is not null;

create index if not exists learning_content_registry_service_idx
  on public.learning_content_registry_items(language_id, service_key, status, updated_at desc);

create index if not exists learning_content_registry_skill_idx
  on public.learning_content_registry_items(language_id, skill_key, status, updated_at desc);

drop trigger if exists learning_content_registry_items_updated_at on public.learning_content_registry_items;
create trigger learning_content_registry_items_updated_at
before update on public.learning_content_registry_items
for each row execute function public.set_updated_at();

alter table public.learning_content_registry_items enable row level security;

drop policy if exists "Learning content registry select authenticated" on public.learning_content_registry_items;
create policy "Learning content registry select authenticated"
on public.learning_content_registry_items
for select
to authenticated
using (true);

drop policy if exists "Learning content registry mutate admin" on public.learning_content_registry_items;
create policy "Learning content registry mutate admin"
on public.learning_content_registry_items
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create table if not exists public.learning_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  content_item_id uuid not null references public.learning_content_registry_items(id) on delete cascade,
  service_key text not null,
  attempt_type text not null default 'task',
  status text not null default 'started'
    check (status in ('started', 'submitted', 'scored', 'failed', 'abandoned')),
  response_json jsonb not null default '{}'::jsonb,
  scoring_json jsonb not null default '{}'::jsonb,
  hint_usage_count integer not null default 0
    check (hint_usage_count >= 0),
  retry_count integer not null default 0
    check (retry_count >= 0),
  time_spent_seconds integer
    check (time_spent_seconds is null or time_spent_seconds >= 0),
  correctness_ratio numeric
    check (correctness_ratio is null or (correctness_ratio >= 0 and correctness_ratio <= 1)),
  time_efficiency_ratio numeric
    check (time_efficiency_ratio is null or (time_efficiency_ratio >= 0 and time_efficiency_ratio <= 1)),
  correction_quality_ratio numeric
    check (correction_quality_ratio is null or (correction_quality_ratio >= 0 and correction_quality_ratio <= 1)),
  overall_score numeric
    check (overall_score is null or (overall_score >= 0 and overall_score <= 1)),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  scored_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists learning_attempts_user_idx
  on public.learning_attempts(user_id, language_id, created_at desc);

create index if not exists learning_attempts_content_idx
  on public.learning_attempts(content_item_id, status, created_at desc);

create index if not exists learning_attempts_service_idx
  on public.learning_attempts(user_id, language_id, service_key, created_at desc);

drop trigger if exists learning_attempts_updated_at on public.learning_attempts;
create trigger learning_attempts_updated_at
before update on public.learning_attempts
for each row execute function public.set_updated_at();

alter table public.learning_attempts enable row level security;

drop policy if exists "Learning attempts select own" on public.learning_attempts;
create policy "Learning attempts select own"
on public.learning_attempts
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Learning attempts write own" on public.learning_attempts;
create policy "Learning attempts write own"
on public.learning_attempts
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Learning attempts select admin" on public.learning_attempts;
create policy "Learning attempts select admin"
on public.learning_attempts
for select
to authenticated
using (public.is_admin());

create table if not exists public.learning_attempt_feedback (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.learning_attempts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  summary text,
  issues jsonb not null default '[]'::jsonb,
  retry_task jsonb not null default '{}'::jsonb,
  related_drill jsonb not null default '{}'::jsonb,
  handoff_targets jsonb not null default '[]'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists learning_attempt_feedback_user_idx
  on public.learning_attempt_feedback(user_id, language_id, updated_at desc);

drop trigger if exists learning_attempt_feedback_updated_at on public.learning_attempt_feedback;
create trigger learning_attempt_feedback_updated_at
before update on public.learning_attempt_feedback
for each row execute function public.set_updated_at();

alter table public.learning_attempt_feedback enable row level security;

drop policy if exists "Learning attempt feedback select own" on public.learning_attempt_feedback;
create policy "Learning attempt feedback select own"
on public.learning_attempt_feedback
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.learning_attempts a
    where a.id = learning_attempt_feedback.attempt_id
      and a.user_id = auth.uid()
  )
);

drop policy if exists "Learning attempt feedback select admin" on public.learning_attempt_feedback;
create policy "Learning attempt feedback select admin"
on public.learning_attempt_feedback
for select
to authenticated
using (public.is_admin());

create table if not exists public.learner_language_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  service_key text not null,
  skill_key text not null,
  subskill_key text not null default '*',
  error_type text not null,
  last_source_attempt_id uuid references public.learning_attempts(id) on delete set null,
  last_content_item_id uuid references public.learning_content_registry_items(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  error_frequency integer not null default 1
    check (error_frequency >= 0),
  severity_score numeric not null default 0.5
    check (severity_score >= 0 and severity_score <= 1),
  mastery_status text not null default 'open'
    check (mastery_status in ('open', 'improving', 'resolved', 'reopened')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learner_language_errors_unique
    unique (user_id, language_id, service_key, skill_key, subskill_key, error_type)
);

create index if not exists learner_language_errors_user_idx
  on public.learner_language_errors(user_id, language_id, last_seen_at desc);

create index if not exists learner_language_errors_status_idx
  on public.learner_language_errors(user_id, language_id, mastery_status, severity_score desc, last_seen_at desc);

drop trigger if exists learner_language_errors_updated_at on public.learner_language_errors;
create trigger learner_language_errors_updated_at
before update on public.learner_language_errors
for each row execute function public.set_updated_at();

alter table public.learner_language_errors enable row level security;

drop policy if exists "Learner language errors select own" on public.learner_language_errors;
create policy "Learner language errors select own"
on public.learner_language_errors
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Learner language errors select admin" on public.learner_language_errors;
create policy "Learner language errors select admin"
on public.learner_language_errors
for select
to authenticated
using (public.is_admin());

create table if not exists public.learner_language_mastery (
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  service_key text not null,
  skill_key text not null,
  unit_key text not null,
  state text not null default 'new'
    check (state in ('new', 'learning', 'unstable', 'stable', 'mastered')),
  confidence numeric not null default 0
    check (confidence >= 0 and confidence <= 1),
  success_count integer not null default 0
    check (success_count >= 0),
  failure_count integer not null default 0
    check (failure_count >= 0),
  reopened_count integer not null default 0
    check (reopened_count >= 0),
  last_practiced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, language_id, service_key, skill_key, unit_key)
);

create index if not exists learner_language_mastery_user_idx
  on public.learner_language_mastery(user_id, language_id, state, confidence desc, updated_at desc);

drop trigger if exists learner_language_mastery_updated_at on public.learner_language_mastery;
create trigger learner_language_mastery_updated_at
before update on public.learner_language_mastery
for each row execute function public.set_updated_at();

alter table public.learner_language_mastery enable row level security;

drop policy if exists "Learner language mastery select own" on public.learner_language_mastery;
create policy "Learner language mastery select own"
on public.learner_language_mastery
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Learner language mastery select admin" on public.learner_language_mastery;
create policy "Learner language mastery select admin"
on public.learner_language_mastery
for select
to authenticated
using (public.is_admin());

create table if not exists public.learner_language_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  recommended_product_id uuid references public.products(id) on delete set null,
  recommended_content_item_id uuid references public.learning_content_registry_items(id) on delete set null,
  recommended_service_key text not null,
  recommendation_type text not null,
  title text not null,
  reason text not null,
  intent text,
  skill_key text,
  priority numeric not null default 1,
  estimated_minutes integer
    check (estimated_minutes is null or estimated_minutes > 0),
  source_attempt_id uuid references public.learning_attempts(id) on delete set null,
  source_error_id uuid references public.learner_language_errors(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'dismissed', 'expired', 'archived')),
  expires_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists learner_language_recommendations_user_idx
  on public.learner_language_recommendations(user_id, language_id, status, priority desc, created_at desc);

drop trigger if exists learner_language_recommendations_updated_at on public.learner_language_recommendations;
create trigger learner_language_recommendations_updated_at
before update on public.learner_language_recommendations
for each row execute function public.set_updated_at();

alter table public.learner_language_recommendations enable row level security;

drop policy if exists "Learner language recommendations select own" on public.learner_language_recommendations;
create policy "Learner language recommendations select own"
on public.learner_language_recommendations
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Learner language recommendations write own" on public.learner_language_recommendations;
create policy "Learner language recommendations write own"
on public.learner_language_recommendations
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Learner language recommendations select admin" on public.learner_language_recommendations;
create policy "Learner language recommendations select admin"
on public.learner_language_recommendations
for select
to authenticated
using (public.is_admin());

create table if not exists public.learner_language_daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  plan_date date not null,
  minutes_budget integer not null default 40
    check (minutes_budget between 5 and 240),
  total_estimated_minutes integer not null default 0
    check (total_estimated_minutes >= 0),
  status text not null default 'active'
    check (status in ('active', 'completed', 'archived')),
  tasks jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  recommendation_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learner_language_daily_plans_unique
    unique (user_id, language_id, plan_date)
);

create index if not exists learner_language_daily_plans_user_idx
  on public.learner_language_daily_plans(user_id, language_id, plan_date desc, status);

drop trigger if exists learner_language_daily_plans_updated_at on public.learner_language_daily_plans;
create trigger learner_language_daily_plans_updated_at
before update on public.learner_language_daily_plans
for each row execute function public.set_updated_at();

alter table public.learner_language_daily_plans enable row level security;

drop policy if exists "Learner language daily plans select own" on public.learner_language_daily_plans;
create policy "Learner language daily plans select own"
on public.learner_language_daily_plans
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Learner language daily plans write own" on public.learner_language_daily_plans;
create policy "Learner language daily plans write own"
on public.learner_language_daily_plans
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Learner language daily plans select admin" on public.learner_language_daily_plans;
create policy "Learner language daily plans select admin"
on public.learner_language_daily_plans
for select
to authenticated
using (public.is_admin());

insert into public.learning_content_registry_items (
  product_id,
  language_id,
  service_key,
  content_type,
  source_table,
  source_record_id,
  source_ref,
  title,
  description,
  skill_key,
  subskill_keys,
  cefr_level,
  difficulty,
  estimated_minutes,
  learning_objective,
  tags,
  status,
  payload_json,
  metadata,
  created_by,
  updated_by
)
select
  ra.product_id,
  ra.language_id,
  'reading',
  'reading.article',
  'reading_articles',
  ra.id,
  ra.slug,
  ra.title,
  ra.summary,
  'reading',
  array['reading.gist', 'reading.detail', 'reading.inference', 'vocabulary.context']::text[],
  ra.level,
  case ra.level
    when 'A1' then 0.20
    when 'A2' then 0.30
    when 'B1' then 0.45
    when 'B2' then 0.60
    when 'C1' then 0.75
    else 0.90
  end,
  greatest(1, least(240, coalesce(ra.read_time_minutes, 6))),
  coalesce(nullif(trim(ra.summary), ''), 'Read and interpret the article with vocabulary and comprehension focus.'),
  array_remove(array[ra.category, ra.theme], null)::text[],
  ra.status,
  jsonb_build_object(
    'reading_article_id', ra.id,
    'tone', ra.tone,
    'is_hot', ra.is_hot
  ),
  coalesce(ra.metadata, '{}'::jsonb) || jsonb_build_object(
    'seeded_by', '20260420110000_english_learning_shared_core',
    'registry_role', 'phase1_template'
  ),
  ra.created_by,
  ra.updated_by
from public.reading_articles ra
on conflict (language_id, service_key, content_type, source_ref) do update
set
  product_id = excluded.product_id,
  source_table = excluded.source_table,
  source_record_id = excluded.source_record_id,
  title = excluded.title,
  description = excluded.description,
  skill_key = excluded.skill_key,
  subskill_keys = excluded.subskill_keys,
  cefr_level = excluded.cefr_level,
  difficulty = excluded.difficulty,
  estimated_minutes = excluded.estimated_minutes,
  learning_objective = excluded.learning_objective,
  tags = excluded.tags,
  status = excluded.status,
  payload_json = excluded.payload_json,
  metadata = coalesce(public.learning_content_registry_items.metadata, '{}'::jsonb) || excluded.metadata,
  updated_by = excluded.updated_by,
  updated_at = now();
