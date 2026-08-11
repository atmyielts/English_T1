-- Complete the Academy event loop: lifecycle evidence -> durable outbox -> bounded automation worker.
create or replace function public.academy_publish_lifecycle_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.domain_event_outbox(
    event_type,event_version,aggregate_type,aggregate_id,user_id,occurred_at,payload,status,attempts,idempotency_key
  ) values (
    new.event_key,'v1','academy_lifecycle',new.id,new.actor_user_id,new.occurred_at,
    jsonb_build_object(
      'academy_automation_event',true,
      'academy_id',new.academy_id,
      'lifecycle_event_id',new.id,
      'branch_id',new.branch_id,
      'lead_id',new.lead_id,
      'contact_id',new.contact_id,
      'classroom_id',new.classroom_id,
      'subscription_id',new.subscription_id,
      'guardian_relationship_id',new.guardian_relationship_id,
      'source_table',new.source_table,
      'source_id',new.source_id,
      'evidence',new.evidence
    ),
    'pending',0,'academy.lifecycle:'||new.id::text
  ) on conflict(idempotency_key) do nothing;
  return new;
end;
$$;

revoke all on function public.academy_publish_lifecycle_event() from public,anon,authenticated;

drop trigger if exists academy_publish_lifecycle_event on public.academy_student_lifecycle_events;
create trigger academy_publish_lifecycle_event
after insert on public.academy_student_lifecycle_events
for each row execute function public.academy_publish_lifecycle_event();

-- The existing Academy worker is authenticated with a DB-managed secret and is
-- already the bounded monolith worker for reminders, dispatch, and risk scans.
-- Add a separate frequent cycle for event-triggered automation without adding
-- another service or exposing a public RPC.
do $$
declare v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname='academy-automation-events-worker-v1' loop
    perform cron.unschedule(v_job_id);
  end loop;
  perform cron.schedule(
    'academy-automation-events-worker-v1',
    '* * * * *',
    $cron$select public.invoke_academy_worker('automation_events');$cron$
  );
exception when undefined_table then
  raise notice 'pg_cron is unavailable; Academy automation event scheduler was not configured';
end;
$$;
