-- ============================================================================
-- Non-exam English Phase 2: listening + writing backends
-- ----------------------------------------------------------------------------
-- Adds:
-- - listening item library, segments, and task sets
-- - writing prompt bank, learner drafts, and revision cycles
-- - seed content for english-listening and english-writing
-- - content-registry backfill for listening items and writing prompts
-- ============================================================================

create table if not exists public.listening_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  slug text not null,
  title text not null,
  summary text not null,
  transcript_text text not null,
  level text not null
    check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  category text not null,
  accent text not null default 'general',
  speed_label text not null default 'natural'
    check (speed_label in ('slow', 'natural', 'fast')),
  speed_wpm smallint not null default 130
    check (speed_wpm between 60 and 240),
  duration_seconds integer not null default 20
    check (duration_seconds between 5 and 900),
  audio_url text,
  focus_skill text not null default 'listening',
  tags text[] not null default '{}'::text[],
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listening_items_slug_not_empty check (length(trim(slug)) > 0),
  constraint listening_items_unique_slug_per_scope unique (product_id, language_id, slug)
);

create index if not exists listening_items_scope_status_idx
  on public.listening_items(product_id, language_id, status, sort_order asc, updated_at desc);

create index if not exists listening_items_level_focus_idx
  on public.listening_items(product_id, language_id, level, focus_skill, updated_at desc);

drop trigger if exists listening_items_updated_at on public.listening_items;
create trigger listening_items_updated_at
before update on public.listening_items
for each row execute function public.set_updated_at();

alter table public.listening_items enable row level security;

drop policy if exists "Listening items select published" on public.listening_items;
create policy "Listening items select published"
on public.listening_items
for select
to authenticated
using (status = 'published');

drop policy if exists "Listening items select admin" on public.listening_items;
create policy "Listening items select admin"
on public.listening_items
for select
to authenticated
using (public.is_admin());

drop policy if exists "Listening items mutate admin" on public.listening_items;
create policy "Listening items mutate admin"
on public.listening_items
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create table if not exists public.listening_segments (
  id uuid primary key default gen_random_uuid(),
  listening_item_id uuid not null references public.listening_items(id) on delete cascade,
  segment_index integer not null
    check (segment_index >= 0),
  segment_text text not null,
  starts_at_seconds numeric(8,2),
  ends_at_seconds numeric(8,2),
  focus_phrase text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listening_segments_unique unique (listening_item_id, segment_index)
);

create index if not exists listening_segments_item_idx
  on public.listening_segments(listening_item_id, segment_index asc);

drop trigger if exists listening_segments_updated_at on public.listening_segments;
create trigger listening_segments_updated_at
before update on public.listening_segments
for each row execute function public.set_updated_at();

alter table public.listening_segments enable row level security;

drop policy if exists "Listening segments select published item" on public.listening_segments;
create policy "Listening segments select published item"
on public.listening_segments
for select
to authenticated
using (
  exists (
    select 1
    from public.listening_items li
    where li.id = listening_segments.listening_item_id
      and (li.status = 'published' or public.is_admin())
  )
);

drop policy if exists "Listening segments mutate admin" on public.listening_segments;
create policy "Listening segments mutate admin"
on public.listening_segments
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create table if not exists public.listening_task_sets (
  id uuid primary key default gen_random_uuid(),
  listening_item_id uuid not null references public.listening_items(id) on delete cascade,
  task_type text not null
    check (task_type in ('dictation', 'detail_check', 'transcript_order', 'shadow_repeat')),
  title text not null,
  instructions text not null,
  target_skill_key text not null default 'listening',
  expected_answer_json jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listening_task_sets_unique unique (listening_item_id, task_type, sort_order)
);

create index if not exists listening_task_sets_item_idx
  on public.listening_task_sets(listening_item_id, status, sort_order asc);

drop trigger if exists listening_task_sets_updated_at on public.listening_task_sets;
create trigger listening_task_sets_updated_at
before update on public.listening_task_sets
for each row execute function public.set_updated_at();

alter table public.listening_task_sets enable row level security;

