-- ============================================================================
-- IELTS PRACTICE: SPACED REPETITION (LEITNER) FOR QUESTION TYPES
-- ============================================================================
-- Tracks per-user mastery of each IELTS question type using a 5-box Leitner
-- system. A "review" here is one practice attempt of a specific question type
-- (e.g. question_true_false_not_given). Correct answers advance the box;
-- incorrect answers reset to box 1. Standard Leitner intervals: 1, 2, 4, 8,
-- 16 days. Box 5 with no recent miss is treated as mastered (is_archived).
--
-- Mirrors the user_vocabulary_notebook_entries pattern at the data layer so
-- the existing client conventions and admin-read RLS pattern carry over.

create table if not exists public.ielts_srs_question_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  section_type text not null check (section_type in ('reading', 'listening', 'writing')),
  question_type text not null,
  leitner_box smallint not null default 1,
  next_review_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  last_accuracy_ratio numeric(5, 4),
  rolling_accuracy_ratio numeric(5, 4),
  review_count integer not null default 0,
  correct_count integer not null default 0,
  incorrect_count integer not null default 0,
  is_archived boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ielts_srs_box_valid check (leitner_box between 1 and 5),
  constraint ielts_srs_counts_valid check (
    review_count >= 0
    and correct_count >= 0
    and incorrect_count >= 0
    and review_count >= correct_count + incorrect_count
  ),
  constraint ielts_srs_question_type_not_empty check (length(trim(question_type)) > 0),
  constraint ielts_srs_unique_per_user unique (user_id, language_id, product_id, section_type, question_type)
);

create index if not exists ielts_srs_due_idx
  on public.ielts_srs_question_reviews (user_id, language_id, is_archived, next_review_at asc);

create index if not exists ielts_srs_recent_idx
  on public.ielts_srs_question_reviews (user_id, language_id, updated_at desc);

drop trigger if exists ielts_srs_question_reviews_updated_at on public.ielts_srs_question_reviews;
create trigger ielts_srs_question_reviews_updated_at
before update on public.ielts_srs_question_reviews
for each row execute function public.set_updated_at();

alter table public.ielts_srs_question_reviews enable row level security;

drop policy if exists "IELTS SRS reviews select own" on public.ielts_srs_question_reviews;
create policy "IELTS SRS reviews select own"
on public.ielts_srs_question_reviews
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "IELTS SRS reviews insert own" on public.ielts_srs_question_reviews;
create policy "IELTS SRS reviews insert own"
on public.ielts_srs_question_reviews
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "IELTS SRS reviews update own" on public.ielts_srs_question_reviews;
create policy "IELTS SRS reviews update own"
on public.ielts_srs_question_reviews
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "IELTS SRS reviews select admin" on public.ielts_srs_question_reviews;
create policy "IELTS SRS reviews select admin"
on public.ielts_srs_question_reviews
for select
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) like 'admin%'
  )
);

comment on table public.ielts_srs_question_reviews is
  'Per-user spaced-repetition queue for IELTS question types. 5-box Leitner: 1/2/4/8/16 day intervals.';
