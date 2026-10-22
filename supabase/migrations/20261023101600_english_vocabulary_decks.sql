-- Shared vocabulary decks for the English Vocabulary skill.
-- ============================================================================
-- vocab_drill_decks / vocab_drill_cards are per-learner. These two tables hold
-- shared starter content: topic word sets by CEFR level that every learner can
-- study. Learners read published decks; only the service role writes.
-- Additive and idempotent.
-- ============================================================================

create table if not exists public.vocabulary_decks (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  slug text not null,
  title text not null,
  level text,
  topic text,
  description text,
  status text not null default 'draft',
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vocabulary_decks_slug_not_empty check (length(trim(slug)) > 0),
  constraint vocabulary_decks_title_not_empty check (length(trim(title)) > 0),
  constraint vocabulary_decks_level_valid check (level is null or level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  constraint vocabulary_decks_status_valid check (status in ('draft', 'published', 'archived')),
  constraint vocabulary_decks_slug_per_language unique (language_id, slug)
);

create index if not exists vocabulary_decks_listing_idx
  on public.vocabulary_decks(language_id, status, level, sort_order);

create index if not exists vocabulary_decks_product_idx
  on public.vocabulary_decks(product_id);

drop trigger if exists vocabulary_decks_updated_at on public.vocabulary_decks;
create trigger vocabulary_decks_updated_at
before update on public.vocabulary_decks
for each row execute function public.set_updated_at();

create table if not exists public.vocabulary_deck_words (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.vocabulary_decks(id) on delete cascade,
  word text not null,
  part_of_speech text,
  definition text not null,
  example text,
  translation_ru text,
  translation_uz text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vocabulary_deck_words_word_not_empty check (length(trim(word)) > 0),
  constraint vocabulary_deck_words_definition_not_empty check (length(trim(definition)) > 0),
  constraint vocabulary_deck_words_unique_word unique (deck_id, word)
);

create index if not exists vocabulary_deck_words_deck_order_idx
  on public.vocabulary_deck_words(deck_id, sort_order);

drop trigger if exists vocabulary_deck_words_updated_at on public.vocabulary_deck_words;
create trigger vocabulary_deck_words_updated_at
before update on public.vocabulary_deck_words
for each row execute function public.set_updated_at();

-- Row level security: read published content when signed in; no client writes.
alter table public.vocabulary_decks enable row level security;
alter table public.vocabulary_deck_words enable row level security;

revoke insert, update, delete, truncate on public.vocabulary_decks from anon, authenticated;
revoke insert, update, delete, truncate on public.vocabulary_deck_words from anon, authenticated;

drop policy if exists "Vocabulary decks select published" on public.vocabulary_decks;
create policy "Vocabulary decks select published"
on public.vocabulary_decks
for select
to authenticated
using (status = 'published');

drop policy if exists "Vocabulary deck words select published" on public.vocabulary_deck_words;
create policy "Vocabulary deck words select published"
on public.vocabulary_deck_words
for select
to authenticated
using (
  exists (
    select 1
    from public.vocabulary_decks d
    where d.id = vocabulary_deck_words.deck_id
      and d.status = 'published'
  )
);

-- Same closed-account guard every other RLS table carries
-- (see 20261010155000_account_closed_principal_boundary.sql).
do $$
begin
  if exists (select 1 from pg_proc where proname = 'account_is_open' and pronamespace = 'public'::regnamespace) then
    execute 'drop policy if exists account_open_required on public.vocabulary_decks';
    execute 'create policy account_open_required on public.vocabulary_decks as restrictive for all to authenticated using ((select public.account_is_open())) with check ((select public.account_is_open()))';
    execute 'drop policy if exists account_open_required on public.vocabulary_deck_words';
    execute 'create policy account_open_required on public.vocabulary_deck_words as restrictive for all to authenticated using ((select public.account_is_open())) with check ((select public.account_is_open()))';
  end if;
end
$$;
