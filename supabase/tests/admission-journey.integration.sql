-- Admission journey: exam path, weekly mocks, prediction snapshots and mock answers.
\set ON_ERROR_STOP 1
\i /work/journey.sql

do $$
declare
  learner constant uuid := '00000000-0000-4000-8000-0000000000a2';
  raised boolean;
begin
  insert into public.learner_subject_milestones (user_id, subject, exam_code, sitting_date, target_grade)
    values (learner, 'math', 'uz-certificate-math', '2026-11-23', 'A');
  -- The same exam on the same day cannot be planned twice.
  raised := false;
  begin
    insert into public.learner_subject_milestones (user_id, subject, exam_code, sitting_date) values (learner, 'math', 'uz-certificate-math', '2026-11-23');
  exception when unique_violation then raised := true;
  end;
  assert raised, 'duplicate milestone refused';
  raised := false;
  begin
    insert into public.learner_subject_milestones (user_id, subject, exam_code, sitting_date, result_grade) values (learner, 'math', 'uz-certificate-math', '2026-12-01', 'Z');
  exception when check_violation then raised := true;
  end;
  assert raised, 'unknown grade refused';
  update public.learner_subject_milestones set status = 'done', result_grade = 'none' where user_id = learner;
  assert (select result_grade from public.learner_subject_milestones where user_id = learner) = 'none', 'below-C result allowed';

  -- One mock per learner per week; points only once submitted.
  insert into public.learner_subject_mocks (user_id, subject, week, section_id, question_locale, items, deadline_at)
    values (learner, 'math', '2026-11-02', 'specialised_1', 'uz', '[{"item_version_id":"40000000-0000-4000-8000-000000000001","topic_code":"math.alg.quadratic"}]', now() + interval '1 hour');
  raised := false;
  begin
    insert into public.learner_subject_mocks (user_id, subject, week, section_id, question_locale, items, deadline_at)
      values (learner, 'math', '2026-11-02', 'specialised_1', 'uz', '[{"item_version_id":"40000000-0000-4000-8000-000000000001","topic_code":"math.alg.quadratic"}]', now());
  exception when unique_violation then raised := true;
  end;
  assert raised, 'second mock in a week refused';
  raised := false;
  begin
    update public.learner_subject_mocks set points = 31 where user_id = learner;
  exception when check_violation then raised := true;
  end;
  assert raised, 'points need a submission';
  update public.learner_subject_mocks set points = 31, max_points = 93, correct = 1, submitted_at = now() where user_id = learner;

  -- Mock answers are recorded like practice answers.
  perform public.learner_subject_record_answer(learner, 'math', 'math.alg.quadratic',
    '{"client_answer_id":"50000000-0000-4000-8000-0000000000f1","item_version_id":"40000000-0000-4000-8000-000000000001","mode":"mock","difficulty":0,"correct":true,"response":"a","seconds":120}', 1,
    '{"theta":0.8,"precision":1.5,"attempts":2,"correct":2,"box":2,"last_at":"2026-11-02T09:00:00Z","next_review_at":"2026-11-06T09:00:00Z"}');
  assert (select count(*) from public.learner_subject_answers where mode = 'mock') = 1, 'mock answer stored';

  insert into public.learner_subject_prediction_snapshots (user_id, subject, day, section_id, expected, low, high) values (learner, 'math', '2026-11-02', 'specialised_1', 40.5, 20, 61);
end $$;

-- Browsers get nothing directly.
set role authenticated;
do $$
begin
  begin perform 1 from public.learner_subject_milestones; raise exception 'authenticated read milestones'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.learner_subject_mocks; raise exception 'authenticated read mocks'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.learner_subject_prediction_snapshots; raise exception 'authenticated read snapshots'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'admission journey: ok';
