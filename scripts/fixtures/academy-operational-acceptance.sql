begin;
create function pg_temp.fail_owned_finance_receipt() returns trigger language plpgsql as $receipt$begin if new.request_key='owned-receipt-fault' then raise exception using errcode='23514',message='Owned injected receipt failure';end if;return new;end;$receipt$;
create trigger owned_finance_receipt_failure before insert on public.academy_finance_command_receipts for each row execute function pg_temp.fail_owned_finance_receipt();
do $fixture$
declare actor uuid:=gen_random_uuid();teacher uuid:=gen_random_uuid();scoped uuid:=gen_random_uuid();academy uuid:=gen_random_uuid();
 branch uuid:=gen_random_uuid();other_branch uuid:=gen_random_uuid();classroom uuid:=gen_random_uuid();other_class uuid:=gen_random_uuid();
 person uuid:=gen_random_uuid();second_person uuid:=gen_random_uuid();paused uuid:=gen_random_uuid();future_person uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();percent_staff uuid:=gen_random_uuid();base_staff uuid:=gen_random_uuid();
 plan uuid;subscription uuid;charge uuid;payment uuid:=gen_random_uuid();period uuid;row_id uuid;result jsonb;again jsonb;snapshot jsonb;rule uuid;
 today date:=(clock_timestamp() at time zone 'Asia/Tashkent')::date;first_day date;last_day date;amount_value bigint;cashbox uuid;shift_id_value uuid;movement uuid;category uuid;budget uuid;