drop policy if exists "Listening task sets select published item" on public.listening_task_sets;
create policy "Listening task sets select published item"
on public.listening_task_sets
for select
to authenticated
using (
  exists (
    select 1
    from public.listening_items li
    where li.id = listening_task_sets.listening_item_id
      and (li.status = 'published' or public.is_admin())
  )
);

drop policy if exists "Listening task sets mutate admin" on public.listening_task_sets;
create policy "Listening task sets mutate admin"
on public.listening_task_sets
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create table if not exists public.writing_prompts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  slug text not null,
  title text not null,
  prompt_text text not null,
  guidance_text text,
  level text not null
    check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  genre text not null,
  target_grammar text,
  target_vocabulary text[] not null default '{}'::text[],
  target_structure text,
  expected_length_min integer not null default 60
    check (expected_length_min between 10 and 1000),
  expected_length_max integer not null default 180
    check (expected_length_max between 10 and 2000 and expected_length_max >= expected_length_min),
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint writing_prompts_slug_not_empty check (length(trim(slug)) > 0),
  constraint writing_prompts_unique_slug_per_scope unique (product_id, language_id, slug)
);

create index if not exists writing_prompts_scope_status_idx
  on public.writing_prompts(product_id, language_id, status, sort_order asc, updated_at desc);

create index if not exists writing_prompts_level_genre_idx
  on public.writing_prompts(product_id, language_id, level, genre, updated_at desc);

drop trigger if exists writing_prompts_updated_at on public.writing_prompts;
create trigger writing_prompts_updated_at
before update on public.writing_prompts
for each row execute function public.set_updated_at();

alter table public.writing_prompts enable row level security;

drop policy if exists "Writing prompts select published" on public.writing_prompts;
create policy "Writing prompts select published"
on public.writing_prompts
for select
to authenticated
using (status = 'published');

drop policy if exists "Writing prompts select admin" on public.writing_prompts;
create policy "Writing prompts select admin"
on public.writing_prompts
for select
to authenticated
using (public.is_admin());

drop policy if exists "Writing prompts mutate admin" on public.writing_prompts;
create policy "Writing prompts mutate admin"
on public.writing_prompts
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create table if not exists public.writing_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  prompt_id uuid not null references public.writing_prompts(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'revising', 'completed', 'archived')),
  current_text text not null default '',
  word_count integer not null default 0
    check (word_count >= 0),
  revision_count integer not null default 0
    check (revision_count >= 0),
  latest_attempt_id uuid references public.learning_attempts(id) on delete set null,
  latest_feedback jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists writing_drafts_user_idx
  on public.writing_drafts(user_id, language_id, updated_at desc);

create index if not exists writing_drafts_prompt_idx
  on public.writing_drafts(user_id, prompt_id, status, updated_at desc);

drop trigger if exists writing_drafts_updated_at on public.writing_drafts;
create trigger writing_drafts_updated_at
before update on public.writing_drafts
for each row execute function public.set_updated_at();

alter table public.writing_drafts enable row level security;

drop policy if exists "Writing drafts select own" on public.writing_drafts;
create policy "Writing drafts select own"
on public.writing_drafts
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Writing drafts write own" on public.writing_drafts;
create policy "Writing drafts write own"
on public.writing_drafts
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Writing drafts select admin" on public.writing_drafts;
create policy "Writing drafts select admin"
on public.writing_drafts
for select
to authenticated
using (public.is_admin());

create table if not exists public.writing_revision_cycles (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.writing_drafts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  revision_index integer not null
    check (revision_index > 0),
  submitted_text text not null,
  word_count integer not null default 0
    check (word_count >= 0),
  issues jsonb not null default '[]'::jsonb,
  correction_targets jsonb not null default '[]'::jsonb,
  feedback_summary text,
  attempt_id uuid references public.learning_attempts(id) on delete set null,
  improvement_ratio numeric
    check (improvement_ratio is null or (improvement_ratio >= 0 and improvement_ratio <= 1)),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint writing_revision_cycles_unique unique (draft_id, revision_index)
);

create index if not exists writing_revision_cycles_draft_idx
  on public.writing_revision_cycles(draft_id, revision_index desc, created_at desc);

drop trigger if exists writing_revision_cycles_updated_at on public.writing_revision_cycles;
create trigger writing_revision_cycles_updated_at
before update on public.writing_revision_cycles
for each row execute function public.set_updated_at();

