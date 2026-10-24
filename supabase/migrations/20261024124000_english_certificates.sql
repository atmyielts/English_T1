-- Shareable English level records ("certificates").
-- ============================================================================
-- After a placement test or a monthly level check, a learner can create a
-- record of the level it measured, with a short unguessable code. Anyone with
-- the link can see the public fields (chosen name, levels, how and when they
-- were measured, activities completed) through the hub's public route; the
-- learner can revoke it. This is a Schood record, not an official CEFR or exam
-- certificate. Written and read only by edge functions (service role).
-- ============================================================================

create table if not exists public.english_certificates (
  id uuid primary key default gen_random_uuid(),
  -- 12 Crockford base32 characters (60 random bits).
  code text not null unique check (code ~ '^[0-9A-HJKMNP-TV-Z]{12}$'),
  user_id uuid not null references public.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 60),
  overall text not null check (overall in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  per_skill jsonb not null default '{}'::jsonb check (jsonb_typeof(per_skill) = 'object'),
  measured_by text not null check (measured_by in ('placement', 'check')),
  measured_at timestamptz not null,
  activities_count integer not null default 0 check (activities_count >= 0),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= issued_at)
);

-- At most one active certificate per measurement: issuing again returns it.
create unique index if not exists english_certificates_one_active_idx
  on public.english_certificates (user_id, measured_at)
  where revoked_at is null;

create index if not exists english_certificates_user_idx
  on public.english_certificates (user_id, issued_at desc);

alter table public.english_certificates enable row level security;

-- No policies: learners reach their rows only through the hub, and the public
-- sees only the fields the hub's public route returns.
revoke all on public.english_certificates from anon, authenticated;
