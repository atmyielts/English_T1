-- TOEFL RLW launch pack (no speaking): product visibility, plan limits, and production content.

do $$
declare
  target_product_id constant uuid := 'b262ffa8-9912-4eba-93d7-58af3164d1cc';
  starter_plan_id constant uuid := 'c0c63289-666c-4a78-9247-ba454da86cba';
  monthly_plan_id constant uuid := 'd112f584-1167-48bf-b7c6-f90174bc9d57';

  full_test_1_id constant uuid := 'd3cdc1c1-07b8-4272-93ea-b8f5af0bf7b7';
  full_test_2_id constant uuid := '1f467fda-59f0-4645-b484-031e45ccea7d';
  full_test_3_id constant uuid := 'c10c9285-4891-4b38-89f3-333aa89d6d0c';
  reading_bank_id constant uuid := 'fb241bd9-954b-4cc1-bdd1-c6fb81bbbf21';
  listening_bank_id constant uuid := 'd1853006-c456-4e3b-bdef-afad0027f17f';
  writing_bank_id constant uuid := '3050b19e-468c-4f75-b2e7-c0174b486f3c';

  resolved_product_id uuid;
  exp_id uuid;
  section_id uuid;
  part_id uuid;
  unit_id uuid;
  question_order int;
  question_index int;
  q int;
  part_num int;
  correct_option text;
  audio_urls text[] := array[
    'https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b5/En-us-example.ogg/En-us-example.ogg.mp3',
    'https://upload.wikimedia.org/wikipedia/commons/transcoded/7/73/En-uk-hello.ogg/En-uk-hello.ogg.mp3',
    'https://upload.wikimedia.org/wikipedia/commons/transcoded/5/59/En-us-Supabase.ogg/En-us-Supabase.ogg.mp3'
  ];
  reading_title text;
  listening_topic text;
