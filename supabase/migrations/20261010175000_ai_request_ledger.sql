-- Server-owned AI reservations, independent of editable learning history.
-- Additive foundation: existing handlers are unchanged until explicitly wired.
-- Limits are trusted server policy, not values accepted from a browser request.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create table public.ai_request_usage_daily (
  scope text not null check (scope = 'global' or scope ~ '^user:[0-9a-f-]{36}$'),
  -- Nullable global rows retain the consumed service budget after erasure.
  user_id uuid generated always as
    (case when scope='global' then null else substring(scope from 6)::uuid end)
    stored references public.users(id) on delete cascade,
  service text not null check (service in ('writing-tutor','speaking-coach','sat-tutor')),
  usage_date date not null,
  attempts integer not null default 0 check (attempts >= 0),
  charged integer not null default 0 check (charged >= 0 and charged <= attempts),
  primary key(scope, service, usage_date)
);
create index ai_request_usage_daily_user_idx on public.ai_request_usage_daily(user_id) where user_id is not null;

create table public.ai_request_ledger (
  user_id uuid not null references public.users(id) on delete cascade,
  service text not null check (service in ('writing-tutor','speaking-coach','sat-tutor')),
  request_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  usage_date date not null,
  status text not null check (status in ('reserved','started','succeeded','failed','uncertain','cancelled')),
  lease_token uuid not null default gen_random_uuid(),
  lease_expires_at timestamptz not null,
  result jsonb check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 65536)),
  failure_code text check (failure_code is null or failure_code ~ '^[a-z_]{1,64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id, service, request_id)
);
create index ai_request_ledger_service_day_idx on public.ai_request_ledger(service, usage_date);
create index ai_request_ledger_expiry_idx on public.ai_request_ledger(service,lease_expires_at) where status='reserved';
alter table public.ai_request_ledger enable row level security;
alter table public.ai_request_usage_daily enable row level security;
revoke all on public.ai_request_ledger, public.ai_request_usage_daily from public, anon, authenticated, service_role;
grant select on public.ai_request_ledger, public.ai_request_usage_daily to service_role;

-- Match account closure's user-first ordering. Never lock Auth rows here:
-- the Auth deletion transaction already holds that row before the user lock.
create function public.require_open_ai_actor(p_user_id uuid)
returns void language plpgsql security definer
set search_path=pg_catalog,public
set lock_timeout='3s' set statement_timeout='15s' as $$
declare active_actor boolean;
begin
  select is_active into active_actor from public.users where id=p_user_id for share;
  if active_actor is distinct from true
    or exists(select 1 from public.account_closure_receipts where user_id=p_user_id)
    or not exists(select 1 from auth.users where id=p_user_id and deleted_at is null) then
    raise exception using errcode='P0001',message='account_closed';
  end if;
end $$;
revoke all on function public.require_open_ai_actor(uuid) from public,anon,authenticated,service_role;

create trigger account_closed_personal_guard before insert or update on public.ai_request_ledger
  for each row execute function public.guard_closed_personal_record('user_id');
-- Stored generated columns are populated after BEFORE triggers. Derive the
-- actor from scope here instead of trusting NEW.user_id at that stage.
create function public.guard_ai_usage_actor()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.scope<>'global' then
    perform public.require_open_ai_actor(substring(new.scope from 6)::uuid);
  end if;
  return new;
end $$;
revoke all on function public.guard_ai_usage_actor() from public,anon,authenticated,service_role;
create trigger account_closed_personal_guard before insert or update on public.ai_request_usage_daily
  for each row execute function public.guard_ai_usage_actor();

-- Preserve the entire installed erasure registry; add the two private stores.
-- Replacing the existing function keeps its identity, owner and callers.
do $$ declare relations text[]; begin
  relations:=public.account_personal_erasure_tables();
  if 'ai_request_ledger'=any(relations) or 'ai_request_usage_daily'=any(relations) then
    raise exception 'AI erasure registry already installed';
  end if;
  relations:=relations||array['ai_request_ledger','ai_request_usage_daily'];
  execute format('create or replace function public.account_personal_erasure_tables() returns text[] language sql immutable set search_path=pg_catalog,public as %L',
    format('select %L::text[];',relations::text));
