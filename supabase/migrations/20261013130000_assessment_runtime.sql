begin;
create table public.assessment_attempt_leases (
 tenant_id uuid not null, attempt_id uuid primary key, device_id uuid not null,
 token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'), epoch bigint not null check(epoch>0),
 expires_at timestamptz not null, last_heartbeat_at timestamptz not null default clock_timestamp(),
 foreign key(tenant_id,attempt_id) references public.assessment_attempts(tenant_id,id)
);
create table public.assessment_runtime_commands (
 tenant_id uuid not null, actor_id uuid not null, idempotency_key text not null,
 request jsonb not null, result jsonb not null, created_at timestamptz not null default clock_timestamp(),
 primary key(tenant_id,actor_id,idempotency_key)
);
alter table public.assessment_attempt_leases enable row level security;
alter table public.assessment_runtime_commands enable row level security;
revoke all on public.assessment_attempt_leases,public.assessment_runtime_commands from anon,authenticated;
grant all on public.assessment_attempt_leases,public.assessment_runtime_commands to service_role;

-- Candidate mutations have exactly one public authority path. Existing authoring commands remain unchanged.
alter function public.assessment_command(uuid,uuid,text,text,jsonb) rename to assessment_control_command;
revoke all on function public.assessment_control_command(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.assessment_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_action in ('response.append','section.advance','attempt.submit') then raise exception 'coordinator_required' using errcode='42501';end if;
 return public.assessment_control_command(p_actor,p_tenant,p_key,p_action,p_data);
end; $$;
revoke all on function public.assessment_command(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.assessment_command(uuid,uuid,text,text,jsonb) to service_role;

create function public.assessment_runtime_snapshot(p_tenant uuid,p_attempt uuid,p_actor uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare att public.assessment_attempts; closing timestamptz; lease public.assessment_attempt_leases;
begin
 select * into att from public.assessment_attempts where tenant_id=p_tenant and id=p_attempt;
 if not found or (p_actor is not null and att.candidate_id<>p_actor) then raise exception 'not_found' using errcode='P0002';end if;
 select w.closes_at into closing from public.assessment_registrations r join public.assessment_exam_windows w on w.id=r.window_id where r.id=att.registration_id;
 select * into lease from public.assessment_attempt_leases where attempt_id=att.id;
 return jsonb_build_object('attempt_id',att.id,'state',att.state,'deadline_at',att.deadline_at,'section_deadline_at',att.section_deadline_at,'closes_at',closing,'section_index',att.section_index,'last_sequence',att.last_sequence,'lease_epoch',lease.epoch,'lease_expires_at',lease.expires_at,'server_time',clock_timestamp(),
  'next_deadline_at',case when att.state='active' then least(att.deadline_at,att.section_deadline_at,closing) when att.state='paused' then closing else null end);
end; $$;

create function public.assessment_runtime_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare att public.assessment_attempts; lease public.assessment_attempt_leases; prior public.assessment_runtime_commands;
 request jsonb; result jsonb; device uuid; token text; provided jsonb; epoch_value bigint;
begin
 if p_actor is null or not exists(select 1 from public.users where id=p_actor) then raise exception 'unauthorized' using errcode='42501';end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 if p_action not in ('lease.acquire','lease.renew','lease.release','response.append','section.advance','attempt.submit') then raise exception 'unknown_action' using errcode='22023';end if;
 select * into att from public.assessment_attempts where id=(p_data->>'attempt_id')::uuid and tenant_id=p_tenant and candidate_id=p_actor for update;
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 request:=jsonb_build_object('action',p_action,'data',p_data-'lease');
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||'runtime'||p_key,0));
 select * into prior from public.assessment_runtime_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return jsonb_build_object('result',prior.result,'snapshot',public.assessment_runtime_snapshot(p_tenant,att.id,p_actor));end if;
 select * into lease from public.assessment_attempt_leases where attempt_id=att.id for update;
 if p_action='lease.acquire' then
  if att.state not in ('active','paused') then raise exception 'attempt_finalized' using errcode='23514';end if;
  device:=(p_data->>'device_id')::uuid;token:=p_data->>'token_hash';
  if device is null or token is null or token !~ '^[a-f0-9]{64}$' then raise exception 'invalid_device_lease' using errcode='22023';end if;
  if lease.attempt_id is not null and lease.expires_at>clock_timestamp() and (lease.device_id is distinct from device or lease.token_hash is distinct from token) then raise exception 'device_lease_active' using errcode='23505';end if;
  epoch_value:=case when lease.attempt_id is null then 1 when lease.expires_at>clock_timestamp() then lease.epoch else lease.epoch+1 end;
  insert into public.assessment_attempt_leases(tenant_id,attempt_id,device_id,token_hash,epoch,expires_at)
   values(p_tenant,att.id,device,token,epoch_value,clock_timestamp()+interval '60 seconds')
   on conflict(attempt_id) do update set device_id=excluded.device_id,token_hash=excluded.token_hash,epoch=excluded.epoch,expires_at=excluded.expires_at,last_heartbeat_at=clock_timestamp();
  result:=jsonb_build_object('epoch',epoch_value,'device_id',device);
 else
  provided:=p_data->'lease';
  if lease.attempt_id is null or lease.expires_at<=clock_timestamp() or (provided->>'device_id')::uuid is distinct from lease.device_id or provided->>'token_hash' is distinct from lease.token_hash or (provided->>'epoch')::bigint is distinct from lease.epoch then raise exception 'device_lease_invalid' using errcode='42501';end if;
  if p_action in ('lease.renew','lease.release') then
   if p_action='lease.renew' and att.state not in ('active','paused') then raise exception 'attempt_finalized' using errcode='23514';end if;
   update public.assessment_attempt_leases set expires_at=case when p_action='lease.release' then clock_timestamp() else clock_timestamp()+interval '60 seconds' end,last_heartbeat_at=clock_timestamp() where attempt_id=att.id;
   result:=jsonb_build_object('epoch',lease.epoch,'released',p_action='lease.release');
  else
   result:=public.assessment_control_command(p_actor,p_tenant,p_key,p_action,p_data-'lease');
  end if;
 end if;
 insert into public.assessment_runtime_commands values(p_tenant,p_actor,p_key,request,result,clock_timestamp());
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'runtime.'||p_action,att.id,jsonb_build_object('device_id',coalesce(device,lease.device_id),'epoch',coalesce(epoch_value,lease.epoch)));
 return jsonb_build_object('result',result,'snapshot',public.assessment_runtime_snapshot(p_tenant,att.id,p_actor));
