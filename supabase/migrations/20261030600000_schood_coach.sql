-- Schood Coaches (B1–B6): the coach engine behind the Telegram coach bots and the
-- /coach Mini App screens (docs/product/44_SCHOOD_AI.md, "Schood Coaches").
-- Additive to the Schood AI core migrations (20261030100000–199999).
--
-- Every table is reached only by the schood-ai function (service role) after its
-- own checks: RLS on with no policies, nothing granted to anon or authenticated.
-- Learner text lives in coach_turns and is blanked after 180 days except the
-- samples a learner keeps for "then vs now" and certificate evidence; scores,
-- numbers and certificates stay. Telegram voice clips are stored as file
-- references (file_id), never as public URLs.
begin;

-- --- Enrolment: one per person per coach ------------------------------------------------------
create table if not exists public.coach_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  workspace_id uuid not null references public.ai_workspaces(id) on delete cascade,
  pack text not null check (pack ~ '^[a-z][a-z0-9-]{1,15}$'),
  pack_version text not null check (pack_version ~ '^\d+\.\d+\.\d+$'),
  -- blocked: the person blocked the bot, so nothing is sent until they come back.
  status text not null default 'active' check (status in ('active', 'paused', 'blocked')),
  locale text not null default 'en' check (locale in ('en', 'uz', 'ru')),
  -- correction mode, voice replies, explanation language.
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  -- target, exam date, minutes a day, start.
  goal jsonb check (goal is null or jsonb_typeof(goal) = 'object'),
  -- the placement test result (per skill and overall).
  placement jsonb check (placement is null or jsonb_typeof(placement) = 'object'),
  -- the conversation in progress (which activity, step, queue); bounded.
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object' and pg_column_size(state) < 65536),
  -- optimistic concurrency for state changes: two Telegram updates never both win.
  revision integer not null default 0 check (revision >= 0),
  streak_current integer not null default 0 check (streak_current >= 0),
  streak_best integer not null default 0 check (streak_best >= 0),
  last_active_day date,
  verified_minutes integer not null default 0 check (verified_minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, pack)
);
create index if not exists coach_enrollments_pack_idx on public.coach_enrollments (pack, status);

-- --- Sessions, turns, scores ------------------------------------------------------------------
create table if not exists public.coach_sessions (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.coach_enrollments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  pack text not null check (pack ~ '^[a-z][a-z0-9-]{1,15}$'),
  pack_version text not null check (pack_version ~ '^\d+\.\d+\.\d+$'),
  kind text not null check (kind in ('diagnostic', 'speaking_exam', 'roleplay', 'writing', 'quiz_set', 'deck', 'drill', 'shadowing', 'lesson', 'photo_help')),
  activity_id text check (activity_id is null or activity_id ~ '^[a-z0-9][a-z0-9_.-]{1,80}$'),
  -- mock, a speaking part id, a deck mode.
  mode text check (mode is null or mode ~ '^[a-z0-9][a-z0-9_.-]{0,40}$'),
  status text not null default 'active' check (status in ('active', 'finished', 'abandoned')),
  rubric text check (rubric is null or rubric ~ '^[a-z0-9][a-z0-9_.-]{1,80}$'),
  overall numeric(6, 2) check (overall is null or overall between -1000 and 1000),
  -- the result shown in reports: criteria, metrics, scorecard, quiz score, timing.
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object' and pg_column_size(summary) < 131072),
  minutes smallint not null default 0 check (minutes between 0 and 240),
  source text not null default 'telegram' check (source in ('telegram', 'web')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  check (finished_at is null or finished_at >= started_at)
);
create index if not exists coach_sessions_user_idx on public.coach_sessions (user_id, pack, started_at desc);
create index if not exists coach_sessions_open_idx on public.coach_sessions (enrollment_id) where status = 'active';
create index if not exists coach_sessions_results_idx on public.coach_sessions (user_id, pack, rubric, finished_at desc) where status = 'finished' and overall is not null;

create table if not exists public.coach_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coach_sessions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  pack text not null check (pack ~ '^[a-z][a-z0-9-]{1,15}$'),
  seq integer not null check (seq >= 0),
  role text not null check (role in ('coach', 'learner')),
  kind text not null check (kind ~ '^[a-z][a-z_]{1,30}$'),
  -- the question, cue card, card or item it answers.
  prompt_ref text check (prompt_ref is null or char_length(prompt_ref) <= 120),
  content text not null default '' check (char_length(content) <= 20000),
  input_mode text check (input_mode is null or input_mode in ('voice', 'text', 'photo')),
  -- a Telegram voice clip reference ({file_id, file_unique_id, duration, pack}); never a URL.
  clip jsonb check (clip is null or (jsonb_typeof(clip) = 'object' and not (clip ? 'url'))),
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object'),
  timing jsonb not null default '{}'::jsonb check (jsonb_typeof(timing) = 'object'),
  -- kept past retention: a "then vs now" sample or certificate evidence.
  keep boolean not null default false,
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);
create index if not exists coach_turns_user_idx on public.coach_turns (user_id, pack, created_at desc);
create index if not exists coach_turns_retention_idx on public.coach_turns (created_at) where not keep and content <> '';

