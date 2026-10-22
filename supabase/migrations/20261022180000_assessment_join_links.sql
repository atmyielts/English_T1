begin;
-- Self-service onboarding: a sitting join link lets a candidate register
-- themselves with their own Schood account, and an institution chooses the
-- name candidates see instead of the personal workspace's email address.

create table public.assessment_join_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  window_id uuid not null,
  -- A join link is meant to be shared with a whole class, so its code is a
  -- bearer secret of low sensitivity: it only lets a signed-in person register
  -- themselves for this one sitting. Staff can copy it again later.
  code text not null unique check (code ~ '^[a-f0-9]{64}$'),
  max_joins integer check (max_joins between 1 and 10000),
  joined integer not null default 0 check (joined >= 0),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  revoked_by uuid references public.users(id),
  unique (tenant_id,id),
  foreign key (tenant_id,window_id) references public.assessment_exam_windows(tenant_id,id),
  check ((revoked_at is null) = (revoked_by is null)),
  check (max_joins is null or joined <= max_joins)
);
create unique index assessment_join_links_active on public.assessment_join_links(window_id) where revoked_at is null;
create index assessment_join_links_tenant on public.assessment_join_links(tenant_id,created_at desc);
alter table public.assessment_join_links enable row level security;
revoke all on public.assessment_join_links from public,anon,authenticated;
grant select on public.assessment_join_links to service_role;

-- Links are never deleted or rewritten: they can only be revoked once, and
-- their join count only moves up by one.
create function public.assessment_join_link_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' then raise exception 'immutable_join_link' using errcode='23514'; end if;
  if (to_jsonb(new)-array['revoked_at','revoked_by','joined'])<>(to_jsonb(old)-array['revoked_at','revoked_by','joined']) then raise exception 'immutable_join_link' using errcode='23514'; end if;
  if old.revoked_at is not null and (new.revoked_at is distinct from old.revoked_at or new.revoked_by is distinct from old.revoked_by) then raise exception 'immutable_join_link' using errcode='23514'; end if;
  if new.joined not in (old.joined,old.joined+1) then raise exception 'immutable_join_link' using errcode='23514'; end if;
  return new;
end; $$;
create trigger assessment_join_link_guard before update or delete on public.assessment_join_links for each row execute function public.assessment_join_link_guard();

create table public.assessment_institution_profiles (
  tenant_id uuid primary key references public.tenants(id),
  display_name text not null check (length(btrim(display_name)) between 2 and 120),
  revision integer not null default 1 check (revision >= 1),
  updated_by uuid not null references public.users(id),
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.assessment_institution_profiles enable row level security;
revoke all on public.assessment_institution_profiles from public,anon,authenticated;
grant select on public.assessment_institution_profiles to service_role;

create function public.assessment_institution_name(p_tenant uuid) returns text language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select display_name from public.assessment_institution_profiles where tenant_id=p_tenant),nullif(to_jsonb(t)->>'name',''),'Institution') from public.tenants t where t.id=p_tenant;
$$;

-- Same result shape as before; the institution's chosen name wins.
create or replace function public.assessment_workspaces(p_actor uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('tenant_id',x.tenant_id,'role',x.role,'tenants',jsonb_build_object('name',public.assessment_institution_name(x.tenant_id))) order by x.tenant_id),'[]')
 from(select distinct on(tenant_id) tenant_id,role from public.assessment_staff_directory where user_id=p_actor and status='active' order by tenant_id,(role in('owner','admin')) desc,role)x;
$$;

alter function public.assessment_command(uuid,uuid,text,text,jsonb) rename to assessment_command_before_join_links;
create function public.assessment_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.assessment_commands;request jsonb;result jsonb;win public.assessment_exam_windows;link public.assessment_join_links;profile public.assessment_institution_profiles;new_code text;label text;
begin
 if p_action not in('join_link.create','join_link.revoke','institution.rename') then
  return public.assessment_command_before_join_links(p_actor,p_tenant,p_key,p_action,p_data);
 end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 if p_actor is null or not exists(select 1 from public.users where id=p_actor) then raise exception 'unauthorized' using errcode='42501';end if;
 perform public.assessment_staff_write_fence(p_tenant,p_actor);
 request:=jsonb_build_object('action',p_action,'data',p_data);
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||p_key,0));
 select * into prior from public.assessment_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if not public.assessment_has_capability(p_tenant,p_actor,case when p_action='institution.rename' then 'team.manage' else 'exams.manage' end) then raise exception 'forbidden' using errcode='42501';end if;
 if p_action='join_link.create' then
  select * into win from public.assessment_exam_windows where tenant_id=p_tenant and id=(p_data->>'window_id')::uuid for update;
  if not found then raise exception 'not_found' using errcode='P0002';end if;
  if win.closes_at<=clock_timestamp() then raise exception 'window_closed' using errcode='23514';end if;
  -- A new link replaces the sitting's current one, so an old forwarded link stops working.
  update public.assessment_join_links set revoked_at=clock_timestamp(),revoked_by=p_actor where window_id=win.id and revoked_at is null;
  new_code:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into public.assessment_join_links(tenant_id,window_id,code,max_joins,created_by)
  values(p_tenant,win.id,new_code,nullif(p_data->>'max_joins','')::integer,p_actor) returning * into link;
  result:=jsonb_build_object('id',link.id,'window_id',link.window_id,'code',link.code,'max_joins',link.max_joins);
  insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,p_action,link.id,jsonb_build_object('window_id',win.id,'max_joins',link.max_joins));
 elsif p_action='join_link.revoke' then
  select * into link from public.assessment_join_links where tenant_id=p_tenant and id=(p_data->>'id')::uuid for update;
  if not found then raise exception 'not_found' using errcode='P0002';end if;
  if link.revoked_at is null then update public.assessment_join_links set revoked_at=clock_timestamp(),revoked_by=p_actor where id=link.id;end if;
  result:=jsonb_build_object('id',link.id,'revoked',true);
  insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,p_action,link.id,jsonb_build_object('window_id',link.window_id,'joined',link.joined));
 else
  label:=btrim(p_data->>'name');
  if label is null or length(label) not between 2 and 120 then raise exception 'invalid_institution_name' using errcode='22023';end if;
  select * into profile from public.assessment_institution_profiles where tenant_id=p_tenant for update;
  if found then
   if (p_data->>'revision')::integer is distinct from profile.revision then raise exception 'stale_revision' using errcode='23505';end if;
   update public.assessment_institution_profiles set display_name=label,revision=revision+1,updated_by=p_actor,updated_at=clock_timestamp() where tenant_id=p_tenant returning * into profile;
  else
   if coalesce((p_data->>'revision')::integer,0)<>0 then raise exception 'stale_revision' using errcode='23505';end if;
   insert into public.assessment_institution_profiles(tenant_id,display_name,updated_by) values(p_tenant,label,p_actor) returning * into profile;
  end if;
  result:=jsonb_build_object('tenant_id',p_tenant,'name',profile.display_name,'revision',profile.revision);
  insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,p_action,p_tenant,jsonb_build_object('name',profile.display_name,'revision',profile.revision));
 end if;
 insert into public.assessment_commands(tenant_id,actor_id,idempotency_key,request,result) values(p_tenant,p_actor,p_key,request,result);
 return result;
