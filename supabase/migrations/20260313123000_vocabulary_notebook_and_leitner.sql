-- Personal vocabulary notebook + Leitner review primitives.
-- Scope: English-first, but language_id is modeled to stay multi-language ready.

create table if not exists public.language_lexicon_entries (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null references public.languages(id) on delete cascade,
  normalized_word text not null,
  display_word text not null,
  lemma text,
  part_of_speech text,
  definition text,
  example text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint language_lexicon_entries_word_not_empty check (length(trim(normalized_word)) > 0),
  constraint language_lexicon_entries_word_normalized check (normalized_word = lower(trim(normalized_word))),
  constraint language_lexicon_entries_unique unique (language_id, normalized_word)
);

create index if not exists language_lexicon_entries_language_idx
  on public.language_lexicon_entries(language_id, updated_at desc);

drop trigger if exists language_lexicon_entries_updated_at on public.language_lexicon_entries;
create trigger language_lexicon_entries_updated_at
before update on public.language_lexicon_entries
for each row execute function public.set_updated_at();

alter table public.language_lexicon_entries enable row level security;

drop policy if exists "Language lexicon entries select authenticated" on public.language_lexicon_entries;
create policy "Language lexicon entries select authenticated"
on public.language_lexicon_entries
for select
to authenticated
using (true);

drop policy if exists "Language lexicon entries mutate admin" on public.language_lexicon_entries;
create policy "Language lexicon entries mutate admin"
on public.language_lexicon_entries
for all
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) = 'admin'
  )
);

create table if not exists public.user_vocabulary_notebook_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  lexicon_entry_id uuid references public.language_lexicon_entries(id) on delete set null,
  word text not null,
  normalized_word text not null,
  context_text text,
  source_type text not null default 'manual',
  source_product_id uuid references public.products(id) on delete set null,
  source_label text,
  source_ref text,
  notes text,
  leitner_box smallint not null default 1,
  next_review_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  review_count integer not null default 0,
  correct_count integer not null default 0,
  incorrect_count integer not null default 0,
  is_archived boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_vocab_word_not_empty check (length(trim(normalized_word)) > 0),
  constraint user_vocab_word_normalized check (normalized_word = lower(trim(normalized_word))),
  constraint user_vocab_leitner_box_valid check (leitner_box between 1 and 5),
  constraint user_vocab_review_counts_valid check (
    review_count >= 0
    and correct_count >= 0
    and incorrect_count >= 0
    and review_count >= correct_count + incorrect_count
  ),
  constraint user_vocab_unique_word_per_language unique (user_id, language_id, normalized_word)
);

create index if not exists user_vocabulary_notebook_due_idx
  on public.user_vocabulary_notebook_entries(user_id, language_id, is_archived, next_review_at asc);

create index if not exists user_vocabulary_notebook_recent_idx
  on public.user_vocabulary_notebook_entries(user_id, language_id, updated_at desc);

drop trigger if exists user_vocabulary_notebook_entries_updated_at on public.user_vocabulary_notebook_entries;
create trigger user_vocabulary_notebook_entries_updated_at
before update on public.user_vocabulary_notebook_entries
for each row execute function public.set_updated_at();

alter table public.user_vocabulary_notebook_entries enable row level security;

drop policy if exists "User vocabulary notebook select own" on public.user_vocabulary_notebook_entries;
create policy "User vocabulary notebook select own"
on public.user_vocabulary_notebook_entries
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "User vocabulary notebook insert own" on public.user_vocabulary_notebook_entries;
create policy "User vocabulary notebook insert own"
on public.user_vocabulary_notebook_entries
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "User vocabulary notebook update own" on public.user_vocabulary_notebook_entries;
create policy "User vocabulary notebook update own"
on public.user_vocabulary_notebook_entries
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "User vocabulary notebook delete own" on public.user_vocabulary_notebook_entries;
create policy "User vocabulary notebook delete own"
on public.user_vocabulary_notebook_entries
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "User vocabulary notebook select admin" on public.user_vocabulary_notebook_entries;
create policy "User vocabulary notebook select admin"
on public.user_vocabulary_notebook_entries
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) = 'admin'
  )
);

create or replace function public.leitner_interval_days(p_box smallint)
returns integer
language sql
immutable
as $$
  select case greatest(1, least(p_box, 5))
    when 1 then 1
    when 2 then 2
    when 3 then 4
    when 4 then 8
    else 16
  end
$$;

grant execute on function public.leitner_interval_days(smallint) to authenticated;
