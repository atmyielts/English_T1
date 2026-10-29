-- Schood AI core: workspaces, credit cycles, charges, refunds, budgets, caps,
-- the append-only ledger, the registry seed and browser isolation. Plain SQL so
-- it runs on PGlite and on a real Postgres (scripts/test-schood-ai-db.mjs).
do $$
declare
  owner constant uuid := '00000000-0000-4000-8000-0000000000a1';
  learner constant uuid := '00000000-0000-4000-8000-0000000000a2';
  student constant uuid := '00000000-0000-4000-8000-0000000000a3';
  outsider constant uuid := '00000000-0000-4000-8000-0000000000a4';
  t0 constant timestamptz := '2026-11-01T09:00:00Z';
  ws public.ai_workspaces;
  again public.ai_workspaces;
  centre uuid;
  r jsonb;
  charge uuid;
  raised boolean;
begin
  -- Personal workspace: created once, owner only.
  ws := public.ai_ensure_personal_workspace(learner, 'Dilnoza');
  again := public.ai_ensure_personal_workspace(learner, 'Other name');
  assert ws.id = again.id and again.name = 'Dilnoza', 'personal workspace is created once';
  assert (select count(*) from public.ai_workspace_members where workspace_id = ws.id) = 1, 'owner membership';
  raised := false;
  begin
    insert into public.ai_workspace_members (workspace_id, user_id, role) values (ws.id, student, 'student');
  exception when check_violation then raised := sqlerrm = 'personal_workspace_single_member';
  end;
  assert raised, 'nobody else joins a personal workspace';

  -- No plan: no credits, nothing granted.
  r := public.ai_credit_balance(ws.id, 0, null, t0);
  assert (r->>'total')::int = 0 and r->'cycle_ends_at' = 'null'::jsonb, 'free users have no credits';
  r := public.ai_credit_charge(ws.id, learner, 1, 'tutor.reply', 'req-0', 0, null, t0);
  assert r->>'ok' = 'false' and r->>'code' = 'insufficient_credits', 'free users cannot be charged';

  -- A plan grants its cycle once; the same cycle does not grant again.
  r := public.ai_credit_balance(ws.id, 1500, null, t0);
  assert (r->>'plan')::int = 1500 and (r->>'cycle_ends_at')::timestamptz = t0 + interval '30 days', 'first cycle granted';
  r := public.ai_credit_balance(ws.id, 1500, null, t0 + interval '1 day');
  assert (r->>'plan')::int = 1500, 'same cycle, no second grant';
  assert (select count(*) from public.ai_credit_ledger where workspace_id = ws.id and kind = 'grant') = 1, 'one grant row';

  -- Charges: exact cost, idempotent per request key.
  r := public.ai_credit_charge(ws.id, learner, 10, 'material.generate', 'req-1', 1500, null, t0 + interval '1 day');
  assert r->>'ok' = 'true' and (r->>'plan')::int = 10 and (r->'balance'->>'plan')::int = 1490, 'charged from plan credits';
  charge := (r->>'charge_id')::uuid;
  r := public.ai_credit_charge(ws.id, learner, 10, 'material.generate', 'req-1', 1500, null, t0 + interval '1 day');
  assert r->>'replayed' = 'true' and (r->>'charge_id')::uuid = charge and (r->'balance'->>'plan')::int = 1490, 'a retried request is not charged twice';

  -- Refunds: once, exactly what was taken.
  r := public.ai_credit_refund(charge);
  assert (r->>'refunded')::int = 10 and (r->'balance'->>'plan')::int = 1500, 'refunded';
  r := public.ai_credit_refund(charge);
  assert r->>'replayed' = 'true' and (r->>'refunded')::int = 0 and (r->'balance'->>'plan')::int = 1500, 'refunding twice refunds once';
  r := public.ai_credit_charge(ws.id, learner, 10, 'material.generate', 'req-1', 1500, null, t0 + interval '1 day');
  assert r->>'ok' = 'false' and r->>'code' = 'reference_refunded', 'a refunded attempt is not a free retry';
  assert (public.ai_credit_refund('00000000-0000-4000-8000-00000000dead'))->>'code' = 'charge_not_found', 'unknown charge';

  -- Packs: never expire, used after plan credits, idempotent per order.
  r := public.ai_credit_grant(ws.id, 100, 'pack', 'order-1', learner);
  assert (r->'balance'->>'pack')::int = 100, 'pack granted';
  r := public.ai_credit_grant(ws.id, 100, 'pack', 'order-1', learner);
  assert r->>'replayed' = 'true' and (r->'balance'->>'pack')::int = 100, 'an order is granted once';
  r := public.ai_credit_charge(ws.id, learner, 1495, 'course.outline', 'req-2', 1500, null, t0 + interval '2 days');
  r := public.ai_credit_charge(ws.id, learner, 8, 'essay.review', 'req-3', 1500, null, t0 + interval '2 days');
  assert (r->>'plan')::int = 5 and (r->>'pack')::int = 3 and (r->'balance'->>'pack')::int = 97, 'plan first, then pack';
  r := public.ai_credit_refund((r->>'charge_id')::uuid);
  assert (r->'balance'->>'plan')::int = 5 and (r->'balance'->>'pack')::int = 100, 'a split charge refunds into both buckets';

  -- Upgrade inside a cycle adds the difference once.
  r := public.ai_credit_balance(ws.id, 4500, null, t0 + interval '3 days');
  assert (r->>'plan')::int = 3005, 'upgrade tops up the difference';
  r := public.ai_credit_balance(ws.id, 4500, null, t0 + interval '4 days');
  assert (r->>'plan')::int = 3005, 'only once';

  -- The next cycle expires what is left and grants afresh; packs stay.
  r := public.ai_credit_balance(ws.id, 4500, null, t0 + interval '31 days');
  assert (r->>'plan')::int = 4500 and (r->>'pack')::int = 100, 'new cycle';
  assert (select delta from public.ai_credit_ledger where workspace_id = ws.id and kind = 'expire' order by id desc limit 1) = -3005, 'unused plan credits expired';

  -- Cycles follow the entitlement: a month without visits still has one grant per cycle,
  -- and a renewal with a new start date starts a new run from that date.
  r := public.ai_credit_balance(ws.id, 0, null, t0 + interval '40 days');
  r := public.ai_credit_balance(ws.id, 4500, null, t0 + interval '55 days');
  assert (r->>'plan')::int = 4500, 'no visits for weeks: still the same cycle, no early grant';
  r := public.ai_credit_balance(ws.id, 1500, t0 + interval '70 days', t0 + interval '71 days');
  assert (r->>'plan')::int = 1500 and (r->>'cycle_ends_at')::timestamptz = t0 + interval '100 days', 'a renewal starts a new run at its start date';
  r := public.ai_credit_balance(ws.id, 1500, t0 + interval '70 days', t0 + interval '85 days');
  assert (r->>'plan')::int = 1500, 'the same entitlement is not granted twice in its cycle';

  -- The ledger explains every balance exactly.
  assert (select sum(delta) from public.ai_credit_ledger where workspace_id = ws.id and bucket = 'plan') = (select plan_balance from public.ai_credit_accounts where workspace_id = ws.id), 'plan ledger sums to balance';
  assert (select sum(delta) from public.ai_credit_ledger where workspace_id = ws.id and bucket = 'pack') = (select pack_balance from public.ai_credit_accounts where workspace_id = ws.id), 'pack ledger sums to balance';

  -- Centre: pooled credits, members only, monthly budgets.
  insert into public.ai_workspaces (kind, name, owner_id) values ('centre', 'Registan Learning Centre', owner) returning id into centre;
  insert into public.ai_workspace_members (workspace_id, user_id, role) values (centre, owner, 'owner');
  insert into public.ai_workspace_members (workspace_id, user_id, role, credit_budget) values (centre, student, 'student', 5);
  r := public.ai_credit_charge(centre, outsider, 1, 'student_assistant.reply', 'c-0', 10000, null, t0);
  assert r->>'code' = 'not_member', 'outsiders cannot spend the pool';
  r := public.ai_credit_charge(centre, student, 3, 'student_assistant.reply', 'c-1', 10000, null, t0);
  assert r->>'ok' = 'true' and (r->'balance'->>'plan')::int = 9997, 'student spends the pool';
  charge := (r->>'charge_id')::uuid;
  r := public.ai_credit_charge(centre, student, 3, 'student_assistant.reply', 'c-2', 10000, null, t0);
  assert r->>'code' = 'budget_exhausted' and (r->>'used')::int = 3, 'budget stops the student';
  perform public.ai_credit_refund(charge);
  assert (select budget_used from public.ai_workspace_members where workspace_id = centre and user_id = student) = 0, 'refund restores the budget';
  r := public.ai_credit_charge(centre, student, 5, 'student_assistant.reply', 'c-3', 10000, null, t0 + interval '31 days');
  assert r->>'ok' = 'true', 'the budget turns over with the month';
  r := public.ai_credit_charge(centre, owner, 50, 'owner.brief', 'c-4', 10000, null, t0 + interval '31 days');
  assert r->>'ok' = 'true', 'no budget means no limit';
  update public.ai_workspace_members set status = 'suspended' where workspace_id = centre and user_id = student;
  assert (public.ai_credit_charge(centre, student, 1, 'student_assistant.reply', 'c-5', 10000, null, t0 + interval '31 days'))->>'code' = 'not_member', 'suspended members cannot spend';

  -- Invalid input is refused loudly.
  raised := false;
  begin perform public.ai_credit_charge(ws.id, learner, 0, 'tutor.reply', 'bad', 0, null, t0); exception when invalid_parameter_value then raised := true; end;
  assert raised, 'zero cost refused';
  raised := false;
  begin perform public.ai_credit_charge('00000000-0000-4000-8000-00000000beef', learner, 1, 'tutor.reply', 'bad', 0, null, t0); exception when no_data_found then raised := true; end;
  assert raised, 'unknown workspace refused';

  -- Append-only ledger.
  raised := false;
  begin update public.ai_credit_ledger set delta = 999 where workspace_id = ws.id; exception when insufficient_privilege then raised := true; end;
  assert raised, 'ledger rows cannot change';
  raised := false;
  begin delete from public.ai_credit_ledger where workspace_id = ws.id; exception when insufficient_privilege then raised := true; end;
  assert raised, 'ledger rows cannot be deleted';

  -- Caps: all or nothing, per day.
  assert (public.ai_take_call('2026-11-01', learner, ws.id, 2, 10, 10))->>'ok' = 'true', 'call 1';
  assert (public.ai_take_call('2026-11-01', student, centre, 2, 10, 10))->>'ok' = 'true', 'call 2';
  assert (public.ai_take_call('2026-11-01', learner, ws.id, 2, 10, 10))->>'scope' = 'global', 'global cap';
  assert (select calls from public.ai_usage_daily where day = '2026-11-01' and scope = 'user' and scope_id = learner) = 1, 'a refused call takes nothing';
  assert (public.ai_take_call('2026-11-02', learner, ws.id, 100, 1, 10))->>'ok' = 'true', 'new day';
  assert (public.ai_take_call('2026-11-02', learner, ws.id, 100, 1, 10))->>'scope' = 'user', 'user cap';
  assert (public.ai_take_call('2026-11-02', student, ws.id, 100, 10, 1))->>'scope' = 'workspace', 'workspace cap';
  insert into public.ai_calls (call_id, feature, user_id, workspace_id, status, cost_usd, created_at)
    values (gen_random_uuid(), 'tutor.reply', learner, ws.id, 'ok', 2.5, '2026-11-03T10:00:00Z');
  assert (public.ai_take_call('2026-11-03', learner, ws.id, 100, 10, 10, 2.5))->>'scope' = 'spend', 'spend cap counts recorded cost';
  assert (public.ai_take_call('2026-11-03', learner, ws.id, 100, 10, 10, 5))->>'ok' = 'true', 'under the spend cap';

  -- Registry seed and its guards.
  assert (select model_keys from public.ai_model_routes where key = 'default') = array['openrouter/google/gemma-4-31b-it:free'], 'default route seeded';
  assert (select api_key_env from public.ai_providers where key = 'openrouter') = 'OPENROUTER_API_KEY', 'provider names its secret';
  raised := false;
  begin insert into public.ai_providers (key, adapter, display_name, base_url, api_key_env) values ('leak', 'openai_compatible', 'Leak', 'https://evil.example', 'SUPABASE_SERVICE_ROLE_KEY');
  exception when check_violation then raised := true; end;
  assert raised, 'a provider cannot name a Supabase secret';
  raised := false;
  begin insert into public.ai_providers (key, adapter, display_name, base_url, api_key_env) values ('plain', 'openai_compatible', 'Plain', 'http://example.com', 'SCHOOD_AI_KEY_X');
  exception when check_violation then raised := true; end;
  assert raised, 'https only';

  -- Deleting a person or a workspace keeps the accounting, unlinked (20261030150000).
  delete from public.users where id = student;
  assert (select count(*) from public.ai_credit_ledger where workspace_id = centre and user_id is null and kind = 'charge') >= 2, 'charges stay, the person is cleared';
  r := jsonb_build_object('rows', (select count(*) from public.ai_credit_ledger where workspace_id = centre));
  delete from public.ai_workspaces where id = centre;
  assert not exists (select 1 from public.ai_credit_ledger where workspace_id = centre), 'the deleted workspace is unlinked';
  assert (select count(*) from public.ai_credit_ledger where workspace_id is null) >= (r->>'rows')::int, 'its ledger rows stay';
