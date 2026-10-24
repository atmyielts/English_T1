-- Real-life role-plays (hub /roleplay/*). One row per session: the conversation
-- is kept on the server so the turn limit, goals and the final review can't be
-- faked by the client. Scenario content is static (_shared/english-roleplay.ts).
-- A finished session is also recorded as a speaking learning attempt
-- (content_type speaking.roleplay), which is what XP, streaks and progress read.
-- Written and read only by edge functions (service role).

create table if not exists public.english_roleplay_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  scenario_id text not null check (scenario_id ~ '^[a-z0-9-]{2,64}$'),
  -- How the learner was allowed in: Speaking in their plan, admin, or today's free activity.
  basis text not null check (basis in ('entitled', 'admin', 'free')),
  level text not null check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  status text not null default 'active' check (status in ('active', 'finished')),
  messages jsonb not null default '[]'::jsonb,
  goals_met text[] not null default '{}',
  tips jsonb not null default '[]'::jsonb,
  learner_turns integer not null default 0 check (learner_turns >= 0 and learner_turns <= 50),
  result jsonb,
  attempt_id uuid,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists english_roleplay_sessions_user_idx
  on public.english_roleplay_sessions (user_id, language_id, started_at desc);

alter table public.english_roleplay_sessions enable row level security;
revoke all on public.english_roleplay_sessions from anon, authenticated;
