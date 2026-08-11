\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.expect_failure(label text, statement text, expected_message text)
returns void language plpgsql as $$
declare actual_message text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics actual_message = message_text;
    if position(lower(expected_message) in lower(actual_message)) = 0 then
      raise exception '% failed with unexpected error: %',label,actual_message;
    end if;
    return;
  end;
  raise exception '% unexpectedly succeeded',label;
end;
$$;

do $$
declare
  actor_a uuid := 'f2000000-0000-0000-0000-000000000001';
  actor_b uuid := 'f2000000-0000-0000-0000-000000000002';
  guardian_user uuid := 'f2000000-0000-0000-0000-000000000003';
  scoped_manager uuid := 'f2000000-0000-0000-0000-000000000004';
  academy_a uuid := 'f2000000-0000-0000-0000-000000000010';
  academy_b uuid := 'f2000000-0000-0000-0000-000000000011';
  branch_a uuid := 'f2000000-0000-0000-0000-000000000020';
  branch_b uuid := 'f2000000-0000-0000-0000-000000000021';
  classroom_a uuid := 'f2000000-0000-0000-0000-000000000030';
  classroom_b uuid := 'f2000000-0000-0000-0000-000000000031';
  contact_a uuid := 'f2000000-0000-0000-0000-000000000040';
  contact_b uuid := 'f2000000-0000-0000-0000-000000000041';
  staff_a uuid := 'f2000000-0000-0000-0000-000000000050';
  pipeline_a uuid := 'f2000000-0000-0000-0000-000000000060';
  stage_new uuid := 'f2000000-0000-0000-0000-000000000061';
  stage_contacted uuid := 'f2000000-0000-0000-0000-000000000062';
  stage_won uuid := 'f2000000-0000-0000-0000-000000000063';
  lead_a uuid := 'f2000000-0000-0000-0000-000000000070';
  trial_a uuid := 'f2000000-0000-0000-0000-000000000071';
  plan_a uuid;
  subscription_a uuid;
  charge_a uuid;
  payment_a uuid := 'f2000000-0000-0000-0000-000000000080';
  payroll_period uuid;
  payroll_row uuid;
  rule_id uuid := 'f2000000-0000-0000-0000-000000000090';
  version_id uuid;
  execution_id uuid;
  guardian_result jsonb;
  relationship_id uuid;
  link_result jsonb;
  token text;
  first_result jsonb;
  second_result jsonb;
  row_count integer;
  unsafe_tables text[];
