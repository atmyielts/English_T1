-- Disposable canonical camera preparation. Provider receipts and timestamp
-- injection are explicit fixtures; no device or hosted media proof is claimed.
create table public.proctor_live_launch_race_ids(registration_id uuid,session_id uuid,connection_id uuid,manifest jsonb);
do $$declare t uuid:='10000000-0000-4000-8000-000000000001';owner uuid:='00000000-0000-4000-8000-000000000001';candidate uuid:='00000000-0000-4000-8000-000000000003';ver uuid;form jsonb;win uuid;reg uuid;pol uuid;sid uuid;rid uuid:=gen_random_uuid();cid uuid:=gen_random_uuid();begin
 select assessment_version_id,manifest into ver,form from public.assessment_forms limit 1;
 win:=(public.assessment_command(owner,t,'live-race-window','window.create',jsonb_build_object('assessment_version_id',ver,'title','Concurrent live launch','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '2 hours'))->>'id')::uuid;
 reg:=(public.assessment_command(owner,t,'live-race-register','registration.create',jsonb_build_object('window_id',win,'candidate_id',candidate))->>'id')::uuid;
 pol:=(public.proctor_command(owner,t,'live-race-policy','policy.create','{"title":"Concurrent live launch","policy":{"schema_version":"proctor.policy.v1","mode":"live","identity_level":0,"camera":true,"microphone":false,"screen":false,"second_camera":false,"auto_pause":true,"recording_retention_days":7,"identity_retention_days":30,"recovery_seconds":10,"reviewer_quorum":2}}')->>'id')::uuid;
 perform public.proctor_command(owner,t,'live-race-attach','policy.attach',jsonb_build_object('window_id',win,'policy_id',pol));
 perform public.proctor_command(candidate,t,'live-race-consent','preparation.accept',jsonb_build_object('registration_id',reg,'policy_id',pol,'acknowledged',true));
 sid:=(public.proctor_capture_command_live_gate(candidate,t,'live-race-open','capture.open',jsonb_build_object('registration_id',reg,'device_id',candidate,'token_hash',repeat('d',64)),true)->>'session_id')::uuid;
 perform public.proctor_recording_command(candidate,t,'live-race-record','recording.begin',jsonb_build_object('recording_id',rid,'session_id',sid,'source','camera','mime','video/webm'));
 perform public.proctor_recording_command(candidate,t,'live-race-reserve','recording.reserve',jsonb_build_object('recording_id',rid,'sequence',1,'start_ms',0,'end_ms',5000,'previous_hash',repeat('0',64),'byte_length',3,'sha256',repeat('a',64),'parts',jsonb_build_array(jsonb_build_object('byte_length',3,'sha256',repeat('a',64)))));
 perform public.proctor_recording_transport(candidate,t,'part.receipt',jsonb_build_object('recording_id',rid,'sequence',1,'index',0,'sha256',repeat('a',64),'byte_length',3,'cipher_sha256',repeat('b',64),'iv',repeat('c',24),'key_id','test-k1','etag','live-race'));
 perform public.proctor_recording_transport(candidate,t,'segment.complete',jsonb_build_object('recording_id',rid,'sequence',1));
 perform public.proctor_live_command(candidate,t,'live-race-publication','connection.open',jsonb_build_object('id',cid,'session_id',sid,'role','publisher','source','camera','device_id',candidate,'token_hash',repeat('d',64)));
 perform public.proctor_live_report(t,cid,'allocated',jsonb_build_object('provider_session_id','synthetic-'||cid,'provider_app_id','live-race-fixture'));
 perform public.proctor_live_report(t,cid,'negotiated',jsonb_build_object('mid','0','track_name','c-'||cid||'-camera'));
 perform public.proctor_live_report(t,cid,'connected','{}');
 insert into public.proctor_live_launch_race_ids values(reg,sid,cid,form);
end;$$;
