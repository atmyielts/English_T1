-- SAT launch pack: plan-limit alignment, adaptive-ready full tests, and large practice banks.
-- Idempotent for repeated deploys.

do $$
declare
  sat_product_id constant uuid := '5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef';
  starter_plan_id constant uuid := '1d5b04c4-a795-4afc-bdfb-a94ebdc6f43f';
  monthly_plan_id constant uuid := 'f4f0d267-f056-4095-a258-fe6f1ec61f53';
  legacy_sample_experience_id constant uuid := '83e3b8b7-1dbc-4e4b-95ed-d4c98fd98f8e';

  full_experience_ids uuid[] := array[
    '1a6a13d8-82e1-4ddd-9fbe-5f744fe1d101'::uuid,
    '2b7b24e9-93f2-4eee-afcf-6f855fe2d202'::uuid,
    '3c8c35fa-a403-4fff-b0df-7f966fe3d303'::uuid
  ];
  full_experience_names text[] := array[
    'Digital SAT Practice Test 1',
    'Digital SAT Practice Test 2',
    'Digital SAT Practice Test 3'
  ];

  rw_m1_section_ids uuid[] := array[
    '7a110001-8d3f-4bf4-8c1c-111000000001'::uuid,
    '7a220001-8d3f-4bf4-8c1c-222000000001'::uuid,
    '7a330001-8d3f-4bf4-8c1c-333000000001'::uuid
  ];
  rw_m2_section_ids uuid[] := array[
    '7a110001-8d3f-4bf4-8c1c-111000000002'::uuid,
    '7a220001-8d3f-4bf4-8c1c-222000000002'::uuid,
    '7a330001-8d3f-4bf4-8c1c-333000000002'::uuid
  ];
  math_m1_section_ids uuid[] := array[
    '7a110001-8d3f-4bf4-8c1c-111000000003'::uuid,
    '7a220001-8d3f-4bf4-8c1c-222000000003'::uuid,
    '7a330001-8d3f-4bf4-8c1c-333000000003'::uuid
  ];
  math_m2_section_ids uuid[] := array[
    '7a110001-8d3f-4bf4-8c1c-111000000004'::uuid,
    '7a220001-8d3f-4bf4-8c1c-222000000004'::uuid,
    '7a330001-8d3f-4bf4-8c1c-333000000004'::uuid
  ];

  rw_m1_part_ids uuid[] := array[
    '7a110001-8d3f-4bf4-8c1c-111000001001'::uuid,
    '7a220001-8d3f-4bf4-8c1c-222000001001'::uuid,
    '7a330001-8d3f-4bf4-8c1c-333000001001'::uuid
  ];
  rw_m2_part_ids uuid[] := array[
    '7a110001-8d3f-4bf4-8c1c-111000001002'::uuid,
    '7a220001-8d3f-4bf4-8c1c-222000001002'::uuid,
    '7a330001-8d3f-4bf4-8c1c-333000001002'::uuid
  ];
  math_m1_part_ids uuid[] := array[
    '7a110001-8d3f-4bf4-8c1c-111000001003'::uuid,
    '7a220001-8d3f-4bf4-8c1c-222000001003'::uuid,
    '7a330001-8d3f-4bf4-8c1c-333000001003'::uuid
  ];
  math_m2_part_ids uuid[] := array[
    '7a110001-8d3f-4bf4-8c1c-111000001004'::uuid,
    '7a220001-8d3f-4bf4-8c1c-222000001004'::uuid,
    '7a330001-8d3f-4bf4-8c1c-333000001004'::uuid
  ];

  rw_bank_experience_id constant uuid := '4d9d460b-b514-4ace-91ef-80977fe4d404';
  math_bank_experience_id constant uuid := '5eae571c-c625-4bdf-a2ff-90a88fe5d505';
  rw_bank_section_id constant uuid := '7a440001-8d3f-4bf4-8c1c-444000000001';
  math_bank_section_id constant uuid := '7a550001-8d3f-4bf4-8c1c-555000000001';
  rw_bank_part_id constant uuid := '7a440001-8d3f-4bf4-8c1c-444000001001';
  math_bank_part_id constant uuid := '7a550001-8d3f-4bf4-8c1c-555000001001';

  idx integer;
  q integer;
  section_id uuid;
  unit_id uuid;
  correct_option text;
  tier text;
  a integer;
  b integer;
  c integer;
  x integer;
  rhs integer;
