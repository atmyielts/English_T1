\set ON_ERROR_STOP on
begin;
insert into users(id) values('00000000-0000-4000-8000-000000000061');
insert into tenant_memberships values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000061','active','member');
do $$declare t uuid:='10000000-0000-4000-8000-000000000001';a uuid:='00000000-0000-4000-8000-000000000001';candidate uuid:='00000000-0000-4000-8000-000000000003';viewer uuid:='00000000-0000-4000-8000-000000000061';device uuid:=gen_random_uuid();ver uuid;win uuid;reg uuid;pol uuid;sid uuid;pub uuid:=gen_random_uuid();watch uuid:=gen_random_uuid();later uuid:=gen_random_uuid();data jsonb;result jsonb;ctx jsonb;org_before jsonb;attempt_count bigint;begin
 select jsonb_agg(to_jsonb(m) order by tenant_id,user_id,status,role) into org_before from tenant_memberships m;select count(*) into attempt_count from assessment_attempts;
 select assessment_version_id into ver from assessment_forms limit 1;
 win:=(assessment_command(a,t,'live-authority-window','window.create',jsonb_build_object('assessment_version_id',ver,'title','Live authority fixture','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '2 hours'))->>'id')::uuid;
 reg:=(assessment_command(a,t,'live-authority-registration','registration.create',jsonb_build_object('window_id',win,'candidate_id',candidate))->>'id')::uuid;
 pol:=(proctor_command(a,t,'live-authority-policy','policy.create','{"title":"Live consent fixture","policy":{"schema_version":"proctor.policy.v1","mode":"live","identity_level":0,"camera":true,"microphone":false,"screen":false,"second_camera":false,"auto_pause":true,"recording_retention_days":7,"identity_retention_days":30,"recovery_seconds":10,"reviewer_quorum":2}}')->>'id')::uuid;
 perform proctor_command(a,t,'live-authority-attach','policy.attach',jsonb_build_object('window_id',win,'policy_id',pol));
 perform proctor_command(candidate,t,'live-authority-consent','preparation.accept',jsonb_build_object('registration_id',reg,'policy_id',pol,'acknowledged',true));
 -- This wave must not weaken the existing live launch block. Session/device
 -- rows below are explicit signaling-authority fixtures, not exam readiness.
 begin perform proctor_capture_command(candidate,t,'live-capture-still-gated','capture.open',jsonb_build_object('registration_id',reg,'device_id',device,'token_hash',repeat('a',64)));raise exception 'Live exam launch was silently enabled';exception when check_violation then null;end;
 insert into proctor_sessions(tenant_id,registration_id,candidate_id,policy_id,policy_snapshot,state) select t,reg,candidate,pol,policy,'preparing' from proctor_policies where id=pol returning id into sid;
 insert into proctor_capture_launches(session_id,tenant_id,device_id,token_hash,expires_at) values(sid,t,device,repeat('a',64),clock_timestamp()+interval '60 seconds');
 data:=jsonb_build_object('id',pub,'session_id',sid,'role','publisher','source','camera','device_id',device,'token_hash',repeat('a',64));
 result:=proctor_live_command(candidate,t,'live-publisher-open','connection.open',data);if proctor_live_command(candidate,t,'live-publisher-open','connection.open',data)<>result then raise exception 'Publisher replay duplicated a connection';end if;
 if result ? 'token_hash' or result ? 'provider_session_id' then raise exception 'Public connection projection leaked transport secrets';end if;
 if result ? 'provider_app_id' then raise exception 'Public connection projection leaked private provider application';end if;
 begin perform proctor_live_command(candidate,t,'live-device-spoof','connection.open',data||jsonb_build_object('id',gen_random_uuid(),'device_id',gen_random_uuid()));raise exception 'Wrong capture device published';exception when insufficient_privilege then null;end;
 begin perform proctor_live_command(candidate,t,'live-unconsented-source','connection.open',data||jsonb_build_object('id',gen_random_uuid(),'source','microphone'));raise exception 'Unconsented source published';exception when insufficient_privilege then null;end;
 perform proctor_live_report(t,pub,'allocated','{"provider_session_id":"publisher-session","provider_app_id":"test-app"}');perform proctor_live_report(t,pub,'negotiated',jsonb_build_object('mid','0','track_name','c-'||pub::text||'-camera'));perform proctor_live_report(t,pub,'connected','{}');perform proctor_live_report(t,pub,'connected','{}');
 if(select count(*) from assessment_audit_events where target_id=pub and action='proctor.live.connected')<>1 then raise exception 'Connected receipt repeated an audit transition';end if;
 begin perform proctor_live_report(t,pub,'allocated','{"provider_session_id":"publisher-session","provider_app_id":"different-app"}');raise exception 'Provider application changed under an existing connection';exception when unique_violation then null;end;
 begin perform proctor_live_context(t,pub,viewer,false);raise exception 'Foreign owner read private provider context';exception when no_data_found then null;end;
 perform proctor_command(a,t,'live-observer-grant','capability.grant',jsonb_build_object('user_id',viewer,'capability','proctor.observe'));
 begin perform proctor_live_read(viewer,t,sid);raise exception 'Unassigned observer discovered feeds';exception when insufficient_privilege then null;end;
 perform proctor_command(a,t,'live-observer-assign','session.assign',jsonb_build_object('session_id',sid,'user_id',viewer,'assignment_role','observer'));
 if jsonb_array_length(proctor_live_read(viewer,t,sid))<>1 then raise exception 'Assigned observer did not discover current source';end if;
 data:=jsonb_build_object('id',watch,'session_id',sid,'role','viewer','source','camera','publisher_id',pub);
 begin perform proctor_live_command(viewer,t,'live-other-publisher','connection.open',data||jsonb_build_object('publisher_id',gen_random_uuid()));raise exception 'Viewer silently chose a different publisher';exception when check_violation then null;end;
 perform proctor_live_command(viewer,t,'live-viewer-open','connection.open',data);
 ctx:=proctor_live_context(t,watch,viewer,true);if ctx->>'publisher_provider_session_id'<>'publisher-session' or ctx->'allowed'<>'true'::jsonb then raise exception 'Viewer did not pin its authorized publisher';end if;
 perform proctor_live_report(t,watch,'allocated','{"provider_session_id":"viewer-session","provider_app_id":"test-app"}');perform proctor_live_report(t,watch,'negotiated',jsonb_build_object('mid','7','track_name','c-'||watch::text||'-camera'));perform proctor_live_report(t,watch,'connected','{}');
 update proctor_assignments set active=false where tenant_id=t and session_id=sid and user_id=viewer;
 ctx:=proctor_live_context(t,watch,viewer,false);if ctx->'allowed'<>'false'::jsonb or ctx->>'state'<>'closing' then raise exception 'Withdrawn observer retained forwarding authority';end if;
 begin perform proctor_live_command(viewer,t,'live-viewer-open','connection.open',data);raise exception 'Withdrawn observer replayed privileged open receipt';exception when insufficient_privilege then null;end;
 perform proctor_live_report(t,watch,'closed','{}');
 begin perform proctor_live_report(t,watch,'allocated','{"provider_session_id":"different-session","provider_app_id":"test-app"}');raise exception 'Closed provider binding rewritten';exception when unique_violation then null;end;
 perform proctor_live_command(candidate,t,'live-publisher-close','connection.close',jsonb_build_object('id',pub));
 perform proctor_live_command(candidate,t,'live-new-publisher-open','connection.open',jsonb_build_object('id',later,'session_id',sid,'role','publisher','source','camera','device_id',device,'token_hash',repeat('a',64)));
 perform proctor_live_command(candidate,t,'live-new-publisher-close','connection.close',jsonb_build_object('id',later));
 -- Late allocation receipts retain custody after closure was requested.
 perform proctor_live_report(t,later,'allocated','{"provider_session_id":"late-provider-session","provider_app_id":"test-app"}');
 if proctor_live_context(t,later,null,false)->>'provider_session_id'<>'late-provider-session' or proctor_live_context(t,later,null,false)->>'state'<>'closing' then raise exception 'Late allocation lost cleanup custody or revived access';end if;
 perform proctor_live_report(t,pub,'closed','{}');perform proctor_live_report(t,later,'closed','{}');
 if org_before is distinct from(select jsonb_agg(to_jsonb(m) order by tenant_id,user_id,status,role) from tenant_memberships m) or attempt_count<>(select count(*) from assessment_attempts) then raise exception 'Live signaling changed membership or started an exam';end if;
 if has_table_privilege('authenticated','public.proctor_live_connections','select') or has_function_privilege('authenticated','public.proctor_live_context(uuid,uuid,uuid,boolean)','execute') or has_function_privilege('service_role','public.proctor_live_projection(uuid)','execute') then raise exception 'Private live authority exposed';end if;
 begin delete from proctor_live_connections where id=pub;raise exception 'Live history deleted';exception when check_violation then null;end;
end;$$;
rollback;
