-- Legacy imports retain business records and immutable source/effect history.
-- One bounded batch commits its business changes, receipts and audit together.
begin;
set local lock_timeout='5s';
alter table public.academy_import_jobs add column command_phase text not null default 'idle' check(command_phase in('idle','commit','recover'));
alter table public.academy_import_jobs add column recovery_actor_id uuid;
alter table public.academy_import_jobs add column command_actor_id uuid;
alter table public.academy_import_effects add column recovery_snapshot jsonb;

create or replace function public.academy_command_covers(p_authorities jsonb,p_capability text,p_scope jsonb)
returns boolean language sql volatile set search_path=public as $$
 select exists(select 1 from jsonb_array_elements(p_authorities) a
  where public.academy_command_role_has(a->>'role',p_capability)
   and(a->>'expires_at' is null or(a->>'expires_at')::timestamptz>clock_timestamp())
   and case a->>'scope_type' when 'academy' then true
    when 'branches' then p_scope->>'kind'<>'academy' and(
      (p_scope->>'branch_id' is not null and a->'scope_ids' @> jsonb_build_array(p_scope->>'branch_id'))
      or(p_scope->>'kind'='contact' and exists(select 1 from jsonb_array_elements_text(coalesce(p_scope->'branch_ids','[]')) b where a->'scope_ids' @> jsonb_build_array(b))))
    when 'classrooms' then(p_scope->>'kind'='classroom' and a->'scope_ids' @> jsonb_build_array(p_scope->>'classroom_id'))
      or(p_scope->>'kind'='contact' and exists(select 1 from jsonb_array_elements_text(coalesce(p_scope->'classroom_ids','[]')) c where a->'scope_ids' @> jsonb_build_array(c)))
    when 'students' then p_scope->>'kind'='contact' and a->'scope_ids' @> jsonb_build_array(p_scope->>'contact_id')
    else false end);
$$;
revoke all on function public.academy_command_covers(jsonb,text,jsonb) from public,anon,authenticated,service_role;

create or replace function public.academy_command_resource(p_academy uuid,p_kind text,p_id uuid)
returns jsonb language plpgsql set search_path=public as $$
declare value jsonb; classes uuid[];branches uuid[];branch uuid;
begin
 if p_kind='academy' then return jsonb_build_object('kind','academy');end if;
 if p_kind='branch' then
  select to_jsonb(b) into value from public.academy_branches b where academy_id=p_academy and id=p_id for update;
  if value is null then raise exception using errcode='42501',message='This branch is not available';end if;
  return jsonb_build_object('kind','branch','branch_id',p_id,'active',value->'is_active');
 elsif p_kind='classroom' then
  select branch_id into branch from public.academy_classrooms where academy_id=p_academy and id=p_id;
  perform public.academy_command_resource(p_academy,'branch',branch);
  select to_jsonb(c) into value from public.academy_classrooms c where academy_id=p_academy and id=p_id for update;
  if value is null or(value->>'branch_id')::uuid is distinct from branch then raise exception using errcode='42501',message='This group is not available';end if;
  return jsonb_build_object('kind','classroom','branch_id',branch,'classroom_id',p_id,'active',value->'is_active');
 elsif p_kind='contact' then
  perform 1 from public.academy_classrooms c where c.academy_id=p_academy and exists(select 1 from public.academy_classroom_memberships m
   where m.academy_id=p_academy and m.contact_id=p_id and m.classroom_id=c.id and m.role='student' and m.status in('active','trial','paused')) order by c.id for update;
  select to_jsonb(c) into value from public.academy_contacts c where academy_id=p_academy and id=p_id for update;
  if value is null then raise exception using errcode='42501',message='This student is not available';end if;
  perform 1 from public.academy_classroom_memberships where academy_id=p_academy and contact_id=p_id order by id for share;
  select array_agg(distinct m.classroom_id),array_agg(distinct c.branch_id) into classes,branches from public.academy_classroom_memberships m
   join public.academy_classrooms c on c.academy_id=m.academy_id and c.id=m.classroom_id where m.academy_id=p_academy and m.contact_id=p_id and m.role='student' and m.status in('active','trial','paused');
  return jsonb_build_object('kind','contact','branch_id',value->'primary_branch_id','contact_id',p_id,'classroom_ids',coalesce(classes,'{}'),'branch_ids',coalesce(branches,'{}'));
 end if;
 raise exception using errcode='22023',message='Choose a valid resource';
end;$$;
revoke all on function public.academy_command_resource(uuid,text,uuid) from public,anon,authenticated,service_role;

create or replace function public.academy_legacy_import_assert_scope(p_authorities jsonb,p_type text,p_scope jsonb)
returns void language plpgsql set search_path=public as $$
declare capability text;
begin
 capability:=case p_type when 'contacts' then 'manageContacts' when 'leads' then 'manageAdmissions' when 'guardians' then 'manageGuardians'
  when 'classrooms' then 'manageClassrooms' when 'balances' then 'adjustFinance' when 'enrollments' then 'manageRoster' when 'attendance' then 'markAttendance' when 'staff' then 'manageStaff' end;
 if capability is null or not public.academy_command_covers(p_authorities,'manageImports',p_scope) or not public.academy_command_covers(p_authorities,capability,p_scope) then
  raise exception using errcode='42501',message='Your current access does not cover this import resource';end if;
