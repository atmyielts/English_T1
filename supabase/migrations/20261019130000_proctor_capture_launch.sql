begin;
-- Monitoring may prepare before an academic attempt (and its clock) exists.
alter table public.proctor_sessions alter column attempt_id drop not null;
alter table public.proctor_sessions add column registration_id uuid;
update public.proctor_sessions s set registration_id=a.registration_id from public.assessment_attempts a where a.id=s.attempt_id;
alter table public.proctor_sessions alter column registration_id set not null;
alter table public.proctor_sessions add foreign key(tenant_id,registration_id) references public.assessment_registrations(tenant_id,id);
alter table public.proctor_sessions drop constraint proctor_sessions_state_check;
alter table public.proctor_sessions add check(state in('preparing','active','paused','completed'));
alter table public.proctor_sessions add check((attempt_id is null and state in('preparing','completed')) or (attempt_id is not null and state in('active','paused','completed')));
create unique index proctor_one_preparing_registration on public.proctor_sessions(registration_id) where state='preparing';
create function public.proctor_session_registration() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if new.attempt_id is not null then select registration_id into new.registration_id from public.assessment_attempts where id=new.attempt_id and tenant_id=new.tenant_id and candidate_id=new.candidate_id;if not found then raise exception 'invalid_monitoring_attempt' using errcode='23514';end if;end if;return new;
end;$$;
create trigger session_registration before insert on public.proctor_sessions for each row execute function public.proctor_session_registration();
create table public.proctor_capture_launches(
 session_id uuid primary key,tenant_id uuid not null,device_id uuid not null,token_hash text not null check(token_hash~'^[a-f0-9]{64}$'),
 expires_at timestamptz not null,last_seen_at timestamptz not null default clock_timestamp(),activated_at timestamptz,
 foreign key(tenant_id,session_id) references public.proctor_sessions(tenant_id,id)
);
create table public.proctor_capture_commands(tenant_id uuid not null,actor_id uuid not null references public.users(id),idempotency_key text not null,request jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(tenant_id,actor_id,idempotency_key));
alter table public.proctor_capture_launches enable row level security;
alter table public.proctor_capture_commands enable row level security;
revoke all on public.proctor_capture_launches,public.proctor_capture_commands from anon,authenticated,service_role;
create trigger immutable_record before update or delete on public.proctor_capture_commands for each row execute function public.assessment_immutable();
create function public.proctor_recording_retention_pin() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$declare days integer;begin
 select coalesce((policy_snapshot->>'recording_retention_days')::integer,90) into days from public.proctor_sessions where tenant_id=new.tenant_id and id=new.session_id;
 if days is null or days not between 1 and 365 then raise exception 'invalid_recording_retention' using errcode='23514';end if;
 new.expires_at:=new.created_at+make_interval(days=>days);return new;
end;$$;
create trigger recording_retention_pin before insert on public.proctor_recordings for each row execute function public.proctor_recording_retention_pin();

create function public.proctor_capture_ready(p_session uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.proctor_sessions s join public.proctor_capture_launches l on l.session_id=s.id
 where s.id=p_session and s.state in('preparing','active') and l.expires_at>clock_timestamp()
 and exists(select 1 from unnest(array['camera','microphone','screen'])required(source) where coalesce((s.policy_snapshot->>required.source)::boolean,false))
 and not exists(select 1 from unnest(array['camera','microphone','screen'])required(source) where coalesce((s.policy_snapshot->>required.source)::boolean,false)
 and not exists(select 1 from public.proctor_recordings r join public.proctor_recording_segments g on g.recording_id=r.id
 where r.session_id=s.id and r.source=required.source and r.state='open' and r.expires_at>clock_timestamp() and g.kind='media' and g.state='committed' and g.committed_at>=clock_timestamp()-interval '20 seconds')));
