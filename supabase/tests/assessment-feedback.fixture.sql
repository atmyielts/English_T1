\set ON_ERROR_STOP on
-- Synthetic already-approved grading generations. The browser must release
-- them through the real grade command and approved feedback-policy checks.
create table public.assessment_feedback_fixture_ids(window_id uuid,attempt_id uuid);
do $$ declare src public.assessment_grading_runs;score_id uuid;points jsonb;win uuid;n integer;begin
 select r.* into src from assessment_grading_runs r join assessment_attempts a on a.id=r.attempt_id join assessment_registrations g on g.id=a.registration_id join assessment_exam_windows w on w.id=g.window_id where w.title='Grading sitting' and r.generation=2;
 select scores into points from assessment_score_revisions where id=src.score_revision_id;
 select g.window_id into win from assessment_attempts a join assessment_registrations g on g.id=a.registration_id where a.id=src.attempt_id;
 for n in 3..4 loop
  insert into assessment_score_revisions(tenant_id,attempt_id,scores,status,source,approved_by) values(src.tenant_id,src.attempt_id,points,'approved','human',src.approved_by) returning id into score_id;
  insert into assessment_grading_runs(tenant_id,attempt_id,generation,input_hash,scorer_version,objective_scores,policy_snapshot,status,approved_by,approved_at,approved_hash,score_revision_id) values(src.tenant_id,src.attempt_id,n,repeat('e',64),src.scorer_version,points,src.policy_snapshot,'approved',src.approved_by,clock_timestamp(),repeat('f',64),score_id);
 end loop;
 insert into assessment_feedback_fixture_ids values(win,src.attempt_id);
end;$$;
