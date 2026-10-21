\set ON_ERROR_STOP on
begin;
-- Transport authority fixture only: receipts below model the authenticated
-- evidence Worker. No browser permission/native encoder proof is claimed here.
create function pg_temp.capture_fixture_media(p_actor uuid,p_tenant uuid,p_recording uuid) returns void language plpgsql as $$declare r public.proctor_recordings;seq integer;data jsonb;begin
 select * into r from public.proctor_recordings where id=p_recording;seq:=r.last_sequence+1;
 data:=jsonb_build_object('recording_id',r.id,'sequence',seq,'start_ms',r.last_end_ms,'end_ms',r.last_end_ms+5000,'previous_hash',r.head_hash,'byte_length',3,'sha256',repeat('a',64),'parts',jsonb_build_array(jsonb_build_object('byte_length',3,'sha256',repeat('a',64))));
 perform public.proctor_recording_command(p_actor,p_tenant,'capture-fixture-media-'||r.id::text||'-'||seq,'recording.reserve',data);
 perform public.proctor_recording_transport(p_actor,p_tenant,'part.receipt',jsonb_build_object('recording_id',r.id,'sequence',seq,'index',0,'sha256',repeat('a',64),'byte_length',3,'cipher_sha256',repeat('b',64),'iv',repeat('c',24),'key_id','test-k1','etag','capture-part'));
 perform public.proctor_recording_transport(p_actor,p_tenant,'segment.complete',jsonb_build_object('recording_id',r.id,'sequence',seq));
