-- Daily review quiz in Telegram (opt-in, English).
-- ============================================================================
-- Learners who turned on the quiz get up to three multiple-choice questions a
-- day in Telegram, built from due review items and due saved words. Each sent
-- question is stored here so the Telegram button only carries a short id and
-- the option index (`enq:<id>:<index>`, under the 64-byte callback limit) and
-- the answer is checked on the server. Rows hold the answer key, so only edge
-- functions (service role) read or write them. Additive and idempotent.
-- ============================================================================

create table if not exists public.english_telegram_quiz_questions (
  id text primary key check (id ~ '^[A-Za-z0-9]{10}$'),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  -- Learner-local (UTC+5) day the question belongs to, and its place in that day.
  batch_date date not null,
  position smallint not null check (position between 1 and 3),
  batch_size smallint not null check (batch_size between 1 and 3),
  source text not null check (source in ('review_item', 'notebook_word')),
  -- learner_review_items.id or user_vocabulary_notebook_entries.id
  source_id uuid not null,
  locale text not null default 'en' check (locale in ('en', 'ru', 'uz')),
  prompt text not null check (length(prompt) between 1 and 2000),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  correct_index smallint not null check (correct_index between 0 and 5),
  explanation text,
  created_at timestamptz not null default now(),
  -- Set when send-telegram confirmed delivery (a deferred first question stays null).
  sent_at timestamptz,
  answered_at timestamptz,
  chosen_index smallint check (chosen_index is null or chosen_index between 0 and 5),
  is_correct boolean,
  constraint english_telegram_quiz_questions_slot unique (user_id, language_id, batch_date, position)
);

create index if not exists english_telegram_quiz_questions_user_idx
  on public.english_telegram_quiz_questions (user_id, batch_date desc);

alter table public.english_telegram_quiz_questions enable row level security;

-- No policies: answer keys must not be readable from the browser.
revoke all on public.english_telegram_quiz_questions from anon, authenticated;