begin
  insert into auth.users(id,email,created_at,updated_at) values
    (actor_a,'invariants-a@local.invalid',now(),now()),
    (actor_b,'invariants-b@local.invalid',now(),now()),
    (guardian_user,'invariants-guardian@local.invalid',now(),now()),
    (scoped_manager,'invariants-scoped@local.invalid',now(),now());

  insert into public.tenants(id,name,slug,type,created_by,metadata) values
    (academy_a,'Invariant Academy A','invariant-academy-a','org',actor_a,'{"service_family":"academy"}'),
    (academy_b,'Invariant Academy B','invariant-academy-b','org',actor_b,'{"service_family":"academy"}');
  insert into public.tenant_memberships(tenant_id,user_id,role,status) values
    (academy_a,actor_a,'owner','active'),(academy_b,actor_b,'owner','active');
  insert into public.academy_branches(id,academy_id,branch_key,name,is_default,created_by) values
    (branch_a,academy_a,'main','A Main',true,actor_a),(branch_b,academy_b,'main','B Main',true,actor_b);
  insert into public.academy_role_grants(academy_id,user_id,email,role,scope_type,scope_ids,status,granted_by)
    values(academy_a,scoped_manager,'invariants-scoped@local.invalid','manager','branches',jsonb_build_array(branch_a),'active',actor_a);
  insert into public.academy_classrooms(id,academy_id,branch_id,name,student_capacity,created_by) values
    (classroom_a,academy_a,branch_a,'A Group',12,actor_a),(classroom_b,academy_b,branch_b,'B Group',12,actor_b);
  insert into public.academy_contacts(id,academy_id,primary_branch_id,first_name,last_name,email,created_by) values
    (contact_a,academy_a,branch_a,'A','Student','a-student@local.invalid',actor_a),
    (contact_b,academy_b,branch_b,'B','Student','b-student@local.invalid',actor_b);
  insert into public.academy_staff(id,academy_id,user_id,email,display_name,role,classroom_ids,created_by)
    values(staff_a,academy_a,actor_a,'invariants-a@local.invalid','Teacher A','teacher',jsonb_build_array(classroom_a),actor_a);
  insert into public.academy_import_jobs(academy_id,import_type,source_filename,idempotency_key,created_by)
    values(academy_a,'contacts','scope-evidence.csv','invariants:scope-import',actor_a);

  -- Structural tenant rejection across reused organization, LMS, and payment records.
  perform pg_temp.expect_failure('cross-tenant classroom',format(
    'insert into public.academy_classrooms(academy_id,branch_id,name,created_by) values(%L,%L,%L,%L)',academy_a,branch_b,'Impossible group',actor_a),'foreign key');
  perform pg_temp.expect_failure('cross-tenant membership',format(
    'insert into public.academy_classroom_memberships(academy_id,classroom_id,contact_id,role,status) values(%L,%L,%L,%L,%L)',academy_a,classroom_a,contact_b,'student','active'),'foreign key');
  perform pg_temp.expect_failure('cross-tenant attendance',format(
    'insert into public.academy_attendance(academy_id,classroom_id,contact_id,session_date,status,marked_by) values(%L,%L,%L,current_date,%L,%L)',academy_a,classroom_a,contact_b,'present',actor_a),'foreign key');
  perform pg_temp.expect_failure('cross-tenant payment contact',format(
    'insert into public.academy_payments(academy_id,contact_id,provider,provider_transaction_id,amount,status,created_by) values(%L,%L,%L,%L,100,%L,%L)',academy_a,contact_b,'manual','cross-tenant-payment','paid',actor_a),'foreign key');

  insert into public.academy_sales_pipelines(id,academy_id,pipeline_key,name_i18n,is_default,created_by)
    values(pipeline_a,academy_a,'admissions','{"en":"Admissions"}',true,actor_a);
  insert into public.academy_pipeline_stages(id,academy_id,pipeline_id,stage_key,label_i18n,position,probability_percent,terminal_kind) values
    (stage_new,academy_a,pipeline_a,'new','{"en":"New"}',10,10,null),
    (stage_contacted,academy_a,pipeline_a,'contacted','{"en":"Contacted"}',20,30,null),
    (stage_won,academy_a,pipeline_a,'won','{"en":"Won"}',90,100,'won');
  insert into public.academy_pipeline_transitions(academy_id,pipeline_id,from_stage_id,to_stage_id)
    values(academy_a,pipeline_a,stage_new,stage_contacted),(academy_a,pipeline_a,stage_contacted,stage_won);
  insert into public.academy_leads(id,academy_id,branch_id,pipeline_id,current_stage_id,assigned_user_id,full_name,phone,status,idempotency_key,created_by,updated_by)
    values(lead_a,academy_a,branch_a,pipeline_a,stage_new,actor_a,'Lead A','+998901112233','open','invariants:lead',actor_a,actor_a);

  perform pg_temp.expect_failure('lead skips required stage',format(
    'select public.academy_transition_lead(%L,%L,%L,%L,%L,%L,%L)',academy_a,lead_a,stage_won,actor_a,'skip',null,'invariants:skip-lead'),'Use lead conversion to enter WON');
  first_result := public.academy_transition_lead(academy_a,lead_a,stage_contacted,actor_a,'Contacted',null,'invariants:lead-contacted');
  second_result := public.academy_transition_lead(academy_a,lead_a,stage_contacted,actor_a,'Contacted',null,'invariants:lead-contacted');
  if first_result->>'id' is distinct from second_result->>'id' then raise exception 'Lead transition idempotency failed'; end if;

  insert into public.academy_trial_lessons(id,academy_id,lead_id,branch_id,classroom_id,teacher_user_id,starts_at,ends_at,status,idempotency_key,created_by,updated_by)
    values(trial_a,academy_a,lead_a,branch_a,classroom_a,actor_a,now()+interval '1 hour',now()+interval '2 hours','scheduled','invariants:trial',actor_a,actor_a);
  perform public.academy_set_trial_status(academy_a,trial_a,actor_a,'confirmed',null,null,null,null,'invariants:trial-confirmed');
  perform pg_temp.expect_failure('confirmed trial cannot convert directly',format(
    'select public.academy_set_trial_status(%L,%L,%L,%L,null,null,null,null,%L)',academy_a,trial_a,actor_a,'converted','invariants:trial-invalid'),'Invalid trial status transition');
  perform public.academy_set_trial_status(academy_a,trial_a,actor_a,'attended','Good fit','IELTS','B1','Offer','invariants:trial-attended');

  first_result := public.academy_create_pricing_plan(academy_a,actor_a,jsonb_build_object(
    'plan_key','monthly','name','Monthly','pricing_model','monthly_fixed','billing_cycle','monthly','base_amount',1000,'branch_id',branch_a,'classroom_id',classroom_a),'invariants:plan');
  plan_a := (first_result->>'id')::uuid;
  perform pg_temp.expect_failure('discount without reason',format(
    'select public.academy_create_subscription(%L,%L,%L,%L::jsonb,%L)',academy_a,contact_a,actor_a,
    jsonb_build_object('pricing_plan_id',plan_a,'status','active','starts_on',current_date,'list_amount',1000,'discount_amount',100)::text,'invariants:discount-no-reason'),'Discount reason is required');
  first_result := public.academy_create_subscription(academy_a,contact_a,actor_a,jsonb_build_object(
    'pricing_plan_id',plan_a,'branch_id',branch_a,'classroom_id',classroom_a,'status','active','starts_on',current_date,
    'ends_on',current_date+30,'list_amount',1000,'discount_amount',100,'discount_type','campaign','discount_reason','August campaign'),'invariants:subscription');
  second_result := public.academy_create_subscription(academy_a,contact_a,actor_a,jsonb_build_object(
    'pricing_plan_id',plan_a,'status','active','starts_on',current_date,'list_amount',1000,'discount_amount',100,'discount_reason','August campaign'),'invariants:subscription');
  if first_result->>'id' is distinct from second_result->>'id' then raise exception 'Subscription idempotency failed'; end if;
  subscription_a := (first_result->>'id')::uuid;
  first_result := public.academy_create_charge(academy_a,subscription_a,actor_a,jsonb_build_object('cycle_key','2026-08','due_on',current_date,'description','August tuition'),'invariants:charge');
  second_result := public.academy_create_charge(academy_a,subscription_a,actor_a,jsonb_build_object('cycle_key','2026-08','due_on',current_date),'invariants:charge');
  if first_result->>'id' is distinct from second_result->>'id' then raise exception 'Charge idempotency failed'; end if;
  charge_a := (first_result->>'id')::uuid;
  insert into public.academy_payments(id,academy_id,contact_id,provider,provider_transaction_id,amount,currency,status,created_by)
    values(payment_a,academy_a,contact_a,'manual','invariants-payment',1000,'UZS','paid',actor_a);
  first_result := public.academy_allocate_payment(academy_a,payment_a,charge_a,400,actor_a,'invariants:allocation-1');
  second_result := public.academy_allocate_payment(academy_a,payment_a,charge_a,400,actor_a,'invariants:allocation-1');
  if first_result->>'id' is distinct from second_result->>'id' then raise exception 'Allocation idempotency failed'; end if;
  if (select status from public.academy_charges where id=charge_a)<>'partially_paid' then raise exception 'Partial payment state failed'; end if;
  perform pg_temp.expect_failure('over-allocation',format(
    'select public.academy_allocate_payment(%L,%L,%L,600,%L,%L)',academy_a,payment_a,charge_a,actor_a,'invariants:allocation-too-large'),'Allocation exceeds charge balance');
  perform public.academy_allocate_payment(academy_a,payment_a,charge_a,500,actor_a,'invariants:allocation-2');
  if (select balance from public.academy_account_balances where academy_id=academy_a and contact_id=contact_a and currency='UZS')<>-100 then raise exception 'Overpayment credit was not preserved'; end if;
  perform public.academy_post_account_adjustment(academy_a,contact_a,actor_a,jsonb_build_object('entry_type','refund','amount',50,'currency','UZS','reason','Approved refund'),'invariants:refund');
  perform pg_temp.expect_failure('immutable ledger update',format(
    'update public.academy_account_ledger_entries set amount=999 where academy_id=%L and idempotency_key=%L',academy_a,'invariants:refund'),'immutable');

  first_result := public.academy_manage_subscription(academy_a,subscription_a,actor_a,'freeze',jsonb_build_object('starts_on',current_date,'ends_on',current_date+7,'reason','Illness pause'),'invariants:freeze');
  second_result := public.academy_manage_subscription(academy_a,subscription_a,actor_a,'freeze',jsonb_build_object('starts_on',current_date,'ends_on',current_date+7,'reason','Illness pause'),'invariants:freeze');
  if first_result->'freeze'->>'id' is distinct from second_result->'freeze'->>'id' then raise exception 'Freeze idempotency failed'; end if;
  perform public.academy_manage_subscription(academy_a,subscription_a,actor_a,'resume','{}','invariants:resume');
  first_result := public.academy_manage_subscription(academy_a,subscription_a,actor_a,'renew',jsonb_build_object('starts_on',current_date+31,'ends_on',current_date+61,'reason','Renewed'),'invariants:renew');
  second_result := public.academy_manage_subscription(academy_a,subscription_a,actor_a,'renew',jsonb_build_object('starts_on',current_date+31,'ends_on',current_date+61,'reason','Renewed'),'invariants:renew');
  if first_result->'renewal'->>'id' is distinct from second_result->'renewal'->>'id' then raise exception 'Renewal idempotency failed'; end if;

  insert into public.academy_lesson_deliveries(academy_id,branch_id,classroom_id,staff_id,delivered_on,duration_minutes,delivery_status,student_count,idempotency_key)
    values(academy_a,branch_a,classroom_a,staff_a,current_date,60,'delivered',1,'invariants:delivery');
  insert into public.academy_compensation_rules(academy_id,staff_id,branch_id,rule_type,name,unit_rate,effective_from,created_by)
    values(academy_a,staff_a,branch_a,'per_lesson','Per lesson',200,current_date-1,actor_a);
  first_result := public.academy_create_payroll_period(academy_a,actor_a,jsonb_build_object('branch_id',branch_a,'period_start',current_date-1,'period_end',current_date+1),'invariants:payroll-period');
  payroll_period := (first_result->>'id')::uuid;
  perform public.academy_calculate_payroll(academy_a,payroll_period,actor_a,'invariants:payroll-calc');
  perform public.academy_calculate_payroll(academy_a,payroll_period,actor_a,'invariants:payroll-calc');
  select count(*) into row_count from public.academy_payroll_rows where academy_id=academy_a and payroll_period_id=payroll_period;
  select id into payroll_row from public.academy_payroll_rows where academy_id=academy_a and payroll_period_id=payroll_period limit 1;
  if row_count<>1 then raise exception 'Payroll duplicate rows were generated'; end if;
  perform pg_temp.expect_failure('invalid payroll transition',format(
    'select public.academy_transition_payroll(%L,%L,%L,%L,%L::jsonb,%L)',academy_a,payroll_period,actor_a,'paid','{"payment_method":"cash"}','invariants:payroll-invalid'),'Invalid payroll transition');
  perform pg_temp.expect_failure('immutable payroll snapshot',format(
    'update public.academy_payroll_rows set generated_amount=999 where id=%L',payroll_row),'immutable');
  perform public.academy_transition_payroll(academy_a,payroll_period,actor_a,'reviewed','{}','invariants:payroll-reviewed');
  perform public.academy_transition_payroll(academy_a,payroll_period,actor_a,'approved','{}','invariants:payroll-approved');
  perform public.academy_transition_payroll(academy_a,payroll_period,actor_a,'paid','{"payment_method":"cash","payment_reference":"PAY-1"}','invariants:payroll-paid');

  insert into public.academy_automation_rules(id,academy_id,rule_key,name,is_active,lifecycle_status,created_by)
    values(rule_id,academy_a,'manual-follow-up','Manual follow-up',true,'draft',actor_a);
  first_result := public.academy_create_automation_version(academy_a,rule_id,actor_a,jsonb_build_object(
    'trigger_key','manual','condition_tree',jsonb_build_object('all',jsonb_build_array()),
    'actions',jsonb_build_array(jsonb_build_object('type','create_task','payload',jsonb_build_object('title','Follow up'))),
    'safeguard_mode','standard','status','active'),'invariants:automation-version');
  version_id := (first_result->>'id')::uuid;
  first_result := public.academy_begin_automation_execution(academy_a,version_id,actor_a,jsonb_build_object('trigger_key','manual','subject_type','contact','subject_id',contact_a),'invariants:automation-execution');
  second_result := public.academy_begin_automation_execution(academy_a,version_id,actor_a,jsonb_build_object('trigger_key','manual','subject_type','contact','subject_id',contact_a),'invariants:automation-execution');
  if first_result->>'id' is distinct from second_result->>'id' then raise exception 'Automation execution idempotency failed'; end if;
  execution_id := (first_result->>'id')::uuid;
  if (select count(*) from public.academy_automation_executions where academy_id=academy_a and id=execution_id)<>1 then raise exception 'Duplicate automation execution exists'; end if;

  perform pg_temp.expect_failure('cross-tenant guardian relationship',format(
    'select public.academy_create_guardian_relationship(%L,%L,%L::jsonb)',academy_a,actor_a,
    jsonb_build_object('contact_id',contact_b,'full_name','Wrong guardian','phone','+998900000099','relationship_type','mother')::text),'foreign key');
  guardian_result := public.academy_create_guardian_relationship(academy_a,actor_a,jsonb_build_object(
    'contact_id',contact_a,'full_name','Parent A','phone','+998900000001','relationship_type','mother','can_view_payments',true,'can_view_debt',true));
  relationship_id := (guardian_result->'relationship'->>'id')::uuid;
  link_result := public.academy_issue_guardian_link(academy_a,relationship_id,actor_a,now()+interval '1 day','telegram_guardian_link');
  token := link_result->>'token';
  perform public.academy_claim_guardian_link(token,guardian_user,'900001','900001','parent_a');
  perform pg_temp.expect_failure('reused guardian token',format(
    'select public.academy_claim_guardian_link(%L,%L,%L,%L,%L)',token,guardian_user,'900001','900001','parent_a'),'invalid, expired, used, or revoked');
  guardian_result := public.academy_create_guardian_relationship(academy_a,actor_a,jsonb_build_object(
    'contact_id',contact_a,'full_name','Expired Parent','phone','+998900000002','relationship_type','father'));
  relationship_id := (guardian_result->'relationship'->>'id')::uuid;
  link_result := public.academy_issue_guardian_link(academy_a,relationship_id,actor_a,now()-interval '1 minute','telegram_guardian_link');
  perform pg_temp.expect_failure('expired guardian token',format(
    'select public.academy_claim_guardian_link(%L,%L,%L,%L,%L)',link_result->>'token',actor_b,'900002','900002','expired_parent'),'invalid, expired, used, or revoked');

  select array_agg(c.relname order by c.relname) into unsafe_tables
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relname like 'academy_%' and not c.relrowsecurity;
  if cardinality(coalesce(unsafe_tables,array[]::text[]))>0 then raise exception 'Academy tables without RLS: %',unsafe_tables; end if;
