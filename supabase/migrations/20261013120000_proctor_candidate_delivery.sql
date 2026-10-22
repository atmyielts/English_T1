begin;
create table public.proctor_candidate_notices (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, session_id uuid not null,
 kind text not null check(kind in ('warning','paused','resumed')), reason text not null check(length(reason) between 1 and 2000),
 issued_by uuid not null references public.users(id), issued_at timestamptz not null default clock_timestamp(), unique(tenant_id,id),
 foreign key(tenant_id,session_id) references public.proctor_sessions(tenant_id,id)
);
create table public.proctor_notice_acknowledgements (
 tenant_id uuid not null, notice_id uuid not null, candidate_id uuid not null references public.users(id),
 acknowledged_at timestamptz not null default clock_timestamp(), primary key(notice_id,candidate_id),
 foreign key(tenant_id,notice_id) references public.proctor_candidate_notices(tenant_id,id)
);
create index proctor_notices_session on public.proctor_candidate_notices(tenant_id,session_id,issued_at);
alter table public.proctor_candidate_notices enable row level security;
alter table public.proctor_notice_acknowledgements enable row level security;
revoke all on public.proctor_candidate_notices,public.proctor_notice_acknowledgements from anon,authenticated;
grant all on public.proctor_candidate_notices,public.proctor_notice_acknowledgements to service_role;
grant select on public.proctor_candidate_notices,public.proctor_notice_acknowledgements to authenticated;
-- Candidate-owned read must not depend on staff-only proctor_sessions RLS.
create function public.proctor_is_candidate(p_tenant uuid,p_session uuid,p_user uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.proctor_sessions where tenant_id=p_tenant and id=p_session and candidate_id=p_user);
$$;
create policy candidate_or_staff_read on public.proctor_candidate_notices for select to authenticated using (
 public.proctor_is_candidate(tenant_id,session_id,auth.uid()) or public.proctor_can_access(tenant_id,session_id,auth.uid())
);
create policy own_read on public.proctor_notice_acknowledgements for select to authenticated using(candidate_id=auth.uid());
create trigger immutable_record before update or delete on public.proctor_candidate_notices for each row execute function public.assessment_immutable();
create trigger immutable_record before update or delete on public.proctor_notice_acknowledgements for each row execute function public.assessment_immutable();

create function public.proctor_deliver_notice() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.action in ('proctor.session.warn','proctor.session.pause','proctor.session.resume') then
  insert into public.proctor_candidate_notices(tenant_id,session_id,kind,reason,issued_by)
   values(new.tenant_id,new.target_id,case new.action when 'proctor.session.warn' then 'warning' when 'proctor.session.pause' then 'paused' else 'resumed' end,new.details->>'reason',new.actor_id);
 end if;
 return new;
end; $$;
create trigger proctor_deliver_notice after insert on public.assessment_audit_events for each row execute function public.proctor_deliver_notice();

-- Keep one public RPC contract while isolating candidate receipts from staff control commands.
alter function public.proctor_command(uuid,uuid,text,text,jsonb) rename to proctor_control_command;
revoke all on function public.proctor_control_command(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.proctor_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.proctor_commands; request jsonb; result jsonb; sid uuid; nid uuid; ids uuid[];
begin
 if p_action<>'notice.acknowledge' then return public.proctor_control_command(p_actor,p_tenant,p_key,p_action,p_data); end if;
 if p_actor is null or not exists(select 1 from public.users where id=p_actor) then raise exception 'unauthorized' using errcode='42501'; end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023'; end if;
 sid:=(p_data->>'session_id')::uuid;
 if not public.proctor_is_candidate(p_tenant,sid,p_actor) then raise exception 'not_found' using errcode='P0002'; end if;
 if jsonb_typeof(p_data->'notice_ids') is distinct from 'array' or jsonb_array_length(p_data->'notice_ids') not between 1 and 100 then raise exception 'invalid_notices' using errcode='22023'; end if;
 ids:=array(select distinct value::uuid from jsonb_array_elements_text(p_data->'notice_ids') order by value::uuid);
 request:=jsonb_build_object('action',p_action,'data',jsonb_build_object('session_id',sid,'notice_ids',to_jsonb(ids)));
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||'proctor'||p_key,0));
 select * into prior from public.proctor_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505'; end if; return prior.result; end if;
 foreach nid in array ids loop
  if not exists(select 1 from public.proctor_candidate_notices where tenant_id=p_tenant and session_id=sid and id=nid) then raise exception 'not_found' using errcode='P0002'; end if;
  insert into public.proctor_notice_acknowledgements(tenant_id,notice_id,candidate_id) values(p_tenant,nid,p_actor) on conflict do nothing;
 end loop;
 result:=jsonb_build_object('id',sid,'acknowledged',to_jsonb(ids));
 insert into public.proctor_commands values(p_tenant,p_actor,p_key,request,result,clock_timestamp());
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'proctor.notice.acknowledge',sid,jsonb_build_object('notice_ids',to_jsonb(ids)));
 return result;
end; $$;
revoke all on function public.proctor_command(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.proctor_command(uuid,uuid,text,text,jsonb) to service_role;
revoke all on function public.proctor_is_candidate(uuid,uuid,uuid) from public,anon;
grant execute on function public.proctor_is_candidate(uuid,uuid,uuid) to authenticated,service_role;
revoke all on function public.proctor_deliver_notice() from public,anon,authenticated;
commit;
