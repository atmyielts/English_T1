-- Academy Telegram operations: dedicated staff bot, scoped group bindings,
-- deterministic delivery policy, and a branch-scoped receptionist role.

alter table public.academy_staff drop constraint if exists academy_staff_role_check;
alter table public.academy_staff add constraint academy_staff_role_check check (role in (
  'admin','center_admin','branch_manager','manager','counselor','receptionist','salesperson','cashier',
  'accountant','payroll_officer','parent_liaison','teacher','assistant'
));

alter table public.academy_role_grants drop constraint if exists academy_role_grants_role_check;
alter table public.academy_role_grants add constraint academy_role_grants_role_check check (role in (
  'owner','admin','center_admin','branch_manager','manager','counselor','receptionist','salesperson','cashier',
  'accountant','payroll_officer','parent_liaison','teacher','assistant'
));

alter table public.academy_staff_branch_assignments drop constraint if exists academy_staff_branch_assignments_assignment_role_check;
alter table public.academy_staff_branch_assignments add constraint academy_staff_branch_assignments_assignment_role_check check (assignment_role in (
  'branch_manager','receptionist','salesperson','cashier','accountant','payroll_officer','parent_liaison',
  'academic_operator','teacher','assistant','support'
));

create table public.academy_telegram_settings (
  academy_id uuid primary key references public.tenants(id) on delete restrict,
  enabled boolean not null default false,
  default_locale text not null default 'uz' check (default_locale in ('en','uz','ru')),
  timezone text not null default 'Asia/Tashkent',
  digest_time time not null default '08:00',
  emergency_override_enabled boolean not null default true,
  configured_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.academy_telegram_chats (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid,
  classroom_id uuid,
  bot_kind text not null default 'academy_staff' check (bot_kind = 'academy_staff'),
  chat_id text not null check (chat_id ~ '^-?[0-9]{1,20}$'),
  chat_type text not null check (chat_type in ('group','supergroup')),
  message_thread_id bigint,
  purpose text not null check (purpose in ('academy_staff','branch_staff','classroom_community','classroom_guardians')),
  title text not null check (length(trim(title)) between 1 and 160),
  locale text not null default 'uz' check (locale in ('en','uz','ru')),
  status text not null default 'active' check (status in ('active','paused','degraded','disconnected')),
  capabilities jsonb not null default '{}'::jsonb,
  linked_by uuid references public.users(id) on delete set null,
  linked_at timestamptz not null default now(),
  last_verified_at timestamptz,
  last_error text,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, id),
  foreign key (academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict,
  foreign key (academy_id, classroom_id) references public.academy_classrooms(academy_id, id) on delete restrict,
  check (
    (purpose = 'academy_staff' and branch_id is null and classroom_id is null)
    or (purpose = 'branch_staff' and branch_id is not null and classroom_id is null)
    or (purpose in ('classroom_community','classroom_guardians') and classroom_id is not null)
  )
);

create unique index academy_telegram_chats_destination_uidx
  on public.academy_telegram_chats(bot_kind, chat_id, coalesce(message_thread_id, 0));
create index academy_telegram_chats_scope_idx
  on public.academy_telegram_chats(academy_id, status, branch_id, classroom_id);

create table public.academy_telegram_chat_subscriptions (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete restrict,
  chat_binding_id uuid not null,
  event_type text not null check (event_type in (
    'announcement','homework_published','homework_due','class_reminder','schedule_change',
    'class_cancelled','emergency_closure','staff_daily_brief','request_update'
  )),
  delivery_mode text not null default 'immediate' check (delivery_mode in ('immediate','daily_digest','off')),
  quiet_hours_start time,
  quiet_hours_end time,
  enabled boolean not null default true,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, chat_binding_id, event_type),
  foreign key (academy_id, chat_binding_id) references public.academy_telegram_chats(academy_id, id) on delete restrict
);

