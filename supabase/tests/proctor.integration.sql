-- Builds on the assessment fixture with real sessions, roles, consent and review transactions.
insert into users values('00000000-0000-4000-8000-000000000005'),('00000000-0000-4000-8000-000000000006');
insert into tenant_memberships values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000005','active','member'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000006','active','member');
do $$ declare
 tenant uuid:='10000000-0000-4000-8000-000000000001'; supervisor uuid:='00000000-0000-4000-8000-000000000001'; candidate uuid:='00000000-0000-4000-8000-000000000003';
 reviewer1 uuid:='00000000-0000-4000-8000-000000000005'; reviewer2 uuid:='00000000-0000-4000-8000-000000000006';
 pol uuid; win uuid; reg uuid; attempt uuid; session uuid; case_id uuid; event_id uuid; result jsonb; form jsonb; version_id uuid; start_data jsonb;
begin
 select id into version_id from assessment_versions limit 1;
 result:=pg_temp.assessment_command(supervisor,tenant,'proctor-win-001','window.create',jsonb_build_object('assessment_version_id',version_id,'title','Proctored sitting','opens_at',now()-interval '1 hour','closes_at',now()+interval '1 hour'));win:=(result->>'id')::uuid;
 result:=pg_temp.assessment_command(supervisor,tenant,'proctor-reg-001','registration.create',jsonb_build_object('window_id',win,'candidate_id',candidate));reg:=(result->>'id')::uuid;
 result:=proctor_command(supervisor,tenant,'policy-0001','policy.create','{"title":"Browser evidence","policy":{"schema_version":"proctor.policy.v1","mode":"browser","identity_level":1,"camera":false,"microphone":false,"screen":false,"second_camera":false,"reviewer_quorum":2}}');pol:=(result->>'id')::uuid;
 perform proctor_command(supervisor,tenant,'attach-0001','policy.attach',jsonb_build_object('window_id',win,'policy_id',pol));
 select manifest into form from assessment_forms limit 1;
 start_data:=jsonb_build_object('registration_id',reg,'manifest',form,'manifest_hash',repeat('a',64));
 begin perform pg_temp.assessment_command(candidate,tenant,'start-proctor1','attempt.start',start_data);raise exception 'Missing consent accepted';exception when check_violation then null;end;
 perform proctor_command(candidate,tenant,'consent-001','preparation.accept',jsonb_build_object('registration_id',reg,'policy_id',pol,'acknowledged',true));
 begin perform pg_temp.assessment_command(candidate,tenant,'start-proctor2','attempt.start',start_data);raise exception 'Missing identity accepted';exception when check_violation then null;end;
 begin perform proctor_command(candidate,tenant,'identity-bad','identity.verify',jsonb_build_object('registration_id',reg,'method','remote_attended','notes','Candidate verified themselves'));raise exception 'Self verification accepted';exception when insufficient_privilege then null;end;
 perform proctor_command(supervisor,tenant,'identity-001','identity.verify',jsonb_build_object('registration_id',reg,'method','remote_attended','notes','Institution verified candidate against its roster during an attended check.'));
 result:=pg_temp.assessment_command(candidate,tenant,'start-proctor3','attempt.start',start_data);attempt:=(result->>'id')::uuid;
 select id into session from proctor_sessions where attempt_id=attempt;
 if session is null then raise exception 'Proctor session not attached to attempt';end if;
 begin perform proctor_command(supervisor,tenant,'attach-0002','policy.attach',jsonb_build_object('window_id',win,'policy_id',pol));raise exception 'Policy changed after sitting launch';exception when check_violation then null;end;
 perform proctor_command(supervisor,tenant,'grant-0001','capability.grant',jsonb_build_object('user_id',reviewer1,'capability','proctor.observe'));
 perform proctor_command(supervisor,tenant,'grant-0002','capability.grant',jsonb_build_object('user_id',reviewer1,'capability','proctor.review'));
 perform proctor_command(supervisor,tenant,'grant-0003','capability.grant',jsonb_build_object('user_id',reviewer2,'capability','proctor.review'));
 begin perform proctor_command(reviewer1,tenant,'pause-noassign','session.pause',jsonb_build_object('session_id',session,'reason','Unassigned observer'));raise exception 'Unassigned observer paused candidate';exception when insufficient_privilege then null;end;
 perform proctor_command(supervisor,tenant,'assign-0001','session.assign',jsonb_build_object('session_id',session,'user_id',reviewer1,'assignment_role','observer'));
 perform proctor_command(supervisor,tenant,'assign-0002','session.assign',jsonb_build_object('session_id',session,'user_id',reviewer1,'assignment_role','reviewer'));
 perform proctor_command(supervisor,tenant,'assign-0003','session.assign',jsonb_build_object('session_id',session,'user_id',reviewer2,'assignment_role','reviewer'));
 perform proctor_command(candidate,tenant,'event-0001','events.append',jsonb_build_object('session_id',session,'stream_id',candidate,'events',jsonb_build_array(jsonb_build_object('sequence',1,'kind','focus_loss','occurred_at',clock_timestamp(),'payload_hash','event-hash'))));
 select id into event_id from proctor_integrity_events where session_id=session;
 if (select source from proctor_integrity_events where id=event_id)<>'browser_reported' then raise exception 'Browser source elevated to trusted finding';end if;
 begin perform proctor_command(candidate,tenant,'event-invalid','events.append',jsonb_build_object('session_id',session,'stream_id',candidate,'events',jsonb_build_array(jsonb_build_object('sequence',2,'kind','ml_anomaly','occurred_at',clock_timestamp(),'payload_hash','forged'))));raise exception 'Candidate impersonated AI';exception when invalid_parameter_value then null;end;
 perform proctor_command(reviewer1,tenant,'pause-0001','session.pause',jsonb_build_object('session_id',session,'reason','Proctor requested an identity re-check.'));
 if (select state from assessment_attempts where id=attempt)<>'paused' then raise exception 'Attempt did not pause';end if;
 -- A pause remains resumable even after its old section deadline; clocks are compensated.
 update assessment_attempts set deadline_at=clock_timestamp()-interval '1 second',section_deadline_at=clock_timestamp()-interval '1 second' where id=attempt;
 update proctor_sessions set paused_at=clock_timestamp()-interval '2 seconds' where id=session;
 perform proctor_command(reviewer1,tenant,'resume-0001','session.resume',jsonb_build_object('session_id',session,'reason','Identity re-check completed.'));
 if (select state from assessment_attempts where id=attempt)<>'active' or (select deadline_at from assessment_attempts where id=attempt)<=clock_timestamp() then raise exception 'Resume did not compensate the paused clock';end if;
 result:=proctor_command(reviewer1,tenant,'case-0001','case.create',jsonb_build_object('session_id',session,'title','Reported focus change'));case_id:=(result->>'id')::uuid;
 begin perform proctor_command(candidate,tenant,'finding-bad','case.finding',jsonb_build_object('case_id',case_id,'disposition','clear','rationale','Candidate approves their own case','evidence_event_ids',jsonb_build_array(event_id)));raise exception 'Candidate resolved own case';exception when insufficient_privilege then null;end;
 perform proctor_command(reviewer1,tenant,'finding-001','case.finding',jsonb_build_object('case_id',case_id,'disposition','clear','rationale','Focus change is consistent with the approved accommodation.','evidence_event_ids',jsonb_build_array(event_id)));
 if (select state from proctor_review_cases where id=case_id)='resolved' then raise exception 'Quorum bypassed';end if;
 begin perform proctor_command(reviewer1,tenant,'finding-002','case.finding',jsonb_build_object('case_id',case_id,'disposition','clear','rationale','Same reviewer attempts second vote','evidence_event_ids',jsonb_build_array(event_id)));raise exception 'Same reviewer voted twice';exception when unique_violation then null;end;
 perform proctor_command(reviewer2,tenant,'finding-003','case.finding',jsonb_build_object('case_id',case_id,'disposition','clear','rationale','Independent review agrees that the recorded event is benign.','evidence_event_ids',jsonb_build_array(event_id)));
 if (select disposition from proctor_review_cases where id=case_id)<>'clear' then raise exception 'Independent reviewers did not resolve case';end if;
 if exists(select 1 from assessment_score_revisions where attempt_id=attempt) then raise exception 'Integrity case mutated academic grades';end if;
 perform proctor_command(supervisor,tenant,'revoke-0001','capability.revoke',jsonb_build_object('user_id',reviewer1,'capability','proctor.observe'));
 if proctor_can_access(tenant,session,reviewer1,'observer') then raise exception 'Revoked capability retained observer access';end if;
end; $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
do $$ begin
 if (select count(*) from proctor_sessions)<>0 or (select count(*) from proctor_integrity_events)<>0 then raise exception 'Cross-tenant proctor evidence leaked';end if;
 begin perform * from proctor_integrity_events_default;raise exception 'Partition bypasses RLS';exception when insufficient_privilege then null;end;
end; $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',false);
do $$ begin if (select count(*) from proctor_sessions)<>1 then raise exception 'Assigned reviewer cannot inspect its session';end if; end; $$;
reset role;
