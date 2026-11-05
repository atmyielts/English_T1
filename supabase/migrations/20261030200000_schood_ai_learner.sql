-- Schood AI: learners and parents (docs/product/44_SCHOOD_AI.md, L1–L17, P1–P2).
-- ============================================================================
-- Owned by the learner area of the schood-ai Edge Function. Like the core tables,
-- every table here is read and written only by that function with the service
-- role: RLS is on, there are no policies, and anon/authenticated get nothing.
-- The student Telegram bot (workers/schood-bot) reads ai_learner_briefs with the
-- service key to know whose brief is due; everything else goes through the function.
--
--   ai_learner_consents      under-18 consent before a minor uses the assistant
--   ai_learner_family_links  Plus Family: one parent, up to 3 children (invite,
--                            accept, unlink); the children get Plus through a plan source
--   ai_learner_activity      what a learner did with Schood AI (for the daily brief,
--                            the parent brief and the tutor); summaries only, no essays
--   ai_learner_records       generated artefacts: explanations, feedback, plans,
--                            readings, speaking sessions, briefs; answer keys stay in `secret`
--   ai_learner_briefs        daily (L14) and weekly parent (P1) brief schedules
--   ai_learner_snapshots     the learner's profile and prediction summaries, for the
--                            Telegram path and for parents (who have no token for the child)
--   ai_learner_telegram      the tutor thread used from Telegram
--   ai_learner_duels         AI-made duel quizzes (L17) on top of english_duels
-- ============================================================================
begin;

-- --- Under-18 consent -------------------------------------------------------------
create table if not exists public.ai_learner_consents (
  user_id uuid primary key references public.users(id) on delete cascade,
  age_band text not null check (age_band in ('adult', '13_17', 'under_13')),
  -- A minor confirmed that a parent or guardian agrees, or a linked parent accepted.
  guardian_confirmed boolean not null default false,
  guardian_user_id uuid references public.users(id) on delete set null,
  text_version text not null check (char_length(text_version) between 1 and 40),
  accepted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  updated_at timestamptz not null default now(),
  check (guardian_user_id is null or guardian_user_id <> user_id)
);
alter table public.ai_learner_consents enable row level security;
revoke all on public.ai_learner_consents from anon, authenticated;

-- --- Plus Family links ---------------------------------------------------------------
create table if not exists public.ai_learner_family_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  parent_id uuid not null references public.users(id) on delete cascade,
  child_id uuid references public.users(id) on delete cascade,
  -- What the parent calls the child ("Aziza"), shown only to the parent.
  child_label text not null check (char_length(btrim(child_label)) between 1 and 60),
  status text not null default 'invited' check (status in ('invited', 'active', 'declined', 'unlinked', 'expired')),
  -- SHA-256 of the invite code; the code itself is shown once to the parent.
  invite_hash text check (invite_hash is null or invite_hash ~ '^[0-9a-f]{64}$'),
  invite_hint text check (invite_hint is null or char_length(invite_hint) <= 8),
  invite_expires_at timestamptz,
  parent_consent_version text check (parent_consent_version is null or char_length(parent_consent_version) <= 40),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references public.users(id) on delete set null,
  check (child_id is null or child_id <> parent_id),
  check (status <> 'active' or child_id is not null),
  check (status <> 'invited' or (invite_hash is not null and invite_expires_at is not null))
);
create unique index if not exists ai_learner_family_invite_idx on public.ai_learner_family_links (invite_hash) where invite_hash is not null;
create unique index if not exists ai_learner_family_active_idx on public.ai_learner_family_links (workspace_id, parent_id, child_id) where status = 'active';
create index if not exists ai_learner_family_parent_idx on public.ai_learner_family_links (parent_id, workspace_id, status);
create index if not exists ai_learner_family_child_idx on public.ai_learner_family_links (child_id, status) where child_id is not null;
alter table public.ai_learner_family_links enable row level security;
revoke all on public.ai_learner_family_links from anon, authenticated;

