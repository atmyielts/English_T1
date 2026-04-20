-- ============================================================================
-- Non-exam English Phase 3: speaking + grammar backends
-- ----------------------------------------------------------------------------
-- Adds:
-- - speaking prompt bank plus service-specific attempts/transcripts
-- - grammar units, drill bank, and remediation assignments
-- - seed content for english-speaking and english-grammar
-- - content-registry backfill for speaking prompts and grammar units
-- ============================================================================

create table if not exists public.speaking_prompts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  slug text not null,
  title text not null,
  prompt_text text not null,
  prompt_type text not null
    check (prompt_type in ('guided_response', 'roleplay', 'storytelling', 'shadowing', 'read_aloud')),
  level text not null
    check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  target_duration_seconds integer not null default 45
    check (target_duration_seconds between 10 and 600),
  target_grammar text,
  target_vocabulary text[] not null default '{}'::text[],
  fluency_objective text,
  pronunciation_objective text,
  cue_points jsonb not null default '[]'::jsonb,
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint speaking_prompts_slug_not_empty check (length(trim(slug)) > 0),
  constraint speaking_prompts_unique_slug_per_scope unique (product_id, language_id, slug)
);

create index if not exists speaking_prompts_scope_status_idx
  on public.speaking_prompts(product_id, language_id, status, sort_order asc, updated_at desc);

create index if not exists speaking_prompts_level_type_idx
  on public.speaking_prompts(product_id, language_id, level, prompt_type, updated_at desc);

drop trigger if exists speaking_prompts_updated_at on public.speaking_prompts;
create trigger speaking_prompts_updated_at
before update on public.speaking_prompts
for each row execute function public.set_updated_at();

alter table public.speaking_prompts enable row level security;

drop policy if exists "Speaking prompts select published" on public.speaking_prompts;
create policy "Speaking prompts select published"
on public.speaking_prompts
for select
to authenticated
using (status = 'published');

drop policy if exists "Speaking prompts select admin" on public.speaking_prompts;
create policy "Speaking prompts select admin"
on public.speaking_prompts
for select
to authenticated
using (public.is_admin());

drop policy if exists "Speaking prompts mutate admin" on public.speaking_prompts;
create policy "Speaking prompts mutate admin"
on public.speaking_prompts
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create table if not exists public.speaking_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  prompt_id uuid not null references public.speaking_prompts(id) on delete cascade,
  status text not null default 'submitted'
    check (status in ('draft', 'submitted', 'completed', 'archived')),
  actual_duration_seconds integer not null default 0
    check (actual_duration_seconds >= 0),
  word_count integer not null default 0
    check (word_count >= 0),
  filler_count integer not null default 0
    check (filler_count >= 0),
  transcript_source text not null default 'manual'
    check (transcript_source in ('manual', 'speech_api', 'imported')),
  latest_learning_attempt_id uuid references public.learning_attempts(id) on delete set null,
  previous_attempt_id uuid references public.speaking_attempts(id) on delete set null,
  retry_comparison_json jsonb not null default '{}'::jsonb,
  feedback_json jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists speaking_attempts_user_idx
  on public.speaking_attempts(user_id, language_id, created_at desc);

create index if not exists speaking_attempts_prompt_idx
  on public.speaking_attempts(user_id, prompt_id, created_at desc);

drop trigger if exists speaking_attempts_updated_at on public.speaking_attempts;
create trigger speaking_attempts_updated_at
before update on public.speaking_attempts
for each row execute function public.set_updated_at();

alter table public.speaking_attempts enable row level security;

drop policy if exists "Speaking attempts select own" on public.speaking_attempts;
create policy "Speaking attempts select own"
on public.speaking_attempts
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Speaking attempts write own" on public.speaking_attempts;
create policy "Speaking attempts write own"
on public.speaking_attempts
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Speaking attempts select admin" on public.speaking_attempts;
create policy "Speaking attempts select admin"
on public.speaking_attempts
for select
to authenticated
using (public.is_admin());

