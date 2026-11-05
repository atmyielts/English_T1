-- Schood AI lifetime engagement layer (docs/product/44_SCHOOD_AI.md, E1–E14):
-- XP from verified learning, streak freezes, weekly leagues, journeys and the
-- lifetime path, dated goals, squads, story mode, the Skill Passport and its share
-- links, then-vs-now samples, Skill Certificates on Proctor Lite, the talent pool
-- (switched off), seasons and sponsors, centre leagues, and the message outbox.
-- ============================================================================
-- Read and written only by the schood-ai Edge Function with the service role:
-- RLS on, no policies, nothing granted to browsers. XP is never written by an
-- area: ai_engage_ingest reads public.ai_learning_events (core, append-only) and
-- counts verified rows only, once each, under a per-person advisory lock, with the
-- same XP rule as supabase/functions/schood-ai/engage/rules.ts. Groups of 30,
-- squads of 5, one freeze a week and one sitting per purchase are enforced here,
-- so racing requests cannot break them.
-- ============================================================================
begin;

-- The talent pool (E13) has no table switch: it is the core switch engage.talent_pool,
-- set in the admin console, and stays off until that switch is set to on.

-- --- Profiles: age, boards, limits ---------------------------------------------------
-- The time zone, preferred hour, quiet hours, delivery and muted kinds are core's
-- notification preferences (ai_notify_prefs, core/notify-prefs); engage reads them.
create table if not exists public.ai_engage_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  -- Set once by the person. Unknown means under 18 for every protection.
  birth_date date check (birth_date is null or birth_date > date '1900-01-01'),
  locale text not null default 'en' check (locale in ('en', 'uz', 'ru')),
  region text check (region is null or region ~ '^[a-z_]{2,20}$'),
  school text check (school is null or char_length(school) between 2 and 80),
  leaderboard text check (leaderboard is null or leaderboard in ('public', 'masked', 'hidden')),
  league_opt_out boolean not null default false,
  daily_limit_minutes smallint check (daily_limit_minutes is null or daily_limit_minutes between 15 and 120),
  limit_set_by text check (limit_set_by is null or limit_set_by in ('self', 'parent')),
  offers_muted boolean not null default false,
  level_band text not null default 'open' check (level_band in ('foundation', 'core', 'advanced', 'open')),
  lapse_stage smallint not null default 0 check (lapse_stage between 0 and 3),
  -- Highest ai_learning_events id already counted for this person.
  event_cursor bigint not null default 0 check (event_cursor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((daily_limit_minutes is null) = (limit_set_by is null))
);

-- --- XP from verified learning, and days ------------------------------------------------
create table if not exists public.ai_engage_xp (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  event_id bigint unique references public.ai_learning_events(id) on delete cascade,
  source text not null check (source in ('event', 'quest', 'challenge')),
  source_key text check (source_key is null or source_key ~ '^[0-9a-z_:-]{3,80}$'),
  xp integer not null check (xp between 0 and 500),
  day date not null,
  week_start date not null,
  feature text check (feature is null or feature ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,60}$'),
  created_at timestamptz not null default now(),
  check ((source = 'event') = (event_id is not null)),
  check (source = 'event' or (source_key is not null and xp between 1 and 100))
);
create unique index if not exists ai_engage_xp_bonus_idx on public.ai_engage_xp (user_id, source, source_key) where source <> 'event';
create index if not exists ai_engage_xp_user_week_idx on public.ai_engage_xp (user_id, week_start);
create index if not exists ai_engage_xp_week_idx on public.ai_engage_xp (week_start, user_id);
create index if not exists ai_engage_xp_user_day_idx on public.ai_engage_xp (user_id, day);

create table if not exists public.ai_engage_days (
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  xp integer not null default 0 check (xp >= 0),
  minutes integer not null default 0 check (minutes >= 0),
  events integer not null default 0 check (events >= 0),
  primary key (user_id, day)
);

create table if not exists public.ai_engage_freeze_buys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  week_start date not null,
  reference text not null unique check (char_length(reference) between 8 and 200),
  credits smallint not null check (credits between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  created_at timestamptz not null default now()
);
-- One freeze a week, however many requests race.
create unique index if not exists ai_engage_freeze_week_idx on public.ai_engage_freeze_buys (user_id, week_start);

-- --- Leagues ------------------------------------------------------------------------------
create table if not exists public.ai_engage_league_groups (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  tier text not null check (tier in ('bronze', 'silver', 'gold', 'sapphire', 'diamond')),
  band text not null check (band in ('foundation', 'core', 'advanced', 'open')),
  finalized_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ai_engage_league_groups_open_idx on public.ai_engage_league_groups (week_start, tier, band, created_at) where finalized_at is null;
create table if not exists public.ai_engage_league_members (
  group_id uuid not null references public.ai_engage_league_groups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  week_start date not null,
  tier text not null check (tier in ('bronze', 'silver', 'gold', 'sapphire', 'diamond')),
  joined_at timestamptz not null default now(),
  xp integer not null default 0 check (xp >= 0),
  final_rank integer check (final_rank is null or final_rank > 0),
  outcome text check (outcome is null or outcome in ('promoted', 'stayed', 'demoted')),
  primary key (group_id, user_id),
  unique (user_id, week_start)
);
create index if not exists ai_engage_league_members_group_idx on public.ai_engage_league_members (group_id, xp desc);

-- --- Journeys, the lifetime path, dated goals --------------------------------------------
create table if not exists public.ai_engage_journeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  journey_key text not null check (journey_key ~ '^[a-z0-9_]{2,40}$'),
  status text not null default 'active' check (status in ('active', 'paused', 'graduated', 'left')),
  started_on date not null,
  target_date date,
  completed jsonb not null default '[]'::jsonb check (jsonb_typeof(completed) = 'array' and jsonb_array_length(completed) <= 60),
  graduated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ai_engage_journeys_open_idx on public.ai_engage_journeys (user_id, journey_key) where status in ('active', 'paused');
create index if not exists ai_engage_journeys_user_idx on public.ai_engage_journeys (user_id);

create table if not exists public.ai_engage_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  goal_key text not null check (goal_key ~ '^[a-z0-9_]{2,40}$'),
  status text not null check (status in ('ready', 'active', 'done', 'skipped')),
  done_by text check (done_by is null or done_by in ('journey', 'outcome', 'self')),
  outcome jsonb not null default '{}'::jsonb check (jsonb_typeof(outcome) = 'object' and pg_column_size(outcome) <= 4000),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  unique (user_id, goal_key)
);

