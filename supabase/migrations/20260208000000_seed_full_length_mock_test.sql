-- ============================================================================
-- SEED: FULL-LENGTH IELTS MOCK TEST (ORIGINAL, NON-COPYRIGHT)
-- ============================================================================

-- Experience
insert into public.experiences (id, product_id, name, display_order, is_active, metadata)
values (
  '77777777-7777-7777-7777-777777777777'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'IELTS Academic Mock Test 1 (Original)',
  2,
  true,
  '{"format":"academic","version":1,"duration_seconds":9000}'::jsonb
)
on conflict (id) do update set name = excluded.name, display_order = excluded.display_order, is_active = excluded.is_active, metadata = excluded.metadata;

-- Sections
insert into public.sections (id, experience_id, name, display_order, metadata)
values
  ('77777777-7777-7777-7777-777777777701'::uuid, '77777777-7777-7777-7777-777777777777'::uuid, 'Listening', 1, '{"type":"listening","duration_seconds":1800}'::jsonb),
  ('77777777-7777-7777-7777-777777777702'::uuid,  '77777777-7777-7777-7777-777777777777'::uuid, 'Reading',   2, '{"type":"reading","duration_seconds":3600}'::jsonb),
  ('77777777-7777-7777-7777-777777777703'::uuid,  '77777777-7777-7777-7777-777777777777'::uuid, 'Writing',   3, '{"type":"writing","duration_seconds":3600}'::jsonb)
on conflict (id) do update set name = excluded.name, display_order = excluded.display_order, metadata = excluded.metadata;

-- Parts
insert into public.parts (id, section_id, name, display_order, metadata)
values
  ('77777777-7777-7777-7777-777777777711'::uuid, '77777777-7777-7777-7777-777777777701'::uuid, 'Part 1', 1, '{}'::jsonb),
  ('77777777-7777-7777-7777-777777777712'::uuid, '77777777-7777-7777-7777-777777777701'::uuid, 'Part 2', 2, '{}'::jsonb),
  ('77777777-7777-7777-7777-777777777713'::uuid, '77777777-7777-7777-7777-777777777701'::uuid, 'Part 3', 3, '{}'::jsonb),
  ('77777777-7777-7777-7777-777777777714'::uuid, '77777777-7777-7777-7777-777777777701'::uuid, 'Part 4', 4, '{}'::jsonb),
  ('77777777-7777-7777-7777-777777777721'::uuid,   '77777777-7777-7777-7777-777777777702'::uuid,   'Passage 1', 1, '{}'::jsonb),
  ('77777777-7777-7777-7777-777777777722'::uuid,   '77777777-7777-7777-7777-777777777702'::uuid,   'Passage 2', 2, '{}'::jsonb),
  ('77777777-7777-7777-7777-777777777723'::uuid,   '77777777-7777-7777-7777-777777777702'::uuid,   'Passage 3', 3, '{}'::jsonb),
  ('77777777-7777-7777-7777-777777777731'::uuid,   '77777777-7777-7777-7777-777777777703'::uuid,   'Task 1', 1, '{}'::jsonb),
  ('77777777-7777-7777-7777-777777777732'::uuid,   '77777777-7777-7777-7777-777777777703'::uuid,   'Task 2', 2, '{}'::jsonb)
on conflict (id) do update set name = excluded.name, display_order = excluded.display_order, metadata = excluded.metadata;

