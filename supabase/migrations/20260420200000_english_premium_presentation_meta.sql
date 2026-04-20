alter table public.reading_articles
  add column if not exists presentation_meta jsonb not null default '{}'::jsonb;

alter table public.listening_items
  add column if not exists presentation_meta jsonb not null default '{}'::jsonb;

alter table public.writing_prompts
  add column if not exists presentation_meta jsonb not null default '{}'::jsonb;

alter table public.speaking_prompts
  add column if not exists presentation_meta jsonb not null default '{}'::jsonb;

alter table public.grammar_units
  add column if not exists presentation_meta jsonb not null default '{}'::jsonb;

alter table public.grammar_drills
  add column if not exists presentation_meta jsonb not null default '{}'::jsonb;

alter table public.immersion_missions
  add column if not exists presentation_meta jsonb not null default '{}'::jsonb;

update public.reading_articles
set presentation_meta = coalesce(metadata -> 'presentation_meta', '{}'::jsonb)
where presentation_meta = '{}'::jsonb and jsonb_typeof(coalesce(metadata -> 'presentation_meta', '{}'::jsonb)) = 'object';

update public.listening_items
set presentation_meta = coalesce(metadata -> 'presentation_meta', '{}'::jsonb)
where presentation_meta = '{}'::jsonb and jsonb_typeof(coalesce(metadata -> 'presentation_meta', '{}'::jsonb)) = 'object';

update public.writing_prompts
set presentation_meta = coalesce(metadata -> 'presentation_meta', '{}'::jsonb)
where presentation_meta = '{}'::jsonb and jsonb_typeof(coalesce(metadata -> 'presentation_meta', '{}'::jsonb)) = 'object';

update public.speaking_prompts
set presentation_meta = coalesce(metadata -> 'presentation_meta', '{}'::jsonb)
where presentation_meta = '{}'::jsonb and jsonb_typeof(coalesce(metadata -> 'presentation_meta', '{}'::jsonb)) = 'object';

update public.grammar_units
set presentation_meta = coalesce(metadata -> 'presentation_meta', '{}'::jsonb)
where presentation_meta = '{}'::jsonb and jsonb_typeof(coalesce(metadata -> 'presentation_meta', '{}'::jsonb)) = 'object';

update public.grammar_drills
set presentation_meta = coalesce(metadata -> 'presentation_meta', '{}'::jsonb)
where presentation_meta = '{}'::jsonb and jsonb_typeof(coalesce(metadata -> 'presentation_meta', '{}'::jsonb)) = 'object';

update public.immersion_missions
set presentation_meta = coalesce(metadata -> 'presentation_meta', '{}'::jsonb)
where presentation_meta = '{}'::jsonb and jsonb_typeof(coalesce(metadata -> 'presentation_meta', '{}'::jsonb)) = 'object';