end $$;

-- Learning events and the notification budget.
insert into public.users (id) values ('00000000-0000-4000-8000-0000000000a5');
do $$
declare
  learner constant uuid := '00000000-0000-4000-8000-0000000000a2';
  leaver constant uuid := '00000000-0000-4000-8000-0000000000a5';
  r jsonb;
  raised boolean;
begin
  insert into public.ai_learning_events (user_id, area, kind, verified, feature, skill, verified_minutes, score)
    values (learner, 'coach', 'turn_scored', true, 'B1', 'ielts.speaking.fluency', 4, 6.5),
           (learner, 'learner', 'lesson_viewed', false, 'L10', null, 0, null),
           (leaver, 'coach', 'check_passed', true, 'B4', 'sales.objections.price', 2, null);
  raised := false;
  begin insert into public.ai_learning_events (user_id, area, kind, verified, feature) values (learner, 'learner', 'lesson_viewed', true, 'L10');
  exception when check_violation then raised := true; end;
  assert raised, 'opening something is never verified';
  raised := false;
  begin insert into public.ai_learning_events (user_id, area, kind, verified, feature, verified_minutes) values (learner, 'learner', 'check_failed', false, 'L2', 5);
  exception when check_violation then raised := true; end;
  assert raised, 'unverified events earn no minutes';
  raised := false;
  begin update public.ai_learning_events set verified_minutes = 240 where user_id = learner; exception when insufficient_privilege then raised := true; end;
  assert raised, 'learning events cannot change';
  raised := false;
  begin delete from public.ai_learning_events where user_id = learner; exception when insufficient_privilege then raised := true; end;
  assert raised, 'learning events cannot be deleted';
  delete from public.users where id = leaver;
  assert not exists (select 1 from public.ai_learning_events where user_id = leaver), 'deleting a person removes their events';

  -- 08:30 in Tashkent: allowed; two a day at most; 22:30 is quiet until 08:00.
  r := public.ai_notify(learner, 'coach.ielts', true, '2026-11-01T03:30:00Z');
  assert r->>'allowed' = 'true' and (r->>'remaining')::int = 1, 'first notification';
  r := public.ai_notify(learner, 'coach.sales', false, '2026-11-01T04:00:00Z');
  assert r->>'allowed' = 'true' and (r->>'remaining')::int = 1, 'checking does not count';
  r := public.ai_notify(learner, 'coach.sales', true, '2026-11-01T04:00:00Z');
  r := public.ai_notify(learner, 'winback', true, '2026-11-01T05:00:00Z');
  assert r->>'reason' = 'daily_limit' and (r->>'retry_at')::timestamptz = '2026-11-02T03:00:00Z', 'two a day across all bots';
  r := public.ai_notify(learner, 'coach.ielts', false, '2026-11-01T17:30:00Z');
  assert r->>'reason' = 'quiet_hours' and (r->>'retry_at')::timestamptz = '2026-11-02T03:00:00Z', 'quiet after 22:00 Tashkent';
  r := public.ai_notify(learner, 'coach.ielts', false, '2026-11-01T22:00:00Z');
  assert r->>'reason' = 'quiet_hours' and (r->>'retry_at')::timestamptz = '2026-11-02T03:00:00Z', 'quiet before 08:00 Tashkent';
  assert (public.ai_notify(learner, 'coach.ielts', false, '2026-11-02T03:00:00Z'))->>'allowed' = 'true', 'a new local day';
  insert into public.ai_notify_prefs (user_id, time_zone) values ('00000000-0000-4000-8000-0000000000a1', 'Europe/Moscow');
  assert (public.ai_notify('00000000-0000-4000-8000-0000000000a1', 'coach.ielts', false, '2026-11-01T17:30:00Z'))->>'allowed' = 'true', '20:30 in Moscow is not quiet';
