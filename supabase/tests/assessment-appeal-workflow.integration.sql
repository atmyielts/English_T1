\set ON_ERROR_STOP on
begin;
insert into users(id) values('00000000-0000-4000-8000-0000000000d2');
insert into tenant_memberships(tenant_id,user_id,status,role) values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000d2','active','member');
insert into assessment_capability_grants(tenant_id,user_id,capability,granted_by) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','grades.moderate','00000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000d2','grades.moderate','00000000-0000-4000-8000-000000000001');
do $$ declare tenant uuid:='10000000-0000-4000-8000-000000000001';candidate uuid:='00000000-0000-4000-8000-000000000003';owner uuid:='00000000-0000-4000-8000-000000000001';first_reviewer uuid:='00000000-0000-4000-8000-0000000000d2';second_reviewer uuid:='00000000-0000-4000-8000-000000000002';
 run assessment_grading_runs;input jsonb;result jsonb;aid uuid;detail jsonb;before_scores jsonb;
begin
 select r.* into run from assessment_grading_runs r join assessment_attempts a on a.id=r.attempt_id join assessment_registrations g on g.id=a.registration_id join assessment_exam_windows w on w.id=g.window_id where w.title='Grading sitting' and r.generation=2;
 if run.id is null then raise exception 'Released grading fixture missing';end if;
 select jsonb_agg(to_jsonb(s) order by s.id) into before_scores from assessment_score_revisions s where attempt_id=run.attempt_id;
 -- Policy: only result releasers set it; revisions are fenced.
 begin perform assessment_appeal_command(candidate,tenant,'policy-candidate','appeal.policy.set','{"expected_revision":0,"filing_days":30,"escalation_days":14}');raise exception 'Candidate set appeal policy';exception when insufficient_privilege then null;end;
 result:=assessment_appeal_command(owner,tenant,'policy-set-0001','appeal.policy.set','{"expected_revision":0,"filing_days":30,"escalation_days":14}');
 if result->>'revision'<>'1' or assessment_appeal_command(owner,tenant,'policy-set-0001','appeal.policy.set','{"expected_revision":0,"filing_days":30,"escalation_days":14}')<>result then raise exception 'Policy receipt changed';end if;
 begin perform assessment_appeal_command(owner,tenant,'policy-set-stale','appeal.policy.set','{"expected_revision":0,"filing_days":10}');raise exception 'Stale policy accepted';exception when unique_violation then null;end;
 if (assessment_appeal_read(second_reviewer,tenant,'policy')->>'filing_days')::int<>30 then raise exception 'Policy not readable by moderators';end if;
 input:=jsonb_build_object('attempt_id',run.attempt_id,'score_revision_id',run.score_revision_id,'category','scoring','reason','Please review the accuracy criterion.');
 -- A filing deadline that has passed refuses a new appeal (test-only shifted release time).
 begin
  alter table assessment_grading_releases disable trigger user;
  update assessment_grading_releases set release_at=clock_timestamp()-interval '31 days' where run_id=run.id;
  begin perform assessment_appeal_command(candidate,tenant,'appeal-late','appeal.submit',input);raise exception 'Late appeal accepted';exception when check_violation then if sqlerrm<>'appeal_window_closed' then raise;end if;end;
  raise exception 'rollback shifted release' using errcode='ZX004';
 exception when sqlstate 'ZX004' then null;end;
 result:=assessment_appeal_command(candidate,tenant,'workflow-submit','appeal.submit',input);aid:=(result->>'id')::uuid;
 detail:=assessment_appeal_read(candidate,tenant,'detail',aid);
 if detail->>'filing_deadline' is null or detail->>'stage'<>'1' then raise exception 'Deadline/stage missing: %',detail;end if;
 -- Assignment: only an independent moderator can be assigned; then only they decide.
 begin perform assessment_appeal_command(owner,tenant,'assign-owner','appeal.assign',jsonb_build_object('appeal_id',aid,'expected_revision',1,'reviewer_id',owner));raise exception 'Releaser assigned as independent reviewer';exception when insufficient_privilege then null;end;
 result:=assessment_appeal_command(owner,tenant,'assign-first','appeal.assign',jsonb_build_object('appeal_id',aid,'expected_revision',1,'reviewer_id',first_reviewer));
 if result->>'assigned_to'<>first_reviewer::text then raise exception 'Assignment not recorded';end if;
 begin perform assessment_appeal_command(second_reviewer,tenant,'decide-unassigned','appeal.decide',jsonb_build_object('appeal_id',aid,'expected_revision',2,'outcome','upheld','explanation','Reviewed.'));raise exception 'Unassigned reviewer decided';exception when insufficient_privilege then if sqlerrm<>'appeal_assigned_to_another_reviewer' then raise;end if;end;
 result:=assessment_appeal_command(first_reviewer,tenant,'decide-first','appeal.decide',jsonb_build_object('appeal_id',aid,'expected_revision',2,'outcome','upheld','explanation','The criterion was applied as published.'));
 if result->>'status'<>'upheld' then raise exception 'First decision failed';end if;
 -- Escalation: only the candidate, only from an upheld first stage.
 begin perform assessment_appeal_command(owner,tenant,'escalate-staff','appeal.escalate',jsonb_build_object('appeal_id',aid,'expected_revision',3,'reason','x'));raise exception 'Staff escalated for the candidate';exception when insufficient_privilege then null;end;
 if not (assessment_appeal_read(candidate,tenant,'detail',aid)->>'can_escalate')::boolean then raise exception 'Escalation not offered';end if;
 result:=assessment_appeal_command(candidate,tenant,'escalate-1','appeal.escalate',jsonb_build_object('appeal_id',aid,'expected_revision',3,'reason','The marking guide was not followed for part B.'));
 if result->>'status'<>'escalated' or result->>'stage'<>'2' then raise exception 'Escalation failed: %',result;end if;
 -- The first-stage decider cannot take the second stage.
 begin perform assessment_appeal_command(first_reviewer,tenant,'decide-same','appeal.decide',jsonb_build_object('appeal_id',aid,'expected_revision',4,'outcome','upheld','explanation','Same reviewer.'));raise exception 'First decider took second stage';exception when insufficient_privilege then null;end;
 begin perform assessment_appeal_command(owner,tenant,'assign-same','appeal.assign',jsonb_build_object('appeal_id',aid,'expected_revision',4,'reviewer_id',first_reviewer));raise exception 'First decider assigned to second stage';exception when insufficient_privilege then null;end;
 -- The candidate may withdraw an escalation (checked, then rolled back).
 begin
  result:=assessment_appeal_command(candidate,tenant,'withdraw-escalation','appeal.withdraw',jsonb_build_object('appeal_id',aid,'expected_revision',4,'explanation','No longer needed.'));
  if result->>'status'<>'withdrawn' then raise exception 'Escalation withdrawal failed';end if;
  raise exception 'rollback withdrawal' using errcode='ZX005';
 exception when sqlstate 'ZX005' then null;end;
 result:=assessment_appeal_command(second_reviewer,tenant,'decide-second','appeal.decide',jsonb_build_object('appeal_id',aid,'expected_revision',4,'outcome','upheld','explanation','Independent second review confirms the published criterion.'));
 if result->>'status'<>'upheld' or result->>'stage'<>'2' then raise exception 'Second-stage decision failed: %',result;end if;
 begin perform assessment_appeal_command(candidate,tenant,'escalate-again','appeal.escalate',jsonb_build_object('appeal_id',aid,'expected_revision',5,'reason','again'));raise exception 'Second escalation accepted';exception when check_violation then null;end;
 if (select string_agg(event,',' order by revision) from assessment_appeal_events where appeal_id=aid)<>'submitted,assigned,upheld,escalated,upheld' then raise exception 'Appeal history wrong: %',(select string_agg(event,',' order by revision) from assessment_appeal_events where appeal_id=aid);end if;
 if (select jsonb_agg(to_jsonb(s) order by s.id) from assessment_score_revisions s where attempt_id=run.attempt_id) is distinct from before_scores then raise exception 'Appeal workflow changed scores';end if;
 begin update assessment_result_appeals set category='procedure',revision=revision+1 where id=aid;raise exception 'Appeal content edited';exception when check_violation then null;end;
end $$;
rollback;
