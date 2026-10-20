begin;
create table public.academy_finance_command_receipts(
 academy_id uuid not null references public.tenants(id) on delete restrict,
 actor_id uuid not null references public.users(id) on delete cascade,
 request_key text not null,command text not null,payload jsonb not null,
 protected_scopes jsonb not null,result jsonb not null,created_at timestamptz not null default now(),
 primary key(academy_id,actor_id,request_key),unique(academy_id,request_key),check(length(request_key) between 1 and 160)
);
alter table public.academy_finance_command_receipts enable row level security;
revoke all on public.academy_finance_command_receipts from public,anon,authenticated;
grant all on public.academy_finance_command_receipts to service_role;
create trigger academy_finance_receipts_immutable before update or delete on public.academy_finance_command_receipts
 for each row execute function public.academy_reject_operational_finance_history_mutation();

-- Follow only reviewed institution-bound references. The resource snapshot is
-- acquired in this transaction; browser-supplied branch hints are insufficient.
create or replace function public.academy_finance_command_scopes(p_academy uuid,p_command text,p_payload jsonb)
returns jsonb language plpgsql set search_path=public as $$
declare queue jsonb:=jsonb_build_array(p_payload);item jsonb;scopes jsonb:='[]';seen text[]:='{}';entry record;table_name text;identity uuid;value jsonb;scope jsonb;cursor_value integer:=0;token text;
begin
 while cursor_value<jsonb_array_length(queue) loop
  item:=queue->cursor_value;cursor_value:=cursor_value+1;
  if cursor_value>64 then raise exception using errcode='22023',message='Too many financial references';end if;
  foreach token in array array['branch_id','classroom_id','contact_id'] loop
   identity:=nullif(item->>token,'')::uuid;if identity is null then continue;end if;
   if token='branch_id' and nullif(item->>'classroom_id','') is not null then
    perform 1 from public.academy_classrooms where academy_id=p_academy and id=(item->>'classroom_id')::uuid and branch_id=identity for share;
    if not found then raise exception using errcode='42501',message='The classroom is outside this branch';end if;
    continue;
   end if;
   if token||':'||identity=any(seen) then continue;end if;seen:=seen||array[token||':'||identity];
   scope:=public.academy_command_resource(p_academy,case token when 'branch_id' then 'branch' when 'classroom_id' then 'classroom' else 'contact' end,identity);
   scopes:=scopes||jsonb_build_array(scope);
  end loop;
  for entry in select * from jsonb_each_text('{
   "subscription_id":"academy_subscriptions","pricing_plan_id":"academy_pricing_plans","charge_id":"academy_charges",
   "payment_id":"academy_payments","academy_payment_id":"academy_payments","cashbox_id":"academy_cashboxes","shift_id":"academy_cashier_shifts",
   "staff_id":"academy_staff","substitute_for_staff_id":"academy_staff","category_id":"academy_expense_categories","parent_id":"academy_expense_categories","expense_id":"academy_expenses","debt_case_id":"academy_debt_cases",
   "payroll_period_id":"academy_payroll_periods","payroll_row_id":"academy_payroll_rows","compensation_rule_id":"academy_compensation_rules"
  }'::jsonb) loop
   identity:=nullif(item->>entry.key,'')::uuid;if identity is null then continue;end if;
   token:=entry.value||':'||identity;if token=any(seen) then continue;end if;seen:=seen||array[token];
   execute format('select to_jsonb(t) from public.%I t where academy_id=$1 and id=$2 for share',entry.value) into value using p_academy,identity;
   if value is null then raise exception using errcode='42501',message='A financial reference is outside this institution';end if;
   queue:=queue||jsonb_build_array(value);
  end loop;
  if cursor_value=1 and nullif(item->>'id','') is not null then
   table_name:=case p_command when 'upsert_compensation_rule' then 'academy_compensation_rules' when 'upsert_budget' then 'academy_budgets' when 'upsert_expense_category' then 'academy_expense_categories' end;
   if table_name is not null then
    execute format('select to_jsonb(t) from public.%I t where academy_id=$1 and id=$2 for share',table_name) into value using p_academy,(item->>'id')::uuid;
    if value is null then raise exception using errcode='42501',message='This financial record is outside this institution';end if;queue:=queue||jsonb_build_array(value);
   end if;
  end if;
 end loop;
 if jsonb_array_length(scopes)=0 or p_command='upsert_expense_category'
  or(p_command in('upsert_compensation_rule','create_payroll_period') and nullif(p_payload->>'branch_id','') is null and nullif(p_payload->>'payroll_period_id','') is null) then scopes:=scopes||'[{"kind":"academy"}]';end if;
 return scopes;
