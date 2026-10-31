-- Schood AI after the library: specialist overrides without a name, and (below)
-- conversation retention and account erasure. Runs on PGlite and a real Postgres.
do $$
declare
  teacher constant uuid := '00000000-0000-4000-8000-0000000000a1';
  ws uuid := (public.ai_ensure_personal_workspace(teacher, 'Teacher')).id;
  raised boolean;
begin
  -- A built-in tailored without renaming keeps its own name (null), a blank name is still refused.
  insert into public.ai_specialists (workspace_id, key, name, instructions) values (ws, 'assistant', null, 'Answer in Uzbek first.');
  assert (select name is null from public.ai_specialists where workspace_id = ws and key = 'assistant'), 'null name kept';
  raised := false;
  begin insert into public.ai_specialists (workspace_id, key, name) values (ws, 'blank_name', '   '); exception when check_violation then raised := true; end;
  assert raised, 'blank names are refused';
  delete from public.ai_specialists where workspace_id = ws;
end $$;

-- Retention: messages older than 180 days go, then conversations left empty; recent ones stay.
do $$
declare
  learner constant uuid := '00000000-0000-4000-8000-0000000000a2';
  t0 constant timestamptz := '2027-06-01T03:29:00Z';
  ws uuid := (public.ai_ensure_personal_workspace(learner, 'Learner')).id;
  old_thread uuid;
  mixed_thread uuid;
  fresh_thread uuid;
  r jsonb;
  raised boolean;
begin
  insert into public.ai_threads (workspace_id, user_id, specialist_key, last_message_at) values (ws, learner, 'assistant', t0 - interval '200 days') returning id into old_thread;
  insert into public.ai_threads (workspace_id, user_id, specialist_key, last_message_at) values (ws, learner, 'assistant', t0 - interval '2 days') returning id into mixed_thread;
  insert into public.ai_threads (workspace_id, user_id, specialist_key, last_message_at) values (ws, learner, 'assistant', t0 - interval '1 day') returning id into fresh_thread;
  insert into public.ai_messages (thread_id, role, content, created_at) values
    (old_thread, 'user', 'old question', t0 - interval '200 days'),
    (old_thread, 'assistant', 'old answer', t0 - interval '200 days'),
    (mixed_thread, 'user', 'old part', t0 - interval '190 days'),
    (mixed_thread, 'user', 'recent part', t0 - interval '2 days'),
    (fresh_thread, 'user', 'today', t0 - interval '1 day');
  r := public.ai_purge_old_chats(180, 20000, t0);
  assert (r->>'messages')::int = 3 and (r->>'threads')::int = 1, format('purged %s', r);
  assert not exists (select 1 from public.ai_threads where id = old_thread), 'the old conversation is gone';
  assert (select array_agg(content order by content) from public.ai_messages where thread_id = mixed_thread) = array['recent part'], 'old messages in a live conversation go';
  assert exists (select 1 from public.ai_messages where thread_id = fresh_thread), 'recent conversations stay';
  r := public.ai_purge_old_chats(180, 20000, t0);
  assert (r->>'messages')::int = 0 and (r->>'threads')::int = 0, 'nothing left to purge';
  raised := false;
  begin perform public.ai_purge_old_chats(7, 10, t0); exception when invalid_parameter_value then raised := true; end;
  assert raised, 'retention cannot be set below 30 days';
  delete from public.ai_threads where workspace_id = ws;
end $$;

-- Erasure registry: the ai_* tables keyed on user_id are listed (once), and learning
-- events can be deleted by the erasure transaction (a trigger) but not directly.
do $$
declare
  learner constant uuid := '00000000-0000-4000-8000-0000000000a2';
  listed text[] := public.account_personal_erasure_tables();
  raised boolean;
begin
  assert listed @> array['user_profiles', 'ai_threads', 'ai_generations', 'ai_learning_events', 'ai_notify_prefs', 'ai_notify_daily', 'ai_calls'], format('registry %s', listed);
  assert cardinality(listed) = 7, 'listed once, even after running the migration again';
  assert not (listed && array['ai_credit_ledger', 'ai_workspace_members', 'ai_pages']), 'financial and centre records are not erased';
  assert exists (select 1 from pg_trigger where tgname = 'account_closed_personal_guard' and tgrelid = 'public.ai_threads'::regclass), 'closed-account guard installed';
  insert into public.ai_learning_events (user_id, area, kind, verified, feature, source) values (learner, 'core', 'goal_set', false, 'CORE', 'web');
  raised := false;
  begin delete from public.ai_learning_events where user_id = learner; exception when insufficient_privilege then raised := true; end;
  assert raised, 'learning events stay append-only outside erasure';
end $$;
create temporary table erasure_probe (user_id uuid);
create function pg_temp.erase_probe() returns trigger language plpgsql as $$ begin delete from public.ai_learning_events where user_id = new.user_id; return new; end $$;
create trigger erase_probe after insert on erasure_probe for each row execute function pg_temp.erase_probe();
insert into erasure_probe values ('00000000-0000-4000-8000-0000000000a2');
do $$
begin
  assert not exists (select 1 from public.ai_learning_events where user_id = '00000000-0000-4000-8000-0000000000a2'), 'the erasure transaction may delete them';
end $$;
drop table erasure_probe;
select 'schood ai polish: ok';
