-- IELTS Practice engine depth (2026-10-26).
--
-- 1. ielts_practice_generated_mocks: AI-generated mock passages are stored with
--    a normalised answer key and graded on the server, so they appear in the
--    learner's history and missed questions reach the notebook and review queue.
-- 2. ielts_practice_item_reviews: item-level spaced repetition. Every question a
--    learner misses in a lab (or a generated mock) comes back as the same
--    question on a 5-box Leitner schedule, alongside the existing type-level
--    queue in ielts_srs_question_reviews.
-- 3. ielts_practice_speaking_attempts: Speaking practice (Parts 1-3). Only the
--    transcript and transcript-only coaching feedback are stored; the audio
--    recording never leaves the learner's browser.
--
-- Additive only: no existing table or column changes, so the currently
-- deployed functions keep working until the new ones ship. Writes happen in the
-- ielts-practice edge function with the service role; learners can read their
-- own rows.

begin;
set local lock_timeout = '5s';

create table if not exists public.ielts_practice_generated_mocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  section_type text not null check (section_type in ('reading', 'listening')),
  question_style text not null,
  target_band numeric(3,1) not null check (target_band >= 0 and target_band <= 9),
  topic_hint text,
  estimated_band numeric(3,1) check (estimated_band is null or (estimated_band >= 0 and estimated_band <= 9)),
  passage jsonb not null default '{}'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  status text not null default 'generated' check (status in ('generated', 'submitted')),
  answers_json jsonb not null default '[]'::jsonb,
  results_json jsonb not null default '[]'::jsonb,
  raw_score integer check (raw_score is null or raw_score >= 0),
  max_score integer check (max_score is null or max_score >= 0),
  accuracy_ratio numeric(5,4) check (accuracy_ratio is null or (accuracy_ratio >= 0 and accuracy_ratio <= 1)),
  submitted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ielts_practice_generated_mocks_user_idx
  on public.ielts_practice_generated_mocks (user_id, created_at desc);

create table if not exists public.ielts_practice_item_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  source_kind text not null check (source_kind in ('lab', 'generated_mock')),
  -- lab items: the delivery build + lab step the question came from
  delivery_build_id uuid references public.ielts_practice_delivery_builds(id) on delete cascade,
  practice_session_id uuid references public.ielts_practice_sessions(id) on delete set null,
  -- generated-mock items: the stored mock + question index
  generated_mock_id uuid references public.ielts_practice_generated_mocks(id) on delete cascade,
  item_key text not null check (length(trim(item_key)) > 0 and length(item_key) <= 200),
  section_type text not null check (section_type in ('reading', 'listening', 'writing')),
  question_type text not null check (length(trim(question_type)) > 0),
  title text,
  prompt_excerpt text,
  leitner_box smallint not null default 1 check (leitner_box between 1 and 5),
  next_review_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  last_result text check (last_result is null or last_result in ('correct', 'incorrect')),
  review_count integer not null default 0 check (review_count >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  incorrect_count integer not null default 0 check (incorrect_count >= 0),
  is_archived boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ielts_practice_item_reviews_source_ref check (
    (source_kind = 'lab' and delivery_build_id is not null)
    or (source_kind = 'generated_mock' and generated_mock_id is not null)
  ),
  constraint ielts_practice_item_reviews_unique unique (user_id, source_kind, item_key)
);

create index if not exists ielts_practice_item_reviews_due_idx
  on public.ielts_practice_item_reviews (user_id, language_id, is_archived, next_review_at asc);

create table if not exists public.ielts_practice_speaking_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  part text not null check (part in ('part1', 'part2', 'part3')),
  prompt_id text not null check (length(trim(prompt_id)) > 0 and length(prompt_id) <= 80),
  topic text not null,
  transcript text not null check (length(transcript) <= 12000),
  transcript_source text not null default 'typed' check (transcript_source in ('speech_recognition', 'typed', 'mixed')),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 900),
  word_count integer not null default 0 check (word_count >= 0),
  words_per_minute integer check (words_per_minute is null or words_per_minute >= 0),
  feedback jsonb,
  feedback_status text not null default 'pending' check (feedback_status in ('pending', 'ready', 'unavailable')),
  feedback_lang text not null default 'en' check (feedback_lang in ('en', 'uz', 'ru')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ielts_practice_speaking_attempts_user_idx
  on public.ielts_practice_speaking_attempts (user_id, created_at desc);

drop trigger if exists ielts_practice_generated_mocks_updated_at on public.ielts_practice_generated_mocks;
create trigger ielts_practice_generated_mocks_updated_at
before update on public.ielts_practice_generated_mocks
for each row execute procedure public.handle_user_updated_at();

drop trigger if exists ielts_practice_item_reviews_updated_at on public.ielts_practice_item_reviews;
create trigger ielts_practice_item_reviews_updated_at
before update on public.ielts_practice_item_reviews
for each row execute procedure public.handle_user_updated_at();

drop trigger if exists ielts_practice_speaking_attempts_updated_at on public.ielts_practice_speaking_attempts;
create trigger ielts_practice_speaking_attempts_updated_at
before update on public.ielts_practice_speaking_attempts
for each row execute procedure public.handle_user_updated_at();

alter table public.ielts_practice_generated_mocks enable row level security;
alter table public.ielts_practice_item_reviews enable row level security;
alter table public.ielts_practice_speaking_attempts enable row level security;

-- Read-only for learners (their own rows) and admins. The answer key of an
-- unsubmitted mock lives in `questions`; the edge function never returns it
-- before submission, and learners cannot write to these tables directly.
drop policy if exists "IELTS practice generated mocks read own" on public.ielts_practice_generated_mocks;
create policy "IELTS practice generated mocks read own"
on public.ielts_practice_generated_mocks
for select
using ((auth.uid() = user_id and status = 'submitted') or public.is_admin());

drop policy if exists "IELTS practice item reviews read own" on public.ielts_practice_item_reviews;
create policy "IELTS practice item reviews read own"
on public.ielts_practice_item_reviews
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "IELTS practice speaking attempts read own" on public.ielts_practice_speaking_attempts;
create policy "IELTS practice speaking attempts read own"
on public.ielts_practice_speaking_attempts
for select
using (auth.uid() = user_id or public.is_admin());

revoke insert, update, delete on public.ielts_practice_generated_mocks from anon, authenticated;
revoke insert, update, delete on public.ielts_practice_item_reviews from anon, authenticated;
revoke insert, update, delete on public.ielts_practice_speaking_attempts from anon, authenticated;

comment on table public.ielts_practice_generated_mocks is
  'AI-generated IELTS Practice mocks with a normalised answer key; graded server-side by the ielts-practice function.';
comment on table public.ielts_practice_item_reviews is
  'Item-level spaced repetition: the exact questions a learner missed, rescheduled on 1/2/4/8/16-day Leitner boxes.';
comment on table public.ielts_practice_speaking_attempts is
  'IELTS Practice Speaking attempts: transcript and transcript-only feedback. No audio is stored and no band is given.';

commit;
