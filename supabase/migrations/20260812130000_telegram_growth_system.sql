-- Telegram growth system: acquisition attribution, resumable journeys, sales
-- leads, delivery policy evidence, and retry-safe external update processing.

-- Production is the only environment. Abort rather than wait indefinitely for
-- active-table locks; operators must run the documented preflight first.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '10min';

create table if not exists public.telegram_acquisition_sessions (
  id uuid primary key default gen_random_uuid(),
  bot_name text not null check (bot_name in ('schoodonlinebot','schoodstudentbot')),
  telegram_user_id text not null,
  schood_user_id uuid references public.users(id) on delete set null,
  campaign_id text,
  source text,
  medium text,
  creative text,
  offer text,
  funnel text not null default 'generic'
    check (funnel in ('student_ielts','academy','course','referral','generic')),
  landing_variant text,
  intent text not null default 'explore',
  role_hint text not null default 'unknown'
    check (role_hint in ('student','academy','unknown')),
  deep_link_payload text,
  referrer_code text,
  original_attribution jsonb not null default '{}'::jsonb,
  latest_attribution jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  diagnostic_started_at timestamptz,
  diagnostic_completed_at timestamptz,
  first_value_action_at timestamptz,
  account_linked_at timestamptz,
  account_created_at timestamptz,
  mini_app_opened_at timestamptz,
  trial_started_at timestamptz,
  checkout_started_at timestamptz,
  converted_at timestamptz,
  academy_lead_id uuid,
  last_step text not null default 'started',
  status text not null default 'active'
    check (status in ('active','completed','converted','canceled','expired','superseded')),
  journey_state jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists telegram_acquisition_active_user_idx
  on public.telegram_acquisition_sessions(bot_name, telegram_user_id)
  where status = 'active';
create index if not exists telegram_acquisition_campaign_started_idx
  on public.telegram_acquisition_sessions(campaign_id, started_at desc);
create index if not exists telegram_acquisition_funnel_status_idx
  on public.telegram_acquisition_sessions(funnel, status, started_at desc);
create index if not exists telegram_acquisition_user_idx
  on public.telegram_acquisition_sessions(schood_user_id, started_at desc);

create table if not exists public.telegram_acquisition_touches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.telegram_acquisition_sessions(id) on delete cascade,
  telegram_update_id bigint,
  campaign_id text,
  source text,
  medium text,
  creative text,
  offer text,
  deep_link_payload text,
  attribution jsonb not null default '{}'::jsonb,
  touched_at timestamptz not null default now(),
  unique (session_id, telegram_update_id)
);

create index if not exists telegram_acquisition_touches_campaign_idx
  on public.telegram_acquisition_touches(campaign_id, touched_at desc);

create table if not exists public.telegram_journey_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.telegram_acquisition_sessions(id) on delete cascade,
  telegram_user_id text not null,
  event_name text not null,
  step text,
  status text not null default 'ok' check (status in ('ok','error','ignored')),
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists telegram_journey_events_idempotency_idx
  on public.telegram_journey_events(idempotency_key)
  where idempotency_key is not null;
create index if not exists telegram_journey_events_session_idx
  on public.telegram_journey_events(session_id, created_at);
create index if not exists telegram_journey_events_name_idx
  on public.telegram_journey_events(event_name, created_at desc);

