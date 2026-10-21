-- Manual physical receipts are internal collection evidence. They cannot mark
-- a Click transaction paid or grant a product purchase entitlement.
begin;
create function public.academy_collect_student_payment(p_academy uuid,p_actor uuid,p_payload jsonb,p_request_key text)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='35s' as $$
declare previous public.academy_finance_command_receipts;shift public.academy_cashier_shifts;box public.academy_cashboxes;charge public.academy_charges;payment public.academy_payments;
 contact_scope jsonb;branch_scope jsonb;charge_scope jsonb;amount_value bigint;method text;reason_value text;currency_value text;target uuid;allocation jsonb;movement jsonb;ledger jsonb;result jsonb;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' or coalesce(p_request_key,'')!~'^[A-Za-z0-9_.:-]{1,160}$' or coalesce(p_payload->>'amount','')!~'^[0-9]{1,10}$' then raise exception using errcode='22023',message='Use an exact positive collection amount and retry key';end if;
 amount_value:=(p_payload->>'amount')::bigint;method:=p_payload->>'payment_method';reason_value:=trim(p_payload->>'reason');currency_value:=upper(p_payload->>'currency');
 -- The installed payment amount column is integer. Refuse overflow explicitly.
 if amount_value<1 or amount_value>2147483647 or method is null or method not in('cash','manual_pos') or coalesce(length(reason_value),0) not between 1 and 1000 or coalesce(currency_value,'')!~'^[A-Z]{3}$' then raise exception using errcode='22023',message='Review collection method, amount, currency and receipt note';end if;
 perform public.academy_current_authorities(p_academy,p_actor);
 perform pg_advisory_xact_lock(hashtextextended('finance-command:'||p_academy::text||':'||p_actor::text||':'||p_request_key,0));
 contact_scope:=public.academy_command_resource(p_academy,'contact',(p_payload->>'contact_id')::uuid);
 perform public.academy_assert_current_capability(p_academy,p_actor,'collectFinance',contact_scope);
 select cashbox_id into target from public.academy_cashier_shifts where academy_id=p_academy and id=(p_payload->>'shift_id')::uuid;
 if target is null then raise exception using errcode='42501',message='Collection shift is outside this institution';end if;
 perform pg_advisory_xact_lock(hashtextextended('cashbox-shift:'||p_academy::text||':'||target::text,0));
 select * into shift from public.academy_cashier_shifts where academy_id=p_academy and id=(p_payload->>'shift_id')::uuid for update;
 select * into box from public.academy_cashboxes where academy_id=p_academy and id=shift.cashbox_id for share;
 branch_scope:=public.academy_command_resource(p_academy,'branch',box.branch_id);
 perform public.academy_assert_current_capability(p_academy,p_actor,'manageCashier',branch_scope);
 perform public.academy_assert_current_capability(p_academy,p_actor,'collectFinance',branch_scope);
 if contact_scope->>'branch_id' is distinct from box.branch_id::text or currency_value<>box.currency then raise exception using errcode='22023',message='Student, collection shift and currency must match the branch';end if;
 if nullif(p_payload->>'charge_id','') is not null then
  select * into charge from public.academy_charges where academy_id=p_academy and id=(p_payload->>'charge_id')::uuid for update;
  if charge.id is null or charge.contact_id is distinct from (p_payload->>'contact_id')::uuid or charge.currency<>currency_value or charge.branch_id is distinct from box.branch_id then raise exception using errcode='22023',message='Choose this student charge in the collection branch and currency';end if;
 end if;
 select * into previous from public.academy_finance_command_receipts where academy_id=p_academy and request_key=p_request_key;
 if found then
  if previous.actor_id<>p_actor or previous.command<>'collect_student_payment' or previous.payload is distinct from p_payload then raise exception using errcode='23505',message='This collection retry belongs to another change';end if;
  perform public.academy_assert_current_capability(p_academy,p_actor,'collectFinance',contact_scope);
  perform public.academy_assert_current_capability(p_academy,p_actor,'manageCashier',branch_scope);
  perform public.academy_assert_current_capability(p_academy,p_actor,'collectFinance',branch_scope);
  return previous.result||'{"replayed":true}';
 end if;
 if shift.status<>'open' or shift.cashier_user_id<>p_actor or not box.is_active then raise exception using errcode='23505',message='Use your own open collection shift';end if;
 perform public.academy_wallet_account_lock(p_academy,(p_payload->>'contact_id')::uuid);
 insert into public.academy_payments(academy_id,contact_id,provider,provider_transaction_id,amount,currency,status,metadata,created_by)
 values(p_academy,(p_payload->>'contact_id')::uuid,case method when 'cash' then 'manual_cash' else 'manual_pos' end,'academy-collection:'||p_academy::text||':'||p_request_key,amount_value::integer,currency_value,'paid',jsonb_build_object('manual_collection',true,'shift_id',shift.id,'payment_method',method,'receipt_note',reason_value),p_actor) returning * into payment;
 -- The installed payment trigger creates exactly one negative payment ledger entry.
 select to_jsonb(e) into ledger from public.academy_account_ledger_entries e where e.academy_id=p_academy and e.payment_id=payment.id and e.entry_type='payment_received';
 if ledger is null or (ledger->>'amount')::bigint<>-amount_value then raise exception 'Collection ledger evidence is missing';end if;
 if charge.id is not null then allocation:=public.academy_allocate_payment(p_academy,payment.id,charge.id,amount_value,p_actor,'collection-allocation:'||payment.id::text);end if;
 movement:=public.academy_record_cash_movement(p_academy,shift.id,p_actor,jsonb_build_object('direction','incoming','movement_type','payment','payment_method',method,'amount',amount_value::text,'currency',currency_value,'academy_payment_id',payment.id,'reason',reason_value),'collection-movement:'||payment.id::text);
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,contact_id,metadata) values(p_academy,p_actor,'cashier.student_collection','academy_payment',payment.id::text,payment.contact_id,jsonb_build_object('shift_id',shift.id,'amount',amount_value::text,'method',method,'charge_id',charge.id));
 result:=public.academy_finance_exact_json(jsonb_build_object('actor_id',p_actor,'request_key',p_request_key,'command','collect_student_payment','replayed',false,'payment',to_jsonb(payment),'ledger_entry',ledger,'cash_movement',movement,'allocation',allocation));
 insert into public.academy_finance_command_receipts(academy_id,actor_id,request_key,command,payload,protected_scopes,result) values(p_academy,p_actor,p_request_key,'collect_student_payment',p_payload,jsonb_build_array(contact_scope,branch_scope),result);
 perform public.academy_assert_current_capability(p_academy,p_actor,'collectFinance',contact_scope);
 perform public.academy_assert_current_capability(p_academy,p_actor,'manageCashier',branch_scope);
 perform public.academy_assert_current_capability(p_academy,p_actor,'collectFinance',branch_scope);
 return result;
end;$$;
revoke all on function public.academy_collect_student_payment(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.academy_collect_student_payment(uuid,uuid,jsonb,text) to service_role;
commit;
