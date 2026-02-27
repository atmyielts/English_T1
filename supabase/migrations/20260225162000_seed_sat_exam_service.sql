-- Seed SAT simulator product, pricing plans, and one sample digital SAT experience.

do $$
declare
  target_product_id constant uuid := '5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef';
  starter_plan_id constant uuid := '1d5b04c4-a795-4afc-bdfb-a94ebdc6f43f';
  monthly_plan_id constant uuid := 'f4f0d267-f056-4095-a258-fe6f1ec61f53';
  experience_id constant uuid := '83e3b8b7-1dbc-4e4b-95ed-d4c98fd98f8e';

  section_rw_m1 constant uuid := '2de35697-71d4-4f2d-9cd1-c3f8b6d5ce47';
  section_rw_m2 constant uuid := '551328c8-65a4-4d53-bb95-bff4f6c7e97f';
  section_math_m1 constant uuid := '970948c7-d768-46af-ad84-08fbc7f8f4d6';
  section_math_m2 constant uuid := 'e3db251f-7785-4609-a7cd-3297fd6e040d';

  part_rw_m1 constant uuid := '64845f6e-5c14-43d9-b49d-51abbf01cb1d';
  part_rw_m2 constant uuid := 'ff94b272-203f-489d-a02f-e456db43f5af';
  part_math_m1 constant uuid := '7488f32c-1f47-4d9d-9853-9d020f3c3544';
  part_math_m2 constant uuid := '786d7795-a16d-4f04-8fdb-4de18e2af4de';

  resolved_product_id uuid;
