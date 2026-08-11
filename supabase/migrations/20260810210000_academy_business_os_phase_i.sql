-- Education Business OS Phase I: attribution, governed metrics, performance evidence, and unified intelligence.

create table public.academy_marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete restrict,
  source_id uuid,
  campaign_key text not null,
  name_i18n jsonb not null default '{}'::jsonb check (jsonb_typeof(name_i18n) = 'object'),
  starts_on date,
  ends_on date,
  budget_amount bigint check (budget_amount is null or budget_amount >= 0),
  currency text not null default 'UZS',
  external_provider text,
  external_campaign_id text,
  status text not null default 'active' check (status in ('draft','active','paused','completed','cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(academy_id, id),
  unique(academy_id, campaign_key),
  foreign key(academy_id, source_id) references public.academy_lead_sources(academy_id, id) on delete restrict,
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

alter table public.academy_leads
  add column if not exists campaign_id uuid,
  add column if not exists interested_course_id uuid;
alter table public.academy_leads
  add constraint academy_leads_campaign_fk foreign key(academy_id, campaign_id)
  references public.academy_marketing_campaigns(academy_id, id) on delete restrict;
alter table public.academy_leads
  add constraint academy_leads_interested_course_fk foreign key(academy_id, interested_course_id)
  references public.academy_courses(academy_id, id) on delete restrict;

alter table public.academy_trial_lessons
  add column if not exists recommended_course_id uuid,
  add column if not exists offer_id uuid;
alter table public.academy_trial_lessons
  add constraint academy_trial_recommended_course_fk foreign key(academy_id, recommended_course_id)
  references public.academy_courses(academy_id, id) on delete restrict;
alter table public.academy_trial_lessons
  add constraint academy_trial_offer_fk foreign key(academy_id, offer_id)
  references public.academy_offers(academy_id, id) on delete restrict;

alter table public.academy_classrooms add column if not exists branch_id uuid;
alter table public.academy_contacts add column if not exists primary_branch_id uuid;

update public.academy_classrooms c set branch_id = coalesce(
  (select s.branch_id from public.academy_subscriptions s where s.academy_id=c.academy_id and s.classroom_id=c.id and s.branch_id is not null order by s.created_at limit 1),
  (select b.id from public.academy_branches b where b.academy_id=c.academy_id order by b.is_default desc,b.created_at limit 1)
) where branch_id is null;

update public.academy_contacts c set primary_branch_id = coalesce(
  (select s.branch_id from public.academy_subscriptions s where s.academy_id=c.academy_id and s.contact_id=c.id and s.branch_id is not null order by s.created_at desc limit 1),
  (select b.id from public.academy_branches b where b.academy_id=c.academy_id order by b.is_default desc,b.created_at limit 1)
) where primary_branch_id is null;

create or replace function public.academy_fill_classroom_branch()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.branch_id is null then
    select id into new.branch_id from public.academy_branches
      where academy_id=new.academy_id and is_default order by created_at limit 1;
  end if;
  if new.branch_id is null then raise exception 'Academy default branch is required'; end if;
  return new;
end;
$$;
create trigger academy_classrooms_fill_branch before insert or update of academy_id,branch_id on public.academy_classrooms
  for each row execute function public.academy_fill_classroom_branch();

create or replace function public.academy_fill_contact_branch()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.primary_branch_id is null then
    select id into new.primary_branch_id from public.academy_branches
      where academy_id=new.academy_id and is_default order by created_at limit 1;
  end if;
  if new.primary_branch_id is null then raise exception 'Academy default branch is required'; end if;
  return new;
end;
$$;
create trigger academy_contacts_fill_branch before insert or update of academy_id,primary_branch_id on public.academy_contacts
  for each row execute function public.academy_fill_contact_branch();

alter table public.academy_classrooms alter column branch_id set not null;
alter table public.academy_contacts alter column primary_branch_id set not null;
alter table public.academy_classrooms add constraint academy_classrooms_branch_fk
  foreign key(academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict;
alter table public.academy_contacts add constraint academy_contacts_primary_branch_fk
  foreign key(academy_id, primary_branch_id) references public.academy_branches(academy_id, id) on delete restrict;
create index academy_classrooms_branch_idx on public.academy_classrooms(academy_id, branch_id, is_active);
create index academy_contacts_branch_idx on public.academy_contacts(academy_id, primary_branch_id, status);

create table public.academy_metric_definitions (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid references public.tenants(id) on delete restrict,
  metric_key text not null,
  version integer not null default 1 check (version > 0),
  name_i18n jsonb not null,
  description_i18n jsonb not null,
  formula text not null,
  grain text not null,
  unit text not null,
  source_tables text[] not null,
  caveats text,
  status text not null default 'active' check (status in ('draft','active','retired')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique nulls not distinct(academy_id, metric_key, version),
  unique(academy_id, id)
);

insert into public.academy_metric_definitions(
  academy_id,metric_key,name_i18n,description_i18n,formula,grain,unit,source_tables,caveats
) values
  (null,'collection_rate','{"uz":"Undirish darajasi","ru":"Уровень сбора","en":"Collection rate"}',
    '{"uz":"To\u02bblangan va hisoblangan tushum nisbati","ru":"Отношение собранной суммы к начисленной","en":"Collected amount divided by issued net charges"}',
    'paid payment allocations / net issued charges * 100','academy_period','percent',array['academy_payment_allocations','academy_charges'],'Excludes unapplied cash until allocated'),
  (null,'classroom_fill_rate','{"uz":"Guruh to\u02bblishi","ru":"Заполняемость группы","en":"Classroom fill rate"}',
    '{"uz":"Faol o\u02bbquvchilar va sig\u02bbim nisbati","ru":"Активные ученики к вместимости","en":"Active student memberships divided by configured capacity"}',
    'active student memberships / student_capacity * 100','classroom_current','percent',array['academy_classroom_memberships','academy_classrooms'],'Null when capacity is not configured'),
  (null,'attendance_rate','{"uz":"Davomat","ru":"Посещаемость","en":"Attendance rate"}',
    '{"uz":"Kelgan va kechikkan yozuvlar ulushi","ru":"Доля присутствий и опозданий","en":"Present plus late attendance records divided by all records"}',
    '(present + late) / all attendance records * 100','entity_period','percent',array['academy_attendance'],'No ranking when the sample is too small'),
  (null,'contribution','{"uz":"Hissa","ru":"Вклад","en":"Contribution"}',
    '{"uz":"Tushumdan to\u02bbg\u02bbridan-to\u02bbg\u02bbri xarajat va o\u02bbqituvchi xarajati ayriladi","ru":"Выручка минус прямые расходы и стоимость преподавателей","en":"Generated revenue minus modeled operating expenses and teacher cost"}',
    'generated revenue - modeled expenses - teacher cost','branch_or_classroom_period','currency',array['academy_charges','academy_expenses','academy_payroll_rows'],'This is contribution, not statutory profit'),
  (null,'lead_to_student_conversion','{"uz":"Lead konversiyasi","ru":"Конверсия лида","en":"Lead to student conversion"}',
    '{"uz":"Konversiyalar va leadlar nisbati","ru":"Конверсии к лидам","en":"Converted leads divided by captured leads"}',
    'lead conversions / leads * 100','source_campaign_period','percent',array['academy_leads','academy_lead_conversions'],'Attribution follows the preserved original lead source')
on conflict(academy_id,metric_key,version) do nothing;

create or replace view public.academy_marketing_attribution_metrics
with(security_invoker=true)
as
with lead_base as (
  select l.academy_id,l.id lead_id,l.source_id,l.campaign_id,l.branch_id,l.interested_course_id,l.assigned_user_id,l.created_at
  from public.academy_leads l
), conversion_base as (
  select c.academy_id,c.lead_id,c.contact_id,c.trial_id,c.converted_at
  from public.academy_lead_conversions c
), revenue as (
  select p.academy_id,p.contact_id,sum(p.amount)::bigint attributed_revenue
  from public.academy_payments p where p.status='paid' group by p.academy_id,p.contact_id
)
select
  l.academy_id,l.source_id,l.campaign_id,l.branch_id,l.interested_course_id,l.assigned_user_id salesperson_user_id,
  count(*)::integer leads,
  count(c.trial_id)::integer trials,
  count(c.contact_id)::integer students,
  round(count(c.trial_id)::numeric/nullif(count(*),0)*100,2) lead_to_trial_percent,
  round(count(c.contact_id)::numeric/nullif(count(c.trial_id),0)*100,2) trial_to_student_percent,
  round(count(c.contact_id)::numeric/nullif(count(*),0)*100,2) lead_to_student_percent,
  coalesce(sum(r.attributed_revenue),0)::bigint attributed_revenue
from lead_base l
left join conversion_base c on c.academy_id=l.academy_id and c.lead_id=l.lead_id
left join revenue r on r.academy_id=c.academy_id and r.contact_id=c.contact_id
group by l.academy_id,l.source_id,l.campaign_id,l.branch_id,l.interested_course_id,l.assigned_user_id;

create or replace view public.academy_teacher_performance_metrics
with(security_invoker=true)
as
select
  s.academy_id,s.id staff_id,s.user_id,s.display_name,s.role,
  (select count(distinct d.classroom_id) from public.academy_lesson_deliveries d where d.academy_id=s.academy_id and d.staff_id=s.id and d.delivery_status in('delivered','substituted','make_up'))::integer assigned_groups,
  (select count(distinct m.contact_id) from public.academy_lesson_deliveries d join public.academy_classroom_memberships m on m.academy_id=d.academy_id and m.classroom_id=d.classroom_id and m.status='active' and m.role='student' where d.academy_id=s.academy_id and d.staff_id=s.id)::integer active_students,
  (select count(*) from public.academy_lesson_deliveries d where d.academy_id=s.academy_id and d.staff_id=s.id and d.delivery_status in('delivered','substituted','make_up'))::integer lessons_delivered,
  (select coalesce(sum(d.duration_minutes),0) from public.academy_lesson_deliveries d where d.academy_id=s.academy_id and d.staff_id=s.id and d.delivery_status in('delivered','substituted','make_up'))::integer minutes_delivered,
  (select coalesce(sum(r.generated_revenue),0) from public.academy_payroll_rows r where r.academy_id=s.academy_id and r.staff_id=s.id)::bigint generated_tuition_revenue,
  (select coalesce(sum(t.final_payable_amount),0) from public.academy_payroll_row_totals t where t.academy_id=s.academy_id and t.staff_id=s.id)::bigint teacher_cost,
  (select round(avg(case when a.status in('present','late') then 100 else 0 end),2) from public.academy_attendance a where a.academy_id=s.academy_id and exists(select 1 from public.academy_lesson_sessions ls where ls.academy_id=a.academy_id and ls.id=a.session_id and ls.primary_staff_id=s.id)) attendance_percent,
  (select round(avg(case when sub.score is not null and coalesce(sub.max_score,100)>0 then sub.score/coalesce(sub.max_score,100)*100 end),2) from public.academy_submissions sub where sub.academy_id=s.academy_id and exists(select 1 from public.academy_lesson_deliveries d where d.academy_id=sub.academy_id and d.classroom_id=sub.classroom_id and d.staff_id=s.id)) academic_outcome_percent,
  (select round(avg(q.score),2) from public.academy_session_quality_reviews q join public.academy_lesson_sessions ls on ls.academy_id=q.academy_id and ls.id=q.session_id where q.academy_id=s.academy_id and ls.primary_staff_id=s.id) observed_quality_rating,
  'Raw operational metrics only; no automated ranking.'::text interpretation_guardrail
from public.academy_staff s
where s.role in('teacher','assistant') and s.is_active;

create or replace view public.academy_staff_performance_metrics
with(security_invoker=true)
as
select
  s.academy_id,s.id staff_id,s.user_id,s.display_name,s.role,
  (select count(*) from public.academy_leads l where l.academy_id=s.academy_id and l.assigned_user_id=s.user_id)::integer leads_assigned,
  (select count(distinct a.lead_id) from public.academy_lead_activities a join public.academy_leads l on l.academy_id=a.academy_id and l.id=a.lead_id where a.academy_id=s.academy_id and a.status='completed' and coalesce(a.assigned_user_id,a.created_by)=s.user_id)::integer leads_contacted,
  (select round(avg(extract(epoch from (a.created_at-l.created_at))/60),2) from public.academy_leads l join lateral(select x.created_at from public.academy_lead_activities x where x.academy_id=l.academy_id and x.lead_id=l.id and x.status='completed' order by x.created_at limit 1)a on true where l.academy_id=s.academy_id and l.assigned_user_id=s.user_id) average_first_response_minutes,
  (select count(*) from public.academy_trial_lessons t join public.academy_leads l on l.academy_id=t.academy_id and l.id=t.lead_id where t.academy_id=s.academy_id and l.assigned_user_id=s.user_id)::integer trials_booked,
  (select count(*) from public.academy_trial_lessons t join public.academy_leads l on l.academy_id=t.academy_id and l.id=t.lead_id where t.academy_id=s.academy_id and l.assigned_user_id=s.user_id and t.status in('attended','converted'))::integer trials_attended,
  (select count(*) from public.academy_lead_conversions c where c.academy_id=s.academy_id and c.salesperson_user_id=s.user_id)::integer conversions,
  (select coalesce(sum(p.amount),0) from public.academy_lead_conversions c join public.academy_payments p on p.academy_id=c.academy_id and p.contact_id=c.contact_id and p.status='paid' where c.academy_id=s.academy_id and c.salesperson_user_id=s.user_id)::bigint revenue_generated,
  (select count(*) from public.academy_lead_activities a where a.academy_id=s.academy_id and a.assigned_user_id=s.user_id and a.status='completed')::integer followups_completed,
  (select count(*) from public.academy_lead_activities a where a.academy_id=s.academy_id and a.assigned_user_id=s.user_id and a.status='planned' and a.due_at<now())::integer followups_overdue,
  (select count(*) from public.academy_action_items a where a.academy_id=s.academy_id and a.assigned_to=s.user_id and a.status='resolved')::integer actions_resolved,
  (select count(*) from public.academy_action_items a where a.academy_id=s.academy_id and a.assigned_to=s.user_id and a.status='open')::integer outstanding_actions
from public.academy_staff s where s.is_active;

create or replace view public.academy_unit_economics_metrics
with(security_invoker=true)
as
select
  c.academy_id,c.branch_id,'classroom'::text entity_type,c.id entity_id,c.name entity_name,
  coalesce(x.generated_revenue,0)::bigint generated_revenue,
  coalesce(x.operating_expenses,0)::bigint modeled_expenses,
  coalesce(x.attributed_teacher_cost,0)::bigint teacher_cost,
  coalesce(x.contribution,0)::bigint contribution,
  (select count(*) from public.academy_classroom_memberships m where m.academy_id=c.academy_id and m.classroom_id=c.id and m.role='student' and m.status='active')::integer active_students,
  case when c.student_capacity>0 then round((select count(*) from public.academy_classroom_memberships m where m.academy_id=c.academy_id and m.classroom_id=c.id and m.role='student' and m.status='active')::numeric/c.student_capacity*100,2) end fill_percent,
  case when (select count(*) from public.academy_classroom_memberships m where m.academy_id=c.academy_id and m.classroom_id=c.id and m.role='student' and m.status='active')>0 then round(coalesce(x.generated_revenue,0)::numeric/(select count(*) from public.academy_classroom_memberships m where m.academy_id=c.academy_id and m.classroom_id=c.id and m.role='student' and m.status='active'),2) end revenue_per_student,
  case when coalesce(x.generated_revenue,0)>0 then round(coalesce(x.attributed_teacher_cost,0)::numeric/x.generated_revenue*100,2) end teacher_cost_percent,
  'Contribution is not statutory profit.'::text interpretation_guardrail
from public.academy_classrooms c
left join public.academy_classroom_contribution x on x.academy_id=c.academy_id and x.classroom_id=c.id;

create or replace view public.academy_unified_student_intelligence
with(security_invoker=true)
as
select
  c.academy_id,c.id contact_id,c.primary_branch_id,trim(c.first_name||' '||c.last_name) student_name,c.status,c.lifecycle_stage,
  (select count(*) from public.academy_classroom_memberships m where m.academy_id=c.academy_id and m.contact_id=c.id and m.status='active' and m.role='student')::integer active_enrollments,
  (select round(avg(case when a.status in('present','late') then 100 else 0 end),2) from public.academy_attendance a where a.academy_id=c.academy_id and a.contact_id=c.id and a.session_date>=current_date-30) attendance_30d_percent,
  (select round(avg(case when s.score is not null and coalesce(s.max_score,100)>0 then s.score/coalesce(s.max_score,100)*100 end),2) from public.academy_submissions s where s.academy_id=c.academy_id and s.contact_id=c.id and s.created_at>=now()-interval '90 days') academic_90d_percent,
  (select count(*) from public.academy_submissions s where s.academy_id=c.academy_id and s.contact_id=c.id and s.status in('submitted','late','graded') and s.created_at>=now()-interval '30 days')::integer homework_activity_30d,
  (select coalesce(sum(b.outstanding_amount),0) from public.academy_charge_balances b where b.academy_id=c.academy_id and b.contact_id=c.id)::bigint outstanding_balance,
  (select max(p.created_at) from public.academy_payments p where p.academy_id=c.academy_id and p.contact_id=c.id and p.status='paid') last_payment_at,
  (select count(*) from public.academy_guardian_messages m join public.academy_student_guardian_relationships r on r.academy_id=m.academy_id and r.id=m.relationship_id where m.academy_id=c.academy_id and r.contact_id=c.id and m.created_at>=now()-interval '30 days')::integer guardian_interactions_30d,
  (select e.risk_level from public.academy_risk_evaluations e where e.academy_id=c.academy_id and e.contact_id=c.id order by e.evaluated_at desc limit 1) latest_risk_level,
  (select e.score from public.academy_risk_evaluations e where e.academy_id=c.academy_id and e.contact_id=c.id order by e.evaluated_at desc limit 1) latest_risk_score,
  (select count(*) from public.academy_intervention_cases i where i.academy_id=c.academy_id and i.contact_id=c.id and i.status not in('resolved','closed_unsuccessful'))::integer open_interventions,
  (select count(*) from public.academy_action_items a where a.academy_id=c.academy_id and a.contact_id=c.id and a.status='open')::integer open_actions,
  coalesce(c.last_activity_at,c.created_at) last_engagement_at
from public.academy_contacts c;

create or replace view public.academy_branch_comparison_v2
with(security_invoker=true)
as
select
  b.academy_id,b.id branch_id,b.name,
  (select count(*) from public.academy_contacts c where c.academy_id=b.academy_id and c.primary_branch_id=b.id and c.status='active')::integer active_students,
  (select coalesce(sum(p.amount),0) from public.academy_payments p join public.academy_contacts c on c.academy_id=p.academy_id and c.id=p.contact_id where p.academy_id=b.academy_id and c.primary_branch_id=b.id and p.status='paid')::bigint collected_revenue,
  (select coalesce(sum(x.outstanding_amount),0) from public.academy_charge_balances x where x.academy_id=b.academy_id and x.branch_id=b.id)::bigint outstanding_amount,
  (select round(avg(r.utilization_percent),2) from public.academy_room_capacity_summary r where r.academy_id=b.academy_id and r.branch_id=b.id) room_utilization_percent,
  (select round(avg(case when a.status in('present','late') then 100 else 0 end),2) from public.academy_attendance a join public.academy_contacts c on c.academy_id=a.academy_id and c.id=a.contact_id where a.academy_id=b.academy_id and c.primary_branch_id=b.id) attendance_percent,
  (select round(count(*) filter(where r.status='renewed')::numeric/nullif(count(*),0)*100,2) from public.academy_renewal_opportunities r join public.academy_contacts c on c.academy_id=r.academy_id and c.id=r.contact_id where r.academy_id=b.academy_id and c.primary_branch_id=b.id) renewal_percent,
  coalesce((select x.teacher_cost from public.academy_branch_contribution x where x.academy_id=b.academy_id and x.branch_id=b.id),0)::bigint teacher_cost,
  coalesce((select x.contribution from public.academy_branch_contribution x where x.academy_id=b.academy_id and x.branch_id=b.id),0)::bigint contribution,
  (select count(*) from public.academy_action_items a where a.academy_id=b.academy_id and a.branch_id=b.id and a.status='open')::integer open_actions
from public.academy_branches b;

create or replace view public.academy_business_dashboard_v2
with(security_invoker=true)
as
select
  t.id academy_id,
  (select count(*) from public.academy_contacts c where c.academy_id=t.id and c.status='active')::integer active_students,
  (select count(*) from public.academy_contacts c where c.academy_id=t.id and c.created_at>=date_trunc('month',now()))::integer new_students,
  (select count(*) from public.academy_classroom_memberships m where m.academy_id=t.id and m.status='paused')::integer paused_enrollments,
  (select count(*) from public.academy_classroom_memberships m where m.academy_id=t.id and m.status='withdrawn' and m.withdrawn_at>=date_trunc('month',now()))::integer withdrawals,
  (select count(*) from public.academy_classroom_memberships m where m.academy_id=t.id and m.status='completed' and m.completed_at>=date_trunc('month',now()))::integer completions,
  (select count(*) from public.academy_leads l where l.academy_id=t.id and l.created_at>=date_trunc('month',now()))::integer new_leads,
  (select count(*) from public.academy_leads l where l.academy_id=t.id and l.status='open')::integer active_leads,
  (select count(*) from public.academy_trial_lessons x where x.academy_id=t.id and x.starts_at>=date_trunc('month',now()))::integer trials,
  (select count(*) from public.academy_lead_conversions c where c.academy_id=t.id and c.converted_at>=date_trunc('month',now()))::integer conversions,
  (select coalesce(sum(c.net_amount),0) from public.academy_charges c where c.academy_id=t.id and c.issued_on>=date_trunc('month',now())::date and c.status<>'void')::bigint expected_revenue,
  (select coalesce(sum(p.amount),0) from public.academy_payments p where p.academy_id=t.id and p.status='paid' and p.created_at>=date_trunc('month',now()))::bigint collected_revenue,
  (select coalesce(sum(b.outstanding_amount),0) from public.academy_charge_balances b where b.academy_id=t.id)::bigint outstanding_amount,
  (select coalesce(sum(a.amount),0) from public.academy_pricing_adjustments a where a.academy_id=t.id and a.created_at>=date_trunc('month',now()))::bigint discounts,
  (select coalesce(sum(abs(l.amount)),0) from public.academy_account_ledger_entries l where l.academy_id=t.id and l.entry_type='refund' and l.created_at>=date_trunc('month',now()))::bigint refunds,
  (select count(*) from public.academy_classrooms c where c.academy_id=t.id and c.is_active)::integer active_groups,
  (select round(avg(x.fill_percent),2) from public.academy_classroom_capacity_summary x where x.academy_id=t.id) average_group_fill_percent,
  (select round(avg(x.utilization_percent),2) from public.academy_room_capacity_summary x where x.academy_id=t.id) average_room_utilization_percent,
  (select round(avg(case when a.status in('present','late') then 100 else 0 end),2) from public.academy_attendance a where a.academy_id=t.id and a.session_date>=current_date-30) attendance_30d_percent,
  (select coalesce(sum(x.final_payable_amount),0) from public.academy_payroll_row_totals x where x.academy_id=t.id)::bigint payroll_total,
  (select count(*) from public.academy_action_items a where a.academy_id=t.id and a.status='open')::integer pending_actions,
  (select count(*) from public.academy_risk_evaluations e where e.academy_id=t.id and e.risk_level in('high','critical') and e.evaluated_at>=now()-interval '30 days')::integer high_risk_students
from public.tenants t where coalesce(t.metadata->>'service_family','')='academy';

create or replace function public.academy_global_search_v2(p_academy_id uuid,p_query text,p_limit integer default 50)
returns table(result_type text,result_id uuid,label text,context text,route_hint text,branch_id uuid)
language sql security definer set search_path=public as $$
  with q as(select '%'||lower(trim(p_query))||'%' term),results as(
    select 'student',c.id,trim(c.first_name||' '||c.last_name),coalesce(c.email,c.phone,c.status),'/academy/admin/contacts',c.primary_branch_id from public.academy_contacts c,q where c.academy_id=p_academy_id and lower(c.first_name||' '||c.last_name||' '||coalesce(c.email,'')||' '||coalesce(c.phone_normalized,'')) like q.term
    union all select 'guardian',g.id,g.full_name,coalesce(g.email,g.phone,g.status),'/academy/admin/relationships',(select c.primary_branch_id from public.academy_student_guardian_relationships r join public.academy_contacts c on c.academy_id=r.academy_id and c.id=r.contact_id where r.academy_id=g.academy_id and r.guardian_id=g.id and r.status='active' limit 1) from public.academy_guardians g,q where g.academy_id=p_academy_id and lower(g.full_name||' '||coalesce(g.email,'')||' '||coalesce(g.phone_normalized,'')) like q.term
    union all select 'lead',l.id,l.full_name,coalesce(l.email,l.phone,l.status),'/academy/admin/business',l.branch_id from public.academy_leads l,q where l.academy_id=p_academy_id and lower(l.full_name||' '||coalesce(l.email,'')||' '||coalesce(l.phone_normalized,'')) like q.term
    union all select 'classroom',c.id,c.name,coalesce(c.description,''),'/academy/admin/classrooms',c.branch_id from public.academy_classrooms c,q where c.academy_id=p_academy_id and lower(c.name||' '||coalesce(c.description,'')) like q.term
    union all select 'course',c.id,c.title,coalesce(c.code,c.level,''),'/academy/admin/curriculum',null::uuid from public.academy_courses c,q where c.academy_id=p_academy_id and lower(c.title||' '||coalesce(c.code,'')||' '||coalesce(c.description,'')) like q.term
    union all select 'staff',s.id,coalesce(s.display_name,s.email),s.role,'/academy/admin/staff',(select a.branch_id from public.academy_staff_branch_assignments a where a.academy_id=s.academy_id and a.staff_id=s.id and a.status='active' limit 1) from public.academy_staff s,q where s.academy_id=p_academy_id and lower(coalesce(s.display_name,'')||' '||s.email||' '||s.role) like q.term
    union all select 'payment',p.id,coalesce(p.provider_transaction_id,p.id::text),p.status||' '||p.amount||' '||p.currency,'/academy/admin/payments',c.primary_branch_id from public.academy_payments p join public.academy_contacts c on c.academy_id=p.academy_id and c.id=p.contact_id,q where p.academy_id=p_academy_id and lower(coalesce(p.provider_transaction_id,'')||' '||p.status||' '||p.amount||' '||p.currency) like q.term
    union all select 'invoice',c.id,c.charge_number,c.status||' '||c.net_amount||' '||c.currency,'/academy/admin/commercial',c.branch_id from public.academy_charges c,q where c.academy_id=p_academy_id and lower(c.charge_number||' '||c.status||' '||coalesce(c.description,'')) like q.term
    union all select 'branch',b.id,b.name,coalesce(b.address,b.phone,''),'/academy/admin/business',b.id from public.academy_branches b,q where b.academy_id=p_academy_id and lower(b.name||' '||coalesce(b.address,'')||' '||coalesce(b.phone,'')) like q.term
  ) select * from results limit least(greatest(p_limit,1),100);
$$;
revoke all on function public.academy_global_search_v2(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.academy_global_search_v2(uuid,text,integer) to service_role;

alter table public.academy_marketing_campaigns enable row level security;
alter table public.academy_metric_definitions enable row level security;
create policy "Academy campaigns read by CRM" on public.academy_marketing_campaigns for select using(public.academy_crm_can_access(academy_id));
create policy "Academy campaigns manage by admin" on public.academy_marketing_campaigns for all using(public.academy_org_can_manage(academy_id)) with check(public.academy_org_can_manage(academy_id));
create policy "Global metric definitions read authenticated" on public.academy_metric_definitions for select using(academy_id is null or public.academy_intelligence_can_access(academy_id));
