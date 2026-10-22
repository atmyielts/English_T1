-- English Grammar library, level B1: 9 units x 6 drills (4 fill + 2 error_correction).
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
      v_grammar_product_id, v_en_id, 'past-simple-time-control',
      'Past Simple For Finished Events',
      'B1', 'tense',
      'Use the past simple for finished actions at a known time in the past: yesterday, last week, in 2019, two days ago. Regular verbs add -ed (work → worked, study → studied). Many common verbs are irregular and must be learned: go → went, buy → bought, meet → met.',
      'Compare: I usually walk to class. Yesterday I walked because the bus was late.',
      'Using present tense for a finished event or forgetting the past form after a time marker.',
      jsonb_build_array(
        jsonb_build_object('bad', 'Yesterday I go to campus late.', 'good', 'Yesterday I went to campus late.'),
        jsonb_build_object('bad', 'Last week we study together.', 'good', 'Last week we studied together.'),
        jsonb_build_object('bad', 'Two days ago I buyed a new phone.', 'good', 'Two days ago I bought a new phone.')
      ),
      array['past simple', 'time markers', 'irregular verbs']::text[],
      'published', 310,
      jsonb_build_object('seeded_by', '20261022163000_english_grammar_library_b1')
    ),
    (
      v_grammar_product_id, v_en_id, 'prepositions-common-use',
      'Common Prepositions In Context',
      'B1', 'prepositions',
      'Use at for exact times and points (at 6 p.m., at the bus stop). Use on for days, dates and surfaces (on Monday, on 5 May, on the wall). Use in for months, years, parts of the day and bigger areas (in July, in the morning, in Tashkent). Some phrases are fixed, so learn them: at night, at home, at work.',
      'Compare: at 6 p.m., on Monday, in July.',
      'Using the wrong preposition after common time and place expressions.',
      jsonb_build_array(
        jsonb_build_object('bad', 'We will meet in Monday.', 'good', 'We will meet on Monday.'),
        jsonb_build_object('bad', 'She arrived on 6 p.m.', 'good', 'She arrived at 6 p.m.'),
        jsonb_build_object('bad', 'I was born in 12 March.', 'good', 'I was born on 12 March.')
      ),
      array['prepositions', 'time', 'place']::text[],
      'published', 320,
      jsonb_build_object('seeded_by', '20261022163000_english_grammar_library_b1')
    ),
    (
      v_grammar_product_id, v_en_id, 'subject-verb-agreement',
      'Subject-Verb Agreement',
      'B1', 'agreement',
      'The verb must match its subject. In the present simple, he, she, it and singular nouns need -s: She works. Find the real subject: in ''The list of names is long'', the subject is list, not names. Everyone, nobody and each take a singular verb.',
      'Compare: The students are ready. Each student is ready.',
      'Missing -s with he, she, or it, or mixing singular subject with plural verb.',
      jsonb_build_array(
        jsonb_build_object('bad', 'My friend study every night.', 'good', 'My friend studies every night.'),
        jsonb_build_object('bad', 'These plans needs more time.', 'good', 'These plans need more time.'),
        jsonb_build_object('bad', 'Everyone in my family like plov.', 'good', 'Everyone in my family likes plov.')
      ),
      array['agreement', 'present simple']::text[],
      'published', 330,
      jsonb_build_object('seeded_by', '20261022163000_english_grammar_library_b1')
    ),
    (
      v_grammar_product_id, v_en_id, 'present-perfect-vs-past-simple',
      'Present perfect or past simple?',
      'B1', 'present-perfect',
      'Use the past simple when you say when something happened: I visited Khiva in 2022. Use the present perfect (have/has + past participle) for experiences with no time given, and for situations that continue until now: I have visited Khiva twice. She has lived here since May. Don''t use the present perfect with finished time words like yesterday, last year or ago.',
      'Compare: I have worked here for two years (I still work here). I worked there for two years (I don''t work there now).',
      'Using the present perfect with a finished time (I have seen him yesterday), or the present simple for a situation that started in the past (I live here for five years).',
      jsonb_build_array(
        jsonb_build_object('bad', 'I have seen this film last week.', 'good', 'I saw this film last week.'),
        jsonb_build_object('bad', 'I live in Tashkent since 2020.', 'good', 'I have lived in Tashkent since 2020.'),
        jsonb_build_object('bad', 'I know him for ten years.', 'good', 'I have known him for ten years.')
      ),
      array['present perfect', 'past simple']::text[],
      'published', 340,
      jsonb_build_object('seeded_by', '20261022163000_english_grammar_library_b1')
    ),
    (
      v_grammar_product_id, v_en_id, 'conditionals-first-second',
      'First and second conditional',
      'B1', 'conditionals',
      'Use the first conditional for real, possible future situations: If it rains, we will stay at home (if + present, will + verb). Use the second conditional for unreal or unlikely situations: If I had more time, I would learn Korean (if + past, would + verb). Don''t use will or would in the if part.',
      'Compare: If I pass the exam, I will celebrate (possible). If I won a million dollars, I would travel the world (unlikely).',
      'Putting will or would after if, for example ''If I will see him, I will tell him''.',
      jsonb_build_array(
        jsonb_build_object('bad', 'If it will rain tomorrow, we will stay at home.', 'good', 'If it rains tomorrow, we will stay at home.'),
        jsonb_build_object('bad', 'If I would have a car, I would drive to work.', 'good', 'If I had a car, I would drive to work.'),
        jsonb_build_object('bad', 'If I were you, I will apologise.', 'good', 'If I were you, I would apologise.')
      ),
      array['conditionals', 'if']::text[],
      'published', 350,
      jsonb_build_object('seeded_by', '20261022163000_english_grammar_library_b1')
    ),
    (
      v_grammar_product_id, v_en_id, 'used-to-past-habits',
      'Used to for past habits',
      'B1', 'used-to',
      'Use used to + verb for past habits and states that are not true now: I used to play football every day. In questions and negatives, use did and use to (without -d): Did you use to live here? I didn''t use to like tea. For habits now, use usually + present simple.',
      'Compare: I used to walk to school (but I don''t now). I usually walk to work (now).',
      'Using ''use to'' for habits now, putting -ing after used to, or writing ''didn''t used to''.',
      jsonb_build_array(
        jsonb_build_object('bad', 'I use to drink coffee every morning.', 'good', 'I usually drink coffee every morning.'),
        jsonb_build_object('bad', 'When I was a child, I used to living in a village.', 'good', 'When I was a child, I used to live in a village.'),
        jsonb_build_object('bad', 'Did you used to play chess?', 'good', 'Did you use to play chess?')
      ),
      array['used to', 'past habits']::text[],
      'published', 360,
      jsonb_build_object('seeded_by', '20261022163000_english_grammar_library_b1')
    ),
    (
      v_grammar_product_id, v_en_id, 'modals-of-obligation',
      'Must, have to, should, don''t have to',
      'B1', 'modals-obligation',
      'Use must or have to when something is necessary: You must wear a seat belt. I have to work on Saturday. Use should for advice: You should see a doctor. Mustn''t means ''it is not allowed'', but don''t have to means ''it is not necessary''. After must and should, use the verb without to.',
      'Compare: You mustn''t park here (it is not allowed). You don''t have to come early (it is not necessary).',
      'Adding to after must or should (must to go), or using mustn''t when you mean ''it is not necessary''.',
      jsonb_build_array(
        jsonb_build_object('bad', 'You must to show your passport.', 'good', 'You must show your passport.'),
        jsonb_build_object('bad', 'Tomorrow is a holiday, so we mustn''t go to work.', 'good', 'Tomorrow is a holiday, so we don''t have to go to work.'),
        jsonb_build_object('bad', 'She have to finish the report today.', 'good', 'She has to finish the report today.')
      ),
      array['modals', 'obligation', 'advice']::text[],
      'published', 370,
      jsonb_build_object('seeded_by', '20261022163000_english_grammar_library_b1')
    ),
    (
      v_grammar_product_id, v_en_id, 'relative-clauses',
      'Relative clauses: who, which, that, where, whose',
      'B1', 'relative-clauses',
      'Use relative clauses to add information about a noun. Use who for people, which for things, and that for people or things. Use where for places and whose for possession. Don''t repeat the pronoun: say ''the book that I bought'', not ''the book that I bought it''.',
      'Compare: The man who lives next door is a doctor. The café where we met has closed.',
      'Using which for people, what instead of that, or repeating the pronoun (the film that I saw it).',
      jsonb_build_array(
        jsonb_build_object('bad', 'The girl which sits next to me is from Nukus.', 'good', 'The girl who sits next to me is from Nukus.'),
        jsonb_build_object('bad', 'This is the phone that I bought it yesterday.', 'good', 'This is the phone that I bought yesterday.'),
        jsonb_build_object('bad', 'Everything what he said was true.', 'good', 'Everything that he said was true.')
      ),
      array['relative clauses', 'who', 'which']::text[],
      'published', 380,
      jsonb_build_object('seeded_by', '20261022163000_english_grammar_library_b1')
    ),
    (
      v_grammar_product_id, v_en_id, 'gerund-or-infinitive',
      '-ing or to + verb?',
      'B1', 'verb-patterns',
      'Some verbs are followed by -ing: enjoy, finish, mind, avoid, suggest. Others are followed by to + verb: want, decide, hope, plan, need. After a preposition (interested in, good at, before, after, for), always use -ing. A few verbs, like like, love and start, can take both.',
      'Compare: I enjoy reading. I want to read more.',
      'Using to + verb after enjoy, finish or a preposition, or using -ing after want and decide.',
      jsonb_build_array(
        jsonb_build_object('bad', 'I enjoy to cook for my family.', 'good', 'I enjoy cooking for my family.'),
        jsonb_build_object('bad', 'She decided studying abroad.', 'good', 'She decided to study abroad.'),
        jsonb_build_object('bad', 'I''m interested in learn Japanese.', 'good', 'I''m interested in learning Japanese.')
      ),
      array['gerund', 'infinitive', 'verb patterns']::text[],
      'published', 390,
      jsonb_build_object('seeded_by', '20261022163000_english_grammar_library_b1')
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
    and gu.slug in ('past-simple-time-control', 'prepositions-common-use', 'subject-verb-agreement', 'present-perfect-vs-past-simple', 'conditionals-first-second', 'used-to-past-habits', 'modals-of-obligation', 'relative-clauses', 'gerund-or-infinitive')
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
    jsonb_build_object('seeded_by', '20261022163000_english_grammar_library_b1')
  from public.grammar_units gu
  join (
    values
      ('past-simple-time-control', 'fill', 'Complete the sentence', 'Write the verb in brackets in the past simple.',
        'Yesterday I ___ to the station late. (go)',
        jsonb_build_object('accepted_answers', jsonb_build_array('went')),
        'grammar.tense', 10),
      ('past-simple-time-control', 'fill', 'Complete the sentence', 'Write the verb in brackets in the past simple.',
        'My grandfather ___ in a factory before he retired. (work)',
        jsonb_build_object('accepted_answers', jsonb_build_array('worked')),
        'grammar.tense', 20),
      ('past-simple-time-control', 'fill', 'Complete the sentence', 'Write the verb in brackets in the past simple.',
        'We ___ a lot of photos in Samarkand last summer. (take)',
        jsonb_build_object('accepted_answers', jsonb_build_array('took')),
        'grammar.tense', 30),
      ('past-simple-time-control', 'fill', 'Complete the sentence', 'Write the verb in brackets in the past simple.',
        'She ___ the email two hours ago. (send)',
        jsonb_build_object('accepted_answers', jsonb_build_array('sent')),
        'grammar.tense', 40),
      ('past-simple-time-control', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'Last week we study together at the library.',
        jsonb_build_object('accepted_answers', jsonb_build_array('Last week we studied together at the library.')),
        'grammar.tense', 50),
      ('past-simple-time-control', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'I meet my old classmate at the bazaar yesterday.',
        jsonb_build_object('accepted_answers', jsonb_build_array('I met my old classmate at the bazaar yesterday.', 'Yesterday I met my old classmate at the bazaar.')),
        'grammar.tense', 60),
      ('prepositions-common-use', 'fill', 'Complete the sentence', 'Type at, on or in.',
        'We will meet ___ Monday morning.',
        jsonb_build_object('accepted_answers', jsonb_build_array('on Monday morning')),
        'grammar.prepositions', 10),
      ('prepositions-common-use', 'fill', 'Complete the sentence', 'Type at, on or in.',
        'The shop opens ___ 9 a.m.',
        jsonb_build_object('accepted_answers', jsonb_build_array('at')),
        'grammar.prepositions', 20),
      ('prepositions-common-use', 'fill', 'Complete the sentence', 'Type at, on or in.',
        'My cousin lives ___ Andijan.',
        jsonb_build_object('accepted_answers', jsonb_build_array('in')),
        'grammar.prepositions', 30),
      ('prepositions-common-use', 'fill', 'Complete the sentence', 'Type at, on or in.',
        'There is a beautiful picture ___ the wall in our classroom.',
        jsonb_build_object('accepted_answers', jsonb_build_array('on')),
        'grammar.prepositions', 40),
      ('prepositions-common-use', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'She arrived on 6 p.m. after class.',
        jsonb_build_object('accepted_answers', jsonb_build_array('She arrived at 6 p.m. after class.', 'She arrived at 6 pm after class.', 'She arrived at 6pm after class.')),
        'grammar.prepositions', 50),
      ('prepositions-common-use', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'Our exam is in 15 June.',
        jsonb_build_object('accepted_answers', jsonb_build_array('Our exam is on 15 June.', 'Our exam is on June 15.', 'Our exam is on 15th June.', 'Our exam is on June 15th.', 'Our exam is on the 15th of June.')),
        'grammar.prepositions', 60),
      ('subject-verb-agreement', 'fill', 'Complete the sentence', 'Write the correct present simple form of the verb in brackets.',
        'My brother ___ online every evening. (study)',
        jsonb_build_object('accepted_answers', jsonb_build_array('studies')),
        'grammar.agreement', 10),
      ('subject-verb-agreement', 'fill', 'Complete the sentence', 'Write the correct present simple form of the verb in brackets.',
        'The price of these shoes ___ too high. (be)',
        jsonb_build_object('accepted_answers', jsonb_build_array('is')),
        'grammar.agreement', 20),
      ('subject-verb-agreement', 'fill', 'Complete the sentence', 'Write the correct present simple form of the verb in brackets.',
        'Everybody in our group ___ the homework on time. (do)',
        jsonb_build_object('accepted_answers', jsonb_build_array('does')),
        'grammar.agreement', 30),
      ('subject-verb-agreement', 'fill', 'Complete the sentence', 'Write the correct present simple form of the verb in brackets.',
        'My parents ___ in a small village near Namangan. (live)',
        jsonb_build_object('accepted_answers', jsonb_build_array('live')),
        'grammar.agreement', 40),
      ('subject-verb-agreement', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'These plans needs more detail before Friday.',
        jsonb_build_object('accepted_answers', jsonb_build_array('These plans need more detail before Friday.')),
        'grammar.agreement', 50),
      ('subject-verb-agreement', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'One of my friends live in Almaty.',
        jsonb_build_object('accepted_answers', jsonb_build_array('One of my friends lives in Almaty.')),
        'grammar.agreement', 60),
      ('present-perfect-vs-past-simple', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'We ___ in this flat since 2019. (live)',
        jsonb_build_object('accepted_answers', jsonb_build_array('have lived', '''ve lived', 'have been living', '''ve been living')),
        'grammar.present-perfect', 10),
      ('present-perfect-vs-past-simple', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'She ___ to Seoul three years ago. (move)',
        jsonb_build_object('accepted_answers', jsonb_build_array('moved')),
        'grammar.present-perfect', 20),
      ('present-perfect-vs-past-simple', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'Have you ever ___ to Khiva? (be)',
        jsonb_build_object('accepted_answers', jsonb_build_array('been')),
        'grammar.present-perfect', 30),
      ('present-perfect-vs-past-simple', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'My brother ___ his driving test yesterday. (pass)',
        jsonb_build_object('accepted_answers', jsonb_build_array('passed')),
        'grammar.present-perfect', 40),
      ('present-perfect-vs-past-simple', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'I have finished university in 2021.',
        jsonb_build_object('accepted_answers', jsonb_build_array('I finished university in 2021.', 'I graduated from university in 2021.')),
        'grammar.present-perfect', 50),
      ('present-perfect-vs-past-simple', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'I know my best friend for ten years.',
        jsonb_build_object('accepted_answers', jsonb_build_array('I have known my best friend for ten years.', 'I''ve known my best friend for ten years.')),
        'grammar.present-perfect', 60),
      ('conditionals-first-second', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'If you ___ hard, you will pass the exam. (study)',
        jsonb_build_object('accepted_answers', jsonb_build_array('study')),
        'grammar.conditionals', 10),
      ('conditionals-first-second', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'If I ___ more money, I would buy a new laptop. (have)',
        jsonb_build_object('accepted_answers', jsonb_build_array('had')),
        'grammar.conditionals', 20),
      ('conditionals-first-second', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'If she calls, I ___ you know. (let)',
        jsonb_build_object('accepted_answers', jsonb_build_array('will let', '''ll let')),
        'grammar.conditionals', 30),
      ('conditionals-first-second', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'If I lived near the sea, I ___ every day. (swim)',
        jsonb_build_object('accepted_answers', jsonb_build_array('would swim', '''d swim')),
        'grammar.conditionals', 40),
      ('conditionals-first-second', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'If I will see Kamola, I will give her the book.',
        jsonb_build_object('accepted_answers', jsonb_build_array('If I see Kamola, I will give her the book.', 'If I see Kamola, I''ll give her the book.')),
        'grammar.conditionals', 50),
      ('conditionals-first-second', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'If I knew the answer, I will tell you.',
        jsonb_build_object('accepted_answers', jsonb_build_array('If I knew the answer, I would tell you.', 'If I knew the answer, I''d tell you.', 'If I know the answer, I will tell you.', 'If I know the answer, I''ll tell you.')),
        'grammar.conditionals', 60),
      ('used-to-past-habits', 'fill', 'Complete the sentence', 'Use used to and the verb in brackets.',
        'When I was young, I ___ trees in my grandmother''s garden. (climb)',
        jsonb_build_object('accepted_answers', jsonb_build_array('used to climb')),
        'grammar.used-to', 10),
      ('used-to-past-habits', 'fill', 'Complete the sentence', 'Type the missing words.',
        'There ___ be a cinema here, but now it''s a supermarket.',
        jsonb_build_object('accepted_answers', jsonb_build_array('used to')),
        'grammar.used-to', 20),
      ('used-to-past-habits', 'fill', 'Complete the sentence', 'Type the missing word.',
        'Did you ___ to wear a school uniform?',
        jsonb_build_object('accepted_answers', jsonb_build_array('use')),
        'grammar.used-to', 30),
      ('used-to-past-habits', 'fill', 'Complete the sentence', 'Write the negative form of used to.',
        'I ___ like vegetables, but now I love them. (not)',
        jsonb_build_object('accepted_answers', jsonb_build_array('didn''t use to', 'did not use to', 'used not to')),
        'grammar.used-to', 40),
      ('used-to-past-habits', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'We used to playing football after school.',
        jsonb_build_object('accepted_answers', jsonb_build_array('We used to play football after school.')),
        'grammar.used-to', 50),
      ('used-to-past-habits', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'She didn''t used to get up early.',
        jsonb_build_object('accepted_answers', jsonb_build_array('She didn''t use to get up early.', 'She did not use to get up early.', 'She used not to get up early.')),
        'grammar.used-to', 60),
      ('modals-of-obligation', 'fill', 'Complete the sentence', 'Type must or mustn''t.',
        'You ___ use your phone during the exam. It is against the rules.',
        jsonb_build_object('accepted_answers', jsonb_build_array('mustn''t', 'must not', 'can''t', 'cannot')),
        'grammar.modals-obligation', 10),
      ('modals-of-obligation', 'fill', 'Complete the sentence', 'Write the negative form of have to.',
        'It''s Sunday tomorrow, so I ___ get up early. (not / have to)',
        jsonb_build_object('accepted_answers', jsonb_build_array('don''t have to', 'do not have to')),
        'grammar.modals-obligation', 20),
      ('modals-of-obligation', 'fill', 'Complete the sentence', 'Give advice. Type should or shouldn''t.',
        'You look tired. You ___ stay up so late.',
        jsonb_build_object('accepted_answers', jsonb_build_array('shouldn''t', 'should not')),
        'grammar.modals-obligation', 30),
      ('modals-of-obligation', 'fill', 'Complete the sentence', 'Write the correct form of have to.',
        'My sister is a nurse, so she ___ work at night sometimes. (have to)',
        jsonb_build_object('accepted_answers', jsonb_build_array('has to')),
        'grammar.modals-obligation', 40),
      ('modals-of-obligation', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'We must to wear a uniform at our school.',
        jsonb_build_object('accepted_answers', jsonb_build_array('We must wear a uniform at our school.', 'We have to wear a uniform at our school.')),
        'grammar.modals-obligation', 50),
      ('modals-of-obligation', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'He don''t have to pay for the museum because he is a student.',
        jsonb_build_object('accepted_answers', jsonb_build_array('He doesn''t have to pay for the museum because he is a student.', 'He does not have to pay for the museum because he is a student.', 'He doesn''t have to pay for the museum because he''s a student.', 'He does not have to pay for the museum because he''s a student.')),
        'grammar.modals-obligation', 60),
      ('relative-clauses', 'fill', 'Complete the sentence', 'Type who, which, where or whose.',
        'The woman ___ teaches us chemistry is very kind.',
        jsonb_build_object('accepted_answers', jsonb_build_array('who', 'that')),
        'grammar.relative-clauses', 10),
      ('relative-clauses', 'fill', 'Complete the sentence', 'Type who, which, where or whose.',
        'This is the town ___ my parents were born.',
        jsonb_build_object('accepted_answers', jsonb_build_array('where', 'in which')),
        'grammar.relative-clauses', 20),
      ('relative-clauses', 'fill', 'Complete the sentence', 'Type who, which, where or whose.',
        'I lost the umbrella ___ you gave me.',
        jsonb_build_object('accepted_answers', jsonb_build_array('which', 'that')),
        'grammar.relative-clauses', 30),
      ('relative-clauses', 'fill', 'Complete the sentence', 'Type who, which, where or whose.',
        'That''s the student ___ laptop was stolen.',
        jsonb_build_object('accepted_answers', jsonb_build_array('whose')),
        'grammar.relative-clauses', 40),
      ('relative-clauses', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'The doctor which helped me was very friendly.',
        jsonb_build_object('accepted_answers', jsonb_build_array('The doctor who helped me was very friendly.', 'The doctor that helped me was very friendly.')),
        'grammar.relative-clauses', 50),
      ('relative-clauses', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'Where is the cake that I made it this morning?',
        jsonb_build_object('accepted_answers', jsonb_build_array('Where is the cake that I made this morning?', 'Where is the cake which I made this morning?', 'Where is the cake I made this morning?', 'Where''s the cake that I made this morning?', 'Where''s the cake I made this morning?')),
        'grammar.relative-clauses', 60),
      ('gerund-or-infinitive', 'fill', 'Complete the sentence', 'Write the verb in brackets as -ing or to + verb.',
        'Have you finished ___ your essay? (write)',
        jsonb_build_object('accepted_answers', jsonb_build_array('writing')),
        'grammar.verb-patterns', 10),
      ('gerund-or-infinitive', 'fill', 'Complete the sentence', 'Write the verb in brackets as -ing or to + verb.',
        'We hope ___ you again next summer. (see)',
        jsonb_build_object('accepted_answers', jsonb_build_array('to see')),
        'grammar.verb-patterns', 20),
      ('gerund-or-infinitive', 'fill', 'Complete the sentence', 'Write the verb in brackets as -ing or to + verb.',
        'He is very good at ___ problems. (solve)',
        jsonb_build_object('accepted_answers', jsonb_build_array('solving')),
        'grammar.verb-patterns', 30),
      ('gerund-or-infinitive', 'fill', 'Complete the sentence', 'Write the verb in brackets as -ing or to + verb.',
        'Would you mind ___ the door, please? (close)',
        jsonb_build_object('accepted_answers', jsonb_build_array('closing')),
        'grammar.verb-patterns', 40),
      ('gerund-or-infinitive', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'I want visiting my cousins in Termez.',
        jsonb_build_object('accepted_answers', jsonb_build_array('I want to visit my cousins in Termez.')),
        'grammar.verb-patterns', 50),
      ('gerund-or-infinitive', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'Thank you for help me with my homework.',
        jsonb_build_object('accepted_answers', jsonb_build_array('Thank you for helping me with my homework.')),
        'grammar.verb-patterns', 60)
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
    and gu.slug in ('past-simple-time-control', 'prepositions-common-use', 'subject-verb-agreement', 'present-perfect-vs-past-simple', 'conditionals-first-second', 'used-to-past-habits', 'modals-of-obligation', 'relative-clauses', 'gerund-or-infinitive')
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
    jsonb_build_object('seeded_by', '20261022163000_english_grammar_library_b1'),
    gu.created_by,
    gu.updated_by
  from public.grammar_units gu
  where gu.product_id = v_grammar_product_id
    and gu.language_id = v_en_id
    and gu.slug in ('past-simple-time-control', 'prepositions-common-use', 'subject-verb-agreement', 'present-perfect-vs-past-simple', 'conditionals-first-second', 'used-to-past-habits', 'modals-of-obligation', 'relative-clauses', 'gerund-or-infinitive')
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