begin
  select p.id
  into resolved_product_id
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) = 'sat-exam-simulator'
     or lower(p.name) = 'sat exam simulator'
  order by case when p.id = target_product_id then 0 else 1 end, p.created_at asc
  limit 1;

  if resolved_product_id is null then
    insert into public.products (id, name, type, status, description, metadata)
    values (
      target_product_id,
      'SAT Exam Simulator',
      'exam',
      'active',
      'Digital SAT simulator with adaptive-style Reading & Writing and Math modules.',
      jsonb_build_object(
        'slug', 'sat-exam-simulator',
        'app_url', 'https://sat.schood.online',
        'short_description', 'Digital SAT module practice and full adaptive-style mocks.',
        'tagline', 'Reading & Writing + Math with realistic timing.',
        'sort_order', 30
      )
    )
    on conflict (id) do update
    set
      name = excluded.name,
      type = excluded.type,
      status = excluded.status,
      description = excluded.description,
      metadata = coalesce(public.products.metadata, '{}'::jsonb) || excluded.metadata
    returning id into resolved_product_id;
  else
    update public.products
    set
      name = 'SAT Exam Simulator',
      type = 'exam',
      status = 'active',
      description = coalesce(
        nullif(description, ''),
        'Digital SAT simulator with adaptive-style Reading & Writing and Math modules.'
      ),
      metadata =
        coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'slug', coalesce(nullif(coalesce(metadata, '{}'::jsonb)->>'slug', ''), 'sat-exam-simulator'),
          'app_url', coalesce(nullif(coalesce(metadata, '{}'::jsonb)->>'app_url', ''), 'https://sat.schood.online'),
          'short_description', coalesce(
            nullif(coalesce(metadata, '{}'::jsonb)->>'short_description', ''),
            'Digital SAT module practice and full adaptive-style mocks.'
          ),
          'tagline', coalesce(
            nullif(coalesce(metadata, '{}'::jsonb)->>'tagline', ''),
            'Reading & Writing + Math with realistic timing.'
          ),
          'sort_order', coalesce(
            (case when coalesce(metadata, '{}'::jsonb)->>'sort_order' ~ '^\d+$'
              then ((coalesce(metadata, '{}'::jsonb)->>'sort_order')::int)::numeric
              else null
            end),
            30
          )
        )
    where id = resolved_product_id;
  end if;

  insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active, metadata)
  values (
    starter_plan_id,
    resolved_product_id,
    'SAT Starter',
    39000,
    'UZS',
    14,
    true,
    jsonb_build_object(
      'display_order', 1,
      'tagline', 'Two-week SAT bootcamp',
      'description', 'Start with module drills and one full digital SAT mock.',
      'features', jsonb_build_array(
        'Reading & Writing module practice',
        'Math module practice',
        'One full mock test flow'
      ),
      'limits', jsonb_build_object(
        'section_practice', 80,
        'writing_submissions', 0
      )
    )
  )
  on conflict (id) do update
  set
    product_id = excluded.product_id,
    name = excluded.name,
    amount = excluded.amount,
    currency = excluded.currency,
    duration_days = excluded.duration_days,
    is_active = excluded.is_active,
    metadata = excluded.metadata;

  insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active, metadata)
  values (
    monthly_plan_id,
    resolved_product_id,
    'SAT Monthly Access',
    99000,
    'UZS',
    30,
    true,
    jsonb_build_object(
      'display_order', 2,
      'recommended', true,
      'tagline', 'Best for score growth',
      'description', 'Unlimited SAT module drills, full mocks, and review analytics.',
      'features', jsonb_build_array(
        'Unlimited Reading & Writing drills',
        'Unlimited Math drills',
        'Full mock and review dashboard'
      ),
      'limits', jsonb_build_object(
        'section_practice', 240,
        'writing_submissions', 0
      )
    )
  )
  on conflict (id) do update
  set
    product_id = excluded.product_id,
    name = excluded.name,
    amount = excluded.amount,
    currency = excluded.currency,
    duration_days = excluded.duration_days,
    is_active = excluded.is_active,
    metadata = excluded.metadata;

  insert into public.experiences (id, product_id, name, display_order, is_active, metadata)
  values (
    experience_id,
    resolved_product_id,
    'Digital SAT Practice Test 1',
    1,
    true,
    jsonb_build_object(
      'format', 'digital_sat',
      'version', 1,
      'duration_seconds', 8040
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
      section_rw_m1,
      experience_id,
      'Reading & Writing - Module 1',
      1,
      jsonb_build_object(
        'type', 'reading_writing',
        'duration_seconds', 1920,
        'module', 1,
        'score_domain', 'reading_writing'
      )
    ),
    (
      section_rw_m2,
      experience_id,
      'Reading & Writing - Module 2',
      2,
      jsonb_build_object(
        'type', 'reading_writing',
        'duration_seconds', 1920,
        'module', 2,
        'score_domain', 'reading_writing'
      )
    ),
    (
      section_math_m1,
      experience_id,
      'Math - Module 1',
      3,
      jsonb_build_object(
        'type', 'math',
        'duration_seconds', 2100,
        'module', 1,
        'calculator_allowed', false,
        'score_domain', 'math'
      )
    ),
    (
      section_math_m2,
      experience_id,
      'Math - Module 2',
      4,
      jsonb_build_object(
        'type', 'math',
        'duration_seconds', 2100,
        'module', 2,
        'calculator_allowed', true,
        'score_domain', 'math'
      )
    )
  on conflict (id) do update
  set
    name = excluded.name,
    display_order = excluded.display_order,
    metadata = excluded.metadata;

  insert into public.parts (id, section_id, name, display_order, metadata)
  values
    (part_rw_m1, section_rw_m1, 'Module 1', 1, '{}'::jsonb),
    (part_rw_m2, section_rw_m2, 'Module 2', 1, '{}'::jsonb),
    (part_math_m1, section_math_m1, 'Module 1', 1, '{}'::jsonb),
    (part_math_m2, section_math_m2, 'Module 2', 1, '{}'::jsonb)
  on conflict (id) do update
  set
    name = excluded.name,
    display_order = excluded.display_order,
    metadata = excluded.metadata;

  -- Reading & Writing - Module 1
  with rows as (
    select * from (values
      ('instruction', 1, '{"text":"Reading & Writing Module 1. Answer all questions in this module."}'::jsonb, null::jsonb),
      ('reading_passage', 2, '{"title":"Neighborhood Science Network","text":"A city volunteer team launched a neighborhood science network to track air quality. Instead of relying on one central station, the group installed compact sensors near schools, bus stops, and parks. Early reports looked inconsistent, but researchers discovered that timing and street layout were affecting measurements. Once the team standardized collection windows and logging methods, trends became clearer. Residents used the data to request route adjustments for heavy traffic periods, and local officials approved two pilot changes."}'::jsonb, null::jsonb),
      ('question_single_choice', 3, '{"prompt":"What is the main purpose of the passage?","options":[{"id":"A","label":"To criticize volunteer-led data projects"},{"id":"B","label":"To explain how a local data project improved reliability and impact"},{"id":"C","label":"To compare national and local air quality laws"},{"id":"D","label":"To describe how to build sensor hardware"}]}'::jsonb, '{"option_id":"B"}'::jsonb),
      ('question_single_choice', 4, '{"prompt":"In the passage, the word \"standardized\" most nearly means:","options":[{"id":"A","label":"expanded"},{"id":"B","label":"hidden"},{"id":"C","label":"made consistent"},{"id":"D","label":"measured quickly"}]}'::jsonb, '{"option_id":"C"}'::jsonb),
      ('question_multi_choice', 5, '{"prompt":"Which TWO details best support the idea that process changes improved data quality?","options":[{"id":"A","label":"Collection windows were standardized."},{"id":"B","label":"Sensors were moved to another city."},{"id":"C","label":"Logging methods were standardized."},{"id":"D","label":"All residents bought private sensors."}],"max_select":2}'::jsonb, '{"option_ids":["A","C"]}'::jsonb),
      ('question_text', 6, '{"prompt":"According to the passage, the team requested route adjustments during heavy traffic ____.","placeholder":"Type one word"}'::jsonb, '{"answers":["periods"]}'::jsonb)
    ) as v(type, display_order, data, correct)
  ),
  ins as (
    insert into public.content_units (part_id, type, data, display_order, metadata)
    select part_rw_m1, type, data, display_order, '{}'::jsonb
    from rows
    on conflict (part_id, display_order)
    do update set type = excluded.type, data = excluded.data, metadata = excluded.metadata
    returning id, display_order
  )
  insert into public.answer_keys (content_unit_id, correct, metadata)
  select ins.id, rows.correct, '{}'::jsonb
  from ins join rows using (display_order)
  where rows.correct is not null
  on conflict (content_unit_id)
  do update set correct = excluded.correct, metadata = excluded.metadata;

  -- Reading & Writing - Module 2
  with rows as (
    select * from (values
      ('instruction', 1, '{"text":"Reading & Writing Module 2. Continue with higher-difficulty mixed items."}'::jsonb, null::jsonb),
      ('reading_passage', 2, '{"title":"Adaptive Study Blocks","text":"A tutoring center tested adaptive study blocks where learners alternated between easy, medium, and difficult tasks. Coaches expected frustration, but most students reported higher confidence after three weeks. The program worked because coaches explained why challenge spikes were intentional and short. Students were also trained to log one strategy they used after each block. That reflection habit helped many identify which methods worked under time pressure."}'::jsonb, null::jsonb),
      ('question_sentence_endings', 3, '{"prompt":"Complete each sentence with the best ending.","items":[{"id":"rw2_1","label":"Challenge spikes were effective because"},{"id":"rw2_2","label":"Students logged one strategy after each block because"}],"options":[{"id":"A","label":"coaches explained the purpose and kept them short."},{"id":"B","label":"all tasks were removed from future study plans."},{"id":"C","label":"reflection helped identify useful methods under pressure."},{"id":"D","label":"the center banned mixed-difficulty practice."}]}'::jsonb, '{"matches":{"rw2_1":"A","rw2_2":"C"}}'::jsonb),
      ('question_true_false_not_given', 4, '{"prompt":"Choose TRUE, FALSE, or NOT GIVEN.","statements":[{"id":"rw2_t1","text":"Most students reported lower confidence after the pilot."},{"id":"rw2_t2","text":"Coaches explained why challenge spikes were intentional."},{"id":"rw2_t3","text":"Students tracked two strategies after every block."}]}'::jsonb, '{"matches":{"rw2_t1":"F","rw2_t2":"T","rw2_t3":"F"}}'::jsonb),
      ('question_single_choice', 5, '{"prompt":"Which choice best states the central claim of the passage?","options":[{"id":"A","label":"Adaptive study blocks work best when challenge is explained and followed by reflection."},{"id":"B","label":"Students should avoid difficult tasks during timed practice."},{"id":"C","label":"Reflection is only useful for advanced learners."},{"id":"D","label":"Tutoring centers should remove coach involvement."}]}'::jsonb, '{"option_id":"A"}'::jsonb)
    ) as v(type, display_order, data, correct)
  ),
  ins as (
    insert into public.content_units (part_id, type, data, display_order, metadata)
    select part_rw_m2, type, data, display_order, '{}'::jsonb
    from rows
    on conflict (part_id, display_order)
    do update set type = excluded.type, data = excluded.data, metadata = excluded.metadata
    returning id, display_order
  )
  insert into public.answer_keys (content_unit_id, correct, metadata)
  select ins.id, rows.correct, '{}'::jsonb
  from ins join rows using (display_order)
  where rows.correct is not null
  on conflict (content_unit_id)
  do update set correct = excluded.correct, metadata = excluded.metadata;

  -- Math - Module 1
  with rows as (
    select * from (values
      ('instruction', 1, '{"text":"Math Module 1. Calculator is not required for these questions."}'::jsonb, null::jsonb),
      ('question_single_choice', 2, '{"prompt":"If 3x + 5 = 26, what is x?","options":[{"id":"A","label":"5"},{"id":"B","label":"7"},{"id":"C","label":"8"},{"id":"D","label":"9"}]}'::jsonb, '{"option_id":"B"}'::jsonb),
      ('question_text', 3, '{"prompt":"A line has slope 4 and passes through (2, 3). What is the y-value when x = 5?","placeholder":"Enter a number"}'::jsonb, '{"answers":["15"]}'::jsonb),
      ('question_single_choice', 4, '{"prompt":"A rectangle has length 12 and width 5. What is its area?","options":[{"id":"A","label":"17"},{"id":"B","label":"34"},{"id":"C","label":"60"},{"id":"D","label":"120"}]}'::jsonb, '{"option_id":"C"}'::jsonb),
      ('question_multi_choice', 5, '{"prompt":"Select ALL expressions equivalent to 2(x + 3).","options":[{"id":"A","label":"2x + 6"},{"id":"B","label":"x + 6"},{"id":"C","label":"6 + 2x"},{"id":"D","label":"2x + 3"}],"max_select":2}'::jsonb, '{"option_ids":["A","C"]}'::jsonb)
    ) as v(type, display_order, data, correct)
  ),
  ins as (
    insert into public.content_units (part_id, type, data, display_order, metadata)
    select part_math_m1, type, data, display_order, '{}'::jsonb
    from rows
    on conflict (part_id, display_order)
    do update set type = excluded.type, data = excluded.data, metadata = excluded.metadata
    returning id, display_order
  )
  insert into public.answer_keys (content_unit_id, correct, metadata)
  select ins.id, rows.correct, '{}'::jsonb
  from ins join rows using (display_order)
  where rows.correct is not null
  on conflict (content_unit_id)
  do update set correct = excluded.correct, metadata = excluded.metadata;

  -- Math - Module 2
  with rows as (
    select * from (values
      ('instruction', 1, '{"text":"Math Module 2. You may use a calculator where needed."}'::jsonb, null::jsonb),
      ('question_single_choice', 2, '{"prompt":"A function is defined by f(x) = x^2 - 4x + 1. What is f(6)?","options":[{"id":"A","label":"1"},{"id":"B","label":"9"},{"id":"C","label":"13"},{"id":"D","label":"17"}]}'::jsonb, '{"option_id":"C"}'::jsonb),
      ('question_text', 3, '{"prompt":"A car travels 180 miles in 3 hours. What is its average speed in miles per hour?","placeholder":"Enter a number"}'::jsonb, '{"answers":["60"]}'::jsonb),
      ('question_single_choice', 4, '{"prompt":"In a right triangle, one leg is 9 and the other is 12. What is the hypotenuse?","options":[{"id":"A","label":"15"},{"id":"B","label":"18"},{"id":"C","label":"21"},{"id":"D","label":"25"}]}'::jsonb, '{"option_id":"A"}'::jsonb),
      ('question_single_choice', 5, '{"prompt":"A data set has values 2, 5, 8, 11, 14. What is the median?","options":[{"id":"A","label":"5"},{"id":"B","label":"8"},{"id":"C","label":"11"},{"id":"D","label":"14"}]}'::jsonb, '{"option_id":"B"}'::jsonb)
    ) as v(type, display_order, data, correct)
  ),
  ins as (
    insert into public.content_units (part_id, type, data, display_order, metadata)
    select part_math_m2, type, data, display_order, '{}'::jsonb
    from rows
    on conflict (part_id, display_order)
    do update set type = excluded.type, data = excluded.data, metadata = excluded.metadata
    returning id, display_order
  )
  insert into public.answer_keys (content_unit_id, correct, metadata)
  select ins.id, rows.correct, '{}'::jsonb
  from ins join rows using (display_order)
  where rows.correct is not null
  on conflict (content_unit_id)
  do update set correct = excluded.correct, metadata = excluded.metadata;
end $$;
