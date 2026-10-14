-- A legacy staff row must never create authority separately from its grant,
-- immutable source/effect evidence and recovery history.
begin;
set local lock_timeout='5s';

create or replace function public.academy_legacy_import_evidence_guard()
returns trigger language plpgsql set search_path=public as $$
begin
 if tg_table_name='academy_import_effects' then
  if tg_op='DELETE' or row(new.id,new.academy_id,new.import_job_id,new.import_row_id,new.target_table,new.target_id,new.effect_type,new.rollback_strategy,new.before_snapshot,new.after_snapshot,new.created_at)
   is distinct from row(old.id,old.academy_id,old.import_job_id,old.import_row_id,old.target_table,old.target_id,old.effect_type,old.rollback_strategy,old.before_snapshot,old.after_snapshot,old.created_at) then
   raise exception using errcode='23505',message='Import effect evidence is immutable';end if;
 else
  -- The preceding Edge version inserts evidence before marking its row.
  -- Permit that one exact finalization; source content remains immutable.
  if tg_op='UPDATE' and old.validation_status in('valid','duplicate') and new.validation_status='committed'
   and row(new.id,new.academy_id,new.import_job_id,new.row_number,new.raw_data,new.mapped_data,new.duplicate_key)
    is not distinct from row(old.id,old.academy_id,old.import_job_id,old.row_number,old.raw_data,old.mapped_data,old.duplicate_key)
   and exists(select 1 from public.academy_import_effects e where e.academy_id=old.academy_id and e.import_row_id=old.id
    and e.import_job_id=old.import_job_id and e.target_id=new.target_id and e.target_table=new.target_table and e.rollback_status='pending') then return new;end if;
  if exists(select 1 from public.academy_import_effects e where e.academy_id=old.academy_id and e.import_row_id=old.id) and
   (tg_op='DELETE' or row(new.id,new.academy_id,new.import_job_id,new.row_number,new.raw_data,new.mapped_data,new.duplicate_key,new.target_id,new.target_table,new.validation_status)
    is distinct from row(old.id,old.academy_id,old.import_job_id,old.row_number,old.raw_data,old.mapped_data,old.duplicate_key,old.target_id,old.target_table,old.validation_status)) then
   raise exception using errcode='23505',message='A committed import source cannot be rewritten';end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
revoke all on function public.academy_legacy_import_evidence_guard() from public,anon,authenticated,service_role;
create trigger academy_legacy_import_effect_evidence_guard before update or delete on public.academy_import_effects
 for each row execute function public.academy_legacy_import_evidence_guard();
create trigger academy_legacy_import_committed_source_guard before update or delete on public.academy_import_rows
 for each row execute function public.academy_legacy_import_evidence_guard();

create or replace function public.academy_legacy_staff_import_snapshot(p_academy uuid,p_email text)
returns jsonb language plpgsql set search_path=public as $$
declare g public.academy_role_grants;s public.academy_staff;n integer;scopes jsonb:='[]';
begin
 select count(*) into n from public.academy_role_grants where academy_id=p_academy and lower(trim(email))=lower(trim(p_email));
 if n>1 then raise exception using errcode='23505',message='Multiple staff grants need manual review';end if;
 select * into g from public.academy_role_grants where academy_id=p_academy and lower(trim(email))=lower(trim(p_email));
 select count(*) into n from public.academy_staff where academy_id=p_academy and(lower(trim(email))=lower(trim(p_email)) or managed_grant_id=g.id);
 if n>1 then raise exception using errcode='23505',message='Multiple staff profiles need manual review';end if;
 select * into s from public.academy_staff where academy_id=p_academy and(lower(trim(email))=lower(trim(p_email)) or managed_grant_id=g.id);
 if g.id is not null then scopes:=scopes||jsonb_build_array(jsonb_build_object('type',g.scope_type,'ids',g.scope_ids));end if;
 if s.id is not null then scopes:=scopes||jsonb_build_array(public.academy_staff_profile_scope(p_academy,s.id));end if;
 return jsonb_build_object('grant',case when g.id is not null then to_jsonb(g) end,'staff_profile',case when s.id is not null then to_jsonb(s) end,'protected_scopes',scopes);
end;$$;
revoke all on function public.academy_legacy_staff_import_snapshot(uuid,text) from public,anon,authenticated,service_role;

