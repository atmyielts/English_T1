-- English Grammar library, level C2: 2 units x 6 drills (4 fill + 2 error_correction).
-- Idempotent: units/drills/registry rows are upserted; drills use sort_order fill 10-40, error_correction 50-60.
-- Existing seed drills at error_correction/20 are moved to slot 50 (keeps their ids); any other published
-- drill on these units outside the six slots is archived.

do $$
declare
  v_en_id uuid;
  v_grammar_product_id uuid;
begin
  select id into v_en_id
  from public.languages
  where code = 'en'
  limit 1;

  select p.id into v_grammar_product_id
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) = 'english-grammar'
  order by p.created_at asc
  limit 1;

  if v_en_id is null then
    raise exception 'English language row not found; seed languages first';
  end if;

  if v_grammar_product_id is null then
    raise exception 'english-grammar product not found; seed product first';
  end if;

  insert into public.grammar_units (
    product_id,
    language_id,
    slug,
    title,
    level,
    focus_area,
    explanation_text,
    contrast_text,
    common_error_pattern,
    examples_json,
    tags,
    status,
    sort_order,
    metadata
  )
  values
    (
      v_grammar_product_id, v_en_id, 'subjunctive-formal-structures',
      'The subjunctive and formal structures',
      'C2', 'subjunctive',
      'After verbs and phrases such as suggest, recommend, insist, demand, request and it is essential that, formal English uses the base form of the verb for every subject: The doctor recommended that he rest for a week. The negative is not + base form: We ask that guests not smoke. British English often uses should instead: …that he should rest. Note that suggest and recommend are not followed by an object + to-infinitive.',
      'Compare: She suggested me to take a break (wrong). She suggested that I take a break (formal). She suggested taking a break.',
      'Writing ''suggest someone to do'', or using -s or will after these verbs in formal writing (It is essential that he will attend).',
      jsonb_build_array(
        jsonb_build_object('bad', 'The teacher suggested me to read more.', 'good', 'The teacher suggested that I read more.'),
        jsonb_build_object('bad', 'The committee demanded that the report is rewritten.', 'good', 'The committee demanded that the report be rewritten.'),
        jsonb_build_object('bad', 'I recommend you to book early.', 'good', 'I recommend that you book early.')
      ),
      array['subjunctive', 'formal register']::text[],
      'published', 610,
      jsonb_build_object('seeded_by', '20261022166000_english_grammar_library_c2')
    ),
    (
      v_grammar_product_id, v_en_id, 'hedging-and-ellipsis',
      'Hedging and ellipsis',
      'C2', 'hedging',
      'Hedging makes a claim more careful, which is common in academic and professional writing: It would appear that…, This may suggest…, The results tend to show… Ellipsis means leaving out words that the reader can easily understand, so you don''t repeat them. Use an auxiliary verb, so, not or to in place of the repeated part: I haven''t finished, but she has. I hope not. I''d like to.',
      'Compare: This proves that the method works. These results would seem to suggest that the method may work.',
      'Repeating a whole clause instead of using an auxiliary, or saying ''I think yes'' and ''I hope no'' instead of ''I think so'' and ''I hope not''.',
      jsonb_build_array(
        jsonb_build_object('bad', 'Is the shop open today? I think yes.', 'good', 'Is the shop open today? I think so.'),
        jsonb_build_object('bad', 'I didn''t enjoy the film, but my sister enjoyed the film.', 'good', 'I didn''t enjoy the film, but my sister did.'),
        jsonb_build_object('bad', 'This study proves that all students learn better online.', 'good', 'This study suggests that some students may learn better online.')
      ),
      array['hedging', 'ellipsis', 'substitution', 'academic style']::text[],
      'published', 620,
      jsonb_build_object('seeded_by', '20261022166000_english_grammar_library_c2')
    )
  on conflict (product_id, language_id, slug) do update
  set
    title = excluded.title,
    level = excluded.level,
    focus_area = excluded.focus_area,
    explanation_text = excluded.explanation_text,
    contrast_text = excluded.contrast_text,
    common_error_pattern = excluded.common_error_pattern,
    examples_json = excluded.examples_json,
    tags = excluded.tags,
    status = excluded.status,
    sort_order = excluded.sort_order,
    metadata = coalesce(public.grammar_units.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

  -- Older seeds put the single correction drill at sort_order 20; move it after the fill drills.
  update public.grammar_drills d
  set sort_order = 50, updated_at = now()
  from public.grammar_units gu
  where d.grammar_unit_id = gu.id
    and gu.product_id = v_grammar_product_id
    and gu.language_id = v_en_id
    and gu.slug in ('subjunctive-formal-structures', 'hedging-and-ellipsis')
    and d.drill_type = 'error_correction'
    and d.sort_order = 20
    and not exists (
      select 1 from public.grammar_drills d2
      where d2.grammar_unit_id = d.grammar_unit_id
        and d2.drill_type = 'error_correction'
        and d2.sort_order = 50
    );

  insert into public.grammar_drills (
    grammar_unit_id,
    drill_type,
    title,
    instructions,
    prompt_text,
    expected_answer_json,
    target_skill_key,
    status,
    sort_order,
    metadata
  )
  select
    gu.id,
    payload.drill_type,
    payload.title,
    payload.instructions,
    payload.prompt_text,
    payload.expected_answer_json,
    payload.target_skill_key,
    'published',
    payload.sort_order,
    jsonb_build_object('seeded_by', '20261022166000_english_grammar_library_c2')
  from public.grammar_units gu
  join (
    values
      ('subjunctive-formal-structures', 'fill', 'Complete the sentence', 'Use the formal base form of the verb in brackets.',
        'The doctor recommended that she ___ more water. (drink)',
        jsonb_build_object('accepted_answers', jsonb_build_array('drink', 'should drink')),
        'grammar.subjunctive', 10),
      ('subjunctive-formal-structures', 'fill', 'Complete the sentence', 'Use the formal base form of the verb in brackets.',
        'It is essential that every applicant ___ the form before Friday. (complete)',
        jsonb_build_object('accepted_answers', jsonb_build_array('complete', 'should complete')),
        'grammar.subjunctive', 20),
      ('subjunctive-formal-structures', 'fill', 'Complete the sentence', 'Use the formal base form of the verb in brackets.',
        'The board insisted that the meeting ___ postponed. (be)',
        jsonb_build_object('accepted_answers', jsonb_build_array('be', 'should be')),
        'grammar.subjunctive', 30),
      ('subjunctive-formal-structures', 'fill', 'Complete the sentence', 'Type the missing word or words.',
        'We request that guests ___ smoke in the rooms. (not)',
        jsonb_build_object('accepted_answers', jsonb_build_array('not', 'should not', 'do not')),
        'grammar.subjunctive', 40),
      ('subjunctive-formal-structures', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'My tutor suggested me to apply for the scholarship.',
        jsonb_build_object('accepted_answers', jsonb_build_array('My tutor suggested that I apply for the scholarship.', 'My tutor suggested I apply for the scholarship.', 'My tutor suggested that I should apply for the scholarship.', 'My tutor suggested I should apply for the scholarship.', 'My tutor suggested applying for the scholarship.', 'My tutor suggested that I applied for the scholarship.')),
        'grammar.subjunctive', 50),
      ('subjunctive-formal-structures', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'The manager demanded that the error is corrected immediately.',
        jsonb_build_object('accepted_answers', jsonb_build_array('The manager demanded that the error be corrected immediately.', 'The manager demanded that the error should be corrected immediately.')),
        'grammar.subjunctive', 60),
      ('hedging-and-ellipsis', 'fill', 'Complete the sentence', 'Type the missing word.',
        'A: Is the exam on Monday? B: I believe ___.',
        jsonb_build_object('accepted_answers', jsonb_build_array('so')),
        'grammar.hedging', 10),
      ('hedging-and-ellipsis', 'fill', 'Complete the sentence', 'Type the missing word.',
        'A: Will the flight be delayed? B: I hope ___.',
        jsonb_build_object('accepted_answers', jsonb_build_array('not')),
        'grammar.hedging', 20),
      ('hedging-and-ellipsis', 'fill', 'Complete the sentence', 'Type one auxiliary verb.',
        'I haven''t read the report yet, but my manager ___.',
        jsonb_build_object('accepted_answers', jsonb_build_array('has')),
        'grammar.hedging', 30),
      ('hedging-and-ellipsis', 'fill', 'Complete the sentence', 'Use the words in brackets to make the claim more careful.',
        'It ___ that the problem is more complex than we thought. (would / appear)',
        jsonb_build_object('accepted_answers', jsonb_build_array('would appear')),
        'grammar.hedging', 40),
      ('hedging-and-ellipsis', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'She can speak Turkish and I can speak Turkish too.',
        jsonb_build_object('accepted_answers', jsonb_build_array('She can speak Turkish and so can I.', 'She can speak Turkish, and so can I.', 'She can speak Turkish and I can too.', 'She can speak Turkish, and I can too.', 'She can speak Turkish, and I can, too.')),
        'grammar.hedging', 50),
      ('hedging-and-ellipsis', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'When I asked if the shop was open, he said he thought yes.',
        jsonb_build_object('accepted_answers', jsonb_build_array('When I asked if the shop was open, he said he thought so.', 'When I asked whether the shop was open, he said he thought so.')),
        'grammar.hedging', 60)
  ) as payload(unit_slug, drill_type, title, instructions, prompt_text, expected_answer_json, target_skill_key, sort_order)
    on payload.unit_slug = gu.slug
  where gu.product_id = v_grammar_product_id
    and gu.language_id = v_en_id
  on conflict (grammar_unit_id, drill_type, sort_order) do update
  set
    title = excluded.title,
    instructions = excluded.instructions,
    prompt_text = excluded.prompt_text,
    expected_answer_json = excluded.expected_answer_json,
    target_skill_key = excluded.target_skill_key,
    status = excluded.status,
    metadata = coalesce(public.grammar_drills.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

  update public.grammar_drills d
  set status = 'archived', updated_at = now()
  from public.grammar_units gu
  where d.grammar_unit_id = gu.id
    and gu.product_id = v_grammar_product_id
    and gu.language_id = v_en_id
    and gu.slug in ('subjunctive-formal-structures', 'hedging-and-ellipsis')
    and d.status = 'published'
    and not (
      (d.drill_type = 'fill' and d.sort_order in (10, 20, 30, 40))
      or (d.drill_type = 'error_correction' and d.sort_order in (50, 60))
    );

  insert into public.learning_content_registry_items (
    product_id,
    language_id,
    service_key,
    content_type,
    source_table,
    source_record_id,
    source_ref,
    title,
    description,
    skill_key,
    subskill_keys,
    cefr_level,
    difficulty,
    estimated_minutes,
    learning_objective,
    tags,
    status,
    payload_json,
    metadata,
    created_by,
    updated_by
  )
  select
    gu.product_id,
    gu.language_id,
    'grammar',
    'grammar.unit',
    'grammar_units',
    gu.id,
    gu.slug,
    gu.title,
    left(gu.explanation_text, 900),
    'grammar',
    array['grammar.accuracy', 'grammar.' || gu.focus_area, 'grammar.transfer']::text[],
    gu.level,
    case gu.level
      when 'A1' then 0.20
      when 'A2' then 0.30
      when 'B1' then 0.45
      when 'B2' then 0.60
      when 'C1' then 0.75
      when 'C2' then 0.90
      else 0.50
    end,
    8,
    coalesce(gu.contrast_text, gu.explanation_text),
    coalesce(gu.tags, '{}'::text[]),
    'published',
    jsonb_build_object(
      'focus_area', gu.focus_area,
      'common_error_pattern', gu.common_error_pattern,
      'examples', gu.examples_json
    ),
    jsonb_build_object('seeded_by', '20261022166000_english_grammar_library_c2'),
    gu.created_by,
    gu.updated_by
  from public.grammar_units gu
  where gu.product_id = v_grammar_product_id
    and gu.language_id = v_en_id
    and gu.slug in ('subjunctive-formal-structures', 'hedging-and-ellipsis')
  on conflict (language_id, service_key, content_type, source_ref) do update
  set
    source_table = excluded.source_table,
    source_record_id = excluded.source_record_id,
    title = excluded.title,
    description = excluded.description,
    skill_key = excluded.skill_key,
    subskill_keys = excluded.subskill_keys,
    cefr_level = excluded.cefr_level,
    difficulty = excluded.difficulty,
    estimated_minutes = excluded.estimated_minutes,
    learning_objective = excluded.learning_objective,
    tags = excluded.tags,
    status = excluded.status,
    payload_json = excluded.payload_json,
    metadata = coalesce(public.learning_content_registry_items.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();
end
$$;
