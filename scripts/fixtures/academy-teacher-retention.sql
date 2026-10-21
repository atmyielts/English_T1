begin;
do $fixture$
declare owner_id uuid:=gen_random_uuid();teacher_user uuid:=gen_random_uuid();peer uuid:=gen_random_uuid();academy uuid:=gen_random_uuid();branch_a uuid:=gen_random_uuid();branch_b uuid:=gen_random_uuid();class_a uuid:=gen_random_uuid();class_b uuid:=gen_random_uuid();class_c uuid:=gen_random_uuid();teacher_a uuid:=gen_random_uuid();teacher_b uuid:=gen_random_uuid();teacher_c uuid:=gen_random_uuid();children uuid[]:=array(select gen_random_uuid() from generate_series(1,9));stamp timestamptz;until_stamp timestamptz;coverage timestamptz;result jsonb;row_value jsonb;grant_id uuid;
begin
 insert into auth.users(id,email,aud,role,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 select id,id||'@example.invalid','authenticated','authenticated',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Owned retention fixture"}' from unnest(array[owner_id,teacher_user,peer]) id;
 insert into public.tenants(id,name,slug,type,created_by) values(academy,'Owned retention Academy',academy::text,'team',owner_id);
 insert into public.tenant_memberships(tenant_id,user_id,role,status) values(academy,owner_id,'owner','active');
 insert into public.academy_branches(id,academy_id,branch_key,name,timezone,is_default) values(branch_a,academy,'owned-a','Owned A','Asia/Tashkent',true),(branch_b,academy,'owned-b','Owned B','Asia/Tashkent',false);
 insert into public.academy_classrooms(id,academy_id,branch_id,name,created_by) values(class_a,academy,branch_a,'Owned A',owner_id),(class_b,academy,branch_b,'Owned B',owner_id),(class_c,academy,branch_a,'Owned empty cohort',owner_id);
 insert into public.academy_staff(id,academy_id,user_id,email,display_name,role,classroom_ids,created_by) values
 (teacher_a,academy,teacher_user,teacher_user||'@example.invalid','Owned Teacher A','teacher',jsonb_build_array(class_a),owner_id),
 (teacher_b,academy,null,'owned-b-'||academy||'@example.invalid','Owned Teacher B','teacher',jsonb_build_array(class_b),owner_id),
 (teacher_c,academy,null,'owned-c-'||academy||'@example.invalid','Owned Teacher C','teacher',jsonb_build_array(class_c),owner_id);
 insert into public.academy_contacts(id,academy_id,primary_branch_id,first_name,status,created_by) select id,academy,branch_a,'Owned learner','active',owner_id from unnest(children) id;
 insert into public.academy_classroom_memberships(academy_id,classroom_id,contact_id,role,status) select academy,class_a,id,'student','active' from unnest(children[1:8]) id;
 stamp:=clock_timestamp();
 update public.academy_classroom_memberships set status='paused',paused_at=clock_timestamp() where academy_id=academy and contact_id=children[2];
 update public.academy_classroom_memberships set status='transferred' where academy_id=academy and contact_id=children[3];
 insert into public.academy_classroom_memberships(academy_id,classroom_id,contact_id,role,status) values(academy,class_b,children[3],'student','active');
 update public.academy_classroom_memberships set status='withdrawn',withdrawn_at=clock_timestamp() where academy_id=academy and contact_id=children[4];
 update public.academy_classroom_memberships set status='withdrawn',metadata=metadata||jsonb_build_object('import_recovery_run_id',gen_random_uuid()) where academy_id=academy and contact_id=children[5];
 update public.academy_classroom_memberships set status='withdrawn',withdrawn_at=clock_timestamp(),metadata=metadata||'{"legacy_import_recovered":true}' where academy_id=academy and contact_id=children[6];
 update public.academy_classroom_memberships set status='completed' where academy_id=academy and contact_id=children[7];
 update public.academy_classroom_memberships set status='completed',completed_at=clock_timestamp() where academy_id=academy and contact_id=children[8];
 insert into public.academy_classroom_memberships(academy_id,classroom_id,contact_id,role,status) values(academy,class_a,children[9],'student','active');
 until_stamp:=clock_timestamp();
 result:=public.academy_teacher_retention_read(academy,owner_id,stamp,until_stamp,null);
 select value into row_value from jsonb_array_elements(result->'rows') where value->>'staff_id'=teacher_a::text;
 if result->>'history_complete'<>'true' or row_value->>'cohort_size'<>'6' or row_value->>'retained_students'<>'2' or row_value->>'paused_students'<>'1' or row_value->>'teacher_transfers'<>'1' or row_value->>'academy_departures'<>'1' or row_value->>'completed_students'<>'1' or row_value->>'unresolved_changes'<>'1' or row_value->>'excluded_corrections'<>'2' or row_value->'teacher_retention_percent'<>'null'::jsonb then raise exception 'Retention conflated pause, transfer, departure, correction or incomplete evidence: %',row_value;end if;
 select value into row_value from jsonb_array_elements(result->'rows') where value->>'staff_id'=teacher_c::text;
 if row_value->>'cohort_size'<>'0' or row_value->'teacher_retention_percent'<>'null'::jsonb then raise exception 'Empty teacher cohort invented a retention percentage';end if;
 update public.academy_classroom_memberships set status='withdrawn',withdrawn_at=clock_timestamp() where academy_id=academy and contact_id=children[7];
 until_stamp:=clock_timestamp();result:=public.academy_teacher_retention_read(academy,owner_id,stamp,until_stamp,branch_a);
 select value into row_value from jsonb_array_elements(result->'rows') where value->>'staff_id'=teacher_a::text;
 if row_value->>'retention_denominator'<>'5' or(row_value->>'teacher_retention_percent')::numeric<>40 or(row_value->>'academy_retention_percent')::numeric<>60 or row_value->>'academy_departures'<>'2' or row_value->>'unresolved_changes'<>'0' then raise exception 'Teacher and academy retention denominators differ: %',row_value;end if;
 if exists(select 1 from jsonb_array_elements(result->'rows') where value->>'staff_id'=teacher_b::text) then raise exception 'Branch report leaked another branch teacher';end if;
 select covered_from into coverage from public.academy_retention_coverage where academy_id=academy;
 result:=public.academy_teacher_retention_read(academy,owner_id,coverage-interval '1 day',until_stamp,null);
 if result->>'history_complete'<>'false' or jsonb_array_length(result->'rows')<>0 then raise exception 'Current roster invented historical cohorts';end if;
 begin perform public.academy_teacher_retention_read(academy,teacher_user,stamp,until_stamp,null);raise exception 'Teaching access promoted into staff performance';exception when insufficient_privilege then null;end;
 insert into public.academy_role_grants(academy_id,user_id,email,role,scope_type,scope_ids,status,granted_by) values
 (academy,peer,peer||'-manager@example.invalid','manager','branches',jsonb_build_array(branch_b),'active',owner_id),
 (academy,peer,peer||'-cashier@example.invalid','cashier','branches',jsonb_build_array(branch_a),'active',owner_id);
 begin perform public.academy_teacher_retention_read(academy,peer,stamp,until_stamp,branch_a);raise exception 'Manager B promoted cashier A into retention access';exception when insufficient_privilege then null;end;
 result:=public.academy_teacher_retention_read(academy,peer,stamp,until_stamp,branch_b);
 if jsonb_array_length(result->'rows')<>1 or result->'rows'->0->>'staff_id'<>teacher_b::text then raise exception 'Scoped manager lost legitimate teacher report';end if;
 insert into public.academy_role_grants(academy_id,user_id,email,role,scope_type,scope_ids,status,granted_by) values(academy,peer,peer||'-class@example.invalid','manager','classrooms',jsonb_build_array(class_a),'active',owner_id) returning id into grant_id;
 result:=public.academy_teacher_retention_read(academy,peer,stamp,until_stamp,branch_a);
 if jsonb_array_length(result->'rows')<>1 or result->'rows'->0->>'staff_id'<>teacher_a::text then raise exception 'Class grant lost its report or leaked another class';end if;
 update public.academy_role_grants set status='revoked' where id=grant_id;
 begin perform public.academy_teacher_retention_read(academy,peer,stamp,until_stamp,branch_a);raise exception 'Revoked retention scope stayed usable';exception when insufficient_privilege then null;end;
 update public.academy_staff set classroom_ids='[]' where id=teacher_a;
 result:=public.academy_teacher_retention_read(academy,owner_id,stamp,clock_timestamp(),null);
 select value into row_value from jsonb_array_elements(result->'rows') where value->>'staff_id'=teacher_a::text;
 if row_value->>'retained_students'<>'0' or row_value->>'unresolved_changes'<>'2' or row_value->>'academy_departures'<>'2' then raise exception 'Unassigned classes invented academy departures';end if;
 update public.academy_staff set classroom_ids=jsonb_build_array(class_a,class_c) where id=teacher_c;
 result:=public.academy_teacher_retention_read(academy,owner_id,stamp,clock_timestamp(),null);
 select value into row_value from jsonb_array_elements(result->'rows') where value->>'staff_id'=teacher_a::text;
 if row_value->>'teacher_transfers'<>'3' or row_value->>'academy_departures'<>'2' or row_value->>'unresolved_changes'<>'0' then raise exception 'Teacher reassignment was not distinguished from academy departure';end if;
 if has_table_privilege('authenticated','public.academy_retention_membership_events','SELECT') or has_function_privilege('authenticated','public.academy_teacher_retention_read(uuid,uuid,timestamptz,timestamptz,uuid)','EXECUTE') then raise exception 'Browser bypasses retention actor binding';end if;
 begin update public.academy_retention_membership_events set status='withdrawn' where academy_id=academy;raise exception 'Owned retention evidence was mutable';exception when raise_exception then if sqlerrm='Owned retention evidence was mutable' then raise;end if;end;
end;$fixture$;
select 'teacher-retention-captured-schema-ok' as qualification;
rollback;
