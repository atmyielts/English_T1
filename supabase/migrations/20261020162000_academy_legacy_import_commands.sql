begin;
set local lock_timeout='5s';
create or replace function public.academy_legacy_import_validate(p_type text,p_mapped jsonb)
returns jsonb language plpgsql set search_path=public as $$
declare m jsonb:=p_mapped;errors jsonb:='[]';field text;amount_text text;date_value date;
begin
 if jsonb_typeof(m) is distinct from 'object' then raise exception using errcode='22023',message='Mapped columns are required';end if;
 foreach field in array array['first_name','last_name','full_name','name','email','phone','branch_id','primary_branch_id','contact_id','classroom_id','session_date','reason','status','currency'] loop
  if m?field then m:=jsonb_set(m,array[field],to_jsonb(trim(coalesce(m->>field,''))));end if;
 end loop;
 if m?'email' then m:=jsonb_set(m,'{email}',to_jsonb(lower(m->>'email')));end if;
 foreach field in array case p_type when 'contacts' then array['first_name'] when 'leads' then array['full_name'] when 'guardians' then array['full_name'] when 'classrooms' then array['name'] when 'balances' then array['contact_id','amount','reason'] when 'enrollments' then array['contact_id','classroom_id'] when 'attendance' then array['contact_id','classroom_id','session_date'] else '{}'::text[] end loop
  if nullif(m->>field,'') is null then errors:=errors||jsonb_build_array(field||' is required');end if;
 end loop;
 if p_type in('contacts','leads','guardians') and nullif(m->>'email','') is null and public.academy_normalize_phone(m->>'phone') is null then errors:=errors||'["A phone number or email is required"]'::jsonb;end if;
 if nullif(m->>'email','') is not null and(m->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(m->>'email')>254) then errors:=errors||'["Review the email address"]'::jsonb;end if;
 foreach field in array array['branch_id','primary_branch_id','contact_id','classroom_id'] loop
  if nullif(m->>field,'') is not null and m->>field !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then errors:=errors||jsonb_build_array('Choose a valid '||replace(field,'_id',''));end if;
 end loop;
 if p_type in('contacts','leads','classrooms') and coalesce(nullif(m->>'primary_branch_id',''),nullif(m->>'branch_id','')) is null then errors:=errors||'["Choose a branch"]'::jsonb;end if;
 if p_type='guardians' then m:=(m-'telegram_user_id'-'telegram_chat_id'-'user_id')||'{"status":"invited"}'::jsonb;end if;
 if p_type='classrooms' then
  if m?'is_active' and jsonb_typeof(m->'is_active')<>'boolean' then
   if lower(m->>'is_active') in('true','yes','1','ha','да') then m:=jsonb_set(m,'{is_active}','true');
   elsif lower(m->>'is_active') in('false','no','0','нет','yo_q') then m:=jsonb_set(m,'{is_active}','false');
   else errors:=errors||'["Active status must be yes or no"]'::jsonb;end if;
  end if;
  if nullif(m->>'student_capacity','') is not null and(m->>'student_capacity' !~ '^\d{1,9}$' or(m->>'student_capacity')::numeric>2147483647) then errors:=errors||'["Capacity must be a non-negative integer"]'::jsonb;end if;
 end if;
 if p_type='balances' then
  amount_text:=trim(m->>'amount');
  if amount_text is null or amount_text !~ '^[+-]?\d{1,19}$' then errors:=errors||'["Use exact non-zero whole units for the balance"]'::jsonb;
  elsif amount_text::numeric=0 or abs(amount_text::numeric)>9223372036854775807 or(jsonb_typeof(m->'amount')='number' and abs(amount_text::numeric)>9007199254740991) then errors:=errors||'["The balance is outside the exact supported range; use integer text"]'::jsonb;
  else m:=jsonb_set(m,'{amount}',to_jsonb((amount_text::numeric)::text));end if;
 end if;
 if p_type='attendance' then
  begin date_value:=(m->>'session_date')::date;if to_char(date_value,'YYYY-MM-DD') is distinct from m->>'session_date' then raise invalid_datetime_format;end if;
  exception when invalid_datetime_format or datetime_field_overflow then errors:=errors||'["Use YYYY-MM-DD for the lesson date"]'::jsonb;end;
  if coalesce(nullif(m->>'status',''),'present') not in('present','absent','late','excused') then errors:=errors||'["Choose a valid attendance status"]'::jsonb;end if;
 end if;
 if p_type='enrollments' and coalesce(nullif(m->>'status',''),'active') not in('invited','active','paused','completed') then errors:=errors||'["Choose a valid enrollment status"]'::jsonb;end if;
 return jsonb_build_object('mapped',m,'errors',errors);