alter table public.writing_revision_cycles enable row level security;

drop policy if exists "Writing revision cycles select own" on public.writing_revision_cycles;
create policy "Writing revision cycles select own"
on public.writing_revision_cycles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Writing revision cycles write own" on public.writing_revision_cycles;
create policy "Writing revision cycles write own"
on public.writing_revision_cycles
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Writing revision cycles select admin" on public.writing_revision_cycles;
create policy "Writing revision cycles select admin"
on public.writing_revision_cycles
for select
to authenticated
using (public.is_admin());

do $$
declare
  v_en_id uuid;
  v_listening_product_id uuid;
  v_writing_product_id uuid;
  v_item_one uuid;
  v_item_two uuid;
  v_item_three uuid;
begin
  insert into public.languages (code, name, status, metadata)
  values (
    'en',
    'English',
    'active',
    jsonb_build_object('seeded_by', '20260420123000_english_listening_writing_phase2')
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

  select p.id into v_listening_product_id
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) = 'english-listening'
  order by p.created_at asc
  limit 1;

  select p.id into v_writing_product_id
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) = 'english-writing'
  order by p.created_at asc
  limit 1;

  if v_listening_product_id is null then
    raise exception 'english-listening product not found; seed product first';
  end if;

  if v_writing_product_id is null then
    raise exception 'english-writing product not found; seed product first';
  end if;

  insert into public.listening_items (
    product_id,
    language_id,
    slug,
    title,
    summary,
    transcript_text,
    level,
    category,
    accent,
    speed_label,
    speed_wpm,
    duration_seconds,
    focus_skill,
    tags,
    status,
    sort_order,
    metadata
  )
  values
    (
      v_listening_product_id, v_en_id, 'train-platform-change',
      'Platform Change Announcement',
      'Catch a short station announcement, recover missed details, and notice key travel words.',
      'Attention please. The next train to Tashkent will now leave from platform four in two minutes.',
      'A2', 'Travel', 'general', 'natural', 132, 18, 'dictation',
      array['travel', 'announcements', 'detail']::text[],
      'published', 10,
      jsonb_build_object('seeded_by', '20260420123000_english_listening_writing_phase2')
    ),
    (
      v_listening_product_id, v_en_id, 'study-group-time-change',
      'Study Group Time Change',
      'Practice everyday conversation listening with a time change and one cause phrase.',
      'Our study group usually meets at six, but this week we start at seven because the room is busy.',
      'B1', 'Work and Study', 'general', 'slow', 118, 22, 'dictation',
      array['schedule', 'conversation', 'cause']::text[],
      'published', 20,
      jsonb_build_object('seeded_by', '20260420123000_english_listening_writing_phase2')
    ),
    (
      v_listening_product_id, v_en_id, 'report-check-before-send',
      'Report Check Before Sending',
      'Train workplace listening with an instruction sequence and short final action.',
      'Before you send the report, check the final numbers and add one short conclusion at the end.',
      'B2', 'Work and Study', 'general', 'fast', 154, 16, 'detail_check',
      array['workplace', 'instructions', 'accuracy']::text[],
      'published', 30,
      jsonb_build_object('seeded_by', '20260420123000_english_listening_writing_phase2')
    )
  on conflict (product_id, language_id, slug) do update
  set
    title = excluded.title,
    summary = excluded.summary,
    transcript_text = excluded.transcript_text,
    level = excluded.level,
    category = excluded.category,
    accent = excluded.accent,
    speed_label = excluded.speed_label,
    speed_wpm = excluded.speed_wpm,
    duration_seconds = excluded.duration_seconds,
    focus_skill = excluded.focus_skill,
    tags = excluded.tags,
    status = excluded.status,
    sort_order = excluded.sort_order,
    metadata = coalesce(public.listening_items.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

  select id into v_item_one
  from public.listening_items
  where product_id = v_listening_product_id and language_id = v_en_id and slug = 'train-platform-change'
  limit 1;

  select id into v_item_two
  from public.listening_items
  where product_id = v_listening_product_id and language_id = v_en_id and slug = 'study-group-time-change'
  limit 1;

  select id into v_item_three
  from public.listening_items
  where product_id = v_listening_product_id and language_id = v_en_id and slug = 'report-check-before-send'
  limit 1;

  insert into public.listening_segments (
    listening_item_id,
    segment_index,
    segment_text,
    starts_at_seconds,
    ends_at_seconds,
    focus_phrase,
    metadata
  )
  values
    (v_item_one, 0, 'Attention please.', 0, 2, 'attention please', '{}'::jsonb),
    (v_item_one, 1, 'The next train to Tashkent will now leave from platform four', 2, 11, 'platform four', '{}'::jsonb),
    (v_item_one, 2, 'in two minutes.', 11, 14, 'two minutes', '{}'::jsonb),
    (v_item_two, 0, 'Our study group usually meets at six,', 0, 6, 'meets at six', '{}'::jsonb),
    (v_item_two, 1, 'but this week we start at seven', 6, 11, 'start at seven', '{}'::jsonb),
    (v_item_two, 2, 'because the room is busy.', 11, 15, 'because the room is busy', '{}'::jsonb),
    (v_item_three, 0, 'Before you send the report,', 0, 4, 'send the report', '{}'::jsonb),
    (v_item_three, 1, 'check the final numbers', 4, 8, 'final numbers', '{}'::jsonb),
    (v_item_three, 2, 'and add one short conclusion at the end.', 8, 13, 'short conclusion', '{}'::jsonb)
  on conflict (listening_item_id, segment_index) do update
  set
    segment_text = excluded.segment_text,
    starts_at_seconds = excluded.starts_at_seconds,
    ends_at_seconds = excluded.ends_at_seconds,
    focus_phrase = excluded.focus_phrase,
    metadata = excluded.metadata,
    updated_at = now();

  insert into public.listening_task_sets (
    listening_item_id,
    task_type,
    title,
    instructions,
    target_skill_key,
    expected_answer_json,
    metadata,
    status,
    sort_order
  )
  values
    (
      v_item_one,
      'dictation',
      'Replay and type the station update',
      'Play the clip, type exactly what you hear, and focus on the platform and timing details.',
      'listening.word_recognition',
      jsonb_build_object('transcript', 'Attention please. The next train to Tashkent will now leave from platform four in two minutes.'),
      jsonb_build_object('seeded_by', '20260420123000_english_listening_writing_phase2'),
      'published',
      10
    ),
    (
      v_item_two,
      'dictation',
      'Recover the changed schedule',
      'Listen for the original time, the new time, and the reason for the change.',
      'listening.detail_recall',
      jsonb_build_object('transcript', 'Our study group usually meets at six, but this week we start at seven because the room is busy.'),
      jsonb_build_object('seeded_by', '20260420123000_english_listening_writing_phase2'),
      'published',
      10
    ),
    (
      v_item_three,
      'detail_check',
      'Follow the workplace instruction sequence',
      'Catch the three actions in order and replay the clip once before answering.',
      'listening.detail_recall',
      jsonb_build_object(
        'transcript', 'Before you send the report, check the final numbers and add one short conclusion at the end.',
        'checkpoints', jsonb_build_array('send the report', 'check the final numbers', 'add one short conclusion')
      ),
      jsonb_build_object('seeded_by', '20260420123000_english_listening_writing_phase2'),
      'published',
      10
    )
  on conflict do nothing;

  insert into public.writing_prompts (
    product_id,
    language_id,
    slug,
    title,
    prompt_text,
    guidance_text,
    level,
    genre,
    target_grammar,
    target_vocabulary,
    target_structure,
    expected_length_min,
    expected_length_max,
    status,
    sort_order,
    metadata
  )
  values
    (
      v_writing_product_id, v_en_id, 'reschedule-study-meeting',
      'Reschedule a Study Meeting',
      'Write a short message to your study group. Explain that you need to change the meeting time, give the new time, and mention one reason.',
      'Use clear time expressions, one polite request, and a short closing sentence.',
      'A2', 'message', 'time expressions and polite requests',
      array['reschedule', 'available', 'tomorrow']::text[],
      'opening + reason + new time + closing',
      45, 90, 'published', 10,
      jsonb_build_object('seeded_by', '20260420123000_english_listening_writing_phase2')
    ),
    (
      v_writing_product_id, v_en_id, 'study-alone-or-with-friends',
      'Study Alone or With Friends?',
      'Write one opinion paragraph about whether studying alone or with friends is better for you. Give your opinion and support it with two reasons.',
      'Aim for a clear topic sentence, two supporting ideas, and a final sentence that restates your opinion.',
      'B1', 'opinion', 'because / although / first-second structure',
      array['focus', 'motivation', 'discussion']::text[],
      'opinion + support 1 + support 2 + closing',
      90, 160, 'published', 20,
      jsonb_build_object('seeded_by', '20260420123000_english_listening_writing_phase2')
    ),
    (
      v_writing_product_id, v_en_id, 'improve-team-update-clarity',
      'Improve a Team Update',
      'Write a short workplace update to your team. Explain what is finished, what is delayed, and what support you need next.',
      'Use short clear sentences, one transition, and a specific request for the next step.',
      'B2', 'workplace update', 'present perfect + clear transitions',
      array['completed', 'delayed', 'support', 'deadline']::text[],
      'status update + blocker + request',
      90, 170, 'published', 30,
      jsonb_build_object('seeded_by', '20260420123000_english_listening_writing_phase2')
    )
  on conflict (product_id, language_id, slug) do update
  set
    title = excluded.title,
    prompt_text = excluded.prompt_text,
    guidance_text = excluded.guidance_text,
    level = excluded.level,
    genre = excluded.genre,
    target_grammar = excluded.target_grammar,
    target_vocabulary = excluded.target_vocabulary,
    target_structure = excluded.target_structure,
    expected_length_min = excluded.expected_length_min,
    expected_length_max = excluded.expected_length_max,
    status = excluded.status,
    sort_order = excluded.sort_order,
    metadata = coalesce(public.writing_prompts.metadata, '{}'::jsonb) || excluded.metadata,
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
  li.product_id,
  li.language_id,
  'listening',
  'listening.item',
  'listening_items',
  li.id,
  li.slug,
  li.title,
  li.summary,
  'listening',
  array['listening.word_recognition', 'listening.detail_recall', 'vocabulary.recall']::text[],
  li.level,
  case li.level
    when 'A1' then 0.20
    when 'A2' then 0.30
    when 'B1' then 0.45
    when 'B2' then 0.60
    when 'C1' then 0.75
    when 'C2' then 0.90
    else 0.50
  end,
  greatest(1, least(30, ceil(li.duration_seconds / 60.0)::int + 4)),
  li.summary,
  coalesce(li.tags, '{}'::text[]),
  li.status,
  jsonb_build_object(
    'accent', li.accent,
    'speed_label', li.speed_label,
    'speed_wpm', li.speed_wpm,
    'duration_seconds', li.duration_seconds,
    'focus_skill', li.focus_skill
  ),
  li.metadata,
  li.created_by,
  li.updated_by
from public.listening_items li
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
  wp.product_id,
  wp.language_id,
  'writing',
  'writing.prompt',
  'writing_prompts',
  wp.id,
  wp.slug,
  wp.title,
  left(wp.prompt_text, 900),
  'writing',
  array['writing.grammar_accuracy', 'writing.sentence_control', 'writing.coherence', 'vocabulary.usage']::text[],
  wp.level,
  case wp.level
    when 'A1' then 0.20
    when 'A2' then 0.30
    when 'B1' then 0.45
    when 'B2' then 0.60
    when 'C1' then 0.75
    when 'C2' then 0.90
    else 0.50
  end,
  greatest(5, least(45, ceil(wp.expected_length_max / 18.0)::int)),
  coalesce(wp.guidance_text, wp.prompt_text),
  array_remove(array[wp.genre, wp.target_grammar], null),
  wp.status,
  jsonb_build_object(
    'genre', wp.genre,
    'target_grammar', wp.target_grammar,
    'target_structure', wp.target_structure,
    'expected_length_min', wp.expected_length_min,
    'expected_length_max', wp.expected_length_max,
    'target_vocabulary', wp.target_vocabulary
  ),
  wp.metadata,
  wp.created_by,
  wp.updated_by
from public.writing_prompts wp
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
