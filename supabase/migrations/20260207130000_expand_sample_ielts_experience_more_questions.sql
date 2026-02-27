-- ============================================================================
-- EXPAND: SAMPLE IELTS EXPERIENCE (MORE QUESTIONS / PARTS)
-- ============================================================================
-- Non-copyrighted placeholder content, intended to make the simulator feel
-- like a real test (multiple parts + multiple questions per section).

-- ---------------------------------------------------------------------------
-- New parts
-- ---------------------------------------------------------------------------
insert into public.parts (id, section_id, name, display_order, metadata)
values
  (
    '55555555-5555-5555-5555-555555555554',
    '44444444-4444-4444-4444-444444444441',
    'Part 2',
    2,
    '{}'::jsonb
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    '44444444-4444-4444-4444-444444444441',
    'Part 3',
    3,
    '{}'::jsonb
  ),
  (
    '55555555-5555-5555-5555-555555555556',
    '44444444-4444-4444-4444-444444444441',
    'Part 4',
    4,
    '{}'::jsonb
  ),

  (
    '55555555-5555-5555-5555-555555555557',
    '44444444-4444-4444-4444-444444444442',
    'Passage 2',
    2,
    '{}'::jsonb
  ),
  (
    '55555555-5555-5555-5555-555555555558',
    '44444444-4444-4444-4444-444444444442',
    'Passage 3',
    3,
    '{}'::jsonb
  ),

  (
    '55555555-5555-5555-5555-555555555559',
    '44444444-4444-4444-4444-444444444443',
    'Task 2',
    2,
    '{}'::jsonb
  )
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- More content units (Listening Part 1: add more questions)
-- ---------------------------------------------------------------------------
insert into public.content_units (id, part_id, type, data, display_order, metadata)
values
  (
    '66666666-6666-6666-6666-666666666613',
    '55555555-5555-5555-5555-555555555551',
    'question_single_choice',
    jsonb_build_object(
      'prompt',
      'Which desk will the student visit first?',
      'options',
      jsonb_build_array(
        jsonb_build_object('id', 'A', 'label', 'Front desk'),
        jsonb_build_object('id', 'B', 'label', 'Returns desk'),
        jsonb_build_object('id', 'C', 'label', 'Help desk')
      )
    ),
    5,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666614',
    '55555555-5555-5555-5555-555555555551',
    'question_text',
    jsonb_build_object(
      'prompt',
      'Write ONE word: The student forgot their ____.',
      'placeholder',
      'Your answer'
    ),
    6,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666615',
    '55555555-5555-5555-5555-555555555551',
    'question_matching',
    jsonb_build_object(
      'prompt',
      'Match the person to their request.',
      'items',
      jsonb_build_array(
        jsonb_build_object('id', 'i1', 'label', 'Student'),
        jsonb_build_object('id', 'i2', 'label', 'Librarian')
      ),
      'options',
      jsonb_build_array(
        jsonb_build_object('id', 'oA', 'label', 'Renew a card'),
        jsonb_build_object('id', 'oB', 'label', 'Pay a fine')
      ),
      'allow_reuse',
      false
    ),
    7,
    '{}'::jsonb
  )
on conflict (id) do nothing;

insert into public.answer_keys (content_unit_id, correct, metadata)
values
  (
    '66666666-6666-6666-6666-666666666613',
    jsonb_build_object('option_id', 'C'),
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666614',
    jsonb_build_object('answers', jsonb_build_array('wallet', 'card')),
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666615',
    jsonb_build_object('matches', jsonb_build_object('i1', 'oA', 'i2', 'oB')),
    '{}'::jsonb
  )
on conflict (content_unit_id) do nothing;


