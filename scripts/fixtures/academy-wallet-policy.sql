begin;
create function pg_temp.fail_wallet_receipt() returns trigger language plpgsql as $receipt$begin if new.request_key='owned-wallet-receipt-fault' then raise exception using errcode='23514',message='Owned wallet receipt failure';end if;return new;end;$receipt$;
create trigger owned_wallet_receipt_failure before insert on public.academy_finance_command_receipts for each row execute function pg_temp.fail_wallet_receipt();
do $fixture$
declare actor uuid:=gen_random_uuid();student uuid:=gen_random_uuid();peer uuid:=gen_random_uuid();academy uuid:=gen_random_uuid();branch uuid:=gen_random_uuid();classroom uuid:=gen_random_uuid();
 child uuid:=gen_random_uuid();other_child uuid:=gen_random_uuid();assignment uuid:=gen_random_uuid();result jsonb;again jsonb;feedback jsonb;payload jsonb;audio uuid;submission uuid;count_value integer;row_value jsonb;seen uuid[]:='{}';cursor_value jsonb:='{}';pages integer:=0;other_branch uuid:=gen_random_uuid();grant_id uuid;
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

 -- Keep a prior response available for grading/history while learning is paused.
 insert into public.academy_submissions(academy_id,assignment_id,classroom_id,contact_id,user_id,status,attempt_number,submitted_at)
 values(academy,assignment,classroom,child,student,'submitted',1,now()) returning id into submission;
 perform public.academy_wallet_learning_context(academy,student,child,classroom);
 payload:=jsonb_build_object('contact_id',child,'classroom_id',classroom,'mode','freeze','currency','UZS','warning_credit','9007199254740993','reason','Owned prepaid agreement','account_credit_acknowledged',true);
 begin perform public.academy_finance_command(academy,actor,'set_wallet_policy',payload-'account_credit_acknowledged','owned-no-ack');raise exception 'Missing wallet acknowledgement accepted';exception when invalid_parameter_value then null;end;
 begin perform public.academy_finance_command(academy,peer,'set_wallet_policy',payload,'owned-peer-policy');raise exception 'Student configured a wallet policy';exception when insufficient_privilege then null;end;
 result:=public.academy_finance_command(academy,actor,'set_wallet_policy',payload,'owned-policy');
 if result->'wallet_policy'->>'warning_credit'<>'9007199254740993' then raise exception 'Exact alert amount was rounded';end if;
 again:=public.academy_finance_command(academy,actor,'set_wallet_policy',payload,'owned-policy');
 if again->>'replayed'<>'true' or(select count(*) from public.academy_wallet_policies where academy_id=academy)<>1 then raise exception 'Wallet replay duplicated policy';end if;
 begin perform public.academy_finance_command(academy,actor,'set_wallet_policy',payload||'{"mode":"off"}','owned-policy');raise exception 'Changed wallet payload reused a receipt';exception when unique_violation then null;end;
 if not(select learning_paused and low_credit from public.academy_wallet_policy_status where academy_id=academy and contact_id=child) then raise exception 'Zero credit did not pause explicit prepaid policy';end if;
 begin perform public.academy_wallet_learning_context(academy,student,child,classroom);raise exception 'Zero-credit learning context passed';exception when insufficient_privilege then null;end;
 begin perform public.academy_assignment_written_command(academy,student,assignment,'{"submission_content":"blocked new attempt"}');raise exception 'Frozen written submission passed';exception when insufficient_privilege then null;end;
 begin perform public.academy_audio_command(academy,student,'reserve',jsonb_build_object('assignment_id',assignment,'kind','submission','content_hash',repeat('a',64),'mime_type','audio/webm','size_bytes',1000,'text_context','Blocked recording'),'owned-zero-audio');raise exception 'Frozen recording allocated storage';exception when insufficient_privilege then null;end;
 update public.academy_submissions set score=75,graded_at=now(),status='graded' where id=submission;
 perform public.academy_wallet_learning_context(academy,peer,other_child,classroom);
 perform public.academy_finance_command(academy,actor,'post_account_adjustment',jsonb_build_object('contact_id',child,'entry_type','account_credit','amount','101','currency','USD','reason','Owned other currency'),'owned-usd-credit');
 if not(select learning_paused from public.academy_wallet_policy_status where academy_id=academy and contact_id=child) then raise exception 'Foreign currency credit opened learning';end if;
 perform public.academy_finance_command(academy,actor,'post_account_adjustment',jsonb_build_object('contact_id',child,'entry_type','account_credit','amount','101','currency','UZS','reason','Owned prepaid credit'),'owned-uzs-credit');
 perform public.academy_wallet_learning_context(academy,student,child,classroom);
 if(select learning_paused from public.academy_wallet_policy_status where academy_id=academy and contact_id=child) then raise exception 'Current credit did not restore learning';end if;
 result:=public.academy_assignment_written_command(academy,student,assignment,'{"submission_content":"Allowed after credit","metadata":{"response_kind":"text"}}');
 if result->>'attempt_number'<>'2' then raise exception 'Credit did not permit next response';end if;
 -- A balanced account with no opt-in remains usable.
 perform public.academy_finance_command(academy,actor,'post_account_adjustment',jsonb_build_object('contact_id',other_child,'entry_type','debit_adjustment','amount','100','currency','UZS','reason','Owned billed service'),'owned-peer-charge');
 perform public.academy_finance_command(academy,actor,'post_account_adjustment',jsonb_build_object('contact_id',other_child,'entry_type','account_credit','amount','100','currency','UZS','reason','Owned paid service'),'owned-peer-credit');
 perform public.academy_wallet_learning_context(academy,peer,other_child,classroom);
 perform public.academy_finance_command(academy,actor,'post_account_adjustment',jsonb_build_object('contact_id',child,'entry_type','debit_adjustment','amount','101','currency','UZS','reason','Owned credit consumed'),'owned-zero-again');
 begin perform public.academy_wallet_learning_context(academy,student,child,classroom);raise exception 'Used-up credit did not pause learning';exception when insufficient_privilege then null;end;
 perform public.academy_finance_command(academy,actor,'set_wallet_policy',payload||'{"mode":"alert"}','owned-alert-only');
 perform public.academy_wallet_learning_context(academy,student,child,classroom);
 if not(select low_credit and not learning_paused from public.academy_wallet_policy_status where academy_id=academy and contact_id=child) then raise exception 'Alert-only policy froze learning';end if;
 result:=public.academy_finance_read(academy,actor,'commercial_core','{}');
 if jsonb_array_length(result->'wallet_policies')<>1 or result->'wallet_policies'->0->>'warning_credit'<>'9007199254740993' then raise exception 'Financial workspace omitted exact wallet state';end if;

 select count(*) into count_value from public.academy_audit_events where academy_id=academy;
 begin perform public.academy_finance_command(academy,actor,'set_wallet_policy',payload||'{"mode":"off"}','owned-wallet-receipt-fault');raise exception 'Receipt failure returned a wallet success';exception when check_violation then null;end;
 if(select mode from public.academy_wallet_policies where academy_id=academy)<>'alert' or(select count(*) from public.academy_audit_events where academy_id=academy)<>count_value then raise exception 'Receipt failure left a changed policy or audit';end if;
 insert into public.academy_branches(id,academy_id,branch_key,name,timezone) values(other_branch,academy,'wallet-other','Owned other wallet branch','Asia/Tashkent');
 insert into public.academy_role_grants(academy_id,user_id,email,role,scope_type,scope_ids,status,granted_by)
 values(academy,peer,peer||'+admin-b@example.invalid','admin','branches',jsonb_build_array(other_branch),'active',actor),(academy,peer,peer||'+cashier-a@example.invalid','cashier','branches',jsonb_build_array(branch),'active',actor);
 begin perform public.academy_finance_command(academy,peer,'set_wallet_policy',payload,'owned-mixed-wallet');raise exception 'Foreign admin scope promoted cashier policy authority';exception when insufficient_privilege then null;end;
 result:=public.academy_finance_read(academy,peer,'commercial_core',jsonb_build_object('branch_id',other_branch));
 if jsonb_array_length(result->'wallet_policies')<>0 then raise exception 'Wallet policy leaked across branch read scope';end if;
 insert into public.academy_role_grants(academy_id,user_id,email,role,scope_type,scope_ids,status,granted_by)
 values(academy,peer,peer||'+admin-a@example.invalid','admin','branches',jsonb_build_array(branch),'active',actor) returning id into grant_id;
 perform public.academy_finance_command(academy,peer,'set_wallet_policy',payload,'owned-scoped-wallet');
 update public.academy_role_grants set status='revoked' where id=grant_id;
 begin perform public.academy_finance_command(academy,peer,'set_wallet_policy',payload,'owned-scoped-wallet');raise exception 'Revoked policy receipt was replayed';exception when insufficient_privilege then null;end;
 perform public.academy_finance_command(academy,actor,'set_wallet_policy',payload||'{"mode":"alert"}','owned-wallet-final-alert');
 if has_table_privilege('authenticated','public.academy_wallet_policies','SELECT') or has_table_privilege('authenticated','public.academy_wallet_policy_status','SELECT') or has_function_privilege('authenticated','public.academy_wallet_learning_context(uuid,uuid,uuid,uuid)','EXECUTE') then raise exception 'Wallet browser boundary is open';end if;
end;$fixture$;
rollback;
select 'wallet-policy-captured-schema-ok';
