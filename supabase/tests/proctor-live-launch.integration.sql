\set ON_ERROR_STOP on
begin;
-- Explicit receipt and time-injection fixtures: not browser/device, provider
-- packet or hosted launch proof. All production commands/guards are exercised.
create function pg_temp.live_media(p_recording uuid) returns void language plpgsql as $$declare r public.proctor_recordings;data jsonb;begin
 select * into r from public.proctor_recordings where id=p_recording;
 data:=jsonb_build_object('recording_id',r.id,'sequence',r.last_sequence+1,'start_ms',r.last_end_ms,'end_ms',r.last_end_ms+5000,'previous_hash',r.head_hash,'byte_length',3,'sha256',repeat('a',64),'parts',jsonb_build_array(jsonb_build_object('byte_length',3,'sha256',repeat('a',64))));
 perform public.proctor_recording_command(r.candidate_id,r.tenant_id,'live-media-'||r.id||'-'||(r.last_sequence+1),'recording.reserve',data);
 perform public.proctor_recording_transport(r.candidate_id,r.tenant_id,'part.receipt',jsonb_build_object('recording_id',r.id,'sequence',r.last_sequence+1,'index',0,'sha256',repeat('a',64),'byte_length',3,'cipher_sha256',repeat('b',64),'iv',repeat('c',24),'key_id','test-k1','etag','live-media-part'));
 perform public.proctor_recording_transport(r.candidate_id,r.tenant_id,'segment.complete',jsonb_build_object('recording_id',r.id,'sequence',r.last_sequence+1));
end;$$;
create function pg_temp.live_publish(p_session uuid,p_source text) returns uuid language plpgsql as $$declare c uuid:=gen_random_uuid();s public.proctor_sessions;begin
 select * into s from public.proctor_sessions where id=p_session;
 perform public.proctor_live_command(s.candidate_id,s.tenant_id,'live-open-'||c,'connection.open',jsonb_build_object('id',c,'session_id',s.id,'role','publisher','source',p_source,'device_id',s.candidate_id,'token_hash',repeat('d',64)));
 perform public.proctor_live_report(s.tenant_id,c,'allocated',jsonb_build_object('provider_session_id','synthetic-'||c,'provider_app_id','live-launch-fixture'));
 perform public.proctor_live_report(s.tenant_id,c,'negotiated',jsonb_build_object('mid','0','track_name','c-'||c||'-'||p_source));
 perform public.proctor_live_report(s.tenant_id,c,'connected','{}');return c;
