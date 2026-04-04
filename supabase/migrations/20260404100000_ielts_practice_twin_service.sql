-- ============================================================================
-- IELTS Practice twin service (practice.ielts.schood.online)
-- ----------------------------------------------------------------------------
-- Additive schema for personalized IELTS practice loops (reading/listening/writing)
-- plus product seed, language mapping, and admin-tunable recommendation rules.
-- ============================================================================

-- Product + plan seed ---------------------------------------------------------

insert into public.products (id, name, type, status, description, metadata)
values (
  'a74195fd-b4f3-4fd4-93bf-c807e42250c6'::uuid,
  'IELTS Practice',
  'practice',
  'active',
  'Personalized IELTS practice service driven by simulator outcomes and user target bands.',
  jsonb_build_object(
    'slug', 'ielts-practice',
    'app_url', 'https://practice.ielts.schood.online',
    'short_description', 'Daily adaptive IELTS practice plans based on your scored outcomes.',
    'tagline', 'Target the weakest question types and move your band score deliberately.',
    'sort_order', 8,
    'bundle_compatible_with', jsonb_build_array('ielts-academic-simulator'),
    'seeded_by', '20260404100000_ielts_practice_twin_service'
  )
)
on conflict (id) do update
set
  name = excluded.name,
  type = excluded.type,
  status = excluded.status,
  description = excluded.description,
  metadata = coalesce(public.products.metadata, '{}'::jsonb) || excluded.metadata;

insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active, metadata)
values (
  '44ddf706-c9f8-4db1-bc14-7228f81ce7f8'::uuid,
  'a74195fd-b4f3-4fd4-93bf-c807e42250c6'::uuid,
  'IELTS Practice Monthly',
  89000,
  'UZS',
  30,
  true,
  jsonb_build_object(
    'display_order', 1,
    'recommended', true,
    'tagline', 'Best for daily adaptive progression',
    'description', 'Daily personalized plans for Reading, Listening, and Writing with diagnostics.',
    'features', jsonb_build_array(
      'Adaptive daily practice plan',
      'Question-type targeted drills',
      'Writing feedback loop',
      'Contributes to shared English profile'
    ),
    'seeded_by', '20260404100000_ielts_practice_twin_service'
  )
)
on conflict (id) do update
set
  product_id = excluded.product_id,
  name = excluded.name,
  amount = excluded.amount,
  currency = excluded.currency,
  duration_days = excluded.duration_days,
  is_active = excluded.is_active,
  metadata = excluded.metadata;

