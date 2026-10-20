-- Run only inside the verified network-isolated, schema-only fixture.
begin;
set local statement_timeout='20s';
create function pg_temp.guardian_check(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Parent portal check failed: %',label;end if;
 perform set_config('schood.qa.guardian_checks',(coalesce(nullif(current_setting('schood.qa.guardian_checks',true),''),'0')::integer+1)::text,true);
end;$$;
do $fixture$
declare actor uuid:=gen_random_uuid();other_actor uuid:=gen_random_uuid();academy uuid:=gen_random_uuid();branch uuid:=gen_random_uuid();
 child_id uuid:=gen_random_uuid();other_child uuid:=gen_random_uuid();g uuid:=gen_random_uuid();r uuid:=gen_random_uuid();expired uuid:=gen_random_uuid();
 k uuid:=gen_random_uuid();task uuid:=gen_random_uuid();draft_task uuid:=gen_random_uuid();request_id uuid:=gen_random_uuid();x jsonb;y jsonb;target text;flag text;section text;begin_at timestamptz;
begin
 insert into auth.users(id,email,aud,role,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
  values(actor,'parent-'||actor||'@example.invalid','authenticated','authenticated',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Owned parent fixture"}'),
  (other_actor,'other-parent-'||other_actor||'@example.invalid','authenticated','authenticated',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Owned other parent fixture"}');
 insert into public.tenants(id,name,slug,type,created_by) values(academy,'Owned Parent Academy',academy::text,'team',actor);
 insert into public.academy_branches(id,academy_id,branch_key,name,is_default,created_by) values(branch,academy,'owned-main','Owned branch',true,actor);
 insert into public.academy_contacts(id,academy_id,first_name,primary_branch_id) values(child_id,academy,'Owned visible child',branch),(other_child,academy,'PRIVATE EXPIRED CHILD',branch);
 insert into public.academy_classrooms(id,academy_id,branch_id,name) values(k,academy,branch,'Owned student group');
 insert into public.academy_classroom_memberships(academy_id,classroom_id,contact_id,role,status) values(academy,k,child_id,'student','active');
 insert into public.academy_assignments(id,academy_id,classroom_id,title,status,released_at,max_score)
  values(task,academy,k,'Owned published homework','active',now(),100),(draft_task,academy,k,'PRIVATE DRAFT HOMEWORK','draft',now(),100),
   (gen_random_uuid(),academy,k,'PRIVATE FUTURE HOMEWORK','active',now()+interval '1 day',100);
 insert into public.academy_submissions(academy_id,assignment_id,classroom_id,contact_id,status,score,max_score,notes,feedback)
  values(academy,task,k,child_id,'graded',85,100,'Owned teacher feedback','{"private_context":"PRIVATE RAW FEEDBACK"}'),
   (academy,draft_task,k,child_id,'graded',99,100,'PRIVATE UNPUBLISHED FEEDBACK','{}');
 insert into public.academy_guardians(id,academy_id,user_id,full_name,email,status,notes,metadata)
  values(g,academy,actor,'Owned Parent','parent-'||actor||'@example.invalid','verified','PRIVATE STAFF NOTE','{"private":"PRIVATE METADATA"}');
 insert into public.academy_student_guardian_relationships(id,academy_id,contact_id,guardian_id,relationship_type,status,consent_status,consented_at,can_view_payments,can_view_debt)
  values(r,academy,child_id,g,'mother','active','granted',now(),true,false),(expired,academy,other_child,g,'mother','active','granted',now(),true,true);
 update public.academy_student_guardian_relationships set consent_expires_at=now()-interval '1 minute' where id=expired;
 insert into public.academy_charges(academy_id,contact_id,branch_id,charge_number,due_on,original_amount,net_amount,idempotency_key)
  values(academy,child_id,branch,'Owned charge',current_date-3,9007199254740993,9007199254740993,gen_random_uuid()::text);
 insert into public.academy_announcements(academy_id,classroom_id,title,body,created_at)
  values(academy,k,'Owned group notice','Owned group body',now()),(academy,null,'Owned academy notice','Owned academy body',now()),(academy,k,'PRIVATE FUTURE NOTICE','PRIVATE FUTURE BODY',now()+interval '1 day');
 insert into public.academy_service_requests(id,academy_id,contact_id,guardian_id,requester_kind,requester_user_id,request_type,subject,details,metadata)
  values(request_id,academy,child_id,g,'guardian',actor,'support','Owned first child request','Owned question',jsonb_build_object('relationship_id',r)),
   (gen_random_uuid(),academy,other_child,g,'guardian',actor,'support','PRIVATE OTHER CHILD REQUEST','PRIVATE OTHER CHILD DETAILS',jsonb_build_object('relationship_id',expired));
 insert into public.academy_service_request_events(academy_id,request_id,event_type,to_status,note,visible_to_requester)
  values(academy,request_id,'submitted','submitted','Owned public reply',true),(academy,request_id,'submitted','submitted','PRIVATE STAFF REPLY',false);
 insert into public.academy_guardian_messages(academy_id,relationship_id,direction,body,status)
  values(academy,r,'academy_to_guardian','Owned sent message','sent'),(academy,r,'academy_to_guardian','PRIVATE DRAFT MESSAGE','draft');
 insert into public.academy_notifications(academy_id,contact_id,guardian_id,relationship_id,type,event_key,channel,title,body,status,error)
  select academy,child_id,g,r,event,event,'inapp',event,event,'sent','PRIVATE PROVIDER ERROR'
   from unnest(array['student_absent','grade_published','upcoming_payment','overdue_payment','unknown_legacy_kind']) event;
 insert into public.academy_notifications(academy_id,contact_id,guardian_id,relationship_id,type,event_key,channel,body,status)
  values(academy,other_child,g,expired,'student_absent','student_absent','inapp','PRIVATE EXPIRED NOTICE','sent');
 begin update public.academy_guardians set user_id=other_actor where id=g;raise exception 'Bound account overwritten';exception when insufficient_privilege then null;end;
 perform pg_temp.guardian_check(true,'legacy invitation cannot overwrite established account');
 begin update public.academy_student_guardian_relationships set contact_id=other_child where id=r;raise exception 'Relationship moved to other child';exception when insufficient_privilege then null;end;
 perform pg_temp.guardian_check(true,'consent identity cannot move to another student');
 begin update public.academy_student_guardian_relationships set guardian_id=gen_random_uuid() where id=r;raise exception 'Relationship moved to other parent';exception when insufficient_privilege then null;end;
 perform pg_temp.guardian_check(true,'consent identity cannot move to another parent');
 begin update public.academy_guardians set academy_id=gen_random_uuid() where id=g;raise exception 'Parent moved across academy';exception when insufficient_privilege then null;end;
 perform pg_temp.guardian_check(true,'parent cannot move across academies');
 update public.academy_guardians set user_id=null where id=g;
 perform pg_temp.guardian_check((select user_id is null from public.academy_guardians where id=g),'retention can clear a closed login foreign key');
 update public.academy_guardians set user_id=actor where id=g;
 x:=public.academy_guardian_portal_read(actor,jsonb_build_object('relationship_id',r));
 perform pg_temp.guardian_check(jsonb_array_length(x->'children')=1,'expired child filtered before payload');
 perform pg_temp.guardian_check(x->'selected_child'->'student'->>'id'=child_id::text,'selected child identity');
 perform pg_temp.guardian_check((x->'selected_child'->>'details_loaded')::boolean,'selected details loaded');
 perform pg_temp.guardian_check(jsonb_array_length(x->'selected_child'->'grades')=1 and x->'selected_child'->'grades'->0->>'feedback'='Owned teacher feedback','published grade has plain student-facing feedback');
 perform pg_temp.guardian_check(jsonb_array_length(x->'selected_child'->'homework')=1,'draft and future homework withheld');
 perform pg_temp.guardian_check(jsonb_array_length(x->'selected_child'->'charges')=1,'charges available with payment consent');
 perform pg_temp.guardian_check(x->'selected_child'->'charges'->0->>'effective_amount'='9007199254740993' and jsonb_typeof(x->'selected_child'->'charges'->0->'effective_amount')='string','large exact charge serialized as integer text');
 perform pg_temp.guardian_check(not(x->'selected_child'->'charges'->0?'outstanding_amount') and not(x->'selected_child'->'charges'->0?'calculated_status'),'debt fields withheld independently');
 perform pg_temp.guardian_check(jsonb_array_length(x->'selected_child'->'balances')=0,'debt balance withheld');
 perform pg_temp.guardian_check(jsonb_array_length(x->'selected_child'->'messages')=1,'only published messages');
 perform pg_temp.guardian_check(jsonb_array_length(x->'selected_child'->'announcements')=2,'group and academy-wide notices, no future posts');
 perform pg_temp.guardian_check(x->'selected_child'->'announcements'->0?'content','actual announcement body projected to parent copy');
 perform pg_temp.guardian_check(jsonb_array_length(x->'notifications')=3,'current per-domain notification filtering');
 perform pg_temp.guardian_check(x::text not like '%PRIVATE%','no private notes, drafts, unknown notices, provider errors or expired child');
 insert into public.academy_guardian_link_tokens(academy_id,relationship_id,token_hash,expires_at,issued_by)
  values(academy,r,extensions.digest('owned-signed-parent-link','sha256'),clock_timestamp()+interval '1 hour',actor);
 begin perform public.academy_claim_guardian_link('owned-signed-parent-link',other_actor,'99999','99999','display-only');raise exception 'Legacy link took over another account';exception when insufficient_privilege then null;end;
 perform pg_temp.guardian_check((select user_id from public.academy_guardians where id=g)=actor,'legacy token cannot overwrite bound account');
 begin perform public.academy_claim_guardian_link('owned-signed-parent-link',actor,'12345','99999','display-only');raise exception 'Legacy link accepted another chat';exception when invalid_parameter_value then null;end;
 perform pg_temp.guardian_check((select use_count from public.academy_guardian_link_tokens where relationship_id=r)=0,'foreign-chat refusal does not consume link');
 y:=public.academy_claim_guardian_link('owned-signed-parent-link',actor,'12345','12345','owned-parent');
 perform pg_temp.guardian_check(y->>'actor_id'=actor::text and(y->>'replayed')::boolean=false,'signed parent binding succeeds');
 perform pg_temp.guardian_check(y::text not like '%PRIVATE%' and not(y->'guardian'?'telegram_chat_id'),'legacy claim response is public projection');
 y:=public.academy_claim_guardian_link('owned-signed-parent-link',actor,'12345','12345','owned-parent');
 perform pg_temp.guardian_check((y->>'replayed')::boolean and(select use_count from public.academy_guardian_link_tokens where relationship_id=r)=1,'same binding retry does not consume twice');
 perform pg_temp.guardian_check((select count(*) from public.academy_guardian_consents where relationship_id=r and consent_type='telegram_link')=1,'same binding retry does not duplicate consent evidence');
 y:=public.academy_guardian_portal_requests(actor,r);
 perform pg_temp.guardian_check(jsonb_array_length(y->'requests')=1 and jsonb_array_length(y->'events')=1,'request and reply history belongs to selected child');
 perform pg_temp.guardian_check(y::text not like '%PRIVATE%' and not(y->'requests'->0?'metadata'),'no other child, private reply or request metadata');
 begin perform public.academy_guardian_portal_requests(actor,expired);raise exception 'Expired request history accepted';exception when insufficient_privilege then null;end;
 perform pg_temp.guardian_check(true,'expired child request history refused');
 insert into public.academy_guardian_messages(academy_id,relationship_id,direction,body,status)
  select academy,r,'academy_to_guardian','Owned historical message '||n,'sent' from generate_series(1,220)n;
 y:=public.academy_guardian_portal_read(actor,jsonb_build_object('relationship_id',r));
 perform pg_temp.guardian_check(jsonb_array_length(y->'selected_child'->'messages')=200 and(y->'selected_child'->'history_has_more'->>'messages')::boolean,'bounded history explicitly reports continuation');
 update public.academy_student_guardian_relationships set can_view_grades=false,can_view_payments=false,can_view_messages=false where id=r;
 x:=public.academy_guardian_portal_read(actor,jsonb_build_object('relationship_id',r));
 perform pg_temp.guardian_check(jsonb_array_length(x->'selected_child'->'charges')=0 and jsonb_array_length(x->'selected_child'->'grades')=0 and jsonb_array_length(x->'selected_child'->'messages')=0,'domain denial removes datasets');
 perform pg_temp.guardian_check(jsonb_array_length(x->'notifications')=1 and x->'notifications'->0->>'event_key'='student_absent','notification history follows changed domain flags');
 x:=public.academy_guardian_portal_read(actor,'{"list_only":true}');
 perform pg_temp.guardian_check((x->'children'->0->>'details_loaded')::boolean=false and x->'selected_child'='null'::jsonb,'list-only page does not load child datasets');
 begin perform public.academy_guardian_portal_read(other_actor,jsonb_build_object('relationship_id',r));raise exception 'Foreign child was accepted';exception when insufficient_privilege then null;end;
 perform pg_temp.guardian_check(true,'foreign child refused');
 update public.academy_student_guardian_relationships set consent_status='revoked' where id=r;
 begin perform public.academy_claim_guardian_link('owned-signed-parent-link',actor,'12345','12345','owned-parent');raise exception 'Used link restored revoked consent';exception when insufficient_privilege then null;end;
 perform pg_temp.guardian_check(true,'used link cannot restore revoked consent');
 x:=public.academy_guardian_portal_read(actor,'{}');
 perform pg_temp.guardian_check(jsonb_array_length(x->'children')=0 and jsonb_array_length(x->'notifications')=0,'revoked relationship removes child and all addressed history');
 update public.academy_student_guardian_relationships set consent_status='granted',consent_expires_at=clock_timestamp()+interval '1 hour' where id=r;
 update public.users set is_active=false where id=actor;
 begin perform public.academy_guardian_portal_read(actor,'{}');raise exception 'Closed actor accepted';exception when insufficient_privilege then null;end;
 perform pg_temp.guardian_check(true,'closed principal refused');
 update public.users set is_active=true where id=actor;
 -- Pagination filters expired rows before the limit and permits selection from
 -- a later page without returning details for every child on the first page.
 update public.academy_student_guardian_relationships set consent_expires_at=null where id=expired;
 x:=public.academy_guardian_portal_read(actor,'{"limit":1}');
 perform pg_temp.guardian_check((x->>'has_more')::boolean,'child cursor exposes continuation');
 y:=public.academy_guardian_portal_read(actor,(x->'cursor')||'{"limit":1,"list_only":true}'::jsonb);
 perform pg_temp.guardian_check(x->'children'->0->>'relationship_id'<>y->'children'->0->>'relationship_id','next page has a different relationship');
 y:=public.academy_guardian_portal_read(actor,jsonb_build_object('limit',1,'relationship_id',y->'children'->0->>'relationship_id'));
 perform pg_temp.guardian_check((y->'selected_child'->>'details_loaded')::boolean,'off-page selection loads authorized detail');
 foreach target in array array['academy_guardians','academy_student_guardian_relationships','academy_guardian_consents','academy_guardian_link_tokens','academy_guardian_notification_preferences','academy_guardian_messages','academy_notification_delivery_attempts','academy_notifications'] loop
  perform pg_temp.guardian_check(not has_table_privilege('authenticated','public.'||target,'SELECT,INSERT,UPDATE,DELETE') and not has_any_column_privilege('authenticated','public.'||target,'SELECT,INSERT,UPDATE,REFERENCES') and not has_table_privilege('anon','public.'||target,'SELECT,INSERT,UPDATE,DELETE') and not has_any_column_privilege('anon','public.'||target,'SELECT,INSERT,UPDATE,REFERENCES'),'browser ACL closed: '||target);
  perform pg_temp.guardian_check(has_table_privilege('service_role','public.'||target,'SELECT,INSERT,UPDATE,DELETE'),'service authority retained: '||target);
 end loop;
 perform pg_temp.guardian_check(not has_function_privilege('authenticated','public.academy_guardian_portal_read(uuid,jsonb)','EXECUTE') and not has_function_privilege('anon','public.academy_guardian_portal_read(uuid,jsonb)','EXECUTE'),'RPC not browser-callable');
 perform pg_temp.guardian_check(has_function_privilege('service_role','public.academy_guardian_portal_read(uuid,jsonb)','EXECUTE'),'service RPC grant retained');
 perform set_config('schood.qa.guardian_result',current_setting('schood.qa.guardian_checks'),true);
 raise notice 'Owned parent portal checks passed: %',current_setting('schood.qa.guardian_checks');
end;$fixture$;
select 'guardian-captured-schema-ok:'||current_setting('schood.qa.guardian_result');
rollback;
