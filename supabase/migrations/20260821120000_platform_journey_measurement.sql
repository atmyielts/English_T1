-- Privacy-bounded public journey measurement.
-- Raw IP addresses and full URLs are never stored. The Edge Function records
-- only allow-listed events and uses a keyed hash solely for rate limiting.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '10min';

create table if not exists public.platform_journey_events (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  user_id uuid references public.users(id) on delete set null,
  event_name text not null check (event_name in (
    'platform_home_viewed',
    'platform_path_selected',
    'english_discovery_viewed',
    'english_hub_viewed',
    'english_skill_selected',
    'signin_started',
    'signup_started',
    'pricing_viewed',
    'checkout_started',
    'authenticated_return_completed'
  )),
  surface text not null check (surface in ('platform', 'english_hub')),
  path text not null check (length(path) between 1 and 240 and left(path, 1) = '/' and position('?' in path) = 0 and position('#' in path) = 0),
  target text check (target is null or length(target) <= 120),
  release_sha text check (release_sha is null or release_sha ~ '^[A-Za-z0-9._-]{1,64}$'),
  source text check (source is null or length(source) <= 120),
  medium text check (medium is null or length(medium) <= 120),
  campaign text check (campaign is null or length(campaign) <= 120),
  idempotency_key text check (idempotency_key is null or length(idempotency_key) <= 500),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 2048),
  created_at timestamptz not null default now()
);

create unique index if not exists platform_journey_events_idempotency_idx
  on public.platform_journey_events(idempotency_key)
  where idempotency_key is not null;
create index if not exists platform_journey_events_name_created_idx
  on public.platform_journey_events(event_name, created_at desc);
create index if not exists platform_journey_events_visitor_created_idx
  on public.platform_journey_events(visitor_id, created_at desc);
create index if not exists platform_journey_events_surface_created_idx
  on public.platform_journey_events(surface, created_at desc);

create table if not exists public.platform_journey_rate_limits (
  rate_key text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (rate_key, window_started_at)
);

create index if not exists platform_journey_rate_limits_window_idx
  on public.platform_journey_rate_limits(window_started_at);

create or replace function public.platform_journey_rate_limit_consume(
  p_rate_key text,
  p_window_seconds integer default 600,
  p_max_requests integer default 120
)
returns table(allowed boolean, request_count integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if nullif(trim(p_rate_key), '') is null then
    raise exception 'rate_key_required';
  end if;
  p_window_seconds := least(greatest(coalesce(p_window_seconds, 600), 60), 3600);
  p_max_requests := least(greatest(coalesce(p_max_requests, 120), 10), 1000);
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.platform_journey_rate_limits(rate_key, window_started_at, request_count, updated_at)
  values (left(p_rate_key, 128), v_window, 1, now())
  on conflict (rate_key, window_started_at)
  do update set request_count = public.platform_journey_rate_limits.request_count + 1, updated_at = now()
  returning public.platform_journey_rate_limits.request_count into v_count;

  return query select
    v_count <= p_max_requests,
    v_count,
    greatest(1, ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - now())))::integer);
end;
$$;

create or replace function public.admin_platform_journey_funnel(
  p_since timestamptz default (now() - interval '30 days')
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with filtered as (
    select visitor_id, event_name, surface, created_at
    from public.platform_journey_events
    where created_at >= greatest(p_since, now() - interval '180 days')
  ), event_counts as (
    select event_name, count(*)::bigint as events, count(distinct visitor_id)::bigint as visitors
    from filtered
    group by event_name
  ), stages as (
    select
      count(distinct visitor_id) filter (where event_name in ('platform_home_viewed','english_discovery_viewed','english_hub_viewed'))::bigint as discovered,
      count(distinct visitor_id) filter (where event_name in ('platform_path_selected','english_skill_selected','pricing_viewed'))::bigint as intent,
      count(distinct visitor_id) filter (where event_name in ('signin_started','signup_started'))::bigint as auth_started,
      count(distinct visitor_id) filter (where event_name = 'authenticated_return_completed')::bigint as activated
    from filtered
  ), daily as (
    select date_trunc('day', created_at)::date as day,
      count(distinct visitor_id) filter (where event_name in ('platform_home_viewed','english_discovery_viewed','english_hub_viewed'))::bigint as discovered,
      count(distinct visitor_id) filter (where event_name in ('signin_started','signup_started'))::bigint as auth_started,
      count(distinct visitor_id) filter (where event_name = 'authenticated_return_completed')::bigint as activated
    from filtered
    group by 1
    order by 1
  )
  select jsonb_build_object(
    'since', p_since,
    'events', coalesce((select jsonb_object_agg(event_name, jsonb_build_object('events', events, 'visitors', visitors)) from event_counts), '{}'::jsonb),
    'funnel', coalesce((select to_jsonb(stages) from stages), jsonb_build_object('discovered', 0, 'intent', 0, 'auth_started', 0, 'activated', 0)),
    'daily', coalesce((select jsonb_agg(to_jsonb(daily)) from daily), '[]'::jsonb)
  );
$$;

alter table public.platform_journey_events enable row level security;
alter table public.platform_journey_rate_limits enable row level security;

revoke all on table public.platform_journey_events from public, anon, authenticated;
revoke all on table public.platform_journey_rate_limits from public, anon, authenticated;
grant select, insert, delete on table public.platform_journey_events to service_role;
grant select, insert, update, delete on table public.platform_journey_rate_limits to service_role;

revoke all on function public.platform_journey_rate_limit_consume(text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_platform_journey_funnel(timestamptz) from public, anon, authenticated;
grant execute on function public.platform_journey_rate_limit_consume(text, integer, integer) to service_role;
grant execute on function public.admin_platform_journey_funnel(timestamptz) to service_role;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = 'platform-journey-retention-v1' loop
    perform cron.unschedule(v_job_id);
  end loop;
  perform cron.schedule(
    'platform-journey-retention-v1',
    '23 3 * * *',
    $cron$delete from public.platform_journey_events where created_at < now() - interval '180 days'; delete from public.platform_journey_rate_limits where window_started_at < now() - interval '2 days';$cron$
  );
exception
  when undefined_table then
    raise notice 'pg_cron is unavailable; platform journey retention was not scheduled';
end
$$;

commit;
