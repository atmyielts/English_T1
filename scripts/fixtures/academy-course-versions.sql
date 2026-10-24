-- Course version pinning (20261024231500_academy_course_versions.sql): editing
-- a course never changes a group already running it. Runs inside one
-- transaction and rolls back.
begin;
do $fixture$
declare
  owner_user uuid := gen_random_uuid(); student uuid := gen_random_uuid(); peer uuid := gen_random_uuid(); veteran uuid := gen_random_uuid();
  academy uuid := gen_random_uuid(); branch uuid := gen_random_uuid();
  class_a uuid := gen_random_uuid(); class_b uuid := gen_random_uuid(); class_old uuid := gen_random_uuid();
  child_a uuid := gen_random_uuid(); child_b uuid := gen_random_uuid(); child_old uuid := gen_random_uuid();
  course uuid := gen_random_uuid(); m1 uuid := gen_random_uuid(); m2 uuid := gen_random_uuid();
  l1 uuid := gen_random_uuid(); l2 uuid := gen_random_uuid(); l3 uuid := gen_random_uuid(); quiz uuid := gen_random_uuid();
  quick_course uuid := gen_random_uuid(); quick_module uuid := gen_random_uuid(); quick_lesson uuid := gen_random_uuid();
  run_a uuid; run_b uuid; run_old uuid;
  v1 public.academy_course_versions; v2 public.academy_course_versions; r public.academy_classroom_courses;
  result jsonb; n integer;
