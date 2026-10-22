\set ON_ERROR_STOP on
begin;
-- Uses the real released mixed-assessment history created by grading acceptance.
insert into assessment_capability_grants(tenant_id,user_id,capability,granted_by) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','grades.moderate','00000000-0000-4000-8000-000000000001');
do $$ declare tenant uuid:='10000000-0000-4000-8000-000000000001';candidate uuid:='00000000-0000-4000-8000-000000000003';owner uuid:='00000000-0000-4000-8000-000000000001';reviewer uuid:='00000000-0000-4000-8000-000000000002';
 run assessment_grading_runs;old_run assessment_grading_runs;result jsonb;input jsonb;aid uuid;visible jsonb;before_scores jsonb;future_score uuid;future_run uuid;
begin
 select r.* into run from assessment_grading_runs r join assessment_attempts a on a.id=r.attempt_id join assessment_registrations g on g.id=a.registration_id join assessment_exam_windows w on w.id=g.window_id where w.title='Grading sitting' and r.generation=2;
 if run.id is null then raise exception 'Released grading fixture missing';end if;
 select * into old_run from assessment_grading_runs where attempt_id=run.attempt_id and generation=1;
 select jsonb_agg(to_jsonb(s) order by s.id) into before_scores from assessment_score_revisions s where attempt_id=run.attempt_id;
 input:=jsonb_build_object('attempt_id',run.attempt_id,'score_revision_id',run.score_revision_id,'category','scoring','reason','Please review the accuracy criterion.');
 begin perform assessment_appeal_command(owner,tenant,'appeal-foreign-submit','appeal.submit',input);raise exception 'Staff submitted for candidate';exception when insufficient_privilege then null;end;
 begin perform assessment_appeal_command(candidate,'10000000-0000-4000-8000-000000000002','appeal-foreign-tenant','appeal.submit',input);raise exception 'Foreign tenant accepted';exception when no_data_found then null;end;
 begin perform assessment_appeal_command(candidate,tenant,'appeal-historical-score','appeal.submit',jsonb_set(input,'{score_revision_id}',to_jsonb(old_run.score_revision_id)));raise exception 'Superseded result appeal accepted';exception when check_violation then null;end;
 begin perform assessment_appeal_command(candidate,tenant,'appeal-empty-reason','appeal.submit',jsonb_set(input,'{reason}','"   "'));raise exception 'Empty reason accepted';exception when invalid_parameter_value then null;end;
 begin
  -- Canonical-shape seeded future release tests disclosure embargo, not worker execution.
  insert into assessment_score_revisions(tenant_id,attempt_id,scores,status,source,approved_by) select tenant_id,attempt_id,scores,status,source,approved_by from assessment_score_revisions where id=run.score_revision_id returning id into future_score;
  insert into assessment_grading_runs(tenant_id,attempt_id,generation,input_hash,scorer_version,objective_scores,policy_snapshot,status,approved_by,approved_at,approved_hash,score_revision_id)
   values(tenant,run.attempt_id,3,run.input_hash,run.scorer_version,run.objective_scores,run.policy_snapshot,'released',owner,clock_timestamp(),run.approved_hash,future_score) returning id into future_run;
  insert into assessment_grading_releases(tenant_id,run_id,score_revision_id,release_at,released_by) values(tenant,future_run,future_score,clock_timestamp()+interval '1 hour',owner);
  begin perform assessment_appeal_command(candidate,tenant,'appeal-embargo-score','appeal.submit',jsonb_set(input,'{score_revision_id}',to_jsonb(future_score)));raise exception 'Embargoed result appealed';exception when check_violation then null;end;
  if assessment_grading_read(candidate,tenant,'results')->0->>'generation'<>'2' then raise exception 'Embargo exposed future result';end if;
  raise exception 'rollback embargo fixture' using errcode='ZX003';
 exception when sqlstate 'ZX003' then null;end;
 result:=assessment_appeal_command(candidate,tenant,'appeal-first-submit','appeal.submit',input);aid:=(result->>'id')::uuid;
 if assessment_appeal_command(candidate,tenant,'appeal-first-submit','appeal.submit',input)<>result then raise exception 'Lost submission replay changed receipt';end if;
 begin perform assessment_appeal_command(candidate,tenant,'appeal-first-submit','appeal.submit',jsonb_set(input,'{reason}','"Changed body"'));raise exception 'Changed replay accepted';exception when unique_violation then null;end;
 begin perform assessment_appeal_command(candidate,tenant,'appeal-second-submit','appeal.submit',input);raise exception 'Duplicate revision appeal accepted';exception when unique_violation then null;end;
 visible:=assessment_appeal_read(candidate,tenant,'detail',aid);if not (visible->>'can_withdraw')::boolean or (visible->>'can_decide')::boolean or visible?'marks' or visible?'key' or visible?'candidate_id' then raise exception 'Candidate appeal projection leaked private grading';end if;
 if jsonb_array_length(assessment_appeal_read(candidate,tenant,'candidate',null,aid,1))<>0 or jsonb_array_length(assessment_appeal_read(candidate,tenant,'candidate',null,null,1))<>1 then raise exception 'Appeal keyset paging did not honor cursor';end if;
 if jsonb_array_length(assessment_appeal_read(owner,tenant,'candidate'))<>0 then raise exception 'Candidate list exposed another person';end if;
 begin perform assessment_appeal_read(candidate,tenant,'queue');raise exception 'Candidate listed reviewer queue';exception when insufficient_privilege then null;end;
 begin perform assessment_appeal_read('00000000-0000-4000-8000-000000000004',tenant,'detail',aid);raise exception 'Observer opened private appeal';exception when insufficient_privilege then null;end;
 input:=jsonb_build_object('appeal_id',aid,'expected_revision',1,'outcome','regrade_requested','explanation','The concern merits independent regrading.');
 begin perform assessment_appeal_command(owner,tenant,'appeal-own-grade-decide','appeal.decide',input);raise exception 'Original approver decided appeal';exception when insufficient_privilege then null;end;
 begin perform assessment_appeal_command('00000000-0000-4000-8000-000000000005',tenant,'appeal-own-mark-decide','appeal.decide',input);raise exception 'Original marker decided appeal';exception when insufficient_privilege then null;end;
 begin perform assessment_appeal_command(reviewer,tenant,'appeal-fractional-revision','appeal.decide',jsonb_set(input,'{expected_revision}','1.1'));raise exception 'Fractional revision accepted';exception when unique_violation then null;end;
 -- Each nested branch verifies a real transition then deliberately rolls back its fixture.
 begin
  result:=assessment_appeal_command(candidate,tenant,'appeal-withdraw-proof','appeal.withdraw',jsonb_build_object('appeal_id',aid,'expected_revision',1,'explanation','I no longer wish to contest this result.'));
  if result->>'status'<>'withdrawn' or jsonb_array_length(assessment_appeal_read(candidate,tenant,'detail',aid)->'events')<>2 then raise exception 'Withdrawal did not close appeal with history';end if;
  begin perform assessment_appeal_command(reviewer,tenant,'appeal-after-withdraw','appeal.decide',input);raise exception 'Withdrawn appeal decided';exception when unique_violation then null;end;
  raise exception 'rollback withdrawal proof' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
 begin
  result:=assessment_appeal_command(reviewer,tenant,'appeal-uphold-proof','appeal.decide',jsonb_set(input,'{outcome}','"upheld"'));
  if result->>'status'<>'upheld' or exists(select 1 from assessment_grading_jobs where attempt_id=run.attempt_id and generation=3) then raise exception 'Uphold requested unnecessary regrade';end if;
  raise exception 'rollback upheld proof' using errcode='ZX002';
 exception when sqlstate 'ZX002' then null;end;
 result:=assessment_appeal_command(reviewer,tenant,'appeal-reviewed-decision','appeal.decide',input);
 if result->>'requested_generation'<>'3' or not exists(select 1 from assessment_grading_jobs where attempt_id=run.attempt_id and generation=3 and state='pending') then raise exception 'Accepted appeal did not atomically enqueue generation';end if;
 if assessment_appeal_command(reviewer,tenant,'appeal-reviewed-decision','appeal.decide',input)<>result then raise exception 'Decision receipt lost on retry';end if;
 update tenant_memberships set status='inactive' where tenant_id=tenant and user_id=reviewer;
 begin perform assessment_appeal_command(reviewer,tenant,'appeal-reviewed-decision','appeal.decide',input);raise exception 'Revoked reviewer replayed receipt';exception when insufficient_privilege then null;end;
 if (select jsonb_agg(to_jsonb(s) order by s.id) from assessment_score_revisions s where attempt_id=run.attempt_id) is distinct from before_scores then raise exception 'Appeal mutated scores';end if;
 if assessment_grading_read(candidate,tenant,'results')->0->>'generation'<>'2' then raise exception 'Pending regrade replaced released result';end if;
 visible:=assessment_appeal_read(candidate,tenant,'detail',aid);if visible->>'status'<>'regrade_requested' or jsonb_array_length(visible->'events')<>2 or visible->>'explanation'<>'The concern merits independent regrading.' then raise exception 'Candidate did not receive decision history';end if;
 begin update assessment_appeal_events set explanation='Rewritten' where appeal_id=aid;raise exception 'Appeal history mutable';exception when check_violation then null;end;
 begin update assessment_result_appeals set reason='Rewritten' where id=aid;raise exception 'Closed appeal mutable';exception when check_violation then null;end;
 if (select count(*) from assessment_audit_events where target_id=aid and action like 'appeal.%')<>2 or (select count(*) from domain_event_outbox where aggregate_id=aid)<>2 then raise exception 'Appeal receipts duplicated audits/events';end if;
end; $$;
set role authenticated;
do $$ begin
 begin perform * from assessment_result_appeals;raise exception 'Raw appeals readable';exception when insufficient_privilege then null;end;
 begin perform assessment_appeal_command('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','bypass-appeal-key','appeal.submit','{}');raise exception 'RPC bypass allowed';exception when insufficient_privilege then null;end;
end; $$;
reset role;
rollback;
