begin;
create or replace function public.academy_finance_read_covers(p_auths jsonb,p_cap text,p_scope jsonb)
returns boolean language sql volatile set search_path=public as $$
 select case when p_cap='workspace' then exists(select 1 from unnest(array['viewEconomics','manageCashier','viewPayroll']) cap where public.academy_command_covers(p_auths,cap,p_scope))
  else public.academy_command_covers(p_auths,p_cap,p_scope) end;
$$;
revoke all on function public.academy_finance_read_covers(jsonb,text,jsonb) from public,anon,authenticated,service_role;

create or replace function public.academy_finance_row_visible(p_academy uuid,p_auths jsonb,p_cap text,p_kind text,p_row jsonb,p_depth integer default 0)
returns boolean language plpgsql stable set search_path=public as $$
declare branch uuid;classroom uuid;contact uuid;value jsonb;scope jsonb;entry record;authority jsonb;allowed boolean:=false;has_context boolean:=false;has_parent boolean:=false;classes uuid[];branches uuid[];
begin
 if p_depth>8 or p_row is null or(p_row?'academy_id' and p_row->>'academy_id'<>p_academy::text) then return false;end if;
 if public.academy_finance_read_covers(p_auths,p_cap,'{"kind":"academy"}') then return true;end if;
 if p_cap='workspace' then
  return public.academy_finance_row_visible(p_academy,p_auths,'viewEconomics',p_kind,p_row,p_depth)
   or public.academy_finance_row_visible(p_academy,p_auths,'manageCashier',p_kind,p_row,p_depth)
   or public.academy_finance_row_visible(p_academy,p_auths,'viewPayroll',p_kind,p_row,p_depth);
 end if;
 if p_kind='academy_expense_categories' or(p_kind='academy_pricing_plans' and p_row->>'branch_id' is null and p_row->>'classroom_id' is null) then
  return exists(select 1 from jsonb_array_elements(p_auths) a where public.academy_command_role_has(a->>'role',p_cap) and(a->>'scope_type'='academy' or jsonb_array_length(a->'scope_ids')>0));
 end if;
 if p_kind='academy_staff' then
  return exists(select 1 from public.academy_classrooms c where c.academy_id=p_academy and(
    coalesce(p_row->'classroom_ids','[]') @> jsonb_build_array(c.id)
    or exists(select 1 from public.academy_lesson_deliveries d where d.academy_id=p_academy and d.staff_id=(p_row->>'id')::uuid and d.classroom_id=c.id))
    and public.academy_command_covers(p_auths,p_cap,jsonb_build_object('kind','classroom','classroom_id',c.id,'branch_id',c.branch_id)))
   or exists(select 1 from public.academy_staff_branch_assignments b where b.academy_id=p_academy and b.staff_id=(p_row->>'id')::uuid
    and public.academy_command_covers(p_auths,p_cap,jsonb_build_object('kind','branch','branch_id',b.branch_id)));
 end if;
 branch:=nullif(p_row->>'branch_id','')::uuid;classroom:=nullif(p_row->>'classroom_id','')::uuid;contact:=nullif(p_row->>'contact_id','')::uuid;
 if p_kind='academy_branches' then branch:=(p_row->>'id')::uuid;end if;
 if p_kind='academy_classrooms' then classroom:=(p_row->>'id')::uuid;end if;
 if p_kind='academy_contacts' then contact:=(p_row->>'id')::uuid;end if;
 if classroom is not null then
  select to_jsonb(c) into value from public.academy_classrooms c where c.academy_id=p_academy and c.id=classroom;
  if value is null or(branch is not null and branch is distinct from(value->>'branch_id')::uuid) then return false;end if;
  branch:=(value->>'branch_id')::uuid;
 end if;
 if contact is not null then
  select to_jsonb(c) into value from public.academy_contacts c where c.academy_id=p_academy and c.id=contact;
  if value is null then return false;end if;
  select array_agg(distinct m.classroom_id),array_agg(distinct c.branch_id) into classes,branches from public.academy_classroom_memberships m
   join public.academy_classrooms c on c.academy_id=m.academy_id and c.id=m.classroom_id where m.academy_id=p_academy and m.contact_id=contact and m.role='student' and m.status in('active','paused','completed');
  scope:=jsonb_build_object('kind','contact','contact_id',contact,'branch_id',value->'primary_branch_id','classroom_ids',coalesce(classes,'{}'),'branch_ids',coalesce(branches,'{}'));
 end if;
 has_context:=branch is not null or classroom is not null or contact is not null;
 for authority in select a from jsonb_array_elements(p_auths) a where public.academy_command_role_has(a->>'role',p_cap) loop
  if authority->>'scope_type'='branches' then
   allowed:=case when branch is not null then authority->'scope_ids' @> jsonb_build_array(branch) when contact is not null then public.academy_command_covers(jsonb_build_array(authority),p_cap,scope) else false end;
  elsif authority->>'scope_type'='classrooms' then
   allowed:=case when classroom is not null then authority->'scope_ids' @> jsonb_build_array(classroom) when contact is not null then public.academy_command_covers(jsonb_build_array(authority),p_cap,scope) else false end;
  elsif authority->>'scope_type'='students' then allowed:=contact is not null and authority->'scope_ids' @> jsonb_build_array(contact);
  end if;
  if allowed then exit;end if;
 end loop;
 -- A branch name is usable when the viewer has a narrower current classroom
 -- or student grant there. This does not authorize the branch's other records.
 if p_kind='academy_branches' and not allowed then
  allowed:=exists(select 1 from public.academy_classrooms c where c.academy_id=p_academy and c.branch_id=branch
   and public.academy_command_covers(p_auths,p_cap,jsonb_build_object('kind','classroom','classroom_id',c.id,'branch_id',branch)));
 end if;
 if has_context and not allowed then return false;end if;
 for entry in select * from jsonb_each_text('{"subscription_id":"academy_subscriptions","charge_id":"academy_charges","payment_id":"academy_payments","academy_payment_id":"academy_payments","debt_case_id":"academy_debt_cases","cashbox_id":"academy_cashboxes","shift_id":"academy_cashier_shifts","payroll_row_id":"academy_payroll_rows","payroll_period_id":"academy_payroll_periods"}'::jsonb) loop
  if nullif(p_row->>entry.key,'') is null then continue;end if;
  -- Periods can include multiple branches; an explicitly branch-attributed
  -- row is the narrower authoritative payroll target.
  if entry.key='payroll_period_id' and(branch is not null or nullif(p_row->>'payroll_row_id','') is not null) then continue;end if;
  execute format('select to_jsonb(t) from public.%I t where academy_id=$1 and id=$2',entry.value) into value using p_academy,(p_row->>entry.key)::uuid;
  if not public.academy_finance_row_visible(p_academy,p_auths,p_cap,entry.value,value,p_depth+1) then return false;end if;has_parent:=true;
 end loop;
 return has_context or has_parent;