begin
  -- 1) Align plan promises with runtime enforcement limits.
  update public.plans
  set
    name = 'SAT Starter',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'display_order', 1,
      'tagline', 'Two-week SAT bootcamp',
      'description', 'Structured SAT drills with one full mock and review.',
      'features', jsonb_build_array(
        'Reading & Writing module practice',
        'Math module practice',
        'One full mock test flow',
        'Session review dashboard'
      ),
      'limits', jsonb_build_object(
        'section_practice', 80,
        'full_mock_tests', 1,
        'writing_submissions', 0
      )
    )
  where id = starter_plan_id
    and product_id = sat_product_id;

  update public.plans
  set
    name = 'SAT Monthly Access',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'display_order', 2,
      'recommended', true,
      'tagline', 'Best for score growth',
      'description', 'High-cap SAT drills, full mocks, and analytics.',
      'features', jsonb_build_array(
        'Up to 400 section-practice starts per month',
        'Up to 20 full mock starts per month',
        'Reading & Writing plus Math analytics',
        'Review dashboard and progress tracking'
      ),
      'limits', jsonb_build_object(
        'section_practice', 400,
        'full_mock_tests', 20,
        'writing_submissions', 0
      )
    )
  where id = monthly_plan_id
    and product_id = sat_product_id;

  -- 2) Archive legacy sample-only SAT experience from learner flows.
  update public.experiences
  set
    is_active = false,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'archived_seed_example', true,
      'archived_at', now(),
      'archived_reason', 'replaced_by_sat_launch_pack'
    )
  where id = legacy_sample_experience_id
    and product_id = sat_product_id;

  -- 3) Create three production-ready full tests with adaptive-ready module metadata.
  for idx in 1..3 loop
    insert into public.experiences (id, product_id, name, display_order, is_active, metadata)
    values (
      full_experience_ids[idx],
      sat_product_id,
      full_experience_names[idx],
      idx,
      true,
      jsonb_build_object(
        'format', 'digital_sat',
        'version', 2,
        'duration_seconds', 8040,
        'adaptive_path', jsonb_build_object(
          rw_m2_section_ids[idx]::text,
          jsonb_build_object('source_section_id', rw_m1_section_ids[idx]::text, 'threshold', 0.68, 'metric', 'accuracy'),
          math_m2_section_ids[idx]::text,
          jsonb_build_object('source_section_id', math_m1_section_ids[idx]::text, 'threshold', 0.70, 'metric', 'accuracy')
        )
      )
    )
    on conflict (id) do update
    set
      product_id = excluded.product_id,
      name = excluded.name,
      display_order = excluded.display_order,
      is_active = excluded.is_active,
      metadata = excluded.metadata;

    insert into public.sections (id, experience_id, name, display_order, metadata)
    values
      (
        rw_m1_section_ids[idx],
        full_experience_ids[idx],
        'Reading & Writing - Module 1',
        1,
        jsonb_build_object(
          'type', 'reading_writing',
          'duration_seconds', 1920,
          'module', 1,
          'score_domain', 'reading_writing',
          'default_next_section_id', rw_m2_section_ids[idx]::text
        )
      ),
      (
        rw_m2_section_ids[idx],
        full_experience_ids[idx],
        'Reading & Writing - Module 2',
        2,
        jsonb_build_object(
          'type', 'reading_writing',
          'duration_seconds', 1920,
          'module', 2,
          'score_domain', 'reading_writing',
          'adaptive_source_section_id', rw_m1_section_ids[idx]::text,
          'adaptive_threshold', 0.68,
          'default_next_section_id', math_m1_section_ids[idx]::text
        )
      ),
      (
        math_m1_section_ids[idx],
        full_experience_ids[idx],
        'Math - Module 1',
        3,
        jsonb_build_object(
          'type', 'math',
          'duration_seconds', 2100,
          'module', 1,
          'calculator_allowed', false,
          'score_domain', 'math',
          'default_next_section_id', math_m2_section_ids[idx]::text
        )
      ),
      (
        math_m2_section_ids[idx],
        full_experience_ids[idx],
        'Math - Module 2',
        4,
        jsonb_build_object(
          'type', 'math',
          'duration_seconds', 2100,
          'module', 2,
          'calculator_allowed', true,
          'score_domain', 'math',
          'adaptive_source_section_id', math_m1_section_ids[idx]::text,
          'adaptive_threshold', 0.70
        )
      )
    on conflict (id) do update
    set
      name = excluded.name,
      display_order = excluded.display_order,
      metadata = excluded.metadata;

    insert into public.parts (id, section_id, name, display_order, metadata)
    values
      (rw_m1_part_ids[idx], rw_m1_section_ids[idx], 'Module 1', 1, '{}'::jsonb),
      (rw_m2_part_ids[idx], rw_m2_section_ids[idx], 'Module 2', 1, '{}'::jsonb),
      (math_m1_part_ids[idx], math_m1_section_ids[idx], 'Module 1', 1, '{}'::jsonb),
      (math_m2_part_ids[idx], math_m2_section_ids[idx], 'Module 2', 1, '{}'::jsonb)
    on conflict (id) do update
    set
      section_id = excluded.section_id,
      name = excluded.name,
      display_order = excluded.display_order,
      metadata = excluded.metadata;

    delete from public.answer_keys
    where content_unit_id in (
      select id from public.content_units
      where part_id in (rw_m1_part_ids[idx], rw_m2_part_ids[idx], math_m1_part_ids[idx], math_m2_part_ids[idx])
    );

    delete from public.content_units
    where part_id in (rw_m1_part_ids[idx], rw_m2_part_ids[idx], math_m1_part_ids[idx], math_m2_part_ids[idx]);

    -- RW Module 1 (instruction + passage + 25 scored questions)
    insert into public.content_units (part_id, type, data, display_order, metadata)
    values (
      rw_m1_part_ids[idx],
      'instruction',
      jsonb_build_object('text', format('Reading & Writing Module 1 (Test %s). Read carefully and answer all questions.', idx)),
      1,
      '{}'::jsonb
    );

    insert into public.content_units (part_id, type, data, display_order, metadata)
    values (
      rw_m1_part_ids[idx],
      'reading_passage',
      jsonb_build_object(
        'title', format('Community Lab Report %s', idx),
        'text', format('A student team at Midtown High piloted a neighborhood lab report in Test %s. They collected observations every afternoon and compared those notes with traffic patterns, weather shifts, and class schedules. After refining their logging format, they reduced duplicate entries and improved consistency. The final report recommended shorter data windows, clearer labels, and weekly review meetings so future teams could make faster decisions.', idx)
      ),
      2,
      '{}'::jsonb
    );

    for q in 1..25 loop
      correct_option := (array['A', 'B', 'C', 'D'])[1 + ((q + idx) % 4)];

      insert into public.content_units (part_id, type, data, display_order, metadata)
      values (
        rw_m1_part_ids[idx],
        'question_single_choice',
        jsonb_build_object(
          'prompt', format('RW M1 Q%s (Test %s): Choose the best revision for clarity and precision.', q, idx),
          'options', jsonb_build_array(
            jsonb_build_object('id', 'A', 'label', format('Option A for item %s', q)),
            jsonb_build_object('id', 'B', 'label', format('Option B for item %s', q)),
            jsonb_build_object('id', 'C', 'label', format('Option C for item %s', q)),
            jsonb_build_object('id', 'D', 'label', format('Option D for item %s', q))
          )
        ),
        q + 2,
        jsonb_build_object('domain', 'reading_writing', 'module', 1, 'question_number', q)
      )
      returning id into unit_id;

      insert into public.answer_keys (content_unit_id, correct, metadata)
      values (unit_id, jsonb_build_object('option_id', correct_option), '{}'::jsonb)
      on conflict (content_unit_id) do update
      set
        correct = excluded.correct,
        metadata = excluded.metadata;
    end loop;

    -- RW Module 2 (instruction + passage + 50 tiered questions; 25 standard + 25 advanced)
    insert into public.content_units (part_id, type, data, display_order, metadata)
    values (
      rw_m2_part_ids[idx],
      'instruction',
      jsonb_build_object('text', format('Reading & Writing Module 2 (Test %s). Difficulty tier is selected from your Module 1 performance.', idx)),
      1,
      '{}'::jsonb
    );

    insert into public.content_units (part_id, type, data, display_order, metadata)
    values (
      rw_m2_part_ids[idx],
      'reading_passage',
      jsonb_build_object(
        'title', format('Adaptive Writing Brief %s', idx),
        'text', format('In Test %s, teams revised short writing samples under strict time limits. Students who tracked sentence-level edits improved readability faster, while students who skipped structured review needed more rewrites. The project suggests that deliberate revision habits have measurable effects on timed exam writing quality.', idx)
      ),
      2,
      '{}'::jsonb
    );

    for q in 1..50 loop
      tier := case when q <= 25 then 'standard' else 'advanced' end;
      correct_option := (array['A', 'B', 'C', 'D'])[1 + ((q + (idx * 2)) % 4)];

      insert into public.content_units (part_id, type, data, display_order, metadata)
      values (
        rw_m2_part_ids[idx],
        'question_single_choice',
        jsonb_build_object(
          'prompt', format('RW M2 Q%s (%s): Select the strongest sentence-level revision.', q, tier),
          'options', jsonb_build_array(
            jsonb_build_object('id', 'A', 'label', format('%s option A', initcap(tier))),
            jsonb_build_object('id', 'B', 'label', format('%s option B', initcap(tier))),
            jsonb_build_object('id', 'C', 'label', format('%s option C', initcap(tier))),
            jsonb_build_object('id', 'D', 'label', format('%s option D', initcap(tier)))
          )
        ),
        q + 2,
        jsonb_build_object('domain', 'reading_writing', 'module', 2, 'question_number', q, 'difficulty_tier', tier)
      )
      returning id into unit_id;

      insert into public.answer_keys (content_unit_id, correct, metadata)
      values (unit_id, jsonb_build_object('option_id', correct_option), '{}'::jsonb)
      on conflict (content_unit_id) do update
      set
        correct = excluded.correct,
        metadata = excluded.metadata;
    end loop;

    -- Math Module 1 (instruction + 25 scored questions)
    insert into public.content_units (part_id, type, data, display_order, metadata)
    values (
      math_m1_part_ids[idx],
      'instruction',
      jsonb_build_object('text', format('Math Module 1 (Test %s). Solve each item without a calculator unless noted.', idx)),
      1,
      '{}'::jsonb
    );

    for q in 1..25 loop
      a := 2 + ((q + idx) % 9);
      c := 1 + ((q * 2 + idx) % 7);
      x := 2 + ((q * 3 + idx) % 12);
      rhs := (a * x) + c;
      correct_option := (array['A', 'B', 'C', 'D'])[1 + ((q + idx + 1) % 4)];

      insert into public.content_units (part_id, type, data, display_order, metadata)
      values (
        math_m1_part_ids[idx],
        'question_single_choice',
        jsonb_build_object(
          'prompt', format('Math M1 Q%s: Solve for x in %sx + %s = %s.', q, a, c, rhs),
          'options', jsonb_build_array(
            jsonb_build_object('id', 'A', 'label', case when correct_option = 'A' then x::text else (x - 1)::text end),
            jsonb_build_object('id', 'B', 'label', case when correct_option = 'B' then x::text else (x + 1)::text end),
            jsonb_build_object('id', 'C', 'label', case when correct_option = 'C' then x::text else (x + 2)::text end),
            jsonb_build_object('id', 'D', 'label', case when correct_option = 'D' then x::text else (x - 2)::text end)
          )
        ),
        q + 1,
        jsonb_build_object('domain', 'math', 'module', 1, 'question_number', q)
      )
      returning id into unit_id;

      insert into public.answer_keys (content_unit_id, correct, metadata)
      values (unit_id, jsonb_build_object('option_id', correct_option), '{}'::jsonb)
      on conflict (content_unit_id) do update
      set
        correct = excluded.correct,
        metadata = excluded.metadata;
    end loop;

    -- Math Module 2 (instruction + 50 tiered questions; 25 standard + 25 advanced)
    insert into public.content_units (part_id, type, data, display_order, metadata)
    values (
      math_m2_part_ids[idx],
      'instruction',
      jsonb_build_object('text', format('Math Module 2 (Test %s). Difficulty tier is selected from your Module 1 performance.', idx)),
      1,
      '{}'::jsonb
    );

    for q in 1..50 loop
      tier := case when q <= 25 then 'standard' else 'advanced' end;
      a := 3 + ((q + idx) % 11);
      b := 2 + ((q * 2 + idx) % 9);
      x := 3 + ((q * 4 + idx) % 15);
      rhs := (a * x) - b;
      correct_option := (array['A', 'B', 'C', 'D'])[1 + ((q + idx + 2) % 4)];

      insert into public.content_units (part_id, type, data, display_order, metadata)
      values (
        math_m2_part_ids[idx],
        'question_single_choice',
        jsonb_build_object(
          'prompt', format('Math M2 Q%s (%s): Solve %sx - %s = %s.', q, tier, a, b, rhs),
          'options', jsonb_build_array(
            jsonb_build_object('id', 'A', 'label', case when correct_option = 'A' then x::text else (x - 1)::text end),
            jsonb_build_object('id', 'B', 'label', case when correct_option = 'B' then x::text else (x + 1)::text end),
            jsonb_build_object('id', 'C', 'label', case when correct_option = 'C' then x::text else (x + 2)::text end),
            jsonb_build_object('id', 'D', 'label', case when correct_option = 'D' then x::text else (x - 2)::text end)
          )
        ),
        q + 1,
        jsonb_build_object('domain', 'math', 'module', 2, 'question_number', q, 'difficulty_tier', tier)
      )
      returning id into unit_id;

      insert into public.answer_keys (content_unit_id, correct, metadata)
      values (unit_id, jsonb_build_object('option_id', correct_option), '{}'::jsonb)
      on conflict (content_unit_id) do update
      set
        correct = excluded.correct,
        metadata = excluded.metadata;
    end loop;
  end loop;

  -- 4) Reading & Writing practice bank (300 scored items).
  insert into public.experiences (id, product_id, name, display_order, is_active, metadata)
  values (
    rw_bank_experience_id,
    sat_product_id,
    'SAT Reading & Writing Practice Bank',
    10,
    true,
    jsonb_build_object('format', 'sat_practice_bank', 'section_type', 'reading_writing', 'duration_seconds', 5400)
  )
  on conflict (id) do update
  set
    product_id = excluded.product_id,
    name = excluded.name,
    display_order = excluded.display_order,
    is_active = excluded.is_active,
    metadata = excluded.metadata;

  insert into public.sections (id, experience_id, name, display_order, metadata)
  values (
    rw_bank_section_id,
    rw_bank_experience_id,
    'Reading & Writing Practice',
    1,
    jsonb_build_object('type', 'reading_writing', 'duration_seconds', 5400, 'module', 0)
  )
  on conflict (id) do update
  set
    experience_id = excluded.experience_id,
    name = excluded.name,
    display_order = excluded.display_order,
    metadata = excluded.metadata;

  insert into public.parts (id, section_id, name, display_order, metadata)
  values (rw_bank_part_id, rw_bank_section_id, 'Practice Set', 1, '{}'::jsonb)
  on conflict (id) do update
  set
    section_id = excluded.section_id,
    name = excluded.name,
    display_order = excluded.display_order,
    metadata = excluded.metadata;

  delete from public.answer_keys where content_unit_id in (select id from public.content_units where part_id = rw_bank_part_id);
  delete from public.content_units where part_id = rw_bank_part_id;

  insert into public.content_units (part_id, type, data, display_order, metadata)
  values (
    rw_bank_part_id,
    'instruction',
    jsonb_build_object('text', 'Reading & Writing practice bank: 300 SAT-style drill items.'),
    1,
    '{}'::jsonb
  );

  for q in 1..300 loop
    correct_option := (array['A', 'B', 'C', 'D'])[1 + (q % 4)];

    insert into public.content_units (part_id, type, data, display_order, metadata)
    values (
      rw_bank_part_id,
      'question_single_choice',
      jsonb_build_object(
        'prompt', format('RW Practice Q%s: Choose the most concise and precise revision.', q),
        'options', jsonb_build_array(
          jsonb_build_object('id', 'A', 'label', format('Choice A (%s)', q)),
          jsonb_build_object('id', 'B', 'label', format('Choice B (%s)', q)),
          jsonb_build_object('id', 'C', 'label', format('Choice C (%s)', q)),
          jsonb_build_object('id', 'D', 'label', format('Choice D (%s)', q))
        )
      ),
      q + 1,
      jsonb_build_object('domain', 'reading_writing', 'practice_item', q)
    )
    returning id into unit_id;

    insert into public.answer_keys (content_unit_id, correct, metadata)
    values (unit_id, jsonb_build_object('option_id', correct_option), '{}'::jsonb)
    on conflict (content_unit_id) do update
    set
      correct = excluded.correct,
      metadata = excluded.metadata;
  end loop;

  -- 5) Math practice bank (300 scored items).
  insert into public.experiences (id, product_id, name, display_order, is_active, metadata)
  values (
    math_bank_experience_id,
    sat_product_id,
    'SAT Math Practice Bank',
    11,
    true,
    jsonb_build_object('format', 'sat_practice_bank', 'section_type', 'math', 'duration_seconds', 5400)
  )
  on conflict (id) do update
  set
    product_id = excluded.product_id,
    name = excluded.name,
    display_order = excluded.display_order,
    is_active = excluded.is_active,
    metadata = excluded.metadata;

  insert into public.sections (id, experience_id, name, display_order, metadata)
  values (
    math_bank_section_id,
    math_bank_experience_id,
    'Math Practice',
    1,
    jsonb_build_object('type', 'math', 'duration_seconds', 5400, 'module', 0)
  )
  on conflict (id) do update
  set
    experience_id = excluded.experience_id,
    name = excluded.name,
    display_order = excluded.display_order,
    metadata = excluded.metadata;

  insert into public.parts (id, section_id, name, display_order, metadata)
  values (math_bank_part_id, math_bank_section_id, 'Practice Set', 1, '{}'::jsonb)
  on conflict (id) do update
  set
    section_id = excluded.section_id,
    name = excluded.name,
    display_order = excluded.display_order,
    metadata = excluded.metadata;

  delete from public.answer_keys where content_unit_id in (select id from public.content_units where part_id = math_bank_part_id);
  delete from public.content_units where part_id = math_bank_part_id;

  insert into public.content_units (part_id, type, data, display_order, metadata)
  values (
    math_bank_part_id,
    'instruction',
    jsonb_build_object('text', 'Math practice bank: 300 SAT-style drill items.'),
    1,
    '{}'::jsonb
  );

  for q in 1..300 loop
    a := 2 + (q % 13);
    b := 1 + ((q * 2) % 9);
    x := 2 + ((q * 3) % 17);
    rhs := (a * x) + b;
    correct_option := (array['A', 'B', 'C', 'D'])[1 + ((q + 1) % 4)];

    insert into public.content_units (part_id, type, data, display_order, metadata)
    values (
      math_bank_part_id,
      'question_single_choice',
      jsonb_build_object(
        'prompt', format('Math Practice Q%s: Solve for x in %sx + %s = %s.', q, a, b, rhs),
        'options', jsonb_build_array(
          jsonb_build_object('id', 'A', 'label', case when correct_option = 'A' then x::text else (x - 1)::text end),
          jsonb_build_object('id', 'B', 'label', case when correct_option = 'B' then x::text else (x + 1)::text end),
          jsonb_build_object('id', 'C', 'label', case when correct_option = 'C' then x::text else (x + 2)::text end),
          jsonb_build_object('id', 'D', 'label', case when correct_option = 'D' then x::text else (x - 2)::text end)
        )
      ),
      q + 1,
      jsonb_build_object('domain', 'math', 'practice_item', q)
    )
    returning id into unit_id;

    insert into public.answer_keys (content_unit_id, correct, metadata)
    values (unit_id, jsonb_build_object('option_id', correct_option), '{}'::jsonb)
    on conflict (content_unit_id) do update
    set
      correct = excluded.correct,
      metadata = excluded.metadata;
  end loop;
end $$;
