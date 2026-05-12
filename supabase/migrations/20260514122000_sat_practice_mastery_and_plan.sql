create table if not exists public.sat_practice_mastery (
  user_id uuid not null references public.users(id) on delete cascade,
  section_type text not null check (section_type in ('reading_writing', 'math')),
  domain text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  attempts integer not null default 0,
  rolling_accuracy numeric(4,3),
  last_accuracy numeric(4,3),
  mastery_status text not null default 'new' check (mastery_status in ('new', 'weak', 'building', 'stable', 'mastered')),
  mastery_level numeric(4,3) not null default 0 check (mastery_level >= 0 and mastery_level <= 1),
  last_practiced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, section_type, domain, difficulty)
);

create table if not exists public.sat_practice_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  scheduled_for date not null,
  task_type text not null check (task_type in ('drill', 'notebook_review', 'half_mock', 'tutor_session')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'skipped')),
  estimated_minutes integer not null default 20 check (estimated_minutes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists sat_practice_plan_user_date_idx
  on public.sat_practice_plan_items(user_id, scheduled_for, status);

alter table public.sat_practice_mastery enable row level security;
alter table public.sat_practice_plan_items enable row level security;

drop policy if exists "SAT practice mastery owned read" on public.sat_practice_mastery;
create policy "SAT practice mastery owned read"
on public.sat_practice_mastery
for select
using (auth.uid() = user_id);

drop policy if exists "SAT practice mastery owned write" on public.sat_practice_mastery;
create policy "SAT practice mastery owned write"
on public.sat_practice_mastery
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "SAT practice plan owned read" on public.sat_practice_plan_items;
create policy "SAT practice plan owned read"
on public.sat_practice_plan_items
for select
using (auth.uid() = user_id);

drop policy if exists "SAT practice plan owned write" on public.sat_practice_plan_items;
create policy "SAT practice plan owned write"
on public.sat_practice_plan_items
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
