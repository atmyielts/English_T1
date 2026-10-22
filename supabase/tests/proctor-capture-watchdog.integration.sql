\set ON_ERROR_STOP on
begin;
-- Synthetic receipt/time fixtures. These exercise server authority, not a
-- physical camera, actual decoder or hosted scheduler latency.
create function pg_temp.watch_media(p_actor uuid,p_tenant uuid,p_recording uuid) returns void language plpgsql as $$
declare r public.proctor_recordings;data jsonb;begin
 select * into r from public.proctor_recordings where id=p_recording;
 data:=jsonb_build_object('recording_id',r.id,'sequence',r.last_sequence+1,'start_ms',r.last_end_ms,'end_ms',r.last_end_ms+5000,'previous_hash',r.head_hash,'byte_length',3,'sha256',repeat('a',64),'parts',jsonb_build_array(jsonb_build_object('byte_length',3,'sha256',repeat('a',64))));
 perform public.proctor_recording_command(p_actor,p_tenant,'watch-media-'||r.id||'-'||(r.last_sequence+1),'recording.reserve',data);
 perform public.proctor_recording_transport(p_actor,p_tenant,'part.receipt',jsonb_build_object('recording_id',r.id,'sequence',r.last_sequence+1,'index',0,'sha256',repeat('a',64),'byte_length',3,'cipher_sha256',repeat('b',64),'iv',repeat('c',24),'key_id','test-k1','etag','watch-part'));
 perform public.proctor_recording_transport(p_actor,p_tenant,'segment.complete',jsonb_build_object('recording_id',r.id,'sequence',r.last_sequence+1));