end;$$;
revoke all on function public.academy_legacy_import_assert_scope(jsonb,text,jsonb) from public,anon,authenticated,service_role;

-- Lock staging and commit on the same job. An old page that staged before a
-- concurrent commit may not overwrite the accepted source when it resumes.
create or replace function public.academy_legacy_import_stage_guard()
returns trigger language plpgsql set search_path=public as $$
declare j public.academy_import_jobs;
begin
 select * into j from public.academy_import_jobs where academy_id=coalesce(new.academy_id,old.academy_id) and id=coalesce(new.import_job_id,old.import_job_id) for update;
 if j.id is null then raise exception using errcode='23505',message='Import job is no longer available';end if;
 if j.status not in('draft','validating','ready') and(tg_op in('INSERT','DELETE') or row(new.raw_data,new.mapped_data,new.row_number,new.import_job_id,new.academy_id)
  is distinct from row(old.raw_data,old.mapped_data,old.row_number,old.import_job_id,old.academy_id)) then raise exception using errcode='23505',message='Accepted import source cannot be changed';end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
create trigger academy_legacy_import_stage_guard before insert or update or delete on public.academy_import_rows for each row execute function public.academy_legacy_import_stage_guard();
revoke all on function public.academy_legacy_import_stage_guard() from public,anon,authenticated,service_role;

create or replace function public.academy_legacy_import_target(p_academy uuid,p_type text,p_mapped jsonb,p_authorities jsonb)
returns jsonb language plpgsql set search_path=public as $$
declare scopes jsonb:='[]';scope jsonb;target jsonb;ids uuid[];branch uuid;contact uuid;classroom uuid;table_name text;email_value text;phone_value text;
begin
 email_value:=nullif(lower(trim(p_mapped->>'email')),'');phone_value:=public.academy_normalize_phone(p_mapped->>'phone');
 if p_type in('contacts','leads','classrooms') then
  branch:=coalesce(nullif(p_mapped->>'primary_branch_id',''),nullif(p_mapped->>'branch_id',''))::uuid;
  scope:=public.academy_command_resource(p_academy,'branch',branch);
  if scope->>'active'<>'true' then raise exception using errcode='22023',message='Choose an active branch';end if;
  perform public.academy_legacy_import_assert_scope(p_authorities,p_type,scope);scopes:=scopes||jsonb_build_array(scope);
 elsif p_type in('balances','enrollments','attendance') then
  contact:=nullif(p_mapped->>'contact_id','')::uuid;
  if p_type in('enrollments','attendance') then
   classroom:=nullif(p_mapped->>'classroom_id','')::uuid;
   scope:=public.academy_command_resource(p_academy,'classroom',classroom);
   if scope->>'active'<>'true' then raise exception using errcode='22023',message='Choose an active group';end if;
   perform public.academy_legacy_import_assert_scope(p_authorities,p_type,scope);scopes:=scopes||jsonb_build_array(scope);
  end if;
  scope:=public.academy_command_resource(p_academy,'contact',contact);
  perform public.academy_legacy_import_assert_scope(p_authorities,p_type,scope);scopes:=scopes||jsonb_build_array(scope);
 else
  scope:=jsonb_build_object('kind','academy');perform public.academy_legacy_import_assert_scope(p_authorities,p_type,scope);scopes:=scopes||jsonb_build_array(scope);
 end if;
 table_name:=case p_type when 'contacts' then 'academy_contacts' when 'leads' then 'academy_leads' when 'guardians' then 'academy_guardians'
  when 'classrooms' then 'academy_classrooms' when 'balances' then 'academy_account_ledger_entries' when 'enrollments' then 'academy_classroom_memberships' when 'attendance' then 'academy_attendance' end;
 if p_type in('contacts','leads','guardians') then
  execute format('select array_agg(id order by id) from public.%I where academy_id=$1 and(($2 is not null and lower(trim(email))=$2) or($3 is not null and phone_normalized=$3))',table_name) into ids using p_academy,email_value,phone_value;
 elsif p_type='classrooms' then select array_agg(id order by id) into ids from public.academy_classrooms where academy_id=p_academy and branch_id=branch and lower(trim(name))=lower(trim(p_mapped->>'name'));
 elsif p_type='enrollments' then select array_agg(id order by id) into ids from public.academy_classroom_memberships where academy_id=p_academy and classroom_id=classroom and contact_id=contact and role='student';
 elsif p_type='attendance' then select array_agg(id order by id) into ids from public.academy_attendance where academy_id=p_academy and classroom_id=classroom and contact_id=contact and session_date=(p_mapped->>'session_date')::date and session_id is null;
 end if;
 if cardinality(ids)>1 then raise exception using errcode='23505',message='Conflicting identities require staff review';end if;
 if cardinality(ids)=1 then
  if p_type='contacts' then scope:=public.academy_command_resource(p_academy,'contact',ids[1]);
  elsif p_type='leads' then
   select branch_id into branch from public.academy_leads where academy_id=p_academy and id=ids[1];scope:=public.academy_command_resource(p_academy,'branch',branch);
  elsif p_type='classrooms' then scope:=public.academy_command_resource(p_academy,'classroom',ids[1]);
  else scope:=scopes->0;end if;
  perform public.academy_legacy_import_assert_scope(p_authorities,p_type,scope);scopes:=scopes||jsonb_build_array(scope);
  execute format('select to_jsonb(t) from public.%I t where academy_id=$1 and id=$2 for update',table_name) into target using p_academy,ids[1];
  if target is null then raise exception using errcode='23505',message='Import identity changed; review the source';end if;
  if p_type='leads' then scope:=public.academy_command_resource(p_academy,'branch',(target->>'branch_id')::uuid);perform public.academy_legacy_import_assert_scope(p_authorities,p_type,scope);scopes:=scopes||jsonb_build_array(scope);end if;
  if p_type in('contacts','leads','guardians') and not(coalesce(email_value=lower(trim(target->>'email')),false) or coalesce(phone_value=target->>'phone_normalized',false)) then raise exception using errcode='23505',message='Import identity changed; review the source';end if;
 end if;
 return jsonb_build_object('table',table_name,'existing',target,'scopes',scopes);