create table if not exists public.ai_engage_dates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('exam', 'interview', 'deadline', 'presentation', 'other')),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  on_date date not null,
  at_time text check (at_time is null or at_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  goal_key text check (goal_key is null or goal_key ~ '^[a-z0-9_]{2,40}$'),
  done boolean not null default false,
  result text check (result is null or char_length(result) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists ai_engage_dates_user_idx on public.ai_engage_dates (user_id, on_date);

-- --- Squads ------------------------------------------------------------------------------------
create table if not exists public.ai_engage_squads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 40),
  owner_id uuid not null references public.users(id) on delete cascade,
  invite_code text not null unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  weekly_goal_minutes integer not null default 150 check (weekly_goal_minutes between 30 and 1200),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create table if not exists public.ai_engage_squad_members (
  squad_id uuid not null references public.ai_engage_squads(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  referral_code text check (referral_code is null or referral_code ~ '^[A-Z0-9]{4,16}$'),
  primary key (squad_id, user_id)
);
-- One active squad per person.
create unique index if not exists ai_engage_one_squad_idx on public.ai_engage_squad_members (user_id) where left_at is null;

-- --- Story mode -----------------------------------------------------------------------------------
create table if not exists public.ai_engage_story_progress (
  user_id uuid not null references public.users(id) on delete cascade,
  arc_key text not null check (arc_key ~ '^[a-z0-9_]{2,40}$'),
  unlocked smallint not null default 1 check (unlocked between 1 and 200),
  last_unlocked_on date,
  flags jsonb not null default '{}'::jsonb check (jsonb_typeof(flags) = 'object' and pg_column_size(flags) <= 4000),
  updated_at timestamptz not null default now(),
  primary key (user_id, arc_key)
);
create table if not exists public.ai_engage_story_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  arc_key text not null check (arc_key ~ '^[a-z0-9_]{2,40}$'),
  episode_key text not null check (episode_key ~ '^[a-z0-9_]{2,20}$'),
  correct smallint not null,
  total smallint not null check (total between 1 and 10 and correct between 0 and total),
  passed boolean not null,
  choice text check (choice is null or char_length(choice) <= 12),
  created_at timestamptz not null default now()
);
-- An episode is passed once: the first pass is the one verified event.
create unique index if not exists ai_engage_story_first_pass_idx on public.ai_engage_story_results (user_id, arc_key, episode_key) where passed;
create index if not exists ai_engage_story_results_user_idx on public.ai_engage_story_results (user_id, arc_key);
create table if not exists public.ai_engage_story_episodes (
  user_id uuid not null references public.users(id) on delete cascade,
  arc_key text not null check (arc_key ~ '^[a-z0-9_]{2,40}$'),
  episode_key text not null check (episode_key ~ '^[a-z0-9_]{2,20}$'),
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 40000),
  credits smallint not null default 0 check (credits between 0 and 1000),
  created_at timestamptz not null default now(),
  primary key (user_id, arc_key, episode_key)
);

-- --- Skill Passport ----------------------------------------------------------------------------------
create table if not exists public.ai_engage_passports (
  user_id uuid primary key references public.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 60),
  headline text check (headline is null or char_length(headline) <= 160),
  updated_at timestamptz
);
create table if not exists public.ai_engage_passport_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('certificate', 'result', 'level', 'journey', 'sample')),
  source text not null check (source ~ '^[a-z][a-z0-9_]{1,30}$'),
  source_ref text not null check (char_length(source_ref) between 1 and 200),
  title text not null check (char_length(title) between 1 and 120),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 8000),
  verify_url text check (verify_url is null or verify_url ~ '^https://'),
  verified boolean not null default false,
  -- Private by default: nothing is shown until the person chooses it.
  shown boolean not null default false,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, source, source_ref)
);
create table if not exists public.ai_engage_passport_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  -- SHA-256 of the token; the token itself is never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text not null check (char_length(btrim(label)) between 1 and 60),
  item_ids uuid[] not null check (cardinality(item_ids) between 1 and 60),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  views integer not null default 0 check (views >= 0),
  last_viewed_at timestamptz
);
create index if not exists ai_engage_passport_links_user_idx on public.ai_engage_passport_links (user_id);

-- --- Then vs now samples ------------------------------------------------------------------------------
create table if not exists public.ai_engage_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('voice', 'writing')),
  source text not null check (source ~ '^[a-z][a-z0-9_]{1,30}$'),
  source_ref text check (source_ref is null or char_length(source_ref) between 1 and 200),
  -- A reference to stored audio (provider, bucket, path), never the bytes.
  storage jsonb check (storage is null or (jsonb_typeof(storage) = 'object' and pg_column_size(storage) <= 1000)),
  text text check (text is null or char_length(text) <= 20000),
  prompt_key text check (prompt_key is null or char_length(prompt_key) <= 60),
  feature text check (feature is null or feature ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,60}$'),
  scores jsonb not null default '{}'::jsonb check (jsonb_typeof(scores) = 'object' and pg_column_size(scores) <= 2000),
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object' and pg_column_size(metrics) <= 2000),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 600000),
  recorded_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (kind = 'writing' or storage is not null or source_ref is not null),
  check (kind = 'voice' or text is not null)
);
create unique index if not exists ai_engage_samples_source_idx on public.ai_engage_samples (user_id, source, source_ref) where source_ref is not null;
create index if not exists ai_engage_samples_user_idx on public.ai_engage_samples (user_id, recorded_at);

-- --- Skill Certificates on Proctor Lite -----------------------------------------------------------------
create table if not exists public.ai_engage_sittings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  exam_key text not null check (exam_key ~ '^[a-z0-9_]{2,40}$'),
  status text not null default 'started' check (status in ('started', 'submitted', 'passed', 'failed', 'voided', 'expired')),
  -- One purchased sitting is one sitting.
  entitlement_ref text not null unique check (char_length(entitlement_ref) between 3 and 200),
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 8000),
  responses jsonb not null default '{}'::jsonb check (jsonb_typeof(responses) = 'object' and pg_column_size(responses) <= 60000),
  auto_score smallint check (auto_score is null or auto_score >= 0),
  auto_total smallint check (auto_total is null or auto_total > 0),
  review jsonb check (review is null or (jsonb_typeof(review) = 'object' and pg_column_size(review) <= 8000)),
  integrity jsonb not null default '{}'::jsonb check (jsonb_typeof(integrity) = 'object' and pg_column_size(integrity) <= 4000),
  last_heartbeat_at timestamptz,
  reviewer_id uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  certificate_id uuid,
  check (deadline_at > started_at),
  check (reviewer_id is null or reviewer_id <> user_id)
);
create index if not exists ai_engage_sittings_user_idx on public.ai_engage_sittings (user_id, started_at desc);
create index if not exists ai_engage_sittings_review_idx on public.ai_engage_sittings (submitted_at) where status = 'submitted';
-- Browser signals from Proctor Lite's client, once per (stream, sequence).
create table if not exists public.ai_engage_sitting_signals (
  sitting_id uuid not null references public.ai_engage_sittings(id) on delete cascade,
  stream uuid not null,
  seq integer not null check (seq between 1 and 999999),
  kind text not null check (kind in ('focus_loss', 'focus_return', 'tab_hidden', 'tab_visible', 'fullscreen_enter', 'fullscreen_exit', 'copy', 'paste', 'cut', 'context_menu', 'online', 'offline', 'client_loaded', 'camera_lost', 'camera_restored')),
  at timestamptz not null,
  primary key (sitting_id, stream, seq)
);
create table if not exists public.ai_engage_certificates (
  id uuid primary key default gen_random_uuid(),
  -- 12 Crockford base32 characters, as Schood English certificates.
  code text not null unique check (code ~ '^[0-9A-HJKMNP-TV-Z]{12}$'),
  user_id uuid not null references public.users(id) on delete cascade,
  exam_key text not null check (exam_key ~ '^[a-z0-9_]{2,40}$'),
  level text not null check (char_length(level) between 1 and 20),
  display_name text not null check (char_length(display_name) between 2 and 60),
  score smallint not null check (score between 0 and 100),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  sitting_id uuid unique references public.ai_engage_sittings(id) on delete set null,
  test boolean not null default false,
  check (revoked_at is null or revoked_at >= issued_at)
);
create index if not exists ai_engage_certificates_user_idx on public.ai_engage_certificates (user_id);

