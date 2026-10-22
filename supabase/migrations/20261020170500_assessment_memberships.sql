begin;
-- Assessment staff membership is not Academy/organization membership. Future
-- invitation acceptance may create these rows; browser clients cannot do so.
create table public.assessment_memberships(
 tenant_id uuid not null references public.tenants(id),user_id uuid not null references public.users(id),
 status text not null check(status in('active','suspended')),revision bigint not null default 1 check(revision>0),
 created_by uuid not null references public.users(id),created_at timestamptz not null default clock_timestamp(),
 updated_by uuid not null references public.users(id),updated_at timestamptz not null default clock_timestamp(),primary key(tenant_id,user_id)
);
create function public.assessment_membership_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' or (to_jsonb(new)-array['status','revision','updated_by','updated_at']) is distinct from (to_jsonb(old)-array['status','revision','updated_by','updated_at']) or new.status=old.status or new.revision<>old.revision+1 then raise exception 'immutable_assessment_membership' using errcode='23514';end if;return new;
end;$$;
create trigger assessment_membership_guard before update or delete on public.assessment_memberships for each row execute function public.assessment_membership_guard();
alter table public.assessment_memberships enable row level security;
revoke all on public.assessment_memberships from public,anon,authenticated;
grant all on public.assessment_memberships to service_role;

-- A local suspension affects Assessment only. An inactive organization record
-- remains a fence; a local row cannot bypass organization removal. No local row
-- confers owner/admin status, Academy membership or Proctor membership.
create view public.assessment_staff_directory as
 select m.tenant_id,m.user_id,case when a.status='suspended' then 'inactive' else m.status end status,m.role,
 coalesce(a.revision,0) membership_revision,case when a.user_id is null then 'organization' else 'assessment' end membership_scope,a.status assessment_status
 from public.tenant_memberships m left join public.assessment_memberships a on a.tenant_id=m.tenant_id and a.user_id=m.user_id
 union all
 select a.tenant_id,a.user_id,case when a.status='active' then 'active' else 'inactive' end,'assessment_member',a.revision,'assessment',a.status
 from public.assessment_memberships a where not exists(select 1 from public.tenant_memberships m where m.tenant_id=a.tenant_id and m.user_id=a.user_id);
revoke all on public.assessment_staff_directory from public,anon,authenticated;
grant select on public.assessment_staff_directory to service_role;