end; $$;

-- Alarm and reconciliation calls use the same canonical clock; repeated invocations have no extra effect.
create function public.assessment_runtime_expire(p_tenant uuid,p_attempt uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare att public.assessment_attempts; manifest jsonb; reg public.assessment_registrations; closing timestamptz; duration integer; due timestamptz;
begin
 select * into att from public.assessment_attempts where tenant_id=p_tenant and id=p_attempt for update;
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 select * into reg from public.assessment_registrations where id=att.registration_id;
 select closes_at into closing from public.assessment_exam_windows where id=reg.window_id;
 if att.state in ('submitted','expired') then return public.assessment_runtime_snapshot(p_tenant,att.id);end if;
 if clock_timestamp()>=closing or (att.state='active' and clock_timestamp()>=att.deadline_at) then
  due:=least(att.deadline_at,closing);
 elsif att.state='active' and clock_timestamp()>=att.section_deadline_at then
  select f.manifest into manifest from public.assessment_forms f where f.id=att.form_id;
  while att.state='active' and clock_timestamp()>=att.section_deadline_at loop
   if att.section_index+1>=jsonb_array_length(manifest->'sections') then due:=att.section_deadline_at;exit;end if;
   duration:=coalesce((manifest->'sections'->(att.section_index+1)->>'duration_seconds')::integer,(manifest->>'duration_seconds')::integer);
   duration:=duration+floor(reg.extra_seconds*duration::numeric/(manifest->>'duration_seconds')::integer)::integer;
   update public.assessment_attempts set section_index=section_index+1,section_deadline_at=least(deadline_at,att.section_deadline_at+make_interval(secs=>duration)) where id=att.id returning * into att;
   insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,att.candidate_id,'runtime.section.elapsed',att.id,jsonb_build_object('section_index',att.section_index,'source','server_alarm'));
  end loop;
 end if;
 if due is not null then
  update public.assessment_attempts set state='expired',submitted_at=clock_timestamp() where id=att.id;
  update public.sessions set status='expired',completed_at=clock_timestamp() where id=att.session_id;
  update public.assessment_attempt_leases set expires_at=clock_timestamp() where attempt_id=att.id;
  insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,att.candidate_id,'runtime.attempt.elapsed',att.id,jsonb_build_object('scheduled_at',due,'source','server_alarm'));
  insert into public.domain_event_outbox(event_type,event_version,aggregate_type,aggregate_id,user_id,payload,idempotency_key)
   values('assessment.attempt.submitted','v1','assessment_attempt',att.id,att.candidate_id,jsonb_build_object('tenant_id',p_tenant,'attempt_id',att.id,'reason','time_elapsed'),'assessment.submit:'||att.id);
 end if;
 return public.assessment_runtime_snapshot(p_tenant,att.id);
end; $$;
revoke all on function public.assessment_runtime_snapshot(uuid,uuid,uuid),public.assessment_runtime_command(uuid,uuid,text,text,jsonb),public.assessment_runtime_expire(uuid,uuid) from public,anon,authenticated;
grant execute on function public.assessment_runtime_snapshot(uuid,uuid,uuid),public.assessment_runtime_command(uuid,uuid,text,text,jsonb),public.assessment_runtime_expire(uuid,uuid) to service_role;
create trigger immutable_record before update or delete on public.assessment_runtime_commands for each row execute function public.assessment_immutable();
commit;
