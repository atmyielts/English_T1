create table if not exists public.sat_practice_mistake_notebook (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  section_type text not null check (section_type in ('reading_writing', 'math')),
  domain text not null,
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  source text not null check (source in ('simulator', 'practice_lab')),
  source_session_id uuid,
  question_id uuid references public.content_units(id) on delete set null,
  reason_tag text not null default 'unknown'
    check (reason_tag in ('concept_gap', 'careless', 'time_pressure', 'misread_wording', 'unknown')),
  mistake_pattern text not null default '',
  coach_note text,
  status text not null default 'active' check (status in ('active', 'reviewing', 'mastered', 'archived')),
  review_count integer not null default 0,
  next_review_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sat_practice_notebook_user_status_due_idx
  on public.sat_practice_mistake_notebook(user_id, status, next_review_at);

create index if not exists sat_practice_notebook_question_idx
  on public.sat_practice_mistake_notebook(question_id);

alter table public.sat_practice_mistake_notebook enable row level security;

drop policy if exists "SAT practice notebook owned read" on public.sat_practice_mistake_notebook;
create policy "SAT practice notebook owned read"
on public.sat_practice_mistake_notebook
for select
using (auth.uid() = user_id);

drop policy if exists "SAT practice notebook owned insert" on public.sat_practice_mistake_notebook;
create policy "SAT practice notebook owned insert"
on public.sat_practice_mistake_notebook
for insert
with check (auth.uid() = user_id);

drop policy if exists "SAT practice notebook owned update" on public.sat_practice_mistake_notebook;
create policy "SAT practice notebook owned update"
on public.sat_practice_mistake_notebook
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
