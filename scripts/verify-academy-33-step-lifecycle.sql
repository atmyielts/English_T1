\set ON_ERROR_STOP on
begin;

do $$
declare
  v_actor uuid := 'f1000000-0000-0000-0000-000000000001';
  v_academy uuid := 'f1000000-0000-0000-0000-000000000002';
  v_branch uuid := 'f1000000-0000-0000-0000-000000000003';
  v_classroom uuid := 'f1000000-0000-0000-0000-000000000004';
  v_staff uuid := 'f1000000-0000-0000-0000-000000000005';
  v_pipeline uuid := 'f1000000-0000-0000-0000-000000000006';
  v_stage uuid := 'f1000000-0000-0000-0000-000000000007';
  v_won_stage uuid := 'f1000000-0000-0000-0000-000000000008';
  v_source uuid := 'f1000000-0000-0000-0000-000000000009';
  v_campaign uuid := 'f1000000-0000-0000-0000-000000000010';
  v_lead uuid := 'f1000000-0000-0000-0000-000000000011';
  v_trial uuid := 'f1000000-0000-0000-0000-000000000012';
  v_plan uuid := 'f1000000-0000-0000-0000-000000000013';
  v_payment uuid := 'f1000000-0000-0000-0000-000000000014';
  v_course uuid := 'f1000000-0000-0000-0000-000000000015';
  v_module uuid := 'f1000000-0000-0000-0000-000000000016';
  v_lesson uuid := 'f1000000-0000-0000-0000-000000000017';
  v_assignment uuid := 'f1000000-0000-0000-0000-000000000018';
  v_quiz uuid := 'f1000000-0000-0000-0000-000000000019';
  v_definition uuid := 'f1000000-0000-0000-0000-000000000020';
  v_result jsonb;
  v_contact uuid;
  v_subscription uuid;
  v_charge uuid;
  v_guardian uuid;
  v_relationship uuid;
  v_intervention uuid;
  v_renewal uuid;
  v_left_renewal uuid;
  v_events text[];
  v_required text[] := array[
    'lead.created','lead.contacted','lead.follow_up_scheduled','trial.booked','trial.attended',
    'trial.feedback_recorded','trial.converted','lead.converted','student.group_joined','guardian.connected',
    'subscription.created','payment.collected','entitlement.activated','attendance.recorded',
    'learning.curriculum_accessed','learning.assignment_submitted','learning.assessment_completed',
    'learning.grade_recorded','guardian.update_queued','attendance.absence_recorded',
    'retention.risk_detected','retention.intervention_created','retention.intervention_outcome_recorded',
    'renewal.started','renewal.renewed','renewal.left'
  ];
