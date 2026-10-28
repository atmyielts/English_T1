-- Journey timeline (hub /journey) and search (hub /search) support.
-- ============================================================================
-- * learner_review_answer_log.channel: where a review answer was given.
--   NULL = the English app (web or installed); 'telegram' = the Telegram Mini
--   App (telegram-app). Older rows stay NULL. Nullable with no default, so the
--   existing writers keep working unchanged.
-- * Indexes so a week of the timeline is read by (learner, time) ranges.
-- ============================================================================

alter table public.learner_review_answer_log
  add column if not exists channel text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'learner_review_answer_log_channel_check'
      and conrelid = 'public.learner_review_answer_log'::regclass
  ) then
    alter table public.learner_review_answer_log
      add constraint learner_review_answer_log_channel_check
      check (channel is null or channel in ('web', 'telegram'));
  end if;
end
$$;

-- Finished activities by submission time (the timeline, streak and XP read these).
create index if not exists learning_attempts_user_submitted_idx
  on public.learning_attempts (user_id, language_id, submitted_at desc)
  where submitted_at is not null;

-- Telegram quiz answers by answer time.
create index if not exists english_telegram_quiz_questions_answered_idx
  on public.english_telegram_quiz_questions (user_id, answered_at desc)
  where answered_at is not null;

-- Finished role-plays and mocks by finish time.
create index if not exists english_roleplay_sessions_finished_idx
  on public.english_roleplay_sessions (user_id, language_id, finished_at desc)
  where finished_at is not null;

create index if not exists english_speaking_mocks_finished_idx
  on public.english_speaking_mocks (user_id, language_id, finished_at desc)
  where finished_at is not null;

-- Words saved to the notebook by day, and notebook search for the learner.
create index if not exists user_vocabulary_notebook_entries_user_created_idx
  on public.user_vocabulary_notebook_entries (user_id, language_id, created_at desc);