-- --- Talent pool (switched off) ---------------------------------------------------------------------------
create table if not exists public.ai_engage_talent (
  user_id uuid primary key references public.users(id) on delete cascade,
  candidate_key text unique check (candidate_key is null or candidate_key ~ '^[0-9a-f]{24}$'),
  consent_version text check (consent_version is null or char_length(consent_version) <= 40),
  consented_at timestamptz,
  withdrawn_at timestamptz,
  headline text check (headline is null or char_length(headline) <= 140),
  skills text[] not null default '{}' check (cardinality(skills) <= 8),
  open_to text[] not null default '{}' check (cardinality(open_to) <= 4),
  regions text[] not null default '{}' check (cardinality(regions) <= 5),
  passport_link_id uuid references public.ai_engage_passport_links(id) on delete set null,
  updated_at timestamptz,
  check (consented_at is not null or withdrawn_at is null)
);
create index if not exists ai_engage_talent_open_idx on public.ai_engage_talent (consented_at) where consented_at is not null and withdrawn_at is null;
create table if not exists public.ai_engage_talent_employers (
  user_id uuid primary key references public.users(id) on delete cascade,
  organisation text not null check (char_length(btrim(organisation)) between 1 and 120),
  kind text not null check (kind in ('employer', 'university', 'centre')),
  granted_by uuid references public.users(id) on delete set null,
  active_until timestamptz,
  created_at timestamptz not null default now()
);
-- Every search and profile view; append-only. Deleting an account clears its id but keeps the trail.
create table if not exists public.ai_engage_talent_audit (
  id bigint generated always as identity primary key,
  employer_id uuid references public.users(id) on delete set null,
  action text not null check (action in ('search', 'view')),
  query jsonb not null default '{}'::jsonb check (jsonb_typeof(query) = 'object' and pg_column_size(query) <= 2000),
  target_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ai_engage_talent_audit_employer_idx on public.ai_engage_talent_audit (employer_id, created_at desc);
create index if not exists ai_engage_talent_audit_target_idx on public.ai_engage_talent_audit (target_user_id, created_at desc) where target_user_id is not null;

-- --- Seasons, events, sponsors, centre league ----------------------------------------------------------------
create table if not exists public.ai_engage_sponsors (
  event_key text primary key check (event_key ~ '^(season:[0-9]{4}-q[1-4]|mock:[0-9]{4}-[0-9]{2}-[0-9]{2}|tournament:(speaking|sales):[0-9]{4}-[0-9]{2})$'),
  sponsor_name text not null check (char_length(btrim(sponsor_name)) between 1 and 80),
  logo_url text check (logo_url is null or logo_url ~ '^https://'),
  prize jsonb not null default '{}'::jsonb check (jsonb_typeof(prize) = 'object' and pg_column_size(prize) <= 2000),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.ai_engage_event_entries (
  event_key text not null check (event_key ~ '^tournament:(speaking|sales):[0-9]{4}-[0-9]{2}$'),
  user_id uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (event_key, user_id)
);
create index if not exists ai_engage_event_entries_user_idx on public.ai_engage_event_entries (user_id);
create table if not exists public.ai_engage_centre_league (
  workspace_id uuid primary key references public.ai_workspaces(id) on delete cascade,
  opted_by uuid references public.users(id) on delete set null,
  opted_at timestamptz not null default now()
);

-- --- Outbox, planning ticks, offer dismissals -----------------------------------------------------------------
create table if not exists public.ai_engage_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  channel text not null check (channel in ('telegram', 'web')),
  kind text not null check (kind ~ '^[a-z][a-z0-9_]{2,40}$'),
  priority smallint not null default 0 check (priority between 0 and 100),
  dedupe_key text not null unique check (char_length(dedupe_key) between 3 and 200),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 8000),
  due_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued', 'claimed', 'sent', 'skipped', 'expired', 'failed')),
  claim_token uuid,
  claimed_at timestamptz,
  attempts smallint not null default 0 check (attempts between 0 and 50),
  reason text check (reason is null or char_length(reason) <= 80),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check ((status = 'claimed') = (claim_token is not null))
);
create index if not exists ai_engage_outbox_due_idx on public.ai_engage_outbox (user_id, channel, due_at) where status = 'queued';
create index if not exists ai_engage_outbox_user_idx on public.ai_engage_outbox (user_id, created_at desc);
create index if not exists ai_engage_outbox_send_idx on public.ai_engage_outbox (channel, due_at) where status = 'queued';
create index if not exists ai_engage_outbox_claimed_idx on public.ai_engage_outbox (claimed_at) where status = 'claimed';
create table if not exists public.ai_engage_ticks (
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
create table if not exists public.ai_engage_offer_dismissals (
  user_id uuid not null references public.users(id) on delete cascade,
  offer_key text not null check (offer_key ~ '^[a-z0-9_.:-]{2,60}$'),
  dismissed_at timestamptz not null default now(),
  primary key (user_id, offer_key)
);

-- --- Audio to delete -------------------------------------------------------------------------------
-- Stored audio of engage rows that are gone: an account closed through the erasure
-- registry, a deleted sample once it is pruned, a sitting. The delete triggers below queue
-- only references under schood-ai/engage/ (a sample may point at audio another area stored,
-- which engage never deletes); the engage.media_sweep job deletes the objects through
-- _shared/media-storage.ts and removes the row. Nothing here but the object reference.
create table if not exists public.ai_engage_media_trash (
  id bigint generated always as identity primary key,
  storage jsonb not null check (jsonb_typeof(storage) = 'object' and pg_column_size(storage) <= 1000),
  source text not null check (source in ('sample', 'sitting')),
  queued_at timestamptz not null default now(),
  next_try_at timestamptz not null default now(),
  attempts smallint not null default 0 check (attempts between 0 and 50),
  last_error text check (last_error is null or char_length(last_error) <= 200)
);
create index if not exists ai_engage_media_trash_due_idx on public.ai_engage_media_trash (next_try_at, id);

-- --- updated_at ---------------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ai_engage_profiles', 'ai_engage_journeys', 'ai_engage_story_progress'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- --- Append-only XP and talent audit -----------------------------------------------------------------------------
create or replace function public.ai_engage_xp_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then raise exception 'ai_engage_xp is append-only' using errcode = '42501'; end if;
  -- Rows leave only with their person: the users cascade, or the account erasure
  -- transaction (it runs as a trigger, as does the cascade from ai_learning_events).
  if pg_trigger_depth() > 1 or not exists (select 1 from public.users where id = old.user_id) then return old; end if;
  raise exception 'ai_engage_xp is append-only' using errcode = '42501';
end $$;
drop trigger if exists ai_engage_xp_guard on public.ai_engage_xp;
create trigger ai_engage_xp_guard before update or delete on public.ai_engage_xp for each row execute function public.ai_engage_xp_guard();

create or replace function public.ai_engage_talent_audit_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'ai_engage_talent_audit is append-only' using errcode = '42501'; end if;
  -- Clearing an erased learner's id (from inside a trigger) keeps the act, not the person.
  -- The only change allowed is an account deletion clearing its id.
  if (new.employer_id is null or new.employer_id = old.employer_id) and (new.target_user_id is null or new.target_user_id is not distinct from old.target_user_id)
     and new.action = old.action and new.query = old.query and new.created_at = old.created_at then
    return new;
  end if;
  raise exception 'ai_engage_talent_audit is append-only' using errcode = '42501';
end $$;
drop trigger if exists ai_engage_talent_audit_guard on public.ai_engage_talent_audit;
create trigger ai_engage_talent_audit_guard before update or delete on public.ai_engage_talent_audit for each row execute function public.ai_engage_talent_audit_guard();

-- A squad outlives the person who leaves it: when an owner's membership row goes (they
-- left, or their account was erased), the longest-standing member takes over; an empty
-- squad is archived. When a talent profile goes, its owner is cleared from the audit.
create or replace function public.ai_engage_squad_member_gone() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare heir uuid;
begin
  select user_id into heir from public.ai_engage_squad_members where squad_id = old.squad_id and left_at is null and user_id <> old.user_id order by joined_at, user_id limit 1;
  if heir is null then
    update public.ai_engage_squads set archived_at = coalesce(archived_at, now()) where id = old.squad_id;
  else
    update public.ai_engage_squads set owner_id = heir where id = old.squad_id and owner_id = old.user_id;
    update public.ai_engage_squad_members set role = 'owner' where squad_id = old.squad_id and user_id = heir and exists (select 1 from public.ai_engage_squads where id = old.squad_id and owner_id = heir);
  end if;
  return old;
