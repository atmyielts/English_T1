-- Education Business OS Phase G: coherent lifecycle, operational roles, and localization foundations.

create or replace function public.academy_normalize_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if v_digits = '' then return null; end if;
  if length(v_digits) = 9 then return '+998' || v_digits; end if;
  if length(v_digits) = 12 and left(v_digits, 3) = '998' then return '+' || v_digits; end if;
  if length(v_digits) = 13 and left(v_digits, 4) = '0998' then return '+' || right(v_digits, 12); end if;
  if left(v_digits, 2) = '00' then return '+' || substr(v_digits, 3); end if;
  return '+' || v_digits;
end;
$$;

alter table public.academy_contacts
  add column if not exists phone_normalized text generated always as (public.academy_normalize_phone(phone)) stored;
alter table public.academy_leads
  add column if not exists phone_normalized text generated always as (public.academy_normalize_phone(phone)) stored,
  add column if not exists parent_phone_normalized text generated always as (public.academy_normalize_phone(parent_phone)) stored;
alter table public.academy_guardians
  add column if not exists phone_normalized text generated always as (public.academy_normalize_phone(phone)) stored;

create index if not exists academy_contacts_phone_normalized_idx
  on public.academy_contacts(academy_id, phone_normalized) where phone_normalized is not null;
create index if not exists academy_leads_phone_normalized_idx
  on public.academy_leads(academy_id, phone_normalized) where phone_normalized is not null;
create index if not exists academy_guardians_phone_normalized_idx
  on public.academy_guardians(academy_id, phone_normalized) where phone_normalized is not null;

create table if not exists public.academy_localization_settings (
  academy_id uuid primary key references public.tenants(id) on delete restrict,
  default_locale text not null default 'uz' check (default_locale in ('uz', 'ru', 'en')),
  enabled_locales text[] not null default array['uz', 'ru', 'en']::text[],
  timezone text not null default 'Asia/Tashkent',
  currency text not null default 'UZS',
  phone_country_code text not null default '+998',
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(enabled_locales) > 0),
  check (enabled_locales <@ array['uz', 'ru', 'en']::text[]),
  check (default_locale = any(enabled_locales))
);

create table if not exists public.academy_translation_overrides (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete restrict,
  translation_key text not null,
  locale text not null check (locale in ('uz', 'ru', 'en')),
  translated_value text not null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(academy_id, translation_key, locale),
  unique(academy_id, id)
);

alter table public.academy_staff drop constraint if exists academy_staff_role_check;
alter table public.academy_staff add constraint academy_staff_role_check check (role in (
  'admin','center_admin','branch_manager','manager','counselor','salesperson','cashier',
  'accountant','payroll_officer','parent_liaison','teacher','assistant'
));

alter table public.academy_role_grants drop constraint if exists academy_role_grants_role_check;
alter table public.academy_role_grants add constraint academy_role_grants_role_check check (role in (
  'owner','admin','center_admin','branch_manager','manager','counselor','salesperson','cashier',
  'accountant','payroll_officer','parent_liaison','teacher','assistant'
));

alter table public.academy_role_grants drop constraint if exists academy_role_grants_scope_type_check;
alter table public.academy_role_grants add constraint academy_role_grants_scope_type_check
  check (scope_type in ('academy','branches','classrooms','students'));

