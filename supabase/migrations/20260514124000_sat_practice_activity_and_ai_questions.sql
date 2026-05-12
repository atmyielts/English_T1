create table if not exists public.sat_practice_daily_activity (
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  attempts integer not null default 0,
  minutes_studied integer not null default 0,
  xp_earned integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.sat_practice_ai_generated_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  source_question_id uuid references public.content_units(id) on delete set null,
  section_type text not null check (section_type in ('reading_writing', 'math')),
  domain text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  generation_cost_cents integer not null default 0
);

create index if not exists sat_practice_ai_questions_source_idx
  on public.sat_practice_ai_generated_questions(source_question_id, domain, difficulty);

alter table public.sat_practice_daily_activity enable row level security;
alter table public.sat_practice_ai_generated_questions enable row level security;

drop policy if exists "SAT practice activity owned read" on public.sat_practice_daily_activity;
create policy "SAT practice activity owned read"
on public.sat_practice_daily_activity
for select
using (auth.uid() = user_id);

drop policy if exists "SAT practice activity owned write" on public.sat_practice_daily_activity;
create policy "SAT practice activity owned write"
on public.sat_practice_daily_activity
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "SAT practice ai questions owned read" on public.sat_practice_ai_generated_questions;
create policy "SAT practice ai questions owned read"
on public.sat_practice_ai_generated_questions
for select
using (user_id is null or auth.uid() = user_id);

drop policy if exists "SAT practice ai questions owned insert" on public.sat_practice_ai_generated_questions;
create policy "SAT practice ai questions owned insert"
on public.sat_practice_ai_generated_questions
for insert
with check (user_id is null or auth.uid() = user_id);
