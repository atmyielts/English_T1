-- Canonical disposable preparations, not personal devices or actual exam time.
insert into public.users(id) values('00000000-0000-4000-8000-000000000071'),('00000000-0000-4000-8000-000000000072'),('00000000-0000-4000-8000-000000000073');
insert into public.tenant_memberships(tenant_id,user_id,status,role) values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000071','active','member'),('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000072','active','member');
create table public.fixture_proctor_workload(n integer,session_id uuid,window_id uuid);
-- A transaction-time default creates honest timestamp ties without rewriting
-- immutable session bindings or disabling their guard.
alter table public.proctor_sessions alter column created_at set default now();
do $$declare t uuid:='10000000-0000-4000-8000-000000000001';owner uuid:='00000000-0000-4000-8000-000000000001';candidate uuid:='00000000-0000-4000-8000-000000000073';pol uuid;ver uuid;win uuid;reg uuid;sid uuid;i integer;begin
 perform public.proctor_command(owner,t,'board-observer-capability','capability.grant','{"user_id":"00000000-0000-4000-8000-000000000071","capability":"proctor.observe"}');
 perform public.proctor_command(owner,t,'board-reviewer-capability','capability.grant','{"user_id":"00000000-0000-4000-8000-000000000072","capability":"proctor.review"}');
 select assessment_version_id into ver from public.assessment_forms limit 1;
 pol:=(public.proctor_command(owner,t,'board-policy-create','policy.create','{"title":"Board live policy","policy":{"schema_version":"proctor.policy.v1","mode":"live","identity_level":0,"camera":true,"microphone":false,"screen":false,"second_camera":false,"auto_pause":true,"recording_retention_days":7,"identity_retention_days":30,"recovery_seconds":10,"reviewer_quorum":2}}')->>'id')::uuid;
 for i in 1..57 loop
  win:=(public.assessment_command(owner,t,'board-window-'||i,'window.create',jsonb_build_object('assessment_version_id',ver,'title','Board sitting '||lpad(i::text,2,'0'),'opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '2 hours'))->>'id')::uuid;
  reg:=(public.assessment_command(owner,t,'board-registration-'||i,'registration.create',jsonb_build_object('window_id',win,'candidate_id',candidate))->>'id')::uuid;
  perform public.proctor_command(owner,t,'board-policy-'||i,'policy.attach',jsonb_build_object('window_id',win,'policy_id',pol));
  perform public.proctor_command(candidate,t,'board-consent-'||i,'preparation.accept',jsonb_build_object('registration_id',reg,'policy_id',pol,'acknowledged',true));
  sid:=(public.proctor_capture_command_live_gate(candidate,t,'board-capture-'||i,'capture.open',jsonb_build_object('registration_id',reg,'device_id',candidate,'token_hash',repeat('a',64)),true)->>'session_id')::uuid;
  insert into public.fixture_proctor_workload values(i,sid,win);
 end loop;
end;$$;
alter table public.proctor_sessions alter column created_at set default clock_timestamp();
