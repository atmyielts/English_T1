-- Schood AI centres (docs/product/44_SCHOOD_AI.md, phase 4: T7, T8, C1-C16).
-- ============================================================================
-- Builds on the core tables (20261030100000_schood_ai_core.sql): centre
-- workspaces, members, invites and budgets live in ai_workspaces,
-- ai_workspace_members and ai_workspace_invites, and are written here only through
-- the SECURITY DEFINER functions below (create a centre, accept an invite). The
-- centre's own data (groups and their assistant rules, admissions, placement
-- attempts, curricula, briefs, knowledge, resale, observations) is in the
-- ai_centre_* tables. Every table is read and written only by the schood-ai Edge
-- Function with the service role: RLS is on and browsers get no policies.
-- Secrets (a centre's Telegram bot token, a bring-your-own model key) are stored
-- only as AES-GCM ciphertext made by the function (`v1:<key id>:<iv>:<data>`),
-- never in plain text; Telegram webhook secrets are stored as SHA-256 hashes.
-- Academy data is never copied row by row: the function reads Academy through its
-- API with the person's own token and keeps only aggregates (briefs, snapshots).
-- ============================================================================
begin;

-- --- Centre settings: one row per centre workspace -----------------------------------
create table if not exists public.ai_centre_settings (
  workspace_id uuid primary key references public.ai_workspaces(id) on delete cascade,
  created_via text not null check (created_via in ('academy', 'admin')),
  created_by uuid references public.users(id) on delete set null,
  -- Public, non-secret key that identifies the centre's website widgets.
  public_key text not null unique check (public_key ~ '^[A-Za-z0-9_-]{20,40}$'),
  -- Websites (https origins) allowed to run the centre's widgets.
  embed_domains text[] not null default '{}' check (cardinality(embed_domains) <= 10),
  -- Widget switches and texts: {"admissions_chat": true, "placement": true, "placement_page_id": ..., "greeting": {...}}.
  widgets jsonb not null default '{}'::jsonb check (jsonb_typeof(widgets) = 'object' and pg_column_size(widgets) <= 8000),
  -- White label beyond core branding: {"avatar_url": "https://...", "launcher_label": {...}}.
  white_label jsonb not null default '{}'::jsonb check (jsonb_typeof(white_label) = 'object' and pg_column_size(white_label) <= 4000),
  -- Student and parent chats and admissions conversations older than this are deleted. Core
  -- already deletes every conversation after 180 days, so a centre can only keep them for less.
  retention_days integer not null default 180 check (retention_days between 30 and 180),
  -- Add-ons granted by Schood support until tenant checkout exists (Teacher seat, 100 students).
  extra_teacher_seats integer not null default 0 check (extra_teacher_seats between 0 and 1000),
  extra_students integer not null default 0 check (extra_students between 0 and 100000),
  -- The seat limits of the plan when a member last used the centre ({"teachers", "students", "plan"}), for joins by people who are not members yet.
  limits jsonb not null default '{}'::jsonb check (jsonb_typeof(limits) = 'object' and pg_column_size(limits) <= 500),
  -- Monthly credit budgets given to new members by role: {"teacher": 500, "student": 50}.
  budget_defaults jsonb not null default '{}'::jsonb check (jsonb_typeof(budget_defaults) = 'object' and pg_column_size(budget_defaults) <= 1000),
  -- The centre's lesson observation standards (C16): [{"key", "title", "description"}].
  observation_standards jsonb not null default '[]'::jsonb check (jsonb_typeof(observation_standards) = 'array' and pg_column_size(observation_standards) <= 16000),
  -- Monday owner brief (C10): {"enabled": true, "recipients": [uuid], "hour": 8}.
  brief jsonb not null default '{}'::jsonb check (jsonb_typeof(brief) = 'object' and pg_column_size(brief) <= 4000),
  -- Bring-your-own-key platform fee set by contract (C15): {"uzs_per_1000_calls": n}.
  byok_fee jsonb not null default '{}'::jsonb check (jsonb_typeof(byok_fee) = 'object' and pg_column_size(byok_fee) <= 1000),
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- --- Groups and the Student Assistant rules (C2) ----------------------------------------
create table if not exists public.ai_centre_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  -- The Academy classroom this group mirrors, when the centre uses Academy.
  academy_classroom_id text check (academy_classroom_id is null or academy_classroom_id ~ '^[0-9a-f-]{36}$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  level text check (level is null or char_length(level) <= 40),
  teacher_ids uuid[] not null default '{}' check (cardinality(teacher_ids) <= 20),
  -- Hints, not answers: while a homework is open (the default), always, or off.
  hint_policy text not null default 'during_homework' check (hint_policy in ('during_homework', 'always', 'off')),
  focus_topics text[] not null default '{}' check (cardinality(focus_topics) <= 12),
  -- The homework helper's rule for this group's homework (learner L7); null follows hint_policy.
  homework_rule text check (homework_rule is null or homework_rule in ('hints_only', 'explain', 'off')),
  note text check (note is null or char_length(note) <= 500),
  archived boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ai_centre_groups_classroom_idx on public.ai_centre_groups (workspace_id, academy_classroom_id) where academy_classroom_id is not null;
create index if not exists ai_centre_groups_workspace_idx on public.ai_centre_groups (workspace_id, archived, name);

create table if not exists public.ai_centre_group_members (
  group_id uuid not null references public.ai_centre_groups(id) on delete cascade,
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists ai_centre_group_members_user_idx on public.ai_centre_group_members (workspace_id, user_id);

-- A teacher's rule for one Academy homework of a group, over the group's default.
create table if not exists public.ai_centre_assignment_rules (
  group_id uuid not null references public.ai_centre_groups(id) on delete cascade,
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  assignment_id text not null check (assignment_id ~ '^[0-9a-f-]{36}$'),
  rule text not null check (rule in ('hints_only', 'explain', 'off')),
  title text check (title is null or char_length(title) <= 200),
  set_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (group_id, assignment_id)
);
create index if not exists ai_centre_assignment_rules_workspace_idx on public.ai_centre_assignment_rules (workspace_id, assignment_id);

-- --- Verified results for marketing (C4) --------------------------------------------------
-- Results posts use only these rows; nothing is ever invented by the model.
create table if not exists public.ai_centre_results (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  student_name text not null check (char_length(btrim(student_name)) between 1 and 120),
  exam text not null check (char_length(btrim(exam)) between 1 and 80),
  score text not null check (char_length(btrim(score)) between 1 and 40),
  result_date date,
  source text not null default 'entered' check (source in ('entered', 'academy', 'schood')),
  verified boolean not null default false,
  verified_by uuid references public.users(id) on delete set null,
  verified_at timestamptz,
  evidence_note text check (evidence_note is null or char_length(evidence_note) <= 300),
  -- The student (or a parent) agreed to be named publicly.
  consent boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (not verified or verified_at is not null)
);
create index if not exists ai_centre_results_workspace_idx on public.ai_centre_results (workspace_id, created_at desc);

-- --- Placement attempts (C5) ----------------------------------------------------------------
-- The tests themselves are library pages (kind centre.placement_test); keys never leave the function.
create table if not exists public.ai_centre_placement_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  test_page_id uuid references public.ai_pages(id) on delete set null,
  test_revision integer check (test_revision is null or test_revision >= 1),
  taker_user_id uuid references public.users(id) on delete cascade,
  -- A prospect from the widget or Telegram: name and contact as they gave them.
  prospect jsonb not null default '{}'::jsonb check (jsonb_typeof(prospect) = 'object' and pg_column_size(prospect) <= 2000),
  channel text not null check (channel in ('web', 'widget', 'telegram', 'staff')),
  thread_id uuid,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'marked', 'reviewed')),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 65536),
  objective jsonb check (objective is null or pg_column_size(objective) <= 32000),
  ai_marks jsonb check (ai_marks is null or pg_column_size(ai_marks) <= 32000),
  level text check (level is null or char_length(level) <= 20),
  report jsonb check (report is null or pg_column_size(report) <= 32000),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_centre_placement_attempts_workspace_idx on public.ai_centre_placement_attempts (workspace_id, created_at desc);

-- --- Curriculum in a box (C12) ------------------------------------------------------------
create table if not exists public.ai_centre_curricula (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  brief jsonb not null default '{}'::jsonb check (jsonb_typeof(brief) = 'object' and pg_column_size(brief) <= 8000),
  status text not null default 'draft' check (status in ('draft', 'generating', 'review', 'approved', 'published', 'failed')),
  outline jsonb check (outline is null or pg_column_size(outline) <= 65536),
  created_by uuid references public.users(id) on delete set null,
  reviewer_id uuid references public.users(id) on delete set null,
  published_at timestamptz,
  publish_action_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_centre_curricula_workspace_idx on public.ai_centre_curricula (workspace_id, created_at desc);

create table if not exists public.ai_centre_curriculum_units (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.ai_centre_curricula(id) on delete cascade,
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  position integer not null check (position between 1 and 200),
  level text not null check (char_length(level) between 1 and 40),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  status text not null default 'pending' check (status in ('pending', 'generating', 'ready', 'changes_requested', 'approved', 'failed')),
  generation_id uuid references public.ai_generations(id) on delete set null,
  content jsonb check (content is null or pg_column_size(content) <= 262144),
  review_notes text check (review_notes is null or char_length(review_notes) <= 2000),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  page_ids uuid[] not null default '{}',
  attempts smallint not null default 0 check (attempts between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (curriculum_id, position)
);

-- --- Insights (C6): counts only, never text ----------------------------------------------
create table if not exists public.ai_centre_insights (
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  group_id uuid not null references public.ai_centre_groups(id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  topic text not null check (topic ~ '^[a-z][a-z0-9_.]{1,60}$'),
  questions integer not null check (questions >= 0),
  students integer not null check (students >= 0),
  -- Members of the group when counted; groups under five students are never stored.
  group_size integer not null check (group_size >= 5),
  computed_at timestamptz not null default now(),
  primary key (group_id, period, topic)
);
create index if not exists ai_centre_insights_workspace_idx on public.ai_centre_insights (workspace_id, period);

-- --- Secrets (C8 bot token, C15 model keys): ciphertext only ------------------------------
create table if not exists public.ai_centre_secrets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  purpose text not null check (purpose in ('telegram_bot', 'byok')),
  label text not null check (label ~ '^[a-z0-9][a-z0-9_.-]{0,40}$'),
  sealed text not null check (sealed ~ '^v1:[a-z0-9-]{1,40}:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$' and char_length(sealed) <= 4000),
  -- The last four characters, to recognise the key; the fingerprint is SHA-256 of the secret.
  hint text not null check (char_length(hint) <= 8),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  -- Non-secret settings: BYOK adapter, base URL and models.
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 8000),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists ai_centre_secrets_active_idx on public.ai_centre_secrets (workspace_id, purpose, label) where revoked_at is null;

-- A stored secret is never rewritten: it can only be revoked (and its non-secret settings changed).
create or replace function public.ai_centre_secrets_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.sealed is distinct from old.sealed or new.fingerprint is distinct from old.fingerprint or new.hint is distinct from old.hint
     or new.purpose is distinct from old.purpose or new.label is distinct from old.label or new.workspace_id is distinct from old.workspace_id then
    raise exception 'ai_centre_secrets are revoked and replaced, never rewritten' using errcode = '42501';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'a revoked secret stays revoked' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists ai_centre_secrets_guard on public.ai_centre_secrets;
create trigger ai_centre_secrets_guard before update on public.ai_centre_secrets for each row execute function public.ai_centre_secrets_guard();

-- --- Admissions agent (C8) -------------------------------------------------------------------
create table if not exists public.ai_centre_admissions (
  workspace_id uuid primary key references public.ai_workspaces(id) on delete cascade,
  enabled boolean not null default false,
  -- Our random path id for the bot's webhook (never the token).
  bot_ref text unique check (bot_ref is null or bot_ref ~ '^[A-Za-z0-9_-]{16,40}$'),
  bot_username text check (bot_username is null or bot_username ~ '^[A-Za-z0-9_]{4,40}$'),
  bot_id bigint,
  -- SHA-256 of Telegram's X-Telegram-Bot-Api-Secret-Token for this bot.
  webhook_secret_hash text check (webhook_secret_hash is null or webhook_secret_hash ~ '^[0-9a-f]{64}$'),
  faq jsonb not null default '[]'::jsonb check (jsonb_typeof(faq) = 'array' and pg_column_size(faq) <= 65536),
  prices jsonb not null default '[]'::jsonb check (jsonb_typeof(prices) = 'array' and pg_column_size(prices) <= 32000),
  -- {"mode": "approve" | "auto", "slots": [...], "min_notice_hours", "max_per_day", "require_phone"}.
  booking jsonb not null default '{}'::jsonb check (jsonb_typeof(booking) = 'object' and pg_column_size(booking) <= 16000),
  -- {"message": {...}, "notify_user_ids": [...]}.
  handover jsonb not null default '{}'::jsonb check (jsonb_typeof(handover) = 'object' and pg_column_size(handover) <= 4000),
  greeting jsonb not null default '{}'::jsonb check (jsonb_typeof(greeting) = 'object' and pg_column_size(greeting) <= 4000),
  placement_page_id uuid references public.ai_pages(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_centre_admissions_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  channel text not null check (channel in ('telegram', 'widget')),
  -- The Telegram chat id, or a hash of the widget session.
  external_id text not null check (char_length(external_id) between 1 and 80),
  contact jsonb not null default '{}'::jsonb check (jsonb_typeof(contact) = 'object' and pg_column_size(contact) <= 2000),
  language text not null default 'uz' check (language in ('uz', 'ru', 'en')),
  status text not null default 'open' check (status in ('open', 'handed_over', 'booked', 'closed')),
  -- An in-chat placement test in progress: {"page_id", "index", "answers"}.
  placement jsonb check (placement is null or pg_column_size(placement) <= 8000),
  academy_lead_id text check (academy_lead_id is null or char_length(academy_lead_id) <= 64),
  turns_day date,
  turns integer not null default 0 check (turns >= 0),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, channel, external_id)
);
create index if not exists ai_centre_admissions_threads_workspace_idx on public.ai_centre_admissions_threads (workspace_id, status, last_message_at desc);

create table if not exists public.ai_centre_admissions_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.ai_centre_admissions_threads(id) on delete cascade,
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  role text not null check (role in ('prospect', 'agent', 'staff', 'system')),
  content text not null check (char_length(content) between 1 and 4000),
  author_id uuid references public.users(id) on delete set null,
  flags jsonb not null default '{}'::jsonb check (jsonb_typeof(flags) = 'object' and pg_column_size(flags) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists ai_centre_admissions_messages_thread_idx on public.ai_centre_admissions_messages (thread_id, id);
create index if not exists ai_centre_admissions_messages_age_idx on public.ai_centre_admissions_messages (workspace_id, created_at);

create table if not exists public.ai_centre_bookings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  thread_id uuid references public.ai_centre_admissions_threads(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null check (status in ('requested', 'confirmed', 'synced', 'cancelled')),
  -- auto: confirmed within the owner's rules; approve: waits for a person; staff: entered by staff.
  mode text not null check (mode in ('auto', 'approve', 'staff')),
  contact jsonb not null default '{}'::jsonb check (jsonb_typeof(contact) = 'object' and pg_column_size(contact) <= 2000),
  action_id uuid,
  academy_lead_id text check (academy_lead_id is null or char_length(academy_lead_id) <= 64),
  academy_trial_id text check (academy_trial_id is null or char_length(academy_trial_id) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists ai_centre_bookings_workspace_idx on public.ai_centre_bookings (workspace_id, starts_at);

-- Telegram may deliver an update more than once.
create table if not exists public.ai_centre_tg_updates (
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  update_id bigint not null,
  received_at timestamptz not null default now(),
  primary key (workspace_id, update_id)
);

-- Staff who linked their Telegram to the centre's bot (handover alerts, the Monday brief).
create table if not exists public.ai_centre_staff_chats (
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  chat_id text not null check (chat_id ~ '^-?[0-9]{1,20}$'),
  linked_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create table if not exists public.ai_centre_staff_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Daily counters for the public endpoints (widgets, the centre bot).
create table if not exists public.ai_centre_public_limits (
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  bucket text not null check (char_length(bucket) between 1 and 80),
  day date not null,
  count integer not null default 0 check (count >= 0),
  primary key (workspace_id, bucket, day)
);

-- --- Resell AI to students (C9) ------------------------------------------------------------
create table if not exists public.ai_centre_resell (
  workspace_id uuid primary key references public.ai_workspaces(id) on delete cascade,
  enabled boolean not null default false,
  -- The centre's own price to parents; collecting it is the centre's business.
  price_uzs integer check (price_uzs is null or price_uzs between 0 and 100000000),
  period_days integer not null default 30 check (period_days between 1 and 366),
  -- Only students with an active resale may use the assistant (their budget is 0 otherwise).
  gate_access boolean not null default false,
  student_budget integer check (student_budget is null or student_budget between 0 and 100000),
  note text check (note is null or char_length(note) <= 500),
  -- Schood's wholesale rate per active student per month [ASSUMPTION] 9,000 UZS.
  wholesale_rate_uzs integer not null default 9000 check (wholesale_rate_uzs between 0 and 10000000),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
-- Each period a student had the resold assistant switched on. They are the basis of
-- the wholesale charge, so closing an account unlinks them (user_id null) instead
-- of deleting them (ai_centre_erase_account below).
create table if not exists public.ai_centre_resell_periods (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  paid_until date,
  note text check (note is null or char_length(note) <= 200),
  created_by uuid references public.users(id) on delete set null,
  check (ended_at is null or ended_at >= started_at)
);
create unique index if not exists ai_centre_resell_periods_open_idx on public.ai_centre_resell_periods (workspace_id, user_id) where ended_at is null;
create index if not exists ai_centre_resell_periods_workspace_idx on public.ai_centre_resell_periods (workspace_id, started_at);

-- Schood's wholesale charge per month. Billed by manual invoice until tenant checkout exists.
create table if not exists public.ai_centre_wholesale (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  active_students integer not null check (active_students >= 0),
  rate_uzs integer not null check (rate_uzs >= 0),
  amount_uzs bigint not null check (amount_uzs >= 0),
  status text not null default 'open' check (status in ('open', 'invoiced', 'paid', 'void')),
  invoice_ref text check (invoice_ref is null or char_length(invoice_ref) <= 80),
  computed_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null,
  unique (workspace_id, period)
);

-- --- Monday owner brief (C10) ------------------------------------------------------------
create table if not exists public.ai_centre_briefs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  week text not null check (week ~ '^[0-9]{4}-W[0-9]{2}$'),
  status text not null default 'ready' check (status in ('ready', 'sent', 'partial', 'failed')),
  source text not null check (source in ('live', 'snapshot', 'none')),
  snapshot_at timestamptz,
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 65536),
  text text not null default '' check (char_length(text) <= 8000),
  suggestions jsonb not null default '[]'::jsonb check (jsonb_typeof(suggestions) = 'array'),
  deliveries jsonb not null default '[]'::jsonb check (jsonb_typeof(deliveries) = 'array' and pg_column_size(deliveries) <= 16000),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, week)
);
-- Aggregates read from Academy with a staff member's token, for when no token is at hand (the Monday cron).
create table if not exists public.ai_centre_academy_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  captured_by uuid references public.users(id) on delete set null,
  captured_at timestamptz not null default now(),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 65536)
);
create index if not exists ai_centre_academy_snapshots_workspace_idx on public.ai_centre_academy_snapshots (workspace_id, captured_at desc);

-- --- Staff knowledge assistant (C13) -------------------------------------------------------
create table if not exists public.ai_centre_knowledge_docs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  filename text check (filename is null or char_length(filename) <= 200),
  mime text check (mime is null or char_length(mime) <= 100),
  pages integer not null check (pages between 1 and 2000),
  chars integer not null default 0 check (chars >= 0),
  -- The original file in the media store ({provider, bucket, path}), when one is configured.
  storage jsonb check (storage is null or pg_column_size(storage) <= 1000),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.ai_centre_knowledge_chunks (
  id bigint generated always as identity primary key,
  doc_id uuid not null references public.ai_centre_knowledge_docs(id) on delete cascade,
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  page integer not null check (page between 1 and 2000),
  chunk integer not null check (chunk between 1 and 1000),
  content text not null check (char_length(content) between 1 and 4000),
  -- Simple tokens (no stemming) so Uzbek, Russian and English policies are all searchable.
  search tsvector generated always as (to_tsvector('simple', content)) stored,
  unique (doc_id, page, chunk)
);
create index if not exists ai_centre_knowledge_chunks_search_idx on public.ai_centre_knowledge_chunks using gin (search);
create index if not exists ai_centre_knowledge_chunks_workspace_idx on public.ai_centre_knowledge_chunks (workspace_id);

-- --- Bring your own model key: platform fees (C15) ------------------------------------------
create table if not exists public.ai_centre_byok_fees (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  calls integer not null default 0 check (calls >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  rate_uzs_per_1000 integer check (rate_uzs_per_1000 is null or rate_uzs_per_1000 >= 0),
  fee_uzs bigint check (fee_uzs is null or fee_uzs >= 0),
  status text not null default 'open' check (status in ('open', 'invoiced', 'paid', 'void')),
  computed_at timestamptz not null default now(),
  unique (workspace_id, period)
);

-- --- Lesson observation coach (C16) ------------------------------------------------------------
create table if not exists public.ai_centre_observations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  teacher_id uuid not null references public.users(id) on delete cascade,
  observer_id uuid references public.users(id) on delete set null,
  group_id uuid references public.ai_centre_groups(id) on delete set null,
  lesson_date date not null,
  term text not null check (term ~ '^[0-9]{4}-T[1-4]$'),
  source text not null check (source in ('notes', 'plan')),
  input text not null check (char_length(input) between 20 and 20000),
  feedback jsonb check (feedback is null or pg_column_size(feedback) <= 65536),
  status text not null default 'draft' check (status in ('draft', 'shared', 'acknowledged')),
  teacher_comment text check (teacher_comment is null or char_length(teacher_comment) <= 2000),
  shared_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_centre_observations_teacher_idx on public.ai_centre_observations (workspace_id, teacher_id, lesson_date desc);

-- --- Win-back and renewal campaigns (C11) --------------------------------------------------------
create table if not exists public.ai_centre_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  kind text not null check (kind in ('winback', 'renewal')),
  status text not null default 'draft' check (status in ('draft', 'proposed', 'done')),
  -- Who it is for and why (from Academy risk signals); never the message text.
  audience jsonb not null default '[]'::jsonb check (jsonb_typeof(audience) = 'array' and pg_column_size(audience) <= 65536),
  action_ids uuid[] not null default '{}',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_centre_campaigns_workspace_idx on public.ai_centre_campaigns (workspace_id, created_at desc);

-- --- updated_at -------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ai_centre_settings', 'ai_centre_groups', 'ai_centre_placement_attempts', 'ai_centre_curricula', 'ai_centre_curriculum_units',
    'ai_centre_admissions', 'ai_centre_admissions_threads', 'ai_centre_bookings', 'ai_centre_resell', 'ai_centre_briefs', 'ai_centre_observations', 'ai_centre_campaigns'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- --- Functions ----------------------------------------------------------------------------------

-- Creates a centre workspace with its owner and settings in one step. A centre
-- linked to an Academy tenant exists once: a second request (or a race) returns
-- the existing workspace with created = false.
create or replace function public.ai_centre_create_workspace(
  p_name text, p_owner uuid, p_tenant uuid, p_contract text, p_until timestamptz, p_via text, p_by uuid, p_public_key text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare ws public.ai_workspaces;
begin
  if p_tenant is not null then
    select * into ws from public.ai_workspaces where academy_tenant_id = p_tenant;
    if found then return jsonb_build_object('created', false, 'workspace_id', ws.id); end if;
  end if;
  insert into public.ai_workspaces (kind, name, owner_id, academy_tenant_id, contract_plan, contract_until)
    values ('centre', left(btrim(p_name), 120), p_owner, p_tenant, p_contract, p_until)
    on conflict (academy_tenant_id) where academy_tenant_id is not null do nothing
    returning * into ws;
  if ws.id is null then
    select * into ws from public.ai_workspaces where academy_tenant_id = p_tenant;
    return jsonb_build_object('created', false, 'workspace_id', ws.id);
  end if;
  insert into public.ai_workspace_members (workspace_id, user_id, role) values (ws.id, p_owner, 'owner');
  insert into public.ai_centre_settings (workspace_id, created_via, created_by, public_key) values (ws.id, p_via, p_by, p_public_key);
  return jsonb_build_object('created', true, 'workspace_id', ws.id);
end $$;

-- Joins a person to a centre with an invite code (its SHA-256). Race-safe: the
-- invite and the workspace are locked, so seats, student places and max uses
-- hold under concurrent joins. Seat limits come from the plan (null = no limit):
-- admins and teachers take teacher seats; students take student places. A person
-- who is already a member keeps their membership and the invite is not used.
create or replace function public.ai_centre_accept_invite(
  p_code_hash text, p_user uuid, p_teacher_seats integer, p_student_seats integer, p_budgets jsonb, p_now timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  inv public.ai_workspace_invites;
  ws public.ai_workspaces;
  existing public.ai_workspace_members;
  used integer;
  budget integer;
begin
  select * into inv from public.ai_workspace_invites where code_hash = p_code_hash for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'invite_invalid'); end if;
  select * into ws from public.ai_workspaces where id = inv.workspace_id for update;
  if ws.kind <> 'centre' or ws.status <> 'active' then return jsonb_build_object('ok', false, 'code', 'invite_invalid'); end if;
  select * into existing from public.ai_workspace_members where workspace_id = ws.id and user_id = p_user;
  if found then
    return jsonb_build_object('ok', true, 'already', true, 'workspace_id', ws.id, 'role', existing.role, 'status', existing.status);
  end if;
  if inv.revoked_at is not null then return jsonb_build_object('ok', false, 'code', 'invite_revoked'); end if;
  if inv.expires_at <= p_now then return jsonb_build_object('ok', false, 'code', 'invite_expired'); end if;
  if inv.uses >= inv.max_uses then return jsonb_build_object('ok', false, 'code', 'invite_used_up'); end if;
  if inv.role in ('admin', 'teacher') and p_teacher_seats is not null then
    select count(*) into used from public.ai_workspace_members where workspace_id = ws.id and role in ('admin', 'teacher') and status = 'active';
    if used >= p_teacher_seats then return jsonb_build_object('ok', false, 'code', 'seats_full', 'limit', p_teacher_seats); end if;
  elsif inv.role = 'student' and p_student_seats is not null then
    select count(*) into used from public.ai_workspace_members where workspace_id = ws.id and role = 'student' and status = 'active';
    if used >= p_student_seats then return jsonb_build_object('ok', false, 'code', 'students_full', 'limit', p_student_seats); end if;
  end if;
  budget := case when jsonb_typeof(p_budgets -> inv.role) = 'number' then greatest(0, least((p_budgets ->> inv.role)::numeric, 10000000))::integer else null end;
  insert into public.ai_workspace_members (workspace_id, user_id, role, credit_budget, invite_id) values (ws.id, p_user, inv.role, budget, inv.id);
  update public.ai_workspace_invites set uses = uses + 1 where id = inv.id;
  return jsonb_build_object('ok', true, 'already', false, 'workspace_id', ws.id, 'role', inv.role, 'status', 'active');
end $$;

-- Members of a workspace with their display names, for the centre admin.
create or replace function public.ai_centre_members(p_workspace uuid)
returns table (user_id uuid, role text, status text, credit_budget integer, budget_period text, budget_used integer, joined_at timestamptz, name text)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.user_id, m.role, m.status, m.credit_budget, m.budget_period, m.budget_used, m.joined_at, u.full_name
  from public.ai_workspace_members m left join public.users u on u.id = m.user_id
  where m.workspace_id = p_workspace
  order by m.joined_at, m.user_id
$$;

-- One more hit on a public counter, if it is still under the cap.
create or replace function public.ai_centre_take_public(p_workspace uuid, p_bucket text, p_day date, p_cap integer)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  if p_cap < 1 then return false; end if;
  insert into public.ai_centre_public_limits as l (workspace_id, bucket, day, count) values (p_workspace, p_bucket, p_day, 1)
    on conflict (workspace_id, bucket, day) do update set count = l.count + 1 where l.count < p_cap
    returning count into n;
  return n is not null;
end $$;

-- Links a staff member's Telegram chat to the centre's bot with a one-time code.
create or replace function public.ai_centre_claim_staff_code(p_workspace uuid, p_code_hash text, p_chat text, p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare who uuid;
begin
  update public.ai_centre_staff_codes set used_at = p_now
    where code_hash = p_code_hash and workspace_id = p_workspace and used_at is null and expires_at > p_now
    returning user_id into who;
  if who is null then return jsonb_build_object('ok', false); end if;
  if not exists (select 1 from public.ai_workspace_members where workspace_id = p_workspace and user_id = who and status = 'active' and role in ('owner', 'admin', 'teacher')) then
    return jsonb_build_object('ok', false);
  end if;
  insert into public.ai_centre_staff_chats (workspace_id, user_id, chat_id, linked_at) values (p_workspace, who, p_chat, p_now)
    on conflict (workspace_id, user_id) do update set chat_id = excluded.chat_id, linked_at = excluded.linked_at;
  return jsonb_build_object('ok', true, 'user_id', who);
end $$;

-- Full-text search over a centre's policies. p_query is a tsquery the function
-- builds from letters and digits only (word:* | word:*), so it cannot inject syntax.
create or replace function public.ai_centre_knowledge_search(p_workspace uuid, p_query text, p_limit integer)
returns table (chunk_id bigint, doc_id uuid, title text, page integer, content text, rank real)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id, c.doc_id, d.title, c.page, c.content, ts_rank(c.search, q)
  from public.ai_centre_knowledge_chunks c
  join public.ai_centre_knowledge_docs d on d.id = c.doc_id
  cross join to_tsquery('simple', p_query) q
  where c.workspace_id = p_workspace and c.search @@ q
  order by 6 desc, c.page, c.chunk
  limit greatest(1, least(p_limit, 20))
$$;

-- Credits and model cost of a workspace since a moment: per credit key, per member and per day.
create or replace function public.ai_centre_usage(p_workspace uuid, p_since timestamptz)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'features', coalesce((
      select jsonb_agg(jsonb_build_object('key', key, 'credits', credits, 'charges', charges) order by credits desc)
      from (select coalesce(credit_key, 'other') as key, (-sum(delta))::integer as credits, count(distinct charge_id) filter (where kind = 'charge')::integer as charges
            from public.ai_credit_ledger where workspace_id = p_workspace and created_at >= p_since and kind in ('charge', 'refund') group by 1) f
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', user_id, 'credits', credits) order by credits desc)
      from (select user_id, (-sum(delta))::integer as credits from public.ai_credit_ledger
            where workspace_id = p_workspace and created_at >= p_since and kind in ('charge', 'refund') and user_id is not null group by 1) m
    ), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'credits', credits) order by day)
      from (select to_char(created_at at time zone 'Asia/Tashkent', 'YYYY-MM-DD') as day, (-sum(delta))::integer as credits from public.ai_credit_ledger
            where workspace_id = p_workspace and created_at >= p_since and kind in ('charge', 'refund') group by 1) d
    ), '[]'::jsonb),
    'cost', (select jsonb_build_object('usd', coalesce(sum(cost_usd), 0), 'calls', count(*), 'failed', count(*) filter (where status not in ('ok', 'stopped')))
             from public.ai_calls where workspace_id = p_workspace and created_at >= p_since),
    'byok', (select jsonb_build_object('calls', count(*), 'input_tokens', coalesce(sum(input_tokens), 0), 'output_tokens', coalesce(sum(output_tokens), 0))
             from public.ai_calls where workspace_id = p_workspace and created_at >= p_since and status = 'ok' and provider_key like 'byok:%')
  )
$$;

-- --- Access -------------------------------------------------------------------------------------
alter table public.ai_centre_settings enable row level security;
alter table public.ai_centre_groups enable row level security;
alter table public.ai_centre_group_members enable row level security;
alter table public.ai_centre_assignment_rules enable row level security;
alter table public.ai_centre_results enable row level security;
alter table public.ai_centre_placement_attempts enable row level security;
alter table public.ai_centre_curricula enable row level security;
alter table public.ai_centre_curriculum_units enable row level security;
alter table public.ai_centre_insights enable row level security;
alter table public.ai_centre_secrets enable row level security;
alter table public.ai_centre_admissions enable row level security;
alter table public.ai_centre_admissions_threads enable row level security;
alter table public.ai_centre_admissions_messages enable row level security;
alter table public.ai_centre_bookings enable row level security;
alter table public.ai_centre_tg_updates enable row level security;
alter table public.ai_centre_staff_chats enable row level security;
alter table public.ai_centre_staff_codes enable row level security;
alter table public.ai_centre_public_limits enable row level security;
alter table public.ai_centre_resell enable row level security;
alter table public.ai_centre_resell_periods enable row level security;
alter table public.ai_centre_wholesale enable row level security;
alter table public.ai_centre_briefs enable row level security;
alter table public.ai_centre_academy_snapshots enable row level security;
alter table public.ai_centre_knowledge_docs enable row level security;
alter table public.ai_centre_knowledge_chunks enable row level security;
alter table public.ai_centre_byok_fees enable row level security;
alter table public.ai_centre_observations enable row level security;
alter table public.ai_centre_campaigns enable row level security;

revoke all on public.ai_centre_settings, public.ai_centre_groups, public.ai_centre_group_members, public.ai_centre_assignment_rules, public.ai_centre_results,
  public.ai_centre_placement_attempts, public.ai_centre_curricula, public.ai_centre_curriculum_units, public.ai_centre_insights,
  public.ai_centre_secrets, public.ai_centre_admissions, public.ai_centre_admissions_threads, public.ai_centre_admissions_messages,
  public.ai_centre_bookings, public.ai_centre_tg_updates, public.ai_centre_staff_chats, public.ai_centre_staff_codes,
  public.ai_centre_public_limits, public.ai_centre_resell, public.ai_centre_resell_periods, public.ai_centre_wholesale,
  public.ai_centre_briefs, public.ai_centre_academy_snapshots, public.ai_centre_knowledge_docs, public.ai_centre_knowledge_chunks,
  public.ai_centre_byok_fees, public.ai_centre_observations, public.ai_centre_campaigns
  from anon, authenticated;
revoke all on sequence public.ai_centre_admissions_messages_id_seq, public.ai_centre_knowledge_chunks_id_seq from anon, authenticated;
-- Counters and staff links change only through their functions; secrets are never rewritten, only revoked.
revoke insert, update, delete, truncate on public.ai_centre_public_limits, public.ai_centre_staff_codes from service_role;
grant insert on public.ai_centre_staff_codes to service_role;

revoke all on function public.ai_centre_create_workspace(text, uuid, uuid, text, timestamptz, text, uuid, text) from public, anon, authenticated;
revoke all on function public.ai_centre_accept_invite(text, uuid, integer, integer, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.ai_centre_members(uuid) from public, anon, authenticated;
revoke all on function public.ai_centre_take_public(uuid, text, date, integer) from public, anon, authenticated;
revoke all on function public.ai_centre_claim_staff_code(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.ai_centre_knowledge_search(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.ai_centre_usage(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.ai_centre_secrets_guard() from public, anon, authenticated;
grant execute on function public.ai_centre_create_workspace(text, uuid, uuid, text, timestamptz, text, uuid, text) to service_role;
grant execute on function public.ai_centre_accept_invite(text, uuid, integer, integer, jsonb, timestamptz) to service_role;
grant execute on function public.ai_centre_members(uuid) to service_role;
grant execute on function public.ai_centre_take_public(uuid, text, date, integer) to service_role;
grant execute on function public.ai_centre_claim_staff_code(uuid, text, text, timestamptz) to service_role;
grant execute on function public.ai_centre_knowledge_search(uuid, text, integer) to service_role;
grant execute on function public.ai_centre_usage(uuid, timestamptz) to service_role;


-- --- Account erasure ------------------------------------------------------------------------------
-- Closing a Schood account (the closure transaction on auth.users) anonymises the
-- users row; it is not deleted, so nothing here may rely on "on delete cascade".
--   1. Plain personal rows keyed on user_id join account_personal_erasure_tables()
--      (the additive pattern of 20261030130000): group memberships, staff Telegram
--      links and staff link codes.
--   2. ai_centre_erase_account(p_user) runs as a service hook after core's
--      ai_erase_account: the person's placement attempts (their answers and writing)
--      and the observations of their lessons are deleted; resell periods are kept
--      for the wholesale charge but unlinked; observer links are unlinked.
--   Authorship columns (created_by, verified_by, author_id, ...) keep pointing at the
--   anonymised users row; prospects of the admissions agent are not accounts and
--   follow the centre's retention.
do $$
declare
  relations text[];
  wanted text[] := array['ai_centre_group_members', 'ai_centre_staff_chats', 'ai_centre_staff_codes'];
  relation_name text;
  guard_installed boolean := to_regprocedure('public.guard_closed_personal_record()') is not null;
begin
  if to_regprocedure('public.account_personal_erasure_tables()') is null then
    raise notice 'account_personal_erasure_tables() is not installed; erasure registry not extended';
    return;
  end if;
  relations := public.account_personal_erasure_tables();
  foreach relation_name in array wanted loop
    if to_regclass(format('public.%I', relation_name)) is null then continue; end if;
    if not (relation_name = any(relations)) then
      relations := relations || relation_name;
      if guard_installed then
        execute format('drop trigger if exists account_closed_personal_guard on public.%I', relation_name);
        execute format('create trigger account_closed_personal_guard before insert or update on public.%I for each row execute function public.guard_closed_personal_record(%L)', relation_name, 'user_id');
      end if;
    end if;
  end loop;
  execute format(
    'create or replace function public.account_personal_erasure_tables() returns text[] language sql immutable set search_path=pg_catalog,public as %L',
    format('select %L::text[];', relations::text)
  );
end
$$;

create or replace function public.ai_centre_erase_account(p_user uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_attempts integer;
  v_observations integer;
  v_observer integer;
  v_periods integer;
begin
  if p_user is null then return '{}'::jsonb; end if;
  delete from public.ai_centre_placement_attempts where taker_user_id = p_user;
  get diagnostics v_attempts = row_count;
  delete from public.ai_centre_observations where teacher_id = p_user;
  get diagnostics v_observations = row_count;
  update public.ai_centre_observations set observer_id = null where observer_id = p_user;
  get diagnostics v_observer = row_count;
  update public.ai_centre_resell_periods set user_id = null, note = null, ended_at = coalesce(ended_at, now()) where user_id = p_user;
  get diagnostics v_periods = row_count;
  return jsonb_build_object('placement_attempts', v_attempts, 'observations', v_observations, 'observer_links', v_observer, 'resell_periods_unlinked', v_periods);
end;
$$;
revoke all on function public.ai_centre_erase_account(uuid) from public, anon, authenticated, service_role;

do $$
declare hooks text[];
begin
  if to_regprocedure('public.account_erasure_service_hooks()') is null then
    raise notice 'account_erasure_service_hooks() is not installed; centre erasure hook not registered';
    return;
  end if;
  hooks := public.account_erasure_service_hooks();
  if not ('ai_centre_erase_account' = any(hooks)) then
    hooks := hooks || 'ai_centre_erase_account'::text;
    execute format(
      'create or replace function public.account_erasure_service_hooks() returns text[] language sql immutable set search_path=pg_catalog,public as %L',
      format('select %L::text[];', hooks::text)
    );
  end if;
end
$$;

commit;

-- --- Schedules (core's system routes) ---------------------------------------------------------
-- pg_cron calls the centre's system routes through invoke_schood_ai_system (20261030160000).
-- Each call does a bounded amount of work and the next call picks up the rest:
--   centre/system-brief every 10 minutes (minutes 4, 14, ...): builds each centre's Monday
--     brief from its chosen hour, Tashkent time, at most 8 per call, and retries deliveries
--     that quiet hours or the daily limit held back;
--   centre/system-daily six times a night (03:16 to 04:46 UTC), up to 200 centres a call,
--     each centre once a day: retention, ledgers and insights.
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname in ('schood-ai-centre-brief-v1', 'schood-ai-centre-daily-v1') loop
    perform cron.unschedule(v_job_id);
  end loop;
  perform cron.schedule('schood-ai-centre-brief-v1', '4-59/10 * * * *', $cron$select public.invoke_schood_ai_system('centre/system-brief', '{"builds": 8}');$cron$);
  perform cron.schedule('schood-ai-centre-daily-v1', '16,31,46 3-4 * * *', $cron$select public.invoke_schood_ai_system('centre/system-daily', '{"limit": 200}');$cron$);
exception
  when undefined_table or undefined_function or invalid_schema_name then
    raise notice 'pg_cron is unavailable in this environment; the centre schedules are not set';
end
$$;
