-- Schood Company English: training, second release. Additive and idempotent.
-- The company's own lessons and courses (draft, publish, versions), custom
-- role-play scenarios, learning paths, track and course certificates, saved
-- writing templates and a small counter for public certificate checks. Like every
-- company_* table these are reached only through the `company` Edge Function with
-- the service role: RLS on, no anon/authenticated access.

-- A company lesson. HR edits `draft`; learners only ever see `published`, the content
-- of the latest version. A learner's progress is keyed by the lesson's id, so it
-- survives every edit and every new version.
create table if not exists public.company_lessons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  title jsonb not null default '{}'::jsonb check (jsonb_typeof(title) = 'object'),
  level text not null default 'b1' check (level in ('pre_a1','a1','a2','b1','b2','c1','c2')),
  draft jsonb not null default '{}'::jsonb check (jsonb_typeof(draft) = 'object'),
  published jsonb,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  -- Bumped on every saved edit, so two tabs cannot overwrite each other unnoticed.
  revision integer not null default 1 check (revision >= 1),
  published_version integer not null default 0 check (published_version >= 0),
  published_revision integer not null default 0 check (published_revision >= 0),
  published_at timestamptz,
  -- An AI draft is published only after a person has approved it.
  source text not null default 'manual' check (source in ('manual','ai')),
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_lessons_org_idx on public.company_lessons (org_id, updated_at desc);

-- One immutable row per publish: what the lesson said at that version.
create table if not exists public.company_lesson_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  lesson_id uuid not null references public.company_lessons(id) on delete cascade,
  version integer not null check (version >= 1),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  published_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (lesson_id, version)
);

-- A company course: an ordered list of company lessons. `published` is the snapshot
-- learners see ({title, summary, job_role, lesson_ids}); the columns are the draft.
create table if not exists public.company_courses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  title jsonb not null default '{}'::jsonb check (jsonb_typeof(title) = 'object'),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  job_role text check (job_role is null or char_length(job_role) <= 60),
  lesson_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(lesson_ids) = 'array'),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  revision integer not null default 1 check (revision >= 1),
  published_version integer not null default 0 check (published_version >= 0),
  published_revision integer not null default 0 check (published_revision >= 0),
  published jsonb,
  published_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_courses_org_idx on public.company_courses (org_id, status);

-- A role-play the company writes itself. Sessions keep a copy of the scenario they
-- started from, so editing it never changes a practice already under way.
create table if not exists public.company_scenarios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  title jsonb not null default '{}'::jsonb check (jsonb_typeof(title) = 'object'),
  goal jsonb not null default '{}'::jsonb check (jsonb_typeof(goal) = 'object'),
  persona text not null default '' check (char_length(persona) <= 2000),
  learner_role text not null default '' check (char_length(learner_role) <= 600),
  setting text not null default '' check (char_length(setting) <= 1000),
  opening text not null default '' check (char_length(opening) <= 600),
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  -- The success criteria the AI feedback checks one by one.
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_scenarios_org_idx on public.company_scenarios (org_id, status);

-- Role-play depth: chosen difficulty, hints used, the scenario copy, and which session this replays.
alter table public.company_roleplay_sessions add column if not exists difficulty text;
alter table public.company_roleplay_sessions drop constraint if exists company_roleplay_sessions_difficulty_check;
alter table public.company_roleplay_sessions add constraint company_roleplay_sessions_difficulty_check check (difficulty is null or difficulty in ('easy','medium','hard'));
alter table public.company_roleplay_sessions add column if not exists hints integer not null default 0;
alter table public.company_roleplay_sessions drop constraint if exists company_roleplay_sessions_hints_check;
alter table public.company_roleplay_sessions add constraint company_roleplay_sessions_hints_check check (hints between 0 and 100);
alter table public.company_roleplay_sessions add column if not exists scenario jsonb;
alter table public.company_roleplay_sessions add column if not exists replay_of uuid references public.company_roleplay_sessions(id) on delete set null;
create index if not exists company_roleplay_sessions_scenario_idx on public.company_roleplay_sessions (member_id, scenario_code, created_at desc);
create index if not exists company_roleplay_sessions_org_scenario_idx on public.company_roleplay_sessions (org_id, scenario_code);

