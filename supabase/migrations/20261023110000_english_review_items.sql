-- Mixed review: things a learner got wrong come back until they get them right.
-- ============================================================================
-- When a learner misses a grammar question, a reading or listening question,
-- or a dictation sentence, the item is queued here and returns on the Review
-- page after 1, 3 and 7 days. Answering correctly moves it on; three correct
-- reviews retire it. `payload` holds the prompt AND the answer key, so the
-- table is written and read only by edge functions (service role); learners
-- can read their own rows only through the hub, which strips the key.
-- ============================================================================

create table if not exists public.learner_review_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  kind text not null check (kind in ('grammar', 'reading', 'listening')),
  item_key text not null check (length(item_key) between 3 and 300),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  source_attempt_id uuid,
  box smallint not null default 1 check (box between 1 and 4),
  next_due_at timestamptz not null default now() + interval '1 day',
  last_result text check (last_result is null or last_result in ('correct', 'incorrect')),
  times_reviewed integer not null default 0 check (times_reviewed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learner_review_items_unique unique (user_id, language_id, item_key)
);

create index if not exists learner_review_items_due_idx
  on public.learner_review_items (user_id, language_id, next_due_at)
  where box < 4;

alter table public.learner_review_items enable row level security;

drop trigger if exists learner_review_items_updated_at on public.learner_review_items;
create trigger learner_review_items_updated_at
  before update on public.learner_review_items
  for each row execute function public.set_updated_at();

-- No policies for authenticated users: answer keys must not be readable from
-- the browser. Edge functions use the service role.
revoke all on public.learner_review_items from anon, authenticated;