create table if not exists public.coach_scores (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.coach_sessions(id) on delete cascade,
  turn_id uuid references public.coach_turns(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  pack text not null check (pack ~ '^[a-z][a-z0-9-]{1,15}$'),
  rubric text not null check (rubric ~ '^[a-z0-9][a-z0-9_.-]{1,80}$'),
  -- a criterion id, or `overall`.
  criterion text not null check (criterion ~ '^[a-z][a-z0-9_]{1,40}$'),
  score numeric(6, 2) check (score is null or score between -1000 and 1000),
  status text not null check (status in ('scored', 'insufficient_evidence', 'not_scored_audio', 'missing')),
  -- [{quote, comment}]: the learner's own words behind the score.
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) <= 10),
  source text not null check (source in ('model', 'aggregate', 'key')),
  created_at timestamptz not null default now(),
  check (status = 'scored' or score is null)
);
create index if not exists coach_scores_user_idx on public.coach_scores (user_id, pack, rubric, criterion, created_at desc);
create index if not exists coach_scores_session_idx on public.coach_scores (session_id);

-- --- The learner model --------------------------------------------------------------------------
create table if not exists public.coach_mastery (
  user_id uuid not null references public.users(id) on delete cascade,
  pack text not null check (pack ~ '^[a-z][a-z0-9-]{1,15}$'),
  node text not null check (node ~ '^[a-z0-9][a-z0-9_.-]{1,80}$'),
  level numeric(7, 3),
  mastery numeric(5, 3) not null default 0 check (mastery between 0 and 1),
  evidence integer not null default 0 check (evidence >= 0),
  last_score numeric(7, 3),
  last_at timestamptz,
  -- recurring errors: {tag: {count, weight, lastAt}}.
  errors jsonb not null default '{}'::jsonb check (jsonb_typeof(errors) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (user_id, pack, node)
);

create table if not exists public.coach_cards (
  user_id uuid not null references public.users(id) on delete cascade,
  pack text not null check (pack ~ '^[a-z][a-z0-9-]{1,15}$'),
  card_id text not null check (card_id ~ '^[a-z0-9][a-z0-9_.-]{1,80}$'),
  -- FSRS memory state (supabase/functions/_shared/english-srs.ts).
  srs jsonb not null check (jsonb_typeof(srs) = 'object'),
  due_at timestamptz not null,
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, pack, card_id)
);
create index if not exists coach_cards_due_idx on public.coach_cards (user_id, pack, due_at);

