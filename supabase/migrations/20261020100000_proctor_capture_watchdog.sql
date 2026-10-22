begin;
-- System enforcement must not impersonate the candidate or an institution proctor.
alter table public.assessment_audit_events alter column actor_id drop not null;
alter table public.assessment_audit_events add column actor_kind text not null default 'user'
 check(actor_kind in('user','system'));
alter table public.assessment_audit_events add check((actor_kind='system' and actor_id is null) or (actor_kind='user' and actor_id is not null));
alter table public.proctor_candidate_notices alter column issued_by drop not null;
alter table public.proctor_candidate_notices add column issuer_kind text not null default 'user'
 check(issuer_kind in('user','system'));
alter table public.proctor_candidate_notices add check((issuer_kind='system' and issued_by is null) or (issuer_kind='user' and issued_by is not null));

create table public.proctor_capture_watchdogs(
 session_id uuid primary key,tenant_id uuid not null,attempt_id uuid not null unique,
 generation integer not null default 0,loss_since timestamptz,action_at timestamptz,
 enforced_action text check(enforced_action in('warning','paused')),next_check_at timestamptz,
 foreign key(tenant_id,session_id) references public.proctor_sessions(tenant_id,id),
 foreign key(tenant_id,attempt_id) references public.assessment_attempts(tenant_id,id),
 check((enforced_action is null)=(action_at is null)),check(loss_since is not null or enforced_action is null)
);
alter table public.proctor_capture_watchdogs enable row level security;
revoke all on public.proctor_capture_watchdogs from public,anon,authenticated,service_role;
create index proctor_capture_fresh_media on public.proctor_recording_segments(recording_id,committed_at desc)
 where kind='media' and state='committed';

-- A transport receipt is not scene/liveness attestation. Only committed media,
-- never reservations, gaps, heartbeats or replayed receipts, renews a source.
create function public.proctor_capture_fresh_until(p_session uuid) returns timestamptz
language sql stable security definer set search_path=public,pg_temp as $$
 select least(l.expires_at,min(coalesce(
  (select max(least(r.expires_at,g.committed_at+interval '20 seconds'))
   from public.proctor_recordings r cross join lateral
    (select committed_at from public.proctor_recording_segments where recording_id=r.id and kind='media' and state='committed' order by committed_at desc limit 1) g
   where r.session_id=s.id and r.source=required.source and r.state='open'),
  (select max(r.sealed_at) from public.proctor_recordings r where r.session_id=s.id and r.source=required.source),
  l.activated_at,s.created_at)))
 from public.proctor_sessions s join public.proctor_capture_launches l on l.session_id=s.id
 cross join lateral unnest(array['camera','microphone','screen']) required(source)
 where s.id=p_session and coalesce((s.policy_snapshot->>required.source)::boolean,false)
 group by l.expires_at;
$$;
create or replace function public.proctor_capture_ready(p_session uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.proctor_sessions s where s.id=p_session and s.state in('preparing','active','paused')
 and public.proctor_capture_fresh_until(s.id)>clock_timestamp());
$$;

