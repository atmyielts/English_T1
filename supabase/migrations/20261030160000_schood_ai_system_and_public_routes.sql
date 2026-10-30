-- Schood AI: system routes (scheduled, no user) and anonymous routes (no sign-in).
-- Additive to 20261030100000_schood_ai_core.sql.
--
-- 1. A workspace can pay without a member. ai_credit_charge with p_user null
--    charges the workspace's pool and skips member budgets. Only the function's
--    ctx.paidBy(workspaceId) does this, on system and anonymous routes, for
--    example a centre's admissions widget or a scheduled brief. The ledger row has
--    no user. The rest of the function is unchanged.
-- 2. ai_rate_take: fixed-window counters for anonymous routes, keyed by a hash of
--    the caller's IP (never the IP itself) and the route. Old windows are pruned
--    daily at 03:35 UTC.
-- 3. System routes are called by pg_cron through invoke_schood_ai_system(route,
--    body), the repo's invoke_*_worker pattern: the secret lives in
--    internal_runtime_secrets ('schood_ai_system_secret'); the function reads the
--    same row. Areas schedule their jobs in their own migrations, for example:
--      select cron.schedule('schood-ai-engage-deliver-v1', '*/15 * * * *',
--        $$select public.invoke_schood_ai_system('engage/system-deliver', '{"bot":"student"}')$$);
begin;