-- Quiz polls sent to a person: Telegram reports answers by poll id only.
create table if not exists public.coach_polls (
  poll_id text primary key check (char_length(poll_id) between 1 and 64),
  user_id uuid not null references public.users(id) on delete cascade,
  pack text not null check (pack ~ '^[a-z][a-z0-9-]{1,15}$'),
  session_id uuid not null references public.coach_sessions(id) on delete cascade,
  card_id text not null check (char_length(card_id) <= 80),
  correct smallint not null check (correct between 0 and 9),
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

-- --- Schedules, deliveries, Telegram bookkeeping ------------------------------------------------------
create table if not exists public.coach_schedules (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.coach_enrollments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  pack text not null check (pack ~ '^[a-z][a-z0-9-]{1,15}$'),
  kind text not null check (kind in ('daily', 'weekly')),
  local_time time not null,
  weekday smallint check (weekday is null or weekday between 0 and 6),
  time_zone text not null default 'Asia/Tashkent' check (time_zone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$'),
  next_at timestamptz not null,
  last_sent_at timestamptz,
  -- the local date (or week) last delivered, so a slot is sent once.
  last_slot text check (last_slot is null or char_length(last_slot) <= 20),
  enabled boolean not null default true,
  -- a cron run holds the row while it renders and sends.
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, kind),
  check (kind <> 'weekly' or weekday is not null)
);
create index if not exists coach_schedules_due_idx on public.coach_schedules (next_at) where enabled;

create table if not exists public.coach_deliveries (
  id bigint generated always as identity primary key,
  schedule_id uuid references public.coach_schedules(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  pack text not null check (pack ~ '^[a-z][a-z0-9-]{1,15}$'),
  kind text not null check (kind in ('daily', 'weekly', 'level_up')),
  slot text not null check (char_length(slot) <= 20),
  status text not null check (status in ('rendered', 'sent', 'failed', 'blocked', 'skipped')),
  reason text check (reason is null or reason ~ '^[a-z_]{1,40}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists coach_deliveries_user_idx on public.coach_deliveries (user_id, created_at desc);

-- Telegram may deliver an update twice; the first one wins.
create table if not exists public.coach_updates (
  pack text not null check (pack ~ '^[a-z][a-z0-9-]{1,15}$'),
  update_id bigint not null,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pack, update_id)
);
create index if not exists coach_updates_created_idx on public.coach_updates (created_at);

-- Telegram file ids of audio the bots already sent (listening scripts, model sentences): made once, reused free.
create table if not exists public.coach_media (
  pack text not null check (pack ~ '^[a-z][a-z0-9-]{1,15}$'),
  cache_key text not null check (cache_key ~ '^[a-z0-9][a-z0-9_.:-]{1,120}$'),
  file_id text not null check (char_length(file_id) between 1 and 256),
  created_at timestamptz not null default now(),
  primary key (pack, cache_key)
);

-- --- Certificates ------------------------------------------------------------------------------------
create table if not exists public.coach_certificates (
  id uuid primary key default gen_random_uuid(),
  -- 12 Crockford base32 characters (60 random bits), the same format as english_certificates.
  code text not null unique check (code ~ '^[0-9A-HJKMNP-TV-Z]{12}$'),
  user_id uuid not null references public.users(id) on delete cascade,
  pack text not null check (pack ~ '^[a-z][a-z0-9-]{1,15}$'),
  pack_version text not null check (pack_version ~ '^\d+\.\d+\.\d+$'),
  milestone text not null check (milestone ~ '^[a-z0-9][a-z0-9_.-]{1,80}$'),
  rubric text not null check (rubric ~ '^[a-z0-9][a-z0-9_.-]{1,80}$'),
  level numeric(6, 2) not null,
  level_label text not null check (char_length(level_label) between 1 and 20),
  display_name text not null check (char_length(display_name) between 2 and 60),
  -- the qualifying results: [{session_id, at, overall}].
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= issued_at)
);
create unique index if not exists coach_certificates_one_active_idx on public.coach_certificates (user_id, pack, milestone) where revoked_at is null;
create index if not exists coach_certificates_user_idx on public.coach_certificates (user_id, issued_at desc);

-- --- Coach Team (companies and centres) ----------------------------------------------------------------
create table if not exists public.coach_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  manager_id uuid references public.users(id) on delete set null,
  packs text[] not null check (cardinality(packs) between 1 and 6),
  seats integer not null check (seats between 5 and 10000),
  status text not null default 'active' check (status in ('active', 'suspended', 'ended')),
  valid_until timestamptz not null,
  -- how the seats were granted: by Schood support until checkout sells them.
  source text not null default 'support' check (source in ('support', 'order', 'contract')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.coach_team_members (
  team_id uuid not null references public.coach_teams(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member' check (role in ('manager', 'member')),
  status text not null default 'active' check (status in ('active', 'removed')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (team_id, user_id)
);
create index if not exists coach_team_members_user_idx on public.coach_team_members (user_id) where status = 'active';
create table if not exists public.coach_team_invites (
  code text primary key check (code ~ '^[A-Za-z0-9]{10}$'),
  team_id uuid not null references public.coach_teams(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  expires_at timestamptz not null,
  max_uses integer not null default 50 check (max_uses between 1 and 10000),
  uses integer not null default 0 check (uses >= 0),
  created_at timestamptz not null default now()
);

-- --- updated_at -----------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['coach_enrollments', 'coach_sessions', 'coach_mastery', 'coach_cards', 'coach_schedules', 'coach_deliveries', 'coach_teams'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- --- Functions -----------------------------------------------------------------------------------------

-- Hands due schedules to one cron run: enabled, due, not held by another run, for
-- active enrolments of people still linked to Telegram. Each row is held for
-- p_lease_seconds so two runs never send the same reminder.
create or replace function public.coach_claim_due(p_now timestamptz, p_limit integer default 40, p_lease_seconds integer default 120)
returns table (schedule_id uuid, enrollment_id uuid, user_id uuid, pack text, kind text, local_time time, weekday smallint, time_zone text, next_at timestamptz, last_slot text, chat_id text)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then raise exception 'invalid_limit' using errcode = '22023'; end if;
  if p_lease_seconds is null or p_lease_seconds < 10 or p_lease_seconds > 900 then raise exception 'invalid_lease' using errcode = '22023'; end if;
  return query
  with due as (
    select s.id from public.coach_schedules s
      join public.coach_enrollments e on e.id = s.enrollment_id and e.status = 'active'
      join public.users u on u.id = s.user_id and u.telegram_chat_id is not null
    where s.enabled and s.next_at <= p_now and (s.lease_until is null or s.lease_until < p_now)
    order by s.next_at
    limit p_limit
    for update of s skip locked
  ), held as (
    update public.coach_schedules s set lease_until = p_now + make_interval(secs => p_lease_seconds)
      from due where s.id = due.id
    returning s.*
  )
  select h.id, h.enrollment_id, h.user_id, h.pack, h.kind, h.local_time, h.weekday, h.time_zone, h.next_at, h.last_slot, u.telegram_chat_id::text
    from held h join public.users u on u.id = h.user_id;
end $$;

-- Joins a team by invite code, within its seats. Raises a stable code on refusal.
create or replace function public.coach_team_join(p_code text, p_user uuid, p_now timestamptz default now())
returns public.coach_team_members
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  inv public.coach_team_invites;
  team public.coach_teams;
  member public.coach_team_members;
  used integer;
begin
  select * into inv from public.coach_team_invites where code = p_code for update;
  if not found then raise exception 'invite_not_found' using errcode = 'P0002'; end if;
  if inv.expires_at <= p_now or inv.uses >= inv.max_uses then raise exception 'invite_expired' using errcode = '22023'; end if;
  select * into team from public.coach_teams where id = inv.team_id for update;
  if team.status <> 'active' or team.valid_until <= p_now then raise exception 'team_inactive' using errcode = '22023'; end if;
  select * into member from public.coach_team_members where team_id = team.id and user_id = p_user;
  if found and member.status = 'active' then return member; end if;
  select count(*) into used from public.coach_team_members where team_id = team.id and status = 'active';
  if used >= team.seats then raise exception 'team_full' using errcode = '22023'; end if;
  insert into public.coach_team_members (team_id, user_id, role, status, joined_at)
    values (team.id, p_user, 'member', 'active', p_now)
    on conflict (team_id, user_id) do update set status = 'active', removed_at = null, joined_at = p_now
    returning * into member;
  update public.coach_team_invites set uses = uses + 1 where code = p_code;
  return member;
end $$;

-- Retention: learner text older than p_days is blanked (scores and numbers stay),
-- except kept samples; old Telegram bookkeeping is removed. Bounded batches.
create or replace function public.coach_purge_old(p_days integer default 180, p_limit integer default 20000, p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
set statement_timeout = '60s'
as $$
declare
  cutoff timestamptz;
  v_turns integer;
  v_updates integer;
  v_polls integer;
begin
  if p_days is null or p_days < 30 then raise exception 'retention_too_short' using errcode = '22023'; end if;
  cutoff := p_now - make_interval(days => p_days);
  update public.coach_turns set content = '' where id in (
    select t.id from public.coach_turns t where t.created_at < cutoff and not t.keep and t.content <> '' order by t.created_at limit greatest(p_limit, 1));
  get diagnostics v_turns = row_count;
  delete from public.coach_updates where created_at < p_now - interval '7 days';
  get diagnostics v_updates = row_count;
  delete from public.coach_polls where created_at < p_now - interval '30 days';
  get diagnostics v_polls = row_count;
  return jsonb_build_object('turns', v_turns, 'updates', v_updates, 'polls', v_polls, 'cutoff', cutoff);
end $$;

revoke all on function public.coach_claim_due(timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function public.coach_team_join(text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.coach_purge_old(integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.coach_claim_due(timestamptz, integer, integer) to service_role;
grant execute on function public.coach_team_join(text, uuid, timestamptz) to service_role;
grant execute on function public.coach_purge_old(integer, integer, timestamptz) to service_role;

-- --- Access: the schood-ai function only -----------------------------------------------------------------
alter table public.coach_enrollments enable row level security;
alter table public.coach_sessions enable row level security;
alter table public.coach_turns enable row level security;
alter table public.coach_scores enable row level security;
alter table public.coach_mastery enable row level security;
alter table public.coach_cards enable row level security;
alter table public.coach_polls enable row level security;
alter table public.coach_schedules enable row level security;
alter table public.coach_deliveries enable row level security;
alter table public.coach_updates enable row level security;
alter table public.coach_media enable row level security;
alter table public.coach_certificates enable row level security;
alter table public.coach_teams enable row level security;
alter table public.coach_team_members enable row level security;
alter table public.coach_team_invites enable row level security;

revoke all on public.coach_enrollments, public.coach_sessions, public.coach_turns, public.coach_scores, public.coach_mastery,
  public.coach_cards, public.coach_polls, public.coach_schedules, public.coach_deliveries, public.coach_updates, public.coach_media,
  public.coach_certificates, public.coach_teams, public.coach_team_members, public.coach_team_invites
  from anon, authenticated;

-- --- Account erasure: the registry pattern of 20261030130000 ------------------------------------------------
do $$
declare
  relations text[];
  wanted text[] := array['coach_enrollments', 'coach_sessions', 'coach_turns', 'coach_scores', 'coach_mastery', 'coach_cards', 'coach_polls',
    'coach_schedules', 'coach_deliveries', 'coach_updates', 'coach_certificates', 'coach_team_members'];
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

commit;

do $$
begin
  create extension if not exists pg_cron with schema extensions;
exception
  when others then raise notice 'pg_cron could not be enabled here (%); coach retention not scheduled', sqlerrm;
end
$$;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = 'schood-coach-retention-v1' loop
    perform cron.unschedule(v_job_id);
  end loop;
  -- 03:37 UTC, away from 03:23, 03:29 and 03:41.
  perform cron.schedule('schood-coach-retention-v1', '37 3 * * *', $cron$select public.coach_purge_old(180);$cron$);
exception
  when undefined_table or undefined_function or invalid_schema_name then
    raise notice 'pg_cron is unavailable in this environment; coach retention not scheduled';
end
$$;
