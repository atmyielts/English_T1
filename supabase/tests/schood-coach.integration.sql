-- Integration test for 20261030600000_schood_coach.sql. Runs after the Schood AI core
-- migrations on PGlite and on a throwaway Postgres (scripts/test-schood-coach-db.mjs).
do $$
declare
  u1 constant uuid := '00000000-0000-4000-8000-0000000000a1';
  u2 constant uuid := '00000000-0000-4000-8000-0000000000a2';
  u3 constant uuid := '00000000-0000-4000-8000-0000000000a3';
  u4 constant uuid := '00000000-0000-4000-8000-0000000000a4';
  ws uuid;
  enr uuid;
  ses uuid;
  turn_old uuid;
  turn_kept uuid;
  team uuid;
  claimed integer;
  again integer;
  raised boolean;
  member public.coach_team_members;
  t text;
  listed text[];
begin
  ws := (public.ai_ensure_personal_workspace(u1, 'Coach test')).id;

  -- Every coach table is closed to browsers and has RLS on.
  foreach t in array array['coach_enrollments', 'coach_sessions', 'coach_turns', 'coach_scores', 'coach_mastery', 'coach_cards', 'coach_polls',
    'coach_schedules', 'coach_deliveries', 'coach_updates', 'coach_media', 'coach_miniapp_mints', 'coach_certificates', 'coach_teams',
    'coach_team_members', 'coach_team_invites'] loop
    assert (select relrowsecurity from pg_class where oid = format('public.%I', t)::regclass), format('%s has RLS', t);
    assert not has_table_privilege('anon', format('public.%I', t), 'select'), format('anon cannot read %s', t);
    assert not has_table_privilege('authenticated', format('public.%I', t), 'select'), format('authenticated cannot read %s', t);
  end loop;
  assert not has_function_privilege('authenticated', 'public.coach_claim_due(timestamptz, integer, integer)', 'execute'), 'browsers cannot claim deliveries';
  assert not has_function_privilege('anon', 'public.coach_team_join(text, uuid, timestamptz)', 'execute'), 'browsers cannot join teams directly';

  -- Enrolment constraints: one per person per coach, a valid pack id, bounded state.
  insert into public.coach_enrollments (user_id, workspace_id, pack, pack_version) values (u1, ws, 'ielts', '1.0.0') returning id into enr;
  raised := false;
  begin insert into public.coach_enrollments (user_id, workspace_id, pack, pack_version) values (u1, ws, 'ielts', '1.0.0'); exception when unique_violation then raised := true; end;
  assert raised, 'one enrolment per person per coach';
  raised := false;
  begin insert into public.coach_enrollments (user_id, workspace_id, pack, pack_version) values (u2, ws, 'Bad Pack!', '1.0.0'); exception when check_violation then raised := true; end;
  assert raised, 'pack ids are checked';
  raised := false;
  begin update public.coach_enrollments set state = jsonb_build_object('x', repeat('y', 70000)) where id = enr; exception when check_violation then raised := true; end;
  assert raised, 'state is bounded';

  -- Optimistic concurrency: an update that names an old revision changes nothing.
  update public.coach_enrollments set state = '{"flow":"menu"}', revision = revision + 1 where id = enr and revision = 0;
  update public.coach_enrollments set state = '{"flow":"stale"}', revision = revision + 1 where id = enr and revision = 0;
  assert (select state->>'flow' from public.coach_enrollments where id = enr) = 'menu', 'stale revision lost';

  -- Sessions, turns, scores.
  insert into public.coach_sessions (enrollment_id, user_id, pack, pack_version, kind, activity_id, rubric) values (enr, u1, 'ielts', '1.0.0', 'speaking_exam', 'ielts.speaking.mock', 'ielts.speaking') returning id into ses;
  insert into public.coach_turns (session_id, user_id, pack, seq, role, kind, content, input_mode, clip, created_at)
    values (ses, u1, 'ielts', 0, 'learner', 'answer', 'I live in Tashkent with my family.', 'voice', '{"file_id":"AwACAgI","duration":12,"pack":"ielts"}', now() - interval '200 days') returning id into turn_old;
  insert into public.coach_turns (session_id, user_id, pack, seq, role, kind, content, input_mode, keep, created_at)
    values (ses, u1, 'ielts', 1, 'learner', 'answer', 'My first answer, kept for then vs now.', 'voice', true, now() - interval '200 days') returning id into turn_kept;
  raised := false;
  begin insert into public.coach_turns (session_id, user_id, pack, seq, role, kind, clip) values (ses, u1, 'ielts', 2, 'learner', 'answer', '{"url":"https://example.com/a.ogg"}'); exception when check_violation then raised := true; end;
  assert raised, 'clips are references, never URLs';
  raised := false;
  begin insert into public.coach_scores (session_id, user_id, pack, rubric, criterion, score, status, source) values (ses, u1, 'ielts', 'ielts.speaking', 'pronunciation', 6, 'not_scored_audio', 'model'); exception when check_violation then raised := true; end;
  assert raised, 'an unscored criterion carries no score';
  insert into public.coach_scores (session_id, turn_id, user_id, pack, rubric, criterion, score, status, evidence, source)
    values (ses, turn_old, u1, 'ielts', 'ielts.speaking', 'fluency_coherence', 6, 'scored', '[{"quote":"I live in Tashkent","comment":"clear"}]', 'model');

  -- Retention blanks old learner text but keeps scores and kept samples.
  perform public.coach_purge_old(180);
  assert (select content from public.coach_turns where id = turn_old) = '', 'old text blanked';
  assert (select content from public.coach_turns where id = turn_kept) <> '', 'kept sample stays';
  assert (select count(*) from public.coach_scores where turn_id = turn_old) = 1, 'scores stay';
  raised := false;
  begin perform public.coach_purge_old(7); exception when invalid_parameter_value then raised := true; end;
  assert raised, 'retention cannot be shortened below 30 days';

  -- Certificates: one active per milestone.
  insert into public.coach_certificates (code, user_id, pack, pack_version, milestone, rubric, level, level_label, display_name)
    values ('7K3M9QX2P4TA', u1, 'ielts', '1.0.0', 'speaking-6-5', 'ielts.speaking', 6.5, '6.5', 'Dilnoza');
  raised := false;
  begin insert into public.coach_certificates (code, user_id, pack, pack_version, milestone, rubric, level, level_label, display_name)
    values ('8K3M9QX2P4TB', u1, 'ielts', '1.0.0', 'speaking-6-5', 'ielts.speaking', 6.5, '6.5', 'Dilnoza'); exception when unique_violation then raised := true; end;
  assert raised, 'one active certificate per milestone';
  raised := false;
  begin insert into public.coach_certificates (code, user_id, pack, pack_version, milestone, rubric, level, level_label, display_name)
    values ('ILOU00000000', u1, 'ielts', '1.0.0', 'speaking-7', 'ielts.speaking', 7, '7.0', 'Dilnoza'); exception when check_violation then raised := true; end;
  assert raised, 'codes use Crockford base32';

  -- Due schedules are claimed once while leased, and only for linked, active people.
  update public.users set telegram_chat_id = '700100' where id = u1;
  insert into public.coach_schedules (enrollment_id, user_id, pack, kind, local_time, next_at) values (enr, u1, 'ielts', 'daily', '08:30', now() - interval '1 minute');
  select count(*) into claimed from public.coach_claim_due(now(), 40, 120);
  select count(*) into again from public.coach_claim_due(now(), 40, 120);
  assert claimed = 1 and again = 0, format('claimed once while leased (%s, %s)', claimed, again);
  assert (select chat_id from public.coach_claim_due(now() + interval '5 minutes', 40, 120) limit 1) = '700100', 'the lease expires and the chat id comes with it';
  update public.coach_enrollments set status = 'blocked' where id = enr;
  update public.coach_schedules set lease_until = null where enrollment_id = enr;
  select count(*) into claimed from public.coach_claim_due(now(), 40, 120);
  assert claimed = 0, 'blocked enrolments get nothing';

  -- Teams: seats are enforced, rejoining is idempotent, expired invites refuse.
  insert into public.coach_teams (name, manager_id, packs, seats, valid_until) values ('Sales team', u1, array['ielts'], 5, now() + interval '30 days') returning id into team;
  insert into public.coach_team_invites (code, team_id, created_by, expires_at, max_uses) values ('TEAMCODE01', team, u1, now() + interval '7 days', 50);
  insert into public.coach_team_invites (code, team_id, created_by, expires_at, max_uses) values ('OLDCODE001', team, u1, now() - interval '1 day', 50);
  insert into public.coach_team_members (team_id, user_id, role) values (team, u1, 'manager');
  member := public.coach_team_join('TEAMCODE01', u2);
  assert member.status = 'active', 'joined';
  member := public.coach_team_join('TEAMCODE01', u2);
  assert (select uses from public.coach_team_invites where code = 'TEAMCODE01') = 1, 'rejoining does not use another seat';
  raised := false;
  begin perform public.coach_team_join('OLDCODE001', u3); exception when invalid_parameter_value then raised := true; end;
  assert raised, 'expired invite refused';
  update public.coach_teams set seats = 5 where id = team;
  perform public.coach_team_join('TEAMCODE01', u3);
  perform public.coach_team_join('TEAMCODE01', u4);
  -- Five seats: u1 (manager), u2, u3, u4 are four; fill the fifth with a fresh user.
  insert into public.users (id) values ('00000000-0000-4000-8000-0000000000b1'), ('00000000-0000-4000-8000-0000000000b2') on conflict do nothing;
  perform public.coach_team_join('TEAMCODE01', '00000000-0000-4000-8000-0000000000b1');
  raised := false;
  begin perform public.coach_team_join('TEAMCODE01', '00000000-0000-4000-8000-0000000000b2'); exception when invalid_parameter_value then raised := sqlerrm = 'team_full'; end;
  assert raised, 'a full team refuses';

  -- Account erasure registry includes the personal coach tables.
  listed := public.account_personal_erasure_tables();
  foreach t in array array['coach_enrollments', 'coach_sessions', 'coach_turns', 'coach_scores', 'coach_mastery', 'coach_certificates', 'coach_team_members'] loop
    assert t = any(listed), format('%s is in the erasure registry', t);
  end loop;
  assert 'user_profiles' = any(listed) and 'ai_threads' = any(listed), 'earlier registry entries are kept';

  -- Deleting a person removes their coach data.
  delete from public.users where id = '00000000-0000-4000-8000-0000000000b1';
  assert not exists (select 1 from public.coach_team_members where user_id = '00000000-0000-4000-8000-0000000000b1'), 'cascade';
end $$;
select 'schood coach: ok';
