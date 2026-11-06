-- Company English coach: the daily habit for seated learners. A personal phrase
-- deck with spaced review, a daily plan, one idempotent log of practice events and
-- opt-in kudos. Additive and safe to apply twice. Everything here is private to the
-- learner; the company only sees the minutes and points that reach company_activity.

-- One row per learner: goal, plan length, rest days, leave and the kudos opt-in.
create table if not exists public.company_coach_settings (
  member_id uuid primary key references public.company_members(id) on delete cascade,
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  weekly_goal integer not null default 3 check (weekly_goal between 1 and 7),
  daily_minutes integer not null default 10 check (daily_minutes in (5, 10)),
  -- Weekdays that never break a streak (0 is Sunday, as in JavaScript).
  rest_days integer[] not null default '{0,6}',
  -- Periods of leave, [{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}].
  leave jsonb not null default '[]'::jsonb check (jsonb_typeof(leave) = 'array'),
  kudos_opt_in boolean not null default false,
  -- What the deck last synced from, so the sync only runs when something changed.
  sync_key text check (sync_key is null or char_length(sync_key) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_coach_settings_org_idx on public.company_coach_settings (org_id) where kudos_opt_in;

-- The personal deck: phrases and words with their review schedule.
create table if not exists public.company_coach_cards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  source text not null default 'own' check (source in ('lesson','glossary','phrasebook','finder','own')),
  source_ref text check (source_ref is null or char_length(source_ref) <= 80),
  front text not null check (char_length(front) between 1 and 300),
  -- The front folded for comparison, so one phrase is one card however it is typed.
  front_key text not null check (char_length(front_key) between 1 and 300),
  ru text check (ru is null or char_length(ru) <= 300),
  uz text check (uz is null or char_length(uz) <= 300),
  note text check (note is null or char_length(note) <= 500),
  state text not null default 'new' check (state in ('new','learning','review')),
  stability double precision not null default 0 check (stability >= 0),
  difficulty double precision not null default 5 check (difficulty between 1 and 10),
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  due_on date,
  last_reviewed_at timestamptz,
  suspended boolean not null default false,
  -- A removed lesson or glossary card stays as a marker, or the next sync would bring it back.
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists company_coach_cards_member_front_uq on public.company_coach_cards (member_id, front_key);
create index if not exists company_coach_cards_due_idx on public.company_coach_cards (member_id, due_on) where not suspended and deleted_at is null;
create index if not exists company_coach_cards_org_idx on public.company_coach_cards (org_id);

-- One row per practice event. The unique index makes every event count once, however
-- many tabs or clicks send it. It holds no learner text.
create table if not exists public.company_coach_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  -- Tashkent calendar day.
  day date not null,
  kind text not null check (kind in ('review','review_new','shadow','finder','plan_done','credit')),
  ref text not null check (char_length(ref) between 1 and 120),
  score integer check (score is null or score between 0 and 100),
  created_at timestamptz not null default now()
);
create unique index if not exists company_coach_log_once_uq on public.company_coach_log (member_id, day, kind, ref);
create index if not exists company_coach_log_kind_idx on public.company_coach_log (member_id, kind);
create index if not exists company_coach_log_org_idx on public.company_coach_log (org_id);

-- The plan of one Tashkent day, fixed once built so it does not shift during the day.
create table if not exists public.company_coach_plans (
  member_id uuid not null references public.company_members(id) on delete cascade,
  day date not null,
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  minutes integer not null default 10,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (member_id, day)
);
create index if not exists company_coach_plans_org_idx on public.company_coach_plans (org_id);

-- Kudos between colleagues and badges a learner chose to share. Tied to memberships, so
-- removing a person removes their entries. Only the sender's preset, note or badge is kept.
create table if not exists public.company_coach_kudos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.company_orgs(id) on delete cascade,
  from_member uuid not null references public.company_members(id) on delete cascade,
  to_member uuid references public.company_members(id) on delete cascade,
  kind text not null default 'kudos' check (kind in ('kudos','badge')),
  message text check (message is null or char_length(message) <= 40),
  note text check (note is null or char_length(note) <= 140),
  badge text check (badge is null or char_length(badge) <= 40),
  day date not null,
  created_at timestamptz not null default now(),
  check (kind <> 'kudos' or (to_member is not null and message is not null)),
  check (kind <> 'badge' or badge is not null)
);
create unique index if not exists company_coach_kudos_pair_day_uq on public.company_coach_kudos (from_member, to_member, day) where kind = 'kudos';
create unique index if not exists company_coach_kudos_badge_uq on public.company_coach_kudos (from_member, badge) where kind = 'badge';
create index if not exists company_coach_kudos_feed_idx on public.company_coach_kudos (org_id, created_at desc);

-- HR's switch for the team feed. No row means the feed is available to people who opt in.
create table if not exists public.company_coach_org (
  org_id uuid primary key references public.company_orgs(id) on delete cascade,
  kudos_off boolean not null default false,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['company_coach_settings','company_coach_cards','company_coach_log','company_coach_plans','company_coach_kudos','company_coach_org'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  foreach t in array array['company_coach_settings','company_coach_cards','company_coach_plans','company_coach_org'] loop
    if to_regprocedure('public.set_updated_at()') is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
    end if;
  end loop;
end
$$;

-- Closing an account erases the person's deck, log, plans and settings.
do $$
declare
  relations text[];
  wanted text[] := array['company_coach_settings', 'company_coach_cards', 'company_coach_log', 'company_coach_plans'];
  relation_name text;
  guard_installed boolean := to_regprocedure('public.guard_closed_personal_record()') is not null;
begin
  if to_regprocedure('public.account_personal_erasure_tables()') is null then
    raise notice 'account_personal_erasure_tables() is not installed; erasure registry not extended';
    return;
  end if;
  relations := public.account_personal_erasure_tables();
  foreach relation_name in array wanted loop
    if to_regclass(format('public.%I', relation_name)) is null then
      continue;
    end if;
    if not (relation_name = any(relations)) then
      relations := relations || relation_name;
      if guard_installed then
        execute format('drop trigger if exists account_closed_personal_guard on public.%I', relation_name);
        execute format(
          'create trigger account_closed_personal_guard before insert or update on public.%I for each row execute function public.guard_closed_personal_record(%L)',
          relation_name, 'user_id'
        );
      end if;
    end if;
  end loop;
  execute format(
    'create or replace function public.account_personal_erasure_tables() returns text[] language sql immutable set search_path=pg_catalog,public as %L',
    format('select %L::text[];', relations::text)
  );
end
$$;
