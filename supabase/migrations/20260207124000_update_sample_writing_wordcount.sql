-- ============================================================================
-- UPDATE: SAMPLE WRITING TASK WORD COUNT
-- ============================================================================

update public.content_units
set data = coalesce(data, '{}'::jsonb)
  || jsonb_build_object('min_words', 150, 'show_word_count', true, 'rows', 14)
where id = '66666666-6666-6666-6666-666666666642';

