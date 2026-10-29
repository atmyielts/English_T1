-- Schood AI: conversations are kept for 180 days, and closing an account erases a
-- person's Schood AI records. Additive to 20261030100000_schood_ai_core.sql.
--
-- 1. ai_purge_old_chats(): deletes messages older than the retention period and
--    conversations with no message inside it, in bounded batches. pg_cron runs it
--    daily at 03:29 UTC (away from 03:23 and 03:41, the existing prune jobs).
-- 2. The account erasure registry (account_personal_erasure_tables(), the same
--    additive pattern as 20261026170000_english_account_erasure_registry.sql) gains
--    the ai_* tables keyed on user_id: conversations (messages go with them),
--    generation jobs, learning events, notification preferences and budget, and
--    the call log. Each also gets the closed-account guard trigger.
--    Left out on purpose: ai_credit_ledger (financial record, append-only),
--    ai_workspace_members (a centre's structure), ai_pages (a centre's library;
--    pages keep owner_id null after the user row goes), ai_audit_events and
--    ai_reports (reporter_id, set null with the user row).
-- 3. ai_learning_events stays append-only, but the erasure transaction (a trigger
--    on auth.users) may now delete a closing account's rows: deletes are allowed
--    from inside another trigger, as well as by the users cascade.
begin;

create or replace function public.ai_purge_old_chats(p_days integer default 180, p_limit integer default 20000, p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
set statement_timeout = '60s'
as $$
declare
  cutoff timestamptz;
  v_messages integer;
  v_threads integer;
begin
  if p_days is null or p_days < 30 then raise exception 'retention_too_short' using errcode = '22023'; end if;
  cutoff := p_now - make_interval(days => p_days);
  delete from public.ai_messages where id in (
    select m.id from public.ai_messages m where m.created_at < cutoff order by m.created_at limit greatest(p_limit, 1));
  get diagnostics v_messages = row_count;
  delete from public.ai_threads where id in (
    select t.id from public.ai_threads t where t.last_message_at < cutoff
      and not exists (select 1 from public.ai_messages m where m.thread_id = t.id)
    order by t.last_message_at limit greatest(p_limit, 1));
  get diagnostics v_threads = row_count;
  return jsonb_build_object('messages', v_messages, 'threads', v_threads, 'cutoff', cutoff);
end $$;
revoke all on function public.ai_purge_old_chats(integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.ai_purge_old_chats(integer, integer, timestamptz) to service_role;
create index if not exists ai_messages_created_idx on public.ai_messages (created_at);
create index if not exists ai_threads_last_message_idx on public.ai_threads (last_message_at);

create or replace function public.ai_learning_events_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if new.workspace_id is null and (to_jsonb(new) - 'workspace_id') = (to_jsonb(old) - 'workspace_id') then return new; end if;
    raise exception 'ai_learning_events is append-only' using errcode = '42501';
  end if;
  -- Deletes: the users cascade, or the account erasure transaction (it runs as a trigger).
  if pg_trigger_depth() > 1 or not exists (select 1 from public.users where id = old.user_id) then return old; end if;
  raise exception 'ai_learning_events is append-only' using errcode = '42501';
end $$;

do $$
declare
  relations text[];
  wanted text[] := array['ai_threads', 'ai_generations', 'ai_learning_events', 'ai_notify_prefs', 'ai_notify_daily', 'ai_calls'];
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
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = relation_name and column_name = 'user_id') then
      raise notice 'public.% has no user_id column; not added to the erasure registry', relation_name;
      continue;
    end if;
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
begin
  create extension if not exists pg_cron with schema extensions;
exception
  when others then raise notice 'pg_cron could not be enabled here (%); Schood AI chat retention not scheduled', sqlerrm;
end
$$;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = 'schood-ai-chat-retention-v1' loop
    perform cron.unschedule(v_job_id);
  end loop;
  perform cron.schedule('schood-ai-chat-retention-v1', '29 3 * * *', $cron$select public.ai_purge_old_chats(180);$cron$);
exception
  when undefined_table or undefined_function or invalid_schema_name then
    raise notice 'pg_cron is unavailable in this environment; Schood AI chat retention not scheduled';
end
$$;
