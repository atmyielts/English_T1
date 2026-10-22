begin;
create table public.assessment_staff_invitations(
 id uuid primary key,tenant_id uuid not null references public.tenants(id),recipient_email text not null check(recipient_email=lower(btrim(recipient_email)) and length(recipient_email) between 3 and 254),
 role_version_id uuid not null,permission_expires_at timestamptz,expires_at timestamptz not null,key_id text not null check(key_id~'^[-a-zA-Z0-9_]{1,80}$'),token_hash text not null check(token_hash~'^[a-f0-9]{64}$'),
 state text not null default 'pending' check(state in('pending','accepted','revoked')),revision bigint not null default 1 check(revision>0),reason text not null check(length(btrim(reason)) between 1 and 5000),
 created_by uuid not null references public.users(id),created_at timestamptz not null default clock_timestamp(),accepted_by uuid references public.users(id),accepted_at timestamptz,assignment_id uuid references public.assessment_staff_role_assignments(id),revoked_by uuid references public.users(id),revoked_at timestamptz,
 unique(tenant_id,id),foreign key(tenant_id,role_version_id) references public.assessment_staff_role_versions(tenant_id,id),
 check((state='pending' and accepted_by is null and accepted_at is null and assignment_id is null and revoked_by is null and revoked_at is null) or (state='accepted' and accepted_by is not null and accepted_at is not null and assignment_id is not null and revoked_by is null and revoked_at is null) or (state='revoked' and revoked_by is not null and revoked_at is not null and accepted_by is null and accepted_at is null and assignment_id is null))
);
create index assessment_invitation_directory on public.assessment_staff_invitations(tenant_id,id);
create table public.assessment_invitation_commands(tenant_id uuid not null references public.tenants(id),actor_id uuid not null references public.users(id),idempotency_key text not null check(length(idempotency_key) between 8 and 200),request jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(tenant_id,actor_id,idempotency_key));
create trigger assessment_invitation_commands_immutable before update or delete on public.assessment_invitation_commands for each row execute function public.assessment_immutable();
create function public.assessment_invitation_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if tg_op='DELETE' or old.state<>'pending' or new.state not in('accepted','revoked') or new.revision<>old.revision+1 or (to_jsonb(new)-array['state','revision','accepted_by','accepted_at','assignment_id','revoked_by','revoked_at']) is distinct from (to_jsonb(old)-array['state','revision','accepted_by','accepted_at','assignment_id','revoked_by','revoked_at']) then raise exception 'immutable_staff_invitation' using errcode='23514';end if;return new;
end;$$;
create trigger assessment_invitation_guard before update or delete on public.assessment_staff_invitations for each row execute function public.assessment_invitation_guard();

create function public.assessment_invitation_delegation(p_actor uuid,p_tenant uuid,p_role uuid,p_expiry timestamptz) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare caps text[];cap text;deadline timestamptz;bootstrap boolean;begin
 if not public.assessment_has_capability(p_tenant,p_actor,'team.manage') then raise exception 'invitation_manager_required' using errcode='42501';end if;
 select capabilities into caps from public.assessment_staff_role_versions where tenant_id=p_tenant and id=p_role;if not found then raise exception 'role_not_found' using errcode='P0002';end if;
 bootstrap:=exists(select 1 from public.tenant_memberships where tenant_id=p_tenant and user_id=p_actor and status='active' and role in('owner','admin'));
 if p_expiry is not null and p_expiry<=clock_timestamp() then raise exception 'invitation_grant_expired' using errcode='23514';end if;
 foreach cap in array caps loop
  if not bootstrap and (cap='team.manage' or not public.assessment_has_capability(p_tenant,p_actor,cap)) then raise exception 'delegation_exceeds_authority' using errcode='42501';end if;
  if not bootstrap then deadline:=least(public.assessment_staff_deadline(p_tenant,p_actor,cap),public.assessment_staff_deadline(p_tenant,p_actor,'team.manage'));if deadline is not null and (p_expiry is null or p_expiry>deadline) then raise exception 'delegation_expiry_exceeds_authority' using errcode='23514';end if;end if;
 end loop;
