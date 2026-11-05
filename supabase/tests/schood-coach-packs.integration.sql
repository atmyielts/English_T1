-- Integration test for 20261030700000_schood_coach_packs.sql (saved scripts and the
-- anonymous cohort histogram). Runs after the core and coach migrations and their own
-- integration test, on PGlite and on a throwaway Postgres (scripts/test-schood-coach-db.mjs).
insert into public.users (id) values
  ('00000000-0000-4000-8000-0000000000d1'), ('00000000-0000-4000-8000-0000000000d2'), ('00000000-0000-4000-8000-0000000000d3'), ('00000000-0000-4000-8000-0000000000d4')
  on conflict do nothing;
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d4') on conflict do nothing;
do $$
declare
  a constant uuid := '00000000-0000-4000-8000-0000000000d1';
  b constant uuid := '00000000-0000-4000-8000-0000000000d2';
  c constant uuid := '00000000-0000-4000-8000-0000000000d3';
  leaver constant uuid := '00000000-0000-4000-8000-0000000000d4';
  ws uuid;
  enr uuid;
  hist record;
  total bigint;
  raised boolean;
  saved uuid;
begin
  -- Closed to browsers, like every coach table and function.
  assert (select relrowsecurity from pg_class where oid = 'public.coach_scripts'::regclass), 'coach_scripts has RLS';
  assert not has_table_privilege('anon', 'public.coach_scripts', 'select'), 'anon cannot read scripts';
  assert not has_table_privilege('authenticated', 'public.coach_scripts', 'select'), 'authenticated cannot read scripts';
  assert not has_function_privilege('authenticated', 'public.coach_cohort_histogram(text, text, timestamptz)', 'execute'), 'browsers cannot read the histogram';
  assert not has_function_privilege('anon', 'public.coach_cohort_histogram(text, text, timestamptz)', 'execute'), 'visitors cannot read the histogram';
  assert has_function_privilege('service_role', 'public.coach_cohort_histogram(text, text, timestamptz)', 'execute'), 'the function can';

  -- Three people with mini-mock results: only each person's latest counts, older or other-rubric results do not.
  ws := (public.ai_ensure_personal_workspace(a, 'Cohort A')).id;
  insert into public.coach_enrollments (user_id, workspace_id, pack, pack_version) values (a, ws, 'maths', '1.0.0') returning id into enr;
  insert into public.coach_sessions (enrollment_id, user_id, pack, pack_version, kind, rubric, overall, status, started_at, finished_at) values
    (enr, a, 'maths', '1.0.0', 'quiz_set', 'admission.mock', 40, 'finished', now() - interval '10 days', now() - interval '10 days'),
    (enr, a, 'maths', '1.0.0', 'quiz_set', 'admission.mock', 70, 'finished', now() - interval '2 days', now() - interval '2 days'),
    (enr, a, 'maths', '1.0.0', 'quiz_set', 'admission.mock', 90, 'finished', now() - interval '60 days', now() - interval '60 days');
  ws := (public.ai_ensure_personal_workspace(b, 'Cohort B')).id;
  insert into public.coach_enrollments (user_id, workspace_id, pack, pack_version) values (b, ws, 'maths', '1.0.0') returning id into enr;
  insert into public.coach_sessions (enrollment_id, user_id, pack, pack_version, kind, rubric, overall, status, started_at, finished_at) values
    (enr, b, 'maths', '1.0.0', 'quiz_set', 'admission.mock', 69.6, 'finished', now() - interval '1 day', now() - interval '1 day'),
    (enr, b, 'maths', '1.0.0', 'quiz_set', 'admission.solution', 4, 'finished', now() - interval '1 day', now() - interval '1 day');
  ws := (public.ai_ensure_personal_workspace(c, 'Cohort C')).id;
  insert into public.coach_enrollments (user_id, workspace_id, pack, pack_version) values (c, ws, 'maths', '1.0.0') returning id into enr;
  insert into public.coach_sessions (enrollment_id, user_id, pack, pack_version, kind, rubric, overall, status, started_at, finished_at) values
    (enr, c, 'maths', '1.0.0', 'quiz_set', 'admission.mock', 30, 'finished', now() - interval '3 days', now() - interval '3 days'),
    (enr, c, 'maths', '1.0.0', 'quiz_set', 'admission.mock', null, 'abandoned', now() - interval '1 day', null);

  select coalesce(sum(people), 0) into total from public.coach_cohort_histogram('maths', 'admission.mock', now() - interval '30 days');
  assert total = 3, format('one entry per person in the window, got %s', total);
  for hist in select * from public.coach_cohort_histogram('maths', 'admission.mock', now() - interval '30 days') loop
    assert hist.score in (30, 70), format('latest results only, rounded: %s', hist.score);
    assert (hist.score = 70 and hist.people = 2) or (hist.score = 30 and hist.people = 1), format('counts per score: %s → %s', hist.score, hist.people);
  end loop;
  assert not exists (select 1 from public.coach_cohort_histogram('maths', 'admission.mock', now() + interval '1 day')), 'an empty window is empty';
  assert not exists (select 1 from public.coach_cohort_histogram('sales', 'admission.mock', now() - interval '30 days')), 'other coaches are separate';

  -- Saved scripts: bounded JSON, a valid pack id, one person's rows.
  insert into public.coach_scripts (user_id, pack, title, input, script) values (a, 'sales', 'Solar panels for farms', '{"product":"Solar kits"}', '{"opening":"Hello"}') returning id into saved;
  raised := false;
  begin insert into public.coach_scripts (user_id, pack, title) values (a, 'Bad Pack', 'x'); exception when check_violation then raised := true; end;
  assert raised, 'pack ids are checked';
  raised := false;
  begin insert into public.coach_scripts (user_id, pack, title, script) values (a, 'sales', 'x', '[]'); exception when check_violation then raised := true; end;
  assert raised, 'a script is an object';
  update public.coach_scripts set title = 'Solar kits for farms' where id = saved;
  assert (select updated_at >= created_at from public.coach_scripts where id = saved), 'updated_at moves';

  -- Account closure: scripts are personal and go with the account.
  assert 'coach_scripts' = any(public.account_personal_erasure_tables()), 'scripts are in the erasure registry';
  ws := (public.ai_ensure_personal_workspace(leaver, 'Leaver')).id;
  insert into public.coach_scripts (user_id, pack, title) values (leaver, 'sales', 'Leaver script');
  update auth.users set deleted_at = now() where id = leaver;
  assert not exists (select 1 from public.coach_scripts where user_id = leaver), 'scripts erased with the account';
  assert exists (select 1 from public.coach_scripts where user_id = a), 'other people keep theirs';
end $$;
select 'schood coach packs: ok';
