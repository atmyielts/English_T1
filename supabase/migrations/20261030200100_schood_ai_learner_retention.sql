-- Schood AI learners: retention and account erasure.
-- ============================================================================
-- 1. ai_learner_purge_old(): the learner area keeps practice records (drafts,
--    speaking transcripts, briefs) and activity summaries no longer than chats
--    are kept (180 days, 20261030130000). An active study plan is kept while it
--    is in use. Bounded batches; pg_cron runs it daily when available.
-- 2. The account erasure registry (account_personal_erasure_tables(), the same
--    additive pattern as 20261030130000) gains the learner tables keyed on
--    user_id, each with the closed-account guard. Family links and duels are
--    keyed on parent/child/creator and go with the users cascade.
-- ============================================================================
begin;

create or replace function public.ai_learner_purge_old(p_days integer default 180, p_limit integer default 20000, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cutoff timestamptz := p_now - make_interval(days => greatest(p_days, 30));
  v_records integer;
  v_activity integer;
begin
  with doomed as (
    select id from public.ai_learner_records
    where updated_at < v_cutoff and not (kind = 'plan' and status = 'active')
    limit p_limit
  )
  delete from public.ai_learner_records r using doomed where r.id = doomed.id;
  get diagnostics v_records = row_count;
  with doomed as (select id from public.ai_learner_activity where created_at < v_cutoff limit p_limit)
  delete from public.ai_learner_activity a using doomed where a.id = doomed.id;
  get diagnostics v_activity = row_count;
  return jsonb_build_object('records', v_records, 'activity', v_activity);
end $$;
revoke all on function public.ai_learner_purge_old(integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.ai_learner_purge_old(integer, integer, timestamptz) to service_role;

do $$
declare
  relations text[];
  wanted text[] := array['ai_learner_consents', 'ai_learner_activity', 'ai_learner_records', 'ai_learner_briefs', 'ai_learner_snapshots', 'ai_learner_telegram'];
  relation_name text;
  guard_installed boolean := to_regprocedure('public.guard_closed_personal_record()') is not null;
begin
  if to_regprocedure('public.account_personal_erasure_tables()') is null then
    raise notice 'account_personal_erasure_tables() is not installed; erasure registry not extended';
    return;
  end if;
  relations := public.account_personal_erasure_tables();
  foreach relation_name in array wanted loop
    if to_regclass(format('public.%I', relation_name)) is null then continue; end if;
    if not (relation_name = any(relations)) then
      relations := relations || relation_name;
      if guard_installed then
        execute format('drop trigger if exists account_closed_personal_guard on public.%I', relation_name);
        execute format('create trigger account_closed_personal_guard before insert or update on public.%I for each row execute function public.guard_closed_personal_record(%L)', relation_name, 'user_id');
      end if;
    end if;
  end loop;
  execute format(
    'create or replace function public.account_personal_erasure_tables() returns text[] language sql immutable set search_path=pg_catalog,public as %L',
    format('select %L::text[];', relations::text)
  );
end
$$;

commit;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = 'schood-ai-learner-retention-v1' loop
    perform cron.unschedule(v_job_id);
  end loop;
  perform cron.schedule('schood-ai-learner-retention-v1', '41 3 * * *', $cron$select public.ai_learner_purge_old(180);$cron$);
exception
  when undefined_table or undefined_function or invalid_schema_name then
    raise notice 'pg_cron is unavailable in this environment; Schood AI learner retention not scheduled';
end
$$;