create or replace function public.ai_credit_charge(
  p_workspace uuid, p_user uuid, p_cost integer, p_credit_key text, p_reference text, p_grant integer, p_anchor timestamptz, p_now timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.ai_credit_accounts;
  ws public.ai_workspaces;
  m public.ai_workspace_members;
  previous record;
  budget_month text := to_char((p_now at time zone 'UTC') + interval '5 hours', 'YYYY-MM');
  used integer := 0;
  from_plan integer;
  from_pack integer;
  charge uuid := gen_random_uuid();
begin
  if p_cost is null or p_cost < 1 or p_cost > 100000 then raise exception 'invalid_cost' using errcode = '22023'; end if;
  if p_reference is null or char_length(p_reference) not between 1 and 200 then raise exception 'invalid_reference' using errcode = '22023'; end if;
  select * into ws from public.ai_workspaces where id = p_workspace;
  if not found then raise exception 'workspace_not_found' using errcode = 'P0002'; end if;
  a := public.ai_credit_sync(p_workspace, p_grant, p_anchor, p_now);
  -- Checked under the account lock, so a concurrent duplicate sees the first charge.
  select charge_id, sum(-delta)::integer as cost into previous from public.ai_credit_ledger
    where workspace_id = p_workspace and kind = 'charge' and reference = p_reference group by charge_id;
  if found then
    -- A key whose charge was refunded belonged to a failed attempt: a retry needs a new key.
    if exists (select 1 from public.ai_credit_ledger where charge_id = previous.charge_id and kind = 'refund') then
      return jsonb_build_object('ok', false, 'code', 'reference_refunded');
    end if;
    return jsonb_build_object('ok', true, 'replayed', true, 'charge_id', previous.charge_id, 'cost', previous.cost, 'balance', public.ai_credit_view(a));
  end if;
  -- A member pays within their budget; with no member (p_user null) the workspace pays.
  if ws.kind = 'centre' and p_user is not null then
    select * into m from public.ai_workspace_members where workspace_id = p_workspace and user_id = p_user for update;
    if not found or m.status <> 'active' then
      return jsonb_build_object('ok', false, 'code', 'not_member');
    end if;
    used := case when m.budget_period = budget_month then m.budget_used else 0 end;
    if m.credit_budget is not null and used + p_cost > m.credit_budget then
      return jsonb_build_object('ok', false, 'code', 'budget_exhausted', 'cost', p_cost, 'budget', m.credit_budget, 'used', used, 'balance', public.ai_credit_view(a));
    end if;
  end if;
  if a.plan_balance + a.pack_balance < p_cost then
    return jsonb_build_object('ok', false, 'code', 'insufficient_credits', 'cost', p_cost, 'available', a.plan_balance + a.pack_balance, 'balance', public.ai_credit_view(a));
  end if;
  from_plan := least(a.plan_balance, p_cost);
  from_pack := p_cost - from_plan;
  if from_plan > 0 then
    insert into public.ai_credit_ledger (workspace_id, user_id, kind, bucket, delta, balance_after, credit_key, charge_id, reference, created_at)
      values (p_workspace, p_user, 'charge', 'plan', -from_plan, a.plan_balance - from_plan, p_credit_key, charge, p_reference, p_now);
  end if;
  if from_pack > 0 then
    insert into public.ai_credit_ledger (workspace_id, user_id, kind, bucket, delta, balance_after, credit_key, charge_id, reference, created_at)
      values (p_workspace, p_user, 'charge', 'pack', -from_pack, a.pack_balance - from_pack, p_credit_key, charge, p_reference, p_now);
  end if;
  update public.ai_credit_accounts set plan_balance = plan_balance - from_plan, pack_balance = pack_balance - from_pack, updated_at = now()
    where workspace_id = p_workspace returning * into a;
  if ws.kind = 'centre' and p_user is not null then
    update public.ai_workspace_members set budget_period = budget_month, budget_used = used + p_cost
      where workspace_id = p_workspace and user_id = p_user;
  end if;
  return jsonb_build_object('ok', true, 'replayed', false, 'charge_id', charge, 'cost', p_cost, 'plan', from_plan, 'pack', from_pack, 'balance', public.ai_credit_view(a));
end $$;
revoke all on function public.ai_credit_charge(uuid, uuid, integer, text, text, integer, timestamptz, timestamptz) from public, anon, authenticated;

create table if not exists public.ai_rate_limits (
  bucket text not null check (char_length(bucket) between 1 and 200),
  window_start timestamptz not null,
  hits integer not null default 1 check (hits >= 1),
  primary key (bucket, window_start)
);
alter table public.ai_rate_limits enable row level security;
revoke all on public.ai_rate_limits from anon, authenticated;
revoke insert, update, delete, truncate on public.ai_rate_limits from service_role;
create index if not exists ai_rate_limits_window_idx on public.ai_rate_limits (window_start);

-- One hit in the current fixed window, all or nothing.
create or replace function public.ai_rate_take(p_bucket text, p_limit integer, p_window_seconds integer, p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  window_at timestamptz;
  taken integer;
begin
  if p_bucket is null or char_length(p_bucket) not between 1 and 200 then raise exception 'invalid_bucket' using errcode = '22023'; end if;
  if p_limit is null or p_limit < 1 or p_window_seconds is null or p_window_seconds not between 1 and 86400 then raise exception 'invalid_limit' using errcode = '22023'; end if;
  window_at := to_timestamp(floor(extract(epoch from p_now) / p_window_seconds) * p_window_seconds);
  insert into public.ai_rate_limits as r (bucket, window_start, hits) values (p_bucket, window_at, 1)
    on conflict (bucket, window_start) do update set hits = r.hits + 1 where r.hits < p_limit
    returning hits into taken;
  if taken is null then
    return jsonb_build_object('ok', false, 'retry_at', window_at + make_interval(secs => p_window_seconds));
  end if;
  return jsonb_build_object('ok', true, 'remaining', p_limit - taken);
end $$;
revoke all on function public.ai_rate_take(text, integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.ai_rate_take(text, integer, integer, timestamptz) to service_role;

create or replace function public.ai_rate_prune(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_deleted integer;
begin
  delete from public.ai_rate_limits where window_start < p_now - interval '2 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;
revoke all on function public.ai_rate_prune(timestamptz) from public, anon, authenticated;
grant execute on function public.ai_rate_prune(timestamptz) to service_role;

do $$
begin
  if to_regclass('public.internal_runtime_secrets') is null then
    raise notice 'internal_runtime_secrets is not installed; the Schood AI system secret is not created';
    return;
  end if;
  insert into public.internal_runtime_secrets (key, secret)
    values ('schood_ai_system_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
    on conflict (key) do nothing;
end
$$;

-- Calls a system route (area/action) with the system secret. pg_cron only.
create or replace function public.invoke_schood_ai_system(p_route text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_secret text;
  v_request bigint;
begin
  if p_route is null or p_route !~ '^(core|learner|teacher|centre|coach|engage)/[a-z][a-z0-9-]{0,60}$' then
    raise exception 'invalid_route' using errcode = '22023';
  end if;
  if p_body is null or jsonb_typeof(p_body) <> 'object' then raise exception 'invalid_body' using errcode = '22023'; end if;
  if to_regclass('public.internal_runtime_secrets') is null then
    raise warning 'schood ai system invoke skipped: internal_runtime_secrets is missing';
    return null;
  end if;
  select s.secret into v_secret from public.internal_runtime_secrets s where s.key = 'schood_ai_system_secret' limit 1;
  if v_secret is null or length(trim(v_secret)) < 32 then
    raise warning 'schood ai system invoke skipped: the system secret is missing';
    return null;
  end if;
  select net.http_post(
    url := 'https://bbjawctnqrufvnesdsel.supabase.co/functions/v1/schood-ai/' || p_route,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-schood-service-secret', v_secret),
    body := p_body
  ) into v_request;
  return v_request;
end;
$$;
revoke all on function public.invoke_schood_ai_system(text, jsonb) from public, anon, authenticated, service_role;

commit;

do $$
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron with schema extensions;
exception
  when others then raise notice 'pg_net or pg_cron could not be enabled here (%); Schood AI system routes are not scheduled', sqlerrm;
end
$$;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = 'schood-ai-rate-prune-v1' loop
    perform cron.unschedule(v_job_id);
  end loop;
  perform cron.schedule('schood-ai-rate-prune-v1', '35 3 * * *', $cron$select public.ai_rate_prune();$cron$);
exception
  when undefined_table or undefined_function or invalid_schema_name then
    raise notice 'pg_cron is unavailable in this environment; Schood AI rate limit pruning not scheduled';
end
$$;