create table if not exists public.speaking_transcripts (
  attempt_id uuid primary key references public.speaking_attempts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  transcript_text text not null,
  transcript_confidence numeric
    check (transcript_confidence is null or (transcript_confidence >= 0 and transcript_confidence <= 1)),
  transcript_tokens text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists speaking_transcripts_user_idx
  on public.speaking_transcripts(user_id, created_at desc);

drop trigger if exists speaking_transcripts_updated_at on public.speaking_transcripts;
create trigger speaking_transcripts_updated_at
before update on public.speaking_transcripts
for each row execute function public.set_updated_at();

alter table public.speaking_transcripts enable row level security;

drop policy if exists "Speaking transcripts select own" on public.speaking_transcripts;
create policy "Speaking transcripts select own"
on public.speaking_transcripts
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Speaking transcripts write own" on public.speaking_transcripts;
create policy "Speaking transcripts write own"
on public.speaking_transcripts
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Speaking transcripts select admin" on public.speaking_transcripts;
create policy "Speaking transcripts select admin"
on public.speaking_transcripts
for select
to authenticated
using (public.is_admin());

create table if not exists public.grammar_units (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  slug text not null,
  title text not null,
  level text not null
    check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  focus_area text not null,
  explanation_text text not null,
  contrast_text text,
  common_error_pattern text,
  examples_json jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}'::text[],
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grammar_units_slug_not_empty check (length(trim(slug)) > 0),
  constraint grammar_units_unique_slug_per_scope unique (product_id, language_id, slug)
);

create index if not exists grammar_units_scope_status_idx
  on public.grammar_units(product_id, language_id, status, sort_order asc, updated_at desc);

create index if not exists grammar_units_focus_idx
  on public.grammar_units(product_id, language_id, focus_area, updated_at desc);

drop trigger if exists grammar_units_updated_at on public.grammar_units;
create trigger grammar_units_updated_at
before update on public.grammar_units
for each row execute function public.set_updated_at();

alter table public.grammar_units enable row level security;

drop policy if exists "Grammar units select published" on public.grammar_units;
create policy "Grammar units select published"
on public.grammar_units
for select
to authenticated
using (status = 'published');

drop policy if exists "Grammar units select admin" on public.grammar_units;
create policy "Grammar units select admin"
on public.grammar_units
for select
to authenticated
using (public.is_admin());

drop policy if exists "Grammar units mutate admin" on public.grammar_units;
create policy "Grammar units mutate admin"
on public.grammar_units
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create table if not exists public.grammar_drills (
  id uuid primary key default gen_random_uuid(),
  grammar_unit_id uuid not null references public.grammar_units(id) on delete cascade,
  drill_type text not null
    check (drill_type in ('recognition', 'fill', 'transformation', 'error_correction', 'open_production')),
  title text not null,
  instructions text not null,
  prompt_text text not null,
  expected_answer_json jsonb not null default '{}'::jsonb,
  target_skill_key text not null default 'grammar',
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grammar_drills_unique unique (grammar_unit_id, drill_type, sort_order)
);

create index if not exists grammar_drills_unit_idx
  on public.grammar_drills(grammar_unit_id, status, sort_order asc);

drop trigger if exists grammar_drills_updated_at on public.grammar_drills;
create trigger grammar_drills_updated_at
before update on public.grammar_drills
for each row execute function public.set_updated_at();

alter table public.grammar_drills enable row level security;

drop policy if exists "Grammar drills select published unit" on public.grammar_drills;
create policy "Grammar drills select published unit"
on public.grammar_drills
for select
to authenticated
using (
  exists (
    select 1
    from public.grammar_units gu
    where gu.id = grammar_drills.grammar_unit_id
      and (gu.status = 'published' or public.is_admin())
  )
);

