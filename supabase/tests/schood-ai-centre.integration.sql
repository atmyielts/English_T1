-- Schood AI centres: creating a centre (Academy-linked once), invites with seats,
-- student places, expiry, revocation and max uses, budgets from role defaults,
-- members with names, public counters, staff links, knowledge search, usage,
-- secrets that cannot be rewritten, and browser isolation.
-- Runs after the core and library integration tests on PGlite and a real Postgres.
do $$
declare
  owner constant uuid := '00000000-0000-4000-8000-0000000000c1';
  t1 constant uuid := '00000000-0000-4000-8000-0000000000c2';
  t2 constant uuid := '00000000-0000-4000-8000-0000000000c3';
  s1 constant uuid := '00000000-0000-4000-8000-0000000000c4';
  s2 constant uuid := '00000000-0000-4000-8000-0000000000c5';
  s3 constant uuid := '00000000-0000-4000-8000-0000000000c6';
  tenant constant uuid := '00000000-0000-4000-8000-00000000ac01';
  t0 constant timestamptz := '2026-11-02T06:00:00Z';
  r jsonb;
  ws uuid;
  other uuid;
  doc uuid;
  secret uuid;
  raised boolean;
begin
  -- A centre linked to an Academy tenant is created once.
  r := public.ai_centre_create_workspace('Registan Centre', owner, tenant, null, null, 'academy', owner, 'pk_registan_0123456789abcd');
  assert (r ->> 'created')::boolean, 'centre created';
  ws := (r ->> 'workspace_id')::uuid;
  assert (select kind from public.ai_workspaces where id = ws) = 'centre', 'a centre workspace';
  assert (select role from public.ai_workspace_members where workspace_id = ws and user_id = owner) = 'owner', 'owner membership';
  assert (select public_key from public.ai_centre_settings where workspace_id = ws) = 'pk_registan_0123456789abcd', 'settings row';
  r := public.ai_centre_create_workspace('Registan again', t1, tenant, null, null, 'academy', t1, 'pk_other_0123456789abcdefg');
  assert not (r ->> 'created')::boolean and (r ->> 'workspace_id')::uuid = ws, 'the same tenant returns the existing centre';
  assert (select count(*) from public.ai_workspaces where academy_tenant_id = tenant) = 1, 'one workspace per tenant';
  -- A centre made by a Schood admin, without Academy, under an Enterprise contract.
  r := public.ai_centre_create_workspace('Contract Centre', t2, null, 'enterprise', t0 + interval '365 days', 'admin', owner, 'pk_contract_0123456789abcd');
  other := (r ->> 'workspace_id')::uuid;
  assert (r ->> 'created')::boolean and (select contract_plan from public.ai_workspaces where id = other) = 'enterprise', 'admin-created centre';

  -- Invites: teacher seats, student places, budgets by role, expiry, revocation and uses.
  insert into public.ai_workspace_invites (workspace_id, role, code_hash, max_uses, expires_at, created_by) values
    (ws, 'teacher', repeat('a', 64), 5, t0 + interval '7 days', owner),
    (ws, 'student', repeat('b', 64), 2, t0 + interval '7 days', owner),
    (ws, 'student', repeat('c', 64), 5, t0 - interval '1 minute', owner),
    (ws, 'student', repeat('d', 64), 5, t0 + interval '7 days', owner);
  update public.ai_workspace_invites set revoked_at = t0 where code_hash = repeat('d', 64);
  r := public.ai_centre_accept_invite(repeat('a', 64), t1, 1, 2, '{"teacher": 500, "student": 50}', t0);
  assert (r ->> 'ok')::boolean and r ->> 'role' = 'teacher' and not (r ->> 'already')::boolean, 'teacher joined';
  assert (select credit_budget from public.ai_workspace_members where workspace_id = ws and user_id = t1) = 500, 'teacher budget from the role default';
  r := public.ai_centre_accept_invite(repeat('a', 64), t2, 1, 2, '{}', t0);
  assert r ->> 'code' = 'seats_full' and (r ->> 'limit')::integer = 1, 'teacher seats are full';
  r := public.ai_centre_accept_invite(repeat('a', 64), t1, 1, 2, '{}', t0);
  assert (r ->> 'ok')::boolean and (r ->> 'already')::boolean, 'joining twice keeps the membership';
  assert (select uses from public.ai_workspace_invites where code_hash = repeat('a', 64)) = 1, 'a repeat does not use the invite';
  r := public.ai_centre_accept_invite(repeat('b', 64), s1, 1, 2, '{"student": 50}', t0);
  assert (r ->> 'ok')::boolean and (select credit_budget from public.ai_workspace_members where workspace_id = ws and user_id = s1) = 50, 'student joined with a budget';
  r := public.ai_centre_accept_invite(repeat('b', 64), s2, 1, 2, '{"student": 50}', t0);
  assert (r ->> 'ok')::boolean, 'second student joined';
  r := public.ai_centre_accept_invite(repeat('b', 64), s3, 1, 5, '{}', t0);
  assert r ->> 'code' = 'invite_used_up', 'max uses holds';
  r := public.ai_centre_accept_invite(repeat('c', 64), s3, 1, 5, '{}', t0);
  assert r ->> 'code' = 'invite_expired', 'expired invite refused';
  r := public.ai_centre_accept_invite(repeat('d', 64), s3, 1, 5, '{}', t0);
  assert r ->> 'code' = 'invite_revoked', 'revoked invite refused';
  r := public.ai_centre_accept_invite(repeat('e', 64), s3, 1, 5, '{}', t0);
  assert r ->> 'code' = 'invite_invalid', 'unknown code refused';
  insert into public.ai_workspace_invites (workspace_id, role, code_hash, max_uses, expires_at) values (ws, 'student', repeat('f', 64), 10, t0 + interval '1 day');
  r := public.ai_centre_accept_invite(repeat('f', 64), s3, 1, 2, '{}', t0);
  assert r ->> 'code' = 'students_full', 'student places are full';
  r := public.ai_centre_accept_invite(repeat('f', 64), s3, 1, null, '{}', t0);
  assert (r ->> 'ok')::boolean, 'no limit when the plan sets none';
  assert (select count(*) from public.ai_centre_members(ws)) = 5, 'members listed';
  assert (select name from public.ai_centre_members(ws) where user_id = t1) = 'Teacher One', 'with names';

  -- Public counters stop at the cap.
  assert public.ai_centre_take_public(ws, 'new_threads', '2026-11-02', 2), 'first hit';
  assert public.ai_centre_take_public(ws, 'new_threads', '2026-11-02', 2), 'second hit';
  assert not public.ai_centre_take_public(ws, 'new_threads', '2026-11-02', 2), 'third refused';
  assert public.ai_centre_take_public(ws, 'new_threads', '2026-11-03', 2), 'a new day starts again';
  assert not public.ai_centre_take_public(ws, 'other', '2026-11-02', 0), 'a zero cap admits nobody';

  -- Staff link codes work once, before they expire, for staff only.
  insert into public.ai_centre_staff_codes (code_hash, workspace_id, user_id, expires_at) values
    (repeat('1', 64), ws, t1, t0 + interval '1 hour'), (repeat('2', 64), ws, s1, t0 + interval '1 hour'), (repeat('3', 64), ws, owner, t0 - interval '1 second');
  r := public.ai_centre_claim_staff_code(ws, repeat('1', 64), '900100', t0);
  assert (r ->> 'ok')::boolean and (select chat_id from public.ai_centre_staff_chats where workspace_id = ws and user_id = t1) = '900100', 'staff chat linked';
  assert not (public.ai_centre_claim_staff_code(ws, repeat('1', 64), '900199', t0) ->> 'ok')::boolean, 'a code works once';
  assert not (public.ai_centre_claim_staff_code(ws, repeat('2', 64), '900200', t0) ->> 'ok')::boolean, 'students cannot link as staff';
  assert not (public.ai_centre_claim_staff_code(ws, repeat('3', 64), '900300', t0) ->> 'ok')::boolean, 'expired code refused';

  -- Knowledge search finds pages by prefix across languages, ranked, within the centre only.
  insert into public.ai_centre_knowledge_docs (workspace_id, title, pages) values (ws, 'Staff handbook', 3) returning id into doc;
  insert into public.ai_centre_knowledge_chunks (doc_id, workspace_id, page, chunk, content) values
    (doc, ws, 1, 1, 'Teachers take up to 14 days of paid leave each year. Leave requests go to the office manager.'),
    (doc, ws, 2, 1, 'O‘qituvchilar ta’tillarni oldindan rejalashtiradi. Kasallik ta’tili uchun ma’lumotnoma kerak.'),
    (doc, ws, 3, 1, 'Опоздание на урок более 10 минут фиксируется в журнале.');
  assert (select page from public.ai_centre_knowledge_search(ws, 'leave:* | requests:*', 5) limit 1) = 1, 'english search';
  assert (select count(*) from public.ai_centre_knowledge_search(ws, 'опоздан:*', 5)) = 1, 'russian prefix search';
  assert (select count(*) from public.ai_centre_knowledge_search(other, 'leave:*', 5)) = 0, 'another workspace sees nothing';

  -- Usage: credits per key and member come from the ledger, cost from the call log.
  perform public.ai_credit_grant(ws, 100, 'pack', 'centre-usage-pack');
  perform public.ai_credit_charge(ws, t1, 3, 'teacher_assistant.reply', 'u1', 0, null, t0);
  perform public.ai_credit_charge(ws, s1, 1, 'student_assistant.reply', 'u2', 0, null, t0);
  perform public.ai_credit_refund((public.ai_credit_charge(ws, s1, 1, 'student_assistant.reply', 'u3', 0, null, t0) ->> 'charge_id')::uuid);
  insert into public.ai_calls (call_id, feature, workspace_id, user_id, status, cost_usd, provider_key, input_tokens, output_tokens) values
    (gen_random_uuid(), 'teacher_assistant.reply', ws, t1, 'ok', 0.002, 'openrouter', 100, 20),
    (gen_random_uuid(), 'student_assistant.reply', ws, s1, 'failed', 0, 'openrouter', null, null),
    (gen_random_uuid(), 'teacher_assistant.reply', ws, t1, 'ok', 0, 'byok:main', 300, 40);
  r := public.ai_centre_usage(ws, t0 - interval '30 days');
  assert (select (e ->> 'credits')::integer from jsonb_array_elements(r -> 'features') e where e ->> 'key' = 'teacher_assistant.reply') = 3, 'credits per key';
  assert (select (e ->> 'credits')::integer from jsonb_array_elements(r -> 'features') e where e ->> 'key' = 'student_assistant.reply') = 1, 'refunds net out';
  assert (select (e ->> 'credits')::integer from jsonb_array_elements(r -> 'members') e where (e ->> 'user_id')::uuid = s1) = 1, 'credits per member';
  assert (r -> 'cost' ->> 'calls')::integer = 3 and (r -> 'cost' ->> 'failed')::integer = 1, 'calls and failures';
  assert (r -> 'byok' ->> 'calls')::integer = 1 and (r -> 'byok' ->> 'input_tokens')::integer = 300, 'own-key calls counted';

  -- Secrets are revoked and replaced, never rewritten.
  insert into public.ai_centre_secrets (workspace_id, purpose, label, sealed, hint, fingerprint)
    values (ws, 'telegram_bot', 'admissions', 'v1:k1:AAAA:BBBB', '1a2b', repeat('0', 64)) returning id into secret;
  raised := false;
  begin update public.ai_centre_secrets set sealed = 'v1:k1:CCCC:DDDD' where id = secret; exception when insufficient_privilege then raised := true; end;
  assert raised, 'a secret cannot be rewritten';
  raised := false;
  begin insert into public.ai_centre_secrets (workspace_id, purpose, label, sealed, hint, fingerprint) values (ws, 'telegram_bot', 'admissions', 'v1:k1:EEEE:FFFF', 'zz', repeat('1', 64)); exception when unique_violation then raised := true; end;
  assert raised, 'one active secret per purpose and label';
  update public.ai_centre_secrets set revoked_at = t0 where id = secret;
  insert into public.ai_centre_secrets (workspace_id, purpose, label, sealed, hint, fingerprint) values (ws, 'telegram_bot', 'admissions', 'v1:k1:EEEE:FFFF', 'zz', repeat('1', 64));
  raised := false;
  begin update public.ai_centre_secrets set revoked_at = null where id = secret; exception when insufficient_privilege then raised := true; end;
  assert raised, 'a revoked secret stays revoked';
  raised := false;
  begin insert into public.ai_centre_secrets (workspace_id, purpose, label, sealed, hint, fingerprint) values (ws, 'byok', 'x', 'plain-text-key', 'y', repeat('2', 64)); exception when check_violation then raised := true; end;
  assert raised, 'only sealed values are stored';

  -- Insights never store a group under five students.
  insert into public.ai_centre_groups (workspace_id, name) values (ws, '5B') returning id into secret;
  raised := false;
  begin insert into public.ai_centre_insights (workspace_id, group_id, period, topic, questions, students, group_size) values (ws, secret, '2026-11', 'grammar.tenses', 4, 2, 4); exception when check_violation then raised := true; end;
  assert raised, 'small groups are not stored';

  -- Homework rules: one of three values, one row per group and homework, gone with the group.
  update public.ai_centre_groups set homework_rule = 'explain' where id = secret;
  raised := false;
  begin update public.ai_centre_groups set homework_rule = 'answers' where id = secret; exception when check_violation then raised := true; end;
  assert raised, 'unknown group homework rule refused';
  insert into public.ai_centre_assignment_rules (group_id, workspace_id, assignment_id, rule, title, set_by)
    values (secret, ws, 'f0000000-0000-4000-8000-0000000000a1', 'off', 'Essay 3', t1);
  raised := false;
  begin insert into public.ai_centre_assignment_rules (group_id, workspace_id, assignment_id, rule) values (secret, ws, 'f0000000-0000-4000-8000-0000000000a1', 'explain'); exception when unique_violation then raised := true; end;
  assert raised, 'one rule per group and homework';
  raised := false;
  begin insert into public.ai_centre_assignment_rules (group_id, workspace_id, assignment_id, rule) values (secret, ws, 'f0000000-0000-4000-8000-0000000000a2', 'all'); exception when check_violation then raised := true; end;
  assert raised, 'unknown homework rule refused';
  delete from public.ai_centre_groups where id = secret;
  assert (select count(*) from public.ai_centre_assignment_rules where group_id = secret) = 0, 'homework rules go with their group';

  -- Browsers have no access to any centre table or function.
  assert not has_table_privilege('anon', 'public.ai_centre_settings', 'select'), 'anon cannot read settings';
  assert not has_table_privilege('authenticated', 'public.ai_centre_secrets', 'select'), 'authenticated cannot read secrets';
  assert not has_table_privilege('authenticated', 'public.ai_centre_admissions_messages', 'insert'), 'authenticated cannot write conversations';
  assert not has_table_privilege('service_role', 'public.ai_centre_public_limits', 'update'), 'counters change only through their function';
  assert not has_function_privilege('authenticated', 'public.ai_centre_accept_invite(text, uuid, integer, integer, jsonb, timestamptz)', 'execute'), 'browsers cannot join directly';
  assert not has_function_privilege('anon', 'public.ai_centre_knowledge_search(uuid, text, integer)', 'execute'), 'browsers cannot search';
  assert has_function_privilege('service_role', 'public.ai_centre_usage(uuid, timestamptz)', 'execute'), 'the function can read usage';
  assert (select bool_and(relrowsecurity) from pg_class where relname like 'ai\_centre\_%' and relkind = 'r'), 'RLS on every centre table';
  assert 'ai_centre_staff_chats' = any(public.account_personal_erasure_tables()) and 'ai_centre_staff_codes' = any(public.account_personal_erasure_tables()), 'personal rows join the erasure registry';
  raised := false;
  begin update public.ai_centre_settings set retention_days = 365 where workspace_id = ws; exception when check_violation then raised := true; end;
  assert raised, 'a centre cannot keep conversations longer than core''s 180 days';
