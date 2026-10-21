\set ON_ERROR_STOP on
do $$ declare tenant uuid:='10000000-0000-4000-8000-000000000001';candidate uuid:='00000000-0000-4000-8000-000000000003';att public.assessment_attempts;ticket jsonb;claimed jsonb;result jsonb;version_before bigint;version_id uuid;form jsonb;win uuid;reg uuid;
begin
 select assessment_version_id,manifest into version_id,form from assessment_forms limit 1;
 result:=assessment_command('00000000-0000-4000-8000-000000000001',tenant,'recovery-test-window','window.create',jsonb_build_object('assessment_version_id',version_id,'title','Recovery tests','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '2 hours'));win:=(result->>'id')::uuid;
 result:=assessment_command('00000000-0000-4000-8000-000000000001',tenant,'recovery-test-registration','registration.create',jsonb_build_object('window_id',win,'candidate_id',candidate));reg:=(result->>'id')::uuid;
 result:=assessment_command(candidate,tenant,'recovery-test-start','attempt.start',jsonb_build_object('registration_id',reg,'manifest',form,'manifest_hash',repeat('d',64)));
 select * into att from assessment_attempts where id=(result->>'id')::uuid;
 if not exists(select 1 from assessment_runtime_schedule where attempt_id=att.id and due_at is not null and lease_token is null) then raise exception 'Attempt transaction did not create canonical recovery schedule';end if;
 update assessment_attempts set state='paused' where id=att.id;
 if (select due_at from assessment_runtime_schedule where attempt_id=att.id)<>(select closes_at from assessment_exam_windows w join assessment_registrations r on r.window_id=w.id where r.id=att.registration_id) then raise exception 'Paused schedule used stale section deadline';end if;
 update assessment_attempts set state='active',deadline_at=clock_timestamp()+interval '1 hour',section_deadline_at=clock_timestamp()-interval '1 second' where id=att.id;
 claimed:=assessment_runtime_schedule_claim(100);
 select value into ticket from jsonb_array_elements(claimed) where value->>'attempt_id'=att.id::text;
 if ticket is null then raise exception 'Due canonical attempt was not claimed';end if;
 if (select count(*) from jsonb_array_elements(assessment_runtime_schedule_claim(100)) where value->>'attempt_id'=att.id::text)<>0 then raise exception 'Active dispatch lease was claimed twice';end if;
 result:=assessment_runtime_schedule_reconcile(tenant,att.id,(ticket->>'revision')::bigint,gen_random_uuid());
 if (result->>'accepted')::boolean then raise exception 'Forged ticket accepted';end if;
 version_before:=(ticket->>'revision')::bigint;
 -- A proctor/state transition invalidates a previously dispatched revision.
 update assessment_attempts set section_deadline_at=clock_timestamp()+interval '1 hour' where id=att.id;
 if (assessment_runtime_schedule_reconcile(tenant,att.id,version_before,(ticket->>'lease_token')::uuid)->>'accepted')::boolean then raise exception 'Stale schedule ticket accepted';end if;
 update assessment_attempts set deadline_at=clock_timestamp()-interval '1 second',section_deadline_at=clock_timestamp()-interval '1 second' where id=att.id;
 select value into ticket from jsonb_array_elements(assessment_runtime_schedule_claim(100)) where value->>'attempt_id'=att.id::text;
 update assessment_runtime_schedule set leased_until=clock_timestamp()-interval '1 second' where attempt_id=att.id;
 if (assessment_runtime_schedule_reconcile(tenant,att.id,(ticket->>'revision')::bigint,(ticket->>'lease_token')::uuid)->>'accepted')::boolean then raise exception 'Expired dispatch capability accepted';end if;
 select value into ticket from jsonb_array_elements(assessment_runtime_schedule_claim(100)) where value->>'attempt_id'=att.id::text;
 result:=assessment_runtime_schedule_reconcile(tenant,att.id,(ticket->>'revision')::bigint,(ticket->>'lease_token')::uuid);
 if not (result->>'accepted')::boolean or result->'snapshot'->>'state'<>'expired' or result->'binding'->>'actor'<>att.candidate_id::text then raise exception 'Recovery did not canonically finalize and bind actual candidate';end if;
 if (select due_at from assessment_runtime_schedule where attempt_id=att.id) is not null then raise exception 'Finalized schedule remains due';end if;
 if (assessment_runtime_schedule_reconcile(tenant,att.id,(ticket->>'revision')::bigint,(ticket->>'lease_token')::uuid)->>'accepted')::boolean then raise exception 'Replayed recovery capability accepted';end if;
 if (select count(*) from domain_event_outbox where aggregate_id=att.id)<>1 then raise exception 'Recovery duplicated grading event';end if;
 begin perform assessment_runtime_schedule_claim(101);raise exception 'Unbounded claim accepted';exception when invalid_parameter_value then null;end;
end; $$;
set role authenticated;
do $$ begin
 begin perform * from assessment_runtime_schedule;raise exception 'Candidate can read dispatch leases';exception when insufficient_privilege then null;end;
 begin perform assessment_runtime_schedule_claim(1);raise exception 'Candidate can claim recovery jobs';exception when insufficient_privilege then null;end;
 begin perform assessment_runtime_schedule_reconcile(gen_random_uuid(),gen_random_uuid(),1,gen_random_uuid());raise exception 'Candidate can run recovery';exception when insufficient_privilege then null;end;
end; $$;
reset role;
