-- ============================================================================
-- Real-life tasks (english-immersion): step format v2 + 16 missions
-- ----------------------------------------------------------------------------
-- Steps are now one of: read (notice + choice questions), listen (spoken
-- message + choice questions), reply (written message), speak (spoken reply).
-- expected_answer_json holds the answer key (questions[].answer), or for
-- reply/speak: goal, points[{label, any[]}] and model_answer. The
-- immersion-missions function strips all of it before sending a step.
--
-- Rewrites the 3 original missions and adds 13 more:
--   A2: 4 · B1: 5 · B2: 4 · C1: 3
-- Every mission is registered in learning_content_registry_items
-- (content_type 'immersion.mission', source_ref = slug, minutes = sum of steps).
-- Generated from reviewed source content; idempotent.
-- ============================================================================

alter table public.immersion_mission_steps drop constraint if exists immersion_mission_steps_step_type_check;
alter table public.immersion_mission_steps add constraint immersion_mission_steps_step_type_check
  check (step_type in ('read', 'listen', 'reply', 'speak', 'reading', 'listening', 'writing', 'speaking', 'vocabulary', 'decision'));

do $$
declare
  v_en_id uuid;
  v_product_id uuid;
  v_mission_id uuid;
begin
  select id into v_en_id from public.languages where code = 'en' limit 1;
  if v_en_id is null then
    raise exception 'language en not found';
  end if;

  select p.id into v_product_id
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) = 'english-immersion'
  order by p.created_at asc
  limit 1;
  if v_product_id is null then
    raise exception 'english-immersion product not found; seed product first';
  end if;

  -- A2 · study-group-room-change
  insert into public.immersion_missions (
    product_id, language_id, slug, title, context_text, objective_text, mission_type, level,
    target_vocabulary, target_grammar, skill_mix, success_conditions_json, cultural_note, status, sort_order, metadata
  ) values (
    v_product_id, v_en_id, 'study-group-room-change', 'Study group: the room has changed',
    'Your English study group meets every Wednesday at five o''clock in Room 204. Today there is a problem with the room. You need to find the new plan and tell your group.',
    'Find the new place and time, then tell your group clearly.',
    'study', 'A2',
    array['closed', 'instead', 'as usual', 'first floor', 'free from']::text[], 'present continuous for plans (We''re meeting at five.)', array['reading', 'listening', 'writing', 'speaking']::text[],
    '["Find the new place and time in the notice and the message","Tell the group where and when you are meeting","Say why the plan changed in one short sentence"]'::jsonb,
    'In many schools and offices, people write group messages with the key facts first: place, time, then the reason. A short, clear message is polite, not rude.',
    'published', 110, '{"seeded_by":"20261022181500_english_immersion_missions_v2","format":"steps_v2"}'::jsonb
  )
  on conflict (product_id, language_id, slug) do update set
    title = excluded.title, context_text = excluded.context_text, objective_text = excluded.objective_text,
    mission_type = excluded.mission_type, level = excluded.level, target_vocabulary = excluded.target_vocabulary,
    target_grammar = excluded.target_grammar, skill_mix = excluded.skill_mix,
    success_conditions_json = excluded.success_conditions_json, cultural_note = excluded.cultural_note,
    status = excluded.status, sort_order = excluded.sort_order,
    metadata = coalesce(public.immersion_missions.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now()
  returning id into v_mission_id;

  insert into public.immersion_mission_steps (
    mission_id, step_index, service_key, step_type, title, instructions, prompt_text, expected_answer_json,
    target_skill_key, estimated_minutes, status, metadata
  ) values
    (v_mission_id, 0, 'reading', 'read', 'Read the notice on the door', 'Read the notice. Then answer the questions.', 'NOTICE
Room 204 is closed today because the heating is broken.
Study groups that usually meet here can use Room 112 on the first floor. Room 112 is free from 4:30 pm. It has ten chairs.
Larger groups can use the library café.
— Building office', '{"questions":[{"id":"q1","prompt":"Why is Room 204 closed today?","options":["The heating is broken.","It is being cleaned.","A teacher is using it."],"answer":0,"explanation":"The notice says Room 204 is closed \"because the heating is broken\"."},{"id":"q2","prompt":"When is Room 112 free?","options":["From 4 pm","From 4:30 pm","All day"],"answer":1,"explanation":"The notice says \"Room 112 is free from 4:30 pm\"."}]}'::jsonb, 'reading.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 1, 'listening', 'listen', 'Listen to your group leader', 'Your group leader, Dilnoza, sends a voice message. Listen, then answer the questions. You can listen again.', 'Hi, it''s Dilnoza. I saw the notice about Room 204. Room 112 is OK, but we are twelve people and it only has ten chairs. So let''s meet in the library café instead. Same time as usual, at five o''clock. Can you tell the others, please? Thanks!', '{"questions":[{"id":"q1","prompt":"Where will the group meet today?","options":["In Room 112","In the library café","In Room 204"],"answer":1,"explanation":"Dilnoza says \"let''s meet in the library café instead\"."},{"id":"q2","prompt":"Why doesn''t Dilnoza want Room 112?","options":["It opens too late.","It doesn''t have enough chairs.","It is too far away."],"answer":1,"explanation":"The group has twelve people, but Room 112 \"only has ten chairs\"."}]}'::jsonb, 'listening.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2","accent":"gb"}'::jsonb),
    (v_mission_id, 2, 'writing', 'reply', 'Write to the group chat', 'Answer Aziz in the group chat. Say where and when the group is meeting today, and why the plan changed.', 'Group chat
Aziz: Are we meeting in Room 204 today as usual?', '{"goal":"Tell the group the new meeting place and time, and why it changed.","points":[{"label":"say the new place","any":["library","caf*"]},{"label":"give the time","any":["five","5","5pm","o''clock","same time","usual time","normal time"]},{"label":"explain why the plan changed","any":["closed","heating","broken","cold","chairs","not enough","too small","twelve","12","too many"]}],"model_answer":"Hi everyone! Room 204 is closed today because the heating is broken. Room 112 is too small for us, so we are meeting in the library café. The time is the same: five o''clock. See you there!"}'::jsonb, 'writing.task_completion', 4, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 3, 'speaking', 'speak', 'Tell a classmate', 'Timur, from your group, stops you in the corridor. Answer him out loud. Tell him the place, the time, and why it changed.', 'Timur: Hi! Are you going to the study group today? Is it in the usual room?', '{"goal":"Tell Timur the new place and time and why it changed.","points":[{"label":"say the new place","any":["library","caf*"]},{"label":"give the time","any":["five","5","o''clock","same time","usual time"]},{"label":"say the old room is closed","any":["closed","not open","can''t use","cannot use","heating","broken","cold","too small","chairs"]}],"model_answer":"Yes, I''m going, but not to the usual room. Room 204 is closed today. We''re meeting in the library café at five o''clock. See you there!"}'::jsonb, 'speaking.task_completion', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb)
  on conflict (mission_id, step_index) do update set
    service_key = excluded.service_key, step_type = excluded.step_type, title = excluded.title,
    instructions = excluded.instructions, prompt_text = excluded.prompt_text,
    expected_answer_json = excluded.expected_answer_json, target_skill_key = excluded.target_skill_key,
    estimated_minutes = excluded.estimated_minutes, status = excluded.status,
    metadata = coalesce(public.immersion_mission_steps.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now();

  update public.immersion_mission_steps set status = 'archived', updated_at = now()
  where mission_id = v_mission_id and step_index >= 4 and status <> 'archived';

  -- A2 · doctors-appointment-change
  insert into public.immersion_missions (
    product_id, language_id, slug, title, context_text, objective_text, mission_type, level,
    target_vocabulary, target_grammar, skill_mix, success_conditions_json, cultural_note, status, sort_order, metadata
  ) values (
    v_product_id, v_en_id, 'doctors-appointment-change', 'Changing a doctor''s appointment',
    'You have an appointment at a health clinic on Monday at 9:00, but you have an exam that morning. You need to change the appointment.',
    'Ask the clinic for a new time, choose a time that works and give your details.',
    'service', 'A2',
    array['appointment', 'reminder', 'fully booked', 'free', 'instead']::text[], 'can / could for requests (Could I have another time?)', array['reading', 'writing', 'listening', 'speaking']::text[],
    '["Understand the clinic''s rules for changing an appointment","Ask politely for a new time and give a short reason","Choose a new time and give your name"]'::jsonb,
    'When you change an appointment in English, a short reason is enough ("I have an exam"). You don''t need to give details. Many clinics ask you to change at least a day before, so it is polite to contact them early.',
    'published', 120, '{"seeded_by":"20261022181500_english_immersion_missions_v2","format":"steps_v2"}'::jsonb
  )
  on conflict (product_id, language_id, slug) do update set
    title = excluded.title, context_text = excluded.context_text, objective_text = excluded.objective_text,
    mission_type = excluded.mission_type, level = excluded.level, target_vocabulary = excluded.target_vocabulary,
    target_grammar = excluded.target_grammar, skill_mix = excluded.skill_mix,
    success_conditions_json = excluded.success_conditions_json, cultural_note = excluded.cultural_note,
    status = excluded.status, sort_order = excluded.sort_order,
    metadata = coalesce(public.immersion_missions.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now()
  returning id into v_mission_id;

  insert into public.immersion_mission_steps (
    mission_id, step_index, service_key, step_type, title, instructions, prompt_text, expected_answer_json,
    target_skill_key, estimated_minutes, status, metadata
  ) values
    (v_mission_id, 0, 'reading', 'read', 'Read the reminder', 'You get this text message from the clinic. Read it and answer the questions.', 'Sunrise Health Clinic: Reminder. You have an appointment with Dr Karimova on Monday 14 April at 9:00. Please arrive 10 minutes early and bring your ID card. To change or cancel, use our online form or call 71 200 45 45 at least 24 hours before.', '{"questions":[{"id":"q1","prompt":"What must you bring?","options":["Your ID card","A photo","Your exam results"],"answer":0,"explanation":"The message says \"bring your ID card\"."},{"id":"q2","prompt":"When must you contact the clinic to change the time?","options":["One hour before","At least 24 hours before","On Monday morning"],"answer":1,"explanation":"The message says \"at least 24 hours before\"."}]}'::jsonb, 'reading.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 1, 'writing', 'reply', 'Use the online form', 'Write a short message in the clinic''s online form. Say you can''t come on Monday and why, ask for another time, and finish politely.', 'Sunrise Health Clinic — Change or cancel an appointment
Please tell us what you need.', '{"goal":"Ask the clinic to move the Monday appointment to another time, with a short reason.","points":[{"label":"say you can''t come on Monday","any":["can''t come","cant come","cannot come","can''t make it","won''t be able","will not be able","not able to come","can''t be there","unable","not free","busy"]},{"label":"give a short reason","any":["exam","test","because","class","lesson","work"]},{"label":"ask for another time","any":["another time","another day","different time","different day","other time","new time","reschedul*","later","next week","other day","move","tuesday","wednesday","thursday","friday","afternoon"]},{"label":"finish politely","any":["thank*","cheers","appreciate","grateful","best regards","kind regards","regards","best wishes"]}],"model_answer":"Hello, my name is Malika Tursunova. I have an appointment with Dr Karimova on Monday at 9:00, but I can''t come because I have an exam that morning. Could I have another time later in the week? Thank you."}'::jsonb, 'writing.task_completion', 4, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 2, 'listening', 'listen', 'Listen to the receptionist', 'The receptionist calls you back. Listen and answer the questions. You can listen again.', 'Good morning, this is Sunrise Health Clinic. Thank you for your message. I''m sorry, Dr Karimova is fully booked on Monday and Tuesday. She is free on Wednesday at half past eleven, or on Thursday at a quarter past three in the afternoon. Or, if you prefer, Dr Aliev is free on Tuesday at ten o''clock. Which time is best for you?', '{"questions":[{"id":"q1","prompt":"When is Dr Karimova free?","options":["Monday at 9:00 or Tuesday at 10:00","Wednesday at 11:30 or Thursday at 3:15 pm","Only on Thursday morning"],"answer":1,"explanation":"She is free \"on Wednesday at half past eleven, or on Thursday at a quarter past three\"."},{"id":"q2","prompt":"Who can see you on Tuesday?","options":["Dr Karimova","Dr Aliev","Nobody"],"answer":1,"explanation":"The receptionist says \"Dr Aliev is free on Tuesday at ten o''clock\"."}]}'::jsonb, 'listening.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2","accent":"gb"}'::jsonb),
    (v_mission_id, 3, 'speaking', 'speak', 'Choose a new time', 'Answer the receptionist out loud. Choose one of the free times, give your full name and say thank you. (You can use a made-up name.)', 'Receptionist: So, which time is best for you? And can I have your name?', '{"goal":"Choose one of the offered times, give a name and thank the receptionist.","points":[{"label":"choose one of the free times","any":["wednesday","thursday","tuesday","11 30","eleven thirty","half past eleven","3 15","three fifteen","quarter past three","aliev","ten o''clock"]},{"label":"give your name","any":["my name","name is","i''m","i am","this is","it''s"]},{"label":"say thank you","any":["thank*","cheers","appreciate","grateful"]}],"model_answer":"Wednesday at half past eleven is best for me, please. My name is Malika Tursunova. Thank you very much!"}'::jsonb, 'speaking.task_completion', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb)
  on conflict (mission_id, step_index) do update set
    service_key = excluded.service_key, step_type = excluded.step_type, title = excluded.title,
    instructions = excluded.instructions, prompt_text = excluded.prompt_text,
    expected_answer_json = excluded.expected_answer_json, target_skill_key = excluded.target_skill_key,
    estimated_minutes = excluded.estimated_minutes, status = excluded.status,
    metadata = coalesce(public.immersion_mission_steps.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now();

  update public.immersion_mission_steps set status = 'archived', updated_at = now()
  where mission_id = v_mission_id and step_index >= 4 and status <> 'archived';

  -- A2 · returning-faulty-headphones
  insert into public.immersion_missions (
    product_id, language_id, slug, title, context_text, objective_text, mission_type, level,
    target_vocabulary, target_grammar, skill_mix, success_conditions_json, cultural_note, status, sort_order, metadata
  ) values (
    v_product_id, v_en_id, 'returning-faulty-headphones', 'Returning faulty headphones',
    'Last week you bought headphones from an electronics shop. Now the left side does not work. You go back to the shop.',
    'Explain the problem in the shop, understand the offer and tell a friend what happened.',
    'service', 'A2',
    array['receipt', 'refund', 'exchange', 'broken', 'order']::text[], 'past simple (I bought them last week.)', array['reading', 'speaking', 'listening', 'writing']::text[],
    '["Know what to bring to return an item","Explain the problem and say what you want","Understand the shop''s offer and tell someone about it"]'::jsonb,
    'In many shops, staff start with "How can I help?". One calm sentence about the problem and one about what you want ("Could I exchange these, please?") usually works better than a long story. Keep your receipt or order email.',
    'published', 130, '{"seeded_by":"20261022181500_english_immersion_missions_v2","format":"steps_v2"}'::jsonb
  )
  on conflict (product_id, language_id, slug) do update set
    title = excluded.title, context_text = excluded.context_text, objective_text = excluded.objective_text,
    mission_type = excluded.mission_type, level = excluded.level, target_vocabulary = excluded.target_vocabulary,
    target_grammar = excluded.target_grammar, skill_mix = excluded.skill_mix,
    success_conditions_json = excluded.success_conditions_json, cultural_note = excluded.cultural_note,
    status = excluded.status, sort_order = excluded.sort_order,
    metadata = coalesce(public.immersion_missions.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now()
  returning id into v_mission_id;

  insert into public.immersion_mission_steps (
    mission_id, step_index, service_key, step_type, title, instructions, prompt_text, expected_answer_json,
    target_skill_key, estimated_minutes, status, metadata
  ) values
    (v_mission_id, 0, 'reading', 'read', 'Read the returns rules', 'Read the shop''s returns information. Then answer the questions.', 'RETURNS
You can return any item within 30 days. Please bring the item, the box and your receipt.
If an item is faulty, we will repair it, replace it or give you your money back.
Items bought in the sale can be exchanged, but we cannot give a refund.
Opening hours: Monday to Saturday, 10:00–20:00.', '{"questions":[{"id":"q1","prompt":"What do you need to bring?","options":["Only the receipt","The item, the box and the receipt","Your bank card"],"answer":1,"explanation":"The rules say \"bring the item, the box and your receipt\"."},{"id":"q2","prompt":"What happens if you bought the item in the sale?","options":["You can get your money back.","You can exchange it, but you can''t get a refund.","You can''t bring it back."],"answer":1,"explanation":"Sale items \"can be exchanged, but we cannot give a refund\"."}]}'::jsonb, 'reading.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 1, 'speaking', 'speak', 'Explain the problem', 'You are at the counter. Say out loud what you bought, what the problem is and what you would like.', 'Shop assistant: Hello! How can I help you today?', '{"goal":"Explain what is wrong with the headphones and ask for a solution.","points":[{"label":"say what you bought","any":["headphone*","earphone*","bought"]},{"label":"describe the problem","any":["doesn''t work","does not work","don''t work","isn''t working","not working","broken","no sound","can''t hear","left side","stopped working","faulty","problem"]},{"label":"say what you would like","any":["refund","money back","new one","new pair","replace*","exchange","another pair","repair","fix","change them","change it"]}],"model_answer":"Hello. I bought these headphones here last week, but the left side doesn''t work. There''s no sound. Can I have a new pair or my money back, please?"}'::jsonb, 'speaking.task_completion', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 2, 'listening', 'listen', 'Listen to the shop assistant', 'Listen to the shop assistant''s answer. Then answer the questions.', 'I''m sorry about that. Let me check your receipt... Yes, you bought them nine days ago, so that''s no problem. We don''t have this model in black at the moment, only in white. I can give you a white pair today, or I can order a black pair for you. It will arrive on Friday. Or, if you like, I can give you your money back.', '{"questions":[{"id":"q1","prompt":"What colour can you get today?","options":["Black","White","Blue"],"answer":1,"explanation":"The assistant says the shop has this model \"only in white\" today."},{"id":"q2","prompt":"When will a black pair arrive?","options":["Today","On Friday","In nine days"],"answer":1,"explanation":"\"It will arrive on Friday.\""}]}'::jsonb, 'listening.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2","accent":"us"}'::jsonb),
    (v_mission_id, 3, 'writing', 'reply', 'Text your friend', 'Your friend asks about your headphones. Write a message: say what was wrong, what the shop offered and what you decided.', 'Sardor: Hey, did you take your headphones back? What did they say?', '{"goal":"Tell a friend what the problem was, what the shop offered and what you chose.","points":[{"label":"say what was wrong","any":["left side","broken","didn''t work","did not work","wasn''t working","not working","no sound","faulty"]},{"label":"say what the shop offered","any":["white","black","friday","money back","refund","new pair","new ones","order","exchange","replace*"]},{"label":"say what you decided","any":["i''ll take","i will take","i took","i chose","i choose","decided","i want","i''m going to","i''ll wait","i will wait","i got","i''m waiting","i asked for"]}],"model_answer":"Hi Sardor! Yes, I went to the shop today. The left side didn''t work, so they offered me a new pair. They only had white ones today, so I''ll wait for a black pair. It arrives on Friday!"}'::jsonb, 'writing.task_completion', 4, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb)
  on conflict (mission_id, step_index) do update set
    service_key = excluded.service_key, step_type = excluded.step_type, title = excluded.title,
    instructions = excluded.instructions, prompt_text = excluded.prompt_text,
    expected_answer_json = excluded.expected_answer_json, target_skill_key = excluded.target_skill_key,
    estimated_minutes = excluded.estimated_minutes, status = excluded.status,
    metadata = coalesce(public.immersion_mission_steps.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now();

  update public.immersion_mission_steps set status = 'archived', updated_at = now()
  where mission_id = v_mission_id and step_index >= 4 and status <> 'archived';

  -- A2 · ordering-lunch-for-friends
  insert into public.immersion_missions (
    product_id, language_id, slug, title, context_text, objective_text, mission_type, level,
    target_vocabulary, target_grammar, skill_mix, success_conditions_json, cultural_note, status, sort_order, metadata
  ) values (
    v_product_id, v_en_id, 'ordering-lunch-for-friends', 'Ordering lunch for your friends',
    'You are at a café with three classmates after class. Your friends find a table, and you go to the counter to order for everyone.',
    'Understand the menu and your friends'' orders, order clearly, and deal with a small problem.',
    'social', 'A2',
    array['lunch deal', 'without', 'sold out', 'instead', 'drink']::text[], 'polite requests (Could I have…? / I''d like…)', array['reading', 'listening', 'speaking', 'writing']::text[],
    '["Find the right food on the menu","Order for everyone with the right changes","Tell a friend about a problem and offer other choices"]'::jsonb,
    'When you order for other people, say one person''s order at a time and say changes clearly: "one chicken wrap, no onions". Staff often repeat the order back to you, so listen and check it.',
    'published', 140, '{"seeded_by":"20261022181500_english_immersion_missions_v2","format":"steps_v2"}'::jsonb
  )
  on conflict (product_id, language_id, slug) do update set
    title = excluded.title, context_text = excluded.context_text, objective_text = excluded.objective_text,
    mission_type = excluded.mission_type, level = excluded.level, target_vocabulary = excluded.target_vocabulary,
    target_grammar = excluded.target_grammar, skill_mix = excluded.skill_mix,
    success_conditions_json = excluded.success_conditions_json, cultural_note = excluded.cultural_note,
    status = excluded.status, sort_order = excluded.sort_order,
    metadata = coalesce(public.immersion_missions.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now()
  returning id into v_mission_id;

  insert into public.immersion_mission_steps (
    mission_id, step_index, service_key, step_type, title, instructions, prompt_text, expected_answer_json,
    target_skill_key, estimated_minutes, status, metadata
  ) values
    (v_mission_id, 0, 'reading', 'read', 'Read the menu', 'Read the menu board. Then answer the questions.', 'LUNCH MENU
Soup of the day (tomato) — 18,000 so''m
Chicken wrap — 32,000
Vegetable pasta — 35,000
Beef burger with chips — 45,000
Drinks: tea 8,000 · lemonade 12,000
LUNCH DEAL (12:00–15:00): any wrap or pasta + a drink — 40,000', '{"questions":[{"id":"q1","prompt":"What is in the lunch deal?","options":["A burger and chips","A wrap or pasta and a drink","Soup and tea"],"answer":1,"explanation":"The lunch deal is \"any wrap or pasta + a drink\"."},{"id":"q2","prompt":"Which dish has no meat?","options":["Chicken wrap","Vegetable pasta","Beef burger"],"answer":1,"explanation":"Vegetable pasta is the only main dish without chicken or beef."}]}'::jsonb, 'reading.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 1, 'listening', 'listen', 'Listen to your friend''s message', 'Your friend Kamola sends a voice message with everyone''s order. Listen and answer the questions.', 'Hi! I''m getting a table outside. So, for me, the vegetable pasta and a lemonade, please. Bekzod wants the chicken wrap, but with no onions. And Laylo isn''t very hungry, so just the tomato soup and a tea for her. Thanks! Oh, and use the lunch deal. It''s cheaper.', '{"questions":[{"id":"q1","prompt":"What does Bekzod want?","options":["Vegetable pasta","A chicken wrap with no onions","Tomato soup"],"answer":1,"explanation":"Kamola says \"Bekzod wants the chicken wrap, but with no onions\"."},{"id":"q2","prompt":"Why does Laylo only want soup?","options":["She isn''t very hungry.","She doesn''t eat meat.","The pasta is too expensive."],"answer":0,"explanation":"Kamola says \"Laylo isn''t very hungry\"."}]}'::jsonb, 'listening.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2","accent":"gb"}'::jsonb),
    (v_mission_id, 2, 'speaking', 'speak', 'Order at the counter', 'Order for your friends out loud. Say what each person wants. Remember: Bekzod''s wrap has no onions.', 'Café worker: Hi there! What can I get you?', '{"goal":"Order pasta and lemonade, a chicken wrap with no onions, and tomato soup with tea, politely.","points":[{"label":"order the pasta","any":["pasta"]},{"label":"order the wrap with no onions","any":["no onion*","without onion*","no onion"]},{"label":"order the soup","any":["soup"]},{"label":"ask politely","any":["please","could i","can i have","i''d like","i would like","we''d like","we would like"]}],"model_answer":"Hi! Could I have one vegetable pasta and a lemonade, and one chicken wrap with no onions, please? And one tomato soup and a tea. We''d like the lunch deal, please."}'::jsonb, 'speaking.task_completion', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 3, 'writing', 'reply', 'Message Bekzod', 'There is a problem. Write a message to Bekzod: tell him, give him one or two other choices from the menu, and ask what he wants.', 'Café worker: Sorry, the chicken wrap is sold out today.', '{"goal":"Tell Bekzod the wrap is not available, suggest other dishes and ask him to choose.","points":[{"label":"tell him there are no wraps","any":["no more","finished","none left","don''t have","do not have","haven''t got","not available","no wraps","aren''t any","all gone","they have no","can''t get","there''s no","there is no"]},{"label":"suggest another dish","any":["burger","pasta","soup","something else","another","instead","different"]},{"label":"ask what he wants","any":["what do you want","what would you like","which one","do you want","would you like","tell me","let me know","ok for you","okay for you","is that ok","is that okay"]}],"model_answer":"Hi Bekzod! Sorry, they don''t have any chicken wraps today. You can have the vegetable pasta or a burger with chips instead. Which one do you want? Tell me quickly, please!"}'::jsonb, 'writing.task_completion', 4, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb)
  on conflict (mission_id, step_index) do update set
    service_key = excluded.service_key, step_type = excluded.step_type, title = excluded.title,
    instructions = excluded.instructions, prompt_text = excluded.prompt_text,
    expected_answer_json = excluded.expected_answer_json, target_skill_key = excluded.target_skill_key,
    estimated_minutes = excluded.estimated_minutes, status = excluded.status,
    metadata = coalesce(public.immersion_mission_steps.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now();

  update public.immersion_mission_steps set status = 'archived', updated_at = now()
  where mission_id = v_mission_id and step_index >= 4 and status <> 'archived';

  -- B1 · airport-check-in-change-request
  insert into public.immersion_missions (
    product_id, language_id, slug, title, context_text, objective_text, mission_type, level,
    target_vocabulary, target_grammar, skill_mix, success_conditions_json, cultural_note, status, sort_order, metadata
  ) values (
    v_product_id, v_en_id, 'airport-check-in-change-request', 'Airport check-in: a heavy bag',
    'You are flying from Tashkent to Istanbul. At check-in, you learn that your suitcase is too heavy. You need to understand the rules, solve the problem politely and update your travel partner.',
    'Understand the baggage rules, tell the agent what you will do, and update your friend at the gate.',
    'travel', 'B1',
    array['check-in', 'cabin bag', 'extra kilo', 'aisle seat', 'boarding']::text[], 'will for decisions made now (I''ll move some things.)', array['reading', 'listening', 'speaking', 'writing']::text[],
    '["Understand what you can do with a heavy bag","Tell the agent your decision politely","Update your friend with the problem, what you did and when you''ll arrive"]'::jsonb,
    'Airport staff deal with many people quickly, so short, polite answers help: "I''ll move some things, please." If you don''t catch a number or a gate, it''s completely normal to ask: "Sorry, was that fifteen or fifty?"',
    'published', 210, '{"seeded_by":"20261022181500_english_immersion_missions_v2","format":"steps_v2"}'::jsonb
  )
  on conflict (product_id, language_id, slug) do update set
    title = excluded.title, context_text = excluded.context_text, objective_text = excluded.objective_text,
    mission_type = excluded.mission_type, level = excluded.level, target_vocabulary = excluded.target_vocabulary,
    target_grammar = excluded.target_grammar, skill_mix = excluded.skill_mix,
    success_conditions_json = excluded.success_conditions_json, cultural_note = excluded.cultural_note,
    status = excluded.status, sort_order = excluded.sort_order,
    metadata = coalesce(public.immersion_missions.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now()
  returning id into v_mission_id;

  insert into public.immersion_mission_steps (
    mission_id, step_index, service_key, step_type, title, instructions, prompt_text, expected_answer_json,
    target_skill_key, estimated_minutes, status, metadata
  ) values
    (v_mission_id, 0, 'reading', 'read', 'Read the baggage rules', 'Read the notice at the check-in desk. Then answer the questions.', 'BAGGAGE INFORMATION
Economy passengers can check in one bag of up to 23 kg.
If your bag is heavier, you can:
• move items into your cabin bag (maximum 8 kg), or
• pay 10 US dollars for each extra kilo.
Bags over 32 kg cannot be checked in.
Please have your passport and boarding pass ready. Check-in closes 60 minutes before departure.', '{"questions":[{"id":"q1","prompt":"Your suitcase weighs 26 kg. What can you do?","options":["Nothing — it can''t go on the plane.","Move some things into your cabin bag, or pay for the extra kilos.","Check it in for free."],"answer":1,"explanation":"Bags heavier than 23 kg (but not over 32 kg) are OK if you move items or \"pay 10 US dollars for each extra kilo\"."},{"id":"q2","prompt":"When does check-in close?","options":["30 minutes before departure","60 minutes before departure","When boarding starts"],"answer":1,"explanation":"The notice says \"Check-in closes 60 minutes before departure\"."}]}'::jsonb, 'reading.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 1, 'listening', 'listen', 'Listen to the check-in agent', 'Listen to the check-in agent. Then answer the questions. You can listen again.', 'Good morning. Your suitcase is twenty-six kilos, so it''s three kilos over the limit. You can take some things out and put them in your cabin bag. Your cabin bag is five kilos now, so you can add three more. Or you can pay thirty dollars at the ticket desk over there, next to the café. Also, I''m afraid there are no window seats left on this flight. I can give you an aisle seat near the front.', '{"questions":[{"id":"q1","prompt":"How much would you pay for the extra weight?","options":["10 dollars","30 dollars","26 dollars"],"answer":1,"explanation":"The agent says \"you can pay thirty dollars at the ticket desk\"."},{"id":"q2","prompt":"What seat can the agent give you?","options":["A window seat","An aisle seat near the front","A seat at the back"],"answer":1,"explanation":"\"There are no window seats left… I can give you an aisle seat near the front.\""}]}'::jsonb, 'listening.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2","accent":"us"}'::jsonb),
    (v_mission_id, 2, 'speaking', 'speak', 'Answer the agent', 'Tell the agent out loud what you will do about your bag, and answer about the seat. Be polite.', 'Agent: So, what would you like to do?', '{"goal":"Choose a solution for the heavy bag, accept or ask about the seat, and stay polite.","points":[{"label":"say what you will do with the bag","any":["take out","take some","move","put some","put them","cabin bag","hand luggage","carry on","pay","card","cash","open"]},{"label":"answer about the seat","any":["aisle","seat","front","window"]},{"label":"be polite","any":["please","thank*","cheers","appreciate","grateful","could i","would it be possible","if possible"]}],"model_answer":"I''ll move some things into my cabin bag, please. Could I open my suitcase here? And the aisle seat near the front is fine. Thank you for your help."}'::jsonb, 'speaking.task_completion', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 3, 'writing', 'reply', 'Message your friend at the gate', 'Your friend is already at the gate. Write a message: explain why you are late, what you did about the bag, and when you''ll get to the gate.', 'Jasur: I''m at gate B12 already. Where are you?? Boarding starts in 40 minutes.', '{"goal":"Explain the bag problem, what you did, and when you will reach the gate.","points":[{"label":"explain the problem","any":["heavy","overweight","too much","kilo*","kg","extra weight","weight","over the limit"]},{"label":"say what you did","any":["moved","took out","took some","put some","put them","paid","cabin bag","repack*","opened"]},{"label":"say when you will be there","any":["soon","on my way","coming","be there","see you","arrive","quickly","in a bit","security","almost","nearly"]}],"model_answer":"Sorry, I''m still at check-in! My suitcase was three kilos too heavy, so I moved some clothes into my cabin bag. Everything is fine now. I''m going through security and I''ll be at the gate in about twenty minutes. See you soon!"}'::jsonb, 'writing.task_completion', 4, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb)
  on conflict (mission_id, step_index) do update set
    service_key = excluded.service_key, step_type = excluded.step_type, title = excluded.title,
    instructions = excluded.instructions, prompt_text = excluded.prompt_text,
    expected_answer_json = excluded.expected_answer_json, target_skill_key = excluded.target_skill_key,
    estimated_minutes = excluded.estimated_minutes, status = excluded.status,
    metadata = coalesce(public.immersion_mission_steps.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now();

  update public.immersion_mission_steps set status = 'archived', updated_at = now()
  where mission_id = v_mission_id and step_index >= 4 and status <> 'archived';

  -- B1 · renting-a-flat-near-campus
  insert into public.immersion_missions (
    product_id, language_id, slug, title, context_text, objective_text, mission_type, level,
    target_vocabulary, target_grammar, skill_mix, success_conditions_json, cultural_note, status, sort_order, metadata
  ) values (
    v_product_id, v_en_id, 'renting-a-flat-near-campus', 'Renting a flat near the university',
    'You are looking for a flat to rent near your university in Samarkand. You find an advert and want to arrange a viewing.',
    'Understand the advert, contact the landlord, understand his reply and confirm the viewing.',
    'service', 'B1',
    array['rent', 'deposit', 'furnished', 'viewing', 'included']::text[], 'polite questions (Could I…? Is the internet included?)', array['reading', 'writing', 'listening', 'speaking']::text[],
    '["Find the key facts in a rental advert","Write a clear first message to a landlord","Confirm a viewing and check details on the phone"]'::jsonb,
    'When you write to a landlord, or anyone you don''t know, start with a greeting and your name, keep it short, and end with your name again. It''s normal to ask what the rent includes (bills, internet) before you visit. It isn''t rude.',
    'published', 220, '{"seeded_by":"20261022181500_english_immersion_missions_v2","format":"steps_v2"}'::jsonb
  )
  on conflict (product_id, language_id, slug) do update set
    title = excluded.title, context_text = excluded.context_text, objective_text = excluded.objective_text,
    mission_type = excluded.mission_type, level = excluded.level, target_vocabulary = excluded.target_vocabulary,
    target_grammar = excluded.target_grammar, skill_mix = excluded.skill_mix,
    success_conditions_json = excluded.success_conditions_json, cultural_note = excluded.cultural_note,
    status = excluded.status, sort_order = excluded.sort_order,
    metadata = coalesce(public.immersion_missions.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now()
  returning id into v_mission_id;

  insert into public.immersion_mission_steps (
    mission_id, step_index, service_key, step_type, title, instructions, prompt_text, expected_answer_json,
    target_skill_key, estimated_minutes, status, metadata
  ) values
    (v_mission_id, 0, 'reading', 'read', 'Read the advert', 'Read the advert. Then answer the questions.', 'FOR RENT: Two-room flat, 10 minutes'' walk from the university.
Third floor, no lift. Furnished: beds, table, washing machine.
Rent: 3,500,000 so''m per month, plus electricity and gas.
Deposit: one month''s rent. No pets.
Available from 1 September. Viewings on weekday evenings after 6 pm.
Contact Mr Rakhimov by message.', '{"questions":[{"id":"q1","prompt":"What is NOT included in the rent?","options":["The furniture","Electricity and gas","The washing machine"],"answer":1,"explanation":"The advert says the rent is \"plus electricity and gas\", so you pay for them separately."},{"id":"q2","prompt":"When can you see the flat?","options":["At the weekend","On weekday evenings after 6 pm","Any morning"],"answer":1,"explanation":"\"Viewings on weekday evenings after 6 pm.\""}]}'::jsonb, 'reading.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 1, 'writing', 'reply', 'Write to the landlord', 'Write a message to Mr Rakhimov. Say who you are and that you are interested, suggest a time to see the flat, and ask one question about it.', 'New message to: Mr Rakhimov
About: Two-room flat near the university', '{"goal":"Introduce yourself, show interest, suggest a viewing time and ask one useful question.","points":[{"label":"introduce yourself","any":["my name","i am a","i''m a","student","i study","studying","this is"]},{"label":"say you are interested","any":["interested","like to rent","want to rent","would like to see","looking for","like your"]},{"label":"suggest a time to see the flat","any":["view*","visit","come and see","see it","evening","tomorrow","monday","tuesday","wednesday","thursday","friday","pm","o''clock"]},{"label":"ask a question","any":["is it","is there","are there","can i","could i","could you","can you","do you","do i","does it","how much","how many","how do","how can","when can","when will","what is","what''s","which","will i","would it be possible","should i","may i"]}],"model_answer":"Hello Mr Rakhimov, my name is Aziza and I am a second-year student at the university. I am very interested in your flat. Could I come and see it on Tuesday evening at 7 pm? Also, is the internet included in the rent? Thank you, Aziza"}'::jsonb, 'writing.task_completion', 5, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 2, 'listening', 'listen', 'Listen to the landlord''s reply', 'Mr Rakhimov leaves you a voice message. Listen and answer the questions.', 'Hello, this is Mr Rakhimov, about the flat on Navoi Street. Thank you for your message. I''m afraid I''m busy on Monday and Tuesday evenings this week, but you can come on Wednesday at half past six. Many students ask about the internet: it isn''t included, but it''s cheap, about one hundred thousand a month. One more thing: the flat is on the third floor and there''s no lift. Please call me when you arrive. The address is 14 Navoi Street.', '{"questions":[{"id":"q1","prompt":"When can you see the flat?","options":["Tuesday at 7 pm","Wednesday at 6:30 pm","Wednesday at 7:30 pm"],"answer":1,"explanation":"He says \"you can come on Wednesday at half past six\"."},{"id":"q2","prompt":"What does he say about the internet?","options":["It''s included in the rent.","It isn''t included, but it''s cheap.","There is no internet."],"answer":1,"explanation":"\"It isn''t included, but it''s cheap.\""}]}'::jsonb, 'listening.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2","accent":"gb"}'::jsonb),
    (v_mission_id, 3, 'speaking', 'speak', 'Call to confirm', 'Call Mr Rakhimov back. Say out loud who you are, confirm the time, check the address and ask one more question.', 'Mr Rakhimov: Hello?', '{"goal":"Confirm the Wednesday viewing, check the address and ask one more question.","points":[{"label":"say who you are","any":["it''s","this is","my name","calling about","speaking"]},{"label":"confirm the time","any":["wednesday","half past six","6 30","six thirty","works","good for me","fine","see you"]},{"label":"check the address","any":["address","navoi","street","14","fourteen","where"]},{"label":"ask another question","any":["is it","is there","are there","can i","could i","could you","can you","do you","do i","does it","how much","how many","how do","how can","when can","when will","what is","what''s","which","will i","would it be possible","should i","may i"]}],"model_answer":"Hello Mr Rakhimov, it''s Aziza, calling about the flat. Wednesday at half past six is fine for me. Is the address 14 Navoi Street? And can I pay the deposit by card? Thank you."}'::jsonb, 'speaking.task_completion', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb)
  on conflict (mission_id, step_index) do update set
    service_key = excluded.service_key, step_type = excluded.step_type, title = excluded.title,
    instructions = excluded.instructions, prompt_text = excluded.prompt_text,
    expected_answer_json = excluded.expected_answer_json, target_skill_key = excluded.target_skill_key,
    estimated_minutes = excluded.estimated_minutes, status = excluded.status,
    metadata = coalesce(public.immersion_mission_steps.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now();

  update public.immersion_mission_steps set status = 'archived', updated_at = now()
  where mission_id = v_mission_id and step_index >= 4 and status <> 'archived';

  -- B1 · hotel-booking-mix-up
  insert into public.immersion_missions (
    product_id, language_id, slug, title, context_text, objective_text, mission_type, level,
    target_vocabulary, target_grammar, skill_mix, success_conditions_json, cultural_note, status, sort_order, metadata
  ) values (
    v_product_id, v_en_id, 'hotel-booking-mix-up', 'A problem with your hotel booking',
    'You arrive at a hotel in Almaty late in the evening. You booked a double room with breakfast for three nights, but the hotel has a different booking.',
    'Check your booking, understand the problem, explain it politely and ask the booking website to fix it.',
    'travel', 'B1',
    array['booking', 'confirmation', 'double room', 'check-out', 'refund']::text[], 'past simple vs present perfect (I booked… / I have paid…)', array['reading', 'listening', 'speaking', 'writing']::text[],
    '["Check the facts in your booking confirmation","Explain the problem politely and say what you want","Write a clear complaint with the key details"]'::jsonb,
    'When something goes wrong at a hotel, staff are usually more helpful if you stay calm and show the facts, for example your confirmation email. "I''m sorry, but…" and "Would it be possible…?" are polite ways to disagree in English.',
    'published', 230, '{"seeded_by":"20261022181500_english_immersion_missions_v2","format":"steps_v2"}'::jsonb
  )
  on conflict (product_id, language_id, slug) do update set
    title = excluded.title, context_text = excluded.context_text, objective_text = excluded.objective_text,
    mission_type = excluded.mission_type, level = excluded.level, target_vocabulary = excluded.target_vocabulary,
    target_grammar = excluded.target_grammar, skill_mix = excluded.skill_mix,
    success_conditions_json = excluded.success_conditions_json, cultural_note = excluded.cultural_note,
    status = excluded.status, sort_order = excluded.sort_order,
    metadata = coalesce(public.immersion_missions.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now()
  returning id into v_mission_id;

  insert into public.immersion_mission_steps (
    mission_id, step_index, service_key, step_type, title, instructions, prompt_text, expected_answer_json,
    target_skill_key, estimated_minutes, status, metadata
  ) values
    (v_mission_id, 0, 'reading', 'read', 'Check your booking', 'Read your booking confirmation. Then answer the questions.', 'BOOKING CONFIRMATION
Guest: Nodira Yusupova
Hotel: Green Garden Hotel, Almaty
Check-in: Friday 10 May, from 14:00
Check-out: Monday 13 May, by 12:00
Room: double room, non-smoking, breakfast included
Paid: 3 nights
Free cancellation until 8 May', '{"questions":[{"id":"q1","prompt":"How many nights did you book?","options":["Two","Three","Ten"],"answer":1,"explanation":"The confirmation says \"Paid: 3 nights\", from Friday to Monday."},{"id":"q2","prompt":"What is included?","options":["Breakfast","Dinner","An airport taxi"],"answer":0,"explanation":"The room is \"breakfast included\"."}]}'::jsonb, 'reading.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 1, 'listening', 'listen', 'Listen to the receptionist', 'Listen to the receptionist. Then answer the questions.', 'Good evening. Let me look... Ah, I''m very sorry. I can only see a booking for two nights, Friday and Saturday, and it''s for a single room. The hotel is almost full tonight. I can give you a double room for tonight and tomorrow, but on Sunday you would need to move to a different room. It''s a little smaller, but it has a view of the mountains. Breakfast is from seven to ten in the restaurant on the ground floor.', '{"questions":[{"id":"q1","prompt":"What is wrong with the hotel''s booking?","options":["It is for a different hotel.","It is for two nights and a single room.","It doesn''t include breakfast."],"answer":1,"explanation":"The receptionist sees \"a booking for two nights… and it''s for a single room\"."},{"id":"q2","prompt":"What would happen on Sunday?","options":["You would have to leave the hotel.","You would move to a different room.","You would get a free dinner."],"answer":1,"explanation":"\"On Sunday you would need to move to a different room.\""}]}'::jsonb, 'listening.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2","accent":"gb"}'::jsonb),
    (v_mission_id, 2, 'speaking', 'speak', 'Explain the problem politely', 'Answer the receptionist out loud. Explain politely what you booked, mention your confirmation email, and say what you would like.', 'Receptionist: So, is that OK for you?', '{"goal":"Explain the original booking politely, show proof and ask to keep the same room.","points":[{"label":"say what you booked","any":["three nights","3 nights","double","booked","booking","reservation","reserved"]},{"label":"mention your confirmation","any":["confirmation","email","e mail","my phone","show you","paid"]},{"label":"say what you would like","any":["same room","stay in","don''t want to move","prefer","would like","could i","can i","is it possible","would it be possible","rather"]},{"label":"stay polite","any":["please","sorry","thank*","cheers","appreciate","grateful","i understand","excuse me"]}],"model_answer":"I''m sorry, but I booked three nights in a double room, with breakfast. I have the confirmation email here on my phone. Would it be possible to stay in the same room for all three nights, please?"}'::jsonb, 'speaking.task_completion', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 3, 'writing', 'reply', 'Write to the booking website', 'After your stay, write to the booking website''s help centre. Give your booking details, explain what went wrong, and ask them to do something about it.', 'Help centre
Tell us what went wrong with your stay.', '{"goal":"Write a clear complaint with booking details, the problem, and a request for action.","points":[{"label":"give your booking details","any":["green garden","10 may","may","name is","booking number","reference","almaty"]},{"label":"explain what was wrong","any":["two nights","2 nights","single","mistake","error","had to move","different room","had to change"]},{"label":"say what you booked","any":["three nights","3 nights","double","booked","confirmation","paid for"]},{"label":"ask them to act","any":["refund","money back","check","fix","correct","compensat*","discount","look into"]}],"model_answer":"Hello, I stayed at the Green Garden Hotel in Almaty from 10 to 13 May. I booked and paid for a double room for three nights, but the hotel had a booking for only two nights in a single room, so I had to move rooms on Sunday. Could you please check what went wrong and refund the difference? Thank you, Nodira Yusupova"}'::jsonb, 'writing.task_completion', 5, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb)
  on conflict (mission_id, step_index) do update set
    service_key = excluded.service_key, step_type = excluded.step_type, title = excluded.title,
    instructions = excluded.instructions, prompt_text = excluded.prompt_text,
    expected_answer_json = excluded.expected_answer_json, target_skill_key = excluded.target_skill_key,
    estimated_minutes = excluded.estimated_minutes, status = excluded.status,
    metadata = coalesce(public.immersion_mission_steps.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now();

  update public.immersion_mission_steps set status = 'archived', updated_at = now()
  where mission_id = v_mission_id and step_index >= 4 and status <> 'archived';

  -- B1 · blocked-bank-card
  insert into public.immersion_missions (
    product_id, language_id, slug, title, context_text, objective_text, mission_type, level,
    target_vocabulary, target_grammar, skill_mix, success_conditions_json, cultural_note, status, sort_order, metadata
  ) values (
    v_product_id, v_en_id, 'blocked-bank-card', 'Your bank card is blocked',
    'You try to pay for textbooks online, but the payment fails. Then you get a message from your bank.',
    'Understand the bank''s message, talk to the bank safely, and ask the shop to keep your order.',
    'problem_solving', 'B1',
    array['payment', 'blocked', 'unusual', 'security', 'unblock']::text[], 'passive for official messages (Your card has been blocked.)', array['reading', 'listening', 'speaking', 'writing']::text[],
    '["Understand why the card was blocked and what the bank never asks for","Explain the payment to the bank and ask a question","Ask the shop politely to keep your order"]'::jsonb,
    'Banks and shops in many countries warn customers about fraud. A real bank will never ask for your PIN, password or one-time code. If someone does, end the call and phone the number on the back of your card.',
    'published', 240, '{"seeded_by":"20261022181500_english_immersion_missions_v2","format":"steps_v2"}'::jsonb
  )
  on conflict (product_id, language_id, slug) do update set
    title = excluded.title, context_text = excluded.context_text, objective_text = excluded.objective_text,
    mission_type = excluded.mission_type, level = excluded.level, target_vocabulary = excluded.target_vocabulary,
    target_grammar = excluded.target_grammar, skill_mix = excluded.skill_mix,
    success_conditions_json = excluded.success_conditions_json, cultural_note = excluded.cultural_note,
    status = excluded.status, sort_order = excluded.sort_order,
    metadata = coalesce(public.immersion_missions.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now()
  returning id into v_mission_id;

  insert into public.immersion_mission_steps (
    mission_id, step_index, service_key, step_type, title, instructions, prompt_text, expected_answer_json,
    target_skill_key, estimated_minutes, status, metadata
  ) values
    (v_mission_id, 0, 'reading', 'read', 'Read the bank''s message', 'You get this text message from your bank. Read it and answer the questions.', 'BANK ALERT: We stopped a payment of 450,000 so''m to an online shop on 12 March at 21:14 because it looked unusual. For your safety, your card is blocked for now. If this was you, reply YES. If not, reply NO and call us on 1234. We will NEVER ask for your PIN or your full card number.', '{"questions":[{"id":"q1","prompt":"Why did the bank block the card?","options":["The card is too old.","A payment looked unusual.","You forgot your PIN."],"answer":1,"explanation":"The bank stopped the payment \"because it looked unusual\"."},{"id":"q2","prompt":"What will the bank never ask you for?","options":["Your name","Your PIN or full card number","Your phone number"],"answer":1,"explanation":"\"We will NEVER ask for your PIN or your full card number.\""}]}'::jsonb, 'reading.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 1, 'listening', 'listen', 'Listen to the bank', 'You call the bank. Listen to the bank worker and answer the questions.', 'Thank you for calling. I can see your card was blocked after an unusual payment. I can unblock it now if you confirm the payment was yours. For security, please tell me the last four numbers of your card and your date of birth. Please don''t tell me your PIN. After that, your card will work again in about ten minutes. If you often make large online payments, you can change your online limit in our mobile app.', '{"questions":[{"id":"q1","prompt":"What information does the bank worker ask for?","options":["Your PIN and full card number","The last four numbers of your card and your date of birth","Your home address"],"answer":1,"explanation":"She asks for \"the last four numbers of your card and your date of birth\"."},{"id":"q2","prompt":"When will the card work again?","options":["Immediately","In about ten minutes","Tomorrow"],"answer":1,"explanation":"\"Your card will work again in about ten minutes.\""}]}'::jsonb, 'listening.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2","accent":"us"}'::jsonb),
    (v_mission_id, 2, 'speaking', 'speak', 'Explain the payment', 'Answer the bank worker out loud. Say the payment was yours and what it was for, then ask one question. Don''t say any real card numbers.', 'Bank worker: Can you tell me about the payment on 12 March?', '{"goal":"Confirm the payment, say what it was for, and ask a useful question.","points":[{"label":"say the payment was yours","any":["it was me","that was me","i made","i paid","my payment","yes it was","i did","it''s mine","was mine","that''s right","yes"]},{"label":"say what it was for","any":["book*","textbook*","course","shop","order*","bought","buying"]},{"label":"ask a question","any":["is it","is there","are there","can i","could i","could you","can you","do you","do i","does it","how much","how many","how do","how can","when can","when will","what is","what''s","which","will i","would it be possible","should i","may i"]}],"model_answer":"Yes, that was me. I was buying three textbooks for my university course from an online shop. Can you unblock my card now, please? And how do I change my online limit?"}'::jsonb, 'speaking.task_completion', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 3, 'writing', 'reply', 'Write to the online shop', 'The shop sends you an email. Write a short reply: explain what happened, say the problem is solved, and ask them to keep your order.', 'BookPoint: Your payment for order 5521 failed. If we don''t receive payment, the order will be cancelled in 24 hours.', '{"goal":"Explain the failed payment and ask the shop to keep the order.","points":[{"label":"explain what happened","any":["bank","blocked","security","unusual","stopped"]},{"label":"say the problem is solved","any":["unblocked","works now","working now","works again","fixed","solved","ok now","okay now","sorted","fine now"]},{"label":"ask them to keep the order","any":["keep","don''t cancel","do not cancel","hold","try again","pay again","still want","please"]}],"model_answer":"Hello, I''m sorry about the failed payment for order 5521. My bank blocked my card for security reasons, but it works again now. Please don''t cancel my order. I will pay again today. Thank you for waiting."}'::jsonb, 'writing.task_completion', 4, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb)
  on conflict (mission_id, step_index) do update set
    service_key = excluded.service_key, step_type = excluded.step_type, title = excluded.title,
    instructions = excluded.instructions, prompt_text = excluded.prompt_text,
    expected_answer_json = excluded.expected_answer_json, target_skill_key = excluded.target_skill_key,
    estimated_minutes = excluded.estimated_minutes, status = excluded.status,
    metadata = coalesce(public.immersion_mission_steps.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now();

  update public.immersion_mission_steps set status = 'archived', updated_at = now()
  where mission_id = v_mission_id and step_index >= 4 and status <> 'archived';

  -- B1 · university-course-registration
  insert into public.immersion_missions (
    product_id, language_id, slug, title, context_text, objective_text, mission_type, level,
    target_vocabulary, target_grammar, skill_mix, success_conditions_json, cultural_note, status, sort_order, metadata
  ) values (
    v_product_id, v_en_id, 'university-course-registration', 'Registering for university courses',
    'You are a new university student. You need to register for your courses online before the deadline, but one course you want is full.',
    'Understand the registration rules, deal with a full course, and explain the options to a classmate.',
    'study', 'B1',
    array['register', 'elective', 'waiting list', 'deadline', 'fee']::text[], 'if-sentences for options (If a course is full, you can…)', array['reading', 'listening', 'writing', 'speaking']::text[],
    '["Understand the registration rules and the deadline","Write a clear email with a decision and a question","Explain the options to someone else"]'::jsonb,
    'University offices often expect students to solve problems by email first. A clear subject line and one clear question get faster answers. "Could you tell me…?" sounds polite and direct.',
    'published', 250, '{"seeded_by":"20261022181500_english_immersion_missions_v2","format":"steps_v2"}'::jsonb
  )
  on conflict (product_id, language_id, slug) do update set
    title = excluded.title, context_text = excluded.context_text, objective_text = excluded.objective_text,
    mission_type = excluded.mission_type, level = excluded.level, target_vocabulary = excluded.target_vocabulary,
    target_grammar = excluded.target_grammar, skill_mix = excluded.skill_mix,
    success_conditions_json = excluded.success_conditions_json, cultural_note = excluded.cultural_note,
    status = excluded.status, sort_order = excluded.sort_order,
    metadata = coalesce(public.immersion_missions.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now()
  returning id into v_mission_id;

  insert into public.immersion_mission_steps (
    mission_id, step_index, service_key, step_type, title, instructions, prompt_text, expected_answer_json,
    target_skill_key, estimated_minutes, status, metadata
  ) values
    (v_mission_id, 0, 'reading', 'read', 'Read the email from the Student Office', 'Read the email. Then answer the questions.', 'Dear new students,
Course registration is open from 1 to 7 September on the student portal. You must choose four courses: two required courses and two electives. Popular electives fill up quickly. If a course is full, you can join the waiting list or contact the Student Office before the deadline. Late registration costs 200,000 so''m.
Student Office, Room 105, open 9:00–17:00', '{"questions":[{"id":"q1","prompt":"How many electives must you choose?","options":["One","Two","Four"],"answer":1,"explanation":"You choose \"two required courses and two electives\"."},{"id":"q2","prompt":"What can you do if a course is full?","options":["Pay a fee","Join the waiting list or contact the Student Office","Choose five courses"],"answer":1,"explanation":"\"You can join the waiting list or contact the Student Office before the deadline.\""}]}'::jsonb, 'reading.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 1, 'listening', 'listen', 'Listen to the Student Office', 'You get a voice message from the Student Office. Listen and answer the questions.', 'Hello, this is Gulnora from the Student Office. You tried to register for Introduction to Photography, but it''s full. You are number three on the waiting list. Usually two or three places open in the first week, so you have a good chance. But to be safe, please choose another elective too. Creative Writing still has places. You can drop it later if you get into Photography. Call me back if you have any questions.', '{"questions":[{"id":"q1","prompt":"What is your place on the waiting list?","options":["First","Third","Tenth"],"answer":1,"explanation":"Gulnora says \"You are number three on the waiting list\"."},{"id":"q2","prompt":"What does Gulnora advise?","options":["Wait and do nothing","Choose another elective as well","Pay the late fee"],"answer":1,"explanation":"\"To be safe, please choose another elective too.\""}]}'::jsonb, 'listening.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2","accent":"gb"}'::jsonb),
    (v_mission_id, 2, 'writing', 'reply', 'Email the Student Office', 'Write a short email to Gulnora. Thank her, say what you have decided, and ask one question.', 'To: Student Office
Subject: Re: Your course registration', '{"goal":"Thank the office, state your decision about the electives, and ask one clear question.","points":[{"label":"thank her","any":["thank*","cheers","appreciate","grateful"]},{"label":"say what you decided","any":["registered","signed up","i will","i''ll","i have chosen","i chose","decided","creative writing","joined","join","stay on"]},{"label":"ask a question","any":["is it","is there","are there","can i","could i","could you","can you","do you","do i","does it","how much","how many","how do","how can","when can","when will","what is","what''s","which","will i","would it be possible","should i","may i","will you","when","how will"]},{"label":"open and close politely","any":["dear","hello","best regards","kind regards","regards","best wishes","sincerely"]}],"model_answer":"Dear Gulnora,\nThank you for your message. I have registered for Creative Writing, and I will stay on the waiting list for Introduction to Photography. Could you tell me how I will know if a place opens? Will you send me an email?\nBest regards,\nRustam Aliyev"}'::jsonb, 'writing.task_completion', 4, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 3, 'speaking', 'speak', 'Help a classmate', 'A classmate has the same problem. Explain out loud what they can do and when.', 'Classmate: I wanted the photography course too, but the website says it''s full. What should I do?', '{"goal":"Explain the waiting list, the backup elective and the deadline.","points":[{"label":"mention the waiting list","any":["waiting list","wait list","waitlist","queue"]},{"label":"suggest another elective","any":["another","other","creative writing","second","backup","back up","as well","also"]},{"label":"mention the deadline or the office","any":["deadline","september","seventh","student office","room 105","before","late"]}],"model_answer":"You can join the waiting list. I''m number three on it. But it''s a good idea to choose another elective as well, like Creative Writing. Do it before the deadline on 7 September, or you have to pay a fee."}'::jsonb, 'speaking.task_completion', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb)
  on conflict (mission_id, step_index) do update set
    service_key = excluded.service_key, step_type = excluded.step_type, title = excluded.title,
    instructions = excluded.instructions, prompt_text = excluded.prompt_text,
    expected_answer_json = excluded.expected_answer_json, target_skill_key = excluded.target_skill_key,
    estimated_minutes = excluded.estimated_minutes, status = excluded.status,
    metadata = coalesce(public.immersion_mission_steps.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now();

  update public.immersion_mission_steps set status = 'archived', updated_at = now()
  where mission_id = v_mission_id and step_index >= 4 and status <> 'archived';

  -- B2 · team-update-after-delay
  insert into public.immersion_missions (
    product_id, language_id, slug, title, context_text, objective_text, mission_type, level,
    target_vocabulary, target_grammar, skill_mix, success_conditions_json, cultural_note, status, sort_order, metadata
  ) values (
    v_product_id, v_en_id, 'team-update-after-delay', 'Project update: a delay before the client meeting',
    'You work in a small marketing team. A client presentation is on Thursday, but one part of the project is late. Your manager wants a quick update.',
    'Find the blocker, send your manager a clear status email, and give a short spoken update.',
    'workplace', 'B2',
    array['blocked', 'approval', 'status', 'worst case', 'next step']::text[], 'present perfect for updates (We have finished… They haven''t replied.)', array['reading', 'listening', 'writing', 'speaking']::text[],
    '["Identify what is finished, what is blocked and why it matters","Write a short status email with a specific request","Give a clear spoken update: done, blocked, next step"]'::jsonb,
    'In many international teams, a good update goes in this order: what''s done, the problem, then a clear request. Saying "I need X from you by Y" is seen as professional, not demanding.',
    'published', 310, '{"seeded_by":"20261022181500_english_immersion_missions_v2","format":"steps_v2"}'::jsonb
  )
  on conflict (product_id, language_id, slug) do update set
    title = excluded.title, context_text = excluded.context_text, objective_text = excluded.objective_text,
    mission_type = excluded.mission_type, level = excluded.level, target_vocabulary = excluded.target_vocabulary,
    target_grammar = excluded.target_grammar, skill_mix = excluded.skill_mix,
    success_conditions_json = excluded.success_conditions_json, cultural_note = excluded.cultural_note,
    status = excluded.status, sort_order = excluded.sort_order,
    metadata = coalesce(public.immersion_missions.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now()
  returning id into v_mission_id;

  insert into public.immersion_mission_steps (
    mission_id, step_index, service_key, step_type, title, instructions, prompt_text, expected_answer_json,
    target_skill_key, estimated_minutes, status, metadata
  ) values
    (v_mission_id, 0, 'reading', 'read', 'Read the project tracker', 'Read the project tracker. Then answer the questions.', 'Project: Silk Road Tours — spring campaign
Client presentation: Thursday, 10:00
• Slides: finished
• Report summary: drafted, needs a final check
• Customer survey data table: waiting for approval from the data team (requested on Monday, no reply yet)
Risk: without the approved table, we cannot show the survey results to the client.', '{"questions":[{"id":"q1","prompt":"Which part is holding up the project?","options":["The slides","The report summary","The survey data table"],"answer":2,"explanation":"The survey data table is \"waiting for approval from the data team\"."},{"id":"q2","prompt":"What is the risk?","options":["The client might cancel the meeting.","The team can''t show the survey results.","The slides won''t be ready."],"answer":1,"explanation":"\"Without the approved table, we cannot show the survey results to the client.\""}]}'::jsonb, 'reading.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 1, 'listening', 'listen', 'Listen to your manager', 'Your manager, Kamila, leaves you a voice message. Listen and answer the questions.', 'Hi, it''s Kamila. I''ve seen the tracker. I''m in meetings all afternoon, so I can''t call you. Here''s what I need: before five today, send me a short email: what''s done, what''s blocked, and what you need from me. If the data team still hasn''t replied by tomorrow morning, I can talk to their head directly. Worst case, we present the slides on Thursday and send the survey results a few days later. Thanks.', '{"questions":[{"id":"q1","prompt":"What does Kamila want before five?","options":["A phone call","A short email with the status and what you need","The finished data table"],"answer":1,"explanation":"She asks for \"a short email: what''s done, what''s blocked, and what you need from me\"."},{"id":"q2","prompt":"What is her backup plan?","options":["Move the meeting to next week","Present the slides and send the survey results later","Ask the client for the data"],"answer":1,"explanation":"\"Worst case, we present the slides on Thursday and send the survey results a few days later.\""}]}'::jsonb, 'listening.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2","accent":"gb"}'::jsonb),
    (v_mission_id, 2, 'writing', 'reply', 'Write the status email', 'Write the email Kamila asked for: what is finished, what is blocked and why, and exactly what you need from her. Keep it short and clear.', 'To: Kamila
Subject: Silk Road Tours: status before Thursday', '{"goal":"Send a concise status update that separates done and blocked work and makes one specific request.","points":[{"label":"say what is finished","any":["finished","done","complete*","ready","drafted"]},{"label":"explain what is blocked and why","any":["approval","approved","data team","survey","table","waiting","no reply","haven''t replied","not replied","blocked","no answer"]},{"label":"ask for specific help","any":["could you","can you","would you","if you could","need you","speak to","talk to","contact","escalat*","chase"]},{"label":"mention the timing or backup plan","any":["tomorrow","morning","later","worst case","plan b","backup","if not","otherwise","few days","by 10","by ten"]}],"model_answer":"Hi Kamila,\nHere is a quick update before Thursday. The slides are finished and the report summary is drafted; I will do the final check tomorrow. The survey data table is still blocked: we asked the data team for approval on Monday, but they have not replied. If there is no answer by 10 am tomorrow, could you speak to their head directly? If it is still not approved, I suggest we present the slides on Thursday and send the survey results a few days later.\nThanks,\nTimur"}'::jsonb, 'writing.task_completion', 6, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 3, 'speaking', 'speak', 'Give a quick spoken update', 'In the morning meeting, the team leader asks for an update. Say it out loud in three or four sentences: what''s done, what''s blocked, and the next step.', 'Team leader: Quick update on Silk Road Tours, please?', '{"goal":"Give a short, structured spoken update: done, blocked, next step.","points":[{"label":"say what is finished","any":["finished","done","complete*","ready","drafted"]},{"label":"explain the blocker","any":["approval","approved","data team","survey","table","waiting","blocked","no reply","no answer"]},{"label":"say the next step","any":["next step","next","tomorrow","going to","plan is","we''ll","i''ll","will","by thursday","this morning","today"]}],"model_answer":"Sure. The slides are finished and the report summary just needs a final check. We''re still waiting for the data team to approve the survey table, so that''s our blocker. Kamila will talk to their head this morning, and if it isn''t approved in time, we''ll send the survey results after the presentation."}'::jsonb, 'speaking.task_completion', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb)
  on conflict (mission_id, step_index) do update set
    service_key = excluded.service_key, step_type = excluded.step_type, title = excluded.title,
    instructions = excluded.instructions, prompt_text = excluded.prompt_text,
    expected_answer_json = excluded.expected_answer_json, target_skill_key = excluded.target_skill_key,
    estimated_minutes = excluded.estimated_minutes, status = excluded.status,
    metadata = coalesce(public.immersion_mission_steps.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now();

  update public.immersion_mission_steps set status = 'archived', updated_at = now()
  where mission_id = v_mission_id and step_index >= 4 and status <> 'archived';

  -- B2 · job-interview-preparation
  insert into public.immersion_missions (
    product_id, language_id, slug, title, context_text, objective_text, mission_type, level,
    target_vocabulary, target_grammar, skill_mix, success_conditions_json, cultural_note, status, sort_order, metadata
  ) values (
    v_product_id, v_en_id, 'job-interview-preparation', 'Getting ready for a job interview',
    'You have applied for a part-time job as a customer support assistant at an online learning company. Your interview is on Friday.',
    'Understand the job and the interview, practise "Tell me about yourself", and handle an upset customer in writing.',
    'workplace', 'B2',
    array['part-time', 'essential', 'role-play', 'patience', 'escalate']::text[], 'present perfect and past simple for experience (I have worked… / Last year I…)', array['reading', 'listening', 'speaking', 'writing']::text[],
    '["Understand what the job needs and what the interview includes","Give a short, relevant answer about yourself","Calm an upset customer and give clear steps"]'::jsonb,
    'In English-language interviews, "Tell me about yourself" means a short, work-related summary of about one minute, not your life story. It''s normal to talk about your strengths with examples. This isn''t seen as boasting.',
    'published', 320, '{"seeded_by":"20261022181500_english_immersion_missions_v2","format":"steps_v2"}'::jsonb
  )
  on conflict (product_id, language_id, slug) do update set
    title = excluded.title, context_text = excluded.context_text, objective_text = excluded.objective_text,
    mission_type = excluded.mission_type, level = excluded.level, target_vocabulary = excluded.target_vocabulary,
    target_grammar = excluded.target_grammar, skill_mix = excluded.skill_mix,
    success_conditions_json = excluded.success_conditions_json, cultural_note = excluded.cultural_note,
    status = excluded.status, sort_order = excluded.sort_order,
    metadata = coalesce(public.immersion_missions.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now()
  returning id into v_mission_id;

  insert into public.immersion_mission_steps (
    mission_id, step_index, service_key, step_type, title, instructions, prompt_text, expected_answer_json,
    target_skill_key, estimated_minutes, status, metadata
  ) values
    (v_mission_id, 0, 'reading', 'read', 'Read the job advert', 'Read the job advert. Then answer the questions.', 'Customer Support Assistant (part-time, 20 hours a week)
We are a growing online learning platform. You will answer students'' questions by chat and email, solve simple technical problems, and pass difficult cases to the right team.
You need: good written English, patience and basic computer skills. Experience in customer service is useful but not essential. We provide full training.
Flexible hours; some weekend shifts.
Interviews include a short role-play with an "unhappy customer".', '{"questions":[{"id":"q1","prompt":"Which of these is NOT essential for the job?","options":["Good written English","Customer service experience","Patience"],"answer":1,"explanation":"Experience in customer service is \"useful but not essential\"."},{"id":"q2","prompt":"What will happen in the interview?","options":["A written grammar test","A role-play with an unhappy customer","A programming task"],"answer":1,"explanation":"\"Interviews include a short role-play with an ''unhappy customer''.\""}]}'::jsonb, 'reading.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 1, 'listening', 'listen', 'Listen to the HR team', 'Someone from the HR team leaves you a voice message. Listen and answer the questions.', 'Hello, this is Sevara from the HR team. I''m calling to confirm your interview on Friday at two o''clock. It will be online, on video, and it''ll take about forty minutes. The first part is a normal conversation about your experience. In the second part, you''ll do a short role-play: I''ll be a student who can''t log in just before an exam and is quite upset. We want to see how you stay calm and solve the problem. Please test your camera and microphone before the call.', '{"questions":[{"id":"q1","prompt":"How long will the interview take?","options":["About 14 minutes","About 40 minutes","Two hours"],"answer":1,"explanation":"Sevara says \"it''ll take about forty minutes\"."},{"id":"q2","prompt":"In the role-play, what is the student''s problem?","options":["They want their money back.","They can''t log in just before an exam.","They lost their homework."],"answer":1,"explanation":"\"I''ll be a student who can''t log in just before an exam.\""}]}'::jsonb, 'listening.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2","accent":"us"}'::jsonb),
    (v_mission_id, 2, 'speaking', 'speak', 'Answer: "Tell me about yourself"', 'Practise the first interview question out loud. Talk about your studies or work, one relevant skill or experience, and why you want this job. Aim for about 30–60 seconds.', 'Interviewer: So, to start, could you tell me a little about yourself?', '{"goal":"Give a short, job-relevant introduction with a skill or example and a reason for applying.","points":[{"label":"describe your studies or work","any":["student","study","studying","graduat*","work*","year","university","degree","experience","job"]},{"label":"give a relevant skill or example","any":["patient","patience","help*","customer*","solve*","problem*","communicat*","computer*","english","team","volunteer*"]},{"label":"explain why you want the job","any":["because","interested","want to","would like","i''d like","enjoy","motivat*","excited","this role","this position","this job","apply","applied"]}],"model_answer":"Sure. I''m a third-year English student at university, and I also volunteer at our library, where I help visitors find information and use the computers. I''m patient and I really enjoy solving problems. I applied for this job because I''d like to use my English to help students learn online."}'::jsonb, 'speaking.task_completion', 4, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 3, 'writing', 'reply', 'Reply to an upset student', 'Practise the role-play in writing. Reply to the student in the support chat: show you understand, give clear steps to solve the problem, and offer more help.', 'Student (chat): I CAN''T LOG IN and my exam starts in 30 minutes!!! I''ve tried my password five times. This is terrible.', '{"goal":"Calm the student, give clear practical steps, and offer further help.","points":[{"label":"show you understand","any":["sorry","understand","stressful","worry","frustrat*","i see","i know","must be"]},{"label":"give clear steps","any":["reset","click","forgot","link","inbox","spam","step","first","then","browser","new password","check"]},{"label":"offer more help","any":["let me know","contact","here to help","help you","if it still","still doesn''t","write back","reply here","message me","stay with you","teacher","extra time","more time"]}],"model_answer":"I''m really sorry, I understand this is stressful just before an exam. Let''s fix it quickly. First, click \"Forgot password\" on the login page and enter your university email. You will get a reset link in a minute; please check your spam folder too. If it still doesn''t work, reply here and I will contact your teacher about extra time."}'::jsonb, 'writing.task_completion', 5, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb)
  on conflict (mission_id, step_index) do update set
    service_key = excluded.service_key, step_type = excluded.step_type, title = excluded.title,
    instructions = excluded.instructions, prompt_text = excluded.prompt_text,
    expected_answer_json = excluded.expected_answer_json, target_skill_key = excluded.target_skill_key,
    estimated_minutes = excluded.estimated_minutes, status = excluded.status,
    metadata = coalesce(public.immersion_mission_steps.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now();

  update public.immersion_mission_steps set status = 'archived', updated_at = now()
  where mission_id = v_mission_id and step_index >= 4 and status <> 'archived';

  -- B2 · group-project-conflict
  insert into public.immersion_missions (
    product_id, language_id, slug, title, context_text, objective_text, mission_type, level,
    target_vocabulary, target_grammar, skill_mix, success_conditions_json, cultural_note, status, sort_order, metadata
  ) values (
    v_product_id, v_en_id, 'group-project-conflict', 'Sorting out a group project problem',
    'You are working on a university group project with three classmates. The draft is due on Sunday, but one member hasn''t done his part and the group is getting frustrated.',
    'Understand both sides, calm the group with a fair plan, and persuade an annoyed teammate.',
    'study', 'B2',
    array['deadline', 'draft', 'fair', 'share the work', 'give someone a chance']::text[], 'suggestions (Let''s… / How about…? / Why don''t we…?)', array['reading', 'listening', 'writing', 'speaking']::text[],
    '["Understand what is missing and why","Suggest a fair plan without blaming anyone","Respond to a frustrated teammate calmly and persuasively"]'::jsonb,
    'At many universities, group-work problems are solved inside the group first. Using "we" and focusing on the plan ("Let''s agree who does what") sounds fairer than pointing at one person ("You didn''t…").',
    'published', 330, '{"seeded_by":"20261022181500_english_immersion_missions_v2","format":"steps_v2"}'::jsonb
  )
  on conflict (product_id, language_id, slug) do update set
    title = excluded.title, context_text = excluded.context_text, objective_text = excluded.objective_text,
    mission_type = excluded.mission_type, level = excluded.level, target_vocabulary = excluded.target_vocabulary,
    target_grammar = excluded.target_grammar, skill_mix = excluded.skill_mix,
    success_conditions_json = excluded.success_conditions_json, cultural_note = excluded.cultural_note,
    status = excluded.status, sort_order = excluded.sort_order,
    metadata = coalesce(public.immersion_missions.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now()
  returning id into v_mission_id;

  insert into public.immersion_mission_steps (
    mission_id, step_index, service_key, step_type, title, instructions, prompt_text, expected_answer_json,
    target_skill_key, estimated_minutes, status, metadata
  ) values
    (v_mission_id, 0, 'reading', 'read', 'Read the group chat', 'Read the group chat. Then answer the questions.', 'Madina (Mon): Has everyone finished their slides? I''ve uploaded the introduction.
Oybek (Mon): Market research section done.
Madina (Wed): Shahzod, we still need the budget section. Can you send it today?
Madina (Fri): Shahzod?? The draft is due on Sunday.
Oybek (Fri): Honestly, I''m tired of this. Maybe we should tell the professor.', '{"questions":[{"id":"q1","prompt":"Which part is missing?","options":["The introduction","The market research","The budget section"],"answer":2,"explanation":"Madina writes \"we still need the budget section\"."},{"id":"q2","prompt":"What does Oybek suggest?","options":["Doing the budget himself","Telling the professor","Changing the deadline"],"answer":1,"explanation":"Oybek says \"Maybe we should tell the professor.\""}]}'::jsonb, 'reading.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 1, 'listening', 'listen', 'Listen to Shahzod', 'Shahzod finally sends a voice message. Listen and answer the questions.', 'Hi, it''s Shahzod. I''m really sorry I disappeared this week. My grandmother was in hospital and I had to help my family. I''ve started the budget section, but it''s only half done. I can finish it by Saturday evening, but I''m not sure about the transport costs. Could someone help me with those? Please don''t tell the professor yet. I''ll explain everything to the group.', '{"questions":[{"id":"q1","prompt":"Why didn''t Shahzod reply?","options":["He forgot about the project.","He had a family emergency.","He was on holiday."],"answer":1,"explanation":"His grandmother \"was in hospital\" and he \"had to help my family\"."},{"id":"q2","prompt":"What does he ask for?","options":["More time until next week","Help with the transport costs","A different section"],"answer":1,"explanation":"\"Could someone help me with those?\" means the transport costs."}]}'::jsonb, 'listening.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2","accent":"gb"}'::jsonb),
    (v_mission_id, 2, 'writing', 'reply', 'Write to the group', 'Write a message to the group chat that calms things down: show understanding for Shahzod, suggest a fair plan with who does what and by when, and don''t blame anyone.', 'Oybek: So what now? We can''t keep waiting.', '{"goal":"Calm the group and agree a fair, specific plan without blaming anyone.","points":[{"label":"show understanding","any":["sorry to hear","understand","hope your grandmother","hope she","family comes first","no worries","it happens","get well","feeling better"]},{"label":"suggest a plan","any":["plan","suggest","how about","let''s","why don''t we","what if","i can","i''ll"]},{"label":"give a deadline","any":["saturday","sunday","evening","tonight","tomorrow"]},{"label":"share the work","any":["help","together","i''ll take","i can do","transport","split","share","check"]}],"model_answer":"Hi all, Shahzod, I''m sorry to hear about your grandmother. I hope she''s feeling better. Let''s not involve the professor yet. Here''s a suggestion: Shahzod finishes the budget section by Saturday evening, and I''ll help with the transport costs tomorrow. Oybek, could you check the whole draft on Sunday morning before we submit it? Does that work for everyone?"}'::jsonb, 'writing.task_completion', 5, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 3, 'speaking', 'speak', 'Persuade your teammate', 'On a quick call, Oybek is still annoyed. Answer him out loud: accept his point, but persuade him to give the plan a chance. Suggest what happens if it doesn''t work.', 'Oybek: I get it, but this isn''t the first time. Why should we trust him again?', '{"goal":"Acknowledge Oybek''s frustration and persuade him with a fair condition.","points":[{"label":"accept his feelings","any":["you''re right","fair point","i understand","i know","i see","that''s true","i agree","makes sense"]},{"label":"give a reason to try","any":["emergency","family","grandmother","hospital","chance","this time","real reason"]},{"label":"suggest what happens if it doesn''t work","any":["if he doesn''t","if not","if it''s not","if it isn''t","saturday","deadline","last chance","then we","we can still","professor","ourselves","together"]}],"model_answer":"That''s a fair point, and I understand why you''re frustrated. But this time he had a real family emergency. Let''s give him until Saturday evening. If the budget section isn''t ready by then, we''ll finish it together and talk to the professor."}'::jsonb, 'speaking.task_completion', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb)
  on conflict (mission_id, step_index) do update set
    service_key = excluded.service_key, step_type = excluded.step_type, title = excluded.title,
    instructions = excluded.instructions, prompt_text = excluded.prompt_text,
    expected_answer_json = excluded.expected_answer_json, target_skill_key = excluded.target_skill_key,
    estimated_minutes = excluded.estimated_minutes, status = excluded.status,
    metadata = coalesce(public.immersion_mission_steps.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now();

  update public.immersion_mission_steps set status = 'archived', updated_at = now()
  where mission_id = v_mission_id and step_index >= 4 and status <> 'archived';

  -- B2 · neighbour-noise-complaint
  insert into public.immersion_missions (
    product_id, language_id, slug, title, context_text, objective_text, mission_type, level,
    target_vocabulary, target_grammar, skill_mix, success_conditions_json, cultural_note, status, sort_order, metadata
  ) values (
    v_product_id, v_en_id, 'neighbour-noise-complaint', 'Talking to a noisy neighbour',
    'You live in a flat and have an important exam next week. For three nights, loud music from the flat above has kept you awake after midnight.',
    'Know the building rules, raise the problem politely face to face, and follow up in writing.',
    'social', 'B2',
    array['quiet hours', 'turn it down', 'bother', 'appreciate', 'building manager']::text[], 'softeners (Would it be possible…? I was wondering if…)', array['reading', 'speaking', 'listening', 'writing']::text[],
    '["Know the quiet hours and the right first step","Raise a problem politely with a specific request","Follow up in writing in a friendly but clear way"]'::jsonb,
    'In many countries, people try a friendly word or note before making an official complaint. Softeners like "Would it be possible…?" and "I''d really appreciate it" make a request sound polite even when you are annoyed.',
    'published', 340, '{"seeded_by":"20261022181500_english_immersion_missions_v2","format":"steps_v2"}'::jsonb
  )
  on conflict (product_id, language_id, slug) do update set
    title = excluded.title, context_text = excluded.context_text, objective_text = excluded.objective_text,
    mission_type = excluded.mission_type, level = excluded.level, target_vocabulary = excluded.target_vocabulary,
    target_grammar = excluded.target_grammar, skill_mix = excluded.skill_mix,
    success_conditions_json = excluded.success_conditions_json, cultural_note = excluded.cultural_note,
    status = excluded.status, sort_order = excluded.sort_order,
    metadata = coalesce(public.immersion_missions.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now()
  returning id into v_mission_id;

  insert into public.immersion_mission_steps (
    mission_id, step_index, service_key, step_type, title, instructions, prompt_text, expected_answer_json,
    target_skill_key, estimated_minutes, status, metadata
  ) values
    (v_mission_id, 0, 'reading', 'read', 'Read the house rules', 'Read the notice in your building. Then answer the questions.', 'HOUSE RULES
Quiet hours: 23:00–07:00 on weekdays, midnight–08:00 at weekends.
Please keep music and TV at a low volume during quiet hours.
If there is a problem with a neighbour, please try to talk to them first. If the problem continues, contact the building manager, Mr Saidov, at the office on the ground floor.', '{"questions":[{"id":"q1","prompt":"When do quiet hours start on a Wednesday?","options":["At 22:00","At 23:00","At midnight"],"answer":1,"explanation":"On weekdays, quiet hours are \"23:00–07:00\"."},{"id":"q2","prompt":"What should you do first if there is a problem?","options":["Call the police","Talk to the neighbour","Write to Mr Saidov"],"answer":1,"explanation":"\"Please try to talk to them first.\""}]}'::jsonb, 'reading.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 1, 'speaking', 'speak', 'Talk to your neighbour', 'You knock on your neighbour''s door. Say out loud who you are, explain the problem politely, and ask for a specific change. Don''t sound angry.', 'Neighbour: Oh, hi. Can I help you?', '{"goal":"Raise the noise problem politely and ask for a specific, reasonable change.","points":[{"label":"say who you are","any":["i live","downstairs","below","flat","neighbour","neighbor","my name","i''m"]},{"label":"describe the problem","any":["music","loud","noise","noisy","late","midnight","awake","sleep"]},{"label":"ask for a specific change","any":["could you","would you","would it be possible","turn it down","quieter","lower","after 11","after eleven","headphones","volume","stop at"]},{"label":"stay friendly","any":["sorry to bother","sorry","thank*","cheers","appreciate","grateful","i hope","i know","i''d really"]}],"model_answer":"Hi, sorry to bother you. I''m Dilshod, I live in the flat below you. For the last few nights, the music has been quite loud after midnight, and I can''t sleep. I have an important exam next week. Would it be possible to turn it down after eleven? I''d really appreciate it."}'::jsonb, 'speaking.task_completion', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 2, 'listening', 'listen', 'Listen to your neighbour', 'Listen to your neighbour''s answer. Then answer the questions.', 'Oh no, I''m so sorry. I had no idea it was that loud downstairs. My brother is staying with me this week, and he plays the guitar in the evenings. He leaves on Sunday. Until then, we''ll stop playing at ten, and I''ll put a rug on the floor. If it''s still a problem, just knock on the door. Honestly, I''d rather you told me.', '{"questions":[{"id":"q1","prompt":"Why has it been noisy?","options":["The neighbour has had parties.","Her brother plays the guitar in the evenings.","Her TV is very loud."],"answer":1,"explanation":"\"My brother is staying with me… and he plays the guitar in the evenings.\""},{"id":"q2","prompt":"What does she promise?","options":["To move out on Sunday","To stop playing at ten and put a rug on the floor","To call the building manager"],"answer":1,"explanation":"\"We''ll stop playing at ten, and I''ll put a rug on the floor.\""}]}'::jsonb, 'listening.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2","accent":"us"}'::jsonb),
    (v_mission_id, 3, 'writing', 'reply', 'Write a follow-up note', 'It''s better for a few days, but on Saturday the guitar is loud again until 1 am. Write a short, polite note to put under her door: thank her, mention Saturday, and suggest a solution.', 'Note for: Flat 14 (upstairs)', '{"goal":"Thank the neighbour, mention the new problem clearly, and suggest a solution while staying friendly.","points":[{"label":"thank her","any":["thank*","cheers","appreciate","grateful","kind of you","really helped"]},{"label":"mention the new problem","any":["saturday","1 am","one o''clock","last night","again","loud","late","noise","music","guitar"]},{"label":"suggest a solution","any":["could","would","maybe","perhaps","how about","headphones","earlier","ten","10","as we agreed"]},{"label":"end on a friendly note","any":["best wishes","thanks again","have a nice","see you","hope","regards","all the best","warm"]}],"model_answer":"Hi,\nThank you for keeping the music quieter this week. It really helped with my studying. On Saturday, though, the guitar was quite loud again until about 1 am. I know your brother leaves soon, but could he use headphones or stop at ten, as we agreed?\nThanks again and best wishes,\nDilshod (Flat 10, downstairs)"}'::jsonb, 'writing.task_completion', 5, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb)
  on conflict (mission_id, step_index) do update set
    service_key = excluded.service_key, step_type = excluded.step_type, title = excluded.title,
    instructions = excluded.instructions, prompt_text = excluded.prompt_text,
    expected_answer_json = excluded.expected_answer_json, target_skill_key = excluded.target_skill_key,
    estimated_minutes = excluded.estimated_minutes, status = excluded.status,
    metadata = coalesce(public.immersion_mission_steps.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now();

  update public.immersion_mission_steps set status = 'archived', updated_at = now()
  where mission_id = v_mission_id and step_index >= 4 and status <> 'archived';

  -- C1 · conference-networking
  insert into public.immersion_missions (
    product_id, language_id, slug, title, context_text, objective_text, mission_type, level,
    target_vocabulary, target_grammar, skill_mix, success_conditions_json, cultural_note, status, sort_order, metadata
  ) values (
    v_product_id, v_en_id, 'conference-networking', 'Networking at a conference',
    'You are at an international education technology conference in Tashkent. In the coffee break, you want to meet a speaker whose talk was relevant to your work and arrange to stay in touch.',
    'Introduce yourself to a speaker in a relevant, concise way, understand what she needs, and follow up professionally.',
    'workplace', 'C1',
    array['pilot', 'partner school', 'retention', 'follow up', 'stay in touch']::text[], 'hedging and tentative language (I was wondering whether… Might there be…?)', array['reading', 'speaking', 'listening', 'writing']::text[],
    '["Pick out what the speaker is working on and looking for","Introduce yourself and link your work to hers","Write a concise follow-up email with a concrete next step"]'::jsonb,
    'At international conferences, a short introduction that links your work to the speaker''s is usually welcome. Following up by email within a few days, and mentioning where you met, is expected. If you wait for weeks, the contact can go cold.',
    'published', 410, '{"seeded_by":"20261022181500_english_immersion_missions_v2","format":"steps_v2"}'::jsonb
  )
  on conflict (product_id, language_id, slug) do update set
    title = excluded.title, context_text = excluded.context_text, objective_text = excluded.objective_text,
    mission_type = excluded.mission_type, level = excluded.level, target_vocabulary = excluded.target_vocabulary,
    target_grammar = excluded.target_grammar, skill_mix = excluded.skill_mix,
    success_conditions_json = excluded.success_conditions_json, cultural_note = excluded.cultural_note,
    status = excluded.status, sort_order = excluded.sort_order,
    metadata = coalesce(public.immersion_missions.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now()
  returning id into v_mission_id;

  insert into public.immersion_mission_steps (
    mission_id, step_index, service_key, step_type, title, instructions, prompt_text, expected_answer_json,
    target_skill_key, estimated_minutes, status, metadata
  ) values
    (v_mission_id, 0, 'reading', 'read', 'Read the speaker''s profile', 'Read the speaker''s profile in the conference programme. Then answer the questions.', '11:30 — Small data, big decisions: learner analytics in low-bandwidth classrooms
Dr Elena Marsh, Head of Research, OpenPath Learning
Dr Marsh leads a team that designs offline-first learning tools for rural schools. Her current project, already piloted in three countries, measures how short daily quizzes affect long-term retention. She is now looking for partner schools for the next phase of the pilot, which starts in January.', '{"questions":[{"id":"q1","prompt":"What is Dr Marsh''s current project about?","options":["Bringing fast internet to rural schools","How short daily quizzes affect long-term retention","Training teachers to use big data"],"answer":1,"explanation":"Her project \"measures how short daily quizzes affect long-term retention\"."},{"id":"q2","prompt":"What is she looking for?","options":["Investors","Partner schools for the next phase","New researchers for her team"],"answer":1,"explanation":"\"She is now looking for partner schools for the next phase of the pilot.\""}]}'::jsonb, 'reading.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 1, 'speaking', 'speak', 'Introduce yourself', 'In the coffee break, introduce yourself to Dr Marsh out loud. Mention something specific from her talk, explain briefly why it matters for your work, and open the door to further contact. Keep it under a minute.', 'Dr Marsh: Hello! Did you enjoy the session?', '{"goal":"Make a concise, relevant introduction that links your work to the talk and opens further contact.","points":[{"label":"introduce yourself and your role","any":["my name","i''m","i work","i teach","coordinat*","teacher","manager","i lead","i run","head of"]},{"label":"refer to something specific from her talk","any":["quiz*","retention","offline","low bandwidth","analytics","rural","your talk","your point","you mentioned","the part about"]},{"label":"show why it is relevant to you","any":["our school","our schools","my school","our students","similar","relevant","in my work","we have","we''ve","our region","internet"]},{"label":"suggest further contact","any":["pilot","partner*","follow up","stay in touch","email","card","connect","talk more","discuss","hear more","learn more"]}],"model_answer":"Very much, thank you. I''m Nodir Karimov. I coordinate English programmes for a group of schools in the Fergana region. Your point about short daily quizzes improving retention really struck me, because most of our schools have unreliable internet. I''d love to hear more about the pilot. Might there be room for partner schools in Uzbekistan?"}'::jsonb, 'speaking.task_completion', 4, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 2, 'listening', 'listen', 'Listen to Dr Marsh', 'Listen to Dr Marsh''s answer. Then answer the questions.', 'That''s really interesting. Fergana is exactly the kind of context we had in mind. I''m afraid I have to run to a panel in five minutes, so here''s my card. Partnership applications close at the end of November. The key things we need are a named contact person and at least two schools willing to run the quizzes for a full term. Drop me an email this week, and mention today''s conversation so I know who you are. Then I''ll send you the details.', '{"questions":[{"id":"q1","prompt":"What are the two key requirements for partner schools?","options":["Fast internet and new computers","A named contact person and at least two schools for a full term","A research team and a budget"],"answer":1,"explanation":"\"The key things we need are a named contact person and at least two schools willing to run the quizzes for a full term.\""},{"id":"q2","prompt":"What does she ask you to do?","options":["Apply online immediately","Email her this week and mention your conversation","Come to her panel"],"answer":1,"explanation":"\"Drop me an email this week, and mention today''s conversation.\""}]}'::jsonb, 'listening.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2","accent":"gb"}'::jsonb),
    (v_mission_id, 3, 'writing', 'reply', 'Write the follow-up email', 'Write the follow-up email: remind her where you met, confirm your interest, show that you meet the requirements she mentioned, and propose a concrete next step. Keep it concise and professional.', 'To: Dr Elena Marsh
Subject: Following up from the conference', '{"goal":"Write a concise, professional follow-up that recalls the meeting, meets her stated requirements and proposes a next step.","points":[{"label":"remind her where you met","any":["coffee break","met","spoke","talked","conversation","your talk","session","yesterday","today"]},{"label":"confirm your interest","any":["interested","keen","would like to","would love to","eager","join","take part","participat*"]},{"label":"show you meet her requirements","any":["contact person","two schools","three schools","full term","named contact","responsible","agreed to"]},{"label":"propose a next step","any":["call","video","meeting","application","details","next step","could we","would you","available","schedule"]}],"model_answer":"Dear Dr Marsh,\nIt was a pleasure to meet you in the coffee break after your session on learner analytics yesterday. As I mentioned, I coordinate English programmes for schools in the Fergana region, and we would be keen to join the next phase of your pilot. Three of our schools have already agreed to run the daily quizzes for the full spring term, and I would act as the named contact person. Would you be available for a short video call next week to discuss the application?\nKind regards,\nNodir Karimov"}'::jsonb, 'writing.task_completion', 6, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb)
  on conflict (mission_id, step_index) do update set
    service_key = excluded.service_key, step_type = excluded.step_type, title = excluded.title,
    instructions = excluded.instructions, prompt_text = excluded.prompt_text,
    expected_answer_json = excluded.expected_answer_json, target_skill_key = excluded.target_skill_key,
    estimated_minutes = excluded.estimated_minutes, status = excluded.status,
    metadata = coalesce(public.immersion_mission_steps.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now();

  update public.immersion_mission_steps set status = 'archived', updated_at = now()
  where mission_id = v_mission_id and step_index >= 4 and status <> 'archived';

  -- C1 · negotiating-a-deadline
  insert into public.immersion_missions (
    product_id, language_id, slug, title, context_text, objective_text, mission_type, level,
    target_vocabulary, target_grammar, skill_mix, success_conditions_json, cultural_note, status, sort_order, metadata
  ) values (
    v_product_id, v_en_id, 'negotiating-a-deadline', 'Negotiating a deadline with a client',
    'You are a freelance translator. A client expects a 40-page technical manual on Friday. On Tuesday, she sends 15 more pages and still wants the complete manual by Friday.',
    'Understand the client''s priorities, push back professionally with realistic options, and agree the final plan.',
    'workplace', 'C1',
    array['realistic', 'prioritise', 'rush fee', 'in stages', 'cutting it fine']::text[], 'diplomatic language (I''m afraid… I''d suggest… Would that work for you?)', array['reading', 'writing', 'listening', 'speaking']::text[],
    '["Identify the client''s real deadline and top priority","Say no to the impossible and offer two concrete options","Confirm the final agreement clearly: what, when and who"]'::jsonb,
    'In many workplaces, a flat "no" can sound harsh, but over-apologising sounds weak. A respected pattern is: show you understand the need, state the limit plainly, then offer two concrete options and let the other person choose.',
    'published', 420, '{"seeded_by":"20261022181500_english_immersion_missions_v2","format":"steps_v2"}'::jsonb
  )
  on conflict (product_id, language_id, slug) do update set
    title = excluded.title, context_text = excluded.context_text, objective_text = excluded.objective_text,
    mission_type = excluded.mission_type, level = excluded.level, target_vocabulary = excluded.target_vocabulary,
    target_grammar = excluded.target_grammar, skill_mix = excluded.skill_mix,
    success_conditions_json = excluded.success_conditions_json, cultural_note = excluded.cultural_note,
    status = excluded.status, sort_order = excluded.sort_order,
    metadata = coalesce(public.immersion_missions.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now()
  returning id into v_mission_id;

  insert into public.immersion_mission_steps (
    mission_id, step_index, service_key, step_type, title, instructions, prompt_text, expected_answer_json,
    target_skill_key, estimated_minutes, status, metadata
  ) values
    (v_mission_id, 0, 'reading', 'read', 'Read the client''s email', 'Read the client''s email. Then answer the questions.', 'Hi,
Great news: the engineering team has finished the new safety chapter, so I''ve attached 15 more pages. I know it''s a lot, but we really need the complete manual by Friday, as it goes to the printer on Monday morning. The safety chapter is the most important part, since the product can''t be sold without it. Let me know if that''s a problem.
Best,
Rachel', '{"questions":[{"id":"q1","prompt":"Why does the client need the manual quickly?","options":["The product launches on Friday.","The manual goes to the printer on Monday morning.","The engineers need it for training."],"answer":1,"explanation":"Rachel says \"it goes to the printer on Monday morning\"."},{"id":"q2","prompt":"Which part does she say matters most?","options":["The first 40 pages","The safety chapter","The cover design"],"answer":1,"explanation":"\"The safety chapter is the most important part.\""}]}'::jsonb, 'reading.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 1, 'writing', 'reply', 'Negotiate by email', 'Reply to Rachel. You can''t translate all 55 pages well by Friday. Show you understand her deadline, explain the limit without over-apologising, and offer realistic options (for example: the safety chapter first, delivery in stages, or weekend work for a rush fee).', 'Reply to: Rachel
Re: Extra pages for the manual', '{"goal":"Decline the impossible deadline diplomatically and propose concrete, realistic alternatives.","points":[{"label":"show you understand her deadline","any":["friday","monday","printer","print","understand","deadline","i see why","time pressure"]},{"label":"explain the limit clearly","any":["quality","standard","not possible","isn''t possible","not realistic","isn''t realistic","can''t","cannot","unable","too much","55","fifty five","workload","capacity"]},{"label":"offer realistic options","any":["prioriti*","stages","two parts","partial","thursday","saturday","sunday","weekend","rush fee","fee","rate","instead","alternatively","option","suggest","propose"]},{"label":"ask her to choose or confirm","any":["confirm","let me know","which option","would that work","does that work","agree","happy with","your thoughts","prefer","work better"]}],"model_answer":"Hi Rachel,\nThanks for sending the safety chapter. I understand the manual has to go to the printer on Monday. However, translating all 55 pages to a reliable standard by Friday isn''t realistic. I''d suggest two options. Option one: I translate the safety chapter first and deliver it with 30 of the original pages on Friday, and the last ten pages on Sunday morning. Option two: I deliver all 55 pages by Sunday at noon, with a 20% rush fee for weekend work. Which option would work better for you?\nBest regards,\nAziz"}'::jsonb, 'writing.task_completion', 6, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 2, 'listening', 'listen', 'Listen to the client''s answer', 'Rachel replies with a voice message. Listen and answer the questions.', 'Hi, thanks for being upfront, I appreciate it. Option one sounds sensible, but Sunday is cutting it fine for us, because our designer needs a day to lay out the pages. Could you get the last ten pages to us by Saturday at six instead? If you can do that, we''ll pay the rush fee for the weekend work anyway. Oh, and our engineer, Tom, can answer technical questions on Thursday if any terms are unclear.', '{"questions":[{"id":"q1","prompt":"What change does Rachel ask for?","options":["Deliver everything on Friday","Deliver the last ten pages by Saturday at six","Leave out the safety chapter"],"answer":1,"explanation":"\"Could you get the last ten pages to us by Saturday at six instead?\""},{"id":"q2","prompt":"What does she offer in return?","options":["A longer deadline next time","To pay the rush fee","A new contract"],"answer":1,"explanation":"\"We''ll pay the rush fee for the weekend work anyway.\""}]}'::jsonb, 'listening.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2","accent":"us"}'::jsonb),
    (v_mission_id, 3, 'speaking', 'speak', 'Close the deal on a call', 'Call Rachel to agree the plan. Say out loud whether you accept, confirm exactly what you will deliver and when, and accept her offer of help from Tom.', 'Rachel: Hi! So, does Saturday work for you?', '{"goal":"Agree the plan, restate exactly what will be delivered and when, and arrange help with technical terms.","points":[{"label":"agree clearly","any":["yes","that works","fine","deal","agreed","i can","sounds good","happy to","no problem"]},{"label":"confirm what you will deliver and when","any":["six","6","safety chapter","ten pages","10 pages","friday","last pages","remaining","to confirm"]},{"label":"accept help from Tom","any":["tom","engineer","technical","terms","questions","thursday"]}],"model_answer":"Yes, Saturday at six works. So, to confirm: you''ll get the safety chapter and 30 pages of the original manual on Friday, and the final ten pages by six on Saturday. I''d also like to take Tom up on his offer. Could we have a twenty-minute call on Thursday morning to go through a few technical terms?"}'::jsonb, 'speaking.task_completion', 4, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb)
  on conflict (mission_id, step_index) do update set
    service_key = excluded.service_key, step_type = excluded.step_type, title = excluded.title,
    instructions = excluded.instructions, prompt_text = excluded.prompt_text,
    expected_answer_json = excluded.expected_answer_json, target_skill_key = excluded.target_skill_key,
    estimated_minutes = excluded.estimated_minutes, status = excluded.status,
    metadata = coalesce(public.immersion_mission_steps.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now();

  update public.immersion_mission_steps set status = 'archived', updated_at = now()
  where mission_id = v_mission_id and step_index >= 4 and status <> 'archived';

  -- C1 · giving-feedback-to-a-colleague
  insert into public.immersion_missions (
    product_id, language_id, slug, title, context_text, objective_text, mission_type, level,
    target_vocabulary, target_grammar, skill_mix, success_conditions_json, cultural_note, status, sort_order, metadata
  ) values (
    v_product_id, v_en_id, 'giving-feedback-to-a-colleague', 'Giving feedback to a colleague',
    'You lead a small team at a language school. A new colleague, Farrukh, has asked for honest feedback on a workshop he ran for parents. Parts of it went well, but it ran 25 minutes over time and the slides were hard to read.',
    'Use the evidence to give balanced, specific feedback face to face and summarise the agreed actions in writing.',
    'workplace', 'C1',
    array['constructive', 'run over', 'handout', 'takeaway', 'follow-up']::text[], 'softening and suggestions (One thing I''d change is… You might want to…)', array['reading', 'listening', 'speaking', 'writing']::text[],
    '["Use the parents'' comments as evidence","Give balanced feedback: a real strength, two issues, concrete changes","Summarise the agreed actions in a short, supportive email"]'::jsonb,
    'In many workplaces, feedback is "softened": people start with a real strength, use phrases like "One thing I''d change is…", and focus on next time rather than the mistake. Being specific is what makes it useful. Vague praise or criticism helps nobody.',
    'published', 430, '{"seeded_by":"20261022181500_english_immersion_missions_v2","format":"steps_v2"}'::jsonb
  )
  on conflict (product_id, language_id, slug) do update set
    title = excluded.title, context_text = excluded.context_text, objective_text = excluded.objective_text,
    mission_type = excluded.mission_type, level = excluded.level, target_vocabulary = excluded.target_vocabulary,
    target_grammar = excluded.target_grammar, skill_mix = excluded.skill_mix,
    success_conditions_json = excluded.success_conditions_json, cultural_note = excluded.cultural_note,
    status = excluded.status, sort_order = excluded.sort_order,
    metadata = coalesce(public.immersion_missions.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now()
  returning id into v_mission_id;

  insert into public.immersion_mission_steps (
    mission_id, step_index, service_key, step_type, title, instructions, prompt_text, expected_answer_json,
    target_skill_key, estimated_minutes, status, metadata
  ) values
    (v_mission_id, 0, 'reading', 'read', 'Read the parents'' feedback', 'Read the summary of the parents'' feedback. Then answer the questions.', 'Parent workshop feedback (18 responses)
Most useful: practical tips for helping children with reading at home (mentioned by 14 parents).
Least useful: the long section on language-learning theory.
Comments:
"Great energy and examples!"
"The slides had too much small text. I couldn''t read them from the back."
"It finished late and I missed my bus."
"I''d like a handout to take home."', '{"questions":[{"id":"q1","prompt":"What did parents find most useful?","options":["The theory section","Practical tips for reading at home","The slides"],"answer":1,"explanation":"\"Most useful: practical tips for helping children with reading at home.\""},{"id":"q2","prompt":"Which of these is NOT a complaint in the comments?","options":["The slides were hard to read.","It finished late.","The examples were boring."],"answer":2,"explanation":"Parents praised the examples: \"Great energy and examples!\""}]}'::jsonb, 'reading.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 1, 'listening', 'listen', 'Listen to Farrukh', 'Farrukh sends you a voice message before your meeting. Listen and answer the questions.', 'Hi, thanks for agreeing to give me feedback. Honestly, I felt it went OK, but I''m not sure. I put a lot of work into the theory part, because I think parents should understand why we teach the way we do. I know I went over time. There were lots of questions at the end. I''d really like to know what to change before I run it again next month for the Year 5 parents.', '{"questions":[{"id":"q1","prompt":"Why did Farrukh spend a lot of time on theory?","options":["The director asked him to.","He thinks parents should understand the teaching approach.","Parents asked for it in advance."],"answer":1,"explanation":"He says \"parents should understand why we teach the way we do\"."},{"id":"q2","prompt":"When will he run the workshop again?","options":["Next week","Next month","Next year"],"answer":1,"explanation":"\"Before I run it again next month for the Year 5 parents.\""}]}'::jsonb, 'listening.detail', 3, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2","accent":"gb"}'::jsonb),
    (v_mission_id, 2, 'speaking', 'speak', 'Give feedback face to face', 'Give Farrukh balanced feedback out loud: start with a specific strength, raise the two main issues tactfully (timing, and the slides or theory), and suggest concrete changes for next month.', 'Farrukh: So... how bad was it?', '{"goal":"Give balanced, evidence-based feedback with one strength, two issues and concrete changes.","points":[{"label":"start with a specific strength","any":["energy","examples","practical","tips","parents liked","went well","really good","strength","great","loved"]},{"label":"raise the timing issue","any":["time","over","late","25 minutes","twenty five","long","finished","bus","schedule"]},{"label":"raise the slides or theory issue","any":["slides","text","font","theory","shorter","cut"]},{"label":"suggest concrete changes","any":["handout","next month","next time","suggest","could","might","try","shorten","fewer","bigger","larger","timer"]}],"model_answer":"Honestly, not bad at all. Parents loved your energy and your practical examples. Fourteen of them said the reading tips were the most useful part. There are two things I''d change. It ran about 25 minutes over, so some parents had to leave. And the slides had a lot of small text. Next month, could you cut the theory section to five minutes, use bigger fonts, and give out a one-page handout instead?"}'::jsonb, 'speaking.task_completion', 4, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb),
    (v_mission_id, 3, 'writing', 'reply', 'Summarise in an email', 'Write a short follow-up email to Farrukh that summarises what you agreed, so he has it in writing. Keep the tone supportive and the actions specific.', 'To: Farrukh
Subject: Workshop: what we agreed', '{"goal":"Summarise the agreed actions clearly and supportively.","points":[{"label":"start positively","any":["thank*","cheers","appreciate","grateful","great","well done","strength","energy","examples","enjoyed","good"]},{"label":"list the agreed actions","any":["handout","shorter","cut","bigger","larger","font*","fewer","timer","on time","slides","theory","five minutes"]},{"label":"offer support","any":["happy to","help","support","let me know","feel free","look at","review","practice run","rehearse"]}],"model_answer":"Hi Farrukh,\nThanks again for running the parent workshop. Your energy and practical reading tips really worked for parents. As we discussed, for the Year 5 session next month you''ll keep the theory section to about five minutes, use larger fonts with less text on each slide, and prepare a one-page handout. We also agreed to keep ten minutes for questions so it ends on time. I''m happy to look at your slides next week if that helps.\nBest,\nMalika"}'::jsonb, 'writing.task_completion', 5, 'published', '{"seeded_by":"20261022181500_english_immersion_missions_v2"}'::jsonb)
  on conflict (mission_id, step_index) do update set
    service_key = excluded.service_key, step_type = excluded.step_type, title = excluded.title,
    instructions = excluded.instructions, prompt_text = excluded.prompt_text,
    expected_answer_json = excluded.expected_answer_json, target_skill_key = excluded.target_skill_key,
    estimated_minutes = excluded.estimated_minutes, status = excluded.status,
    metadata = coalesce(public.immersion_mission_steps.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now();

  update public.immersion_mission_steps set status = 'archived', updated_at = now()
  where mission_id = v_mission_id and step_index >= 4 and status <> 'archived';

end $$;

-- Register every v2 mission in the content registry so it appears in the
-- library, Today and progress. Minutes = sum of published step minutes.
insert into public.learning_content_registry_items (
  product_id, language_id, service_key, content_type, source_table, source_record_id, source_ref,
  title, description, skill_key, subskill_keys, cefr_level, difficulty, estimated_minutes,
  learning_objective, tags, status, payload_json, metadata
)
select
  im.product_id,
  im.language_id,
  'immersion',
  'immersion.mission',
  'immersion_missions',
  im.id,
  im.slug,
  im.title,
  left(im.objective_text, 900),
  'immersion',
  array['immersion.transfer', 'immersion.communication', 'immersion.problem-solving']::text[],
  im.level,
  case im.level
    when 'A1' then 0.20 when 'A2' then 0.30 when 'B1' then 0.45
    when 'B2' then 0.60 when 'C1' then 0.75 when 'C2' then 0.90 else 0.50
  end,
  greatest(1, coalesce(step_totals.total_minutes, 10)),
  im.objective_text,
  array_cat(array[im.mission_type]::text[], coalesce(im.skill_mix, '{}'::text[])),
  'published',
  jsonb_build_object(
    'mission_type', im.mission_type,
    'skill_mix', im.skill_mix,
    'step_count', coalesce(step_totals.step_count, 0),
    'format', 'steps_v2'
  ),
  jsonb_build_object('seeded_by', '20261022181500_english_immersion_missions_v2')
from public.immersion_missions im
left join (
  select mission_id, count(*)::int as step_count, coalesce(sum(estimated_minutes), 0)::int as total_minutes
  from public.immersion_mission_steps
  where status = 'published'
  group by mission_id
) step_totals on step_totals.mission_id = im.id
where im.metadata->>'seeded_by' = '20261022181500_english_immersion_missions_v2'
on conflict (language_id, service_key, content_type, source_ref) do update set
  product_id = excluded.product_id,
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