$$;
create function public.proctor_capture_read(p_actor uuid,p_tenant uuid,p_session uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare s public.proctor_sessions;l public.proctor_capture_launches;rows jsonb;begin
 select * into s from public.proctor_sessions where id=p_session and tenant_id=p_tenant and candidate_id=p_actor;if not found then raise exception 'not_found' using errcode='P0002';end if;
 select * into l from public.proctor_capture_launches where session_id=s.id;if not found then raise exception 'capture_launch_not_found' using errcode='P0002';end if;
 select jsonb_agg(jsonb_build_object('source',required.source,'ready',exists(select 1 from public.proctor_recordings r join public.proctor_recording_segments g on g.recording_id=r.id where r.session_id=s.id and r.source=required.source and r.state='open' and r.expires_at>clock_timestamp() and g.kind='media' and g.state='committed' and g.committed_at>=clock_timestamp()-interval '20 seconds')) order by required.source) into rows from unnest(array['camera','microphone','screen'])required(source) where coalesce((s.policy_snapshot->>required.source)::boolean,false);
 return jsonb_build_object('schema_version','proctor.capture.v1','session_id',s.id,'registration_id',s.registration_id,'attempt_id',s.attempt_id,'state',s.state,'policy_id',s.policy_id,'expires_at',l.expires_at,'activated_at',l.activated_at,'ready',public.proctor_capture_ready(s.id),'sources',coalesce(rows,'[]'),'server_time',clock_timestamp());
end;$$;
create or replace function public.proctor_session_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if (new.id,new.tenant_id,new.registration_id,new.candidate_id,new.policy_id,new.policy_snapshot,new.created_at) is distinct from (old.id,old.tenant_id,old.registration_id,old.candidate_id,old.policy_id,old.policy_snapshot,old.created_at) then raise exception 'immutable_proctor_session_binding' using errcode='23514';end if;
 if new.attempt_id is distinct from old.attempt_id and not(old.attempt_id is null and old.state='preparing' and new.state='active' and public.proctor_capture_ready(old.id) and exists(select 1 from public.assessment_attempts a where a.id=new.attempt_id and a.tenant_id=new.tenant_id and a.registration_id=new.registration_id and a.candidate_id=new.candidate_id)) then raise exception 'immutable_proctor_session_binding' using errcode='23514';end if;
 if old.state='completed' and new.state<>'completed' then raise exception 'session_finalized' using errcode='23514';end if;
 if old.state='preparing' and new.state='active' and new.attempt_id is null then raise exception 'academic_attempt_required' using errcode='23514';end if;
 if old.state<>'completed' and new.state='completed' then new.completed_at:=clock_timestamp();elsif new.completed_at is distinct from old.completed_at then raise exception 'immutable_completion_time' using errcode='23514';end if;return new;
end;$$;
create function public.proctor_capture_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare reg public.assessment_registrations;s public.proctor_sessions;l public.proctor_capture_launches;pol public.proctor_policies;prior public.proctor_capture_commands;request jsonb;result jsonb;win public.assessment_exam_windows;sid uuid;
begin
 if p_key is null or length(p_key) not between 8 and 200 or p_action is null or p_action not in('capture.open','capture.heartbeat','capture.cancel') or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'invalid_capture_command' using errcode='22023';end if;
 if p_action='capture.open' then select * into reg from public.assessment_registrations where tenant_id=p_tenant and id=(p_data->>'registration_id')::uuid and candidate_id=p_actor for update;
 else select g.* into reg from public.assessment_registrations g join public.proctor_sessions x on x.registration_id=g.id where x.tenant_id=p_tenant and x.id=(p_data->>'session_id')::uuid and x.candidate_id=p_actor for update of g;end if;
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 select * into win from public.assessment_exam_windows where id=reg.window_id for update;
 select p.* into pol from public.proctor_policies p join public.proctor_window_policies b on b.policy_id=p.id where b.window_id=win.id and b.tenant_id=p_tenant;
 if not found then raise exception 'monitoring_policy_required' using errcode='23514';end if;
 if pol.policy->>'mode' not in('browser','record_review') or coalesce((pol.policy->>'second_camera')::boolean,false) or (pol.policy->>'identity_level')::integer=2 then raise exception 'capture_or_secure_client_required' using errcode='23514';end if;
 if not exists(select 1 from unnest(array['camera','microphone','screen'])source where coalesce((pol.policy->>source)::boolean,false)) then raise exception 'capture_sources_required' using errcode='23514';end if;
 if not exists(select 1 from public.proctor_preparations where registration_id=reg.id and candidate_id=p_actor and policy_id=pol.id) then raise exception 'proctor_consent_required' using errcode='23514';end if;
 if (pol.policy->>'identity_level')::integer in(1,3) and not exists(select 1 from public.proctor_identity_checks where registration_id=reg.id and level>=(pol.policy->>'identity_level')::integer and public.assessment_has_capability(p_tenant,verified_by,'proctor.manage')) then raise exception 'identity_verification_required' using errcode='23514';end if;
 if coalesce(p_data->>'token_hash','')!~'^[a-f0-9]{64}$' or (p_data->>'device_id')::uuid is null then raise exception 'capture_device_binding_required' using errcode='22023';end if;
 if p_action='capture.open' then select * into s from public.proctor_sessions where tenant_id=p_tenant and registration_id=reg.id and (state='preparing' or attempt_id is not null) order by created_at desc limit 1 for update;
 else select * into s from public.proctor_sessions where tenant_id=p_tenant and id=(p_data->>'session_id')::uuid and registration_id=reg.id and candidate_id=p_actor for update;end if;
 if p_action<>'capture.open' and s.id is null then raise exception 'capture_session_changed' using errcode='23505';end if;
 if s.id is not null then select * into l from public.proctor_capture_launches where session_id=s.id for update;if l.session_id is null or l.device_id is distinct from (p_data->>'device_id')::uuid or l.token_hash is distinct from p_data->>'token_hash' then raise exception 'capture_device_conflict' using errcode='23505';end if;end if;
 request:=jsonb_build_object('action',p_action,'data',p_data);perform pg_advisory_xact_lock(hashtextextended('proctor-capture:'||p_tenant::text||p_actor::text||p_key,0));
 select * into prior from public.proctor_capture_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if p_action='capture.cancel' then
  if s.state<>'preparing' or s.attempt_id is not null then raise exception 'active_capture_cannot_be_cancelled' using errcode='23514';end if;
  update public.proctor_sessions set state='completed' where id=s.id;update public.proctor_capture_launches set expires_at=clock_timestamp() where session_id=s.id;
 else
  if clock_timestamp()<win.opens_at or clock_timestamp()>=win.closes_at then raise exception 'window_closed' using errcode='23514';end if;
  if s.id is null then
   if exists(select 1 from public.assessment_attempts where registration_id=reg.id) then raise exception 'capture_resume_requires_recovery' using errcode='23514';end if;
   if (select count(*) from public.proctor_sessions where registration_id=reg.id)>=8 then raise exception 'capture_preparation_limit' using errcode='23514';end if;
   insert into public.proctor_sessions(tenant_id,registration_id,candidate_id,policy_id,policy_snapshot,state) values(p_tenant,reg.id,p_actor,pol.id,pol.policy,'preparing') returning * into s;
   insert into public.proctor_capture_launches(session_id,tenant_id,device_id,token_hash,expires_at) values(s.id,p_tenant,(p_data->>'device_id')::uuid,p_data->>'token_hash',clock_timestamp()+interval '60 seconds');
  else
   if s.policy_id<>pol.id or s.state not in('preparing','active','paused') then raise exception 'capture_session_not_active' using errcode='23514';end if;
   update public.proctor_capture_launches set expires_at=clock_timestamp()+interval '60 seconds',last_seen_at=clock_timestamp() where session_id=s.id;
  end if;
 end if;
 result:=public.proctor_capture_read(p_actor,p_tenant,s.id);
 insert into public.proctor_capture_commands values(p_tenant,p_actor,p_key,request,result,clock_timestamp());
 if p_action<>'capture.heartbeat' then insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'proctor.'||p_action,s.id,jsonb_build_object('registration_id',reg.id,'policy_id',pol.id,'device_id',p_data->>'device_id'));end if;return result;
