-- One word store: the English notebook (user_vocabulary_notebook_entries) is the
-- source of truth for a learner's words and reviews everywhere. The platform
-- vocab drill, the Telegram Mini App practice tab and the student bot's /drill
-- now read and write it (supabase/functions/_shared/english-word-store.ts).
--
-- This migration copies the old SM-2 drill cards (vocab_drill_cards) into the
-- notebook once:
--   * only for learners who actually used the drill (reviewed a card or added
--     their own words after the automatic AWL seed); for them every card is
--     copied, so they keep the whole deck;
--   * reviewed cards keep their schedule and get an FSRS memory state
--     (metadata.srs: stability from the SM-2 interval, difficulty from the
--     ease factor), the same mapping as english-srs.ts stateFromSm2;
--   * cards never reviewed are introduced twenty a day;
--   * a word already in the notebook is left untouched (the notebook wins).
-- Every scanned card is stamped imported_at, so the functions' lazy import
-- (for cards old code writes between this migration and the function deploy)
-- only looks at new ones. vocab_drill_cards is kept, read-only, for rollback.
--
-- Idempotent: re-running copies nothing twice (imported_at + on conflict do nothing).

alter table public.vocab_drill_cards
  add column if not exists imported_at timestamptz;

create index if not exists vocab_drill_cards_not_imported_idx
  on public.vocab_drill_cards(user_id)
  where imported_at is null;

do $$
declare
  v_en_id uuid;
begin
  select id into v_en_id from public.languages where code = 'en' limit 1;
  if v_en_id is null then
    raise notice 'English language row not found; skipping the vocab drill copy';
    return;
  end if;

  with cards as (
    select
      c.*,
      d.created_at as deck_created_at,
      regexp_replace(
        lower(trim(regexp_replace(c.word, '\s+', ' ', 'g'))),
        '^[^a-z0-9]+|[^a-z0-9]+$', '', 'g'
      ) as norm
    from public.vocab_drill_cards c
    join public.vocab_drill_decks d on d.id = c.deck_id
    where c.imported_at is null
      and exists (select 1 from auth.users au where au.id = c.user_id)
  ),
  engaged as (
    select distinct user_id
    from cards
    where last_review is not null
       or repetitions > 0
       or created_at > deck_created_at + interval '1 minute'
  ),
  chosen as (
    select
      cards.*,
      (cards.last_review is not null or cards.repetitions > 0) as reviewed,
      row_number() over (
        partition by cards.user_id, (cards.last_review is not null or cards.repetitions > 0)
        order by cards.created_at, cards.word
      ) - 1 as new_index
    from cards
    join engaged e on e.user_id = cards.user_id
    where length(cards.norm) > 0
  ),
  deduped as (
    select distinct on (user_id, norm) *
    from chosen
    order by user_id, norm, reviewed desc, last_review desc nulls last
  )
  insert into public.user_vocabulary_notebook_entries (
    user_id, language_id, word, normalized_word, source_type, source_label,
    leitner_box, next_review_at, last_reviewed_at, review_count, correct_count, incorrect_count, metadata
  )
  select
    x.user_id,
    v_en_id,
    left(trim(x.word), 200),
    x.norm,
    'vocab-drill',
    'IELTS Academic Word List',
    case
      when not x.reviewed then 1
      when greatest(1, x.interval) < 2 then 1
      when x.interval < 4 then 2
      when x.interval < 8 then 3
      when x.interval < 16 then 4
      else 5
    end,
    case
      when x.reviewed then x.next_review::timestamptz
      else now() + make_interval(days => (x.new_index / 20)::int)
    end,
    case when x.reviewed then coalesce(x.last_review::timestamptz, now()) else null end,
    case when x.reviewed then greatest(0, x.repetitions) else 0 end,
    case when x.reviewed then greatest(0, x.repetitions) else 0 end,
    0,
    jsonb_strip_nulls(jsonb_build_object(
      'definition', nullif(trim(x.definition), ''),
      'example', nullif(trim(coalesce(x.example, '')), ''),
      'imported_from', 'vocab_drill',
      'srs', case when x.reviewed then jsonb_build_object(
        's', greatest(1, x.interval)::numeric,
        'd', round(least(10, greatest(1, 1 + ((3 - least(3, greatest(1.3, x.ease_factor))) / 1.7) * 9))::numeric, 4),
        'reps', greatest(0, x.repetitions),
        'lapses', 0,
        'last', to_char(coalesce(x.last_review::timestamptz, now()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      ) end
    ))
  from deduped x
  on conflict (user_id, language_id, normalized_word) do nothing;

  update public.vocab_drill_cards
  set imported_at = now()
  where imported_at is null;
end
$$;
