begin;
do $fixture$
declare actor uuid:=gen_random_uuid();student uuid:=gen_random_uuid();peer uuid:=gen_random_uuid();academy uuid:=gen_random_uuid();branch uuid:=gen_random_uuid();classroom uuid:=gen_random_uuid();
 child uuid:=gen_random_uuid();other_child uuid:=gen_random_uuid();assignment uuid:=gen_random_uuid();result jsonb;again jsonb;feedback jsonb;payload jsonb;audio uuid;submission uuid;count_value integer;row_value jsonb;seen uuid[]:='{}';cursor_value jsonb:='{}';pages integer:=0;other_branch uuid:=gen_random_uuid();other_class uuid:=gen_random_uuid();third_child uuid:=gen_random_uuid();other_assignment uuid:=gen_random_uuid();student_grant uuid;stamp text;
begin
 insert into auth.users(id,email,aud,role,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 select id,id||'@example.invalid','authenticated','authenticated',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Owned audio fixture"}' from unnest(array[actor,student,peer]) id;
 insert into public.tenants(id,name,slug,type,created_by) values(academy,'Owned audio Academy',academy::text,'team',actor);
 insert into public.tenant_memberships(tenant_id,user_id,role,status) values(academy,actor,'owner','active');
 insert into public.academy_branches(id,academy_id,branch_key,name,timezone,is_default) values(branch,academy,'owned-audio','Owned audio branch','Asia/Tashkent',true);
 insert into public.academy_classrooms(id,academy_id,branch_id,name,created_by) values(classroom,academy,branch,'Owned audio class',actor);
 insert into public.academy_contacts(id,academy_id,primary_branch_id,user_id,first_name,email,status,created_by)
 values(child,academy,branch,student,'Owned student',student||'@example.invalid','active',actor),(other_child,academy,branch,peer,'Owned peer',peer||'@example.invalid','active',actor);
 insert into public.academy_classroom_memberships(academy_id,classroom_id,contact_id,role,status)
 values(academy,classroom,child,'student','active'),(academy,classroom,other_child,'student','active');
 insert into public.academy_assignments(id,academy_id,classroom_id,title,status,attempts_allowed,allow_late_submission,created_by)
 values(assignment,academy,classroom,'Owned spoken response','active',2,true,actor);

 insert into public.academy_branches(id,academy_id,branch_key,name,timezone) values(other_branch,academy,'owned-scope-b','Owned scope branch B','Asia/Tashkent');
 insert into public.academy_classrooms(id,academy_id,branch_id,name,created_by) values(other_class,academy,other_branch,'Owned scope class B',actor);
 update public.academy_contacts set primary_branch_id=other_branch where id=other_child;
 update public.academy_classroom_memberships set classroom_id=other_class where contact_id=other_child;
 insert into public.academy_contacts(id,academy_id,primary_branch_id,first_name,status,created_by) values(third_child,academy,branch,'Owned unassigned-to-grant learner','active',actor);
 insert into public.academy_classroom_memberships(academy_id,classroom_id,contact_id,role,status) values(academy,classroom,third_child,'student','active');
 insert into public.academy_assignments(id,academy_id,classroom_id,title,status,max_score,created_by) values(other_assignment,academy,other_class,'Owned branch B assignment','active',100,actor);
 insert into public.academy_submissions(academy_id,assignment_id,classroom_id,contact_id,user_id,status,attempt_number,score,max_score,submitted_at)
 values(academy,assignment,classroom,child,student,'graded',1,60,100,now()),(academy,assignment,classroom,third_child,null,'graded',1,90,100,now()),(academy,other_assignment,other_class,other_child,peer,'graded',1,70,100,now());
 insert into public.academy_role_grants(academy_id,user_id,email,role,scope_type,scope_ids,status,granted_by)
 values(academy,peer,peer||'+admin-b@example.invalid','admin','branches',jsonb_build_array(other_branch),'active',actor),(academy,peer,peer||'+cashier-a@example.invalid','cashier','branches',jsonb_build_array(branch),'active',actor);
 result:=public.academy_operational_read(academy,peer,'room_timetable_branches','{}');
 if jsonb_array_length(result->'branches')<>1 or result->'branches'->0->>'id'<>other_branch::text then raise exception 'Foreign admin promoted a cashier room scope';end if;
 begin perform public.academy_operational_read(academy,peer,'room_timetable',jsonb_build_object('branch_id',branch,'from',current_date,'days',7));raise exception 'Cashier read an unauthorized branch timetable';exception when insufficient_privilege then null;end;
 perform public.academy_operational_read(academy,peer,'room_timetable',jsonb_build_object('branch_id',other_branch,'from',current_date,'days',7));
 begin perform public.academy_operational_read(academy,peer,'gradebook',jsonb_build_object('classroom_id',classroom));raise exception 'Cashier read an unauthorized gradebook';exception when insufficient_privilege then null;end;
 result:=public.academy_operational_read(academy,peer,'gradebook',jsonb_build_object('classroom_id',other_class));
 if jsonb_array_length(result->'members')<>1 or result->'members'->0->>'contact_id'<>other_child::text or jsonb_array_length(result->'submissions')<>1 then raise exception 'Scoped admin lost its own grading workflow';end if;
 result:=public.academy_operational_read(academy,actor,'gradebook',jsonb_build_object('classroom_id',classroom));
 if jsonb_array_length(result->'members')<>2 or jsonb_array_length(result->'submissions')<>2 then raise exception 'Owner lost complete current class';end if;
 insert into public.academy_role_grants(academy_id,user_id,email,role,scope_type,scope_ids,status,granted_by)
 values(academy,peer,peer||'+student-a@example.invalid','teacher','students',jsonb_build_array(child),'active',actor) returning id into student_grant;
 result:=public.academy_operational_read(academy,peer,'gradebook',jsonb_build_object('classroom_id',classroom));stamp:=result->>'authority_hash';
 if jsonb_array_length(result->'members')<>1 or result->'members'->0->>'contact_id'<>child::text or jsonb_array_length(result->'submissions')<>1 then raise exception 'Student grant leaked peer grades or lost own row';end if;
 perform public.academy_operational_read(academy,peer,'gradebook_recheck',jsonb_build_object('classroom_id',classroom,'authority_hash',stamp));
 update public.academy_role_grants set status='revoked' where id=student_grant;
 begin perform public.academy_operational_read(academy,peer,'gradebook_recheck',jsonb_build_object('classroom_id',classroom,'authority_hash',stamp));raise exception 'Revoked gradebook identity was accepted';exception when insufficient_privilege then null;end;
 begin perform public.academy_operational_read(academy,peer,'gradebook',jsonb_build_object('classroom_id',classroom));raise exception 'Revoked grading row remained available';exception when insufficient_privilege then null;end;
 if has_function_privilege('authenticated','public.academy_operational_read(uuid,uuid,text,jsonb)','EXECUTE') then raise exception 'Browser bypasses operational read actor binding';end if;
end;$fixture$;
rollback;
select 'operational-read-captured-schema-ok';