end $$;

create function public.reserve_ai_request(
  p_user_id uuid, p_service text, p_request_id uuid, p_request_hash text,
  p_user_limit integer, p_global_limit integer
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public set lock_timeout='3s' set statement_timeout='15s' as $$
declare
  v_day date := (clock_timestamp() at time zone 'UTC')::date;
  v_scope text := 'user:' || p_user_id::text;
  v_request public.ai_request_ledger%rowtype;
  v_user public.ai_request_usage_daily%rowtype;
  v_global public.ai_request_usage_daily%rowtype;
begin
  if p_user_id is null or p_request_id is null
    or p_service is null or p_service not in ('writing-tutor','speaking-coach','sat-tutor')
    or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
    or p_user_limit is null or p_user_limit not between 0 and 500
    or p_global_limit is null or p_global_limit not between 0 and 1000000 then
    raise exception 'Invalid AI reservation' using errcode = '22023';
  end if;
  perform public.require_open_ai_actor(p_user_id);
  -- All commands lock the actor before the shared daily service budget and
  -- request identity. Account erasure can then delete private state safely.
  perform pg_advisory_xact_lock(hashtextextended('ai:global:' || p_service, 0));
  perform pg_advisory_xact_lock(hashtextextended('ai:user:' || p_service || ':' || p_user_id::text, 0));
  v_day := (clock_timestamp() at time zone 'UTC')::date;
  -- A reservation that never began can safely expire. Started calls never do:
  -- the provider may have charged even when its response was lost.
  with expired as (
    update public.ai_request_ledger set status='cancelled',failure_code='reservation_expired',updated_at=clock_timestamp()
      where user_id=p_user_id and service=p_service and status='reserved' and lease_expires_at<=clock_timestamp()
      returning user_id,usage_date
  ), refunds as (
    select 'global'::text as scope,usage_date,count(*)::integer as amount from expired group by usage_date
    union all
    select 'user:' || user_id::text,usage_date,count(*)::integer from expired group by user_id,usage_date
  )
  update public.ai_request_usage_daily d set charged=d.charged-r.amount
    from refunds r where d.service=p_service and d.scope=r.scope and d.usage_date=r.usage_date;
  select * into v_request from public.ai_request_ledger
    where user_id=p_user_id and service=p_service and request_id=p_request_id for update;
  if found then
    if v_request.request_hash <> p_request_hash then
      return jsonb_build_object('status','conflict');
    end if;
    -- Never hand out the original lease again. A retry cannot start a second
    -- provider call, even after a timeout or lost RPC response.
    return jsonb_build_object('status',v_request.status,'replay',true,
      'result',v_request.result,'failure_code',v_request.failure_code);
  end if;
  insert into public.ai_request_usage_daily(scope,service,usage_date)
    values ('global',p_service,v_day),(v_scope,p_service,v_day) on conflict do nothing;
  select * into v_global from public.ai_request_usage_daily where scope='global' and service=p_service and usage_date=v_day for update;
  select * into v_user from public.ai_request_usage_daily where scope=v_scope and service=p_service and usage_date=v_day for update;
  -- Cancellations refund an unused reservation, never the attempt ceiling.
  if v_user.charged >= p_user_limit or v_user.attempts >= greatest(1,p_user_limit*3) then
    return jsonb_build_object('status','user_limit','used',v_user.charged,'limit',p_user_limit);
  end if;
  if v_global.charged >= p_global_limit or v_global.attempts >= greatest(1,p_global_limit*3) then
    return jsonb_build_object('status','service_limit');
  end if;
  insert into public.ai_request_ledger(user_id,service,request_id,request_hash,usage_date,status,lease_expires_at)
    values(p_user_id,p_service,p_request_id,p_request_hash,v_day,'reserved',clock_timestamp()+interval '60 seconds')
    returning * into v_request;
  update public.ai_request_usage_daily set attempts=attempts+1,charged=charged+1
    where scope in ('global',v_scope) and service=p_service and usage_date=v_day;
  return jsonb_build_object('status','reserved','replay',false,'lease_token',v_request.lease_token,
    'used',v_user.charged+1,'limit',p_user_limit,'remaining',p_user_limit-v_user.charged-1);
end $$;

create function public.begin_ai_request(p_user_id uuid,p_service text,p_request_id uuid,p_lease_token uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public set lock_timeout='3s' set statement_timeout='15s' as $$
declare v_started boolean := false;
begin
  perform public.require_open_ai_actor(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended('ai:global:' || p_service,0));
  perform pg_advisory_xact_lock(hashtextextended('ai:user:' || p_service || ':' || p_user_id::text,0));
  update public.ai_request_ledger set status='started',updated_at=clock_timestamp()
    where user_id=p_user_id and service=p_service and request_id=p_request_id
      and lease_token=p_lease_token and status='reserved' and lease_expires_at > clock_timestamp()
    returning true into v_started;
  return coalesce(v_started,false);
end $$;

create function public.finish_ai_request(
  p_user_id uuid,p_service text,p_request_id uuid,p_lease_token uuid,
  p_status text,p_result jsonb default null,p_failure_code text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public set lock_timeout='3s' set statement_timeout='15s' as $$
declare v_request public.ai_request_ledger%rowtype;
begin
  if p_status is null or p_status not in ('succeeded','failed','uncertain','cancelled')
    or (p_status='succeeded' and (p_result is null or jsonb_typeof(p_result)<>'object' or octet_length(p_result::text)>65536))
    or (p_status<>'succeeded' and p_result is not null)
    or (p_failure_code is not null and p_failure_code !~ '^[a-z_]{1,64}$') then
    raise exception 'Invalid AI completion' using errcode='22023';
  end if;
  perform public.require_open_ai_actor(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended('ai:global:' || p_service,0));
  perform pg_advisory_xact_lock(hashtextextended('ai:user:' || p_service || ':' || p_user_id::text,0));
  select * into v_request from public.ai_request_ledger
    where user_id=p_user_id and service=p_service and request_id=p_request_id for update;
  if not found or v_request.lease_token is distinct from p_lease_token then
    raise exception 'AI reservation not found' using errcode='42501';
  end if;
  if v_request.status=p_status then
    if v_request.result is distinct from p_result or v_request.failure_code is distinct from p_failure_code then
      raise exception 'AI completion conflicts with saved result' using errcode='40001';
    end if;
    return jsonb_build_object('status',v_request.status,'result',v_request.result);
  end if;
  if p_status='cancelled' then
    if v_request.status<>'reserved' then
      raise exception 'Started AI calls cannot be automatically refunded' using errcode='40001';
    end if;
    update public.ai_request_usage_daily set charged=charged-1
      where scope in ('global','user:' || p_user_id::text) and service=p_service and usage_date=v_request.usage_date;
  elsif v_request.status not in ('started','uncertain') then
    raise exception 'AI request has not started or is already final' using errcode='40001';
  end if;
  update public.ai_request_ledger set status=p_status,result=p_result,failure_code=p_failure_code,updated_at=clock_timestamp()
    where user_id=p_user_id and service=p_service and request_id=p_request_id;
  return jsonb_build_object('status',p_status,'result',p_result);
end $$;

-- Old browser roles cannot call these functions, choose their own limits, reset
-- counters, forge success, or delete the ledger. Service writes use RPCs only.
revoke all on function public.reserve_ai_request(uuid,text,uuid,text,integer,integer) from public,anon,authenticated;
revoke all on function public.begin_ai_request(uuid,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.finish_ai_request(uuid,text,uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.reserve_ai_request(uuid,text,uuid,text,integer,integer) to service_role;
grant execute on function public.begin_ai_request(uuid,text,uuid,uuid) to service_role;
grant execute on function public.finish_ai_request(uuid,text,uuid,uuid,text,jsonb,text) to service_role;

comment on table public.ai_request_usage_daily is 'Private request-attempt and reservation counters. History deletion and account deletion do not replenish the global budget. Not a monetary spend ledger.';
comment on table public.ai_request_ledger is 'Private idempotent AI request lifecycle. Retains no input text. An uncertain provider outcome remains charged; never retry provider dispatch automatically.';
commit;