end;$$;

create or replace function public.proctor_recording_candidate(p_actor uuid,p_tenant uuid,p_session uuid) returns public.proctor_sessions language plpgsql security definer set search_path=public,pg_temp as $$declare s public.proctor_sessions;begin
 select * into s from public.proctor_sessions where tenant_id=p_tenant and id=p_session;if not found or s.candidate_id<>p_actor then raise exception 'not_found' using errcode='P0002';end if;
 if s.attempt_id is null then perform 1 from public.assessment_registrations where id=s.registration_id for update;else perform 1 from public.assessment_attempts where id=s.attempt_id for update;end if;
 select * into s from public.proctor_sessions where tenant_id=p_tenant and id=p_session for update;
 if s.state='completed' and (s.completed_at is null or s.completed_at+interval '1 day'<=clock_timestamp()) or s.state='preparing' and s.created_at+interval '1 day'<=clock_timestamp() then raise exception 'recording_recovery_expired' using errcode='23514';end if;return s;
end;$$;
alter function public.proctor_recording_command(uuid,uuid,text,text,jsonb) rename to proctor_recording_command_pre_capture;
revoke all on function public.proctor_recording_command_pre_capture(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.proctor_recording_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare s public.proctor_sessions;prior public.proctor_recording_commands;request jsonb;result jsonb;r public.proctor_recordings;begin
 if p_action<>'recording.begin' then return public.proctor_recording_command_pre_capture(p_actor,p_tenant,p_key,p_action,p_data);end if;
 s:=public.proctor_recording_candidate(p_actor,p_tenant,(p_data->>'session_id')::uuid);
 if s.state<>'preparing' then return public.proctor_recording_command_pre_capture(p_actor,p_tenant,p_key,p_action,p_data);end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 request:=jsonb_build_object('action',p_action,'data',p_data);perform pg_advisory_xact_lock(hashtextextended('proctor-recording:'||p_tenant::text||p_actor::text||p_key,0));
 select * into prior from public.proctor_recording_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if not exists(select 1 from public.proctor_capture_launches where session_id=s.id and expires_at>clock_timestamp()) then raise exception 'capture_lease_expired' using errcode='23514';end if;
 if p_data->>'source' is null or p_data->>'source' not in('camera','microphone','screen') or coalesce((s.policy_snapshot->>(p_data->>'source'))::boolean,false) is not true or p_data->>'mime' is null or p_data->>'mime' not in('video/webm','video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm;codecs=vp8','video/webm;codecs=vp9','video/mp4','audio/webm','audio/webm;codecs=opus','audio/mp4') or ((p_data->>'source'='microphone') is distinct from (p_data->>'mime' like 'audio/%')) then raise exception 'recording_source_not_permitted' using errcode='22023';end if;
 if (select count(*) from public.proctor_recordings where session_id=s.id)>=64 then raise exception 'recording_restart_limit' using errcode='23514';end if;
 insert into public.proctor_recordings(id,tenant_id,session_id,candidate_id,source,mime) values((p_data->>'recording_id')::uuid,p_tenant,s.id,p_actor,p_data->>'source',p_data->>'mime') returning * into r;
 result:=jsonb_build_object('id',r.id,'state',r.state,'sequence',0,'head_hash',r.head_hash,'part_bytes',1048576);
 insert into public.proctor_recording_commands values(p_tenant,p_actor,p_key,request,result,clock_timestamp());insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'proctor.recording.begin',r.id,jsonb_build_object('session_id',s.id,'pre_clock',true));return result;