insert into public.languages (code, name, status, metadata)
values ('en', 'English', 'active', jsonb_build_object('seeded_by', '20260404100000_ielts_practice_twin_service'))
on conflict (code) do update
set
  status = excluded.status,
  metadata = coalesce(public.languages.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

with en as (
  select id as language_id
  from public.languages
  where code = 'en'
  limit 1
)
insert into public.product_languages (product_id, language_id, included_in_shared_profile, metadata)
select
  'a74195fd-b4f3-4fd4-93bf-c807e42250c6'::uuid,
  en.language_id,
  true,
  jsonb_build_object(
    'seeded_by', '20260404100000_ielts_practice_twin_service',
    'scope', 'english_shared_profile'
  )
from en
on conflict (product_id) do update
set
  language_id = excluded.language_id,
  included_in_shared_profile = excluded.included_in_shared_profile,
  metadata = coalesce(public.product_languages.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

-- Core practice schema -------------------------------------------------------

create table if not exists public.ielts_practice_user_goals (
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,

  target_overall_band numeric(3,1) not null default 6.5,
  target_section_bands jsonb not null default '{}'::jsonb,
  target_date date,

  focus_modes text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, language_id),
  constraint ielts_practice_user_goals_target_band_range
    check (target_overall_band >= 0 and target_overall_band <= 9)
);

create index if not exists ielts_practice_user_goals_product_idx
  on public.ielts_practice_user_goals(product_id, updated_at desc);

create table if not exists public.ielts_practice_exercises (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  language_id uuid not null references public.languages(id) on delete restrict,

  title text not null,
  section_type text not null check (section_type in ('reading', 'listening', 'writing')),
  question_type text not null,
  skill_tags text[] not null default '{}'::text[],

  difficulty_band_min numeric(3,1) not null default 4.0,
  difficulty_band_max numeric(3,1) not null default 9.0,

  estimated_minutes integer not null default 20,
  payload_json jsonb not null default '{}'::jsonb,

  source_product_id uuid references public.products(id) on delete set null,
  source_experience_id uuid references public.experiences(id) on delete set null,
  source_content_unit_id uuid references public.content_units(id) on delete set null,

  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  metadata jsonb not null default '{}'::jsonb,

  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ielts_practice_exercises_difficulty_bounds
    check (
      difficulty_band_min >= 0
      and difficulty_band_max <= 9
      and difficulty_band_min <= difficulty_band_max
    ),
  constraint ielts_practice_exercises_estimated_minutes_positive
    check (estimated_minutes > 0)
);

create unique index if not exists ielts_practice_exercises_source_unique_idx
  on public.ielts_practice_exercises(product_id, source_content_unit_id)
  where source_content_unit_id is not null;

create index if not exists ielts_practice_exercises_status_idx
  on public.ielts_practice_exercises(status, section_type, question_type);

create index if not exists ielts_practice_exercises_language_idx
  on public.ielts_practice_exercises(language_id, updated_at desc);

create table if not exists public.ielts_practice_diagnostic_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,

  snapshot_version text not null default 'ielts.practice.diagnostic.v1',
  diagnostics jsonb not null default '{}'::jsonb,
  source_summary jsonb not null default '{}'::jsonb,

  computed_at timestamptz not null default now(),
  is_current boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ielts_practice_diagnostic_snapshots_user_idx
  on public.ielts_practice_diagnostic_snapshots(user_id, language_id, computed_at desc);

create index if not exists ielts_practice_diagnostic_snapshots_current_idx
  on public.ielts_practice_diagnostic_snapshots(user_id, language_id, is_current, computed_at desc);

create table if not exists public.ielts_practice_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,

  plan_date date not null,
  section_type text not null check (section_type in ('reading', 'listening', 'writing')),
  exercise_id uuid not null references public.ielts_practice_exercises(id) on delete restrict,

  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'completed', 'skipped', 'expired')),
  priority numeric(6,3) not null default 1,
  due_at timestamptz,

  rationale text,
  rationale_json jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  attempt_id uuid,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ielts_practice_plan_items_unique_daily_exercise
  on public.ielts_practice_plan_items(user_id, language_id, plan_date, exercise_id);

create index if not exists ielts_practice_plan_items_user_date_idx
  on public.ielts_practice_plan_items(user_id, language_id, plan_date, status, priority desc, created_at asc);

create table if not exists public.ielts_practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,

  exercise_id uuid not null references public.ielts_practice_exercises(id) on delete restrict,
  plan_item_id uuid references public.ielts_practice_plan_items(id) on delete set null,

  section_type text not null check (section_type in ('reading', 'listening', 'writing')),
  question_type text not null,

  status text not null default 'started' check (status in ('started', 'submitted', 'scored', 'failed')),

  answers_json jsonb not null default '{}'::jsonb,
  score_artifacts jsonb not null default '{}'::jsonb,

  raw_score numeric,
  max_score numeric,
  accuracy_ratio numeric,
  estimated_band numeric(3,1),

  writing_session_id uuid references public.sessions(id) on delete set null,
  writing_evaluation_id uuid references public.evaluations(id) on delete set null,

  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  scored_at timestamptz,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ielts_practice_attempts_accuracy_range
    check (accuracy_ratio is null or (accuracy_ratio >= 0 and accuracy_ratio <= 1)),
  constraint ielts_practice_attempts_band_range
    check (estimated_band is null or (estimated_band >= 0 and estimated_band <= 9))
);

