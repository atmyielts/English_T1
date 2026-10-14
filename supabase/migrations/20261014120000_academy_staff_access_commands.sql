-- Explicit provenance: a managed staff profile is an operational record, not
-- another independent grant. Existing legacy profiles are not guessed/backfilled.
begin;
set local lock_timeout='5s';
create unique index if not exists academy_role_grants_academy_identity_idx on public.academy_role_grants(academy_id,id);
alter table public.academy_staff add column managed_grant_id uuid;
alter table public.academy_staff add constraint academy_staff_managed_grant_fk
 foreign key(academy_id,managed_grant_id) references public.academy_role_grants(academy_id,id) on delete restrict;
create unique index academy_staff_managed_grant_idx on public.academy_staff(academy_id,managed_grant_id) where managed_grant_id is not null;

create table public.academy_staff_command_receipts(
 academy_id uuid not null references public.tenants(id) on delete restrict,
 actor_id uuid not null references public.users(id) on delete restrict,
 request_key text not null,action text not null,payload jsonb not null,
 protected_scopes jsonb not null,result jsonb not null,created_at timestamptz not null default now(),
 primary key(academy_id,actor_id,request_key)
);
alter table public.academy_staff_command_receipts enable row level security;
revoke all on public.academy_staff_command_receipts from public,anon,authenticated,service_role;

create or replace function public.academy_staff_profile_scope(p_academy uuid,p_staff uuid)
returns jsonb language plpgsql set search_path=public as $$
declare s public.academy_staff;g public.academy_role_grants;kind text;ids jsonb;
begin
 select * into s from public.academy_staff where academy_id=p_academy and id=p_staff;
 if not found then return null;end if;
 if s.managed_grant_id is not null then
  select * into g from public.academy_role_grants where academy_id=p_academy and id=s.managed_grant_id;
  return jsonb_build_object('type',g.scope_type,'ids',g.scope_ids);
 end if;
 kind:=case when s.role in('teacher','assistant') then 'classrooms'
  when s.role in('branch_manager','receptionist','salesperson','cashier','parent_liaison') then 'branches' else 'academy' end;
 ids:=case when kind='classrooms' then s.classroom_ids when kind='academy' then '[]'::jsonb else
  (select coalesce(jsonb_agg(distinct branch_id),'[]') from public.academy_staff_branch_assignments
   where academy_id=p_academy and staff_id=p_staff and status in('active','paused')) end;
 return jsonb_build_object('type',kind,'ids',ids);