create or replace function public.academy_legacy_staff_import_row(p_academy_id uuid,p_actor_id uuid,p_row_id uuid,p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='20s' as $$
declare j public.academy_import_jobs;r public.academy_import_rows;fresh public.academy_import_rows;e public.academy_import_effects;
 auths jsonb;snapshot jsonb;result jsonb;before_state jsonb;scope jsonb;payload jsonb;scopes jsonb;email_value text;active_value boolean;existing boolean;active_text text;
begin
 perform 1 from auth.users where id=p_actor_id for share;
 perform pg_advisory_xact_lock(hashtextextended('academy:staff:'||p_academy_id::text,0));
 auths:=public.academy_current_authorities(p_academy_id,p_actor_id);
 if not exists(select 1 from jsonb_array_elements(auths) a where a->>'role' in('owner','admin','center_admin')) then raise exception using errcode='42501',message='Forbidden staff import';end if;
 select * into r from public.academy_import_rows where academy_id=p_academy_id and id=p_row_id;
 if not found then raise exception using errcode='P0002',message='Import row not found';end if;
 select * into j from public.academy_import_jobs where academy_id=p_academy_id and id=r.import_job_id;
 if not found or j.import_type<>'staff' then raise exception using errcode='42501',message='Staff import namespace is invalid';end if;
 select * into e from public.academy_import_effects where academy_id=p_academy_id and import_row_id=r.id;
 if found then
  if e.rollback_status<>'pending' or j.rollback_status in('in_progress','completed','partial','manual_required') then raise exception using errcode='23505',message='This import has entered recovery; review its retained history';end if;
  if e.target_table<>'academy_staff' or e.after_snapshot->>'command_version'<>'1' then raise exception using errcode='23505',message='Review this historical staff import before continuing';end if;
  for scope in select value from jsonb_array_elements(e.after_snapshot->'protected_scopes') loop
   if not public.academy_staff_scope_covers(p_academy_id,auths,scope) then raise exception using errcode='42501',message='Current access does not cover this import receipt';end if;end loop;
  return jsonb_build_object('effect',to_jsonb(e),'replayed',true,'committed',true);
 end if;
 if j.status not in('ready','committing','failed') or j.rollback_status in('in_progress','completed','partial','manual_required')
  or r.validation_status not in('valid','duplicate') then raise exception using errcode='23505',message='Review the staff import row before committing';end if;
 if j.import_mode='dry_run' and not p_confirm then raise exception using errcode='22023',message='Confirm the reviewed import before committing';end if;
 email_value:=lower(trim(r.mapped_data->>'email'));
 if email_value is null or email_value='' then raise exception using errcode='22023',message='Staff email is required';end if;
 before_state:=public.academy_legacy_staff_import_snapshot(p_academy_id,email_value);
 existing:=before_state->'grant'<>'null'::jsonb or before_state->'staff_profile'<>'null'::jsonb;
 for scope in select value from jsonb_array_elements(before_state->'protected_scopes') loop
  if not public.academy_staff_scope_covers(p_academy_id,auths,scope) then raise exception using errcode='42501',message='Current access does not cover the existing staff identity';end if;end loop;
 if existing and j.duplicate_strategy='reject' then raise exception using errcode='23505',message='Duplicate staff identity needs review';end if;
 if existing and j.duplicate_strategy='skip' then
  select * into j from public.academy_import_jobs where academy_id=p_academy_id and id=j.id for update;
  select * into fresh from public.academy_import_rows where academy_id=p_academy_id and id=r.id for update;
  if row(fresh.raw_data,fresh.mapped_data,fresh.validation_status) is distinct from row(r.raw_data,r.mapped_data,r.validation_status) then raise exception using errcode='23505',message='Import source changed; review the row again';end if;
  update public.academy_import_rows set validation_status='duplicate',validation_errors='["Existing staff identity skipped"]' where academy_id=p_academy_id and id=r.id;
  return jsonb_build_object('replayed',false,'committed',false,'skipped',true);
 end if;
 -- Normalize historical spreadsheet text without rewriting retained source.
 active_text:=lower(trim(coalesce(r.mapped_data->>'is_active','')));
 active_text:=translate(active_text,'‘’''','___');
 if active_text in('','true','yes','ha','да','1','on') then active_value:=true;
 elsif active_text in('false','no','yo_q','нет','0','off') then active_value:=false;
 else raise exception using errcode='22023',message='Active status must be yes or no';end if;
 payload:=jsonb_build_object('staff_email',email_value,'status',case when active_value then 'active' else 'suspended' end);
 if existing then
  if before_state->'grant'<>'null'::jsonb and before_state->'staff_profile'<>'null'::jsonb and before_state->'staff_profile'->>'managed_grant_id' is null then
   scope:=public.academy_staff_profile_scope(p_academy_id,(before_state->'staff_profile'->>'id')::uuid);
   if before_state->'grant'->>'role'<>before_state->'staff_profile'->>'role' or scope->>'type'<>before_state->'grant'->>'scope_type'
    or public.academy_authority_scope_ids(scope->'ids') is distinct from public.academy_authority_scope_ids(before_state->'grant'->'scope_ids') then
    raise exception using errcode='23505',message='Review conflicting historical staff access in the staff editor';end if;
  end if;
  payload:=payload||jsonb_build_object('id',coalesce(before_state->'grant'->>'id',before_state->'staff_profile'->>'id'));
 else
  payload:=payload||jsonb_build_object('staff_role',r.mapped_data->>'role','classroom_ids',coalesce(r.mapped_data->'classroom_ids','[]'));
  if r.mapped_data ? 'scope_type' then payload:=payload||jsonb_build_object('scope_type',r.mapped_data->'scope_type','scope_ids',r.mapped_data->'scope_ids');end if;
  if r.mapped_data ? 'branch_ids' then payload:=payload||jsonb_build_object('branch_ids',r.mapped_data->'branch_ids');end if;
 end if;
 if nullif(trim(coalesce(r.mapped_data->>'display_name',r.mapped_data->>'full_name')),'') is not null then
  payload:=payload||jsonb_build_object('name',trim(coalesce(r.mapped_data->>'display_name',r.mapped_data->>'full_name')));end if;
 -- Auth/public target locks and canonical staff writes precede import-job locks.
 -- Recheck the exact source afterward; a changed source rolls back this entire
 -- transaction, including the nested staff command and its audit/receipt.
 result:=public.academy_staff_access_command(p_academy_id,p_actor_id,'upsert_staff',payload,'legacy-staff-row:'||r.id::text);
 select * into j from public.academy_import_jobs where academy_id=p_academy_id and id=j.id for update;
 select * into fresh from public.academy_import_rows where academy_id=p_academy_id and id=r.id for update;
 if j.status not in('ready','committing','failed') or j.import_type<>'staff' or row(fresh.raw_data,fresh.mapped_data,fresh.validation_status,fresh.duplicate_key)
  is distinct from row(r.raw_data,r.mapped_data,r.validation_status,r.duplicate_key) then raise exception using errcode='23505',message='Import source changed; review the row again';end if;
 if j.import_mode='dry_run' and j.status<>'ready' then raise exception using errcode='23505',message='A reviewed dry run is required';end if;
 update public.academy_import_jobs set status='committing',import_mode='commit' where academy_id=p_academy_id and id=j.id;
 scopes:=before_state->'protected_scopes'||jsonb_build_array(jsonb_build_object('type',result->'grant'->>'scope_type','ids',result->'grant'->'scope_ids'));
 snapshot:=jsonb_build_object('command_version','1','grant',result->'grant','staff_profile',result->'staff_profile','protected_scopes',scopes,'source',r.mapped_data,'source_raw',r.raw_data,'actor_id',p_actor_id);
 update public.academy_import_rows set validation_status='committed',target_table='academy_staff',target_id=(result->'staff_profile'->>'id')::uuid,validation_errors='[]'
  where academy_id=p_academy_id and id=r.id;
 insert into public.academy_import_effects(academy_id,import_job_id,import_row_id,target_table,target_id,effect_type,rollback_strategy,before_snapshot,after_snapshot)
  values(p_academy_id,j.id,r.id,'academy_staff',(result->'staff_profile'->>'id')::uuid,case when existing then 'safe_update' else 'insert' end,
   case when existing then 'restore_snapshot' else 'manual_review' end,before_state,snapshot) returning * into e;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_academy_id,p_actor_id,'import.staff_row_committed','academy_import_row',r.id::text,jsonb_build_object('job_id',j.id,'effect_id',e.id,'staff_id',e.target_id));
 perform public.academy_current_authorities(p_academy_id,p_actor_id);
 for scope in select value from jsonb_array_elements(scopes) loop
  if not public.academy_staff_scope_covers(p_academy_id,auths,scope) then raise exception using errcode='42501',message='Staff import access expired';end if;end loop;
 return jsonb_build_object('effect',to_jsonb(e),'replayed',false,'committed',true);
