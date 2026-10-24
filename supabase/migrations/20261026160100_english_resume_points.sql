-- "Continue anywhere" for Schood English (hub /resume).
-- ============================================================================
-- The last activity a learner opened in each skill, with where they were when
-- the skill can say so (a writing draft, the listening answers and dictation
-- written so far). One row per learner per skill, overwritten as they move on.
-- The hub hides a point once the activity has been submitted after it, and
-- after 7 days. Role-plays and speaking mocks resume from their own tables
-- (english_roleplay_sessions, english_speaking_mocks), not from here.
--
-- Written and read only by edge functions (service role).
-- ============================================================================

create table if not exists public.english_resume_points (
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  skill text not null check (skill in ('reading', 'listening', 'writing', 'speaking', 'grammar', 'vocabulary', 'immersion')),
  slug text not null check (char_length(slug) between 1 and 160),
  title text check (title is null or char_length(title) <= 220),
  -- Skill-specific place in the activity; small (checked again by the hub).
  position jsonb check (position is null or (jsonb_typeof(position) = 'object' and pg_column_size(position) <= 24000)),
  updated_at timestamptz not null default now(),
  primary key (user_id, language_id, skill)
);

create index if not exists english_resume_points_recent_idx
  on public.english_resume_points (user_id, language_id, updated_at desc);

alter table public.english_resume_points enable row level security;
revoke all on public.english_resume_points from anon, authenticated;