end;$$;
revoke all on function public.academy_staff_profile_scope(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.academy_staff_scope_covers(p_academy uuid,p_authorities jsonb,p_scope jsonb)
returns boolean language plpgsql set search_path=public as $$
declare kind text:=p_scope->>'type';ids uuid[];target uuid;branch uuid;classes uuid[];branches uuid[];
begin
 -- Academy-wide managers may repair malformed legacy scope data in their own
 -- academy. New requested scopes are separately validated before any write.
 if exists(select 1 from jsonb_array_elements(p_authorities) a where a->>'role' in('owner','admin','center_admin') and a->>'scope_type'='academy' and(a->>'expires_at' is null or(a->>'expires_at')::timestamptz>clock_timestamp())) then return true;end if;
 if not exists(select 1 from jsonb_array_elements(p_authorities) a where a->>'role' in('owner','admin','center_admin') and(a->>'expires_at' is null or(a->>'expires_at')::timestamptz>clock_timestamp())) then return false;end if;
 if kind not in('branches','classrooms','students') then return false;end if;
 ids:=public.academy_authority_scope_ids(p_scope->'ids');if ids is null then return false;end if;
 if cardinality(ids)=0 then return false;end if;
 foreach target in array ids loop
  branch:=null;classes:='{}';branches:='{}';
  if kind='branches' then
   perform 1 from public.academy_branches where academy_id=p_academy and id=target for share;if not found then return false;end if;branch:=target;
  elsif kind='classrooms' then
   select branch_id into branch from public.academy_classrooms where academy_id=p_academy and id=target for share;if not found then return false;end if;
   perform 1 from public.academy_branches where academy_id=p_academy and id=branch for share;
  else
   select primary_branch_id into branch from public.academy_contacts where academy_id=p_academy and id=target for share;if not found then return false;end if;
   perform 1 from public.academy_classroom_memberships where academy_id=p_academy and contact_id=target order by id for share;
   perform 1 from public.academy_classrooms c where c.academy_id=p_academy and exists(select 1 from public.academy_classroom_memberships m where m.academy_id=p_academy and m.contact_id=target and m.classroom_id=c.id) order by c.id for share;
   select coalesce(array_agg(distinct m.classroom_id),'{}'),coalesce(array_agg(distinct c.branch_id),'{}') into classes,branches
    from public.academy_classroom_memberships m join public.academy_classrooms c on c.academy_id=m.academy_id and c.id=m.classroom_id
    where m.academy_id=p_academy and m.contact_id=target and m.role in('student','observer') and m.status in('active','trial','paused','completed');
  end if;
  if not exists(select 1 from jsonb_array_elements(p_authorities) a where a->>'role' in('owner','admin','center_admin') and(a->>'expires_at' is null or(a->>'expires_at')::timestamptz>clock_timestamp()) and case a->>'scope_type'
   when 'branches' then (branch is not null and a->'scope_ids' @> to_jsonb(array[branch])) or(kind='students' and exists(select 1 from unnest(branches) b where a->'scope_ids' @> to_jsonb(array[b])))
   when 'classrooms' then (kind='classrooms' and a->'scope_ids' @> to_jsonb(array[target])) or(kind='students' and exists(select 1 from unnest(classes) c where a->'scope_ids' @> to_jsonb(array[c])))
   when 'students' then kind='students' and a->'scope_ids' @> to_jsonb(array[target]) else false end) then return false;end if;
 end loop;
 return true;
end;$$;
revoke all on function public.academy_staff_scope_covers(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.academy_staff_access_command(p_academy_id uuid,p_actor_id uuid,p_action text,p_payload jsonb default '{}',p_request_key text default null)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='20s' as $$
#variable_conflict use_variable
declare auths jsonb;final_auths jsonb;scopes jsonb:='[]';scope jsonb;receipt public.academy_staff_command_receipts;
 g public.academy_role_grants;s public.academy_staff;a public.academy_staff_branch_assignments;
 old_scope jsonb;email text;role text;state text;kind text;ids uuid[];class_ids jsonb;name text;target_id uuid;bound_id uuid;email_user uuid;
 starts timestamptz;expires timestamptz;now_at timestamptz;result jsonb;key text;count_g integer;count_s integer;
 bindings jsonb;locked_users uuid[];before_grant jsonb;before_profile jsonb;
 audit_action text;
 branch_id uuid;branch_timezone text;assignment_role text;assignment_state text;starts_on date;ends_on date;
begin
 if p_action not in('upsert_staff','remove_staff','upsert_staff_branch_assignment') or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>65536 then raise exception using errcode='22023',message='Choose a valid staff command';end if;
 audit_action:=case p_action when 'upsert_staff' then 'staff.upserted' when 'remove_staff' then 'staff.removed' else 'staff.branch_assignment_upserted' end;
 -- Auth first; serialize staff commands before locking grant/profile sources.
 -- A second manager waiting here cannot hold a target grant lock needed by the first.
 perform 1 from auth.users where id=p_actor_id for share;
 perform pg_advisory_xact_lock(hashtextextended('academy:staff:'||p_academy_id::text,0));
 auths:=public.academy_current_authorities(p_academy_id,p_actor_id);
 if not exists(select 1 from jsonb_array_elements(auths) x where x->>'role' in('owner','admin','center_admin')) then raise exception using errcode='42501',message='Forbidden staff management';end if;
 key:=coalesce(nullif(trim(p_request_key),''),'legacy:'||gen_random_uuid()::text);
 if length(key)>160 or key !~ '^[A-Za-z0-9_.:-]+$' then raise exception using errcode='22023',message='Choose a valid request identity';end if;
 select * into receipt from public.academy_staff_command_receipts where academy_id=p_academy_id and actor_id=p_actor_id and request_key=key for update;
 if found then
  if receipt.action<>p_action or receipt.payload is distinct from p_payload then raise exception using errcode='23505',message='This request identity already belongs to another change';end if;
  for scope in select value from jsonb_array_elements(receipt.protected_scopes) loop
   if not public.academy_staff_scope_covers(p_academy_id,auths,scope) then raise exception using errcode='42501',message='Current access no longer covers this receipt';end if;
  end loop;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 now_at:=clock_timestamp();
 if p_payload->>'id' is not null then target_id:=(p_payload->>'id')::uuid;end if;

 -- Resolve/lock target Auth identities before their business bindings, matching
 -- account closure's lock order. Preserve bound identities; never use a body UID.
 with recursive records as (
  select 'grant'::text entity,id,user_id,lower(trim(academy_role_grants.email)) identity_email,null::uuid linked_grant
   from public.academy_role_grants where academy_id=p_academy_id
  union all select 'staff',id,user_id,lower(trim(academy_staff.email)),managed_grant_id from public.academy_staff where academy_id=p_academy_id
 ), related as (
  select * from records where id=target_id or id=nullif(p_payload->>'staff_id','')::uuid
   or identity_email=lower(trim(coalesce(p_payload->>'staff_email',p_payload->>'email','')))
  union select r.* from records r join related x on r.identity_email=x.identity_email
   or(r.entity='staff' and x.entity='grant' and r.linked_grant=x.id)
   or(r.entity='grant' and x.entity='staff' and x.linked_grant=r.id)
 ) select coalesce(jsonb_agg(to_jsonb(related)),'[]') into bindings from related;
 select coalesce(array_agg(locked.id),'{}') into locked_users from (
  select u.id from auth.users u where u.id in(select (x->>'user_id')::uuid from jsonb_array_elements(bindings) x)
   or lower(trim(u.email))=lower(trim(coalesce(p_payload->>'staff_email',p_payload->>'email','')))
  order by u.id for share
 ) locked;
 perform 1 from public.users where id=any(locked_users) order by id for share;
 perform 1 from public.academy_role_grants where academy_id=p_academy_id and id in(
  select (x->>'id')::uuid from jsonb_array_elements(bindings) x where x->>'entity'='grant') order by id for update;
 perform 1 from public.academy_staff where academy_id=p_academy_id and id in(
  select (x->>'id')::uuid from jsonb_array_elements(bindings) x where x->>'entity'='staff') order by id for update;

 if p_action='upsert_staff' then
  email:=lower(trim(coalesce(p_payload->>'staff_email',p_payload->>'email','')));
  if email='' or length(email)>254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception using errcode='22023',message='A valid staff email is required';end if;
  -- Lock both independently-existing records. Never merge ambiguous identities.
  perform 1 from public.academy_role_grants where academy_id=p_academy_id and(id=target_id or lower(trim(academy_role_grants.email))=email) order by id for update;
  perform 1 from public.academy_staff where academy_id=p_academy_id and(id=target_id or managed_grant_id=target_id or lower(trim(academy_staff.email))=email) order by id for update;
  if target_id is not null then
   select * into g from public.academy_role_grants where academy_id=p_academy_id and id=target_id;
   select count(*) into count_s from public.academy_staff where academy_id=p_academy_id and(id=target_id or managed_grant_id=g.id);
   if count_s>1 then raise exception using errcode='23505',message='Multiple staff identities need manual review';end if;
   select * into s from public.academy_staff where academy_id=p_academy_id and(id=target_id or managed_grant_id=g.id);
   if g.id is null and s.id is null then raise exception using errcode='P0002',message='Staff record not found';end if;
   if g.id is null and s.managed_grant_id is not null then select * into g from public.academy_role_grants where academy_id=p_academy_id and id=s.managed_grant_id;end if;
  else
   select count(*) into count_g from public.academy_role_grants where academy_id=p_academy_id and lower(trim(academy_role_grants.email))=email;
   select count(*) into count_s from public.academy_staff where academy_id=p_academy_id and lower(trim(academy_staff.email))=email;
   if count_g>1 or count_s>1 then raise exception using errcode='23505',message='Multiple staff identities need manual review';end if;
   select * into g from public.academy_role_grants where academy_id=p_academy_id and lower(trim(academy_role_grants.email))=email;
   select * into s from public.academy_staff where academy_id=p_academy_id and lower(trim(academy_staff.email))=email;
  end if;
  if g.id is not null and s.id is null then
   select count(*) into count_s from public.academy_staff where academy_id=p_academy_id and lower(trim(academy_staff.email))=lower(trim(g.email));
   if count_s>1 then raise exception using errcode='23505',message='Multiple staff identities need manual review';end if;
   select * into s from public.academy_staff where academy_id=p_academy_id and lower(trim(academy_staff.email))=lower(trim(g.email)) for update;
  end if;
  if s.id is not null and g.id is null then
   select count(*) into count_g from public.academy_role_grants where academy_id=p_academy_id and lower(trim(academy_role_grants.email))=lower(trim(s.email));
   if count_g>1 then raise exception using errcode='23505',message='Multiple staff identities need manual review';end if;
   select * into g from public.academy_role_grants where academy_id=p_academy_id and lower(trim(academy_role_grants.email))=lower(trim(s.email)) for update;
  end if;
  if exists(select 1 from public.academy_role_grants x where x.academy_id=p_academy_id and lower(trim(x.email))=email and x.id is distinct from g.id)
   or exists(select 1 from public.academy_staff x where x.academy_id=p_academy_id and lower(trim(x.email))=email and x.id is distinct from s.id)
   or(s.managed_grant_id is not null and s.managed_grant_id is distinct from g.id)
   or(g.user_id is not null and s.user_id is not null and g.user_id<>s.user_id) then raise exception using errcode='23505',message='This email belongs to a different staff identity';end if;
  if g.id is not null then scopes:=scopes||jsonb_build_array(jsonb_build_object('type',g.scope_type,'ids',g.scope_ids));end if;
  if s.id is not null then scopes:=scopes||jsonb_build_array(public.academy_staff_profile_scope(p_academy_id,s.id));end if;
  role:=coalesce(p_payload->>'staff_role',p_payload->>'role',g.role,s.role,'teacher');
  if role not in('admin','center_admin','branch_manager','manager','counselor','receptionist','salesperson','cashier','accountant','payroll_officer','parent_liaison','teacher','assistant') then raise exception using errcode='22023',message='Choose a valid staff role';end if;
  kind:=coalesce(p_payload->>'scope_type',case when p_payload ? 'scope_ids' then g.scope_type end,
   g.scope_type,
   case when role in('teacher','assistant') then 'classrooms' when role in('branch_manager','receptionist','salesperson','cashier','parent_liaison') then 'branches' else 'academy' end);
  scope:=case when p_payload ? 'scope_ids' then p_payload->'scope_ids'
   when kind='classrooms' and p_payload ? 'classroom_ids' then p_payload->'classroom_ids'
   when kind='branches' and p_payload ? 'branch_ids' then p_payload->'branch_ids'
   when kind=g.scope_type then g.scope_ids
   when kind='classrooms' then coalesce(s.classroom_ids,'[]')
   when kind='branches' and s.id is not null then public.academy_staff_profile_scope(p_academy_id,s.id)->'ids' else '[]'::jsonb end;
  ids:=public.academy_authority_scope_ids(scope);
  if kind not in('academy','branches','classrooms','students') or ids is null or cardinality(ids)>500
   or(kind='academy' and cardinality(ids)<>0) or(role in('teacher','assistant') and kind<>'academy' and cardinality(ids)=0) then raise exception using errcode='22023',message='Choose valid staff access resources';end if;
  perform 1 from public.academy_branches where academy_id=p_academy_id and kind='branches' and id=any(ids) order by id for share;
  perform 1 from public.academy_classrooms where academy_id=p_academy_id and kind='classrooms' and id=any(ids) order by id for share;
  perform 1 from public.academy_contacts where academy_id=p_academy_id and kind='students' and id=any(ids) order by id for share;
  if (kind='branches' and exists(select 1 from unnest(ids) i where not exists(select 1 from public.academy_branches where academy_id=p_academy_id and id=i and is_active)))
   or(kind='classrooms' and exists(select 1 from unnest(ids) i where not exists(select 1 from public.academy_classrooms where academy_id=p_academy_id and id=i)))
   or(kind='students' and exists(select 1 from unnest(ids) i where not exists(select 1 from public.academy_contacts where academy_id=p_academy_id and id=i))) then raise exception using errcode='22023',message='Staff resources must belong to this Academy';end if;
  scope:=jsonb_build_object('type',kind,'ids',to_jsonb(ids));scopes:=scopes||jsonb_build_array(scope);
  state:=coalesce(p_payload->>'status',case when p_payload->>'is_active'='false' then 'suspended' end,g.status,'invited');
  if state not in('invited','active','suspended','expired','revoked') then raise exception using errcode='22023',message='Choose a valid access status';end if;
  starts:=case when p_payload ? 'starts_at' then coalesce(nullif(p_payload->>'starts_at','')::timestamptz,now_at) else coalesce(g.starts_at,now_at) end;
  expires:=case when p_payload ? 'expires_at' then nullif(p_payload->>'expires_at','')::timestamptz else g.expires_at end;
  if expires is not null and expires<=starts then raise exception using errcode='22023',message='Access expiry must be after its start';end if;
  name:=case when p_payload ? 'name' or p_payload ? 'display_name' then nullif(trim(coalesce(p_payload->>'name',p_payload->>'display_name')),'') else coalesce(g.display_name,s.display_name) end;
  if length(name)>160 then raise exception using errcode='22023',message='Staff name is limited to 160 characters';end if;
  bound_id:=coalesce(g.user_id,s.user_id);
  select count(*) into count_g from auth.users u join public.users p on p.id=u.id and p.is_active
   where lower(trim(u.email))=email and u.email_confirmed_at is not null and u.deleted_at is null and(u.banned_until is null or u.banned_until<=now_at);
  if count_g>1 then raise exception using errcode='23505',message='Multiple verified accounts need manual identity review';end if;
  select u.id into email_user from auth.users u join public.users p on p.id=u.id and p.is_active
   where lower(trim(u.email))=email and u.email_confirmed_at is not null and u.deleted_at is null and(u.banned_until is null or u.banned_until<=now_at);
  if bound_id is not null and email_user is not null and bound_id<>email_user then raise exception using errcode='23505',message='A bound staff account cannot be reassigned by email';end if;
  bound_id:=coalesce(bound_id,email_user);
  if bound_id is not null and not bound_id=any(locked_users) then raise exception using errcode='23505',message='Staff identity changed; reload before saving';end if;
  if bound_id is not null and state in('active','invited') and not exists(select 1 from auth.users u join public.users p on p.id=u.id
   where u.id=bound_id and p.is_active and u.deleted_at is null and(u.banned_until is null or u.banned_until<=clock_timestamp())) then
   raise exception using errcode='23505',message='A closed staff account cannot be reactivated';end if;
  for old_scope in select value from jsonb_array_elements(scopes) loop
   if not public.academy_staff_scope_covers(p_academy_id,auths,old_scope) then raise exception using errcode='42501',message='Current access must cover both existing and requested staff resources';end if;
  end loop;
  class_ids:=case when kind='classrooms' then to_jsonb(ids) else '[]'::jsonb end;
  before_grant:=case when g.id is not null then to_jsonb(g) end;before_profile:=case when s.id is not null then to_jsonb(s) end;
  if g.id is null then
   insert into public.academy_role_grants(academy_id,user_id,email,display_name,role,scope_type,scope_ids,status,granted_by,starts_at,expires_at,accepted_at,revoked_by,revoked_at,metadata)
    values(p_academy_id,bound_id,email,name,role,kind,to_jsonb(ids),state,p_actor_id,starts,expires,case when state='active' and bound_id is not null then now_at end,case when state='revoked' then p_actor_id end,case when state='revoked' then now_at end,'{"managed_from":"atomic_staff_command"}') returning * into g;
  else
   update public.academy_role_grants set user_id=bound_id,email=email,display_name=name,role=role,scope_type=kind,scope_ids=to_jsonb(ids),status=state,
    starts_at=starts,expires_at=expires,accepted_at=case when state='active' and bound_id is not null then coalesce(accepted_at,now_at) else accepted_at end,
    revoked_by=case when state='revoked' then p_actor_id end,revoked_at=case when state='revoked' then coalesce(revoked_at,now_at) end,
    metadata=metadata||'{"managed_from":"atomic_staff_command"}',updated_at=now_at where academy_id=p_academy_id and id=g.id returning * into g;
  end if;
  if s.id is null then
   insert into public.academy_staff(academy_id,user_id,email,display_name,role,classroom_ids,is_active,created_by,managed_grant_id)
    values(p_academy_id,bound_id,email,name,role,class_ids,state in('active','invited'),p_actor_id,g.id) returning * into s;
  else
   update public.academy_staff set user_id=bound_id,email=email,display_name=name,role=role,classroom_ids=class_ids,is_active=state in('active','invited'),managed_grant_id=g.id,updated_at=now_at
    where academy_id=p_academy_id and id=s.id returning * into s;
  end if;
  -- A declared branch grant establishes dated physical assignments; the current
  -- authority resolver still intersects them with the grant's explicit envelope.
  if kind='branches' then
   assignment_role:=case when role in('branch_manager','salesperson','cashier','accountant','payroll_officer','parent_liaison','teacher','assistant') then role else 'support' end;
   insert into public.academy_staff_branch_assignments(academy_id,staff_id,branch_id,assignment_role,starts_on,status,created_by)
    select p_academy_id,s.id,b.id,assignment_role,(now_at at time zone b.timezone)::date,'active',p_actor_id from public.academy_branches b
    where b.academy_id=p_academy_id and b.id=any(ids) and not exists(select 1 from public.academy_staff_branch_assignments x where x.academy_id=p_academy_id and x.staff_id=s.id and x.branch_id=b.id and x.status in('active','paused'));
  end if;
  result:=jsonb_build_object('grant',to_jsonb(g),'staff_profile',to_jsonb(s));
 elsif p_action='remove_staff' then
  if target_id is null then raise exception using errcode='22023',message='Staff identity is required';end if;
  select * into g from public.academy_role_grants where academy_id=p_academy_id and id=target_id for update;
  select count(*) into count_s from public.academy_staff where academy_id=p_academy_id and(id=target_id or managed_grant_id=g.id);
  if count_s>1 then raise exception using errcode='23505',message='Multiple staff identities need manual review';end if;
  select * into s from public.academy_staff where academy_id=p_academy_id and(id=target_id or managed_grant_id=g.id) for update;
  if g.id is null and s.id is null then raise exception using errcode='P0002',message='Staff record not found';end if;
  if g.id is null and s.managed_grant_id is not null then select * into g from public.academy_role_grants where academy_id=p_academy_id and id=s.managed_grant_id for update;end if;
  if g.id is not null and s.id is null then
   select count(*) into count_s from public.academy_staff where academy_id=p_academy_id and lower(trim(academy_staff.email))=lower(trim(g.email));
   if count_s>1 then raise exception using errcode='23505',message='Multiple staff identities need manual review';end if;
   select * into s from public.academy_staff where academy_id=p_academy_id and lower(trim(academy_staff.email))=lower(trim(g.email)) for update;
  end if;
  if s.id is not null and g.id is null then
   select count(*) into count_g from public.academy_role_grants where academy_id=p_academy_id and lower(trim(academy_role_grants.email))=lower(trim(s.email));
   if count_g>1 then raise exception using errcode='23505',message='Multiple staff identities need manual review';end if;
   select * into g from public.academy_role_grants where academy_id=p_academy_id and lower(trim(academy_role_grants.email))=lower(trim(s.email)) for update;
  end if;
  if (g.user_id is not null and s.user_id is not null and g.user_id<>s.user_id) or(s.managed_grant_id is not null and s.managed_grant_id is distinct from g.id) then raise exception using errcode='23505',message='Conflicting staff identities need manual review';end if;
  if g.id is not null then scopes:=scopes||jsonb_build_array(jsonb_build_object('type',g.scope_type,'ids',g.scope_ids));end if;
  if s.id is not null then scopes:=scopes||jsonb_build_array(public.academy_staff_profile_scope(p_academy_id,s.id));end if;
  for scope in select value from jsonb_array_elements(scopes) loop
   if not public.academy_staff_scope_covers(p_academy_id,auths,scope) then raise exception using errcode='42501',message='Current access does not cover this staff identity';end if;
  end loop;
  before_grant:=case when g.id is not null then to_jsonb(g) end;before_profile:=case when s.id is not null then to_jsonb(s) end;
  if g.id is not null then update public.academy_role_grants set status='revoked',revoked_by=p_actor_id,revoked_at=coalesce(revoked_at,now_at),updated_at=now_at where academy_id=p_academy_id and id=g.id returning * into g;end if;
  if s.id is not null then update public.academy_staff set is_active=false,updated_at=now_at where academy_id=p_academy_id and id=s.id returning * into s;end if;
  result:=jsonb_build_object('ok',true,'grant',case when g.id is not null then to_jsonb(g) end,'staff_profile',case when s.id is not null then to_jsonb(s) end);
 else
  branch_id:=(p_payload->>'branch_id')::uuid;target_id:=(p_payload->>'staff_id')::uuid;
  if branch_id is null or target_id is null then raise exception using errcode='22023',message='Staff and branch are required';end if;
  select * into s from public.academy_staff where academy_id=p_academy_id and id=target_id for update;if not found then raise exception using errcode='P0002',message='Staff record not found';end if;
  if s.managed_grant_id is not null then select * into g from public.academy_role_grants where academy_id=p_academy_id and id=s.managed_grant_id for update;end if;
  before_grant:=case when g.id is not null then to_jsonb(g) end;before_profile:=to_jsonb(s);
  scope:=public.academy_staff_profile_scope(p_academy_id,s.id);scopes:=jsonb_build_array(scope);
  if not public.academy_staff_scope_covers(p_academy_id,auths,scope) then raise exception using errcode='42501',message='Current access does not cover this staff identity';end if;
  select timezone into branch_timezone from public.academy_branches where academy_id=p_academy_id and id=branch_id and is_active for share;if not found then raise exception using errcode='22023',message='Choose an active Academy branch';end if;
  assignment_role:=coalesce(p_payload->>'assignment_role','support');assignment_state:=coalesce(p_payload->>'status','active');
  if assignment_role not in('branch_manager','salesperson','cashier','accountant','payroll_officer','parent_liaison','academic_operator','teacher','assistant','support') or assignment_state not in('active','paused','ended') then raise exception using errcode='22023',message='Choose a valid branch assignment';end if;
  old_scope:=jsonb_build_object('type','branches','ids',jsonb_build_array(branch_id));
  -- Classroom managers may attach their teacher to that class's physical branch;
  -- this never creates branch-wide access or changes a classroom grant envelope.
  if not public.academy_staff_scope_covers(p_academy_id,auths,old_scope) then
   if s.role not in('teacher','assistant') or assignment_role not in('teacher','assistant') or scope->>'type'<>'classrooms'
    or not exists(select 1 from public.academy_classrooms c where c.academy_id=p_academy_id and c.branch_id=branch_id and scope->'ids' @> jsonb_build_array(c.id))
    or not public.academy_staff_scope_covers(p_academy_id,auths,scope) then raise exception using errcode='42501',message='Current access does not cover this physical branch assignment';end if;
  else scopes:=scopes||jsonb_build_array(old_scope);end if;
  starts_on:=coalesce(nullif(p_payload->>'starts_on','')::date,(now_at at time zone branch_timezone)::date);ends_on:=nullif(p_payload->>'ends_on','')::date;
  if ends_on is not null and ends_on<starts_on then raise exception using errcode='22023',message='Assignment end must follow its start';end if;
  if p_payload ? 'id' then
   select * into a from public.academy_staff_branch_assignments where academy_id=p_academy_id and id=(p_payload->>'id')::uuid for update;
   if not found or a.staff_id<>s.id or a.branch_id<>branch_id or a.assignment_role<>assignment_role or a.starts_on<>starts_on then raise exception using errcode='23505',message='An existing branch assignment identity cannot be moved';end if;
  else select * into a from public.academy_staff_branch_assignments where academy_id=p_academy_id and staff_id=s.id and academy_staff_branch_assignments.branch_id=branch_id and academy_staff_branch_assignments.assignment_role=assignment_role and academy_staff_branch_assignments.starts_on=starts_on for update;end if;
  if not public.academy_staff_scope_covers(p_academy_id,auths,scope) then raise exception using errcode='42501',message='Current access does not cover this staff identity';end if;
  if a.id is null then insert into public.academy_staff_branch_assignments(academy_id,staff_id,branch_id,assignment_role,is_primary,starts_on,ends_on,status,created_by)
   values(p_academy_id,s.id,branch_id,assignment_role,coalesce((p_payload->>'is_primary')::boolean,false),starts_on,ends_on,assignment_state,p_actor_id) returning * into a;
  else update public.academy_staff_branch_assignments set is_primary=coalesce((p_payload->>'is_primary')::boolean,false),ends_on=ends_on,status=assignment_state,updated_at=now_at where academy_id=p_academy_id and id=a.id returning * into a;end if;
  if g.id is not null and g.scope_type='branches' then
   update public.academy_role_grants set scope_ids=(select to_jsonb(array(select distinct i from unnest(public.academy_authority_scope_ids(g.scope_ids)||array[branch_id]) i order by i))),updated_at=now_at where academy_id=p_academy_id and id=g.id returning * into g;
  end if;
  result:=jsonb_build_object('assignment',to_jsonb(a));
 end if;
 if (g.user_id is not null and not g.user_id=any(locked_users)) or(s.user_id is not null and not s.user_id=any(locked_users)) then
  raise exception using errcode='23505',message='Staff identity changed; reload before saving';end if;
 insert into public.academy_access_audit_logs(academy_id,actor_user_id,target_user_id,target_email,action,role,previous_status,next_status,scope_type,scope_ids,metadata)
  values(p_academy_id,p_actor_id,coalesce(g.user_id,s.user_id),coalesce(g.email,s.email),audit_action,coalesce(g.role,s.role),
   coalesce(before_grant->>'status',case when before_profile->>'is_active'='true' then 'active' when before_profile is not null then 'suspended' end),
   coalesce(g.status,case when s.is_active then 'active' else 'suspended' end),g.scope_type,coalesce(g.scope_ids,'[]'),
   jsonb_build_object('request_key',key,'before_grant',before_grant,'before_profile',before_profile,'grant_id',g.id,'staff_id',s.id,'assignment_id',a.id));
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_academy_id,p_actor_id,audit_action,case when p_action='upsert_staff_branch_assignment' then 'academy_staff_branch_assignments' else 'academy_role_grants' end,coalesce(a.id,g.id,s.id)::text,jsonb_build_object('request_key',key,'protected_scopes',scopes));
 -- Lease expiry during a write is checked before any receipt or effects commit.
 perform public.academy_current_authorities(p_academy_id,p_actor_id);
 -- Original sources remain locked. An intentional self-downgrade/revocation
 -- does not invalidate its own command; their original leases must still cover
 -- all protected resources at this final check.
 final_auths:=auths;
 for scope in select value from jsonb_array_elements(scopes) loop
  if not public.academy_staff_scope_covers(p_academy_id,final_auths,scope) then raise exception using errcode='42501',message='Staff management access changed';end if;
 end loop;
 insert into public.academy_staff_command_receipts(academy_id,actor_id,request_key,action,payload,protected_scopes,result)
  values(p_academy_id,p_actor_id,key,p_action,p_payload,scopes,result);
 return result||jsonb_build_object('replayed',false);
end;$$;
revoke all on function public.academy_staff_access_command(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.academy_staff_access_command(uuid,uuid,text,jsonb,text) to service_role;

create or replace function public.academy_staff_directory(p_academy_id uuid,p_actor_id uuid,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='20s' as $$
declare auths jsonb;final_auths jsonb;rows jsonb;page jsonb;row jsonb;scope jsonb;page_limit integer:=coalesce((p_payload->>'limit')::integer,300);
 after_source text:=p_payload->>'after_source';after_id uuid:=(p_payload->>'after_id')::uuid;more boolean;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' or page_limit<1 or page_limit>500
  or(after_source is null)<>(after_id is null) or(after_source is not null and after_source not in('grant','staff')) then
  raise exception using errcode='22023',message='Choose a valid staff directory page';end if;
 auths:=public.academy_current_authorities(p_academy_id,p_actor_id);
 if not exists(select 1 from jsonb_array_elements(auths) x where x->>'role' in('owner','admin','center_admin')) then
  raise exception using errcode='42501',message='Forbidden staff management';end if;
 -- Filter complete original management envelopes before pagination. A narrow
 -- grant cannot conceal an independently-existing wider legacy staff profile.
 with records as (
  select 'grant'::text source,g.id,to_jsonb(g)||jsonb_build_object('source','grant','staff_id',
    (select s.id from public.academy_staff s where s.academy_id=p_academy_id and s.managed_grant_id=g.id)) value,
   jsonb_build_array(jsonb_build_object('type',g.scope_type,'ids',g.scope_ids))||coalesce((
    select jsonb_agg(public.academy_staff_profile_scope(p_academy_id,s.id)) from public.academy_staff s where s.academy_id=p_academy_id
     and(s.managed_grant_id=g.id or(s.managed_grant_id is null and lower(trim(s.email))=lower(trim(g.email))))),'[]') scopes
   from public.academy_role_grants g where g.academy_id=p_academy_id
  union all select 'staff',s.id,to_jsonb(s)||jsonb_build_object('source','staff','status',case when s.is_active then 'active' else 'suspended' end,
    'scope_type',public.academy_staff_profile_scope(p_academy_id,s.id)->>'type','scope_ids',public.academy_staff_profile_scope(p_academy_id,s.id)->'ids'),
   jsonb_build_array(public.academy_staff_profile_scope(p_academy_id,s.id)) from public.academy_staff s
   where s.academy_id=p_academy_id and s.managed_grant_id is null and not exists(select 1 from public.academy_role_grants g
    where g.academy_id=p_academy_id and lower(trim(g.email))=lower(trim(s.email)))
 ), eligible as (
  select * from records where (after_source is null or(source,id)>(after_source,after_id))
   and not exists(select 1 from jsonb_array_elements(scopes) target where not public.academy_staff_scope_covers(p_academy_id,auths,target))
  order by source,id limit page_limit+1
 ) select coalesce(jsonb_agg(jsonb_build_object('value',value,'scopes',scopes) order by source,id),'[]') into rows from eligible;
 more:=jsonb_array_length(rows)>page_limit;
 select coalesce(jsonb_agg(value order by ordinal),'[]') into page from jsonb_array_elements(rows) with ordinality x(value,ordinal) where ordinal<=page_limit;
 final_auths:=public.academy_current_authorities(p_academy_id,p_actor_id);
 for row in select value from jsonb_array_elements(page) loop
  for scope in select value from jsonb_array_elements(row->'scopes') loop
   if not public.academy_staff_scope_covers(p_academy_id,final_auths,scope) then raise exception using errcode='42501',message='Staff directory access changed';end if;
  end loop;
 end loop;
 return jsonb_build_object('staff',(select coalesce(jsonb_agg(x->'value'),'[]') from jsonb_array_elements(page) x),'has_more',more,
  'cursor',case when more then jsonb_build_object('after_source',page->(page_limit-1)->'value'->>'source','after_id',page->(page_limit-1)->'value'->>'id') else null end);
end;$$;
revoke all on function public.academy_staff_directory(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.academy_staff_directory(uuid,uuid,jsonb) to service_role;
commit;
