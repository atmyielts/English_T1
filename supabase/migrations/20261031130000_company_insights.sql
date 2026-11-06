-- Schood Company English: insights (dashboards, reports, team challenges,
-- live sessions). Adds challenges, sessions and attendance, plus one
-- aggregate over company_activity so dashboards never pull raw event rows.
-- Same lockdown as the core: RLS on, no anon/authenticated grants, only the
-- `company` Edge Function (service role) reads and writes.

-- Team challenges: a window, a metric, and everyone or chosen departments.
create table if not exists public.company_challenges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text check (description is null or char_length(description) <= 600),
  metric text not null default 'points' check (metric in ('points','minutes','lessons')),
  -- Tashkent calendar days, both inclusive.
  starts_on date not null,
  ends_on date not null,
  -- Empty means the whole company.
  department_ids uuid[] not null default '{}'::uuid[],
  -- Set when HR ends the challenge early; standings stop counting then.
  ended_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_challenges_dates check (ends_on >= starts_on and ends_on - starts_on < 92)
);
create index if not exists company_challenges_org_idx on public.company_challenges (org_id, ends_on desc);

-- Live classes and workshops.
create table if not exists public.company_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  kind text not null default 'class' check (kind in ('class','workshop')),
  trainer text check (trainer is null or char_length(trainer) <= 120),
  starts_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 10 and 480),
  location text check (location is null or char_length(location) <= 200),
  link text check (link is null or (char_length(link) <= 500 and link ~ '^https://')),
  -- Who is invited: departments and/or people; both empty means everyone.
  department_ids uuid[] not null default '{}'::uuid[],
  member_ids uuid[] not null default '{}'::uuid[],
  notes text check (notes is null or char_length(notes) <= 1000),
  status text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_sessions_org_idx on public.company_sessions (org_id, starts_at);

-- Who was there. Marking someone present also logs `session` activity.
create table if not exists public.company_session_attendance (
  session_id uuid not null references public.company_sessions(id) on delete cascade,
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  marked_by uuid references public.users(id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (session_id, member_id)
);
create index if not exists company_session_attendance_member_idx on public.company_session_attendance (member_id, marked_at desc);

-- Session activity is found by its ref when attendance is taken back.
create index if not exists company_activity_ref_idx on public.company_activity (org_id, ref) where ref is not null;

do $$
declare
  t text;
begin
  foreach t in array array['company_challenges','company_sessions','company_session_attendance'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  foreach t in array array['company_challenges','company_sessions'] loop
    if to_regprocedure('public.set_updated_at()') is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
    end if;
  end loop;
end
$$;

-- Learning activity of chosen members in [p_from, p_to), as one JSON value:
--   members: per person minutes, points, lessons, events, active days, last activity
--   weeks:   per Tashkent week (Monday) minutes, points, events, distinct learners
--   kinds:   per activity kind events and minutes
-- Only members of the workspace who share their progress (consent_at) count.
create or replace function public.company_activity_summary(p_org uuid, p_from timestamptz, p_to timestamptz, p_members uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with events as (
    select a.member_id, a.kind, a.minutes, a.points, a.created_at,
           (a.created_at at time zone 'Asia/Tashkent')::date as day
    from public.company_activity a
    join public.company_members m on m.id = a.member_id
    where a.org_id = p_org
      and m.org_id = p_org
      and m.consent_at is not null
      and a.created_at >= p_from
      and a.created_at < p_to
      and a.member_id = any(coalesce(p_members, '{}'::uuid[]))
  ),
  per_member as (
    select member_id, sum(minutes)::bigint as minutes, sum(points)::bigint as points,
           count(*) filter (where kind = 'lesson') as lessons, count(*) as events,
           count(distinct day) as days, max(created_at) as last_at
    from events group by member_id
  ),
  per_week as (
    select (day - ((extract(isodow from day)::int - 1)))::date as week,
           sum(minutes)::bigint as minutes, sum(points)::bigint as points, count(*) as events, count(distinct member_id) as learners
    from events group by 1
  ),
  per_kind as (
    select kind, count(*) as events, sum(minutes)::bigint as minutes from events group by kind
  )
  select jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object('member_id', member_id, 'minutes', minutes, 'points', points, 'lessons', lessons,
      'events', events, 'days', days, 'last_at', last_at)) from per_member), '[]'::jsonb),
    'weeks', coalesce((select jsonb_agg(jsonb_build_object('week', week, 'minutes', minutes, 'points', points, 'events', events, 'learners', learners) order by week) from per_week), '[]'::jsonb),
    'kinds', coalesce((select jsonb_object_agg(kind, jsonb_build_object('events', events, 'minutes', minutes)) from per_kind), '{}'::jsonb)
  );
$$;

revoke all on function public.company_activity_summary(uuid, timestamptz, timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.company_activity_summary(uuid, timestamptz, timestamptz, uuid[]) to service_role;

-- Closing an account erases the person's attendance too (same additive
-- registry pattern as the core migration).
do $$
declare
  relations text[];
  wanted text[] := array['company_session_attendance'];
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