begin
 first_day:=date_trunc('month',today)::date;last_day:=(first_day+interval '1 month'-interval '1 day')::date;
 insert into auth.users(id,email,aud,role,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 select id,id||'@example.invalid','authenticated','authenticated',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Owned operational fixture"}' from unnest(array[actor,teacher,scoped]) id;
 insert into public.tenants(id,name,slug,type,created_by) values(academy,'Owned operational Academy',academy::text,'team',actor);
 insert into public.tenant_memberships(tenant_id,user_id,role,status) values(academy,actor,'owner','active');
 insert into public.academy_branches(id,academy_id,branch_key,name,timezone,is_default,is_active) values
 (branch,academy,'owned-main','Owned main','Asia/Tashkent',true,true),(other_branch,academy,'owned-other','Owned other','Asia/Tashkent',false,true);
 insert into public.academy_classrooms(id,academy_id,branch_id,name,created_by) values(classroom,academy,branch,'Owned main group',actor),(other_class,academy,other_branch,'Owned other group',actor);
 insert into public.academy_contacts(id,academy_id,primary_branch_id,first_name,email,status,created_by)
 select id,academy,branch,'Owned student',id||'@example.invalid',case when id=paused then 'paused' else 'active' end,actor from unnest(array[person,second_person,paused,future_person]) id;
 insert into public.academy_classroom_memberships(academy_id,classroom_id,contact_id,role,status,joined_at)
 select academy,classroom,id,'student',case when id=paused then 'paused' else 'active' end,case when id=future_person then (last_day+40)::timestamptz else first_day::timestamptz end from unnest(array[person,second_person,paused,future_person]) id;
 insert into public.academy_staff(id,academy_id,user_id,email,display_name,role,classroom_ids,created_by)
 values(staff,academy,teacher,teacher||'@example.invalid','Owned teacher','teacher',jsonb_build_array(classroom,other_class),actor),
 (percent_staff,academy,null,percent_staff||'@example.invalid','Owned percentage teacher','teacher',jsonb_build_array(classroom,other_class),actor),
 (base_staff,academy,null,base_staff||'@example.invalid','Owned base teacher','teacher',jsonb_build_array(classroom,other_class),actor);
 insert into public.academy_role_grants(academy_id,user_id,email,role,scope_type,scope_ids,status,granted_by)
 values(academy,scoped,scoped||'@example.invalid','admin','branches',jsonb_build_array(other_branch),'active',actor);
 insert into public.academy_lesson_deliveries(academy_id,staff_id,classroom_id,branch_id,delivered_on,duration_minutes,delivery_status,student_count,idempotency_key)
 select academy,s.id,d.classroom_id,d.branch_id,today,d.minutes,'delivered',2,d.key||s.id from unnest(array[staff,percent_staff,base_staff]) s(id)
 cross join (values(classroom,branch,90,'owned-one:'),(classroom,branch,60,'owned-two:'),(other_class,other_branch,90,'owned-other:')) d(classroom_id,branch_id,minutes,key);

 result:=public.academy_finance_command(academy,actor,'create_pricing_plan',jsonb_build_object('plan_key','owned-tuition','name','Owned tuition','pricing_model','monthly_fixed','billing_cycle','monthly','base_amount',5000,'currency','UZS','branch_id',branch,'classroom_id',classroom),'owned-plan');
 plan:=(result->'pricing_plan'->>'id')::uuid;
 result:=public.academy_finance_command(academy,actor,'create_subscription',jsonb_build_object('contact_id',person,'pricing_plan_id',plan,'branch_id',branch,'classroom_id',classroom,'status','active','starts_on',first_day-30,'ends_on',last_day,'list_amount',5000),'owned-subscription');
 subscription:=(result->'subscription'->>'id')::uuid;
 result:=public.academy_finance_command(academy,actor,'create_charge',jsonb_build_object('subscription_id',subscription,'cycle_key','owned-previous-month','issued_on',first_day-1,'due_on',today,'original_amount',5000,'description','Prior bill, partially collected now'),'owned-charge');
 charge:=(result->'charge'->>'id')::uuid;
 insert into public.academy_payments(id,academy_id,contact_id,provider,provider_transaction_id,amount,currency,status,created_by,metadata)
 values(payment,academy,person,'manual','owned-payment:'||payment,1000,'UZS','paid',actor,'{"owned_qa":true}');
 perform public.academy_finance_command(academy,actor,'allocate_payment',jsonb_build_object('payment_id',payment,'charge_id',charge,'amount',1000),'owned-collected-allocation');
 perform public.academy_finance_command(academy,actor,'upsert_compensation_rule',jsonb_build_object('staff_id',staff,'branch_id',branch,'rule_type','per_lesson','name','Owned per lesson','unit_rate',200,'effective_from',first_day),'owned-rule-lesson');
 perform public.academy_finance_command(academy,actor,'upsert_compensation_rule',jsonb_build_object('staff_id',percent_staff,'branch_id',branch,'rule_type','percentage_group_revenue','name','Owned collected tuition','percentage_basis_points',2500,'effective_from',first_day),'owned-rule-percentage');
 perform public.academy_finance_command(academy,actor,'upsert_compensation_rule',jsonb_build_object('staff_id',base_staff,'branch_id',branch,'rule_type','base_plus_student','name','Owned base and active students','fixed_amount',1000,'unit_rate',30,'effective_from',first_day),'owned-rule-base');
 result:=public.academy_finance_command(academy,actor,'create_payroll_period',jsonb_build_object('branch_id',branch,'period_start',first_day,'period_end',last_day,'currency','UZS'),'owned-period');
 period:=(result->'payroll_period'->>'id')::uuid;
 begin perform public.academy_calculate_payroll(academy,period,scoped,'owned-outside-scope');raise exception 'Foreign branch calculated payroll';exception when insufficient_privilege then null;end;
 begin perform public.academy_calculate_payroll(academy,period,teacher,'owned-teacher-denied');raise exception 'Teacher calculated own payroll';exception when insufficient_privilege then null;end;
 result:=public.academy_finance_command(academy,actor,'calculate_payroll',jsonb_build_object('payroll_period_id',period),'owned-calculate');
 if result->>'row_count'<>'3' then raise exception 'Expected three compensation rules';end if;
 select generated_amount into amount_value from public.academy_payroll_rows where payroll_period_id=period and rule_snapshot->>'rule_type'='per_lesson';
 if amount_value<>400 then raise exception 'Per-lesson pay included another branch or omitted a delivery: %',amount_value;end if;
 select generated_amount,inputs_snapshot into amount_value,snapshot from public.academy_payroll_rows where payroll_period_id=period and rule_snapshot->>'rule_type'='percentage_group_revenue';
 if amount_value<>250 or snapshot->>'collected_revenue'<>'1000' or snapshot->>'revenue_basis'<>'net_paid_allocations' then raise exception 'Percentage pay used billed rather than collected tuition: %, %',amount_value,snapshot;end if;
 select generated_amount into amount_value from public.academy_payroll_rows where payroll_period_id=period and rule_snapshot->>'rule_type'='base_plus_student';
 if amount_value<>1060 then raise exception 'Base plus student pay included paused/future students: %',amount_value;end if;
 again:=public.academy_finance_command(academy,actor,'calculate_payroll',jsonb_build_object('payroll_period_id',period),'owned-calculate');
 if again->>'row_count'<>'3' or(select count(*) from public.academy_payroll_rows where payroll_period_id=period)<>3 then raise exception 'Payroll retry duplicated rows';end if;
 select id into row_id from public.academy_payroll_rows where payroll_period_id=period and staff_id=staff;
 perform public.academy_finance_command(academy,actor,'post_payroll_adjustment',jsonb_build_object('payroll_row_id',row_id,'adjustment_type','bonus','amount',40,'reason','Owned verified bonus'),'owned-bonus');
 perform public.academy_finance_command(academy,actor,'transition_payroll',jsonb_build_object('payroll_period_id',period,'status','reviewed'),'owned-review');
 perform public.academy_finance_command(academy,actor,'transition_payroll',jsonb_build_object('payroll_period_id',period,'status','approved'),'owned-approve');
 perform public.academy_finance_command(academy,actor,'transition_payroll',jsonb_build_object('payroll_period_id',period,'status','paid','payment_method','bank_transfer','payment_reference','Owned fixture only'),'owned-payout');
 perform public.academy_finance_command(academy,actor,'transition_payroll',jsonb_build_object('payroll_period_id',period,'status','paid','payment_method','bank_transfer','payment_reference','Owned fixture only'),'owned-payout');
 if(select count(*) from public.academy_payroll_payouts where payroll_period_id=period)<>3 or(select sum(amount) from public.academy_payroll_payouts where payroll_period_id=period)<>1750 then raise exception 'Payroll payout replay or exact report differs';end if;
 begin perform public.academy_calculate_payroll(academy,period,actor,'owned-recalculate-paid');raise exception 'Paid payroll was recalculated';exception when raise_exception then if sqlerrm='Paid payroll was recalculated' then raise;end if;end;
 if(select sum(amount) from public.academy_payroll_payouts where payroll_period_id=period)<>1750 then raise exception 'Recalculation changed historical payout';end if;
 -- Cash, card and Click receipts have distinct physical-cash consequences.
 result:=public.academy_finance_command(academy,actor,'create_cashbox',jsonb_build_object('branch_id',branch,'name','Owned cashbox','currency','UZS'),'owned-cashbox');cashbox:=(result->'cashbox'->>'id')::uuid;
 result:=public.academy_finance_command(academy,actor,'open_cashier_shift',jsonb_build_object('cashbox_id',cashbox,'opening_balance',100),'owned-shift');shift_id_value:=(result->'cashier_shift'->>'id')::uuid;
 result:=public.academy_finance_command(academy,actor,'record_cash_movement',jsonb_build_object('shift_id',shift_id_value,'direction','incoming','movement_type','payment','payment_method','cash','amount',500,'reason','Owned cash sale'),'owned-cash');
 movement:=(result->'cash_movement'->>'id')::uuid;
 again:=public.academy_finance_command(academy,actor,'record_cash_movement',jsonb_build_object('shift_id',shift_id_value,'direction','incoming','movement_type','payment','payment_method','cash','amount',500,'reason','Owned cash sale'),'owned-cash');
 if again->>'replayed'<>'true' or again->'cash_movement'->>'id'<>movement::text then raise exception 'Cash movement replay duplicated';end if;
 begin perform public.academy_finance_command(academy,actor,'record_cash_movement',jsonb_build_object('shift_id',shift_id_value,'direction','incoming','movement_type','payment','payment_method','cash','amount',600,'reason','Changed amount'),'owned-cash');raise exception 'Changed financial retry accepted';exception when unique_violation then null;end;
 perform public.academy_finance_command(academy,actor,'record_cash_movement',jsonb_build_object('shift_id',shift_id_value,'direction','incoming','movement_type','payment','payment_method','click','amount',700,'reason','Owned Click book entry, no external charge'),'owned-click');
 perform public.academy_finance_command(academy,actor,'record_cash_movement',jsonb_build_object('shift_id',shift_id_value,'direction','incoming','movement_type','payment','payment_method','manual_pos','amount',300,'reason','Owned card book entry, no external charge'),'owned-card');
 perform public.academy_finance_command(academy,actor,'record_cash_movement',jsonb_build_object('shift_id',shift_id_value,'academy_payment_id',payment,'direction','incoming','movement_type','payment','payment_method','cash','amount',1000,'reason','Owned linked cash receipt'),'owned-linked-cash');
 begin perform public.academy_finance_command(academy,actor,'record_cash_movement',jsonb_build_object('shift_id',shift_id_value,'academy_payment_id',payment,'direction','incoming','movement_type','payment','payment_method','cash','amount',1000,'reason','Duplicate cash receipt'),'owned-linked-cash-duplicate');raise exception 'Payment counted twice in cashier';exception when unique_violation then null;end;
 begin perform public.academy_finance_command(academy,actor,'record_cash_movement',jsonb_build_object('shift_id',shift_id_value,'direction','outgoing','movement_type','other','payment_method','cash','amount',2000,'reason','Overspend attempt'),'owned-overspend');raise exception 'Unavailable cash spent';exception when invalid_parameter_value then null;end;
 begin perform public.academy_finance_command(academy,actor,'record_cash_movement',jsonb_build_object('shift_id',shift_id_value,'direction','incoming','movement_type','payment','payment_method','cash','amount',10,'currency','USD','reason','Owned currency refusal'),'owned-wrong-currency');raise exception 'Mixed cash currencies accepted';exception when invalid_parameter_value then null;end;
 result:=public.academy_finance_command(academy,actor,'close_cashier_shift',jsonb_build_object('shift_id',shift_id_value,'counted_closing_balance',1590,'reason','Owned discrepancy retained'),'owned-close');
 if result->'shift'->>'expected_closing_balance'<>'1600' or result->'reconciliation'->>'discrepancy'<>'-10' then raise exception 'Card/Click changed physical cash balance: %',result;end if;
 again:=public.academy_finance_command(academy,actor,'close_cashier_shift',jsonb_build_object('shift_id',shift_id_value,'counted_closing_balance',1590,'reason','Owned discrepancy retained'),'owned-close');
 if again->'reconciliation'->>'id'<>result->'reconciliation'->>'id' or(select count(*) from public.academy_cash_reconciliations where shift_id=shift_id_value)<>1 then raise exception 'Shift closure replay duplicated reconciliation';end if;
 result:=public.academy_finance_command(academy,actor,'post_account_adjustment',jsonb_build_object('contact_id',person,'entry_type','account_credit','amount','9007199254740993','reason','Exact owned credit'),'owned-exact-credit');
 if result->'ledger_entry'->>'amount'<>'-9007199254740993' or jsonb_typeof(result->'ledger_entry'->'amount')<>'string' then raise exception 'Financial response rounded exact units';end if;
 result:=public.academy_finance_command(academy,actor,'upsert_expense_category','{"category_key":"owned-supplies","name":"Owned supplies","kind":"operating"}','owned-category');category:=(result->'expense_category'->>'id')::uuid;
 perform public.academy_finance_command(academy,actor,'record_expense',jsonb_build_object('category_id',category,'branch_id',branch,'expense_date',today,'amount',150,'currency','UZS','vendor','Owned fixture','description','Owned paper','payment_method','manual_pos'),'owned-expense');
 result:=public.academy_finance_command(academy,actor,'upsert_budget',jsonb_build_object('category_id',category,'branch_id',branch,'period_start',first_day,'period_end',last_day,'amount',5000),'owned-budget');budget:=(result->'budget'->>'id')::uuid;
 begin perform public.academy_finance_command(academy,scoped,'upsert_budget',jsonb_build_object('id',budget,'category_id',category,'branch_id',other_branch,'period_start',first_day,'period_end',last_day,'amount',7000),'owned-budget-scope-forge');raise exception 'Foreign original budget moved into caller scope';exception when insufficient_privilege then null;end;
 if(select amount from public.academy_budgets where id=budget)<>5000 then raise exception 'Scope refusal left a partial budget update';end if;
 perform public.academy_finance_command(academy,actor,'record_payment_reconciliation',jsonb_build_object('payment_id',payment,'provider','manual','provider_transaction_id','owned-payment:'||payment,'provider_event_id','owned-event:'||payment,'event_type','completed','amount',1000,'currency','UZS','status','matched','payload_hash',repeat('a',64)),'owned-reconcile');
 perform public.academy_finance_command(academy,actor,'record_payment_promise',jsonb_build_object('contact_id',person,'subscription_id',subscription,'branch_id',branch,'amount',4000,'promised_for',today+3,'notes','Owned promise'),'owned-promise');
 perform public.academy_finance_command(academy,actor,'record_lesson_delivery',jsonb_build_object('staff_id',staff,'classroom_id',classroom,'branch_id',branch,'delivered_on',today,'duration_minutes',90,'student_count',2,'delivery_status','cancelled'),'owned-cancelled-delivery');
 begin perform public.academy_finance_command(academy,actor,'create_cashbox',jsonb_build_object('branch_id',branch,'name','Owned rolled-back box','currency','UZS'),'owned-receipt-fault');raise exception 'Receipt fault did not fire';exception when check_violation then null;end;
 if exists(select 1 from public.academy_cashboxes where academy_id=academy and name='Owned rolled-back box') then raise exception 'Business row survived a failed receipt';end if;
 -- Vacation carries forward paid service days and replay never extends twice.
 result:=public.academy_finance_command(academy,actor,'manage_subscription',jsonb_build_object('subscription_id',subscription,'operation','freeze','starts_on',today,'ends_on',today+7,'reason','Owned vacation'),'owned-vacation');
 if result->'subscription'->>'status'<>'paused' then raise exception 'Vacation did not pause subscription';end if;
 -- Move only the owned fixture start to model three elapsed branch-local days.
 update public.academy_subscription_freezes set starts_on=today-3 where academy_id=academy and subscription_id=subscription and status='active';
 result:=public.academy_finance_command(academy,actor,'manage_subscription',jsonb_build_object('subscription_id',subscription,'operation','resume'),'owned-resume');
 if (result->'subscription'->>'ends_on')::date<>last_day+3 or result->'subscription'->>'status'<>'active' then raise exception 'Vacation lost paid time';end if;
 again:=public.academy_finance_command(academy,actor,'manage_subscription',jsonb_build_object('subscription_id',subscription,'operation','resume'),'owned-resume');
 if (again->'subscription'->>'ends_on')::date<>last_day+3 then raise exception 'Resume replay extended paid time twice';end if;
 -- Mixed grants must not promote a cashier in the main branch to admin there.
 insert into public.academy_role_grants(academy_id,user_id,email,role,scope_type,scope_ids,status,granted_by)
 values(academy,scoped,scoped||'+cashier@example.invalid','cashier','branches',jsonb_build_array(branch),'active',actor);
 result:=public.academy_finance_read(academy,actor,'commercial_core','{"limit":1}');
 if result->>'actor_id'<>actor::text or jsonb_typeof(result->'account_balances'->0->'balance')<>'string'
  or result->'totals'->'account_balances'->0->>'available_credit'<>'9007199254736993' then raise exception 'Exact full commercial totals failed: %',result->'totals';end if;
 if not(result->'has_more'->>'contacts')::boolean or jsonb_array_length(result->'contacts')<>1 then raise exception 'Financial list limit is silent';end if;
 result:=public.academy_finance_read(academy,actor,'operations_finance','{}');
 if jsonb_array_length(result->'payroll_rows')<>3 or result->'totals'->'expenses'->0->>'amount'<>'150' then raise exception 'Owner finance read lost operational records';end if;
 result:=public.academy_finance_read(academy,scoped,'operations_finance',jsonb_build_object('branch_id',branch));
 if (result->'access'->'permissions'->>'calculatePayroll')::boolean then raise exception 'Mixed branch permissions promoted payroll';end if;
 if jsonb_array_length(result->'payroll_rows')<>0 or jsonb_array_length(result->'expenses')<>0 or jsonb_array_length(result->'cashboxes')<>1 then raise exception 'Mixed grants leaked payroll/expenses or lost cashier access: %',result;end if;
 result:=public.academy_finance_read(academy,scoped,'commercial_core',jsonb_build_object('branch_id',branch));
 if jsonb_array_length(result->'charges')<>1 then raise exception 'Cashier lost permitted branch collection records';end if;
 begin perform public.academy_finance_command(academy,scoped,'create_pricing_plan',jsonb_build_object('plan_key','forged-admin','name','Forbidden plan','pricing_model','monthly_fixed','billing_cycle','monthly','base_amount',5000,'branch_id',branch),'owned-mixed-role-denial');raise exception 'Cashier promoted to admin by other branch grant';exception when insufficient_privilege then null;end;
 begin perform public.academy_finance_read(academy,teacher,'operations_finance','{}');raise exception 'Teacher read payroll workspace';exception when insufficient_privilege then null;end;
 begin perform public.academy_finance_command(academy,actor,'create_payroll_period',jsonb_build_object('branch_id',branch,'period_start',first_day,'period_end',last_day,'currency','UZS'),'owned-period-overlap');raise exception 'Payroll duplicate period accepted';exception when unique_violation then null;end;
 -- Global compensation is paid once institution-wide; classroom rounding must reconcile.
 insert into public.academy_staff(academy_id,email,display_name,role,classroom_ids,created_by)
 values(academy,'hourly-'||academy||'@example.invalid','Owned hourly teacher','teacher',jsonb_build_array(classroom,other_class),actor) returning id into staff;
 perform public.academy_finance_command(academy,actor,'upsert_compensation_rule',jsonb_build_object('staff_id',staff,'rule_type','per_teaching_hour','name','Owned exact hourly','unit_rate',1,'effective_from',last_day+1),'owned-hourly-rule');
 perform public.academy_finance_command(academy,actor,'record_lesson_delivery',jsonb_build_object('staff_id',staff,'classroom_id',classroom,'branch_id',branch,'delivered_on',last_day+1,'duration_minutes',30,'student_count',2),'owned-hourly-one');
 perform public.academy_finance_command(academy,actor,'record_lesson_delivery',jsonb_build_object('staff_id',staff,'classroom_id',other_class,'branch_id',other_branch,'delivered_on',last_day+1,'duration_minutes',30,'student_count',2),'owned-hourly-two');
 result:=public.academy_finance_command(academy,actor,'create_payroll_period',jsonb_build_object('branch_id',branch,'period_start',last_day+1,'period_end',last_day+10),'owned-future-branch-period');period:=(result->'payroll_period'->>'id')::uuid;
 begin perform public.academy_finance_command(academy,actor,'calculate_payroll',jsonb_build_object('payroll_period_id',period),'owned-global-rule-branch-denial');raise exception 'Global compensation could be paid per branch';exception when invalid_parameter_value then null;end;
 perform public.academy_finance_command(academy,actor,'transition_payroll',jsonb_build_object('payroll_period_id',period,'status','cancelled','reason','Owned replacement by academy-wide period'),'owned-cancel-future');
 result:=public.academy_finance_command(academy,actor,'create_payroll_period',jsonb_build_object('period_start',last_day+1,'period_end',last_day+10),'owned-global-period');period:=(result->'payroll_period'->>'id')::uuid;
 perform public.academy_finance_command(academy,actor,'calculate_payroll',jsonb_build_object('payroll_period_id',period),'owned-global-calculate');
 select id,generated_amount into row_id,amount_value from public.academy_payroll_rows where payroll_period_id=period and staff_id=staff;
 if amount_value<>1 or(select sum(amount) from public.academy_payroll_row_components where payroll_row_id=row_id)<>1 then raise exception 'Rounded classroom components do not reconcile with hourly pay';end if;
 if(select count(distinct command) from public.academy_finance_command_receipts where academy_id=academy)<>21 then raise exception 'Not all 21 financial command cases were qualified';end if;
 update public.tenant_memberships set status='disabled' where tenant_id=academy and user_id=actor;
 begin perform public.academy_finance_command(academy,actor,'close_cashier_shift',jsonb_build_object('shift_id',shift_id_value,'counted_closing_balance',1590,'reason','Owned discrepancy retained'),'owned-close');raise exception 'Revoked finance actor replayed a receipt';exception when insufficient_privilege then null;end;

end;
$fixture$;
rollback;
select 'operational-captured-schema-ok';