end $$;

-- Account closure through auth.users (the fixture's stand-in for the closure
-- transaction): the registry deletes plain personal rows, core's hook removes the
-- memberships, then ai_centre_erase_account deletes attempts and observations and
-- unlinks resell periods, which the wholesale charge still counts.
insert into public.users (id, full_name) values
  ('00000000-0000-4000-8000-0000000000e1', 'Leaving Student'), ('00000000-0000-4000-8000-0000000000e2', 'Leaving Teacher'),
  ('00000000-0000-4000-8000-0000000000e3', 'Staying Owner'), ('00000000-0000-4000-8000-0000000000e4', 'Staying Teacher');
insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000000e1'), ('00000000-0000-4000-8000-0000000000e2'), ('00000000-0000-4000-8000-0000000000e3'), ('00000000-0000-4000-8000-0000000000e4');
do $$
declare
  student constant uuid := '00000000-0000-4000-8000-0000000000e1';
  teacher constant uuid := '00000000-0000-4000-8000-0000000000e2';
  owner constant uuid := '00000000-0000-4000-8000-0000000000e3';
  colleague constant uuid := '00000000-0000-4000-8000-0000000000e4';
  ws uuid;
  grp uuid;
  kept uuid;
begin
  assert public.account_erasure_service_hooks() = array['ai_erase_account', 'ai_centre_erase_account'], 'the centre hook runs once, after core''s';
  assert 'ai_centre_group_members' = any(public.account_personal_erasure_tables()) and not ('ai_centre_resell_periods' = any(public.account_personal_erasure_tables())), 'resell periods are unlinked, not deleted';
  insert into public.ai_workspaces (kind, name, owner_id) values ('centre', 'Closure Centre', owner) returning id into ws;
  insert into public.ai_workspace_members (workspace_id, user_id, role) values (ws, owner, 'owner'), (ws, student, 'student'), (ws, teacher, 'teacher'), (ws, colleague, 'teacher');
  insert into public.ai_centre_groups (workspace_id, name) values (ws, '7A') returning id into grp;
  insert into public.ai_centre_group_members (group_id, workspace_id, user_id) values (grp, ws, student);
  insert into public.ai_centre_placement_attempts (workspace_id, taker_user_id, channel, answers) values (ws, student, 'web', '{"w": "My own essay"}');
  insert into public.ai_centre_resell_periods (workspace_id, user_id, started_at, note) values (ws, student, now() - interval '3 days', 'paid in cash');
  insert into public.ai_centre_staff_chats (workspace_id, user_id, chat_id) values (ws, teacher, '123456');
  insert into public.ai_centre_staff_codes (code_hash, workspace_id, user_id, expires_at) values (repeat('e', 64), ws, teacher, now() + interval '1 hour');
  insert into public.ai_centre_observations (workspace_id, teacher_id, observer_id, lesson_date, term, source, input) values
    (ws, teacher, owner, current_date, '2026-T4', 'notes', 'The lesson notes of the leaving teacher.');
  insert into public.ai_centre_observations (workspace_id, teacher_id, observer_id, lesson_date, term, source, input) values
    (ws, colleague, teacher, current_date, '2026-T4', 'notes', 'The leaving teacher observed a colleague.') returning id into kept;

  update auth.users set deleted_at = now() where id = student;
  assert not exists (select 1 from public.ai_centre_group_members where user_id = student), 'group membership deleted';
  assert not exists (select 1 from public.ai_centre_placement_attempts where taker_user_id = student), 'placement answers deleted';
  assert (select count(*) from public.ai_centre_resell_periods where workspace_id = ws and user_id is null and note is null and ended_at is not null) = 1, 'resell period kept for the wholesale charge, unlinked and closed';
  assert not exists (select 1 from public.ai_workspace_members where workspace_id = ws and user_id = student), 'centre membership gone (core)';

  update auth.users set deleted_at = now() where id = teacher;
  assert not exists (select 1 from public.ai_centre_staff_chats where user_id = teacher) and not exists (select 1 from public.ai_centre_staff_codes where user_id = teacher), 'staff Telegram links and codes deleted';
  assert not exists (select 1 from public.ai_centre_observations where teacher_id = teacher), 'observations of the teacher''s lessons deleted';
  assert (select observer_id is null and teacher_id = colleague from public.ai_centre_observations where id = kept), 'observations they made of others stay, unlinked';
  assert exists (select 1 from public.ai_centre_groups where id = grp) and exists (select 1 from public.ai_workspace_members where workspace_id = ws and user_id = owner), 'the centre stays';
  assert public.ai_centre_erase_account(teacher) = '{"observations": 0, "observer_links": 0, "placement_attempts": 0, "resell_periods_unlinked": 0}'::jsonb, 'running again changes nothing';
end $$;
set role service_role;
do $$
begin
  begin perform public.ai_centre_erase_account('00000000-0000-4000-8000-0000000000e3'); raise exception 'service role erased centre data'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'schood ai centre: ok';