-- ---------------------------------------------------------------------------
-- Listening Parts 2-4
-- ---------------------------------------------------------------------------
insert into public.content_units (id, part_id, type, data, display_order, metadata)
values
  (
    '66666666-6666-6666-6666-666666666671',
    '55555555-5555-5555-5555-555555555554',
    'instruction',
    jsonb_build_object('text', 'You will hear a short talk about a campus event. Answer the questions.'),
    1,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666672',
    '55555555-5555-5555-5555-555555555554',
    'audio',
    jsonb_build_object(
      'tone',
      jsonb_build_object('frequency_hz', 523, 'duration_seconds', 10),
      'duration_seconds',
      10,
      'play_once',
      true
    ),
    2,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666673',
    '55555555-5555-5555-5555-555555555554',
    'question_multi_choice',
    jsonb_build_object(
      'prompt',
      'Choose TWO benefits of attending the event.',
      'options',
      jsonb_build_array(
        jsonb_build_object('id', 'A', 'label', 'Free materials'),
        jsonb_build_object('id', 'B', 'label', 'Guaranteed jobs'),
        jsonb_build_object('id', 'C', 'label', 'Networking opportunities'),
        jsonb_build_object('id', 'D', 'label', 'Free travel')
      ),
      'max_select',
      2
    ),
    3,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666674',
    '55555555-5555-5555-5555-555555555554',
    'question_text',
    jsonb_build_object(
      'prompt',
      'Write ONE word: The event is held in the ____ hall.',
      'placeholder',
      'Your answer'
    ),
    4,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666675',
    '55555555-5555-5555-5555-555555555554',
    'question_single_choice',
    jsonb_build_object(
      'prompt',
      'What time does the event start?',
      'options',
      jsonb_build_array(
        jsonb_build_object('id', 'A', 'label', '10:00'),
        jsonb_build_object('id', 'B', 'label', '13:00'),
        jsonb_build_object('id', 'C', 'label', '15:00')
      )
    ),
    5,
    '{}'::jsonb
  ),

  (
    '66666666-6666-6666-6666-666666666681',
    '55555555-5555-5555-5555-555555555555',
    'instruction',
    jsonb_build_object('text', 'You will hear a conversation. Match the details.'),
    1,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666682',
    '55555555-5555-5555-5555-555555555555',
    'audio',
    jsonb_build_object(
      'tone',
      jsonb_build_object('frequency_hz', 392, 'duration_seconds', 10),
      'duration_seconds',
      10,
      'play_once',
      true
    ),
    2,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666683',
    '55555555-5555-5555-5555-555555555555',
    'question_matching',
    jsonb_build_object(
      'prompt',
      'Match the topic to the speaker.',
      'items',
      jsonb_build_array(
        jsonb_build_object('id', 's1', 'label', 'Speaker 1'),
        jsonb_build_object('id', 's2', 'label', 'Speaker 2'),
        jsonb_build_object('id', 's3', 'label', 'Speaker 3')
      ),
      'options',
      jsonb_build_array(
        jsonb_build_object('id', 'tA', 'label', 'Scheduling'),
        jsonb_build_object('id', 'tB', 'label', 'Costs'),
        jsonb_build_object('id', 'tC', 'label', 'Location')
      ),
      'allow_reuse',
      false
    ),
    3,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666684',
    '55555555-5555-5555-5555-555555555555',
    'question_single_choice',
    jsonb_build_object(
      'prompt',
      'What is the main concern discussed?',
      'options',
      jsonb_build_array(
        jsonb_build_object('id', 'A', 'label', 'Weather'),
        jsonb_build_object('id', 'B', 'label', 'Deadlines'),
        jsonb_build_object('id', 'C', 'label', 'Food')
      )
    ),
    4,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666685',
    '55555555-5555-5555-5555-555555555555',
    'question_text',
    jsonb_build_object(
      'prompt',
      'Write ONE word: They agree to meet on ____.',
      'placeholder',
      'Your answer'
    ),
    5,
    '{}'::jsonb
  ),

  (
    '66666666-6666-6666-6666-666666666691',
    '55555555-5555-5555-5555-555555555556',
    'instruction',
    jsonb_build_object('text', 'You will hear a short lecture. Answer the questions.'),
    1,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666692',
    '55555555-5555-5555-5555-555555555556',
    'audio',
    jsonb_build_object(
      'tone',
      jsonb_build_object('frequency_hz', 330, 'duration_seconds', 10),
      'duration_seconds',
      10,
      'play_once',
      true
    ),
    2,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666693',
    '55555555-5555-5555-5555-555555555556',
    'question_multi_choice',
    jsonb_build_object(
      'prompt',
      'Choose TWO points that the lecturer emphasizes.',
      'options',
      jsonb_build_array(
        jsonb_build_object('id', 'A', 'label', 'Planning ahead'),
        jsonb_build_object('id', 'B', 'label', 'Buying expensive tools'),
        jsonb_build_object('id', 'C', 'label', 'Reviewing notes'),
        jsonb_build_object('id', 'D', 'label', 'Avoiding practice')
      ),
      'max_select',
      2
    ),
    3,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666694',
    '55555555-5555-5555-5555-555555555556',
    'question_text',
    jsonb_build_object(
      'prompt',
      'Write ONE word: The lecture focuses on study ____.',
      'placeholder',
      'Your answer'
    ),
    4,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666695',
    '55555555-5555-5555-5555-555555555556',
    'question_single_choice',
    jsonb_build_object(
      'prompt',
      'What is the suggested first step?',
      'options',
      jsonb_build_array(
        jsonb_build_object('id', 'A', 'label', 'Set a goal'),
        jsonb_build_object('id', 'B', 'label', 'Skip practice'),
        jsonb_build_object('id', 'C', 'label', 'Change subjects')
      )
    ),
    5,
    '{}'::jsonb
  )
