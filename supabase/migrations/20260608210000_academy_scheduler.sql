-- Academy engagement scheduler: pg_cron -> academy edge function (worker secret auth)
-- Mirrors the domain-events worker pattern (internal_runtime_secrets + x-worker-secret).

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

-- Private worker secret used to authenticate cron -> Edge invocations.
insert into public.internal_runtime_secrets (key, secret)
values (
  'academy_worker_secret',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
on conflict (key) do nothing;

create or replace function public.invoke_academy_worker(p_cycle text default 'dispatch')
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_worker_secret text;
  v_request_id bigint;
  v_cycle text;
begin
  select s.secret into v_worker_secret
  from public.internal_runtime_secrets s
  where s.key = 'academy_worker_secret'
  limit 1;

  if v_worker_secret is null or length(trim(v_worker_secret)) < 32 then
    raise warning 'academy worker invoke skipped: worker secret is missing';
    return null;
  end if;

  v_cycle := coalesce(nullif(trim(p_cycle), ''), 'dispatch');

  select net.http_post(
    url := 'https://bbjawctnqrufvnesdsel.supabase.co/functions/v1/academy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', v_worker_secret
    ),
    body := jsonb_build_object('worker_cycle', v_cycle)
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.invoke_academy_worker(text) from public;

do $$
declare
  v_job_id bigint;
begin
  -- Dispatch cycle: queue due-assignment + class reminders, then send all pending (every 15m).
  for v_job_id in select jobid from cron.job where jobname = 'academy-dispatch-v1' loop
    perform cron.unschedule(v_job_id);
  end loop;
  perform cron.schedule(
    'academy-dispatch-v1',
    '*/15 * * * *',
    $cron$select public.invoke_academy_worker('dispatch');$cron$
  );

  -- At-risk cycle: scan attendance + missing work daily at 14:00 UTC (~19:00 Tashkent).
  for v_job_id in select jobid from cron.job where jobname = 'academy-at-risk-v1' loop
    perform cron.unschedule(v_job_id);
  end loop;
  perform cron.schedule(
    'academy-at-risk-v1',
    '0 14 * * *',
    $cron$select public.invoke_academy_worker('at_risk');$cron$
  );
exception
  when undefined_table then
    raise notice 'pg_cron is unavailable in this environment; academy scheduler not configured';
end
$$;