drop policy if exists "Grammar drills mutate admin" on public.grammar_drills;
create policy "Grammar drills mutate admin"
on public.grammar_drills
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create table if not exists public.grammar_remediation_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  grammar_unit_id uuid not null references public.grammar_units(id) on delete cascade,
  source_error_id uuid references public.learner_language_errors(id) on delete set null,
  source_service_key text,
  reason text not null,
  priority numeric not null default 1
    check (priority >= 0 and priority <= 5),
  status text not null default 'active'
    check (status in ('active', 'completed', 'dismissed', 'archived')),
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  last_learning_attempt_id uuid references public.learning_attempts(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grammar_remediation_assignments_user_idx
  on public.grammar_remediation_assignments(user_id, language_id, status, priority desc, updated_at desc);

create index if not exists grammar_remediation_assignments_unit_idx
  on public.grammar_remediation_assignments(user_id, grammar_unit_id, status, updated_at desc);

drop trigger if exists grammar_remediation_assignments_updated_at on public.grammar_remediation_assignments;
create trigger grammar_remediation_assignments_updated_at
before update on public.grammar_remediation_assignments
for each row execute function public.set_updated_at();

alter table public.grammar_remediation_assignments enable row level security;

drop policy if exists "Grammar remediation assignments select own" on public.grammar_remediation_assignments;
create policy "Grammar remediation assignments select own"
on public.grammar_remediation_assignments
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Grammar remediation assignments write own" on public.grammar_remediation_assignments;
create policy "Grammar remediation assignments write own"
on public.grammar_remediation_assignments
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Grammar remediation assignments select admin" on public.grammar_remediation_assignments;
create policy "Grammar remediation assignments select admin"
on public.grammar_remediation_assignments
for select
to authenticated
using (public.is_admin());

do $$
declare
  v_en_id uuid;
  v_speaking_product_id uuid;
  v_grammar_product_id uuid;
begin
  insert into public.languages (code, name, status, metadata)
  values (
    'en',
    'English',
    'active',
    jsonb_build_object('seeded_by', '20260420140000_english_speaking_grammar_phase3')
  )
  on conflict (code) do update
  set
    name = excluded.name,
    status = excluded.status,
    metadata = coalesce(public.languages.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

  select id into v_en_id
  from public.languages
  where code = 'en'
  limit 1;

  select p.id into v_speaking_product_id
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) = 'english-speaking'
  order by p.created_at asc
  limit 1;

  select p.id into v_grammar_product_id
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) = 'english-grammar'
  order by p.created_at asc
  limit 1;

  if v_speaking_product_id is null then
    raise exception 'english-speaking product not found; seed product first';
  end if;

  if v_grammar_product_id is null then
    raise exception 'english-grammar product not found; seed product first';
  end if;

  insert into public.speaking_prompts (
    product_id,
    language_id,
    slug,
    title,
    prompt_text,
    prompt_type,
    level,
    target_duration_seconds,
    target_grammar,
    target_vocabulary,
    fluency_objective,
    pronunciation_objective,
    cue_points,
    status,
    sort_order,
    metadata
  )
  values
    (
      v_speaking_product_id, v_en_id, 'new-teammate-introduction',
      'Introduce Yourself To A New Teammate',
      'You joined a new team today. Introduce yourself, explain what you usually work on, and ask one friendly question back.',
      'guided_response', 'A2', 40, 'present simple and question forms',
      array['team', 'project', 'usually']::text[],
      'Speak in short connected sentences without stopping after every idea.',
      'Keep important words clear and stress your main message naturally.',
      jsonb_build_array('say your role', 'describe what you usually do', 'ask one follow-up question'),
      'published', 10,
      jsonb_build_object('seeded_by', '20260420140000_english_speaking_grammar_phase3')
    ),
    (
      v_speaking_product_id, v_en_id, 'study-problem-and-solution',
      'Explain A Study Problem And Your Solution',
      'Describe one study problem you faced this week, explain what caused it, and say how you solved it or plan to solve it.',
      'storytelling', 'B1', 55, 'past simple and because clauses',
      array['problem', 'solution', 'focus']::text[],
      'Link your ideas with because, then, so, or after that.',
      'Reduce filler words and keep your pace steady from start to finish.',
      jsonb_build_array('state the problem', 'explain the cause', 'give the solution'),
      'published', 20,
      jsonb_build_object('seeded_by', '20260420140000_english_speaking_grammar_phase3')
    ),
    (
      v_speaking_product_id, v_en_id, 'project-update-for-manager',
      'Give A Short Project Update',
      'Your manager asks for a short spoken update. Explain what is finished, what is delayed, and what support you need next.',
      'roleplay', 'B2', 60, 'present perfect and clear transitions',
      array['completed', 'delayed', 'support', 'deadline']::text[],
      'Organize the answer into status, blocker, and next step.',
      'Keep sentence starts clean and avoid repeating the same filler phrase.',
      jsonb_build_array('finished work', 'current blocker', 'request support'),
      'published', 30,
      jsonb_build_object('seeded_by', '20260420140000_english_speaking_grammar_phase3')
    )
  on conflict (product_id, language_id, slug) do update
  set
    title = excluded.title,
    prompt_text = excluded.prompt_text,
    prompt_type = excluded.prompt_type,
    level = excluded.level,
    target_duration_seconds = excluded.target_duration_seconds,
    target_grammar = excluded.target_grammar,
    target_vocabulary = excluded.target_vocabulary,
    fluency_objective = excluded.fluency_objective,
    pronunciation_objective = excluded.pronunciation_objective,
    cue_points = excluded.cue_points,
    status = excluded.status,
    sort_order = excluded.sort_order,
    metadata = coalesce(public.speaking_prompts.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

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
      'Use a or an for one non-specific thing and the for a specific thing both people can identify.',
      'Compare: I saw a teacher near the library. The teacher was carrying a map.',
      'Missing article before singular count nouns or using the when the noun is still new.',
      jsonb_build_array(
        jsonb_build_object('bad', 'I bought book yesterday.', 'good', 'I bought a book yesterday.'),
        jsonb_build_object('bad', 'She opened a door and dog ran out.', 'good', 'She opened the door and a dog ran out.')
      ),
      array['articles', 'count nouns']::text[],
      'published', 10,
      jsonb_build_object('seeded_by', '20260420140000_english_speaking_grammar_phase3')
    ),
    (
      v_grammar_product_id, v_en_id, 'past-simple-time-control',
      'Past Simple For Finished Events',
      'B1', 'tense',
      'Use the past simple for finished actions at a known time in the past.',
      'Compare: I usually walk to class. Yesterday I walked because the bus was late.',
      'Using present tense for a finished event or forgetting the past form after a time marker.',
      jsonb_build_array(
        jsonb_build_object('bad', 'Yesterday I go to campus late.', 'good', 'Yesterday I went to campus late.'),
        jsonb_build_object('bad', 'Last week we study together.', 'good', 'Last week we studied together.')
      ),
      array['past simple', 'time markers']::text[],
      'published', 20,
      jsonb_build_object('seeded_by', '20260420140000_english_speaking_grammar_phase3')
    ),
    (
      v_grammar_product_id, v_en_id, 'prepositions-common-use',
      'Common Prepositions In Context',
      'B1', 'prepositions',
      'Choose prepositions by relationship: at for point, in for area/period, on for surface/day, and with for connection.',
      'Compare: at 6 p.m., in July, on Monday, with my team.',
      'Using the wrong preposition after common time and place expressions.',
      jsonb_build_array(
        jsonb_build_object('bad', 'We will meet in Monday.', 'good', 'We will meet on Monday.'),
        jsonb_build_object('bad', 'She arrived on 6 p.m.', 'good', 'She arrived at 6 p.m.')
      ),
      array['prepositions', 'time', 'place']::text[],
      'published', 30,
      jsonb_build_object('seeded_by', '20260420140000_english_speaking_grammar_phase3')
    ),
    (
      v_grammar_product_id, v_en_id, 'subject-verb-agreement',
      'Subject-Verb Agreement',
      'B1', 'agreement',
      'Match the verb to the subject. Third-person singular usually needs -s in the present simple.',
      'Compare: They work late. She works late.',
      'Missing -s with he, she, or it, or mixing singular subject with plural verb.',
      jsonb_build_array(
        jsonb_build_object('bad', 'My friend study every night.', 'good', 'My friend studies every night.'),
        jsonb_build_object('bad', 'These plans needs more time.', 'good', 'These plans need more time.')
      ),
      array['agreement', 'present simple']::text[],
      'published', 40,
      jsonb_build_object('seeded_by', '20260420140000_english_speaking_grammar_phase3')
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
end
$$;

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
  jsonb_build_object('seeded_by', '20260420140000_english_speaking_grammar_phase3')
from public.grammar_units gu
join (
  values
    ('articles-basic-control', 'fill', 'Choose the correct article', 'Type the best article phrase.', 'I bought ___ umbrella before the storm.', jsonb_build_object('accepted_answers', jsonb_build_array('an umbrella')), 'grammar.articles', 10),
    ('articles-basic-control', 'error_correction', 'Fix the article error', 'Rewrite the sentence correctly.', 'She opened door and the cat ran outside.', jsonb_build_object('accepted_answers', jsonb_build_array('She opened the door and the cat ran outside.', 'She opened the door, and the cat ran outside.')), 'grammar.articles', 20),
    ('past-simple-time-control', 'fill', 'Use the correct past form', 'Rewrite the sentence in the past simple.', 'Yesterday I ___ to the station late. (go)', jsonb_build_object('accepted_answers', jsonb_build_array('went')), 'grammar.tense', 10),
    ('past-simple-time-control', 'error_correction', 'Repair the tense mistake', 'Rewrite the sentence correctly.', 'Last week we study together at the library.', jsonb_build_object('accepted_answers', jsonb_build_array('Last week we studied together at the library.')), 'grammar.tense', 20),
    ('prepositions-common-use', 'fill', 'Choose the right preposition', 'Type the best preposition phrase.', 'We will meet ___ Monday morning.', jsonb_build_object('accepted_answers', jsonb_build_array('on Monday morning')), 'grammar.prepositions', 10),
    ('prepositions-common-use', 'error_correction', 'Fix the preposition', 'Rewrite the sentence correctly.', 'She arrived on 6 p.m. after class.', jsonb_build_object('accepted_answers', jsonb_build_array('She arrived at 6 p.m. after class.')), 'grammar.prepositions', 20),
    ('subject-verb-agreement', 'fill', 'Match the verb to the subject', 'Use the correct present simple verb.', 'My brother ___ online every evening. (study)', jsonb_build_object('accepted_answers', jsonb_build_array('studies')), 'grammar.agreement', 10),
    ('subject-verb-agreement', 'error_correction', 'Repair the agreement error', 'Rewrite the sentence correctly.', 'These plans needs more detail before Friday.', jsonb_build_object('accepted_answers', jsonb_build_array('These plans need more detail before Friday.')), 'grammar.agreement', 20)
) as payload(unit_slug, drill_type, title, instructions, prompt_text, expected_answer_json, target_skill_key, sort_order)
  on payload.unit_slug = gu.slug
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
  sp.product_id,
  sp.language_id,
  'speaking',
  'speaking.prompt',
  'speaking_prompts',
  sp.id,
  sp.slug,
  sp.title,
  left(sp.prompt_text, 900),
  'speaking',
  array['speaking.fluency', 'speaking.grammar', 'speaking.pronunciation', 'vocabulary.usage']::text[],
  sp.level,
  case sp.level
    when 'A1' then 0.20
    when 'A2' then 0.30
    when 'B1' then 0.45
    when 'B2' then 0.60
    when 'C1' then 0.75
    when 'C2' then 0.90
    else 0.50
  end,
  greatest(4, least(20, ceil(sp.target_duration_seconds / 20.0)::int + 3)),
  coalesce(sp.fluency_objective, sp.prompt_text),
  array_remove(array[sp.prompt_type, sp.target_grammar], null),
  sp.status,
  jsonb_build_object(
    'prompt_type', sp.prompt_type,
    'target_duration_seconds', sp.target_duration_seconds,
    'target_grammar', sp.target_grammar,
    'target_vocabulary', sp.target_vocabulary,
    'cue_points', sp.cue_points
  ),
  sp.metadata,
  sp.created_by,
  sp.updated_by
from public.speaking_prompts sp
on conflict (language_id, service_key, content_type, source_ref) do update
set
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
  updated_by = excluded.updated_by,
  updated_at = now();

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
  array['grammar.accuracy', 'grammar.word-order', 'grammar.transfer']::text[],
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
  gu.status,
  jsonb_build_object(
    'focus_area', gu.focus_area,
    'common_error_pattern', gu.common_error_pattern,
    'examples', gu.examples_json
  ),
  gu.metadata,
  gu.created_by,
  gu.updated_by
from public.grammar_units gu
on conflict (language_id, service_key, content_type, source_ref) do update
set
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
  updated_by = excluded.updated_by,
  updated_at = now();
