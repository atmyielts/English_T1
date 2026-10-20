begin;
alter table public.academy_cashier_shifts
 add column previous_shift_id uuid,
 add column shift_sequence integer check(shift_sequence>0),
 add column handover_previous_count bigint check(handover_previous_count>=0),
 add column handover_difference bigint,
 add column handover_reason text,
 add column handover_accepted_by uuid references public.users(id) on delete restrict,
 add column handover_accepted_at timestamptz,
 add constraint academy_cashier_predecessor_fk foreign key(academy_id,previous_shift_id) references public.academy_cashier_shifts(academy_id,id) on delete restrict,
 add constraint academy_cashier_handover_complete check(previous_shift_id is null or(shift_sequence is not null and handover_previous_count is not null and handover_difference=opening_balance-handover_previous_count and handover_accepted_by is not null and handover_accepted_at is not null and(handover_difference=0 or length(trim(handover_reason))>=3)));
create unique index academy_cashier_sequence_unique on public.academy_cashier_shifts(academy_id,cashbox_id,shift_sequence) where shift_sequence is not null;
create unique index academy_cashier_predecessor_once on public.academy_cashier_shifts(academy_id,previous_shift_id) where previous_shift_id is not null;

create function public.academy_cashier_handover_history_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE' then raise exception using errcode='23514',message='Retain cashier shift and handover history';end if;
 if(to_jsonb(old)-array['closed_at','expected_closing_balance','counted_closing_balance','discrepancy','status','closing_note','metadata','updated_at']) is distinct from(to_jsonb(new)-array['closed_at','expected_closing_balance','counted_closing_balance','discrepancy','status','closing_note','metadata','updated_at']) then raise exception using errcode='23514',message='Retain the accepted cashier opening and handover';end if;
 if old.status<>'open' and new is distinct from old then raise exception using errcode='23514',message='Retain closed cashier shift history';end if;
 return new;
end;$$;
revoke all on function public.academy_cashier_handover_history_guard() from public,anon,authenticated,service_role;
create trigger academy_cashier_handover_history_immutable before update or delete on public.academy_cashier_shifts for each row execute function public.academy_cashier_handover_history_guard();

create or replace function public.academy_open_cashier_shift(p_academy_id uuid,p_cashbox_id uuid,p_actor_id uuid,p_opening_balance bigint,p_note text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare saved public.academy_cashier_shifts;
begin
 perform 1 from public.academy_cashboxes where academy_id=p_academy_id and id=p_cashbox_id and is_active for update;
 if not found then raise exception using errcode='42501',message='Choose an active cashbox in this institution';end if;
 select * into saved from public.academy_cashier_shifts where academy_id=p_academy_id and idempotency_key=p_idempotency_key;
 if found then return to_jsonb(saved);end if;
 if p_opening_balance is null or p_opening_balance<0 then raise exception using errcode='22023',message='Count a non-negative opening balance';end if;
 if exists(select 1 from public.academy_cashier_shifts where academy_id=p_academy_id and cashbox_id=p_cashbox_id) then raise exception using errcode='23505',message='Review and accept the previous cash handover before opening this shift';end if;
 insert into public.academy_cashier_shifts(academy_id,cashbox_id,cashier_user_id,opening_balance,opening_note,idempotency_key,shift_sequence,opened_at)
 values(p_academy_id,p_cashbox_id,p_actor_id,p_opening_balance,nullif(trim(p_note),''),p_idempotency_key,1,clock_timestamp()) returning * into saved;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata) values(p_academy_id,p_actor_id,'cashier.shift_opened','academy_cashier_shift',saved.id::text,jsonb_build_object('opening_balance',p_opening_balance,'initial_cashbox_count',true));
 return to_jsonb(saved);
