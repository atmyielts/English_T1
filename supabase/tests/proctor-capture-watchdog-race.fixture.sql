-- Canonical launch/transport setup; only expiry injection and the ID holder are
-- fixture controls. Four independent processes race actual alarm enforcement.
create table public.proctor_watch_race_ids(attempt_id uuid,session_id uuid);
do $$declare t uuid:='10000000-0000-4000-8000-000000000001';owner uuid:='00000000-0000-4000-8000-000000000001';candidate uuid:='00000000-0000-4000-8000-000000000003';win uuid;reg uuid;pol uuid;ver uuid;form jsonb;sid uuid;rid uuid:=gen_random_uuid();aid uuid;binding jsonb;
begin
 select assessment_version_id,manifest into ver,form from public.assessment_forms limit 1;
 win:=(public.assessment_command(owner,t,'watch-race-window','window.create',jsonb_build_object('assessment_version_id',ver,'title','Concurrent capture watchdog','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '2 hours'))->>'id')::uuid;
 reg:=(public.assessment_command(owner,t,'watch-race-registration','registration.create',jsonb_build_object('window_id',win,'candidate_id',candidate))->>'id')::uuid;
 pol:=(public.proctor_command(owner,t,'watch-race-policy','policy.create','{"title":"Concurrent capture watchdog","policy":{"schema_version":"proctor.policy.v1","mode":"record_review","identity_level":0,"camera":true,"microphone":false,"screen":false,"second_camera":false,"auto_pause":true,"recording_retention_days":7,"identity_retention_days":30,"recovery_seconds":10,"reviewer_quorum":2}}')->>'id')::uuid;
 perform public.proctor_command(owner,t,'watch-race-attach','policy.attach',jsonb_build_object('window_id',win,'policy_id',pol));
 perform public.proctor_command(candidate,t,'watch-race-consent','preparation.accept',jsonb_build_object('registration_id',reg,'policy_id',pol,'acknowledged',true));
 sid:=(public.proctor_capture_command(candidate,t,'watch-race-open','capture.open',jsonb_build_object('registration_id',reg,'device_id',candidate,'token_hash',repeat('d',64)))->>'session_id')::uuid;
 binding:=jsonb_build_object('session_id',sid,'device_id',candidate,'token_hash',repeat('d',64));
 perform public.proctor_recording_command(candidate,t,'watch-race-begin','recording.begin',jsonb_build_object('recording_id',rid,'session_id',sid,'source','camera','mime','video/webm'));
 perform public.proctor_recording_command(candidate,t,'watch-race-reserve','recording.reserve',jsonb_build_object('recording_id',rid,'sequence',1,'start_ms',0,'end_ms',5000,'previous_hash',repeat('0',64),'byte_length',3,'sha256',repeat('a',64),'parts',jsonb_build_array(jsonb_build_object('byte_length',3,'sha256',repeat('a',64)))));
 perform public.proctor_recording_transport(candidate,t,'part.receipt',jsonb_build_object('recording_id',rid,'sequence',1,'index',0,'sha256',repeat('a',64),'byte_length',3,'cipher_sha256',repeat('b',64),'iv',repeat('c',24),'key_id','test-k1','etag','watch-race'));
 perform public.proctor_recording_transport(candidate,t,'segment.complete',jsonb_build_object('recording_id',rid,'sequence',1));
 aid:=(public.assessment_command(candidate,t,'watch-race-start','attempt.start',jsonb_build_object('registration_id',reg,'manifest',form,'manifest_hash',repeat('e',64),'capture_binding',binding))->>'id')::uuid;
 update public.proctor_capture_launches set expires_at=clock_timestamp()-interval '40 seconds' where session_id=sid;
 insert into public.proctor_watch_race_ids values(aid,sid);
end;$$;