-- One parent's family changes one at a time (an advisory lock per parent and
-- workspace), so "up to 3 children" holds when invites and accepts race.
create or replace function public.ai_learner_family_invite(
  p_workspace uuid, p_parent uuid, p_label text, p_hash text, p_hint text, p_expires timestamptz, p_consent text, p_now timestamptz, p_limit integer default 3
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai_learner_family:' || p_workspace::text || ':' || p_parent::text, 0));
  update public.ai_learner_family_links set status = 'expired', invite_hash = null
    where workspace_id = p_workspace and parent_id = p_parent and status = 'invited' and invite_expires_at <= p_now;
  select count(*) into v_count from public.ai_learner_family_links
    where workspace_id = p_workspace and parent_id = p_parent and status in ('invited', 'active');
  if v_count >= p_limit then
    return jsonb_build_object('ok', false, 'code', 'limit', 'count', v_count);
  end if;
  insert into public.ai_learner_family_links (workspace_id, parent_id, child_label, status, invite_hash, invite_hint, invite_expires_at, parent_consent_version, created_at)
    values (p_workspace, p_parent, btrim(p_label), 'invited', p_hash, p_hint, p_expires, p_consent, p_now)
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.ai_learner_family_accept(p_hash text, p_child uuid, p_now timestamptz, p_limit integer default 3)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_found public.ai_learner_family_links;
  v_link public.ai_learner_family_links;
  v_count integer;
begin
  select * into v_found from public.ai_learner_family_links where invite_hash = p_hash;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  -- The same lock order as invites: the parent's lock first, then the row.
  perform pg_advisory_xact_lock(hashtextextended('ai_learner_family:' || v_found.workspace_id::text || ':' || v_found.parent_id::text, 0));
  select * into v_link from public.ai_learner_family_links where id = v_found.id for update;
  if v_link.status <> 'invited' or v_link.invite_hash is distinct from p_hash then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_link.invite_expires_at <= p_now then
    update public.ai_learner_family_links set status = 'expired', invite_hash = null where id = v_link.id;
    return jsonb_build_object('ok', false, 'code', 'expired');
  end if;
  if v_link.parent_id = p_child then
    return jsonb_build_object('ok', false, 'code', 'own_invite');
  end if;
  if exists (select 1 from public.ai_learner_family_links where workspace_id = v_link.workspace_id and parent_id = v_link.parent_id and child_id = p_child and status = 'active') then
    update public.ai_learner_family_links set status = 'expired', invite_hash = null where id = v_link.id;
    return jsonb_build_object('ok', false, 'code', 'already_linked');
  end if;
  select count(*) into v_count from public.ai_learner_family_links
    where workspace_id = v_link.workspace_id and parent_id = v_link.parent_id and status = 'active';
  if v_count >= p_limit then
    return jsonb_build_object('ok', false, 'code', 'limit');
  end if;
  update public.ai_learner_family_links
    set status = 'active', child_id = p_child, accepted_at = p_now, invite_hash = null, invite_hint = null
    where id = v_link.id;
  return jsonb_build_object('ok', true, 'id', v_link.id, 'workspace_id', v_link.workspace_id, 'parent_id', v_link.parent_id);
end $$;

revoke all on function public.ai_learner_family_invite(uuid, uuid, text, text, text, timestamptz, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.ai_learner_family_accept(text, uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.ai_learner_family_invite(uuid, uuid, text, text, text, timestamptz, text, timestamptz, integer) to service_role;
grant execute on function public.ai_learner_family_accept(text, uuid, timestamptz, integer) to service_role;

-- --- What a learner did (summaries only) ---------------------------------------------
create table if not exists public.ai_learner_activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  workspace_id uuid references public.ai_workspaces(id) on delete cascade,
  feature text not null check (feature ~ '^[A-Z][A-Z0-9]{0,4}$'),
  kind text not null check (kind ~ '^[a-z][a-z_]{1,30}$'),
  score numeric(7, 2) check (score is null or score between -1000 and 100000),
  minutes smallint not null default 0 check (minutes between 0 and 240),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object' and pg_column_size(summary) <= 4000),
  created_at timestamptz not null default now()
);
create index if not exists ai_learner_activity_user_idx on public.ai_learner_activity (user_id, created_at desc);
alter table public.ai_learner_activity enable row level security;
revoke all on public.ai_learner_activity from anon, authenticated;

-- --- Generated artefacts ---------------------------------------------------------------
create table if not exists public.ai_learner_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  kind text not null check (kind in (
    'explain', 'writing', 'ladder', 'essay', 'speaking', 'pronunciation', 'plan', 'gap', 'abroad',
    'words', 'reading', 'photo', 'hint', 'brief', 'parent_brief'
  )),
  -- One record per learner and day for daily kinds (the brief).
  day date,
  status text not null default 'ready' check (status in ('active', 'ready', 'finished', 'archived')),
  input jsonb not null default '{}'::jsonb check (jsonb_typeof(input) = 'object' and pg_column_size(input) <= 64000),
  output jsonb not null default '{}'::jsonb check (jsonb_typeof(output) = 'object' and pg_column_size(output) <= 128000),
  -- Answer keys and worked solutions: never sent to a browser before they are earned.
  secret jsonb not null default '{}'::jsonb check (jsonb_typeof(secret) = 'object' and pg_column_size(secret) <= 64000),
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object' and pg_column_size(state) <= 128000),
  version integer not null default 1 check (version >= 1),
  credits integer not null default 0 check (credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_learner_records_user_idx on public.ai_learner_records (user_id, kind, created_at desc);
create unique index if not exists ai_learner_records_day_idx on public.ai_learner_records (user_id, kind, day) where day is not null;
alter table public.ai_learner_records enable row level security;
revoke all on public.ai_learner_records from anon, authenticated;

-- --- Brief schedules (L14 daily, P1 weekly) ----------------------------------------------
create table if not exists public.ai_learner_briefs (
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('daily', 'parent')),
  enabled boolean not null default true,
  -- Local time of day; never inside quiet hours (22:00–08:00).
  send_time time not null default '08:30',
  -- The parent brief's day of the week (0 = Sunday).
  weekday smallint check (weekday is null or weekday between 0 and 6),
  time_zone text not null default 'Asia/Tashkent' check (time_zone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$'),
  locale text not null default 'en' check (locale in ('en', 'uz', 'ru')),
  next_due_at timestamptz,
  last_sent_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind),
  check (send_time >= time '08:00' and send_time < time '22:00'),
  check (kind = 'parent' or weekday is null)
);
create index if not exists ai_learner_briefs_due_idx on public.ai_learner_briefs (next_due_at) where enabled;
alter table public.ai_learner_briefs enable row level security;
revoke all on public.ai_learner_briefs from anon, authenticated;

-- --- Profile snapshots (summaries the learner already sees in "What Schood AI knows") --
create table if not exists public.ai_learner_snapshots (
  user_id uuid primary key references public.users(id) on delete cascade,
  profile jsonb check (profile is null or (jsonb_typeof(profile) = 'object' and pg_column_size(profile) <= 16000)),
  prediction jsonb check (prediction is null or (jsonb_typeof(prediction) = 'object' and pg_column_size(prediction) <= 16000)),
  refreshed_at timestamptz not null default now()
);
alter table public.ai_learner_snapshots enable row level security;
revoke all on public.ai_learner_snapshots from anon, authenticated;

-- --- The Telegram tutor thread -------------------------------------------------------------
create table if not exists public.ai_learner_telegram (
  user_id uuid primary key references public.users(id) on delete cascade,
  workspace_id uuid references public.ai_workspaces(id) on delete cascade,
  thread_id uuid,
  updated_at timestamptz not null default now()
);
alter table public.ai_learner_telegram enable row level security;
revoke all on public.ai_learner_telegram from anon, authenticated;

-- --- AI-made duels (L17) on top of english_duels ---------------------------------------------
create table if not exists public.ai_learner_duels (
  duel_id uuid primary key,
  code text not null check (code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  creator_id uuid not null references public.users(id) on delete cascade,
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  topic text not null check (char_length(btrim(topic)) between 1 and 80),
  level text check (level is null or level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  referral_code text check (referral_code is null or referral_code ~ '^[A-Z0-9]{4,16}$'),
  -- When the creator's result was counted as a learning event (once).
  scored_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ai_learner_duels_code_unique unique (code)
);
create index if not exists ai_learner_duels_creator_idx on public.ai_learner_duels (creator_id, created_at desc);
alter table public.ai_learner_duels enable row level security;
revoke all on public.ai_learner_duels from anon, authenticated;

commit;
