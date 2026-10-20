-- Percentage compensation uses collected, allocated tuition rather than bills.
-- Existing calculated/approved periods remain immutable historical snapshots.
begin;
create or replace function public.academy_assert_current_capability(p_academy uuid,p_actor uuid,p_capability text,p_scope jsonb)
returns void language plpgsql set search_path=public as $$
begin
 if not public.academy_command_covers(public.academy_current_authorities(p_academy,p_actor),p_capability,p_scope) then
  raise exception using errcode='42501',message='Current access does not cover this financial resource';end if;
end;$$;
revoke all on function public.academy_assert_current_capability(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;

create or replace function public.academy_payroll_collected_inputs(p_academy uuid,p_staff uuid,p_branch uuid,p_start date,p_end date,p_currency text)
returns jsonb language sql stable set search_path=public as $$
 with deliveries as materialized(
  select d.id,d.classroom_id,d.duration_minutes from public.academy_lesson_deliveries d
   where d.academy_id=p_academy and d.staff_id=p_staff and d.delivered_on between p_start and p_end
    and d.delivery_status in('delivered','substituted','make_up') and(p_branch is null or d.branch_id=p_branch)
 ), students as materialized(
  select distinct m.contact_id from public.academy_classroom_memberships m join public.academy_classrooms c on c.academy_id=m.academy_id and c.id=m.classroom_id
   join public.academy_branches b on b.academy_id=c.academy_id and b.id=c.branch_id
   where m.academy_id=p_academy and m.role='student' and m.status='active'
    and(m.joined_at at time zone b.timezone)::date<=p_end
    and m.classroom_id in(select classroom_id from deliveries)
 ), collections as materialized(
  select a.id,case when a.allocation_kind='application' then a.amount else -a.amount end amount
   from public.academy_payment_allocations a join public.academy_payments p on p.academy_id=a.academy_id and p.id=a.payment_id
   join public.academy_charges c on c.academy_id=a.academy_id and c.id=a.charge_id
   join public.academy_classrooms k on k.academy_id=c.academy_id and k.id=c.classroom_id
   join public.academy_branches b on b.academy_id=k.academy_id and b.id=k.branch_id
   where a.academy_id=p_academy and a.currency=p_currency and p.currency=p_currency and c.currency=p_currency and p.status='paid'
    and(a.allocated_at at time zone b.timezone)::date between p_start and p_end
    and(p_branch is null or k.branch_id=p_branch) and c.classroom_id in(select classroom_id from deliveries)
 ) select jsonb_build_object('lessons',(select count(*) from deliveries),'minutes',(select coalesce(sum(duration_minutes),0) from deliveries),
  'students',(select count(*) from students),'collected_revenue',(select greatest(coalesce(sum(amount),0),0)::text from collections),
  'revenue_basis','net_paid_allocations','basis_date','allocation date in classroom branch timezone',
  'delivery_ids',(select coalesce(jsonb_agg(id order by id),'[]') from deliveries),
  'allocation_ids',(select coalesce(jsonb_agg(id order by id),'[]') from collections));
$$;
revoke all on function public.academy_payroll_collected_inputs(uuid,uuid,uuid,date,date,text) from public,anon,authenticated,service_role;
alter table public.academy_compensation_rules drop constraint academy_compensation_rules_rule_type_check;
alter table public.academy_compensation_rules add constraint academy_compensation_rules_rule_type_check
 check(rule_type in('fixed_monthly','per_lesson','per_teaching_hour','per_student','base_plus_student','percentage_group_revenue','fixed_commission','fixed_performance_bonus','tiered_rate','manual_custom_adjustment'));

CREATE OR REPLACE FUNCTION "public"."academy_calculate_payroll"("p_academy_id" "uuid", "p_period_id" "uuid", "p_actor_id" "uuid", "p_idempotency_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_period public.academy_payroll_periods%rowtype;v_rule public.academy_compensation_rules%rowtype;v_lessons int;v_minutes int;v_students int;v_revenue bigint;v_amount bigint;v_row public.academy_payroll_rows%rowtype;v_count int:=0;v_inputs jsonb;v_scope jsonb;v_branch uuid;
begin
 perform public.academy_current_authorities(p_academy_id,p_actor_id);
 select branch_id into v_branch from public.academy_payroll_periods where academy_id=p_academy_id and id=p_period_id;
 v_scope:=case when v_branch is null then '{"kind":"academy"}'::jsonb else public.academy_command_resource(p_academy_id,'branch',v_branch) end;
 perform public.academy_assert_current_capability(p_academy_id,p_actor_id,'calculatePayroll',v_scope);
 select * into v_period from public.academy_payroll_periods where academy_id=p_academy_id and id=p_period_id for update;if not found then raise exception 'Payroll period not found';end if;
 if v_period.branch_id is distinct from v_branch then raise exception using errcode='23505',message='Payroll branch changed';end if;
 perform public.academy_assert_current_capability(p_academy_id,p_actor_id,'calculatePayroll',v_scope);
 if v_period.status='calculated' and exists(select 1 from public.academy_payroll_rows where academy_id=p_academy_id and payroll_period_id=p_period_id) then return jsonb_build_object('period',to_jsonb(v_period),'row_count',(select count(*) from public.academy_payroll_rows where academy_id=p_academy_id and payroll_period_id=p_period_id));end if;
 if v_period.status<>'draft' then raise exception 'Only a draft payroll period can be calculated';end if;
 if v_period.branch_id is not null and exists(select 1 from public.academy_compensation_rules r where r.academy_id=p_academy_id and r.branch_id is null and r.is_active and r.currency=v_period.currency and r.effective_from<=v_period.period_end and(r.effective_to is null or r.effective_to>=v_period.period_start)) then
  raise exception using errcode='22023',message='Academy-wide compensation rules require an academy-wide payroll period';end if;
 for v_rule in select * from public.academy_compensation_rules r where r.academy_id=p_academy_id and r.is_active and r.currency=v_period.currency and r.effective_from<=v_period.period_end and (r.effective_to is null or r.effective_to>=v_period.period_start) and (v_period.branch_id is null or r.branch_id is null or r.branch_id=v_period.branch_id) loop
  v_inputs:=public.academy_payroll_collected_inputs(p_academy_id,v_rule.staff_id,coalesce(v_rule.branch_id,v_period.branch_id),greatest(v_period.period_start,v_rule.effective_from),least(v_period.period_end,coalesce(v_rule.effective_to,v_period.period_end)),v_rule.currency);
  v_lessons:=(v_inputs->>'lessons')::integer;v_minutes:=(v_inputs->>'minutes')::integer;v_students:=(v_inputs->>'students')::integer;v_revenue:=(v_inputs->>'collected_revenue')::bigint;
  v_amount:=case v_rule.rule_type when 'fixed_monthly' then v_rule.fixed_amount when 'per_lesson' then v_lessons*v_rule.unit_rate when 'per_teaching_hour' then round((v_minutes::numeric/60)*v_rule.unit_rate)::bigint when 'base_plus_student' then v_rule.fixed_amount+v_students::numeric*v_rule.unit_rate when 'per_student' then v_students::numeric*v_rule.unit_rate when 'percentage_group_revenue' then round(v_revenue*v_rule.percentage_basis_points::numeric/10000)::bigint when 'fixed_commission' then v_rule.fixed_amount+round(v_revenue*v_rule.percentage_basis_points::numeric/10000)::bigint when 'fixed_performance_bonus' then v_rule.fixed_amount+v_rule.performance_bonus when 'tiered_rate' then v_lessons*public.academy_compensation_tier_rate(v_rule.tiers,v_lessons,v_rule.unit_rate) when 'manual_custom_adjustment' then 0 else 0 end;
  insert into public.academy_payroll_rows(academy_id,payroll_period_id,staff_id,branch_id,compensation_rule_id,lessons_delivered,minutes_delivered,relevant_students,generated_revenue,generated_amount,currency,rule_snapshot,inputs_snapshot,calculation_version)
  values(p_academy_id,p_period_id,v_rule.staff_id,coalesce(v_rule.branch_id,v_period.branch_id),v_rule.id,v_lessons,v_minutes,v_students,v_revenue,v_amount,v_rule.currency,to_jsonb(v_rule)-'metadata',v_inputs||jsonb_build_object('generated_revenue',v_revenue::text,'period_start',v_period.period_start,'period_end',v_period.period_end),'collected_v2') returning * into v_row;
  if v_rule.rule_type='per_lesson' then
   insert into public.academy_payroll_row_components(academy_id,payroll_row_id,classroom_id,component_type,quantity,rate,amount,source_snapshot)
   select p_academy_id,v_row.id,d.classroom_id,v_rule.rule_type,count(*),v_rule.unit_rate,count(*)*v_rule.unit_rate,jsonb_build_object('rule_version',v_rule.version)
   from public.academy_lesson_deliveries d where d.academy_id=p_academy_id and d.staff_id=v_rule.staff_id and d.delivered_on between greatest(v_period.period_start,v_rule.effective_from) and least(v_period.period_end,coalesce(v_rule.effective_to,v_period.period_end)) and d.delivery_status in('delivered','substituted','make_up') and(coalesce(v_rule.branch_id,v_period.branch_id) is null or d.branch_id=coalesce(v_rule.branch_id,v_period.branch_id)) group by d.classroom_id;
  elsif v_rule.rule_type='per_teaching_hour' then
   insert into public.academy_payroll_row_components(academy_id,payroll_row_id,classroom_id,component_type,quantity,rate,amount,source_snapshot)
   with groups as(select d.classroom_id,sum(d.duration_minutes)::numeric minutes from public.academy_lesson_deliveries d
    where d.academy_id=p_academy_id and d.staff_id=v_rule.staff_id and d.delivered_on between greatest(v_period.period_start,v_rule.effective_from) and least(v_period.period_end,coalesce(v_rule.effective_to,v_period.period_end))
    and d.delivery_status in('delivered','substituted','make_up') and(coalesce(v_rule.branch_id,v_period.branch_id) is null or d.branch_id=coalesce(v_rule.branch_id,v_period.branch_id)) group by d.classroom_id),
   costs as(select *,floor(minutes*v_rule.unit_rate/60)::bigint cost,row_number() over(order by classroom_id desc) reverse_rank from groups)
   select p_academy_id,v_row.id,classroom_id,v_rule.rule_type,minutes/60,v_rule.unit_rate,
    case when reverse_rank=1 then v_amount-coalesce(sum(cost) filter(where reverse_rank<>1) over(),0) else cost end,
    jsonb_build_object('rule_version',v_rule.version,'rounding','residual assigned to final classroom') from costs;
  else
   insert into public.academy_payroll_row_components(academy_id,payroll_row_id,classroom_id,component_type,quantity,rate,amount,source_snapshot) values(p_academy_id,v_row.id,null,v_rule.rule_type,case when v_rule.rule_type='per_student' then v_students else 1 end,case when v_rule.rule_type in('percentage_group_revenue','fixed_commission') then v_rule.percentage_basis_points else v_rule.unit_rate end,v_amount,jsonb_build_object('rule_version',v_rule.version));
  end if;v_count:=v_count+1;
 end loop;
 update public.academy_payroll_periods set status='calculated',calculated_at=now(),updated_at=now() where academy_id=p_academy_id and id=p_period_id returning * into v_period;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata) values(p_academy_id,p_actor_id,'payroll.calculated','academy_payroll_period',p_period_id::text,jsonb_build_object('row_count',v_count,'calculation_version','collected_v2'));
 insert into public.domain_event_outbox(event_type,event_version,aggregate_type,aggregate_id,user_id,payload,idempotency_key) values('payroll.calculated','v1','academy_payroll_period',p_period_id,p_actor_id,jsonb_build_object('academy_id',p_academy_id,'payroll_period_id',p_period_id,'row_count',v_count),'payroll.calculated:'||p_idempotency_key) on conflict(idempotency_key) do nothing;
 perform public.academy_assert_current_capability(p_academy_id,p_actor_id,'calculatePayroll',v_scope);
 return jsonb_build_object('period',to_jsonb(v_period),'row_count',v_count);
end;$$;



revoke all on function public.academy_calculate_payroll(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.academy_calculate_payroll(uuid,uuid,uuid,text) to service_role;
commit;