end;$$;
create function pg_temp.live_prepare(p_label text,p_auto boolean default true) returns jsonb language plpgsql as $$declare t uuid:='10000000-0000-4000-8000-000000000001';owner uuid:='00000000-0000-4000-8000-000000000001';candidate uuid:='00000000-0000-4000-8000-000000000003';ver uuid;win uuid;reg uuid;pol uuid;reply jsonb;data jsonb;rid uuid;source text;begin
 select assessment_version_id into ver from public.assessment_forms limit 1;
 win:=(public.assessment_command(owner,t,p_label||'-window','window.create',jsonb_build_object('assessment_version_id',ver,'title',p_label,'opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '2 hours'))->>'id')::uuid;
 reg:=(public.assessment_command(owner,t,p_label||'-register','registration.create',jsonb_build_object('window_id',win,'candidate_id',candidate))->>'id')::uuid;
 pol:=(public.proctor_command(owner,t,p_label||'-policy','policy.create',jsonb_build_object('title',p_label,'policy',jsonb_build_object('schema_version','proctor.policy.v1','mode','live','identity_level',0,'camera',true,'microphone',true,'screen',true,'second_camera',false,'auto_pause',p_auto,'recording_retention_days',7,'identity_retention_days',30,'recovery_seconds',10,'reviewer_quorum',2)))->>'id')::uuid;
 perform public.proctor_command(owner,t,p_label||'-attach','policy.attach',jsonb_build_object('window_id',win,'policy_id',pol));
 perform public.proctor_command(candidate,t,p_label||'-consent','preparation.accept',jsonb_build_object('registration_id',reg,'policy_id',pol,'acknowledged',true));
 data:=jsonb_build_object('registration_id',reg,'device_id',candidate,'token_hash',repeat('d',64));
 begin perform public.proctor_capture_command_live_gate(candidate,t,p_label||'-off','capture.open',data,false);raise exception 'Default-off live preparation admitted';exception when check_violation then if sqlerrm<>'live_launch_unavailable' then raise;end if;end;
 reply:=public.proctor_capture_command_live_gate(candidate,t,p_label||'-open','capture.open',data,true);
 if reply->>'monitoring_mode'<>'live' or reply->>'state'<>'preparing' or reply->'ready'<>'false'::jsonb or reply->'live_ready'<>'false'::jsonb or reply->>'attempt_id' is not null then raise exception 'Live preparation lost canonical mode or started a clock';end if;
 if public.proctor_capture_command_live_gate(candidate,t,p_label||'-open','capture.open',data,true)<>reply then raise exception 'Live preparation replay changed receipt';end if;
 foreach source in array array['camera','microphone','screen'] loop
  rid:=gen_random_uuid();perform public.proctor_recording_command(candidate,t,'live-record-'||rid,'recording.begin',jsonb_build_object('recording_id',rid,'session_id',reply->>'session_id','source',source,'mime',case when source='microphone' then 'audio/webm' else 'video/webm' end));perform pg_temp.live_media(rid);
 end loop;return reply||jsonb_build_object('window',win,'registration',reg);
end;$$;
do $$declare t uuid:='10000000-0000-4000-8000-000000000001';owner uuid:='00000000-0000-4000-8000-000000000001';candidate uuid:='00000000-0000-4000-8000-000000000003';fixture jsonb;sid uuid;aid uuid;cam uuid;replacement uuid;source text;form jsonb;binding jsonb;start_data jsonb;data jsonb;reply jsonb;before_attempts bigint;before_sessions bigint;before_scores bigint;before_answers bigint;deadline timestamptz;cutoff timestamptz;loss_time timestamptz;begin
 select count(*) into before_attempts from assessment_attempts;select count(*) into before_sessions from sessions;select count(*) into before_scores from assessment_score_revisions;
 fixture:=pg_temp.live_prepare('live-launch-authority');sid:=(fixture->>'session_id')::uuid;
 if (select count(*) from assessment_attempts)<>before_attempts or (select count(*) from sessions)<>before_sessions then raise exception 'Live preparation/recording created academic time';end if;
 reply:=public.proctor_capture_read(candidate,t,sid);
 if reply->'recording_ready'<>'true'::jsonb or reply->'live_ready'<>'false'::jsonb or reply->'ready'<>'false'::jsonb then raise exception 'Recording was incorrectly treated as full live readiness';end if;
 select manifest into form from assessment_forms where assessment_version_id=(select assessment_version_id from assessment_exam_windows where id=(fixture->>'window')::uuid) limit 1;
 binding:=jsonb_build_object('session_id',sid,'device_id',candidate,'token_hash',repeat('d',64));start_data:=jsonb_build_object('registration_id',fixture->>'registration','manifest',form,'manifest_hash',repeat('e',64),'capture_binding',binding);
 begin perform public.assessment_command_live_gate(candidate,t,'live-start-no-pubs','attempt.start',start_data,true);raise exception 'Live academic clock started with recording only';exception when check_violation then if sqlerrm<>'capture_readiness_required' then raise;end if;end;
 foreach source in array array['camera','microphone','screen'] loop
  replacement:=pg_temp.live_publish(sid,source);if source='camera' then cam:=replacement;end if;
  if source<>'screen' and public.proctor_capture_ready(sid) then raise exception 'Partial live sources admitted';end if;
 end loop;
 reply:=public.proctor_capture_read(candidate,t,sid);if reply->'live_ready'<>'true'::jsonb or reply->'ready'<>'true'::jsonb then raise exception 'All canonical live sources failed readiness';end if;
 begin perform public.assessment_command_live_gate(candidate,t,'live-start-off','attempt.start',start_data,false);raise exception 'Disabled live start admitted';exception when check_violation then if sqlerrm<>'live_launch_unavailable' then raise;end if;end;
 begin perform public.assessment_command_live_gate(candidate,t,'live-start-foreign-device','attempt.start',jsonb_set(start_data,'{capture_binding,device_id}',to_jsonb(gen_random_uuid())),true);raise exception 'Foreign capture device started a live exam';exception when insufficient_privilege then null;end;
 reply:=public.assessment_command_live_gate(candidate,t,'live-start-on','attempt.start',start_data,true);aid:=(reply->>'id')::uuid;
 if public.assessment_command_live_gate(candidate,t,'live-start-on','attempt.start',start_data,true)<>reply or (select count(*) from assessment_attempts)<>before_attempts+1 or (select count(*) from sessions)<>before_sessions+1 then raise exception 'Live start replay duplicated academic state';end if;
 select deadline_at into deadline from assessment_attempts where id=aid;
 perform public.assessment_runtime_command(candidate,t,'live-runtime-lease','lease.acquire',jsonb_build_object('attempt_id',aid,'device_id',candidate,'token_hash',repeat('a',64)));
 data:=jsonb_build_object('attempt_id',aid,'lease',jsonb_build_object('device_id',candidate,'token_hash',repeat('a',64),'epoch',1),'sequence',1,'item_version_id',form#>>'{sections,0,items,0,item_version_id}','response','a','payload_hash',repeat('f',64));
 perform public.assessment_runtime_command(candidate,t,'live-saved-answer','response.append',data);select count(*) into before_answers from assessment_response_journal where attempt_id=aid;
 cutoff:=clock_timestamp()-interval '40 seconds';update proctor_live_connections set expires_at=cutoff,revision=revision+1 where id=cam;
 if not public.proctor_recording_ready(sid) or public.proctor_capture_ready(sid) then raise exception 'Recording freshness hid missing live transport';end if;
 reply:=public.proctor_live_context(t,cam,candidate,true);
 if reply->'allowed'<>'false'::jsonb or (select state from assessment_attempts where id=aid)<>'paused' or (select paused_at from proctor_sessions where id=sid)<>cutoff+interval '10 seconds' or (select deadline_at from assessment_attempts where id=aid)<>deadline then raise exception 'Late publisher heartbeat erased the live cutoff or invented exam time';end if;
 if not exists(select 1 from proctor_candidate_notices where session_id=sid and kind='paused' and issuer_kind='system' and reason like 'Required live monitoring%') then raise exception 'Live pause lost its honest system notice';end if;
 reply:=public.assessment_runtime_command(candidate,t,'live-rejected-answer','response.append',data||jsonb_build_object('sequence',2));
 if reply->>'rejected'<>'capture_continuity_required' or (select count(*) from assessment_response_journal where attempt_id=aid)<>before_answers or exists(select 1 from assessment_runtime_commands where idempotency_key='live-rejected-answer') then raise exception 'Live pause acknowledged an unsaved answer';end if;
 reply:=public.assessment_runtime_command(candidate,t,'live-saved-answer','response.append',data);if reply ? 'rejected' or reply->'result' is null then raise exception 'Live loss destroyed a committed answer receipt';end if;
 begin perform public.proctor_command(owner,t,'live-resume-without-source','session.resume',jsonb_build_object('session_id',sid,'reason','Missing live source cannot resume'));raise exception 'Human resumed missing live monitoring';exception when check_violation then null;end;
 replacement:=pg_temp.live_publish(sid,'camera');
 if not public.proctor_capture_ready(sid) or (select state from assessment_attempts where id=aid)<>'paused' then raise exception 'Restored source failed readiness or auto-resumed';end if;
 perform public.proctor_command(owner,t,'live-human-resume','session.resume',jsonb_build_object('session_id',sid,'reason','Recording and live feeds restored and candidate ready'));
 if (select state from assessment_attempts where id=aid)<>'active' then raise exception 'Explicit human resume failed';end if;
 perform public.proctor_live_command(candidate,t,'live-stop-source','connection.close',jsonb_build_object('id',replacement));
 select unavailable_at into loss_time from proctor_live_connections where id=replacement;
 if loss_time is null or public.proctor_capture_ready(sid) or (select loss_since from proctor_capture_watchdogs where session_id=sid)<>loss_time then raise exception 'Explicit closure did not pin its actual loss origin';end if;
 begin update proctor_live_connections set unavailable_at=clock_timestamp()+interval '1 hour',revision=revision+1 where id=replacement;raise exception 'Live loss origin rewritten';exception when check_violation then null;end;
 update assessment_exam_windows set closes_at=clock_timestamp()-interval '1 second' where id=(fixture->>'window')::uuid;
 select c.id into replacement from proctor_live_connections c where c.session_id=sid and c.source='microphone' and c.state='active';reply:=public.proctor_live_context(t,replacement,candidate,true);
 if reply->'allowed'<>'false'::jsonb or (select state from assessment_attempts where id=aid)<>'expired' or (select state from proctor_sessions where id=sid)<>'completed' then raise exception 'Live heartbeat extended monitoring beyond the final sitting cutoff';end if;

 fixture:=pg_temp.live_prepare('live-warning-authority',false);sid:=(fixture->>'session_id')::uuid;
 foreach source in array array['camera','microphone','screen'] loop replacement:=pg_temp.live_publish(sid,source);if source='camera' then cam:=replacement;end if;end loop;
 start_data:=jsonb_build_object('registration_id',fixture->>'registration','manifest',form,'manifest_hash',repeat('e',64),'capture_binding',jsonb_build_object('session_id',sid,'device_id',candidate,'token_hash',repeat('d',64)));
 aid:=(public.assessment_command_live_gate(candidate,t,'live-warning-start','attempt.start',start_data,true)->>'id')::uuid;
 perform public.assessment_runtime_command(candidate,t,'live-warning-lease','lease.acquire',jsonb_build_object('attempt_id',aid,'device_id',candidate,'token_hash',repeat('a',64)));
 update proctor_live_connections set expires_at=clock_timestamp()-interval '40 seconds',revision=revision+1 where id=cam;
 perform public.proctor_live_context(t,cam,candidate,false);perform public.assessment_runtime_expire(t,aid);
 if (select state from assessment_attempts where id=aid)<>'active' or(select count(*) from proctor_candidate_notices where session_id=sid and kind='warning')<>1 or exists(select 1 from proctor_candidate_notices where session_id=sid and kind='paused') then raise exception 'Warning-only live policy was silently converted into a pause';end if;
 data:=jsonb_set(data,'{attempt_id}',to_jsonb(aid));reply:=public.assessment_runtime_command(candidate,t,'live-warning-answer','response.append',data);
 if reply ? 'rejected' or reply->'result' is null then raise exception 'Warning-only policy rejected an otherwise authorized answer';end if;
 if (select count(*) from assessment_score_revisions)<>before_scores then raise exception 'Live enforcement changed academic scores';end if;
 if has_function_privilege('authenticated','public.assessment_command_live_gate(uuid,uuid,text,text,jsonb,boolean)','execute') or has_function_privilege('service_role','public.proctor_recording_fresh_until(uuid)','execute') or has_function_privilege('service_role','public.proctor_live_context_pre_launch(uuid,uuid,uuid,boolean)','execute') then raise exception 'Private live bypass/readiness helper exposed';end if;
end;$$;
rollback;