begin
  insert into auth.users(id,email,created_at,updated_at)
  values(v_actor,'academy-journey@local.invalid',now(),now());
  update public.users set full_name='Journey Operator' where id=v_actor;

  insert into public.tenants(id,name,slug,type,created_by,metadata)
  values(v_academy,'Lifecycle Proof Academy','lifecycle-proof-academy','org',v_actor,'{"service_family":"academy"}');
  insert into public.academy_branches(id,academy_id,branch_key,name,is_default,created_by)
  values(v_branch,v_academy,'main','Main branch',true,v_actor);
  insert into public.academy_classrooms(id,academy_id,branch_id,name,student_capacity,created_by)
  values(v_classroom,v_academy,v_branch,'IELTS Evening',20,v_actor);
  insert into public.academy_staff(id,academy_id,user_id,email,display_name,role,classroom_ids,created_by)
  values(v_staff,v_academy,v_actor,'academy-journey@local.invalid','Journey Teacher','teacher',jsonb_build_array(v_classroom),v_actor);

  insert into public.academy_sales_pipelines(id,academy_id,pipeline_key,name_i18n,is_default,created_by)
  values(v_pipeline,v_academy,'admissions','{"en":"Admissions"}',true,v_actor);
  insert into public.academy_pipeline_stages(id,academy_id,pipeline_id,stage_key,label_i18n,position,probability_percent)
  values(v_stage,v_academy,v_pipeline,'new','{"en":"New"}',10,10),
        (v_won_stage,v_academy,v_pipeline,'won','{"en":"Won"}',90,100);
  update public.academy_pipeline_stages set terminal_kind='won' where id=v_won_stage;
  insert into public.academy_lead_sources(id,academy_id,source_key,label_i18n,category,created_by)
  values(v_source,v_academy,'instagram','{"en":"Instagram"}','social',v_actor);
  insert into public.academy_marketing_campaigns(id,academy_id,source_id,campaign_key,name_i18n,status,created_by)
  values(v_campaign,v_academy,v_source,'instagram-august','{"en":"Instagram August"}','active',v_actor);

  insert into public.academy_leads(
    id,academy_id,branch_id,pipeline_id,current_stage_id,source_id,campaign_id,assigned_user_id,
    full_name,phone,interested_course,expected_price,campaign,status,idempotency_key,created_by,updated_by
  ) values(
    v_lead,v_academy,v_branch,v_pipeline,v_stage,v_source,v_campaign,v_actor,
    'Aziza Karimova','+998901234567','IELTS',1200000,'instagram-august','open','journey:lead',v_actor,v_actor
  );
  insert into public.academy_lead_activities(academy_id,lead_id,activity_type,method,status,assigned_user_id,completed_at,outcome,idempotency_key,created_by)
  values(v_academy,v_lead,'telegram','telegram','completed',v_actor,now(),'Interested','journey:contacted',v_actor);
  insert into public.academy_lead_activities(academy_id,lead_id,activity_type,method,status,assigned_user_id,due_at,idempotency_key,created_by)
  values(v_academy,v_lead,'follow_up','call','planned',v_actor,now()+interval '1 day','journey:follow-up',v_actor);
  insert into public.academy_trial_lessons(id,academy_id,lead_id,branch_id,classroom_id,teacher_user_id,starts_at,ends_at,status,idempotency_key,created_by,updated_by)
  values(v_trial,v_academy,v_lead,v_branch,v_classroom,v_actor,now()+interval '1 hour',now()+interval '2 hours','scheduled','journey:trial',v_actor,v_actor);
  update public.academy_trial_lessons set status='attended',attendance_marked_at=now(),updated_at=now() where id=v_trial;
  update public.academy_trial_lessons set feedback='Strong speaking potential',recommended_level='B1',next_step='Enroll',updated_at=now()+interval '1 second' where id=v_trial;

  insert into public.academy_pricing_plans(id,academy_id,branch_id,classroom_id,plan_key,name,pricing_model,billing_cycle,base_amount,created_by)
  values(v_plan,v_academy,v_branch,v_classroom,'ielts-monthly','IELTS Monthly','monthly_fixed','monthly',1200000,v_actor);
  v_result := public.academy_convert_lead_full(v_academy,v_lead,v_actor,jsonb_build_object(
    'classroom_id',v_classroom,'trial_id',v_trial,
    'guardian',jsonb_build_object('full_name','Malika Karimova','phone','+998909876543','relationship_type','mother','is_primary_contact',true),
    'subscription',jsonb_build_object('pricing_plan_id',v_plan,'branch_id',v_branch,'classroom_id',v_classroom,'status','active','starts_on',current_date,'ends_on',current_date+interval '30 days'),
    'charge',jsonb_build_object('create',true,'due_on',current_date,'description','First month')
  ),'journey:convert');
  v_contact := (v_result->>'contact_id')::uuid;
  v_subscription := (v_result->'subscription'->>'id')::uuid;
  v_charge := (v_result->'charge'->>'id')::uuid;
  v_guardian := (v_result->'guardian'->'guardian'->>'id')::uuid;
  v_relationship := (v_result->'guardian'->'relationship'->>'id')::uuid;

  insert into public.academy_payments(id,academy_id,contact_id,provider,provider_transaction_id,amount,currency,status,created_by)
  values(v_payment,v_academy,v_contact,'manual','journey-payment',1200000,'UZS','paid',v_actor);
  perform public.academy_allocate_payment(v_academy,v_payment,v_charge,1200000,v_actor,'journey:allocation');
  insert into public.academy_entitlements(academy_id,contact_id,payment_id,grant_type,resource_type,resource_id,status,source)
  values(v_academy,v_contact,v_payment,'subscription','classroom',v_classroom,'active','payment');
  insert into public.academy_attendance(academy_id,classroom_id,contact_id,session_date,status,marked_by)
  values(v_academy,v_classroom,v_contact,current_date,'present',v_actor);

  insert into public.academy_courses(id,academy_id,code,title,status,published_at,created_by)
  values(v_course,v_academy,'IELTS-B1','IELTS B1','published',now(),v_actor);
  insert into public.academy_course_modules(id,academy_id,course_id,title,position,status,created_by)
  values(v_module,v_academy,v_course,'Writing Foundations',1,'published',v_actor);
  insert into public.academy_lessons(id,academy_id,course_id,module_id,title,content,position,status,created_by)
  values(v_lesson,v_academy,v_course,v_module,'Task 1 structure','{"type":"doc","content":[]}',1,'published',v_actor);
  insert into public.academy_lesson_progress(academy_id,classroom_id,course_id,lesson_id,contact_id,status,started_at)
  values(v_academy,v_classroom,v_course,v_lesson,v_contact,'in_progress',now());
  insert into public.academy_assignments(id,academy_id,classroom_id,course_id,module_id,lesson_id,title,max_score,status,created_by)
  values(v_assignment,v_academy,v_classroom,v_course,v_module,v_lesson,'Write a Task 1 overview',100,'active',v_actor);
  insert into public.academy_submissions(academy_id,assignment_id,classroom_id,contact_id,status,submission_content,max_score)
  values(v_academy,v_assignment,v_classroom,v_contact,'submitted','Student answer',100);
  update public.academy_submissions set status='graded',score=82,graded_by=v_actor,graded_at=now(),feedback=jsonb_build_object('comment','Clear overview'),updated_at=now()+interval '1 second'
    where academy_id=v_academy and assignment_id=v_assignment and contact_id=v_contact;
  insert into public.academy_quizzes(id,academy_id,course_id,lesson_id,title,status,created_by)
  values(v_quiz,v_academy,v_course,v_lesson,'Task 1 concepts','published',v_actor);
  insert into public.academy_quiz_attempts(academy_id,classroom_id,course_id,quiz_id,contact_id,attempt_number,status,answers,result,score,max_score,percentage,passed,submitted_at)
  values(v_academy,v_classroom,v_course,v_quiz,v_contact,1,'submitted','{}','{}',8,10,80,true,now());
  insert into public.academy_notifications(academy_id,contact_id,guardian_id,relationship_id,event_key,dedupe_key,channel,type,title,body,status)
  values(v_academy,v_contact,v_guardian,v_relationship,'weekly_progress','journey:guardian-update','inapp','progress','Weekly progress','Aziza scored 82.','queued');

  insert into public.academy_lesson_deliveries(academy_id,branch_id,classroom_id,staff_id,delivered_on,duration_minutes,delivery_status,student_count,idempotency_key)
  values(v_academy,v_branch,v_classroom,v_staff,current_date,90,'delivered',1,'journey:delivery');
  insert into public.academy_attendance(academy_id,classroom_id,contact_id,session_date,status,marked_by)
  values(v_academy,v_classroom,v_contact,current_date+1,'absent',v_actor);

  insert into public.academy_risk_definitions(id,academy_id,definition_key,version,name,status,explanation,created_by)
  values(v_definition,v_academy,'retention',1,'Retention risk','active','Attendance, homework, debt, and engagement',v_actor);
  insert into public.academy_risk_evaluations(academy_id,contact_id,definition_id,score,risk_level,summary,factors,evaluated_by,idempotency_key)
  values(v_academy,v_contact,v_definition,88,'critical','Missed class and declining engagement','[{"factor":"attendance","contribution":40},{"factor":"engagement","contribution":48}]',v_actor,'journey:risk');
  insert into public.academy_intervention_cases(academy_id,contact_id,risk_evaluation_id,status,priority,assigned_to,next_follow_up_at,created_by)
  values(v_academy,v_contact,(select id from public.academy_risk_evaluations where academy_id=v_academy and idempotency_key='journey:risk'),'open','critical',v_actor,now()+interval '1 day',v_actor)
  returning id into v_intervention;
  insert into public.academy_intervention_activities(academy_id,case_id,activity_type,note,outcome,next_follow_up_at,performed_by)
  values(v_academy,v_intervention,'guardian_contact','Admin called student and parent','Study plan agreed',now()+interval '7 days',v_actor);
  update public.academy_intervention_cases set status='resolved',outcome='retained',outcome_reason='Schedule adjusted and guardian engaged',closed_at=now(),updated_at=now()+interval '1 second' where id=v_intervention;

  insert into public.academy_renewal_opportunities(academy_id,contact_id,subscription_id,classroom_id,renewal_due_on,status,likelihood,expected_amount,currency,assigned_to,next_action_at,created_by)
  values(v_academy,v_contact,v_subscription,v_classroom,current_date+7,'identified',75,1200000,'UZS',v_actor,now()+interval '1 day',v_actor)
  returning id into v_renewal;
  insert into public.academy_renewal_activities(academy_id,opportunity_id,activity_type,note,next_action_at,performed_by)
  values(v_academy,v_renewal,'offer','Renewal offer sent',now()+interval '2 days',v_actor);
  update public.academy_renewal_opportunities set status='renewed',outcome_reason='Accepted monthly renewal',renewed_subscription_id=v_subscription,updated_at=now()+interval '1 second' where id=v_renewal;
  insert into public.academy_renewal_opportunities(academy_id,contact_id,subscription_id,classroom_id,renewal_due_on,status,expected_amount,currency,created_by)
  values(v_academy,v_contact,v_subscription,v_classroom,current_date+37,'identified',1200000,'UZS',v_actor) returning id into v_left_renewal;
  update public.academy_renewal_opportunities set status='declined',outcome_reason='Relocated',updated_at=now()+interval '1 second' where id=v_left_renewal;

  select array_agg(distinct event_key) into v_events from public.academy_student_lifecycle_events where academy_id=v_academy;
  if not (v_required <@ coalesce(v_events,array[]::text[])) then
    raise exception 'Missing lifecycle evidence: %', array(select unnest(v_required) except select unnest(coalesce(v_events,array[]::text[])));
  end if;
  if not exists(select 1 from public.academy_lead_conversions where academy_id=v_academy and lead_id=v_lead and source_id=v_source and salesperson_user_id=v_actor) then raise exception 'Attribution or salesperson evidence missing'; end if;
  if not exists(select 1 from public.academy_business_dashboard_v2 where academy_id=v_academy and collected_revenue=1200000 and payroll_total is not null) then raise exception 'Owner revenue and cost metrics missing'; end if;
  if not exists(select 1 from public.academy_lesson_deliveries where academy_id=v_academy and staff_id=v_staff and delivery_status='delivered' and duration_minutes=90) then raise exception 'Salary accrual lesson evidence missing'; end if;
  if not exists(select 1 from public.academy_intervention_activities where academy_id=v_academy and case_id=v_intervention and outcome='Study plan agreed') then raise exception 'Admin intervention contact/outcome missing'; end if;
  if not exists(select 1 from public.academy_renewal_activities where academy_id=v_academy and opportunity_id=v_renewal) then raise exception 'Renewal workflow activity missing'; end if;
  if not exists(select 1 from public.academy_student_lifecycle_summary where academy_id=v_academy and contact_id=v_contact and has_renewed and has_left) then raise exception 'Retention outcome summary missing'; end if;

  raise notice 'ACADEMY_33_STEP_LIFECYCLE_OK academy=% contact=% events=%',v_academy,v_contact,cardinality(v_events);
end
$$;

rollback;