end;$$;

create or replace function public.proctor_start_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$declare pol public.proctor_policies;reg public.assessment_registrations;sid uuid;begin
 select * into reg from public.assessment_registrations where id=new.registration_id;perform 1 from public.assessment_exam_windows where id=reg.window_id for update;
 select p.* into pol from public.proctor_policies p join public.proctor_window_policies b on b.policy_id=p.id where b.window_id=reg.window_id;if not found then return new;end if;
 if not exists(select 1 from public.proctor_preparations where registration_id=reg.id and candidate_id=new.candidate_id and policy_id=pol.id) then raise exception 'proctor_consent_required' using errcode='23514';end if;
 if (pol.policy->>'identity_level')::integer=2 then raise exception 'document_liveness_provider_required' using errcode='23514';end if;
 if (pol.policy->>'identity_level')::integer in(1,3) and not exists(select 1 from public.proctor_identity_checks where registration_id=reg.id and level>=(pol.policy->>'identity_level')::integer and public.assessment_has_capability(new.tenant_id,verified_by,'proctor.manage')) then raise exception 'identity_verification_required' using errcode='23514';end if;
 if pol.policy->>'mode' not in('browser','record_review') or coalesce((pol.policy->>'second_camera')::boolean,false) then raise exception 'capture_or_secure_client_required' using errcode='23514';end if;
 if pol.policy->>'mode'='record_review' or exists(select 1 from unnest(array['camera','microphone','screen'])source where coalesce((pol.policy->>source)::boolean,false)) then
  select id into sid from public.proctor_sessions where tenant_id=new.tenant_id and registration_id=reg.id and candidate_id=new.candidate_id and policy_id=pol.id and state='preparing';
  if sid is null or not public.proctor_capture_ready(sid) then raise exception 'capture_readiness_required' using errcode='23514';end if;
 end if;return new;
