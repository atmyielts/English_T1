-- ============================================================================
-- Non-exam English Phase 4: immersion missions + transfer validation
-- ----------------------------------------------------------------------------
-- Adds:
-- - immersion mission catalog and mission steps
-- - learner mission attempts with transfer validation metadata
-- - seed content for english-immersion
-- - content-registry backfill for immersion missions
-- ============================================================================

create table if not exists public.immersion_missions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  slug text not null,
  title text not null,
  context_text text not null,
  objective_text text not null,
  mission_type text not null
    check (mission_type in ('travel', 'workplace', 'study', 'service', 'social', 'problem_solving')),
  level text not null
    check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  target_vocabulary text[] not null default '{}'::text[],
  target_grammar text,
  skill_mix text[] not null default '{}'::text[],
  success_conditions_json jsonb not null default '[]'::jsonb,
  cultural_note text,
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint immersion_missions_slug_not_empty check (length(trim(slug)) > 0),
  constraint immersion_missions_unique_slug_per_scope unique (product_id, language_id, slug)
);

create index if not exists immersion_missions_scope_status_idx
  on public.immersion_missions(product_id, language_id, status, sort_order asc, updated_at desc);

create index if not exists immersion_missions_type_level_idx
  on public.immersion_missions(product_id, language_id, mission_type, level, updated_at desc);

drop trigger if exists immersion_missions_updated_at on public.immersion_missions;
create trigger immersion_missions_updated_at
before update on public.immersion_missions
for each row execute function public.set_updated_at();

alter table public.immersion_missions enable row level security;

drop policy if exists "Immersion missions select published" on public.immersion_missions;
create policy "Immersion missions select published"
on public.immersion_missions
for select
to authenticated
using (status = 'published');

drop policy if exists "Immersion missions select admin" on public.immersion_missions;
create policy "Immersion missions select admin"
on public.immersion_missions
for select
to authenticated
using (public.is_admin());

drop policy if exists "Immersion missions mutate admin" on public.immersion_missions;
create policy "Immersion missions mutate admin"
on public.immersion_missions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create table if not exists public.immersion_mission_steps (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.immersion_missions(id) on delete cascade,
  step_index integer not null
    check (step_index >= 0),
  service_key text not null
    check (service_key in ('reading', 'listening', 'writing', 'speaking', 'grammar', 'vocabulary', 'immersion')),
  step_type text not null
    check (step_type in ('reading', 'listening', 'writing', 'speaking', 'vocabulary', 'decision')),
  title text not null,
  instructions text not null,
  prompt_text text not null,
  expected_answer_json jsonb not null default '{}'::jsonb,
  target_skill_key text not null default 'immersion.transfer',
  estimated_minutes integer not null default 5
    check (estimated_minutes between 1 and 90),
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint immersion_mission_steps_unique unique (mission_id, step_index)
);

create index if not exists immersion_mission_steps_mission_idx
  on public.immersion_mission_steps(mission_id, status, step_index asc);

drop trigger if exists immersion_mission_steps_updated_at on public.immersion_mission_steps;
create trigger immersion_mission_steps_updated_at
before update on public.immersion_mission_steps
for each row execute function public.set_updated_at();

alter table public.immersion_mission_steps enable row level security;

drop policy if exists "Immersion mission steps select published parent" on public.immersion_mission_steps;
create policy "Immersion mission steps select published parent"
on public.immersion_mission_steps
for select
to authenticated
using (
  exists (
    select 1
    from public.immersion_missions im
    where im.id = immersion_mission_steps.mission_id
      and (im.status = 'published' or public.is_admin())
  )
);

drop policy if exists "Immersion mission steps mutate admin" on public.immersion_mission_steps;
create policy "Immersion mission steps mutate admin"
on public.immersion_mission_steps
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create table if not exists public.immersion_mission_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  mission_id uuid not null references public.immersion_missions(id) on delete cascade,
  status text not null default 'submitted'
    check (status in ('draft', 'submitted', 'completed', 'needs_recovery', 'archived')),
  latest_learning_attempt_id uuid references public.learning_attempts(id) on delete set null,
  previous_attempt_id uuid references public.immersion_mission_attempts(id) on delete set null,
  overall_score numeric
    check (overall_score is null or (overall_score >= 0 and overall_score <= 1)),
  completion_ratio numeric not null default 0
    check (completion_ratio >= 0 and completion_ratio <= 1),
  transfer_reopen_count integer not null default 0
    check (transfer_reopen_count >= 0),
  step_results_json jsonb not null default '[]'::jsonb,
  feedback_json jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists immersion_mission_attempts_user_idx
  on public.immersion_mission_attempts(user_id, language_id, created_at desc);

