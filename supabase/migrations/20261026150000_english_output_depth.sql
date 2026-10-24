-- Depth for the English output skills: tutor threads, cached model answers and
-- mini-lessons, and multi-day real-life projects.
-- ============================================================================
--   * english_tutor_threads / english_tutor_messages: the AI tutor's
--     conversations on the account (were in the browser's localStorage), with a
--     rolling summary so the model never needs the raw history. Limits kept by
--     the hub: 200 messages per thread, 20 threads per learner. Threads idle
--     for 180 days are deleted daily (pg_cron english-tutor-threads-prune-v1).
--   * english_writing_model_answers: one short model answer per writing prompt
--     and CEFR level, shared by every learner (one AI call per prompt/level).
--   * english_tutor_lesson_cache: one mini-lesson per grammar topic and level,
--     shared by every learner.
--   * english_immersion_project_runs: a learner's progress through a
--     three-day project (definitions live in code:
--     supabase/functions/_shared/english-immersion-depth.ts).
-- Writing drafts reuse public.writing_drafts (autosave writes current_text).
-- Everything is written and read only by edge functions (service role).
-- ============================================================================

create table if not exists public.english_tutor_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  title text not null default 'Conversation' check (char_length(title) <= 80),
  -- Written by the model each turn (<= 600 chars); replaces the raw history in prompts.
  summary text not null default '' check (char_length(summary) <= 800),
  message_count integer not null default 0 check (message_count >= 0),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists english_tutor_threads_user_idx
  on public.english_tutor_threads (user_id, language_id, last_message_at desc);

create index if not exists english_tutor_threads_idle_idx
  on public.english_tutor_threads (last_message_at);

alter table public.english_tutor_threads enable row level security;
revoke all on public.english_tutor_threads from anon, authenticated;

create table if not exists public.english_tutor_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.english_tutor_threads(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  -- chat: a normal turn; lesson: a mini-lesson card (payload.lesson + payload.answers).
  kind text not null default 'chat' check (kind in ('chat', 'lesson')),
  content text not null default '' check (char_length(content) <= 4000),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists english_tutor_messages_thread_idx
  on public.english_tutor_messages (thread_id, id desc);

create index if not exists english_tutor_messages_user_idx
  on public.english_tutor_messages (user_id, created_at desc);

alter table public.english_tutor_messages enable row level security;
revoke all on public.english_tutor_messages from anon, authenticated;

create table if not exists public.english_writing_model_answers (
  prompt_id uuid not null references public.writing_prompts(id) on delete cascade,
  level text not null check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  answer_text text not null check (char_length(answer_text) <= 3000),
  notes jsonb not null default '[]'::jsonb,
  word_count integer not null default 0 check (word_count >= 0),
  created_at timestamptz not null default now(),
  primary key (prompt_id, level)
);

alter table public.english_writing_model_answers enable row level security;
revoke all on public.english_writing_model_answers from anon, authenticated;

create table if not exists public.english_tutor_lesson_cache (
  topic text not null check (char_length(topic) <= 48),
  level text not null check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  lesson jsonb not null,
  created_at timestamptz not null default now(),
  primary key (topic, level)
);

alter table public.english_tutor_lesson_cache enable row level security;
revoke all on public.english_tutor_lesson_cache from anon, authenticated;

create table if not exists public.english_immersion_project_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  project_key text not null check (char_length(project_key) <= 60),
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  -- One entry per finished day (see ProjectDayResult in english-immersion-depth.ts).
  days jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- At most one active run per learner and project.
create unique index if not exists english_immersion_project_runs_active_uidx
  on public.english_immersion_project_runs (user_id, language_id, project_key)
  where status = 'active';

create index if not exists english_immersion_project_runs_user_idx
  on public.english_immersion_project_runs (user_id, language_id, updated_at desc);

alter table public.english_immersion_project_runs enable row level security;
revoke all on public.english_immersion_project_runs from anon, authenticated;

-- Deletes tutor threads idle for p_days (their messages go with them).
create or replace function public.prune_english_tutor_threads(p_days integer default 180)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from public.english_tutor_threads
  where last_message_at < now() - make_interval(days => greatest(30, coalesce(p_days, 180)));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_english_tutor_threads(integer) from public, anon, authenticated;
grant execute on function public.prune_english_tutor_threads(integer) to service_role;

create extension if not exists pg_cron with schema extensions;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = 'english-tutor-threads-prune-v1' loop
    perform cron.unschedule(v_job_id);
  end loop;
  -- 03:41 UTC, after the AI ledger pruning (03:23).
  perform cron.schedule(
    'english-tutor-threads-prune-v1',
    '41 3 * * *',
    $cron$select public.prune_english_tutor_threads(180);$cron$
  );
exception
  when undefined_table then
    raise notice 'pg_cron is unavailable in this environment; tutor thread pruning not scheduled';
end
$$;

-- Account closure erases these learner tables too. Same additive pattern as
-- 20261010175000_ai_request_ledger.sql: keep the installed registry and append
-- only what is missing, so other migrations' additions are preserved.
do $$
declare
  relations text[];
  wanted text[] := array['english_tutor_messages', 'english_tutor_threads', 'english_immersion_project_runs'];
  relation_name text;
begin
  if to_regprocedure('public.account_personal_erasure_tables()') is null then
    raise notice 'account_personal_erasure_tables() is not installed; erasure registry not extended';
    return;
  end if;
  relations := public.account_personal_erasure_tables();
  foreach relation_name in array wanted loop
    if not (relation_name = any(relations)) then
      relations := relations || relation_name;
    end if;
  end loop;
  execute format(
    'create or replace function public.account_personal_erasure_tables() returns text[] language sql immutable set search_path=pg_catalog,public as %L',
    format('select %L::text[];', relations::text)
  );
end
$$;
