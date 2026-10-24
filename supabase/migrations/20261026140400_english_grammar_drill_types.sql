-- Grammar: two more kinds of practice, sentence transformation and word order,
-- for 18 units A1-C2 (one of each per unit, sort_order 70 and 80).
--
-- word_order is a new drill type: the prompt lists the words separated by
-- " / " and the answer is the whole sentence (checked like any other answer,
-- english-grammar.ts usesAllTiles / checkGrammarAnswer). The drill_type check
-- constraint is widened to allow it.
--
-- Idempotent: rows are inserted once per (unit, type, sort_order); an existing
-- row, including one an admin edited, is left as it is. Older
-- grammar-remediation code shows a word-order item as a normal typed answer.

do $$
declare
  v_constraint text;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'grammar_drills'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%drill_type%'
  loop
    execute format('alter table public.grammar_drills drop constraint %I', v_constraint);
  end loop;
  alter table public.grammar_drills
    add constraint grammar_drills_drill_type_check
    check (drill_type in ('recognition', 'fill', 'transformation', 'error_correction', 'open_production', 'word_order'));
end
$$;

do $$
declare
  v_en_id uuid;
  v_grammar_product_id uuid;
begin
  select id into v_en_id from public.languages where code = 'en' limit 1;
  select p.id into v_grammar_product_id
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) = 'english-grammar'
  order by p.created_at asc
  limit 1;
  if v_en_id is null or v_grammar_product_id is null then
    raise notice 'English grammar product not found; skipping the new practice items';
    return;
  end if;

  insert into public.grammar_drills (
    grammar_unit_id, drill_type, title, instructions, prompt_text, expected_answer_json,
    target_skill_key, status, sort_order, metadata
  )
  select
    gu.id,
    payload.drill_type,
    payload.title,
    payload.instructions,
    payload.prompt_text,
    payload.expected_answer_json,
    'grammar.' || coalesce(gu.focus_area, 'accuracy'),
    'published',
    payload.sort_order,
    jsonb_build_object('seeded_by', '20261026140400_english_grammar_drill_types')
  from public.grammar_units gu
  join (
    values
      ('to-be-am-is-are', 'transformation', 'Rewrite the sentence', 'Rewrite the sentence as the task asks. Write the whole sentence.', 'Make it a question: You are from Bukhara.', jsonb_build_object('accepted_answers', '["Are you from Bukhara?"]'::jsonb), 70),
      ('to-be-am-is-are', 'word_order', 'Put the words in order', 'Put the words in the right order to make a sentence.', 'is / my / a / brother / doctor', jsonb_build_object('accepted_answers', '["My brother is a doctor."]'::jsonb), 80),
      ('present-simple-routines', 'transformation', 'Rewrite the sentence', 'Rewrite the sentence as the task asks. Write the whole sentence.', 'Make it negative: Aziz drinks coffee in the morning.', jsonb_build_object('accepted_answers', '["Aziz doesn''t drink coffee in the morning.", "Aziz does not drink coffee in the morning."]'::jsonb), 70),
      ('present-simple-routines', 'word_order', 'Put the words in order', 'Put the words in the right order to make a sentence.', 'always / she / breakfast / has / at seven', jsonb_build_object('accepted_answers', '["She always has breakfast at seven."]'::jsonb), 80),
      ('there-is-there-are', 'transformation', 'Rewrite the sentence', 'Rewrite the sentence as the task asks. Write the whole sentence.', 'Make it a question: There is a bank near here.', jsonb_build_object('accepted_answers', '["Is there a bank near here?"]'::jsonb), 70),
      ('there-is-there-are', 'word_order', 'Put the words in order', 'Put the words in the right order to make a sentence.', 'are / there / chairs / in the room / two', jsonb_build_object('accepted_answers', '["There are two chairs in the room."]'::jsonb), 80),
      ('can-and-cant', 'transformation', 'Rewrite the sentence', 'Rewrite the sentence as the task asks. Write the whole sentence.', 'Make it negative: My sister can swim.', jsonb_build_object('accepted_answers', '["My sister can''t swim.", "My sister cannot swim.", "My sister can not swim."]'::jsonb), 70),
      ('can-and-cant', 'word_order', 'Put the words in order', 'Put the words in the right order to make a sentence.', 'can / speak / you / Russian', jsonb_build_object('accepted_answers', '["Can you speak Russian?"]'::jsonb), 80),
      ('past-simple-did-didnt', 'transformation', 'Rewrite the sentence', 'Rewrite the sentence as the task asks. Write the whole sentence.', 'Make it negative: We went to the cinema yesterday.', jsonb_build_object('accepted_answers', '["We didn''t go to the cinema yesterday.", "We did not go to the cinema yesterday."]'::jsonb), 70),
      ('past-simple-did-didnt', 'word_order', 'Put the words in order', 'Put the words in the right order to make a sentence.', 'did / where / you / last summer / go', jsonb_build_object('accepted_answers', '["Where did you go last summer?"]'::jsonb), 80),
      ('present-continuous-vs-simple', 'transformation', 'Rewrite the sentence', 'Rewrite the sentence as the task asks. Write the whole sentence.', 'Say it is happening now (present continuous): She reads a book.', jsonb_build_object('accepted_answers', '["She is reading a book now.", "She''s reading a book now.", "She is reading a book.", "She''s reading a book.", "Now she is reading a book.", "Now she''s reading a book."]'::jsonb), 70),
      ('present-continuous-vs-simple', 'word_order', 'Put the words in order', 'Put the words in the right order to make a sentence.', 'is / Kamola / at the moment / cooking / dinner', jsonb_build_object('accepted_answers', '["Kamola is cooking dinner at the moment.", "At the moment Kamola is cooking dinner."]'::jsonb), 80),
      ('comparatives-superlatives', 'transformation', 'Rewrite the sentence', 'Rewrite the sentence as the task asks. Write the whole sentence.', 'Say the same with ''faster'': The bus is slower than the metro.', jsonb_build_object('accepted_answers', '["The metro is faster than the bus."]'::jsonb), 70),
      ('comparatives-superlatives', 'word_order', 'Put the words in order', 'Put the words in the right order to make a sentence.', 'the / building / tallest / is / in the city / this', jsonb_build_object('accepted_answers', '["This is the tallest building in the city."]'::jsonb), 80),
      ('future-going-to-will', 'transformation', 'Rewrite the sentence', 'Rewrite the sentence as the task asks. Write the whole sentence.', 'Rewrite with ''going to'': I plan to visit my grandmother on Sunday.', jsonb_build_object('accepted_answers', '["I''m going to visit my grandmother on Sunday.", "I am going to visit my grandmother on Sunday.", "On Sunday I''m going to visit my grandmother.", "On Sunday I am going to visit my grandmother."]'::jsonb), 70),
      ('future-going-to-will', 'word_order', 'Put the words in order', 'Put the words in the right order to make a sentence.', 'it / think / will / I / rain / tomorrow', jsonb_build_object('accepted_answers', '["I think it will rain tomorrow."]'::jsonb), 80),
      ('present-perfect-vs-past-simple', 'transformation', 'Rewrite the sentence', 'Rewrite the sentence as the task asks. Write the whole sentence.', 'Rewrite with ''never'': I haven''t ever been to London.', jsonb_build_object('accepted_answers', '["I have never been to London.", "I''ve never been to London."]'::jsonb), 70),
      ('present-perfect-vs-past-simple', 'word_order', 'Put the words in order', 'Put the words in the right order to make a sentence.', 'you / ever / have / plov / tried', jsonb_build_object('accepted_answers', '["Have you ever tried plov?"]'::jsonb), 80),
      ('conditionals-first-second', 'transformation', 'Rewrite the sentence', 'Rewrite the sentence as the task asks. Write the whole sentence.', 'Make it imaginary (second conditional): If I have time, I will help you.', jsonb_build_object('accepted_answers', '["If I had time, I would help you.", "If I had time, I''d help you.", "I would help you if I had time.", "I''d help you if I had time."]'::jsonb), 70),
      ('conditionals-first-second', 'word_order', 'Put the words in order', 'Put the words in the right order to make a sentence.', 'if / it / we / rains / stay / will / at home', jsonb_build_object('accepted_answers', '["If it rains, we will stay at home.", "We will stay at home if it rains."]'::jsonb), 80),
      ('used-to-past-habits', 'transformation', 'Rewrite the sentence', 'Rewrite the sentence as the task asks. Write the whole sentence.', 'Rewrite with ''used to'': When I was a child, I played football every day.', jsonb_build_object('accepted_answers', '["When I was a child, I used to play football every day.", "I used to play football every day when I was a child."]'::jsonb), 70),
      ('used-to-past-habits', 'word_order', 'Put the words in order', 'Put the words in the right order to make a sentence.', 'didn''t / to / she / like / use / vegetables', jsonb_build_object('accepted_answers', '["She didn''t use to like vegetables."]'::jsonb), 80),
      ('relative-clauses', 'transformation', 'Rewrite the sentence', 'Rewrite the sentence as the task asks. Write the whole sentence.', 'Join the sentences with ''who'': I met a woman. She speaks five languages.', jsonb_build_object('accepted_answers', '["I met a woman who speaks five languages."]'::jsonb), 70),
      ('relative-clauses', 'word_order', 'Put the words in order', 'Put the words in the right order to make a sentence.', 'the / where / this / I / city / born / is / was', jsonb_build_object('accepted_answers', '["This is the city where I was born."]'::jsonb), 80),
      ('passive-voice', 'transformation', 'Rewrite the sentence', 'Rewrite the sentence as the task asks. Write the whole sentence.', 'Make it passive: They built this mosque in the 15th century.', jsonb_build_object('accepted_answers', '["This mosque was built in the 15th century."]'::jsonb), 70),
      ('passive-voice', 'word_order', 'Put the words in order', 'Put the words in the right order to make a sentence.', 'being / the / is / road / repaired', jsonb_build_object('accepted_answers', '["The road is being repaired."]'::jsonb), 80),
      ('reported-speech', 'transformation', 'Rewrite the sentence', 'Rewrite the sentence as the task asks. Write the whole sentence.', 'Report it: "I am tired," she said.', jsonb_build_object('accepted_answers', '["She said that she was tired.", "She said she was tired."]'::jsonb), 70),
      ('reported-speech', 'word_order', 'Put the words in order', 'Put the words in the right order to make a sentence.', 'asked / me / he / I / where / lived', jsonb_build_object('accepted_answers', '["He asked me where I lived."]'::jsonb), 80),
      ('third-and-mixed-conditionals', 'transformation', 'Rewrite the sentence', 'Rewrite the sentence as the task asks. Write the whole sentence.', 'Make it a third conditional: I didn''t study, so I failed the test.', jsonb_build_object('accepted_answers', '["If I had studied, I would not have failed the test.", "If I had studied, I wouldn''t have failed the test.", "If I had studied, I would have passed the test.", "I wouldn''t have failed the test if I had studied.", "I would not have failed the test if I had studied."]'::jsonb), 70),
      ('third-and-mixed-conditionals', 'word_order', 'Put the words in order', 'Put the words in the right order to make a sentence.', 'had / if / known / I / come / would / have / I', jsonb_build_object('accepted_answers', '["If I had known, I would have come."]'::jsonb), 80),
      ('inversion-negative-adverbials', 'transformation', 'Rewrite the sentence', 'Rewrite the sentence as the task asks. Write the whole sentence.', 'Begin with ''Never'': I have never seen such a beautiful sunset.', jsonb_build_object('accepted_answers', '["Never have I seen such a beautiful sunset."]'::jsonb), 70),
      ('inversion-negative-adverbials', 'word_order', 'Put the words in order', 'Put the words in the right order to make a sentence.', 'had / no sooner / arrived / we / than / it / started / to rain', jsonb_build_object('accepted_answers', '["No sooner had we arrived than it started to rain."]'::jsonb), 80),
      ('cleft-sentences', 'transformation', 'Rewrite the sentence', 'Rewrite the sentence as the task asks. Write the whole sentence.', 'Begin with ''What'': I need a long holiday.', jsonb_build_object('accepted_answers', '["What I need is a long holiday."]'::jsonb), 70),
      ('cleft-sentences', 'word_order', 'Put the words in order', 'Put the words in the right order to make a sentence.', 'was / it / Dilshod / who / the problem / found', jsonb_build_object('accepted_answers', '["It was Dilshod who found the problem."]'::jsonb), 80),
      ('subjunctive-formal-structures', 'transformation', 'Rewrite the sentence', 'Rewrite the sentence as the task asks. Write the whole sentence.', 'Rewrite with ''insisted that'': The manager said the report had to be finished today.', jsonb_build_object('accepted_answers', '["The manager insisted that the report be finished today.", "The manager insisted that the report should be finished today."]'::jsonb), 70),
      ('subjunctive-formal-structures', 'word_order', 'Put the words in order', 'Put the words in the right order to make a sentence.', 'essential / it / is / that / every student / attend', jsonb_build_object('accepted_answers', '["It is essential that every student attend."]'::jsonb), 80)
  ) as payload(unit_slug, drill_type, title, instructions, prompt_text, expected_answer_json, sort_order)
    on payload.unit_slug = gu.slug
  where gu.product_id = v_grammar_product_id
    and gu.language_id = v_en_id
  on conflict (grammar_unit_id, drill_type, sort_order) do nothing;
end
$$;