end $$;
drop trigger if exists ai_engage_squad_member_gone on public.ai_engage_squad_members;
create trigger ai_engage_squad_member_gone after delete on public.ai_engage_squad_members for each row execute function public.ai_engage_squad_member_gone();

create or replace function public.ai_engage_talent_gone() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.ai_engage_talent_audit set target_user_id = null where target_user_id = old.user_id;
  return old;
end $$;
drop trigger if exists ai_engage_talent_gone on public.ai_engage_talent;
create trigger ai_engage_talent_gone after delete on public.ai_engage_talent for each row execute function public.ai_engage_talent_gone();

-- --- Functions ----------------------------------------------------------------------------------------------------------

-- The XP of one learning event. Must equal eventXp() in engage/rules.ts (tested on both sides).
create or replace function public.ai_engage_event_xp(p_kind text, p_minutes integer, p_verified boolean default true)
returns integer language sql immutable set search_path = public, pg_temp as $$
  select case
    when not coalesce(p_verified, false) or p_kind not in ('turn_scored', 'check_passed', 'drill_finished', 'mock_finished', 'outcome_recorded') then 0
    else (case p_kind when 'turn_scored' then 5 when 'check_passed' then 5 when 'drill_finished' then 10 when 'mock_finished' then 30 else 50 end)
      + 2 * least(30, greatest(0, coalesce(p_minutes, 0))) end
$$;

-- Counts the person's verified learning events not yet counted: once each (unique event_id),
-- at most 600 XP a day from learning, in their local day, Tashkent league week.
create or replace function public.ai_engage_ingest(p_user uuid, p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  tz text; cursor_id bigint; last_id bigint;
  e public.ai_learning_events; v_day date; v_week date; v_full integer; v_earned integer; v_granted integer;
  counted integer := 0; awarded integer := 0; capped integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai_engage:' || p_user::text, 0));
  insert into public.ai_engage_profiles (user_id) values (p_user) on conflict (user_id) do nothing;
  select event_cursor into cursor_id from public.ai_engage_profiles where user_id = p_user;
  -- Local days in the zone the person chose in core's notification preferences.
  tz := coalesce((select np.time_zone from public.ai_notify_prefs np where np.user_id = p_user), 'Asia/Tashkent');
  last_id := cursor_id;
  for e in select * from public.ai_learning_events where user_id = p_user and id > cursor_id and created_at <= p_now order by id limit 5000 loop
    last_id := e.id;
    continue when not e.verified;
    v_day := (e.created_at at time zone tz)::date;
    v_week := date_trunc('week', e.created_at at time zone 'Asia/Tashkent')::date;
    v_full := coalesce(public.ai_engage_event_xp(e.kind, e.verified_minutes, e.verified), 0);
    select coalesce(sum(xp), 0) into v_earned from public.ai_engage_xp where user_id = p_user and day = v_day and source = 'event';
    v_granted := greatest(0, least(v_full, 600 - v_earned));
    insert into public.ai_engage_xp (user_id, event_id, source, xp, day, week_start, feature)
      values (p_user, e.id, 'event', v_granted, v_day, v_week, e.feature)
      on conflict (event_id) do nothing;
    if found then
      counted := counted + 1; awarded := awarded + v_granted; capped := capped + (v_full - v_granted);
      insert into public.ai_engage_days (user_id, day, xp, minutes, events) values (p_user, v_day, v_granted, e.verified_minutes, 1)
        on conflict (user_id, day) do update set xp = public.ai_engage_days.xp + excluded.xp, minutes = public.ai_engage_days.minutes + excluded.minutes, events = public.ai_engage_days.events + 1;
      if v_granted > 0 then
        update public.ai_engage_league_members set xp = xp + v_granted where user_id = p_user and week_start = v_week;
      end if;
    end if;
  end loop;
  update public.ai_engage_profiles set event_cursor = last_id where user_id = p_user and event_cursor < last_id;
  return jsonb_build_object('events', counted, 'awarded', awarded, 'capped', capped);
end $$;

-- The same for the people a screen shows together (a squad, a league group), at most 100.
create or replace function public.ai_engage_ingest_many(p_users uuid[], p_now timestamptz default now())
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid;
begin
  foreach v_user in array coalesce(p_users[1:100], '{}') loop
    perform public.ai_engage_ingest(v_user, p_now);
  end loop;
end $$;

-- The catch-up run (pg_cron, every five minutes): people with verified events in the last
-- eight days that engage has not counted yet, so boards and squads stay current.
create or replace function public.ai_engage_ingest_pending(p_limit integer default 500)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid; n integer := 0;
begin
  for v_user in
    select distinct e.user_id from public.ai_learning_events e
      left join public.ai_engage_profiles p on p.user_id = e.user_id
     where e.verified and e.created_at > now() - interval '8 days' and e.id > coalesce(p.event_cursor, 0)
     limit greatest(1, least(coalesce(p_limit, 500), 5000))
  loop
    perform public.ai_engage_ingest(v_user, now());
    n := n + 1;
  end loop;
  return n;
end $$;

-- A quest or challenge bonus, once per key, under the same lock.
create or replace function public.ai_engage_award_bonus(p_user uuid, p_source text, p_key text, p_xp integer, p_day date, p_week date)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_source not in ('quest', 'challenge') or p_xp is null or p_xp < 1 or p_xp > 100 then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('ai_engage:' || p_user::text, 0));
  insert into public.ai_engage_xp (user_id, source, source_key, xp, day, week_start)
    values (p_user, p_source, p_key, p_xp, p_day, p_week)
    on conflict (user_id, source, source_key) where source <> 'event' do nothing;
  if not found then return false; end if;
  insert into public.ai_engage_days (user_id, day, xp) values (p_user, p_day, p_xp)
    on conflict (user_id, day) do update set xp = public.ai_engage_days.xp + excluded.xp;
  update public.ai_engage_league_members set xp = xp + p_xp where user_id = p_user and week_start = p_week;
  return true;
