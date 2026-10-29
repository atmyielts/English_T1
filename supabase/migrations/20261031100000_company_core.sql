-- Schood Company English (company.schood.online): the shared core.
-- Company workspaces, departments, people, invitations, sales leads, audit,
-- assessments and attempts, learning progress, assignments, one activity log
-- and per-workspace AI usage. Every table is reached only through the
-- `company` Edge Function with the service role: RLS is on and there are no
-- anon/authenticated policies.
-- A learning seat unlocks Schood English "All Skills" through an ordinary
-- entitlement row (source 'company'), so every English app sees it unchanged.

create table if not exists public.company_orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  industry text not null default 'other',
  size_band text not null default '1-50' check (size_band in ('1-50','51-200','201-1000','1000+')),
  city text check (city is null or char_length(city) <= 80),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 40),
  billing_email text check (billing_email is null or char_length(billing_email) <= 200),
  tax_id text check (tax_id is null or char_length(tax_id) <= 40),
  status text not null default 'pilot' check (status in ('pilot','active','suspended','closed')),
  -- Learning seats (each unlocks Schood English); a pilot has none.
  seats_limit integer not null default 0 check (seats_limit >= 0),
  -- Test attempts (hiring + placement + progress) allowed; null = unlimited.
  tests_limit integer default 10 check (tests_limit is null or tests_limit >= 0),
  tests_used integer not null default 0 check (tests_used >= 0),
  contract_ends_at timestamptz,
  -- Per-workspace preferences: default locale, AI daily cap, branding text.
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_departments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create unique index if not exists company_departments_name_key on public.company_departments (org_id, lower(btrim(name)));

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  -- Null until the invited person signs in and accepts.
  user_id uuid references public.users(id) on delete set null,
  email text check (email is null or char_length(email) <= 200),
  full_name text check (full_name is null or char_length(full_name) <= 120),
  role text not null default 'employee' check (role in ('owner','admin','manager','employee')),
  department_id uuid references public.company_departments(id) on delete set null,
  job_role text not null default 'general',
  status text not null default 'invited' check (status in ('invited','active','removed')),
  seat boolean not null default false,
  level text check (level is null or level in ('pre_a1','a1','a2','b1','b2','c1','c2')),
  level_score numeric(5,2),
  level_source text check (level_source is null or level_source in ('placement','progress','hiring','manual')),
  level_at timestamptz,
  target_level text check (target_level is null or target_level in ('pre_a1','a1','a2','b1','b2','c1','c2')),
  target_date date,
  -- When the employee agreed to share their English progress with the company.
  consent_at timestamptz,
  invited_by uuid references public.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists company_members_user_key on public.company_members (org_id, user_id) where user_id is not null;
create unique index if not exists company_members_email_key on public.company_members (org_id, lower(email)) where email is not null and status <> 'removed';
create index if not exists company_members_user_idx on public.company_members (user_id) where user_id is not null;
create index if not exists company_members_org_idx on public.company_members (org_id, status);

create table if not exists public.company_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  -- A personal invite names one member row; a team link has none.
  member_id uuid references public.company_members(id) on delete cascade,
  kind text not null check (kind in ('personal','link')),
  token_hash text not null unique,
  role text not null default 'employee' check (role in ('admin','manager','employee')),
  department_id uuid references public.company_departments(id) on delete set null,
  job_role text not null default 'general',
  max_uses integer check (max_uses is null or max_uses > 0),
  uses integer not null default 0,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists company_invites_org_idx on public.company_invites (org_id);

-- Demo requests from the public landing page.
create table if not exists public.company_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  company text not null check (char_length(company) between 1 and 160),
  phone text check (phone is null or char_length(phone) <= 40),
  email text check (email is null or char_length(email) <= 200),
  size_band text,
  industry text,
  need text check (need is null or char_length(need) <= 2000),
  locale text,
  status text not null default 'new' check (status in ('new','contacted','pilot','won','lost')),
  notes text check (notes is null or char_length(notes) <= 4000),
  org_id uuid references public.company_orgs(id) on delete set null,
  source text,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_leads_created_idx on public.company_leads (created_at desc);

