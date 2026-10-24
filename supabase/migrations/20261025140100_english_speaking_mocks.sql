-- IELTS-style speaking mocks (hub /speaking-mock/*). One row per mock: the
-- questions given at start, the learner's answers and the estimated bands.
-- Starting a mock counts toward the limits (1 free per learner week, 5 a day
-- with Speaking), so rows are kept even when a mock is never finished.
-- A finished mock is also recorded as a speaking learning attempt
-- (content_type speaking.mock). Written and read only by edge functions.

create table if not exists public.english_speaking_mocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  basis text not null check (basis in ('owner', 'admin', 'free')),
  status text not null default 'in_progress' check (status in ('in_progress', 'finished')),
  cue_card_id text not null check (cue_card_id ~ '^[a-z0-9-]{2,64}$'),
  questions jsonb not null,
  answers jsonb,
  result jsonb,
  -- Estimated overall band (1-9 in half bands), for the history list.
  overall_band numeric(2,1) check (overall_band is null or (overall_band >= 0 and overall_band <= 9)),
  attempt_id uuid,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists english_speaking_mocks_user_idx
  on public.english_speaking_mocks (user_id, language_id, started_at desc);

alter table public.english_speaking_mocks enable row level security;
revoke all on public.english_speaking_mocks from anon, authenticated;
