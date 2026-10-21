begin;
do $fixture$
declare owner_id uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();student uuid:=gen_random_uuid();complement uuid:=gen_random_uuid();academy uuid:=gen_random_uuid();
 payment_a uuid:=gen_random_uuid();payment_b uuid:=gen_random_uuid();payment_usd uuid:=gen_random_uuid();payment_unknown uuid:=gen_random_uuid();
 branch_a uuid:=gen_random_uuid();branch_b uuid:=gen_random_uuid();class_a uuid:=gen_random_uuid();class_b uuid:=gen_random_uuid();
 child_a uuid:=gen_random_uuid();child_b uuid:=gen_random_uuid();peer_a uuid:=gen_random_uuid();assignment_a uuid:=gen_random_uuid();assignment_b uuid:=gen_random_uuid();
 guardian_a uuid:=gen_random_uuid();guardian_b uuid:=gen_random_uuid();guardian_shared uuid:=gen_random_uuid();
 room_a uuid:=gen_random_uuid();room_b uuid:=gen_random_uuid();admin_grant uuid;headers jsonb;ctx jsonb;result jsonb;n integer;before_generation bigint;
begin
 insert into auth.users(id,email,aud,role,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 select id,id||'@example.invalid','authenticated','authenticated',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Owned branch boundary fixture"}' from unnest(array[owner_id,actor,student,complement]) id;
 insert into public.tenants(id,name,slug,type,created_by) values(academy,'Owned branch boundary',academy::text,'team',owner_id);
 insert into public.tenant_memberships(tenant_id,user_id,role,status) values(academy,owner_id,'owner','active');
 insert into public.academy_branches(id,academy_id,branch_key,name,timezone,is_default)
 values(branch_a,academy,'scope-a','Owned A','Asia/Tashkent',true),(branch_b,academy,'scope-b','Owned B','Asia/Tashkent',false);
 insert into public.academy_classrooms(id,academy_id,branch_id,name,created_by,metadata)
 values(class_a,academy,branch_a,'Owned class A',owner_id,'{"private_test_marker":"class-a"}'),(class_b,academy,branch_b,'Owned class B',owner_id,'{"private_test_marker":"class-b"}');
 insert into public.academy_contacts(id,academy_id,primary_branch_id,user_id,first_name,status,created_by)
 values(child_a,academy,branch_a,student,'Owned A learner','active',owner_id),(peer_a,academy,branch_a,null,'Owned A peer','active',owner_id),(child_b,academy,branch_b,null,'Owned B learner','active',owner_id);
 insert into public.academy_classroom_memberships(academy_id,classroom_id,contact_id,role,status)
 values(academy,class_a,child_a,'student','active'),(academy,class_a,peer_a,'student','active'),(academy,class_b,child_b,'student','active');
 insert into public.academy_assignments(id,academy_id,classroom_id,title,status,max_score,created_by)
 values(assignment_a,academy,class_a,'Owned A response','active',100,owner_id),(assignment_b,academy,class_b,'Owned B response','active',100,owner_id);
 insert into public.academy_submissions(academy_id,assignment_id,classroom_id,contact_id,user_id,status,attempt_number,score,max_score,submitted_at)
 values(academy,assignment_a,class_a,child_a,student,'graded',1,60,100,now()),(academy,assignment_a,class_a,peer_a,null,'graded',1,70,100,now()),(academy,assignment_b,class_b,child_b,null,'graded',1,80,100,now());
 insert into public.academy_rooms(id,academy_id,branch_id,room_key,name,capacity)
 values(room_a,academy,branch_a,'owned-a','Owned room A',12),(room_b,academy,branch_b,'owned-b','Owned room B',12);
 insert into public.academy_role_grants(academy_id,user_id,email,role,scope_type,scope_ids,status,granted_by)
 values(academy,actor,actor||'+admin@example.invalid','admin','branches',jsonb_build_array(branch_b),'active',owner_id) returning id into admin_grant;
 insert into public.academy_role_grants(academy_id,user_id,email,role,scope_type,scope_ids,status,granted_by)
 values(academy,actor,actor||'+cashier@example.invalid','cashier','branches',jsonb_build_array(branch_a),'active',owner_id);

 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform set_config('request.headers','{}',true);
 ctx:=public.academy_classroom_access_context(academy,actor,class_b);
 if ctx->>'viewer_type'<>'teacher' or not(ctx->>'can_manage_resources')::boolean then raise exception 'Legitimate B administrator lost resources';end if;
 ctx:=public.academy_classroom_access_context(academy,actor,class_a);if(ctx->>'can_manage_resources')::boolean then raise exception 'Cashier A inherited administrator resource writes';end if;
 ctx:=public.academy_classroom_access_context(academy,student,class_a);
 if ctx->>'contact_id' is distinct from child_a::text or(ctx->>'can_manage_resources')::boolean then raise exception 'Student classroom binding changed';end if;
 insert into public.academy_classroom_resources(id,academy_id,classroom_id,title,kind,url,is_published,metadata,created_by)
 values(room_a,academy,class_a,'Owned file A','asset','storage://owned/a',true,'{"storage":{"provider":"s3","bucket":"owned","path":"owned-a"}}',owner_id),
 (room_b,academy,class_b,'Owned file B','asset','storage://owned/b',true,'{"storage":{"provider":"s3","bucket":"owned","path":"owned-b"}}',owner_id);
 result:=public.academy_files_access_context(student,jsonb_build_array(jsonb_build_object('record_key','own-a','record_id',room_a,'record_kind','resource','expected_storage','{"provider":"s3","bucket":"owned","path":"owned-a"}'::jsonb)));
 if jsonb_array_length(result->'records')<>1 then raise exception 'Current own student file lost';end if;
 begin perform public.academy_files_access_context(complement,jsonb_build_array(jsonb_build_object('record_key','forbidden-a','record_id',room_a,'record_kind','resource','expected_storage','{"provider":"s3","bucket":"owned","path":"owned-a"}'::jsonb)));raise exception 'File access widened from B into cashier A';exception when insufficient_privilege then null;end;
 begin perform public.academy_files_access_context(owner_id,jsonb_build_array(jsonb_build_object('record_key','stale','record_id',room_a,'record_kind','resource','expected_storage','{}'::jsonb)));raise exception 'Stale file reference signed';exception when unique_violation then null;end;
 update public.academy_classroom_resources set is_published=false where id=room_a;
 begin perform public.academy_files_access_context(student,jsonb_build_array(jsonb_build_object('record_key','unpublished','record_id',room_a,'record_kind','resource','expected_storage','{"provider":"s3","bucket":"owned","path":"owned-a"}'::jsonb)));raise exception 'Student opened unpublished file';exception when insufficient_privilege then null;end;
 update public.academy_classroom_resources set is_published=true where id=room_a;
 headers:=jsonb_build_object('x-schood-classroom-actor',student,'x-schood-classroom-academy',academy,'x-schood-classroom-id',class_a,'x-schood-classroom-action','classroom-resource-progress-set');
 perform set_config('request.headers',headers::text,true);
 insert into public.academy_classroom_resource_progress(academy_id,classroom_id,resource_id,contact_id,completed_at)values(academy,class_a,room_a,child_a,now());
 begin insert into public.academy_classroom_resource_progress(academy_id,classroom_id,resource_id,contact_id,completed_at)values(academy,class_a,room_a,peer_a,now());raise exception 'Student wrote peer progress';exception when insufficient_privilege then null;end;
 perform set_config('request.headers','{}',true);
 update public.academy_classroom_memberships set expires_at=clock_timestamp()-interval '1 second' where academy_id=academy and contact_id=child_a;
 begin perform public.academy_classroom_access_context(academy,student,class_a);raise exception 'Expired roster retained classroom';exception when insufficient_privilege then null;end;
 begin perform public.academy_files_access_context(student,jsonb_build_array(jsonb_build_object('record_key','expired','record_id',room_a,'record_kind','resource','expected_storage','{"provider":"s3","bucket":"owned","path":"owned-a"}'::jsonb)));raise exception 'Expired roster retained files';exception when insufficient_privilege then null;end;
 update public.academy_classroom_memberships set expires_at=null where academy_id=academy and contact_id=child_a;
 update public.academy_role_grants set status='revoked' where id=admin_grant;
 begin perform public.academy_classroom_access_context(academy,actor,class_b);raise exception 'Revoked B administrator retained classroom';exception when insufficient_privilege then null;end;
 if has_function_privilege('authenticated','public.academy_classroom_access_context(uuid,uuid,uuid)','EXECUTE') or has_function_privilege('authenticated','public.academy_files_access_context(uuid,jsonb)','EXECUTE') then raise exception 'Private context exposed';end if;
end;$fixture$;
select 'classroom-files-captured-schema-ok';
rollback;