end $$;

-- Browsers get nothing; the function cannot write money-like state directly.
set role authenticated;
do $$
begin
  begin perform 1 from public.ai_workspaces; raise exception 'authenticated read workspaces'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.ai_messages; raise exception 'authenticated read messages'; exception when insufficient_privilege then null; end;
  begin perform public.ai_credit_charge('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a2', 1, 'tutor.reply', 'x', 0, null, now()); raise exception 'authenticated charged'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$
begin
  begin perform 1 from public.ai_providers; raise exception 'anon read providers'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role service_role;
do $$
declare ws uuid := (select id from public.ai_workspaces where kind = 'personal' limit 1);
begin
  begin insert into public.ai_credit_ledger (workspace_id, kind, bucket, delta, balance_after, reference) values (ws, 'pack', 'pack', 1000, 1000, 'forged'); raise exception 'service role forged credits'; exception when insufficient_privilege then null; end;
  begin update public.ai_credit_accounts set pack_balance = 1000000; raise exception 'service role set a balance'; exception when insufficient_privilege then null; end;
  begin update public.ai_usage_daily set calls = 0; raise exception 'service role reset caps'; exception when insufficient_privilege then null; end;
  begin update public.ai_calls set cost_usd = 0; raise exception 'service role rewrote the call log'; exception when insufficient_privilege then null; end;
  begin perform public.ai_credit_sync(ws, 1000000, null, now()); raise exception 'service role called the internal sync'; exception when insufficient_privilege then null; end;
  begin update public.ai_learning_events set score = 9; raise exception 'service role rewrote learning'; exception when insufficient_privilege then null; end;
  begin update public.ai_notify_daily set sent = 0; raise exception 'service role reset the notification budget'; exception when insufficient_privilege then null; end;
  insert into public.ai_learning_events (user_id, area, kind, verified, feature, source) values ('00000000-0000-4000-8000-0000000000a2', 'core', 'goal_set', false, 'CORE', 'telegram');
  perform public.ai_notify('00000000-0000-4000-8000-0000000000a2', 'coach.ielts', false, now());
  -- What the function is meant to do still works.
  perform public.ai_credit_balance(ws, 0, null, now());
  perform public.ai_take_call(current_date, null, ws, 100, 100, 100);
  insert into public.ai_calls (call_id, feature, status) values (gen_random_uuid(), 'assistant.reply', 'ok');
end $$;
reset role;
select 'schood ai core: ok';
