-- Schood Company English: analytics an HR director shows the CEO.
--   company_level_requirements  required level per job role and department (competency framework)
--   company_risk_actions        who was nudged, assigned or snoozed from the at-risk list
--   company_training_spend      what the company paid for training, entered by HR
--   company_saved_views         saved custom reports, per workspace
--   company_insight_snapshots   frozen monthly numbers, so history does not change later
-- Adds to challenges (templates, teams, prize, final results, an active-days metric) and to
-- sessions (recurring series, trainer notes). Same lockdown as the core: RLS on, no anon or
-- authenticated grants, only the `company` Edge Function (service role) reads and writes.
-- None of these tables hold user_id: people appear only as member_id, which cascades.

create table if not exists public.company_level_requirements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  -- Null job role: any role. Null department: any department. Both null: the whole company.
  job_role text check (job_role is null or char_length(job_role) <= 40),
  department_id uuid references public.company_departments(id) on delete cascade,
  level text not null check (level in ('pre_a1','a1','a2','b1','b2','c1','c2')),
  -- Optional per-skill levels, e.g. {"speaking": "b2"}.
  skills jsonb not null default '{}'::jsonb check (jsonb_typeof(skills) = 'object'),
  due_date date,
  -- 'suggestion' stays on the row so the app can keep marking it as a Schood suggestion.
  source text not null default 'hr' check (source in ('hr','suggestion')),
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists company_level_requirements_scope_idx
  on public.company_level_requirements (org_id, coalesce(job_role, ''), coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.company_risk_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  kind text not null check (kind in ('assign','nudge','snooze')),
  reason text not null check (char_length(reason) <= 40),
  -- Tashkent day; the unique index below is what stops two tabs assigning twice.
  day date not null,
  -- For a snooze: hidden from the list until this Tashkent day.
  until date,
  actor uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists company_risk_actions_once_idx on public.company_risk_actions (org_id, member_id, kind, reason, day);
create index if not exists company_risk_actions_org_idx on public.company_risk_actions (org_id, day desc);

create table if not exists public.company_training_spend (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  spent_on date not null,
  amount numeric(16,2) not null check (amount > 0),
  currency text not null default 'UZS' check (currency in ('UZS','USD','EUR','RUB','KZT','KGS','TJS','TMT')),
  category text not null default 'other' check (category in ('schood','trainer','materials','other')),
  description text check (description is null or char_length(description) <= 300),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_training_spend_org_idx on public.company_training_spend (org_id, spent_on desc);

create table if not exists public.company_saved_views (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists company_saved_views_name_idx on public.company_saved_views (org_id, lower(name));

create table if not exists public.company_insight_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  kind text not null default 'monthly' check (kind in ('monthly','manual')),
  taken_on date not null,
  data jsonb not null,
  -- AI narratives by locale, written after the snapshot; the numbers themselves never change.
  narratives jsonb not null default '{}'::jsonb,
  source text not null default 'app' check (source in ('app','cron')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
-- One monthly snapshot per month; on-demand ones at most once per month per day.
create unique index if not exists company_insight_snapshots_monthly_idx on public.company_insight_snapshots (org_id, period) where kind = 'monthly';
create unique index if not exists company_insight_snapshots_manual_idx on public.company_insight_snapshots (org_id, period, taken_on) where kind = 'manual';
create index if not exists company_insight_snapshots_org_idx on public.company_insight_snapshots (org_id, period desc);

-- A snapshot's numbers cannot change, even through the service role.
create or replace function public.company_snapshot_frozen() returns trigger language plpgsql set search_path = public as $$
begin
  if new.data is distinct from old.data or new.period is distinct from old.period or new.taken_on is distinct from old.taken_on or new.kind is distinct from old.kind or new.org_id is distinct from old.org_id then
    raise exception 'company_insight_snapshots: a snapshot cannot be changed';
  end if;
  return new;
end;
$$;
revoke all on function public.company_snapshot_frozen() from public, anon, authenticated;

drop trigger if exists company_insight_snapshots_frozen on public.company_insight_snapshots;
create trigger company_insight_snapshots_frozen before update on public.company_insight_snapshots for each row execute function public.company_snapshot_frozen();

do $$
declare
  t text;
begin
  foreach t in array array['company_level_requirements','company_risk_actions','company_training_spend','company_saved_views','company_insight_snapshots'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  foreach t in array array['company_level_requirements','company_training_spend','company_saved_views'] loop
    if to_regprocedure('public.set_updated_at()') is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
    end if;
  end loop;
end
$$;

-- Challenge depth.
alter table public.company_challenges add column if not exists template text check (template is null or char_length(template) <= 40);
alter table public.company_challenges add column if not exists mode text not null default 'individual' check (mode in ('individual','teams'));
alter table public.company_challenges add column if not exists teams jsonb not null default '[]'::jsonb check (jsonb_typeof(teams) = 'array');
alter table public.company_challenges add column if not exists prize text check (prize is null or char_length(prize) <= 200);
-- Standings frozen when a challenge finishes, so winners stay winners.
alter table public.company_challenges add column if not exists final_results jsonb;
alter table public.company_challenges add column if not exists finished_at timestamptz;
alter table public.company_challenges drop constraint if exists company_challenges_metric_check;
alter table public.company_challenges add constraint company_challenges_metric_check check (metric in ('points','minutes','lessons','active_days'));

-- Session depth.
alter table public.company_sessions add column if not exists series_id uuid;
alter table public.company_sessions add column if not exists trainer_notes text check (trainer_notes is null or char_length(trainer_notes) <= 4000);
create index if not exists company_sessions_series_idx on public.company_sessions (org_id, series_id) where series_id is not null;

-- Levels in order, 1 (Pre-A1) to 7 (C2); null for anything else.
create or replace function public.company_level_rank(p_level text) returns integer language sql immutable set search_path = public as $$
  select array_position(array['pre_a1','a1','a2','b1','b2','c1','c2'], p_level);
$$;
revoke all on function public.company_level_rank(text) from public, anon, authenticated;
grant execute on function public.company_level_rank(text) to service_role;

-- The numbers of one workspace for one finished Tashkent month, in the shape the app
-- builds in supabase/functions/company/insights/executive.ts (executiveData). The two are kept
-- equal by company-insights2.integration.sql and the route tests: change both together.
create or replace function public.company_snapshot_data(p_org uuid, p_period text, p_today date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month date := (p_period || '-01')::date;
  v_start timestamptz := (v_month::timestamp) at time zone 'Asia/Tashkent';
  v_end timestamptz := ((v_month + interval '1 month')::timestamp) at time zone 'Asia/Tashkent';
  v_today date := coalesce(p_today, (now() at time zone 'Asia/Tashkent')::date);
  v_last date := least((v_month + interval '1 month - 1 day')::date, v_today);
  v_sharing uuid[];
  v_summary jsonb;
  v_result jsonb;
begin
  select coalesce(array_agg(id), '{}') into v_sharing from public.company_members where org_id = p_org and status = 'active' and consent_at is not null;
  v_summary := public.company_activity_summary(p_org, v_start, v_end, v_sharing);

  with base as (
    select m.*, (m.role not in ('owner','admin')) as learner,
      t.id as to_id, t.overall_level as to_level, t.overall_score as to_score,
      f.id as from_id, f.overall_level as from_level,
      b.overall_level as first_level, b.id as first_id
    from public.company_members m
    left join lateral (select a.id, a.overall_level, a.overall_score from public.company_attempts a
      where a.org_id = p_org and a.member_id = m.id and a.status = 'graded' and a.graded_at < v_end and public.company_level_rank(a.overall_level) is not null
      order by a.graded_at desc, a.id desc limit 1) t on true
    left join lateral (select a.id, a.overall_level from public.company_attempts a
      where a.org_id = p_org and a.member_id = m.id and a.status = 'graded' and a.graded_at < v_start and public.company_level_rank(a.overall_level) is not null
      order by a.graded_at desc, a.id desc limit 1) f on true
    left join lateral (select a.id, a.overall_level from public.company_attempts a
      where a.org_id = p_org and a.member_id = m.id and a.status = 'graded' and a.graded_at >= v_start and a.graded_at < v_end and public.company_level_rank(a.overall_level) is not null
      order by a.graded_at asc, a.id asc limit 1) b on true
    where m.org_id = p_org and m.status = 'active'
  ),
  levelled as (
    select b.*,
      coalesce(b.to_level, case when b.level_at is not null and b.level_at < v_end then b.level end) as level_then,
      coalesce(b.to_score, case when b.level_at is not null and b.level_at < v_end then
        coalesce(b.level_score, (array[8,24,40,56,72,86,96])[public.company_level_rank(b.level)]) end) as score_then
    from base b
  ),
  with_requirement as (
    select l.*, r.level as req_level, r.skills as req_skills, r.due_date as req_due, r.id as req_id
    from levelled l
    left join lateral (select q.* from public.company_level_requirements q
      where q.org_id = p_org and (q.job_role is null or q.job_role = l.job_role) and (q.department_id is null or q.department_id = l.department_id)
      order by (q.job_role is not null and q.department_id is not null) desc, (q.department_id is not null) desc, (q.job_role is not null) desc limit 1) r on true
  ),
  judged as (
    select w.*,
      (w.learner and w.req_id is not null) as counted,
      (w.learner and w.req_id is not null and coalesce(public.company_level_rank(w.level_then) >= public.company_level_rank(w.req_level), false)
        and not exists (select 1 from jsonb_each_text(w.req_skills) need
          where coalesce(public.company_level_rank((select a.skill_results -> need.key ->> 'level' from public.company_attempts a
              where a.org_id = p_org and a.member_id = w.id and a.status = 'graded' and a.graded_at < v_end and a.skill_results ? need.key
              order by a.graded_at desc, a.id desc limit 1)) >= public.company_level_rank(need.value), false) = false)) as met,
      s.minutes, s.events,
      case
        when w.to_id is null then 'none'
        when coalesce(w.from_id, w.first_id) = w.to_id then 'same_start'
        when public.company_level_rank(w.to_level) > public.company_level_rank(coalesce(w.from_level, w.first_level)) then 'up'
        when public.company_level_rank(w.to_level) < public.company_level_rank(coalesce(w.from_level, w.first_level)) then 'down'
        else 'same'
      end as moved,
      greatest(0, coalesce(public.company_level_rank(w.to_level) - public.company_level_rank(coalesce(w.from_level, w.first_level)), 0)) as gained
    from with_requirement w
    left join lateral (select (e ->> 'minutes')::bigint as minutes, (e ->> 'events')::bigint as events
      from jsonb_array_elements(v_summary -> 'members') e where (e ->> 'member_id')::uuid = w.id limit 1) s on true
  ),
  dept as (
    select j.department_id as id, d.name, count(*) as people,
      count(*) filter (where public.company_level_rank(j.level_then) is not null) as tested,
      count(*) filter (where j.counted) as with_requirement,
      count(*) filter (where j.met) as meets,
      count(*) filter (where coalesce(j.events, 0) > 0) as active,
      coalesce(sum(j.minutes), 0) as minutes,
      count(*) filter (where j.moved = 'up') as moved_up
    from judged j left join public.company_departments d on d.id = j.department_id
    group by j.department_id, d.name
  ),
  money as (
    select currency, sum(amount) as total from public.company_training_spend
    where org_id = p_org and spent_on >= v_month and spent_on < (v_month + interval '1 month')::date group by currency
  ),
  all_departments as (
    -- Departments with nobody in them still get a row, as they do in the app.
    select d.id, d.name, coalesce(x.people, 0) as people, coalesce(x.tested, 0) as tested, coalesce(x.with_requirement, 0) as with_requirement,
      coalesce(x.meets, 0) as meets, coalesce(x.active, 0) as active, coalesce(x.minutes, 0) as minutes, coalesce(x.moved_up, 0) as moved_up
    from public.company_departments d left join dept x on x.id = d.id where d.org_id = p_org
    union all
    select null, null, x.people, x.tested, x.with_requirement, x.meets, x.active, x.minutes, x.moved_up from dept x where x.id is null
  ),
  scored as (select avg(score_then) as score from judged where score_then is not null)
  select jsonb_build_object(
    'version', 1,
    'period', jsonb_build_object('month', p_period, 'from', v_month, 'to', v_last),
    'people', jsonb_build_object(
      'people', (select count(*) from judged), 'learners', (select count(*) from judged where learner),
      'sharing', (select count(*) from judged where consent_at is not null),
      'tested', (select count(*) from judged where public.company_level_rank(level_then) is not null)),
    'levels', jsonb_build_object(
      'pre_a1', (select count(*) from judged where level_then = 'pre_a1'), 'a1', (select count(*) from judged where level_then = 'a1'),
      'a2', (select count(*) from judged where level_then = 'a2'), 'b1', (select count(*) from judged where level_then = 'b1'),
      'b2', (select count(*) from judged where level_then = 'b2'), 'c1', (select count(*) from judged where level_then = 'c1'),
      'c2', (select count(*) from judged where level_then = 'c2'),
      'none', (select count(*) from judged where learner and public.company_level_rank(level_then) is null)),
    'avg_score', (select round(score::numeric, 1) from scored),
    'compliance', jsonb_build_object(
      'with_requirement', (select count(*) from judged where counted), 'meets', (select count(*) from judged where met),
      'overdue', (select count(*) from judged where counted and not met and req_due is not null and req_due < v_last)),
    'activity', jsonb_build_object(
      'active', (select count(*) from judged where coalesce(events, 0) > 0),
      'minutes', (select coalesce(sum(minutes), 0) from judged),
      'lessons', (select coalesce(sum((e ->> 'lessons')::bigint), 0) from jsonb_array_elements(v_summary -> 'members') e)),
    'movement', jsonb_build_object(
      'up', (select count(*) from judged where moved = 'up'), 'down', (select count(*) from judged where moved = 'down'),
      'same', (select count(*) from judged where moved = 'same' or (moved = 'same_start' and from_id is not null)),
      'first', (select count(*) from judged where to_id is not null and from_id is null),
      'levels_gained', (select coalesce(sum(gained), 0) from judged)),
    'hiring', jsonb_build_object(
      'graded', (select count(*) from public.company_attempts a where a.org_id = p_org and a.member_id is null and a.status = 'graded' and a.graded_at >= v_start and a.graded_at < v_end),
      'shortlisted', (select count(*) from public.company_attempts a where a.org_id = p_org and a.member_id is null and a.status = 'graded' and a.decision = 'shortlist' and a.graded_at >= v_start and a.graded_at < v_end)),
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'people', people, 'tested', tested, 'with_requirement', with_requirement,
      'meets', meets, 'active', active, 'minutes', minutes, 'moved_up', moved_up) order by name nulls last) from all_departments), '[]'::jsonb),
    'spend', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'total', total) order by currency) from money), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.company_snapshot_data(uuid, text, date) from public, anon, authenticated;
