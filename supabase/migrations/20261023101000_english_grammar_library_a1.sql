-- English Grammar library, level A1: 6 units x 6 drills (4 fill + 2 error_correction).
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
      v_grammar_product_id, v_en_id, 'to-be-am-is-are',
      'To be: am, is, are',
      'A1', 'to-be',
      'Use am with I. Use is with he, she and it. Use are with you, we and they. In a question, put am, is or are first: Are you a student? For a negative, add not: I am not tired.',
      'Compare: I am a student. She is a student. They are students.',
      'Leaving out am, is or are, for example ''She teacher'' instead of ''She is a teacher''.',
      jsonb_build_array(
        jsonb_build_object('bad', 'My sister teacher.', 'good', 'My sister is a teacher.'),
        jsonb_build_object('bad', 'We is from Samarkand.', 'good', 'We are from Samarkand.'),
        jsonb_build_object('bad', 'You are hungry?', 'good', 'Are you hungry?')
      ),
      array['to be', 'basics']::text[],
      'published', 110,
      jsonb_build_object('seeded_by', '20261022161000_english_grammar_library_a1')
    ),
    (
      v_grammar_product_id, v_en_id, 'present-simple-routines',
      'Present simple: daily routines',
      'A1', 'present-simple',
      'Use the present simple for habits and facts: I drink tea every morning. With he, she and it, add -s to the verb: she drinks. For negatives and questions, use do or does: I don''t eat meat. Does he work here?',
      'Compare: I work in a bank. My brother works in a shop.',
      'Forgetting -s with he, she and it, or saying ''don''t'' instead of ''doesn''t'' with he, she and it.',
      jsonb_build_array(
        jsonb_build_object('bad', 'She drink tea every morning.', 'good', 'She drinks tea every morning.'),
        jsonb_build_object('bad', 'He don''t like coffee.', 'good', 'He doesn''t like coffee.'),
        jsonb_build_object('bad', 'Where you live?', 'good', 'Where do you live?')
      ),
      array['present simple', 'routines']::text[],
      'published', 120,
      jsonb_build_object('seeded_by', '20261022161000_english_grammar_library_a1')
    ),
    (
      v_grammar_product_id, v_en_id, 'there-is-there-are',
      'There is and there are',
      'A1', 'there-is',
      'Use there is for one thing and there are for two or more things. We use them to say that something exists or where it is: There is a park near my house. In questions, say Is there…? or Are there…?',
      'Compare: There is a bank on this street. There are two banks on this street.',
      'Saying ''In my city have many parks'' instead of ''There are many parks in my city'', or using is with plural nouns.',
      jsonb_build_array(
        jsonb_build_object('bad', 'In my city have many parks.', 'good', 'There are many parks in my city.'),
        jsonb_build_object('bad', 'There is three chairs in the room.', 'good', 'There are three chairs in the room.'),
        jsonb_build_object('bad', 'Is there any shops near here?', 'good', 'Are there any shops near here?')
      ),
      array['there is', 'there are']::text[],
      'published', 130,
      jsonb_build_object('seeded_by', '20261022161000_english_grammar_library_a1')
    ),
    (
      v_grammar_product_id, v_en_id, 'can-and-cant',
      'Can and can''t',
      'A1', 'modal-can',
      'Use can + verb to talk about what you are able to do and to ask for permission: I can swim. Can I sit here? The verb after can has no -s and no to. The negative is can''t (cannot).',
      'Compare: She can drive. She can''t drive. Can she drive?',
      'Adding to or -s after can, for example ''He can to swim'' or ''He cans swim''.',
      jsonb_build_array(
        jsonb_build_object('bad', 'I can to speak English.', 'good', 'I can speak English.'),
        jsonb_build_object('bad', 'She cans cook plov.', 'good', 'She can cook plov.'),
        jsonb_build_object('bad', 'You can help me?', 'good', 'Can you help me?')
      ),
      array['can', 'ability', 'permission']::text[],
      'published', 140,
      jsonb_build_object('seeded_by', '20261022161000_english_grammar_library_a1')
    ),
    (
      v_grammar_product_id, v_en_id, 'plurals-this-that-these-those',
      'Plurals and this, that, these, those',
      'A1', 'plurals-demonstratives',
      'Add -s to most nouns for more than one: book → books. Some nouns change: child → children, man → men, woman → women, person → people. Use this (one) and these (more than one) for things near you. Use that (one) and those (more than one) for things far from you.',
      'Compare: This apple is sweet. These apples are sweet.',
      'Using this or that with plural nouns, or forgetting the plural -s after a number.',
      jsonb_build_array(
        jsonb_build_object('bad', 'This shoes are new.', 'good', 'These shoes are new.'),
        jsonb_build_object('bad', 'I have two brother.', 'good', 'I have two brothers.'),
        jsonb_build_object('bad', 'There are three childs in the park.', 'good', 'There are three children in the park.')
      ),
      array['plurals', 'this', 'these']::text[],
      'published', 150,
      jsonb_build_object('seeded_by', '20261022161000_english_grammar_library_a1')
    ),
    (
      v_grammar_product_id, v_en_id, 'possessives-my-your-s',
      'Possessives: my, your, his, her, ''s',
      'A1', 'possessives',
      'Use my, your, his, her, its, our and their before a noun: This is my phone. Use his for a man and her for a woman. Use ''s to show that something belongs to a person: Ali''s car, my mother''s birthday.',
      'Compare: This is Lola''s book. It is her book.',
      'Mixing up his and her, or saying ''the car of my brother'' instead of ''my brother''s car''.',
      jsonb_build_array(
        jsonb_build_object('bad', 'My sister lost his phone.', 'good', 'My sister lost her phone.'),
        jsonb_build_object('bad', 'This is the house of my uncle.', 'good', 'This is my uncle''s house.'),
        jsonb_build_object('bad', 'They love they teacher.', 'good', 'They love their teacher.')
      ),
      array['possessives', 'pronouns']::text[],
      'published', 160,
      jsonb_build_object('seeded_by', '20261022161000_english_grammar_library_a1')
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
    and gu.slug in ('to-be-am-is-are', 'present-simple-routines', 'there-is-there-are', 'can-and-cant', 'plurals-this-that-these-those', 'possessives-my-your-s')
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
    jsonb_build_object('seeded_by', '20261022161000_english_grammar_library_a1')
  from public.grammar_units gu
  join (
    values
      ('to-be-am-is-are', 'fill', 'Complete the sentence', 'Type am, is or are.',
        'My brother ___ a doctor.',
        jsonb_build_object('accepted_answers', jsonb_build_array('is')),
        'grammar.to-be', 10),
      ('to-be-am-is-are', 'fill', 'Complete the sentence', 'Type am, is or are.',
        'I ___ from Tashkent.',
        jsonb_build_object('accepted_answers', jsonb_build_array('am')),
        'grammar.to-be', 20),
      ('to-be-am-is-are', 'fill', 'Complete the sentence', 'Type am, is or are.',
        'My friends ___ at the bus stop now.',
        jsonb_build_object('accepted_answers', jsonb_build_array('are')),
        'grammar.to-be', 30),
      ('to-be-am-is-are', 'fill', 'Complete the sentence', 'Write the negative form.',
        'Aziz ___ at home today. He is at work. (not)',
        jsonb_build_object('accepted_answers', jsonb_build_array('isn''t', 'is not')),
        'grammar.to-be', 40),
      ('to-be-am-is-are', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'My mother a nurse.',
        jsonb_build_object('accepted_answers', jsonb_build_array('My mother is a nurse.', 'My mother''s a nurse.')),
        'grammar.to-be', 50),
      ('to-be-am-is-are', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'You are a new student?',
        jsonb_build_object('accepted_answers', jsonb_build_array('Are you a new student?')),
        'grammar.to-be', 60),
      ('present-simple-routines', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'My father ___ to work by bus. (go)',
        jsonb_build_object('accepted_answers', jsonb_build_array('goes')),
        'grammar.present-simple', 10),
      ('present-simple-routines', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'We ___ dinner at seven o''clock. (have)',
        jsonb_build_object('accepted_answers', jsonb_build_array('have')),
        'grammar.present-simple', 20),
      ('present-simple-routines', 'fill', 'Complete the sentence', 'Write the negative form of the verb in brackets.',
        'My sister ___ meat. She likes vegetables. (not eat)',
        jsonb_build_object('accepted_answers', jsonb_build_array('doesn''t eat', 'does not eat')),
        'grammar.present-simple', 30),
      ('present-simple-routines', 'fill', 'Complete the sentence', 'Type do or does.',
        '___ you play football on Saturdays?',
        jsonb_build_object('accepted_answers', jsonb_build_array('Do')),
        'grammar.present-simple', 40),
      ('present-simple-routines', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'He work in a hospital.',
        jsonb_build_object('accepted_answers', jsonb_build_array('He works in a hospital.')),
        'grammar.present-simple', 50),
      ('present-simple-routines', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'She don''t speak Russian.',
        jsonb_build_object('accepted_answers', jsonb_build_array('She doesn''t speak Russian.', 'She does not speak Russian.')),
        'grammar.present-simple', 60),
      ('there-is-there-are', 'fill', 'Complete the sentence', 'Type is or are.',
        'There ___ a big market near our house.',
        jsonb_build_object('accepted_answers', jsonb_build_array('is')),
        'grammar.there-is', 10),
      ('there-is-there-are', 'fill', 'Complete the sentence', 'Type is or are.',
        'There ___ twenty students in my class.',
        jsonb_build_object('accepted_answers', jsonb_build_array('are')),
        'grammar.there-is', 20),
      ('there-is-there-are', 'fill', 'Complete the sentence', 'Type Is or Are.',
        '___ there a bus to the airport?',
        jsonb_build_object('accepted_answers', jsonb_build_array('Is')),
        'grammar.there-is', 30),
      ('there-is-there-are', 'fill', 'Complete the sentence', 'Write the negative form.',
        'There ___ any milk in the fridge. (not)',
        jsonb_build_object('accepted_answers', jsonb_build_array('isn''t', 'is not')),
        'grammar.there-is', 40),
      ('there-is-there-are', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'There is two banks near the station.',
        jsonb_build_object('accepted_answers', jsonb_build_array('There are two banks near the station.')),
        'grammar.there-is', 50),
      ('there-is-there-are', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'There are a cat in the garden.',
        jsonb_build_object('accepted_answers', jsonb_build_array('There is a cat in the garden.', 'There''s a cat in the garden.')),
        'grammar.there-is', 60),
      ('can-and-cant', 'fill', 'Complete the sentence', 'Type can or can''t.',
        'My grandmother ___ make very good bread. Everyone loves it.',
        jsonb_build_object('accepted_answers', jsonb_build_array('can')),
        'grammar.modal-can', 10),
      ('can-and-cant', 'fill', 'Complete the sentence', 'Type can or can''t.',
        'I ___ come to the party. I am very busy.',
        jsonb_build_object('accepted_answers', jsonb_build_array('can''t', 'cannot', 'can not')),
        'grammar.modal-can', 20),
      ('can-and-cant', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'Can you ___ the piano? (play)',
        jsonb_build_object('accepted_answers', jsonb_build_array('play')),
        'grammar.modal-can', 30),
      ('can-and-cant', 'fill', 'Complete the sentence', 'Type the missing word.',
        '___ I open the window? It''s hot in here.',
        jsonb_build_object('accepted_answers', jsonb_build_array('Can', 'May', 'Could')),
        'grammar.modal-can', 40),
      ('can-and-cant', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'He can speaks three languages.',
        jsonb_build_object('accepted_answers', jsonb_build_array('He can speak three languages.')),
        'grammar.modal-can', 50),
      ('can-and-cant', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'She can to ride a bike.',
        jsonb_build_object('accepted_answers', jsonb_build_array('She can ride a bike.')),
        'grammar.modal-can', 60),
      ('plurals-this-that-these-those', 'fill', 'Complete the sentence', 'Write the plural of the word in brackets.',
        'I have three ___ in my bag. (book)',
        jsonb_build_object('accepted_answers', jsonb_build_array('books')),
        'grammar.plurals-demonstratives', 10),
      ('plurals-this-that-these-those', 'fill', 'Complete the sentence', 'Type this, that, these or those.',
        'Look at ___ birds over there in the tree!',
        jsonb_build_object('accepted_answers', jsonb_build_array('those')),
        'grammar.plurals-demonstratives', 20),
      ('plurals-this-that-these-those', 'fill', 'Complete the sentence', 'Write the plural of the word in brackets.',
        'Two ___ are waiting for the bus. (woman)',
        jsonb_build_object('accepted_answers', jsonb_build_array('women')),
        'grammar.plurals-demonstratives', 30),
      ('plurals-this-that-these-those', 'fill', 'Complete the sentence', 'Type this, that, these or those.',
        '___ bag in my hand is very heavy.',
        jsonb_build_object('accepted_answers', jsonb_build_array('This')),
        'grammar.plurals-demonstratives', 40),
      ('plurals-this-that-these-those', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'These book is interesting.',
        jsonb_build_object('accepted_answers', jsonb_build_array('This book is interesting.', 'These books are interesting.')),
        'grammar.plurals-demonstratives', 50),
      ('plurals-this-that-these-those', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'Many peoples come to the bazaar on Sunday.',
        jsonb_build_object('accepted_answers', jsonb_build_array('Many people come to the bazaar on Sunday.', 'Many people come to the bazaar on Sundays.')),
        'grammar.plurals-demonstratives', 60),
      ('possessives-my-your-s', 'fill', 'Complete the sentence', 'Write the possessive word for the person in brackets.',
        'Malika is in ___ room. (she)',
        jsonb_build_object('accepted_answers', jsonb_build_array('her')),
        'grammar.possessives', 10),
      ('possessives-my-your-s', 'fill', 'Complete the sentence', 'Write the possessive word for the people in brackets.',
        'We visit ___ grandparents every Sunday. (we)',
        jsonb_build_object('accepted_answers', jsonb_build_array('our')),
        'grammar.possessives', 20),
      ('possessives-my-your-s', 'fill', 'Complete the sentence', 'Write the name in brackets with ''s.',
        'This is ___ bike. (Anvar)',
        jsonb_build_object('accepted_answers', jsonb_build_array('Anvar''s')),
        'grammar.possessives', 30),
      ('possessives-my-your-s', 'fill', 'Complete the sentence', 'Write the possessive word for the people in brackets.',
        'The students opened ___ books. (they)',
        jsonb_build_object('accepted_answers', jsonb_build_array('their')),
        'grammar.possessives', 40),
      ('possessives-my-your-s', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'My father washed her car.',
        jsonb_build_object('accepted_answers', jsonb_build_array('My father washed his car.')),
        'grammar.possessives', 50),
      ('possessives-my-your-s', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'This is the bag of my friend.',
        jsonb_build_object('accepted_answers', jsonb_build_array('This is my friend''s bag.')),
        'grammar.possessives', 60)
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
    and gu.slug in ('to-be-am-is-are', 'present-simple-routines', 'there-is-there-are', 'can-and-cant', 'plurals-this-that-these-those', 'possessives-my-your-s')
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
    jsonb_build_object('seeded_by', '20261022161000_english_grammar_library_a1'),
    gu.created_by,
    gu.updated_by
  from public.grammar_units gu
  where gu.product_id = v_grammar_product_id
    and gu.language_id = v_en_id
    and gu.slug in ('to-be-am-is-are', 'present-simple-routines', 'there-is-there-are', 'can-and-cant', 'plurals-this-that-these-those', 'possessives-my-your-s')
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
