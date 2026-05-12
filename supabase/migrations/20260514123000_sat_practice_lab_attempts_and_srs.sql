create table if not exists public.sat_practice_lab_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  filters_used jsonb not null default '{}'::jsonb,
  question_ids uuid[] not null default '{}'::uuid[],
  answers jsonb not null default '{}'::jsonb,
  scored_items jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  scored_at timestamptz,
  score_raw integer,
  score_accuracy numeric(4,3),
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'scored', 'abandoned'))
);

create index if not exists sat_practice_attempts_user_status_idx
  on public.sat_practice_lab_attempts(user_id, status, started_at desc);

create table if not exists public.sat_practice_srs_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  question_id uuid not null references public.content_units(id) on delete cascade,
  leitner_box integer not null default 1 check (leitner_box between 1 and 5),
  interval_days integer not null default 1 check (interval_days >= 0),
  ease_factor numeric(3,2) not null default 2.50,
  next_review_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  correct_count integer not null default 0,
  incorrect_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_id)
);

create index if not exists sat_practice_srs_user_due_idx
  on public.sat_practice_srs_queue(user_id, next_review_at);

alter table public.sat_practice_lab_attempts enable row level security;
alter table public.sat_practice_srs_queue enable row level security;

drop policy if exists "SAT practice attempts owned read" on public.sat_practice_lab_attempts;
create policy "SAT practice attempts owned read"
on public.sat_practice_lab_attempts
for select
using (auth.uid() = user_id);

drop policy if exists "SAT practice attempts owned write" on public.sat_practice_lab_attempts;
create policy "SAT practice attempts owned write"
on public.sat_practice_lab_attempts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "SAT practice srs owned read" on public.sat_practice_srs_queue;
create policy "SAT practice srs owned read"
on public.sat_practice_srs_queue
for select
using (auth.uid() = user_id);

drop policy if exists "SAT practice srs owned write" on public.sat_practice_srs_queue;
create policy "SAT practice srs owned write"
on public.sat_practice_srs_queue
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
