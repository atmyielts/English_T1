-- Vocabulary duels for Schood English.
-- ============================================================================
-- Two learners, ten questions, sixty seconds each, by invite link only (no
-- public matchmaking). Rules live in supabase/functions/_shared/english-duel.ts;
-- reads and writes go through _shared/english-duel-service.ts (hub /duel*,
-- the student bot via hub /internal/telegram-social, and the Telegram Mini App
-- via telegram-app english_duel). Service role only: no grants.
--
--   english_duels          one row per duel: invite code, the two players, the
--                          ten questions (same for both, answer key included,
--                          never sent to a browser), status and winner.
--   english_duel_players   one row per player: server-side clock (started_at,
--                          deadline_at), answers, score, outcome and the XP the
--                          duel earned (hub/xp.ts adds it to weekly XP, capped
--                          per learner day in _shared/english-xp.ts).
-- ============================================================================

create table if not exists public.english_duels (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  language_id uuid not null references public.languages(id) on delete cascade,
  creator_id uuid not null references public.users(id) on delete cascade,
  opponent_id uuid references public.users(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'active', 'finished', 'expired')),
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  -- An open invite nobody accepted stops working after this.
  invite_expires_at timestamptz not null,
  joined_at timestamptz,
  -- After the friend joins, both have until this to play.
  play_expires_at timestamptz,
  finished_at timestamptz,
  winner_id uuid references public.users(id) on delete set null,
  rematch_of uuid references public.english_duels(id) on delete set null,
  rematch_id uuid references public.english_duels(id) on delete set null,
  constraint english_duels_code_unique unique (code),
  constraint english_duels_two_people check (opponent_id is null or opponent_id <> creator_id)
);

create index if not exists english_duels_creator_idx
  on public.english_duels (creator_id, created_at desc);
create index if not exists english_duels_opponent_idx
  on public.english_duels (opponent_id, created_at desc)
  where opponent_id is not null;

alter table public.english_duels enable row level security;
revoke all on public.english_duels from anon, authenticated;

create table if not exists public.english_duel_players (
  duel_id uuid not null references public.english_duels(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  role text not null check (role in ('creator', 'opponent')),
  -- Where the player last played from: web, telegram (chat) or mini_app.
  channel text not null default 'web' check (channel in ('web', 'telegram', 'mini_app')),
  -- Language for this player's Telegram messages about the duel.
  locale text not null default 'en' check (locale in ('en', 'ru', 'uz')),
  started_at timestamptz,
  deadline_at timestamptz,
  finished_at timestamptz,
  answers jsonb not null default '[]'::jsonb,
  -- Optimistic lock: an answer is saved only if nobody saved one in between.
  answered_count integer not null default 0 check (answered_count between 0 and 10),
  correct_count integer not null default 0 check (correct_count between 0 and 10),
  elapsed_ms integer check (elapsed_ms is null or elapsed_ms >= 0),
  outcome text check (outcome is null or outcome in ('win', 'loss', 'draw', 'walkover', 'forfeit')),
  xp integer not null default 0 check (xp between 0 and 50),
  xp_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (duel_id, user_id)
);

create index if not exists english_duel_players_xp_idx
  on public.english_duel_players (user_id, language_id, xp_at)
  where xp > 0;

alter table public.english_duel_players enable row level security;
revoke all on public.english_duel_players from anon, authenticated;
