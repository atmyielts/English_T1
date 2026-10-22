-- Comprehension questions for reading articles and listening items.
-- ============================================================================
-- Reading previously had no questions (the score was a self-rating) and
-- listening only had dictation. Each item now carries its own questions:
--
--   questions: [
--     { "id": "q1", "type": "mcq", "prompt": "...",
--       "options": ["...", "...", "...", "..."], "answer_index": 2,
--       "explanation": "Why that option is right, citing the text." }
--   ]
--
-- Answer keys stay server-side; edge functions strip answer_index and
-- explanation before sending items to the browser and return them only
-- after the learner submits. Additive and idempotent.
-- ============================================================================

alter table public.reading_articles
  add column if not exists questions jsonb not null default '[]'::jsonb;

alter table public.listening_items
  add column if not exists questions jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reading_articles_questions_is_array') then
    alter table public.reading_articles
      add constraint reading_articles_questions_is_array check (jsonb_typeof(questions) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'listening_items_questions_is_array') then
    alter table public.listening_items
      add constraint listening_items_questions_is_array check (jsonb_typeof(questions) = 'array');
  end if;
end $$;
