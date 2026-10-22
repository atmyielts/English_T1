-- Canonical schedule is created in the attempt transaction, even if the browser never connects.
begin;
create table public.assessment_runtime_schedule (
 tenant_id uuid not null,attempt_id uuid primary key,revision bigint not null default 1 check(revision>0),due_at timestamptz,
 lease_token uuid,leased_until timestamptz,dispatch_attempts integer not null default 0,updated_at timestamptz not null default clock_timestamp(),
 foreign key(tenant_id,attempt_id) references public.assessment_attempts(tenant_id,id),
 check((lease_token is null)=(leased_until is null))
);
create index assessment_runtime_schedule_due on public.assessment_runtime_schedule(due_at,attempt_id) where due_at is not null;
alter table public.assessment_runtime_schedule enable row level security;
revoke all on public.assessment_runtime_schedule from anon,authenticated;
grant all on public.assessment_runtime_schedule to service_role;

create function public.assessment_runtime_schedule_refresh() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare closing timestamptz; due timestamptz;
begin
 select w.closes_at into closing from public.assessment_registrations r join public.assessment_exam_windows w on w.id=r.window_id where r.id=new.registration_id;
 due:=case when new.state='active' then least(new.deadline_at,new.section_deadline_at,closing) when new.state='paused' then closing else null end;
 insert into public.assessment_runtime_schedule(tenant_id,attempt_id,due_at) values(new.tenant_id,new.id,due)
 on conflict(attempt_id) do update set due_at=excluded.due_at,revision=assessment_runtime_schedule.revision+1,lease_token=null,leased_until=null,dispatch_attempts=0,updated_at=clock_timestamp();
 return new;
end; $$;
revoke all on function public.assessment_runtime_schedule_refresh() from public,anon,authenticated,service_role;
create trigger assessment_runtime_schedule_refresh after insert or update of state,deadline_at,section_deadline_at,section_index on public.assessment_attempts for each row execute function public.assessment_runtime_schedule_refresh();
insert into public.assessment_runtime_schedule(tenant_id,attempt_id,due_at)
 select a.tenant_id,a.id,case when a.state='active' then least(a.deadline_at,a.section_deadline_at,w.closes_at) when a.state='paused' then w.closes_at else null end
 from public.assessment_attempts a join public.assessment_registrations r on r.id=a.registration_id join public.assessment_exam_windows w on w.id=r.window_id;

create function public.assessment_runtime_schedule_claim(p_limit integer default 100) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_schedule_limit' using errcode='22023';end if;
 with picked as (
  select attempt_id from public.assessment_runtime_schedule where due_at<=clock_timestamp() and (leased_until is null or leased_until<=clock_timestamp()) order by due_at,attempt_id limit p_limit for update skip locked
 ), claimed as (
  update public.assessment_runtime_schedule s set lease_token=gen_random_uuid(),leased_until=clock_timestamp()+interval '3 minutes',dispatch_attempts=dispatch_attempts+1,updated_at=clock_timestamp()
  from picked where s.attempt_id=picked.attempt_id returning s.*
 ) select coalesce(jsonb_agg(jsonb_build_object('schema_version','assessment.recovery.v1','tenant_id',tenant_id,'attempt_id',attempt_id,'revision',revision,'lease_token',lease_token)),'[]'::jsonb) into result from claimed;
 return result;
end; $$;

create function public.assessment_runtime_schedule_reconcile(p_tenant uuid,p_attempt uuid,p_revision bigint,p_lease_token uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare att public.assessment_attempts;schedule public.assessment_runtime_schedule;snapshot jsonb;
begin
 -- Attempt first, then schedule: same order as the attempt mutation/expiry trigger.
 select * into att from public.assessment_attempts where tenant_id=p_tenant and id=p_attempt for update;
 if not found then return jsonb_build_object('accepted',false);end if;
 select * into schedule from public.assessment_runtime_schedule where tenant_id=p_tenant and attempt_id=p_attempt for update;
 if not found or schedule.revision is distinct from p_revision or schedule.lease_token is distinct from p_lease_token or schedule.leased_until is null or schedule.leased_until<=clock_timestamp() then return jsonb_build_object('accepted',false);end if;
 snapshot:=public.assessment_runtime_expire(p_tenant,p_attempt);
 -- Expiry/section transitions may already have rotated this revision and cleared its lease in the trigger.
 update public.assessment_runtime_schedule set lease_token=null,leased_until=null,updated_at=clock_timestamp() where attempt_id=p_attempt and revision=p_revision and lease_token=p_lease_token;
 return jsonb_build_object('accepted',true,'binding',jsonb_build_object('tenant',p_tenant,'attempt',p_attempt,'actor',att.candidate_id),'snapshot',snapshot);
end; $$;
revoke all on function public.assessment_runtime_schedule_claim(integer),public.assessment_runtime_schedule_reconcile(uuid,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.assessment_runtime_schedule_claim(integer),public.assessment_runtime_schedule_reconcile(uuid,uuid,bigint,uuid) to service_role;
commit;
