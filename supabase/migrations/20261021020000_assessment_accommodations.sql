begin;
-- No medical evidence/diagnoses in candidate-visible records. Approval reasons
-- belong to the institution-only immutable command/audit trail.
alter table public.assessment_registrations
 add column accommodation_revision integer not null default 0,
 add column break_policy jsonb not null default '{"schema_version":"assessment.break-policy.v1","clock":"stopped","max_breaks":0,"max_seconds":0,"total_seconds":0}';
alter table public.assessment_attempts add column accommodations jsonb not null default '{}';
create table public.assessment_breaks(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,attempt_id uuid not null,
 ordinal integer not null check(ordinal between 1 and 20),clock text not null check(clock in('stopped','running')),
 started_at timestamptz not null,ends_at timestamptz not null,ended_at timestamptz,
 end_reason text check(end_reason in('candidate','elapsed','proctor_pause','finalized')),
 deadline_before timestamptz not null,section_before timestamptz not null,
 unique(attempt_id,ordinal),foreign key(tenant_id,attempt_id) references public.assessment_attempts(tenant_id,id),
 check(ends_at>started_at),check(ended_at is null or ended_at between started_at and ends_at),
 check((ended_at is null)=(end_reason is null))
);
create unique index assessment_break_active on public.assessment_breaks(attempt_id) where ended_at is null;
alter table public.assessment_breaks enable row level security;
revoke all on public.assessment_breaks from anon,authenticated;
grant all on public.assessment_breaks to service_role;

create function public.assessment_validate_break_policy(p jsonb) returns void language plpgsql immutable set search_path=public,pg_temp as $$begin
 if p is null or jsonb_typeof(p)<>'object' or p->>'schema_version' is distinct from 'assessment.break-policy.v1' or jsonb_typeof(p->'clock') is distinct from 'string' or p->>'clock' not in('running','stopped') or p-'schema_version'-'clock'-'max_breaks'-'max_seconds'-'total_seconds'<>'{}'::jsonb then raise exception 'invalid_break_policy' using errcode='22023';end if;
 if jsonb_typeof(p->'max_breaks') is distinct from 'number' or jsonb_typeof(p->'max_seconds') is distinct from 'number' or jsonb_typeof(p->'total_seconds') is distinct from 'number' then raise exception 'invalid_break_policy' using errcode='22023';end if;
 if (p->>'max_breaks')::numeric not between 0 and 20 or (p->>'max_seconds')::numeric not between 0 and 3600 or (p->>'total_seconds')::numeric not between 0 and 14400 or (p->>'max_breaks')::numeric<>trunc((p->>'max_breaks')::numeric) or (p->>'max_seconds')::numeric<>trunc((p->>'max_seconds')::numeric) or (p->>'total_seconds')::numeric<>trunc((p->>'total_seconds')::numeric) then raise exception 'invalid_break_policy' using errcode='22023';end if;
 if (case when (p->>'max_breaks')::integer=0 then (p->>'max_seconds')::integer<>0 or (p->>'total_seconds')::integer<>0 else (p->>'max_seconds')::integer<1 or (p->>'total_seconds')::integer<(p->>'max_seconds')::integer end) then raise exception 'invalid_break_policy' using errcode='22023';end if;
end;$$;

create function public.assessment_accommodation_pin() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$declare r public.assessment_registrations;begin
 select * into r from public.assessment_registrations where id=new.registration_id for update;
 new.accommodations:=jsonb_build_object('revision',r.accommodation_revision,'extra_seconds',r.extra_seconds,'policy',r.break_policy);return new;
end;$$;
create trigger accommodation_pin before insert on public.assessment_attempts for each row execute function public.assessment_accommodation_pin();

create function public.assessment_accommodation_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 if tg_table_name='assessment_attempts' then
  if new.accommodations is distinct from old.accommodations then raise exception 'immutable_accommodation_snapshot' using errcode='23514';end if;
 elsif new.extra_seconds is distinct from old.extra_seconds or new.break_policy is distinct from old.break_policy or new.accommodation_revision is distinct from old.accommodation_revision then
  if exists(select 1 from public.assessment_attempts where registration_id=old.id) then raise exception 'accommodations_locked_after_start' using errcode='23514';end if;
  perform public.assessment_validate_break_policy(new.break_policy);
 end if;return new;