on conflict (id) do nothing;

insert into public.answer_keys (content_unit_id, correct, metadata)
values
  (
    '66666666-6666-6666-6666-666666666673',
    jsonb_build_object('option_ids', jsonb_build_array('A', 'C')),
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666674',
    jsonb_build_object('answers', jsonb_build_array('main')),
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666675',
    jsonb_build_object('option_id', 'B'),
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666683',
    jsonb_build_object('matches', jsonb_build_object('s1', 'tA', 's2', 'tB', 's3', 'tC')),
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666684',
    jsonb_build_object('option_id', 'B'),
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666685',
    jsonb_build_object('answers', jsonb_build_array('monday')),
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666693',
    jsonb_build_object('option_ids', jsonb_build_array('A', 'C')),
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666694',
    jsonb_build_object('answers', jsonb_build_array('habits', 'routine')),
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666695',
    jsonb_build_object('option_id', 'A'),
    '{}'::jsonb
  )
on conflict (content_unit_id) do nothing;


-- ---------------------------------------------------------------------------
-- Reading Passage 1: add more questions
-- ---------------------------------------------------------------------------
insert into public.content_units (id, part_id, type, data, display_order, metadata)
values
  (
    '66666666-6666-6666-6666-666666666633',
    '55555555-5555-5555-5555-555555555552',
    'question_text',
    jsonb_build_object(
      'prompt',
      'Write ONE word: Ten minutes a day can add up to more than ____ hours a year.',
      'placeholder',
      'Your answer'
    ),
    4,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666634',
    '55555555-5555-5555-5555-555555555552',
    'question_matching',
    jsonb_build_object(
      'prompt',
      'Match the phrase to its meaning.',
      'items',
      jsonb_build_array(
        jsonb_build_object('id', 'p1', 'label', 'add up'),
        jsonb_build_object('id', 'p2', 'label', 'impact')
      ),
      'options',
      jsonb_build_array(
        jsonb_build_object('id', 'mA', 'label', 'total'),
        jsonb_build_object('id', 'mB', 'label', 'effect')
      ),
      'allow_reuse',
      false
    ),
    5,
    '{}'::jsonb
  )
on conflict (id) do nothing;

insert into public.answer_keys (content_unit_id, correct, metadata)
values
  (
    '66666666-6666-6666-6666-666666666633',
    jsonb_build_object('answers', jsonb_build_array('sixty', '60')),
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666634',
    jsonb_build_object('matches', jsonb_build_object('p1', 'mA', 'p2', 'mB')),
    '{}'::jsonb
  )
on conflict (content_unit_id) do nothing;


-- ---------------------------------------------------------------------------
-- Reading Passage 2
-- ---------------------------------------------------------------------------
insert into public.content_units (id, part_id, type, data, display_order, metadata)
values
  (
    '66666666-6666-6666-6666-666666666651',
    '55555555-5555-5555-5555-555555555557',
    'reading_passage',
    jsonb_build_object(
      'title',
      'Urban Gardens',
      'text',
      'Urban gardens are small green spaces created in cities. They can improve air quality, provide local food, and build community. Many projects start on unused land and rely on volunteers.'
    ),
    1,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666652',
    '55555555-5555-5555-5555-555555555557',
    'question_single_choice',
    jsonb_build_object(
      'prompt',
      'Which is mentioned as a benefit of urban gardens?',
      'options',
      jsonb_build_array(
        jsonb_build_object('id', 'A', 'label', 'They remove all traffic.'),
        jsonb_build_object('id', 'B', 'label', 'They improve air quality.'),
        jsonb_build_object('id', 'C', 'label', 'They guarantee lower rent.')
      )
    ),
    2,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666653',
    '55555555-5555-5555-5555-555555555557',
    'question_text',
    jsonb_build_object(
      'prompt',
      'Write ONE word: Many projects rely on ____.',
      'placeholder',
      'Your answer'
    ),
    3,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666654',
    '55555555-5555-5555-5555-555555555557',
    'question_multi_choice',
    jsonb_build_object(
      'prompt',
      'Choose TWO things gardens can provide, according to the passage.',
      'options',
      jsonb_build_array(
        jsonb_build_object('id', 'A', 'label', 'Local food'),
        jsonb_build_object('id', 'B', 'label', 'Community connections'),
        jsonb_build_object('id', 'C', 'label', 'Free electricity'),
        jsonb_build_object('id', 'D', 'label', 'New highways')
      ),
      'max_select',
      2
    ),
    4,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666655',
    '55555555-5555-5555-5555-555555555557',
    'question_matching',
    jsonb_build_object(
      'prompt',
      'Match the idea to the detail.',
      'items',
      jsonb_build_array(
        jsonb_build_object('id', 'd1', 'label', 'Location'),
        jsonb_build_object('id', 'd2', 'label', 'People')
      ),
      'options',
      jsonb_build_array(
        jsonb_build_object('id', 'kA', 'label', 'unused land'),
        jsonb_build_object('id', 'kB', 'label', 'volunteers')
      ),
      'allow_reuse',
      false
    ),
    5,
    '{}'::jsonb
  )
