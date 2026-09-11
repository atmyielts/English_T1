-- Keep background Edge Function invocations from amplifying database pressure.
--
-- These workers previously started together every one or two minutes. When the
-- Data API slowed down, an invocation could run for 150 seconds while another
-- invocation started, creating a self-sustaining retry backlog. Five-minute,
-- staggered schedules keep the bounded maintenance delay while preventing that
-- overlap and removing the synchronized burst.
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname in (
      'academy-automation-events-worker-v1',
      'domain-events-worker-v1',
      'domain-events-v2-language-signal-worker'
    )
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'academy-automation-events-worker-v1',
    '*/5 * * * *',
    $cron$select public.invoke_academy_worker('automation_events');$cron$
  );

  perform cron.schedule(
    'domain-events-worker-v1',
    '1,6,11,16,21,26,31,36,41,46,51,56 * * * *',
    $cron$select public.invoke_domain_events_worker(100, 'exam.result');$cron$
  );

  perform cron.schedule(
    'domain-events-v2-language-signal-worker',
    '3,8,13,18,23,28,33,38,43,48,53,58 * * * *',
    $cron$select public.invoke_domain_events_worker_v2(100, 'language.signal.v1');$cron$
  );
exception
  when undefined_table then
    raise notice 'pg_cron is unavailable; background worker schedules were not changed';
end
$$;