end;
$$;

-- RLS must hide representative business records from another academy owner.
set local role authenticated;
select set_config('request.jwt.claim.sub','f2000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$
declare leaked integer;
begin
  select
    (select count(*) from public.academy_contacts where academy_id='f2000000-0000-0000-0000-000000000011')+
    (select count(*) from public.academy_classrooms where academy_id='f2000000-0000-0000-0000-000000000011')+
    (select count(*) from public.academy_leads where academy_id='f2000000-0000-0000-0000-000000000011')+
    (select count(*) from public.academy_payments where academy_id='f2000000-0000-0000-0000-000000000011')+
    (select count(*) from public.academy_guardians where academy_id='f2000000-0000-0000-0000-000000000011')
  into leaked;
  if leaked<>0 then raise exception 'Cross-academy RLS leak count: %',leaked; end if;
end;
$$;

-- A branch-scoped specialist must use the branch-filtering service layer and
-- must not gain academy-wide direct PostgREST visibility through broad helpers.
select set_config('request.jwt.claim.sub','f2000000-0000-0000-0000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"f2000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
do $$
declare leaked integer;
begin
  select
    (select count(*) from public.academy_leads where academy_id='f2000000-0000-0000-0000-000000000010')+
    (select count(*) from public.academy_pricing_plans where academy_id='f2000000-0000-0000-0000-000000000010')+
    (select count(*) from public.academy_import_jobs where academy_id='f2000000-0000-0000-0000-000000000010')
  into leaked;
  if leaked<>0 then raise exception 'Scoped role received academy-wide direct table access: %',leaked; end if;
end;
$$;
select pg_temp.expect_failure('authenticated caller invokes finance service',
  $$select public.academy_allocate_payment('f2000000-0000-0000-0000-000000000010','f2000000-0000-0000-0000-000000000080','00000000-0000-0000-0000-000000000000',1,'f2000000-0000-0000-0000-000000000001','forbidden')$$,
  'permission denied');
reset role;

do $$ begin raise notice 'ACADEMY_BUSINESS_OS_INVARIANTS_OK'; end $$;
rollback;