create table if not exists public.telegram_update_receipts (
  id uuid primary key default gen_random_uuid(),
  bot_name text not null,
  telegram_update_id bigint not null,
  telegram_user_id text,
  update_kind text,
  status text not null default 'processing'
    check (status in ('processing','completed','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  claim_token uuid,
  claimed_at timestamptz,
  error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (bot_name, telegram_update_id)
);

create index if not exists telegram_update_receipts_status_idx
  on public.telegram_update_receipts(status, claimed_at, created_at desc);

create table if not exists public.telegram_public_rate_limits (
  rate_key text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (rate_key, window_started_at)
);

create index if not exists telegram_public_rate_limits_window_idx
  on public.telegram_public_rate_limits(window_started_at);

create table if not exists public.telegram_public_request_receipts (
  fingerprint text not null,
  window_bucket timestamptz not null,
  support_message_id uuid not null references public.support_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (fingerprint, window_bucket)
);

create table if not exists public.sales_leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  acquisition_session_id uuid unique references public.telegram_acquisition_sessions(id) on delete set null,
  idempotency_key text unique,
  telegram_user_id text,
  schood_user_id uuid references public.users(id) on delete set null,
  lead_type text not null default 'academy' check (lead_type in ('academy','student','partner')),
  academy_name text,
  contact_name text not null,
  phone text,
  email text,
  preferred_contact_method text,
  student_count integer check (student_count is null or student_count >= 0),
  branch_count integer check (branch_count is null or branch_count >= 0),
  current_process text,
  requested_capability text,
  source text,
  medium text,
  campaign text,
  creative text,
  status text not null default 'new'
    check (status in ('new','contacted','qualified','demo_scheduled','trial','paid','lost')),
  owner_user_id uuid references public.users(id) on delete set null,
  next_action_at timestamptz,
  sla_due_at timestamptz not null default (now() + interval '4 hours'),
  first_contacted_at timestamptz,
  qualified_at timestamptz,
  demo_booked_at timestamptz,
  trial_started_at timestamptz,
  converted_at timestamptz,
  lost_at timestamptz,
  lost_reason text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.telegram_acquisition_sessions
  drop constraint if exists telegram_acquisition_sessions_academy_lead_id_fkey;
alter table public.telegram_acquisition_sessions
  add constraint telegram_acquisition_sessions_academy_lead_id_fkey
  foreign key (academy_lead_id) references public.sales_leads(id) on delete set null;

create index if not exists sales_leads_status_sla_idx
  on public.sales_leads(status, sla_due_at);
create index if not exists sales_leads_owner_next_action_idx
  on public.sales_leads(owner_user_id, next_action_at);
create index if not exists sales_leads_campaign_created_idx
  on public.sales_leads(campaign, created_at desc);

create table if not exists public.sales_lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.sales_leads(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  activity_type text not null,
  from_status text,
  to_status text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sales_lead_activities_lead_idx
  on public.sales_lead_activities(lead_id, created_at desc);

alter table public.telegram_user_preferences
  add column if not exists telegram_enabled boolean not null default true,
  add column if not exists email_enabled boolean not null default true,
  add column if not exists academic_required_enabled boolean not null default true,
  add column if not exists study_habit_enabled boolean not null default true,
  add column if not exists commercial_enabled boolean not null default false,
  add column if not exists grade_notifications boolean not null default true,
  add column if not exists payment_notifications boolean not null default true,
  add column if not exists vocabulary_reminders boolean not null default true;

-- Preserve explicit legacy opt-outs. digest_frequency='off' historically
-- meant no optional digest/habit traffic; global opt-out remains authoritative.
update public.telegram_user_preferences
set telegram_enabled = false
where notifications_enabled = false and telegram_enabled is distinct from false;

update public.telegram_user_preferences
set study_habit_enabled = false
where digest_frequency = 'off' and study_habit_enabled is distinct from false;

alter table public.telegram_link_tokens
  add column if not exists telegram_user_id text,
  add column if not exists acquisition_session_id uuid references public.telegram_acquisition_sessions(id) on delete set null,
  add column if not exists pending_chat_id text,
  add column if not exists confirmed_at timestamptz;

alter table public.platform_notifications
  add column if not exists category text not null default 'study_habit',
  add column if not exists dedupe_key text,
  add column if not exists scheduled_at timestamptz not null default now(),
  add column if not exists suppression_reason text,
  add column if not exists policy_decision jsonb not null default '{}'::jsonb,
  add column if not exists cta_url text,
  add column if not exists attempts integer not null default 0,
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_token uuid,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists telegram_message_id bigint;

alter table public.platform_notifications drop constraint if exists platform_notifications_status_check;
alter table public.platform_notifications add constraint platform_notifications_status_check
  check (status in ('pending','queued','processing','sent','failed','skipped','suppressed')) not valid;
alter table public.platform_notifications drop constraint if exists platform_notifications_category_check;
alter table public.platform_notifications add constraint platform_notifications_category_check
  check (category in ('transactional','academic_required','study_habit','commercial','system')) not valid;
create unique index if not exists platform_notifications_dedupe_idx
  on public.platform_notifications(dedupe_key)
  where dedupe_key is not null;
create index if not exists platform_notifications_queue_idx
  on public.platform_notifications(status, scheduled_at)
  where status in ('queued','processing');
create index if not exists platform_notifications_category_user_idx
  on public.platform_notifications(user_id, category, created_at desc);

alter table public.academy_notifications
  add column if not exists user_id uuid references public.users(id) on delete set null,
  add column if not exists category text not null default 'academic_required',
  add column if not exists dedupe_key text,
  add column if not exists suppression_reason text,
  add column if not exists policy_decision jsonb not null default '{}'::jsonb,
  add column if not exists cta_url text;

alter table public.academy_notifications drop constraint if exists academy_notifications_category_check;
alter table public.academy_notifications add constraint academy_notifications_category_check
  check (category in ('transactional','academic_required','study_habit','commercial','system')) not valid;
alter table public.academy_notifications drop constraint if exists academy_notifications_status_check;
alter table public.academy_notifications add constraint academy_notifications_status_check
  check (status in ('queued','sent','failed','skipped','suppressed')) not valid;
create unique index if not exists academy_notifications_dedupe_idx
  on public.academy_notifications(dedupe_key)
  where dedupe_key is not null;

alter table public.telegram_acquisition_sessions enable row level security;
alter table public.telegram_acquisition_touches enable row level security;
alter table public.telegram_journey_events enable row level security;
alter table public.telegram_update_receipts enable row level security;
alter table public.telegram_public_rate_limits enable row level security;
alter table public.telegram_public_request_receipts enable row level security;
alter table public.sales_leads enable row level security;
alter table public.sales_lead_activities enable row level security;

drop policy if exists "Telegram acquisition admin read" on public.telegram_acquisition_sessions;
create policy "Telegram acquisition admin read" on public.telegram_acquisition_sessions for select
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
drop policy if exists "Telegram touches admin read" on public.telegram_acquisition_touches;
create policy "Telegram touches admin read" on public.telegram_acquisition_touches for select
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
drop policy if exists "Telegram journey events admin read" on public.telegram_journey_events;
create policy "Telegram journey events admin read" on public.telegram_journey_events for select
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
drop policy if exists "Telegram update receipts admin read" on public.telegram_update_receipts;
create policy "Telegram update receipts admin read" on public.telegram_update_receipts for select
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
drop policy if exists "Sales leads admin manage" on public.sales_leads;
create policy "Sales leads admin manage" on public.sales_leads for all
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
drop policy if exists "Sales lead activities admin manage" on public.sales_lead_activities;
create policy "Sales lead activities admin manage" on public.sales_lead_activities for all
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop trigger if exists telegram_acquisition_sessions_updated_at on public.telegram_acquisition_sessions;
create trigger telegram_acquisition_sessions_updated_at before update on public.telegram_acquisition_sessions
  for each row execute function public.set_updated_at();
drop trigger if exists sales_leads_updated_at on public.sales_leads;
create trigger sales_leads_updated_at before update on public.sales_leads
  for each row execute function public.set_updated_at();

create or replace function public.telegram_public_rate_limit_consume(
  p_rate_key text,
  p_window_seconds integer default 600,
  p_max_requests integer default 10
)
returns table(allowed boolean, request_count integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_window_seconds integer := least(greatest(coalesce(p_window_seconds, 600), 60), 3600);
  v_max_requests integer := least(greatest(coalesce(p_max_requests, 10), 1), 100);
  v_window timestamptz;
  v_count integer;
begin
  if p_rate_key is null or length(p_rate_key) < 16 then raise exception 'invalid_rate_key'; end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / v_window_seconds) * v_window_seconds);
  insert into public.telegram_public_rate_limits(rate_key, window_started_at, request_count)
  values (p_rate_key, v_window, 1)
  on conflict (rate_key, window_started_at) do update
    set request_count = public.telegram_public_rate_limits.request_count + 1,
        updated_at = now()
  returning public.telegram_public_rate_limits.request_count into v_count;
  return query select v_count <= v_max_requests, v_count,
    greatest(1, ceil(extract(epoch from (v_window + make_interval(secs => v_window_seconds) - now())))::integer);
end;
$$;

revoke all on function public.telegram_public_rate_limit_consume(text, integer, integer) from public, anon, authenticated;
grant execute on function public.telegram_public_rate_limit_consume(text, integer, integer) to service_role;

create or replace function public.record_telegram_public_request_receipt()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_fingerprint text := nullif(new.metadata ->> 'request_fingerprint', '');
  v_bucket timestamptz;
begin
  if new.source <> 'telegram_public_bot' or v_fingerprint is null then return new; end if;
  v_bucket := nullif(new.metadata ->> 'request_window_bucket', '')::timestamptz;
  if v_bucket is null then raise exception 'telegram_request_window_required'; end if;
  insert into public.telegram_public_request_receipts(fingerprint, window_bucket, support_message_id)
  values (v_fingerprint, v_bucket, new.id);
  return new;
end;
$$;

drop trigger if exists telegram_public_request_receipt on public.support_messages;
create trigger telegram_public_request_receipt
  after insert on public.support_messages
  for each row execute function public.record_telegram_public_request_receipt();

revoke all on function public.record_telegram_public_request_receipt() from public, anon, authenticated;

create or replace function public.record_sales_lead_created()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.sales_lead_activities(lead_id, actor_user_id, activity_type, to_status, metadata)
  values (new.id, auth.uid(), 'created', new.status, jsonb_build_object('source', coalesce(new.source, 'unknown')));
  return new;
end;
$$;

drop trigger if exists sales_leads_record_created on public.sales_leads;
create trigger sales_leads_record_created after insert on public.sales_leads
  for each row execute function public.record_sales_lead_created();

revoke all on function public.record_sales_lead_created() from public, anon, authenticated;

create or replace function public.prepare_sales_lead_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'contacted' then new.first_contacted_at := coalesce(new.first_contacted_at, now()); end if;
    if new.status = 'qualified' then new.qualified_at := coalesce(new.qualified_at, now()); end if;
    if new.status = 'demo_scheduled' then new.demo_booked_at := coalesce(new.demo_booked_at, now()); end if;
    if new.status = 'trial' then new.trial_started_at := coalesce(new.trial_started_at, now()); end if;
    if new.status = 'paid' then new.converted_at := coalesce(new.converted_at, now()); end if;
    if new.status = 'lost' then new.lost_at := coalesce(new.lost_at, now()); end if;
  end if;
  return new;
end;
$$;

create or replace function public.record_sales_lead_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.sales_lead_activities(lead_id, actor_user_id, activity_type, from_status, to_status)
    values (new.id, auth.uid(), 'status_changed', old.status, new.status);
    if new.acquisition_session_id is not null then
      update public.telegram_acquisition_sessions
      set trial_started_at = case when new.status = 'trial' then coalesce(trial_started_at, now()) else trial_started_at end,
          converted_at = case when new.status = 'paid' then coalesce(converted_at, now()) else converted_at end,
          status = case when new.status = 'paid' then 'converted' else status end,
          updated_at = now()
      where id = new.acquisition_session_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sales_leads_prepare_transition on public.sales_leads;
create trigger sales_leads_prepare_transition before update of status on public.sales_leads
  for each row execute function public.prepare_sales_lead_transition();
drop trigger if exists sales_leads_record_transition on public.sales_leads;
create trigger sales_leads_record_transition after update of status on public.sales_leads
  for each row execute function public.record_sales_lead_transition();
revoke all on function public.prepare_sales_lead_transition() from public, anon, authenticated;
revoke all on function public.record_sales_lead_transition() from public, anon, authenticated;

create or replace function public.claim_telegram_update(
  p_bot_name text,
  p_update_id bigint,
  p_telegram_user_id text default null,
  p_update_kind text default null,
  p_stale_after_seconds integer default 120
)
returns table(outcome text, claim_token uuid, attempts integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_receipt public.telegram_update_receipts%rowtype;
  v_token uuid := gen_random_uuid();
  v_stale_after integer := least(greatest(coalesce(p_stale_after_seconds, 120), 30), 900);
begin
  if p_bot_name not in ('schoodonlinebot','schoodstudentbot') then raise exception 'invalid_bot_name'; end if;
  if p_update_id is null or p_update_id < 0 then raise exception 'invalid_update_id'; end if;

  insert into public.telegram_update_receipts(
    bot_name, telegram_update_id, telegram_user_id, update_kind,
    status, attempts, claim_token, claimed_at
  ) values (
    p_bot_name, p_update_id, p_telegram_user_id, p_update_kind,
    'processing', 1, v_token, now()
  )
  on conflict (bot_name, telegram_update_id) do nothing
  returning * into v_receipt;

  if v_receipt.id is not null then
    return query select 'claimed'::text, v_token, 1;
    return;
  end if;

  select * into v_receipt
  from public.telegram_update_receipts
  where bot_name = p_bot_name and telegram_update_id = p_update_id
  for update;

  if v_receipt.status = 'completed' then
    return query select 'completed'::text, null::uuid, v_receipt.attempts;
    return;
  end if;

  if v_receipt.status = 'processing'
     and v_receipt.claimed_at is not null
     and v_receipt.claimed_at >= now() - make_interval(secs => v_stale_after) then
    return query select 'busy'::text, null::uuid, v_receipt.attempts;
    return;
  end if;

  update public.telegram_update_receipts
  set status = 'processing',
      attempts = v_receipt.attempts + 1,
      claim_token = v_token,
      claimed_at = now(),
      completed_at = null,
      error = null,
      telegram_user_id = coalesce(p_telegram_user_id, telegram_user_id),
      update_kind = coalesce(p_update_kind, update_kind)
  where id = v_receipt.id;

  return query select 'claimed'::text, v_token, v_receipt.attempts + 1;
end;
$$;

create or replace function public.complete_telegram_update(
  p_bot_name text,
  p_update_id bigint,
  p_claim_token uuid,
  p_failed boolean default false,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_updated integer;
begin
  update public.telegram_update_receipts
  set status = case when p_failed then 'failed' else 'completed' end,
      completed_at = now(),
      error = case when p_failed then left(coalesce(p_error, 'processing_failed'), 1000) else null end,
      claim_token = null
  where bot_name = p_bot_name
    and telegram_update_id = p_update_id
    and status = 'processing'
    and claim_token = p_claim_token;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.claim_telegram_update(text, bigint, text, text, integer) from public, anon, authenticated;
grant execute on function public.claim_telegram_update(text, bigint, text, text, integer) to service_role;
revoke all on function public.complete_telegram_update(text, bigint, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.complete_telegram_update(text, bigint, uuid, boolean, text) to service_role;

create or replace function public.apply_telegram_journey_transition(
  p_session_id uuid,
  p_expected_last_step text,
  p_update jsonb,
  p_event_name text,
  p_event_step text,
  p_idempotency_key text,
  p_event_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_session public.telegram_acquisition_sessions%rowtype;
begin
  if p_idempotency_key is null or p_idempotency_key = '' then raise exception 'idempotency_key_required'; end if;
  select * into v_session from public.telegram_acquisition_sessions where id = p_session_id for update;
  if v_session.id is null then raise exception 'active_session_not_found'; end if;

  if exists (select 1 from public.telegram_journey_events where idempotency_key = p_idempotency_key) then
    return jsonb_build_object('replayed', true, 'session', to_jsonb(v_session));
  end if;
  if v_session.last_step is distinct from p_expected_last_step then raise exception 'journey_step_changed'; end if;

  update public.telegram_acquisition_sessions
  set journey_state = coalesce(p_update -> 'journey_state', journey_state),
      last_step = coalesce(nullif(p_update ->> 'last_step', ''), last_step),
      funnel = coalesce(nullif(p_update ->> 'funnel', ''), funnel),
      intent = coalesce(nullif(p_update ->> 'intent', ''), intent),
      role_hint = coalesce(nullif(p_update ->> 'role_hint', ''), role_hint),
      status = coalesce(nullif(p_update ->> 'status', ''), status),
      diagnostic_started_at = case when p_update ? 'diagnostic_started_at' then (p_update ->> 'diagnostic_started_at')::timestamptz else diagnostic_started_at end,
      diagnostic_completed_at = case when p_update ? 'diagnostic_completed_at' then (p_update ->> 'diagnostic_completed_at')::timestamptz else diagnostic_completed_at end,
      first_value_action_at = case when p_update ? 'first_value_action_at' then (p_update ->> 'first_value_action_at')::timestamptz else first_value_action_at end,
      updated_at = now()
  where id = p_session_id
  returning * into v_session;

  insert into public.telegram_journey_events(session_id, telegram_user_id, event_name, step, idempotency_key, metadata)
  values (v_session.id, v_session.telegram_user_id, p_event_name, p_event_step, p_idempotency_key, coalesce(p_event_metadata, '{}'::jsonb));
  return jsonb_build_object('replayed', false, 'session', to_jsonb(v_session));
end;
$$;

revoke all on function public.apply_telegram_journey_transition(uuid, text, jsonb, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_telegram_journey_transition(uuid, text, jsonb, text, text, text, jsonb) to service_role;

create or replace function public.issue_telegram_link_token(
  p_user_id uuid,
  p_telegram_user_id text default null,
  p_acquisition_session_id uuid default null
)
returns table(token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_session public.telegram_acquisition_sessions%rowtype;
  v_row public.telegram_link_tokens%rowtype;
begin
  if p_user_id is null or not exists (select 1 from public.users where id = p_user_id) then
    raise exception 'invalid_link_user';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if p_acquisition_session_id is not null then
    select * into v_session from public.telegram_acquisition_sessions
    where id = p_acquisition_session_id for update;
    if v_session.id is null then raise exception 'invalid_acquisition_session'; end if;
    if v_session.status <> 'active' or v_session.expires_at <= now() then raise exception 'acquisition_session_expired'; end if;
    if p_telegram_user_id is not null and p_telegram_user_id <> v_session.telegram_user_id then
      raise exception 'acquisition_session_telegram_mismatch';
    end if;
    p_telegram_user_id := v_session.telegram_user_id;
  end if;

  delete from public.telegram_link_tokens
  where user_id = p_user_id and used_at is null;

  insert into public.telegram_link_tokens(user_id, telegram_user_id, acquisition_session_id)
  values (p_user_id, p_telegram_user_id, p_acquisition_session_id)
  returning * into v_row;
  return query select v_row.token, v_row.expires_at;
end;
$$;

create or replace function public.consume_telegram_link_token(p_token text, p_chat_id text)
returns table(user_id uuid, display_name text, acquisition_session_id uuid, confirmation_required boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_token public.telegram_link_tokens%rowtype;
  v_name text;
  v_existing_user uuid;
  v_existing_chat text;
begin
  select * into v_token
  from public.telegram_link_tokens
  where token = p_token
  for update;

  if v_token.id is null then raise exception 'invalid_link_token'; end if;
  if v_token.used_at is not null then raise exception 'link_token_used'; end if;
  if v_token.expires_at <= now() then raise exception 'link_token_expired'; end if;
  if v_token.telegram_user_id is not null and v_token.telegram_user_id <> p_chat_id then
    raise exception 'link_token_wrong_telegram_user';
  end if;

  select id into v_existing_user from public.users where telegram_chat_id = p_chat_id for update;
  if v_existing_user is not null and v_existing_user <> v_token.user_id then
    raise exception 'telegram_chat_already_linked';
  end if;
  select telegram_chat_id into v_existing_chat from public.users where id = v_token.user_id for update;
  if v_existing_chat is not null and v_existing_chat <> p_chat_id then
    raise exception 'schood_user_already_linked';
  end if;

  select coalesce(u.full_name, split_part(u.email, '@', 1), 'Student') into v_name
  from public.users u where u.id = v_token.user_id;

  if v_token.telegram_user_id is null then
    if v_token.pending_chat_id is not null and v_token.pending_chat_id <> p_chat_id then
      raise exception 'link_token_already_presented';
    end if;
    update public.telegram_link_tokens set pending_chat_id = p_chat_id where id = v_token.id;
    return query select v_token.user_id, v_name, v_token.acquisition_session_id, true;
    return;
  end if;

  update public.telegram_link_tokens set used_at = now(), confirmed_at = now(), pending_chat_id = p_chat_id
  where id = v_token.id;
  begin
    update public.users set telegram_chat_id = p_chat_id where id = v_token.user_id;
  exception when unique_violation then
    raise exception 'telegram_chat_already_linked';
  end;
  update public.academy_contacts as ac set telegram_id = p_chat_id where ac.user_id = v_token.user_id;

  if v_token.acquisition_session_id is not null then
    update public.telegram_acquisition_sessions
    set schood_user_id = v_token.user_id,
        account_linked_at = coalesce(account_linked_at, now()),
        last_step = 'account_linked',
        updated_at = now()
    where id = v_token.acquisition_session_id and telegram_user_id = p_chat_id;
    insert into public.telegram_journey_events(session_id, telegram_user_id, event_name, step, metadata)
    values (v_token.acquisition_session_id, p_chat_id, 'account_linked', 'account_linked', jsonb_build_object('user_id', v_token.user_id))
    on conflict do nothing;
  end if;

  return query select v_token.user_id, v_name, v_token.acquisition_session_id, false;
end;
$$;

create or replace function public.confirm_telegram_link_token(p_token text, p_user_id uuid)
returns table(user_id uuid, display_name text, telegram_chat_id text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_token public.telegram_link_tokens%rowtype;
  v_name text;
  v_existing_user uuid;
  v_existing_chat text;
begin
  select * into v_token from public.telegram_link_tokens where token = p_token for update;
  if v_token.id is null or v_token.user_id <> p_user_id then raise exception 'invalid_link_token'; end if;
  if v_token.used_at is not null then raise exception 'link_token_used'; end if;
  if v_token.expires_at <= now() then raise exception 'link_token_expired'; end if;
  if v_token.pending_chat_id is null then raise exception 'link_token_not_presented_in_telegram'; end if;

  select u.id into v_existing_user from public.users u where u.telegram_chat_id = v_token.pending_chat_id for update;
  if v_existing_user is not null and v_existing_user <> p_user_id then raise exception 'telegram_chat_already_linked'; end if;
  select u.telegram_chat_id into v_existing_chat from public.users u where u.id = p_user_id for update;
  if v_existing_chat is not null and v_existing_chat <> v_token.pending_chat_id then raise exception 'schood_user_already_linked'; end if;

  update public.telegram_link_tokens set used_at = now(), confirmed_at = now() where id = v_token.id;
  begin
    update public.users set telegram_chat_id = v_token.pending_chat_id where id = p_user_id;
  exception when unique_violation then
    raise exception 'telegram_chat_already_linked';
  end;
  update public.academy_contacts as ac set telegram_id = v_token.pending_chat_id where ac.user_id = p_user_id;
  select coalesce(u.full_name, split_part(u.email, '@', 1), 'Student') into v_name from public.users u where u.id = p_user_id;
  return query select p_user_id, v_name, v_token.pending_chat_id;
end;
$$;

revoke all on function public.issue_telegram_link_token(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.issue_telegram_link_token(uuid, text, uuid) to service_role;
revoke all on function public.consume_telegram_link_token(text, text) from public, anon, authenticated;
grant execute on function public.consume_telegram_link_token(text, text) to service_role;
revoke all on function public.confirm_telegram_link_token(text, uuid) from public, anon, authenticated;
grant execute on function public.confirm_telegram_link_token(text, uuid) to service_role;

create or replace function public.claim_telegram_notification_batch(p_limit integer default 50)
returns setof public.platform_notifications
language sql
security definer
set search_path = pg_catalog, public
as $$
  with candidates as (
    select id
    from public.platform_notifications
    where channel = 'telegram'
      and (
        (status = 'queued' and scheduled_at <= now())
        or (status = 'processing' and claimed_at < now() - interval '5 minutes')
      )
    order by scheduled_at asc
    for update skip locked
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  update public.platform_notifications as notification
  set status = 'processing',
      claimed_at = now(),
      last_attempt_at = now(),
      claim_token = gen_random_uuid(),
      attempts = notification.attempts + 1
  from candidates
  where notification.id = candidates.id
  returning notification.*;
$$;

revoke all on function public.claim_telegram_notification_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_telegram_notification_batch(integer) to service_role;

create or replace view public.sales_lead_funnel_metrics as
select
  date_trunc('day', created_at) as day,
  source,
  medium,
  campaign,
  count(*) as leads,
  count(*) filter (where status in ('contacted','qualified','demo_scheduled','trial','paid')) as contacted,
  count(*) filter (where status in ('qualified','demo_scheduled','trial','paid')) as qualified,
  count(*) filter (where status in ('demo_scheduled','trial','paid')) as demos,
  count(*) filter (where status in ('trial','paid')) as trials,
  count(*) filter (where status = 'paid') as paid,
  percentile_cont(0.5) within group (order by extract(epoch from (first_contacted_at - created_at)))
    filter (where first_contacted_at is not null) as median_response_seconds,
  count(*) filter (where first_contacted_at is not null and first_contacted_at <= sla_due_at) as contacted_within_sla
from public.sales_leads
group by 1, 2, 3, 4;

revoke all on public.sales_lead_funnel_metrics from public, anon, authenticated;
grant select on public.sales_lead_funnel_metrics to service_role;

create or replace view public.telegram_acquisition_funnel_metrics as
select
  date_trunc('day', started_at) as day,
  source,
  medium,
  campaign_id as campaign,
  creative,
  offer,
  funnel,
  count(*) as starts,
  count(*) filter (where diagnostic_started_at is not null) as diagnostics_started,
  count(*) filter (where diagnostic_completed_at is not null) as diagnostics_completed,
  count(*) filter (where first_value_action_at is not null) as first_value_actions,
  count(*) filter (where account_linked_at is not null) as accounts_linked,
  count(*) filter (where mini_app_opened_at is not null) as mini_app_opens,
  count(*) filter (where trial_started_at is not null) as trials,
  count(*) filter (where checkout_started_at is not null) as checkouts,
  count(*) filter (where converted_at is not null) as conversions
from public.telegram_acquisition_sessions
group by 1, 2, 3, 4, 5, 6, 7;

create or replace view public.telegram_notification_effectiveness as
select
  date_trunc('day', created_at) as day,
  category,
  type,
  count(*) as candidates,
  count(*) filter (where status = 'sent') as sent,
  count(*) filter (where status in ('suppressed','skipped')) as suppressed,
  count(*) filter (where status = 'failed') as failed,
  count(*) filter (where status = 'queued') as deferred
from public.platform_notifications
where channel = 'telegram'
group by 1, 2, 3;

revoke all on public.telegram_acquisition_funnel_metrics from public, anon, authenticated;
revoke all on public.telegram_notification_effectiveness from public, anon, authenticated;
grant select on public.telegram_acquisition_funnel_metrics to service_role;
grant select on public.telegram_notification_effectiveness to service_role;

-- Deliberately do not schedule the morning brief here. Compatible Edge code and
-- bot identities must be deployed and verified first. Operators enable or
-- disable the job with scripts/telegram-morning-brief-{enable,disable}.sql.

commit;
