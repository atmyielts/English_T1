begin;
create function pg_temp.reject_owned_receipt() returns trigger language plpgsql as $$begin raise exception 'Owned receipt failure';end;$$;
do $fixture$
declare owner_id uuid:=gen_random_uuid();teacher uuid:=gen_random_uuid();peer uuid:=gen_random_uuid();academy uuid:=gen_random_uuid();branch uuid:=gen_random_uuid();other_branch uuid:=gen_random_uuid();classroom uuid:=gen_random_uuid();other_class uuid:=gen_random_uuid();child uuid:=gen_random_uuid();foreign_child uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();lesson uuid:=gen_random_uuid();intent jsonb;args jsonb;payload jsonb;result jsonb;again jsonb;before_count integer;grant_id uuid;receipt_count integer;
begin
 insert into auth.users(id,email,aud,role,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 select id,id||'@example.invalid','authenticated','authenticated',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Owned operational fixture"}' from unnest(array[owner_id,teacher,peer]) id;
 insert into public.tenants(id,name,slug,type,created_by) values(academy,'Owned operational Academy',academy::text,'team',owner_id);
 insert into public.tenant_memberships(tenant_id,user_id,role,status) values(academy,owner_id,'owner','active');
 insert into public.academy_branches(id,academy_id,branch_key,name,timezone,is_default)
 values(branch,academy,'owned-command-a','Owned A','Asia/Tashkent',true),(other_branch,academy,'owned-command-b','Owned B','Asia/Tashkent',false);
 insert into public.academy_classrooms(id,academy_id,branch_id,name,created_by) values(classroom,academy,branch,'Owned A class',owner_id),(other_class,academy,other_branch,'Owned B class',owner_id);
 insert into public.academy_contacts(id,academy_id,primary_branch_id,first_name,status,created_by) values(child,academy,branch,'Owned student','active',owner_id),(foreign_child,academy,other_branch,'Owned foreign student','active',owner_id);
 insert into public.academy_classroom_memberships(academy_id,classroom_id,contact_id,role,status) values(academy,classroom,child,'student','active'),(academy,other_class,foreign_child,'student','active');
 insert into public.academy_staff(id,academy_id,user_id,email,display_name,role,classroom_ids,created_by) values(staff,academy,teacher,teacher||'@example.invalid','Owned teacher','teacher',jsonb_build_array(classroom),owner_id);
 insert into public.academy_lesson_sessions(id,academy_id,branch_id,classroom_id,primary_staff_id,title,delivery_mode,starts_at,ends_at,status,created_by,idempotency_key)
 values(lesson,academy,branch,classroom,staff,'Owned lesson','online',now(),now()+interval '1 hour','scheduled',owner_id,'owned-lesson');
 insert into public.academy_role_grants(academy_id,user_id,email,role,scope_type,scope_ids,status,granted_by)
 values(academy,peer,peer||'+admin@example.invalid','admin','branches',jsonb_build_array(other_branch),'active',owner_id),(academy,peer,peer||'+cash@example.invalid','cashier','branches',jsonb_build_array(branch),'active',owner_id);
 intent:=jsonb_build_object('full_name','Owned inquiry','phone','+1 202 555 0101','interested_course','English','branch_id',branch);
 payload:=jsonb_build_object('intent',intent);
 result:=public.academy_operational_command(academy,owner_id,'create_lead',payload,'owned-lead');
 again:=public.academy_operational_command(academy,owner_id,'create_lead',payload,'owned-lead');
 if result->'lead'->>'id' is distinct from again->'lead'->>'id' or again->>'replayed'<>'true' or result->>'duplicate_phone'<>'false' then raise exception 'Lead receipt did not preserve one exact save';end if;
 if(select count(*) from public.academy_leads where academy_id=academy)<>1 then raise exception 'Lead replay duplicated business data';end if;
 begin perform public.academy_operational_command(academy,owner_id,'create_lead',jsonb_build_object('intent',intent||'{"full_name":"Changed"}'),'owned-lead');raise exception 'Changed lead intent reused receipt';exception when unique_violation then null;end;
 result:=public.academy_operational_command(academy,owner_id,'create_lead',jsonb_build_object('intent',intent||'{"full_name":"Second inquiry","phone":"12025550101"}'),'owned-second-lead');
 if result->>'duplicate_phone'<>'true' then raise exception 'Normalized duplicate inquiry was not identified';end if;
 begin perform public.academy_operational_command(academy,peer,'create_lead',payload,'owned-forbidden');raise exception 'Foreign admin promoted cashier inquiry scope';exception when insufficient_privilege then null;end;
 perform public.academy_operational_command(academy,peer,'create_lead',jsonb_build_object('intent',intent||jsonb_build_object('branch_id',other_branch)),'owned-permitted-b');
 begin perform public.academy_teacher_session_context(academy,owner_id,lesson);raise exception 'Owner impersonated assigned teacher';exception when insufficient_privilege then null;end;
 result:=public.academy_teacher_session_context(academy,teacher,lesson);
 if result->>'staff_id'<>staff::text or result->>'classroom_id'<>classroom::text then raise exception 'Assigned staff identity is not current';end if;
 args:=jsonb_build_object('p_academy_id',academy,'p_actor_id',teacher,'p_session_id',lesson,'p_staff_id',staff,'p_course_id',null,'p_module_id',null,'p_lesson_id',null,'p_plan_snapshot','{}'::jsonb,'p_homework_draft','{}'::jsonb);
 intent:=jsonb_build_object('session_id',lesson);payload:=jsonb_build_object('intent',intent,'server_args',args);
 result:=public.academy_operational_command(academy,teacher,'teacher_lesson_start',payload,'owned-start');
 again:=public.academy_operational_command(academy,teacher,'teacher_lesson_start',jsonb_build_object('intent',intent,'server_args',args||'{"p_plan_snapshot":{"lesson":"Later curriculum"}}'),'owned-start');
 if result->'run' is distinct from again->'run' or again->>'replayed'<>'true' then raise exception 'Start retry recomputed an earlier plan';end if;
 intent:=intent||jsonb_build_object('records',jsonb_build_array(jsonb_build_object('contact_id',child,'status','absent','notes','Owned absence')));
 args:=args||jsonb_build_object('p_records',intent->'records');payload:=jsonb_build_object('intent',intent,'server_args',args);
 result:=public.academy_operational_command(academy,teacher,'teacher_lesson_attendance',payload,'owned-attendance');
 again:=public.academy_operational_command(academy,teacher,'teacher_lesson_attendance',payload,'owned-attendance');
 if result->>'saved'<>'1' or again->>'replayed'<>'true' or(select count(*) from public.academy_attendance where academy_id=academy and session_id=lesson)<>1 then raise exception 'Attendance receipt did not preserve one exact save';end if;
 begin perform public.academy_operational_command(academy,teacher,'teacher_lesson_attendance',jsonb_build_object('intent',intent||jsonb_build_object('records',jsonb_build_array(jsonb_build_object('contact_id',foreign_child,'status','present'))),'server_args',args||jsonb_build_object('p_records',jsonb_build_array(jsonb_build_object('contact_id',foreign_child,'status','present')))),'owned-foreign-roster');raise exception 'Foreign student admitted to attendance';exception when insufficient_privilege then null;end;
 select count(*) into before_count from public.academy_attendance where academy_id=academy;
 execute 'create trigger reject_owned_receipt before insert on public.academy_operational_command_receipts for each row execute function pg_temp.reject_owned_receipt()';
 begin
  perform public.academy_operational_command(academy,owner_id,'create_lead',jsonb_build_object('intent',jsonb_build_object('full_name','Owned rollback','phone','12025550102','branch_id',branch)),'owned-rollback');raise exception 'Receipt rejection was ignored';
 exception when raise_exception then if sqlerrm<>'Owned receipt failure' then raise;end if;end;
 execute 'drop trigger reject_owned_receipt on public.academy_operational_command_receipts';
 if exists(select 1 from public.academy_leads where academy_id=academy and full_name='Owned rollback') then raise exception 'Receipt rejection retained business changes';end if;
 -- Current staff revocation rejects a previously successful receipt.
 update public.academy_staff set is_active=false where id=staff;
 begin perform public.academy_operational_command(academy,teacher,'teacher_lesson_attendance',payload,'owned-attendance');raise exception 'Inactive staff replayed attendance';exception when insufficient_privilege then null;end;
 update public.academy_staff set is_active=true where id=staff;
 intent:=jsonb_build_object('session_id',lesson,'coverage','[]'::jsonb,'teacher_notes','Owned finished','homework',jsonb_build_object('title','Owned homework','description','Practice','due_at',now()+interval '2 day'),'assign_homework',true);
 args:=args||jsonb_build_object('p_coverage',intent->'coverage','p_teacher_notes',intent->'teacher_notes','p_homework',intent->'homework','p_assign_homework',true);
 payload:=jsonb_build_object('intent',intent,'server_args',args);
 result:=public.academy_operational_command(academy,teacher,'teacher_lesson_finish',payload,'owned-finish');
 again:=public.academy_operational_command(academy,teacher,'teacher_lesson_finish',payload,'owned-finish');
 if result->'run'->>'status'<>'finished' or result->'assignment'->>'title'<>'Owned homework' or again->>'replayed'<>'true' then raise exception 'Finish did not preserve homework and receipt';end if;
 if(select count(*) from public.academy_assignments where academy_id=academy)<>1 then raise exception 'Finish replay duplicated homework';end if;
 begin perform public.academy_operational_command(academy,teacher,'teacher_lesson_finish',payload,'owned-different-finish');raise exception 'Completed lesson silently accepted a different finish';exception when unique_violation then null;end;
 if has_function_privilege('authenticated','public.academy_operational_command(uuid,uuid,text,jsonb,text)','EXECUTE') or has_function_privilege('authenticated','public.academy_teacher_session_context(uuid,uuid,uuid)','EXECUTE') or has_table_privilege('authenticated','public.academy_operational_command_receipts','SELECT') then raise exception 'Browser can impersonate operational command actor';end if;
end;$fixture$;
rollback;
select 'operational-commands-captured-schema-ok';
