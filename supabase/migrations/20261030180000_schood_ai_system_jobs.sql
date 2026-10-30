-- Schood AI: one scheduler for every area's scheduled work. Additive.
--
-- pg_cron calls core/system-tick every five minutes (through invoke_schood_ai_system,
-- 20261030160000). The tick runs each job an area registered in code
-- (registerSystemJob: every N minutes, daily at a local time, or weekly) that is due
-- and not already running. ai_system_claim makes "due and not running" atomic, so
-- two ticks never run the same job twice. A failed job is retried on the next tick,
-- at most three times in one period.
begin;

create table if not exists public.ai_system_runs (
  job text primary key check (job ~ '^[a-z][a-z0-9_.-]{1,60}$'),
  last_run_at timestamptz,
  previous_run_at timestamptz,
  running_until timestamptz,
  failures smallint not null default 0 check (failures >= 0),
  last_status text check (last_status is null or last_status in ('ok', 'failed', 'timeout')),
  last_error text check (last_error is null or char_length(last_error) <= 200),
  last_finished_at timestamptz
);
alter table public.ai_system_runs enable row level security;
revoke all on public.ai_system_runs from anon, authenticated;
revoke insert, update, delete, truncate on public.ai_system_runs from service_role;

-- Claims a job for this period: true when it has not run since p_period_start and
-- is not running now. The lease ends at p_now + p_lease_seconds. Failures from an
-- earlier period are forgotten.
create or replace function public.ai_system_claim(p_job text, p_period_start timestamptz, p_lease_seconds integer, p_now timestamptz default now())
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare claimed text;
begin
  if p_job is null or p_job !~ '^[a-z][a-z0-9_.-]{1,60}$' then raise exception 'invalid_job' using errcode = '22023'; end if;
  if p_lease_seconds is null or p_lease_seconds not between 10 and 900 then raise exception 'invalid_lease' using errcode = '22023'; end if;
  update public.ai_system_runs set failures = 0
    where job = p_job and failures > 0 and (last_finished_at is null or last_finished_at < p_period_start);
  insert into public.ai_system_runs as r (job, last_run_at, previous_run_at, running_until, failures)
    values (p_job, p_now, null, p_now + make_interval(secs => p_lease_seconds), 0)
    on conflict (job) do update set
      previous_run_at = r.last_run_at,
      last_run_at = p_now,
      running_until = p_now + make_interval(secs => p_lease_seconds)
    where (r.last_run_at is null or r.last_run_at < p_period_start)
      and (r.running_until is null or r.running_until < p_now)
      and r.failures < 3
    returning job into claimed;
  return claimed is not null;
end $$;

-- Ends a run. A failure hands the period back (the next tick retries) until it has
-- failed three times in this period.
create or replace function public.ai_system_finish(p_job text, p_status text, p_error text default null, p_now timestamptz default now())
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_status not in ('ok', 'failed', 'timeout') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.ai_system_runs set
    running_until = null,
    last_status = p_status,
    last_error = left(p_error, 200),
    last_finished_at = p_now,
    failures = case when p_status = 'ok' then 0 else failures + 1 end,
    last_run_at = case when p_status = 'ok' or failures + 1 >= 3 then last_run_at else previous_run_at end
  where job = p_job;
end $$;

revoke all on function public.ai_system_claim(text, timestamptz, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.ai_system_finish(text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.ai_system_claim(text, timestamptz, integer, timestamptz) to service_role;
grant execute on function public.ai_system_finish(text, text, text, timestamptz) to service_role;
grant select on public.ai_system_runs to service_role;

commit;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = 'schood-ai-system-tick-v1' loop
    perform cron.unschedule(v_job_id);
  end loop;
  -- Minutes 2, 7, 12…: clear of the quarter-hour academy jobs and the hourly minute-7 reminders' start.
  perform cron.schedule('schood-ai-system-tick-v1', '2-59/5 * * * *', $cron$select public.invoke_schood_ai_system('core/system-tick');$cron$);
exception
  when undefined_table or undefined_function or invalid_schema_name then
    raise notice 'pg_cron is unavailable in this environment; the Schood AI system tick is not scheduled';
end
$$;
