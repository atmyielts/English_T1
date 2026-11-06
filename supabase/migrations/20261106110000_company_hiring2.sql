-- Company English hiring, second layer: an applicant tracking system on top of the
-- hiring tests. Candidates per test (personal links, pipeline stages, notes timeline),
-- expiring public share links, per-workspace retention and message templates.
-- Additive and idempotent. Existing attempts are copied in as candidates once.

-- One person on one hiring test. Open-link candidates get a row when they start;
-- invited candidates get one when HR adds them, before any attempt exists.
create table if not exists public.company_candidates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  assessment_id uuid not null references public.company_assessments(id) on delete cascade,
  -- The person's latest attempt. An earlier attempt that ran out stays in company_attempts.
  attempt_id uuid references public.company_attempts(id) on delete set null,
  name text check (name is null or char_length(name) <= 120),
  email text check (email is null or char_length(email) <= 200),
  phone text check (phone is null or char_length(phone) <= 40),
  source text not null default 'link' check (source in ('link','invite')),
  -- Personal link (/t/<token>), sha256 only. Null for open-link candidates and after erasure.
  invite_token_hash text unique,
  stage text not null default 'new' check (stage in ('new','reviewing','interview','offer','hired','rejected')),
  stage_at timestamptz not null default now(),
  -- How far the person got, for the funnel: rejecting someone at interview still counts the interview.
  furthest_stage text not null default 'new' check (furthest_stage in ('new','reviewing','interview','offer','hired')),
  invited_at timestamptz,
  opened_at timestamptz,
  reminded_at timestamptz,
  reminders integer not null default 0,
  hired_at timestamptz,
  interview_kit jsonb,
  anonymised_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_candidates_test_idx on public.company_candidates (org_id, assessment_id, stage);
create unique index if not exists company_candidates_attempt_uq on public.company_candidates (attempt_id) where attempt_id is not null;
create unique index if not exists company_candidates_email_uq on public.company_candidates (assessment_id, email) where email is not null;

-- The candidate's timeline. Author names are read from company_members when shown, not stored here.
create table if not exists public.company_candidate_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  candidate_id uuid not null references public.company_candidates(id) on delete cascade,
  author uuid references public.users(id) on delete set null,
  kind text not null default 'note' check (kind in ('note','stage','message','system')),
  body text check (body is null or char_length(body) <= 4000),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists company_candidate_notes_idx on public.company_candidate_notes (candidate_id, created_at desc);

-- Read-only public pages at /s/<key>: a report for a hiring manager, or one candidate's feedback.
create table if not exists public.company_share_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  assessment_id uuid not null references public.company_assessments(id) on delete cascade,
  candidate_id uuid references public.company_candidates(id) on delete cascade,
  kind text not null default 'report' check (kind in ('report','feedback')),
  key_hash text not null unique,
  label text check (label is null or char_length(label) <= 120),
  include_contacts boolean not null default false,
  include_feedback boolean not null default true,
  stages text[] not null default '{}'::text[],
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_opened_at timestamptz,
  opens integer not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind <> 'feedback' or candidate_id is not null)
);
create index if not exists company_share_links_test_idx on public.company_share_links (org_id, assessment_id, created_at desc);

