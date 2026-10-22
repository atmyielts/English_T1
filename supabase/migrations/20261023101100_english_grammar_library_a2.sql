-- English Grammar library, level A2: 6 units x 6 drills (4 fill + 2 error_correction).
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
      v_grammar_product_id, v_en_id, 'articles-basic-control',
      'Articles: a, an, the',
      'A2', 'articles',
      'Use a or an with one thing when you talk about it for the first time or it is not a special one: I saw a cat. Use an before a vowel sound: an apple, an hour. Use the when the listener knows which thing you mean: The cat was black. Don''t use a or an with plural or uncountable nouns.',
      'Compare: I saw a teacher near the library. The teacher was carrying a map.',
      'Leaving out a, an or the before a singular noun, or using the when the noun is still new.',
      jsonb_build_array(
        jsonb_build_object('bad', 'I bought book yesterday.', 'good', 'I bought a book yesterday.'),
        jsonb_build_object('bad', 'He is engineer.', 'good', 'He is an engineer.'),
        jsonb_build_object('bad', 'Can you open a door, please?', 'good', 'Can you open the door, please?')
      ),
      array['articles', 'count nouns']::text[],
      'published', 210,
      jsonb_build_object('seeded_by', '20261022162000_english_grammar_library_a2')
    ),
    (
      v_grammar_product_id, v_en_id, 'past-simple-did-didnt',
      'Past simple: did and didn''t',
      'A2', 'past-simple',
      'In past simple questions and negatives, use did or didn''t + the base verb: Did you call him? I didn''t see her. After did and didn''t, the verb has no -ed and no past form: say ''didn''t go'', not ''didn''t went''.',
      'Compare: I went to the bazaar. I didn''t go to the bazaar. Did you go to the bazaar?',
      'Using the past form after did or didn''t, like ''didn''t went'', or making a question without did.',
      jsonb_build_array(
        jsonb_build_object('bad', 'I didn''t went to school yesterday.', 'good', 'I didn''t go to school yesterday.'),
        jsonb_build_object('bad', 'Where you went on Saturday?', 'good', 'Where did you go on Saturday?'),
        jsonb_build_object('bad', 'She didn''t liked the film.', 'good', 'She didn''t like the film.')
      ),
      array['past simple', 'questions', 'negatives']::text[],
      'published', 220,
      jsonb_build_object('seeded_by', '20261022162000_english_grammar_library_a2')
    ),
    (
      v_grammar_product_id, v_en_id, 'present-continuous-vs-simple',
      'Present continuous or present simple?',
      'A2', 'present-continuous',
      'Use the present simple for habits and things that are always true: I walk to work every day. Use the present continuous (am, is, are + -ing) for actions happening now or around now: I am walking to work now. Verbs like know, like, want and need are not usually used with -ing.',
      'Compare: She usually drinks tea. Today she is drinking coffee.',
      'Using the -ing form for habits, or forgetting am, is or are before the -ing verb.',
      jsonb_build_array(
        jsonb_build_object('bad', 'I am going to the gym every Monday.', 'good', 'I go to the gym every Monday.'),
        jsonb_build_object('bad', 'Look! It snowing.', 'good', 'Look! It''s snowing.'),
        jsonb_build_object('bad', 'I am knowing the answer.', 'good', 'I know the answer.')
      ),
      array['present continuous', 'present simple']::text[],
      'published', 230,
      jsonb_build_object('seeded_by', '20261022162000_english_grammar_library_a2')
    ),
    (
      v_grammar_product_id, v_en_id, 'comparatives-superlatives',
      'Comparatives and superlatives',
      'A2', 'comparatives',
      'To compare two things, add -er to short adjectives (cheap → cheaper) or put more before long adjectives (more expensive), then use than. To say something is number one in a group, use the + -est (the cheapest) or the most (the most expensive). Some are irregular: good → better → the best, bad → worse → the worst.',
      'Compare: My bag is heavier than your bag. Ali''s bag is the heaviest.',
      'Using more with a short adjective (more cheap) or using both forms together (more bigger).',
      jsonb_build_array(
        jsonb_build_object('bad', 'This phone is more cheap than that one.', 'good', 'This phone is cheaper than that one.'),
        jsonb_build_object('bad', 'My room is more bigger than yours.', 'good', 'My room is bigger than yours.'),
        jsonb_build_object('bad', 'She is the most good student in the class.', 'good', 'She is the best student in the class.')
      ),
      array['comparatives', 'superlatives', 'adjectives']::text[],
      'published', 240,
      jsonb_build_object('seeded_by', '20261022162000_english_grammar_library_a2')
    ),
    (
      v_grammar_product_id, v_en_id, 'future-going-to-will',
      'Going to and will',
      'A2', 'future',
      'Use be going to for plans you have already made: I''m going to visit my aunt on Saturday. Use will for quick decisions at the moment of speaking, offers and promises: It''s cold. I''ll close the window. Don''t put to after will.',
      'Compare: I''m going to study medicine next year (a plan). The phone is ringing. I''ll answer it (a quick decision).',
      'Forgetting am, is or are before going to, or putting to after will (will to go).',
      jsonb_build_array(
        jsonb_build_object('bad', 'I going to buy a new laptop.', 'good', 'I''m going to buy a new laptop.'),
        jsonb_build_object('bad', 'Next summer we will to travel to Khiva.', 'good', 'Next summer we''re going to travel to Khiva.'),
        jsonb_build_object('bad', 'That bag looks heavy. I help you.', 'good', 'That bag looks heavy. I''ll help you.')
      ),
      array['future', 'going to', 'will']::text[],
      'published', 250,
      jsonb_build_object('seeded_by', '20261022162000_english_grammar_library_a2')
    ),
    (
      v_grammar_product_id, v_en_id, 'countable-uncountable-quantifiers',
      'Countable and uncountable: some, any, much, many',
      'A2', 'quantifiers',
      'Countable nouns can be counted: one apple, two apples. Uncountable nouns cannot: water, money, information, advice. Use many with countable nouns and much with uncountable nouns, mostly in questions and negatives. Use some in positive sentences and any in questions and negatives.',
      'Compare: How many eggs do we need? How much sugar do we need?',
      'Adding -s to uncountable nouns (informations, advices) or using many with uncountable nouns.',
      jsonb_build_array(
        jsonb_build_object('bad', 'Can you give me some advices?', 'good', 'Can you give me some advice?'),
        jsonb_build_object('bad', 'I don''t have many money.', 'good', 'I don''t have much money.'),
        jsonb_build_object('bad', 'We need informations about the course.', 'good', 'We need information about the course.')
      ),
      array['countable', 'uncountable', 'some', 'any']::text[],
      'published', 260,
      jsonb_build_object('seeded_by', '20261022162000_english_grammar_library_a2')
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
    and gu.slug in ('articles-basic-control', 'past-simple-did-didnt', 'present-continuous-vs-simple', 'comparatives-superlatives', 'future-going-to-will', 'countable-uncountable-quantifiers')
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
    jsonb_build_object('seeded_by', '20261022162000_english_grammar_library_a2')
  from public.grammar_units gu
  join (
    values
      ('articles-basic-control', 'fill', 'Complete the sentence', 'Type a, an or the.',
        'I bought ___ umbrella before the storm.',
        jsonb_build_object('accepted_answers', jsonb_build_array('an umbrella')),
        'grammar.articles', 10),
      ('articles-basic-control', 'fill', 'Complete the sentence', 'Type a, an or the.',
        'My uncle is ___ farmer near Fergana.',
        jsonb_build_object('accepted_answers', jsonb_build_array('a')),
        'grammar.articles', 20),
      ('articles-basic-control', 'fill', 'Complete the sentence', 'Type a, an or the.',
        'Can you close ___ window, please? It''s cold.',
        jsonb_build_object('accepted_answers', jsonb_build_array('the')),
        'grammar.articles', 30),
      ('articles-basic-control', 'fill', 'Complete the sentence', 'Type a, an or the.',
        'She waited for ___ hour at the doctor''s.',
        jsonb_build_object('accepted_answers', jsonb_build_array('an')),
        'grammar.articles', 40),
      ('articles-basic-control', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'She opened door and the cat ran outside.',
        jsonb_build_object('accepted_answers', jsonb_build_array('She opened the door and the cat ran outside.', 'She opened the door, and the cat ran outside.')),
        'grammar.articles', 50),
      ('articles-basic-control', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'My brother is student at university.',
        jsonb_build_object('accepted_answers', jsonb_build_array('My brother is a student at university.', 'My brother is a student at the university.', 'My brother is a university student.')),
        'grammar.articles', 60),
      ('past-simple-did-didnt', 'fill', 'Complete the sentence', 'Write the negative past form of the verb in brackets.',
        'We ___ the museum last Sunday. It was closed. (not visit)',
        jsonb_build_object('accepted_answers', jsonb_build_array('didn''t visit', 'did not visit')),
        'grammar.past-simple', 10),
      ('past-simple-did-didnt', 'fill', 'Complete the sentence', 'Type the missing word.',
        '___ you finish your homework last night?',
        jsonb_build_object('accepted_answers', jsonb_build_array('Did')),
        'grammar.past-simple', 20),
      ('past-simple-did-didnt', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'Did she ___ the bus this morning? (take)',
        jsonb_build_object('accepted_answers', jsonb_build_array('take')),
        'grammar.past-simple', 30),
      ('past-simple-did-didnt', 'fill', 'Complete the sentence', 'Type the missing word.',
        'What time ___ the train arrive yesterday?',
        jsonb_build_object('accepted_answers', jsonb_build_array('did')),
        'grammar.past-simple', 40),
      ('past-simple-did-didnt', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'He didn''t came to the lesson on Monday.',
        jsonb_build_object('accepted_answers', jsonb_build_array('He didn''t come to the lesson on Monday.', 'He did not come to the lesson on Monday.')),
        'grammar.past-simple', 50),
      ('past-simple-did-didnt', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'Where you bought this jacket?',
        jsonb_build_object('accepted_answers', jsonb_build_array('Where did you buy this jacket?')),
        'grammar.past-simple', 60),
      ('present-continuous-vs-simple', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'Please be quiet. The baby ___. (sleep)',
        jsonb_build_object('accepted_answers', jsonb_build_array('is sleeping')),
        'grammar.present-continuous', 10),
      ('present-continuous-vs-simple', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'My father ___ the newspaper every morning. (read)',
        jsonb_build_object('accepted_answers', jsonb_build_array('reads')),
        'grammar.present-continuous', 20),
      ('present-continuous-vs-simple', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'Where is Dilnoza? She ___ in the garden right now. (work)',
        jsonb_build_object('accepted_answers', jsonb_build_array('is working')),
        'grammar.present-continuous', 30),
      ('present-continuous-vs-simple', 'fill', 'Complete the sentence', 'Write the negative form of the verb in brackets.',
        'I ___ your phone number. Can you tell me again? (not know)',
        jsonb_build_object('accepted_answers', jsonb_build_array('don''t know', 'do not know')),
        'grammar.present-continuous', 40),
      ('present-continuous-vs-simple', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'He is usually getting up at six.',
        jsonb_build_object('accepted_answers', jsonb_build_array('He usually gets up at six.', 'He usually gets up at 6.')),
        'grammar.present-continuous', 50),
      ('present-continuous-vs-simple', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'I am wanting a new phone.',
        jsonb_build_object('accepted_answers', jsonb_build_array('I want a new phone.')),
        'grammar.present-continuous', 60),
      ('comparatives-superlatives', 'fill', 'Complete the sentence', 'Write the comparative or superlative form of the word in brackets.',
        'A bus ticket is ___ than a taxi. (cheap)',
        jsonb_build_object('accepted_answers', jsonb_build_array('cheaper')),
        'grammar.comparatives', 10),
      ('comparatives-superlatives', 'fill', 'Complete the sentence', 'Write the comparative or superlative form of the word in brackets.',
        'Today is the ___ day of the year so far. (hot)',
        jsonb_build_object('accepted_answers', jsonb_build_array('hottest')),
        'grammar.comparatives', 20),
      ('comparatives-superlatives', 'fill', 'Complete the sentence', 'Write the comparative or superlative form of the word in brackets.',
        'For me, maths is ___ than history. (difficult)',
        jsonb_build_object('accepted_answers', jsonb_build_array('more difficult')),
        'grammar.comparatives', 30),
      ('comparatives-superlatives', 'fill', 'Complete the sentence', 'Write the comparative or superlative form of the word in brackets.',
        'Her English is ___ than mine. (good)',
        jsonb_build_object('accepted_answers', jsonb_build_array('better')),
        'grammar.comparatives', 40),
      ('comparatives-superlatives', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'My brother is more tall than me.',
        jsonb_build_object('accepted_answers', jsonb_build_array('My brother is taller than me.', 'My brother is taller than I am.', 'My brother is taller than I.')),
        'grammar.comparatives', 50),
      ('comparatives-superlatives', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'It was the most bad film I have ever seen.',
        jsonb_build_object('accepted_answers', jsonb_build_array('It was the worst film I have ever seen.', 'It was the worst film I''ve ever seen.')),
        'grammar.comparatives', 60),
      ('future-going-to-will', 'fill', 'Complete the sentence', 'Use the form of be going to.',
        'I have already bought the tickets. We ___ visit Bukhara next month. (be going to)',
        jsonb_build_object('accepted_answers', jsonb_build_array('are going to', '''re going to')),
        'grammar.future', 10),
      ('future-going-to-will', 'fill', 'Complete the sentence', 'Write the negative form of will.',
        'Don''t worry. I ___ tell anyone your secret. (will, not)',
        jsonb_build_object('accepted_answers', jsonb_build_array('won''t', 'will not')),
        'grammar.future', 20),
      ('future-going-to-will', 'fill', 'Complete the sentence', 'Type the missing word.',
        'What ___ you going to do after the exam?',
        jsonb_build_object('accepted_answers', jsonb_build_array('are')),
        'grammar.future', 30),
      ('future-going-to-will', 'fill', 'Complete the sentence', 'Write the negative form of be going to.',
        'They ___ move to a new flat this year. They decided to stay. (not / be going to)',
        jsonb_build_object('accepted_answers', jsonb_build_array('aren''t going to', 'are not going to', '''re not going to')),
        'grammar.future', 40),
      ('future-going-to-will', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'Next year I will to study in Seoul.',
        jsonb_build_object('accepted_answers', jsonb_build_array('Next year I will study in Seoul.', 'Next year I''m going to study in Seoul.', 'Next year I am going to study in Seoul.', 'Next year I''ll study in Seoul.')),
        'grammar.future', 50),
      ('future-going-to-will', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'My sister going to start university in September.',
        jsonb_build_object('accepted_answers', jsonb_build_array('My sister is going to start university in September.', 'My sister''s going to start university in September.')),
        'grammar.future', 60),
      ('countable-uncountable-quantifiers', 'fill', 'Complete the sentence', 'Type much or many.',
        'How ___ brothers and sisters do you have?',
        jsonb_build_object('accepted_answers', jsonb_build_array('many')),
        'grammar.quantifiers', 10),
      ('countable-uncountable-quantifiers', 'fill', 'Complete the sentence', 'Type much or many.',
        'We don''t have ___ time before the train leaves.',
        jsonb_build_object('accepted_answers', jsonb_build_array('much')),
        'grammar.quantifiers', 20),
      ('countable-uncountable-quantifiers', 'fill', 'Complete the sentence', 'Type some or any.',
        'Are there ___ good cafés near the university?',
        jsonb_build_object('accepted_answers', jsonb_build_array('any')),
        'grammar.quantifiers', 30),
      ('countable-uncountable-quantifiers', 'fill', 'Complete the sentence', 'Type some or any.',
        'I need to buy ___ bread for dinner.',
        jsonb_build_object('accepted_answers', jsonb_build_array('some')),
        'grammar.quantifiers', 40),
      ('countable-uncountable-quantifiers', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'My teacher gave me some useful advices.',
        jsonb_build_object('accepted_answers', jsonb_build_array('My teacher gave me some useful advice.', 'My teacher gave me some useful pieces of advice.')),
        'grammar.quantifiers', 50),
      ('countable-uncountable-quantifiers', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'How much students are in your group?',
        jsonb_build_object('accepted_answers', jsonb_build_array('How many students are in your group?', 'How many students are there in your group?')),
        'grammar.quantifiers', 60)
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
    and gu.slug in ('articles-basic-control', 'past-simple-did-didnt', 'present-continuous-vs-simple', 'comparatives-superlatives', 'future-going-to-will', 'countable-uncountable-quantifiers')
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
    jsonb_build_object('seeded_by', '20261022162000_english_grammar_library_a2'),
    gu.created_by,
    gu.updated_by
  from public.grammar_units gu
  where gu.product_id = v_grammar_product_id
    and gu.language_id = v_en_id
    and gu.slug in ('articles-basic-control', 'past-simple-did-didnt', 'present-continuous-vs-simple', 'comparatives-superlatives', 'future-going-to-will', 'countable-uncountable-quantifiers')
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