create table if not exists public.company_audit (
  id bigint generated always as identity primary key,
  org_id uuid references public.company_orgs(id) on delete cascade,
  actor uuid,
  action text not null,
  target text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists company_audit_org_idx on public.company_audit (org_id, created_at desc);

-- Tests a company runs: hiring links for candidates, placement and progress checks for staff.
create table if not exists public.company_assessments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  kind text not null check (kind in ('hiring','placement','progress')),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  job_role text not null default 'general',
  skills text[] not null default array['grammar','vocabulary','reading','listening']::text[],
  min_level text check (min_level is null or min_level in ('pre_a1','a1','a2','b1','b2','c1','c2')),
  time_limit_minutes integer not null default 40 check (time_limit_minutes between 5 and 180),
  status text not null default 'open' check (status in ('draft','open','closed')),
  -- Open link for candidates (/t/<token>); null when only personal invites are used.
  link_token_hash text unique,
  max_attempts integer check (max_attempts is null or max_attempts > 0),
  closes_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_assessments_org_idx on public.company_assessments (org_id, kind, created_at desc);

create table if not exists public.company_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  assessment_id uuid not null references public.company_assessments(id) on delete cascade,
  -- Staff attempts name the member and user; candidate attempts carry contact details.
  member_id uuid references public.company_members(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  candidate_name text check (candidate_name is null or char_length(candidate_name) <= 120),
  candidate_email text check (candidate_email is null or char_length(candidate_email) <= 200),
  candidate_phone text check (candidate_phone is null or char_length(candidate_phone) <= 40),
  -- Lets a candidate resume without an account.
  access_token_hash text unique,
  status text not null default 'started' check (status in ('started','submitted','graded','expired')),
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  graded_at timestamptz,
  -- Served items without answer keys, the learner's answers, and the scoring.
  items jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  overall_level text check (overall_level is null or overall_level in ('pre_a1','a1','a2','b1','b2','c1','c2')),
  overall_score numeric(5,2),
  skill_results jsonb not null default '{}'::jsonb,
  ai_feedback jsonb not null default '{}'::jsonb,
  integrity jsonb not null default '{}'::jsonb,
  decision text check (decision is null or decision in ('shortlist','hold','reject')),
  decision_by uuid references public.users(id) on delete set null,
  notes text check (notes is null or char_length(notes) <= 4000),
  certificate_code text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_attempts_assessment_idx on public.company_attempts (assessment_id, created_at desc);
create index if not exists company_attempts_org_idx on public.company_attempts (org_id, status);
create index if not exists company_attempts_member_idx on public.company_attempts (member_id) where member_id is not null;

-- Job-role track lessons a member has worked through.
create table if not exists public.company_lesson_progress (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  track_code text not null,
  lesson_code text not null,
  status text not null default 'started' check (status in ('started','completed')),
  score integer check (score is null or score between 0 and 100),
  minutes integer not null default 0 check (minutes >= 0),
  attempts integer not null default 0 check (attempts >= 0),
  data jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, lesson_code)
);
create index if not exists company_lesson_progress_org_idx on public.company_lesson_progress (org_id, completed_at desc);

-- What HR asks of a department or a person: a track, a target level, a due date.
create table if not exists public.company_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  track_code text,
  target_level text check (target_level is null or target_level in ('pre_a1','a1','a2','b1','b2','c1','c2')),
  due_date date,
  department_id uuid references public.company_departments(id) on delete cascade,
  member_id uuid references public.company_members(id) on delete cascade,
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'active' check (status in ('active','done','cancelled')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (track_code is not null or target_level is not null)
);
create index if not exists company_assignments_org_idx on public.company_assignments (org_id, status);

-- One row per learning or testing event, for dashboards, reports and team challenges.
create table if not exists public.company_activity (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  member_id uuid references public.company_members(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  kind text not null check (kind in ('lesson','roleplay','writing','test','glossary','session','english')),
  minutes integer not null default 0 check (minutes between 0 and 600),
  points integer not null default 0 check (points between 0 and 10000),
  ref text,
  created_at timestamptz not null default now()
);
create index if not exists company_activity_org_idx on public.company_activity (org_id, created_at desc);
create index if not exists company_activity_member_idx on public.company_activity (member_id, created_at desc);

-- AI calls per workspace per Tashkent day, capped by settings.ai_daily_limit.
create table if not exists public.company_ai_usage (
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  day date not null,
  calls integer not null default 0,
  primary key (org_id, day)
);

do $$
declare
  t text;
begin
  foreach t in array array['company_orgs','company_departments','company_members','company_invites','company_leads','company_audit',
    'company_assessments','company_attempts','company_lesson_progress','company_assignments','company_activity','company_ai_usage'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  foreach t in array array['company_orgs','company_members','company_leads','company_assessments','company_attempts','company_lesson_progress','company_assignments'] loop
    if to_regprocedure('public.set_updated_at()') is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
    end if;
  end loop;
end
$$;

-- Counts one AI call for a workspace today; false once the day's cap is reached.
create or replace function public.company_consume_ai(p_org uuid, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'Asia/Tashkent')::date;
  v_calls integer;
begin
  insert into public.company_ai_usage as u (org_id, day, calls) values (p_org, v_day, 1)
  on conflict (org_id, day) do update set calls = u.calls + 1
  where u.calls < greatest(p_limit, 0)
  returning calls into v_calls;
  return v_calls is not null and v_calls <= greatest(p_limit, 0);
end;
$$;

-- Reserves one test attempt against the workspace's limit; false when none are left.
create or replace function public.company_reserve_test(p_org uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with reserved as (
    update public.company_orgs set tests_used = tests_used + 1
    where id = p_org and status in ('pilot','active') and (tests_limit is null or tests_used < tests_limit)
    returning 1
  )
  select exists (select 1 from reserved);
$$;

-- Makes the learner's Schood English access match their company seats.
-- A seat counts while the member is active, the workspace is active and its
-- contract has not ended. The grant is the ordinary entitlement row for the
-- All Skills bundle, marked source 'company'. A learner who bought English
-- themselves keeps their own row while it covers the seat; when the company
-- extends past it, the row is taken over and the previous state is kept in
-- value.company_previous so revoking the seat restores it.
create or replace function public.company_sync_english_access(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bundle constant uuid := '3a7bd983-58c5-4c75-b5f8-5ac46c94a0fa';
  v_seated boolean;
  v_until timestamptz;
  v_open_ended boolean;
  v_tenant uuid;
  v_row public.entitlements%rowtype;
  v_previous jsonb;
begin
  if p_user is null then return 'none'; end if;
  select count(*) > 0, max(o.contract_ends_at), bool_or(o.contract_ends_at is null)
    into v_seated, v_until, v_open_ended
  from public.company_members m
  join public.company_orgs o on o.id = m.org_id
  where m.user_id = p_user and m.status = 'active' and m.seat
    and o.status = 'active' and (o.contract_ends_at is null or o.contract_ends_at > now());
  if v_open_ended then v_until := null; end if;

  select tenant_id into v_tenant from public.tenant_memberships
  where user_id = p_user and status = 'active'
  order by created_at asc limit 1;
  if v_tenant is null then return 'no_tenant'; end if;

  select * into v_row from public.entitlements
  where tenant_id = v_tenant and resource_type = 'product' and resource_id = v_bundle
  for update;

  if v_seated then
    if not found then
      insert into public.entitlements (user_id, tenant_id, resource_type, resource_id, is_active, starts_at, ends_at, source)
      values (p_user, v_tenant, 'product', v_bundle, true, now(), v_until, 'company');
      return 'granted';
    elsif v_row.source = 'company' then
      update public.entitlements set is_active = true, ends_at = v_until where id = v_row.id;
      return 'updated';
    elsif v_row.is_active and (v_row.ends_at is null or (v_until is not null and v_row.ends_at >= v_until)) then
      return 'own_covers';
    else
      update public.entitlements
      set is_active = true, ends_at = v_until, source = 'company',
          value = coalesce(value, '{}'::jsonb) || jsonb_build_object('company_previous',
            jsonb_build_object('source', v_row.source, 'ends_at', v_row.ends_at, 'is_active', v_row.is_active))
      where id = v_row.id;
      return 'taken_over';
    end if;
  end if;

  if found and v_row.source = 'company' then
    v_previous := v_row.value -> 'company_previous';
    if v_previous is not null then
      update public.entitlements
      set source = coalesce(v_previous ->> 'source', 'system'),
          ends_at = (v_previous ->> 'ends_at')::timestamptz,
          is_active = coalesce((v_previous ->> 'is_active')::boolean, false),
          value = value - 'company_previous'
      where id = v_row.id;
      return 'restored';
    end if;
    update public.entitlements set is_active = false, ends_at = least(coalesce(ends_at, now()), now()) where id = v_row.id;
    return 'revoked';
  end if;
  return 'none';
end;
$$;

-- Re-syncs every person in a workspace, after its status or contract changes.
create or replace function public.company_sync_org_access(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_count integer := 0;
begin
  for v_user in select distinct user_id from public.company_members where org_id = p_org and user_id is not null loop
    perform public.company_sync_english_access(v_user);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.company_consume_ai(uuid, integer) from public, anon, authenticated;
revoke all on function public.company_reserve_test(uuid) from public, anon, authenticated;
revoke all on function public.company_sync_english_access(uuid) from public, anon, authenticated;
revoke all on function public.company_sync_org_access(uuid) from public, anon, authenticated;
grant execute on function public.company_consume_ai(uuid, integer) to service_role;
grant execute on function public.company_reserve_test(uuid) to service_role;
grant execute on function public.company_sync_english_access(uuid) to service_role;
grant execute on function public.company_sync_org_access(uuid) to service_role;

-- Closing an account erases the person's company records too (same additive
-- registry pattern as 20261026170000_english_account_erasure_registry.sql).
do $$
declare
  relations text[];
  wanted text[] := array['company_members', 'company_attempts', 'company_lesson_progress', 'company_activity'];
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
