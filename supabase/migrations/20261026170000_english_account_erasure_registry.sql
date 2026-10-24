-- Closing an account must erase the learner's Schood English records too.
-- The English tables added on 2026-10-24..26 key on user_id but were never
-- added to account_personal_erasure_tables(). Same additive pattern as
-- 20261010175000_ai_request_ledger.sql and 20261026150000_english_output_depth.sql:
-- keep the installed registry and append only what is missing and exists.
-- Each appended table also gets the closed-account guard trigger the
-- registry's installer gives its original tables.
-- Not personal (left out): english_word_glosses, english_daily_stories, english_league_groups,
-- english_service_settings, english_tg_checks (hashed chat ids only),
-- english_exam_papers, english_duels (players are erased),
-- english_classes / english_class_assignments (a teacher's class content),
-- english_writing_model_answers, english_tutor_lesson_cache.
-- english_progress_link_watchers rows go with their link (on delete cascade).

do $$
declare
  relations text[];
  wanted text[] := array[
    'learner_review_items',
    'learner_review_answer_log',
    'english_league_members',
    'learner_badges',
    'english_telegram_quiz_questions',
    'english_certificates',
    'english_ai_calls',
    'english_roleplay_sessions',
    'english_speaking_mocks',
    'english_exam_mocks',
    'english_duel_players',
    'english_progress_links',
    'english_weekly_report_log',
    'english_client_attempts',
    'english_class_members',
    'english_inbox',
    'english_resume_points',
    'english_daily_story_reads'
  ];
  relation_name text;
  guard_installed boolean := to_regprocedure('public.guard_closed_personal_record()') is not null;
begin
  if to_regprocedure('public.account_personal_erasure_tables()') is null then
    raise notice 'account_personal_erasure_tables() is not installed; erasure registry not extended';
    return;
  end if;
  relations := public.account_personal_erasure_tables();
  foreach relation_name in array wanted loop
    if to_regclass(format('public.%I', relation_name)) is null then
      continue;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = relation_name and column_name = 'user_id'
    ) then
      raise notice 'public.% has no user_id column; not added to the erasure registry', relation_name;
      continue;
    end if;
    if not (relation_name = any(relations)) then
      relations := relations || relation_name;
      if guard_installed then
        execute format('drop trigger if exists account_closed_personal_guard on public.%I', relation_name);
        execute format(
          'create trigger account_closed_personal_guard before insert or update on public.%I for each row execute function public.guard_closed_personal_record(%L)',
          relation_name, 'user_id'
        );
      end if;
    end if;
  end loop;
  execute format(
    'create or replace function public.account_personal_erasure_tables() returns text[] language sql immutable set search_path=pg_catalog,public as %L',
    format('select %L::text[];', relations::text)
  );
end
$$;