end;$$;
do $$ declare t uuid:='10000000-0000-4000-8000-000000000001';owner uuid:='00000000-0000-4000-8000-000000000001';candidate uuid:='00000000-0000-4000-8000-000000000003';foreign_user uuid:='00000000-0000-4000-8000-000000000004';device uuid:=gen_random_uuid();win uuid;reg uuid;pol uuid;ver uuid;form jsonb;sid uuid;old_sid uuid;rid uuid;aid uuid;camera uuid;source text;data jsonb;reply jsonb;binding jsonb;start_data jsonb;clock_rows bigint;attempt_rows bigint;
begin
 select assessment_version_id,manifest into ver,form from assessment_forms limit 1;
 win:=(assessment_command(owner,t,'capture-clock-window','window.create',jsonb_build_object('assessment_version_id',ver,'title','Capture before clock','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '2 hours'))->>'id')::uuid;
 reg:=(assessment_command(owner,t,'capture-clock-register','registration.create',jsonb_build_object('window_id',win,'candidate_id',candidate))->>'id')::uuid;
 pol:=(proctor_command(owner,t,'capture-clock-policy','policy.create','{"title":"Required browser recording","policy":{"schema_version":"proctor.policy.v1","mode":"record_review","identity_level":0,"camera":true,"microphone":true,"screen":true,"second_camera":false,"auto_pause":true,"recording_retention_days":7,"identity_retention_days":30,"recovery_seconds":10,"reviewer_quorum":2}}')->>'id')::uuid;
 perform proctor_command(owner,t,'capture-clock-attach','policy.attach',jsonb_build_object('window_id',win,'policy_id',pol));
 data:=jsonb_build_object('registration_id',reg,'device_id',device,'token_hash',repeat('d',64));
 begin perform proctor_capture_command(candidate,t,'capture-no-consent','capture.open',data);raise exception 'Pre-clock camera access opened without consent';exception when check_violation then null;end;
 perform proctor_command(candidate,t,'capture-clock-consent','preparation.accept',jsonb_build_object('registration_id',reg,'policy_id',pol,'acknowledged',true));
 select count(*) into clock_rows from sessions;select count(*) into attempt_rows from assessment_attempts;
 reply:=proctor_capture_command(candidate,t,'capture-clock-open','capture.open',data);sid:=(reply->>'session_id')::uuid;
 if reply->>'state'<>'preparing' or (reply->>'ready')::boolean or reply->>'attempt_id' is not null or (select count(*) from sessions)<>clock_rows or (select count(*) from assessment_attempts)<>attempt_rows then raise exception 'Preparation started an academic clock';end if;
 if proctor_capture_command(candidate,t,'capture-clock-open','capture.open',data)<>reply then raise exception 'Capture open retry changed session';end if;
 begin perform proctor_capture_command(candidate,t,'capture-device-conflict','capture.open',data||jsonb_build_object('device_id',gen_random_uuid()));raise exception 'Another capture device acquired the preparation';exception when unique_violation then null;end;
 begin perform proctor_capture_read(foreign_user,t,sid);raise exception 'Foreign candidate read launch';exception when no_data_found then null;end;
 binding:=jsonb_build_object('session_id',sid,'device_id',device,'token_hash',repeat('d',64));
 reply:=proctor_capture_command(candidate,t,'capture-cancel-before-clock','capture.cancel',binding);old_sid:=sid;
 if proctor_capture_command(candidate,t,'capture-cancel-before-clock','capture.cancel',binding)<>reply then raise exception 'Lost cancellation reply was not replayable';end if;
 if (select state from proctor_sessions where id=sid)<>'completed' or (select count(*) from sessions)<>clock_rows then raise exception 'Cancellation started a clock or lost terminal state';end if;
 reply:=proctor_capture_command(candidate,t,'capture-open-after-cancel','capture.open',data);sid:=(reply->>'session_id')::uuid;
 if sid=old_sid then raise exception 'Cancelled monitoring session was reopened';end if;
 binding:=jsonb_build_object('session_id',sid,'device_id',device,'token_hash',repeat('d',64));
 start_data:=jsonb_build_object('registration_id',reg,'manifest',form,'manifest_hash',repeat('e',64),'capture_binding',binding);
 begin perform assessment_command(candidate,t,'capture-no-media-start','attempt.start',start_data);raise exception 'Academic clock started without committed capture';exception when check_violation then null;end;
 begin perform assessment_command(candidate,t,'capture-no-binding-start','attempt.start',start_data-'capture_binding');raise exception 'Capture launch bypassed device proof';exception when insufficient_privilege then null;end;
 foreach source in array array['camera','microphone','screen'] loop
  rid:=gen_random_uuid();
  perform proctor_recording_command(candidate,t,'capture-begin-'||source,'recording.begin',jsonb_build_object('recording_id',rid,'session_id',sid,'source',source,'mime',case when source='microphone' then 'audio/webm' else 'video/webm' end));
  if not exists(select 1 from proctor_recordings where id=rid and expires_at=created_at+interval '7 days') then raise exception 'Recording access cutoff ignored pinned policy';end if;
  if source='camera' then
   camera:=rid;
   perform proctor_recording_command(candidate,t,'capture-gap-not-ready','recording.gap',jsonb_build_object('recording_id',rid,'sequence',1,'start_ms',0,'end_ms',5000,'previous_hash',repeat('0',64),'reason','Explicit preparation gap, not recorded media'));
   if proctor_capture_ready(sid) then raise exception 'Gap counted as ready media';end if;
  end if;
  perform pg_temp.capture_fixture_media(candidate,t,rid);
  if source<>'screen' and proctor_capture_ready(sid) then raise exception 'Missing required capture source ignored';end if;
 end loop;
 if not proctor_capture_ready(sid) or (select count(*) from sessions)<>clock_rows or (select count(*) from assessment_attempts)<>attempt_rows then raise exception 'Capture is not ready or readiness started the academic clock';end if;
 if proctor_capture_read(candidate,t,sid)::text~'"(token_hash|object_key|iv|cipher_sha256)"' then raise exception 'Launch response disclosed private binding/storage data';end if;
 begin perform assessment_command(candidate,t,'capture-wrong-binding','attempt.start',jsonb_set(start_data,'{capture_binding,device_id}',to_jsonb(gen_random_uuid())));raise exception 'Foreign device started the clock';exception when insufficient_privilege then null;end;
 reply:=assessment_command(candidate,t,'capture-actual-start','attempt.start',start_data);aid:=(reply->>'id')::uuid;
 if (select attempt_id from proctor_sessions where id=sid)<>aid or (select state from proctor_sessions where id=sid)<>'active' or (select activated_at from proctor_capture_launches where session_id=sid) is null then raise exception 'Preparation did not bind atomically to the academic attempt';end if;
 if (select proctor_session_id from sessions where id=(select session_id from assessment_attempts where id=aid))<>sid or (select count(*) from assessment_attempts)<>attempt_rows+1 or (select count(*) from sessions)<>clock_rows+1 then raise exception 'Activation created duplicate or unmonitored clocks';end if;
 begin perform proctor_capture_command(candidate,t,'capture-cancel-after-start','capture.cancel',binding);raise exception 'Candidate cancelled active exam monitoring';exception when check_violation then null;end;
 begin update proctor_sessions set state='preparing' where id=sid;raise exception 'Active monitoring returned to pre-clock preparation';exception when check_violation then null;end;
 -- Fixture-only expiry injection; canonical heartbeats must renew it, not a replay.
 update proctor_capture_launches set expires_at=clock_timestamp()-interval '1 second' where session_id=sid;
 if proctor_capture_ready(sid) then raise exception 'Expired capture lease remained ready';end if;
 if assessment_command(candidate,t,'capture-actual-start','attempt.start',start_data)<>reply then raise exception 'Lost start reply could not recover its original running attempt';end if;
 begin perform assessment_command(candidate,t,'capture-expired-new-start','attempt.start',start_data);raise exception 'Expired lease accepted for a new start command';exception when check_violation then null;end;
 perform proctor_capture_command(candidate,t,'capture-clock-heartbeat','capture.heartbeat',binding);
 if not proctor_capture_ready(sid) then raise exception 'Canonical heartbeat failed to renew capture readiness';end if;
 perform proctor_recording_command(candidate,t,'capture-camera-stop','recording.close',jsonb_build_object('recording_id',camera,'expected_sequence',2,'expected_hash',(select head_hash from proctor_recordings where id=camera),'reason','track_lost'));
 if proctor_capture_ready(sid) then raise exception 'Closed required camera counted as ready';end if;
 begin update proctor_sessions set registration_id=gen_random_uuid() where id=sid;raise exception 'Monitoring registration rebound';exception when check_violation then null;end;
 if has_function_privilege('service_role','assessment_command_pre_capture(uuid,uuid,text,text,jsonb)','execute') or has_function_privilege('service_role','proctor_recording_command_pre_capture(uuid,uuid,text,text,jsonb)','execute') or has_function_privilege('authenticated','proctor_capture_command(uuid,uuid,text,text,jsonb)','execute') or has_table_privilege('service_role','proctor_capture_launches','update') then raise exception 'Capture authority bypass leaked';end if;
end;$$;
rollback;