end;$$;
revoke all on function public.academy_legacy_import_target(uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;

-- Newly discovered foreign keys and contextual student/group activity fail
-- closed. Immutable lifecycle entries from this same import are not later use.
create or replace function public.academy_legacy_import_used(p_table text,p_snapshot jsonb,p_job uuid)
returns boolean language plpgsql set search_path=public as $$
declare fk record;condition text;present boolean;
begin
 if p_table not in('academy_contacts','academy_leads','academy_guardians','academy_classrooms','academy_classroom_memberships','academy_attendance') then return true;end if;
 for fk in select k.oid,k.conrelid,k.conkey,k.confkey,n.nspname,c.relname from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
  where k.contype='f' and k.confrelid=to_regclass('public.'||p_table) loop
  select string_agg(format('to_jsonb(t)->%L = $1->%L',ca.attname,pa.attname),' and ' order by pair.ord) into condition from unnest(fk.conkey,fk.confkey) with ordinality pair(child,parent,ord)
   join pg_attribute ca on ca.attrelid=fk.conrelid and ca.attnum=pair.child join pg_attribute pa on pa.attrelid=to_regclass('public.'||p_table) and pa.attnum=pair.parent;
  if fk.nspname='public' and fk.relname='academy_student_lifecycle_events' then condition:=condition||' and coalesce(t.evidence->>''legacy_import_job_id'','''')<>$2::text';end if;
  execute format('select exists(select 1 from %I.%I t where %s)',fk.nspname,fk.relname,condition) into present using p_snapshot,p_job;
  if present then return true;end if;
 end loop;
 if p_table='academy_classroom_memberships' then
  for fk in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in('r','p') and n.nspname not in('pg_catalog','information_schema')
   and c.oid<>'public.academy_classroom_memberships'::regclass and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='contact_id' and not a.attisdropped)
   and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='classroom_id' and not a.attisdropped) loop
   execute format('select exists(select 1 from %I.%I t where to_jsonb(t)->''contact_id''=$1->''contact_id'' and to_jsonb(t)->''classroom_id''=$1->''classroom_id''%s)',fk.nspname,fk.relname,
    case when fk.nspname='public' and fk.relname='academy_student_lifecycle_events' then ' and coalesce(t.evidence->>''legacy_import_job_id'','''')<>$2::text' else '' end) into present using p_snapshot,p_job;
   if present then return true;end if;
  end loop;
 end if;
 return false;
exception when insufficient_privilege then return true;
end;$$;
revoke all on function public.academy_legacy_import_used(text,jsonb,uuid) from public,anon,authenticated,service_role;

create or replace function public.academy_legacy_recovery_guard()
returns trigger language plpgsql set search_path=public as $$
begin
 if old.recovery_snapshot is not null and row(new.recovery_snapshot,new.rollback_status,new.rollback_reference_id,new.rolled_back_at)
  is distinct from row(old.recovery_snapshot,old.rollback_status,old.rollback_reference_id,old.rolled_back_at) then
  raise exception using errcode='23505',message='Completed recovery evidence is immutable';end if;
 return new;
end;$$;
revoke all on function public.academy_legacy_recovery_guard() from public,anon,authenticated,service_role;
create trigger academy_legacy_recovery_guard before update on public.academy_import_effects for each row execute function public.academy_legacy_recovery_guard();
commit;