-- This same schedule survives a closed tab and a never-created Durable Object.
-- Existing cron/Queue recovery is the fallback to the per-attempt DO alarm.
create function public.proctor_capture_schedule(p_attempt uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.assessment_attempts;due timestamptz;closing timestamptz;capture_due timestamptz;
begin
 select * into a from public.assessment_attempts where id=p_attempt;
 select w.closes_at into closing from public.assessment_registrations r join public.assessment_exam_windows w on w.id=r.window_id where r.id=a.registration_id;
 select next_check_at into capture_due from public.proctor_capture_watchdogs where attempt_id=a.id;
 due:=case when a.state='active' then least(a.deadline_at,a.section_deadline_at,closing,capture_due) when a.state='paused' then closing else null end;
 insert into public.assessment_runtime_schedule(tenant_id,attempt_id,due_at) values(a.tenant_id,a.id,due)
 on conflict(attempt_id) do update set due_at=excluded.due_at,revision=assessment_runtime_schedule.revision+1,
  lease_token=null,leased_until=null,dispatch_attempts=0,updated_at=clock_timestamp()
 where assessment_runtime_schedule.due_at is distinct from excluded.due_at;
end;$$;
create or replace function public.assessment_runtime_schedule_refresh() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$begin
 perform public.proctor_capture_schedule(new.id);return new;
end;$$;
create function public.proctor_capture_watch_activation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$declare s public.proctor_sessions;begin
 if new.activated_at is not null then
  select * into s from public.proctor_sessions where id=new.session_id;
  insert into public.proctor_capture_watchdogs(session_id,tenant_id,attempt_id,next_check_at)
   values(s.id,s.tenant_id,s.attempt_id,clock_timestamp()+interval '5 seconds') on conflict do nothing;
  perform public.proctor_capture_schedule(s.attempt_id);
 end if;return new;
end;$$;
create trigger capture_watch_activation after update of activated_at on public.proctor_capture_launches
 for each row execute function public.proctor_capture_watch_activation();

create function public.proctor_capture_enforce(p_tenant uuid,p_attempt uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.assessment_attempts;s public.proctor_sessions;watch public.proctor_capture_watchdogs;
 fresh_until timestamptz;enforce_at timestamptz;closing timestamptz;checked timestamptz:=clock_timestamp();outcome text;reason text;
begin
 -- Every runtime/evidence path takes attempt -> monitoring -> watchdog locks.
 select * into a from public.assessment_attempts where id=p_attempt and tenant_id=p_tenant for update;
 if not found then return;end if;
 select * into watch from public.proctor_capture_watchdogs where attempt_id=a.id;
 if not found then return;end if;
 select * into s from public.proctor_sessions where id=watch.session_id for update;
 select * into watch from public.proctor_capture_watchdogs where session_id=s.id for update;
 if a.state not in('active','paused') then
  update public.proctor_capture_watchdogs set next_check_at=null where session_id=s.id;
  perform public.proctor_capture_schedule(a.id);return;
 end if;
 fresh_until:=public.proctor_capture_fresh_until(s.id);
 if fresh_until>checked then
  if watch.loss_since is not null then
   insert into public.assessment_audit_events(tenant_id,actor_id,actor_kind,action,target_id,details)
    values(p_tenant,null,'system','proctor.capture.restored',s.id,jsonb_build_object('attempt_id',a.id,'generation',watch.generation,'loss_since',watch.loss_since,'source','server_watchdog','automatic_resume',false));
  end if;
  update public.proctor_capture_watchdogs set loss_since=null,action_at=null,enforced_action=null,
   next_check_at=case when a.state='active' then case when next_check_at>checked then next_check_at else checked+interval '5 seconds' end else null end where session_id=s.id;
 else
  if watch.loss_since is null then
   watch.loss_since:=coalesce(fresh_until,checked);watch.generation:=watch.generation+1;
   update public.proctor_capture_watchdogs set loss_since=watch.loss_since,generation=watch.generation where session_id=s.id;
   insert into public.assessment_audit_events(tenant_id,actor_id,actor_kind,action,target_id,details)
    values(p_tenant,null,'system','proctor.capture.loss',s.id,jsonb_build_object('attempt_id',a.id,'generation',watch.generation,'loss_since',watch.loss_since,'source','server_watchdog'));
  end if;
  enforce_at:=watch.loss_since+make_interval(secs=>coalesce((s.policy_snapshot->>'recovery_seconds')::integer,10));
  select w.closes_at into closing from public.assessment_registrations r join public.assessment_exam_windows w on w.id=r.window_id where r.id=a.registration_id;
  -- Earlier academic deadlines still win. Delayed workers must not add time by
  -- recording a late observed pause instead of the policy's effective cutoff.
  if a.state='active' and watch.enforced_action is null and checked>=enforce_at and enforce_at<least(a.deadline_at,a.section_deadline_at,closing) then
   outcome:=case when coalesce((s.policy_snapshot->>'auto_pause')::boolean,false) then 'paused' else 'warning' end;
   reason:=case when outcome='paused' then 'Required recording stopped reaching the service beyond the recovery window. Restore recording and ask an institution proctor to resume.' else 'Required recording stopped reaching the service beyond the recovery window. The institution policy allows the exam to continue with a warning.' end;
   if outcome='paused' then
    update public.proctor_sessions set state='paused',paused_at=enforce_at where id=s.id;
    update public.assessment_attempts set state='paused' where id=a.id;
    update public.sessions set status='paused',paused_at=enforce_at where id=a.session_id;
    a.state:='paused';
   end if;
   update public.proctor_capture_watchdogs set action_at=enforce_at,enforced_action=outcome where session_id=s.id;
   insert into public.assessment_audit_events(tenant_id,actor_id,actor_kind,action,target_id,details)
    values(p_tenant,null,'system','proctor.capture.'||outcome,s.id,jsonb_build_object('attempt_id',a.id,'generation',watch.generation,'loss_since',watch.loss_since,'effective_at',enforce_at,'source','server_watchdog','reason',reason));
   insert into public.proctor_candidate_notices(tenant_id,session_id,kind,reason,issued_by,issuer_kind)
    values(p_tenant,s.id,outcome,reason,null,'system');
   watch.enforced_action:=outcome;
  end if;
  update public.proctor_capture_watchdogs set next_check_at=case when a.state='active' then
   least(case when next_check_at>checked then next_check_at else checked+interval '5 seconds' end,
    case when watch.enforced_action is null and enforce_at>checked then enforce_at else checked+interval '5 seconds' end) else null end where session_id=s.id;
 end if;
 perform public.proctor_capture_schedule(a.id);
end;$$;

alter function public.assessment_runtime_snapshot(uuid,uuid,uuid) rename to assessment_runtime_snapshot_pre_watchdog;
alter function public.assessment_runtime_snapshot_pre_watchdog(uuid,uuid,uuid) volatile;
create function public.assessment_runtime_snapshot(p_tenant uuid,p_attempt uuid,p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$declare result jsonb;watch public.proctor_capture_watchdogs;begin
 if not exists(select 1 from public.assessment_attempts where tenant_id=p_tenant and id=p_attempt and (p_actor is null or candidate_id=p_actor)) then raise exception 'not_found' using errcode='P0002';end if;
 perform public.proctor_capture_enforce(p_tenant,p_attempt);
 result:=public.assessment_runtime_snapshot_pre_watchdog(p_tenant,p_attempt,p_actor);
 select * into watch from public.proctor_capture_watchdogs where attempt_id=p_attempt;
 if found then
  result:=result||jsonb_build_object('capture',jsonb_build_object('session_id',watch.session_id,'ready',public.proctor_capture_ready(watch.session_id),'loss_since',watch.loss_since,'action',watch.enforced_action,'next_check_at',watch.next_check_at));
  if result->>'state'='active' then result:=jsonb_set(result,'{next_deadline_at}',to_jsonb(least((result->>'next_deadline_at')::timestamptz,watch.next_check_at)));end if;
 end if;return result;
end;$$;
alter function public.assessment_runtime_expire(uuid,uuid) rename to assessment_runtime_expire_pre_watchdog;
create function public.assessment_runtime_expire(p_tenant uuid,p_attempt uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$begin
 perform public.proctor_capture_enforce(p_tenant,p_attempt);
 perform public.assessment_runtime_expire_pre_watchdog(p_tenant,p_attempt);
 return public.assessment_runtime_snapshot(p_tenant,p_attempt);
end;$$;

alter function public.assessment_runtime_command(uuid,uuid,text,text,jsonb) rename to assessment_runtime_command_pre_watchdog;
create function public.assessment_runtime_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$declare a public.assessment_attempts;lease public.assessment_attempt_leases;snapshot jsonb;result jsonb;begin
 select * into a from public.assessment_attempts where tenant_id=p_tenant and id=(p_data->>'attempt_id')::uuid and candidate_id=p_actor for update;
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 if p_action in('response.append','section.advance','attempt.submit') and not exists(select 1 from public.assessment_runtime_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key) then
  select * into lease from public.assessment_attempt_leases where attempt_id=a.id for update;
  if lease.attempt_id is null or lease.expires_at<=clock_timestamp() or (p_data#>>'{lease,device_id}')::uuid is distinct from lease.device_id or p_data#>>'{lease,token_hash}' is distinct from lease.token_hash or (p_data#>>'{lease,epoch}')::bigint is distinct from lease.epoch then raise exception 'device_lease_invalid' using errcode='42501';end if;
  snapshot:=public.assessment_runtime_snapshot(p_tenant,a.id,p_actor);
  if snapshot->>'state'='paused' and snapshot#>>'{capture,action}'='paused' then
   -- Return a non-receipt rejection so the pause commits. The HTTP repository
   -- turns this into 422; neither DO nor candidate may acknowledge the answer.
   return jsonb_build_object('rejected','capture_continuity_required','snapshot',snapshot);
  end if;
 end if;
 result:=public.assessment_runtime_command_pre_watchdog(p_actor,p_tenant,p_key,p_action,p_data);
 return result||jsonb_build_object('snapshot',public.assessment_runtime_snapshot(p_tenant,a.id,p_actor));
end;$$;

-- Run before a heartbeat or a new receipt can erase an already crossed cutoff.
-- All real evidence calls already lock the owning attempt before session/stream.
alter function public.proctor_recording_transport(uuid,uuid,text,jsonb) rename to proctor_recording_transport_pre_watchdog;
create function public.proctor_recording_transport(p_actor uuid,p_tenant uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$declare s public.proctor_sessions;result jsonb;begin
 if p_action<>'segment.read' then
  select x.* into s from public.proctor_sessions x join public.proctor_recordings r on r.session_id=x.id where r.tenant_id=p_tenant and r.id=(p_data->>'recording_id')::uuid and x.candidate_id=p_actor;
  if not found then raise exception 'not_found' using errcode='P0002';end if;
  perform public.proctor_recording_candidate(p_actor,p_tenant,s.id);
  perform public.proctor_capture_enforce(p_tenant,s.attempt_id);
 end if;
 result:=public.proctor_recording_transport_pre_watchdog(p_actor,p_tenant,p_action,p_data);
 if p_action<>'segment.read' then perform public.proctor_capture_enforce(p_tenant,s.attempt_id);end if;return result;
end;$$;

alter function public.proctor_capture_command(uuid,uuid,text,text,jsonb) rename to proctor_capture_command_pre_watchdog;
create function public.proctor_capture_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$declare aid uuid;result jsonb;begin
 select a.id into aid from public.assessment_attempts a join public.proctor_sessions s on s.attempt_id=a.id
 where s.tenant_id=p_tenant and s.candidate_id=p_actor and (s.id=(p_data->>'session_id')::uuid or s.registration_id=(p_data->>'registration_id')::uuid) for update of a;
 if aid is not null then perform public.proctor_capture_enforce(p_tenant,aid);end if;
 result:=public.proctor_capture_command_pre_watchdog(p_actor,p_tenant,p_key,p_action,p_data);
 if aid is not null then perform public.proctor_capture_enforce(p_tenant,aid);end if;return result;
end;$$;

-- Restarting a missing source while paused is necessary before a human resume.
-- This shares the existing stable recording receipt namespace and all bounds.
alter function public.proctor_recording_command(uuid,uuid,text,text,jsonb) rename to proctor_recording_command_pre_watchdog;
create function public.proctor_recording_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$declare s public.proctor_sessions;prior public.proctor_recording_commands;request jsonb;result jsonb;r public.proctor_recordings;begin
 if p_action='recording.begin' then s:=public.proctor_recording_candidate(p_actor,p_tenant,(p_data->>'session_id')::uuid);
 else select x.* into s from public.proctor_sessions x join public.proctor_recordings rec on rec.session_id=x.id where rec.tenant_id=p_tenant and rec.id=(p_data->>'recording_id')::uuid and x.candidate_id=p_actor;
  if s.id is not null then perform public.proctor_recording_candidate(p_actor,p_tenant,s.id);end if;
 end if;
 if s.id is not null then perform public.proctor_capture_enforce(p_tenant,s.attempt_id);end if;
 select * into s from public.proctor_sessions where id=s.id;
 if p_action='recording.begin' and s.state='paused' and exists(select 1 from public.proctor_capture_launches where session_id=s.id) then
  if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
  request:=jsonb_build_object('action',p_action,'data',p_data);perform pg_advisory_xact_lock(hashtextextended('proctor-recording:'||p_tenant::text||p_actor::text||p_key,0));
  select * into prior from public.proctor_recording_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
  if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
  if not exists(select 1 from public.proctor_capture_launches where session_id=s.id and expires_at>clock_timestamp()) then raise exception 'capture_lease_expired' using errcode='23514';end if;
  if not exists(select 1 from public.proctor_preparations where registration_id=s.registration_id and candidate_id=p_actor and policy_id=s.policy_id) then raise exception 'proctor_consent_required' using errcode='23514';end if;
  if p_data->>'source' is null or p_data->>'source' not in('camera','microphone','screen') or coalesce((s.policy_snapshot->>(p_data->>'source'))::boolean,false) is not true or p_data->>'mime' is null or p_data->>'mime' not in('video/webm','video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm;codecs=vp8','video/webm;codecs=vp9','video/mp4','audio/webm','audio/webm;codecs=opus','audio/mp4') or ((p_data->>'source'='microphone') is distinct from (p_data->>'mime' like 'audio/%')) then raise exception 'recording_source_not_permitted' using errcode='22023';end if;
  if (select count(*) from public.proctor_recordings where session_id=s.id)>=64 then raise exception 'recording_restart_limit' using errcode='23514';end if;
  insert into public.proctor_recordings(id,tenant_id,session_id,candidate_id,source,mime) values((p_data->>'recording_id')::uuid,p_tenant,s.id,p_actor,p_data->>'source',p_data->>'mime') returning * into r;
  result:=jsonb_build_object('id',r.id,'state',r.state,'sequence',0,'head_hash',r.head_hash,'part_bytes',1048576);
  insert into public.proctor_recording_commands values(p_tenant,p_actor,p_key,request,result,clock_timestamp());
  insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'proctor.recording.begin',r.id,jsonb_build_object('session_id',s.id,'paused_recovery',true));
 else result:=public.proctor_recording_command_pre_watchdog(p_actor,p_tenant,p_key,p_action,p_data);end if;
 if s.id is not null then perform public.proctor_capture_enforce(p_tenant,s.attempt_id);end if;return result;
end;$$;
create function public.proctor_capture_resume_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 if old.state='paused' and new.state='active' and exists(select 1 from public.proctor_capture_launches where session_id=old.id) and not public.proctor_capture_ready(old.id) then raise exception 'capture_readiness_required' using errcode='23514';end if;return new;
end;$$;
create trigger capture_resume_guard before update of state on public.proctor_sessions for each row execute function public.proctor_capture_resume_guard();

-- Upgrade already active capture history as well as newly prepared sessions.
insert into public.proctor_capture_watchdogs(session_id,tenant_id,attempt_id,next_check_at)
 select s.id,s.tenant_id,s.attempt_id,case when s.state='active' then clock_timestamp()+interval '5 seconds' else null end
 from public.proctor_sessions s join public.proctor_capture_launches l on l.session_id=s.id where s.attempt_id is not null on conflict do nothing;
do $$declare a uuid;begin for a in select attempt_id from public.proctor_capture_watchdogs loop perform public.proctor_capture_schedule(a);end loop;end;$$;

revoke all on function public.proctor_capture_fresh_until(uuid),public.proctor_capture_schedule(uuid),public.proctor_capture_watch_activation(),public.proctor_capture_enforce(uuid,uuid),public.proctor_capture_resume_guard(),public.assessment_runtime_snapshot_pre_watchdog(uuid,uuid,uuid),public.assessment_runtime_expire_pre_watchdog(uuid,uuid),public.assessment_runtime_command_pre_watchdog(uuid,uuid,text,text,jsonb),public.proctor_recording_transport_pre_watchdog(uuid,uuid,text,jsonb),public.proctor_capture_command_pre_watchdog(uuid,uuid,text,text,jsonb),public.proctor_recording_command_pre_watchdog(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.assessment_runtime_snapshot(uuid,uuid,uuid),public.assessment_runtime_expire(uuid,uuid),public.assessment_runtime_command(uuid,uuid,text,text,jsonb),public.proctor_recording_transport(uuid,uuid,text,jsonb),public.proctor_capture_command(uuid,uuid,text,text,jsonb),public.proctor_recording_command(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.assessment_runtime_snapshot(uuid,uuid,uuid),public.assessment_runtime_expire(uuid,uuid),public.assessment_runtime_command(uuid,uuid,text,text,jsonb),public.proctor_recording_transport(uuid,uuid,text,jsonb),public.proctor_capture_command(uuid,uuid,text,text,jsonb),public.proctor_recording_command(uuid,uuid,text,text,jsonb) to service_role;
commit;
