begin;
do $fixture$
declare owner_id uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();student uuid:=gen_random_uuid();complement uuid:=gen_random_uuid();academy uuid:=gen_random_uuid();
 payment_a uuid:=gen_random_uuid();payment_b uuid:=gen_random_uuid();payment_usd uuid:=gen_random_uuid();payment_unknown uuid:=gen_random_uuid();
 branch_a uuid:=gen_random_uuid();branch_b uuid:=gen_random_uuid();class_a uuid:=gen_random_uuid();class_b uuid:=gen_random_uuid();
 child_a uuid:=gen_random_uuid();child_b uuid:=gen_random_uuid();peer_a uuid:=gen_random_uuid();assignment_a uuid:=gen_random_uuid();assignment_b uuid:=gen_random_uuid();
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
 -- Retained collection receipts carry branch facts even when the student's
 -- current home branch differs. Different currencies are never added together.
 insert into public.academy_payments(id,academy_id,contact_id,provider,provider_transaction_id,amount,currency,status,created_by)
 values(payment_a,academy,child_a,'manual_cash',payment_a::text,200,'UZS','paid',owner_id),
 (payment_b,academy,child_a,'manual_cash',payment_b::text,100,'UZS','paid',owner_id),
 (payment_usd,academy,child_a,'manual_cash',payment_usd::text,50,'USD','paid',owner_id),
 (payment_unknown,academy,child_a,'manual_cash',payment_unknown::text,25,'UZS','paid',owner_id);
 insert into public.academy_finance_command_receipts(academy_id,actor_id,request_key,command,payload,protected_scopes,result)
 select academy,owner_id,id::text,'collect_student_payment','{}',jsonb_build_array(jsonb_build_object('kind','branch','branch_id',branch)),jsonb_build_object('payment',jsonb_build_object('id',id))
 from(values(payment_a,branch_a),(payment_b,branch_b),(payment_usd,branch_b)) facts(id,branch);
 insert into public.academy_role_grants(academy_id,user_id,email,role,scope_type,scope_ids,status,granted_by)
 values(academy,complement,complement||'+admin@example.invalid','admin','branches',jsonb_build_array(branch_a),'active',owner_id),
 (academy,complement,complement||'+manager@example.invalid','manager','branches',jsonb_build_array(branch_b),'active',owner_id);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 headers:=jsonb_build_object('x-schood-legacy-academy',academy,'x-schood-legacy-actor',actor,'x-schood-legacy-action','business_intelligence','x-schood-legacy-mode','read');
 perform set_config('request.headers',headers::text,true);
 ctx:=public.academy_legacy_boundary_context();
 if jsonb_array_length(ctx->'entries')<>1 then raise exception 'Cashier capability was promoted into business intelligence';end if;
 select count(*) into n from public.academy_scope_academy_contacts where academy_id=academy;
 if n<>1 or not exists(select 1 from public.academy_scope_academy_contacts where id=child_b) then raise exception 'Legacy BI leaked A or lost legitimate B';end if;
 select count(*) into n from public.academy_scope_academy_classrooms where academy_id=academy;
 if n<>1 then raise exception 'Legacy classroom scope does not match the actual BI grant';end if;
 execute 'set local role service_role';
 select count(*) into n from public.academy_scope_academy_classrooms where academy_id=academy;
 execute 'reset role';
 if n<>1 then raise exception 'The actual service role cannot use the private scope view';end if;

 result:=public.academy_branch_contexts(academy,actor);
 if jsonb_array_length(result->'branches')<>2 then raise exception 'Permitted complementary branch choices were lost';end if;
 if (select count(*) from public.academy_scope_academy_branch_comparison_v2 where academy_id=academy)<>1 then raise exception 'Branch comparison widened through a cashier grant';end if;

 if public.academy_legacy_payment_branch(academy,payment_b) is distinct from branch_b or public.academy_legacy_payment_branch(academy,payment_unknown) is not null then raise exception 'Payment branch was guessed from mutable contact data';end if;
 if (select collected_revenue from public.academy_scope_academy_branch_comparison_v2 where branch_id=branch_b)<>100 then raise exception 'Branch comparison mixed currencies or used the current home branch';end if;
 headers:=headers||jsonb_build_object('x-schood-legacy-actor',complement);
 perform set_config('request.headers',headers::text,true);
 if (select count(*) from public.academy_scope_academy_branch_comparison_v2 where academy_id=academy)<>2 then raise exception 'Complementary BI grants lost an operational branch';end if;
 if (select collected_revenue from public.academy_scope_academy_branch_comparison_v2 where branch_id=branch_a)<>200 or (select collected_revenue from public.academy_scope_academy_branch_comparison_v2 where branch_id=branch_b) is not null then raise exception 'A higher role promoted financial access into a lower-role branch';end if;
 headers:=headers||jsonb_build_object('x-schood-legacy-actor',actor);
 perform set_config('request.headers',headers::text,true);

 -- A lower-role student grant keeps its legitimate row without granting its
 -- peers' work or merging the cashier branch into grading authority.
 perform set_config('request.headers','{}',true);
 insert into public.academy_role_grants(academy_id,user_id,email,role,scope_type,scope_ids,status,granted_by)
 values(academy,actor,actor||'+student@example.invalid','teacher','students',jsonb_build_array(child_a),'active',owner_id);
 headers:=jsonb_build_object('x-schood-legacy-academy',academy,'x-schood-legacy-actor',actor,'x-schood-legacy-action','submissions','x-schood-legacy-mode','read');
 perform set_config('request.headers',headers::text,true);
 select count(*) into n from public.academy_scope_academy_submissions where academy_id=academy;
 if n<>2 or exists(select 1 from public.academy_scope_academy_submissions where contact_id=peer_a) then raise exception 'Student-specific legacy grading lost a valid row or exposed peers';end if;
 select metadata into result from public.academy_scope_academy_classrooms where id=class_a;
 if result is distinct from '{}'::jsonb then raise exception 'Partial student scope exposed full classroom metadata';end if;

 -- Both sides of a legacy update stay in the original capability's scope.
 headers:=jsonb_build_object('x-schood-legacy-academy',academy,'x-schood-legacy-actor',actor,'x-schood-legacy-action','upsert_room','x-schood-legacy-mode','write');
 perform set_config('request.headers',headers::text,true);
 update public.academy_rooms set name='Confirmed B update' where id=room_b;
 begin update public.academy_rooms set name='Forbidden A update' where id=room_a;raise exception 'Legacy stored target escaped its capability branch';exception when insufficient_privilege then null;end;
 begin update public.academy_rooms set branch_id=branch_a where id=room_b;raise exception 'Legacy update moved an allowed target into a forbidden branch';exception when insufficient_privilege then null;end;
 if not exists(select 1 from public.academy_rooms where id=room_b and branch_id=branch_b and name='Confirmed B update') then raise exception 'Refused legacy update did not retain the legitimate B change';end if;

 -- An owner selecting one branch cannot obtain another branch's rows or use
 -- an explicit student grant as a bridge back into the other classroom.
 headers:=jsonb_build_object('x-schood-scope-academy',academy,'x-schood-scope-actor',owner_id,'x-schood-scope-branch',branch_b);
 perform set_config('request.headers',headers::text,true);
 result:=public.academy_scoped_directory(academy,owner_id,'contacts','{}');
 if jsonb_array_length(result->'contacts')<>1 or result->'contacts'->0->>'id'<>child_b::text then raise exception 'Selected branch did not constrain current contacts';end if;
 result:=public.academy_scoped_directory(academy,owner_id,'classrooms','{}');
 if jsonb_array_length(result->'classrooms')<>1 or result->'classrooms'->0->>'id'<>class_b::text then raise exception 'Selected branch did not constrain current classrooms';end if;
 begin perform public.academy_operational_read(academy,owner_id,'gradebook',jsonb_build_object('classroom_id',class_a));raise exception 'Selected branch accepted another classroom';exception when insufficient_privilege then null;end;
 perform public.academy_operational_read(academy,owner_id,'gradebook',jsonb_build_object('classroom_id',class_b));

 -- Revocation refuses the same stored target, even while other grants remain.
 perform set_config('request.headers','{}',true);
 update public.academy_role_grants set status='revoked' where id=admin_grant;
 headers:=jsonb_build_object('x-schood-legacy-academy',academy,'x-schood-legacy-actor',actor,'x-schood-legacy-action','upsert_room','x-schood-legacy-mode','write');
 perform set_config('request.headers',headers::text,true);
 begin update public.academy_rooms set name='Revoked B update' where id=room_b;raise exception 'Revoked legacy capability still changed its stored target';exception when insufficient_privilege then null;end;
 if not exists(select 1 from public.academy_rooms where id=room_b and name='Confirmed B update') then raise exception 'Revoked legacy update survived';end if;
 if has_table_privilege('authenticated','public.academy_scope_academy_contacts','SELECT') or has_function_privilege('authenticated','public.academy_legacy_boundary_context(boolean)','EXECUTE') then raise exception 'Browser can impersonate a legacy service actor';end if;
end;$fixture$;
rollback;
select 'legacy-scope-boundary-captured-schema-ok';
