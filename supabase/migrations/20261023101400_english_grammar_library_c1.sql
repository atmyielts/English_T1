-- English Grammar library, level C1: 5 units x 6 drills (4 fill + 2 error_correction).
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
      v_grammar_product_id, v_en_id, 'inversion-negative-adverbials',
      'Inversion after negative words',
      'C1', 'inversion',
      'In formal or emphatic English, when a sentence starts with a negative or limiting expression (never, rarely, seldom, not only, no sooner, only later, under no circumstances), the auxiliary verb comes before the subject, as in a question: Never have I seen such a view. If there is no auxiliary, add do, does or did: Not only did she win, she also broke the record.',
      'Compare: I have never seen such a view. Never have I seen such a view.',
      'Keeping normal word order after the negative expression (Never I have seen…) or forgetting do, does or did.',
      jsonb_build_array(
        jsonb_build_object('bad', 'Rarely I have eaten such good plov.', 'good', 'Rarely have I eaten such good plov.'),
        jsonb_build_object('bad', 'Not only she speaks Korean, but she also writes it.', 'good', 'Not only does she speak Korean, but she also writes it.'),
        jsonb_build_object('bad', 'No sooner we had arrived than it started to rain.', 'good', 'No sooner had we arrived than it started to rain.')
      ),
      array['inversion', 'formal style', 'emphasis']::text[],
      'published', 510,
      jsonb_build_object('seeded_by', '20261022165000_english_grammar_library_c1')
    ),
    (
      v_grammar_product_id, v_en_id, 'cleft-sentences',
      'Cleft sentences for emphasis',
      'C1', 'cleft-sentences',
      'A cleft sentence splits one idea into two parts to put the focus on one of them. Use It is/was … that/who to focus on a person, thing, time or place: It was my aunt who taught me to cook. Use What … is/was to focus on an action or idea: What I need is a long holiday.',
      'Compare: Anvar broke the window. It was Anvar who broke the window. What Anvar broke was the window.',
      'Using what after It is/was (It was my sister what…) or adding an extra it after the what-clause (What I need it is…).',
      jsonb_build_array(
        jsonb_build_object('bad', 'It was my brother what found the keys.', 'good', 'It was my brother who found the keys.'),
        jsonb_build_object('bad', 'What I need it is more practice.', 'good', 'What I need is more practice.'),
        jsonb_build_object('bad', 'The thing what surprised me was the price.', 'good', 'The thing that surprised me was the price.')
      ),
      array['cleft sentences', 'emphasis']::text[],
      'published', 520,
      jsonb_build_object('seeded_by', '20261022165000_english_grammar_library_c1')
    ),
    (
      v_grammar_product_id, v_en_id, 'participle-clauses',
      'Participle clauses',
      'C1', 'participle-clauses',
      'A participle clause can replace a longer clause and make your writing shorter. Use the -ing form for an active meaning (Feeling tired, I went to bed early) and the past participle for a passive meaning (Built in 1910, the house needs repairs). Use having + past participle when one action finished before the other (Having finished the report, she went home). Both parts must have the same subject.',
      'Compare: Because she felt tired, she went home. Feeling tired, she went home.',
      'A ''dangling'' participle whose subject doesn''t match the main clause (Walking home, the rain started), or the -ing form where the meaning is passive.',
      jsonb_build_array(
        jsonb_build_object('bad', 'Walking home, the rain started.', 'good', 'While I was walking home, the rain started.'),
        jsonb_build_object('bad', 'Writing in 1850, the novel is still popular.', 'good', 'Written in 1850, the novel is still popular.'),
        jsonb_build_object('bad', 'Having finish the exam, we went to a café.', 'good', 'Having finished the exam, we went to a café.')
      ),
      array['participle clauses', 'concise writing']::text[],
      'published', 530,
      jsonb_build_object('seeded_by', '20261022165000_english_grammar_library_c1')
    ),
    (
      v_grammar_product_id, v_en_id, 'modals-past-should-neednt',
      'Should have, needn''t have, could have',
      'C1', 'modals-past',
      'Use should have + past participle to criticise or regret a past action: I should have left earlier. Use needn''t have + past participle when someone did something that was not necessary: You needn''t have brought food. We had plenty. Use could have + past participle for a past possibility that did not happen: We could have won.',
      'Compare: I needn''t have taken a taxi (I took one, but it wasn''t necessary). I didn''t need to take a taxi (so I didn''t take one).',
      'Using the past simple after should or could (should went), or forgetting have.',
      jsonb_build_array(
        jsonb_build_object('bad', 'I should went to bed earlier last night.', 'good', 'I should have gone to bed earlier last night.'),
        jsonb_build_object('bad', 'You needn''t to buy flowers, but thank you!', 'good', 'You needn''t have bought flowers, but thank you!'),
        jsonb_build_object('bad', 'We could won the match if we had trained more.', 'good', 'We could have won the match if we had trained more.')
      ),
      array['modals', 'past', 'regret']::text[],
      'published', 540,
      jsonb_build_object('seeded_by', '20261022165000_english_grammar_library_c1')
    ),
    (
      v_grammar_product_id, v_en_id, 'wish-and-if-only',
      'Wish and if only',
      'C1', 'wish',
      'Use wish or if only + past simple for a present situation you want to be different: I wish I lived closer to work. Use wish + past perfect to regret the past: I wish I had studied harder. Use wish + would to complain about something you want someone else to change: I wish you would stop interrupting. In formal English, use were for every person: I wish I were taller.',
      'Compare: I wish I had a car (now). I wish I had bought a car (in the past).',
      'Using the present tense or will after wish (I wish I can…, I wish it will stop).',
      jsonb_build_array(
        jsonb_build_object('bad', 'I wish I can speak French.', 'good', 'I wish I could speak French.'),
        jsonb_build_object('bad', 'I wish I didn''t eat so much at the wedding yesterday.', 'good', 'I wish I hadn''t eaten so much at the wedding yesterday.'),
        jsonb_build_object('bad', 'If only I know her phone number!', 'good', 'If only I knew her phone number!')
      ),
      array['wish', 'if only', 'regret']::text[],
      'published', 550,
      jsonb_build_object('seeded_by', '20261022165000_english_grammar_library_c1')
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
    and gu.slug in ('inversion-negative-adverbials', 'cleft-sentences', 'participle-clauses', 'modals-past-should-neednt', 'wish-and-if-only')
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
    jsonb_build_object('seeded_by', '20261022165000_english_grammar_library_c1')
  from public.grammar_units gu
  join (
    values
      ('inversion-negative-adverbials', 'fill', 'Complete the sentence', 'Type the missing auxiliary verb.',
        'Never ___ I seen such a crowded bazaar.',
        jsonb_build_object('accepted_answers', jsonb_build_array('have')),
        'grammar.inversion', 10),
      ('inversion-negative-adverbials', 'fill', 'Complete the sentence', 'Type the missing auxiliary verb.',
        'Not only ___ he forget my birthday, but he also forgot our meeting.',
        jsonb_build_object('accepted_answers', jsonb_build_array('did')),
        'grammar.inversion', 20),
      ('inversion-negative-adverbials', 'fill', 'Complete the sentence', 'Type the missing modal verb.',
        'Under no circumstances ___ students use their phones during the exam.',
        jsonb_build_object('accepted_answers', jsonb_build_array('should', 'may', 'can', 'must')),
        'grammar.inversion', 30),
      ('inversion-negative-adverbials', 'fill', 'Complete the sentence', 'Type the missing auxiliary verb.',
        'No sooner ___ we sat down than the lights went out.',
        jsonb_build_object('accepted_answers', jsonb_build_array('had')),
        'grammar.inversion', 40),
      ('inversion-negative-adverbials', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'Seldom we see such talent in young players.',
        jsonb_build_object('accepted_answers', jsonb_build_array('Seldom do we see such talent in young players.')),
        'grammar.inversion', 50),
      ('inversion-negative-adverbials', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'Only later I realised my mistake.',
        jsonb_build_object('accepted_answers', jsonb_build_array('Only later did I realise my mistake.', 'Only later did I realize my mistake.')),
        'grammar.inversion', 60),
      ('cleft-sentences', 'fill', 'Complete the sentence', 'Type the missing word.',
        'It was in Samarkand ___ my parents first met.',
        jsonb_build_object('accepted_answers', jsonb_build_array('that', 'where')),
        'grammar.cleft-sentences', 10),
      ('cleft-sentences', 'fill', 'Complete the sentence', 'Type the missing word.',
        '___ I like most about my job is the people.',
        jsonb_build_object('accepted_answers', jsonb_build_array('What')),
        'grammar.cleft-sentences', 20),
      ('cleft-sentences', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'It ___ the noise, not the heat, that kept me awake last night. (be)',
        jsonb_build_object('accepted_answers', jsonb_build_array('was')),
        'grammar.cleft-sentences', 30),
      ('cleft-sentences', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'All I want to do this weekend ___ sleep. (be)',
        jsonb_build_object('accepted_answers', jsonb_build_array('is')),
        'grammar.cleft-sentences', 40),
      ('cleft-sentences', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'It was my grandmother what taught me this recipe.',
        jsonb_build_object('accepted_answers', jsonb_build_array('It was my grandmother who taught me this recipe.', 'It was my grandmother that taught me this recipe.')),
        'grammar.cleft-sentences', 50),
      ('cleft-sentences', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'What surprised me it was how quickly she learned.',
        jsonb_build_object('accepted_answers', jsonb_build_array('What surprised me was how quickly she learned.', 'What surprised me was how quickly she learnt.')),
        'grammar.cleft-sentences', 60),
      ('participle-clauses', 'fill', 'Complete the sentence', 'Write the correct participle of the verb in brackets.',
        '___ in 1920, the old library still attracts many visitors. (build)',
        jsonb_build_object('accepted_answers', jsonb_build_array('Built')),
        'grammar.participle-clauses', 10),
      ('participle-clauses', 'fill', 'Complete the sentence', 'Use having + past participle of the verb in brackets.',
        '___ her keys at home, she had to wait for her sister. (leave)',
        jsonb_build_object('accepted_answers', jsonb_build_array('Having left')),
        'grammar.participle-clauses', 20),
      ('participle-clauses', 'fill', 'Complete the sentence', 'Write the correct participle of the verb in brackets.',
        '___ that the shop was closed, we went home. (see)',
        jsonb_build_object('accepted_answers', jsonb_build_array('Seeing', 'Having seen')),
        'grammar.participle-clauses', 30),
      ('participle-clauses', 'fill', 'Complete the sentence', 'Write the correct participle of the verb in brackets.',
        'The man ___ next to me on the plane was a doctor. (sit)',
        jsonb_build_object('accepted_answers', jsonb_build_array('sitting')),
        'grammar.participle-clauses', 40),
      ('participle-clauses', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'Having finish the course, she applied for a job in Tashkent.',
        jsonb_build_object('accepted_answers', jsonb_build_array('Having finished the course, she applied for a job in Tashkent.')),
        'grammar.participle-clauses', 50),
      ('participle-clauses', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'Writing in simple English, the book is easy to read.',
        jsonb_build_object('accepted_answers', jsonb_build_array('Written in simple English, the book is easy to read.')),
        'grammar.participle-clauses', 60),
      ('modals-past-should-neednt', 'fill', 'Complete the sentence', 'Use the words in brackets.',
        'I failed the test. I ___ harder. (should / study)',
        jsonb_build_object('accepted_answers', jsonb_build_array('should have studied', 'should''ve studied')),
        'grammar.modals-past', 10),
      ('modals-past-should-neednt', 'fill', 'Complete the sentence', 'Use the words in brackets.',
        'You ___ so much food. Only four people came. (needn''t / cook)',
        jsonb_build_object('accepted_answers', jsonb_build_array('needn''t have cooked', 'need not have cooked')),
        'grammar.modals-past', 20),
      ('modals-past-should-neednt', 'fill', 'Complete the sentence', 'Use the words in brackets.',
        'Why did you drive so fast? You ___ an accident! (could / have)',
        jsonb_build_object('accepted_answers', jsonb_build_array('could have had', 'could''ve had')),
        'grammar.modals-past', 30),
      ('modals-past-should-neednt', 'fill', 'Complete the sentence', 'Use the words in brackets.',
        'I ___ so much coffee last night. I couldn''t sleep. (shouldn''t / drink)',
        jsonb_build_object('accepted_answers', jsonb_build_array('shouldn''t have drunk', 'should not have drunk')),
        'grammar.modals-past', 40),
      ('modals-past-should-neednt', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'You should told me earlier that you were ill.',
        jsonb_build_object('accepted_answers', jsonb_build_array('You should have told me earlier that you were ill.', 'You should''ve told me earlier that you were ill.')),
        'grammar.modals-past', 50),
      ('modals-past-should-neednt', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'We could caught the earlier train if we had run.',
        jsonb_build_object('accepted_answers', jsonb_build_array('We could have caught the earlier train if we had run.', 'We could''ve caught the earlier train if we had run.')),
        'grammar.modals-past', 60),
      ('wish-and-if-only', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'I wish I ___ more free time. I''m always busy. (have)',
        jsonb_build_object('accepted_answers', jsonb_build_array('had')),
        'grammar.wish', 10),
      ('wish-and-if-only', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'If only I ___ to my parents'' advice last year! (listen)',
        jsonb_build_object('accepted_answers', jsonb_build_array('had listened', '''d listened')),
        'grammar.wish', 20),
      ('wish-and-if-only', 'fill', 'Complete the sentence', 'Use would and the verb in brackets.',
        'I wish the neighbours ___ playing loud music at night. (stop)',
        jsonb_build_object('accepted_answers', jsonb_build_array('would stop')),
        'grammar.wish', 30),
      ('wish-and-if-only', 'fill', 'Complete the sentence', 'Write the correct form of the verb in brackets.',
        'She wishes she ___ taller. (be)',
        jsonb_build_object('accepted_answers', jsonb_build_array('were', 'was')),
        'grammar.wish', 40),
      ('wish-and-if-only', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'I wish I know how to fix this computer.',
        jsonb_build_object('accepted_answers', jsonb_build_array('I wish I knew how to fix this computer.', 'I wish I could fix this computer.')),
        'grammar.wish', 50),
      ('wish-and-if-only', 'error_correction', 'Correct the sentence', 'Find the mistake and write the whole sentence correctly.',
        'I wish I went to the concert last night. Everyone says it was amazing.',
        jsonb_build_object('accepted_answers', jsonb_build_array('I wish I had gone to the concert last night. Everyone says it was amazing.', 'I wish I''d gone to the concert last night. Everyone says it was amazing.')),
        'grammar.wish', 60)
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
    and gu.slug in ('inversion-negative-adverbials', 'cleft-sentences', 'participle-clauses', 'modals-past-should-neednt', 'wish-and-if-only')
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
    jsonb_build_object('seeded_by', '20261022165000_english_grammar_library_c1'),
    gu.created_by,
    gu.updated_by
  from public.grammar_units gu
  where gu.product_id = v_grammar_product_id
    and gu.language_id = v_en_id
    and gu.slug in ('inversion-negative-adverbials', 'cleft-sentences', 'participle-clauses', 'modals-past-should-neednt', 'wish-and-if-only')
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
