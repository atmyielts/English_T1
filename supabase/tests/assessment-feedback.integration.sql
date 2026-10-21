\set ON_ERROR_STOP on
begin;
-- Only synthetic approved-score fixtures are inserted here. All policy, release,
-- withholding and candidate reads below use the actual canonical entrypoints.
create function pg_temp.feedback_run(p_attempt uuid,p_generation integer) returns uuid language plpgsql as $$
declare src public.assessment_grading_runs;s uuid;r uuid;begin
 select * into src from public.assessment_grading_runs where attempt_id=p_attempt and generation=2;
 insert into public.assessment_score_revisions(tenant_id,attempt_id,scores,status,source,approved_by) select tenant_id,attempt_id,scores,'approved','human',approved_by from public.assessment_score_revisions where id=src.score_revision_id returning id into s;
 insert into public.assessment_grading_runs(tenant_id,attempt_id,generation,input_hash,scorer_version,objective_scores,policy_snapshot,status,approved_by,approved_at,approved_hash,score_revision_id) values(src.tenant_id,p_attempt,p_generation,repeat('e',64),src.scorer_version,src.objective_scores,src.policy_snapshot,'approved',src.approved_by,clock_timestamp(),repeat('f',64),s) returning id into r;return r;
end;$$;
do $$ declare t uuid:='10000000-0000-4000-8000-000000000001';a uuid:='00000000-0000-4000-8000-000000000001';b uuid:='00000000-0000-4000-8000-000000000002';candidate uuid:='00000000-0000-4000-8000-000000000003';win uuid;att uuid;old_release uuid;v uuid;r uuid;released uuid;reply jsonb;data jsonb;preview jsonb;old_snapshot jsonb;score_hash text;latest_hash text;
begin
 select w.id,x.id,l.id,l.feedback_snapshot into win,att,old_release,old_snapshot from assessment_exam_windows w join assessment_registrations g on g.window_id=w.id join assessment_attempts x on x.registration_id=g.id join assessment_grading_runs run on run.attempt_id=x.id and run.generation=2 join assessment_grading_releases l on l.run_id=run.id where w.title='Grading sitting';
 if win is null then raise exception 'Missing released fixture';end if;
 if assessment_released_breakdown(candidate,t,att)->>'feedback_status'<>'totals_only' or assessment_released_breakdown(candidate,t,att)->'sections'<>'[]'::jsonb then raise exception 'Historical release implicitly exposed details';end if;
 data:=jsonb_build_object('window_id',win,'expected_revision',0,'level','questions','available_after',clock_timestamp()+interval '1 day','reason','Share question points after the sitting');
 reply:=assessment_feedback_command(a,t,'feedback-propose-future','policy.propose',data);v:=(reply->>'id')::uuid;
 if assessment_feedback_command(a,t,'feedback-propose-future','policy.propose',data)<>reply then raise exception 'Proposal replay changed receipt';end if;
 if assessment_feedback_current(t,win)->>'level'<>'totals' then raise exception 'Unapproved proposal became active';end if;
 begin perform assessment_feedback_command(a,t,'feedback-self-approve','policy.approve',jsonb_build_object('id',v,'expected_revision',1,'review_hash',assessment_feedback_version_hash(v)));raise exception 'Self approval accepted';exception when insufficient_privilege then null;end;
 begin perform assessment_feedback_command(b,t,'feedback-stale-approve','policy.approve',jsonb_build_object('id',v,'expected_revision',0,'review_hash',assessment_feedback_version_hash(v)));raise exception 'Stale revision accepted';exception when unique_violation then null;end;
 begin perform assessment_feedback_command(b,t,'feedback-badhash-approve','policy.approve',jsonb_build_object('id',v,'expected_revision',1,'review_hash',repeat('0',64)));raise exception 'Wrong review hash accepted';exception when unique_violation then null;end;
 perform assessment_feedback_command(b,t,'feedback-approve-future','policy.approve',jsonb_build_object('id',v,'expected_revision',1,'review_hash',assessment_feedback_version_hash(v)));
 if assessment_released_breakdown(candidate,t,att)->>'feedback_status'<>'totals_only' or (select feedback_snapshot from assessment_grading_releases where id=old_release)<>old_snapshot then raise exception 'Policy retroactively broadened release';end if;
 r:=pg_temp.feedback_run(att,3);preview:=assessment_feedback_read(a,t,'preview',r);
 begin perform assessment_grading_command(a,t,'feedback-missing-preview','grade.release',jsonb_build_object('run_id',r));raise exception 'Granular release without review accepted';exception when unique_violation then null;end;
 begin perform assessment_grading_command(a,t,'feedback-wrong-preview','grade.release',jsonb_build_object('run_id',r,'feedback_review_hash',repeat('0',64)));raise exception 'Stale release preview accepted';exception when unique_violation then null;end;
 data:=jsonb_build_object('run_id',r,'feedback_review_hash',preview->>'review_hash');reply:=assessment_grading_command(a,t,'feedback-release-future','grade.release',data);released:=(reply->>'id')::uuid;
 if assessment_released_breakdown(candidate,t,att)->>'feedback_status'<>'pending' or assessment_released_breakdown(candidate,t,att)->'sections'<>'[]'::jsonb then raise exception 'Feedback embargo disclosed points';end if;
 perform assessment_feedback_command(a,t,'feedback-suspend-future','policy.suspend',jsonb_build_object('window_id',win,'expected_revision',2,'reason','Change disclosure policy'));
 if assessment_grading_command(a,t,'feedback-release-future','grade.release',data)<>reply or (select feedback_snapshot->>'level' from assessment_grading_releases where id=released)<>'questions' then raise exception 'Lost release reply re-pinned later policy';end if;
 if assessment_released_breakdown(candidate,t,att)->>'feedback_status'<>'pending' then raise exception 'Suspension rewrote old policy';end if;
 v:=(assessment_feedback_command(a,t,'feedback-propose-now','policy.propose',jsonb_build_object('window_id',win,'expected_revision',3,'level','questions','available_after',null,'reason','Immediate question points'))->>'id')::uuid;
 perform assessment_feedback_command(b,t,'feedback-approve-now','policy.approve',jsonb_build_object('id',v,'expected_revision',4,'review_hash',assessment_feedback_version_hash(v)));
 r:=pg_temp.feedback_run(att,4);preview:=assessment_feedback_read(a,t,'preview',r);
 released:=(assessment_grading_command(a,t,'feedback-release-now','grade.release',jsonb_build_object('run_id',r,'feedback_review_hash',preview->>'review_hash'))->>'id')::uuid;
 preview:=assessment_released_breakdown(candidate,t,att);
 if preview->>'feedback_status'<>'available' or jsonb_array_length(preview#>'{sections,0,questions}')<>2 or preview::text~'"(key|prompt|response|created_by|approved_by)"' then raise exception 'Question points missing or secret content exposed: %',preview;end if;
 select encode(sha256(convert_to(jsonb_agg(to_jsonb(s) order by s.id)::text,'UTF8')),'hex') into score_hash from assessment_score_revisions s where attempt_id=att;
 data:=jsonb_build_object('id',released,'expected_revision',0,'reason','Withhold while disclosure is reviewed');reply:=assessment_feedback_command(a,t,'feedback-hold-now','release.hold',data);
 if assessment_feedback_command(a,t,'feedback-hold-now','release.hold',data)<>reply or assessment_released_breakdown(candidate,t,att)->>'feedback_status'<>'withheld' or assessment_released_breakdown(candidate,t,att)->'sections'<>'[]'::jsonb then raise exception 'Withholding/replay failed';end if;
 begin perform assessment_feedback_command(a,t,'feedback-stale-resume','release.resume',jsonb_build_object('id',released,'expected_revision',0,'reason','Resume'));raise exception 'Stale hold revision accepted';exception when unique_violation then null;end;
 perform assessment_feedback_command(b,t,'feedback-resume-now','release.resume',jsonb_build_object('id',released,'expected_revision',1,'reason','Disclosure reviewed'));
 if assessment_released_breakdown(candidate,t,att)->>'feedback_status'<>'available' then raise exception 'Resume did not restore pinned points';end if;
 select encode(sha256(convert_to(jsonb_agg(to_jsonb(s) order by s.id)::text,'UTF8')),'hex') into latest_hash from assessment_score_revisions s where attempt_id=att;
 if latest_hash<>score_hash then raise exception 'Withholding changed grade history';end if;
 v:=(assessment_feedback_command(a,t,'feedback-propose-sections','policy.propose',jsonb_build_object('window_id',win,'expected_revision',5,'level','sections','available_after',null,'reason','Section summaries only'))->>'id')::uuid;
 perform assessment_feedback_command(b,t,'feedback-approve-sections','policy.approve',jsonb_build_object('id',v,'expected_revision',6,'review_hash',assessment_feedback_version_hash(v)));
 r:=pg_temp.feedback_run(att,5);preview:=assessment_feedback_read(a,t,'preview',r);
 perform assessment_grading_command(a,t,'feedback-release-sections','grade.release',jsonb_build_object('run_id',r,'feedback_review_hash',preview->>'review_hash'));
 preview:=assessment_released_breakdown(candidate,t,att);if preview->>'detail_level'<>'sections' or jsonb_array_length(preview->'sections')<>1 or preview#>'{sections,0,questions}'<>'[]'::jsonb then raise exception 'Section policy disclosed question points';end if;
 begin perform assessment_released_breakdown(b,t,att);raise exception 'Other candidate read details';exception when no_data_found then null;end;
 begin perform assessment_feedback_read(candidate,t,'policy',win);raise exception 'Candidate read private policy';exception when insufficient_privilege then null;end;
 begin perform assessment_feedback_read('00000000-0000-4000-8000-000000000004',t,'policy',win);raise exception 'Foreign tenant read policy';exception when insufficient_privilege then null;end;
 update tenant_memberships set status='inactive' where tenant_id=t and user_id=a;
 begin perform assessment_feedback_command(a,t,'feedback-hold-now','release.hold',data);raise exception 'Revoked actor replayed receipt';exception when insufficient_privilege then null;end;
 update tenant_memberships set status='active' where tenant_id=t and user_id=a;
 begin update assessment_feedback_versions set level='questions' where id=v;raise exception 'Immutable policy changed';exception when check_violation then null;end;
 begin update assessment_grading_releases set feedback_snapshot='{}' where id=old_release;raise exception 'Release snapshot changed';exception when check_violation then null;end;
 if has_function_privilege('authenticated','assessment_feedback_command(uuid,uuid,text,text,jsonb)','execute') or has_function_privilege('service_role','assessment_grading_command_pre_feedback(uuid,uuid,text,text,jsonb)','execute') or has_table_privilege('authenticated','assessment_feedback_holds','select') then raise exception 'Private feedback authority leaked';end if;
end;$$;
rollback;
