-- ============================================================================
-- Exam outcomes + domain outbox (cross-service assessment contract)
-- ----------------------------------------------------------------------------
-- Goal:
--   - Persist canonical scored exam outcomes once per session
--   - Emit versioned domain events for downstream consumers
-- ============================================================================

create table if not exists public.exam_outcomes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,

  score_method text not null default 'auto' check (score_method in ('auto', 'manual', 'ai')),
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed')),

  schema_version text not null default 'exam.result.v1',
  overall_score numeric,
  overall_band numeric,

  section_scores jsonb not null default '{}'::jsonb,
  skill_breakdown jsonb not null default '{}'::jsonb,
  raw_result jsonb not null default '{}'::jsonb,

  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exam_outcomes_user_computed_idx
  on public.exam_outcomes(user_id, computed_at desc);

create index if not exists exam_outcomes_product_computed_idx
  on public.exam_outcomes(product_id, computed_at desc);

create index if not exists exam_outcomes_experience_computed_idx
  on public.exam_outcomes(experience_id, computed_at desc);

drop trigger if exists exam_outcomes_updated_at on public.exam_outcomes;
create trigger exam_outcomes_updated_at
before update on public.exam_outcomes
for each row
execute procedure public.handle_user_updated_at();

alter table public.exam_outcomes enable row level security;

drop policy if exists "Exam outcomes select own" on public.exam_outcomes;
create policy "Exam outcomes select own"
on public.exam_outcomes
for select
using (auth.uid() = user_id);

drop policy if exists "Exam outcomes select admin" on public.exam_outcomes;
create policy "Exam outcomes select admin"
on public.exam_outcomes
for select
using (public.is_admin());

create table if not exists public.domain_event_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  event_version text not null default 'v1',
  aggregate_type text not null,
  aggregate_id uuid not null,
  user_id uuid references public.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  payload jsonb not null,

  status text not null default 'pending' check (status in ('pending', 'processing', 'delivered', 'failed')),
  attempts integer not null default 0,
  last_error text,
  idempotency_key text unique,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists domain_event_outbox_status_created_idx
  on public.domain_event_outbox(status, created_at);

create index if not exists domain_event_outbox_event_type_idx
  on public.domain_event_outbox(event_type, occurred_at desc);

create index if not exists domain_event_outbox_aggregate_idx
  on public.domain_event_outbox(aggregate_type, aggregate_id, occurred_at desc);

drop trigger if exists domain_event_outbox_updated_at on public.domain_event_outbox;
create trigger domain_event_outbox_updated_at
before update on public.domain_event_outbox
for each row
execute procedure public.handle_user_updated_at();

alter table public.domain_event_outbox enable row level security;

drop policy if exists "Domain outbox select admin" on public.domain_event_outbox;
create policy "Domain outbox select admin"
on public.domain_event_outbox
for select
using (public.is_admin());
