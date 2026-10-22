do $$ declare
 tenant uuid:='10000000-0000-4000-8000-000000000001'; candidate uuid:='00000000-0000-4000-8000-000000000003'; supervisor uuid:='00000000-0000-4000-8000-000000000001';
 sid uuid; aid uuid; nid uuid; other_aid uuid; older uuid; result jsonb; data jsonb;
begin
 select id,attempt_id into sid,aid from proctor_sessions limit 1;
 if not exists(select 1 from assessment_exam_windows w join assessment_registrations r on r.window_id=w.id join assessment_attempts a on a.registration_id=r.id where a.id=aid and 'proctor'=any(w.required_services)) then raise exception 'Proctor requirement missing from Assessment integration contract';end if;
 if not (select 'proctor'=any(required_services) from assessment_attempts where id=aid) then raise exception 'Attempt did not snapshot required services';end if;
 begin update assessment_attempts set required_services='{}' where id=aid;raise exception 'Attempt dependencies downgraded';exception when check_violation then null;end;
 begin update assessment_exam_windows set required_services='{}' where id=(select r.window_id from assessment_registrations r join assessment_attempts a on a.registration_id=r.id where a.id=aid);raise exception 'Running sitting dependencies downgraded';exception when check_violation then null;end;
 perform proctor_command(supervisor,tenant,'notice-warn-0001','session.warn',jsonb_build_object('session_id',sid,'reason','Please remain on the assessment page.'));
 if (select count(*) from proctor_candidate_notices where session_id=sid)<>3 then raise exception 'Pause, resume and warning were not durably delivered'; end if;
 select id into nid from proctor_candidate_notices where session_id=sid and kind='warning';
 data:=jsonb_build_object('session_id',sid,'notice_ids',jsonb_build_array(nid));
 result:=proctor_command(candidate,tenant,'notice-ack-0001','notice.acknowledge',data);
 if proctor_command(candidate,tenant,'notice-ack-0001','notice.acknowledge',data)<>result then raise exception 'Notice acknowledgement replay changed'; end if;
 if (select count(*) from proctor_notice_acknowledgements where notice_id=nid)<>1 then raise exception 'Duplicate acknowledgement'; end if;
 begin perform proctor_command(supervisor,tenant,'notice-foreign-0001','notice.acknowledge',data);raise exception 'Staff acknowledged candidate notice';exception when no_data_found then null;end;
 begin perform proctor_command(candidate,tenant,'notice-fake-0001','notice.acknowledge',jsonb_build_object('session_id',sid,'notice_ids',jsonb_build_array(supervisor)));raise exception 'Unknown notice acknowledged';exception when no_data_found then null;end;
 begin update proctor_sessions set policy_snapshot='{}' where id=sid;raise exception 'Session snapshot changed';exception when check_violation then null;end;
 perform pg_temp.assessment_command(candidate,tenant,'candidate-finalize-0001','attempt.submit',jsonb_build_object('attempt_id',aid));
 if (select completed_at from proctor_sessions where id=sid) is null then raise exception 'Completion time missing'; end if;
 begin update proctor_sessions set state='active' where id=sid;raise exception 'Final session reopened';exception when check_violation then null;end;
 -- A long-running session is recoverable relative to completion, not its original creation.
 select a.id into other_aid from assessment_attempts a where a.tenant_id=tenant and a.id<>aid limit 1;
 insert into proctor_sessions(tenant_id,attempt_id,candidate_id,policy_id,policy_snapshot,state,completed_at,created_at)
 select tenant,other_aid,candidate,policy_id,policy_snapshot,'completed',clock_timestamp(),clock_timestamp()-interval '2 days' from proctor_sessions where id=sid returning id into older;
 perform proctor_command(candidate,tenant,'recover-long-0001','events.append',jsonb_build_object('session_id',older,'stream_id',candidate,'events',jsonb_build_array(jsonb_build_object('sequence',1,'kind','offline','occurred_at',clock_timestamp(),'payload_hash','recovery-hash'))));
 if (select count(*) from proctor_integrity_events where session_id=older)<>1 then raise exception 'Recently completed long session lost evidence'; end if;
end; $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
do $$ begin
 if (select count(*) from proctor_candidate_notices)<>3 then raise exception 'Owning candidate cannot read its notices';end if;
 if (select count(*) from proctor_notice_acknowledgements)<>1 then raise exception 'Owning candidate cannot read its receipts';end if;
 begin update proctor_candidate_notices set reason='forged';raise exception 'Candidate mutated notice';exception when insufficient_privilege then null;end;
end; $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
do $$ begin if (select count(*) from proctor_candidate_notices)<>0 or (select count(*) from proctor_notice_acknowledgements)<>0 then raise exception 'Foreign candidate read notices';end if; end; $$;
reset role;
