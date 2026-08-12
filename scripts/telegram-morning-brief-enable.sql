\set ON_ERROR_STOP on

do $$
declare
  v_job_id bigint;
begin
  if to_regprocedure('public.invoke_academy_worker(text)') is null then
    raise exception 'invoke_academy_worker(text) is unavailable';
  end if;
  for v_job_id in select jobid from cron.job where jobname = 'academy-morning-brief-v1' loop
    perform cron.unschedule(v_job_id);
  end loop;
  perform cron.schedule(
    'academy-morning-brief-v1',
    '0 2 * * *',
    $cron$select public.invoke_academy_worker('morning_brief');$cron$
  );
end
$$;

select jobid, jobname, schedule, command, active
from cron.job where jobname = 'academy-morning-brief-v1';
