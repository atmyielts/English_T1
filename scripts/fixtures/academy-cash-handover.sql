begin;
create function pg_temp.fail_owned_handover_receipt() returns trigger language plpgsql as $receipt$begin if new.request_key='owned-handover-receipt-fault' then raise exception using errcode='23514',message='Owned injected handover receipt failure';end if;return new;end;$receipt$;
create trigger owned_handover_receipt_failure before insert on public.academy_finance_command_receipts for each row execute function pg_temp.fail_owned_handover_receipt();
do $fixture$
declare owner_id uuid:=gen_random_uuid();receiver uuid:=gen_random_uuid();academy uuid:=gen_random_uuid();branch uuid:=gen_random_uuid();other_branch uuid:=gen_random_uuid();box uuid;foreign_box uuid;first_shift uuid;second_shift uuid;foreign_shift uuid;result jsonb;again jsonb;payload jsonb;row_value jsonb;
begin
 insert into auth.users(id,email,aud,role,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 select id,id||'@example.invalid','authenticated','authenticated',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Owned handover fixture"}' from unnest(array[owner_id,receiver]) id;
 insert into public.tenants(id,name,slug,type,created_by) values(academy,'Owned handover Academy',academy::text,'team',owner_id);
 insert into public.tenant_memberships(tenant_id,user_id,role,status) values(academy,owner_id,'owner','active');
 insert into public.academy_branches(id,academy_id,branch_key,name,timezone,is_default) values(branch,academy,'owned-main','Owned main','Asia/Tashkent',true),(other_branch,academy,'owned-other','Owned other','Asia/Tashkent',false);
 insert into public.academy_role_grants(academy_id,user_id,email,role,scope_type,scope_ids,status,starts_at,expires_at,granted_by)
 values(academy,receiver,receiver||'@example.invalid','cashier','branches',jsonb_build_array(branch),'active',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '30 minutes',owner_id);
 result:=public.academy_finance_command(academy,owner_id,'create_cashbox',jsonb_build_object('branch_id',branch,'name','A Owned handover box','currency','UZS'),'owned-handover-box');box:=(result->'cashbox'->>'id')::uuid;
 result:=public.academy_finance_command(academy,owner_id,'open_cashier_shift',jsonb_build_object('cashbox_id',box,'opening_balance','500'),'owned-handover-initial');first_shift:=(result->'cashier_shift'->>'id')::uuid;
 if result->'cashier_shift'->>'shift_sequence'<>'1' then raise exception 'Initial cashbox shift has no sequence';end if;
 perform public.academy_finance_command(academy,owner_id,'record_cash_movement',jsonb_build_object('shift_id',first_shift,'direction','incoming','movement_type','payment','payment_method','cash','amount','500','currency','UZS','reason','Owned handover cash'),'owned-handover-cash');
 perform public.academy_finance_command(academy,owner_id,'record_cash_movement',jsonb_build_object('shift_id',first_shift,'direction','incoming','movement_type','payment','payment_method','click','amount','700','currency','UZS','reason','Owned internal Click entry'),'owned-handover-click');
 perform public.academy_finance_command(academy,owner_id,'record_cash_movement',jsonb_build_object('shift_id',first_shift,'direction','incoming','movement_type','payment','payment_method','manual_pos','amount','300','currency','UZS','reason','Owned internal card entry'),'owned-handover-card');
 result:=public.academy_finance_command(academy,owner_id,'close_cashier_shift',jsonb_build_object('shift_id',first_shift,'counted_closing_balance','990','reason','Owned closing discrepancy'),'owned-handover-close-one');
 if result->'shift'->>'expected_closing_balance'<>'1000' or result->'reconciliation'->>'discrepancy'<>'-10' then raise exception 'Non-cash receipts distorted cash handover';end if;
 begin perform public.academy_finance_command(academy,receiver,'open_cashier_shift',jsonb_build_object('cashbox_id',box,'opening_balance','1'),'owned-handover-bypass');raise exception 'Legacy open bypassed a previous cash count';exception when unique_violation then null;end;
 payload:=jsonb_build_object('cashbox_id',box,'previous_shift_id',first_shift,'opening_balance','985','accept_handover',true,'note','Owned five-unit receiving difference');
 begin perform public.academy_finance_command(academy,receiver,'accept_cashier_handover',payload||'{"accept_handover":false}','owned-handover-no-accept');raise exception 'Handover omitted receiver confirmation';exception when invalid_parameter_value then null;end;
 begin perform public.academy_finance_command(academy,receiver,'accept_cashier_handover',payload||'{"note":""}','owned-handover-no-reason');raise exception 'Handover discrepancy omitted its reason';exception when invalid_parameter_value then null;end;
 begin perform public.academy_finance_command(academy,receiver,'accept_cashier_handover',payload||jsonb_build_object('previous_shift_id',gen_random_uuid()),'owned-handover-wrong-predecessor');raise exception 'Stale or forged predecessor was accepted';exception when unique_violation then null;end;
 begin perform public.academy_finance_command(academy,receiver,'accept_cashier_handover',payload,'owned-handover-receipt-fault');raise exception 'Handover receipt fault did not fire';exception when check_violation then null;end;
 if exists(select 1 from public.academy_cashier_shifts where academy_id=academy and previous_shift_id=first_shift) or exists(select 1 from public.academy_audit_events where academy_id=academy and action='cashier.handover_accepted') then raise exception 'Failed receipt left a handover or custody audit';end if;
 result:=public.academy_finance_command(academy,receiver,'accept_cashier_handover',payload,'owned-handover-receive');second_shift:=(result->'cashier_shift'->>'id')::uuid;
 if result->'cashier_shift'->>'previous_shift_id'<>first_shift::text or result->'cashier_shift'->>'handover_accepted_by'<>receiver::text or result->'cashier_shift'->>'handover_previous_count'<>'990' or result->'cashier_shift'->>'handover_difference'<>'-5' or result->'cashier_shift'->>'shift_sequence'<>'2' or jsonb_typeof(result->'cashier_shift'->'handover_difference')<>'string' then raise exception 'Accepted custody lost predecessor, actor or exact counts';end if;
 again:=public.academy_finance_command(academy,receiver,'accept_cashier_handover',payload,'owned-handover-receive');
 if again->>'replayed'<>'true' or again->'cashier_shift'->>'id'<>second_shift::text or(select count(*) from public.academy_cashier_shifts where academy_id=academy and cashbox_id=box)<>2 then raise exception 'Handover replay opened another shift';end if;
 begin update public.academy_cashier_shifts set opening_balance=1 where id=second_shift;raise exception 'Accepted handover was rewritten';exception when check_violation then null;end;
 begin perform public.academy_finance_command(academy,receiver,'accept_cashier_handover',payload,'owned-handover-second-open');raise exception 'Handover opened two concurrent shifts';exception when unique_violation then null;end;
 result:=public.academy_finance_command(academy,receiver,'close_cashier_shift',jsonb_build_object('shift_id',second_shift,'counted_closing_balance','985'),'owned-handover-close-two');
 if result->'shift'->>'expected_closing_balance'<>'985' then raise exception 'Opening custody was counted twice';end if;
 begin update public.academy_cashier_shifts set counted_closing_balance=1 where id=first_shift;raise exception 'Closed predecessor count was rewritten';exception when check_violation then null;end;
 result:=public.academy_finance_command(academy,owner_id,'create_cashbox',jsonb_build_object('branch_id',other_branch,'name','Owned foreign cashbox','currency','UZS'),'owned-handover-other-box');foreign_box:=(result->'cashbox'->>'id')::uuid;
 result:=public.academy_finance_command(academy,owner_id,'open_cashier_shift',jsonb_build_object('cashbox_id',foreign_box,'opening_balance','50'),'owned-handover-other-first');foreign_shift:=(result->'cashier_shift'->>'id')::uuid;
 perform public.academy_finance_command(academy,owner_id,'close_cashier_shift',jsonb_build_object('shift_id',foreign_shift,'counted_closing_balance','50'),'owned-handover-other-close');
 begin perform public.academy_finance_command(academy,receiver,'accept_cashier_handover',jsonb_build_object('cashbox_id',foreign_box,'previous_shift_id',foreign_shift,'opening_balance','50','accept_handover',true),'owned-handover-cross-branch');raise exception 'Cashier accepted a foreign branch handover';exception when insufficient_privilege then null;end;
 -- The per-cashbox predecessor must remain available beyond the shared 500-row history window.
 insert into public.academy_cashier_shifts(academy_id,cashbox_id,cashier_user_id,opening_balance,expected_closing_balance,counted_closing_balance,discrepancy,status,idempotency_key,opened_at,closed_at,shift_sequence)
 select academy,foreign_box,owner_id,0,0,0,0,'closed','owned-handover-history-'||i,clock_timestamp(),clock_timestamp(),i+1 from generate_series(1,501) i;
 result:=public.academy_finance_read(academy,owner_id,'operations_finance','{}');
 if not(result->'has_more'->>'cashier_shifts')::boolean or jsonb_array_length(result->'cashier_shifts')<>500 then raise exception 'Cashier history bound is silent';end if;
 select value into row_value from jsonb_array_elements(result->'cashboxes') where value->>'id'=box::text;
 if row_value->'handover'->>'id'<>second_shift::text or row_value->'handover'->>'counted_closing_balance'<>'985' then raise exception 'Cashbox lost its actual latest predecessor outside the history window';end if;
 update public.academy_role_grants set status='revoked' where academy_id=academy and user_id=receiver;
 begin perform public.academy_finance_command(academy,receiver,'accept_cashier_handover',payload,'owned-handover-receive');raise exception 'Revoked cashier replayed a handover receipt';exception when insufficient_privilege then null;end;
 if has_function_privilege('authenticated','public.academy_accept_cashier_handover(uuid,uuid,jsonb,text)','EXECUTE') or has_table_privilege('authenticated','public.academy_cashier_shifts','SELECT') then raise exception 'Browser bypasses handover authority';end if;
end;$fixture$;
rollback;
select 'cash-handover-captured-schema-ok';
