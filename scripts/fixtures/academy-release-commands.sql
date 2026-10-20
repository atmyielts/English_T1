begin;
do $fixture$
declare
 actor uuid:=gen_random_uuid();teacher uuid:=gen_random_uuid();student uuid:=gen_random_uuid();parent uuid:=gen_random_uuid();
 academy uuid:=gen_random_uuid();branch uuid:=gen_random_uuid();classroom uuid:=gen_random_uuid();contact uuid:=gen_random_uuid();guardian uuid:=gen_random_uuid();relationship uuid:=gen_random_uuid();
 person uuid;result jsonb;replay jsonb;review jsonb;iv jsonb;
begin
 insert into auth.users(id,email,aud,role,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 select id,id||'@example.invalid','authenticated','authenticated',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Owned isolated release fixture"}' from unnest(array[actor,teacher,student,parent]) id;
 insert into public.tenants(id,name,slug,type,created_by) values(academy,'Owned release Academy',academy::text,'team',actor);
 insert into public.tenant_memberships(tenant_id,user_id,role,status) values(academy,actor,'owner','active');
 insert into public.academy_branches(id,academy_id,branch_key,name,timezone,is_default,is_active) values(branch,academy,'local-release','Owned release branch','Asia/Tashkent',true,true);
 insert into public.academy_classrooms(id,academy_id,branch_id,name,created_by) values(classroom,academy,branch,'Owned release group',actor);
 result:=public.academy_staff_access_command(academy,actor,'upsert_staff',jsonb_build_object('staff_email',teacher||'@example.invalid','staff_role','teacher','status','active','scope_type','classrooms','scope_ids',jsonb_build_array(classroom),'name','Owned teacher'),'owned-staff-save');
 if result->'grant'->>'user_id'<>teacher::text or result->'staff_profile'->>'managed_grant_id'<>result->'grant'->>'id' then raise exception 'Full-schema staff binding/provenance differs';end if;
 replay:=public.academy_staff_access_command(academy,actor,'upsert_staff',jsonb_build_object('staff_email',teacher||'@example.invalid','staff_role','teacher','status','active','scope_type','classrooms','scope_ids',jsonb_build_array(classroom),'name','Owned teacher'),'owned-staff-save');
 if not(replay->>'replayed')::boolean then raise exception 'Staff replay duplicated';end if;
 if jsonb_array_length(public.academy_staff_directory(academy,actor,'{}')->'staff')<1 then raise exception 'Staff directory lost grant';end if;
 iv:=public.academy_staff_invitation_prepare(academy,actor,'create_access_invitation',jsonb_build_object('email',teacher||'@example.invalid','role','teacher','scope_type','classrooms','scope_ids',jsonb_build_array(classroom)),repeat('a',64),'owned-staff-invite');
 result:=public.academy_staff_accept_access(teacher,null,repeat('a',64));
 if result->'grant'->>'user_id'<>teacher::text then raise exception 'Staff acceptance lost identity';end if;
 insert into public.academy_contacts(id,academy_id,primary_branch_id,first_name,last_name,email,status,created_by) values(contact,academy,branch,'Owned','Student',student||'@example.invalid','active',actor);
 insert into public.academy_classroom_memberships(academy_id,classroom_id,contact_id,role,status) values(academy,classroom,contact,'student','paused');
 iv:=public.academy_learner_invitation_prepare(academy,actor,'create_access_invitation',jsonb_build_object('invite_kind','student','email',student||'@example.invalid','contact_id',contact,'classroom_id',classroom),repeat('b',64),'owned-student-invite');
 review:=public.academy_learner_invitation_status(student,repeat('b',64));
 result:=public.academy_learner_accept_invitation(student,repeat('b',64),review->'invitation'->>'review_hash');
 if result->>'access_status'<>'paused' or (select user_id from academy_contacts where id=contact)<>student then raise exception 'Student acceptance lost pause or binding';end if;
 replay:=public.academy_learner_accept_invitation(student,repeat('b',64),review->'invitation'->>'review_hash');
 if not(replay->>'replayed')::boolean then raise exception 'Student acceptance retry differs';end if;
 insert into public.academy_guardians(id,academy_id,email,full_name,created_by) values(guardian,academy,parent||'@example.invalid','Owned parent',actor);
 insert into public.academy_student_guardian_relationships(id,academy_id,contact_id,guardian_id,relationship_type,created_by) values(relationship,academy,contact,guardian,'mother',actor);
 iv:=public.academy_learner_invitation_prepare(academy,actor,'create_access_invitation',jsonb_build_object('invite_kind','guardian','email',parent||'@example.invalid','guardian_relationship_id',relationship),repeat('c',64),'owned-parent-invite');
 review:=public.academy_learner_invitation_status(parent,repeat('c',64));
 result:=public.academy_learner_accept_invitation(parent,repeat('c',64),review->'invitation'->>'review_hash');
 if result->'invitation'->>'status'<>'accepted' or (select consent_status from academy_student_guardian_relationships where id=relationship)<>'granted' then raise exception 'Parent consent acceptance differs';end if;
 if (select count(*) from academy_guardian_consents where relationship_id=relationship)<>1 then raise exception 'Consent evidence differs';end if;
end;
$fixture$;
rollback;
select 'staff-and-learner-captured-schema-ok';
