-- Academy operational service loops.
-- Completes invitation, timetable, request, communication, collections,
-- workforce, safeguarding, competency, and integration workflows without
-- replacing the existing Academy business, finance, or LMS records.

create extension if not exists pgcrypto;

-- Invitation delivery and acceptance evidence --------------------------------

create table public.academy_access_invitations (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  invite_kind text not null check (invite_kind in ('student','staff','guardian')),
  email text not null,
  role text,
  contact_id uuid,
  classroom_id uuid,
  guardian_relationship_id uuid,
  token_hash text not null,
  token_expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','accepted','expired','revoked')),
  delivery_status text not null default 'queued' check (delivery_status in ('queued','sent','failed','suppressed')),
  delivery_error text,
  sent_at timestamptz,
  resend_count integer not null default 0 check (resend_count >= 0),
  last_resent_at timestamptz,
  accepted_by uuid references public.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_by uuid references public.users(id) on delete set null,
  revoked_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (academy_id, id),
  unique (token_hash),
  foreign key (academy_id, contact_id) references public.academy_contacts(academy_id, id) on delete restrict,
  foreign key (academy_id, classroom_id) references public.academy_classrooms(academy_id, id) on delete restrict,
  foreign key (academy_id, guardian_relationship_id) references public.academy_student_guardian_relationships(academy_id, id) on delete restrict,
  check (
    (invite_kind = 'student' and contact_id is not null and classroom_id is not null) or
    (invite_kind = 'staff' and role is not null) or
    (invite_kind = 'guardian' and guardian_relationship_id is not null)
  )
);
create unique index academy_access_invitations_active_target_uidx
  on public.academy_access_invitations(
    academy_id,
    invite_kind,
    email,
    coalesce(classroom_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(guardian_relationship_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(role, '')
  ) where status = 'pending';
create index academy_access_invitations_queue_idx
  on public.academy_access_invitations(delivery_status, created_at) where status = 'pending';

-- Term timetable planning and repeatable generation ---------------------------

create table public.academy_timetable_terms (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid,
  academic_calendar_id uuid,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  timezone text not null default 'Asia/Tashkent',
  status text not null default 'draft' check (status in ('draft','active','completed','archived')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (academy_id, id),
  foreign key (academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict,
  foreign key (academy_id, academic_calendar_id) references public.academy_academic_calendars(academy_id, id) on delete restrict,
  check (ends_on >= starts_on)
);

create table public.academy_timetable_series (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  term_id uuid not null,
  classroom_id uuid not null,
  source_schedule_id uuid not null,
  branch_id uuid,
  room_id uuid,
  primary_staff_id uuid,
  title text not null,
  session_type text not null default 'regular',
  delivery_mode text not null default 'physical' check (delivery_mode in ('physical','online','hybrid')),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'draft' check (status in ('draft','active','paused','completed','archived')),
  skip_calendar_closures boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (academy_id, id),
  foreign key (academy_id, term_id) references public.academy_timetable_terms(academy_id, id) on delete restrict,
  foreign key (academy_id, classroom_id) references public.academy_classrooms(academy_id, id) on delete restrict,
  foreign key (academy_id, source_schedule_id) references public.academy_classroom_schedules(academy_id, id) on delete restrict,
  foreign key (academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict,
  foreign key (academy_id, room_id) references public.academy_rooms(academy_id, id) on delete restrict,
  foreign key (academy_id, primary_staff_id) references public.academy_staff(academy_id, id) on delete restrict,
  check (ends_on >= starts_on)
);

create table public.academy_timetable_generation_runs (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  term_id uuid not null,
  dry_run boolean not null default true,
  status text not null default 'running' check (status in ('running','preview_ready','completed','failed')),
  candidate_count integer not null default 0 check (candidate_count >= 0),
  conflict_count integer not null default 0 check (conflict_count >= 0),
  generated_count integer not null default 0 check (generated_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  error text,
  requested_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (academy_id, id),
  foreign key (academy_id, term_id) references public.academy_timetable_terms(academy_id, id) on delete restrict
);

alter table public.academy_lesson_sessions
  add column if not exists timetable_term_id uuid,
  add column if not exists timetable_series_id uuid,
  add column if not exists timetable_occurrence_date date,
  add column if not exists timetable_generation_run_id uuid;
alter table public.academy_lesson_sessions
  add constraint academy_lesson_sessions_timetable_term_fk
    foreign key (academy_id, timetable_term_id) references public.academy_timetable_terms(academy_id, id) on delete restrict,
  add constraint academy_lesson_sessions_timetable_series_fk
    foreign key (academy_id, timetable_series_id) references public.academy_timetable_series(academy_id, id) on delete restrict,
  add constraint academy_lesson_sessions_timetable_run_fk
    foreign key (academy_id, timetable_generation_run_id) references public.academy_timetable_generation_runs(academy_id, id) on delete restrict;
create unique index academy_lesson_sessions_series_occurrence_uidx
  on public.academy_lesson_sessions(academy_id, timetable_series_id, timetable_occurrence_date)
  where timetable_series_id is not null and timetable_occurrence_date is not null;

-- Learner and guardian service requests --------------------------------------

create table public.academy_service_requests (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid,
  requester_kind text not null check (requester_kind in ('student','guardian','staff')),
  requester_user_id uuid not null references public.users(id) on delete restrict,
  contact_id uuid,
  guardian_id uuid,
  staff_id uuid,
  classroom_id uuid,
  charge_id uuid,
  request_type text not null check (request_type in ('make_up','freeze','transfer','refund','schedule_change','document','support','other')),
  subject text not null,
  details text not null,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'submitted' check (status in ('submitted','triaged','in_review','waiting_for_requester','approved','rejected','completed','cancelled')),
  desired_date date,
  assigned_to uuid references public.users(id) on delete set null,
  resolution text,
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  sla_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (academy_id, id),
  foreign key (academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict,
  foreign key (academy_id, contact_id) references public.academy_contacts(academy_id, id) on delete restrict,
  foreign key (academy_id, guardian_id) references public.academy_guardians(academy_id, id) on delete restrict,
  foreign key (academy_id, staff_id) references public.academy_staff(academy_id, id) on delete restrict,
  foreign key (academy_id, classroom_id) references public.academy_classrooms(academy_id, id) on delete restrict,
  foreign key (academy_id, charge_id) references public.academy_charges(academy_id, id) on delete restrict,
  check (
    (requester_kind = 'student' and contact_id is not null) or
    (requester_kind = 'guardian' and guardian_id is not null and contact_id is not null) or
    (requester_kind = 'staff' and staff_id is not null)
  )
);
create index academy_service_requests_queue_idx
  on public.academy_service_requests(academy_id, status, priority, created_at);

create table public.academy_service_request_events (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  request_id uuid not null,
  event_type text not null check (event_type in ('submitted','note','assigned','status_changed','requester_reply','resolved')),
  from_status text,
  to_status text,
  note text,
  actor_user_id uuid references public.users(id) on delete set null,
  visible_to_requester boolean not null default true,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (academy_id, id),
  foreign key (academy_id, request_id) references public.academy_service_requests(academy_id, id) on delete cascade
);

-- Communication journeys -----------------------------------------------------

create table public.academy_communication_journeys (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid,
  journey_key text not null,
  name text not null,
  audience text not null check (audience in ('student','guardian','staff')),
  trigger_key text not null check (trigger_key in ('manual','student.enrolled','student.absent','payment.due_soon','payment.overdue','schedule.changed','assignment.missing','course.completed')),
  status text not null default 'draft' check (status in ('draft','active','paused','retired')),
  quiet_hours_policy text not null default 'recipient' check (quiet_hours_policy in ('recipient','academy','none')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (academy_id, id),
  unique (academy_id, journey_key),
  foreign key (academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict
);

create table public.academy_communication_journey_steps (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  journey_id uuid not null,
  position integer not null check (position > 0),
  delay_minutes integer not null default 0 check (delay_minutes >= 0),
  channel text not null check (channel in ('inapp','telegram','email','sms')),
  title_template text,
  body_template text not null,
  requires_review boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (academy_id, id),
  unique (academy_id, journey_id, position),
  foreign key (academy_id, journey_id) references public.academy_communication_journeys(academy_id, id) on delete cascade
);

create table public.academy_communication_enrollments (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  journey_id uuid not null,
  contact_id uuid,
  guardian_id uuid,
  staff_id uuid,
  status text not null default 'active' check (status in ('active','paused','completed','cancelled','failed')),
  current_position integer not null default 1 check (current_position > 0),
  next_step_at timestamptz not null default now(),
  last_step_at timestamptz,
  idempotency_key text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (academy_id, id),
  unique (academy_id, idempotency_key),
  foreign key (academy_id, journey_id) references public.academy_communication_journeys(academy_id, id) on delete restrict,
  foreign key (academy_id, contact_id) references public.academy_contacts(academy_id, id) on delete restrict,
  foreign key (academy_id, guardian_id) references public.academy_guardians(academy_id, id) on delete restrict,
  foreign key (academy_id, staff_id) references public.academy_staff(academy_id, id) on delete restrict,
  check (num_nonnulls(contact_id, guardian_id, staff_id) = 1)
);
create index academy_communication_enrollments_due_idx
  on public.academy_communication_enrollments(status, next_step_at) where status = 'active';

-- Collections execution ------------------------------------------------------

create table public.academy_collection_cases (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid,
  contact_id uuid not null,
  charge_id uuid,
  owner_user_id uuid references public.users(id) on delete set null,
  stage text not null default 'reminder' check (stage in ('reminder','promise','escalated','disputed','settled','written_off','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  outstanding_amount bigint not null default 0 check (outstanding_amount >= 0),
  currency text not null default 'UZS',
  next_action_at timestamptz,
  status text not null default 'open' check (status in ('open','waiting','resolved','cancelled')),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (academy_id, id),
  foreign key (academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict,
  foreign key (academy_id, contact_id) references public.academy_contacts(academy_id, id) on delete restrict,
  foreign key (academy_id, charge_id) references public.academy_charges(academy_id, id) on delete restrict
);
create unique index academy_collection_cases_open_charge_uidx
  on public.academy_collection_cases(academy_id, charge_id)
  where charge_id is not null and status in ('open','waiting');

create table public.academy_collection_attempts (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid not null,
  attempt_type text not null check (attempt_type in ('call','telegram','email','sms','inapp','meeting','payment_link','promise','note')),
  outcome text not null check (outcome in ('queued','sent','delivered','contacted','no_answer','promised','paid','disputed','failed','not_applicable')),
  notification_id uuid,
  payment_promise_id uuid,
  note text,
  next_action_at timestamptz,
  actor_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (academy_id, id),
  foreign key (academy_id, case_id) references public.academy_collection_cases(academy_id, id) on delete cascade,
  foreign key (academy_id, notification_id) references public.academy_notifications(academy_id, id) on delete restrict,
  foreign key (academy_id, payment_promise_id) references public.academy_payment_promises(academy_id, id) on delete restrict
);

-- Workforce self-service -----------------------------------------------------

create table public.academy_staff_requests (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid,
  staff_id uuid not null,
  request_type text not null check (request_type in ('leave','availability','schedule_change','substitution','payroll_question','document','other')),
  starts_at timestamptz,
  ends_at timestamptz,
  reason text not null,
  status text not null default 'submitted' check (status in ('submitted','in_review','approved','rejected','fulfilled','cancelled')),
  replacement_staff_id uuid,
  assigned_to uuid references public.users(id) on delete set null,
  decision_note text,
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (academy_id, id),
  foreign key (academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict,
  foreign key (academy_id, staff_id) references public.academy_staff(academy_id, id) on delete restrict,
  foreign key (academy_id, replacement_staff_id) references public.academy_staff(academy_id, id) on delete restrict,
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index academy_staff_requests_queue_idx
  on public.academy_staff_requests(academy_id, status, starts_at);

-- Restricted complaints and safeguarding cases ------------------------------

create table public.academy_sensitive_cases (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid,
  case_number bigint generated always as identity,
  case_type text not null check (case_type in ('complaint','safeguarding','harassment','conduct','privacy','academic_integrity','other')),
  title text not null,
  description text not null,
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  confidentiality text not null default 'restricted' check (confidentiality in ('restricted','owner_only')),
  status text not null default 'open' check (status in ('open','triage','investigating','action_required','resolved','closed')),
  reporter_user_id uuid references public.users(id) on delete set null,
  reporter_contact_id uuid,
  subject_contact_id uuid,
  subject_staff_id uuid,
  assigned_to uuid references public.users(id) on delete set null,
  due_at timestamptz,
  resolution_summary text,
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (academy_id, id),
  unique (academy_id, case_number),
  foreign key (academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict,
  foreign key (academy_id, reporter_contact_id) references public.academy_contacts(academy_id, id) on delete restrict,
  foreign key (academy_id, subject_contact_id) references public.academy_contacts(academy_id, id) on delete restrict,
  foreign key (academy_id, subject_staff_id) references public.academy_staff(academy_id, id) on delete restrict
);
create index academy_sensitive_cases_queue_idx
  on public.academy_sensitive_cases(academy_id, status, severity, created_at);

create table public.academy_sensitive_case_events (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid not null,
  event_type text not null check (event_type in ('created','note','assignment','status_changed','evidence_added','resolution')),
  note text,
  from_status text,
  to_status text,
  actor_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (academy_id, id),
  foreign key (academy_id, case_id) references public.academy_sensitive_cases(academy_id, id) on delete cascade
);

-- Competency frameworks and individualized learning plans --------------------

create table public.academy_competency_frameworks (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (academy_id, id),
  unique (academy_id, code)
);

create table public.academy_competencies (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  framework_id uuid not null,
  parent_id uuid,
  code text not null,
  title text not null,
  description text,
  level_scale jsonb not null default '[{"level":1,"label":"Beginning"},{"level":2,"label":"Developing"},{"level":3,"label":"Secure"},{"level":4,"label":"Advanced"}]'::jsonb check (jsonb_typeof(level_scale) = 'array'),
  position integer not null default 1 check (position > 0),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, id),
  unique (academy_id, framework_id, code),
  foreign key (academy_id, framework_id) references public.academy_competency_frameworks(academy_id, id) on delete cascade,
  foreign key (academy_id, parent_id) references public.academy_competencies(academy_id, id) on delete restrict
);

create table public.academy_learning_plans (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null,
  framework_id uuid not null,
  title text not null,
  goal text not null,
  starts_on date not null default current_date,
  target_date date,
  status text not null default 'active' check (status in ('draft','active','completed','paused','cancelled')),
  coach_user_id uuid references public.users(id) on delete set null,
  published_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (academy_id, id),
  foreign key (academy_id, contact_id) references public.academy_contacts(academy_id, id) on delete restrict,
  foreign key (academy_id, framework_id) references public.academy_competency_frameworks(academy_id, id) on delete restrict,
  check (target_date is null or target_date >= starts_on)
);

create table public.academy_learning_plan_items (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  plan_id uuid not null,
  competency_id uuid not null,
  baseline_level numeric(6,2),
  target_level numeric(6,2) not null,
  current_level numeric(6,2),
  status text not null default 'not_started' check (status in ('not_started','in_progress','achieved','deferred')),
  target_date date,
  notes text,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, id),
  unique (academy_id, plan_id, competency_id),
  foreign key (academy_id, plan_id) references public.academy_learning_plans(academy_id, id) on delete cascade,
  foreign key (academy_id, competency_id) references public.academy_competencies(academy_id, id) on delete restrict
);

create table public.academy_competency_evidence (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  plan_item_id uuid not null,
  evidence_type text not null check (evidence_type in ('assignment','quiz','observation','attendance','external','note')),
  source_id uuid,
  observed_level numeric(6,2),
  note text,
  observed_by uuid references public.users(id) on delete set null,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (academy_id, id),
  foreign key (academy_id, plan_item_id) references public.academy_learning_plan_items(academy_id, id) on delete cascade
);

-- Outbound integrations and governed exports --------------------------------

create table public.academy_integration_endpoints (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  endpoint_url text not null,
  signing_secret text not null,
  signing_secret_last4 text not null,
  event_types text[] not null default '{}'::text[],
  status text not null default 'active' check (status in ('active','paused','revoked')),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (academy_id, id)
);

create table public.academy_integration_deliveries (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  endpoint_id uuid not null,
  event_type text not null,
  event_id text,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'queued' check (status in ('queued','delivering','delivered','retrying','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  response_status integer,
  response_excerpt text,
  error text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (academy_id, id),
  unique (academy_id, idempotency_key),
  foreign key (academy_id, endpoint_id) references public.academy_integration_endpoints(academy_id, id) on delete cascade
);
create index academy_integration_deliveries_due_idx
  on public.academy_integration_deliveries(status, next_attempt_at) where status in ('queued','retrying');

create table public.academy_export_jobs (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  export_type text not null check (export_type in ('contacts','students','attendance','balances','payments','payroll','service_requests','learning_plans')),
  format text not null default 'csv' check (format in ('csv','json')),
  status text not null default 'queued' check (status in ('queued','running','ready','failed','expired')),
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  row_count integer check (row_count is null or row_count >= 0),
  result_data jsonb,
  error text,
  requested_by uuid not null references public.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz,
  unique (academy_id, id),
  check (result_data is null or jsonb_typeof(result_data) in ('array','object'))
);

-- RLS: staff read through established academy scopes. Mutations are performed
-- through the Academy Edge Function, which enforces action-specific roles.

alter table public.academy_access_invitations enable row level security;
alter table public.academy_timetable_terms enable row level security;
alter table public.academy_timetable_series enable row level security;
alter table public.academy_timetable_generation_runs enable row level security;
alter table public.academy_service_requests enable row level security;
alter table public.academy_service_request_events enable row level security;
alter table public.academy_communication_journeys enable row level security;
alter table public.academy_communication_journey_steps enable row level security;
alter table public.academy_communication_enrollments enable row level security;
alter table public.academy_collection_cases enable row level security;
alter table public.academy_collection_attempts enable row level security;
alter table public.academy_staff_requests enable row level security;
alter table public.academy_sensitive_cases enable row level security;
alter table public.academy_sensitive_case_events enable row level security;
alter table public.academy_competency_frameworks enable row level security;
alter table public.academy_competencies enable row level security;
alter table public.academy_learning_plans enable row level security;
alter table public.academy_learning_plan_items enable row level security;
alter table public.academy_competency_evidence enable row level security;
alter table public.academy_integration_endpoints enable row level security;
alter table public.academy_integration_deliveries enable row level security;
alter table public.academy_export_jobs enable row level security;

create policy "Academy invitations read by staff" on public.academy_access_invitations
  for select using (public.academy_org_can_manage(academy_id));
create policy "Academy timetable terms read by staff" on public.academy_timetable_terms
  for select using (public.academy_org_can_manage(academy_id));
create policy "Academy timetable series read by staff" on public.academy_timetable_series
  for select using (public.academy_org_can_manage(academy_id));
create policy "Academy timetable runs read by staff" on public.academy_timetable_generation_runs
  for select using (public.academy_org_can_manage(academy_id));
create policy "Academy service requests read by staff" on public.academy_service_requests
  for select using (public.academy_intelligence_can_access(academy_id));
create policy "Requesters read own academy service requests" on public.academy_service_requests
  for select using (requester_user_id = auth.uid());
create policy "Academy service request events read by staff" on public.academy_service_request_events
  for select using (public.academy_intelligence_can_access(academy_id));
create policy "Requesters read visible academy service events" on public.academy_service_request_events
  for select using (
    visible_to_requester and exists (
      select 1 from public.academy_service_requests request
      where request.academy_id = academy_service_request_events.academy_id
        and request.id = academy_service_request_events.request_id
        and request.requester_user_id = auth.uid()
    )
  );
create policy "Academy communication journeys read by staff" on public.academy_communication_journeys
  for select using (public.academy_org_can_manage(academy_id));
create policy "Academy communication steps read by staff" on public.academy_communication_journey_steps
  for select using (public.academy_org_can_manage(academy_id));
create policy "Academy communication enrollments read by staff" on public.academy_communication_enrollments
  for select using (public.academy_org_can_manage(academy_id));
create policy "Academy collection cases read by finance staff" on public.academy_collection_cases
  for select using (public.academy_finance_can_view(academy_id));
create policy "Academy collection attempts read by finance staff" on public.academy_collection_attempts
  for select using (public.academy_finance_can_view(academy_id));
create policy "Academy staff requests read by staff" on public.academy_staff_requests
  for select using (public.academy_org_can_manage(academy_id));
create policy "Staff read own requests" on public.academy_staff_requests
  for select using (created_by = auth.uid());

create or replace function public.academy_sensitive_case_can_view(p_academy_id uuid, p_confidentiality text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = p_academy_id and membership.user_id = auth.uid()
      and membership.status = 'active' and membership.role in ('owner','admin')
  ) or (
    p_confidentiality = 'restricted' and exists (
      select 1 from public.academy_role_grants grant_row
      where grant_row.academy_id = p_academy_id and grant_row.user_id = auth.uid()
        and grant_row.status = 'active' and grant_row.role in ('owner','admin','center_admin','manager','counselor')
        and grant_row.starts_at <= now() and (grant_row.expires_at is null or grant_row.expires_at > now())
    )
  );
$$;
revoke all on function public.academy_sensitive_case_can_view(uuid, text) from public, anon;
grant execute on function public.academy_sensitive_case_can_view(uuid, text) to authenticated, service_role;
create policy "Restricted users read sensitive cases" on public.academy_sensitive_cases
  for select using (public.academy_sensitive_case_can_view(academy_id, confidentiality));
create policy "Restricted users read sensitive case events" on public.academy_sensitive_case_events
  for select using (exists (
    select 1 from public.academy_sensitive_cases sensitive_case
    where sensitive_case.academy_id = academy_sensitive_case_events.academy_id
      and sensitive_case.id = academy_sensitive_case_events.case_id
      and public.academy_sensitive_case_can_view(sensitive_case.academy_id, sensitive_case.confidentiality)
  ));
create policy "Academy competency frameworks read by staff" on public.academy_competency_frameworks
  for select using (public.academy_org_can_manage(academy_id));
create policy "Academy competencies read by staff" on public.academy_competencies
  for select using (public.academy_org_can_manage(academy_id));
create policy "Academy learning plans read by staff" on public.academy_learning_plans
  for select using (public.academy_intelligence_can_access(academy_id));
create policy "Students read own published learning plans" on public.academy_learning_plans
  for select using (
    published_at is not null and exists (
      select 1 from public.academy_contacts contact
      where contact.academy_id = academy_learning_plans.academy_id
        and contact.id = academy_learning_plans.contact_id
        and contact.user_id = auth.uid()
    )
  );
create policy "Academy learning plan items read by staff" on public.academy_learning_plan_items
  for select using (public.academy_intelligence_can_access(academy_id));
create policy "Students read own learning plan items" on public.academy_learning_plan_items
  for select using (exists (
    select 1 from public.academy_learning_plans plan
    join public.academy_contacts contact on contact.academy_id = plan.academy_id and contact.id = plan.contact_id
    where plan.academy_id = academy_learning_plan_items.academy_id
      and plan.id = academy_learning_plan_items.plan_id
      and plan.published_at is not null and contact.user_id = auth.uid()
  ));
create policy "Academy competency evidence read by staff" on public.academy_competency_evidence
  for select using (public.academy_intelligence_can_access(academy_id));
create policy "Students read own competency evidence" on public.academy_competency_evidence
  for select using (exists (
    select 1 from public.academy_learning_plan_items item
    join public.academy_learning_plans plan on plan.academy_id = item.academy_id and plan.id = item.plan_id
    join public.academy_contacts contact on contact.academy_id = plan.academy_id and contact.id = plan.contact_id
    where item.academy_id = academy_competency_evidence.academy_id
      and item.id = academy_competency_evidence.plan_item_id
      and plan.published_at is not null and contact.user_id = auth.uid()
  ));
create policy "Academy exports read by requester" on public.academy_export_jobs
  for select using (requested_by = auth.uid() or public.academy_intelligence_can_access(academy_id));

-- Direct table grants stay read-only. The Edge Function owns validated writes.
grant select on public.academy_access_invitations, public.academy_timetable_terms,
  public.academy_timetable_series, public.academy_timetable_generation_runs,
  public.academy_service_requests, public.academy_service_request_events,
  public.academy_communication_journeys, public.academy_communication_journey_steps,
  public.academy_communication_enrollments, public.academy_collection_cases,
  public.academy_collection_attempts, public.academy_staff_requests,
  public.academy_sensitive_cases, public.academy_sensitive_case_events,
  public.academy_competency_frameworks, public.academy_competencies,
  public.academy_learning_plans, public.academy_learning_plan_items,
  public.academy_competency_evidence, public.academy_export_jobs to authenticated;

-- Endpoint signing secrets and delivery payloads never receive authenticated
-- table grants. Administrators only see redacted endpoint summaries through
-- the Academy Edge Function.

-- Keep updated_at consistent with the existing Academy records.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'academy_access_invitations','academy_timetable_terms','academy_timetable_series',
    'academy_service_requests','academy_communication_journeys','academy_communication_journey_steps',
    'academy_communication_enrollments','academy_collection_cases','academy_staff_requests',
    'academy_sensitive_cases','academy_competency_frameworks','academy_competencies',
    'academy_learning_plans','academy_learning_plan_items','academy_integration_endpoints'
  ] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute procedure public.handle_teacher_studio_updated_at()', table_name, table_name);
  end loop;
end;
$$;