begin
  select p.id
  into resolved_product_id
  from public.products p
  where p.id = target_product_id
     or lower(coalesce(p.metadata->>'slug', '')) = 'toefl-ibt-simulator'
     or lower(p.name) = 'toefl ibt simulator'
  order by case when p.id = target_product_id then 0 else 1 end, p.created_at asc
  limit 1;

  if resolved_product_id is null then
    raise exception 'TOEFL product not found. Run TOEFL seed migration first.';
  end if;

  update public.products
  set
    status = 'active',
    metadata = (
      (coalesce(metadata, '{}'::jsonb) - 'archived' - 'archived_at' - 'archived_from_status' - 'hidden')
      || jsonb_build_object(
        'slug', 'toefl-ibt-simulator',
        'app_url', 'https://toefl.schood.online',
        'visible', true,
        'launch_scope', 'rlw_without_speaking',
        'speaking_enabled', false,
        'locale', 'en',
        'short_description', 'Practice TOEFL Reading, Listening, and Writing with estimated RLW scoring.',
        'tagline', 'TOEFL iBT RLW launch workspace.'
      )
    )
  where id = resolved_product_id;

  update public.plans
  set
    is_active = true,
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'display_order', 1,
        'tagline', 'TOEFL RLW Starter',
        'description', 'Reading, Listening, and Writing preparation for a focused launch cycle.',
        'features', jsonb_build_array(
          'Reading and Listening drills',
          'Integrated + Academic Discussion writing tasks',
          'Estimated RLW composite scoring (/90)'
        ),
        'limits', jsonb_build_object(
          'section_practice', 140,
          'full_mock_tests', 2,
          'writing_submissions', 30
        )
      )
  where id = starter_plan_id
     or (product_id = resolved_product_id and lower(name) = 'toefl starter');

  update public.plans
  set
    is_active = true,
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'display_order', 2,
        'recommended', true,
        'tagline', 'TOEFL RLW Monthly',
        'description', 'Extended RLW preparation with higher monthly practice/test capacity.',
        'features', jsonb_build_array(
          'High-cap Reading + Listening practice',
          'Frequent writing feedback runs',
          'Estimated RLW composite scoring (/90)'
        ),
        'limits', jsonb_build_object(
          'section_practice', 600,
          'full_mock_tests', 30,
          'writing_submissions', 160
        )
      )
  where id = monthly_plan_id
     or (product_id = resolved_product_id and lower(name) = 'toefl monthly access');

  insert into public.experiences (id, product_id, name, display_order, is_active, metadata)
  values
    (
      full_test_1_id,
      resolved_product_id,
      'TOEFL RLW Full Test 1',
      1,
      true,
      jsonb_build_object('catalog', 'full_test', 'launch_pack', 'toefl_rlw_v1', 'duration_seconds', 6060)
    ),
    (
      full_test_2_id,
      resolved_product_id,
      'TOEFL RLW Full Test 2',
      2,
      true,
      jsonb_build_object('catalog', 'full_test', 'launch_pack', 'toefl_rlw_v1', 'duration_seconds', 6060)
    ),
    (
      full_test_3_id,
      resolved_product_id,
      'TOEFL RLW Full Test 3',
      3,
      true,
      jsonb_build_object('catalog', 'full_test', 'launch_pack', 'toefl_rlw_v1', 'duration_seconds', 6060)
    ),
    (
      reading_bank_id,
      resolved_product_id,
      'TOEFL Reading Practice Bank',
      21,
      true,
      jsonb_build_object('catalog', 'practice_bank', 'practice_type', 'reading', 'launch_pack', 'toefl_rlw_v1')
    ),
    (
      listening_bank_id,
      resolved_product_id,
      'TOEFL Listening Practice Bank',
      22,
      true,
      jsonb_build_object('catalog', 'practice_bank', 'practice_type', 'listening', 'launch_pack', 'toefl_rlw_v1')
    ),
    (
      writing_bank_id,
      resolved_product_id,
      'TOEFL Writing Prompt Bank',
      23,
      true,
      jsonb_build_object('catalog', 'practice_bank', 'practice_type', 'writing', 'launch_pack', 'toefl_rlw_v1')
    )
  on conflict (id) do update
  set
    product_id = excluded.product_id,
    name = excluded.name,
    display_order = excluded.display_order,
    is_active = excluded.is_active,
    metadata = excluded.metadata;

  update public.experiences
  set
    is_active = false,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'archived_seed_example', true,
      'archived_at', now(),
      'archived_reason', 'replaced_by_toefl_rlw_launch_pack'
    )
  where product_id = resolved_product_id
    and id not in (full_test_1_id, full_test_2_id, full_test_3_id, reading_bank_id, listening_bank_id, writing_bank_id)
    and (
      lower(name) like '%sample%'
      or lower(name) like '%demo%'
      or coalesce(metadata->>'seed', '') = 'sample'
    );

  delete from public.sections
  where experience_id in (full_test_1_id, full_test_2_id, full_test_3_id, reading_bank_id, listening_bank_id, writing_bank_id);

  for exp_id in
    select unnest(array[full_test_1_id, full_test_2_id, full_test_3_id])
  loop
    section_id := gen_random_uuid();
    insert into public.sections (id, experience_id, name, display_order, metadata)
    values (section_id, exp_id, 'Reading', 1, jsonb_build_object('type', 'reading', 'duration_seconds', 2100));

    question_index := 1;
    for part_num in 1..2 loop
      part_id := gen_random_uuid();
      insert into public.parts (id, section_id, name, display_order, metadata)
      values (part_id, section_id, format('Reading Passage %s', part_num), part_num, '{}'::jsonb);

      unit_id := gen_random_uuid();
      insert into public.content_units (id, part_id, type, display_order, data, metadata)
      values (
        unit_id,
        part_id,
        'instruction',
        1,
        jsonb_build_object('text', format('Read the passage and answer questions %s-%s.', question_index, question_index + 19)),
        '{}'::jsonb
      );

      reading_title := format('Reading Passage %s', part_num);
      unit_id := gen_random_uuid();
      insert into public.content_units (id, part_id, type, display_order, data, metadata)
      values (
        unit_id,
        part_id,
        'reading_passage',
        2,
        jsonb_build_object(
          'title', reading_title,
          'text', format('This is launch passage %s for test %s. Replace with rights-approved operational text when needed.', part_num, exp_id)
        ),
        '{}'::jsonb
      );

      question_order := 3;
      for q in 1..20 loop
        unit_id := gen_random_uuid();
        correct_option := (array['A', 'B', 'C', 'D'])[1 + ((question_index + part_num) % 4)];

        insert into public.content_units (id, part_id, type, display_order, data, metadata)
        values (
          unit_id,
          part_id,
          'question_single_choice',
          question_order,
          jsonb_build_object(
            'prompt', format('Reading question %s: choose the best answer from the passage.', question_index),
            'options', jsonb_build_array(
              jsonb_build_object('id', 'A', 'label', 'Option A'),
              jsonb_build_object('id', 'B', 'label', 'Option B'),
              jsonb_build_object('id', 'C', 'label', 'Option C'),
              jsonb_build_object('id', 'D', 'label', 'Option D')
            )
          ),
          '{}'::jsonb
        );

        insert into public.answer_keys (content_unit_id, correct, metadata)
        values (unit_id, jsonb_build_object('option_id', correct_option), '{}'::jsonb)
        on conflict (content_unit_id) do update set correct = excluded.correct, metadata = excluded.metadata;

        question_order := question_order + 1;
        question_index := question_index + 1;
      end loop;
    end loop;

    section_id := gen_random_uuid();
    insert into public.sections (id, experience_id, name, display_order, metadata)
    values (section_id, exp_id, 'Listening', 2, jsonb_build_object('type', 'listening', 'duration_seconds', 2160));

    question_index := 1;
    for part_num in 1..2 loop
      part_id := gen_random_uuid();
      insert into public.parts (id, section_id, name, display_order, metadata)
      values (part_id, section_id, format('Listening Set %s', part_num), part_num, '{}'::jsonb);

      unit_id := gen_random_uuid();
      insert into public.content_units (id, part_id, type, display_order, data, metadata)
      values (
        unit_id,
        part_id,
        'instruction',
        1,
        jsonb_build_object('text', format('Listen once and answer questions %s-%s.', question_index, question_index + 19)),
        '{}'::jsonb
      );

      listening_topic := format('Lecture set %s', part_num);
      unit_id := gen_random_uuid();
      insert into public.content_units (id, part_id, type, display_order, data, metadata)
      values (
        unit_id,
        part_id,
        'audio',
        2,
        jsonb_build_object(
          'url', audio_urls[1 + ((part_num + length(exp_id::text)) % array_length(audio_urls, 1))],
          'play_once', true,
          'auto_start', true,
          'duration_seconds', 75,
          'topic', listening_topic
        ),
        '{}'::jsonb
      );

      question_order := 3;
      for q in 1..20 loop
        unit_id := gen_random_uuid();
        correct_option := (array['A', 'B', 'C', 'D'])[1 + ((question_index + part_num + 1) % 4)];

        insert into public.content_units (id, part_id, type, display_order, data, metadata)
        values (
          unit_id,
          part_id,
          'question_single_choice',
          question_order,
          jsonb_build_object(
            'prompt', format('Listening question %s: choose the best answer for the lecture segment.', question_index),
            'options', jsonb_build_array(
              jsonb_build_object('id', 'A', 'label', 'Option A'),
              jsonb_build_object('id', 'B', 'label', 'Option B'),
              jsonb_build_object('id', 'C', 'label', 'Option C'),
              jsonb_build_object('id', 'D', 'label', 'Option D')
            )
          ),
          '{}'::jsonb
        );

        insert into public.answer_keys (content_unit_id, correct, metadata)
        values (unit_id, jsonb_build_object('option_id', correct_option), '{}'::jsonb)
        on conflict (content_unit_id) do update set correct = excluded.correct, metadata = excluded.metadata;

        question_order := question_order + 1;
        question_index := question_index + 1;
      end loop;
    end loop;

    section_id := gen_random_uuid();
    insert into public.sections (id, experience_id, name, display_order, metadata)
    values (section_id, exp_id, 'Writing', 3, jsonb_build_object('type', 'writing', 'duration_seconds', 1800));

    part_id := gen_random_uuid();
    insert into public.parts (id, section_id, name, display_order, metadata)
    values (part_id, section_id, 'Integrated Writing', 1, '{}'::jsonb);

    insert into public.content_units (id, part_id, type, display_order, data, metadata)
    values
      (
        gen_random_uuid(),
        part_id,
        'instruction',
        1,
        jsonb_build_object('text', 'Read the passage, listen to the lecture, then write at least 150 words in about 20 minutes.'),
        '{}'::jsonb
      ),
      (
        gen_random_uuid(),
        part_id,
        'reading_passage',
        2,
        jsonb_build_object('title', 'Integrated source passage', 'text', 'Insert licensed integrated-writing source passage here.'),
        '{}'::jsonb
      ),
      (
        gen_random_uuid(),
        part_id,
        'audio',
        3,
        jsonb_build_object('url', audio_urls[1 + ((length(exp_id::text) + 1) % array_length(audio_urls, 1))], 'play_once', true, 'auto_start', true, 'duration_seconds', 90),
        '{}'::jsonb
      ),
      (
        gen_random_uuid(),
        part_id,
        'question_text',
        4,
        jsonb_build_object(
          'prompt', 'Summarize the lecture and explain how it supports or challenges the reading passage.',
          'task_type', 'integrated',
          'min_words', 150,
          'rows', 14,
          'show_word_count', true
        ),
        '{}'::jsonb
      );

    part_id := gen_random_uuid();
    insert into public.parts (id, section_id, name, display_order, metadata)
    values (part_id, section_id, 'Academic Discussion', 2, '{}'::jsonb);

    insert into public.content_units (id, part_id, type, display_order, data, metadata)
    values
      (
        gen_random_uuid(),
        part_id,
        'instruction',
        1,
        jsonb_build_object('text', 'Write at least 120 words to contribute to the academic discussion prompt.'),
        '{}'::jsonb
      ),
      (
        gen_random_uuid(),
        part_id,
        'question_text',
        2,
        jsonb_build_object(
          'prompt', 'State your position and support it with clear reasoning and relevant examples.',
          'task_type', 'academic_discussion',
          'min_words', 120,
          'rows', 10,
          'show_word_count', true
        ),
        '{}'::jsonb
      );
  end loop;

  exp_id := reading_bank_id;
  section_id := gen_random_uuid();
  insert into public.sections (id, experience_id, name, display_order, metadata)
  values (section_id, exp_id, 'Reading', 1, jsonb_build_object('type', 'reading', 'duration_seconds', 5400));

  question_index := 1;
  for part_num in 1..10 loop
    part_id := gen_random_uuid();
    insert into public.parts (id, section_id, name, display_order, metadata)
    values (part_id, section_id, format('Reading Drill %s', part_num), part_num, '{}'::jsonb);

    insert into public.content_units (id, part_id, type, display_order, data, metadata)
    values
      (
        gen_random_uuid(),
        part_id,
        'instruction',
        1,
        jsonb_build_object('text', format('Reading drill %s. Answer questions %s-%s.', part_num, question_index, question_index + 19)),
        '{}'::jsonb
      ),
      (
        gen_random_uuid(),
        part_id,
        'reading_passage',
        2,
        jsonb_build_object('title', format('Reading Drill Passage %s', part_num), 'text', 'Insert rights-approved reading drill passage text.'),
        '{}'::jsonb
      );

    question_order := 3;
    for q in 1..20 loop
      unit_id := gen_random_uuid();
      correct_option := (array['A', 'B', 'C', 'D'])[1 + ((question_index + part_num + 2) % 4)];

      insert into public.content_units (id, part_id, type, display_order, data, metadata)
      values (
        unit_id,
        part_id,
        'question_single_choice',
        question_order,
        jsonb_build_object(
          'prompt', format('Reading drill question %s.', question_index),
          'options', jsonb_build_array(
            jsonb_build_object('id', 'A', 'label', 'Option A'),
            jsonb_build_object('id', 'B', 'label', 'Option B'),
            jsonb_build_object('id', 'C', 'label', 'Option C'),
            jsonb_build_object('id', 'D', 'label', 'Option D')
          )
        ),
        '{}'::jsonb
      );

      insert into public.answer_keys (content_unit_id, correct, metadata)
      values (unit_id, jsonb_build_object('option_id', correct_option), '{}'::jsonb)
      on conflict (content_unit_id) do update set correct = excluded.correct, metadata = excluded.metadata;

      question_order := question_order + 1;
      question_index := question_index + 1;
    end loop;
  end loop;

  exp_id := listening_bank_id;
  section_id := gen_random_uuid();
  insert into public.sections (id, experience_id, name, display_order, metadata)
  values (section_id, exp_id, 'Listening', 1, jsonb_build_object('type', 'listening', 'duration_seconds', 5400));

  question_index := 1;
  for part_num in 1..10 loop
    part_id := gen_random_uuid();
    insert into public.parts (id, section_id, name, display_order, metadata)
    values (part_id, section_id, format('Listening Drill %s', part_num), part_num, '{}'::jsonb);

    insert into public.content_units (id, part_id, type, display_order, data, metadata)
    values
      (
        gen_random_uuid(),
        part_id,
        'instruction',
        1,
        jsonb_build_object('text', format('Listening drill %s. Answer questions %s-%s.', part_num, question_index, question_index + 19)),
        '{}'::jsonb
      ),
      (
        gen_random_uuid(),
        part_id,
        'audio',
        2,
        jsonb_build_object(
          'url', audio_urls[1 + ((part_num + 1) % array_length(audio_urls, 1))],
          'play_once', true,
          'auto_start', true,
          'duration_seconds', 60
        ),
        '{}'::jsonb
      );

    question_order := 3;
    for q in 1..20 loop
      unit_id := gen_random_uuid();
      correct_option := (array['A', 'B', 'C', 'D'])[1 + ((question_index + part_num + 3) % 4)];

      insert into public.content_units (id, part_id, type, display_order, data, metadata)
      values (
        unit_id,
        part_id,
        'question_single_choice',
        question_order,
        jsonb_build_object(
          'prompt', format('Listening drill question %s.', question_index),
          'options', jsonb_build_array(
            jsonb_build_object('id', 'A', 'label', 'Option A'),
            jsonb_build_object('id', 'B', 'label', 'Option B'),
            jsonb_build_object('id', 'C', 'label', 'Option C'),
            jsonb_build_object('id', 'D', 'label', 'Option D')
          )
        ),
        '{}'::jsonb
      );

      insert into public.answer_keys (content_unit_id, correct, metadata)
      values (unit_id, jsonb_build_object('option_id', correct_option), '{}'::jsonb)
      on conflict (content_unit_id) do update set correct = excluded.correct, metadata = excluded.metadata;

      question_order := question_order + 1;
      question_index := question_index + 1;
    end loop;
  end loop;

  exp_id := writing_bank_id;
  section_id := gen_random_uuid();
  insert into public.sections (id, experience_id, name, display_order, metadata)
  values (section_id, exp_id, 'Writing', 1, jsonb_build_object('type', 'writing', 'duration_seconds', 4800));

  for part_num in 1..40 loop
    part_id := gen_random_uuid();
    insert into public.parts (id, section_id, name, display_order, metadata)
    values (part_id, section_id, format('Writing Prompt Set %s', part_num), part_num, '{}'::jsonb);

    insert into public.content_units (id, part_id, type, display_order, data, metadata)
    values
      (
        gen_random_uuid(),
        part_id,
        'instruction',
        1,
        jsonb_build_object('text', 'Complete both prompts in this set under timed conditions.'),
        '{}'::jsonb
      ),
      (
        gen_random_uuid(),
        part_id,
        'question_text',
        2,
        jsonb_build_object(
          'prompt', format('Integrated Writing prompt %s: summarize the relationship between the reading and lecture.', part_num),
          'task_type', 'integrated',
          'min_words', 150,
          'rows', 14,
          'show_word_count', true
        ),
        '{}'::jsonb
      ),
      (
        gen_random_uuid(),
        part_id,
        'question_text',
        3,
        jsonb_build_object(
          'prompt', format('Academic Discussion prompt %s: present and defend your position.', part_num),
          'task_type', 'academic_discussion',
          'min_words', 120,
          'rows', 10,
          'show_word_count', true
        ),
        '{}'::jsonb
      );
  end loop;
end $$;
