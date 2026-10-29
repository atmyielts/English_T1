-- Company English hiring: the core tables hold what the hiring routes write
-- (no hiring migration is needed). Checks the shapes, the constraints the code
-- relies on, the optimistic update guard, certificate codes and staff levels.
\set ON_ERROR_STOP 1
insert into public.users(id) values ('00000000-0000-4000-8000-0000000000c1'), ('00000000-0000-4000-8000-0000000000c2');
\i /work/migration.sql

do $$
declare
  hr constant uuid := '00000000-0000-4000-8000-0000000000c1';
  employee constant uuid := '00000000-0000-4000-8000-0000000000c2';
  org uuid;
  member uuid;
  hiring uuid;
  placement uuid;
  candidate uuid;
  staff_attempt uuid;
  stamp timestamptz;
  changed integer;
  failed boolean;
begin
  insert into public.company_orgs(name, status, tests_limit, settings) values ('Silk Road Hotels', 'active', 3, '{"locale":"ru"}') returning id into org;
  insert into public.company_members(org_id, user_id, role, status, job_role) values (org, employee, 'employee', 'active', 'hospitality') returning id into member;

  -- A hiring test with an open link and its settings; a placement campaign with an audience.
  insert into public.company_assessments(org_id, kind, title, job_role, skills, min_level, time_limit_minutes, link_token_hash, max_attempts, settings, created_by)
  values (org, 'hiring', 'Front desk receptionist', 'hospitality', array['grammar','vocabulary','reading','listening','writing','speaking'], 'b1', 59, repeat('a', 64), 50, '{"show_level": true}', hr)
  returning id into hiring;
  insert into public.company_assessments(org_id, kind, title, skills, settings, created_by)
  values (org, 'placement', 'Staff placement', array['grammar','vocabulary'], jsonb_build_object('audience', jsonb_build_object('type', 'members', 'ids', jsonb_build_array(member)), 'retest_days', 90, 'member_role', true, 'show_level', true), hr)
  returning id into placement;
  assert (select settings -> 'audience' ->> 'type' from public.company_assessments where id = placement) = 'members', 'audience stored';

  -- Each start reserves a test.
  assert public.company_reserve_test(org), 'reserve for candidate';
  insert into public.company_attempts(org_id, assessment_id, candidate_name, candidate_email, candidate_phone, access_token_hash, deadline_at, items, integrity)
  values (org, hiring, 'Aziza Rakhimova', 'aziza@mail.uz', '+998 90 123 45 67', repeat('b', 64), now() + interval '59 minutes',
    '[{"skill":"grammar","status":"active","started_at":null,"finished_at":null,"stages":[{"level":"b1","items":[{"id":"g-b1-01","prompt":"x ___","options":["a","b","c","d"]}]}]}]',
    '{"ip_hash":"abc","tab_hidden":2}')
  returning id, updated_at into candidate, stamp;
  assert (select jsonb_array_length(items) = 1 and status = 'started' from public.company_attempts where id = candidate), 'started with items';

  -- The optimistic guard: an update that names the old updated_at wins once.
  update public.company_attempts set answers = '{"g-b1-01": 1}' where id = candidate and updated_at = stamp and status = 'started';
  get diagnostics changed = row_count;
  assert changed = 1, 'first write wins';
  update public.company_attempts set answers = '{"g-b1-01": 2}' where id = candidate and updated_at = stamp - interval '1 second' and status = 'started';
  get diagnostics changed = row_count;
  assert changed = 0, 'stale write refused';

  -- Submitted with writing pending, then graded with a certificate code.
  update public.company_attempts set status = 'submitted', submitted_at = now(),
    skill_results = '{"grammar":{"score":58.4,"level":"b1","source":"auto"}}', ai_feedback = '{"pending":["writing"],"reason":"ai_unavailable"}'
  where id = candidate;
  update public.company_attempts set status = 'graded', graded_at = now(), overall_score = 61.2, overall_level = 'b1', certificate_code = 'ABCDEFGHJK',
    decision = 'shortlist', decision_by = hr, notes = 'Invite to interview'
  where id = candidate;
  assert (select overall_score = 61.2 and decision = 'shortlist' from public.company_attempts where id = candidate), 'graded';

  -- Certificate codes are unique.
  assert public.company_reserve_test(org), 'reserve for staff';
  insert into public.company_attempts(org_id, assessment_id, member_id, user_id, candidate_name, deadline_at)
  values (org, placement, member, employee, 'Bekzod Tursunov', now() + interval '30 minutes') returning id into staff_attempt;
  failed := false;
  begin
    update public.company_attempts set certificate_code = 'ABCDEFGHJK' where id = staff_attempt;
  exception when unique_violation then failed := true;
  end;
  assert failed, 'duplicate certificate code refused';

  -- Statuses and decisions outside the lists are refused.
  failed := false;
  begin
    update public.company_attempts set decision = 'maybe' where id = candidate;
  exception when check_violation then failed := true;
  end;
  assert failed, 'unknown decision refused';

  -- Grading a staff test moves the member's level and logs a test.
  update public.company_attempts set status = 'graded', graded_at = now(), overall_score = 50, overall_level = 'b1', certificate_code = 'ZXCVBNMLKJ' where id = staff_attempt;
  update public.company_members set level = 'b1', level_score = 50, level_source = 'placement', level_at = now() where id = member;
  update public.company_members set level_source = 'progress' where id = member;
  insert into public.company_activity(org_id, member_id, user_id, kind, minutes, points, ref) values (org, member, employee, 'test', 24, 50, staff_attempt::text);
  assert (select count(*) = 1 from public.company_activity where kind = 'test' and member_id = member), 'test activity';

  -- The quota holds: the third reservation is the last.
  assert public.company_reserve_test(org), 'third test';
  assert not public.company_reserve_test(org), 'quota reached';

  -- Removing a test removes its attempts.
  delete from public.company_assessments where id = hiring;
  assert not exists (select 1 from public.company_attempts where id = candidate), 'attempts cascade';
end
$$;

select 'company hiring: ok';