-- One row per workspace that changed something. No row means no retention and default messages.
create table if not exists public.company_hiring_settings (
  org_id uuid primary key references public.company_orgs(id) on delete cascade,
  retention_months integer check (retention_months is null or retention_months between 1 and 120),
  templates jsonb not null default '{}'::jsonb,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Counters for rate limits on public hiring pages, keyed by a daily-salted address hash.
create table if not exists public.company_hiring_hits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

do $$
declare
  t text;
begin
  foreach t in array array['company_candidates','company_candidate_notes','company_share_links','company_hiring_settings','company_hiring_hits'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  foreach t in array array['company_candidates','company_hiring_settings'] loop
    if to_regprocedure('public.set_updated_at()') is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
    end if;
  end loop;
end
$$;

-- Attempts made before this layer existed become candidates, once per person per test.
insert into public.company_candidates (org_id, assessment_id, attempt_id, name, email, phone, source, stage, furthest_stage, stage_at, anonymised_at, created_at)
select distinct on (a.assessment_id, coalesce(a.candidate_email, a.id::text))
  a.org_id, a.assessment_id, a.id, a.candidate_name, a.candidate_email, a.candidate_phone, 'link',
  case a.decision when 'reject' then 'rejected' when 'shortlist' then 'reviewing' when 'hold' then 'reviewing' else 'new' end,
  case when a.decision in ('shortlist','hold') then 'reviewing' else 'new' end,
  a.started_at,
  case when a.candidate_name is null and a.candidate_email is null and a.candidate_phone is null then now() end,
  a.started_at
from public.company_attempts a
join public.company_assessments s on s.id = a.assessment_id and s.kind = 'hiring'
where a.member_id is null
  and not exists (select 1 from public.company_candidates c where c.attempt_id = a.id)
order by a.assessment_id, coalesce(a.candidate_email, a.id::text), (a.status = 'expired'), a.started_at desc
on conflict do nothing;

-- Counts one request; false once the bucket has passed its limit for this window.
create or replace function public.company_hiring_hit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / greatest(p_window_seconds, 1)) * greatest(p_window_seconds, 1));
  v_hits integer;
begin
  insert into public.company_hiring_hits (bucket, window_start, hits) values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = public.company_hiring_hits.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;
revoke all on function public.company_hiring_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.company_hiring_hit(text, integer, integer) to service_role;