end;$$;
revoke all on function public.academy_finance_row_visible(uuid,jsonb,text,text,jsonb,integer) from public,anon,authenticated,service_role;

create or replace function public.academy_command_capability_names() returns text[] language sql immutable as $$select array['viewAcademy','manageAcademy','manageStaff','manageFinance','viewFinance','collectFinance','adjustFinance','refundFinance','discountFinance','reconcileFinance','manageCashier','viewEconomics','viewPayroll','calculatePayroll','approvePayroll','payPayroll','manageOffers','manageBranding','manageAutomation','viewAutomation','viewBranches','manageBranches','viewAdmissions','manageAdmissions','assignAdmissions','exportAdmissions','manageTrialFeedback','viewContacts','manageContacts','viewClassrooms','manageClassrooms','manageRoster','manageMessages','manageAnnouncements','sendGlobalAnnouncements','manageAlerts','resolveAlerts','viewEducationOS','resolveActionItems','manageAssignments','gradeSubmissions','markAttendance','manageSchedule','manageAcademicOperations','viewRoomTimetable','manageGuardians','communicateGuardians','manageRetention','viewBusinessIntelligence','viewAcademicReports','viewOperationalReports','viewFinancialReports','viewStaffPerformance','viewRisk','manageImports','importStudents','manageLocalization','useAcademyAI','manageResources','viewReports','issueCertificates','dispatchNotifications','viewNotifications','viewReferrals','viewAudit']::text[];$$;
revoke all on function public.academy_command_capability_names() from public,anon,authenticated,service_role;

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
