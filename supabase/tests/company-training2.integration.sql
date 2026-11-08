-- Company English training, second release: company lessons and versions, courses,
-- custom scenarios, role-play columns, saved templates, learning paths, certificates,
-- the public hit counter, and lockdown.
\set ON_ERROR_STOP 1
insert into public.users(id) values ('00000000-0000-4000-8000-0000000000b1'), ('00000000-0000-4000-8000-0000000000b2');
\i /work/migration.sql

do $$
declare
  learner constant uuid := '00000000-0000-4000-8000-0000000000b1';
  org uuid;
  dept uuid;
  member uuid;
  lesson uuid;
  session uuid;
  replay uuid;
  t text;
begin
  insert into public.company_orgs(name, status, seats_limit) values ('Silk Road Hotels', 'active', 5) returning id into org;
  insert into public.company_departments(org_id, name) values (org, 'Front office') returning id into dept;
  insert into public.company_members(org_id, user_id, role, status, department_id, job_role) values (org, learner, 'employee', 'active', dept, 'hospitality') returning id into member;

  -- A lesson has one row per version; a version number is used once.
  insert into public.company_lessons(org_id, title, draft) values (org, '{"en":"Our late check-out policy"}', '{"goal":{"en":"Explain it"}}') returning id into lesson;
  insert into public.company_lesson_versions(org_id, lesson_id, version, content) values (org, lesson, 1, '{"title":{"en":"v1"}}');
  begin
    insert into public.company_lesson_versions(org_id, lesson_id, version, content) values (org, lesson, 1, '{"title":{"en":"again"}}');
    raise exception 'version used twice';
  exception when unique_violation then null;
  end;
  begin
    insert into public.company_lessons(org_id, status) values (org, 'live');
    raise exception 'unknown lesson status accepted';
  exception when check_violation then null;
  end;
  update public.company_lessons set revision = 2 where id = lesson;
  assert (select updated_at >= created_at from public.company_lessons where id = lesson), 'updated_at trigger';

  -- Courses keep their lessons as a list.
  begin
    insert into public.company_courses(org_id, lesson_ids) values (org, '{}');
    raise exception 'object lesson_ids accepted';
  exception when check_violation then null;
  end;
  insert into public.company_courses(org_id, title, lesson_ids) values (org, '{"en":"Welcome"}', jsonb_build_array(lesson));

  -- Scenarios bound their fields.
  begin
    insert into public.company_scenarios(org_id, persona) values (org, repeat('a', 2001));
    raise exception 'long persona accepted';
  exception when check_violation then null;
  end;
  insert into public.company_scenarios(org_id, title, checklist) values (org, '{"en":"A guest"}', '["Greets"]');

  -- Role-play: difficulty, hints and replay columns.
  insert into public.company_roleplay_sessions(org_id, member_id, user_id, scenario_code, track_code, difficulty, scenario)
    values (org, member, learner, 'cs-1', 'company', 'hard', '{"code":"cs-1"}') returning id into session;
  begin
    update public.company_roleplay_sessions set difficulty = 'impossible' where id = session;
    raise exception 'unknown difficulty accepted';
  exception when check_violation then null;
  end;
  insert into public.company_roleplay_sessions(org_id, member_id, scenario_code, track_code, replay_of) values (org, member, 'cs-1', 'company', session) returning id into replay;
  delete from public.company_roleplay_sessions where id = session;
  assert (select replay_of is null from public.company_roleplay_sessions where id = replay), 'replay_of is cleared';

  -- The nightly close gives a replay's new replies points, not its copied ones, and an all-copied replay none.
  delete from public.company_activity where ref in ('replay-mixed', 'replay-copied');
  insert into public.company_roleplay_sessions(org_id, member_id, user_id, scenario_code, track_code, learner_turns, turns, created_at, updated_at) values
    (org, member, learner, 'replay-mixed', 'company', 3, '[{"role":"learner","text":"a","replayed":true},{"role":"learner","text":"b","replayed":true},{"role":"learner","text":"c"}]', now() - interval '2 days', now() - interval '2 days'),
    (org, member, learner, 'replay-copied', 'company', 1, '[{"role":"learner","text":"a","replayed":true}]', now() - interval '2 days', now() - interval '2 days');
  perform public.company_purge_training_drafts();
  assert (select points from public.company_activity where ref = 'replay-mixed') = 7, 'only the new reply earns';
  assert not exists (select 1 from public.company_activity where ref = 'replay-copied'), 'an all-copied replay logs nothing';

  -- Saved templates: a title is used once per person, whatever its case.
  insert into public.company_writing_snippets(org_id, member_id, user_id, title, body, tone) values (org, member, learner, 'Late delivery', 'Dear customer,', 'formal');
  begin
    insert into public.company_writing_snippets(org_id, member_id, user_id, title, body) values (org, member, learner, ' late DELIVERY ', 'Hello');
    raise exception 'duplicate title accepted';
  exception when unique_violation then null;
  end;

  -- Paths: for one person or one department, one active of each.
  begin
    insert into public.company_learning_paths(org_id, member_id, department_id) values (org, member, dept);
    raise exception 'path for both a person and a department accepted';
  exception when check_violation then null;
  end;
  insert into public.company_learning_paths(org_id, member_id, steps) values (org, member, '[{"kind":"track","code":"hospitality"}]');
  begin
    insert into public.company_learning_paths(org_id, member_id) values (org, member);
    raise exception 'second active path accepted';
  exception when unique_violation then null;
  end;
  update public.company_learning_paths set status = 'archived' where member_id = member;
  insert into public.company_learning_paths(org_id, member_id) values (org, member);
  insert into public.company_learning_paths(org_id, department_id) values (org, dept);

  -- Certificates: one per person per track or course, codes unique.
  insert into public.company_training_certificates(org_id, member_id, user_id, kind, ref_code, title, holder_name, lessons, score, code)
    values (org, member, learner, 'track', 'hospitality', '{"en":"Hospitality"}', 'Bekzod', 8, 90, 'ABCDEFGHJK');
  begin
    insert into public.company_training_certificates(org_id, member_id, kind, ref_code, code) values (org, member, 'track', 'hospitality', 'ZZZZZZZZZZ');
    raise exception 'second certificate accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.company_training_certificates(org_id, member_id, kind, ref_code, code) values (org, member, 'course', 'c-1', 'ABCDEFGHJK');
    raise exception 'code used twice';
  exception when unique_violation then null;
  end;

  -- The hit counter says no once the limit is passed and forgets old rows.
  assert public.company_training_hit('hash', 'cert', 2), 'first hit';
  assert public.company_training_hit('hash', 'cert', 2), 'second hit';
  assert not public.company_training_hit('hash', 'cert', 2), 'third hit is over the limit';
  update public.company_training_hits set created_at = now() - interval '3 days';
  assert public.company_training_hit('hash2', 'cert', 2), 'another address';
  assert (select count(*) = 1 from public.company_training_hits), 'old rows are gone';

  -- Lockdown: RLS on and nothing for anon or authenticated.
  foreach t in array array['company_lessons','company_lesson_versions','company_courses','company_scenarios','company_writing_snippets','company_learning_paths','company_training_certificates','company_training_hits'] loop
    assert (select relrowsecurity from pg_class where oid = format('public.%I', t)::regclass), t || ' has RLS';
    assert not has_table_privilege('anon', format('public.%I', t), 'select'), t || ' closed to anon';
    assert not has_table_privilege('authenticated', format('public.%I', t), 'select'), t || ' closed to authenticated';
    assert has_table_privilege('service_role', format('public.%I', t), 'select'), t || ' open to the function';
  end loop;
  assert not has_function_privilege('anon', 'public.company_training_hit(text,text,integer)', 'execute'), 'hit closed to anon';
end
$$;

select 'company training2: ok';