end;$$;
revoke all on function public.academy_legacy_import_validate(text,jsonb) from public,anon,authenticated,service_role;

create or replace function public.academy_legacy_import_command(p_academy_id uuid,p_actor_id uuid,p_action text,p_job_id uuid default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='35s' as $$
declare j public.academy_import_jobs;r public.academy_import_rows;e public.academy_import_effects;auths jsonb;validated jsonb;m jsonb;targets jsonb;scopes jsonb;scope jsonb;before_value jsonb;after_value jsonb;current_value jsonb;
 target_value_id uuid;pipeline uuid;stage uuid;row_number_value integer;total integer;invalid integer;valid integer;committed integer;pending integer;manual integer;recovered integer;recovery_pending integer;
 kind text;strategy text;state text;reason text;amount_value bigint;reversal uuid;previous_context text;used boolean;
begin
 if p_action not in('create','stage','commit','recover') or jsonb_typeof(p_payload) is distinct from 'object' then raise exception using errcode='22023',message='Choose a valid import command';end if;
 auths:=public.academy_current_authorities(p_academy_id,p_actor_id);
 perform pg_advisory_xact_lock(hashtext(p_academy_id::text),-1);
 if p_action='create' then
  kind:=p_payload->>'import_type';
  if not exists(select 1 from jsonb_array_elements(auths) a where public.academy_command_role_has(a->>'role','manageImports'))
   or not exists(select 1 from jsonb_array_elements(auths) a where public.academy_command_role_has(a->>'role',case kind when 'contacts' then 'manageContacts' when 'leads' then 'manageAdmissions' when 'guardians' then 'manageGuardians' when 'classrooms' then 'manageClassrooms' when 'balances' then 'adjustFinance' when 'enrollments' then 'manageRoster' when 'attendance' then 'markAttendance' when 'staff' then 'manageStaff' end)) then raise exception using errcode='42501',message='Your current access does not allow this import type';end if;
  return jsonb_build_object('import_job',public.academy_create_import_job(p_academy_id,p_actor_id,p_payload,p_payload->>'idempotency_key'));
 end if;
 select * into j from public.academy_import_jobs where academy_id=p_academy_id and id=p_job_id for update;
 if j.id is null then raise exception using errcode='P0002',message='Import job not found';end if;
 if j.import_type='staff' then raise exception using errcode='22023',message='Use the reviewed staff import command';end if;
 if not exists(select 1 from jsonb_array_elements(auths) a where public.academy_command_role_has(a->>'role','manageImports')) then raise exception using errcode='42501',message='Your current access does not allow imports';end if;
 if p_action='stage' then
  if j.status not in('draft','validating','ready') or j.rollback_status not in('not_requested','unavailable') then raise exception using errcode='23505',message='This import source is no longer editable';end if;
  if coalesce(p_payload->>'row_number','') !~ '^\d{1,4}$' then raise exception using errcode='22023',message='Row number must be between 1 and 5,000';end if;
  row_number_value:=(p_payload->>'row_number')::integer;
  if row_number_value not between 1 and 5000 then raise exception using errcode='22023',message='Row number must be between 1 and 5,000';end if;
  validated:=public.academy_legacy_import_validate(j.import_type,p_payload->'mapped_data');m:=validated->'mapped';
  targets:=case when jsonb_array_length(validated->'errors')=0 then public.academy_legacy_import_target(p_academy_id,j.import_type,m,auths) else null end;
  state:=case when jsonb_array_length(validated->'errors')>0 then 'invalid' when targets->'existing'<>'null'::jsonb then 'duplicate' else 'valid' end;
  insert into public.academy_import_rows(academy_id,import_job_id,row_number,raw_data,mapped_data,validation_status,validation_errors,duplicate_key)
   values(p_academy_id,j.id,row_number_value,coalesce(p_payload->'raw_data','{}'),m,state,validated->'errors',case when state='duplicate' then targets->'existing'->>'id' end)
   on conflict(academy_id,import_job_id,row_number) do update set raw_data=excluded.raw_data,mapped_data=excluded.mapped_data,validation_status=excluded.validation_status,validation_errors=excluded.validation_errors,duplicate_key=excluded.duplicate_key returning * into r;
  select count(*)::integer,count(*) filter(where validation_status='invalid' or(validation_status='duplicate' and j.duplicate_strategy='reject'))::integer into total,invalid from public.academy_import_rows where academy_id=p_academy_id and import_job_id=j.id;
  update public.academy_import_jobs set total_rows=total,valid_rows=total-invalid,invalid_rows=invalid,status=case when invalid=0 then 'ready' else 'draft' end where id=j.id;
  return jsonb_build_object('import_row',to_jsonb(r));
 end if;
 if p_action='commit' then
  if j.status not in('ready','committing','completed') or j.rollback_status in('in_progress','partial','manual_required','completed') then raise exception using errcode='23505',message='Review this import before continuing';end if;
  if j.import_mode='dry_run' and coalesce((p_payload->>'confirm_commit')::boolean,false) is not true then raise exception using errcode='22023',message='Confirm the reviewed import before saving';end if;
  -- Receipts are authorization-bearing history, including successful retries.
  for e in select * from public.academy_import_effects where academy_id=p_academy_id and import_job_id=j.id loop
   for scope in select value from jsonb_array_elements(coalesce(e.after_snapshot->'__protected_scopes','[{"kind":"academy"}]')) loop perform public.academy_legacy_import_assert_scope(auths,j.import_type,scope);end loop;
  end loop;
  update public.academy_import_jobs set status='committing',import_mode='commit',command_phase='commit',command_actor_id=p_actor_id where id=j.id;
  previous_context:=current_setting('schood.legacy_import_job',true);perform set_config('schood.legacy_import_job',j.id::text,true);
  for r in select * from public.academy_import_rows where academy_id=p_academy_id and import_job_id=j.id
   and(validation_status='valid' or(validation_status='duplicate' and j.duplicate_strategy='update_safe_fields')) order by row_number limit 25 for update loop
   if exists(select 1 from public.academy_import_effects where academy_id=p_academy_id and import_row_id=r.id) then raise exception using errcode='23505',message='Import row already has retained evidence; review its state';end if;
   validated:=public.academy_legacy_import_validate(j.import_type,r.mapped_data);
   if jsonb_array_length(validated->'errors')>0 then raise exception using errcode='22023',message='Review the mapped import values';end if;
   m:=validated->'mapped';targets:=public.academy_legacy_import_target(p_academy_id,j.import_type,m,auths);before_value:=targets->'existing';target_value_id:=(before_value->>'id')::uuid;
   if before_value<>'null'::jsonb then
    if j.duplicate_strategy='reject' then raise exception using errcode='23505',message='An import identity changed or already exists; review duplicates';end if;
    if j.duplicate_strategy='skip' then update public.academy_import_rows set validation_status='duplicate',validation_errors='["Existing record skipped"]' where id=r.id;continue;end if;
    if j.import_type in('enrollments','attendance') then raise exception using errcode='23505',message='Existing enrollment or attendance needs explicit staff review';end if;
   end if;
   if j.import_type='contacts' then
    if target_value_id is null then
     insert into public.academy_contacts(academy_id,primary_branch_id,first_name,last_name,email,phone,status,created_by,metadata)
      values(p_academy_id,coalesce(nullif(m->>'primary_branch_id',''),nullif(m->>'branch_id',''))::uuid,m->>'first_name',coalesce(m->>'last_name',''),nullif(m->>'email',''),nullif(m->>'phone',''),'active',p_actor_id,jsonb_build_object('legacy_import_job_id',j.id,'legacy_import_row_id',r.id)) returning id,to_jsonb(academy_contacts) into target_value_id,after_value;
    else update public.academy_contacts set first_name=m->>'first_name',last_name=coalesce(m->>'last_name',last_name),updated_at=clock_timestamp() where academy_id=p_academy_id and id=target_value_id returning to_jsonb(academy_contacts) into after_value;end if;
   elsif j.import_type='leads' then
    if target_value_id is null then
     select id into pipeline from public.academy_sales_pipelines where academy_id=p_academy_id and is_default for share;
     select id into stage from public.academy_pipeline_stages where academy_id=p_academy_id and pipeline_id=pipeline and terminal_kind is null order by position,id limit 1 for share;
     if pipeline is null or stage is null then raise exception using errcode='22023',message='Set up the default admissions pipeline and its first stage';end if;
     insert into public.academy_leads(academy_id,pipeline_id,current_stage_id,branch_id,full_name,email,phone,status,currency,idempotency_key,created_by,updated_by,metadata)
      values(p_academy_id,pipeline,stage,(m->>'branch_id')::uuid,m->>'full_name',nullif(m->>'email',''),nullif(m->>'phone',''),'open',coalesce(nullif(upper(m->>'currency'),''),'UZS'),'legacy-import:'||r.id,p_actor_id,p_actor_id,jsonb_build_object('legacy_import_job_id',j.id,'legacy_import_row_id',r.id)) returning id,to_jsonb(academy_leads) into target_value_id,after_value;
    else update public.academy_leads set full_name=m->>'full_name',updated_by=p_actor_id where academy_id=p_academy_id and id=target_value_id returning to_jsonb(academy_leads) into after_value;end if;
   elsif j.import_type='guardians' then
    if target_value_id is null then
     insert into public.academy_guardians(academy_id,full_name,email,phone,status,locale,created_by,metadata)
      values(p_academy_id,m->>'full_name',nullif(m->>'email',''),nullif(m->>'phone',''),'invited',coalesce(nullif(m->>'locale',''),'uz'),p_actor_id,jsonb_build_object('legacy_import_job_id',j.id,'legacy_import_row_id',r.id)) returning id,to_jsonb(academy_guardians) into target_value_id,after_value;
    else update public.academy_guardians set full_name=m->>'full_name',locale=coalesce(nullif(m->>'locale',''),locale),notes=coalesce(nullif(m->>'notes',''),notes) where academy_id=p_academy_id and id=target_value_id returning to_jsonb(academy_guardians) into after_value;end if;
   elsif j.import_type='classrooms' then
    if target_value_id is null then
     insert into public.academy_classrooms(academy_id,branch_id,name,description,student_capacity,is_active,created_by,metadata)
      values(p_academy_id,(m->>'branch_id')::uuid,m->>'name',nullif(m->>'description',''),nullif(m->>'student_capacity','')::integer,coalesce((m->>'is_active')::boolean,true),p_actor_id,jsonb_build_object('legacy_import_job_id',j.id,'legacy_import_row_id',r.id)) returning id,to_jsonb(academy_classrooms) into target_value_id,after_value;
    else update public.academy_classrooms set description=coalesce(nullif(m->>'description',''),description),student_capacity=coalesce(nullif(m->>'student_capacity','')::integer,student_capacity),is_active=coalesce((m->>'is_active')::boolean,is_active) where academy_id=p_academy_id and id=target_value_id returning to_jsonb(academy_classrooms) into after_value;end if;
   elsif j.import_type='balances' then
    amount_value:=(m->>'amount')::bigint;
    insert into public.academy_account_ledger_entries(academy_id,contact_id,entry_type,amount,currency,effective_at,reason,idempotency_key,created_by,metadata)
     values(p_academy_id,(m->>'contact_id')::uuid,case when amount_value>0 then 'debit_adjustment' else 'credit_adjustment' end,amount_value,coalesce(nullif(upper(m->>'currency'),''),'UZS'),coalesce(nullif(m->>'effective_at','')::timestamptz,clock_timestamp()),m->>'reason','legacy-import:'||r.id,p_actor_id,jsonb_build_object('legacy_import_job_id',j.id,'legacy_import_row_id',r.id,'opening_balance',true))
     returning id,to_jsonb(academy_account_ledger_entries)||jsonb_build_object('amount',amount::text) into target_value_id,after_value;
   elsif j.import_type='enrollments' then
    insert into public.academy_classroom_memberships(academy_id,classroom_id,contact_id,user_id,role,status,joined_at,started_at,metadata)
     values(p_academy_id,(m->>'classroom_id')::uuid,(m->>'contact_id')::uuid,null,'student',coalesce(nullif(m->>'status',''),'active'),coalesce(nullif(m->>'joined_at','')::timestamptz,clock_timestamp()),coalesce(nullif(m->>'started_at','')::timestamptz,clock_timestamp()),jsonb_build_object('legacy_import_job_id',j.id,'legacy_import_row_id',r.id)) returning id,to_jsonb(academy_classroom_memberships) into target_value_id,after_value;
   elsif j.import_type='attendance' then
    if not exists(select 1 from public.academy_classroom_memberships where academy_id=p_academy_id and classroom_id=(m->>'classroom_id')::uuid and contact_id=(m->>'contact_id')::uuid and role='student' and status in('active','paused','completed')) then raise exception using errcode='42501',message='This student is not enrolled in the selected group';end if;
    insert into public.academy_attendance(academy_id,classroom_id,contact_id,session_date,status,notes,marked_by,metadata)
     values(p_academy_id,(m->>'classroom_id')::uuid,(m->>'contact_id')::uuid,(m->>'session_date')::date,coalesce(nullif(m->>'status',''),'present'),nullif(m->>'notes',''),p_actor_id,jsonb_build_object('legacy_import_job_id',j.id,'legacy_import_row_id',r.id)) returning id,to_jsonb(academy_attendance) into target_value_id,after_value;
   else raise exception using errcode='22023',message='Unsupported import type';end if;
   -- Source, effect and target state become durable at the same commit.
   update public.academy_import_rows set validation_status='committed',target_id=target_value_id,target_table=targets->>'table' where id=r.id;
   insert into public.academy_import_effects(academy_id,import_job_id,import_row_id,target_table,target_id,effect_type,rollback_strategy,before_snapshot,after_snapshot)
    values(p_academy_id,j.id,r.id,targets->>'table',target_value_id,case when j.import_type='balances' then 'ledger_opening_balance' when before_value<>'null'::jsonb then 'safe_update' else 'insert' end,
     case when j.import_type='balances' then 'append_reversal' when before_value<>'null'::jsonb then 'restore_snapshot' else 'manual_review' end,before_value,
     after_value||jsonb_build_object('__legacy_command_version',2,'__protected_scopes',targets->'scopes'));
  end loop;
  perform set_config('schood.legacy_import_job',coalesce(previous_context,''),true);
 else
  reason:=trim(p_payload->>'reason');if coalesce(length(reason),0) not between 1 and 1000 then raise exception using errcode='22023',message='A correction reason is required';end if;
  if j.recovery_actor_id is not null and(j.recovery_actor_id<>p_actor_id or j.rollback_reason<>reason) then raise exception using errcode='23505',message='Continue recovery with the original operator and reason';end if;
  if j.status not in('committing','completed','failed') then raise exception using errcode='23505',message='This import cannot be recovered';end if;
  update public.academy_import_jobs set command_phase='recover',command_actor_id=p_actor_id,recovery_actor_id=p_actor_id,rollback_reason=reason,rollback_status='in_progress' where id=j.id;
  previous_context:=current_setting('schood.legacy_import_job',true);perform set_config('schood.legacy_import_job',j.id::text,true);
  for e in select * from public.academy_import_effects where academy_id=p_academy_id and import_job_id=j.id and rollback_status in('pending','failed') order by created_at desc,id desc limit 25 for update loop
   for scope in select value from jsonb_array_elements(coalesce(e.after_snapshot->'__protected_scopes','[{"kind":"academy"}]')) loop perform public.academy_legacy_import_assert_scope(auths,j.import_type,scope);end loop;
   if e.after_snapshot->>'__legacy_command_version' is distinct from '2' then
    update public.academy_import_effects set rollback_status='manual_required',rollback_error='Historical source and target provenance require staff review' where id=e.id;continue;
   end if;
   select * into r from public.academy_import_rows where academy_id=p_academy_id and id=e.import_row_id;
   -- Re-resolve the exact target, not its old spreadsheet identity, which may
   -- now name a different person. Both old and current scopes must be held.
   if j.import_type in('contacts','balances') then scope:=public.academy_command_resource(p_academy_id,'contact',case when j.import_type='contacts' then e.target_id else (e.after_snapshot->>'contact_id')::uuid end);
   elsif j.import_type in('classrooms','enrollments','attendance') then
    scope:=public.academy_command_resource(p_academy_id,'classroom',case when j.import_type='classrooms' then e.target_id else(e.after_snapshot->>'classroom_id')::uuid end);
    if j.import_type in('enrollments','attendance') then perform public.academy_legacy_import_assert_scope(auths,j.import_type,public.academy_command_resource(p_academy_id,'contact',(e.after_snapshot->>'contact_id')::uuid));end if;
   elsif j.import_type='leads' then scope:=public.academy_command_resource(p_academy_id,'branch',(e.after_snapshot->>'branch_id')::uuid);
   else scope:=jsonb_build_object('kind','academy');end if;
   perform public.academy_legacy_import_assert_scope(auths,j.import_type,scope);
   execute format('select to_jsonb(t) from public.%I t where academy_id=$1 and id=$2 for update',e.target_table) into current_value using p_academy_id,e.target_id;
   if e.target_table='academy_account_ledger_entries' then current_value:=current_value||jsonb_build_object('amount',current_value->>'amount');end if;
   before_value:=e.before_snapshot;after_value:=e.after_snapshot-'__legacy_command_version'-'__protected_scopes';
   used:=current_value is null or(current_value-'updated_at') is distinct from(after_value-'updated_at');
   if not used and j.import_type<>'balances' then used:=public.academy_legacy_import_used(e.target_table,current_value,j.id);end if;
   if used then update public.academy_import_effects set rollback_status='manual_required',rollback_error='Record changed or has later activity; original and current records retained for review' where id=e.id;continue;end if;
   if j.import_type='balances' then
    amount_value:=(after_value->>'amount')::bigint;
    insert into public.academy_account_ledger_entries(academy_id,contact_id,entry_type,amount,currency,effective_at,reason,idempotency_key,created_by,metadata)
     values(p_academy_id,(after_value->>'contact_id')::uuid,case when amount_value>0 then 'credit_adjustment' else 'debit_adjustment' end,-amount_value,after_value->>'currency',clock_timestamp(),reason,'legacy-recover:'||e.id,p_actor_id,jsonb_build_object('reverses_import_effect_id',e.id,'reverses_ledger_entry_id',e.target_id)) returning id,to_jsonb(academy_account_ledger_entries)||jsonb_build_object('amount',amount::text) into reversal,current_value;
   elsif e.effect_type='safe_update' then
    if j.import_type='contacts' then update public.academy_contacts set first_name=before_value->>'first_name',last_name=before_value->>'last_name' where id=e.target_id returning to_jsonb(academy_contacts) into current_value;
    elsif j.import_type='leads' then update public.academy_leads set full_name=before_value->>'full_name',updated_by=p_actor_id where id=e.target_id returning to_jsonb(academy_leads) into current_value;
    elsif j.import_type='guardians' then update public.academy_guardians set full_name=before_value->>'full_name',locale=before_value->>'locale',notes=before_value->>'notes' where id=e.target_id returning to_jsonb(academy_guardians) into current_value;
    elsif j.import_type='classrooms' then update public.academy_classrooms set description=before_value->>'description',student_capacity=(before_value->>'student_capacity')::integer,is_active=(before_value->>'is_active')::boolean where id=e.target_id returning to_jsonb(academy_classrooms) into current_value;
    else raise exception using errcode='23505',message='This update requires staff review';end if;
   elsif j.import_type='contacts' then update public.academy_contacts set status='inactive',metadata=metadata||'{"legacy_import_recovered":true}' where id=e.target_id returning to_jsonb(academy_contacts) into current_value;
   elsif j.import_type='guardians' then update public.academy_guardians set status='revoked',metadata=metadata||'{"legacy_import_recovered":true}' where id=e.target_id returning to_jsonb(academy_guardians) into current_value;
   elsif j.import_type='classrooms' then update public.academy_classrooms set is_active=false,metadata=metadata||'{"legacy_import_recovered":true}' where id=e.target_id returning to_jsonb(academy_classrooms) into current_value;
   elsif j.import_type='enrollments' then update public.academy_classroom_memberships set status='withdrawn',withdrawn_at=clock_timestamp(),metadata=metadata||'{"legacy_import_recovered":true}' where id=e.target_id returning to_jsonb(academy_classroom_memberships) into current_value;
   else
    -- Lead/attendance facts already participate in operational reporting. Their
    -- original evidence is retained for an explicit, audited staff correction.
    update public.academy_import_effects set rollback_status='manual_required',rollback_error='Retained operational fact requires an explicit lead or attendance correction' where id=e.id;continue;
   end if;
   update public.academy_import_effects set rollback_status='completed',rollback_error=null,rollback_reference_id=case when j.import_type='balances' then reversal end,recovery_snapshot=current_value,rolled_back_at=clock_timestamp() where id=e.id;
  end loop;
  perform set_config('schood.legacy_import_job',coalesce(previous_context,''),true);
 end if;
 select count(*)::integer,count(*) filter(where rollback_status='manual_required')::integer,count(*) filter(where rollback_status='completed')::integer,count(*) filter(where rollback_status in('pending','failed'))::integer
  into committed,manual,recovered,recovery_pending from public.academy_import_effects where academy_id=p_academy_id and import_job_id=j.id;
 select count(*) filter(where validation_status='invalid')::integer,count(*) filter(where validation_status='valid' or(validation_status='duplicate' and j.duplicate_strategy='update_safe_fields'))::integer into invalid,pending from public.academy_import_rows where academy_id=p_academy_id and import_job_id=j.id;
 state:=case when invalid>0 then 'failed' when pending>0 then 'committing' else 'completed' end;
 strategy:=case when p_action='commit' then case when committed>0 then 'available' else 'unavailable' end when recovery_pending>0 then 'partial' when manual>0 then 'manual_required' else 'completed' end;
 update public.academy_import_jobs set status=case when p_action='commit' then state else status end,command_phase='idle',committed_rows=committed,committed_by=case when p_action='commit' then p_actor_id else committed_by end,
  completed_at=case when p_action='commit' and state='completed' then coalesce(completed_at,clock_timestamp()) else completed_at end,rollback_status=strategy,
  rolled_back_by=case when p_action='recover' then p_actor_id else rolled_back_by end,rolled_back_at=case when p_action='recover' and strategy='completed' then coalesce(rolled_back_at,clock_timestamp()) else rolled_back_at end where id=j.id;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_academy_id,p_actor_id,'import.legacy_'||p_action,'academy_import_job',j.id::text,jsonb_build_object('committed',committed,'pending',pending,'recovered',recovered,'manual_required',manual,'reason',reason,'records_deleted',0));
 auths:=public.academy_current_authorities(p_academy_id,p_actor_id);
 for e in select * from public.academy_import_effects where academy_id=p_academy_id and import_job_id=j.id loop
  for scope in select value from jsonb_array_elements(coalesce(e.after_snapshot->'__protected_scopes','[{"kind":"academy"}]')) loop perform public.academy_legacy_import_assert_scope(auths,j.import_type,scope);end loop;
 end loop;
 return jsonb_build_object('import_job_id',j.id,'status',case when p_action='commit' then state else j.status end,'rollback_status',strategy,'committed_rows',committed,'failed_rows',invalid,'pending_rows',pending,'recovery_pending',recovery_pending,'completed',recovered,'manual_required',manual,'failed',0,'records_deleted',0);
end;$$;
revoke all on function public.academy_legacy_import_command(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.academy_legacy_import_command(uuid,uuid,text,uuid,jsonb) to service_role;
commit;