end;$$;
revoke all on function public.academy_legacy_staff_import_row(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.academy_legacy_staff_import_row(uuid,uuid,uuid,boolean) to service_role;

create or replace function public.academy_legacy_staff_has_references(p_staff public.academy_staff)
returns boolean language plpgsql set search_path=public as $$
declare fk record;condition text;present boolean;
begin
 for fk in select c.oid,n.nspname,t.relname,c.conkey,c.confkey from pg_constraint c join pg_class t on t.oid=c.conrelid
  join pg_namespace n on n.oid=t.relnamespace where c.contype='f' and c.confrelid='public.academy_staff'::regclass
  and c.conrelid<>'public.academy_staff_branch_assignments'::regclass loop
  select string_agg(format('to_jsonb(t)->%L = $1->%L',child.attname,parent.attname),' and ' order by keys.ordinal) into condition
   from unnest(fk.conkey,fk.confkey) with ordinality keys(child_key,parent_key,ordinal)
   join pg_attribute child on child.attrelid=(select conrelid from pg_constraint where oid=fk.oid) and child.attnum=keys.child_key
   join pg_attribute parent on parent.attrelid='public.academy_staff'::regclass and parent.attnum=keys.parent_key;
  execute format('select exists(select 1 from %I.%I t where %s)',fk.nspname,fk.relname,condition) into present using to_jsonb(p_staff);
  if present then return true;end if;
 end loop;
 return false;
exception when insufficient_privilege then return true;
end;$$;
revoke all on function public.academy_legacy_staff_has_references(public.academy_staff) from public,anon,authenticated,service_role;

create or replace function public.academy_legacy_staff_import_recover(p_academy_id uuid,p_actor_id uuid,p_effect_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='20s' as $$
declare e public.academy_import_effects;auths jsonb;scope jsonb;g public.academy_role_grants;s public.academy_staff;
 current_state jsonb;before_state jsonb;payload jsonb;manual boolean:=false;message text;command_result jsonb;
begin
 if nullif(trim(p_reason),'') is null or length(p_reason)>1000 then raise exception using errcode='22023',message='A recovery reason is required';end if;
 perform 1 from auth.users where id=p_actor_id for share;
 perform pg_advisory_xact_lock(hashtextextended('academy:staff:'||p_academy_id::text,0));
 auths:=public.academy_current_authorities(p_academy_id,p_actor_id);
 if not exists(select 1 from jsonb_array_elements(auths) a where a->>'role' in('owner','admin','center_admin')) then raise exception using errcode='42501',message='Forbidden staff import recovery';end if;
 select * into e from public.academy_import_effects where academy_id=p_academy_id and id=p_effect_id;
 if not found or e.target_table<>'academy_staff' then raise exception using errcode='P0002',message='Staff import effect not found';end if;
 if e.after_snapshot->>'command_version'='1' then
  for scope in select value from jsonb_array_elements(e.after_snapshot->'protected_scopes') loop
   if not public.academy_staff_scope_covers(p_academy_id,auths,scope) then raise exception using errcode='42501',message='Current access does not cover the original staff import';end if;end loop;
  select * into g from public.academy_role_grants where academy_id=p_academy_id and id=(e.after_snapshot->'grant'->>'id')::uuid;
  select * into s from public.academy_staff where academy_id=p_academy_id and id=e.target_id;
  if s.id is not null then
   scope:=public.academy_staff_profile_scope(p_academy_id,s.id);
   if not public.academy_staff_scope_covers(p_academy_id,auths,scope) then raise exception using errcode='42501',message='Current access does not cover the current staff identity';end if;
  end if;
  if e.rollback_status='completed' then return jsonb_build_object('effect',to_jsonb(e),'replayed',true,'manual_required',false);end if;
  current_state:=jsonb_build_object('grant',to_jsonb(g)-'updated_at','staff_profile',to_jsonb(s)-'updated_at');
  if g.id is null or s.id is null or s.managed_grant_id is distinct from g.id or current_state is distinct from
   jsonb_build_object('grant',(e.after_snapshot->'grant')-'updated_at','staff_profile',(e.after_snapshot->'staff_profile')-'updated_at')
   or g.last_used_at is not null or public.academy_legacy_staff_has_references(s) then
   manual:=true;message:='Staff access changed or has been used; records retained for review';
  else
   before_state:=e.before_snapshot;
   if e.effect_type='insert' and before_state->'grant'='null'::jsonb and before_state->'staff_profile'='null'::jsonb then
    command_result:=public.academy_staff_access_command(p_academy_id,p_actor_id,'remove_staff',jsonb_build_object('id',g.id),'legacy-staff-recover:'||e.id::text);
   elsif e.effect_type='safe_update' then
    if before_state->'grant'<>'null'::jsonb and (before_state->'grant'->>'role'<>g.role or before_state->'grant'->>'scope_type'<>g.scope_type
     or public.academy_authority_scope_ids(before_state->'grant'->'scope_ids') is distinct from public.academy_authority_scope_ids(g.scope_ids)) then
     manual:=true;message:='Original staff scope needs explicit operator review';
    else
     payload:=jsonb_build_object('id',g.id,'staff_email',g.email,'name',coalesce(before_state->'grant'->'display_name',before_state->'staff_profile'->'display_name'),
      'status',coalesce(before_state->'grant'->>'status',case when before_state->'staff_profile'->>'is_active'='true' then 'active' else 'suspended' end));
     command_result:=public.academy_staff_access_command(p_academy_id,p_actor_id,'upsert_staff',payload,'legacy-staff-recover:'||e.id::text);
    end if;
   else manual:=true;message:='Historical staff effect needs explicit operator review';end if;
  end if;
 else
  -- Historical one-record effects do not prove a canonical grant's identity.
  -- Retain them; never delete a profile while leaving a grant active.
  if not public.academy_staff_scope_covers(p_academy_id,auths,jsonb_build_object('type','academy','ids','[]'::jsonb)) then
   raise exception using errcode='42501',message='An Academy-wide staff manager must review this historical effect';end if;
  if e.rollback_status='completed' then return jsonb_build_object('effect',to_jsonb(e),'replayed',true,'manual_required',false);end if;
  manual:=true;message:='Historical grant/profile provenance is incomplete; records retained for review';
 end if;
 select * into e from public.academy_import_effects where academy_id=p_academy_id and id=p_effect_id for update;
 update public.academy_import_effects set rollback_status=case when manual then 'manual_required' else 'completed' end,
  rollback_error=case when manual then message end,rolled_back_at=case when manual then null else clock_timestamp() end
  where academy_id=p_academy_id and id=p_effect_id returning * into e;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_academy_id,p_actor_id,'import.staff_row_recovered','academy_import_effect',e.id::text,jsonb_build_object('job_id',e.import_job_id,'manual_required',manual,'reason',trim(p_reason),'records_deleted',0));
 perform public.academy_current_authorities(p_academy_id,p_actor_id);
 if e.after_snapshot->>'command_version'='1' then
  for scope in select value from jsonb_array_elements(e.after_snapshot->'protected_scopes') loop
   if not public.academy_staff_scope_covers(p_academy_id,auths,scope) then raise exception using errcode='42501',message='Staff recovery access expired';end if;end loop;
 end if;
 return jsonb_build_object('effect',to_jsonb(e),'replayed',false,'manual_required',manual,'records_deleted',0);
end;$$;
revoke all on function public.academy_legacy_staff_import_recover(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.academy_legacy_staff_import_recover(uuid,uuid,uuid,text) to service_role;

create or replace function public.academy_legacy_staff_import_finish(p_academy_id uuid,p_actor_id uuid,p_job_id uuid,p_recovery boolean default false,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='20s' as $$
declare j public.academy_import_jobs;e public.academy_import_effects;auths jsonb;scope jsonb;committed integer;failed integer;pending integer;manual integer;recovered integer;recovery_pending integer;state text;
begin
 perform 1 from auth.users where id=p_actor_id for share;
 perform pg_advisory_xact_lock(hashtextextended('academy:staff:'||p_academy_id::text,0));
 auths:=public.academy_current_authorities(p_academy_id,p_actor_id);
 if not exists(select 1 from jsonb_array_elements(auths) a where a->>'role' in('owner','admin','center_admin')) then raise exception using errcode='42501',message='Forbidden staff import history';end if;
 select * into j from public.academy_import_jobs where academy_id=p_academy_id and id=p_job_id for update;
 if not found or j.import_type<>'staff' then raise exception using errcode='P0002',message='Staff import job not found';end if;
 if not p_recovery and (j.status not in('ready','committing','failed','completed') or j.rollback_status in('in_progress','completed','partial','manual_required')) then
  raise exception using errcode='23505',message='Review the import state before finishing';end if;
 for e in select * from public.academy_import_effects where academy_id=p_academy_id and import_job_id=p_job_id loop
  if e.after_snapshot->>'command_version'='1' then
   for scope in select value from jsonb_array_elements(e.after_snapshot->'protected_scopes') loop
    if not public.academy_staff_scope_covers(p_academy_id,auths,scope) then raise exception using errcode='42501',message='Current access does not cover the complete import history';end if;end loop;
  elsif not public.academy_staff_scope_covers(p_academy_id,auths,jsonb_build_object('type','academy','ids','[]'::jsonb)) then raise exception using errcode='42501',message='Historical staff import needs an Academy-wide manager';end if;
 end loop;
 select count(*)::integer,count(*) filter(where rollback_status='manual_required')::integer,count(*) filter(where rollback_status='completed')::integer,
  count(*) filter(where rollback_status in('pending','failed'))::integer into committed,manual,recovered,recovery_pending
  from public.academy_import_effects where academy_id=p_academy_id and import_job_id=p_job_id;
 select count(*) filter(where validation_status='invalid')::integer,count(*) filter(where validation_status='valid' or(validation_status='duplicate' and j.duplicate_strategy='update_safe_fields'))::integer into failed,pending
  from public.academy_import_rows where academy_id=p_academy_id and import_job_id=p_job_id;
 if p_recovery then
  if committed=0 then raise exception using errcode='23505',message='There are no committed staff effects to recover';end if;
  if nullif(trim(p_reason),'') is null or length(p_reason)>1000 then raise exception using errcode='22023',message='A recovery reason is required';end if;
  state:=case when recovery_pending>0 then 'partial' when manual>0 then 'manual_required' when recovered=committed then 'completed' else 'partial' end;
  update public.academy_import_jobs set committed_rows=committed,rollback_status=state,rollback_reason=trim(p_reason),rolled_back_by=p_actor_id,
   rolled_back_at=case when state='completed' then coalesce(rolled_back_at,clock_timestamp()) else null end where academy_id=p_academy_id and id=p_job_id;
 else
  state:=case when failed>0 then 'failed' when pending>0 then 'committing' else 'completed' end;
  update public.academy_import_jobs set committed_rows=committed,status=state,import_mode='commit',committed_by=p_actor_id,completed_at=case when state='completed' then coalesce(completed_at,clock_timestamp()) else null end,
   rollback_status=case when committed>0 then 'available' else 'unavailable' end,error_summary=case when failed>0 then jsonb_build_array(jsonb_build_object('failed_rows',failed)) else '[]'::jsonb end
   where academy_id=p_academy_id and id=p_job_id;
 end if;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_academy_id,p_actor_id,case when p_recovery then 'import.staff_recovery_finished' else 'import.staff_batch_finished' end,'academy_import_job',p_job_id::text,
   jsonb_build_object('committed_rows',committed,'pending_rows',pending,'manual_required',manual,'recovered',recovered,'reason',p_reason));
 perform public.academy_current_authorities(p_academy_id,p_actor_id);
 for e in select * from public.academy_import_effects where academy_id=p_academy_id and import_job_id=p_job_id loop
  for scope in select value from jsonb_array_elements(coalesce(e.after_snapshot->'protected_scopes','[{"type":"academy","ids":[]}]'::jsonb)) loop
   if not public.academy_staff_scope_covers(p_academy_id,auths,scope) then raise exception using errcode='42501',message='Staff import history access expired';end if;end loop;
 end loop;
 return jsonb_build_object('import_job_id',p_job_id,'status',case when p_recovery then j.status else state end,'rollback_status',case when p_recovery then state else case when committed>0 then 'available' else 'unavailable' end end,
  'committed_rows',committed,'failed_rows',failed,'pending_rows',pending,'recovery_pending',recovery_pending,'completed',recovered,'manual_required',manual,'failed',0);
end;$$;
revoke all on function public.academy_legacy_staff_import_finish(uuid,uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.academy_legacy_staff_import_finish(uuid,uuid,uuid,boolean,text) to service_role;

commit;
