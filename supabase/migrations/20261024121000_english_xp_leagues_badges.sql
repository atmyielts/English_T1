-- XP, weekly leagues and badges for Schood English.
-- ============================================================================
-- XP itself is never stored: the hub derives it from learning_attempts,
-- learner_review_answer_log and completed daily plans (see
-- supabase/functions/_shared/english-xp.ts). These tables hold only what
-- cannot be derived:
--   * learner_review_answer_log: one row per answer on the Review page, so a
--     correct answer to a due item can earn XP on the day it was given.
--   * english_league_groups / english_league_members: weekly groups of up to
--     30 learners per tier, assigned lazily, plus each member's final result.
--   * learner_badges: badges already earned (kept even when the facts that
--     earned them fall out of the query window) and whether they were seen.
-- Everything is written and read only by edge functions (service role).
-- ============================================================================

create table if not exists public.learner_review_answer_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  review_item_id uuid not null,
  correct boolean not null,
  -- The item was due when answered; only due items earn XP.
  was_due boolean not null default true,
  answered_at timestamptz not null default now()
);

create index if not exists learner_review_answer_log_user_idx
  on public.learner_review_answer_log (user_id, language_id, answered_at desc);

alter table public.learner_review_answer_log enable row level security;
revoke all on public.learner_review_answer_log from anon, authenticated;

create table if not exists public.english_league_groups (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null references public.languages(id) on delete cascade,
  -- Learner-local (UTC+5) Monday the week starts on.
  week_start date not null,
  tier text not null check (tier in ('bronze', 'silver', 'gold', 'sapphire', 'diamond')),
  -- Set once every member's final rank and outcome are written.
  finalized_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists english_league_groups_open_idx
  on public.english_league_groups (language_id, week_start, tier, created_at);

alter table public.english_league_groups enable row level security;
revoke all on public.english_league_groups from anon, authenticated;

create table if not exists public.english_league_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.english_league_groups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  week_start date not null,
  tier text not null check (tier in ('bronze', 'silver', 'gold', 'sapphire', 'diamond')),
  joined_at timestamptz not null default now(),
  -- The learner left leagues during this week; they are no longer ranked.
  left_at timestamptz,
  final_rank integer check (final_rank is null or final_rank > 0),
  final_xp integer check (final_xp is null or final_xp >= 0),
  outcome text check (outcome is null or outcome in ('promoted', 'stayed', 'demoted')),
  constraint english_league_members_week_unique unique (user_id, language_id, week_start)
);

create index if not exists english_league_members_group_idx
  on public.english_league_members (group_id);

create index if not exists english_league_members_promoted_idx
  on public.english_league_members (user_id, language_id)
  where outcome = 'promoted';

alter table public.english_league_members enable row level security;
revoke all on public.english_league_members from anon, authenticated;

create table if not exists public.learner_badges (
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  badge_key text not null check (badge_key ~ '^[a-z0-9_]{2,64}$'),
  earned_at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (user_id, language_id, badge_key)
);

alter table public.learner_badges enable row level security;
revoke all on public.learner_badges from anon, authenticated;

-- Places a learner in an open group of their tier for the week, or opens a
-- new group when every group is full. Serialised per (language, week, tier)
-- so concurrent joins cannot overfill a group. Returns the group id.
create or replace function public.english_league_join(
  p_user_id uuid,
  p_language_id uuid,
  p_week_start date,
  p_tier text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group_id uuid;
begin
  if p_tier not in ('bronze', 'silver', 'gold', 'sapphire', 'diamond') then
    raise exception 'invalid league tier %', p_tier;
  end if;

  select m.group_id into v_group_id
  from public.english_league_members m
  where m.user_id = p_user_id and m.language_id = p_language_id and m.week_start = p_week_start;
  if v_group_id is not null then
    return v_group_id;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('english_league:' || p_language_id::text || ':' || p_week_start::text || ':' || p_tier, 0)
  );

  select g.id into v_group_id
  from public.english_league_groups g
  where g.language_id = p_language_id
    and g.week_start = p_week_start
    and g.tier = p_tier
    and (select count(*) from public.english_league_members m where m.group_id = g.id) < 30
  order by g.created_at, g.id
  limit 1;

  if v_group_id is null then
    insert into public.english_league_groups (language_id, week_start, tier)
    values (p_language_id, p_week_start, p_tier)
    returning id into v_group_id;
  end if;

  insert into public.english_league_members (group_id, user_id, language_id, week_start, tier)
  values (v_group_id, p_user_id, p_language_id, p_week_start, p_tier)
  on conflict (user_id, language_id, week_start) do nothing;

  select m.group_id into v_group_id
  from public.english_league_members m
  where m.user_id = p_user_id and m.language_id = p_language_id and m.week_start = p_week_start;
  return v_group_id;
end;
$$;

revoke all on function public.english_league_join(uuid, uuid, date, text) from public, anon, authenticated;
grant execute on function public.english_league_join(uuid, uuid, date, text) to service_role;
