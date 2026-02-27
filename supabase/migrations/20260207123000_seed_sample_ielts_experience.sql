-- ============================================================================
-- SEED: SAMPLE IELTS EXPERIENCE (NON-COPYRIGHTED PLACEHOLDER CONTENT)
-- ============================================================================
-- This seeds ONE experience so the simulator can run end-to-end.
-- Replace/import your own real mock tests later.

-- Experience
insert into public.experiences (id, product_id, name, display_order, is_active, metadata)
values (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'IELTS Academic Practice Test 1 (Sample)',
  1,
  true,
  jsonb_build_object('format', 'academic', 'version', 1)
)
on conflict (id) do nothing;

-- Sections (type + duration in metadata)
insert into public.sections (id, experience_id, name, display_order, metadata)
values
  (
    '44444444-4444-4444-4444-444444444441',
    '33333333-3333-3333-3333-333333333333',
    'Listening',
    1,
    jsonb_build_object('type', 'listening', 'duration_seconds', 900)
  ),
  (
    '44444444-4444-4444-4444-444444444442',
    '33333333-3333-3333-3333-333333333333',
    'Reading',
    2,
    jsonb_build_object('type', 'reading', 'duration_seconds', 900)
  ),
  (
    '44444444-4444-4444-4444-444444444443',
    '33333333-3333-3333-3333-333333333333',
    'Writing',
    3,
    jsonb_build_object('type', 'writing', 'duration_seconds', 900)
  )
on conflict (id) do nothing;

-- Parts
insert into public.parts (id, section_id, name, display_order, metadata)
values
  (
    '55555555-5555-5555-5555-555555555551',
    '44444444-4444-4444-4444-444444444441',
    'Part 1',
    1,
    '{}'::jsonb
  ),
  (
    '55555555-5555-5555-5555-555555555552',
    '44444444-4444-4444-4444-444444444442',
    'Passage 1',
    1,
    '{}'::jsonb
  ),
  (
    '55555555-5555-5555-5555-555555555553',
    '44444444-4444-4444-4444-444444444443',
    'Task 1',
    1,
    '{}'::jsonb
  )
on conflict (id) do nothing;

-- Content units
insert into public.content_units (id, part_id, type, data, display_order, metadata)
values
  (
    '66666666-6666-6666-6666-666666666601',
    '55555555-5555-5555-5555-555555555551',
    'instruction',
    jsonb_build_object(
      'text',
      'You will hear a short recording. Answer the questions as you listen.'
    ),
    1,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666602',
    '55555555-5555-5555-5555-555555555551',
    'audio',
    jsonb_build_object(
      'tone',
      jsonb_build_object('frequency_hz', 440, 'duration_seconds', 8),
      'duration_seconds',
      8,
      'play_once',
      true
    ),
    2,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666611',
    '55555555-5555-5555-5555-555555555551',
    'question_single_choice',
    jsonb_build_object(
      'prompt',
      'What time does the library open on weekdays?',
      'options',
      jsonb_build_array(
        jsonb_build_object('id', 'A', 'label', '8:00'),
        jsonb_build_object('id', 'B', 'label', '9:00'),
        jsonb_build_object('id', 'C', 'label', '10:00')
      )
    ),
    3,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666612',
    '55555555-5555-5555-5555-555555555551',
    'question_text',
    jsonb_build_object(
      'prompt',
      'Write ONE word: The student needs a new ____ card.',
      'placeholder',
      'Your answer'
    ),
    4,
    '{}'::jsonb
  ),

  (
    '66666666-6666-6666-6666-666666666621',
    '55555555-5555-5555-5555-555555555552',
    'reading_passage',
    jsonb_build_object(
      'title',
      'A Short Passage',
      'text',
      'Small changes in daily routines can have a large impact over time. For example, reading for ten minutes a day can amount to more than sixty hours a year.'
    ),
    1,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666631',
    '55555555-5555-5555-5555-555555555552',
    'question_single_choice',
    jsonb_build_object(
      'prompt',
      'According to the passage, reading for ten minutes a day equals approximately how many hours per year?',
      'options',
      jsonb_build_array(
        jsonb_build_object('id', 'A', 'label', '6'),
        jsonb_build_object('id', 'B', 'label', '60'),
        jsonb_build_object('id', 'C', 'label', '600')
      )
    ),
    2,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666632',
    '55555555-5555-5555-5555-555555555552',
    'question_multi_choice',
    jsonb_build_object(
      'prompt',
      'Choose TWO statements that match the passage.',
      'options',
      jsonb_build_array(
        jsonb_build_object('id', 'A', 'label', 'Daily habits can add up over time.'),
        jsonb_build_object('id', 'B', 'label', 'Ten minutes a day is always enough to master a skill.'),
        jsonb_build_object('id', 'C', 'label', 'Small routines can have a long-term effect.')
      ),
      'max_select',
      2
    ),
    3,
    '{}'::jsonb
  ),

  (
    '66666666-6666-6666-6666-666666666641',
    '55555555-5555-5555-5555-555555555553',
    'instruction',
    jsonb_build_object(
      'text',
      'Writing Task 1: You should spend about 20 minutes on this task.'
    ),
    1,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666642',
    '55555555-5555-5555-5555-555555555553',
    'question_text',
    jsonb_build_object(
      'prompt',
      'Write at least 150 words. Describe a process you know well (for example, making a meal).',
      'placeholder',
      'Start typing here...'
    ),
    2,
    '{}'::jsonb
  )
on conflict (id) do nothing;

-- Answer keys for objective questions
insert into public.answer_keys (content_unit_id, correct, metadata)
values
  (
    '66666666-6666-6666-6666-666666666611',
    jsonb_build_object('option_id', 'B'),
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666612',
    jsonb_build_object('answers', jsonb_build_array('library')),
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666631',
    jsonb_build_object('option_id', 'B'),
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666632',
    jsonb_build_object('option_ids', jsonb_build_array('A', 'C')),
    '{}'::jsonb
  )
on conflict (content_unit_id) do nothing;

