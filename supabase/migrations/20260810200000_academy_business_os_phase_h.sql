-- Education Business OS Phase H: bounded automation, governed AI assistance, mature imports, and audit context.

alter table public.academy_audit_events
  add column if not exists branch_id uuid,
  add column if not exists request_id text,
  add column if not exists idempotency_key text,
  add column if not exists before_snapshot jsonb,
  add column if not exists after_snapshot jsonb,
  add column if not exists context jsonb not null default '{}'::jsonb;
alter table public.academy_audit_events
  add constraint academy_audit_events_branch_fk
  foreign key(academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict;
create index if not exists academy_audit_events_request_idx
  on public.academy_audit_events(academy_id, request_id) where request_id is not null;
create unique index if not exists academy_audit_events_idempotency_uidx
  on public.academy_audit_events(academy_id, idempotency_key) where idempotency_key is not null;

create or replace function public.academy_reject_audit_history_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Academy audit history is immutable';
end;
$$;
drop trigger if exists academy_audit_events_immutable on public.academy_audit_events;
create trigger academy_audit_events_immutable
  before update or delete on public.academy_audit_events
  for each row execute function public.academy_reject_audit_history_mutation();

drop policy if exists "Academy audit events read by member" on public.academy_audit_events;
create policy "Academy audit events read by operator" on public.academy_audit_events
  for select using (public.academy_intelligence_can_access(academy_id));

alter table public.academy_automation_rules
  add column if not exists current_version integer not null default 1,
  add column if not exists lifecycle_status text not null default 'active',
  add column if not exists branch_id uuid,
  add column if not exists updated_by uuid;
alter table public.academy_automation_rules
  add constraint academy_automation_rules_lifecycle_status_check
  check (lifecycle_status in ('draft','active','paused','retired'));
alter table public.academy_automation_rules
  add constraint academy_automation_rules_branch_fk
  foreign key(academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict;
alter table public.academy_automation_rules
  add constraint academy_automation_rules_updated_by_fk
  foreign key(updated_by) references public.users(id) on delete set null;
alter table public.academy_automation_rules
  add constraint academy_automation_rules_academy_id_id_unique unique(academy_id, id);

create table public.academy_automation_rule_versions (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete restrict,
  rule_id uuid not null,
  branch_id uuid,
  version integer not null check (version > 0),
  trigger_key text not null check (trigger_key in (
    'lead.created','lead.assigned','lead.stage_changed','trial.scheduled','trial.missed',
    'student.enrolled','student.absent','attendance.threshold_crossed','payment.due_soon',
    'payment.overdue','payment.received','grade.published','assignment.missing',
    'risk.score_changed','subscription.expiring','student.course_completed','manual'
  )),
  condition_tree jsonb not null default '{"all":[]}'::jsonb check (jsonb_typeof(condition_tree) = 'object'),
  actions jsonb not null check (jsonb_typeof(actions) = 'array' and jsonb_array_length(actions) > 0),
  safeguard_mode text not null default 'standard' check (safeguard_mode in ('standard','human_review_required')),
  status text not null default 'draft' check (status in ('draft','active','retired')),
  effective_from timestamptz,
  effective_to timestamptz,
  idempotency_key text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(academy_id, id),
  unique(academy_id, rule_id, version),
  unique(academy_id, idempotency_key),
  foreign key(academy_id, rule_id) references public.academy_automation_rules(academy_id, id) on delete restrict
  ,foreign key(academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict
);
create unique index academy_automation_rule_versions_one_active_idx
  on public.academy_automation_rule_versions(academy_id, rule_id) where status = 'active';
create index academy_automation_rule_versions_trigger_idx
  on public.academy_automation_rule_versions(academy_id, trigger_key, status);

create table public.academy_automation_executions (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete restrict,
  rule_version_id uuid not null,
  branch_id uuid,
  source_event_id uuid,
  trigger_key text not null,
  subject_type text,
  subject_id uuid,
  status text not null default 'pending' check (status in ('pending','awaiting_review','running','succeeded','partially_succeeded','failed','skipped','cancelled')),
  condition_matched boolean,
  input_snapshot jsonb not null default '{}'::jsonb,
  condition_evidence jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  retry_count integer not null default 0 check (retry_count >= 0),
  error_code text,
  error_detail text,
  started_at timestamptz,
  finished_at timestamptz,
  requested_by uuid references public.users(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(academy_id, id),
  unique(academy_id, idempotency_key),
  foreign key(academy_id, rule_version_id) references public.academy_automation_rule_versions(academy_id, id) on delete restrict,
  foreign key(academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict,
  foreign key(source_event_id) references public.domain_event_outbox(id) on delete restrict
);
create index academy_automation_execution_queue_idx
  on public.academy_automation_executions(academy_id, status, created_at);

create table public.academy_automation_effects (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete restrict,
  execution_id uuid not null,
  branch_id uuid,
  action_index integer not null check (action_index >= 0),
  action_type text not null check (action_type in (
    'create_task','notify_staff','notify_guardian','send_telegram','send_email',
    'create_alert','assign_employee','add_tag','enqueue_review'
  )),
  status text not null default 'pending' check (status in ('pending','awaiting_review','succeeded','failed','skipped')),
  payload_snapshot jsonb not null default '{}'::jsonb,
  result_snapshot jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  external_reference text,
  error_code text,
  error_detail text,
  attempted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(academy_id, id),
  unique(academy_id, idempotency_key),
  unique(academy_id, execution_id, action_index),
  foreign key(academy_id, execution_id) references public.academy_automation_executions(academy_id, id) on delete restrict
  ,foreign key(academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict
);

create table public.academy_ai_assistance_requests (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid,
  request_kind text not null check (request_kind in (
    'operations_summary','student_progress_summary','parent_report_draft','lead_history_summary',
    'follow_up_draft','classroom_performance_summary','unusual_change_explanation',
    'risk_explanation','announcement_draft','owner_question'
  )),
  subject_type text,
  subject_id uuid,
  question text,
  status text not null default 'requested' check (status in ('requested','generating','ready','reviewed','approved','rejected','failed')),
  evidence_snapshot jsonb not null check (jsonb_typeof(evidence_snapshot) = 'object'),
  proposed_output jsonb,
  provider text,
  model text,
  ai_status text,
  ai_error text,
  requested_by uuid not null references public.users(id) on delete restrict,
  reviewed_by uuid references public.users(id) on delete set null,
  review_note text,
  requested_at timestamptz not null default now(),
  generated_at timestamptz,
  reviewed_at timestamptz,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(academy_id, id),
  unique(academy_id, idempotency_key),
  foreign key(academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict,
  check (proposed_output is null or jsonb_typeof(proposed_output) = 'object')
);
create index academy_ai_assistance_review_queue_idx
  on public.academy_ai_assistance_requests(academy_id, status, requested_at desc);

create table public.academy_ai_assistance_reviews (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete restrict,
  request_id uuid not null,
  decision text not null check (decision in ('reviewed','approved','rejected')),
  note text,
  reviewed_by uuid not null references public.users(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  output_snapshot jsonb not null,
  unique(academy_id, id),
  foreign key(academy_id, request_id) references public.academy_ai_assistance_requests(academy_id, id) on delete restrict
);

alter table public.academy_import_jobs drop constraint if exists academy_import_jobs_import_type_check;
alter table public.academy_import_jobs add constraint academy_import_jobs_import_type_check check(import_type in (
  'contacts','leads','guardians','staff','classrooms','balances','enrollments','attendance'
));
alter table public.academy_import_jobs
  add column if not exists import_mode text not null default 'dry_run' check (import_mode in ('dry_run','commit')),
  add column if not exists duplicate_strategy text not null default 'reject' check (duplicate_strategy in ('reject','skip','update_safe_fields')),
  add column if not exists rollback_status text not null default 'not_requested' check (rollback_status in ('not_requested','available','in_progress','completed','partial','manual_required','unavailable')),
  add column if not exists rollback_reason text,
  add column if not exists rolled_back_by uuid references public.users(id) on delete set null,
  add column if not exists rolled_back_at timestamptz;
alter table public.academy_import_rows
  add column if not exists duplicate_key text,
  add column if not exists target_table text;

create table public.academy_import_effects (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete restrict,
  import_job_id uuid not null,
  import_row_id uuid not null,
  target_table text not null,
  target_id uuid not null,
  effect_type text not null check (effect_type in ('insert','safe_update','ledger_opening_balance')),
  rollback_strategy text not null check (rollback_strategy in ('delete_if_unreferenced','restore_snapshot','append_reversal','manual_review')),
  before_snapshot jsonb,
  after_snapshot jsonb not null,
  rollback_status text not null default 'pending' check (rollback_status in ('pending','completed','skipped','failed','manual_required')),
  rollback_reference_id uuid,
  rollback_error text,
  created_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  unique(academy_id, id),
  unique(academy_id, import_row_id),
  foreign key(academy_id, import_job_id) references public.academy_import_jobs(academy_id, id) on delete restrict,
  foreign key(academy_id, import_row_id) references public.academy_import_rows(academy_id, id) on delete restrict
);

create or replace function public.academy_reject_automation_evidence_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Automation, AI review, and import effect evidence is append-only';
end;
$$;
create trigger academy_ai_reviews_immutable before update or delete on public.academy_ai_assistance_reviews
  for each row execute function public.academy_reject_automation_evidence_mutation();

create or replace function public.academy_create_automation_version(
  p_academy_id uuid,
  p_rule_id uuid,
  p_actor_id uuid,
  p_payload jsonb,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rule public.academy_automation_rules%rowtype;
  v_version public.academy_automation_rule_versions%rowtype;
  v_next integer;
  v_status text := coalesce(nullif(lower(trim(p_payload->>'status')),''),'draft');
begin
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'Idempotency key is required'; end if;
  select * into v_version from public.academy_automation_rule_versions
    where academy_id=p_academy_id and idempotency_key=p_idempotency_key;
  if found then return to_jsonb(v_version); end if;
  select * into v_rule from public.academy_automation_rules where academy_id=p_academy_id and id=p_rule_id for update;
  if not found then raise exception 'Automation rule not found'; end if;
  select coalesce(max(version),0)+1 into v_next from public.academy_automation_rule_versions
    where academy_id=p_academy_id and rule_id=p_rule_id;
  if v_status='active' then
    update public.academy_automation_rule_versions set status='retired',effective_to=now()
      where academy_id=p_academy_id and rule_id=p_rule_id and status='active';
  end if;
  insert into public.academy_automation_rule_versions(
    academy_id,rule_id,branch_id,version,trigger_key,condition_tree,actions,safeguard_mode,status,effective_from,idempotency_key,created_by
  ) values(
    p_academy_id,p_rule_id,v_rule.branch_id,v_next,lower(trim(p_payload->>'trigger_key')),
    coalesce(p_payload->'condition_tree','{"all":[]}'::jsonb),p_payload->'actions',
    coalesce(nullif(lower(trim(p_payload->>'safeguard_mode')),''),'standard'),v_status,
    case when v_status='active' then now() else null end,p_idempotency_key,p_actor_id
  ) returning * into v_version;
  update public.academy_automation_rules set current_version=v_next,lifecycle_status=v_status,updated_by=p_actor_id,updated_at=now()
    where academy_id=p_academy_id and id=p_rule_id;
  insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,idempotency_key,after_snapshot)
    values(p_academy_id,p_actor_id,'automation.version_created','academy_automation_rule_version',v_version.id::text,p_idempotency_key,to_jsonb(v_version));
  return to_jsonb(v_version);
end;
$$;

create or replace function public.academy_begin_automation_execution(
  p_academy_id uuid,
  p_rule_version_id uuid,
  p_actor_id uuid,
  p_payload jsonb,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_version public.academy_automation_rule_versions%rowtype;
  v_execution public.academy_automation_executions%rowtype;
begin
  select * into v_execution from public.academy_automation_executions
    where academy_id=p_academy_id and idempotency_key=p_idempotency_key;
  if found then return to_jsonb(v_execution); end if;
  select * into v_version from public.academy_automation_rule_versions
    where academy_id=p_academy_id and id=p_rule_version_id and status='active';
  if not found then raise exception 'Active automation rule version not found'; end if;
  if v_version.trigger_key <> coalesce(nullif(lower(trim(p_payload->>'trigger_key')),''),'manual') then
    raise exception 'Automation trigger does not match active rule version';
  end if;
  insert into public.academy_automation_executions(
    academy_id,rule_version_id,branch_id,source_event_id,trigger_key,subject_type,subject_id,status,
    input_snapshot,idempotency_key,requested_by
  ) values(
    p_academy_id,p_rule_version_id,v_version.branch_id,nullif(p_payload->>'source_event_id','')::uuid,v_version.trigger_key,
    nullif(trim(p_payload->>'subject_type'),''),nullif(p_payload->>'subject_id','')::uuid,
    case when v_version.safeguard_mode='human_review_required' then 'awaiting_review' else 'pending' end,
    coalesce(p_payload->'input_snapshot','{}'::jsonb),p_idempotency_key,p_actor_id
  ) returning * into v_execution;
  return to_jsonb(v_execution);
end;
$$;

alter table public.academy_automation_rule_versions enable row level security;
alter table public.academy_automation_executions enable row level security;
alter table public.academy_automation_effects enable row level security;
alter table public.academy_ai_assistance_requests enable row level security;
alter table public.academy_ai_assistance_reviews enable row level security;
alter table public.academy_import_effects enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'academy_automation_rule_versions','academy_automation_executions','academy_automation_effects',
    'academy_ai_assistance_requests','academy_ai_assistance_reviews','academy_import_effects'
  ] loop
    execute format('create policy %I on public.%I for select using(public.academy_intelligence_can_access(academy_id))','Phase H read '||t,t);
  end loop;
end;
$$;

revoke all on function public.academy_create_automation_version(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.academy_begin_automation_execution(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.academy_create_automation_version(uuid,uuid,uuid,jsonb,text) to service_role;
grant execute on function public.academy_begin_automation_execution(uuid,uuid,uuid,jsonb,text) to service_role;
