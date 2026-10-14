-- Used exclusively by the isolated schema-capture qualifier. Synthetic fixture
-- data is rolled back; the qualifier has no hosted connection or credentials.
begin;
do $fixture$
declare
 actor uuid:=gen_random_uuid();academy uuid:=gen_random_uuid();branch uuid:=gen_random_uuid();classroom uuid:=gen_random_uuid();
 job jsonb;preview jsonb;committed jsonb;recovered jsonb;outbox_before bigint;count_rows bigint;ledger_total numeric;
 settings jsonb;source_rows jsonb;paid_job jsonb;paid_contact uuid;paid_group uuid;
begin
 insert into auth.users(id,email,aud,role,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 values(actor,'import-'||actor||'@example.invalid','authenticated','authenticated',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Owned isolated import fixture"}');
 insert into public.tenants(id,name,slug,type,created_by) values(academy,'Owned local import Academy',academy::text,'team',actor);
 insert into public.tenant_memberships(tenant_id,user_id,role,status) values(academy,actor,'owner','active');
 insert into public.academy_branches(id,academy_id,branch_key,name,timezone,is_default,is_active)
 values(branch,academy,'local-import','Owned local branch','Asia/Tashkent',true,true);
 insert into public.academy_classrooms(id,academy_id,branch_id,name,student_capacity,created_by)
 values(classroom,academy,branch,'Owned import group',3,actor);
 insert into public.academy_localization_settings(academy_id,currency) values(academy,'UZS') on conflict(academy_id) do update set currency=excluded.currency;
 select count(*) into outbox_before from public.domain_event_outbox;
 settings:=jsonb_build_object('branch_id',branch,'source_filename','owned-isolated.csv','expected_rows',2,
  'column_mapping',jsonb_build_object('full_name','Name','phone','Phone','parent_phone','Parent','group_name','Group','balance','Balance','joined_on','Joined'),
  'balance_convention','credit_positive','currency','UZS','date_format','iso','create_missing_groups',false,'duplicate_strategy','reject');
 source_rows:=jsonb_build_array(jsonb_build_object('source',jsonb_build_object('Name','Owned Student A','Phone','919111111','Parent','919333333','Group','Owned import group','Balance','800000','Joined','2026-10-01')),
  jsonb_build_object('source',jsonb_build_object('Name','Owned Student B','Phone','919222222','Parent','919333333','Group','Owned import group','Balance','-300000','Joined','2026-10-01')));
 job:=public.academy_student_import_command(academy,actor,'stage',jsonb_build_object('key','owned-upload','settings',settings,'rows',source_rows,'offset',0,'seal',true))->'job';
 preview:=public.academy_student_import_command(academy,actor,'preview',jsonb_build_object('job_id',job->>'id'))->'job';
 if preview->'validation'->>'ready'<>'true' then raise exception 'Actual schema import preview is not ready: %',preview->'validation';end if;
 committed:=public.academy_student_import_command(academy,actor,'commit',jsonb_build_object('job_id',job->>'id','key','owned-commit','preview_hash',preview->'validation'->>'preview_hash'))->'job';
 if jsonb_array_length(public.academy_scoped_directory(academy,actor,'contacts')->'contacts')<>2 then raise exception 'Actual-schema directory contact scope differs';end if;
 if (public.academy_scoped_directory(academy,actor,'classrooms')->'classrooms'->0->>'member_count')::integer<>2 then raise exception 'Actual-schema directory roster count differs';end if;
 if jsonb_array_length(public.academy_scoped_directory(academy,actor,'classroom-memberships')->'classroom_memberships')<>2 then raise exception 'Actual-schema directory membership scope differs';end if;
 if committed->'receipt'->>'applied_rows'<>'2' or committed->'receipt'->>'guardians'<>'1' then raise exception 'Actual schema commit counts differ';end if;
 select count(*) into count_rows from public.academy_student_import_effects where academy_id=academy;
 if count_rows<>9 then raise exception 'Actual schema effects missing: %',count_rows;end if;
 select sum(amount) into ledger_total from public.academy_account_ledger_entries where academy_id=academy;
 if ledger_total<>-500000 then raise exception 'Actual schema opening balance differs';end if;
 if exists(select 1 from public.academy_contacts where academy_id=academy and user_id is not null)
  or exists(select 1 from public.academy_student_guardian_relationships where academy_id=academy and (status<>'pending' or consent_status<>'pending' or is_financially_responsible or can_view_payments)) then raise exception 'Import granted unverified account or parent authority';end if;
 if (select count(*) from public.domain_event_outbox)<>outbox_before then raise exception 'Import sent automation';end if;
 if (public.academy_commit_student_import(academy,actor,(job->>'id')::uuid,'owned-commit',preview->'validation'->>'preview_hash',array[branch],false,false,true))->'receipt' is distinct from committed->'receipt' then raise exception 'Actual schema commit replay differs';end if;
 recovered:=public.academy_student_import_command(academy,actor,'recover',jsonb_build_object('job_id',job->>'id','key','owned-recovery','reason','Correct owned local fixture'));
 recovered:=recovered||jsonb_build_object('receipt',recovered->'job'->'recovery_receipt');
 if recovered->'job'->>'status'<>'reversed' or recovered->'receipt'->>'corrected_effects'<>'9' or recovered->'receipt'->>'reversal_entries'<>'2' then raise exception 'Actual schema recovery requires unexpected manual review: %',recovered->'receipt';end if;
 select sum(amount) into ledger_total from public.academy_account_ledger_entries where academy_id=academy;
 if ledger_total<>0 or (select count(*) from public.academy_contacts where academy_id=academy)<>2 then raise exception 'Recovery lost records or balance';end if;
 if exists(select 1 from public.academy_classroom_memberships where academy_id=academy and withdrawn_at is not null)
  or exists(select 1 from public.academy_student_lifecycle_events where academy_id=academy and event_key='student.enrollment_withdrawn') then raise exception 'Recovery misreported student churn';end if;
 if (select count(*) from public.domain_event_outbox)<>outbox_before then raise exception 'Recovery sent automation';end if;
 if (public.academy_recover_student_import(academy,actor,(job->>'id')::uuid,'owned-recovery','Correct owned local fixture',array[branch],false,true))->'receipt' is distinct from recovered->'receipt' then raise exception 'Actual schema recovery replay differs';end if;
 -- A later real financial entry is preserved by logical recovery. The contact
 -- and membership stay active for review; only the opening credit is reversed.
 settings:=jsonb_set(jsonb_set(settings,'{expected_rows}','1'),'{create_missing_groups}','true');
 source_rows:=jsonb_build_array(jsonb_build_object('source',jsonb_build_object('Name','Owned Paid Student','Phone','919444444','Parent','919555555','Group','Owned paid group','Balance','800000','Joined','2026-10-01')));
 paid_job:=public.academy_stage_student_import(academy,actor,'owned-paid-upload',settings,source_rows,0,true,array[branch])->'job';
 preview:=public.academy_validate_student_import(academy,actor,(paid_job->>'id')::uuid,array[branch],false,true)->'job';
 committed:=public.academy_commit_student_import(academy,actor,(paid_job->>'id')::uuid,'owned-paid-commit',preview->'validation'->>'preview_hash',array[branch],false,true,true);
 select target_id into paid_contact from public.academy_student_import_effects where job_id=(paid_job->>'id')::uuid and target_table='academy_contacts';
 select target_id into paid_group from public.academy_student_import_effects where job_id=(paid_job->>'id')::uuid and target_table='academy_classrooms';
 insert into public.academy_account_ledger_entries(academy_id,contact_id,entry_type,amount,currency,idempotency_key,created_by)
 values(academy,paid_contact,'payment_received',-200000,'UZS','owned-later-payment',actor);
 recovered:=public.academy_recover_student_import(academy,actor,(paid_job->>'id')::uuid,'owned-paid-recovery','Correct owned paid fixture',array[branch],false,true);
 if recovered->'job'->>'status'<>'recovery_review' or (select status from public.academy_contacts where id=paid_contact)<>'active'
  or paid_group is null or not (select is_active from public.academy_classrooms where id=paid_group)
  or (select sum(amount) from public.academy_account_ledger_entries where contact_id=paid_contact)<>-200000 then raise exception 'Actual later payment or active contact not retained';end if;
end;
$fixture$;
rollback;
select 'student-import-captured-schema-ok';
