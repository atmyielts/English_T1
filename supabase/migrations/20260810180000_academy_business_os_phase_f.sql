-- Education Business OS Phase F: retention, renewal, intelligence, global action queue, search, and governed imports.

alter table public.academy_action_items
 add column if not exists branch_id uuid,
 add column if not exists category text not null default 'operations',
 add column if not exists assigned_to uuid,
 add column if not exists sla_due_at timestamptz,
 add column if not exists source_event_id uuid,
 add column if not exists outcome text;
alter table public.academy_action_items add constraint academy_action_items_branch_fk foreign key(academy_id,branch_id) references public.academy_branches(academy_id,id) on delete set null;
alter table public.academy_action_items add constraint academy_action_items_assignee_fk foreign key(assigned_to) references public.users(id) on delete set null;
alter table public.academy_action_items add constraint academy_action_items_category_check check(category in('admissions','academic','attendance','retention','renewal','finance','guardian','capacity','quality','operations'));
create index academy_action_items_owner_queue_idx on public.academy_action_items(academy_id,status,assigned_to,sla_due_at,priority);

create table public.academy_risk_definitions(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null references public.tenants(id) on delete cascade,
 definition_key text not null,version integer not null check(version>0),name text not null,status text not null default 'draft' check(status in('draft','active','retired')),
 weights jsonb not null default '{"attendance":30,"homework":20,"debt":30,"engagement":20}'::jsonb,
 thresholds jsonb not null default '{"low":25,"medium":50,"high":70,"critical":85}'::jsonb,
 explanation text not null default '',effective_from timestamptz,effective_to timestamptz,created_by uuid references public.users(id) on delete set null,created_at timestamptz not null default now(),
 unique(academy_id,id),unique(academy_id,definition_key,version),check(jsonb_typeof(weights)='object'),check(jsonb_typeof(thresholds)='object')
);
create unique index academy_risk_definition_active_uidx on public.academy_risk_definitions(academy_id,definition_key) where status='active';

create table public.academy_risk_evaluations(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null,contact_id uuid not null,definition_id uuid not null,
 score numeric(5,2) not null check(score between 0 and 100),risk_level text not null check(risk_level in('low','medium','high','critical')),
 summary text not null,factors jsonb not null default '[]'::jsonb,evaluated_at timestamptz not null default now(),evaluated_by uuid references public.users(id) on delete set null,
 idempotency_key text not null,created_at timestamptz not null default now(),unique(academy_id,id),unique(academy_id,idempotency_key),
 foreign key(academy_id,contact_id) references public.academy_contacts(academy_id,id) on delete cascade,
 foreign key(academy_id,definition_id) references public.academy_risk_definitions(academy_id,id) on delete restrict,check(jsonb_typeof(factors)='array')
);
create index academy_risk_eval_queue_idx on public.academy_risk_evaluations(academy_id,risk_level,evaluated_at desc);

create table public.academy_risk_signals(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null,evaluation_id uuid not null,signal_key text not null,
 observed_value numeric not null,normalized_value numeric(6,4) not null check(normalized_value between 0 and 1),weight numeric not null check(weight>=0),contribution numeric(6,2) not null check(contribution>=0),explanation text not null,
 evidence jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),unique(academy_id,id),unique(academy_id,evaluation_id,signal_key),
 foreign key(academy_id,evaluation_id) references public.academy_risk_evaluations(academy_id,id) on delete cascade
);