-- A learner's own saved email or message templates. Personal: HR never sees them.
create table if not exists public.company_writing_snippets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(body) between 1 and 6000),
  tone text check (tone is null or tone in ('formal','friendly','firm')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists company_writing_snippets_title_key on public.company_writing_snippets (member_id, lower(btrim(title)));

-- A learning path for one person or one department: ordered steps across built-in
-- tracks and company courses. One active path per person and per department.
create table if not exists public.company_learning_paths (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  member_id uuid references public.company_members(id) on delete cascade,
  department_id uuid references public.company_departments(id) on delete cascade,
  target_level text check (target_level is null or target_level in ('pre_a1','a1','a2','b1','b2','c1','c2')),
  due_date date,
  -- [{kind: 'track'|'course', code, stage?}]
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((member_id is null) <> (department_id is null))
);
create index if not exists company_learning_paths_org_idx on public.company_learning_paths (org_id, status);
create unique index if not exists company_learning_paths_member_key on public.company_learning_paths (member_id) where status = 'active' and member_id is not null;
create unique index if not exists company_learning_paths_department_key on public.company_learning_paths (department_id) where status = 'active' and department_id is not null;

-- A certificate of completion for a track or a course, with a public check code.
-- Holder name and title are kept as they were when it was earned.
create table if not exists public.company_training_certificates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  kind text not null check (kind in ('track','course')),
  ref_code text not null check (char_length(ref_code) between 1 and 80),
  title jsonb not null default '{}'::jsonb check (jsonb_typeof(title) = 'object'),
  holder_name text check (holder_name is null or char_length(holder_name) <= 200),
  lessons integer not null default 0 check (lessons >= 0),
  score integer check (score is null or score between 0 and 100),
  code text not null check (char_length(code) between 6 and 16),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (member_id, kind, ref_code)
);
create unique index if not exists company_training_certificates_code_key on public.company_training_certificates (code);
create index if not exists company_training_certificates_org_idx on public.company_training_certificates (org_id, issued_at desc);

-- How often an address hit a public route today. ip_hash is already salted with the day.
create table if not exists public.company_training_hits (
  ip_hash text not null,
  route text not null,
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (ip_hash, route)
);
create index if not exists company_training_hits_created_idx on public.company_training_hits (created_at);

do $$
declare
  t text;
begin
  foreach t in array array['company_lessons','company_lesson_versions','company_courses','company_scenarios','company_writing_snippets','company_learning_paths','company_training_certificates','company_training_hits'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  foreach t in array array['company_lessons','company_courses','company_scenarios','company_writing_snippets','company_learning_paths'] loop
    if to_regprocedure('public.set_updated_at()') is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
    end if;
  end loop;
end
$$;

-- The nightly close of role-plays nobody finished (first made in the training migration):
-- a replay's copied replies, marked "replayed", earn nothing. Everything else is as before.
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
  -- updated_at here is still the time of the last reply, and the activity is dated then too.
  with closed as (
    update public.company_roleplay_sessions
       set status = 'ended', ended_at = coalesce(ended_at, now()),
           minutes = least(30, greatest(1, round(extract(epoch from updated_at - created_at) / 60)::integer))
     where status = 'active' and created_at < now() - interval '1 day'
    returning org_id, member_id, user_id, scenario_code, minutes, created_at,
      greatest(0, learner_turns - (select count(*)::integer from jsonb_array_elements(turns) as turn where turn->>'role' = 'learner' and turn->>'replayed' = 'true')) as fresh_turns
  )
  insert into public.company_activity (org_id, member_id, user_id, kind, minutes, points, ref, created_at)
  select org_id, member_id, user_id, 'roleplay', minutes, 5 + fresh_turns * 2, scenario_code, created_at + make_interval(mins => minutes)
    from closed
   where fresh_turns > 0;
  return v_drafts;
end;
$$;
revoke all on function public.company_purge_training_drafts() from public, anon, authenticated;
grant execute on function public.company_purge_training_drafts() to service_role;

-- Counts one hit and says whether it is within today's limit. Yesterday's rows go as it runs.
create or replace function public.company_training_hit(p_ip_hash text, p_route text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
begin
  delete from public.company_training_hits where created_at < now() - interval '2 days';
  insert into public.company_training_hits (ip_hash, route, hits) values (p_ip_hash, p_route, 1)
  on conflict (ip_hash, route) do update set hits = public.company_training_hits.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;
revoke all on function public.company_training_hit(text, text, integer) from public, anon, authenticated;
grant execute on function public.company_training_hit(text, text, integer) to service_role;

-- Closing an account erases these records too (same additive registry pattern as the core migration).
do $$
declare
  relations text[];
  wanted text[] := array['company_writing_snippets', 'company_training_certificates'];
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
