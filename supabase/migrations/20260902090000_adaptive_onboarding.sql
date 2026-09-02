-- Additive, dark by default. No catalog, entitlement, role, or price changes.
create table public.guide_versions (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  revision integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null
);
create table public.guide_release (
  id boolean primary key default true check (id),
  version_id uuid references public.guide_versions(id),
  enabled boolean not null default false,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.guide_release(id) values (true);
create table public.guide_sessions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.guide_versions(id),
  secret_hash text not null check (length(secret_hash) = 64),
  user_id uuid references auth.users(id) on delete cascade,
  locale text not null check (locale in ('en','uz','ru')),
  campaign text not null default 'direct' check (length(campaign) <= 64),
  answers jsonb not null default '{}',
  check_answers jsonb not null default '{}',
  check_status text not null default 'undecided' check (check_status in ('undecided','started','completed','skipped')),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  constraint guide_sessions_valid_answers check (jsonb_typeof(answers) = 'object')
);
create index guide_sessions_expiry on public.guide_sessions(expires_at);
create index guide_sessions_user on public.guide_sessions(user_id) where user_id is not null;
create table public.guide_events (
  id bigint generated always as identity primary key,
  session_id uuid references public.guide_sessions(id) on delete set null,
  journey_id uuid not null,
  version_id uuid not null references public.guide_versions(id),
  event text not null check (event in ('started','question_viewed','answered','result','recommended','no_match','check_started','check_completed','check_skipped','claimed','offer_opened','checkout_started','destination_opened','paid')),
  question_id text,
  offer_id text,
  audience text check (audience is null or audience in ('learner','parent','teacher','center')),
  locale text not null check (locale in ('en','uz','ru')),
  campaign text not null,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique(session_id, dedupe_key)
);
create index guide_events_reporting on public.guide_events(version_id, created_at, event);
create function public.guide_event_cohort() returns trigger language plpgsql set search_path = public as $$
begin
  new.journey_id := coalesce(new.journey_id, new.session_id, gen_random_uuid());
  return new;
end;
$$;
create trigger guide_event_cohort before insert on public.guide_events for each row execute function public.guide_event_cohort();
-- A receipt permits telemetry only, never session reads, goal changes or access.
create table public.guide_arrivals (
  token_hash text primary key check (length(token_hash) = 64),
  session_id uuid not null references public.guide_sessions(id) on delete cascade,
  offer_id text not null,
  target_origin text not null,
  target_path text not null,
  expires_at timestamptz not null default (now() + interval '15 minutes')
);
alter table public.guide_arrivals enable row level security;
revoke all on public.guide_arrivals from anon, authenticated;
grant all on public.guide_arrivals to service_role;
create table public.guide_payment_links (
  payment_id uuid primary key references public.payments(id) on delete cascade,
  session_id uuid references public.guide_sessions(id) on delete set null,
  version_id uuid not null references public.guide_versions(id),
  offer_id text not null,
  created_at timestamptz not null default now()
);
create table public.guide_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  count integer not null default 1
);

-- No browser-accessible policies. Even drafts and check keys are only read by the Edge function.
alter table public.guide_versions enable row level security;
alter table public.guide_release enable row level security;
alter table public.guide_sessions enable row level security;
alter table public.guide_events enable row level security;
alter table public.guide_payment_links enable row level security;
alter table public.guide_rate_limits enable row level security;
revoke all on public.guide_versions, public.guide_release, public.guide_sessions, public.guide_events, public.guide_payment_links, public.guide_rate_limits from anon, authenticated;
grant all on public.guide_versions, public.guide_release, public.guide_sessions, public.guide_events, public.guide_payment_links, public.guide_rate_limits to service_role;
grant usage, select on sequence public.guide_versions_number_seq, public.guide_events_id_seq to service_role;

create function public.guide_version_immutable() returns trigger language plpgsql set search_path = public as $$
begin
  if old.published_at is not null and (new.config is distinct from old.config or new.revision is distinct from old.revision or new.published_at is distinct from old.published_at) then
    raise exception 'Published guide versions are immutable';
  end if;
  return new;
end;
$$;
create trigger guide_version_immutable before update on public.guide_versions for each row execute function public.guide_version_immutable();

-- Compare-and-swap publication: validation can never race a subsequent draft edit.
create function public.guide_publish(p_version uuid, p_draft_revision integer, p_release_revision integer, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.guide_versions; r public.guide_release;
begin
  select * into r from public.guide_release where id for update;
  if r.revision <> p_release_revision then raise exception 'Release changed; reload before publishing' using errcode = '40001'; end if;
  select * into v from public.guide_versions where id = p_version for update;
  if not found or v.revision <> p_draft_revision then raise exception 'Draft changed; reload before publishing' using errcode = '40001'; end if;
  update public.guide_versions set published_at = coalesce(published_at, now()), published_by = coalesce(published_by, p_actor) where id = p_version;
  update public.guide_release set version_id = p_version, enabled = true, revision = revision + 1, updated_at = now(), updated_by = p_actor where id returning * into r;
  return to_jsonb(r);
end;
$$;

create function public.guide_rate_limit(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.guide_rate_limits(key_hash) values(p_key)
  on conflict(key_hash) do update set
    count = case when guide_rate_limits.window_started_at < now() - make_interval(secs => p_seconds) then 1 else guide_rate_limits.count + 1 end,
    window_started_at = case when guide_rate_limits.window_started_at < now() - make_interval(secs => p_seconds) then now() else guide_rate_limits.window_started_at end
  returning count into n;
  return n <= p_limit;
end;
$$;

-- Only confirmed provider status creates a conversion. A client click cannot do so.
create function public.guide_record_paid(p_payment uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.guide_events(session_id, version_id, event, offer_id, audience, locale, campaign, dedupe_key)
  select s.id, l.version_id, 'paid', l.offer_id, s.answers->>'audience', s.locale, s.campaign, 'paid:' || p.id::text
  from public.guide_payment_links l
  join public.payments p on p.id = l.payment_id
  join public.guide_sessions s on s.id = l.session_id and s.user_id = p.user_id
  where p.id = p_payment and p.status = 'paid'
  on conflict(session_id, dedupe_key) do nothing;
end;
$$;
create function public.guide_payment_changed() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.guide_record_paid(new.id);
  return new;
end;
$$;
create trigger guide_payment_changed after update of status on public.payments for each row when (new.status = 'paid') execute function public.guide_payment_changed();
create function public.guide_payment_linked() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.guide_record_paid(new.payment_id);
  return new;
end;
$$;
create trigger guide_payment_linked after insert on public.guide_payment_links for each row execute function public.guide_payment_linked();

create function public.guide_cleanup() returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.guide_sessions where expires_at < now();
  delete from public.guide_rate_limits where window_started_at < now() - interval '1 day';
  delete from public.guide_arrivals where expires_at < now();
  delete from public.guide_events where created_at < now() - interval '90 days';
end;
$$;
revoke all on function public.guide_publish(uuid,integer,integer,uuid), public.guide_rate_limit(text,integer,integer), public.guide_record_paid(uuid), public.guide_cleanup() from public, anon, authenticated;
grant execute on function public.guide_publish(uuid,integer,integer,uuid), public.guide_rate_limit(text,integer,integer), public.guide_record_paid(uuid), public.guide_cleanup() to service_role;

-- Use the existing scheduler when available. Operations runbook covers installations without pg_cron.
do $$ begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('guide-retention', '17 3 * * *', 'select public.guide_cleanup()');
  end if;
end $$;