end;$$;
revoke all on function public.academy_open_cashier_shift(uuid,uuid,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.academy_open_cashier_shift(uuid,uuid,uuid,bigint,text,text) to service_role;

create function public.academy_accept_cashier_handover(p_academy uuid,p_actor uuid,p_payload jsonb,p_request_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare box public.academy_cashboxes;previous public.academy_cashier_shifts;saved public.academy_cashier_shifts;received bigint;sequence_value integer;reason_value text;
begin
 if p_payload->'accept_handover' is distinct from 'true'::jsonb then raise exception using errcode='22023',message='Confirm the previous cash count before accepting handover';end if;
 select * into box from public.academy_cashboxes where academy_id=p_academy and id=(p_payload->>'cashbox_id')::uuid and is_active for update;
 if box.id is null then raise exception using errcode='42501',message='Choose an active cashbox in this institution';end if;
 select * into previous from public.academy_cashier_shifts where academy_id=p_academy and cashbox_id=box.id order by coalesce(shift_sequence,0) desc,closed_at desc nulls first,opened_at desc,id desc limit 1 for update;
 if previous.id is null or previous.id is distinct from(p_payload->>'previous_shift_id')::uuid or previous.status not in('closed','reconciled') or previous.counted_closing_balance is null or exists(select 1 from public.academy_cashier_shifts where academy_id=p_academy and cashbox_id=box.id and status='open') then raise exception using errcode='23505',message='The previous shift changed. Refresh and review its cash count';end if;
 received:=(p_payload->>'opening_balance')::bigint;reason_value:=nullif(trim(p_payload->>'note'),'');
 if received is null or received<0 or(received<>previous.counted_closing_balance and coalesce(length(reason_value),0)<3) then raise exception using errcode='22023',message='Count received cash and explain any handover difference';end if;
 select coalesce(max(shift_sequence),0)+1 into sequence_value from public.academy_cashier_shifts where academy_id=p_academy and cashbox_id=box.id;
 insert into public.academy_cashier_shifts(academy_id,cashbox_id,cashier_user_id,opening_balance,opening_note,idempotency_key,previous_shift_id,shift_sequence,handover_previous_count,handover_difference,handover_reason,handover_accepted_by,handover_accepted_at,opened_at)
 values(p_academy,box.id,p_actor,received,reason_value,p_request_key,previous.id,sequence_value,previous.counted_closing_balance,received-previous.counted_closing_balance,reason_value,p_actor,clock_timestamp(),clock_timestamp()) returning * into saved;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata) values(p_academy,p_actor,'cashier.handover_accepted','academy_cashier_shift',saved.id::text,jsonb_build_object('previous_shift_id',previous.id,'previous_cashier_user_id',previous.cashier_user_id,'received_by',p_actor,'previous_counted_balance',previous.counted_closing_balance,'received_balance',received,'difference',received-previous.counted_closing_balance,'reason',reason_value));
 return to_jsonb(saved);
end;$$;
revoke all on function public.academy_accept_cashier_handover(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.academy_accept_cashier_handover(uuid,uuid,jsonb,text) to service_role;

create or replace function public.academy_close_cashier_shift(p_academy_id uuid,p_shift_id uuid,p_actor_id uuid,p_counted bigint,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$ declare v public.academy_cashier_shifts%rowtype;v_expected bigint;v_rec public.academy_cash_reconciliations%rowtype;
begin
 select * into v_rec from public.academy_cash_reconciliations where academy_id=p_academy_id and idempotency_key=p_idempotency_key;if found then select * into v from public.academy_cashier_shifts where academy_id=p_academy_id and id=p_shift_id;return jsonb_build_object('shift',to_jsonb(v),'reconciliation',to_jsonb(v_rec));end if;
 select * into v from public.academy_cashier_shifts where academy_id=p_academy_id and id=p_shift_id and status='open' for update;if not found then raise exception 'Open cashier shift not found';end if;
 select v.opening_balance+coalesce(sum(case when direction='incoming' then amount else -amount end),0) into v_expected from public.academy_cash_movements where academy_id=p_academy_id and shift_id=p_shift_id and payment_method='cash';
 if p_counted is null or p_counted<0 or(p_counted<>v_expected and coalesce(length(trim(p_reason)),0)<3) then raise exception using errcode='22023',message='Count cash and explain any closing difference';end if;
 update public.academy_cashier_shifts set status='closed',closed_at=now(),expected_closing_balance=v_expected,counted_closing_balance=p_counted,discrepancy=p_counted-v_expected,closing_note=nullif(trim(p_reason),''),updated_at=now() where academy_id=p_academy_id and id=p_shift_id returning * into v;
 insert into public.academy_cash_reconciliations(academy_id,shift_id,expected_amount,counted_amount,discrepancy,status,reason,idempotency_key,reconciled_by)
 values(p_academy_id,p_shift_id,v_expected,p_counted,p_counted-v_expected,case when p_counted=v_expected then 'matched' else 'discrepancy' end,nullif(trim(p_reason),''),p_idempotency_key,p_actor_id) returning * into v_rec;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata) values(p_academy_id,p_actor_id,'cashier.shift_closed','academy_cashier_shift',v.id::text,jsonb_build_object('expected',v_expected,'counted',p_counted,'discrepancy',p_counted-v_expected));return jsonb_build_object('shift',to_jsonb(v),'reconciliation',to_jsonb(v_rec));
end;$$;


create function public.academy_cashbox_last_shift(p_academy uuid,p_cashbox uuid) returns jsonb language sql stable set search_path=public as $$
 select to_jsonb(s)-array['metadata','idempotency_key'] from public.academy_cashier_shifts s where s.academy_id=p_academy and s.cashbox_id=p_cashbox order by coalesce(s.shift_sequence,0) desc,s.closed_at desc nulls first,s.opened_at desc,s.id desc limit 1
$$;
revoke all on function public.academy_cashbox_last_shift(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.academy_finance_exact_json(p_value jsonb)
returns jsonb language plpgsql immutable set search_path=public as $$
declare result jsonb;entry record;
begin
 if jsonb_typeof(p_value)='array' then select coalesce(jsonb_agg(public.academy_finance_exact_json(v)),'[]') into result from jsonb_array_elements(p_value) v;return result;
 elsif jsonb_typeof(p_value)<>'object' then return p_value;end if;
 result:='{}';
 for entry in select * from jsonb_each(p_value) loop
  result:=result||jsonb_build_object(entry.key,case when entry.key in('amount','base_amount','fixed_amount','unit_rate','performance_bonus','original_amount','discount_amount','agreed_amount','list_amount','effective_amount','paid_amount','outstanding_amount','handover_previous_count','handover_difference','opening_balance','expected_closing_balance','counted_closing_balance','discrepancy','expected_amount','counted_amount','generated_revenue','generated_amount','adjustment_amount','final_payable_amount','balance','debits','credits','net_amount','allocated_amount','final_amount','operating_expenses','contribution','teacher_cost','attributed_teacher_cost','collected_revenue','tuition_collected','overdue_amount','available_credit') and jsonb_typeof(entry.value)='number' then to_jsonb(entry.value#>>'{}') else public.academy_finance_exact_json(entry.value) end);
 end loop;return result;
end;$$;
revoke all on function public.academy_finance_exact_json(jsonb) from public,anon,authenticated,service_role;

create or replace function public.academy_finance_command(p_academy_id uuid,p_actor_id uuid,p_command text,p_payload jsonb,p_request_key text)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='35s' as $$
declare auths jsonb;cap text;scopes jsonb;scope jsonb;result jsonb;saved jsonb;primary_value jsonb;result_key text;field text;m jsonb:=p_payload-'metadata';
 previous public.academy_finance_command_receipts;rule public.academy_compensation_rules;shift public.academy_cashier_shifts;value jsonb;target uuid;amount_value bigint;available bigint;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' or coalesce(p_request_key,'') !~ '^[A-Za-z0-9_.:-]{1,160}$' then raise exception using errcode='22023',message='Review the financial action and retry key';end if;
 cap:=('{"create_pricing_plan":"manageFinance","create_subscription":"manageFinance","manage_subscription":"manageFinance","create_charge":"manageFinance",
 "allocate_payment":"collectFinance","post_account_adjustment":"adjustFinance","record_payment_reconciliation":"reconcileFinance","record_payment_promise":"collectFinance",
 "create_cashbox":"manageCashier","open_cashier_shift":"manageCashier","accept_cashier_handover":"manageCashier","record_cash_movement":"manageCashier","close_cashier_shift":"manageCashier",
 "record_expense":"manageFinance","upsert_expense_category":"manageFinance","upsert_budget":"manageFinance","upsert_compensation_rule":"calculatePayroll",
 "record_lesson_delivery":"calculatePayroll","create_payroll_period":"calculatePayroll","calculate_payroll":"calculatePayroll","post_payroll_adjustment":"calculatePayroll"}'::jsonb)->>p_command;
 if p_command='transition_payroll' then cap:=case m->>'status' when 'reviewed' then 'calculatePayroll' when 'approved' then 'approvePayroll' when 'cancelled' then 'approvePayroll' when 'paid' then 'payPayroll' end;end if;
 if cap is null then raise exception using errcode='22023',message='Choose a valid financial action';end if;
 auths:=public.academy_current_authorities(p_academy_id,p_actor_id);
 perform pg_advisory_xact_lock(hashtextextended('finance-command:'||p_academy_id::text||':'||p_actor_id::text||':'||p_request_key,0));
 if m?'currency' then m:=jsonb_set(m,'{currency}',to_jsonb(upper(m->>'currency')));end if;
 foreach field in array array['amount','base_amount','fixed_amount','unit_rate','performance_bonus','original_amount','discount_amount','list_amount','opening_balance','counted_closing_balance'] loop
  if nullif(m->>field,'') is null then continue;end if;
  if m->>field !~ '^[+-]?\d{1,19}$' or abs((m->>field)::numeric)>9223372036854775807
   or(jsonb_typeof(m->field)='number' and abs((m->>field)::numeric)>9007199254740991) then raise exception using errcode='22023',message='Use exact whole monetary units';end if;
 end loop;
 if p_command in('record_cash_movement','allocate_payment','post_account_adjustment','record_expense','record_payment_promise') and coalesce((m->>'amount')::numeric,0)<=0 then raise exception using errcode='22023',message='Use a positive amount';end if;
 if p_command in('open_cashier_shift','accept_cashier_handover') and coalesce((m->>'opening_balance')::numeric,-1)<0 then raise exception using errcode='22023',message='Opening balance must be non-negative';end if;
 if p_command='close_cashier_shift' and coalesce((m->>'counted_closing_balance')::numeric,-1)<0 then raise exception using errcode='22023',message='Counted cash must be non-negative';end if;
 if p_command='post_payroll_adjustment' and(coalesce((m->>'amount')::numeric,0)=0 or(m->>'adjustment_type'='bonus' and(m->>'amount')::numeric<0)) then raise exception using errcode='22023',message='Use a positive bonus, deduction, or non-zero correction';end if;
 if p_command='record_lesson_delivery' and(coalesce((m->>'duration_minutes')::integer,0) not between 1 and 1440 or coalesce((m->>'student_count')::integer,0)<0) then raise exception using errcode='22023',message='Review lesson duration and student count';end if;
 if p_command='upsert_expense_category' and(coalesce(length(trim(m->>'name')),0) not between 1 and 180 or coalesce(m->>'category_key','') !~ '^[a-z0-9_-]{1,80}$') then raise exception using errcode='22023',message='Choose a valid category key and name';end if;
 if p_command in('open_cashier_shift','accept_cashier_handover','record_cash_movement','close_cashier_shift') then
  if p_command in('open_cashier_shift','accept_cashier_handover') then target:=nullif(m->>'cashbox_id','')::uuid;
  else select cashbox_id into target from public.academy_cashier_shifts where academy_id=p_academy_id and id=(m->>'shift_id')::uuid;end if;
  if target is not null then perform pg_advisory_xact_lock(hashtextextended('cashbox-shift:'||p_academy_id::text||':'||target::text,0));end if;
 end if;
 scopes:=public.academy_finance_command_scopes(p_academy_id,p_command,m);
 for scope in select v from jsonb_array_elements(scopes) v loop perform public.academy_assert_current_capability(p_academy_id,p_actor_id,cap,scope);end loop;
 select * into previous from public.academy_finance_command_receipts where academy_id=p_academy_id and actor_id=p_actor_id and request_key=p_request_key;
 if found then
  if previous.command<>p_command or previous.payload is distinct from p_payload then raise exception using errcode='23505',message='This retry key belongs to another financial action';end if;
  for scope in select v from jsonb_array_elements(previous.protected_scopes) v loop perform public.academy_assert_current_capability(p_academy_id,p_actor_id,cap,scope);end loop;
  return previous.result||'{"replayed":true}';
 end if;
 if p_command='create_pricing_plan' then result_key:='pricing_plan';saved:=public.academy_create_pricing_plan(p_academy_id,p_actor_id,m,p_request_key);
 elsif p_command='create_subscription' then result_key:='subscription';saved:=public.academy_create_subscription(p_academy_id,(m->>'contact_id')::uuid,p_actor_id,m,p_request_key);
 elsif p_command='manage_subscription' then result:=public.academy_manage_subscription(p_academy_id,(m->>'subscription_id')::uuid,p_actor_id,m->>'operation',m,p_request_key);saved:=result->'subscription';
 elsif p_command='create_charge' then result_key:='charge';saved:=public.academy_create_charge(p_academy_id,(m->>'subscription_id')::uuid,p_actor_id,m,p_request_key);
 elsif p_command='allocate_payment' then result_key:='allocation';saved:=public.academy_allocate_payment(p_academy_id,(m->>'payment_id')::uuid,(m->>'charge_id')::uuid,(m->>'amount')::bigint,p_actor_id,p_request_key);
 elsif p_command='post_account_adjustment' then result_key:='ledger_entry';saved:=public.academy_post_account_adjustment(p_academy_id,(m->>'contact_id')::uuid,p_actor_id,m,p_request_key);
 elsif p_command='record_payment_reconciliation' then result_key:='reconciliation';saved:=public.academy_record_payment_reconciliation(p_academy_id,nullif(m->>'payment_id','')::uuid,p_actor_id,m,p_request_key);
 elsif p_command='record_payment_promise' then result:=public.academy_record_payment_promise(p_academy_id,(m->>'contact_id')::uuid,p_actor_id,m,p_request_key);saved:=result->'promise';
 elsif p_command='open_cashier_shift' then result_key:='cashier_shift';saved:=public.academy_open_cashier_shift(p_academy_id,(m->>'cashbox_id')::uuid,p_actor_id,(m->>'opening_balance')::bigint,nullif(trim(m->>'note'),''),p_request_key);
 elsif p_command='accept_cashier_handover' then result_key:='cashier_shift';saved:=public.academy_accept_cashier_handover(p_academy_id,p_actor_id,m,p_request_key);
 elsif p_command='record_cash_movement' then
  select * into shift from public.academy_cashier_shifts where academy_id=p_academy_id and id=(m->>'shift_id')::uuid for update;
  if shift.id is null or shift.status<>'open' then raise exception using errcode='23505',message='An open shift is required';end if;
  select to_jsonb(b) into value from public.academy_cashboxes b where b.academy_id=p_academy_id and b.id=shift.cashbox_id;
  if m->>'currency' is not null and m->>'currency' is distinct from value->>'currency' then raise exception using errcode='22023',message='Use the cashbox currency for this shift';end if;
  m:=jsonb_set(m,'{currency}',value->'currency');
  if m->>'movement_type'='payment' and nullif(m->>'academy_payment_id','') is not null then
   perform pg_advisory_xact_lock(hashtextextended('cash-payment:'||p_academy_id::text||':'||(m->>'academy_payment_id'),0));
   if exists(select 1 from public.academy_cash_movements where academy_id=p_academy_id and academy_payment_id=(m->>'academy_payment_id')::uuid and movement_type='payment' and direction='incoming') then raise exception using errcode='23505',message='This payment already has a cashier receipt';end if;
   select to_jsonb(p) into value from public.academy_payments p where academy_id=p_academy_id and id=(m->>'academy_payment_id')::uuid;
   if value->>'status'<>'paid' or value->>'currency' is distinct from coalesce(m->>'currency','UZS') or(m->>'amount')::bigint<>(value->>'amount')::bigint or m->>'direction'<>'incoming' then raise exception using errcode='22023',message='Cashier receipt must match the completed payment';end if;
  end if;
  if m->>'direction'='outgoing' and m->>'payment_method'='cash' then
   select shift.opening_balance+coalesce(sum(case when direction='incoming' then amount else -amount end),0) into available from public.academy_cash_movements where academy_id=p_academy_id and shift_id=shift.id and payment_method='cash';
   if(m->>'amount')::bigint>available then raise exception using errcode='22023',message='The shift has insufficient cash';end if;
  end if;
  result_key:='cash_movement';saved:=public.academy_record_cash_movement(p_academy_id,shift.id,p_actor_id,m,p_request_key);
 elsif p_command='close_cashier_shift' then result:=public.academy_close_cashier_shift(p_academy_id,(m->>'shift_id')::uuid,p_actor_id,(m->>'counted_closing_balance')::bigint,m->>'reason',p_request_key);saved:=result->'shift';
 elsif p_command='record_expense' then result_key:='expense';saved:=public.academy_record_expense(p_academy_id,p_actor_id,m||'{"status":"approved"}',p_request_key);
 elsif p_command='create_payroll_period' then
  perform pg_advisory_xact_lock(hashtextextended('payroll-period:'||p_academy_id::text,0));
  if exists(select 1 from public.academy_payroll_periods p where p.academy_id=p_academy_id and p.status<>'cancelled'
   and p.currency=coalesce(m->>'currency','UZS') and(p.branch_id is null or nullif(m->>'branch_id','') is null or p.branch_id=(m->>'branch_id')::uuid)
   and daterange(p.period_start,p.period_end,'[]') && daterange((m->>'period_start')::date,(m->>'period_end')::date,'[]')) then raise exception using errcode='23505',message='An active payroll period already covers these dates';end if;
  result_key:='payroll_period';saved:=public.academy_create_payroll_period(p_academy_id,p_actor_id,m,p_request_key);
 elsif p_command='calculate_payroll' then result:=public.academy_calculate_payroll(p_academy_id,(m->>'payroll_period_id')::uuid,p_actor_id,p_request_key);saved:=result->'period';
 elsif p_command='post_payroll_adjustment' then
  amount_value:=(m->>'amount')::bigint;if m->>'adjustment_type'='deduction' and amount_value>0 then amount_value:=-amount_value;end if;
  result_key:='payroll_adjustment';saved:=public.academy_post_payroll_adjustment(p_academy_id,(m->>'payroll_row_id')::uuid,p_actor_id,m->>'adjustment_type',amount_value,m->>'reason',p_request_key);
 elsif p_command='transition_payroll' then result_key:='payroll_period';saved:=public.academy_transition_payroll(p_academy_id,(m->>'payroll_period_id')::uuid,p_actor_id,m->>'status',m,p_request_key);
 elsif p_command='create_cashbox' then
  if coalesce(length(trim(m->>'name')),0) not between 1 and 180 then raise exception using errcode='22023',message='Choose a cashbox name';end if;
  insert into public.academy_cashboxes(academy_id,branch_id,name,currency,created_by) values(p_academy_id,(m->>'branch_id')::uuid,trim(m->>'name'),coalesce(m->>'currency','UZS'),p_actor_id) returning id,to_jsonb(academy_cashboxes) into target,saved;result_key:='cashbox';
 elsif p_command='upsert_compensation_rule' then
  if coalesce(length(trim(m->>'name')),0) not between 1 and 180 then raise exception using errcode='22023',message='Choose a compensation rule name';end if;
  if nullif(m->>'id','') is not null then
   select * into rule from public.academy_compensation_rules where academy_id=p_academy_id and id=(m->>'id')::uuid for update;
   if m?'version' and(m->>'version')::integer<>rule.version then raise exception using errcode='23505',message='The compensation rule changed; review its current version';end if;
   update public.academy_compensation_rules set staff_id=(m->>'staff_id')::uuid,branch_id=nullif(m->>'branch_id','')::uuid,rule_type=m->>'rule_type',name=trim(m->>'name'),currency=coalesce(m->>'currency','UZS'),fixed_amount=coalesce((m->>'fixed_amount')::bigint,0),unit_rate=coalesce((m->>'unit_rate')::bigint,0),percentage_basis_points=coalesce((m->>'percentage_basis_points')::integer,0),performance_bonus=coalesce((m->>'performance_bonus')::bigint,0),tiers=coalesce(m->'tiers','[]'),effective_from=(m->>'effective_from')::date,effective_to=nullif(m->>'effective_to','')::date,is_active=coalesce((m->>'is_active')::boolean,true),notes=nullif(trim(m->>'notes'),''),version=rule.version+1,updated_at=clock_timestamp()
    where academy_id=p_academy_id and id=rule.id returning id,to_jsonb(academy_compensation_rules) into target,saved;
  else
   insert into public.academy_compensation_rules(academy_id,staff_id,branch_id,rule_type,name,currency,fixed_amount,unit_rate,percentage_basis_points,performance_bonus,tiers,effective_from,effective_to,is_active,notes,created_by)
    values(p_academy_id,(m->>'staff_id')::uuid,nullif(m->>'branch_id','')::uuid,m->>'rule_type',trim(m->>'name'),coalesce(m->>'currency','UZS'),coalesce((m->>'fixed_amount')::bigint,0),coalesce((m->>'unit_rate')::bigint,0),coalesce((m->>'percentage_basis_points')::integer,0),coalesce((m->>'performance_bonus')::bigint,0),coalesce(m->'tiers','[]'),(m->>'effective_from')::date,nullif(m->>'effective_to','')::date,coalesce((m->>'is_active')::boolean,true),nullif(trim(m->>'notes'),''),p_actor_id)
    returning id,to_jsonb(academy_compensation_rules) into target,saved;
  end if;result_key:='compensation_rule';
 elsif p_command='record_lesson_delivery' then
  insert into public.academy_lesson_deliveries(academy_id,staff_id,branch_id,classroom_id,delivered_on,duration_minutes,student_count,delivery_status,substitute_for_staff_id,verified_by,idempotency_key)
   values(p_academy_id,(m->>'staff_id')::uuid,nullif(m->>'branch_id','')::uuid,(m->>'classroom_id')::uuid,coalesce(nullif(m->>'delivered_on','')::date,current_date),(m->>'duration_minutes')::integer,coalesce((m->>'student_count')::integer,0),coalesce(m->>'delivery_status','delivered'),nullif(m->>'substitute_for_staff_id','')::uuid,p_actor_id,p_request_key) returning id,to_jsonb(academy_lesson_deliveries) into target,saved;result_key:='lesson_delivery';
 elsif p_command='upsert_budget' then
  if nullif(m->>'id','') is null then
   insert into public.academy_budgets(academy_id,branch_id,category_id,period_start,period_end,amount,currency,status,notes,created_by)
    values(p_academy_id,nullif(m->>'branch_id','')::uuid,nullif(m->>'category_id','')::uuid,(m->>'period_start')::date,(m->>'period_end')::date,(m->>'amount')::bigint,coalesce(m->>'currency','UZS'),coalesce(m->>'status','active'),m->>'notes',p_actor_id) returning id,to_jsonb(academy_budgets) into target,saved;
  else
   update public.academy_budgets set branch_id=nullif(m->>'branch_id','')::uuid,category_id=nullif(m->>'category_id','')::uuid,period_start=(m->>'period_start')::date,period_end=(m->>'period_end')::date,amount=(m->>'amount')::bigint,currency=coalesce(m->>'currency','UZS'),status=coalesce(m->>'status','active'),notes=m->>'notes',updated_at=clock_timestamp() where academy_id=p_academy_id and id=(m->>'id')::uuid returning id,to_jsonb(academy_budgets) into target,saved;
  end if;result_key:='budget';
 elsif p_command='upsert_expense_category' then
  if nullif(m->>'id','') is null then
   insert into public.academy_expense_categories(academy_id,category_key,name,kind,parent_id,is_active,created_by) values(p_academy_id,m->>'category_key',m->>'name',coalesce(m->>'kind','operating'),nullif(m->>'parent_id','')::uuid,coalesce((m->>'is_active')::boolean,true),p_actor_id) returning id,to_jsonb(academy_expense_categories) into target,saved;
  else
   update public.academy_expense_categories set category_key=m->>'category_key',name=m->>'name',kind=coalesce(m->>'kind','operating'),parent_id=nullif(m->>'parent_id','')::uuid,is_active=coalesce((m->>'is_active')::boolean,true),updated_at=clock_timestamp() where academy_id=p_academy_id and id=(m->>'id')::uuid returning id,to_jsonb(academy_expense_categories) into target,saved;
  end if;result_key:='expense_category';
 end if;
 if saved is null or saved->>'academy_id' is distinct from p_academy_id::text then raise exception using errcode='23505',message='Financial result could not be confirmed';end if;
 scopes:=scopes||public.academy_finance_command_scopes(p_academy_id,p_command,m||saved);
 for scope in select v from jsonb_array_elements(scopes) v loop perform public.academy_assert_current_capability(p_academy_id,p_actor_id,cap,scope);end loop;
 foreach field in array array['branch_id','classroom_id','contact_id','staff_id','cashbox_id','shift_id','previous_shift_id','accept_handover','payment_id','charge_id','payroll_period_id','payroll_row_id','name','direction','movement_type','payment_method','currency','status','amount','opening_balance','counted_closing_balance','provider','provider_transaction_id','provider_event_id','payload_hash','plan_key','pricing_model','billing_cycle','base_amount','list_amount','discount_amount','rule_type','unit_rate','fixed_amount','percentage_basis_points','performance_bonus','period_start','period_end','effective_from','effective_to','duration_minutes','student_count','delivered_on','promised_for'] loop
  if nullif(trim(m->>field),'') is null or not(saved?field) then continue;end if;
  if field='amount' and p_command in('post_account_adjustment','post_payroll_adjustment') then continue;end if;
  if field in('amount','opening_balance','counted_closing_balance','base_amount','list_amount','discount_amount','unit_rate','fixed_amount','percentage_basis_points','performance_bonus','duration_minutes','student_count') then
   if(m->>field)::numeric is distinct from(saved->>field)::numeric then raise exception using errcode='23505',message='Financial retry key belongs to different values';end if;
  elsif trim(m->>field) is distinct from saved->>field then raise exception using errcode='23505',message='Financial retry key belongs to another record or configuration';end if;
 end loop;
 if result_key is not null then result:=jsonb_build_object(result_key,saved);end if;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_academy_id,p_actor_id,'finance.'||p_command,'finance_command',saved->>'id',jsonb_build_object('request_key',p_request_key));
 for scope in select v from jsonb_array_elements(scopes) v loop perform public.academy_assert_current_capability(p_academy_id,p_actor_id,cap,scope);end loop;
 result:=public.academy_finance_exact_json(result)||jsonb_build_object('actor_id',p_actor_id,'request_key',p_request_key,'replayed',false);
 insert into public.academy_finance_command_receipts(academy_id,actor_id,request_key,command,payload,protected_scopes,result) values(p_academy_id,p_actor_id,p_request_key,p_command,p_payload,scopes,result);
 for scope in select v from jsonb_array_elements(scopes) v loop perform public.academy_assert_current_capability(p_academy_id,p_actor_id,cap,scope);end loop;
 return result;
end;$$;
revoke all on function public.academy_finance_command(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.academy_finance_command(uuid,uuid,text,jsonb,text) to service_role;

create or replace function public.academy_finance_read(p_academy_id uuid,p_actor_id uuid,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='35s' as $$
declare auths jsonb;final_auths jsonb;permissions jsonb:='{}';section jsonb;records jsonb;result jsonb;more jsonb:='{}';row_value jsonb;projection jsonb;selected_branch uuid;totals jsonb:='{}';aggregate_value jsonb;
 capability text;role_value text;table_name text;where_clause text;projection_sql text;limit_value integer;global_access boolean;index_value integer;sum_sql text;
begin
 if p_action not in('commercial_core','operations_finance') or jsonb_typeof(p_payload) is distinct from 'object' then raise exception using errcode='22023',message='Choose a valid financial workspace';end if;
 auths:=public.academy_current_authorities(p_academy_id,p_actor_id);
 if not exists(select 1 from jsonb_array_elements(auths) a where public.academy_command_role_has(a->>'role',case when p_action='commercial_core' then 'viewFinance' else 'viewEconomics' end)
   or(p_action='operations_finance' and(public.academy_command_role_has(a->>'role','manageCashier') or public.academy_command_role_has(a->>'role','viewPayroll')))) then raise exception using errcode='42501',message='Current access does not cover this financial workspace';end if;
 selected_branch:=nullif(p_payload->>'branch_id','')::uuid;
 if selected_branch is not null then
  perform 1 from public.academy_branches b where b.academy_id=p_academy_id and b.id=selected_branch;
  if not found or not public.academy_finance_row_visible(p_academy_id,auths,case when p_action='commercial_core' then 'viewFinance' else 'workspace' end,'academy_branches',jsonb_build_object('id',selected_branch)) then raise exception using errcode='42501',message='This branch is outside your financial access';end if;
 end if;
 limit_value:=coalesce((p_payload->>'limit')::integer,500);if limit_value not between 1 and 1000 then raise exception using errcode='22023',message='Choose a financial page of up to 1,000 records';end if;
 foreach capability in array public.academy_command_capability_names() loop
  permissions:=permissions||jsonb_build_object(capability,exists(select 1 from jsonb_array_elements(auths) a where public.academy_command_role_has(a->>'role',capability) and(a->>'scope_type'='academy' or jsonb_array_length(a->'scope_ids')>0)));
  if selected_branch is not null and not public.academy_finance_row_visible(p_academy_id,auths,capability,'academy_branches',jsonb_build_object('id',selected_branch)) then permissions:=jsonb_set(permissions,array[capability],'false');end if;
 end loop;
 select a->>'role' into role_value from jsonb_array_elements(auths) a order by array_position(array['owner','admin','center_admin','manager','branch_manager','accountant','payroll_officer','counselor','cashier','receptionist','salesperson','parent_liaison','teacher','assistant'],a->>'role') limit 1;
 result:=jsonb_build_object('schema_version',1,'actor_id',p_actor_id,'generated_at',clock_timestamp(),'selected_branch_id',selected_branch,
  'access',jsonb_build_object('role',role_value,'source','grant','scope',case when public.academy_finance_read_covers(auths,case when p_action='commercial_core' then 'viewFinance' else 'workspace' end,'{"kind":"academy"}') then 'academy' else 'assigned_branches' end,'permissions',permissions));
 if p_action='operations_finance' then perform public.ensure_academy_operations_defaults(p_academy_id,null);end if;
 for section in select value from jsonb_array_elements(($tables${
  "commercial_core":[
   {"key":"pricing_plans","table":"academy_pricing_plans","sort":"name","cap":"viewFinance"},
   {"key":"subscriptions","table":"academy_subscriptions","sort":"created_at desc","cap":"viewFinance"},
   {"key":"subscription_freezes","table":"academy_subscription_freezes","sort":"created_at desc","cap":"viewFinance"},
   {"key":"pricing_adjustments","table":"academy_pricing_adjustments","sort":"created_at desc","cap":"viewFinance"},
   {"key":"charges","table":"academy_charge_balances","sort":"issued_on desc","cap":"viewFinance"},
   {"key":"payments","table":"academy_payments","sort":"created_at desc","cap":"viewFinance"},
   {"key":"allocations","table":"academy_payment_allocations","sort":"allocated_at desc","cap":"viewFinance"},
   {"key":"ledger_entries","table":"academy_account_ledger_entries","sort":"effective_at desc","cap":"viewFinance"},
   {"key":"account_balances","table":"academy_account_balances","sort":"last_entry_at desc","cap":"viewFinance"},
   {"key":"debt_cases","table":"academy_debt_cases","sort":"updated_at desc","cap":"viewFinance"},
   {"key":"payment_promises","table":"academy_payment_promises","sort":"promised_for","cap":"viewFinance"},
   {"key":"collection_events","table":"academy_collection_events","sort":"occurred_at desc","cap":"viewFinance"},
   {"key":"reconciliations","table":"academy_payment_reconciliations","sort":"received_at desc","cap":"viewFinance"},
   {"key":"contacts","table":"academy_contacts","sort":"first_name","cap":"viewFinance","columns":["id","primary_branch_id","first_name","last_name","email","phone","status","lifecycle_stage"]},
   {"key":"branches","table":"academy_branches","sort":"name","cap":"viewFinance","columns":["id","name","currency","is_active"]},
   {"key":"classrooms","table":"academy_classrooms","sort":"name","cap":"viewFinance","columns":["id","branch_id","name","is_active"]}
  ],"operations_finance":[
   {"key":"cashboxes","table":"academy_cashboxes","sort":"name","cap":"manageCashier"},
   {"key":"cashier_shifts","table":"academy_cashier_shifts","sort":"opened_at desc","cap":"manageCashier"},
   {"key":"cash_movements","table":"academy_cash_movements","sort":"occurred_at desc","cap":"manageCashier"},
   {"key":"cash_reconciliations","table":"academy_cash_reconciliations","sort":"reconciled_at desc","cap":"manageCashier"},
   {"key":"expense_categories","table":"academy_expense_categories","sort":"name","cap":"viewEconomics"},
   {"key":"expenses","table":"academy_expenses","sort":"expense_date desc","cap":"viewEconomics"},
   {"key":"budgets","table":"academy_budgets","sort":"period_start desc","cap":"viewEconomics"},
   {"key":"lesson_deliveries","table":"academy_lesson_deliveries","sort":"delivered_on desc","cap":"viewPayroll"},
   {"key":"compensation_rules","table":"academy_compensation_rules","sort":"created_at desc","cap":"viewPayroll"},
   {"key":"payroll_periods","table":"academy_payroll_periods","sort":"period_start desc","cap":"viewPayroll"},
   {"key":"payroll_rows","table":"academy_payroll_row_totals","sort":"id","cap":"viewPayroll"},
   {"key":"payroll_adjustments","table":"academy_payroll_adjustments","sort":"created_at desc","cap":"viewPayroll"},
   {"key":"payroll_payouts","table":"academy_payroll_payouts","sort":"paid_at desc","cap":"viewPayroll"},
   {"key":"branch_economics","table":"academy_branch_contribution","sort":"branch_id","cap":"viewEconomics"},
   {"key":"classroom_economics","table":"academy_classroom_contribution","sort":"classroom_id","cap":"viewEconomics"},
   {"key":"staff","table":"academy_staff","sort":"display_name","cap":"viewPayroll","columns":["id","email","display_name","role","classroom_ids","is_active"]},
   {"key":"branches","table":"academy_branches","sort":"name","cap":"workspace","columns":["id","name","currency","is_active"]},
   {"key":"classrooms","table":"academy_classrooms","sort":"name","cap":"workspace","columns":["id","branch_id","name","is_active"]}
  ]
 }$tables$::jsonb)->p_action) loop
  table_name:=section->>'table';global_access:=public.academy_finance_read_covers(auths,section->>'cap','{"kind":"academy"}');
  where_clause:='t.academy_id=$1';
  if not global_access then where_clause:=where_clause||' and public.academy_finance_row_visible($1,$2,$3,'||quote_literal(table_name)||',to_jsonb(t))';end if;
  if selected_branch is not null and section->>'key'<>'branches' then
   where_clause:=where_clause||' and public.academy_finance_row_visible($1,jsonb_build_array(jsonb_build_object(''role'',''owner'',''scope_type'',''branches'',''scope_ids'',jsonb_build_array($4))),$3,'||quote_literal(table_name)||',to_jsonb(t))';
  end if;
  sum_sql:=case table_name
   when 'academy_account_balances' then 'sum(greatest(balance,0))::text balance,sum(greatest(-balance,0))::text available_credit'
   when 'academy_charge_balances' then 'coalesce(sum(outstanding_amount) filter(where days_overdue>0 and outstanding_amount>0 and status not in(''void'',''written_off'')),0)::text overdue_amount'
   when 'academy_payments' then 'coalesce(sum(amount) filter(where status=''paid''),0)::text paid_amount'
   when 'academy_expenses' then 'coalesce(sum(amount) filter(where status in(''approved'',''paid'')),0)::text amount'
   when 'academy_payroll_row_totals' then 'coalesce(sum(final_payable_amount) filter(where exists(select 1 from public.academy_payroll_periods p where p.id=t.payroll_period_id and p.academy_id=t.academy_id and p.status not in(''paid'',''cancelled''))),0)::text final_payable_amount'
  end;
  if sum_sql is not null then
   execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]'') from(select currency,%s from public.%I t where %s group by currency order by currency) r',sum_sql,table_name,where_clause)
    into aggregate_value using p_academy_id,auths,section->>'cap',selected_branch;
   totals:=totals||jsonb_build_object(section->>'key',aggregate_value);
  end if;
  if table_name='academy_cashier_shifts' then
   execute format('select count(*) from public.%I t where %s and status=''open''',table_name,where_clause) into aggregate_value using p_academy_id,auths,section->>'cap',selected_branch;
   totals:=totals||jsonb_build_object('open_shifts',aggregate_value);
  end if;
  projection_sql:='to_jsonb(t)-''idempotency_key''';
  if table_name='academy_cashboxes' then projection_sql:='(to_jsonb(t)-''idempotency_key'')||jsonb_build_object(''handover'',public.academy_cashbox_last_shift(t.academy_id,t.id))';end if;
  if table_name='academy_payments' then projection_sql:='(to_jsonb(t)-''idempotency_key'')||jsonb_build_object(''unallocated_amount'',(t.amount-coalesce((select sum(case when a.allocation_kind=''application'' then a.amount else -a.amount end) from public.academy_payment_allocations a where a.academy_id=t.academy_id and a.payment_id=t.id),0))::text)';end if;
  if section?'columns' then projection_sql:='(select coalesce(jsonb_object_agg(e.key,e.value),''{}'') from jsonb_each(to_jsonb(t)) e where e.key=any(array(select jsonb_array_elements_text('||quote_literal((section->'columns')::text)||'::jsonb))))';end if;
  execute format('select coalesce(jsonb_agg(r.data),''[]'') from(select %s data from public.%I t where %s order by %s limit $5) r',projection_sql,table_name,where_clause,section->>'sort')
   into records using p_academy_id,auths,section->>'cap',selected_branch,limit_value+1;
  more:=more||jsonb_build_object(section->>'key',jsonb_array_length(records)>limit_value);
  if jsonb_array_length(records)>limit_value then records:=records-limit_value;end if;
  if table_name='academy_staff' and not global_access then
   for index_value in 0..jsonb_array_length(records)-1 loop
    row_value:=records->index_value;
    select coalesce(jsonb_agg(c.id),'[]') into projection from public.academy_classrooms c where c.academy_id=p_academy_id and coalesce(row_value->'classroom_ids','[]') @> jsonb_build_array(c.id)
     and public.academy_finance_row_visible(p_academy_id,auths,section->>'cap','academy_classrooms',to_jsonb(c));
    records:=jsonb_set(records,array[index_value::text,'classroom_ids'],projection);
   end loop;
  end if;
  result:=result||jsonb_build_object(section->>'key',records);
 end loop;
 final_auths:=public.academy_current_authorities(p_academy_id,p_actor_id);
 if auths is distinct from final_auths then raise exception using errcode='42501',message='Financial access changed while loading';end if;
 return public.academy_finance_exact_json(result||jsonb_build_object('totals',totals,'has_more',more,'scope_limited',not public.academy_finance_read_covers(auths,case when p_action='commercial_core' then 'viewFinance' else 'workspace' end,'{"kind":"academy"}')));
end;$$;
revoke all on function public.academy_finance_read(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.academy_finance_read(uuid,uuid,text,jsonb) to service_role;

commit;