end;$$;

-- What a candidate sees before joining: only the sitting and institution.
create function public.assessment_join_preview(p_actor uuid,p_link uuid,p_code text) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare link public.assessment_join_links;win public.assessment_exam_windows;existing uuid;state text;
begin
 if p_actor is null or not exists(select 1 from public.users where id=p_actor) then raise exception 'unauthorized' using errcode='42501';end if;
 select * into link from public.assessment_join_links where id=p_link and code=p_code;
 if not found then raise exception 'join_link_invalid' using errcode='P0002';end if;
 select * into win from public.assessment_exam_windows where id=link.window_id;
 select id into existing from public.assessment_registrations where window_id=win.id and candidate_id=p_actor;
 state:=case when existing is not null then 'joined' when link.revoked_at is not null then 'revoked' when win.closes_at<=clock_timestamp() then 'closed' when link.max_joins is not null and link.joined>=link.max_joins then 'full' else 'open' end;
 return jsonb_build_object('tenant_id',link.tenant_id,'institution',public.assessment_institution_name(link.tenant_id),'title',win.title,'opens_at',win.opens_at,'closes_at',win.closes_at,'state',state,'registration_id',existing);
end;$$;

-- Joining is idempotent by person and sitting: a repeated or concurrent join
-- returns the one registration instead of creating another.
create function public.assessment_join_accept(p_actor uuid,p_link uuid,p_code text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare link public.assessment_join_links;win public.assessment_exam_windows;reg_id uuid;
begin
 if p_actor is null or not exists(select 1 from public.users where id=p_actor) then raise exception 'unauthorized' using errcode='42501';end if;
 select * into link from public.assessment_join_links where id=p_link and code=p_code for update;
 if not found then raise exception 'join_link_invalid' using errcode='P0002';end if;
 select * into win from public.assessment_exam_windows where id=link.window_id;
 select id into reg_id from public.assessment_registrations where window_id=win.id and candidate_id=p_actor;
 if reg_id is not null then return jsonb_build_object('tenant_id',link.tenant_id,'registration_id',reg_id,'reused',true);end if;
 if link.revoked_at is not null then raise exception 'join_link_revoked' using errcode='23514';end if;
 if win.closes_at<=clock_timestamp() then raise exception 'window_closed' using errcode='23514';end if;
 if link.max_joins is not null and link.joined>=link.max_joins then raise exception 'join_link_full' using errcode='23514';end if;
 insert into public.assessment_registrations(tenant_id,window_id,candidate_id,extra_seconds,created_by)
 values(link.tenant_id,win.id,p_actor,0,p_actor) returning id into reg_id;
 update public.assessment_join_links set joined=joined+1 where id=link.id;
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(link.tenant_id,p_actor,'registration.join',reg_id,jsonb_build_object('link_id',link.id,'window_id',win.id));
 return jsonb_build_object('tenant_id',link.tenant_id,'registration_id',reg_id,'reused',false);
end;$$;

-- Institutions where this person has a sitting, so Exam can open without a tenant link.
create function public.assessment_candidate_institutions(p_actor uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('tenant_id',x.tenant_id,'name',public.assessment_institution_name(x.tenant_id)) order by x.tenant_id),'[]')
 from(select distinct tenant_id from public.assessment_registrations where candidate_id=p_actor)x;
$$;

revoke all on function public.assessment_command_before_join_links(uuid,uuid,text,text,jsonb),public.assessment_join_link_guard() from public,anon,authenticated,service_role;
revoke all on function public.assessment_command(uuid,uuid,text,text,jsonb),public.assessment_join_preview(uuid,uuid,text),public.assessment_join_accept(uuid,uuid,text),public.assessment_candidate_institutions(uuid),public.assessment_institution_name(uuid),public.assessment_workspaces(uuid) from public,anon,authenticated;
grant execute on function public.assessment_command(uuid,uuid,text,text,jsonb),public.assessment_join_preview(uuid,uuid,text),public.assessment_join_accept(uuid,uuid,text),public.assessment_candidate_institutions(uuid),public.assessment_workspaces(uuid) to service_role;
commit;
