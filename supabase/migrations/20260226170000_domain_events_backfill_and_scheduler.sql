-- ============================================================================
-- Phase 3: exam.result backfill + domain-events scheduler
-- ----------------------------------------------------------------------------
-- 1) Backfill outbox events for historical exam_outcomes rows
-- 2) Add DB-side scheduler to process domain_event_outbox continuously
-- ============================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

create or replace function public.backfill_exam_result_outbox(p_limit integer default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_inserted integer := 0;
begin
  v_limit := case
    when p_limit is null or p_limit < 1 then 2147483647
    else p_limit
  end;

  with source_rows as (
    select
      eo.id as outcome_id,
      eo.session_id,
      eo.user_id,
      eo.product_id,
      eo.experience_id,
      eo.schema_version,
      eo.score_method,
      eo.status,
      eo.overall_score,
      eo.overall_band,
      eo.section_scores,
      eo.skill_breakdown,
      eo.raw_result,
      eo.computed_at
    from public.exam_outcomes eo
    where not exists (
      select 1
      from public.domain_event_outbox deo
      where deo.idempotency_key = format('exam.result.v1:%s', eo.session_id)
    )
    order by eo.computed_at asc
    limit v_limit
  ),
  inserted as (
    insert into public.domain_event_outbox (
      event_type,
      event_version,
      aggregate_type,
      aggregate_id,
      user_id,
      occurred_at,
      payload,
      status,
      attempts,
      idempotency_key
    )
    select
      'exam.result'::text as event_type,
      'v1'::text as event_version,
      'session'::text as aggregate_type,
      s.session_id as aggregate_id,
      s.user_id,
      coalesce(s.computed_at, now()) as occurred_at,
      jsonb_build_object(
        'schema_version', coalesce(nullif(trim(s.schema_version), ''), 'exam.result.v1'),
        'source', 'backfill',
        'outcome_id', s.outcome_id,
        'session_id', s.session_id,
        'user_id', s.user_id,
        'product_id', s.product_id,
        'experience_id', s.experience_id,
        'score_method', s.score_method,
        'status', s.status,
        'overall_score', s.overall_score,
        'overall_band', s.overall_band,
        'section_scores', coalesce(s.section_scores, '{}'::jsonb),
        'skill_breakdown', coalesce(s.skill_breakdown, '{}'::jsonb),
        'raw_result', coalesce(s.raw_result, '{}'::jsonb),
        'computed_at', s.computed_at
      ) as payload,
      'pending'::text as status,
      0 as attempts,
      format('exam.result.v1:%s', s.session_id) as idempotency_key
    from source_rows s
    on conflict (idempotency_key) do nothing
    returning 1
  )
  select count(*) into v_inserted from inserted;

  return coalesce(v_inserted, 0);
end;
$$;

revoke all on function public.backfill_exam_result_outbox(integer) from public;

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
  v_service_role_key text;
  v_request_id bigint;
  v_limit integer;
  v_event_type text;
begin
  v_service_role_key := nullif(current_setting('app.settings.service_role_key', true), '');
  if v_service_role_key is null then
    raise warning 'domain-events invoke skipped: app.settings.service_role_key is not available';
    return null;
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 50), 200));
  v_event_type := coalesce(nullif(trim(p_event_type), ''), 'exam.result');

  select net.http_post(
    url := 'https://bbjawctnqrufvnesdsel.supabase.co/functions/v1/domain-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
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
declare
  v_inserted integer;
begin
  select public.backfill_exam_result_outbox(null) into v_inserted;
  raise notice 'Backfilled exam.result outbox rows: %', v_inserted;
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