create table if not exists public.academy_staff_branch_assignments (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete restrict,
  staff_id uuid not null,
  branch_id uuid not null,
  assignment_role text not null check (assignment_role in (
    'branch_manager','salesperson','cashier','accountant','payroll_officer','parent_liaison',
    'academic_operator','teacher','assistant','support'
  )),
  is_primary boolean not null default false,
  starts_on date not null default current_date,
  ends_on date,
  status text not null default 'active' check (status in ('active','paused','ended')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(academy_id, id),
  unique(academy_id, staff_id, branch_id, assignment_role, starts_on),
  foreign key(academy_id, staff_id) references public.academy_staff(academy_id, id) on delete restrict,
  foreign key(academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict,
  check (ends_on is null or ends_on >= starts_on)
);
create index if not exists academy_staff_branch_assignment_active_idx
  on public.academy_staff_branch_assignments(academy_id, branch_id, assignment_role, status);

create table if not exists public.academy_student_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid,
  lead_id uuid,
  contact_id uuid,
  classroom_id uuid,
  subscription_id uuid,
  guardian_relationship_id uuid,
  event_key text not null check (length(trim(event_key)) > 0),
  event_version integer not null default 1 check (event_version > 0),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references public.users(id) on delete set null,
  source_table text not null,
  source_id uuid,
  idempotency_key text not null,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz not null default now(),
  unique(academy_id, id),
  unique(academy_id, idempotency_key),
  foreign key(academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict,
  foreign key(academy_id, lead_id) references public.academy_leads(academy_id, id) on delete restrict,
  foreign key(academy_id, contact_id) references public.academy_contacts(academy_id, id) on delete restrict,
  foreign key(academy_id, classroom_id) references public.academy_classrooms(academy_id, id) on delete restrict,
  foreign key(academy_id, subscription_id) references public.academy_subscriptions(academy_id, id) on delete restrict,
  foreign key(academy_id, guardian_relationship_id) references public.academy_student_guardian_relationships(academy_id, id) on delete restrict,
  check (lead_id is not null or contact_id is not null)
);
create index if not exists academy_student_lifecycle_contact_idx
  on public.academy_student_lifecycle_events(academy_id, contact_id, occurred_at desc);
create index if not exists academy_student_lifecycle_lead_idx
  on public.academy_student_lifecycle_events(academy_id, lead_id, occurred_at desc);
create index if not exists academy_student_lifecycle_event_idx
  on public.academy_student_lifecycle_events(academy_id, event_key, occurred_at desc);

create or replace function public.academy_capture_student_lifecycle_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_academy uuid := nullif(v_new->>'academy_id', '')::uuid;
  v_lead uuid := nullif(v_new->>'lead_id', '')::uuid;
  v_contact uuid := nullif(v_new->>'contact_id', '')::uuid;
  v_branch uuid := nullif(v_new->>'branch_id', '')::uuid;
  v_classroom uuid := nullif(v_new->>'classroom_id', '')::uuid;
  v_subscription uuid := nullif(v_new->>'subscription_id', '')::uuid;
  v_relationship uuid;
  v_actor uuid;
  v_source uuid := nullif(v_new->>'id', '')::uuid;
  v_event text;
  v_key text;
  v_evidence jsonb := '{}'::jsonb;
begin
  if v_academy is null then return new; end if;
  v_actor := coalesce(
    nullif(v_new->>'created_by', '')::uuid,
    nullif(v_new->>'updated_by', '')::uuid,
    nullif(v_new->>'performed_by', '')::uuid,
    nullif(v_new->>'evaluated_by', '')::uuid,
    nullif(v_new->>'recorded_by', '')::uuid
  );

  if tg_table_name = 'academy_leads' and tg_op = 'INSERT' then
    v_lead := v_source;
    v_event := 'lead.created';
    v_evidence := jsonb_build_object('source_id', v_new->'source_id', 'campaign', v_new->'campaign');
  elsif tg_table_name = 'academy_lead_activities' and tg_op = 'INSERT' then
    v_event := case when v_new->>'status' = 'completed' then 'lead.contacted' else 'lead.follow_up_scheduled' end;
    v_evidence := jsonb_build_object('method', v_new->'method', 'due_at', v_new->'due_at', 'outcome', v_new->'outcome');
  elsif tg_table_name = 'academy_trial_lessons' then
    v_event := case
      when tg_op = 'INSERT' then 'trial.booked'
      when v_new->>'status' = 'attended' and v_old->>'status' is distinct from 'attended' then 'trial.attended'
      when coalesce(v_new->>'feedback','') <> '' and v_old->>'feedback' is distinct from v_new->>'feedback' then 'trial.feedback_recorded'
      when v_new->>'status' = 'converted' and v_old->>'status' is distinct from 'converted' then 'trial.converted'
      else null end;
    v_evidence := jsonb_build_object('status', v_new->'status', 'teacher_user_id', v_new->'teacher_user_id');
  elsif tg_table_name = 'academy_lead_conversions' and tg_op = 'INSERT' then
    v_event := 'lead.converted';
    v_evidence := jsonb_build_object('source_id', v_new->'source_id', 'salesperson_user_id', v_new->'salesperson_user_id', 'value', v_new->'expected_value');
  elsif tg_table_name = 'academy_classroom_memberships' and (tg_op = 'INSERT' or v_old->>'status' is distinct from v_new->>'status') then
    if v_new->>'role' in ('student','observer') then
      v_event := case when v_new->>'status' = 'active' then 'student.group_joined' else 'student.enrollment_' || (v_new->>'status') end;
      v_evidence := jsonb_build_object('status', v_new->'status', 'role', v_new->'role');
    end if;
  elsif tg_table_name = 'academy_student_guardian_relationships' and tg_op = 'INSERT' then
    v_relationship := v_source;
    v_event := 'guardian.connected';
    v_evidence := jsonb_build_object('relationship_type', v_new->'relationship_type', 'consent_status', v_new->'consent_status');
  elsif tg_table_name = 'academy_subscriptions' and tg_op = 'INSERT' then
    v_subscription := v_source;
    v_event := 'subscription.created';
    v_evidence := jsonb_build_object('status', v_new->'status', 'amount', v_new->'agreed_amount', 'currency', v_new->'currency');
  elsif tg_table_name = 'academy_payments' and v_new->>'status' = 'paid' and (tg_op = 'INSERT' or v_old->>'status' is distinct from 'paid') then
    v_event := 'payment.collected';
    v_evidence := jsonb_build_object('amount', v_new->'amount', 'currency', v_new->'currency', 'provider', v_new->'provider');
  elsif tg_table_name = 'academy_entitlements' and tg_op = 'INSERT' then
    v_event := 'entitlement.activated';
    v_evidence := jsonb_build_object('resource_type', v_new->'resource_type', 'expires_at', v_new->'expires_at');
  elsif tg_table_name = 'academy_attendance' and tg_op = 'INSERT' then
    v_event := case when v_new->>'status' = 'absent' then 'attendance.absence_recorded' else 'attendance.recorded' end;
    v_evidence := jsonb_build_object('status', v_new->'status', 'session_date', v_new->'session_date');
  elsif tg_table_name = 'academy_lesson_progress' and tg_op = 'INSERT' then
    v_event := 'learning.curriculum_accessed';
    v_evidence := jsonb_build_object('lesson_id', v_new->'lesson_id', 'status', v_new->'status');
  elsif tg_table_name = 'academy_submissions' and (tg_op = 'INSERT' or v_old->>'status' is distinct from v_new->>'status') then
    v_event := case when v_new->>'status' = 'graded' then 'learning.grade_recorded' else 'learning.assignment_submitted' end;
    v_evidence := jsonb_build_object('assignment_id', v_new->'assignment_id', 'status', v_new->'status', 'score', v_new->'score');
  elsif tg_table_name = 'academy_quiz_attempts' and (tg_op = 'INSERT' or v_old->>'status' is distinct from v_new->>'status') then
    v_event := case when v_new->>'status' in ('submitted','graded') then 'learning.assessment_completed' else null end;
    v_evidence := jsonb_build_object('quiz_id', v_new->'quiz_id', 'status', v_new->'status', 'score', v_new->'score');
  elsif tg_table_name = 'academy_notifications' and tg_op = 'INSERT' and nullif(v_new->>'guardian_id','') is not null then
    v_event := 'guardian.update_queued';
    v_evidence := jsonb_build_object('event_key', v_new->'event_key', 'channel', v_new->'channel', 'status', v_new->'status');
  elsif tg_table_name = 'academy_lesson_deliveries' and tg_op = 'INSERT' and v_new->>'delivery_status' in ('delivered','substituted','make_up') then
    v_event := 'payroll.lesson_accrued';
    v_evidence := jsonb_build_object('staff_id', v_new->'staff_id', 'duration_minutes', v_new->'duration_minutes');
  elsif tg_table_name = 'academy_risk_evaluations' and tg_op = 'INSERT' then
    v_event := 'retention.risk_detected';
    v_evidence := jsonb_build_object('risk_level', v_new->'risk_level', 'score', v_new->'score');
  elsif tg_table_name = 'academy_intervention_cases' and (tg_op = 'INSERT' or v_old->>'status' is distinct from v_new->>'status') then
    v_event := case when tg_op = 'INSERT' then 'retention.intervention_created' when v_new->>'status' in ('resolved','closed_unsuccessful') then 'retention.intervention_outcome_recorded' else 'retention.intervention_updated' end;
    v_evidence := jsonb_build_object('status', v_new->'status', 'outcome', v_new->'outcome');
  elsif tg_table_name = 'academy_renewal_opportunities' and (tg_op = 'INSERT' or v_old->>'status' is distinct from v_new->>'status') then
    v_event := case when tg_op = 'INSERT' then 'renewal.started' when v_new->>'status' = 'renewed' then 'renewal.renewed' when v_new->>'status' in ('declined','expired') then 'renewal.left' else 'renewal.updated' end;
    v_evidence := jsonb_build_object('status', v_new->'status', 'due_on', v_new->'renewal_due_on', 'outcome_reason', v_new->'outcome_reason');
  end if;

  if v_event is null then return new; end if;
  if v_contact is null and v_lead is not null then
    select c.contact_id into v_contact from public.academy_lead_conversions c
      where c.academy_id = v_academy and c.lead_id = v_lead;
  end if;
  if v_lead is null and v_contact is not null then
    select c.lead_id into v_lead from public.academy_lead_conversions c
      where c.academy_id = v_academy and c.contact_id = v_contact order by c.converted_at desc limit 1;
  end if;
  if v_contact is null and v_lead is null then return new; end if;

  v_key := tg_table_name || ':' || coalesce(v_source::text, 'none') || ':' || v_event || ':' ||
    coalesce(v_new->>'status', '') || ':' || coalesce(v_new->>'updated_at', v_new->>'created_at', '');
  insert into public.academy_student_lifecycle_events(
    academy_id, branch_id, lead_id, contact_id, classroom_id, subscription_id,
    guardian_relationship_id, event_key, actor_user_id, source_table, source_id,
    idempotency_key, evidence
  ) values (
    v_academy, v_branch, v_lead, v_contact, v_classroom, v_subscription,
    v_relationship, v_event, v_actor, tg_table_name, v_source, v_key, v_evidence
  ) on conflict(academy_id, idempotency_key) do nothing;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'academy_leads','academy_lead_activities','academy_trial_lessons','academy_lead_conversions',
    'academy_classroom_memberships','academy_student_guardian_relationships','academy_subscriptions',
    'academy_payments','academy_entitlements','academy_attendance','academy_lesson_progress',
    'academy_submissions','academy_quiz_attempts','academy_notifications','academy_lesson_deliveries',
    'academy_risk_evaluations','academy_intervention_cases','academy_renewal_opportunities'
  ] loop
    execute format('drop trigger if exists academy_capture_lifecycle on public.%I', t);
    execute format('create trigger academy_capture_lifecycle after insert or update on public.%I for each row execute function public.academy_capture_student_lifecycle_event()', t);
  end loop;
end;
$$;

create or replace function public.academy_reject_lifecycle_history_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Student lifecycle history is immutable';
end;
$$;
create trigger academy_student_lifecycle_events_immutable
  before update or delete on public.academy_student_lifecycle_events
  for each row execute function public.academy_reject_lifecycle_history_mutation();

create or replace function public.academy_convert_lead_full(
  p_academy_id uuid,
  p_lead_id uuid,
  p_actor_id uuid,
  p_payload jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversion_result jsonb;
  v_conversion jsonb;
  v_contact_id uuid;
  v_guardian_result jsonb;
  v_subscription jsonb;
  v_charge jsonb;
  v_guardian_payload jsonb := p_payload->'guardian';
  v_subscription_payload jsonb := p_payload->'subscription';
  v_charge_payload jsonb := p_payload->'charge';
begin
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Idempotency key is required'; end if;
  v_conversion_result := public.academy_convert_lead(
    p_academy_id,
    p_lead_id,
    p_actor_id,
    nullif(p_payload->>'classroom_id', '')::uuid,
    nullif(p_payload->>'existing_contact_id', '')::uuid,
    nullif(p_payload->>'trial_id', '')::uuid,
    p_idempotency_key || ':conversion'
  );
  v_conversion := v_conversion_result->'conversion';
  v_contact_id := nullif(v_conversion->>'contact_id', '')::uuid;
  if v_contact_id is null then raise exception 'Lead conversion did not produce a contact'; end if;

  if jsonb_typeof(v_guardian_payload) = 'object' and nullif(trim(v_guardian_payload->>'full_name'), '') is not null then
    v_guardian_result := public.academy_create_guardian_relationship(
      p_academy_id,
      p_actor_id,
      v_guardian_payload || jsonb_build_object('contact_id', v_contact_id)
    );
  end if;

  if jsonb_typeof(v_subscription_payload) = 'object' and nullif(v_subscription_payload->>'pricing_plan_id', '') is not null then
    v_subscription := public.academy_create_subscription(
      p_academy_id,
      v_contact_id,
      p_actor_id,
      v_subscription_payload || jsonb_build_object('classroom_id', coalesce(v_subscription_payload->>'classroom_id', p_payload->>'classroom_id')),
      p_idempotency_key || ':subscription'
    );
    if jsonb_typeof(v_charge_payload) = 'object' and coalesce((v_charge_payload->>'create')::boolean, false) then
      v_charge := public.academy_create_charge(
        p_academy_id,
        (v_subscription->>'id')::uuid,
        p_actor_id,
        v_charge_payload - 'create',
        p_idempotency_key || ':charge'
      );
    end if;
  end if;

  return jsonb_build_object(
    'conversion', v_conversion,
    'contact_id', v_contact_id,
    'guardian', v_guardian_result,
    'subscription', v_subscription,
    'charge', v_charge
  );
end;
$$;

create or replace view public.academy_student_lifecycle_summary
with (security_invoker = true)
as
select
  e.academy_id,
  e.contact_id,
  max(e.occurred_at) as last_event_at,
  (array_agg(e.event_key order by e.occurred_at desc))[1] as current_event,
  count(*) as event_count,
  count(*) filter (where e.event_key = 'attendance.absence_recorded' and e.occurred_at >= now() - interval '30 days') as recent_absences,
  count(*) filter (where e.event_key = 'retention.risk_detected' and e.occurred_at >= now() - interval '90 days') as recent_risk_events,
  bool_or(e.event_key = 'renewal.renewed') as has_renewed,
  bool_or(e.event_key = 'renewal.left') as has_left
from public.academy_student_lifecycle_events e
where e.contact_id is not null
group by e.academy_id, e.contact_id;

alter table public.academy_localization_settings enable row level security;
alter table public.academy_translation_overrides enable row level security;
alter table public.academy_staff_branch_assignments enable row level security;
alter table public.academy_student_lifecycle_events enable row level security;

create policy "Academy localization read by member" on public.academy_localization_settings
  for select using (public.is_academy_member(academy_id));
create policy "Academy localization manage by admin" on public.academy_localization_settings
  for all using (public.is_academy_admin(academy_id)) with check (public.is_academy_admin(academy_id));
create policy "Academy translations read by member" on public.academy_translation_overrides
  for select using (public.is_academy_member(academy_id));
create policy "Academy translations manage by admin" on public.academy_translation_overrides
  for all using (public.is_academy_admin(academy_id)) with check (public.is_academy_admin(academy_id));
create policy "Academy branch assignments read by member" on public.academy_staff_branch_assignments
  for select using (public.is_academy_member(academy_id));
create policy "Academy branch assignments manage by admin" on public.academy_staff_branch_assignments
  for all using (public.is_academy_admin(academy_id)) with check (public.is_academy_admin(academy_id));
create policy "Academy lifecycle read by intelligence operator" on public.academy_student_lifecycle_events
  for select using (public.academy_intelligence_can_access(academy_id));

revoke all on function public.academy_convert_lead_full(uuid,uuid,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.academy_convert_lead_full(uuid,uuid,uuid,jsonb,text) to service_role;

insert into public.academy_localization_settings(academy_id)
select t.id from public.tenants t
where coalesce(t.metadata->>'service_family','') = 'academy'
on conflict(academy_id) do nothing;
