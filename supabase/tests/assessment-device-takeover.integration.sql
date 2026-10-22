\set ON_ERROR_STOP on
begin;
do $$ declare
 tenant uuid:='10000000-0000-4000-8000-000000000001'; owner uuid:='00000000-0000-4000-8000-000000000001'; candidate uuid:='00000000-0000-4000-8000-000000000003';
 laptop uuid:='60000000-0000-4000-8000-000000000001'; phone uuid:='60000000-0000-4000-8000-000000000002'; tablet uuid:='60000000-0000-4000-8000-000000000003';
 version_id uuid; win uuid; reg uuid; aid uuid; form jsonb; item uuid; result jsonb; replay jsonb; old_lease jsonb; new_lease jsonb; response jsonb;
begin
 select assessment_version_id,manifest into version_id,form from assessment_forms limit 1;item:=(form#>>'{sections,0,items,0,item_version_id}')::uuid;
 win:=(public.assessment_command(owner,tenant,'takeover-window-01','window.create',jsonb_build_object('assessment_version_id',version_id,'title','Device takeover','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '1 hour'))->>'id')::uuid;
 reg:=(public.assessment_command(owner,tenant,'takeover-reg-0001','registration.create',jsonb_build_object('window_id',win,'candidate_id',candidate))->>'id')::uuid;
 aid:=(public.assessment_command(candidate,tenant,'takeover-start-001','attempt.start',jsonb_build_object('registration_id',reg,'manifest',form,'manifest_hash',repeat('a',64)))->>'id')::uuid;
 response:=jsonb_build_object('attempt_id',aid,'item_version_id',item,'response','a');
 -- The laptop starts and saves one answer.
 result:=public.assessment_runtime_command(candidate,tenant,'takeover-laptop-01','lease.acquire',jsonb_build_object('attempt_id',aid,'device_id',laptop,'token_hash',repeat('1',64)));
 old_lease:=jsonb_build_object('device_id',laptop,'token_hash',repeat('1',64),'epoch',1);
 perform public.assessment_runtime_command(candidate,tenant,'takeover-answer-01','response.append',response||jsonb_build_object('sequence',1,'payload_hash','takeover-1','lease',old_lease));
 begin perform public.assessment_runtime_command(candidate,tenant,'takeover-needless','lease.acquire',jsonb_build_object('attempt_id',aid,'device_id',laptop,'token_hash',repeat('1',64),'takeover',true));raise exception 'Needless takeover accepted';exception when invalid_parameter_value then null;end;
 -- Without confirmation the phone is refused, whether the laptop is active or its lease merely expired.
 begin perform public.assessment_runtime_command(candidate,tenant,'takeover-phone-01','lease.acquire',jsonb_build_object('attempt_id',aid,'device_id',phone,'token_hash',repeat('2',64)));raise exception 'Silent takeover of an active lease';exception when unique_violation then if sqlerrm<>'device_lease_active' then raise;end if;end;
 update assessment_attempt_leases set expires_at=clock_timestamp()-interval '1 second' where attempt_id=aid;
 begin perform public.assessment_runtime_command(candidate,tenant,'takeover-phone-02','lease.acquire',jsonb_build_object('attempt_id',aid,'device_id',phone,'token_hash',repeat('2',64)));raise exception 'Silent takeover after expiry';exception when unique_violation then if sqlerrm<>'device_takeover_required' then raise;end if;end;
 update assessment_attempt_leases set expires_at=clock_timestamp()+interval '60 seconds' where attempt_id=aid;
 -- Confirmed, the phone takes over at once and learns what was already saved.
 result:=public.assessment_runtime_command(candidate,tenant,'takeover-phone-03','lease.acquire',jsonb_build_object('attempt_id',aid,'device_id',phone,'token_hash',repeat('2',64),'takeover',true));
 if result#>>'{result,epoch}'<>'2' or result#>>'{result,takeover,from_epoch}'<>'1' or result#>>'{result,takeover,previous_lease_active}'<>'true' or result#>>'{result,takeover,acknowledged_sequence}'<>'1' or result#>>'{result,takeover,saved_responses}'<>'1' then raise exception 'Takeover result wrong: %',result;end if;
 replay:=public.assessment_runtime_command(candidate,tenant,'takeover-phone-03','lease.acquire',jsonb_build_object('attempt_id',aid,'device_id',phone,'token_hash',repeat('2',64),'takeover',true));
 if replay->'result'<>result->'result' then raise exception 'Takeover replay changed';end if;
 new_lease:=jsonb_build_object('device_id',phone,'token_hash',repeat('2',64),'epoch',2);
 -- The laptop's late answer is refused and it is told it was superseded; it cannot quietly take the attempt back.
 begin perform public.assessment_runtime_command(candidate,tenant,'takeover-late-01','response.append',response||jsonb_build_object('sequence',2,'payload_hash','takeover-late','lease',old_lease));raise exception 'Late answer from the old device accepted';exception when insufficient_privilege then if sqlerrm<>'device_lease_superseded' then raise;end if;end;
 begin perform public.assessment_runtime_command(candidate,tenant,'takeover-laptop-02','lease.acquire',jsonb_build_object('attempt_id',aid,'device_id',laptop,'token_hash',repeat('1',64)));raise exception 'Old device re-acquired silently';exception when insufficient_privilege then if sqlerrm<>'device_lease_superseded' then raise;end if;end;
 -- A lost reply of the laptop's committed answer still returns its original receipt.
 if public.assessment_runtime_command(candidate,tenant,'takeover-answer-01','response.append',response||jsonb_build_object('sequence',1,'payload_hash','takeover-1','lease',new_lease))#>>'{result,sequence}'<>'1' then raise exception 'Committed answer receipt lost';end if;
 perform public.assessment_runtime_command(candidate,tenant,'takeover-answer-02','response.append',response||jsonb_build_object('sequence',2,'payload_hash','takeover-2','response','b','lease',new_lease));
 if (select string_agg(payload_hash,',' order by sequence) from assessment_response_journal where attempt_id=aid)<>'takeover-1,takeover-2' then raise exception 'Acknowledged answers changed';end if;
 -- The phone releases deliberately: the tablet continues without a takeover.
 perform public.assessment_runtime_command(candidate,tenant,'takeover-release-01','lease.release',jsonb_build_object('attempt_id',aid,'lease',new_lease));
 result:=public.assessment_runtime_command(candidate,tenant,'takeover-tablet-01','lease.acquire',jsonb_build_object('attempt_id',aid,'device_id',tablet,'token_hash',repeat('3',64)));
 if result#>>'{result,epoch}'<>'3' or result->'result' ? 'takeover' then raise exception 'Released handover wrong: %',result;end if;
 if (select released_at from assessment_attempt_leases where attempt_id=aid) is not null then raise exception 'Release marker kept after a new acquisition';end if;
 -- A stale release replay from the phone does not mark the tablet's lease released.
 perform public.assessment_runtime_command(candidate,tenant,'takeover-release-01','lease.release',jsonb_build_object('attempt_id',aid,'lease',new_lease));
 if (select released_at from assessment_attempt_leases where attempt_id=aid) is not null then raise exception 'Stale release marked the new lease';end if;
 -- The laptop, superseded earlier, is still told so; the confirmed path takes over again.
 begin perform public.assessment_runtime_command(candidate,tenant,'takeover-laptop-03','lease.acquire',jsonb_build_object('attempt_id',aid,'device_id',laptop,'token_hash',repeat('1',64)));raise exception 'Superseded laptop re-acquired';exception when insufficient_privilege then if sqlerrm<>'device_lease_superseded' then raise;end if;end;
 result:=public.assessment_runtime_command(candidate,tenant,'takeover-laptop-04','lease.acquire',jsonb_build_object('attempt_id',aid,'device_id',laptop,'token_hash',repeat('1',64),'takeover',true));
 if result#>>'{result,epoch}'<>'4' then raise exception 'Confirmed take-back failed';end if;
 -- History, audit and privacy.
 if (select string_agg(from_epoch||'>'||to_epoch,',' order by created_at) from assessment_attempt_takeovers where attempt_id=aid)<>'1>2,3>4' then raise exception 'Takeover history wrong';end if;
 if (select count(*) from assessment_audit_events where action='attempt.device_takeover' and target_id=aid)<>2 then raise exception 'Takeover audit missing';end if;
 begin update assessment_attempt_takeovers set acknowledged_sequence=0 where attempt_id=aid;raise exception 'Takeover history edited';exception when check_violation then null;end;
 if has_table_privilege('authenticated','public.assessment_attempt_takeovers','select') then raise exception 'Takeovers exposed to clients';end if;
end $$;
rollback;
