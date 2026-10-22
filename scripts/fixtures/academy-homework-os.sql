-- Homework OS and Courses (20261024100000_academy_homework_os.sql) against
-- the real Academy commands. Runs inside one transaction and rolls back.
begin;
do $fixture$
declare
  owner_user uuid := gen_random_uuid(); student uuid := gen_random_uuid(); peer uuid := gen_random_uuid(); parent_user uuid := gen_random_uuid();
  academy uuid := gen_random_uuid(); branch uuid := gen_random_uuid(); classroom uuid := gen_random_uuid();
  child uuid := gen_random_uuid(); other_child uuid := gen_random_uuid(); assignment uuid := gen_random_uuid();
  course uuid := gen_random_uuid(); m1 uuid := gen_random_uuid(); m2 uuid := gen_random_uuid(); l1 uuid := gen_random_uuid(); l2 uuid := gen_random_uuid(); quiz uuid := gen_random_uuid();
  guardian uuid := gen_random_uuid(); relationship uuid := gen_random_uuid();
  sub public.academy_submissions; plan jsonb; scope jsonb; funnel jsonb; result jsonb; n integer;
begin
  update public.academy_learning_config set value = 'true'::jsonb where key in ('premark.enabled', 'digest.enabled');
  update public.academy_learning_config set value = 'false'::jsonb where key = 'billing.enforced';

  insert into auth.users(id, email, aud, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  select id, id || '@example.invalid', 'authenticated', 'authenticated', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Homework fixture"}'
  from unnest(array[owner_user, student, peer, parent_user]) id;
  insert into public.tenants(id, name, slug, type, created_by) values (academy, 'Homework fixture Academy', academy::text, 'team', owner_user);
  insert into public.tenant_memberships(tenant_id, user_id, role, status) values (academy, owner_user, 'owner', 'active');
  insert into public.academy_branches(id, academy_id, branch_key, name, timezone, is_default) values (branch, academy, 'hw', 'Homework branch', 'Asia/Tashkent', true);
  insert into public.academy_classrooms(id, academy_id, branch_id, name, created_by) values (classroom, academy, branch, 'Homework class', owner_user);
  insert into public.academy_contacts(id, academy_id, primary_branch_id, user_id, first_name, email, status, created_by)
  values (child, academy, branch, student, 'Aziza', student || '@example.invalid', 'active', owner_user),
         (other_child, academy, branch, peer, 'Bobur', peer || '@example.invalid', 'active', owner_user);
  insert into public.academy_classroom_memberships(academy_id, classroom_id, contact_id, role, status)
  values (academy, classroom, child, 'student', 'active'), (academy, classroom, other_child, 'student', 'active');
  insert into public.academy_assignments(id, academy_id, classroom_id, title, status, attempts_allowed, allow_late_submission, max_score, due_at, created_by)
  values (assignment, academy, classroom, 'Unit 5 essay', 'active', 1, true, 10, now() + interval '1 day', owner_user);

  -- 1. A hand-in through the existing written command is tracked and queued for AI.
  result := public.academy_assignment_written_command(academy, student, assignment,
    '{"submission_content":"My city are big.","metadata":{"response_kind":"text","source":"telegram_bot"}}');
  select * into sub from public.academy_submissions where id = (result->>'id')::uuid;
  if not exists (select 1 from public.academy_homework_events where assignment_id = assignment and contact_id = child and event = 'submitted' and source = 'telegram_bot') then
    raise exception 'Submission was not tracked in the funnel';
  end if;
  if (select count(*) from public.academy_homework_ai_marks where submission_id = sub.id and status = 'queued') <> 1 then
    raise exception 'Submission was not queued for AI pre-marking';
  end if;

  -- 2. Staff scope comes from current authorities; a learner has none.
  scope := public.academy_homework_staff_scope(academy, owner_user, 'gradeSubmissions');
  if scope->>'academy_wide' <> 'true' then raise exception 'Owner should review academy-wide: %', scope; end if;
  begin
    scope := public.academy_homework_staff_scope(academy, student, 'gradeSubmissions');
    if scope->>'allowed' = 'true' then raise exception 'A learner got review scope'; end if;
  exception when insufficient_privilege then null;
  end;

  -- 3. The released score comes only from the existing grading command, and is tracked.
  result := public.academy_grading_command(academy, owner_user, 'grade_submission', jsonb_build_object(
    'submission_id', sub.id, 'assignment_id', assignment, 'contact_id', child, 'score', 7, 'max_score', 10,
    'feedback', '{"comments":"Good start","source":"homework_os"}'::jsonb, 'expected_attempt_number', 1,
    'expected_updated_at', sub.updated_at, 'expected_assignment_updated_at', (select updated_at from public.academy_assignments where id = assignment)),
    'hw:fixture:grade');
  if not exists (select 1 from public.academy_homework_events where assignment_id = assignment and contact_id = child and event = 'reviewed' and actor_user_id = owner_user) then
    raise exception 'Grade was not tracked as reviewed';
  end if;
  update public.academy_homework_ai_marks set status = 'ready' where submission_id = sub.id;

  -- 4. Funnel: two learners assigned, one submitted and reviewed.
  funnel := public.academy_homework_funnel(academy, now() - interval '7 days', now() + interval '7 days', null);
  if (funnel->'classrooms'->0->>'assigned')::int <> 2 or (funnel->'classrooms'->0->>'submitted')::int <> 1
     or (funnel->'classrooms'->0->>'reviewed')::int <> 1 or (funnel->'classrooms'->0->>'on_time')::int <> 1 then
    raise exception 'Funnel counts are wrong: %', funnel;
  end if;
  if jsonb_array_length(funnel->'reviewers') <> 1 then raise exception 'Reviewer stats missing: %', funnel; end if;

  -- 5. Billing: open while not enforced; once enforced an independent academy needs the teaching plan.
  plan := public.academy_learning_plan(academy);
  if plan->>'audience' <> 'independent' or plan->'allowed'->>'homework' <> 'true' then raise exception 'Unenforced plan should allow: %', plan; end if;
  update public.academy_learning_config set value = 'true'::jsonb where key = 'billing.enforced';
  if public.academy_learning_allows(academy, 'homework') then raise exception 'Enforced billing allowed an unpaid academy'; end if;
  begin
    insert into public.academy_courses(id, academy_id, title, status, created_by) values (gen_random_uuid(), academy, 'Unpaid course', 'published', owner_user);
    raise exception 'An unpaid academy published a course';
  exception when insufficient_privilege then null;
  end;
  insert into public.entitlements(user_id, tenant_id, resource_type, resource_id, is_active, starts_at, ends_at, source, value)
  values (owner_user, academy, 'product', '00000000-0000-4000-8000-000000000801', true, now() - interval '1 minute', now() + interval '30 days', 'click',
          jsonb_build_object('plan_id', '00000000-0000-4000-8000-000000000812'));
  plan := public.academy_learning_plan(academy);
  if plan->>'teacher_tier' <> 'teacher_pro' or plan->'allowed'->>'homework_ai' <> 'true' or plan->'allowed'->>'courses' <> 'true' then
    raise exception 'Teacher Pro entitlement not recognised: %', plan;
  end if;

  -- 6. Courses: publishing works on the plan; a module behind a quiz stays locked until the quiz is passed.
  insert into public.academy_courses(id, academy_id, title, status, created_by) values (course, academy, 'Paid course', 'published', owner_user);
  insert into public.academy_course_modules(id, academy_id, course_id, title, position, status, unlock_rule, created_by)
  values (m1, academy, course, 'Module 1', 0, 'published', '{}', owner_user),
         (m2, academy, course, 'Module 2', 1, 'published', jsonb_build_object('type', 'quiz_pass', 'quiz_id', quiz, 'min_percent', 70), owner_user);
  insert into public.academy_lessons(id, academy_id, course_id, module_id, title, position, status, created_by)
  values (l1, academy, course, m1, 'Lesson 1', 0, 'published', owner_user), (l2, academy, course, m2, 'Lesson 2', 0, 'published', owner_user);
  insert into public.academy_quizzes(id, academy_id, course_id, lesson_id, title, status, passing_score, created_by)
  values (quiz, academy, course, l1, 'Module 1 check', 'published', 60, owner_user);
  insert into public.academy_classroom_courses(academy_id, classroom_id, course_id, status) values (academy, classroom, course, 'active');
  if public.academy_module_unlocked(academy, classroom, child, m2) then raise exception 'Module 2 opened without the check'; end if;
  begin
    insert into public.academy_lesson_progress(academy_id, classroom_id, course_id, lesson_id, contact_id, user_id, status)
    values (academy, classroom, course, l2, child, student, 'in_progress');
    raise exception 'Locked module lesson was started';
  exception when raise_exception then
    if sqlerrm not like 'Pass the module check%' then raise; end if;
  end;
  insert into public.academy_quiz_attempts(academy_id, classroom_id, course_id, quiz_id, contact_id, user_id, attempt_number, status, percentage, passed, submitted_at)
  values (academy, classroom, course, quiz, child, student, 1, 'graded', 65, true, now());
  if public.academy_module_unlocked(academy, classroom, child, m2) then raise exception 'A 65%% attempt passed a 70%% check'; end if;
  insert into public.academy_quiz_attempts(academy_id, classroom_id, course_id, quiz_id, contact_id, user_id, attempt_number, status, percentage, passed, submitted_at)
  values (academy, classroom, course, quiz, child, student, 2, 'graded', 80, true, now());
  insert into public.academy_lesson_progress(academy_id, classroom_id, course_id, lesson_id, contact_id, user_id, status)
  values (academy, classroom, course, l2, child, student, 'in_progress');

  -- 7. Weekly parent summary goes into the existing guardian outbox, once per week.
  insert into public.academy_guardians(id, academy_id, user_id, full_name, telegram_user_id, telegram_chat_id, telegram_verified_at, status, locale)
  values (guardian, academy, parent_user, 'Aziza''s mother', '777', '777', now(), 'verified', 'en');
  insert into public.academy_student_guardian_relationships(id, academy_id, contact_id, guardian_id, relationship_type, status, consent_status, consented_at)
  values (relationship, academy, child, guardian, 'mother', 'active', 'granted', now());
  n := public.academy_homework_queue_guardian_digest((date_trunc('week', now() at time zone 'Asia/Tashkent'))::date);
  if n <> 1 then raise exception 'Expected one weekly summary, queued %', n; end if;
  if not exists (select 1 from public.academy_notifications where guardian_id = guardian and relationship_id = relationship
                 and event_key = 'progress_report_ready' and body like '%Handed in: 1 of 1%') then
    raise exception 'Weekly summary content is wrong: %', (select body from public.academy_notifications where guardian_id = guardian);
  end if;
  if public.academy_homework_queue_guardian_digest((date_trunc('week', now() at time zone 'Asia/Tashkent'))::date) <> 0 then
    raise exception 'Weekly summary was queued twice';
  end if;

  -- 8. Telegram album drafts collect every photo into one row.
  result := public.academy_telegram_draft_append(student, '555', 'album-1', '{"file_id":"a"}', 'caption');
  if result->>'created' <> 'true' then raise exception 'First album item did not create the draft'; end if;
  result := public.academy_telegram_draft_append(student, '555', 'album-1', '{"file_id":"b"}', null);
  if result->>'created' <> 'false' or jsonb_array_length(result->'draft'->'items') <> 2 then raise exception 'Album draft lost a photo: %', result; end if;

  -- 9. Browsers never reach the new tables or functions directly.
  if has_table_privilege('authenticated', 'public.academy_homework_ai_marks', 'SELECT')
     or has_table_privilege('anon', 'public.academy_homework_events', 'SELECT')
     or has_function_privilege('authenticated', 'public.academy_learning_plan(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.academy_homework_staff_scope(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'Browser role bypasses the Homework OS gateway';
  end if;
end;
$fixture$;
rollback;
select 'academy-homework-os-ok';