end;$$;
create or replace function public.proctor_attempt_sync() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$declare pol public.proctor_policies;sid uuid;begin
 if tg_op='INSERT' then
  select p.* into pol from public.proctor_policies p join public.proctor_window_policies b on b.policy_id=p.id join public.assessment_registrations g on g.window_id=b.window_id where g.id=new.registration_id;
  if found then
   select id into sid from public.proctor_sessions where registration_id=new.registration_id and tenant_id=new.tenant_id and state='preparing' for update;
   if found then update public.proctor_sessions set attempt_id=new.id,state='active' where id=sid;update public.proctor_capture_launches set activated_at=clock_timestamp() where session_id=sid;insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(new.tenant_id,new.candidate_id,'proctor.capture.activated',sid,jsonb_build_object('attempt_id',new.id));
   else insert into public.proctor_sessions(tenant_id,attempt_id,candidate_id,policy_id,policy_snapshot) values(new.tenant_id,new.id,new.candidate_id,pol.id,pol.policy) returning id into sid;end if;
   update public.sessions set proctor_session_id=sid where id=new.session_id;
  end if;
 elsif new.state in('submitted','expired') then update public.proctor_sessions set state='completed' where attempt_id=new.id;end if;return new;
end;$$;
alter function public.assessment_command(uuid,uuid,text,text,jsonb) rename to assessment_command_pre_capture;
revoke all on function public.assessment_command_pre_capture(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.assessment_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare reg public.assessment_registrations;pol public.proctor_policies;binding jsonb;s public.proctor_sessions;l public.proctor_capture_launches;begin
 if p_action='attempt.start' then
  select * into reg from public.assessment_registrations where tenant_id=p_tenant and id=(p_data->>'registration_id')::uuid and candidate_id=p_actor for update;if not found then raise exception 'not_found' using errcode='P0002';end if;
  perform 1 from public.assessment_exam_windows where id=reg.window_id for update;
  select p.* into pol from public.proctor_policies p join public.proctor_window_policies b on b.policy_id=p.id where b.window_id=reg.window_id;
  if found and (pol.policy->>'mode'='record_review' or exists(select 1 from unnest(array['camera','microphone','screen'])source where coalesce((pol.policy->>source)::boolean,false))) then
   binding:=p_data->'capture_binding';select * into s from public.proctor_sessions where tenant_id=p_tenant and id=(binding->>'session_id')::uuid and registration_id=reg.id and candidate_id=p_actor for update;
   if not found then raise exception 'capture_device_binding_required' using errcode='42501';end if;
   select * into l from public.proctor_capture_launches where session_id=s.id for update;
   if l.session_id is null or l.device_id is distinct from (binding->>'device_id')::uuid or l.token_hash is distinct from binding->>'token_hash' then raise exception 'capture_device_binding_required' using errcode='42501';end if;
   if not exists(select 1 from public.assessment_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key) and not public.proctor_capture_ready(s.id) then raise exception 'capture_readiness_required' using errcode='23514';end if;
  end if;
 end if;return public.assessment_command_pre_capture(p_actor,p_tenant,p_key,p_action,p_data);
end;$$;
revoke all on function public.proctor_session_registration(),public.proctor_recording_retention_pin(),public.proctor_capture_ready(uuid),public.proctor_capture_read(uuid,uuid,uuid),public.proctor_capture_command(uuid,uuid,text,text,jsonb),public.proctor_recording_command(uuid,uuid,text,text,jsonb),public.assessment_command(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.proctor_capture_read(uuid,uuid,uuid),public.proctor_capture_command(uuid,uuid,text,text,jsonb),public.proctor_recording_command(uuid,uuid,text,text,jsonb),public.assessment_command(uuid,uuid,text,text,jsonb) to service_role;
commit;