create table public.academy_telegram_link_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (length(token_hash) = 64),
  intent text not null check (intent in ('staff_link','group_link')),
  academy_id uuid not null references public.tenants(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  branch_id uuid,
  classroom_id uuid,
  purpose text check (purpose in ('academy_staff','branch_staff','classroom_community','classroom_guardians')),
  locale text not null default 'uz' check (locale in ('en','uz','ru')),
  status text not null default 'pending' check (status in ('pending','consumed','expired','revoked')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_telegram_user_id text,
  created_at timestamptz not null default now(),
  foreign key (academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict,
  foreign key (academy_id, classroom_id) references public.academy_classrooms(academy_id, id) on delete restrict,
  check ((intent = 'staff_link' and purpose is null) or (intent = 'group_link' and purpose is not null))
);

create index academy_telegram_link_tokens_pending_idx
  on public.academy_telegram_link_tokens(status, expires_at) where status = 'pending';

alter table public.academy_notifications
  add column if not exists bot_kind text not null default 'student',
  add column if not exists audience_kind text not null default 'student_private',
  add column if not exists chat_binding_id uuid,
  add column if not exists actor_user_id uuid references public.users(id) on delete set null,
  add column if not exists telegram_message_id bigint,
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_token uuid,
  add column if not exists last_attempt_at timestamptz;

alter table public.academy_notifications drop constraint if exists academy_notifications_bot_kind_check;
alter table public.academy_notifications add constraint academy_notifications_bot_kind_check
  check (bot_kind in ('student','academy_staff')) not valid;
alter table public.academy_notifications drop constraint if exists academy_notifications_audience_kind_check;
alter table public.academy_notifications add constraint academy_notifications_audience_kind_check
  check (audience_kind in ('staff_private','student_private','guardian_private','group')) not valid;
alter table public.academy_notifications drop constraint if exists academy_notifications_status_check;
alter table public.academy_notifications add constraint academy_notifications_status_check
  check (status in ('queued','processing','sent','failed','skipped','suppressed')) not valid;
alter table public.academy_notifications add constraint academy_notifications_chat_binding_fk
  foreign key (academy_id, chat_binding_id) references public.academy_telegram_chats(academy_id, id) on delete restrict not valid;
alter table public.academy_notifications add constraint academy_notifications_group_target_check
  check ((audience_kind = 'group' and chat_binding_id is not null and bot_kind = 'academy_staff') or audience_kind <> 'group') not valid;

create index academy_notifications_academy_bot_queue_idx
  on public.academy_notifications(academy_id, bot_kind, status, scheduled_at)
  where status = 'queued';

create unique index academy_assignments_telegram_idempotency_uidx
  on public.academy_assignments(academy_id, (metadata->>'telegram_idempotency_key'))
  where metadata->>'source' = 'academy_telegram'
    and nullif(metadata->>'telegram_idempotency_key', '') is not null;

create or replace function public.academy_record_telegram_attendance_batch(
  p_academy_id uuid,
  p_session_id uuid,
  p_classroom_id uuid,
  p_actor_id uuid,
  p_records jsonb,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_session public.academy_lesson_sessions%rowtype;
  v_record jsonb;
  v_saved integer := 0;
  v_audit_key text := 'telegram.attendance:' || trim(p_idempotency_key);
begin
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'idempotency_key is required';
  end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) < 1 or jsonb_array_length(p_records) > 500 then
    raise exception 'Attendance records must be an array of 1 to 500 rows';
  end if;
  if exists (
    select 1 from public.academy_audit_events
    where academy_id = p_academy_id and idempotency_key = v_audit_key
  ) then
    return jsonb_build_object('saved', jsonb_array_length(p_records), 'duplicate', true);
  end if;

  select * into v_session
  from public.academy_lesson_sessions
  where academy_id = p_academy_id and id = p_session_id
  for update;
  if not found or v_session.classroom_id <> p_classroom_id then
    raise exception 'Lesson session not found';
  end if;

  for v_record in select value from jsonb_array_elements(p_records)
  loop
    if nullif(trim(v_record->>'contact_id'), '') is null
      or lower(trim(v_record->>'status')) not in ('present','absent','late','excused') then
      raise exception 'Every attendance row needs a student and valid status';
    end if;
    perform public.academy_record_session_attendance(
      p_academy_id,
      p_session_id,
      (v_record->>'contact_id')::uuid,
      p_actor_id,
      lower(trim(v_record->>'status')),
      nullif(trim(v_record->>'notes'), '')
    );
    v_saved := v_saved + 1;
  end loop;

  insert into public.academy_audit_events(
    academy_id, actor_user_id, action, target_type, target_id,
    classroom_id, idempotency_key, metadata
  ) values (
    p_academy_id, p_actor_id, 'attendance.batch_recorded_from_telegram',
    'academy_lesson_session', p_session_id::text, p_classroom_id,
    v_audit_key, jsonb_build_object('records', v_saved)
  );
  return jsonb_build_object('saved', v_saved, 'duplicate', false);
end;
$$;

create or replace function public.academy_update_telegram_service_request(
  p_academy_id uuid,
  p_request_id uuid,
  p_actor_id uuid,
  p_next_status text,
  p_assign_to_me boolean,
  p_note text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_request public.academy_service_requests%rowtype;
  v_next text := lower(trim(p_next_status));
  v_terminal boolean := v_next in ('rejected','completed');
  v_audit_key text := 'telegram.request:' || trim(p_idempotency_key);
  v_previous_status text;
begin
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'idempotency_key is required';
  end if;
  if v_next not in ('triaged','in_review','waiting_for_requester','approved','rejected','completed') then
    raise exception 'Invalid request status';
  end if;
  select * into v_request
  from public.academy_service_requests
  where academy_id = p_academy_id and id = p_request_id
  for update;
  if not found then raise exception 'Request not found'; end if;
  v_previous_status := v_request.status;
  if exists (
    select 1 from public.academy_audit_events
    where academy_id = p_academy_id and idempotency_key = v_audit_key
  ) then
    return jsonb_build_object('request', to_jsonb(v_request), 'duplicate', true);
  end if;

  update public.academy_service_requests set
    status = v_next,
    assigned_to = case when p_assign_to_me then p_actor_id else assigned_to end,
    resolution = case when v_terminal then coalesce(nullif(trim(p_note), ''), resolution) else resolution end,
    resolved_by = case when v_terminal then p_actor_id else resolved_by end,
    resolved_at = case when v_terminal then now() else resolved_at end,
    updated_at = now()
  where academy_id = p_academy_id and id = p_request_id
  returning * into v_request;

  insert into public.academy_service_request_events(
    academy_id, request_id, event_type, from_status, to_status,
    note, actor_user_id, visible_to_requester
  ) values (
    p_academy_id, p_request_id,
    case when v_terminal then 'resolved' else 'status_changed' end,
    v_previous_status,
    v_next, nullif(trim(p_note), ''), p_actor_id, true
  );
  insert into public.academy_audit_events(
    academy_id, actor_user_id, action, target_type, target_id,
    request_id, branch_id, classroom_id, idempotency_key, metadata
  ) values (
    p_academy_id, p_actor_id, 'service_request.updated_from_telegram',
    'academy_service_request', p_request_id::text, p_request_id::text,
    v_request.branch_id, v_request.classroom_id, v_audit_key,
    jsonb_build_object('from_status', v_previous_status, 'to_status', v_next)
  );
  return jsonb_build_object('request', to_jsonb(v_request), 'duplicate', false);
end;
$$;

revoke all on function public.academy_record_telegram_attendance_batch(uuid,uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.academy_update_telegram_service_request(uuid,uuid,uuid,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.academy_record_telegram_attendance_batch(uuid,uuid,uuid,uuid,jsonb,text) to service_role;
grant execute on function public.academy_update_telegram_service_request(uuid,uuid,uuid,text,boolean,text,text) to service_role;

alter table public.academy_telegram_settings enable row level security;
alter table public.academy_telegram_chats enable row level security;
alter table public.academy_telegram_chat_subscriptions enable row level security;
alter table public.academy_telegram_link_tokens enable row level security;

-- Telegram destination identifiers and link material are returned only through
-- the permission-checking Edge service. Direct client access stays closed.
revoke all on public.academy_telegram_settings from anon, authenticated;
revoke all on public.academy_telegram_chats from anon, authenticated;
revoke all on public.academy_telegram_chat_subscriptions from anon, authenticated;
revoke all on public.academy_telegram_link_tokens from anon, authenticated;
grant all on public.academy_telegram_settings to service_role;
grant all on public.academy_telegram_chats to service_role;
grant all on public.academy_telegram_chat_subscriptions to service_role;
grant all on public.academy_telegram_link_tokens to service_role;

create trigger academy_telegram_settings_updated_at
  before update on public.academy_telegram_settings
  for each row execute procedure public.handle_teacher_studio_updated_at();
create trigger academy_telegram_chats_updated_at
  before update on public.academy_telegram_chats
  for each row execute procedure public.handle_teacher_studio_updated_at();
create trigger academy_telegram_subscriptions_updated_at
  before update on public.academy_telegram_chat_subscriptions
  for each row execute procedure public.handle_teacher_studio_updated_at();

comment on table public.academy_telegram_chats is
  'Service-only Telegram group bindings. Ordinary Academy clients receive redacted records through academy-telegram.';
comment on table public.academy_telegram_link_tokens is
  'Hashed, one-time, short-lived Telegram staff and group link intents.';
