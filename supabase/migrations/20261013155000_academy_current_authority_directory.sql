-- Directory reads use the same locked current identity/grant sources as writes.
-- This is a private general authority name; importer callers remain compatible.
create or replace function public.academy_authority_scope_ids(p_value jsonb)
returns uuid[] language plpgsql immutable set search_path=public as $$
begin
 if jsonb_typeof(p_value) is distinct from 'array' then return null;end if;
 if exists(select 1 from jsonb_array_elements(p_value) x
  where jsonb_typeof(x) is distinct from 'string' or (x#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return null;end if;
 return array(select distinct (x#>>'{}')::uuid from jsonb_array_elements(p_value) x order by 1);
end;$$;
revoke all on function public.academy_authority_scope_ids(jsonb) from public,anon,authenticated,service_role;

create or replace function public.academy_current_authorities(p_academy_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' as $$
declare v_email text;v_verified boolean;v_parent uuid;v_metadata jsonb;v_type text;v_now timestamptz;v_result jsonb;
begin
 -- Auth-first matches the installed account-closure trigger's lock order.
 select lower(trim(email)),email_confirmed_at is not null into v_email,v_verified
  from auth.users where id=p_actor_id and deleted_at is null
   and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception using errcode='42501',message='Forbidden Academy access';end if;
 perform 1 from public.users where id=p_actor_id and is_active for share;
 if not found then raise exception using errcode='42501',message='Forbidden Academy access';end if;
 select type,metadata into v_type,v_metadata from public.tenants where id=p_academy_id;
 if not found or (v_type='team' or v_metadata->>'service_family'='academy' or v_metadata->>'academy_service'='true' or v_metadata->>'center_owned'='true') is distinct from true then
  raise exception using errcode='42501',message='Forbidden Academy access';end if;
 if v_metadata->>'parent_center_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_parent:=(v_metadata->>'parent_center_id')::uuid;end if;
 perform 1 from public.tenants where id=p_academy_id or id=v_parent order by id for share;
 perform 1 from public.tenant_memberships where user_id=p_actor_id and (tenant_id=p_academy_id or tenant_id=v_parent) order by id for share;
 perform 1 from public.partner_center_profiles where tenant_id=v_parent for share;
 -- Lock matching bindings even when inactive; a concurrent update must settle
 -- before the fresh status/time checks below establish authority.
 perform 1 from public.academy_role_grants where academy_id=p_academy_id
  and (user_id=p_actor_id or(user_id is null and v_verified and lower(trim(email))=v_email)) order by id for share;
 perform 1 from public.academy_staff where academy_id=p_academy_id
  and (user_id=p_actor_id or(user_id is null and v_verified and lower(trim(email))=v_email)) order by id for share;
 perform 1 from public.academy_staff_branch_assignments a where a.academy_id=p_academy_id and exists(
  select 1 from public.academy_staff s where s.academy_id=p_academy_id and s.id=a.staff_id
   and(s.user_id=p_actor_id or(s.user_id is null and v_verified and lower(trim(s.email))=v_email))) order by a.id for share;
 v_now:=clock_timestamp();
 with entries as (
  select 'tenant' source,m.id source_id,m.role,
   case when m.role in('branch_manager','receptionist','salesperson','cashier','parent_liaison') then 'branches'
    when m.role in('teacher','assistant') then 'classrooms' else 'academy' end scope_type,
   '{}'::uuid[] scope_ids,null::timestamptz expires_at
   from public.tenant_memberships m where m.tenant_id=p_academy_id and m.user_id=p_actor_id and m.status='active'
    -- These roles require actual staff/grant assignments. A bare tenant role
    -- must not manufacture academy-wide classroom or branch authority.
  union all
  select 'center',m.id,'center_admin','academy','{}'::uuid[],null::timestamptz
   from public.tenant_memberships m join public.partner_center_profiles cp on cp.tenant_id=m.tenant_id
   join public.tenants t on t.id=p_academy_id
   where m.tenant_id=v_parent and m.user_id=p_actor_id and m.status='active' and m.role in('owner','admin') and cp.status='active'
    and t.metadata->>'parent_center_id'=v_parent::text and t.metadata->>'service_family'='academy'
  union all
  select 'grant',g.id,g.role,g.scope_type,public.academy_authority_scope_ids(g.scope_ids),g.expires_at
   from public.academy_role_grants g where g.academy_id=p_academy_id and g.status='active' and g.starts_at<=v_now and(g.expires_at is null or g.expires_at>v_now)
    and(g.user_id=p_actor_id or(g.user_id is null and v_verified and lower(trim(g.email))=v_email))
  union all
  select 'staff',s.id,s.role,
   case when s.role in('branch_manager','receptionist','salesperson','cashier','parent_liaison') then 'branches'
    when s.role in('teacher','assistant') then 'classrooms' else 'academy' end,
   case when s.role in('branch_manager','receptionist','salesperson','cashier','parent_liaison') then
    array(select distinct a.branch_id from public.academy_staff_branch_assignments a join public.academy_branches b on b.academy_id=a.academy_id and b.id=a.branch_id
     where a.academy_id=p_academy_id and a.staff_id=s.id and a.status='active' and b.is_active
      and a.starts_on<=(v_now at time zone b.timezone)::date and(a.ends_on is null or a.ends_on>=(v_now at time zone b.timezone)::date) order by 1)
    when s.role in('teacher','assistant') then public.academy_authority_scope_ids(coalesce(to_jsonb(s.classroom_ids),'[]'::jsonb)) else '{}'::uuid[] end,null::timestamptz
   from public.academy_staff s where s.academy_id=p_academy_id and s.is_active
    and(s.user_id=p_actor_id or(s.user_id is null and v_verified and lower(trim(s.email))=v_email))
 ) select coalesce(jsonb_agg(jsonb_build_object('source',source,'source_id',source_id,'role',role,'scope_type',scope_type,'scope_ids',scope_ids,'expires_at',expires_at) order by source,source_id),'[]') into v_result
  from entries where scope_ids is not null and scope_type in('academy','branches','classrooms','students')
   and(scope_type<>'academy' or cardinality(scope_ids)=0)
   and(scope_type='academy' or cardinality(scope_ids)>0 or source in('tenant','staff'));
 return v_result;
end;$$;
revoke all on function public.academy_current_authorities(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.academy_directory_role_has(p_role text,p_capability text)
returns boolean language sql immutable set search_path=public as $$
 select p_capability in('viewContacts','viewClassrooms') and p_role in(
  'owner','admin','center_admin','manager','counselor','branch_manager','receptionist',
  'salesperson','cashier','accountant','payroll_officer','parent_liaison','teacher','assistant');
$$;
revoke all on function public.academy_directory_role_has(text,text) from public,anon,authenticated,service_role;

create or replace function public.academy_directory_covers(p_authorities jsonb,p_capability text,p_kind text,
 p_branch_id uuid,p_classroom_id uuid,p_contact_id uuid,p_contact_classes uuid[] default '{}',p_contact_branches uuid[] default '{}')
returns boolean language sql immutable set search_path=public as $$
 select exists(select 1 from jsonb_array_elements(p_authorities) a
  where public.academy_directory_role_has(a->>'role',p_capability) and case a->>'scope_type'
   when 'academy' then true
   when 'branches' then (p_branch_id is not null and a->'scope_ids' @> to_jsonb(array[p_branch_id]))
    or (p_kind='contact' and exists(select 1 from unnest(p_contact_branches) b where a->'scope_ids' @> to_jsonb(array[b])))
   when 'classrooms' then case when p_kind='classroom' then p_classroom_id is not null and a->'scope_ids' @> to_jsonb(array[p_classroom_id])
    when p_kind='contact' then exists(select 1 from unnest(p_contact_classes) c where a->'scope_ids' @> to_jsonb(array[c])) else false end
   when 'students' then p_kind='contact' and p_contact_id is not null and a->'scope_ids' @> to_jsonb(array[p_contact_id])
   else false end);
$$;
revoke all on function public.academy_directory_covers(jsonb,text,text,uuid,uuid,uuid,uuid[],uuid[]) from public,anon,authenticated,service_role;

create or replace function public.academy_scoped_directory(p_academy_id uuid,p_actor_id uuid,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public set statement_timeout='15s' set lock_timeout='5s' as $$
declare v_authorities jsonb;v_capability text;v_limit integer;v_before_time timestamptz;v_before_id uuid;v_query text;
 v_rows jsonb;v_result jsonb;v_count integer;v_key text;v_cursor_field text:='created_at';v_classroom uuid;
begin
 if p_action not in('contacts','classrooms','classroom-memberships') or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'A valid directory request is required';end if;
 v_key:=case when p_action='classroom-memberships' then 'classroom_memberships' else p_action end;
 v_capability:=case when p_action='contacts' then 'viewContacts' else 'viewClassrooms' end;
 v_authorities:=public.academy_current_authorities(p_academy_id,p_actor_id);
 if not exists(select 1 from jsonb_array_elements(v_authorities) a where public.academy_directory_role_has(a->>'role',v_capability)) then
  raise exception using errcode='42501',message='Forbidden directory';end if;
 v_limit:=coalesce((p_payload->>'limit')::integer,case when p_action='classroom-memberships' then 1000 else 300 end);
 if v_limit<1 or v_limit>(case when p_action='classroom-memberships' then 1000 else 300 end) then raise exception 'Choose a valid directory page';end if;
 if p_payload->>'before_time' is not null or p_payload->>'before_id' is not null then
  v_before_time:=(p_payload->>'before_time')::timestamptz;v_before_id:=(p_payload->>'before_id')::uuid;
  if v_before_time is null or v_before_id is null then raise exception 'A complete directory cursor is required';end if;
 end if;
 v_query:=trim(coalesce(p_payload->>'query',''));
 if p_payload->>'classroom_id' is not null then v_classroom:=(p_payload->>'classroom_id')::uuid;end if;
 if length(v_query)>120 then raise exception 'Search is limited to 120 characters';end if;
 v_query:=replace(replace(replace(v_query,'\','\\'),'%','\%'),'_','\_');
 if p_action='contacts' then
  select coalesce(jsonb_agg(x.data order by x.created_at desc,x.id desc),'[]') into v_rows from(
   select c.id,c.created_at,
    (select jsonb_object_agg(e.key,e.value) from jsonb_each(to_jsonb(c)) e where e.key=any(array[
     'id','academy_id','user_id','first_name','last_name','email','phone','telegram_id','status','primary_branch_id',
     'last_activity_at','placement_level','placement_score','lifecycle_stage','notify_enabled','metadata','created_at','updated_at'])) data
   from public.academy_contacts c
   where c.academy_id=p_academy_id
    and(v_before_time is null or row(c.created_at,c.id)<row(v_before_time,v_before_id))
    and(v_query='' or concat_ws(' ',c.first_name,c.last_name,c.email,c.phone) ilike '%'||v_query||'%')
    and public.academy_directory_covers(v_authorities,v_capability,'contact',c.primary_branch_id,null,c.id,
     array(select m.classroom_id from public.academy_classroom_memberships m where m.academy_id=p_academy_id and m.contact_id=c.id
      and m.role in('student','observer') and m.status in('active','trial','paused','completed')),
     array(select k.branch_id from public.academy_classroom_memberships m join public.academy_classrooms k on k.academy_id=m.academy_id and k.id=m.classroom_id
      where m.academy_id=p_academy_id and m.contact_id=c.id and m.role in('student','observer') and m.status in('active','trial','paused','completed')))
   order by c.created_at desc,c.id desc limit v_limit+1
  ) x;
 elsif p_action='classrooms' then
  select coalesce(jsonb_agg(x.data order by x.created_at desc,x.id desc),'[]') into v_rows from(
   select c.id,c.created_at,
    (select jsonb_object_agg(e.key,e.value) from jsonb_each(to_jsonb(c)) e where e.key=any(array[
     'id','academy_id','branch_id','name','description','is_active','created_at','updated_at']))||jsonb_build_object(
      'metadata',case when full_scope.allowed then c.metadata else '{}'::jsonb end,
      'roster_visible',full_scope.allowed,
      'member_count',case when full_scope.allowed then (select count(*) from public.academy_classroom_memberships m
        where m.academy_id=p_academy_id and m.classroom_id=c.id) else null end) data
   from public.academy_classrooms c
   cross join lateral(select public.academy_directory_covers(v_authorities,v_capability,'classroom',c.branch_id,c.id,null) allowed) full_scope
   where c.academy_id=p_academy_id
    and(v_before_time is null or row(c.created_at,c.id)<row(v_before_time,v_before_id))
    and(v_query='' or c.name ilike '%'||v_query||'%')
    and(full_scope.allowed or exists(select 1 from public.academy_classroom_memberships m
     where m.academy_id=p_academy_id and m.classroom_id=c.id and m.role in('student','observer') and m.status in('active','trial','paused','completed')
      and exists(select 1 from jsonb_array_elements(v_authorities) a where a->>'scope_type'='students'
       and public.academy_directory_role_has(a->>'role',v_capability) and a->'scope_ids' @> to_jsonb(array[m.contact_id]))))
   order by c.created_at desc,c.id desc limit v_limit+1
  ) x;
 else
  v_cursor_field:='page_time';
  select coalesce(jsonb_agg(x.data order by x.page_time desc,x.id desc),'[]') into v_rows from(
   select m.id,coalesce(m.joined_at,m.started_at,'0001-01-01'::timestamptz) page_time,
    (select jsonb_object_agg(e.key,e.value) from jsonb_each(to_jsonb(m)) e where e.key=any(array[
     'id','academy_id','classroom_id','contact_id','role','status','joined_at','started_at','completed_at','paused_at','withdrawn_at','expires_at','metadata']))
      ||jsonb_build_object('page_time',coalesce(m.joined_at,m.started_at,'0001-01-01'::timestamptz)) data
   from public.academy_classroom_memberships m join public.academy_classrooms c on c.academy_id=m.academy_id and c.id=m.classroom_id
   where m.academy_id=p_academy_id and(v_classroom is null or m.classroom_id=v_classroom)
    and(v_before_time is null or row(coalesce(m.joined_at,m.started_at,'0001-01-01'::timestamptz),m.id)<row(v_before_time,v_before_id))
    and(public.academy_directory_covers(v_authorities,v_capability,'classroom',c.branch_id,c.id,null)
     or exists(select 1 from jsonb_array_elements(v_authorities) a where a->>'scope_type'='students'
      and public.academy_directory_role_has(a->>'role',v_capability) and a->'scope_ids' @> to_jsonb(array[m.contact_id])))
   order by page_time desc,m.id desc limit v_limit+1
  ) x;
 end if;
 -- The shared grant locks prevent revocation races; this also refuses a lease
 -- ending while a large read runs. The caller never receives an expired scope.
 if public.academy_current_authorities(p_academy_id,p_actor_id) is distinct from v_authorities then
  raise exception using errcode='42501',message='Directory access changed';end if;
 v_count:=jsonb_array_length(v_rows);
 v_result:=jsonb_build_object(v_key,case when v_count>v_limit then v_rows-v_limit else v_rows end,
  'has_more',v_count>v_limit,'cursor',case when v_count>v_limit then
   jsonb_build_object('before_time',v_rows->(v_limit-1)->v_cursor_field,'before_id',v_rows->(v_limit-1)->'id') else null end);
 return v_result;
end;$$;
revoke all on function public.academy_scoped_directory(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.academy_scoped_directory(uuid,uuid,text,jsonb) to service_role;
create index if not exists academy_contacts_directory_page_idx on public.academy_contacts(academy_id,created_at desc,id desc);
create index if not exists academy_classrooms_directory_page_idx on public.academy_classrooms(academy_id,created_at desc,id desc);
