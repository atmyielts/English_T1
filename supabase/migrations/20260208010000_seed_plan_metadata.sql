-- Seed nicer defaults for the MVP plan card shown on /pricing.
-- Safe to run repeatedly.

update public.plans
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'display_order', 1,
  'recommended', true,
  'tagline', 'Best for steady progress',
  'features', jsonb_build_array(
    'Full mock tests (Listening, Reading, Writing)',
    'Exam-like interface + timer per section',
    'Results + review breakdown'
  )
)
where id = '22222222-2222-2222-2222-222222222222'
  and (metadata is null or metadata = '{}'::jsonb);

