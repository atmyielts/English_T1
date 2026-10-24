-- National exam track (hub /exam): practice papers in the style of Uzbekistan's
-- Multilevel English exam, and learners' timed mocks.
--
-- english_exam_papers: one row per practice paper (reading, listening, writing,
--   speaking with answer keys). Seeded from supabase/content/english/exam by
--   scripts/english-content/build-exam-seed.ts. Answer keys never reach the
--   browser: the hub strips them.
-- english_exam_mocks: one row per started mock (full or one section). Starting
--   counts toward the limits (free: 1 full mock per learner week and 1 section
--   mock per day; learners holding any English product: 2 full and 8 section
--   mocks per day), so rows are kept even when a mock is never finished.
--   sections holds, per section: started_at, the answers and the result.
--
-- Written and read only by edge functions (service role).

create table if not exists public.english_exam_papers (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  exam text not null default 'multilevel' check (exam in ('multilevel')),
  title text not null,
  level_focus text not null check (level_focus in ('B1', 'B2', 'C1')),
  status text not null default 'published' check (status in ('published', 'draft')),
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.english_exam_papers enable row level security;
revoke all on public.english_exam_papers from anon, authenticated;

create table if not exists public.english_exam_mocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  -- No foreign key: a learner's history survives if a paper is retired.
  paper_id text not null check (paper_id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  kind text not null check (kind in ('full', 'listening', 'reading', 'writing', 'speaking')),
  basis text not null check (basis in ('owner', 'admin', 'free')),
  status text not null default 'in_progress' check (status in ('in_progress', 'finished')),
  sections jsonb not null default '{}'::jsonb,
  result jsonb,
  -- Estimated overall 0-75 (full mocks) or the section score (section mocks), for the history list.
  overall_score smallint check (overall_score is null or (overall_score >= 0 and overall_score <= 75)),
  level text check (level is null or level in ('C1', 'B2', 'B1', 'below_b1')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists english_exam_mocks_user_idx
  on public.english_exam_mocks (user_id, language_id, started_at desc);

alter table public.english_exam_mocks enable row level security;
revoke all on public.english_exam_mocks from anon, authenticated;