begin
  update public.academy_learning_config set value = 'false'::jsonb where key = 'billing.enforced';

  insert into auth.users(id, email, aud, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  select id, id || '@example.invalid', 'authenticated', 'authenticated', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Version fixture"}'
  from unnest(array[owner_user, student, peer, veteran]) id;
  insert into public.tenants(id, name, slug, type, created_by) values (academy, 'Version fixture Academy', academy::text, 'team', owner_user);
  insert into public.tenant_memberships(tenant_id, user_id, role, status) values (academy, owner_user, 'owner', 'active');
  insert into public.academy_branches(id, academy_id, branch_key, name, timezone, is_default) values (branch, academy, 'cv', 'Version branch', 'Asia/Tashkent', true);
  insert into public.academy_classrooms(id, academy_id, branch_id, name, created_by)
  values (class_a, academy, branch, 'Group A', owner_user), (class_b, academy, branch, 'Group B', owner_user), (class_old, academy, branch, 'Group before versions', owner_user);
  insert into public.academy_contacts(id, academy_id, primary_branch_id, user_id, first_name, email, status, created_by)
  values (child_a, academy, branch, student, 'Aziza', student || '@example.invalid', 'active', owner_user),
         (child_b, academy, branch, peer, 'Bobur', peer || '@example.invalid', 'active', owner_user),
         (child_old, academy, branch, veteran, 'Dilnoza', veteran || '@example.invalid', 'active', owner_user);
  insert into public.academy_classroom_memberships(academy_id, classroom_id, contact_id, role, status)
  values (academy, class_a, child_a, 'student', 'active'), (academy, class_b, child_b, 'student', 'active'), (academy, class_old, child_old, 'student', 'active');

  -- A draft course: two modules, module 2 behind a 70% quiz check.
  insert into public.academy_courses(id, academy_id, title, level, status, created_by) values (course, academy, 'IELTS evening', 'B2', 'draft', owner_user);
  insert into public.academy_course_modules(id, academy_id, course_id, title, position, status, unlock_rule, created_by)
  values (m1, academy, course, 'Reading', 0, 'draft', '{}', owner_user),
         (m2, academy, course, 'Writing', 1, 'draft', jsonb_build_object('type', 'quiz_pass', 'quiz_id', quiz, 'min_percent', 70), owner_user);
  insert into public.academy_lessons(id, academy_id, course_id, module_id, title, position, status, created_by)
  values (l1, academy, course, m1, 'Skimming', 0, 'draft', owner_user), (l2, academy, course, m2, 'Task 2 essay', 0, 'draft', owner_user);
  insert into public.academy_quizzes(id, academy_id, course_id, lesson_id, title, status, passing_score, created_by)
  values (quiz, academy, course, l1, 'Reading check', 'published', 60, owner_user);
  insert into public.academy_quiz_questions(academy_id, quiz_id, question_type, prompt, options, correct_answer, points, position, created_by)
  values (academy, quiz, 'single_choice', 'Skimming means…', '["reading for gist","reading every word"]', '"reading for gist"', 1, 0, owner_user);

  -- 1. A group created before versions existed stays live.
  insert into public.academy_classroom_courses(academy_id, classroom_id, course_id, status, version_mode)
  values (academy, class_old, course, 'active', 'live') returning id into run_old;
  -- 2. A group assigned while the course is a draft waits for the first version.
  insert into public.academy_classroom_courses(academy_id, classroom_id, course_id, status, assigned_by)
  values (academy, class_a, course, 'active', owner_user) returning * into r;
  run_a := r.id;
  if r.version_mode <> 'pinned' or r.course_version_id is not null then raise exception 'A new run should be pinned and waiting: %', to_jsonb(r); end if;
  if exists (select 1 from public.academy_course_versions where course_id = course) then raise exception 'A draft course got a version'; end if;

  -- 3. Publishing (modules and lessons first, then the course) takes version 1 and starts the waiting group on it.
  update public.academy_course_modules set status = 'published' where course_id = course;
  update public.academy_lessons set status = 'published' where course_id = course;
  update public.academy_courses set status = 'published', published_at = now() where id = course;
  select * into v1 from public.academy_course_versions where course_id = course and version = 1;
  if v1.id is null or v1.module_count <> 2 or v1.lesson_count <> 2 or v1.quiz_count <> 1 then raise exception 'Version 1 is wrong: %', to_jsonb(v1) - 'snapshot'; end if;
  if v1.snapshot->'questions'->0->>'correct_answer' is null then raise exception 'Version 1 lost the answer key'; end if;
  if (select course_version_id from public.academy_classroom_courses where id = run_a) is distinct from v1.id then raise exception 'The waiting group did not start on version 1'; end if;
  if (select course_version_id from public.academy_classroom_courses where id = run_old) is not null then raise exception 'A live group was pinned by publishing'; end if;

  -- 4. Publishing again with nothing changed does not create a version.
  update public.academy_courses set published_at = now() + interval '1 minute' where id = course;
  if (select count(*) from public.academy_course_versions where course_id = course) <> 1 then raise exception 'An unchanged publish created a version'; end if;
  perform public.academy_course_publish_version(academy, course, owner_user);
  if (select published_by from public.academy_course_versions where id = v1.id) is distinct from owner_user then raise exception 'Publisher was not recorded'; end if;

  -- 5. Edit the live course: rename a lesson, open module 2, add a lesson; re-publish.
  update public.academy_lessons set title = 'Skimming and scanning' where id = l1;
  update public.academy_course_modules set unlock_rule = '{}' where id = m2;
  insert into public.academy_lessons(id, academy_id, course_id, module_id, title, position, status, created_by)
  values (l3, academy, course, m1, 'Scanning', 1, 'published', owner_user);
  update public.academy_courses set published_at = now() + interval '2 minutes' where id = course;
  select * into v2 from public.academy_course_versions where course_id = course and version = 2;
  if v2.id is null or v2.lesson_count <> 3 then raise exception 'Version 2 is wrong: %', to_jsonb(v2) - 'snapshot'; end if;

  -- 6. Group A is untouched: still version 1, old title, module 2 still behind the check.
  if (select course_version_id from public.academy_classroom_courses where id = run_a) is distinct from v1.id then raise exception 'Editing the course moved group A'; end if;
  if public.academy_run_snapshot(academy, class_a, course)->'lessons' @> jsonb_build_array(jsonb_build_object('id', l3)) then raise exception 'Group A sees a lesson added later'; end if;
  if not public.academy_run_snapshot(academy, class_a, course)->'lessons' @> jsonb_build_array(jsonb_build_object('id', l1, 'title', 'Skimming')) then
    raise exception 'Group A lost the published lesson title';
  end if;
  if public.academy_module_unlocked(academy, class_a, child_a, m2) then raise exception 'Group A follows the live unlock rule'; end if;
  begin
    insert into public.academy_lesson_progress(academy_id, classroom_id, course_id, lesson_id, contact_id, user_id, status)
    values (academy, class_a, course, l2, child_a, student, 'in_progress');
    raise exception 'Group A started a locked module';
  exception when raise_exception then
    if sqlerrm not like 'Pass the module check%' then raise; end if;
  end;
  insert into public.academy_quiz_attempts(academy_id, classroom_id, course_id, quiz_id, contact_id, user_id, attempt_number, status, percentage, passed, submitted_at)
  values (academy, class_a, course, quiz, child_a, student, 1, 'graded', 80, true, now());
  insert into public.academy_lesson_progress(academy_id, classroom_id, course_id, lesson_id, contact_id, user_id, status)
  values (academy, class_a, course, l2, child_a, student, 'in_progress');

  -- 7. The live group follows the live rule (module 2 is open now).
  if not public.academy_module_unlocked(academy, class_old, child_old, m2) then raise exception 'The live group did not follow the live rule'; end if;
  if public.academy_run_snapshot(academy, class_old, course) is not null then raise exception 'The live group reads a snapshot'; end if;

  -- 8. A group assigned now starts on the latest version.
  insert into public.academy_classroom_courses(academy_id, classroom_id, course_id, status, assigned_by)
  values (academy, class_b, course, 'active', owner_user) returning id into run_b;
  if (select course_version_id from public.academy_classroom_courses where id = run_b) is distinct from v2.id then raise exception 'A new group did not start on version 2'; end if;
  -- Re-assigning an existing run (the edge upsert) keeps its version.
  insert into public.academy_classroom_courses(academy_id, classroom_id, course_id, status, assigned_by)
  values (academy, class_a, course, 'active', owner_user)
  on conflict (classroom_id, course_id) do update set status = excluded.status, assigned_by = excluded.assigned_by;
  if (select course_version_id from public.academy_classroom_courses where id = run_a) is distinct from v1.id then raise exception 'Re-assigning moved group A'; end if;

  -- 9. Staff labels: each group's version and the newest one.
  result := public.academy_course_version_summaries(academy, array[course], array[run_a, run_b, run_old]);
  if (result->'latest'->0->>'version')::int is distinct from 2 or jsonb_array_length(result->'runs') <> 3
     or not result->'runs' @> jsonb_build_array(jsonb_build_object('id', run_a, 'version', 1, 'version_mode', 'pinned'))
     or not result->'runs' @> jsonb_build_array(jsonb_build_object('id', run_old, 'version_mode', 'live')) then
    raise exception 'Version summaries are wrong: %', result;
  end if;

  -- 10. Moving is explicit, refuses a stale target and needs manageAssignments on the group.
  begin
    perform public.academy_classroom_course_move_version(academy, run_a, owner_user, 1);
    raise exception 'A move to a stale version succeeded';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    perform public.academy_classroom_course_move_version(academy, run_a, student, null);
    raise exception 'A learner moved a group';
  exception when insufficient_privilege then null;
  end;
  result := public.academy_classroom_course_move_version(academy, run_a, owner_user, 2);
  if (result->>'from_version')::int is distinct from 1 or (result->>'to_version')::int is distinct from 2 or result->>'changed' is distinct from 'true' then raise exception 'Move result is wrong: %', result; end if;
  if (select course_version_id from public.academy_classroom_courses where id = run_a) is distinct from v2.id then raise exception 'Group A did not move'; end if;
  if not public.academy_run_snapshot(academy, class_a, course)->'lessons' @> jsonb_build_array(jsonb_build_object('id', l3)) then raise exception 'Group A does not see version 2'; end if;
  result := public.academy_classroom_course_move_version(academy, run_old, owner_user, 2);
  if result->>'from_mode' is distinct from 'live' or (select version_mode from public.academy_classroom_courses where id = run_old) <> 'pinned' then
    raise exception 'The live group was not pinned: %', result;
  end if;

  -- 11. The catalogue shows the latest version, and completion counts every group.
  update public.academy_lessons set status = 'draft' where id = l3;
  insert into public.academy_course_listings(academy_id, course_id, status, slug, headline, format, language, listed_at)
  values (academy, course, 'listed', 'versions-' || left(md5(academy::text), 8), 'Version fixture IELTS', 'blended', 'uz', now());
  result := public.academy_public_course_catalog('versions-' || left(md5(academy::text), 8), null, null, null, 1);
  if (result->0->'course'->>'version')::int is distinct from 2 or (result->0->'course'->'modules'->0->>'lessons')::int is distinct from 2
     or result->0->'course'->'modules'->0->>'title' is distinct from 'Reading' then
    raise exception 'Catalogue does not read the latest version: %', result->0->'course';
  end if;
  if (result->0->'results'->>'learners')::int is distinct from 3 then raise exception 'Completion learners are wrong: %', result->0->'results'; end if;

  -- 12. A course created already published gets its first version on first assignment.
  insert into public.academy_courses(id, academy_id, title, status, published_at, created_by) values (quick_course, academy, 'Quick course', 'published', now(), owner_user);
  insert into public.academy_course_modules(id, academy_id, course_id, title, position, status, created_by) values (quick_module, academy, quick_course, 'Only module', 0, 'published', owner_user);
  insert into public.academy_lessons(id, academy_id, course_id, module_id, title, position, status, created_by) values (quick_lesson, academy, quick_course, quick_module, 'Only lesson', 0, 'published', owner_user);
  insert into public.academy_classroom_courses(academy_id, classroom_id, course_id, status) values (academy, class_b, quick_course, 'active') returning * into r;
  select count(*) into n from public.academy_course_versions where course_id = quick_course and lesson_count = 1;
  if n <> 1 or r.course_version_id is null then raise exception 'First assignment did not version a published course'; end if;

  -- 13. Browsers never read snapshots (they hold answer keys) or call version functions.
  if has_table_privilege('authenticated', 'public.academy_course_versions', 'SELECT')
     or has_table_privilege('anon', 'public.academy_course_versions', 'SELECT')
     or has_function_privilege('authenticated', 'public.academy_classroom_course_move_version(uuid,uuid,uuid,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.academy_course_publish_version(uuid,uuid,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.academy_run_snapshot(uuid,uuid,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.academy_course_snapshot(uuid,uuid)', 'EXECUTE') then
    raise exception 'Browser role reaches course versions directly';
  end if;
end;
$fixture$;
rollback;
select 'academy-course-versions-ok';