-- Content units for part 77777777-7777-7777-7777-777777777711
with rows as (
  select * from (values
    ('instruction', 1, '{"text":"Listening Part 1. You will hear a conversation about booking an appointment. Answer Questions 1-10."}'::jsonb, null::jsonb),
    ('audio', 2, '{"tone":{"frequency_hz":440,"duration_seconds":12},"duration_seconds":12,"play_once":true,"auto_start":false}'::jsonb, null::jsonb),
    ('question_gap_fill', 3, '{"prompt":"Complete the notes below. Write ONE word and/or a number for each answer.","text":"APPOINTMENT NOTES\n\nName: {{p1}}\nDay: {{p2}}\nTime: {{p3}}\nLocation: {{p4}}\nReason: {{p5}}\nReference number: {{p6}}","blanks":[{"id":"p1"},{"id":"p2"},{"id":"p3"},{"id":"p4"},{"id":"p5"},{"id":"p6"}]}'::jsonb, '{"blanks":{"p1":["Nadia"],"p2":["Thursday"],"p3":["10:30"],"p4":["Room 14"],"p5":["renewal"],"p6":["4821"]}}'::jsonb),
    ('question_single_choice', 4, '{"prompt":"Question 7: Choose the correct option.","options":[{"id":"A","label":"Option A"},{"id":"B","label":"Option B"},{"id":"C","label":"Option C"}]}'::jsonb, '{"option_id":"B"}'::jsonb),
    ('question_single_choice', 5, '{"prompt":"Question 8: Choose the correct option.","options":[{"id":"A","label":"Option A"},{"id":"B","label":"Option B"},{"id":"C","label":"Option C"}]}'::jsonb, '{"option_id":"A"}'::jsonb),
    ('question_single_choice', 6, '{"prompt":"Question 9: Choose the correct option.","options":[{"id":"A","label":"Option A"},{"id":"B","label":"Option B"},{"id":"C","label":"Option C"}]}'::jsonb, '{"option_id":"B"}'::jsonb),
    ('question_single_choice', 7, '{"prompt":"Question 10: Choose the correct option.","options":[{"id":"A","label":"Option A"},{"id":"B","label":"Option B"},{"id":"C","label":"Option C"}]}'::jsonb, '{"option_id":"A"}'::jsonb)
  ) as v(type, display_order, data, correct)
),
ins as (
  insert into public.content_units (part_id, type, data, display_order, metadata)
  select '77777777-7777-7777-7777-777777777711'::uuid, type, data, display_order, '{}'::jsonb
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

-- Content units for part 77777777-7777-7777-7777-777777777712
with rows as (
  select * from (values
    ('instruction', 1, '{"text":"Listening Part 2. You will hear information about a campus tour. Answer Questions 11-20."}'::jsonb, null::jsonb),
    ('audio', 2, '{"tone":{"frequency_hz":523,"duration_seconds":14},"duration_seconds":14,"play_once":true,"auto_start":false}'::jsonb, null::jsonb),
    ('question_diagram_labeling', 3, '{"prompt":"Label the map. Write ONE word for each answer.","image":{"url":"https://placehold.co/900x420?text=Campus+Map","alt":"Campus map placeholder"},"labels":[{"id":"m1","prompt":"Building near the entrance"},{"id":"m2","prompt":"Cafe name"},{"id":"m3","prompt":"Library section"},{"id":"m4","prompt":"Outdoor area"},{"id":"m5","prompt":"Bus stop"}]}'::jsonb, '{"labels":{"m1":["Administration"],"m2":["Oak"],"m3":["Science"],"m4":["Garden"],"m5":["North"]}}'::jsonb),
    ('question_single_choice', 4, '{"prompt":"Question 16: Choose the correct option.","options":[{"id":"A","label":"A"},{"id":"B","label":"B"},{"id":"C","label":"C"}]}'::jsonb, '{"option_id":"A"}'::jsonb),
    ('question_single_choice', 5, '{"prompt":"Question 17: Choose the correct option.","options":[{"id":"A","label":"A"},{"id":"B","label":"B"},{"id":"C","label":"C"}]}'::jsonb, '{"option_id":"B"}'::jsonb),
    ('question_single_choice', 6, '{"prompt":"Question 18: Choose the correct option.","options":[{"id":"A","label":"A"},{"id":"B","label":"B"},{"id":"C","label":"C"}]}'::jsonb, '{"option_id":"C"}'::jsonb),
    ('question_single_choice', 7, '{"prompt":"Question 19: Choose the correct option.","options":[{"id":"A","label":"A"},{"id":"B","label":"B"},{"id":"C","label":"C"}]}'::jsonb, '{"option_id":"B"}'::jsonb),
    ('question_single_choice', 8, '{"prompt":"Question 20: Choose the correct option.","options":[{"id":"A","label":"A"},{"id":"B","label":"B"},{"id":"C","label":"C"}]}'::jsonb, '{"option_id":"A"}'::jsonb)
  ) as v(type, display_order, data, correct)
),
ins as (
  insert into public.content_units (part_id, type, data, display_order, metadata)
  select '77777777-7777-7777-7777-777777777712'::uuid, type, data, display_order, '{}'::jsonb
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

-- Content units for part 77777777-7777-7777-7777-777777777713
with rows as (
  select * from (values
    ('instruction', 1, '{"text":"Listening Part 3. You will hear a discussion between students about a group project. Answer Questions 21-30."}'::jsonb, null::jsonb),
    ('audio', 2, '{"tone":{"frequency_hz":659,"duration_seconds":16},"duration_seconds":16,"play_once":true,"auto_start":false}'::jsonb, null::jsonb),
    ('question_matching', 3, '{"prompt":"Match each student to the topic they will research.","items":[{"id":"s1","label":"Aisha"},{"id":"s2","label":"Bek"},{"id":"s3","label":"Chen"},{"id":"s4","label":"Daria"},{"id":"s5","label":"Evan"},{"id":"s6","label":"Farah"}],"options":[{"id":"o1","label":"History"},{"id":"o2","label":"Cost"},{"id":"o3","label":"Safety"},{"id":"o4","label":"Design"},{"id":"o5","label":"Environment"},{"id":"o6","label":"Technology"}],"allow_reuse":false}'::jsonb, '{"matches":{"s1":"o5","s2":"o2","s3":"o6","s4":"o4","s5":"o3","s6":"o1"}}'::jsonb),
    ('question_single_choice', 4, '{"prompt":"Question 27: Choose the correct option.","options":[{"id":"A","label":"True for the discussion"},{"id":"B","label":"False for the discussion"},{"id":"C","label":"Not mentioned"}]}'::jsonb, '{"option_id":"C"}'::jsonb),
    ('question_single_choice', 5, '{"prompt":"Question 28: Choose the correct option.","options":[{"id":"A","label":"True for the discussion"},{"id":"B","label":"False for the discussion"},{"id":"C","label":"Not mentioned"}]}'::jsonb, '{"option_id":"A"}'::jsonb),
    ('question_single_choice', 6, '{"prompt":"Question 29: Choose the correct option.","options":[{"id":"A","label":"True for the discussion"},{"id":"B","label":"False for the discussion"},{"id":"C","label":"Not mentioned"}]}'::jsonb, '{"option_id":"B"}'::jsonb),
    ('question_single_choice', 7, '{"prompt":"Question 30: Choose the correct option.","options":[{"id":"A","label":"True for the discussion"},{"id":"B","label":"False for the discussion"},{"id":"C","label":"Not mentioned"}]}'::jsonb, '{"option_id":"A"}'::jsonb)
  ) as v(type, display_order, data, correct)
),
ins as (
  insert into public.content_units (part_id, type, data, display_order, metadata)
  select '77777777-7777-7777-7777-777777777713'::uuid, type, data, display_order, '{}'::jsonb
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

-- Content units for part 77777777-7777-7777-7777-777777777714
with rows as (
  select * from (values
    ('instruction', 1, '{"text":"Listening Part 4. You will hear a short lecture about habit formation. Answer Questions 31-40."}'::jsonb, null::jsonb),
    ('audio', 2, '{"tone":{"frequency_hz":392,"duration_seconds":18},"duration_seconds":18,"play_once":true,"auto_start":false}'::jsonb, null::jsonb),
    ('question_select_from_list', 3, '{"prompt":"Choose the correct words from the list for each blank.","text":"LECTURE NOTES\n\nA habit often begins with a {{b1}}.\nThe next step is the {{b2}} itself.\nA positive {{b3}} makes repetition more likely.\nChanging your {{b4}} can make habits easier.\nReducing {{b5}} improves follow through.\nSimple {{b6}} helps you notice patterns.\nYour {{b7}} can support good decisions.\nA short {{b8}} can prevent burnout.\nDeliberate {{b9}} beats random effort.\nLong term {{b10}} is more important than intensity.","options":[{"id":"cue","label":"cue"},{"id":"routine","label":"routine"},{"id":"reward","label":"reward"},{"id":"identity","label":"identity"},{"id":"friction","label":"friction"},{"id":"tracking","label":"tracking"},{"id":"environment","label":"environment"},{"id":"break","label":"break"},{"id":"practice","label":"practice"},{"id":"consistency","label":"consistency"},{"id":"focus","label":"focus"},{"id":"sleep","label":"sleep"}],"blanks":[{"id":"b1"},{"id":"b2"},{"id":"b3"},{"id":"b4"},{"id":"b5"},{"id":"b6"},{"id":"b7"},{"id":"b8"},{"id":"b9"},{"id":"b10"}],"allow_reuse":false}'::jsonb, '{"blanks":{"b1":["cue"],"b2":["routine"],"b3":["reward"],"b4":["identity"],"b5":["friction"],"b6":["tracking"],"b7":["environment"],"b8":["break"],"b9":["practice"],"b10":["consistency"]}}'::jsonb)
  ) as v(type, display_order, data, correct)
),
ins as (
  insert into public.content_units (part_id, type, data, display_order, metadata)
  select '77777777-7777-7777-7777-777777777714'::uuid, type, data, display_order, '{}'::jsonb
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

-- Content units for part 77777777-7777-7777-7777-777777777721
with rows as (
  select * from (values
    ('instruction', 1, '{"text":"Reading Passage 1. Answer Questions 1-13."}'::jsonb, null::jsonb),
    ('reading_passage', 2, '{"title":"Rooftop Gardens and City Heat","text":"Urban rooftop gardens often look like small islands of green surrounded by concrete.\nIn many cities, these gardens do more than produce vegetables. They can also change local temperatures.\n\nA roof covered with dark materials absorbs sunlight during the day and releases heat at night.\nPlants work differently. Leaves provide shade, and evaporation from soil and plant surfaces removes heat.\nAs a result, a planted roof may stay cooler during hot afternoons.\n\nCooling effects are not identical everywhere. Wind, building height, and humidity all play a role.\nIn some locations, gardeners notice the biggest difference early in the evening when the city air remains warm.\n\nRooftop gardens also influence water flow. Instead of rain running quickly into drains, more water is retained.\nThis can reduce flooding during intense storms and can delay when water reaches street level.\n\nHowever, the benefits depend on design. A shallow layer of soil dries quickly and supports fewer species.\nDeeper systems are heavier and cost more, but they can support shrubs and larger plants.\n\nCity planners increasingly treat green roofs as one tool among many. Shade trees, reflective surfaces,\nand better building insulation can all contribute to cooler neighborhoods and lower energy use."}'::jsonb, null::jsonb),
    ('question_true_false_not_given', 3, '{"prompt":"Choose TRUE, FALSE, or NOT GIVEN.","statements":[{"id":"t1","text":"Rooftop gardens can affect temperatures in cities."},{"id":"t2","text":"Dark roofs always stay cooler than planted roofs in the afternoon."},{"id":"t3","text":"Evaporation is one reason planted roofs can be cooler."},{"id":"t4","text":"All rooftop gardens create the same cooling effect regardless of wind."},{"id":"t5","text":"Green roofs can slow the movement of rainwater."},{"id":"t6","text":"Shallow soil supports more species than deep soil."},{"id":"t7","text":"City planners use green roofs as the only solution for urban heat."}]}'::jsonb, '{"matches":{"t1":"T","t2":"F","t3":"T","t4":"F","t5":"T","t6":"F","t7":"F"}}'::jsonb),
    ('question_matching_headings', 4, '{"prompt":"Match each paragraph to the correct heading.","items":[{"id":"h1","label":"Paragraph A (lines 1-2)"},{"id":"h2","label":"Paragraph B (lines 3-5)"},{"id":"h3","label":"Paragraph C (lines 6-7)"},{"id":"h4","label":"Paragraph D (lines 8-9)"},{"id":"h5","label":"Paragraph E (lines 10-11)"},{"id":"h6","label":"Paragraph F (lines 12-13)"}],"options":[{"id":"A","label":"How plants reduce heat"},{"id":"B","label":"Different results in different conditions"},{"id":"C","label":"Water management benefits"},{"id":"D","label":"Design tradeoffs"},{"id":"E","label":"A tool within a wider strategy"},{"id":"F","label":"A simple introduction"}],"allow_reuse":false}'::jsonb, '{"matches":{"h1":"F","h2":"A","h3":"B","h4":"C","h5":"D","h6":"E"}}'::jsonb)
  ) as v(type, display_order, data, correct)
),
ins as (
  insert into public.content_units (part_id, type, data, display_order, metadata)
  select '77777777-7777-7777-7777-777777777721'::uuid, type, data, display_order, '{}'::jsonb
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

-- Content units for part 77777777-7777-7777-7777-777777777722
with rows as (
  select * from (values
    ('instruction', 1, '{"text":"Reading Passage 2. Answer Questions 14-26."}'::jsonb, null::jsonb),
    ('reading_passage', 2, '{"title":"Why Some Teams Move Faster","text":"Some teams move quickly because they share information openly.\nOthers slow down even when people work hard.\n\nOne reason is hidden assumptions. When a team member believes that a task is obvious, they may skip details.\nAnother person may interpret the same words differently, and both will feel frustrated.\n\nShort written summaries can reduce confusion. A summary does not need to be long.\nIt needs to be precise about decisions, next steps, and owners.\n\nMeeting habits also matter. A meeting that ends without a clear list of actions often creates repeated conversations.\nIn contrast, a short meeting with a clear agenda can save time later.\n\nFinally, psychological safety plays a role. People share bad news sooner when they do not fear blame.\nEarly warnings are useful because they give the group time to adjust."}'::jsonb, null::jsonb),
    ('question_sentence_endings', 3, '{"prompt":"Match the sentence beginnings to the correct endings.","items":[{"id":"e1","label":"Hidden assumptions can"},{"id":"e2","label":"A written summary should"},{"id":"e3","label":"Meetings without action lists often"},{"id":"e4","label":"A clear agenda can"},{"id":"e5","label":"Psychological safety helps people"},{"id":"e6","label":"Early warnings are useful because"}],"options":[{"id":"A","label":"make communication slower and more painful."},{"id":"B","label":"be short but precise."},{"id":"C","label":"lead to repeated conversations."},{"id":"D","label":"save time later."},{"id":"E","label":"share bad news sooner."},{"id":"F","label":"they allow time to adjust."}],"allow_reuse":false}'::jsonb, '{"matches":{"e1":"A","e2":"B","e3":"C","e4":"D","e5":"E","e6":"F"}}'::jsonb),
    ('question_gap_fill', 4, '{"prompt":"Complete the summary. Write ONE word for each blank.","text":"Teams slow down when they have {{g1}} assumptions and when people skip important {{g2}}. Short written {{g3}} can reduce confusion by listing decisions and {{g4}}. Meetings should end with clear {{g5}}, and a simple {{g6}} can help. When there is psychological {{g7}}, people share bad news earlier.","blanks":[{"id":"g1"},{"id":"g2"},{"id":"g3"},{"id":"g4"},{"id":"g5"},{"id":"g6"},{"id":"g7"}]}'::jsonb, '{"blanks":{"g1":["hidden"],"g2":["details"],"g3":["summaries"],"g4":["owners"],"g5":["actions"],"g6":["agenda"],"g7":["safety"]}}'::jsonb)
  ) as v(type, display_order, data, correct)
),
ins as (
  insert into public.content_units (part_id, type, data, display_order, metadata)
  select '77777777-7777-7777-7777-777777777722'::uuid, type, data, display_order, '{}'::jsonb
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

-- Content units for part 77777777-7777-7777-7777-777777777723
with rows as (
  select * from (values
    ('instruction', 1, '{"text":"Reading Passage 3. Answer Questions 27-40."}'::jsonb, null::jsonb),
    ('reading_passage', 2, '{"title":"Learning Discomfort and Progress","text":"When people learn a new skill, the early stage is often uncomfortable.\nErrors are frequent, and progress can feel invisible.\n\nA common mistake is to judge improvement by mood. Some days feel easy, and other days feel difficult.\nBut difficulty is not always a sign of failure. It can be a sign that your brain is adapting.\n\nAnother mistake is to practice without feedback. Feedback can come from a teacher, a recording, or a checklist.\nWithout feedback, practice may reinforce habits that are not helpful.\n\nFinally, many learners use goals that are too vague. A clear goal describes what you will do, when you will do it,\nand how you will measure success. Small goals create momentum."}'::jsonb, null::jsonb),
    ('question_select_from_list', 3, '{"prompt":"Choose the correct words from the list for each blank.","text":"Learners sometimes judge progress by {{s1}} even though difficulty can mean the brain is {{s2}}. Practice improves faster with {{s3}} such as a {{s4}}. Goals should not be too {{s5}} and should include a way to {{s6}} results. Small goals build {{s7}}.","options":[{"id":"mood","label":"mood"},{"id":"adapting","label":"adapting"},{"id":"feedback","label":"feedback"},{"id":"checklist","label":"checklist"},{"id":"vague","label":"vague"},{"id":"measure","label":"measure"},{"id":"momentum","label":"momentum"},{"id":"errors","label":"errors"},{"id":"teacher","label":"teacher"},{"id":"skill","label":"skill"}],"blanks":[{"id":"s1"},{"id":"s2"},{"id":"s3"},{"id":"s4"},{"id":"s5"},{"id":"s6"},{"id":"s7"}],"allow_reuse":false}'::jsonb, '{"blanks":{"s1":["mood"],"s2":["adapting"],"s3":["feedback"],"s4":["checklist"],"s5":["vague"],"s6":["measure"],"s7":["momentum"]}}'::jsonb),
    ('question_single_choice', 4, '{"prompt":"Choose the correct answer for Question 38.","options":[{"id":"A","label":"Option A"},{"id":"B","label":"Option B"},{"id":"C","label":"Option C"},{"id":"D","label":"Option D"}]}'::jsonb, '{"option_id":"B"}'::jsonb),
    ('question_single_choice', 5, '{"prompt":"Choose the correct answer for Question 39.","options":[{"id":"A","label":"Option A"},{"id":"B","label":"Option B"},{"id":"C","label":"Option C"},{"id":"D","label":"Option D"}]}'::jsonb, '{"option_id":"C"}'::jsonb),
    ('question_single_choice', 6, '{"prompt":"Choose the correct answer for Question 40.","options":[{"id":"A","label":"Option A"},{"id":"B","label":"Option B"},{"id":"C","label":"Option C"},{"id":"D","label":"Option D"}]}'::jsonb, '{"option_id":"A"}'::jsonb),
    ('question_single_choice', 7, '{"prompt":"Choose the correct answer for Question 41.","options":[{"id":"A","label":"Option A"},{"id":"B","label":"Option B"},{"id":"C","label":"Option C"},{"id":"D","label":"Option D"}]}'::jsonb, '{"option_id":"D"}'::jsonb),
    ('question_single_choice', 8, '{"prompt":"Choose the correct answer for Question 42.","options":[{"id":"A","label":"Option A"},{"id":"B","label":"Option B"},{"id":"C","label":"Option C"},{"id":"D","label":"Option D"}]}'::jsonb, '{"option_id":"B"}'::jsonb),
    ('question_single_choice', 9, '{"prompt":"Choose the correct answer for Question 43.","options":[{"id":"A","label":"Option A"},{"id":"B","label":"Option B"},{"id":"C","label":"Option C"},{"id":"D","label":"Option D"}]}'::jsonb, '{"option_id":"A"}'::jsonb),
    ('question_single_choice', 10, '{"prompt":"Choose the correct answer for Question 44.","options":[{"id":"A","label":"Option A"},{"id":"B","label":"Option B"},{"id":"C","label":"Option C"},{"id":"D","label":"Option D"}]}'::jsonb, '{"option_id":"C"}'::jsonb)
  ) as v(type, display_order, data, correct)
),
ins as (
  insert into public.content_units (part_id, type, data, display_order, metadata)
  select '77777777-7777-7777-7777-777777777723'::uuid, type, data, display_order, '{}'::jsonb
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

-- Content units for part 77777777-7777-7777-7777-777777777731
with rows as (
  select * from (values
    ('instruction', 1, '{"text":"Writing Task 1. You should spend about 20 minutes on this task."}'::jsonb, null::jsonb),
    ('question_text', 2, '{"prompt":"Write at least 150 words.\n\nDescribe a chart or process you invent yourself. Explain the main stages or trends clearly.","placeholder":"Start typing here...","rows":18,"show_word_count":true,"min_words":150}'::jsonb, null::jsonb)
  ) as v(type, display_order, data, correct)
),
ins as (
  insert into public.content_units (part_id, type, data, display_order, metadata)
  select '77777777-7777-7777-7777-777777777731'::uuid, type, data, display_order, '{}'::jsonb
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

-- Content units for part 77777777-7777-7777-7777-777777777732
with rows as (
  select * from (values
    ('instruction', 1, '{"text":"Writing Task 2. You should spend about 40 minutes on this task. Write at least 250 words."}'::jsonb, null::jsonb),
    ('question_text', 2, '{"prompt":"Some people think that technology makes learning easier. Others think it makes learning more distracting.\n\nDiscuss both views and give your own opinion.","placeholder":"Start typing here...","rows":22,"show_word_count":true,"min_words":250}'::jsonb, null::jsonb)
  ) as v(type, display_order, data, correct)
),
ins as (
  insert into public.content_units (part_id, type, data, display_order, metadata)
  select '77777777-7777-7777-7777-777777777732'::uuid, type, data, display_order, '{}'::jsonb
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
