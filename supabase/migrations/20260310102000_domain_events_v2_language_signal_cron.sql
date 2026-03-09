-- ============================================================================
-- Shadow cron for language.signal.v1 processing via domain-events-v2
-- ----------------------------------------------------------------------------
-- Safe by design:
-- - only processes language.signal.v1 (does not consume exam.result)
-- - does not modify existing domain-events worker schedule
-- ============================================================================

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'domain-events-v2-language-signal-worker'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'domain-events-v2-language-signal-worker',
    '*/2 * * * *',
    $cron$select public.invoke_domain_events_worker_v2(100, 'language.signal.v1');$cron$
  );
exception
  when undefined_table then
    raise notice 'pg_cron is unavailable in this environment; v2 shadow scheduler not configured';
end
$$;

do $$
begin
  perform public.invoke_domain_events_worker_v2(200, 'language.signal.v1');
exception
  when others then
    raise notice 'Initial domain-events-v2 language.signal invocation failed: %', sqlerrm;
end
$$;
