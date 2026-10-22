begin;
-- Live launch is an additive compatible release. Edge admission remains
-- independently default-off. Recording, source consent and clock fences stay.
alter table public.proctor_live_connections add column unavailable_at timestamptz;
create function public.proctor_live_unavailable_stamp() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if old.unavailable_at is not null then
  if new.unavailable_at is distinct from old.unavailable_at then raise exception 'immutable_live_loss_time' using errcode='23514';end if;
 elsif new.state in('closing','closed','faulted') and old.state not in('closing','closed','faulted') then new.unavailable_at:=clock_timestamp();
 elsif new.unavailable_at is distinct from old.unavailable_at then raise exception 'invalid_live_loss_time' using errcode='23514';end if;return new;
end;$$;
create trigger live_unavailable_stamp before update on public.proctor_live_connections for each row execute function public.proctor_live_unavailable_stamp();
alter function public.proctor_capture_fresh_until(uuid) rename to proctor_recording_fresh_until;
create function public.proctor_live_fresh_until(p_session uuid) returns timestamptz language sql stable security definer set search_path=public,pg_temp as $$
 select min(coalesce(
  (select max(c.expires_at) from public.proctor_live_connections c where c.session_id=s.id and c.role='publisher' and c.source=required.source and c.state='active' and public.proctor_live_eligible(c.tenant_id,c.session_id,c.actor_id,c.role,c.source,c.device_id,c.token_hash)),
  (select max(least(c.expires_at,coalesce(c.unavailable_at,c.last_seen_at))) from public.proctor_live_connections c where c.session_id=s.id and c.role='publisher' and c.source=required.source),l.activated_at,s.created_at))
 from public.proctor_sessions s join public.proctor_capture_launches l on l.session_id=s.id
 cross join lateral unnest(array['camera','microphone','screen']) required(source)
 where s.id=p_session and coalesce((s.policy_snapshot->>required.source)::boolean,false);
$$;
create function public.proctor_capture_fresh_until(p_session uuid) returns timestamptz language sql stable security definer set search_path=public,pg_temp as $$
 select case when s.policy_snapshot->>'mode'='live' then least(public.proctor_recording_fresh_until(s.id),public.proctor_live_fresh_until(s.id)) else public.proctor_recording_fresh_until(s.id) end from public.proctor_sessions s where s.id=p_session;
