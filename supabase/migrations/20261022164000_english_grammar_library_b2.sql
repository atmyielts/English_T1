-- English Grammar library, level B2: 6 units x 6 drills (4 fill + 2 error_correction).
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
      v_grammar_product_id, v_en_id, 'past-perfect',
      'Past perfect: what happened earlier',
      'B2', 'past-perfect',
      'Use the past perfect (had + past participle) to show that one past action happened before another past action: When we arrived, the film had already started. It is common with already, just, never, before and by the time. If ''before'' or ''after'' already makes the order clear, the past simple is also fine.',
      'Compare: When I got to the platform, the train left (I saw it leave). When I got to the platform, the train had left (it was already gone).',
      'Using the past simple when the earlier action needs to be clear, especially after ''by the time'' and ''already''.',
      jsonb_build_array(
        jsonb_build_object('bad', 'When I arrived at the party, everyone already went home.', 'good', 'When I arrived at the party, everyone had already gone home.'),
        jsonb_build_object('bad', 'I was nervous because I never flew before.', 'good', 'I was nervous because I had never flown before.'),
        jsonb_build_object('bad', 'By the time the doctor came, my temperature already went down.', 'good', 'By the time the doctor came, my temperature had already gone down.')
      ),
      array['past perfect', 'narrative tenses']::text[],
      'published', 410,
      jsonb_build_object('seeded_by', '20261022164000_english_grammar_library_b2')
    ),
    (
      v_grammar_product_id, v_en_id, 'passive-voice',
      'The passive voice',
      'B2', 'passive',
      'Use the passive (be + past participle) when the action is more important than the person who does it, or when we don''t know who did it: The bridge was built last year. Change be to show the tense: is made, was made, has been made, will be made. Add by + person only if this information is useful.',
      'Compare: Workers built the bridge last year (active). The bridge was built last year (passive).',
      'Forgetting the verb be (The carpet made by hand) or using the -ing form instead of the past participle.',
      jsonb_build_array(
        jsonb_build_object('bad', 'This carpet made by hand.', 'good', 'This carpet was made by hand.'),
        jsonb_build_object('bad', 'The results will announce tomorrow.', 'good', 'The results will be announced tomorrow.'),
        jsonb_build_object('bad', 'English is speaking in many countries.', 'good', 'English is spoken in many countries.')
      ),
      array['passive', 'be + past participle']::text[],
      'published', 420,
      jsonb_build_object('seeded_by', '20261022164000_english_grammar_library_b2')
    ),
    (
      v_grammar_product_id, v_en_id, 'reported-speech',
      'Reported speech',
      'B2', 'reported-speech',
      'When we report what someone said, we usually move the tense one step back: ''I am tired.'' → She said (that) she was tired. Pronouns and time words change too: ''I''ll call you tomorrow.'' → He said he would call me the next day. In reported questions, use normal word order, and if or whether for yes/no questions: She asked where I lived.',
      'Compare: ''I live in Bukhara,'' he said. He said that he lived in Bukhara.',
      'Keeping question word order in reported questions (She asked where did I live) or saying ''said me'' instead of ''told me''.',
      jsonb_build_array(
        jsonb_build_object('bad', 'She said me that she was busy.', 'good', 'She told me that she was busy.'),
        jsonb_build_object('bad', 'He asked me where did I work.', 'good', 'He asked me where I worked.'),
        jsonb_build_object('bad', 'They asked if I can help them.', 'good', 'They asked if I could help them.')
      ),
      array['reported speech', 'backshift']::text[],
      'published', 430,
      jsonb_build_object('seeded_by', '20261022164000_english_grammar_library_b2')
    ),
    (
      v_grammar_product_id, v_en_id, 'third-and-mixed-conditionals',
      'Third and mixed conditionals',
      'B2', 'conditionals-past',
      'Use the third conditional to imagine a different past: If I had left earlier, I would have caught the bus (but I didn''t leave earlier). The form is if + had + past participle, then would have + past participle. A mixed conditional joins an unreal past with a present result: If I had studied medicine, I would be a doctor now.',
      'Compare: If I had saved money, I would have bought the flat (a past result). If I had saved money, I would be richer now (a present result).',
      'Using would have in the if part (If I would have known…) or the past simple instead of had + past participle.',
      jsonb_build_array(
        jsonb_build_object('bad', 'If I would have known about the party, I would have come.', 'good', 'If I had known about the party, I would have come.'),
        jsonb_build_object('bad', 'If she studied harder last year, she would have passed.', 'good', 'If she had studied harder last year, she would have passed.'),
        jsonb_build_object('bad', 'If we had taken a taxi, we would arrive on time.', 'good', 'If we had taken a taxi, we would have arrived on time.')
      ),
      array['conditionals', 'third conditional', 'mixed conditional']::text[],
      'published', 440,
      jsonb_build_object('seeded_by', '20261022164000_english_grammar_library_b2')
    ),
    (
      v_grammar_product_id, v_en_id, 'modals-of-deduction',
      'Must, might, can''t for guessing',
      'B2', 'modals-deduction',
      'Use must when you are almost sure something is true, might or could when it is possible, and can''t when you are almost sure it is not true: He must be at work. For the past, add have + past participle: She must have missed the bus. They can''t have seen us. Don''t use mustn''t for this meaning.',
      'Compare: The lights are off, so they must be asleep. The lights were off, so they must have been asleep.',
      'Using mustn''t instead of can''t for a negative guess, or forgetting have when the guess is about the past.',
      jsonb_build_array(
        jsonb_build_object('bad', 'He mustn''t be at home. His car isn''t here.', 'good', 'He can''t be at home. His car isn''t here.'),
        jsonb_build_object('bad', 'She must forget about the meeting yesterday.', 'good', 'She must have forgotten about the meeting yesterday.'),
        jsonb_build_object('bad', 'They can''t saw us. It was too dark.', 'good', 'They can''t have seen us. It was too dark.')
      ),
      array['modals', 'deduction', 'speculation']::text[],
      'published', 450,
      jsonb_build_object('seeded_by', '20261022164000_english_grammar_library_b2')
    ),
    (
      v_grammar_product_id, v_en_id, 'linking-contrast',
      'Contrast: although, despite, however',
      'B2', 'linkers',
      'Although and even though are followed by a full clause (subject + verb): Although it was cold, we went out. Despite and in spite of are followed by a noun or an -ing form: Despite the cold, we went out. However usually starts a new sentence and is followed by a comma: It was cold. However, we went out. Don''t use although and but together.',
      'Compare: Although it rained, we played. Despite the rain, we played. It rained. However, we played.',
      'Using despite before a full clause (despite it was raining) or using although and but in the same sentence.',
      jsonb_build_array(
        jsonb_build_object('bad', 'Despite it was late, she kept working.', 'good', 'Although it was late, she kept working.'),
        jsonb_build_object('bad', 'Although he was tired, but he finished the work.', 'good', 'Although he was tired, he finished the work.'),
        jsonb_build_object('bad', 'In spite of feel ill, he went to school.', 'good', 'In spite of feeling ill, he went to school.')
      ),
      array['linking words', 'contrast', 'although', 'despite']::text[],
      'published', 460,
      jsonb_build_object('seeded_by', '20261022164000_english_grammar_library_b2')
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
    and gu.slug in ('past-perfect', 'passive-voice', 'reported-speech', 'third-and-mixed-conditionals', 'modals-of-deduction', 'linking-contrast')
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
    jsonb_build_object('seeded_by', '20261022164000_english_grammar_library_b2')
  from public.grammar_units gu
  join (
    values
      ('past-perfect', 'fill', 'Complete the sentence', 'Use the past perfect with the words in brackets.',
        'When we got to the cinema, the film ___. (already / start)',
        jsonb_build_object('accepted_answers', jsonb_build_array('had already started')),
        'grammar.past-perfect', 10),
      ('past-perfect', 'fill', 'Complete the sentence', 'Write the verb in brackets in the past perfect.',
        'She couldn''t pay because she ___ her wallet at home. (leave)',
        jsonb_build_object('accepted_answers', jsonb_build_array('had left', '''d left')),
        'grammar.past-perfect', 20),
      ('past-perfect', 'fill', 'Complete the sentence', 'Use the past perfect with the words in brackets.',
        'I ___ such a beautiful place before I visited the Fergana Valley. (never / see)',
        jsonb_build_object('accepted_answers', jsonb_build_array('had never seen', '''d never seen')),
        'grammar.past-perfect', 30),
      ('past-perfect', 'fill', 'Complete the sentence', 'Write the verb in brackets in the past perfect.',
        'By the time the guests arrived, my mother ___ dinner. (cook)',
        jsonb_build_object('accepted_answers', jsonb_build_array('had cooked', 'had already cooked', '''d cooked')),
        'grammar.past-perfect', 40),
      ('past-perfect', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'When I checked my phone, I saw that my brother called three times.',
        jsonb_build_object('accepted_answers', jsonb_build_array('When I checked my phone, I saw that my brother had called three times.', 'When I checked my phone, I saw my brother had called three times.')),
        'grammar.past-perfect', 50),
      ('past-perfect', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'The shop already closed when we got there.',
        jsonb_build_object('accepted_answers', jsonb_build_array('The shop had already closed when we got there.')),
        'grammar.past-perfect', 60),
      ('passive-voice', 'fill', 'Complete the sentence', 'Write the verb in brackets in the present simple passive.',
        'Cotton ___ in many parts of Uzbekistan. (grow)',
        jsonb_build_object('accepted_answers', jsonb_build_array('is grown')),
        'grammar.passive', 10),
      ('passive-voice', 'fill', 'Complete the sentence', 'Write the verb in brackets in the past simple passive.',
        'The new metro station ___ last year. (build)',
        jsonb_build_object('accepted_answers', jsonb_build_array('was built')),
        'grammar.passive', 20),
      ('passive-voice', 'fill', 'Complete the sentence', 'Write the verb in brackets in the future passive.',
        'Your order ___ tomorrow morning. (deliver)',
        jsonb_build_object('accepted_answers', jsonb_build_array('will be delivered', 'is going to be delivered')),
        'grammar.passive', 30),
      ('passive-voice', 'fill', 'Complete the sentence', 'Write the verb in brackets in the passive with already.',
        'All the tickets for the concert ___. (already / sell)',
        jsonb_build_object('accepted_answers', jsonb_build_array('have already been sold', 'had already been sold', 'were already sold', 'are already sold')),
        'grammar.passive', 40),
      ('passive-voice', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'The letter was wrote by my grandfather in 1975.',
        jsonb_build_object('accepted_answers', jsonb_build_array('The letter was written by my grandfather in 1975.')),
        'grammar.passive', 50),
      ('passive-voice', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'The exam results will publish next week.',
        jsonb_build_object('accepted_answers', jsonb_build_array('The exam results will be published next week.')),
        'grammar.passive', 60),
      ('reported-speech', 'fill', 'Complete the sentence', 'Report the sentence. Type the missing word.',
        '''I am hungry.'' → Sardor said that he ___ hungry.',
        jsonb_build_object('accepted_answers', jsonb_build_array('was')),
        'grammar.reported-speech', 10),
      ('reported-speech', 'fill', 'Complete the sentence', 'Report the sentence. Use the verb in brackets.',
        '''We will finish the project.'' → They said they ___ the project. (finish)',
        jsonb_build_object('accepted_answers', jsonb_build_array('would finish')),
        'grammar.reported-speech', 20),
      ('reported-speech', 'fill', 'Complete the sentence', 'Report the question. Use the verb in brackets.',
        '''Where do you work?'' → She asked me where I ___. (work)',
        jsonb_build_object('accepted_answers', jsonb_build_array('worked')),
        'grammar.reported-speech', 30),
      ('reported-speech', 'fill', 'Complete the sentence', 'Report the question. Type the missing word.',
        '''Do you like jazz?'' → He asked me ___ I liked jazz.',
        jsonb_build_object('accepted_answers', jsonb_build_array('if', 'whether')),
        'grammar.reported-speech', 40),
      ('reported-speech', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'My friend said me that the shop was closed.',
        jsonb_build_object('accepted_answers', jsonb_build_array('My friend told me that the shop was closed.', 'My friend told me the shop was closed.', 'My friend said that the shop was closed.', 'My friend said the shop was closed.', 'My friend said to me that the shop was closed.')),
        'grammar.reported-speech', 50),
      ('reported-speech', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'The officer asked me what was my name.',
        jsonb_build_object('accepted_answers', jsonb_build_array('The officer asked me what my name was.')),
        'grammar.reported-speech', 60),
      ('third-and-mixed-conditionals', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'If you ___ me, I would have helped you. (ask)',
        jsonb_build_object('accepted_answers', jsonb_build_array('had asked', '''d asked')),
        'grammar.conditionals-past', 10),
      ('third-and-mixed-conditionals', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'If it hadn''t rained, we ___ a picnic. (have)',
        jsonb_build_object('accepted_answers', jsonb_build_array('would have had', '''d have had', 'could have had')),
        'grammar.conditionals-past', 20),
      ('third-and-mixed-conditionals', 'fill', 'Complete the sentence', 'Write the verb in brackets. Think about the result now.',
        'If I had taken that job in Dubai, I ___ there now. (live)',
        jsonb_build_object('accepted_answers', jsonb_build_array('would be living', 'would live', '''d be living', '''d live')),
        'grammar.conditionals-past', 30),
      ('third-and-mixed-conditionals', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'We would have missed the flight if the taxi ___ late. (be)',
        jsonb_build_object('accepted_answers', jsonb_build_array('had been', '''d been')),
        'grammar.conditionals-past', 40),
      ('third-and-mixed-conditionals', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'If I would have seen you, I would have said hello.',
        jsonb_build_object('accepted_answers', jsonb_build_array('If I had seen you, I would have said hello.', 'If I''d seen you, I would have said hello.', 'If I had seen you, I''d have said hello.', 'If I''d seen you, I''d have said hello.')),
        'grammar.conditionals-past', 50),
      ('third-and-mixed-conditionals', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'If he had listened to the teacher, he would understand the lesson yesterday.',
        jsonb_build_object('accepted_answers', jsonb_build_array('If he had listened to the teacher, he would have understood the lesson yesterday.')),
        'grammar.conditionals-past', 60),
      ('modals-of-deduction', 'fill', 'Complete the sentence', 'Type must, might or can''t.',
        'Aziza has worked all day without a break. She ___ be very tired.',
        jsonb_build_object('accepted_answers', jsonb_build_array('must')),
        'grammar.modals-deduction', 10),
      ('modals-of-deduction', 'fill', 'Complete the sentence', 'Type must, might or can''t.',
        'That ___ be Rustam at the door. He''s in London this week.',
        jsonb_build_object('accepted_answers', jsonb_build_array('can''t', 'cannot', 'couldn''t')),
        'grammar.modals-deduction', 20),
      ('modals-of-deduction', 'fill', 'Complete the sentence', 'Use the modal in brackets with have.',
        'I can''t find my keys. I ___ left them at the office. (might)',
        jsonb_build_object('accepted_answers', jsonb_build_array('might have', 'may have', 'could have')),
        'grammar.modals-deduction', 30),
      ('modals-of-deduction', 'fill', 'Complete the sentence', 'Use the words in brackets.',
        'The streets are wet. It ___ during the night. (must / rain)',
        jsonb_build_object('accepted_answers', jsonb_build_array('must have rained')),
        'grammar.modals-deduction', 40),
      ('modals-of-deduction', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'He mustn''t be the new manager. He looks too young.',
        jsonb_build_object('accepted_answers', jsonb_build_array('He can''t be the new manager. He looks too young.', 'He cannot be the new manager. He looks too young.', 'He couldn''t be the new manager. He looks too young.')),
        'grammar.modals-deduction', 50),
      ('modals-of-deduction', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'You must leave your umbrella on the bus yesterday.',
        jsonb_build_object('accepted_answers', jsonb_build_array('You must have left your umbrella on the bus yesterday.')),
        'grammar.modals-deduction', 60),
      ('linking-contrast', 'fill', 'Complete the sentence', 'Type although, despite or however.',
        '___ the traffic, we arrived on time.',
        jsonb_build_object('accepted_answers', jsonb_build_array('Despite', 'In spite of')),
        'grammar.linkers', 10),
      ('linking-contrast', 'fill', 'Complete the sentence', 'Type although, despite or however.',
        '___ she had little time, she helped me with my CV.',
        jsonb_build_object('accepted_answers', jsonb_build_array('Although', 'Even though', 'Though')),
        'grammar.linkers', 20),
      ('linking-contrast', 'fill', 'Complete the sentence', 'Type although, despite or however.',
        'The course was expensive. ___, it was very useful.',
        jsonb_build_object('accepted_answers', jsonb_build_array('However', 'Nevertheless', 'Even so', 'Still')),
        'grammar.linkers', 30),
      ('linking-contrast', 'fill', 'Complete the sentence', 'Type the missing word.',
        'In spite ___ his injury, he played the whole match.',
        jsonb_build_object('accepted_answers', jsonb_build_array('of')),
        'grammar.linkers', 40),
      ('linking-contrast', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'Despite he studied hard, he failed the test.',
        jsonb_build_object('accepted_answers', jsonb_build_array('Although he studied hard, he failed the test.', 'Even though he studied hard, he failed the test.', 'Though he studied hard, he failed the test.', 'Despite studying hard, he failed the test.', 'Despite the fact that he studied hard, he failed the test.', 'In spite of studying hard, he failed the test.', 'In spite of the fact that he studied hard, he failed the test.')),
        'grammar.linkers', 50),
      ('linking-contrast', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'Although the hotel was old, but the rooms were clean.',
        jsonb_build_object('accepted_answers', jsonb_build_array('Although the hotel was old, the rooms were clean.', 'Even though the hotel was old, the rooms were clean.', 'The hotel was old, but the rooms were clean.')),
        'grammar.linkers', 60)
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
    and gu.slug in ('past-perfect', 'passive-voice', 'reported-speech', 'third-and-mixed-conditionals', 'modals-of-deduction', 'linking-contrast')
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
    jsonb_build_object('seeded_by', '20261022164000_english_grammar_library_b2'),
    gu.created_by,
    gu.updated_by
  from public.grammar_units gu
  where gu.product_id = v_grammar_product_id
    and gu.language_id = v_en_id
    and gu.slug in ('past-perfect', 'passive-voice', 'reported-speech', 'third-and-mixed-conditionals', 'modals-of-deduction', 'linking-contrast')
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
