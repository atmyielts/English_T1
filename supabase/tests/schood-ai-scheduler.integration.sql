-- Scheduled jobs (20261030180000): a job is claimed once a period, a running job is
-- never claimed twice until its lease runs out, a failure hands the period back for
-- at most three tries, and a new period forgets old failures.
do $$
declare
  t0 constant timestamptz := '2026-11-04T03:02:00Z';
  p0 constant timestamptz := '2026-11-04T03:00:00Z';
  raised boolean;
begin
  assert public.ai_system_claim('centre.brief', p0, 120, t0), 'first claim';
  assert not public.ai_system_claim('centre.brief', p0, 120, t0 + interval '5 minutes'), 'claimed for this period';
  perform public.ai_system_finish('centre.brief', 'ok', null, t0 + interval '10 seconds');
  assert not public.ai_system_claim('centre.brief', p0, 120, t0 + interval '10 minutes'), 'done for the period';
  assert public.ai_system_claim('centre.brief', p0 + interval '1 day', 120, t0 + interval '1 day'), 'the next period';
  assert (select previous_run_at = t0 and last_run_at = t0 + interval '1 day' from public.ai_system_runs where job = 'centre.brief'), 'run times kept';

  -- A run that never finished keeps its lease, then the job can be claimed again.
  assert public.ai_system_claim('engage.hourly', p0, 60, t0);
  assert not public.ai_system_claim('engage.hourly', p0 + interval '1 hour', 60, t0 + interval '30 seconds'), 'still running';
  assert public.ai_system_claim('engage.hourly', p0 + interval '1 hour', 60, t0 + interval '2 minutes'), 'the lease ran out';

  -- Failures: retried on the next tick, at most three times in a period.
  assert public.ai_system_claim('coach.flaky', p0, 60, t0);
  perform public.ai_system_finish('coach.flaky', 'failed', 'upstream_down', t0 + interval '1 second');
  assert public.ai_system_claim('coach.flaky', p0, 60, t0 + interval '5 minutes'), 'retried';
  perform public.ai_system_finish('coach.flaky', 'timeout', 'timed out', t0 + interval '5 minutes 1 second');
  assert public.ai_system_claim('coach.flaky', p0, 60, t0 + interval '10 minutes'), 'third try';
  perform public.ai_system_finish('coach.flaky', 'failed', repeat('e', 500), t0 + interval '10 minutes 1 second');
  assert not public.ai_system_claim('coach.flaky', p0, 60, t0 + interval '15 minutes'), 'three failures, then it waits';
  assert (select failures = 3 and last_status = 'failed' and char_length(last_error) = 200 and running_until is null from public.ai_system_runs where job = 'coach.flaky'), 'failures counted, error cut short';
  assert public.ai_system_claim('coach.flaky', p0 + interval '1 hour', 60, t0 + interval '1 hour'), 'a new period forgets old failures';
  perform public.ai_system_finish('coach.flaky', 'ok', null, t0 + interval '1 hour 1 second');
  assert (select failures = 0 and last_status = 'ok' and last_error is null from public.ai_system_runs where job = 'coach.flaky'), 'success clears the count';

  raised := false;
  begin perform public.ai_system_claim('Centre Brief', p0, 60, t0); exception when invalid_parameter_value then raised := true; end;
  assert raised, 'job names are checked';
  raised := false;
  begin perform public.ai_system_claim('centre.brief', p0, 5, t0); exception when invalid_parameter_value then raised := true; end;
  assert raised, 'leases are 10 to 900 seconds';
  raised := false;
  begin perform public.ai_system_finish('centre.brief', 'done', null, t0); exception when invalid_parameter_value then raised := true; end;
  assert raised, 'statuses are ok, failed or timeout';
end $$;

set role service_role;
do $$
begin
  perform public.ai_system_claim('teacher.digest', now(), 60, now());
  perform count(*) from public.ai_system_runs;
  begin insert into public.ai_system_runs (job) values ('teacher.forged'); raise exception 'service role wrote a run'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
do $$
begin
  begin perform public.ai_system_claim('teacher.digest', now(), 60, now()); raise exception 'a signed-in person claimed a job'; exception when insufficient_privilege then null; end;
  begin perform count(*) from public.ai_system_runs; raise exception 'a signed-in person read the runs'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'schood ai scheduler: ok';