end;$$;
revoke all on function public.academy_finance_command_scopes(uuid,text,jsonb) from public,anon,authenticated,service_role;

create or replace function public.academy_finance_exact_json(p_value jsonb)
returns jsonb language plpgsql immutable set search_path=public as $$
declare result jsonb;entry record;
begin
 if jsonb_typeof(p_value)='array' then select coalesce(jsonb_agg(public.academy_finance_exact_json(v)),'[]') into result from jsonb_array_elements(p_value) v;return result;
 elsif jsonb_typeof(p_value)<>'object' then return p_value;end if;
 result:='{}';
 for entry in select * from jsonb_each(p_value) loop
  result:=result||jsonb_build_object(entry.key,case when entry.key in('amount','base_amount','fixed_amount','unit_rate','performance_bonus','original_amount','discount_amount','agreed_amount','list_amount','effective_amount','paid_amount','outstanding_amount','opening_balance','expected_closing_balance','counted_closing_balance','discrepancy','expected_amount','counted_amount','generated_revenue','generated_amount','adjustment_amount','final_payable_amount','balance','debits','credits','net_amount','allocated_amount','final_amount','operating_expenses','contribution','teacher_cost','attributed_teacher_cost','collected_revenue','tuition_collected','overdue_amount','available_credit') and jsonb_typeof(entry.value)='number' then to_jsonb(entry.value#>>'{}') else public.academy_finance_exact_json(entry.value) end);
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
 "create_cashbox":"manageCashier","open_cashier_shift":"manageCashier","record_cash_movement":"manageCashier","close_cashier_shift":"manageCashier",
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
 if p_command='open_cashier_shift' and coalesce((m->>'opening_balance')::numeric,-1)<0 then raise exception using errcode='22023',message='Opening balance must be non-negative';end if;
 if p_command='close_cashier_shift' and coalesce((m->>'counted_closing_balance')::numeric,-1)<0 then raise exception using errcode='22023',message='Counted cash must be non-negative';end if;
 if p_command='post_payroll_adjustment' and(coalesce((m->>'amount')::numeric,0)=0 or(m->>'adjustment_type'='bonus' and(m->>'amount')::numeric<0)) then raise exception using errcode='22023',message='Use a positive bonus, deduction, or non-zero correction';end if;
 if p_command='record_lesson_delivery' and(coalesce((m->>'duration_minutes')::integer,0) not between 1 and 1440 or coalesce((m->>'student_count')::integer,0)<0) then raise exception using errcode='22023',message='Review lesson duration and student count';end if;
 if p_command='upsert_expense_category' and(coalesce(length(trim(m->>'name')),0) not between 1 and 180 or coalesce(m->>'category_key','') !~ '^[a-z0-9_-]{1,80}$') then raise exception using errcode='22023',message='Choose a valid category key and name';end if;
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
 foreach field in array array['branch_id','classroom_id','contact_id','staff_id','cashbox_id','shift_id','payment_id','charge_id','payroll_period_id','payroll_row_id','name','direction','movement_type','payment_method','currency','status','amount','opening_balance','counted_closing_balance','provider','provider_transaction_id','provider_event_id','payload_hash','plan_key','pricing_model','billing_cycle','base_amount','list_amount','discount_amount','rule_type','unit_rate','fixed_amount','percentage_basis_points','performance_bonus','period_start','period_end','effective_from','effective_to','duration_minutes','student_count','delivered_on','promised_for'] loop
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
commit;
