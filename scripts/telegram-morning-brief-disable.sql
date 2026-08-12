\set ON_ERROR_STOP on

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = 'academy-morning-brief-v1' loop
    perform cron.unschedule(v_job_id);
  end loop;
end
$$;

select count(*) as remaining_jobs
from cron.job where jobname = 'academy-morning-brief-v1';
