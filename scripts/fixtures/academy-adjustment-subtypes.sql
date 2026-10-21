begin;
do $fixture$
declare owner_id uuid:=gen_random_uuid();center_id uuid:=gen_random_uuid();accountant_id uuid:=gen_random_uuid();mixed_id uuid:=gen_random_uuid();academy uuid:=gen_random_uuid();branch_a uuid:=gen_random_uuid();branch_b uuid:=gen_random_uuid();child_a uuid:=gen_random_uuid();child_b uuid:=gen_random_uuid();result jsonb;again jsonb;payload jsonb;grant_id uuid;
begin
 insert into auth.users(id,email,aud,role,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 select id,id||'@example.invalid','authenticated','authenticated',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Owned subtype fixture"}' from unnest(array[owner_id,center_id,accountant_id,mixed_id]) id;
 insert into public.tenants(id,name,slug,type,created_by) values(academy,'Owned subtype Academy',academy::text,'team',owner_id);
 insert into public.tenant_memberships(tenant_id,user_id,role,status) values(academy,owner_id,'owner','active');
 insert into public.academy_branches(id,academy_id,branch_key,name,timezone,is_default,is_active) values(branch_a,academy,'owned-a','Owned A','Asia/Tashkent',true,true),(branch_b,academy,'owned-b','Owned B','Asia/Tashkent',false,true);
 insert into public.academy_contacts(id,academy_id,primary_branch_id,first_name,status,created_by) values(child_a,academy,branch_a,'Owned A','active',owner_id),(child_b,academy,branch_b,'Owned B','active',owner_id);
 insert into public.academy_role_grants(academy_id,user_id,email,role,scope_type,scope_ids,status,granted_by) values
 (academy,center_id,center_id||'@example.invalid','center_admin','branches',jsonb_build_array(branch_a),'active',owner_id),
 (academy,accountant_id,accountant_id||'@example.invalid','accountant','branches',jsonb_build_array(branch_a),'active',owner_id),
 (academy,mixed_id,mixed_id||'-center@example.invalid','center_admin','branches',jsonb_build_array(branch_a),'active',owner_id),
 (academy,mixed_id,mixed_id||'-accountant@example.invalid','accountant','branches',jsonb_build_array(branch_b),'active',owner_id);
 payload:=jsonb_build_object('contact_id',child_a,'entry_type',' ReFuNd ','amount','100','currency','UZS','reason','Owned subtype boundary');
 begin perform public.academy_finance_command(academy,center_id,'post_account_adjustment',payload,'owned-center-refund');raise exception 'Center admin used adjustment authority to refund';exception when insufficient_privilege then null;end;
 payload:=payload||'{"entry_type":" DiScOuNt "}';
 begin perform public.academy_finance_command(academy,accountant_id,'post_account_adjustment',payload,'owned-accountant-discount');raise exception 'Accountant used adjustment authority to discount';exception when insufficient_privilege then null;end;
 result:=public.academy_finance_command(academy,center_id,'post_account_adjustment',payload,'owned-center-discount');
 again:=public.academy_finance_command(academy,center_id,'post_account_adjustment',payload,'owned-center-discount');
 if result->'ledger_entry'->>'entry_type'<>'discount' or result->'ledger_entry'->>'amount'<>'-100' or again->>'replayed'<>'true' then raise exception 'Legitimate current discount or exact replay failed';end if;
 payload:=payload||'{"entry_type":"refund"}';
 result:=public.academy_finance_command(academy,accountant_id,'post_account_adjustment',payload,'owned-accountant-refund');
 if result->'ledger_entry'->>'entry_type'<>'refund' or result->'ledger_entry'->>'amount'<>'100' then raise exception 'Legitimate current refund failed';end if;
 begin perform public.academy_finance_command(academy,mixed_id,'post_account_adjustment',payload,'owned-mixed-refund-a');raise exception 'Other branch promoted refund permission';exception when insufficient_privilege then null;end;
 payload:=payload||jsonb_build_object('contact_id',child_b,'entry_type','discount');
 begin perform public.academy_finance_command(academy,mixed_id,'post_account_adjustment',payload,'owned-mixed-discount-b');raise exception 'Other branch promoted discount permission';exception when insufficient_privilege then null;end;
 payload:=payload||'{"entry_type":"refund"}';
 perform public.academy_finance_command(academy,mixed_id,'post_account_adjustment',payload,'owned-mixed-refund-b');
 update public.academy_role_grants set status='revoked' where academy_id=academy and user_id=mixed_id and role='accountant';
 insert into public.academy_role_grants(academy_id,user_id,email,role,scope_type,scope_ids,status,granted_by) values(academy,mixed_id,mixed_id||'-new-center@example.invalid','center_admin','branches',jsonb_build_array(branch_b),'active',owner_id);
 begin perform public.academy_finance_command(academy,mixed_id,'post_account_adjustment',payload,'owned-mixed-refund-b');raise exception 'Refund receipt replay used retained generic adjustment authority';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.academy_finance_command_receipts where academy_id=academy and request_key in('owned-center-refund','owned-accountant-discount','owned-mixed-refund-a','owned-mixed-discount-b')) then raise exception 'Denied subtype wrote a receipt';end if;
 if(select count(*) from public.academy_account_ledger_entries where academy_id=academy)<>3 then raise exception 'Denied subtype left financial writes';end if;
end;$fixture$;
select 'adjustment-subtypes-captured-schema-ok' as qualification;
rollback;