-- Removes what identifies a person from an attempt and keeps the anonymous scores.
-- hiring/retention.ts does the same for "delete now"; keep the two in step.
create or replace function public.company_hiring_scrub_attempt(p_attempt uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.company_attempts
  set candidate_name = null, candidate_email = null, candidate_phone = null, access_token_hash = null, notes = null,
      answers = '{}'::jsonb, ai_feedback = '{}'::jsonb, certificate_code = null,
      integrity = (integrity - 'ip_hash' - 'user_agent') || '{"anonymised": true}'::jsonb
  where id = p_attempt and status <> 'started' and member_id is null;
$$;
revoke all on function public.company_hiring_scrub_attempt(uuid) from public, anon, authenticated, service_role;

-- Erases one candidate's personal data and keeps the anonymous result. False if nothing was left to erase.
create or replace function public.company_hiring_anonymise_candidate(p_candidate uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.company_candidates%rowtype;
  v_attempt uuid;
begin
  select * into v_candidate from public.company_candidates where id = p_candidate for update;
  if not found or v_candidate.anonymised_at is not null then
    return false;
  end if;
  for v_attempt in
    select a.id from public.company_attempts a
    where a.member_id is null and a.status <> 'started' and a.assessment_id = v_candidate.assessment_id
      and (a.id = v_candidate.attempt_id or (v_candidate.email is not null and lower(a.candidate_email) = lower(v_candidate.email)))
  loop
    perform public.company_hiring_scrub_attempt(v_attempt);
  end loop;
  delete from public.company_candidate_notes where candidate_id = p_candidate;
  delete from public.company_share_links where candidate_id = p_candidate;
  update public.company_candidates
  set name = null, email = null, phone = null, invite_token_hash = null, interview_kit = null, anonymised_at = now()
  where id = p_candidate;
  return true;
end;
$$;
revoke all on function public.company_hiring_anonymise_candidate(uuid) from public, anon, authenticated;
grant execute on function public.company_hiring_anonymise_candidate(uuid) to service_role;

-- Nightly: each workspace that set a retention period loses candidate personal data older
-- than that. A person mid-test is left alone. Also clears old rate-limit counters and dead links.
create or replace function public.company_hiring_apply_retention()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_setting record;
  v_cutoff timestamptz;
  v_id uuid;
  v_count integer := 0;
begin
  for v_setting in select org_id, retention_months from public.company_hiring_settings where retention_months is not null loop
    v_cutoff := now() - make_interval(months => v_setting.retention_months);
    for v_id in
      select c.id from public.company_candidates c
      left join public.company_attempts a on a.id = c.attempt_id
      where c.org_id = v_setting.org_id and c.anonymised_at is null
        and coalesce(a.status, '') <> 'started'
        and greatest(c.created_at, c.stage_at, coalesce(c.opened_at, c.created_at), coalesce(a.submitted_at, a.started_at, c.created_at)) < v_cutoff
    loop
      if public.company_hiring_anonymise_candidate(v_id) then
        v_count := v_count + 1;
      end if;
    end loop;
    -- Attempts no candidate row points to any more (an earlier try of the same person, for example).
    for v_id in
      select a.id from public.company_attempts a
      join public.company_assessments s on s.id = a.assessment_id and s.kind = 'hiring'
      where a.org_id = v_setting.org_id and a.member_id is null and a.status <> 'started'
        and (a.candidate_name is not null or a.candidate_email is not null or a.candidate_phone is not null)
        and coalesce(a.submitted_at, a.started_at) < v_cutoff
        and not exists (select 1 from public.company_candidates c where c.attempt_id = a.id and c.anonymised_at is null)
    loop
      perform public.company_hiring_scrub_attempt(v_id);
    end loop;
  end loop;
  delete from public.company_hiring_hits where window_start < now() - interval '2 days';
  delete from public.company_share_links where expires_at < now() - interval '90 days';
  return v_count;
end;
$$;
revoke all on function public.company_hiring_apply_retention() from public, anon, authenticated;
grant execute on function public.company_hiring_apply_retention() to service_role;

-- Run it nightly where pg_cron is installed (03:20 Tashkent = 22:20 UTC). Nothing happens
-- for a workspace until it sets a retention period.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'company-hiring-retention') then
      perform cron.unschedule('company-hiring-retention');
    end if;
    perform cron.schedule('company-hiring-retention', '20 22 * * *', 'select public.company_hiring_apply_retention()');
  end if;
end
$$;

-- Closing an account erases that address from candidate rows too.
create or replace function public.company_hiring_erase_account(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_id uuid;
  v_count integer := 0;
begin
  update public.company_candidates set created_by = null where created_by = p_user;
  update public.company_candidate_notes set author = null where author = p_user;
  update public.company_share_links set created_by = null where created_by = p_user;
  update public.company_hiring_settings set updated_by = null where updated_by = p_user;
  select lower(email) into v_email from auth.users where id = p_user and email_confirmed_at is not null;
  if v_email is null or v_email = '' then
    return jsonb_build_object('candidates', 0);
  end if;
  for v_id in select id from public.company_candidates where lower(email) = v_email and anonymised_at is null loop
    if public.company_hiring_anonymise_candidate(v_id) then
      v_count := v_count + 1;
    end if;
  end loop;
  return jsonb_build_object('candidates', v_count);
end;
$$;
revoke all on function public.company_hiring_erase_account(uuid) from public, anon, authenticated, service_role;

do $$
declare hooks text[];
begin
  if to_regprocedure('public.account_erasure_service_hooks()') is null then
    raise notice 'account_erasure_service_hooks() is not installed; company hiring erasure hook not registered';
    return;
  end if;
  hooks := public.account_erasure_service_hooks();
  if not ('company_hiring_erase_account' = any(hooks)) then
    hooks := hooks || 'company_hiring_erase_account'::text;
    execute format(
      'create or replace function public.account_erasure_service_hooks() returns text[] language sql immutable set search_path=pg_catalog,public as %L',
      format('select %L::text[];', hooks::text)
    );
  end if;
end
$$;