$$;
create function public.proctor_recording_ready(p_session uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.proctor_sessions s where s.id=p_session and s.state in('preparing','active','paused') and public.proctor_recording_fresh_until(s.id)>clock_timestamp());
$$;
create function public.proctor_live_ready(p_session uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.proctor_sessions s where s.id=p_session and s.state in('preparing','active','paused') and (s.policy_snapshot->>'mode'<>'live' or public.proctor_live_fresh_until(s.id)>clock_timestamp()));
$$;
alter function public.proctor_capture_read(uuid,uuid,uuid) rename to proctor_capture_read_pre_live_launch;
create function public.proctor_capture_read(p_actor uuid,p_tenant uuid,p_session uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare result jsonb;mode text;begin
 result:=public.proctor_capture_read_pre_live_launch(p_actor,p_tenant,p_session);
 select policy_snapshot->>'mode' into mode from public.proctor_sessions where id=p_session and tenant_id=p_tenant and candidate_id=p_actor;
 return result||jsonb_build_object('monitoring_mode',mode,'auto_pause',(select coalesce((policy_snapshot->>'auto_pause')::boolean,false) from public.proctor_sessions where id=p_session),'recording_ready',public.proctor_recording_ready(p_session),'live_ready',public.proctor_live_ready(p_session));
end;$$;

-- Preserve the original pre-clock command semantics and receipt namespace;
-- only the now-implemented live browser policy joins supported capture modes.
create or replace function public.proctor_capture_command_pre_watchdog(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare reg public.assessment_registrations;s public.proctor_sessions;l public.proctor_capture_launches;pol public.proctor_policies;prior public.proctor_capture_commands;request jsonb;result jsonb;win public.assessment_exam_windows;
begin
 if p_key is null or length(p_key) not between 8 and 200 or p_action is null or p_action not in('capture.open','capture.heartbeat','capture.cancel') or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'invalid_capture_command' using errcode='22023';end if;
 if p_action='capture.open' then select * into reg from public.assessment_registrations where tenant_id=p_tenant and id=(p_data->>'registration_id')::uuid and candidate_id=p_actor for update;
 else select g.* into reg from public.assessment_registrations g join public.proctor_sessions x on x.registration_id=g.id where x.tenant_id=p_tenant and x.id=(p_data->>'session_id')::uuid and x.candidate_id=p_actor for update of g;end if;
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 select * into win from public.assessment_exam_windows where id=reg.window_id for update;
 select p.* into pol from public.proctor_policies p join public.proctor_window_policies b on b.policy_id=p.id where b.window_id=win.id and b.tenant_id=p_tenant;
 if not found then raise exception 'monitoring_policy_required' using errcode='23514';end if;
 if pol.policy->>'mode' not in('browser','record_review','live') or coalesce((pol.policy->>'second_camera')::boolean,false) or (pol.policy->>'identity_level')::integer=2 then raise exception 'capture_or_secure_client_required' using errcode='23514';end if;
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

create function public.proctor_capture_command_live_gate(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb,p_live_enabled boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare reg public.assessment_registrations;mode text;begin
 if p_action='capture.open' then
  select * into reg from public.assessment_registrations where tenant_id=p_tenant and id=(p_data->>'registration_id')::uuid and candidate_id=p_actor;
  if not found then raise exception 'not_found' using errcode='P0002';end if;
  perform 1 from public.assessment_attempts where tenant_id=p_tenant and registration_id=reg.id for update;
  perform 1 from public.assessment_registrations where id=reg.id for update;
  perform 1 from public.assessment_exam_windows where id=reg.window_id for update;
  select p.policy->>'mode' into mode from public.proctor_policies p join public.proctor_window_policies b on b.policy_id=p.id where b.window_id=reg.window_id and b.tenant_id=p_tenant;
  if mode='live' and not coalesce(p_live_enabled,false) then raise exception 'live_launch_unavailable' using errcode='23514';end if;
 end if;return public.proctor_capture_command(p_actor,p_tenant,p_key,p_action,p_data);
end;$$;

create or replace function public.proctor_start_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$declare pol public.proctor_policies;reg public.assessment_registrations;sid uuid;begin
 select * into reg from public.assessment_registrations where id=new.registration_id;perform 1 from public.assessment_exam_windows where id=reg.window_id for update;
 select p.* into pol from public.proctor_policies p join public.proctor_window_policies b on b.policy_id=p.id where b.window_id=reg.window_id;if not found then return new;end if;
 if not exists(select 1 from public.proctor_preparations where registration_id=reg.id and candidate_id=new.candidate_id and policy_id=pol.id) then raise exception 'proctor_consent_required' using errcode='23514';end if;
 if (pol.policy->>'identity_level')::integer=2 then raise exception 'document_liveness_provider_required' using errcode='23514';end if;
 if (pol.policy->>'identity_level')::integer in(1,3) and not exists(select 1 from public.proctor_identity_checks where registration_id=reg.id and level>=(pol.policy->>'identity_level')::integer and public.assessment_has_capability(new.tenant_id,verified_by,'proctor.manage')) then raise exception 'identity_verification_required' using errcode='23514';end if;
 if pol.policy->>'mode' not in('browser','record_review','live') or coalesce((pol.policy->>'second_camera')::boolean,false) then raise exception 'capture_or_secure_client_required' using errcode='23514';end if;
 if pol.policy->>'mode' in('record_review','live') or exists(select 1 from unnest(array['camera','microphone','screen'])source where coalesce((pol.policy->>source)::boolean,false)) then
  select id into sid from public.proctor_sessions where tenant_id=new.tenant_id and registration_id=reg.id and candidate_id=new.candidate_id and policy_id=pol.id and state='preparing';
  if sid is null or not public.proctor_capture_ready(sid) then raise exception 'capture_readiness_required' using errcode='23514';end if;
 end if;return new;
end;$$;

create function public.assessment_command_live_gate(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb,p_live_enabled boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare reg public.assessment_registrations;mode text;begin
 if p_action='attempt.start' then
  select * into reg from public.assessment_registrations where tenant_id=p_tenant and id=(p_data->>'registration_id')::uuid and candidate_id=p_actor;
  if not found then raise exception 'not_found' using errcode='P0002';end if;
  perform 1 from public.assessment_attempts where tenant_id=p_tenant and registration_id=reg.id for update;
  perform 1 from public.assessment_registrations where id=reg.id for update;
  perform 1 from public.assessment_exam_windows where id=reg.window_id for update;
  select p.policy->>'mode' into mode from public.proctor_policies p join public.proctor_window_policies b on b.policy_id=p.id where b.window_id=reg.window_id and b.tenant_id=p_tenant;
  if mode='live' and not coalesce(p_live_enabled,false) then raise exception 'live_launch_unavailable' using errcode='23514';end if;
 end if;return public.assessment_command(p_actor,p_tenant,p_key,p_action,p_data);
end;$$;

create or replace function public.proctor_capture_enforce(p_tenant uuid,p_attempt uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.assessment_attempts;s public.proctor_sessions;watch public.proctor_capture_watchdogs;
 fresh_until timestamptz;enforce_at timestamptz;closing timestamptz;checked timestamptz:=clock_timestamp();outcome text;reason text;
begin
 select * into a from public.assessment_attempts where id=p_attempt and tenant_id=p_tenant for update;if not found then return;end if;
 select * into watch from public.proctor_capture_watchdogs where attempt_id=a.id;if not found then return;end if;
 select * into s from public.proctor_sessions where id=watch.session_id for update;
 select * into watch from public.proctor_capture_watchdogs where session_id=s.id for update;
 if a.state not in('active','paused') then update public.proctor_capture_watchdogs set next_check_at=null where session_id=s.id;perform public.proctor_capture_schedule(a.id);return;end if;
 fresh_until:=public.proctor_capture_fresh_until(s.id);
 if fresh_until>checked then
  if watch.loss_since is not null then insert into public.assessment_audit_events(tenant_id,actor_id,actor_kind,action,target_id,details) values(p_tenant,null,'system','proctor.capture.restored',s.id,jsonb_build_object('attempt_id',a.id,'generation',watch.generation,'loss_since',watch.loss_since,'source','server_watchdog','automatic_resume',false));end if;
  update public.proctor_capture_watchdogs set loss_since=null,action_at=null,enforced_action=null,next_check_at=case when a.state='active' then case when next_check_at>checked then next_check_at else checked+interval '5 seconds' end else null end where session_id=s.id;
 else
  if watch.loss_since is null then
   watch.loss_since:=coalesce(fresh_until,checked);watch.generation:=watch.generation+1;
   update public.proctor_capture_watchdogs set loss_since=watch.loss_since,generation=watch.generation where session_id=s.id;
   insert into public.assessment_audit_events(tenant_id,actor_id,actor_kind,action,target_id,details) values(p_tenant,null,'system','proctor.capture.loss',s.id,jsonb_build_object('attempt_id',a.id,'generation',watch.generation,'loss_since',watch.loss_since,'source','server_watchdog','monitoring_mode',s.policy_snapshot->>'mode'));
  end if;
  enforce_at:=watch.loss_since+make_interval(secs=>coalesce((s.policy_snapshot->>'recovery_seconds')::integer,10));
  select w.closes_at into closing from public.assessment_registrations r join public.assessment_exam_windows w on w.id=r.window_id where r.id=a.registration_id;
  if a.state='active' and watch.enforced_action is null and checked>=enforce_at and enforce_at<least(a.deadline_at,a.section_deadline_at,closing) then
   outcome:=case when coalesce((s.policy_snapshot->>'auto_pause')::boolean,false) then 'paused' else 'warning' end;
   reason:=case when s.policy_snapshot->>'mode'='live' then case when outcome='paused' then 'Required live monitoring or recording stopped reaching the service beyond the recovery window. Restore both and ask an institution proctor to resume.' else 'Required live monitoring or recording stopped reaching the service beyond the recovery window. The institution policy allows the exam to continue with a warning.' end else case when outcome='paused' then 'Required recording stopped reaching the service beyond the recovery window. Restore recording and ask an institution proctor to resume.' else 'Required recording stopped reaching the service beyond the recovery window. The institution policy allows the exam to continue with a warning.' end end;
   if outcome='paused' then update public.proctor_sessions set state='paused',paused_at=enforce_at where id=s.id;update public.assessment_attempts set state='paused' where id=a.id;update public.sessions set status='paused',paused_at=enforce_at where id=a.session_id;a.state:='paused';end if;
   update public.proctor_capture_watchdogs set action_at=enforce_at,enforced_action=outcome where session_id=s.id;
   insert into public.assessment_audit_events(tenant_id,actor_id,actor_kind,action,target_id,details) values(p_tenant,null,'system','proctor.capture.'||outcome,s.id,jsonb_build_object('attempt_id',a.id,'generation',watch.generation,'loss_since',watch.loss_since,'effective_at',enforce_at,'source','server_watchdog','reason',reason));
   insert into public.proctor_candidate_notices(tenant_id,session_id,kind,reason,issued_by,issuer_kind) values(p_tenant,s.id,outcome,reason,null,'system');watch.enforced_action:=outcome;
  end if;
  update public.proctor_capture_watchdogs set next_check_at=case when a.state='active' then least(case when next_check_at>checked then next_check_at else checked+interval '5 seconds' end,case when watch.enforced_action is null and enforce_at>checked then enforce_at else checked+interval '5 seconds' end) else null end where session_id=s.id;
 end if;perform public.proctor_capture_schedule(a.id);
end;$$;

-- Ordering is attempt -> monitoring session -> live connection. Enforcement
-- precedes all lease/publication refreshes so a crossed cutoff cannot vanish.
create function public.proctor_live_enforce(p_tenant uuid,p_attempt uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare a public.assessment_attempts;closing timestamptz;begin
 select * into a from public.assessment_attempts where tenant_id=p_tenant and id=p_attempt for update;if not found then return;end if;
 select w.closes_at into closing from public.assessment_registrations r join public.assessment_exam_windows w on w.id=r.window_id where r.id=a.registration_id;
 if (a.state='active' and clock_timestamp()>=least(a.deadline_at,a.section_deadline_at,closing)) or(a.state='paused' and clock_timestamp()>=closing) then perform public.assessment_runtime_expire(p_tenant,p_attempt);
 else perform public.proctor_capture_enforce(p_tenant,p_attempt);end if;
end;$$;
alter function public.proctor_live_command(uuid,uuid,text,text,jsonb) rename to proctor_live_command_pre_launch;
create function public.proctor_live_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare aid uuid;result jsonb;begin
 if p_action='connection.open' then select attempt_id into aid from public.proctor_sessions where tenant_id=p_tenant and id=(p_data->>'session_id')::uuid;
 else select s.attempt_id into aid from public.proctor_sessions s join public.proctor_live_connections c on c.session_id=s.id where c.tenant_id=p_tenant and c.id=(p_data->>'id')::uuid and c.actor_id=p_actor;end if;
 if aid is not null then perform public.proctor_live_enforce(p_tenant,aid);end if;
 result:=public.proctor_live_command_pre_launch(p_actor,p_tenant,p_key,p_action,p_data);
 if aid is not null then perform public.proctor_live_enforce(p_tenant,aid);end if;return result;
end;$$;
alter function public.proctor_live_context(uuid,uuid,uuid,boolean) rename to proctor_live_context_pre_launch;
create function public.proctor_live_context(p_tenant uuid,p_id uuid,p_actor uuid default null,p_touch boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare aid uuid;result jsonb;begin
 select s.attempt_id into aid from public.proctor_sessions s join public.proctor_live_connections c on c.session_id=s.id where c.tenant_id=p_tenant and c.id=p_id and (p_actor is null or c.actor_id=p_actor);
 if aid is not null then perform public.proctor_live_enforce(p_tenant,aid);end if;
 result:=public.proctor_live_context_pre_launch(p_tenant,p_id,p_actor,p_touch);
 if aid is not null then perform public.proctor_live_enforce(p_tenant,aid);end if;return result;
end;$$;
alter function public.proctor_live_report(uuid,uuid,text,jsonb) rename to proctor_live_report_pre_launch;
create function public.proctor_live_report(p_tenant uuid,p_id uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare aid uuid;result jsonb;begin
 select s.attempt_id into aid from public.proctor_sessions s join public.proctor_live_connections c on c.session_id=s.id where c.tenant_id=p_tenant and c.id=p_id;
 if aid is not null then perform public.proctor_live_enforce(p_tenant,aid);end if;
 result:=public.proctor_live_report_pre_launch(p_tenant,p_id,p_action,p_data);
 if aid is not null then perform public.proctor_live_enforce(p_tenant,aid);end if;return result;
end;$$;

create or replace function public.proctor_live_eligible(p_tenant uuid,p_session uuid,p_actor uuid,p_role text,p_source text,p_device uuid default null,p_token text default null) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.proctor_sessions s join public.proctor_preparations prep on prep.tenant_id=s.tenant_id and prep.registration_id=s.registration_id and prep.candidate_id=s.candidate_id and prep.policy_id=s.policy_id
 join public.assessment_registrations g on g.id=s.registration_id join public.assessment_exam_windows w on w.id=g.window_id
 where s.tenant_id=p_tenant and s.id=p_session and s.state in('preparing','active','paused') and s.policy_snapshot->>'mode'='live' and coalesce((s.policy_snapshot->>p_source)::boolean,false)
 and w.opens_at<=clock_timestamp() and w.closes_at>clock_timestamp()
 and(s.attempt_id is null or exists(select 1 from public.assessment_attempts a where a.id=s.attempt_id and a.state in('active','paused') and(a.state='paused' or least(a.deadline_at,a.section_deadline_at)>clock_timestamp())))
 and p_source in('camera','microphone','screen') and not coalesce((s.policy_snapshot->>'second_camera')::boolean,false)
 and(case when p_role='publisher' then s.candidate_id=p_actor and exists(select 1 from public.proctor_capture_launches l where l.tenant_id=p_tenant and l.session_id=s.id and l.device_id=p_device and l.token_hash=p_token and l.expires_at>clock_timestamp())
 when p_role='viewer' then s.candidate_id<>p_actor and public.assessment_has_capability(p_tenant,p_actor,'proctor.observe') and public.proctor_can_access(p_tenant,s.id,p_actor,'observer') else false end));
$$;

revoke all on function public.proctor_live_unavailable_stamp(),public.proctor_recording_fresh_until(uuid),public.proctor_live_fresh_until(uuid),public.proctor_capture_fresh_until(uuid),public.proctor_recording_ready(uuid),public.proctor_live_ready(uuid),public.proctor_capture_read_pre_live_launch(uuid,uuid,uuid),public.proctor_capture_command_pre_watchdog(uuid,uuid,text,text,jsonb),public.proctor_live_command_pre_launch(uuid,uuid,text,text,jsonb),public.proctor_live_context_pre_launch(uuid,uuid,uuid,boolean),public.proctor_live_report_pre_launch(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.proctor_live_enforce(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.proctor_capture_read(uuid,uuid,uuid),public.proctor_capture_command_live_gate(uuid,uuid,text,text,jsonb,boolean),public.assessment_command_live_gate(uuid,uuid,text,text,jsonb,boolean),public.proctor_live_command(uuid,uuid,text,text,jsonb),public.proctor_live_context(uuid,uuid,uuid,boolean),public.proctor_live_report(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.proctor_capture_read(uuid,uuid,uuid),public.proctor_capture_command_live_gate(uuid,uuid,text,text,jsonb,boolean),public.assessment_command_live_gate(uuid,uuid,text,text,jsonb,boolean),public.proctor_live_command(uuid,uuid,text,text,jsonb),public.proctor_live_context(uuid,uuid,uuid,boolean),public.proctor_live_report(uuid,uuid,text,jsonb) to service_role;
commit;