end;$$;
create function pg_temp.watch_start(p_label text,p_auto boolean default true) returns jsonb language plpgsql as $$
declare t uuid:='10000000-0000-4000-8000-000000000001';owner uuid:='00000000-0000-4000-8000-000000000001';candidate uuid:='00000000-0000-4000-8000-000000000003';win uuid;reg uuid;pol uuid;ver uuid;form jsonb;launch jsonb;aid uuid;rid uuid:=gen_random_uuid();binding jsonb;
begin
 select assessment_version_id,manifest into ver,form from public.assessment_forms limit 1;
 win:=(public.assessment_command(owner,t,p_label||'-window','window.create',jsonb_build_object('assessment_version_id',ver,'title',p_label,'opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '2 hours'))->>'id')::uuid;
 reg:=(public.assessment_command(owner,t,p_label||'-registration','registration.create',jsonb_build_object('window_id',win,'candidate_id',candidate))->>'id')::uuid;
 pol:=(public.proctor_command(owner,t,p_label||'-policy','policy.create',jsonb_build_object('title',p_label,'policy',jsonb_build_object('schema_version','proctor.policy.v1','mode','record_review','identity_level',0,'camera',true,'microphone',false,'screen',false,'second_camera',false,'auto_pause',p_auto,'recording_retention_days',7,'identity_retention_days',30,'recovery_seconds',10,'reviewer_quorum',2)))->>'id')::uuid;
 perform public.proctor_command(owner,t,p_label||'-attach','policy.attach',jsonb_build_object('window_id',win,'policy_id',pol));
 perform public.proctor_command(candidate,t,p_label||'-consent','preparation.accept',jsonb_build_object('registration_id',reg,'policy_id',pol,'acknowledged',true));
 binding:=jsonb_build_object('registration_id',reg,'device_id',candidate,'token_hash',repeat('d',64));
 launch:=public.proctor_capture_command(candidate,t,p_label||'-open','capture.open',binding);
 binding:=jsonb_build_object('session_id',launch->>'session_id','device_id',candidate,'token_hash',repeat('d',64));
 perform public.proctor_recording_command(candidate,t,p_label||'-begin','recording.begin',jsonb_build_object('recording_id',rid,'session_id',launch->>'session_id','source','camera','mime','video/webm'));
 perform pg_temp.watch_media(candidate,t,rid);
 aid:=(public.assessment_command(candidate,t,p_label||'-start','attempt.start',jsonb_build_object('registration_id',reg,'manifest',form,'manifest_hash',repeat('e',64),'capture_binding',binding))->>'id')::uuid;
 perform public.assessment_runtime_command(candidate,t,p_label||'-lease','lease.acquire',jsonb_build_object('attempt_id',aid,'device_id',candidate,'token_hash',repeat('a',64)));
 return jsonb_build_object('attempt',aid,'session',launch->>'session_id','recording',rid,'binding',binding,'window',win);
end;$$;

do $$declare t uuid:='10000000-0000-4000-8000-000000000001';owner uuid:='00000000-0000-4000-8000-000000000001';candidate uuid:='00000000-0000-4000-8000-000000000003';foreign_user uuid:='00000000-0000-4000-8000-000000000004';fixture jsonb;aid uuid;sid uuid;rid uuid;new_rid uuid;reply jsonb;data jsonb;before_scores bigint;before_responses bigint;cutoff timestamptz;deadline timestamptz;closing timestamptz;ticket public.assessment_runtime_schedule;first_pause timestamptz;notice_count bigint;
begin
 select count(*) into before_scores from public.assessment_score_revisions;
 fixture:=pg_temp.watch_start('watchdog-authority');aid:=(fixture->>'attempt')::uuid;sid:=(fixture->>'session')::uuid;rid:=(fixture->>'recording')::uuid;
 if not exists(select 1 from public.proctor_capture_watchdogs where attempt_id=aid and next_check_at<=clock_timestamp()+interval '6 seconds') or not exists(select 1 from public.assessment_runtime_schedule where attempt_id=aid and due_at<=clock_timestamp()+interval '6 seconds') then raise exception 'Activation did not durably schedule capture enforcement';end if;
 reply:=public.assessment_runtime_snapshot(t,aid,candidate);
 if (reply#>>'{capture,ready}')::boolean is not true or (reply->>'next_deadline_at')::timestamptz>clock_timestamp()+interval '6 seconds' then raise exception 'DO snapshot did not include the capture check';end if;
 select deadline_at into deadline from public.assessment_attempts where id=aid;
 data:=jsonb_build_object('attempt_id',aid,'lease',jsonb_build_object('device_id',candidate,'token_hash',repeat('a',64),'epoch',1));
 -- Commit an answer first: losing its reply must still recover the receipt
 -- even if a later outage has paused this attempt.
 data:=data||jsonb_build_object('item_version_id',(select f.manifest#>>'{sections,0,items,0,item_version_id}' from public.assessment_forms f where f.id=(select form_id from public.assessment_attempts where id=aid)),'sequence',1,'response','a','payload_hash',repeat('f',64));
 reply:=public.assessment_runtime_command(candidate,t,'watchdog-committed-answer','response.append',data);
 select count(*) into before_responses from public.assessment_response_journal where attempt_id=aid;
 cutoff:=clock_timestamp()-interval '40 seconds';
 update public.proctor_capture_launches set expires_at=cutoff where session_id=sid;
 begin perform public.assessment_runtime_snapshot(t,aid,foreign_user);raise exception 'Foreign candidate read/enforced capture';exception when no_data_found then null;end;
 if (select state from public.assessment_attempts where id=aid)<>'active' then raise exception 'Foreign snapshot changed state';end if;
 -- A valid new mutation commits the pause but returns NO answer receipt.
 reply:=public.assessment_runtime_command(candidate,t,'watchdog-rejected-answer','response.append',data||jsonb_build_object('sequence',2));
 if reply->>'rejected'<>'capture_continuity_required' or reply ? 'result' or reply#>>'{snapshot,state}'<>'paused' then raise exception 'Capture loss acknowledged an unsaved answer';end if;
 if (select state from public.assessment_attempts where id=aid)<>'paused' or (select count(*) from public.assessment_response_journal where attempt_id=aid)<>before_responses or exists(select 1 from public.assessment_runtime_commands where idempotency_key='watchdog-rejected-answer') then raise exception 'Pause rolled back or rejected response was recorded';end if;
 if (select paused_at from public.proctor_sessions where id=sid) is distinct from cutoff+interval '10 seconds' or (select deadline_at from public.assessment_attempts where id=aid)<>deadline then raise exception 'Delayed pause invented extra time or used observed instead of effective cutoff';end if;
 first_pause:=(select paused_at from public.proctor_sessions where id=sid);
 if not exists(select 1 from public.assessment_audit_events where target_id=sid and action='proctor.capture.paused' and actor_kind='system' and actor_id is null) or not exists(select 1 from public.proctor_candidate_notices where session_id=sid and kind='paused' and issuer_kind='system' and issued_by is null) then raise exception 'Automatic enforcement impersonated a user or omitted candidate notice';end if;
 for i in 1..3 loop perform public.assessment_runtime_expire(t,aid);end loop;
 if (select count(*) from public.assessment_audit_events where target_id=sid and action='proctor.capture.paused')<>1 or (select count(*) from public.proctor_candidate_notices where session_id=sid and kind='paused')<>1 then raise exception 'Repeated alarms duplicated an enforcement/notice';end if;
 reply:=public.assessment_runtime_command(candidate,t,'watchdog-committed-answer','response.append',data);
 if reply ? 'rejected' or reply->'result' is null or reply#>>'{snapshot,state}'<>'paused' then raise exception 'Original committed answer was lost after capture pause';end if;
 begin perform public.proctor_command(owner,t,'watchdog-resume-without-media','session.resume',jsonb_build_object('session_id',sid,'reason','Cannot resume missing capture'));raise exception 'Human resumed without required recording';exception when check_violation then null;end;
 -- Renewing a device lease cannot resume the academic clock or erase the
 -- pause. Restore native streams while paused, then require a human action.
 perform public.proctor_capture_command(candidate,t,'watchdog-renew-paused','capture.heartbeat',fixture->'binding');
 perform public.proctor_recording_command(candidate,t,'watchdog-stop-old-camera','recording.close',jsonb_build_object('recording_id',rid,'expected_sequence',(select last_sequence from public.proctor_recordings where id=rid),'expected_hash',(select head_hash from public.proctor_recordings where id=rid),'reason','track_lost'));
 new_rid:=gen_random_uuid();
 perform public.proctor_recording_command(candidate,t,'watchdog-paused-camera-restart','recording.begin',jsonb_build_object('recording_id',new_rid,'session_id',sid,'source','camera','mime','video/webm'));
 perform pg_temp.watch_media(candidate,t,new_rid);
 if not public.proctor_capture_ready(sid) or (select state from public.assessment_attempts where id=aid)<>'paused' then raise exception 'Paused recovery did not restore media or automatically resumed';end if;
 perform public.proctor_command(owner,t,'watchdog-human-resume','session.resume',jsonb_build_object('session_id',sid,'reason','Required recording recovered and candidate is ready'));
 if (select state from public.assessment_attempts where id=aid)<>'active' or (select deadline_at from public.assessment_attempts where id=aid)<deadline+(clock_timestamp()-first_pause)-interval '2 seconds' then raise exception 'Human resume did not preserve remaining time';end if;
 -- Another episode must produce another event, not reuse the first warning.
 update public.proctor_capture_launches set expires_at=clock_timestamp()-interval '40 seconds' where session_id=sid;
 perform public.assessment_runtime_expire(t,aid);
 if (select count(*) from public.assessment_audit_events where target_id=sid and action='proctor.capture.paused')<>2 then raise exception 'Second capture outage was not enforced independently';end if;

 -- Policy recovery grace and warn-only policy are independent of clock state.
 fixture:=pg_temp.watch_start('watchdog-warning',false);aid:=(fixture->>'attempt')::uuid;sid:=(fixture->>'session')::uuid;
 update public.proctor_capture_launches set expires_at=clock_timestamp()-interval '1 second' where session_id=sid;
 reply:=public.assessment_runtime_snapshot(t,aid,candidate);
 if reply->>'state'<>'active' or exists(select 1 from public.proctor_candidate_notices where session_id=sid) then raise exception 'Recovery grace was skipped';end if;
 -- Keep the original loss origin; a newly stale source cannot restart grace.
 update public.proctor_capture_watchdogs set loss_since=clock_timestamp()-interval '40 seconds' where session_id=sid;
 perform public.assessment_runtime_expire(t,aid);perform public.assessment_runtime_expire(t,aid);
 if (select state from public.assessment_attempts where id=aid)<>'active' or (select count(*) from public.proctor_candidate_notices where session_id=sid and kind='warning')<>1 then raise exception 'Warning policy paused the exam or duplicated notices';end if;
 perform public.proctor_capture_command(candidate,t,'watchdog-warning-recovery','capture.heartbeat',fixture->'binding');
 if not exists(select 1 from public.assessment_audit_events where target_id=sid and action='proctor.capture.restored') then raise exception 'Recovery lost its server provenance';end if;

 -- A late fresh media upload/heartbeat must not erase a breached grace cutoff.
 fixture:=pg_temp.watch_start('watchdog-before-renew');aid:=(fixture->>'attempt')::uuid;sid:=(fixture->>'session')::uuid;
 update public.proctor_capture_launches set expires_at=clock_timestamp()-interval '40 seconds' where session_id=sid;
 perform public.proctor_capture_command(candidate,t,'watchdog-late-heartbeat','capture.heartbeat',fixture->'binding');
 if (select state from public.assessment_attempts where id=aid)<>'paused' then raise exception 'Late heartbeat erased a crossed enforcement cutoff';end if;

 -- An otherwise healthy device lease is insufficient when media itself stops.
 -- Time injection is isolated to this rolled-back superuser fixture; production
 -- has no ability to edit immutable committed timestamps or disable triggers.
 fixture:=pg_temp.watch_start('watchdog-media-freshness');aid:=(fixture->>'attempt')::uuid;sid:=(fixture->>'session')::uuid;rid:=(fixture->>'recording')::uuid;
 alter table public.proctor_recording_segments disable trigger recording_segment_guard;
 update public.proctor_recording_segments set committed_at=clock_timestamp()-interval '40 seconds' where recording_id=rid;
 alter table public.proctor_recording_segments enable trigger recording_segment_guard;
 cutoff:=(select committed_at from public.proctor_recording_segments where recording_id=rid and sequence=1);
 if public.proctor_capture_ready(sid) then raise exception 'Fresh heartbeat hid stale media';end if;
 -- Receipt replay cannot renew old media. It must first enforce the outage.
 perform public.proctor_recording_transport(candidate,t,'segment.complete',jsonb_build_object('recording_id',rid,'sequence',1));
 if (select committed_at from public.proctor_recording_segments where recording_id=rid and sequence=1)<>cutoff or (select state from public.assessment_attempts where id=aid)<>'paused' then raise exception 'Receipt replay hid stale required media';end if;
 perform pg_temp.watch_media(candidate,t,rid);
 if not public.proctor_capture_ready(sid) or (select state from public.assessment_attempts where id=aid)<>'paused' then raise exception 'Fresh media failed recovery or auto-resumed';end if;
 update public.assessment_exam_windows set closes_at=clock_timestamp()-interval '1 second' where id=(fixture->>'window')::uuid;
 reply:=public.assessment_runtime_expire(t,aid);
 if reply->>'state'<>'expired' or (select state from public.proctor_sessions where id=sid)<>'completed' then raise exception 'Paused capture exceeded the final sitting cutoff: snapshot %, attempt %, monitoring %, closing %',reply,(select state from public.assessment_attempts where id=aid),(select state from public.proctor_sessions where id=sid),(select closes_at from public.assessment_exam_windows where id=(fixture->>'window')::uuid);end if;

 -- Server-only recovery reconciles without any candidate or browser request.
 fixture:=pg_temp.watch_start('watchdog-offline-recovery');aid:=(fixture->>'attempt')::uuid;sid:=(fixture->>'session')::uuid;
 update public.proctor_capture_launches set expires_at=clock_timestamp()-interval '40 seconds' where session_id=sid;
 update public.assessment_runtime_schedule set due_at=clock_timestamp()-interval '1 second',lease_token=gen_random_uuid(),leased_until=clock_timestamp()+interval '1 minute' where attempt_id=aid returning * into ticket;
 reply:=public.assessment_runtime_schedule_reconcile(t,aid,ticket.revision,ticket.lease_token);
 if (reply->>'accepted')::boolean is not true or reply#>>'{snapshot,state}'<>'paused' or (select state from public.assessment_attempts where id=aid)<>'paused' then raise exception 'Offline scheduler did not enforce capture loss';end if;
 if (select due_at from public.assessment_runtime_schedule where attempt_id=aid) is distinct from (select w.closes_at from public.assessment_registrations r join public.assessment_exam_windows w on w.id=r.window_id where r.id=(select registration_id from public.assessment_attempts where id=aid)) then raise exception 'Paused scheduler lost the final sitting cutoff';end if;

 -- Academic expiry earlier than the capture action wins; capture cannot extend
 -- an already elapsed exam. Final sitting closure also ends a paused attempt.
 fixture:=pg_temp.watch_start('watchdog-academic-expiry');aid:=(fixture->>'attempt')::uuid;sid:=(fixture->>'session')::uuid;
 update public.assessment_attempts set deadline_at=clock_timestamp()-interval '50 seconds',section_deadline_at=clock_timestamp()-interval '50 seconds' where id=aid;
 update public.proctor_capture_launches set expires_at=clock_timestamp()-interval '40 seconds' where session_id=sid;
 reply:=public.assessment_runtime_expire(t,aid);
 if reply->>'state'<>'expired' or exists(select 1 from public.proctor_candidate_notices where session_id=sid and kind='paused') then raise exception 'Capture pause extended an earlier expired exam';end if;
 if (select count(*) from public.assessment_score_revisions)<>before_scores then raise exception 'Capture policy mutated academic scores';end if;
 if has_table_privilege('service_role','proctor_capture_watchdogs','update') or has_function_privilege('service_role','proctor_capture_enforce(uuid,uuid)','execute') or has_function_privilege('service_role','assessment_runtime_command_pre_watchdog(uuid,uuid,text,text,jsonb)','execute') or has_function_privilege('authenticated','assessment_runtime_snapshot(uuid,uuid,uuid)','execute') then raise exception 'Watchdog authority/bypass leaked';end if;
end;$$;
rollback;