-- Preserve this function's OID and existing RLS dependencies. Do not rename it
-- behind policy expressions or broaden the original permission catalogue.
create or replace function public.assessment_has_capability(p_tenant uuid,p_user uuid,p_capability text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select p_capability=any(public.assessment_staff_capabilities()||array['grades.manage','proctor.manage','proctor.observe','proctor.review'])
 and (not(p_capability=any(public.assessment_staff_capabilities()||array['grades.manage'])) or not exists(select 1 from public.assessment_memberships a where a.tenant_id=p_tenant and a.user_id=p_user and a.status='suspended'))
 and (
  exists(select 1 from public.tenant_memberships m where m.tenant_id=p_tenant and m.user_id=p_user and m.status='active' and m.role in('owner','admin'))
  or (
   (exists(select 1 from public.tenant_memberships m where m.tenant_id=p_tenant and m.user_id=p_user and m.status='active')
    or (p_capability=any(public.assessment_staff_capabilities()) and exists(select 1 from public.assessment_memberships a where a.tenant_id=p_tenant and a.user_id=p_user and a.status='active') and not exists(select 1 from public.tenant_memberships m where m.tenant_id=p_tenant and m.user_id=p_user)))
   and (exists(select 1 from public.assessment_capability_grants g where g.tenant_id=p_tenant and g.user_id=p_user and g.capability=p_capability and g.revoked_at is null and (g.expires_at is null or g.expires_at>clock_timestamp()))
    or exists(select 1 from public.assessment_staff_role_assignments a join public.assessment_staff_role_versions v on v.id=a.role_version_id where a.tenant_id=p_tenant and a.user_id=p_user and a.revoked_at is null and (a.expires_at is null or a.expires_at>clock_timestamp()) and p_capability=any(v.capabilities)))
  )
 );
$$;

create function public.assessment_membership_change(p_actor uuid,p_tenant uuid,p_target uuid,p_action text,p_revision bigint,p_reason text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.assessment_memberships;desired text;result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('assessment.staff:'||p_tenant::text,0));
 perform 1 from public.tenant_memberships where tenant_id=p_tenant and user_id=any(array[p_actor,p_target]) order by user_id for share;
 if not public.assessment_has_capability(p_tenant,p_actor,'team.manage') or p_actor=p_target then raise exception 'forbidden_membership_change' using errcode='42501';end if;
 if p_action not in('member.suspend','member.resume') or p_action is null or p_revision is null or length(btrim(coalesce(p_reason,''))) not between 1 and 5000 then raise exception 'invalid_membership_change' using errcode='22023';end if;
 if not exists(select 1 from public.assessment_staff_directory where tenant_id=p_tenant and user_id=p_target) then raise exception 'member_not_found' using errcode='P0002';end if;
 if exists(select 1 from public.tenant_memberships where tenant_id=p_tenant and user_id=p_target and role in('owner','admin')) then raise exception 'organization_role_controls_access' using errcode='23514';end if;
 select * into prior from public.assessment_memberships where tenant_id=p_tenant and user_id=p_target for update;
 if p_revision<>coalesce(prior.revision,0) then raise exception 'membership_revision_conflict' using errcode='23505';end if;
 desired:=case when p_action='member.suspend' then 'suspended' else 'active' end;
 if desired=prior.status or (p_action='member.resume' and prior.user_id is null) then raise exception 'membership_state_conflict' using errcode='23514';end if;
 if desired='active' and exists(select 1 from public.tenant_memberships where tenant_id=p_tenant and user_id=p_target) and not exists(select 1 from public.tenant_memberships where tenant_id=p_tenant and user_id=p_target and status='active') then raise exception 'organization_membership_inactive' using errcode='23514';end if;
 insert into public.assessment_memberships(tenant_id,user_id,status,created_by,updated_by) values(p_tenant,p_target,desired,p_actor,p_actor)
 on conflict(tenant_id,user_id) do update set status=excluded.status,revision=assessment_memberships.revision+1,updated_by=p_actor,updated_at=clock_timestamp() returning jsonb_build_object('user_id',user_id,'status',status,'membership_revision',revision,'membership_scope','assessment') into result;
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'staff.'||p_action,p_target,jsonb_build_object('reason',p_reason,'result',result));
 return result;
end;$$;

-- Extend the current reviewed staff implementation with exact source guards.
-- All role snapshots, delegation ceilings, expiries, self-change prohibitions,
-- receipt recovery and current-authority checks remain in that implementation.
do $migration$ declare source text;signature text;old_lock text:='perform 1 from public.tenant_memberships where tenant_id=p_tenant and user_id=any(array[p_actor,target]) order by user_id for share;';anchor text:='bootstrap:=exists(select 1 from public.tenant_memberships where tenant_id=p_tenant and user_id=p_actor and status=''active'' and role in(''owner'',''admin''));';
begin
 signature:='public.assessment_staff_command(uuid,uuid,text,text,jsonb)';source:=pg_get_functiondef(signature::regprocedure);
 if strpos(source,old_lock)=0 or strpos(source,anchor)=0 then raise exception 'staff_membership_command_source_drift';end if;
 source:=replace(source,old_lock,'-- ASSESSMENT_MEMBERSHIP_LOCK');
 source:=replace(source,anchor,$branch$
 if p_action in('member.suspend','member.resume') then
  result:=public.assessment_membership_change(p_actor,p_tenant,target,p_action,(p_data->>'expected_revision')::bigint,p_data->>'reason');
  insert into public.assessment_staff_commands(tenant_id,actor_id,idempotency_key,request,result) values(p_tenant,p_actor,p_key,request,result);return result;
 end if;
 $branch$||anchor);
 source:=replace(source,'from public.tenant_memberships','from public.assessment_staff_directory');
 source:=replace(source,'-- ASSESSMENT_MEMBERSHIP_LOCK',old_lock||E'\n perform 1 from public.assessment_memberships where tenant_id=p_tenant and user_id=any(array[p_actor,target]) order by user_id for share;');
 execute source;
 signature:='public.assessment_staff_read(uuid,uuid,text,uuid,uuid,integer)';source:=pg_get_functiondef(signature::regprocedure);
 if strpos(source,'''org_role'',m.role')=0 or strpos(source,'from public.tenant_memberships')=0 then raise exception 'staff_membership_read_source_drift';end if;
 source:=replace(source,'from public.tenant_memberships','from public.assessment_staff_directory');
 source:=replace(source,'''org_role'',m.role','''membership_revision'',m.membership_revision,''membership_scope'',m.membership_scope,''assessment_status'',m.assessment_status,''org_role'',m.role');
 execute source;
end;$migration$;

create function public.assessment_workspaces(p_actor uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('tenant_id',x.tenant_id,'role',x.role,'tenants',jsonb_build_object('name',coalesce(nullif(to_jsonb(t)->>'name',''),'Institution'))) order by x.tenant_id),'[]')
 from(select distinct on(tenant_id) tenant_id,role from public.assessment_staff_directory where user_id=p_actor and status='active' order by tenant_id,(role in('owner','admin')) desc,role)x join public.tenants t on t.id=x.tenant_id;