create index if not exists ielts_practice_attempts_user_idx
  on public.ielts_practice_attempts(user_id, language_id, created_at desc);

create index if not exists ielts_practice_attempts_exercise_idx
  on public.ielts_practice_attempts(exercise_id, status, created_at desc);

create table if not exists public.ielts_practice_rules (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null references public.languages(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,

  rule_key text not null,
  rule_name text not null,
  description text,
  status text not null default 'active' check (status in ('draft', 'active', 'disabled')),

  weight numeric not null default 1,
  config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (language_id, product_id, rule_key),
  constraint ielts_practice_rules_weight_positive check (weight > 0)
);

create index if not exists ielts_practice_rules_status_idx
  on public.ielts_practice_rules(language_id, product_id, status, updated_at desc);

-- Add deferred FK now that attempts table exists.
alter table public.ielts_practice_plan_items
  drop constraint if exists ielts_practice_plan_items_attempt_id_fkey;

alter table public.ielts_practice_plan_items
  add constraint ielts_practice_plan_items_attempt_id_fkey
  foreign key (attempt_id) references public.ielts_practice_attempts(id) on delete set null;

-- updated_at triggers --------------------------------------------------------

drop trigger if exists ielts_practice_user_goals_updated_at on public.ielts_practice_user_goals;
create trigger ielts_practice_user_goals_updated_at
before update on public.ielts_practice_user_goals
for each row
execute procedure public.handle_user_updated_at();

drop trigger if exists ielts_practice_exercises_updated_at on public.ielts_practice_exercises;
create trigger ielts_practice_exercises_updated_at
before update on public.ielts_practice_exercises
for each row
execute procedure public.handle_user_updated_at();

drop trigger if exists ielts_practice_diagnostic_snapshots_updated_at on public.ielts_practice_diagnostic_snapshots;
create trigger ielts_practice_diagnostic_snapshots_updated_at
before update on public.ielts_practice_diagnostic_snapshots
for each row
execute procedure public.handle_user_updated_at();

drop trigger if exists ielts_practice_plan_items_updated_at on public.ielts_practice_plan_items;
create trigger ielts_practice_plan_items_updated_at
before update on public.ielts_practice_plan_items
for each row
execute procedure public.handle_user_updated_at();

drop trigger if exists ielts_practice_attempts_updated_at on public.ielts_practice_attempts;
create trigger ielts_practice_attempts_updated_at
before update on public.ielts_practice_attempts
for each row
execute procedure public.handle_user_updated_at();

drop trigger if exists ielts_practice_rules_updated_at on public.ielts_practice_rules;
create trigger ielts_practice_rules_updated_at
before update on public.ielts_practice_rules
for each row
execute procedure public.handle_user_updated_at();

-- RLS -----------------------------------------------------------------------

alter table public.ielts_practice_user_goals enable row level security;
alter table public.ielts_practice_exercises enable row level security;
alter table public.ielts_practice_diagnostic_snapshots enable row level security;
alter table public.ielts_practice_plan_items enable row level security;
alter table public.ielts_practice_attempts enable row level security;
alter table public.ielts_practice_rules enable row level security;

-- goals
drop policy if exists "IELTS practice goals select own" on public.ielts_practice_user_goals;
create policy "IELTS practice goals select own"
on public.ielts_practice_user_goals
for select
using (auth.uid() = user_id);

drop policy if exists "IELTS practice goals write own" on public.ielts_practice_user_goals;
create policy "IELTS practice goals write own"
on public.ielts_practice_user_goals
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "IELTS practice goals admin" on public.ielts_practice_user_goals;
create policy "IELTS practice goals admin"
on public.ielts_practice_user_goals
for all
using (public.is_admin())
with check (public.is_admin());

-- exercises
drop policy if exists "IELTS practice exercises select published" on public.ielts_practice_exercises;
create policy "IELTS practice exercises select published"
on public.ielts_practice_exercises
for select
using (status = 'published' or public.is_admin());

drop policy if exists "IELTS practice exercises admin manage" on public.ielts_practice_exercises;
create policy "IELTS practice exercises admin manage"
on public.ielts_practice_exercises
for all
using (public.is_admin())
with check (public.is_admin());

-- diagnostics
drop policy if exists "IELTS practice diagnostics select own" on public.ielts_practice_diagnostic_snapshots;
create policy "IELTS practice diagnostics select own"
on public.ielts_practice_diagnostic_snapshots
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "IELTS practice diagnostics write own" on public.ielts_practice_diagnostic_snapshots;
create policy "IELTS practice diagnostics write own"
on public.ielts_practice_diagnostic_snapshots
for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

-- plan items
drop policy if exists "IELTS practice plan select own" on public.ielts_practice_plan_items;
create policy "IELTS practice plan select own"
on public.ielts_practice_plan_items
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "IELTS practice plan write own" on public.ielts_practice_plan_items;
create policy "IELTS practice plan write own"
on public.ielts_practice_plan_items
for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

-- attempts
drop policy if exists "IELTS practice attempts select own" on public.ielts_practice_attempts;
create policy "IELTS practice attempts select own"
on public.ielts_practice_attempts
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "IELTS practice attempts write own" on public.ielts_practice_attempts;
create policy "IELTS practice attempts write own"
on public.ielts_practice_attempts
for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

-- rules
drop policy if exists "IELTS practice rules select admin" on public.ielts_practice_rules;
create policy "IELTS practice rules select admin"
on public.ielts_practice_rules
for select
using (public.is_admin());

drop policy if exists "IELTS practice rules manage admin" on public.ielts_practice_rules;
create policy "IELTS practice rules manage admin"
on public.ielts_practice_rules
for all
using (public.is_admin())
with check (public.is_admin());

-- Default recommendation rules ----------------------------------------------

with en as (
  select id as language_id
  from public.languages
  where code = 'en'
  limit 1
)
insert into public.ielts_practice_rules (
  language_id,
  product_id,
  rule_key,
  rule_name,
  description,
  status,
  weight,
  config,
  metadata
)
select
  en.language_id,
  'a74195fd-b4f3-4fd4-93bf-c807e42250c6'::uuid,
  seed.rule_key,
  seed.rule_name,
  seed.description,
  'active',
  seed.weight,
  seed.config,
  jsonb_build_object('seeded_by', '20260404100000_ielts_practice_twin_service')
from en
cross join (
  values
    (
      'band_gap',
      'Band Gap Priority',
      'Prioritize sections where target band gap is largest.',
      1.35::numeric,
      jsonb_build_object('max_bonus', 1.2, 'curve', 'linear')
    ),
    (
      'question_type_error_rate',
      'Question Type Weakness',
      'Increase priority for question types with recent low accuracy.',
      1.45::numeric,
      jsonb_build_object('window_attempts', 120, 'min_samples', 4)
    ),
    (
      'recency_decay',
      'Recency Decay',
      'Recent failures should matter more than old failures.',
      1.1::numeric,
      jsonb_build_object('half_life_days', 21)
    ),
    (
      'coverage_balance',
      'Section Balance Guard',
      'Ensure daily plans include balanced reading/listening/writing coverage.',
      1.0::numeric,
      jsonb_build_object('target_mix', jsonb_build_object('reading', 0.34, 'listening', 0.33, 'writing', 0.33))
    )
) as seed(rule_key, rule_name, description, weight, config)
on conflict (language_id, product_id, rule_key) do update
set
  rule_name = excluded.rule_name,
  description = excluded.description,
  status = excluded.status,
  weight = excluded.weight,
  config = excluded.config,
  metadata = coalesce(public.ielts_practice_rules.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

