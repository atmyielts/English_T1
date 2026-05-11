-- ============================================================================
-- IELTS PLAYBOOK ENRICHMENTS: drills, diagnostic, section chat, notes
-- ============================================================================
-- Turns the playbook from a content site into a learning service. Four new
-- tables backing the frontend enrichments:
--
--   1. ielts_playbook_drill_attempts     — mini-drills at the end of a module
--   2. ielts_playbook_diagnostic_results — start-of-module skip-decision quiz
--   3. ielts_playbook_section_threads    — per-section AI chat threads
--   4. ielts_playbook_user_notes         — highlights + notes / personal sheet
--
-- All four are per-user, RLS-protected, and reference ielts_playbook_pages so
-- the dashboard can aggregate progress per module. None of them seed practice
-- SRS rows on their own; the edge function handles that side-effect via the
-- existing exam.result / domain-event pipeline so SRS stays a single owner.

create table if not exists public.ielts_playbook_drill_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  page_id uuid not null references public.ielts_playbook_pages(id) on delete cascade,
  drill_id text not null,
  question_type text,
  is_correct boolean not null default false,
  response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ielts_playbook_drill_attempts_user_idx
  on public.ielts_playbook_drill_attempts(user_id, page_id, created_at desc);

create index if not exists ielts_playbook_drill_attempts_page_idx
  on public.ielts_playbook_drill_attempts(page_id, created_at desc);

alter table public.ielts_playbook_drill_attempts enable row level security;

drop policy if exists "Playbook drill attempts select own" on public.ielts_playbook_drill_attempts;
create policy "Playbook drill attempts select own"
on public.ielts_playbook_drill_attempts
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Playbook drill attempts insert own" on public.ielts_playbook_drill_attempts;
create policy "Playbook drill attempts insert own"
on public.ielts_playbook_drill_attempts
for insert
with check (auth.uid() = user_id or public.is_admin());

create table if not exists public.ielts_playbook_diagnostic_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  page_id uuid not null references public.ielts_playbook_pages(id) on delete cascade,
  score integer not null default 0,
  total integer not null default 0,
  recommended_skip boolean not null default false,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ielts_playbook_diagnostic_results_user_idx
  on public.ielts_playbook_diagnostic_results(user_id, page_id, created_at desc);

alter table public.ielts_playbook_diagnostic_results enable row level security;

drop policy if exists "Playbook diagnostic select own" on public.ielts_playbook_diagnostic_results;
create policy "Playbook diagnostic select own"
on public.ielts_playbook_diagnostic_results
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Playbook diagnostic insert own" on public.ielts_playbook_diagnostic_results;
create policy "Playbook diagnostic insert own"
on public.ielts_playbook_diagnostic_results
for insert
with check (auth.uid() = user_id or public.is_admin());

create table if not exists public.ielts_playbook_section_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  page_id uuid not null references public.ielts_playbook_pages(id) on delete cascade,
  section_id text not null,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, page_id, section_id)
);

create index if not exists ielts_playbook_section_threads_user_idx
  on public.ielts_playbook_section_threads(user_id, page_id);

alter table public.ielts_playbook_section_threads enable row level security;

drop policy if exists "Playbook section threads select own" on public.ielts_playbook_section_threads;
create policy "Playbook section threads select own"
on public.ielts_playbook_section_threads
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Playbook section threads write own" on public.ielts_playbook_section_threads;
create policy "Playbook section threads write own"
on public.ielts_playbook_section_threads
for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

drop trigger if exists ielts_playbook_section_threads_updated_at on public.ielts_playbook_section_threads;
create trigger ielts_playbook_section_threads_updated_at
before update on public.ielts_playbook_section_threads
for each row
execute procedure public.handle_user_updated_at();

create table if not exists public.ielts_playbook_user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  page_id uuid not null references public.ielts_playbook_pages(id) on delete cascade,
  section_id text,
  anchor_text text not null default '',
  body text not null default '',
  color text not null default 'amber',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ielts_playbook_user_notes_user_idx
  on public.ielts_playbook_user_notes(user_id, updated_at desc);

create index if not exists ielts_playbook_user_notes_page_idx
  on public.ielts_playbook_user_notes(user_id, page_id);

alter table public.ielts_playbook_user_notes enable row level security;

drop policy if exists "Playbook notes select own" on public.ielts_playbook_user_notes;
create policy "Playbook notes select own"
on public.ielts_playbook_user_notes
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Playbook notes write own" on public.ielts_playbook_user_notes;
create policy "Playbook notes write own"
on public.ielts_playbook_user_notes
for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

drop trigger if exists ielts_playbook_user_notes_updated_at on public.ielts_playbook_user_notes;
create trigger ielts_playbook_user_notes_updated_at
before update on public.ielts_playbook_user_notes
for each row
execute procedure public.handle_user_updated_at();