grant execute on function public.company_snapshot_data(uuid, text, date) to service_role;

-- Saves last month's snapshot for every open workspace that has not got one. Safe to run often.
create or replace function public.company_take_monthly_snapshots(p_at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (p_at at time zone 'Asia/Tashkent')::date;
  v_period text := to_char((date_trunc('month', v_today) - interval '1 day')::date, 'YYYY-MM');
  v_org record;
  v_count integer := 0;
  v_added integer;
begin
  for v_org in
    select o.id from public.company_orgs o
    where o.status in ('pilot','active')
      -- A workspace created after the month ended has nothing to report for it.
      and o.created_at < (date_trunc('month', v_today)::timestamp at time zone 'Asia/Tashkent')
      and not exists (select 1 from public.company_insight_snapshots s where s.org_id = o.id and s.period = v_period and s.kind = 'monthly')
  loop
    insert into public.company_insight_snapshots (org_id, period, kind, taken_on, data, source)
    values (v_org.id, v_period, 'monthly', v_today, public.company_snapshot_data(v_org.id, v_period, v_today), 'cron')
    on conflict do nothing;
    get diagnostics v_added = row_count;
    v_count := v_count + v_added;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.company_take_monthly_snapshots(timestamptz) from public, anon, authenticated;
grant execute on function public.company_take_monthly_snapshots(timestamptz) to service_role;

-- Run nightly where pg_cron is installed (03:40 Tashkent = 22:40 UTC). Nightly rather than monthly
-- so a missed run catches up; it does nothing once the month's snapshot exists.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'company-monthly-snapshots') then
      perform cron.unschedule('company-monthly-snapshots');
    end if;
    perform cron.schedule('company-monthly-snapshots', '40 22 * * *', 'select public.company_take_monthly_snapshots()');
  end if;
end
$$;
