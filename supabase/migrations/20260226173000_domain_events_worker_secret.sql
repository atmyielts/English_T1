-- ============================================================================
-- Phase 3.1: Scheduler auth via DB-managed worker secret
-- ----------------------------------------------------------------------------
-- Stores a private worker secret in Postgres and uses it for pg_cron -> Edge
-- invocation. This avoids relying on app.settings.service_role_key availability.
-- ============================================================================

create table if not exists public.internal_runtime_secrets (
  key text primary key,
  secret text not null check (length(secret) >= 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists internal_runtime_secrets_updated_at on public.internal_runtime_secrets;
create trigger internal_runtime_secrets_updated_at
before update on public.internal_runtime_secrets
for each row
execute procedure public.handle_user_updated_at();

alter table public.internal_runtime_secrets enable row level security;

revoke all on table public.internal_runtime_secrets from public;
revoke all on table public.internal_runtime_secrets from anon;
revoke all on table public.internal_runtime_secrets from authenticated;

insert into public.internal_runtime_secrets (key, secret)
values (
  'domain_events_worker_secret',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
on conflict (key) do nothing;

create or replace function public.invoke_domain_events_worker(
  p_limit integer default 50,
  p_event_type text default 'exam.result'
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_worker_secret text;
  v_request_id bigint;
  v_limit integer;
  v_event_type text;
begin
  select s.secret
  into v_worker_secret
  from public.internal_runtime_secrets s
  where s.key = 'domain_events_worker_secret'
  limit 1;

  if v_worker_secret is null or length(trim(v_worker_secret)) < 32 then
    raise warning 'domain-events invoke skipped: worker secret is missing';
    return null;
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 50), 200));
  v_event_type := coalesce(nullif(trim(p_event_type), ''), 'exam.result');

  select net.http_post(
    url := 'https://bbjawctnqrufvnesdsel.supabase.co/functions/v1/domain-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', v_worker_secret
    ),
    body := jsonb_build_object(
      'limit', v_limit,
      'event_type', v_event_type
    )
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.invoke_domain_events_worker(integer, text) from public;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'domain-events-worker-v1'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'domain-events-worker-v1',
    '*/2 * * * *',
    $cron$select public.invoke_domain_events_worker(100, 'exam.result');$cron$
  );
exception
  when undefined_table then
    raise notice 'pg_cron is unavailable in this environment; scheduler not configured';
end
$$;

do $$
begin
  perform public.invoke_domain_events_worker(200, 'exam.result');
exception
  when others then
    raise notice 'Initial domain-events invocation failed: %', sqlerrm;
end
$$;