end $$;

-- Reserves this week's freeze purchase (resumes a pending one with the same reference).
create or replace function public.ai_engage_freeze_reserve(p_user uuid, p_day date, p_week date, p_reference text, p_credits integer)
returns public.ai_engage_freeze_buys
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.ai_engage_freeze_buys;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai_engage:' || p_user::text, 0));
  select * into v_row from public.ai_engage_freeze_buys where reference = p_reference and status = 'pending';
  if found then return v_row; end if;
  if exists (select 1 from public.ai_engage_freeze_buys where user_id = p_user and week_start = p_week) then return null; end if;
  insert into public.ai_engage_freeze_buys (user_id, day, week_start, reference, credits) values (p_user, p_day, p_week, p_reference, p_credits)
    on conflict do nothing returning * into v_row;
  return v_row;
end $$;

-- Joins the oldest open group of that week, tier and band with room for one more (30), or a new one.
create or replace function public.ai_engage_league_join(p_user uuid, p_week date, p_tier text, p_band text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_group uuid; v_xp integer;
begin
  select group_id into v_group from public.ai_engage_league_members where user_id = p_user and week_start = p_week;
  if found then return v_group; end if;
  perform pg_advisory_xact_lock(hashtextextended('ai_engage_league:' || p_week::text || ':' || p_tier || ':' || p_band, 0));
  select group_id into v_group from public.ai_engage_league_members where user_id = p_user and week_start = p_week;
  if found then return v_group; end if;
  select g.id into v_group from public.ai_engage_league_groups g
    where g.week_start = p_week and g.tier = p_tier and g.band = p_band and g.finalized_at is null
      and (select count(*) from public.ai_engage_league_members m where m.group_id = g.id) < 30
    order by g.created_at, g.id limit 1;
  if v_group is null then
    insert into public.ai_engage_league_groups (week_start, tier, band) values (p_week, p_tier, p_band) returning id into v_group;
  end if;
  select coalesce(sum(xp), 0) into v_xp from public.ai_engage_xp where user_id = p_user and week_start = p_week;
  insert into public.ai_engage_league_members (group_id, user_id, week_start, tier, xp) values (v_group, p_user, p_week, p_tier, v_xp)
    on conflict (user_id, week_start) do nothing;
  select group_id into v_group from public.ai_engage_league_members where user_id = p_user and week_start = p_week;
  return v_group;
end $$;

-- Writes a finished week's ranks and outcomes once (the rules run in engage/league.ts).
create or replace function public.ai_engage_league_settle(p_group uuid, p_standings jsonb)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare g public.ai_engage_league_groups; entry jsonb;
begin
  select * into g from public.ai_engage_league_groups where id = p_group for update;
  if not found or g.finalized_at is not null then return false; end if;
  for entry in select * from jsonb_array_elements(coalesce(p_standings, '[]'::jsonb)) loop
    update public.ai_engage_league_members set final_rank = (entry->>'rank')::integer, outcome = entry->>'outcome'
      where group_id = p_group and user_id = (entry->>'user_id')::uuid;
  end loop;
  update public.ai_engage_league_groups set finalized_at = now() where id = p_group;
  return true;
end $$;

-- Closes chapters only while the stored count is the expected one, so two requests cannot both close a chapter.
create or replace function public.ai_engage_journey_advance(p_id uuid, p_expect integer, p_completed jsonb, p_status text, p_graduated_at timestamptz)
returns public.ai_engage_journeys
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.ai_engage_journeys;
begin
  update public.ai_engage_journeys
     set completed = p_completed, status = coalesce(p_status, status), graduated_at = coalesce(p_graduated_at, graduated_at)
   where id = p_id and jsonb_array_length(completed) = p_expect and status = 'active'
   returning * into v_row;
  return v_row;
end $$;

-- Squads: create (one active squad per person), join under a lock (at most p_max), leave.
create or replace function public.ai_engage_squad_create(p_name text, p_owner uuid, p_code text, p_goal integer, p_referral text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_squad uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai_engage_squad_user:' || p_owner::text, 0));
  if exists (select 1 from public.ai_engage_squad_members where user_id = p_owner and left_at is null) then return null; end if;
  insert into public.ai_engage_squads (name, owner_id, invite_code, weekly_goal_minutes) values (p_name, p_owner, p_code, p_goal) returning id into v_squad;
  insert into public.ai_engage_squad_members (squad_id, user_id, role, referral_code) values (v_squad, p_owner, 'owner', p_referral);
  return v_squad;
end $$;

create or replace function public.ai_engage_squad_join(p_squad uuid, p_user uuid, p_max integer, p_referral text)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.ai_engage_squads;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai_engage_squad_user:' || p_user::text, 0));
  select * into s from public.ai_engage_squads where id = p_squad for update;
  if not found or s.archived_at is not null then return 'archived'; end if;
  if exists (select 1 from public.ai_engage_squad_members where squad_id = p_squad and user_id = p_user and left_at is null) then return 'ok'; end if;
  if exists (select 1 from public.ai_engage_squad_members where user_id = p_user and left_at is null) then return 'already_in_squad'; end if;
  if (select count(*) from public.ai_engage_squad_members where squad_id = p_squad and left_at is null) >= p_max then return 'full'; end if;
  insert into public.ai_engage_squad_members (squad_id, user_id, role, referral_code) values (p_squad, p_user, 'member', p_referral)
    on conflict (squad_id, user_id) do update set left_at = null, joined_at = now(), role = 'member', referral_code = excluded.referral_code;
  return 'ok';
end $$;

create or replace function public.ai_engage_squad_leave(p_squad uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.ai_engage_squads; heir uuid;
begin
  select * into s from public.ai_engage_squads where id = p_squad for update;
  if not found then return; end if;
  update public.ai_engage_squad_members set left_at = now() where squad_id = p_squad and user_id = p_user and left_at is null;
  select user_id into heir from public.ai_engage_squad_members where squad_id = p_squad and left_at is null order by joined_at, user_id limit 1;
  if heir is null then
    update public.ai_engage_squads set archived_at = now() where id = p_squad;
  elsif s.owner_id = p_user then
    update public.ai_engage_squads set owner_id = heir where id = p_squad;
    update public.ai_engage_squad_members set role = 'owner' where squad_id = p_squad and user_id = heir;
  end if;
end $$;

-- Moves the person's due messages from queued to claimed, each one once, highest priority first.
create or replace function public.ai_engage_outbox_claim(p_user uuid, p_channel text, p_now timestamptz, p_limit integer)
returns setof public.ai_engage_outbox
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.ai_engage_outbox set status = 'expired', reason = 'expired'
    where user_id = p_user and channel = p_channel and status = 'queued' and expires_at <= p_now;
  return query
    with picked as (
      select id from public.ai_engage_outbox
        where user_id = p_user and channel = p_channel and status = 'queued' and due_at <= p_now and expires_at > p_now
        order by priority desc, due_at, id limit greatest(0, least(coalesce(p_limit, 2), 10))
        for update skip locked
    )
    update public.ai_engage_outbox o set status = 'claimed', claim_token = gen_random_uuid(), claimed_at = p_now, attempts = o.attempts + 1
      from picked where o.id = picked.id
      returning o.*;
end $$;

-- Telegram messages due now across everyone, for the engage.deliver job: each one claimed
-- once, oldest first. A claim older than ten minutes (a run that died) is handed back;
-- core's notify.send dedupe key keeps a message that did go out from going twice.
create or replace function public.ai_engage_outbox_claim_due(p_now timestamptz, p_limit integer)
returns setof public.ai_engage_outbox
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.ai_engage_outbox set status = 'expired', reason = 'expired'
    where channel = 'telegram' and status = 'queued' and expires_at <= p_now;
  update public.ai_engage_outbox set status = 'queued', claim_token = null, claimed_at = null, reason = 'claim_lapsed'
    where channel = 'telegram' and status = 'claimed' and claimed_at < p_now - interval '10 minutes';
  return query
    with picked as (
      select id from public.ai_engage_outbox
        where channel = 'telegram' and status = 'queued' and due_at <= p_now and expires_at > p_now
        order by due_at, priority desc, id limit greatest(0, least(coalesce(p_limit, 100), 500))
        for update skip locked
    )
    update public.ai_engage_outbox o set status = 'claimed', claim_token = gen_random_uuid(), claimed_at = p_now, attempts = o.attempts + 1
      from picked where o.id = picked.id
      returning o.*;
end $$;

-- Queues the engage audio of a deleted sample or sitting for the engage.media_sweep job.
create or replace function public.ai_engage_queue_media()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'ai_engage_samples' then
    if old.storage is not null and coalesce(old.storage->>'path', old.storage->>'key', '') like 'schood-ai/engage/%' then
      insert into public.ai_engage_media_trash (storage, source) values (old.storage, 'sample');
    end if;
  else
    insert into public.ai_engage_media_trash (storage, source)
      select r.value->'storage', 'sitting' from jsonb_each(old.responses) r
        where jsonb_typeof(r.value->'storage') = 'object'
          and coalesce(r.value->'storage'->>'path', r.value->'storage'->>'key', '') like 'schood-ai/engage/%';
  end if;
  return old;
end $$;
drop trigger if exists ai_engage_samples_media on public.ai_engage_samples;
create trigger ai_engage_samples_media after delete on public.ai_engage_samples
  for each row execute function public.ai_engage_queue_media();
drop trigger if exists ai_engage_sittings_media on public.ai_engage_sittings;
create trigger ai_engage_sittings_media after delete on public.ai_engage_sittings
  for each row execute function public.ai_engage_queue_media();

-- The next audio objects to delete, each handed to one sweep at a time (retried after 15 minutes).
create or replace function public.ai_engage_media_trash_claim(p_now timestamptz, p_limit integer)
returns table (id bigint, storage jsonb, attempts smallint)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
    with picked as (
      select t.id from public.ai_engage_media_trash t
        where t.next_try_at <= p_now and t.attempts < 20
        order by t.next_try_at, t.id limit greatest(0, least(coalesce(p_limit, 100), 500))
        for update skip locked
    )
    update public.ai_engage_media_trash t set attempts = t.attempts + 1, next_try_at = p_now + interval '15 minutes'
      from picked where t.id = picked.id
      returning t.id, t.storage, t.attempts;
end $$;

-- People due for today's planning run: their preferred hour (core's notification preferences;
-- 19:00 when they chose none) has come where they are, it is not their quiet hours, they get
-- messages somewhere (Telegram with a linked chat, or the in-app inbox), they have not muted
-- engage or set zero messages a day, and they were not planned today. Each once a local day.
-- chat_id is null when the messages go to the in-app inbox.
create or replace function public.ai_engage_due_users(p_now timestamptz, p_limit integer)
returns table (user_id uuid, chat_id text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; n integer := 0; h integer; quiet boolean;
begin
  for r in
    select p.user_id as id, u.telegram_chat_id as chat,
           (p_now at time zone coalesce(np.time_zone, 'Asia/Tashkent')) as local_time,
           coalesce(np.preferred_hour, 19) as wanted, coalesce(np.quiet_start, 22) as q_start, coalesce(np.quiet_end, 8) as q_end,
           coalesce(np.delivery, array['telegram', 'web']::text[]) as delivery
      from public.ai_engage_profiles p
      join public.users u on u.id = p.user_id
      left join public.ai_notify_prefs np on np.user_id = p.user_id
      where coalesce(u.is_active, true) and coalesce(np.daily_limit, 2) > 0
        and not ('engage' = any(coalesce(np.muted, '{}'::text[])))
      order by p.user_id
  loop
    continue when not (('telegram' = any(r.delivery) and r.chat is not null) or 'web' = any(r.delivery));
    h := extract(hour from r.local_time)::integer;
    quiet := case when r.q_start = r.q_end then false
                  when r.q_start > r.q_end then h >= r.q_start or h < r.q_end
                  else h >= r.q_start and h < r.q_end end;
    continue when h < r.wanted or quiet;
    insert into public.ai_engage_ticks (user_id, day) values (r.id, r.local_time::date) on conflict do nothing;
    if found then
      user_id := r.id; chat_id := case when 'telegram' = any(r.delivery) then r.chat else null end; n := n + 1;
      return next;
      exit when n >= greatest(1, least(coalesce(p_limit, 100), 1000));
    end if;
  end loop;
end $$;

-- Weekly XP boards: national, a region, a school, or a centre's students.
create or replace function public.ai_engage_board(p_scope text, p_value text, p_week date, p_limit integer)
returns table (user_id uuid, xp bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select x.user_id, sum(x.xp)::bigint
    from public.ai_engage_xp x
    left join public.ai_engage_profiles p on p.user_id = x.user_id
   where x.week_start = p_week
     and (p_scope = 'national'
       or (p_scope = 'region' and p.region = p_value)
       or (p_scope = 'school' and p.school = p_value)
       or (p_scope = 'centre' and exists (
            select 1 from public.ai_workspace_members m
             where m.workspace_id::text = p_value and m.user_id = x.user_id and m.status = 'active' and m.role = 'student')))
   group by x.user_id
  having sum(x.xp) > 0
   order by sum(x.xp) desc, x.user_id
   limit greatest(1, least(coalesce(p_limit, 50), 1000))
$$;

-- Centre-vs-centre: opted-in active centres with enough active learners this week.
create or replace function public.ai_engage_centre_board(p_week date, p_min integer, p_limit integer)
returns table (workspace_id uuid, name text, active bigint, xp bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  with totals as (
    select m.workspace_id, x.user_id, sum(x.xp) as xp
      from public.ai_engage_centre_league c
      join public.ai_workspace_members m on m.workspace_id = c.workspace_id and m.status = 'active' and m.role = 'student'
      join public.ai_engage_xp x on x.user_id = m.user_id and x.week_start = p_week
     group by m.workspace_id, x.user_id
    having sum(x.xp) > 0
  )
  select t.workspace_id, w.name, count(*)::bigint, sum(t.xp)::bigint
    from totals t join public.ai_workspaces w on w.id = t.workspace_id and w.status = 'active'
   group by t.workspace_id, w.name
  having count(*) >= p_min
   order by sum(t.xp)::numeric / count(*) desc, t.workspace_id
   limit greatest(1, least(coalesce(p_limit, 50), 500))
$$;

-- --- Row level security: on, no policies ----------------------------------------------------------------
alter table public.ai_engage_profiles enable row level security;
alter table public.ai_engage_xp enable row level security;
alter table public.ai_engage_days enable row level security;
alter table public.ai_engage_freeze_buys enable row level security;
alter table public.ai_engage_league_groups enable row level security;
alter table public.ai_engage_league_members enable row level security;
alter table public.ai_engage_journeys enable row level security;
alter table public.ai_engage_goals enable row level security;
alter table public.ai_engage_dates enable row level security;
alter table public.ai_engage_squads enable row level security;
alter table public.ai_engage_squad_members enable row level security;
alter table public.ai_engage_story_progress enable row level security;
alter table public.ai_engage_story_results enable row level security;
alter table public.ai_engage_story_episodes enable row level security;
alter table public.ai_engage_passports enable row level security;
alter table public.ai_engage_passport_items enable row level security;
alter table public.ai_engage_passport_links enable row level security;
alter table public.ai_engage_samples enable row level security;
alter table public.ai_engage_sittings enable row level security;
alter table public.ai_engage_sitting_signals enable row level security;
alter table public.ai_engage_certificates enable row level security;
alter table public.ai_engage_talent enable row level security;
alter table public.ai_engage_talent_employers enable row level security;
alter table public.ai_engage_talent_audit enable row level security;
alter table public.ai_engage_sponsors enable row level security;
alter table public.ai_engage_event_entries enable row level security;
alter table public.ai_engage_centre_league enable row level security;
alter table public.ai_engage_outbox enable row level security;
alter table public.ai_engage_ticks enable row level security;
alter table public.ai_engage_offer_dismissals enable row level security;
alter table public.ai_engage_media_trash enable row level security;

revoke all on public.ai_engage_profiles, public.ai_engage_xp, public.ai_engage_days, public.ai_engage_freeze_buys,
  public.ai_engage_league_groups, public.ai_engage_league_members, public.ai_engage_journeys, public.ai_engage_goals, public.ai_engage_dates,
  public.ai_engage_squads, public.ai_engage_squad_members, public.ai_engage_story_progress, public.ai_engage_story_results, public.ai_engage_story_episodes,
  public.ai_engage_passports, public.ai_engage_passport_items, public.ai_engage_passport_links, public.ai_engage_samples, public.ai_engage_sittings,
  public.ai_engage_sitting_signals, public.ai_engage_certificates, public.ai_engage_talent, public.ai_engage_talent_employers, public.ai_engage_talent_audit,
  public.ai_engage_sponsors, public.ai_engage_event_entries, public.ai_engage_centre_league, public.ai_engage_outbox, public.ai_engage_ticks,
  public.ai_engage_offer_dismissals, public.ai_engage_media_trash
  from anon, authenticated;
-- XP, days and the talent audit change only through the functions (or account deletion).
revoke insert, update, delete, truncate on public.ai_engage_xp, public.ai_engage_days from service_role;
revoke update, delete, truncate on public.ai_engage_talent_audit from service_role;

revoke all on function public.ai_engage_event_xp(text, integer, boolean) from public, anon, authenticated;
revoke all on function public.ai_engage_ingest(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.ai_engage_ingest_many(uuid[], timestamptz) from public, anon, authenticated;
revoke all on function public.ai_engage_ingest_pending(integer) from public, anon, authenticated;
revoke all on function public.ai_engage_award_bonus(uuid, text, text, integer, date, date) from public, anon, authenticated;
revoke all on function public.ai_engage_freeze_reserve(uuid, date, date, text, integer) from public, anon, authenticated;
revoke all on function public.ai_engage_league_join(uuid, date, text, text) from public, anon, authenticated;
revoke all on function public.ai_engage_league_settle(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.ai_engage_journey_advance(uuid, integer, jsonb, text, timestamptz) from public, anon, authenticated;
revoke all on function public.ai_engage_squad_create(text, uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.ai_engage_squad_join(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.ai_engage_squad_leave(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ai_engage_outbox_claim(uuid, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.ai_engage_due_users(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.ai_engage_outbox_claim_due(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.ai_engage_media_trash_claim(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.ai_engage_queue_media() from public, anon, authenticated;
revoke all on function public.ai_engage_board(text, text, date, integer) from public, anon, authenticated;
revoke all on function public.ai_engage_centre_board(date, integer, integer) from public, anon, authenticated;
revoke all on function public.ai_engage_xp_guard() from public, anon, authenticated;
revoke all on function public.ai_engage_talent_audit_guard() from public, anon, authenticated;
revoke all on function public.ai_engage_squad_member_gone() from public, anon, authenticated;
revoke all on function public.ai_engage_talent_gone() from public, anon, authenticated;
grant execute on function public.ai_engage_event_xp(text, integer, boolean) to service_role;
grant execute on function public.ai_engage_ingest(uuid, timestamptz) to service_role;
grant execute on function public.ai_engage_ingest_many(uuid[], timestamptz) to service_role;
grant execute on function public.ai_engage_award_bonus(uuid, text, text, integer, date, date) to service_role;
grant execute on function public.ai_engage_freeze_reserve(uuid, date, date, text, integer) to service_role;
grant execute on function public.ai_engage_league_join(uuid, date, text, text) to service_role;
grant execute on function public.ai_engage_league_settle(uuid, jsonb) to service_role;
grant execute on function public.ai_engage_journey_advance(uuid, integer, jsonb, text, timestamptz) to service_role;
grant execute on function public.ai_engage_squad_create(text, uuid, text, integer, text) to service_role;
grant execute on function public.ai_engage_squad_join(uuid, uuid, integer, text) to service_role;
grant execute on function public.ai_engage_squad_leave(uuid, uuid) to service_role;
grant execute on function public.ai_engage_outbox_claim(uuid, text, timestamptz, integer) to service_role;
grant execute on function public.ai_engage_due_users(timestamptz, integer) to service_role;
grant execute on function public.ai_engage_outbox_claim_due(timestamptz, integer) to service_role;
grant execute on function public.ai_engage_media_trash_claim(timestamptz, integer) to service_role;
grant execute on function public.ai_engage_board(text, text, date, integer) to service_role;
grant execute on function public.ai_engage_centre_board(date, integer, integer) to service_role;

-- Closing an account erases the person's engagement records: profile, XP and days, freezes,
-- league rows, journeys, goals and dates, squad memberships, story progress, the Skill
-- Passport with its items and links, then-vs-now samples, certificate sittings and
-- certificates, the talent profile and employer grant, event entries, the outbox and
-- planning ticks. Same additive pattern as 20261030130000_schood_ai_retention_and_erasure.sql.
-- Left out (no personal content, or no user_id): league groups, squads (handed over by the
-- trigger above), sponsors, the centre league, sitting signals (they go with
-- their sitting), and the talent audit (the learner's id is cleared when their talent
-- profile goes; an employer's id stays until their users row is deleted, set null).
do $$
declare
  relations text[];
  wanted text[] := array[
    'ai_engage_profiles', 'ai_engage_xp', 'ai_engage_days', 'ai_engage_freeze_buys', 'ai_engage_league_members',
    'ai_engage_journeys', 'ai_engage_goals', 'ai_engage_dates', 'ai_engage_squad_members', 'ai_engage_story_progress',
    'ai_engage_story_results', 'ai_engage_story_episodes', 'ai_engage_passports', 'ai_engage_passport_items',
    'ai_engage_passport_links', 'ai_engage_samples', 'ai_engage_sittings', 'ai_engage_certificates', 'ai_engage_talent',
    'ai_engage_talent_employers', 'ai_engage_event_entries', 'ai_engage_outbox', 'ai_engage_ticks', 'ai_engage_offer_dismissals'
  ];
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
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = relation_name and column_name = 'user_id') then
      raise notice 'public.% has no user_id column; not added to the erasure registry', relation_name;
      continue;
    end if;
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

-- What the registry cannot do on account closure (run by account_erasure_service_hooks(),
-- 20261030140000, after the registry tables above are erased): squads the person owned go
-- to their longest-standing member or are deleted when nobody is left; their id is cleared
-- from the talent audit (as employer and as candidate), sponsor and centre-league records,
-- employer grants and reviewed sittings. Idempotent; never raises for a normal closure.
-- Their audio under schood-ai/engage/ is queued by the delete triggers on ai_engage_samples and
-- ai_engage_sittings when the registry erases those rows; engage.media_sweep deletes the objects.
create or replace function public.ai_engage_erase_account(p_user uuid)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_squad uuid; heir uuid; v_deleted integer := 0; v_handed integer := 0; v_audit integer; v_target integer; v_refs integer := 0; n integer;
begin
  if p_user is null then raise exception 'p_user is required' using errcode = '22023'; end if;
  for v_squad in select id from public.ai_engage_squads where owner_id = p_user order by id for update loop
    select m.user_id into heir from public.ai_engage_squad_members m
      where m.squad_id = v_squad and m.user_id <> p_user and m.left_at is null order by m.joined_at, m.user_id limit 1;
    if heir is null then
      delete from public.ai_engage_squads where id = v_squad;
      v_deleted := v_deleted + 1;
    else
      update public.ai_engage_squads set owner_id = heir where id = v_squad;
      update public.ai_engage_squad_members set role = 'owner' where squad_id = v_squad and user_id = heir;
      v_handed := v_handed + 1;
    end if;
  end loop;
  update public.ai_engage_talent_audit set employer_id = null where employer_id = p_user;
  get diagnostics v_audit = row_count;
  update public.ai_engage_talent_audit set target_user_id = null where target_user_id = p_user;
  get diagnostics v_target = row_count;
  update public.ai_engage_sponsors set updated_by = null where updated_by = p_user;
  get diagnostics n = row_count; v_refs := v_refs + n;
  update public.ai_engage_centre_league set opted_by = null where opted_by = p_user;
  get diagnostics n = row_count; v_refs := v_refs + n;
  update public.ai_engage_talent_employers set granted_by = null where granted_by = p_user;
  get diagnostics n = row_count; v_refs := v_refs + n;
  update public.ai_engage_sittings set reviewer_id = null where reviewer_id = p_user;
  get diagnostics n = row_count; v_refs := v_refs + n;
  return jsonb_build_object('squads_deleted', v_deleted, 'squads_handed_over', v_handed, 'audit_as_employer', v_audit, 'audit_as_candidate', v_target, 'references_cleared', v_refs);
end $$;
revoke all on function public.ai_engage_erase_account(uuid) from public, anon, authenticated, service_role;

do $$
declare hooks text[];
begin
  if to_regprocedure('public.account_erasure_service_hooks()') is null then
    raise notice 'account_erasure_service_hooks() is not installed; engage erasure hook not registered';
    return;
  end if;
  hooks := public.account_erasure_service_hooks();
  if not ('ai_engage_erase_account' = any(hooks)) then
    hooks := hooks || 'ai_engage_erase_account'::text;
    execute format(
      'create or replace function public.account_erasure_service_hooks() returns text[] language sql immutable set search_path=pg_catalog,public as %L',
      format('select %L::text[];', hooks::text)
    );
  end if;
end
$$;

commit;

-- Counting new verified learning every five minutes (boards, squads and leagues stay current
-- for people who learn in a bot and do not open engage), and daily housekeeping: finished
-- outbox rows after 30 days, planning ticks after 14 days, and the browser signals of decided
-- sittings after 180 days. pg_cron, as the other background jobs; skipped where it is absent.
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname in ('ai-engage-ingest-v1', 'ai-engage-prune-v1') loop
    perform cron.unschedule(v_job_id);
  end loop;
  -- Every five minutes at minutes 4, 9, 14..., clear of the hourly jobs at minute 7.
  perform cron.schedule('ai-engage-ingest-v1', '4-59/5 * * * *', $cron$select public.ai_engage_ingest_pending(500);$cron$);
  -- 03:53 UTC, away from the other prune jobs (03:23, 03:41).
  perform cron.schedule(
    'ai-engage-prune-v1',
    '53 3 * * *',
    $cron$
      delete from public.ai_engage_outbox where status <> 'queued' and created_at < now() - interval '30 days';
      delete from public.ai_engage_outbox where status = 'queued' and expires_at < now() - interval '2 days';
      delete from public.ai_engage_ticks where day < (now() at time zone 'Asia/Tashkent')::date - 14;
      delete from public.ai_engage_samples where deleted_at < now() - interval '7 days';
      delete from public.ai_engage_sitting_signals s using public.ai_engage_sittings t
        where s.sitting_id = t.id and t.status in ('passed', 'failed', 'voided') and t.decided_at < now() - interval '180 days';
    $cron$
  );
exception
  when undefined_table or invalid_schema_name then
    raise notice 'pg_cron is unavailable in this environment; engage counting and pruning not scheduled';
end
$$;
