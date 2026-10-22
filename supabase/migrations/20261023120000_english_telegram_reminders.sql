-- English Telegram reminders: pg_cron -> hub /internal/reminders every hour.
-- Learners opt in from English settings (learner_language_goals.metadata.telegram_reminder);
-- with nobody opted in the cycle sends nothing. Same pattern as the academy scheduler.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

insert into public.internal_runtime_secrets (key, secret)
values (
  'english_reminder_secret',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
on conflict (key) do nothing;

create or replace function public.invoke_english_reminders()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  select s.secret into v_secret
  from public.internal_runtime_secrets s
  where s.key = 'english_reminder_secret'
  limit 1;

  if v_secret is null or length(trim(v_secret)) < 32 then
    raise warning 'english reminders skipped: worker secret is missing';
    return null;
  end if;

  select net.http_post(
    url := 'https://bbjawctnqrufvnesdsel.supabase.co/functions/v1/hub/internal/reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', v_secret
    ),
    body := '{}'::jsonb
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.invoke_english_reminders() from public;
revoke all on function public.invoke_english_reminders() from anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = 'english-reminders-v1' loop
    perform cron.unschedule(v_job_id);
  end loop;
  -- Minute 7 keeps it clear of the academy jobs on the quarter hours.
  perform cron.schedule(
    'english-reminders-v1',
    '7 * * * *',
    $cron$select public.invoke_english_reminders();$cron$
  );
exception
  when undefined_table then
    raise notice 'pg_cron is unavailable in this environment; english reminders not scheduled';
end
$$;