create table public.academy_intervention_cases(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null,contact_id uuid not null,risk_evaluation_id uuid,
 status text not null default 'open' check(status in('open','contacting','plan_agreed','monitoring','resolved','closed_unsuccessful')),
 priority text not null default 'medium' check(priority in('critical','high','medium','low')),assigned_to uuid references public.users(id) on delete set null,
 opened_at timestamptz not null default now(),next_follow_up_at timestamptz,outcome text,outcome_reason text,closed_at timestamptz,
 created_by uuid references public.users(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(academy_id,id),foreign key(academy_id,contact_id) references public.academy_contacts(academy_id,id) on delete cascade,
 foreign key(academy_id,risk_evaluation_id) references public.academy_risk_evaluations(academy_id,id) on delete set null
);
create unique index academy_intervention_open_uidx on public.academy_intervention_cases(academy_id,contact_id) where status in('open','contacting','plan_agreed','monitoring');

create table public.academy_intervention_activities(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null,case_id uuid not null,activity_type text not null check(activity_type in('call','telegram','meeting','academic_plan','payment_plan','schedule_change','guardian_contact','note','follow_up')),
 note text not null,outcome text,next_follow_up_at timestamptz,performed_by uuid references public.users(id) on delete set null,performed_at timestamptz not null default now(),created_at timestamptz not null default now(),
 unique(academy_id,id),foreign key(academy_id,case_id) references public.academy_intervention_cases(academy_id,id) on delete cascade
);

create table public.academy_renewal_opportunities(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null,contact_id uuid not null,subscription_id uuid,classroom_id uuid,
 renewal_due_on date not null,status text not null default 'identified' check(status in('identified','contacting','offered','accepted','renewed','declined','expired')),
 likelihood numeric(5,2) check(likelihood between 0 and 100),expected_amount bigint not null default 0 check(expected_amount>=0),currency text not null default 'UZS',
 assigned_to uuid references public.users(id) on delete set null,next_action_at timestamptz,offer_notes text,outcome_reason text,renewed_subscription_id uuid,
 created_by uuid references public.users(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(academy_id,id),foreign key(academy_id,contact_id) references public.academy_contacts(academy_id,id) on delete cascade,
 foreign key(academy_id,subscription_id) references public.academy_subscriptions(academy_id,id) on delete set null,
 foreign key(academy_id,classroom_id) references public.academy_classrooms(academy_id,id) on delete set null,
 foreign key(academy_id,renewed_subscription_id) references public.academy_subscriptions(academy_id,id) on delete set null
);
create unique index academy_renewal_open_uidx on public.academy_renewal_opportunities(academy_id,contact_id,coalesce(subscription_id,'00000000-0000-0000-0000-000000000000'::uuid),renewal_due_on) where status not in('renewed','declined','expired');

create table public.academy_renewal_activities(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null,opportunity_id uuid not null,activity_type text not null check(activity_type in('call','telegram','meeting','offer','follow_up','status_change','note')),
 note text not null,next_action_at timestamptz,performed_by uuid references public.users(id) on delete set null,performed_at timestamptz not null default now(),created_at timestamptz not null default now(),
 unique(academy_id,id),foreign key(academy_id,opportunity_id) references public.academy_renewal_opportunities(academy_id,id) on delete cascade
);

create table public.academy_import_jobs(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null references public.tenants(id) on delete cascade,
 import_type text not null check(import_type in('contacts','leads')),source_filename text not null,status text not null default 'draft' check(status in('draft','validating','ready','committing','completed','failed','cancelled')),
 column_mapping jsonb not null default '{}'::jsonb,total_rows integer not null default 0,valid_rows integer not null default 0,invalid_rows integer not null default 0,committed_rows integer not null default 0,
 error_summary jsonb not null default '[]'::jsonb,idempotency_key text not null,created_by uuid references public.users(id) on delete set null,committed_by uuid references public.users(id) on delete set null,
 created_at timestamptz not null default now(),completed_at timestamptz,unique(academy_id,id),unique(academy_id,idempotency_key)
);
create table public.academy_import_rows(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null,import_job_id uuid not null,row_number integer not null check(row_number>0),raw_data jsonb not null,mapped_data jsonb not null default '{}'::jsonb,
 validation_status text not null default 'pending' check(validation_status in('pending','valid','invalid','duplicate','committed')),validation_errors jsonb not null default '[]'::jsonb,target_id uuid,created_at timestamptz not null default now(),
 unique(academy_id,id),unique(academy_id,import_job_id,row_number),foreign key(academy_id,import_job_id) references public.academy_import_jobs(academy_id,id) on delete cascade
);

create or replace view public.academy_owner_intelligence with(security_invoker=true) as
select t.id academy_id,
 (select count(*) from public.academy_leads l where l.academy_id=t.id and l.status='open') open_leads,
 (select count(*) from public.academy_lead_conversions c where c.academy_id=t.id) conversions,
 (select count(*) from public.academy_contacts c where c.academy_id=t.id and c.status='active') active_students,
 (select coalesce(sum(p.amount),0) from public.academy_payments p where p.academy_id=t.id and p.status='paid') collected_amount,
 (select coalesce(sum(b.outstanding_amount),0) from public.academy_charge_balances b where b.academy_id=t.id and b.status<>'void') outstanding_debt,
 (select count(*) from public.academy_risk_evaluations e where e.academy_id=t.id and e.risk_level in('high','critical') and e.evaluated_at>now()-interval '30 days') high_risk_evaluations,
 (select count(*) from public.academy_intervention_cases i where i.academy_id=t.id and i.status not in('resolved','closed_unsuccessful')) open_interventions,
 (select count(*) from public.academy_renewal_opportunities r where r.academy_id=t.id and r.status not in('renewed','declined','expired')) open_renewals,
 (select count(*) from public.academy_action_items a where a.academy_id=t.id and a.status='open') open_actions,
 (select count(*) from public.academy_action_items a where a.academy_id=t.id and a.status='open' and coalesce(a.sla_due_at,a.due_at)<now()) overdue_actions
from public.tenants t where coalesce(t.metadata->>'service_family','')='academy';

create or replace view public.academy_branch_intelligence with(security_invoker=true) as
select b.academy_id,b.id branch_id,b.name,
 count(distinct c.id) active_students,count(distinct s.id) active_subscriptions,
 coalesce(sum(distinct p.amount) filter(where p.status='paid'),0) collected_amount,
 count(distinct i.id) filter(where i.status not in('resolved','closed_unsuccessful')) open_interventions,
 count(distinct a.id) filter(where a.status='open') open_actions
from public.academy_branches b left join public.academy_contacts c on c.academy_id=b.academy_id and c.status='active' and c.metadata->>'branch_id'=b.id::text
left join public.academy_subscriptions s on s.academy_id=b.academy_id and s.branch_id=b.id and s.status in('active','frozen')
left join public.academy_payments p on p.academy_id=b.academy_id and p.contact_id=c.id
left join public.academy_intervention_cases i on i.academy_id=b.academy_id and i.contact_id=c.id
left join public.academy_action_items a on a.academy_id=b.academy_id and a.branch_id=b.id group by b.academy_id,b.id,b.name;

create or replace function public.academy_evaluate_retention_risk(p_academy_id uuid,p_contact_id uuid,p_definition_id uuid,p_actor_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d public.academy_risk_definitions%rowtype;e public.academy_risk_evaluations%rowtype;attendance_ratio numeric:=0;missing_ratio numeric:=0;debt_ratio numeric:=0;engagement_ratio numeric:=0;
 wa numeric;wh numeric;wd numeric;we numeric;score numeric;level text;total_attendance int;absent_attendance int;total_homework int;missing_homework int;debt bigint;days_idle int;
begin
 if nullif(trim(p_idempotency_key),'') is null then raise exception 'Idempotency key is required';end if;
 select * into e from public.academy_risk_evaluations where academy_id=p_academy_id and idempotency_key=p_idempotency_key;if found then return to_jsonb(e);end if;
 select * into d from public.academy_risk_definitions where academy_id=p_academy_id and id=p_definition_id and status='active';if not found then raise exception 'Active risk definition not found';end if;
 if not exists(select 1 from public.academy_contacts where academy_id=p_academy_id and id=p_contact_id) then raise exception 'Contact not found';end if;
 select count(*),count(*) filter(where status in('absent','excused')) into total_attendance,absent_attendance from public.academy_attendance where academy_id=p_academy_id and contact_id=p_contact_id and session_date>=current_date-30;
 attendance_ratio:=case when total_attendance=0 then 0 else absent_attendance::numeric/total_attendance end;
 select count(*),count(*) filter(where due_at<now() and not exists(select 1 from public.academy_submissions s where s.academy_id=a.academy_id and s.assignment_id=a.id and s.contact_id=p_contact_id and s.status in('submitted','graded'))) into total_homework,missing_homework from public.academy_assignments a where a.academy_id=p_academy_id and a.status='active' and a.due_at>=now()-interval '30 days' and exists(select 1 from public.academy_classroom_memberships m where m.academy_id=p_academy_id and m.classroom_id=a.classroom_id and m.contact_id=p_contact_id and m.status='active');
 missing_ratio:=case when total_homework=0 then 0 else missing_homework::numeric/total_homework end;
 select coalesce(sum(outstanding_amount),0) into debt from public.academy_charge_balances where academy_id=p_academy_id and contact_id=p_contact_id and days_overdue>0;debt_ratio:=least(debt::numeric/1000000,1);
 select greatest(current_date-coalesce(last_activity_at::date,created_at::date),0) into days_idle from public.academy_contacts where academy_id=p_academy_id and id=p_contact_id;engagement_ratio:=least(days_idle::numeric/30,1);
 wa:=coalesce((d.weights->>'attendance')::numeric,30);wh:=coalesce((d.weights->>'homework')::numeric,20);wd:=coalesce((d.weights->>'debt')::numeric,30);we:=coalesce((d.weights->>'engagement')::numeric,20);
 score:=least(round(attendance_ratio*wa+missing_ratio*wh+debt_ratio*wd+engagement_ratio*we,2),100);
 level:=case when score>=coalesce((d.thresholds->>'critical')::numeric,85) then 'critical' when score>=coalesce((d.thresholds->>'high')::numeric,70) then 'high' when score>=coalesce((d.thresholds->>'medium')::numeric,50) then 'medium' else 'low' end;
 insert into public.academy_risk_evaluations(academy_id,contact_id,definition_id,score,risk_level,summary,factors,evaluated_by,idempotency_key) values(p_academy_id,p_contact_id,p_definition_id,score,level,format('Risk %s/100: attendance %s, missing homework %s, overdue debt %s, idle days %s',score,absent_attendance,missing_homework,debt,days_idle),jsonb_build_array(jsonb_build_object('key','attendance','value',attendance_ratio),jsonb_build_object('key','homework','value',missing_ratio),jsonb_build_object('key','debt','value',debt_ratio),jsonb_build_object('key','engagement','value',engagement_ratio)),p_actor_id,p_idempotency_key)returning * into e;
 insert into public.academy_risk_signals(academy_id,evaluation_id,signal_key,observed_value,normalized_value,weight,contribution,explanation,evidence) values
 (p_academy_id,e.id,'attendance',absent_attendance,attendance_ratio,wa,attendance_ratio*wa,'Absence/excused share in the last 30 days',jsonb_build_object('total',total_attendance)),
 (p_academy_id,e.id,'homework',missing_homework,missing_ratio,wh,missing_ratio*wh,'Missing due homework in the last 30 days',jsonb_build_object('total',total_homework)),
 (p_academy_id,e.id,'debt',debt,debt_ratio,wd,debt_ratio*wd,'Overdue outstanding tuition normalized at 1,000,000 UZS',jsonb_build_object('currency','UZS')),
 (p_academy_id,e.id,'engagement',days_idle,engagement_ratio,we,engagement_ratio*we,'Days since recorded learner activity normalized at 30 days','{}');
 if level in('high','critical') then insert into public.academy_action_items(academy_id,dedupe_key,source_type,category,priority,title,description,recommended_action,contact_id,due_at,sla_due_at,created_by,metadata) values(p_academy_id,'risk:'||e.id,'risk_evaluation','retention',case when level='critical' then 'critical' else 'high' end,'Retention risk requires intervention',e.summary,'Open an intervention, contact the learner or guardian, agree the next action, and record the outcome.',p_contact_id,now()+interval '24 hours',now()+interval '24 hours',p_actor_id,jsonb_build_object('risk_evaluation_id',e.id,'risk_level',level)) on conflict(academy_id,dedupe_key) do nothing;end if;
 return to_jsonb(e);end;$$;

create or replace function public.academy_global_search(p_academy_id uuid,p_query text,p_limit int default 25)
returns table(result_type text,result_id uuid,label text,context text) language sql security definer set search_path=public as $$
 with q as(select '%'||lower(trim(p_query))||'%' term),results as(
 select 'contact',c.id,trim(c.first_name||' '||c.last_name),coalesce(c.email,c.phone,c.status) from public.academy_contacts c,q where c.academy_id=p_academy_id and lower(c.first_name||' '||c.last_name||' '||coalesce(c.email,'')||' '||coalesce(c.phone,'')) like q.term
 union all select 'classroom',c.id,c.name,coalesce(c.description,'') from public.academy_classrooms c,q where c.academy_id=p_academy_id and lower(c.name||' '||coalesce(c.description,'')) like q.term
 union all select 'lead',l.id,l.full_name,coalesce(l.phone,l.email,l.status) from public.academy_leads l,q where l.academy_id=p_academy_id and lower(l.full_name||' '||coalesce(l.phone,'')||' '||coalesce(l.email,'')) like q.term
 union all select 'guardian',g.id,g.full_name,coalesce(g.phone,g.email,g.status) from public.academy_guardians g,q where g.academy_id=p_academy_id and lower(g.full_name||' '||coalesce(g.phone,'')||' '||coalesce(g.email,'')) like q.term)
 select * from results limit least(greatest(p_limit,1),100);$$;

create or replace function public.academy_create_intervention(p_academy_id uuid,p_contact_id uuid,p_risk_evaluation_id uuid,p_actor_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$declare v public.academy_intervention_cases%rowtype;begin
 insert into public.academy_intervention_cases(academy_id,contact_id,risk_evaluation_id,priority,assigned_to,next_follow_up_at,created_by) values(p_academy_id,p_contact_id,p_risk_evaluation_id,coalesce(nullif(p_payload->>'priority',''),'high'),nullif(p_payload->>'assigned_to','')::uuid,nullif(p_payload->>'next_follow_up_at','')::timestamptz,p_actor_id) returning * into v;
 insert into public.academy_action_items(academy_id,dedupe_key,source_type,category,priority,title,description,recommended_action,contact_id,assigned_to,due_at,sla_due_at,created_by,metadata) values(p_academy_id,'intervention:'||v.id,'intervention','retention',v.priority,'Retention intervention','Explain the risk, agree an intervention, and follow through.','Record contact, agreed plan, next follow-up, and outcome.',p_contact_id,v.assigned_to,v.next_follow_up_at,v.next_follow_up_at,p_actor_id,jsonb_build_object('intervention_case_id',v.id)) on conflict(academy_id,dedupe_key) do nothing;return to_jsonb(v);end;$$;

create or replace function public.academy_create_import_job(p_academy_id uuid,p_actor_id uuid,p_payload jsonb,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$declare v public.academy_import_jobs%rowtype;begin if nullif(trim(p_idempotency_key),'') is null then raise exception 'Idempotency key is required';end if;select * into v from public.academy_import_jobs where academy_id=p_academy_id and idempotency_key=p_idempotency_key;if found then return to_jsonb(v);end if;insert into public.academy_import_jobs(academy_id,import_type,source_filename,column_mapping,idempotency_key,created_by) values(p_academy_id,lower(p_payload->>'import_type'),trim(p_payload->>'source_filename'),coalesce(p_payload->'column_mapping','{}'),p_idempotency_key,p_actor_id)returning * into v;return to_jsonb(v);end;$$;

create or replace function public.academy_intelligence_can_access(p_academy_id uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.tenant_memberships m where m.tenant_id=p_academy_id and m.user_id=auth.uid() and m.status='active' and m.role in('owner','admin')) or exists(select 1 from public.academy_role_grants g where g.academy_id=p_academy_id and g.user_id=auth.uid() and g.status='active' and g.role in('owner','admin','center_admin','manager','counselor') and g.starts_at<=now() and(g.expires_at is null or g.expires_at>now()));$$;
revoke all on function public.academy_intelligence_can_access(uuid) from public,anon;
grant execute on function public.academy_intelligence_can_access(uuid) to authenticated,service_role;

drop policy if exists "Academy action items read by member" on public.academy_action_items;
create policy "Academy action items read by scoped member" on public.academy_action_items for select using(public.is_academy_member(academy_id) and(category not in('retention','renewal','finance') or assigned_to=auth.uid() or public.academy_intelligence_can_access(academy_id)));

alter table public.academy_risk_definitions enable row level security;
alter table public.academy_risk_evaluations enable row level security;
alter table public.academy_risk_signals enable row level security;
alter table public.academy_intervention_cases enable row level security;
alter table public.academy_intervention_activities enable row level security;
alter table public.academy_renewal_opportunities enable row level security;
alter table public.academy_renewal_activities enable row level security;
alter table public.academy_import_jobs enable row level security;
alter table public.academy_import_rows enable row level security;

do $$declare t text;begin foreach t in array array['academy_risk_definitions','academy_risk_evaluations','academy_risk_signals','academy_intervention_cases','academy_intervention_activities','academy_renewal_opportunities','academy_renewal_activities','academy_import_jobs','academy_import_rows'] loop execute format('alter table public.%I enable row level security',t);execute format('create policy %I on public.%I for select using(public.academy_intelligence_can_access(academy_id))','Phase F read '||t,t);execute format('create policy %I on public.%I for all using(public.academy_intelligence_can_access(academy_id)) with check(public.academy_intelligence_can_access(academy_id))','Phase F manage '||t,t);end loop;end$$;

revoke all on function public.academy_evaluate_retention_risk(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.academy_global_search(uuid,text,int) from public,anon,authenticated;
revoke all on function public.academy_create_intervention(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.academy_create_import_job(uuid,uuid,jsonb,text) from public,anon,authenticated;
