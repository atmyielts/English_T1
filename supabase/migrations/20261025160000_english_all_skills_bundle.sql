-- "All of English": one product that unlocks all seven English skills.
-- Each skill stays sellable on its own (79,000 UZS a month); the bundle is
-- 199,000 UZS a month. Entitlement checks expand the bundle to every skill
-- product (ENGLISH_BUNDLE_PRODUCT_ID in _shared/english-access.ts and
-- ENGLISH_BUNDLE in apps/english-hub/src/lib/skills.ts use this product id).
-- Idempotent: safe to run more than once.

insert into public.products (id, name, type, status, description, metadata)
values (
  '3a7bd983-58c5-4c75-b5f8-5ac46c94a0fa',
  'English All Skills',
  'course',
  'active',
  'All seven Schood English skills in one plan: reading, listening, writing, speaking, grammar, vocabulary and immersion, with the AI tutor and role-plays.',
  jsonb_build_object(
    'slug', 'english-all',
    'app_url', 'https://english.schood.online/today',
    'short_description', 'Every English skill in one plan.',
    'tagline', 'One plan, all seven skills, one learning path.',
    'sort_order', 40,
    'bundle_of', jsonb_build_array(
      'english-reading', 'english-listening', 'english-writing', 'english-speaking',
      'english-grammar', 'english-vocabulary', 'english-immersion'
    )
  )
)
on conflict (id) do update
set
  name = excluded.name,
  type = excluded.type,
  status = excluded.status,
  description = excluded.description,
  metadata = coalesce(public.products.metadata, '{}'::jsonb) || excluded.metadata;

insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active, metadata)
values (
  '6fe527bf-be7f-46c5-8a4c-827e9bba712a',
  '3a7bd983-58c5-4c75-b5f8-5ac46c94a0fa',
  'All Skills Monthly Access',
  199000,
  'UZS',
  30,
  true,
  jsonb_build_object(
    'display_order', 1,
    'recommended', true,
    'tagline', 'Best value: all seven skills',
    'description', 'Full access to every English skill, the AI tutor, role-plays and speaking mocks, with one shared progress profile.',
    'features', jsonb_build_array(
      'All 7 English skills',
      'AI tutor, role-plays and speaking mocks',
      'One shared level, review and progress profile'
    )
  )
)
on conflict (id) do update
set
  product_id = excluded.product_id,
  name = excluded.name,
  amount = excluded.amount,
  currency = excluded.currency,
  duration_days = excluded.duration_days,
  is_active = excluded.is_active,
  metadata = excluded.metadata;

insert into public.product_languages (product_id, language_id, included_in_shared_profile, metadata)
select
  '3a7bd983-58c5-4c75-b5f8-5ac46c94a0fa',
  l.id,
  true,
  jsonb_build_object('seeded_by', '20261025160000_english_all_skills_bundle', 'scope', 'english_shared_profile')
from public.languages l
where l.code = 'en'
on conflict (product_id) do update
set
  language_id = excluded.language_id,
  included_in_shared_profile = excluded.included_in_shared_profile,
  metadata = coalesce(public.product_languages.metadata, '{}'::jsonb) || excluded.metadata;
