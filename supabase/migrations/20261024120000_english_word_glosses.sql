-- Tap-to-translate: a shared cache of word meanings.
-- ============================================================================
-- When a learner taps a word in a reading, transcript, mission or grammar
-- example, the hub looks it up here first. A miss is filled from vocabulary
-- decks or, failing that, by the AI, and the AI answer is stored so the next
-- learner gets it for free. One row per word (the general meaning; the
-- sentence the learner saw it in is never stored). `found = false` remembers
-- non-words so they are not sent to the AI again.
--
-- `created_by` is the learner whose lookup created the row: the hub counts
-- these per learner-day to cap new AI lookups. Written and read only by edge
-- functions (service role).
-- ============================================================================

create table if not exists public.english_word_glosses (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  lemma text,
  found boolean not null default true,
  pos text,
  definition text,
  example text,
  ru text,
  uz text,
  source text not null default 'ai',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint english_word_glosses_word_unique unique (word),
  constraint english_word_glosses_word_shape check (length(word) between 1 and 40 and word ~ '^[a-z]+([''-][a-z]+)*$'),
  constraint english_word_glosses_source check (source in ('ai', 'editor')),
  constraint english_word_glosses_found_has_meaning check (not found or (definition is not null and length(trim(definition)) > 0)),
  constraint english_word_glosses_lengths check (
    coalesce(length(definition), 0) <= 400
    and coalesce(length(example), 0) <= 400
    and coalesce(length(ru), 0) <= 240
    and coalesce(length(uz), 0) <= 240
    and coalesce(length(lemma), 0) <= 40
    and coalesce(length(pos), 0) <= 24
  )
);

-- Counting a learner's new lookups today.
create index if not exists english_word_glosses_created_by_idx
  on public.english_word_glosses (created_by, created_at)
  where created_by is not null;

alter table public.english_word_glosses enable row level security;

-- No policies: only the hub (service role) reads and writes this table.
revoke all on public.english_word_glosses from anon, authenticated;
