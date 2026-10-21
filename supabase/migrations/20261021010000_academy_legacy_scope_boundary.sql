-- Service-only compatibility boundary for the existing legacy handlers.
-- Existing private commands keep their own transaction/receipt authority.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
create table public.academy_legacy_boundary_actions(
 action text not null, mode text not null check(mode in('read','write')),
 capabilities text[] not null check(cardinality(capabilities)>0), primary key(action,mode)
);
create table public.academy_legacy_boundary_relations(
 name text primary key, relation_id regclass not null, view_name text not null unique,
 shared_read boolean not null default false, minimum_read_caps text[] not null default '{}', edges jsonb not null default '[]'
);
create table public.academy_legacy_resource_origins(
 academy_id uuid not null, relation_name text not null, resource_id uuid not null,
 classroom_id uuid not null, created_by uuid not null, created_at timestamptz not null default clock_timestamp(),
 primary key(academy_id,relation_name,resource_id)
);
create table public.academy_legacy_scope_generations(
 academy_id uuid primary key references public.tenants(id) on delete cascade,
 revision bigint not null default 0
);
alter table public.academy_legacy_boundary_actions enable row level security;
alter table public.academy_legacy_boundary_relations enable row level security;
alter table public.academy_legacy_resource_origins enable row level security;
alter table public.academy_legacy_scope_generations enable row level security;
revoke all on public.academy_legacy_boundary_actions,public.academy_legacy_boundary_relations,public.academy_legacy_resource_origins,public.academy_legacy_scope_generations from public,anon,authenticated,service_role;

