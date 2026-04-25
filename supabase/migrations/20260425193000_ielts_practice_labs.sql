-- ============================================================================
-- IELTS Practice Labs relaunch
-- ----------------------------------------------------------------------------
-- Adds learner-facing lab attempts, mistake notebook, and band roadmap state.
-- ============================================================================

create table if not exists public.ielts_practice_lab_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  practice_session_id uuid not null references public.ielts_practice_sessions(id) on delete cascade,
  delivery_build_id uuid references public.ielts_practice_delivery_builds(id) on delete set null,
  lab_kind text not null,
  section_type text not null check (section_type in ('reading', 'listening', 'writing')),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'submitted', 'scored', 'abandoned')),
  current_step_index integer not null default 0 check (current_step_index >= 0),
  answers_json jsonb not null default '{}'::jsonb,
  score_artifacts jsonb not null default '{}'::jsonb,
  raw_score numeric,
  max_score numeric,
  accuracy_ratio numeric,
  estimated_band numeric,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  scored_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practice_session_id),
  constraint ielts_practice_lab_attempts_score_range check (
    (accuracy_ratio is null or (accuracy_ratio >= 0 and accuracy_ratio <= 1))
    and (estimated_band is null or (estimated_band >= 0 and estimated_band <= 9))
  )
);

create index if not exists ielts_practice_lab_attempts_user_idx
  on public.ielts_practice_lab_attempts(user_id, language_id, updated_at desc);

create index if not exists ielts_practice_lab_attempts_status_idx
  on public.ielts_practice_lab_attempts(product_id, language_id, status, updated_at desc);

drop trigger if exists ielts_practice_lab_attempts_updated_at on public.ielts_practice_lab_attempts;
create trigger ielts_practice_lab_attempts_updated_at
before update on public.ielts_practice_lab_attempts
for each row
execute procedure public.handle_user_updated_at();

create table if not exists public.ielts_practice_mistake_notebook (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  section_type text not null check (section_type in ('reading', 'listening', 'writing')),
  question_type text not null,
  trap_type text not null default 'unknown',
  mistake_pattern text not null,
  coach_note text,
  review_count integer not null default 0 check (review_count >= 0),
  status text not null default 'active'
    check (status in ('active', 'reviewed', 'difficult', 'mastered', 'archived')),
  priority numeric not null default 0,
  next_review_at timestamptz,
  last_seen_at timestamptz,
  last_lab_attempt_id uuid references public.ielts_practice_lab_attempts(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, language_id, product_id, section_type, question_type, trap_type, status)
);

create index if not exists ielts_practice_mistake_notebook_due_idx
  on public.ielts_practice_mistake_notebook(user_id, language_id, status, next_review_at asc);

drop trigger if exists ielts_practice_mistake_notebook_updated_at on public.ielts_practice_mistake_notebook;
create trigger ielts_practice_mistake_notebook_updated_at
before update on public.ielts_practice_mistake_notebook
for each row
execute procedure public.handle_user_updated_at();

create table if not exists public.ielts_practice_roadmap_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  section_type text not null check (section_type in ('reading', 'listening', 'writing')),
  skill_key text not null,
  title text not null,
  current_state text,
  target_state text,
  linked_lab_kind text not null,
  priority numeric not null default 0,
  status text not null default 'active'
    check (status in ('active', 'in_progress', 'completed', 'archived')),
  last_practice_session_id uuid references public.ielts_practice_sessions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, language_id, product_id, section_type, skill_key)
);

create index if not exists ielts_practice_roadmap_items_user_idx
  on public.ielts_practice_roadmap_items(user_id, language_id, status, priority desc);

drop trigger if exists ielts_practice_roadmap_items_updated_at on public.ielts_practice_roadmap_items;
create trigger ielts_practice_roadmap_items_updated_at
before update on public.ielts_practice_roadmap_items
for each row
execute procedure public.handle_user_updated_at();

alter table public.ielts_practice_lab_attempts enable row level security;
alter table public.ielts_practice_mistake_notebook enable row level security;
alter table public.ielts_practice_roadmap_items enable row level security;

drop policy if exists "IELTS practice lab attempts own" on public.ielts_practice_lab_attempts;
create policy "IELTS practice lab attempts own"
on public.ielts_practice_lab_attempts
for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "IELTS practice mistake notebook own" on public.ielts_practice_mistake_notebook;
create policy "IELTS practice mistake notebook own"
on public.ielts_practice_mistake_notebook
for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "IELTS practice roadmap own" on public.ielts_practice_roadmap_items;
create policy "IELTS practice roadmap own"
on public.ielts_practice_roadmap_items
for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

update public.products
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'practice_runtime', 'practice-labs-v1',
  'lab_schema_version', 'ielts.practice.lab.v1'
)
where metadata->>'slug' = 'ielts-practice';