end;$$;
create trigger accommodation_guard before update on public.assessment_registrations for each row execute function public.assessment_accommodation_guard();
create trigger accommodation_guard before update of accommodations on public.assessment_attempts for each row execute function public.assessment_accommodation_guard();

-- Transport recovery for previously admitted media stays available, but no NEW
-- answer asset or journal entry can be admitted while the candidate is on break.
create function public.assessment_break_answer_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 perform 1 from public.assessment_attempts where id=new.attempt_id for update;
 if exists(select 1 from public.assessment_breaks where attempt_id=new.attempt_id and ended_at is null and ends_at>clock_timestamp()) then raise exception 'assessment_break_active' using errcode='23514';end if;return new;
end;$$;
create trigger assessment_break_answer_guard before insert on public.assessment_answer_assets for each row execute function public.assessment_break_answer_guard();
create trigger assessment_break_answer_guard before insert on public.assessment_response_journal for each row execute function public.assessment_break_answer_guard();

alter function public.assessment_command(uuid,uuid,text,text,jsonb) rename to assessment_command_before_accommodations;
create function public.assessment_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.assessment_registrations;prior public.assessment_commands;request jsonb;result jsonb;begin
 if p_action<>'registration.accommodate' then return public.assessment_command_before_accommodations(p_actor,p_tenant,p_key,p_action,p_data);end if;
 perform public.assessment_staff_write_fence(p_tenant,p_actor);
 if not public.assessment_has_capability(p_tenant,p_actor,'exams.manage') then raise exception 'forbidden' using errcode='42501';end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 request:=jsonb_build_object('action',p_action,'data',p_data);
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||p_key,0));
 select * into prior from public.assessment_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 perform public.assessment_validate_break_policy(p_data->'break_policy');
 if jsonb_typeof(p_data->'extra_seconds') is distinct from 'number' or (p_data->>'extra_seconds')::numeric not between 0 and 86400 or (p_data->>'extra_seconds')::numeric<>trunc((p_data->>'extra_seconds')::numeric) or jsonb_typeof(p_data->'revision') is distinct from 'number' or (p_data->>'revision')::numeric<>trunc((p_data->>'revision')::numeric) or jsonb_typeof(p_data->'reason') is distinct from 'string' or length(trim(p_data->>'reason')) not between 1 and 2000 then raise exception 'invalid_accommodation' using errcode='22023';end if;
 select * into r from public.assessment_registrations where tenant_id=p_tenant and id=(p_data->>'registration_id')::uuid for update;
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 if r.accommodation_revision::numeric is distinct from (p_data->>'revision')::numeric then raise exception 'revision_conflict' using errcode='23505';end if;
 if exists(select 1 from public.assessment_attempts where registration_id=r.id) then raise exception 'accommodations_locked_after_start' using errcode='23514';end if;
 update public.assessment_registrations set extra_seconds=(p_data->>'extra_seconds')::integer,break_policy=p_data->'break_policy',accommodation_revision=accommodation_revision+1 where id=r.id returning * into r;
 result:=jsonb_build_object('id',r.id,'revision',r.accommodation_revision,'extra_seconds',r.extra_seconds,'break_policy',r.break_policy);
 insert into public.assessment_commands(tenant_id,actor_id,idempotency_key,request,result) values(p_tenant,p_actor,p_key,request,result);
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,p_action,r.id,p_data||jsonb_build_object('approved_revision',r.accommodation_revision));
 return result;
end;$$;