create function public.academy_legacy_boundary_context(p_relationships boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public set lock_timeout='5s' as $$
declare h jsonb;claims jsonb;academy uuid;actor uuid;branch uuid;classroom uuid;act text;v_mode text;caps text[];authorities jsonb;entries jsonb;generation bigint;
begin
 h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
 if coalesce(claims->>'role',current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception using errcode='42501',message='Private Academy boundary';end if;
 if coalesce(h->>'x-schood-legacy-academy','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or coalesce(h->>'x-schood-legacy-actor','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception using errcode='42501',message='Private Academy boundary';end if;
 academy:=(h->>'x-schood-legacy-academy')::uuid;actor:=(h->>'x-schood-legacy-actor')::uuid;act:=h->>'x-schood-legacy-action';v_mode:=h->>'x-schood-legacy-mode';
 select capabilities into caps from public.academy_legacy_boundary_actions where action=act and academy_legacy_boundary_actions.mode=v_mode;
 if caps is null then raise exception using errcode='42501',message='Unknown Academy boundary action';end if;
 if h?'x-schood-legacy-branch' then branch:=(h->>'x-schood-legacy-branch')::uuid;end if;
 if h?'x-schood-legacy-classroom' then classroom:=(h->>'x-schood-legacy-classroom')::uuid;end if;
 if v_mode='read' and current_setting('transaction_read_only')='on' then
  authorities:=public.academy_legacy_read_authorities(academy,actor);
 else authorities:=public.academy_current_authorities(academy,actor);end if;
 select coalesce(jsonb_agg(a order by a->>'source',a->>'source_id'),'[]') into entries from jsonb_array_elements(authorities) a
 where exists(select 1 from unnest(caps) c where public.academy_command_role_has(a->>'role',c));
 if jsonb_array_length(entries)=0 then raise exception using errcode='42501',message='Current access does not cover this Academy action';end if;
 if branch is not null and not exists(select 1 from public.academy_branches where academy_id=academy and id=branch) then raise exception using errcode='42501',message='Current access does not cover this branch';end if;
 if classroom is not null and not exists(select 1 from public.academy_classrooms where academy_id=academy and id=classroom) then raise exception using errcode='42501',message='Current access does not cover this classroom';end if;
 -- A topology change must settle before a response can reuse a prior scope.
 if v_mode='read' and current_setting('transaction_read_only')='off' then
  select revision into generation from public.academy_legacy_scope_generations where academy_id=academy for share;
 else select revision into generation from public.academy_legacy_scope_generations where academy_id=academy;end if;
 return jsonb_build_object('academy_id',academy,'actor_id',actor,'action',act,'mode',v_mode,'capabilities',caps,'authorities',authorities,'entries',entries,
  'branch_id',branch,'classroom_id',classroom,'generation',coalesce(generation,0),
  'relationships',case when p_relationships then (
    select coalesce(jsonb_object_agg(name,targets),'{}') from (
      select name,jsonb_object_agg(target,hint) targets from (
        select r.name,e->>'table' target,(array_agg(e->>'constraint' order by jsonb_array_length(e->'columns') desc,e->>'constraint'))[1] hint
        from public.academy_legacy_boundary_relations r cross join lateral jsonb_array_elements(r.edges) e
        group by r.name,e->>'table'
        having count(distinct(select string_agg(pair->>'from'||'>'||(pair->>'to'),',' order by pair->>'from') from jsonb_array_elements(e->'columns') pair where pair->>'from'<>'academy_id'))=1
      ) hints group by name
    ) grouped
  ) else '{}'::jsonb end);
end;$$;
revoke all on function public.academy_legacy_boundary_context(boolean) from public,anon,authenticated;
grant execute on function public.academy_legacy_boundary_context(boolean) to service_role;

create function public.academy_legacy_uuid(value text)
returns uuid language sql immutable set search_path=pg_catalog,public as $$
 select case when value~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then value::uuid end;
$$;
revoke all on function public.academy_legacy_uuid(text) from public,anon,authenticated,service_role;

create function public.academy_legacy_contact_scope(academy uuid,contact uuid,classroom uuid default null,selected_branch uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare home uuid;classes uuid[];branches uuid[];class_branch uuid;
begin
 select primary_branch_id into home from public.academy_contacts where academy_id=academy and id=contact;
 if not found then return null;end if;
 if classroom is not null then
  select branch_id into class_branch from public.academy_classrooms where academy_id=academy and id=classroom;
  if not found or(selected_branch is not null and selected_branch is distinct from class_branch) then return null;end if;
  return jsonb_build_object('kind','contact','contact_id',contact,'classroom_ids',jsonb_build_array(classroom),'branch_id',class_branch,'branch_ids',case when class_branch is null then '[]'::jsonb else jsonb_build_array(class_branch) end);
 end if;
 select coalesce(array_agg(distinct m.classroom_id),'{}'),coalesce(array_agg(distinct c.branch_id) filter(where c.branch_id is not null),'{}') into classes,branches
 from public.academy_classroom_memberships m join public.academy_classrooms c on c.academy_id=m.academy_id and c.id=m.classroom_id
 where m.academy_id=academy and m.contact_id=contact and m.role in('student','observer') and m.status in('active','trial','paused','completed');
 if home is not null then branches:=array_append(branches,home);end if;
 return jsonb_build_object('kind','contact','contact_id',contact,'classroom_ids',classes,'branch_id',home,'branch_ids',branches);
end;$$;
revoke all on function public.academy_legacy_contact_scope(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.academy_legacy_row_scopes(ctx jsonb,relation_name text,row_data jsonb,seen text[] default '{}',depth integer default 0)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare academy uuid:=(ctx->>'academy_id')::uuid;branch uuid;classroom uuid;contact uuid;identifier uuid;row_academy uuid;
 scopes jsonb:='[]';scope jsonb;edge jsonb;parent jsonb;predicate text;column_pair jsonb;key text;origin record;staff record;course uuid;user_id uuid;target regclass;
begin
 if depth>6 or cardinality(seen)>30 or row_data is null then return '[]';end if;
 identifier:=public.academy_legacy_uuid(row_data->>'id');key:=relation_name||':'||coalesce(identifier::text,md5(row_data::text));
 if key=any(seen) then return '[]';end if;seen:=array_append(seen,key);
 row_academy:=coalesce(public.academy_legacy_uuid(row_data->>'academy_id'),case when relation_name like 'academy_%' or relation_name in('tenant_memberships','partner_center_profiles') then public.academy_legacy_uuid(row_data->>'tenant_id') end,public.academy_legacy_uuid(row_data#>>'{metadata,academy_id}'),public.academy_legacy_uuid(row_data#>>'{payload,academy_id}'));
 if relation_name='tenants' then row_academy:=identifier;end if;
 if row_academy is not null and row_academy<>academy then return '[]';end if;
 if relation_name='users' then
  for origin in select c.id from public.academy_contacts c where c.academy_id=academy and c.user_id=identifier loop
   scope:=public.academy_legacy_contact_scope(academy,origin.id);if scope is not null then scopes:=scopes||jsonb_build_array(scope);end if;
  end loop;
  for origin in select to_jsonb(s) data from public.academy_staff s where s.academy_id=academy and s.user_id=identifier and s.is_active loop
   scopes:=scopes||public.academy_legacy_row_scopes(ctx,'academy_staff',origin.data,seen,depth+1);
  end loop;
  return scopes;
 end if;
 if relation_name='academy_contacts' then
  scope:=public.academy_legacy_contact_scope(academy,identifier);return case when scope is null then '[]'::jsonb else jsonb_build_array(scope) end;
 end if;
 if relation_name='academy_classrooms' then
  return case when row_academy=academy then jsonb_build_array(jsonb_build_object('kind','classroom','classroom_id',identifier,'branch_id',row_data->'branch_id')) else '[]'::jsonb end;
 end if;
 if relation_name='academy_branches' then
  return case when row_academy=academy then jsonb_build_array(jsonb_build_object('kind','branch','branch_id',identifier)) else '[]'::jsonb end;
 end if;
 if relation_name='academy_payments' then
  branch:=public.academy_legacy_payment_branch(academy,identifier);
  return case when row_academy=academy then jsonb_build_array(case when branch is null then jsonb_build_object('kind','academy') else jsonb_build_object('kind','branch','branch_id',branch) end) else '[]'::jsonb end;
 end if;
 classroom:=coalesce(public.academy_legacy_uuid(row_data->>'classroom_id'),public.academy_legacy_uuid(row_data->>'target_classroom_id'),public.academy_legacy_uuid(row_data#>>'{metadata,classroom_id}'),public.academy_legacy_uuid(row_data#>>'{payload,classroom_id}'));
 branch:=coalesce(public.academy_legacy_uuid(row_data->>'branch_id'),public.academy_legacy_uuid(row_data->>'primary_branch_id'),public.academy_legacy_uuid(row_data#>>'{metadata,branch_id}'),public.academy_legacy_uuid(row_data#>>'{payload,branch_id}'));
 contact:=coalesce(public.academy_legacy_uuid(row_data->>'contact_id'),public.academy_legacy_uuid(row_data->>'student_contact_id'),public.academy_legacy_uuid(row_data#>>'{metadata,contact_id}'),public.academy_legacy_uuid(row_data#>>'{payload,contact_id}'));
 if classroom is not null then
  select branch_id into row_academy from public.academy_classrooms where academy_id=academy and id=classroom;
  if not found or(branch is not null and branch is distinct from row_academy) then return '[]';end if;branch:=row_academy;
  if contact is not null then scope:=public.academy_legacy_contact_scope(academy,contact,classroom,branch);
  else scope:=jsonb_build_object('kind','classroom','classroom_id',classroom,'branch_id',branch);end if;
  return case when scope is null then '[]'::jsonb else jsonb_build_array(scope) end;
 end if;
 if contact is not null then
  scope:=public.academy_legacy_contact_scope(academy,contact);
  if scope is null then return '[]';end if;
  if branch is not null then scope:=scope||jsonb_build_object('branch_id',branch,'branch_ids',jsonb_build_array(branch),'classroom_ids',
   array(select c.id from public.academy_classrooms c join public.academy_classroom_memberships m on m.academy_id=c.academy_id and m.classroom_id=c.id
    where c.academy_id=academy and c.branch_id=branch and m.contact_id=contact and m.role in('student','observer') and m.status in('active','trial','paused','completed')));end if;
  return jsonb_build_array(scope);
 end if;
 if branch is not null then
  if not exists(select 1 from public.academy_branches where academy_id=academy and id=branch) then return '[]';end if;
  return jsonb_build_array(jsonb_build_object('kind','branch','branch_id',branch));
 end if;
 -- Shared course definitions are readable through one linked class, but an
 -- edit must cover every class affected by the shared definition.
 course:=case when relation_name='academy_courses' then identifier else public.academy_legacy_uuid(row_data->>'course_id') end;
 if course is not null then
  for origin in select c.id,c.branch_id from public.academy_classrooms c where c.academy_id=academy and c.id in(
   select classroom_id from public.academy_classroom_courses where academy_id=academy and course_id=course
   union select r.classroom_id from public.academy_legacy_resource_origins r where r.academy_id=academy and r.relation_name='academy_courses' and r.resource_id=course)
  loop scopes:=scopes||jsonb_build_array(jsonb_build_object('kind','classroom','classroom_id',origin.id,'branch_id',origin.branch_id));end loop;
  if jsonb_array_length(scopes)>0 then return scopes;end if;
 end if;
 if relation_name='academy_staff' then
  for staff in select c.id,c.branch_id from public.academy_classrooms c where c.academy_id=academy and c.id=any(coalesce(public.academy_authority_scope_ids(row_data->'classroom_ids'),'{}'))
  loop scopes:=scopes||jsonb_build_array(jsonb_build_object('kind','classroom','classroom_id',staff.id,'branch_id',staff.branch_id));end loop;
  for staff in select b.id from public.academy_branches b where b.academy_id=academy and(b.id=any(coalesce(public.academy_authority_scope_ids(row_data->'branch_ids'),'{}')) or exists(
   select 1 from public.academy_staff_branch_assignments a where a.academy_id=academy and a.staff_id=identifier and a.branch_id=b.id and a.status='active'))
  loop scopes:=scopes||jsonb_build_array(jsonb_build_object('kind','branch','branch_id',staff.id));end loop;
  if jsonb_array_length(scopes)>0 then return scopes;end if;
 end if;
 -- Parent edges are frozen from the installed FK catalogue, never from input
 -- identifiers supplied by a client. Creator/auditor pointers are excluded.
 for edge in select value from jsonb_array_elements(coalesce((select edges from public.academy_legacy_boundary_relations where name=relation_name),'[]')) loop
  predicate:='';
  for column_pair in select value from jsonb_array_elements(edge->'columns') loop
   if row_data->>(column_pair->>'from') is null then predicate:='';exit;end if;
   predicate:=predicate||case when predicate='' then '' else ' and ' end||format('p.%I=($1->>%L)::%s',column_pair->>'to',column_pair->>'from',column_pair->>'type');
  end loop;
  if predicate='' then continue;end if;
  target:=to_regclass('public.'||(edge->>'table'));if target is null then continue;end if;
  execute format('select to_jsonb(p) from %s p where %s limit 1',target,predicate) into parent using row_data;
  if parent is not null then scopes:=scopes||public.academy_legacy_row_scopes(ctx,edge->>'table',parent,seen,depth+1);end if;
 end loop;
 if jsonb_array_length(scopes)>0 then return scopes;end if;
 for origin in select c.id,c.branch_id from public.academy_legacy_resource_origins r join public.academy_classrooms c on c.academy_id=r.academy_id and c.id=r.classroom_id
  where r.academy_id=academy and r.relation_name=academy_legacy_row_scopes.relation_name and r.resource_id=identifier loop
  scopes:=scopes||jsonb_build_array(jsonb_build_object('kind','classroom','classroom_id',origin.id,'branch_id',origin.branch_id));
 end loop;
 if jsonb_array_length(scopes)>0 then return scopes;end if;
 if row_academy=academy then return jsonb_build_array(jsonb_build_object('kind','academy'));end if;
 return '[]';
end;$$;
revoke all on function public.academy_legacy_row_scopes(jsonb,text,jsonb,text[],integer) from public,anon,authenticated,service_role;

create function public.academy_legacy_scope_covered(ctx jsonb,scope jsonb,capabilities text[] default null)
returns boolean language sql volatile security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from unnest(coalesce(capabilities,array(select jsonb_array_elements_text(ctx->'capabilities')))) c
  where public.academy_command_covers(ctx->'authorities',c,scope))
 and(case when ctx->>'branch_id' is null then true else
  scope->>'branch_id'=ctx->>'branch_id' or(scope->>'kind'='contact' and coalesce(scope->'branch_ids','[]')@>jsonb_build_array(ctx->>'branch_id')) end);
$$;
revoke all on function public.academy_legacy_scope_covered(jsonb,jsonb,text[]) from public,anon,authenticated;
grant execute on function public.academy_legacy_scope_covered(jsonb,jsonb,text[]) to service_role;

create function public.academy_legacy_row_allowed(ctx jsonb,relation_name text,row_data jsonb,writing boolean default false)
returns boolean language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare academy uuid:=(ctx->>'academy_id')::uuid;scopes jsonb;scope jsonb;min_caps text[];shared boolean;cap text;identifier uuid;classroom uuid;branch uuid;
begin
 if ctx is null or row_data is null then return false;end if;
 select r.minimum_read_caps,r.shared_read into min_caps,shared from public.academy_legacy_boundary_relations r where r.name=relation_name;
 if not found then return false;end if;
 if writing and relation_name in('users','tenant_memberships','partner_center_profiles','exam_registrations','evaluations','partner_vouchers','sales_leads') then return false;end if;
 identifier:=public.academy_legacy_uuid(row_data->>'id');
 if not writing and relation_name='users' and identifier=public.academy_legacy_uuid(ctx->>'actor_id') then return true;end if;
 scopes:=public.academy_legacy_row_scopes(ctx,relation_name,row_data);
 if jsonb_array_length(scopes)=0 then return false;end if;
 if not writing and ctx->>'action'='teacher_day' and relation_name='academy_lesson_sessions' then
  if not exists(select 1 from jsonb_array_elements(scopes) s where public.academy_legacy_scope_covered(ctx,s,array['manageAcademicOperations']))
   and not exists(select 1 from public.academy_staff staff where staff.academy_id=academy and staff.user_id=(ctx->>'actor_id')::uuid and staff.is_active
     and(staff.id=public.academy_legacy_uuid(row_data->>'primary_staff_id') or exists(select 1 from public.academy_session_staff_assignments a where a.academy_id=academy and a.session_id=identifier and a.staff_id=staff.id and a.ended_at is null))) then return false;end if;
 end if;
 if not writing and relation_name in('academy_payments','academy_charge_balances','academy_account_balances','academy_account_ledger_entries','academy_payment_allocations','academy_pricing_adjustments')
  and not public.academy_legacy_finance_visible(ctx,relation_name,row_data) then return false;end if;
 if not writing and relation_name in('academy_staff_performance','academy_staff_performance_v2','academy_teacher_performance','academy_teacher_performance_v2') then
  for scope in select value from jsonb_array_elements(scopes) loop
   if not public.academy_legacy_scope_covered(ctx,scope) then return false;end if;
  end loop;
 end if;
 if writing then
  for scope in select value from jsonb_array_elements(scopes) loop
   if not public.academy_legacy_scope_covered(ctx,scope) then return false;end if;
  end loop;
  return true;
 end if;
 for scope in select value from jsonb_array_elements(scopes) loop
  if public.academy_legacy_scope_covered(ctx,scope)
   and(cardinality(min_caps)=0 or public.academy_legacy_scope_covered(ctx,scope,min_caps)) then return true;end if;
  if shared and scope->>'kind'='academy' then
   if (cardinality(min_caps)=0 or exists(select 1 from jsonb_array_elements(ctx->'authorities') a cross join unnest(min_caps) c where public.academy_command_role_has(a->>'role',c)))
    and exists(select 1 from jsonb_array_elements(ctx->'entries') a where(a->>'scope_type'='academy' or jsonb_array_length(a->'scope_ids')>0)
     and(a->>'expires_at' is null or(a->>'expires_at')::timestamptz>clock_timestamp())) then return true;end if;
  end if;
 end loop;
 -- A student-specific administrative grant may resolve its classroom label,
 -- while its membership/progress rows remain restricted to the actual student.
 if relation_name='academy_classrooms' then
  return exists(select 1 from public.academy_classroom_memberships m
   where m.academy_id=academy and m.classroom_id=identifier and m.role in('student','observer') and m.status in('active','trial','paused','completed')
   and public.academy_legacy_scope_covered(ctx,public.academy_legacy_contact_scope(academy,m.contact_id,m.classroom_id)));
 end if;
 return false;
end;$$;
revoke all on function public.academy_legacy_row_allowed(jsonb,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.academy_legacy_row_allowed(jsonb,text,jsonb,boolean) to service_role;

create function public.academy_legacy_write_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,public set lock_timeout='5s' as $$
declare headers jsonb;ctx jsonb;row_data jsonb;edge jsonb;pair jsonb;predicate text;parent jsonb;target regclass;academy uuid;classroom uuid;scope jsonb;
begin
 headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 if not(headers?'x-schood-legacy-action') then return case when tg_op='DELETE' then old else new end;end if;
 ctx:=public.academy_legacy_boundary_context();academy:=(ctx->>'academy_id')::uuid;
 if ctx->>'mode'='read' and not(ctx->>'action'='education_os' and tg_table_name='academy_action_items') then raise exception using errcode='42501',message='This Academy read cannot change business records';end if;
 if tg_op<>'INSERT' and not public.academy_legacy_row_allowed(ctx,tg_table_name,to_jsonb(old),true) then raise exception using errcode='42501',message='Current access does not cover the stored Academy resource';end if;
 if tg_op<>'DELETE' then
  row_data:=to_jsonb(new);
  if not public.academy_legacy_row_allowed(ctx,tg_table_name,row_data,true) then
   -- New shared teaching resources retain their original class rather than
   -- becoming unscoped global rows between creation and class assignment.
   classroom:=public.academy_legacy_uuid(ctx->>'classroom_id');
   if tg_op='INSERT' and tg_table_name in('academy_courses','academy_rubrics','academy_competency_frameworks') and classroom is not null
    and public.academy_legacy_uuid(row_data->>'academy_id')=academy then
    select jsonb_build_object('kind','classroom','classroom_id',c.id,'branch_id',c.branch_id) into scope from public.academy_classrooms c where c.academy_id=academy and c.id=classroom for share;
    if scope is null or not public.academy_legacy_scope_covered(ctx,scope) then raise exception using errcode='42501',message='Current access does not cover this resource origin';end if;
    if tg_when='AFTER' then
     insert into public.academy_legacy_resource_origins(academy_id,relation_name,resource_id,classroom_id,created_by)
      values(academy,tg_table_name,(row_data->>'id')::uuid,classroom,(ctx->>'actor_id')::uuid);
    end if;
   else raise exception using errcode='42501',message='Current access does not cover the proposed Academy resource';end if;
  end if;
  -- References are checked against stored parents as well as the row's claimed
  -- branch. A permitted branch assertion cannot conceal a foreign room/student.
  for edge in select value from jsonb_array_elements(coalesce((select edges from public.academy_legacy_boundary_relations where name=tg_table_name),'[]')) loop
   predicate:='';
   for pair in select value from jsonb_array_elements(edge->'columns') loop
    if row_data->>(pair->>'from') is null then predicate:='';exit;end if;
    predicate:=predicate||case when predicate='' then '' else ' and ' end||format('p.%I=($1->>%L)::%s',pair->>'to',pair->>'from',pair->>'type');
   end loop;
   if predicate='' then continue;end if;target:=to_regclass('public.'||(edge->>'table'));if target is null then continue;end if;
   execute format('select to_jsonb(p) from %s p where %s for share',target,predicate) into parent using row_data;
   if parent is null or not public.academy_legacy_row_allowed(ctx,edge->>'table',parent,false) then raise exception using errcode='42501',message='Current access does not cover a referenced Academy resource';end if;
  end loop;
 end if;
 return case when tg_op='DELETE' then old else new end;
end;$$;
revoke all on function public.academy_legacy_write_guard() from public,anon,authenticated,service_role;

create function public.academy_legacy_scope_generation_changed()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare academy uuid;
begin
 if tg_op='UPDATE' and
   (select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(to_jsonb(old)) where key=any(array['academy_id','user_id','contact_id','classroom_id','course_id','branch_id','primary_branch_id','classroom_ids','branch_ids','staff_id','role','status','scope_type','scope_ids','starts_at','expires_at','is_active']))
   is not distinct from
   (select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(to_jsonb(new)) where key=any(array['academy_id','user_id','contact_id','classroom_id','course_id','branch_id','primary_branch_id','classroom_ids','branch_ids','staff_id','role','status','scope_type','scope_ids','starts_at','expires_at','is_active'])) then return new;end if;
 academy:=public.academy_legacy_uuid(case when tg_op='DELETE' then to_jsonb(old)->>'academy_id' else to_jsonb(new)->>'academy_id' end);
 if academy is not null then
  insert into public.academy_legacy_scope_generations(academy_id,revision) values(academy,1) on conflict(academy_id) do update set revision=academy_legacy_scope_generations.revision+1;
 end if;
 return case when tg_op='DELETE' then old else new end;
end;$$;
revoke all on function public.academy_legacy_scope_generation_changed() from public,anon,authenticated,service_role;

-- Collection branch comes from retained collection evidence, never today's
-- mutable student home branch. Ambiguous historical payments stay unattributed.
create index academy_legacy_collection_payment_idx on public.academy_finance_command_receipts(academy_id,((result#>>'{payment,id}'))) where command='collect_student_payment';
create function public.academy_legacy_payment_branch(p_academy uuid,p_payment uuid)
returns uuid language sql stable security definer set search_path=pg_catalog,public as $$
 with receipt_branches as(
  select distinct public.academy_legacy_uuid(s->>'branch_id') id from public.academy_finance_command_receipts r cross join lateral jsonb_array_elements(r.protected_scopes) s
   where r.academy_id=p_academy and r.command='collect_student_payment' and r.result#>>'{payment,id}'=p_payment::text and s->>'kind'='branch'
 ),movement_branches as(
  select distinct b.branch_id id from public.academy_cash_movements m join public.academy_cashier_shifts s on s.academy_id=m.academy_id and s.id=m.shift_id
   join public.academy_cashboxes b on b.academy_id=s.academy_id and b.id=s.cashbox_id where m.academy_id=p_academy and m.academy_payment_id=p_payment
 ), facts as(select id from receipt_branches where id is not null union select id from movement_branches where id is not null)
 select case when count(*)=1 then (array_agg(id))[1] else null end from facts;
$$;
revoke all on function public.academy_legacy_payment_branch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.academy_legacy_payment_branch(uuid,uuid) to service_role;
create function public.academy_legacy_finance_visible(ctx jsonb,relation_name text,row_data jsonb)
returns boolean language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare scope jsonb;scopes jsonb;caps text[];
begin
 caps:=case when ctx->>'action'='education_os' then array['manageFinance'] else array['viewFinancialReports','manageFinance'] end;
 scopes:=public.academy_legacy_row_scopes(ctx,relation_name,row_data);
 if jsonb_array_length(scopes)=0 then return false;end if;
 for scope in select value from jsonb_array_elements(scopes) loop
  if not public.academy_legacy_scope_covered(ctx,scope,caps) then return false;end if;
 end loop;
 return true;
end;$$;
revoke all on function public.academy_legacy_finance_visible(jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.academy_legacy_finance_visible(jsonb,text,jsonb) to service_role;

insert into public.academy_legacy_boundary_actions(action,mode,capabilities) values
('teacher_day','read',array['manageSchedule']),
('summary','read',array['viewContacts']),
('conversations','read',array['manageMessages']),
('conversation-messages','read',array['manageMessages']),
('announcements','read',array['manageAnnouncements']),
('alerts','read',array['manageAlerts']),
('offers','read',array['manageOffers']),
('offer-grants','read',array['manageOffers']),
('payments','read',array['manageFinance']),
('curriculum','read',array['manageAssignments']),
('quizzes','read',array['manageAssignments']),
('grade_categories','read',array['gradeSubmissions']),
('rubrics','read',array['gradeSubmissions']),
('quiz_attempts','read',array['gradeSubmissions']),
('assignments','read',array['manageAssignments']),
('submissions','read',array['gradeSubmissions']),
('student_progress','read',array['viewContacts']),
('attendance','read',array['markAttendance']),
('bulk_invites','read',array['manageRoster']),
('referral_leaderboard','read',array['viewReferrals']),
('owner_dashboard','read',array['viewAcademy']),
('education_os','read',array['viewEducationOS']),
('business_foundation','read',array['viewAdmissions']),
('guardian_relationships','read',array['manageGuardians']),
('academic_operations','read',array['manageAcademicOperations']),
('business_intelligence','read',array['viewBusinessIntelligence']),
('global_search','read',array['viewBusinessIntelligence']),
('automation_rules','read',array['manageAutomation']),
('branding','read',array['manageBranding']),
('notifications','read',array['viewNotifications']),
('audit_events','read',array['viewAudit']),
('classroom_billing','read',array['manageFinance']),
('schedule','read',array['manageSchedule']),
('timetable_planning','read',array['manageAcademicOperations']),
('service_requests','read',array['manageRetention','manageAcademicOperations','refundFinance']),
('communication_journeys','read',array['viewAutomation','manageAutomation']),
('collection_cases','read',array['viewFinance','collectFinance']),
('workforce_requests','read',array['manageStaff','manageAcademicOperations','viewPayroll','viewClassrooms']),
('sensitive_cases','read',array['manageRetention']),
('competency_plans','read',array['manageAssignments','viewAcademicReports']),
('integration_endpoints','read',array['manageAcademy','manageAutomation']),
('entitlements','read',array['manageFinance','manageOffers']),
('resolve_action_item','write',array['resolveActionItems']),
('set_lifecycle_stage','write',array['manageContacts']),
('upsert_automation_rule','write',array['manageAutomation']),
('run_automation_rules','write',array['manageAutomation']),
('create_automation_version','write',array['manageAutomation']),
('execute_automation_event','write',array['manageAutomation']),
('review_automation_execution','write',array['manageAutomation']),
('request_ai_assistance','write',array['useAcademyAI']),
('review_ai_assistance','write',array['useAcademyAI']),
('upsert_localization','write',array['manageLocalization']),
('upsert_campaign','write',array['exportAdmissions']),
('upsert_staff_branch_assignment','write',array['manageStaff']),
('upsert_branch','write',array['manageBranches']),
('upsert_room','write',array['manageBranches']),
('create_lead','write',array['manageAdmissions']),
('transition_lead','write',array['manageAdmissions']),
('record_lead_activity','write',array['manageAdmissions']),
('schedule_trial','write',array['manageAdmissions']),
('set_trial_status','write',array['manageTrialFeedback']),
('convert_lead','write',array['manageAdmissions']),
('convert_lead_full','write',array['manageAdmissions']),
('create_pricing_plan','write',array['manageFinance']),
('create_subscription','write',array['manageFinance']),
('manage_subscription','write',array['manageFinance']),
('create_charge','write',array['manageFinance']),
('allocate_payment','write',array['collectFinance']),
('post_account_adjustment','write',array['adjustFinance']),
('record_payment_reconciliation','write',array['reconcileFinance']),
('record_payment_promise','write',array['collectFinance']),
('create_cashbox','write',array['manageCashier']),
('open_cashier_shift','write',array['manageCashier']),
('record_cash_movement','write',array['manageCashier']),
('close_cashier_shift','write',array['manageCashier']),
('upsert_expense_category','write',array['manageFinance']),
('record_expense','write',array['manageFinance']),
('upsert_budget','write',array['manageFinance']),
('upsert_compensation_rule','write',array['calculatePayroll']),
('record_lesson_delivery','write',array['calculatePayroll']),
('create_payroll_period','write',array['calculatePayroll']),
('calculate_payroll','write',array['calculatePayroll']),
('post_payroll_adjustment','write',array['calculatePayroll']),
('transition_payroll','write',array['viewPayroll']),
('upsert_academic_calendar','write',array['manageAcademicOperations']),
('upsert_calendar_event','write',array['manageAcademicOperations']),
('upsert_staff_availability','write',array['manageAcademicOperations']),
('upsert_room_availability','write',array['manageAcademicOperations']),
('create_lesson_session','write',array['manageAcademicOperations']),
('upsert_session_delivery','write',array['manageAcademicOperations']),
('transition_lesson_session','write',array['manageAcademicOperations']),
('assign_session_substitute','write',array['manageAcademicOperations']),
('record_session_attendance','write',array['markAttendance']),
('record_attendance_exception','write',array['manageAcademicOperations']),
('upsert_make_up_lesson','write',array['manageAcademicOperations']),
('record_session_quality_review','write',array['manageAcademicOperations']),
('create_guardian_relationship','write',array['manageGuardians']),
('issue_guardian_link','write',array['manageGuardians']),
('revoke_guardian_relationship','write',array['manageGuardians']),
('upsert_guardian_preferences','write',array['manageGuardians']),
('queue_guardian_notification','write',array['communicateGuardians']),
('send_guardian_message','write',array['communicateGuardians']),
('upsert_risk_definition','write',array['manageRetention']),
('evaluate_retention_risk','write',array['manageRetention']),
('create_intervention','write',array['manageRetention']),
('update_intervention','write',array['manageRetention']),
('record_intervention_activity','write',array['manageRetention']),
('upsert_renewal_opportunity','write',array['manageRetention']),
('record_renewal_activity','write',array['manageRetention']),
('update_operational_action','write',array['resolveActionItems']),
('create_import_job','write',array['manageImports']),
('add_import_row','write',array['manageImports']),
('commit_import_job','write',array['manageImports']),
('rollback_import_job','write',array['manageImports']),
('update_academy_landing','write',array['manageAcademy']),
('update_classroom_landing','write',array['manageClassrooms']),
('upsert_contact','write',array['manageContacts']),
('create_classroom','write',array['manageClassrooms']),
('upsert_classroom_membership','write',array['manageRoster']),
('remove_classroom_membership','write',array['manageRoster']),
('send_message','write',array['manageMessages']),
('send_announcement','write',array['manageAnnouncements']),
('create_alert','write',array['manageAlerts']),
('resolve_alert','write',array['resolveAlerts']),
('create_offer','write',array['manageOffers']),
('upsert_offer_grant','write',array['manageOffers']),
('create_payment','write',array['collectFinance']),
('mark_payment_paid','write',array['collectFinance']),
('grant_contact','write',array['manageOffers']),
('create_assignment','write',array['manageAssignments']),
('update_assignment','write',array['manageAssignments']),
('upsert_course','write',array['manageAssignments']),
('publish_course','write',array['manageAssignments']),
('assign_course','write',array['manageAssignments']),
('upsert_module','write',array['manageAssignments']),
('upsert_lesson','write',array['manageAssignments']),
('upsert_quiz','write',array['manageAssignments']),
('upsert_quiz_question','write',array['manageAssignments']),
('upsert_grade_category','write',array['gradeSubmissions']),
('upsert_rubric','write',array['gradeSubmissions']),
('grade_quiz_attempt','write',array['gradeSubmissions']),
('set_enrollment_status','write',array['manageRoster']),
('grade_submission','write',array['gradeSubmissions']),
('mark_attendance','write',array['markAttendance']),
('bulk_invite','write',array['manageRoster']),
('update_classroom_settings','write',array['manageClassrooms']),
('export_gradebook','write',array['gradeSubmissions']),
('upsert_schedule','write',array['manageSchedule']),
('delete_schedule','write',array['manageSchedule']),
('record_placement','write',array['manageContacts']),
('upsert_staff','write',array['manageStaff']),
('remove_staff','write',array['manageStaff']),
('issue_academy_certificate','write',array['issueCertificates']),
('compute_at_risk','write',array['viewEducationOS']),
('generate_classroom_lesson_plan','write',array['viewEducationOS']),
('dispatch_notifications','write',array['dispatchNotifications']),
('generate_morning_brief','write',array['dispatchNotifications']),
('generate_parent_report','write',array['viewReports']),
('upsert_branding','write',array['manageBranding']),
('upsert_timetable_term','write',array['manageAcademicOperations']),
('upsert_timetable_series','write',array['manageAcademicOperations']),
('generate_timetable','write',array['manageAcademicOperations']),
('upsert_communication_journey','write',array['manageAutomation']),
('enroll_communication_journey','write',array['manageAutomation']),
('advance_communication_journeys','write',array['dispatchNotifications']),
('upsert_collection_case','write',array['collectFinance']),
('record_collection_attempt','write',array['collectFinance']),
('create_sensitive_case','write',array['manageRetention']),
('update_sensitive_case','write',array['manageRetention']),
('upsert_competency_framework','write',array['manageAssignments']),
('upsert_competency','write',array['manageAssignments']),
('upsert_learning_plan','write',array['manageAssignments']),
('record_competency_evidence','write',array['gradeSubmissions']),
('upsert_integration_endpoint','write',array['manageAutomation']),
('queue_integration_event','write',array['manageAutomation']),
('dispatch_integration_events','write',array['manageAutomation']),
('classroom-chat','write',array['viewClassrooms']),
('classroom-chat-send','write',array['manageMessages']),
('classroom-resource-upsert','write',array['manageResources']),
('classroom-resource-delete','write',array['manageResources']);

create function public.academy_selected_branch(p_academy uuid,p_actor uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare h jsonb;claims jsonb;branch uuid;
begin
 h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 if coalesce(h->>'x-schood-scope-branch','')='' then return null;end if;
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
 if coalesce(claims->>'role',current_setting('request.jwt.claim.role',true),'')<>'service_role'
  or h->>'x-schood-scope-actor' is distinct from p_actor::text or h->>'x-schood-scope-academy' is distinct from p_academy::text then
  raise exception using errcode='42501',message='The selected Academy context does not match this request';end if;
 branch:=public.academy_legacy_uuid(h->>'x-schood-scope-branch');
 if branch is null or not exists(select 1 from public.academy_branches b where b.academy_id=p_academy and b.id=branch) then
  raise exception using errcode='42501',message='Choose a permitted branch';end if;
 return branch;
end;$$;
revoke all on function public.academy_selected_branch(uuid,uuid) from public,anon,authenticated,service_role;

create function public.academy_selected_authorities(p_academy uuid,p_actor uuid,p_authorities jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare branch uuid;entry jsonb;ids uuid[];result jsonb:='[]';scope_type text;
begin
 branch:=public.academy_selected_branch(p_academy,p_actor);if branch is null then return p_authorities;end if;
 for entry in select value from jsonb_array_elements(p_authorities) loop
  scope_type:=entry->>'scope_type';ids:='{}';
  if scope_type='academy' then scope_type:='branches';ids:=array[branch];
  elsif scope_type='branches' then select coalesce(array_agg(id),'{}') into ids from unnest(public.academy_authority_scope_ids(entry->'scope_ids')) id where id=branch;
  elsif scope_type='classrooms' then select coalesce(array_agg(c.id order by c.id),'{}') into ids from public.academy_classrooms c
   where c.academy_id=p_academy and c.branch_id=branch and c.id=any(public.academy_authority_scope_ids(entry->'scope_ids'));
  elsif scope_type='students' then select coalesce(array_agg(c.id order by c.id),'{}') into ids from public.academy_contacts c
   where c.academy_id=p_academy and c.id=any(public.academy_authority_scope_ids(entry->'scope_ids')) and(c.primary_branch_id=branch or exists(
    select 1 from public.academy_classroom_memberships m join public.academy_classrooms k on k.academy_id=m.academy_id and k.id=m.classroom_id
    where m.academy_id=p_academy and m.contact_id=c.id and m.role in('student','observer') and m.status in('active','trial','paused','completed') and k.branch_id=branch));
  end if;
  if cardinality(ids)>0 then result:=result||jsonb_build_array(entry||jsonb_build_object('scope_type',scope_type,'scope_ids',ids,'selected_branch_id',branch));end if;
 end loop;
 return result;
end;$$;
revoke all on function public.academy_selected_authorities(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- Narrow exact installed definitions instead of replacing an older snapshot of
-- the operational read repair or other release-owned function changes.
do $patch$
declare definition text;needle text;replacement text;
begin
 definition:=replace(pg_get_functiondef('public.academy_current_authorities(uuid,uuid)'::regprocedure),chr(13)||chr(10),chr(10));
 needle:=' return v_result;';replacement:=' return public.academy_selected_authorities(p_academy_id,p_actor_id,v_result);';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Current authority definition changed; review scope-mask patch';end if;
 execute replace(definition,needle,replacement);
 definition:=replace(pg_get_functiondef('public.academy_scoped_directory(uuid,uuid,text,jsonb)'::regprocedure),chr(13)||chr(10),chr(10));
 needle:='where c.academy_id=p_academy_id';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>2 then raise exception 'Directory definition changed; review selected-branch predicates';end if;
 -- The contact and classroom arms use the same alias, with different allowed
 -- branch semantics. Insert their predicates inside their original arm only.
 needle:=E'from public.academy_contacts c\n   where c.academy_id=p_academy_id';
 replacement:=needle||E'\n    and(public.academy_selected_branch(p_academy_id,p_actor_id) is null or c.primary_branch_id=public.academy_selected_branch(p_academy_id,p_actor_id) or exists(\n     select 1 from public.academy_classroom_memberships sm join public.academy_classrooms sk on sk.academy_id=sm.academy_id and sk.id=sm.classroom_id\n     where sm.academy_id=p_academy_id and sm.contact_id=c.id and sm.role in(''student'',''observer'') and sm.status in(''active'',''trial'',''paused'',''completed'') and sk.branch_id=public.academy_selected_branch(p_academy_id,p_actor_id)))';
 if strpos(definition,needle)=0 then raise exception 'Directory contact arm changed';end if;definition:=replace(definition,needle,replacement);
 needle:=E'where c.academy_id=p_academy_id\n    and(v_before_time';replacement:=E'where c.academy_id=p_academy_id\n    and(public.academy_selected_branch(p_academy_id,p_actor_id) is null or c.branch_id=public.academy_selected_branch(p_academy_id,p_actor_id))\n    and(v_before_time';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Directory classroom arm changed';end if;definition:=replace(definition,needle,replacement);
 needle:='where m.academy_id=p_academy_id and(v_classroom';replacement:='where m.academy_id=p_academy_id and(public.academy_selected_branch(p_academy_id,p_actor_id) is null or c.branch_id=public.academy_selected_branch(p_academy_id,p_actor_id)) and(v_classroom';
 if strpos(definition,needle)=0 then raise exception 'Directory membership arm changed';end if;execute replace(definition,needle,replacement);
 definition:=replace(pg_get_functiondef('public.academy_command_resource(uuid,text,uuid)'::regprocedure),chr(13)||chr(10),chr(10));
 needle:=E'  select branch_id into branch from public.academy_classrooms where academy_id=p_academy and id=p_id;';
 replacement:=needle||E'\n  if public.academy_selected_branch(p_academy,public.academy_legacy_uuid(coalesce(nullif(current_setting(''request.headers'',true),''''),''{}'')::jsonb->>''x-schood-scope-actor'')) is not null\n   and branch is distinct from public.academy_selected_branch(p_academy,public.academy_legacy_uuid(coalesce(nullif(current_setting(''request.headers'',true),''''),''{}'')::jsonb->>''x-schood-scope-actor'')) then raise exception using errcode=''42501'',message=''This classroom is outside the selected branch'';end if;';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Classroom resource definition changed';end if;execute replace(definition,needle,replacement);
end;$patch$;

-- GET queries run in read-only PostgREST transactions. Use the exact installed
-- current-authority definition without row locks only inside those private
-- views. Edge brackets all view reads with locked current-authority snapshots
-- and compares topology revisions before returning any response.
do $readonly_authority$
declare definition text;needle text:=' for share';
begin
 definition:=replace(pg_get_functiondef('public.academy_current_authorities(uuid,uuid)'::regprocedure),chr(13)||chr(10),chr(10));
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>8 then raise exception 'Review changed current-authority read locks before creating the private GET snapshot';end if;
 if position('FUNCTION public.academy_current_authorities(' in definition)=0 then raise exception 'Current authority signature changed';end if;
 definition:=replace(definition,'FUNCTION public.academy_current_authorities(','FUNCTION public.academy_legacy_read_authorities(');
 execute replace(definition,needle,'');
end;$readonly_authority$;
revoke all on function public.academy_legacy_read_authorities(uuid,uuid) from public,anon,authenticated,service_role;

create function public.academy_branch_contexts(p_academy uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare original_headers text:=current_setting('request.headers',true);claims jsonb;authorities jsonb;entries jsonb;branches jsonb:='[]';branch record;
begin
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
 if coalesce(claims->>'role',current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception using errcode='42501',message='Private branch contexts';end if;
 perform set_config('request.headers','{}',true);
 authorities:=public.academy_current_authorities(p_academy,p_actor);
 if jsonb_array_length(authorities)=0 then raise exception using errcode='42501',message='No current Academy access';end if;
 for branch in select b.id,b.name,b.currency from public.academy_branches b where b.academy_id=p_academy order by b.name,b.id limit 500 loop
  perform set_config('request.headers',jsonb_build_object('x-schood-scope-academy',p_academy,'x-schood-scope-actor',p_actor,'x-schood-scope-branch',branch.id)::text,true);
  entries:=public.academy_selected_authorities(p_academy,p_actor,authorities);
  if jsonb_array_length(entries)>0 then branches:=branches||jsonb_build_array(jsonb_build_object('id',branch.id,'name',branch.name,'currency',branch.currency,'authorities',entries));end if;
 end loop;
 perform set_config('request.headers',coalesce(original_headers,'{}'),true);
 return jsonb_build_object('authorities',authorities,'branches',branches);
end;$$;
revoke all on function public.academy_branch_contexts(uuid,uuid) from public,anon,authenticated;
grant execute on function public.academy_branch_contexts(uuid,uuid) to service_role;


-- Freeze the existing relation/FK inventory. Future unrelated schema additions
-- do not acquire a legacy route or client permission automatically.
do $catalogue$
declare item record;definition text;columns text;projection text;column_item record;minimum text[];
begin
 for item in
  with recursive reachable(oid,depth) as(
   select c.oid,0 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in('academy_academic_calendars','academy_access_audit_logs','academy_access_invitations','academy_account_balances','academy_account_ledger_entries','academy_action_items','academy_ai_assistance_requests','academy_ai_assistance_reviews','academy_alerts','academy_announcements','academy_assignments','academy_attendance','academy_attendance_exceptions','academy_audit_events','academy_automation_effects','academy_automation_executions','academy_automation_rule_versions','academy_automation_rules','academy_branch_comparison_v2','academy_branch_contribution','academy_branches','academy_branding','academy_budgets','academy_bulk_invites','academy_business_dashboard_v2','academy_calendar_events','academy_cash_movements','academy_cash_reconciliations','academy_cashboxes','academy_cashier_shifts','academy_charge_balances','academy_classroom_capacity_summary','academy_classroom_contribution','academy_classroom_courses','academy_classroom_memberships','academy_classroom_resource_progress','academy_classroom_resources','academy_classroom_schedules','academy_classrooms','academy_collection_attempts','academy_collection_cases','academy_collection_events','academy_communication_enrollments','academy_communication_journey_steps','academy_communication_journeys','academy_compensation_rules','academy_competencies','academy_competency_evidence','academy_competency_frameworks','academy_contacts','academy_conversations','academy_course_modules','academy_courses','academy_debt_cases','academy_entitlements','academy_expense_categories','academy_expenses','academy_export_jobs','academy_grade_categories','academy_guardian_consents','academy_guardian_link_tokens','academy_guardian_messages','academy_guardian_notification_preferences','academy_guardians','academy_import_effects','academy_import_jobs','academy_import_rows','academy_integration_deliveries','academy_integration_endpoints','academy_intervention_activities','academy_intervention_cases','academy_lead_activities','academy_lead_conversions','academy_lead_sources','academy_leads','academy_learning_plan_items','academy_learning_plans','academy_lesson_deliveries','academy_lesson_media','academy_lesson_progress','academy_lesson_sessions','academy_lessons','academy_localization_settings','academy_make_up_lessons','academy_marketing_attribution_metrics','academy_marketing_campaigns','academy_messages','academy_metric_definitions','academy_notification_delivery_attempts','academy_notifications','academy_offer_grants','academy_offers','academy_owner_intelligence','academy_payment_allocations','academy_payment_promises','academy_payment_reconciliations','academy_payments','academy_payroll_adjustments','academy_payroll_payouts','academy_payroll_periods','academy_payroll_row_totals','academy_pipeline_stages','academy_pipeline_transitions','academy_pricing_adjustments','academy_pricing_plans','academy_quiz_attempts','academy_quiz_questions','academy_quizzes','academy_referrals','academy_renewal_activities','academy_renewal_opportunities','academy_risk_definitions','academy_risk_evaluations','academy_risk_signals','academy_role_grants','academy_room_availability','academy_room_capacity_summary','academy_room_peak_periods','academy_rooms','academy_rubrics','academy_sensitive_case_events','academy_sensitive_cases','academy_service_request_events','academy_service_requests','academy_session_delivery','academy_session_quality_reviews','academy_session_staff_assignments','academy_staff','academy_staff_availability','academy_staff_branch_assignments','academy_staff_performance_metrics','academy_staff_requests','academy_student_guardian_relationships','academy_student_lifecycle_events','academy_submissions','academy_subscription_freezes','academy_subscriptions','academy_teacher_lesson_runs','academy_teacher_performance_metrics','academy_telegram_chats','academy_timetable_generation_runs','academy_timetable_series','academy_timetable_terms','academy_translation_overrides','academy_trial_lessons','academy_unified_student_intelligence','academy_unit_economics_metrics','academy_video_assets','academy_wallet_policy_status','domain_event_outbox','evaluations','exam_registrations','issued_certificates','parent_report_tokens','partner_center_profiles','partner_vouchers','sales_leads','tenant_memberships','tenants','users')
   union select f.confrelid,r.depth+1 from reachable r join pg_constraint f on f.conrelid=r.oid and f.contype='f'
    join pg_class p on p.oid=f.confrelid join pg_namespace n on n.oid=p.relnamespace
    where r.depth<6 and n.nspname='public' and p.relname<>'internal_runtime_secrets'
  ) select distinct c.oid,c.relname,c.relkind from reachable r join pg_class c on c.oid=r.oid
 loop
  minimum:='{}';
  if item.relname like 'academy_payroll_%' or item.relname='academy_compensation_rules' then minimum:=array['viewPayroll'];
  elsif item.relname in('academy_risk_evaluations','academy_risk_signals','academy_intervention_cases','academy_intervention_activities') then minimum:=array['viewRisk'];
  elsif item.relname in('academy_automation_rule_versions','academy_automation_executions','academy_automation_effects') then minimum:=array['viewAutomation','manageAutomation'];
  elsif item.relname like 'academy_ai_assistance_%' then minimum:=array['useAcademyAI'];
  elsif item.relname in('academy_import_jobs','academy_import_rows','academy_import_effects') then minimum:=array['manageImports'];
  end if;
  insert into public.academy_legacy_boundary_relations(name,relation_id,view_name,shared_read,minimum_read_caps,edges)
   values(item.relname,item.oid,('academy_scope_'||item.relname),
    item.relname in('academy_lead_sources','academy_pipeline_stages','academy_pipeline_transitions','academy_risk_definitions','academy_metric_definitions','academy_localization_settings','academy_translation_overrides','academy_competency_frameworks','academy_competencies','academy_grade_categories','academy_rubrics','academy_expense_categories','academy_automation_rules'),minimum,
    coalesce((select jsonb_agg(jsonb_build_object('table',parent.relname,'constraint',f.conname,'columns',pairs.columns) order by f.oid)
     from pg_constraint f join pg_class parent on parent.oid=f.confrelid join pg_namespace ns on ns.oid=parent.relnamespace
     cross join lateral(select jsonb_agg(jsonb_build_object('from',source.attname,'to',target.attname,'type',format_type(target.atttypid,target.atttypmod)) order by k.ordinality) columns
      from unnest(f.conkey,f.confkey) with ordinality k(source_id,target_id,ordinality)
      join pg_attribute source on source.attrelid=f.conrelid and source.attnum=k.source_id
      join pg_attribute target on target.attrelid=f.confrelid and target.attnum=k.target_id) pairs
     where f.conrelid=item.oid and f.contype='f' and ns.nspname='public'
      and parent.relname<>'tenants' and parent.relname<>'internal_runtime_secrets'
      and not exists(select 1 from unnest(f.conkey) attribute_number join pg_attribute a on a.attrelid=f.conrelid and a.attnum=attribute_number
       where a.attname in('created_by','updated_by','actor_id','graded_by','reviewed_by','recorded_by','assigned_by','granted_by','approved_by','user_id','created_by_user_id'))),'[]'));
 end loop;
 for item in select r.*,c.relkind from public.academy_legacy_boundary_relations r join pg_class c on c.oid=r.relation_id
  where r.name in('academy_academic_calendars','academy_access_audit_logs','academy_access_invitations','academy_account_balances','academy_account_ledger_entries','academy_action_items','academy_ai_assistance_requests','academy_ai_assistance_reviews','academy_alerts','academy_announcements','academy_assignments','academy_attendance','academy_attendance_exceptions','academy_audit_events','academy_automation_effects','academy_automation_executions','academy_automation_rule_versions','academy_automation_rules','academy_branch_comparison_v2','academy_branch_contribution','academy_branches','academy_branding','academy_budgets','academy_bulk_invites','academy_business_dashboard_v2','academy_calendar_events','academy_cash_movements','academy_cash_reconciliations','academy_cashboxes','academy_cashier_shifts','academy_charge_balances','academy_classroom_capacity_summary','academy_classroom_contribution','academy_classroom_courses','academy_classroom_memberships','academy_classroom_resource_progress','academy_classroom_resources','academy_classroom_schedules','academy_classrooms','academy_collection_attempts','academy_collection_cases','academy_collection_events','academy_communication_enrollments','academy_communication_journey_steps','academy_communication_journeys','academy_compensation_rules','academy_competencies','academy_competency_evidence','academy_competency_frameworks','academy_contacts','academy_conversations','academy_course_modules','academy_courses','academy_debt_cases','academy_entitlements','academy_expense_categories','academy_expenses','academy_export_jobs','academy_grade_categories','academy_guardian_consents','academy_guardian_link_tokens','academy_guardian_messages','academy_guardian_notification_preferences','academy_guardians','academy_import_effects','academy_import_jobs','academy_import_rows','academy_integration_deliveries','academy_integration_endpoints','academy_intervention_activities','academy_intervention_cases','academy_lead_activities','academy_lead_conversions','academy_lead_sources','academy_leads','academy_learning_plan_items','academy_learning_plans','academy_lesson_deliveries','academy_lesson_media','academy_lesson_progress','academy_lesson_sessions','academy_lessons','academy_localization_settings','academy_make_up_lessons','academy_marketing_attribution_metrics','academy_marketing_campaigns','academy_messages','academy_metric_definitions','academy_notification_delivery_attempts','academy_notifications','academy_offer_grants','academy_offers','academy_owner_intelligence','academy_payment_allocations','academy_payment_promises','academy_payment_reconciliations','academy_payments','academy_payroll_adjustments','academy_payroll_payouts','academy_payroll_periods','academy_payroll_row_totals','academy_pipeline_stages','academy_pipeline_transitions','academy_pricing_adjustments','academy_pricing_plans','academy_quiz_attempts','academy_quiz_questions','academy_quizzes','academy_referrals','academy_renewal_activities','academy_renewal_opportunities','academy_risk_definitions','academy_risk_evaluations','academy_risk_signals','academy_role_grants','academy_room_availability','academy_room_capacity_summary','academy_room_peak_periods','academy_rooms','academy_rubrics','academy_sensitive_case_events','academy_sensitive_cases','academy_service_request_events','academy_service_requests','academy_session_delivery','academy_session_quality_reviews','academy_session_staff_assignments','academy_staff','academy_staff_availability','academy_staff_branch_assignments','academy_staff_performance_metrics','academy_staff_requests','academy_student_guardian_relationships','academy_student_lifecycle_events','academy_submissions','academy_subscription_freezes','academy_subscriptions','academy_teacher_lesson_runs','academy_teacher_performance_metrics','academy_telegram_chats','academy_timetable_generation_runs','academy_timetable_series','academy_timetable_terms','academy_translation_overrides','academy_trial_lessons','academy_unified_student_intelligence','academy_unit_economics_metrics','academy_video_assets','academy_wallet_policy_status','domain_event_outbox','evaluations','exam_registrations','issued_certificates','parent_report_tokens','partner_center_profiles','partner_vouchers','sales_leads','tenant_memberships','tenants','users')
 loop
  if to_regclass('public.'||item.view_name) is not null then raise exception 'A legacy scope view name already exists';end if;
  -- Unmodified identity/FK columns preserve PostgREST embedding discovery.
  -- Classroom metadata and other users' non-directory fields stay private.
  columns:='';
  for column_item in select a.attname,format_type(a.atttypid,a.atttypmod) type_name from pg_attribute a where a.attrelid=item.relation_id and a.attnum>0 and not a.attisdropped order by a.attnum loop
   projection:=format('t.%I',column_item.attname);
    if column_item.attname ~ '(revenue|collected_amount|outstanding_amount|teacher_cost|contribution|generated_amount|final_payable_amount|payroll_total|discounts|refunds|lifetime_value|total_paid)' then
      projection:=format('case when public.academy_legacy_finance_visible(ctx.value,%L,to_jsonb(t)) then t.%I else null::%s end as %I',item.name,column_item.attname,column_item.type_name,column_item.attname);
      -- Old institution totals sum unrelated currencies; unavailable is honest.
      if item.name in('academy_business_dashboard_v2','academy_owner_intelligence') then projection:=format('null::%s as %I',column_item.type_name,column_item.attname);end if;
    end if;
    if item.name='academy_branch_comparison_v2' and column_item.attname in('collected_revenue','outstanding_amount') then
      if column_item.attname='collected_revenue' then
        projection:='(select coalesce(sum(p.amount),0)::bigint from public.academy_payments p join public.academy_branches b on b.academy_id=p.academy_id and b.id=t.branch_id where p.academy_id=t.academy_id and p.status=''paid'' and p.currency=b.currency and public.academy_legacy_payment_branch(p.academy_id,p.id)=b.id)';
      else
        projection:='(select coalesce(sum(p.outstanding_amount),0)::bigint from public.academy_charge_balances p join public.academy_branches b on b.academy_id=p.academy_id and b.id=t.branch_id where p.academy_id=t.academy_id and p.branch_id=b.id and p.currency=b.currency)';
      end if;
      projection:=format('case when public.academy_legacy_finance_visible(ctx.value,%L,to_jsonb(t)) then %s else null::bigint end as %I',item.name,projection,column_item.attname);
    end if;
   if item.name='users' and column_item.attname not in('id','email','full_name','is_active','created_at','updated_at') then
    projection:=format('case when t.id=(ctx.value->>''actor_id'')::uuid then t.%I else null::%s end as %I',column_item.attname,column_item.type_name,column_item.attname);
   elsif item.name='academy_classrooms' and column_item.attname not in('id','academy_id','branch_id','name','description','is_active','created_at','updated_at') then
    projection:=format('case when public.academy_legacy_scope_covered(ctx.value,jsonb_build_object(''kind'',''classroom'',''classroom_id'',t.id,''branch_id'',t.branch_id)) then t.%I else %s end as %I',column_item.attname,
     case when column_item.attname='metadata' then quote_literal('{}')||'::jsonb' else 'null::'||column_item.type_name end,column_item.attname);
   end if;
   columns:=columns||case when columns='' then '' else ',' end||projection;
  end loop;
  if item.name='academy_payments' then columns:=columns||',public.academy_legacy_payment_branch(t.academy_id,t.id) as branch_id';end if;
  if item.name='academy_branch_comparison_v2' then columns:=columns||',(select b.currency from public.academy_branches b where b.academy_id=t.academy_id and b.id=t.branch_id) as currency';end if;
  execute format('create view public.%I with(security_barrier=true) as with ctx as materialized(select public.academy_legacy_boundary_context() value) select %s from %s t cross join ctx where public.academy_legacy_row_allowed(ctx.value,%L,to_jsonb(t),false)',item.view_name,columns,item.relation_id,item.name);
  execute format('revoke all on public.%I from public,anon,authenticated',item.view_name);
  execute format('grant select on public.%I to service_role',item.view_name);
  if item.relkind in('r','p') and item.name not in('academy_audit_events','academy_access_audit_logs','academy_import_effects','academy_role_grants','academy_staff','academy_staff_branch_assignments') then
   execute format('create trigger academy_legacy_guard_before before insert or update or delete on %s for each row execute function public.academy_legacy_write_guard()',item.relation_id);
   execute format('create trigger zz_academy_legacy_guard_after after insert or update or delete on %s for each row execute function public.academy_legacy_write_guard()',item.relation_id);
  end if;
 end loop;
end;$catalogue$;

-- Only scope topology changes invalidate a multi-query legacy read; attendance,
-- grading and financial postings do not create an institution-wide write lock.
do $generations$
declare name text;
begin
 foreach name in array array['academy_branches','academy_classrooms','academy_contacts','academy_classroom_memberships','academy_classroom_courses','academy_staff','academy_staff_branch_assignments','academy_role_grants'] loop
  execute format('create trigger academy_legacy_generation_changed after insert or update or delete on public.%I for each row execute function public.academy_legacy_scope_generation_changed()',name);
 end loop;
end;$generations$;
notify pgrst,'reload schema';

create or replace function public.academy_legacy_global_search(p_academy_id uuid,p_query text,p_limit integer default 50)
returns table(result_type text,result_id uuid,label text,context text,route_hint text,branch_id uuid)
language sql security definer set search_path=public as $$
  with q as(select '%'||lower(trim(p_query))||'%' term),results as(
    select 'student',c.id,trim(c.first_name||' '||c.last_name),coalesce(c.email,c.phone,c.status),'/academy/admin/contacts',c.primary_branch_id from public.academy_scope_academy_contacts c,q where c.academy_id=p_academy_id and lower(c.first_name||' '||c.last_name||' '||coalesce(c.email,'')||' '||coalesce(c.phone_normalized,'')) like q.term
    union all select 'guardian',g.id,g.full_name,coalesce(g.email,g.phone,g.status),'/academy/admin/relationships',(select c.primary_branch_id from public.academy_scope_academy_student_guardian_relationships r join public.academy_scope_academy_contacts c on c.academy_id=r.academy_id and c.id=r.contact_id where r.academy_id=g.academy_id and r.guardian_id=g.id and r.status='active' limit 1) from public.academy_scope_academy_guardians g,q where g.academy_id=p_academy_id and lower(g.full_name||' '||coalesce(g.email,'')||' '||coalesce(g.phone_normalized,'')) like q.term
    union all select 'lead',l.id,l.full_name,coalesce(l.email,l.phone,l.status),'/academy/admin/business',l.branch_id from public.academy_scope_academy_leads l,q where l.academy_id=p_academy_id and lower(l.full_name||' '||coalesce(l.email,'')||' '||coalesce(l.phone_normalized,'')) like q.term
    union all select 'classroom',c.id,c.name,coalesce(c.description,''),'/academy/admin/classrooms',c.branch_id from public.academy_scope_academy_classrooms c,q where c.academy_id=p_academy_id and lower(c.name||' '||coalesce(c.description,'')) like q.term
    union all select 'course',c.id,c.title,coalesce(c.code,c.level,''),'/academy/admin/curriculum',null::uuid from public.academy_scope_academy_courses c,q where c.academy_id=p_academy_id and lower(c.title||' '||coalesce(c.code,'')||' '||coalesce(c.description,'')) like q.term
    union all select 'staff',s.id,coalesce(s.display_name,s.email),s.role,'/academy/admin/staff',(select a.branch_id from public.academy_scope_academy_staff_branch_assignments a where a.academy_id=s.academy_id and a.staff_id=s.id and a.status='active' limit 1) from public.academy_scope_academy_staff s,q where s.academy_id=p_academy_id and lower(coalesce(s.display_name,'')||' '||s.email||' '||s.role) like q.term
    union all select 'payment',p.id,coalesce(p.provider_transaction_id,p.id::text),p.status||' '||p.amount||' '||p.currency,'/academy/admin/payments',c.primary_branch_id from public.academy_scope_academy_payments p join public.academy_scope_academy_contacts c on c.academy_id=p.academy_id and c.id=p.contact_id,q where p.academy_id=p_academy_id and lower(coalesce(p.provider_transaction_id,'')||' '||p.status||' '||p.amount||' '||p.currency) like q.term
    union all select 'invoice',c.id,c.charge_number,c.status||' '||c.net_amount||' '||c.currency,'/academy/admin/commercial',c.branch_id from public.academy_charges c,q where c.academy_id=p_academy_id and lower(c.charge_number||' '||c.status||' '||coalesce(c.description,'')) like q.term
    union all select 'branch',b.id,b.name,coalesce(b.address,b.phone,''),'/academy/admin/business',b.id from public.academy_scope_academy_branches b,q where b.academy_id=p_academy_id and lower(b.name||' '||coalesce(b.address,'')||' '||coalesce(b.phone,'')) like q.term
  ) select * from results limit least(greatest(p_limit,1),100);
$$;
revoke all on function public.academy_legacy_global_search(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.academy_legacy_global_search(uuid,text,integer) to service_role;

commit;