on conflict (id) do nothing;

insert into public.answer_keys (content_unit_id, correct, metadata)
values
  (
    '66666666-6666-6666-6666-666666666652',
    jsonb_build_object('option_id', 'B'),
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666653',
    jsonb_build_object('answers', jsonb_build_array('volunteers')),
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666654',
    jsonb_build_object('option_ids', jsonb_build_array('A', 'B')),
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666655',
    jsonb_build_object('matches', jsonb_build_object('d1', 'kA', 'd2', 'kB')),
    '{}'::jsonb
  )
on conflict (content_unit_id) do nothing;


-- ---------------------------------------------------------------------------
-- Reading Passage 3
-- ---------------------------------------------------------------------------
insert into public.content_units (id, part_id, type, data, display_order, metadata)
values
  (
    '66666666-6666-6666-6666-666666666661',
    '55555555-5555-5555-5555-555555555558',
    'reading_passage',
    jsonb_build_object(
      'title',
      'Energy Storage',
      'text',
      'Renewable energy sources like wind and solar are variable. Energy storage systems can help balance supply and demand by storing excess energy and releasing it later. Different technologies vary in cost and efficiency.'
    ),
    1,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666662',
    '55555555-5555-5555-5555-555555555558',
    'question_text',
    jsonb_build_object(
      'prompt',
      'Write ONE word: Wind and solar are described as ____.',
      'placeholder',
      'Your answer'
    ),
    2,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666663',
    '55555555-5555-5555-5555-555555555558',
    'question_single_choice',
    jsonb_build_object(
      'prompt',
      'What can storage systems do?',
      'options',
      jsonb_build_array(
        jsonb_build_object('id', 'A', 'label', 'Create energy from nothing'),
        jsonb_build_object('id', 'B', 'label', 'Balance supply and demand'),
        jsonb_build_object('id', 'C', 'label', 'Stop the wind')
      )
    ),
    3,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666664',
    '55555555-5555-5555-5555-555555555558',
    'question_matching',
    jsonb_build_object(
      'prompt',
      'Match the term to the description.',
      'items',
      jsonb_build_array(
        jsonb_build_object('id', 'x1', 'label', 'excess energy'),
        jsonb_build_object('id', 'x2', 'label', 'efficiency')
      ),
      'options',
      jsonb_build_array(
        jsonb_build_object('id', 'yA', 'label', 'extra energy produced'),
        jsonb_build_object('id', 'yB', 'label', 'how well a system converts input to output')
      ),
      'allow_reuse',
      false
    ),
    4,
    '{}'::jsonb
  )
on conflict (id) do nothing;

insert into public.answer_keys (content_unit_id, correct, metadata)
values
  (
    '66666666-6666-6666-6666-666666666662',
    jsonb_build_object('answers', jsonb_build_array('variable')),
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666663',
    jsonb_build_object('option_id', 'B'),
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666664',
    jsonb_build_object('matches', jsonb_build_object('x1', 'yA', 'x2', 'yB')),
    '{}'::jsonb
  )
on conflict (content_unit_id) do nothing;


-- ---------------------------------------------------------------------------
-- Writing Task 2
-- ---------------------------------------------------------------------------
insert into public.content_units (id, part_id, type, data, display_order, metadata)
values
  (
    '66666666-6666-6666-6666-666666666701',
    '55555555-5555-5555-5555-555555555559',
    'instruction',
    jsonb_build_object('text', 'Writing Task 2: You should spend about 40 minutes on this task. Write at least 250 words.'),
    1,
    '{}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666702',
    '55555555-5555-5555-5555-555555555559',
    'question_text',
    jsonb_build_object(
      'prompt',
      'Some people believe that strict rules are necessary for society to function well. Others think people should be free to make their own choices. Discuss both views and give your own opinion.',
      'placeholder',
      'Start typing here...',
      'rows',
      14,
      'show_word_count',
      true,
      'min_words',
      250
    ),
    2,
    '{}'::jsonb
  )
on conflict (id) do nothing;