$$;
-- Staff writes serialize with suspension/delegation changes, without putting
-- candidate responses or timed delivery behind an institution-wide staff lock.
create function public.assessment_staff_write_fence(p_tenant uuid,p_actor uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('assessment.staff:'||p_tenant::text,0));
 perform 1 from public.tenant_memberships where tenant_id=p_tenant and user_id=p_actor for share;
 perform 1 from public.assessment_memberships where tenant_id=p_tenant and user_id=p_actor for share;
 perform 1 from public.assessment_capability_grants where tenant_id=p_tenant and user_id=p_actor order by capability for share;
 perform 1 from public.assessment_staff_role_assignments where tenant_id=p_tenant and user_id=p_actor order by id for share;
end;$$;
create function public.assessment_staff_action_capability(p_action text) returns text language sql immutable as $$
 select case when p_action in('bank.create','rubric.create','item.create','item.revise','item.submit','assessment.create','assessment.revise') then 'items.write' when p_action='item.approve' then 'items.approve' when p_action='assessment.publish' then 'assessments.publish' when p_action in('window.create','registration.create') then 'exams.manage' else null end;
$$;
do $migration$ declare source text;signature text;anchor text;prelude text;
begin
 foreach signature in array array['public.assessment_command(uuid,uuid,text,text,jsonb)','public.assessment_grading_command(uuid,uuid,text,text,jsonb)','public.assessment_artifact_command(uuid,uuid,text,text,jsonb)'] loop
  source:=pg_get_functiondef(signature::regprocedure);
  anchor:=case when strpos(source,E'begin\r\n')>0 then E'begin\r\n' else E'begin\n' end;
  if (length(source)-length(replace(source,anchor,'')))/length(anchor)<>1 then raise exception 'staff_write_fence_source_drift: %',signature;end if;
  if signature='public.assessment_command(uuid,uuid,text,text,jsonb)' then
   prelude:=$gate$
 if public.assessment_staff_action_capability(p_action) is not null then
  perform public.assessment_staff_write_fence(p_tenant,p_actor);
  if not public.assessment_has_capability(p_tenant,p_actor,public.assessment_staff_action_capability(p_action)) then raise exception 'forbidden' using errcode='42501';end if;
 end if;
 $gate$;
  else prelude:=E' perform public.assessment_staff_write_fence(p_tenant,p_actor);\n';end if;
  execute replace(source,anchor,anchor||prelude);
 end loop;
end;$migration$;
revoke all on function public.assessment_membership_guard(),public.assessment_membership_change(uuid,uuid,uuid,text,bigint,text),public.assessment_workspaces(uuid),public.assessment_staff_write_fence(uuid,uuid),public.assessment_staff_action_capability(text) from public,anon,authenticated;
-- Membership writes go through the existing staff command/receipt authority,
-- never a separately exposed raw helper.
revoke all on function public.assessment_membership_change(uuid,uuid,uuid,text,bigint,text) from service_role;
revoke all on function public.assessment_staff_write_fence(uuid,uuid),public.assessment_staff_action_capability(text) from service_role;
grant execute on function public.assessment_workspaces(uuid) to service_role;
commit;
