-- Story of the day: one short story per CEFR level per learner day (UTC+5),
-- written once by the English AI gateway (feature "daily-story") on the first
-- request and shared by every learner at that level; a reading-library text
-- when AI is off. hub/daily-story.ts reads and writes these tables with the
-- service role; learners never touch them directly (RLS on, no grants).
--
-- english_daily_stories.locked_until is the writer's lease: the request that
-- inserted (or took over) the row writes the story; others wait until it is
-- ready. Idempotent.

create table if not exists public.english_daily_stories (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null references public.languages(id) on delete cascade,
  level text not null,
  story_date date not null,
  status text not null default 'generating',
  source text not null default 'ai',
  source_ref text,
  title text,
  body text,
  questions jsonb not null default '[]'::jsonb,
  word_count integer,
  locked_until timestamptz,
  attempts smallint not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint english_daily_stories_level check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  constraint english_daily_stories_status check (status in ('generating', 'ready', 'failed')),
  constraint english_daily_stories_source check (source in ('ai', 'library')),
  constraint english_daily_stories_questions_array check (jsonb_typeof(questions) = 'array'),
  constraint english_daily_stories_one_per_day unique (language_id, level, story_date)
);

create index if not exists english_daily_stories_recent_idx
  on public.english_daily_stories(language_id, level, story_date desc);

create table if not exists public.english_daily_story_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null references public.english_daily_stories(id) on delete cascade,
  correct integer not null default 0,
  total integer not null default 0,
  reading_seconds integer,
  wpm integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint english_daily_story_reads_counts check (correct >= 0 and total >= 0 and correct <= total),
  constraint english_daily_story_reads_wpm check (wpm is null or (wpm between 30 and 700)),
  constraint english_daily_story_reads_one unique (user_id, story_id)
);

create index if not exists english_daily_story_reads_user_idx
  on public.english_daily_story_reads(user_id, created_at desc);

alter table public.english_daily_stories enable row level security;
alter table public.english_daily_story_reads enable row level security;

revoke all on public.english_daily_stories from anon, authenticated;
revoke all on public.english_daily_story_reads from anon, authenticated;

-- Old stories are not needed forever: keep 180 days (their reads go with them).
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = 'english-daily-stories-prune-v1' loop
    perform cron.unschedule(v_job_id);
  end loop;
  -- 03:41 UTC, away from the reminder job (minute 7) and the AI ledger prune (03:23).
  perform cron.schedule(
    'english-daily-stories-prune-v1',
    '41 3 * * *',
    $cron$delete from public.english_daily_stories where story_date < (now() at time zone 'Asia/Tashkent')::date - 180;$cron$
  );
exception
  when undefined_table or invalid_schema_name then
    raise notice 'pg_cron is unavailable in this environment; daily story pruning not scheduled';
end
$$;