-- A break does not change the proctor session state. Its maximum clock credit
-- is reserved up front; early end returns unused credit. Thus ordinary deadline
-- enforcement remains authoritative even when no tab/coordinator exists.
create function public.assessment_break_finish(p_tenant uuid,p_attempt uuid,p_at timestamptz,p_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.assessment_attempts;b public.assessment_breaks;closing timestamptz;ended timestamptz;begin
 select * into a from public.assessment_attempts where tenant_id=p_tenant and id=p_attempt for update;
 select * into b from public.assessment_breaks where attempt_id=a.id and ended_at is null for update;if not found then return;end if;
 ended:=greatest(b.started_at,least(p_at,b.ends_at));
 select w.closes_at into closing from public.assessment_registrations r join public.assessment_exam_windows w on w.id=r.window_id where r.id=a.registration_id;
 update public.assessment_breaks set ended_at=ended,end_reason=p_reason where id=b.id;
 if b.clock='stopped' then update public.assessment_attempts set deadline_at=least(closing,b.deadline_before+(ended-b.started_at)),section_deadline_at=least(closing,b.section_before+(ended-b.started_at)) where id=a.id;end if;
 insert into public.assessment_audit_events(tenant_id,actor_id,actor_kind,action,target_id,details) values(p_tenant,null,'system','assessment.break.ended',a.id,jsonb_build_object('break_id',b.id,'ended_at',ended,'reason',p_reason,'clock',b.clock));
 perform public.proctor_capture_schedule(a.id);
end;$$;

-- Close the break at the effective human/watchdog pause, before human-resume
-- accounting. Never count overlapping break/pause time twice.
create function public.assessment_break_state_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.assessment_breaks;ended timestamptz;closing timestamptz;begin
 if new.state=old.state or new.state='active' then return new;end if;
 select * into b from public.assessment_breaks where attempt_id=old.id and ended_at is null for update;if not found then return new;end if;
 if new.state='paused' then select paused_at into ended from public.proctor_sessions where attempt_id=old.id and state='paused';end if;
 ended:=greatest(b.started_at,least(coalesce(ended,clock_timestamp()),b.ends_at));
 select w.closes_at into closing from public.assessment_registrations r join public.assessment_exam_windows w on w.id=r.window_id where r.id=old.registration_id;
 update public.assessment_breaks set ended_at=ended,end_reason=case when new.state='paused' then 'proctor_pause' else 'finalized' end where id=b.id;
 if b.clock='stopped' then new.deadline_at:=least(closing,b.deadline_before+(ended-b.started_at));new.section_deadline_at:=least(closing,b.section_before+(ended-b.started_at));end if;
 insert into public.assessment_audit_events(tenant_id,actor_id,actor_kind,action,target_id,details) values(old.tenant_id,null,'system','assessment.break.ended',old.id,jsonb_build_object('break_id',b.id,'ended_at',ended,'reason',case when new.state='paused' then 'proctor_pause' else 'finalized' end,'clock',b.clock));
 return new;
end;$$;
create trigger assessment_break_state_guard before update of state on public.assessment_attempts for each row execute function public.assessment_break_state_guard();

alter function public.proctor_capture_schedule(uuid) rename to proctor_capture_schedule_before_breaks;
create function public.proctor_capture_schedule(p_attempt uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare ending timestamptz;begin
 perform public.proctor_capture_schedule_before_breaks(p_attempt);
 select ends_at into ending from public.assessment_breaks where attempt_id=p_attempt and ended_at is null;
 if ending is not null then update public.assessment_runtime_schedule set due_at=least(due_at,ending),revision=revision+1,lease_token=null,leased_until=null,dispatch_attempts=0,updated_at=clock_timestamp() where attempt_id=p_attempt and (due_at is null or due_at>ending);end if;
end;$$;

alter function public.assessment_runtime_snapshot(uuid,uuid,uuid) rename to assessment_runtime_snapshot_before_breaks;
create function public.assessment_runtime_snapshot(p_tenant uuid,p_attempt uuid,p_actor uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;a public.assessment_attempts;b public.assessment_breaks;used numeric;counted integer;begin
 select * into a from public.assessment_attempts where tenant_id=p_tenant and id=p_attempt and (p_actor is null or candidate_id=p_actor) for update;
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 select * into b from public.assessment_breaks where attempt_id=a.id and ended_at is null;
 if b.id is not null and clock_timestamp()>=b.ends_at then perform public.assessment_break_finish(p_tenant,p_attempt,b.ends_at,'elapsed');end if;
 result:=public.assessment_runtime_snapshot_before_breaks(p_tenant,p_attempt,p_actor);
 select * into a from public.assessment_attempts where id=p_attempt;
 select * into b from public.assessment_breaks where attempt_id=a.id and ended_at is null;
 select count(*),coalesce(sum(extract(epoch from (coalesce(ended_at,least(clock_timestamp(),ends_at))-started_at))),0) into counted,used from public.assessment_breaks where attempt_id=a.id;
 if b.id is not null then result:=jsonb_set(result,'{next_deadline_at}',to_jsonb(least((result->>'next_deadline_at')::timestamptz,b.ends_at)));end if;
 return result||jsonb_build_object('accommodations',a.accommodations||jsonb_build_object('used_breaks',counted,'used_seconds',used,'active',case when b.id is null then null else jsonb_build_object('id',b.id,'started_at',b.started_at,'ends_at',b.ends_at,'clock',b.clock) end));
end;$$;

alter function public.assessment_runtime_expire(uuid,uuid) rename to assessment_runtime_expire_before_breaks;
create function public.assessment_runtime_expire(p_tenant uuid,p_attempt uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare a public.assessment_attempts;b public.assessment_breaks;begin
 select * into a from public.assessment_attempts where tenant_id=p_tenant and id=p_attempt for update;
 select * into b from public.assessment_breaks where attempt_id=a.id and ended_at is null;
 if b.id is not null and clock_timestamp()>=b.ends_at then perform public.assessment_break_finish(p_tenant,p_attempt,b.ends_at,'elapsed');end if;
 return public.assessment_runtime_expire_before_breaks(p_tenant,p_attempt);
end;$$;

alter function public.assessment_runtime_command(uuid,uuid,text,text,jsonb) rename to assessment_runtime_command_before_breaks;
create function public.assessment_runtime_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.assessment_attempts;b public.assessment_breaks;l public.assessment_attempt_leases;prior public.assessment_runtime_commands;request jsonb;result jsonb;p jsonb;closing timestamptz;ending timestamptz;began timestamptz;seconds integer;used numeric;counted integer;begin
 select * into a from public.assessment_attempts where tenant_id=p_tenant and id=(p_data->>'attempt_id')::uuid and candidate_id=p_actor for update;
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 request:=jsonb_build_object('action',p_action,'data',p_data-'lease');
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||'runtime'||p_key,0));
 select * into prior from public.assessment_runtime_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return jsonb_build_object('result',prior.result,'snapshot',public.assessment_runtime_snapshot(p_tenant,a.id,p_actor));end if;
 perform public.assessment_runtime_expire(p_tenant,a.id);
 select * into a from public.assessment_attempts where id=a.id;
 select * into b from public.assessment_breaks where attempt_id=a.id and ended_at is null;
 if p_action not in('break.begin','break.end') then
  if b.id is not null and p_action in('response.append','section.advance','attempt.submit') then return jsonb_build_object('rejected','assessment_break_active','snapshot',public.assessment_runtime_snapshot(p_tenant,a.id,p_actor));end if;
  return public.assessment_runtime_command_before_breaks(p_actor,p_tenant,p_key,p_action,p_data);
 end if;
 select * into l from public.assessment_attempt_leases where attempt_id=a.id for update;
 if l.attempt_id is null or l.expires_at<=clock_timestamp() or (p_data#>>'{lease,device_id}')::uuid is distinct from l.device_id or p_data#>>'{lease,token_hash}' is distinct from l.token_hash or (p_data#>>'{lease,epoch}')::bigint is distinct from l.epoch then raise exception 'device_lease_invalid' using errcode='42501';end if;
 if a.state<>'active' then return jsonb_build_object('rejected','attempt_not_active','snapshot',public.assessment_runtime_snapshot(p_tenant,a.id,p_actor));end if;
 if p_action='break.begin' then
  if b.id is not null then raise exception 'assessment_break_active' using errcode='23514';end if;
  p:=a.accommodations->'policy';
  select count(*),coalesce(sum(extract(epoch from (ended_at-started_at))),0) into counted,used from public.assessment_breaks where attempt_id=a.id;
  seconds:=least((p->>'max_seconds')::integer,floor((p->>'total_seconds')::numeric-used)::integer);
  if p is null or counted>=coalesce((p->>'max_breaks')::integer,0) or seconds is null or seconds<1 then raise exception 'break_allowance_exhausted' using errcode='23514';end if;
  select w.closes_at into closing from public.assessment_registrations r join public.assessment_exam_windows w on w.id=r.window_id where r.id=a.registration_id;
  -- A running-clock break grants no time, so it cannot outlast the attempt's own
  -- deadline; neither kind can outlast the sitting. A window too short to be a
  -- meaningful break is refused rather than recorded as a zero-length break.
  began:=clock_timestamp();
  ending:=least(closing,began+make_interval(secs=>seconds));
  if p->>'clock'='running' then ending:=least(ending,a.deadline_at);end if;
  if ending<=began+interval '1 second' then raise exception 'break_window_closed' using errcode='23514';end if;
  insert into public.assessment_breaks(tenant_id,attempt_id,ordinal,clock,started_at,ends_at,deadline_before,section_before) values(p_tenant,a.id,counted+1,p->>'clock',began,ending,a.deadline_at,a.section_deadline_at) returning * into b;
  if b.clock='stopped' then update public.assessment_attempts set deadline_at=least(closing,deadline_at+(b.ends_at-b.started_at)),section_deadline_at=least(closing,section_deadline_at+(b.ends_at-b.started_at)) where id=a.id;end if;
  result:=jsonb_build_object('id',b.id,'ends_at',b.ends_at,'clock',b.clock);
  insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'assessment.break.began',a.id,result);
 else
  if b.id is null or b.id is distinct from (p_data->>'break_id')::uuid then raise exception 'break_not_active' using errcode='23514';end if;
  perform public.assessment_break_finish(p_tenant,a.id,clock_timestamp(),'candidate');result:=jsonb_build_object('id',b.id,'ended',true);
 end if;
 insert into public.assessment_runtime_commands(tenant_id,actor_id,idempotency_key,request,result) values(p_tenant,p_actor,p_key,request,result);
 perform public.proctor_capture_schedule(a.id);
 return jsonb_build_object('result',result,'snapshot',public.assessment_runtime_snapshot(p_tenant,a.id,p_actor));
end;$$;

revoke all on function public.assessment_validate_break_policy(jsonb),public.assessment_accommodation_pin(),public.assessment_command_before_accommodations(uuid,uuid,text,text,jsonb),public.assessment_break_finish(uuid,uuid,timestamptz,text),public.assessment_break_state_guard(),public.proctor_capture_schedule_before_breaks(uuid),public.assessment_runtime_snapshot_before_breaks(uuid,uuid,uuid),public.assessment_runtime_expire_before_breaks(uuid,uuid),public.assessment_runtime_command_before_breaks(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.assessment_accommodation_guard(),public.assessment_break_answer_guard() from public,anon,authenticated,service_role;
revoke all on function public.assessment_command(uuid,uuid,text,text,jsonb),public.proctor_capture_schedule(uuid),public.assessment_runtime_snapshot(uuid,uuid,uuid),public.assessment_runtime_expire(uuid,uuid),public.assessment_runtime_command(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.assessment_command(uuid,uuid,text,text,jsonb),public.assessment_runtime_snapshot(uuid,uuid,uuid),public.assessment_runtime_expire(uuid,uuid),public.assessment_runtime_command(uuid,uuid,text,text,jsonb) to service_role;
revoke all on function public.proctor_capture_schedule(uuid) from service_role;
commit;