create index if not exists immersion_mission_attempts_mission_idx
  on public.immersion_mission_attempts(user_id, mission_id, created_at desc);

drop trigger if exists immersion_mission_attempts_updated_at on public.immersion_mission_attempts;
create trigger immersion_mission_attempts_updated_at
before update on public.immersion_mission_attempts
for each row execute function public.set_updated_at();

alter table public.immersion_mission_attempts enable row level security;

drop policy if exists "Immersion mission attempts select own" on public.immersion_mission_attempts;
create policy "Immersion mission attempts select own"
on public.immersion_mission_attempts
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Immersion mission attempts write own" on public.immersion_mission_attempts;
create policy "Immersion mission attempts write own"
on public.immersion_mission_attempts
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Immersion mission attempts select admin" on public.immersion_mission_attempts;
create policy "Immersion mission attempts select admin"
on public.immersion_mission_attempts
for select
to authenticated
using (public.is_admin());

do $$
declare
  v_en_id uuid;
  v_immersion_product_id uuid;
  v_airport_mission_id uuid;
  v_workplace_mission_id uuid;
  v_study_mission_id uuid;
begin
  insert into public.languages (code, name, status, metadata)
  values (
    'en',
    'English',
    'active',
    jsonb_build_object('seeded_by', '20260420153000_english_immersion_phase4')
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

  select p.id into v_immersion_product_id
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) = 'english-immersion'
  order by p.created_at asc
  limit 1;

  if v_immersion_product_id is null then
    raise exception 'english-immersion product not found; seed product first';
  end if;

  insert into public.immersion_missions (
    product_id,
    language_id,
    slug,
    title,
    context_text,
    objective_text,
    mission_type,
    level,
    target_vocabulary,
    target_grammar,
    skill_mix,
    success_conditions_json,
    cultural_note,
    status,
    sort_order,
    metadata
  )
  values
    (
      v_immersion_product_id, v_en_id, 'airport-check-in-change-request',
      'Airport Check-In Change Request',
      'You arrive at the airport and learn that your checked bag is overweight. You need to understand the staff instructions, respond politely, and update your travel partner.',
      'Complete the airport mission by understanding the baggage problem, asking for help clearly, and writing a short update message.',
      'travel', 'B1',
      array['check-in', 'baggage', 'passport', 'window seat', 'boarding gate']::text[],
      'polite requests and clear problem explanation',
      array['reading', 'listening', 'speaking', 'writing', 'vocabulary']::text[],
      jsonb_build_array(
        'identify the baggage rule',
        'ask one clear follow-up question',
        'write a short update using at least one target phrase'
      ),
      'Keep requests polite and direct when talking to service staff.',
      'published', 10,
      jsonb_build_object('seeded_by', '20260420153000_english_immersion_phase4')
    ),
    (
      v_immersion_product_id, v_en_id, 'team-update-after-delay',
      'Team Update After A Delay',
      'A project handoff is delayed and your manager wants a quick update. You need to read the brief, notice the spoken blocker, explain the delay orally, and write a short follow-up.',
      'Complete the workplace mission by capturing the blocker accurately, giving a structured oral update, and writing a concise action message.',
      'workplace', 'B2',
      array['deadline', 'support', 'blocked', 'completed', 'next step']::text[],
      'present perfect and clear transitions',
      array['reading', 'listening', 'speaking', 'writing']::text[],
      jsonb_build_array(
        'mention what is finished',
        'explain the current blocker',
        'ask for one next-step action'
      ),
      'A short update should lead to a clear next step, not only describe the problem.',
      'published', 20,
      jsonb_build_object('seeded_by', '20260420153000_english_immersion_phase4')
    ),
    (
      v_immersion_product_id, v_en_id, 'study-group-room-change',
      'Study Group Room Change',
      'Your study group cannot use the usual room today. You need to understand the notice, catch the new location from an announcement, explain the change to the group, and send a short written update.',
      'Complete the study mission by extracting the new place and time, speaking clearly about the change, and writing a short message with the new plan.',
      'study', 'A2',
      array['library', 'available', 'schedule', 'classroom', 'meet']::text[],
      'time expressions and clear instructions',
      array['reading', 'listening', 'speaking', 'writing']::text[],
      jsonb_build_array(
        'name the new location',
        'mention the new time',
        'end with one clear instruction'
      ),
      'When plans change, repeat the most important information clearly at the end.',
      'published', 30,
      jsonb_build_object('seeded_by', '20260420153000_english_immersion_phase4')
    )
  on conflict (product_id, language_id, slug) do update
  set
    title = excluded.title,
    context_text = excluded.context_text,
    objective_text = excluded.objective_text,
    mission_type = excluded.mission_type,
    level = excluded.level,
    target_vocabulary = excluded.target_vocabulary,
    target_grammar = excluded.target_grammar,
    skill_mix = excluded.skill_mix,
    success_conditions_json = excluded.success_conditions_json,
    cultural_note = excluded.cultural_note,
    status = excluded.status,
    sort_order = excluded.sort_order,
    metadata = coalesce(public.immersion_missions.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

  select id into v_airport_mission_id
  from public.immersion_missions
  where product_id = v_immersion_product_id and language_id = v_en_id and slug = 'airport-check-in-change-request'
  limit 1;

  select id into v_workplace_mission_id
  from public.immersion_missions
  where product_id = v_immersion_product_id and language_id = v_en_id and slug = 'team-update-after-delay'
  limit 1;

  select id into v_study_mission_id
  from public.immersion_missions
  where product_id = v_immersion_product_id and language_id = v_en_id and slug = 'study-group-room-change'
  limit 1;

  insert into public.immersion_mission_steps (
    mission_id,
    step_index,
    service_key,
    step_type,
    title,
    instructions,
    prompt_text,
    expected_answer_json,
    target_skill_key,
    estimated_minutes,
    status,
    metadata
  )
  values
    (
      v_airport_mission_id, 0, 'reading', 'reading',
      'Read the airport notice',
      'Read the notice and answer with the two most important preparation items.',
      'Notice: Please keep your passport ready and move to counter 14 if your bag is over 23 kilos.',
      jsonb_build_object(
        'required_keywords', jsonb_build_array('passport', 'counter 14', '23 kilos'),
        'minimum_words', 8
      ),
      'reading.detail', 4, 'published',
      jsonb_build_object('seeded_by', '20260420153000_english_immersion_phase4')
    ),
    (
      v_airport_mission_id, 1, 'listening', 'listening',
      'Catch the staff instruction',
      'Listen to the staff message in the prompt text and summarize the required action.',
      'Staff says: Your bag is two kilos over the limit, so you can move some items into your carry-on or pay the extra fee at the desk.',
      jsonb_build_object(
        'required_keywords', jsonb_build_array('carry-on', 'pay', 'extra fee'),
        'minimum_words', 8
      ),
      'listening.detail', 4, 'published',
      jsonb_build_object('seeded_by', '20260420153000_english_immersion_phase4')
    ),
    (
      v_airport_mission_id, 2, 'speaking', 'speaking',
      'Ask for help politely',
      'Write the transcript of what you would say to the staff member.',
      'Ask for help with the overweight bag and request a window seat if possible.',
      jsonb_build_object(
        'required_keywords', jsonb_build_array('please', 'bag', 'window seat'),
        'minimum_words', 18
      ),
      'speaking.task_completion', 5, 'published',
      jsonb_build_object('seeded_by', '20260420153000_english_immersion_phase4')
    ),
    (
      v_airport_mission_id, 3, 'writing', 'writing',
      'Write a short travel update',
      'Write a short message to your travel partner with the delay and your next step.',
      'Write 2-3 sentences to your travel partner. Explain the baggage delay, mention the counter, and say you may arrive at the gate later.',
      jsonb_build_object(
        'required_keywords', jsonb_build_array('counter 14', 'late', 'gate'),
        'minimum_words', 22
      ),
      'writing.coherence', 5, 'published',
      jsonb_build_object('seeded_by', '20260420153000_english_immersion_phase4')
    ),
    (
      v_workplace_mission_id, 0, 'reading', 'reading',
      'Read the project brief',
      'Identify what is already completed and what still needs support.',
      'Brief: The slides are finished, the report summary is drafted, but the final data table still needs approval before the client meeting.',
      jsonb_build_object(
        'required_keywords', jsonb_build_array('slides', 'report summary', 'approval'),
        'minimum_words', 8
      ),
      'reading.detail', 4, 'published',
      jsonb_build_object('seeded_by', '20260420153000_english_immersion_phase4')
    ),
    (
      v_workplace_mission_id, 1, 'listening', 'listening',
      'Catch the spoken blocker',
      'Summarize the blocker and the immediate next step from the spoken update.',
      'Manager says: The client changed one number this morning, so we cannot send the file until the finance team confirms the final table this afternoon.',
      jsonb_build_object(
        'required_keywords', jsonb_build_array('client changed', 'finance team', 'this afternoon'),
        'minimum_words', 10
      ),
      'listening.detail', 4, 'published',
      jsonb_build_object('seeded_by', '20260420153000_english_immersion_phase4')
    ),
    (
      v_workplace_mission_id, 2, 'speaking', 'speaking',
      'Give the oral manager update',
      'Write the transcript of your short spoken update for the manager.',
      'Explain what is completed, what is blocked, and what support you need next.',
      jsonb_build_object(
        'required_keywords', jsonb_build_array('completed', 'blocked', 'support'),
        'minimum_words', 24
      ),
      'speaking.fluency', 6, 'published',
      jsonb_build_object('seeded_by', '20260420153000_english_immersion_phase4')
    ),
    (
      v_workplace_mission_id, 3, 'writing', 'writing',
      'Send the written follow-up',
      'Write a short message to the team with the blocker and one clear next action.',
      'Write 3-4 sentences to your team. Mention the delayed table, the approval issue, and the next step for the afternoon.',
      jsonb_build_object(
        'required_keywords', jsonb_build_array('approval', 'table', 'next step'),
        'minimum_words', 30
      ),
      'writing.organization', 6, 'published',
      jsonb_build_object('seeded_by', '20260420153000_english_immersion_phase4')
    ),
    (
      v_study_mission_id, 0, 'reading', 'reading',
      'Read the room notice',
      'Name the old room and the new place from the notice.',
      'Notice: Room B12 is unavailable today. Please meet in the library discussion room at 5:30 instead.',
      jsonb_build_object(
        'required_keywords', jsonb_build_array('B12', 'library discussion room', '5:30'),
        'minimum_words', 7
      ),
      'reading.detail', 3, 'published',
      jsonb_build_object('seeded_by', '20260420153000_english_immersion_phase4')
    ),
    (
      v_study_mission_id, 1, 'listening', 'listening',
      'Catch the announcement',
      'Summarize the time and one instruction from the announcement.',
      'Announcement: The study group will start fifteen minutes later, and everyone should bring the printed worksheet to the new classroom.',
      jsonb_build_object(
        'required_keywords', jsonb_build_array('fifteen minutes later', 'printed worksheet', 'new classroom'),
        'minimum_words', 8
      ),
      'listening.detail', 3, 'published',
      jsonb_build_object('seeded_by', '20260420153000_english_immersion_phase4')
    ),
    (
      v_study_mission_id, 2, 'speaking', 'speaking',
      'Explain the plan to a friend',
      'Write the transcript of what you would tell one classmate.',
      'Explain the new place, the new time, and one thing the classmate should bring.',
      jsonb_build_object(
        'required_keywords', jsonb_build_array('library', 'later', 'worksheet'),
        'minimum_words', 16
      ),
      'speaking.task_completion', 4, 'published',
      jsonb_build_object('seeded_by', '20260420153000_english_immersion_phase4')
    ),
    (
      v_study_mission_id, 3, 'writing', 'writing',
      'Write the group update',
      'Write a short message to the study group with the changed plan.',
      'Write 2-3 sentences. Mention the new room, the new time, and remind everyone to bring the worksheet.',
      jsonb_build_object(
        'required_keywords', jsonb_build_array('library discussion room', '5:45', 'worksheet'),
        'minimum_words', 20
      ),
      'writing.coherence', 4, 'published',
      jsonb_build_object('seeded_by', '20260420153000_english_immersion_phase4')
    )
  on conflict (mission_id, step_index) do update
  set
    service_key = excluded.service_key,
    step_type = excluded.step_type,
    title = excluded.title,
    instructions = excluded.instructions,
    prompt_text = excluded.prompt_text,
    expected_answer_json = excluded.expected_answer_json,
    target_skill_key = excluded.target_skill_key,
    estimated_minutes = excluded.estimated_minutes,
    status = excluded.status,
    metadata = coalesce(public.immersion_mission_steps.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();
end
$$;

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
    when 'A1' then 0.20
    when 'A2' then 0.30
    when 'B1' then 0.45
    when 'B2' then 0.60
    when 'C1' then 0.75
    when 'C2' then 0.90
    else 0.50
  end,
  greatest(12, coalesce(step_totals.total_minutes, 18)),
  coalesce(im.objective_text, im.context_text),
  array_cat(array_remove(array[im.mission_type, im.target_grammar], null), coalesce(im.skill_mix, '{}'::text[])),
  im.status,
  jsonb_build_object(
    'mission_type', im.mission_type,
    'skill_mix', im.skill_mix,
    'success_conditions', im.success_conditions_json,
    'step_count', coalesce(step_totals.step_count, 0),
    'cultural_note', im.cultural_note
  ),
  im.metadata,
  im.created_by,
  im.updated_by
from public.immersion_missions im
left join (
  select
    mission_id,
    count(*)::int as step_count,
    coalesce(sum(estimated_minutes), 0)::int as total_minutes
  from public.immersion_mission_steps
  where status = 'published'
  group by mission_id
) step_totals
  on step_totals.mission_id = im.id
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
