begin;
-- TIME-02: explicit device takeover. A different device never takes over an
-- attempt silently, not even after the old lease expires: the candidate confirms
-- it, the epoch moves forward at once, and the old device is told it was
-- superseded instead of being allowed to quietly take the attempt back.

-- A lease the device itself released is a deliberate handover, unlike one that
-- merely expired: another device may continue without confirming a takeover.
alter table public.assessment_attempt_leases add column released_at timestamptz;

create table public.assessment_attempt_takeovers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  attempt_id uuid not null references public.assessment_attempts(id),
  from_device uuid not null,
  to_device uuid not null check (to_device<>from_device),
  from_epoch bigint not null check (from_epoch>0),
  to_epoch bigint not null check (to_epoch=from_epoch+1),
  previous_lease_active boolean not null,
  acknowledged_sequence integer not null check (acknowledged_sequence>=0),
  created_at timestamptz not null default clock_timestamp()
);
create index assessment_attempt_takeovers_attempt on public.assessment_attempt_takeovers(attempt_id,created_at desc);
alter table public.assessment_attempt_takeovers enable row level security;
revoke all on public.assessment_attempt_takeovers from public,anon,authenticated;
grant select on public.assessment_attempt_takeovers to service_role;
create function public.assessment_attempt_takeover_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'immutable_takeover' using errcode='23514'; end; $$;
create trigger assessment_attempt_takeover_guard before update or delete on public.assessment_attempt_takeovers for each row execute function public.assessment_attempt_takeover_guard();

-- The most recent takeover away from this device, if the attempt is now held elsewhere.
create function public.assessment_attempt_superseded(p_attempt uuid,p_device uuid) returns public.assessment_attempt_takeovers language sql stable security definer set search_path=public,pg_temp as $$
 select t.* from public.assessment_attempt_takeovers t join public.assessment_attempt_leases l on l.attempt_id=t.attempt_id
 where t.attempt_id=p_attempt and t.from_device=p_device and l.device_id<>p_device order by t.created_at desc limit 1
$$;

alter function public.assessment_runtime_command(uuid,uuid,text,text,jsonb) rename to assessment_runtime_command_before_takeover;
create function public.assessment_runtime_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.assessment_attempts;l public.assessment_attempt_leases;prior public.assessment_runtime_commands;moved public.assessment_attempt_takeovers;request jsonb;result jsonb;device uuid;token text;takeover boolean;active boolean;acknowledged integer;
begin
 if p_action<>'lease.acquire' then
  begin
   result:=public.assessment_runtime_command_before_takeover(p_actor,p_tenant,p_key,p_action,p_data);
   if p_action='lease.release' then
    update public.assessment_attempt_leases set released_at=clock_timestamp() where attempt_id=(p_data->>'attempt_id')::uuid and device_id=(p_data->'lease'->>'device_id')::uuid and epoch=(p_data->'lease'->>'epoch')::bigint and released_at is null;
   end if;
   return result;
  exception when insufficient_privilege then
   -- A device that was taken over learns that, rather than a generic lease error.
   if sqlerrm='device_lease_invalid' and (p_data->'lease'->>'device_id') is not null then
    moved:=public.assessment_attempt_superseded((p_data->>'attempt_id')::uuid,(p_data->'lease'->>'device_id')::uuid);
    if moved.id is not null then raise exception 'device_lease_superseded' using errcode='42501';end if;
   end if;
   raise;
  end;
 end if;
 takeover:=coalesce((p_data->>'takeover')::boolean,false);
 select * into a from public.assessment_attempts where tenant_id=p_tenant and id=(p_data->>'attempt_id')::uuid and candidate_id=p_actor for update;
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 request:=jsonb_build_object('action',p_action,'data',p_data-'lease');
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||'runtime'||p_key,0));
 select * into prior from public.assessment_runtime_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then
  if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;
  return jsonb_build_object('result',prior.result,'snapshot',public.assessment_runtime_snapshot(p_tenant,a.id,p_actor));
 end if;
 device:=(p_data->>'device_id')::uuid;token:=p_data->>'token_hash';
 select * into l from public.assessment_attempt_leases where attempt_id=a.id for update;
 -- No lease yet, this same device again, or a lease its device released: the
 -- original acquisition rules apply.
 if l.attempt_id is null or l.device_id=device or (l.released_at is not null and l.expires_at<=clock_timestamp()) then
  if takeover then raise exception 'device_takeover_not_needed' using errcode='22023';end if;
  result:=public.assessment_runtime_command_before_takeover(p_actor,p_tenant,p_key,p_action,p_data-'takeover');
  update public.assessment_attempt_leases set released_at=null where attempt_id=a.id and released_at is not null;
  return result;
 end if;
 if a.state not in ('active','paused') then raise exception 'attempt_finalized' using errcode='23514';end if;
 if device is null or token is null or token !~ '^[a-f0-9]{64}$' then raise exception 'invalid_device_lease' using errcode='22023';end if;
 if not takeover then
  moved:=public.assessment_attempt_superseded(a.id,device);
  if moved.id is not null then raise exception 'device_lease_superseded' using errcode='42501';end if;
  -- Held now by another device, or held last by one: either way the candidate confirms.
  if l.expires_at>clock_timestamp() then raise exception 'device_lease_active' using errcode='23505';end if;
  raise exception 'device_takeover_required' using errcode='23505';
 end if;
 active:=l.expires_at>clock_timestamp();
 select count(*) into acknowledged from public.assessment_response_journal where attempt_id=a.id;
 update public.assessment_attempt_leases set device_id=device,token_hash=token,epoch=l.epoch+1,expires_at=clock_timestamp()+interval '60 seconds',last_heartbeat_at=clock_timestamp() where attempt_id=a.id;
 insert into public.assessment_attempt_takeovers(tenant_id,attempt_id,from_device,to_device,from_epoch,to_epoch,previous_lease_active,acknowledged_sequence)
 values(p_tenant,a.id,l.device_id,device,l.epoch,l.epoch+1,active,coalesce(a.last_sequence,0)) returning * into moved;
 result:=jsonb_build_object('epoch',moved.to_epoch,'device_id',device,'takeover',jsonb_build_object('id',moved.id,'from_epoch',moved.from_epoch,'previous_lease_active',active,'acknowledged_sequence',moved.acknowledged_sequence,'saved_responses',acknowledged));
 insert into public.assessment_runtime_commands(tenant_id,actor_id,idempotency_key,request,result) values(p_tenant,p_actor,p_key,request,result);
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'attempt.device_takeover',a.id,jsonb_build_object('takeover_id',moved.id,'from_epoch',moved.from_epoch,'to_epoch',moved.to_epoch,'previous_lease_active',active,'acknowledged_sequence',moved.acknowledged_sequence));
 return jsonb_build_object('result',result,'snapshot',public.assessment_runtime_snapshot(p_tenant,a.id,p_actor));
end;$$;
revoke all on function public.assessment_runtime_command_before_takeover(uuid,uuid,text,text,jsonb),public.assessment_attempt_superseded(uuid,uuid),public.assessment_attempt_takeover_guard() from public,anon,authenticated,service_role;
revoke all on function public.assessment_runtime_command(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.assessment_runtime_command(uuid,uuid,text,text,jsonb) to service_role;
commit;
