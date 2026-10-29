-- Schood Company English: training by job role.
-- AI role-play sessions, writing checks (deleted after 90 days) and each
-- company's own glossary. Lesson progress and assignments live in the core
-- tables (company_lesson_progress, company_assignments). Like every company_*
-- table these are reached only through the `company` Edge Function with the
-- service role: RLS on, no anon/authenticated access.

create table if not exists public.company_roleplay_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  scenario_code text not null check (char_length(scenario_code) between 1 and 120),
  track_code text not null check (char_length(track_code) between 1 and 60),
  status text not null default 'active' check (status in ('active','ended')),
  -- [{role: 'ai'|'learner', text, at, mode?, tip?}]; the AI opens, the learner has at most 12 turns.
  turns jsonb not null default '[]'::jsonb check (jsonb_typeof(turns) = 'array'),
  learner_turns integer not null default 0 check (learner_turns between 0 and 12),
  locale text not null default 'ru' check (locale in ('en','ru','uz')),
  -- {score, summary, goal_met, good_phrases, better_phrases, checklist, next_step, locale}
  feedback jsonb,
  score integer check (score is null or score between 0 and 100),
  minutes integer not null default 0 check (minutes between 0 and 600),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_roleplay_sessions_member_idx on public.company_roleplay_sessions (member_id, created_at desc);
create index if not exists company_roleplay_sessions_org_idx on public.company_roleplay_sessions (org_id, created_at desc);

-- A learner's work email or message and the AI's corrections. Kept 90 days.
create table if not exists public.company_writing_checks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  template_code text check (template_code is null or char_length(template_code) <= 120),
  draft text not null check (char_length(draft) between 1 and 5000),
  -- {corrected, score, summary, tone, tone_notes, changes, checklist, locale}
  result jsonb not null default '{}'::jsonb,
  score integer check (score is null or score between 0 and 100),
  locale text not null default 'ru' check (locale in ('en','ru','uz')),
  created_at timestamptz not null default now()
);
create index if not exists company_writing_checks_member_idx on public.company_writing_checks (member_id, created_at desc);
create index if not exists company_writing_checks_created_idx on public.company_writing_checks (created_at);

-- The company's own terms (products, departments, procedures) for flashcards and quizzes.
create table if not exists public.company_glossary_terms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  term text not null check (char_length(btrim(term)) between 1 and 120),
  meaning text not null check (char_length(btrim(meaning)) between 1 and 400),
  ru text check (ru is null or char_length(ru) <= 200),
  uz text check (uz is null or char_length(uz) <= 200),
  example text check (example is null or char_length(example) <= 400),
  -- Null: everyone in the company; otherwise one department's terms.
  department_id uuid references public.company_departments(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists company_glossary_terms_term_key on public.company_glossary_terms (org_id, lower(btrim(term)));

-- Lookups the training plan and My English make often.
create index if not exists company_lesson_progress_member_idx on public.company_lesson_progress (member_id, updated_at desc);
create index if not exists company_assignments_member_idx on public.company_assignments (member_id) where member_id is not null;
create index if not exists company_assignments_department_idx on public.company_assignments (department_id) where department_id is not null;

do $$
declare
  t text;
begin
  foreach t in array array['company_roleplay_sessions','company_writing_checks','company_glossary_terms'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  foreach t in array array['company_roleplay_sessions','company_glossary_terms'] loop
    if to_regprocedure('public.set_updated_at()') is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
    end if;
  end loop;
end
$$;

-- Deletes writing drafts older than 90 days (the app says so on the writing page)
-- and role-plays nobody finished within a day. Returns how many drafts went.
-- The function also purges per workspace on every new check; this catches the rest.
create or replace function public.company_purge_training_drafts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drafts integer;
begin
  delete from public.company_writing_checks where created_at < now() - interval '90 days';
  get diagnostics v_drafts = row_count;
  update public.company_roleplay_sessions
     set status = 'ended', ended_at = coalesce(ended_at, now())
   where status = 'active' and created_at < now() - interval '1 day';
  return v_drafts;
end;
$$;
revoke all on function public.company_purge_training_drafts() from public, anon, authenticated;
grant execute on function public.company_purge_training_drafts() to service_role;

-- Run the purge nightly where pg_cron is installed (03:10 Tashkent = 22:10 UTC).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'company-purge-training-drafts') then
      perform cron.unschedule('company-purge-training-drafts');
    end if;
    perform cron.schedule('company-purge-training-drafts', '10 22 * * *', 'select public.company_purge_training_drafts()');
  end if;
end
$$;

-- Closing an account erases these records too (same additive registry pattern as the core migration).
do $$
declare
  relations text[];
  wanted text[] := array['company_roleplay_sessions', 'company_writing_checks'];
  relation_name text;
  guard_installed boolean := to_regprocedure('public.guard_closed_personal_record()') is not null;
begin
  if to_regprocedure('public.account_personal_erasure_tables()') is null then
    raise notice 'account_personal_erasure_tables() is not installed; erasure registry not extended';
    return;
  end if;
  relations := public.account_personal_erasure_tables();
  foreach relation_name in array wanted loop
    if to_regclass(format('public.%I', relation_name)) is null then
      continue;
    end if;
    if not (relation_name = any(relations)) then
      relations := relations || relation_name;
      if guard_installed then
        execute format('drop trigger if exists account_closed_personal_guard on public.%I', relation_name);
        execute format(
          'create trigger account_closed_personal_guard before insert or update on public.%I for each row execute function public.guard_closed_personal_record(%L)',
          relation_name, 'user_id'
        );
      end if;
    end if;
  end loop;
  execute format(
    'create or replace function public.account_personal_erasure_tables() returns text[] language sql immutable set search_path=pg_catalog,public as %L',
    format('select %L::text[];', relations::text)
  );
end
$$;