end;$$;
create function public.assessment_invitation_snapshot(p_id uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',i.id,'tenant_id',i.tenant_id,'recipient_email',i.recipient_email,'role_version_id',v.id,'role_title',v.title,'role_version',v.version,'capabilities',v.capabilities,'permission_expires_at',i.permission_expires_at,'expires_at',i.expires_at,'created_by',i.created_by,'created_at',i.created_at)
 from public.assessment_staff_invitations i join public.assessment_staff_role_versions v on v.tenant_id=i.tenant_id and v.id=i.role_version_id where i.id=p_id;
$$;
create function public.assessment_invitation_view(p_id uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select public.assessment_invitation_snapshot(i.id)||jsonb_build_object('state',case when i.state='pending' and i.expires_at<=clock_timestamp() then 'expired' else i.state end,'revision',i.revision,'key_id',i.key_id,'accepted_by',i.accepted_by,'accepted_at',i.accepted_at,'review_hash',encode(sha256(convert_to(public.assessment_invitation_snapshot(i.id)::text,'UTF8')),'hex')) from public.assessment_staff_invitations i where i.id=p_id;
$$;
create function public.assessment_invitation_read(p_actor uuid,p_tenant uuid,p_id uuid default null,p_after uuid default null,p_limit integer default 50,p_link boolean default false) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare i public.assessment_staff_invitations;begin
 if not public.assessment_has_capability(p_tenant,p_actor,'team.manage') then raise exception 'invitation_manager_required' using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_page_limit' using errcode='22023';end if;
 if p_id is null then return(select coalesce(jsonb_agg(public.assessment_invitation_view(x.id) order by x.id),'[]') from(select id from public.assessment_staff_invitations where tenant_id=p_tenant and (p_after is null or id>p_after) order by id limit p_limit)x);end if;
 select * into i from public.assessment_staff_invitations where tenant_id=p_tenant and id=p_id;if not found then return null;end if;
 if p_link then
  if i.created_by<>p_actor or i.state<>'pending' or i.expires_at<=clock_timestamp() then raise exception 'invitation_link_unavailable' using errcode='42501';end if;
  perform public.assessment_invitation_delegation(i.created_by,p_tenant,i.role_version_id,i.permission_expires_at);
 end if;
 return public.assessment_invitation_view(i.id);
end;$$;
create function public.assessment_invitation_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare request jsonb:=jsonb_build_object('action',p_action,'data',p_data);prior public.assessment_invitation_commands;i public.assessment_staff_invitations;result jsonb;expiry timestamptz;grant_expiry timestamptz;role_version uuid;begin
 perform public.assessment_staff_write_fence(p_tenant,p_actor);
 if not public.assessment_has_capability(p_tenant,p_actor,'team.manage') then raise exception 'invitation_manager_required' using errcode='42501';end if;
 if p_key is null or length(p_key) not between 8 and 200 or p_action is null or p_action not in('invite.create','invite.revoke') or jsonb_typeof(p_data) is distinct from 'object' or length(btrim(coalesce(p_data->>'reason',''))) not between 1 and 5000 then raise exception 'invalid_invitation_command' using errcode='22023';end if;
 select * into prior from public.assessment_invitation_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if p_action='invite.create' then
  role_version:=(p_data->>'role_version_id')::uuid;expiry:=(p_data->>'expires_at')::timestamptz;grant_expiry:=(p_data->>'permission_expires_at')::timestamptz;
  if expiry is null or expiry<=clock_timestamp() or expiry>clock_timestamp()+interval '30 days' or (grant_expiry is not null and expiry>grant_expiry) or p_data->'acknowledged' is distinct from 'true'::jsonb or coalesce(p_data->>'recipient_email','')!~'^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$' or length(p_data->>'recipient_email')>254 or p_data->>'recipient_email'<>lower(btrim(p_data->>'recipient_email')) or coalesce(p_data->>'token_hash','')!~'^[a-f0-9]{64}$' then raise exception 'invalid_invitation' using errcode='23514';end if;
  perform public.assessment_invitation_delegation(p_actor,p_tenant,role_version,grant_expiry);
  if (select count(*) from public.assessment_staff_invitations where tenant_id=p_tenant and state='pending' and expires_at>clock_timestamp())>=500 then raise exception 'pending_invitation_limit' using errcode='23514';end if;
  if exists(select 1 from public.assessment_staff_invitations where tenant_id=p_tenant and recipient_email=p_data->>'recipient_email' and role_version_id=role_version and state='pending' and expires_at>clock_timestamp()) then raise exception 'pending_invitation_exists' using errcode='23505';end if;
  insert into public.assessment_staff_invitations(id,tenant_id,recipient_email,role_version_id,permission_expires_at,expires_at,key_id,token_hash,reason,created_by) values((p_data->>'id')::uuid,p_tenant,p_data->>'recipient_email',role_version,grant_expiry,expiry,p_data->>'key_id',p_data->>'token_hash',p_data->>'reason',p_actor) returning * into i;
 else
  select * into i from public.assessment_staff_invitations where tenant_id=p_tenant and id=(p_data->>'id')::uuid for update;
  if not found then raise exception 'invitation_not_found' using errcode='P0002';end if;
  if p_data->>'expected_revision' is distinct from i.revision::text then raise exception 'invitation_revision_conflict' using errcode='23505';end if;
  if i.state<>'pending' then raise exception 'invitation_finalized' using errcode='23514';end if;
  update public.assessment_staff_invitations set state='revoked',revision=revision+1,revoked_by=p_actor,revoked_at=clock_timestamp() where id=i.id returning * into i;
 end if;
 result:=jsonb_build_object('id',i.id,'state',i.state,'revision',i.revision);
 insert into public.assessment_invitation_commands(tenant_id,actor_id,idempotency_key,request,result) values(p_tenant,p_actor,p_key,request,result);
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'staff.'||p_action,i.id,jsonb_build_object('role_version_id',i.role_version_id,'reason',p_data->>'reason'));
 return result;
end;$$;
create function public.assessment_invitation_preview(p_actor uuid,p_tenant uuid,p_id uuid,p_token_hash text,p_verified_email text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare i public.assessment_staff_invitations;begin
 select * into i from public.assessment_staff_invitations where tenant_id=p_tenant and id=p_id;
 if not found or p_verified_email is null or i.recipient_email<>p_verified_email or i.token_hash is distinct from p_token_hash or i.created_by=p_actor or (i.state='accepted' and i.accepted_by<>p_actor) then raise exception 'invitation_recipient_required' using errcode='42501';end if;
 if not exists(select 1 from public.users where id=p_actor) then raise exception 'recipient_profile_required' using errcode='P0002';end if;
 if i.state='revoked' or (i.state='pending' and i.expires_at<=clock_timestamp()) then raise exception 'invitation_unavailable' using errcode='23514';end if;
 if i.state='pending' then perform public.assessment_invitation_delegation(i.created_by,p_tenant,i.role_version_id,i.permission_expires_at);end if;
 return (public.assessment_invitation_view(i.id)-array['key_id','accepted_by'])||jsonb_build_object('institution_name',(select coalesce(nullif(to_jsonb(t)->>'name',''),'Institution') from public.tenants t where t.id=p_tenant));
end;$$;
create function public.assessment_invitation_accept(p_actor uuid,p_tenant uuid,p_key text,p_id uuid,p_token_hash text,p_verified_email text,p_review_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare i public.assessment_staff_invitations;view jsonb;assignment jsonb;request jsonb;prior public.assessment_invitation_commands;result jsonb;begin
 perform public.assessment_staff_write_fence(p_tenant,p_actor);
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 view:=public.assessment_invitation_preview(p_actor,p_tenant,p_id,p_token_hash,p_verified_email);
 select * into i from public.assessment_staff_invitations where tenant_id=p_tenant and id=p_id for update;
 if p_review_hash is distinct from view->>'review_hash' then raise exception 'invitation_review_changed' using errcode='23505';end if;
 request:=jsonb_build_object('action','invite.accept','id',p_id,'token_hash',p_token_hash,'verified_email',p_verified_email,'review_hash',p_review_hash);
 select * into prior from public.assessment_invitation_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if i.state='accepted' then return jsonb_build_object('id',i.id,'state','accepted','assignment_id',i.assignment_id,'user_id',i.accepted_by);end if;
 if exists(select 1 from public.assessment_memberships where tenant_id=p_tenant and user_id=p_actor and status='suspended') or (exists(select 1 from public.tenant_memberships where tenant_id=p_tenant and user_id=p_actor) and not exists(select 1 from public.tenant_memberships where tenant_id=p_tenant and user_id=p_actor and status='active')) then raise exception 'recipient_access_suspended' using errcode='42501';end if;
 if not exists(select 1 from public.tenant_memberships where tenant_id=p_tenant and user_id=p_actor and status='active') then
  insert into public.assessment_memberships(tenant_id,user_id,status,created_by,updated_by) values(p_tenant,p_actor,'active',i.created_by,i.created_by) on conflict(tenant_id,user_id) do nothing;
 end if;
 assignment:=public.assessment_staff_command(i.created_by,p_tenant,'invite-role:'||i.id,'role.assign',jsonb_build_object('user_id',p_actor,'role_version_id',i.role_version_id,'expected_assignment_id',null,'expires_at',i.permission_expires_at,'reason','Accepted invitation '||i.id));
 update public.assessment_staff_invitations set state='accepted',revision=revision+1,accepted_by=p_actor,accepted_at=clock_timestamp(),assignment_id=(assignment->>'id')::uuid where id=i.id returning * into i;
 result:=jsonb_build_object('id',i.id,'state','accepted','assignment_id',i.assignment_id,'user_id',p_actor);
 insert into public.assessment_invitation_commands(tenant_id,actor_id,idempotency_key,request,result) values(p_tenant,p_actor,p_key,request,result);
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'staff.invite.accept',i.id,jsonb_build_object('role_version_id',i.role_version_id,'assignment_id',i.assignment_id,'membership_scope','assessment'));
 return result;
end;$$;
alter table public.assessment_staff_invitations enable row level security;alter table public.assessment_invitation_commands enable row level security;
revoke all on public.assessment_staff_invitations,public.assessment_invitation_commands from public,anon,authenticated;
grant all on public.assessment_staff_invitations,public.assessment_invitation_commands to service_role;
revoke all on function public.assessment_invitation_guard(),public.assessment_invitation_delegation(uuid,uuid,uuid,timestamptz),public.assessment_invitation_snapshot(uuid),public.assessment_invitation_view(uuid),public.assessment_invitation_read(uuid,uuid,uuid,uuid,integer,boolean),public.assessment_invitation_command(uuid,uuid,text,text,jsonb),public.assessment_invitation_preview(uuid,uuid,uuid,text,text),public.assessment_invitation_accept(uuid,uuid,text,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.assessment_invitation_delegation(uuid,uuid,uuid,timestamptz),public.assessment_invitation_snapshot(uuid),public.assessment_invitation_view(uuid) from service_role;
grant execute on function public.assessment_invitation_read(uuid,uuid,uuid,uuid,integer,boolean),public.assessment_invitation_command(uuid,uuid,text,text,jsonb),public.assessment_invitation_preview(uuid,uuid,uuid,text,text),public.assessment_invitation_accept(uuid,uuid,text,uuid,text,text,text) to service_role;
commit;
