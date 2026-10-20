begin;
do $fixture$
declare actor uuid:=gen_random_uuid();academy uuid:=gen_random_uuid();branch uuid:=gen_random_uuid();other_branch uuid:=gen_random_uuid();
 classroom uuid:=gen_random_uuid();contact uuid:=gen_random_uuid();pipeline uuid;first_stage uuid;
 job uuid;row_id uuid;qa_target uuid;effect uuid;result jsonb;again jsonb;m jsonb;kind text;item integer;before_count integer;auths jsonb;parent_id uuid;relation uuid;learner uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email,aud,role,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 values(actor,actor||'@example.invalid','authenticated','authenticated',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Owned legacy command fixture"}');
 insert into public.tenants(id,name,slug,type,created_by) values(academy,'Owned legacy commands',academy::text,'team',actor);
 insert into public.tenant_memberships(tenant_id,user_id,role,status) values(academy,actor,'owner','active');
 insert into public.academy_branches(id,academy_id,branch_key,name,timezone,is_default,is_active) values
 (branch,academy,'qa-legacy','Owned legacy branch','Asia/Tashkent',true,true),(other_branch,academy,'qa-other','Other owned branch','Asia/Tashkent',false,true);
 insert into public.academy_classrooms(id,academy_id,branch_id,name,created_by) values(classroom,academy,branch,'Owned group',actor);
 insert into public.academy_contacts(id,academy_id,primary_branch_id,first_name,email,status,created_by) values(contact,academy,branch,'Existing student',contact||'@example.invalid','active',actor);
 -- Academy provisioning installs its admissions pipeline. Create one only if
 -- the captured definition does not provision it automatically.
 select id into pipeline from public.academy_sales_pipelines where academy_id=academy and is_default;
 if pipeline is null then
  insert into public.academy_sales_pipelines(academy_id,pipeline_key,name_i18n,is_default,created_by) values(academy,'owned','{"en":"Owned admissions"}',true,actor) returning id into pipeline;
 end if;
 select id into first_stage from public.academy_pipeline_stages where academy_id=academy and pipeline_id=pipeline and terminal_kind is null order by position limit 1;
 if first_stage is null then
  insert into public.academy_pipeline_stages(academy_id,pipeline_id,label_i18n,stage_key,position) values(academy,pipeline,'{"en":"New lead"}','owned-new',0) returning id into first_stage;
 end if;
 -- A lower role's broader scope must never lend an admin capability.
 auths:=jsonb_build_array(jsonb_build_object('role','admin','scope_type','branches','scope_ids',jsonb_build_array(branch)),
  jsonb_build_object('role','teacher','scope_type','academy','scope_ids','[]'::jsonb));
 if public.academy_command_covers(auths,'manageImports',jsonb_build_object('kind','branch','branch_id',other_branch)) then raise exception 'Capabilities crossed grant scopes';end if;
 if public.academy_command_covers(jsonb_build_array(jsonb_build_object('role','admin','scope_type','academy','scope_ids','[]'::jsonb,'expires_at',clock_timestamp()-interval '1 second')),'manageImports','{"kind":"academy"}') then raise exception 'Expired capability accepted';end if;
 foreach kind in array array['contacts','leads','guardians','classrooms','balances','enrollments','attendance'] loop
  m:=case kind
   when 'contacts' then jsonb_build_object('first_name','Imported','email',gen_random_uuid()||'@example.invalid','branch_id',branch)
   when 'leads' then jsonb_build_object('full_name','Imported lead','email',gen_random_uuid()||'@example.invalid','branch_id',branch)
   when 'guardians' then jsonb_build_object('full_name','Imported parent','email',gen_random_uuid()||'@example.invalid','user_id',actor,'telegram_chat_id','123')
   when 'classrooms' then jsonb_build_object('name','Imported group','branch_id',branch,'student_capacity','24')
   when 'balances' then jsonb_build_object('contact_id',contact,'amount','9007199254740993','reason','Exact imported opening balance')
   when 'enrollments' then jsonb_build_object('contact_id',contact,'classroom_id',classroom)
   when 'attendance' then jsonb_build_object('contact_id',contact,'classroom_id',classroom,'session_date','2026-10-19','status','present') end;
  result:=public.academy_legacy_import_command(academy,actor,'create',null,jsonb_build_object('import_type',kind,'source_filename','owned.csv','import_mode','dry_run','duplicate_strategy','reject','idempotency_key','owned-'||kind));
  job:=(result->'import_job'->>'id')::uuid;
  again:=public.academy_legacy_import_command(academy,actor,'create',null,jsonb_build_object('import_type',kind,'source_filename','owned.csv','import_mode','dry_run','duplicate_strategy','reject','idempotency_key','owned-'||kind));
  if again->'import_job'->>'id'<>job::text then raise exception 'Create replay changed job';end if;
  result:=public.academy_legacy_import_command(academy,actor,'stage',job,jsonb_build_object('row_number',1,'raw_data',m,'mapped_data',m));
  row_id:=(result->'import_row'->>'id')::uuid;
  if result->'import_row'->>'validation_status'<>'valid' then raise exception 'Valid % source refused: %',kind,result;end if;
  begin
   perform public.academy_legacy_import_command(academy,actor,'commit',job,'{}');raise exception 'Dry-run confirmation bypassed';
  exception when invalid_parameter_value then null;end;
  result:=public.academy_legacy_import_command(academy,actor,'commit',job,'{"confirm_commit":true}');
  if result->>'status'<>'completed' or result->>'committed_rows'<>'1' then raise exception '% import did not finish: %',kind,result;end if;
  select target_id,id into qa_target,effect from public.academy_import_effects where academy_id=academy and import_row_id=row_id;
  if qa_target is null then raise exception 'Effect missing';end if;
  if kind='guardians' and exists(select 1 from public.academy_guardians where id=qa_target and(user_id is not null or telegram_chat_id is not null or status<>'invited')) then raise exception 'Import forged parent binding';end if;
  if kind='balances' and(select amount from public.academy_account_ledger_entries where id=qa_target)<>9007199254740993::bigint then raise exception 'Opening balance rounded';end if;
  again:=public.academy_legacy_import_command(academy,actor,'commit',job,'{"confirm_commit":true}');
  if again->>'committed_rows'<>'1' or(select count(*) from public.academy_import_effects where import_job_id=job)<>1 then raise exception 'Commit replay duplicated';end if;
  begin
   perform public.academy_legacy_import_command(academy,actor,'stage',job,jsonb_build_object('row_number',1,'mapped_data',m));raise exception 'Committed source edited';
  exception when unique_violation then null;end;
  -- Keep enrollment until attendance has been exercised; recover it below.
  if kind<>'enrollments' then
   result:=public.academy_legacy_import_command(academy,actor,'recover',job,'{"reason":"Owned qualification correction"}');
   again:=public.academy_legacy_import_command(academy,actor,'recover',job,'{"reason":"Owned qualification correction"}');
   if result->>'rollback_status' is distinct from again->>'rollback_status' then raise exception 'Recovery replay changed outcome';end if;
   if kind in('leads','attendance') then
    if result->>'manual_required'<>'1' then raise exception 'Operational fact was silently erased';end if;
   elsif result->>'completed'<>'1' then raise exception '% correction failed: %',kind,result;end if;
   if not exists(select 1 from public.academy_import_effects where id=effect) or not exists(select 1 from public.academy_import_rows where id=row_id) then raise exception 'Recovery erased import history';end if;
   if kind='balances' and(select sum(amount) from public.academy_account_ledger_entries where metadata->>'legacy_import_job_id'=job::text or metadata->>'reverses_import_effect_id'=effect::text)<>0 then raise exception 'Recovery failed to balance exact amount';end if;
  end if;
 end loop;
 -- Bounded batches resume in source order and keep all business rows.
 result:=public.academy_legacy_import_command(academy,actor,'create',null,'{"import_type":"contacts","source_filename":"batch.csv","import_mode":"commit","duplicate_strategy":"reject","idempotency_key":"owned-batch"}');
 job:=(result->'import_job'->>'id')::uuid;
 for item in 1..26 loop
  m:=jsonb_build_object('first_name','Batch '||item,'email',gen_random_uuid()||'@example.invalid','branch_id',branch);
  perform public.academy_legacy_import_command(academy,actor,'stage',job,jsonb_build_object('row_number',item,'raw_data',m,'mapped_data',m));
 end loop;
 result:=public.academy_legacy_import_command(academy,actor,'commit',job,'{}');
 if result->>'status'<>'committing' or result->>'committed_rows'<>'25' or result->>'pending_rows'<>'1' then raise exception 'Batch bound/resume differs: %',result;end if;
 result:=public.academy_legacy_import_command(academy,actor,'commit',job,'{}');
 if result->>'status'<>'completed' or result->>'committed_rows'<>'26' then raise exception 'Second batch did not finish';end if;
 select target_id into qa_target from public.academy_import_effects where import_job_id=job order by created_at,id limit 1;
 update public.academy_contacts set first_name='Later staff correction' where id=qa_target;
 result:=public.academy_legacy_import_command(academy,actor,'recover',job,'{"reason":"Owned batch correction"}');
 result:=public.academy_legacy_import_command(academy,actor,'recover',job,'{"reason":"Owned batch correction"}');
 if result->>'completed'<>'25' or result->>'manual_required'<>'1' or(select first_name from public.academy_contacts where id=qa_target)<>'Later staff correction' then raise exception 'Correction lost later work: %',result;end if;
 if exists(select 1 from public.academy_student_lifecycle_events where academy_id=academy and evidence->>'legacy_import_job_id' is not null and evidence->>'automation_suppressed'<>'true') then raise exception 'Historical lifecycle automation was not suppressed';end if;

 -- A receipt insert failure must roll back the business write and source mark.
 result:=public.academy_legacy_import_command(academy,actor,'create',null,'{"import_type":"contacts","source_filename":"failure.csv","import_mode":"commit","duplicate_strategy":"reject","idempotency_key":"owned-failure"}');
 job:=(result->'import_job'->>'id')::uuid;
 m:=jsonb_build_object('first_name','Atomic failure','email',gen_random_uuid()||'@example.invalid','branch_id',branch);
 perform public.academy_legacy_import_command(academy,actor,'stage',job,jsonb_build_object('row_number',1,'mapped_data',m));
 execute $def$create function pg_temp.fail_legacy_effect() returns trigger language plpgsql as $fn$begin raise check_violation using message='Owned injected receipt failure';end;$fn$$def$;
 execute 'create trigger owned_fail_legacy_effect before insert on public.academy_import_effects for each row execute function pg_temp.fail_legacy_effect()';
 select count(*) into before_count from public.academy_contacts where academy_id=academy;
 begin perform public.academy_legacy_import_command(academy,actor,'commit',job,'{}');raise exception 'Expected injected receipt failure';exception when check_violation then null;end;
 if(select count(*) from public.academy_contacts where academy_id=academy)<>before_count or exists(select 1 from public.academy_import_rows where import_job_id=job and validation_status='committed') then raise exception 'Receipt failure left partial business state';end if;
 execute 'drop trigger owned_fail_legacy_effect on public.academy_import_effects';
 result:=public.academy_legacy_import_command(academy,actor,'commit',job,'{}');
 if result->>'committed_rows'<>'1' then raise exception 'Retry after receipt failure lost source';end if;

 -- Current email binding never trusts a supplied email or an unconfirmed user.
 insert into auth.users(id,email,aud,role,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 values(learner,learner||'@example.invalid','authenticated','authenticated',null,'{"provider":"email","providers":["email"]}','{"full_name":"Owned email binding"}');
 insert into public.academy_contacts(academy_id,primary_branch_id,first_name,email,status,created_by)
 values(academy,branch,'Owned unbound student',learner||'@example.invalid','paused',actor) returning id into qa_target;
 result:=public.academy_student_contacts_command(learner);
 if jsonb_array_length(result->'contacts')<>0 or(select user_id from public.academy_contacts where id=qa_target) is not null then raise exception 'Unverified email linked';end if;
 update auth.users set email_confirmed_at=clock_timestamp() where id=learner;
 result:=public.academy_student_contacts_command(learner);
 if jsonb_array_length(result->'contacts')<>1 or(select user_id from public.academy_contacts where id=qa_target)<>learner or result->'contacts'->0->>'status'<>'paused' then raise exception 'Current confirmed email lost historical pause';end if;
 update public.users set is_active=false where id=learner;
 begin perform public.academy_student_contacts_command(learner);raise exception 'Closed learner account read private contacts';exception when insufficient_privilege then null;end;

 result:=public.academy_staff_guardian_command(academy,actor,'create_guardian_relationship',jsonb_build_object('contact_id',contact,'full_name','Owned parent','email',actor||'@example.invalid','relationship_type','mother'),'owned-parent-create');
 parent_id:=(result->'guardian'->>'id')::uuid;relation:=(result->'relationship'->>'id')::uuid;
 again:=public.academy_staff_guardian_command(academy,actor,'create_guardian_relationship',jsonb_build_object('contact_id',contact,'full_name','Owned parent','email',actor||'@example.invalid','relationship_type','mother'),'owned-parent-create');
 if again->'guardian'->>'id'<>parent_id::text or again->>'replayed'<>'true' then raise exception 'Staff parent creation replay duplicated';end if;
 update public.academy_guardians set user_id=actor,status='verified' where id=parent_id;
 update public.academy_student_guardian_relationships set status='active',consent_status='granted' where id=relation;
 result:=public.academy_staff_guardian_command(academy,actor,'send_guardian_message',jsonb_build_object('relationship_id',relation,'body','Owned staff message'),'owned-staff-message');
 again:=public.academy_staff_guardian_command(academy,actor,'send_guardian_message',jsonb_build_object('relationship_id',relation,'body','Owned staff message'),'owned-staff-message');
 if result->'message'->>'id'<>again->'message'->>'id' or again->>'replayed'<>'true' then raise exception 'Staff message replay duplicated';end if;
 result:=public.academy_staff_guardian_command(academy,actor,'upsert_guardian_preferences',jsonb_build_object('guardian_id',parent_id,'event_type','*','sms_enabled',true),'owned-staff-preferences');
 if result->'preference'->>'sms_enabled'<>'true' then raise exception 'Staff preferences not saved';end if;
 result:=public.academy_staff_guardian_command(academy,actor,'queue_guardian_notification',jsonb_build_object('relationship_id',relation,'body','Owned queued notice','event_key','student_absent','channel','sms','dedupe_key','owned-sms'),'owned-staff-notice');
 qa_target:=(result->'notification'->>'id')::uuid;
 again:=public.academy_guardian_delivery_claim(qa_target);
 if again->>'outcome'<>'skipped' or(select error from public.academy_notifications where id=qa_target)<>'parent_phone_not_verified' then raise exception 'Unverified SMS recipient was accepted';end if;
 result:=public.academy_staff_guardian_command(academy,actor,'issue_guardian_link',jsonb_build_object('relationship_id',relation),'owned-staff-link');
 again:=public.academy_staff_guardian_command(academy,actor,'issue_guardian_link',jsonb_build_object('relationship_id',relation),'owned-staff-link');
 if result->'link'->>'token'<>again->'link'->>'token' then raise exception 'Parent link retry regenerated a token';end if;
 result:=public.academy_staff_guardian_command(academy,actor,'revoke_guardian_relationship',jsonb_build_object('relationship_id',relation,'reason','Owned revocation'),'owned-staff-revoke');
 again:=public.academy_staff_guardian_command(academy,actor,'revoke_guardian_relationship',jsonb_build_object('relationship_id',relation,'reason','Owned revocation'),'owned-staff-revoke');
 if again->>'replayed'<>'true' then raise exception 'Revocation did not replay';end if;
 begin perform public.academy_staff_guardian_command(academy,actor,'send_guardian_message',jsonb_build_object('relationship_id',relation,'body','Owned staff message'),'owned-staff-message');raise exception 'Revoked consent replayed staff message';exception when insufficient_privilege then null;end;
 -- Revocation must also prevent successful receipt replay.
 update public.tenant_memberships set status='disabled' where tenant_id=academy and user_id=actor;
 begin
  perform public.academy_legacy_import_command(academy,actor,'recover',job,'{"reason":"Owned batch correction"}');raise exception 'Revoked actor replayed private history';
 exception when insufficient_privilege then null;end;
end;
$fixture$;
rollback;
select 'legacy-import-captured-schema-ok';
