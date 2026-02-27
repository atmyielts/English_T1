-- Reset plans and seed example plans + bundles.
-- Safe to run once in a clean staging environment.

begin;

delete from public.plans;

-- Starter plan (short access)
insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active, metadata)
select
  gen_random_uuid(),
  p.id,
  'Starter',
  19000,
  'UZS',
  7,
  true,
  jsonb_build_object(
    'display_order', 1,
    'tagline', 'Short practice sprint',
    'description', 'Try the core practice flow with timed sections and review.',
    'features', jsonb_build_array(
      'Section practice',
      'Answer review',
      'Progress tracking'
    )
  )
from public.products p
where p.status = 'active';

-- Monthly plan (recommended)
insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active, metadata)
select
  gen_random_uuid(),
  p.id,
  'Monthly Access',
  79000,
  'UZS',
  30,
  true,
  jsonb_build_object(
    'display_order', 2,
    'recommended', true,
    'tagline', 'Best for steady progress',
    'description', 'Full mock tests and section practice with review.',
    'features', jsonb_build_array(
      'Full mock tests',
      'Section practice',
      'Score breakdown'
    )
  )
from public.products p
where p.status = 'active';

-- Bundle plan (includes other active products)
insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active, metadata)
select
  gen_random_uuid(),
  p.id,
  'All-Access Bundle',
  149000,
  'UZS',
  90,
  true,
  jsonb_build_object(
    'display_order', 3,
    'tagline', 'Unlock multiple services',
    'description', 'Bundle plan that includes multiple services at once.',
    'features', jsonb_build_array(
      'Access to multiple services',
      'Unified progress tracking',
      'Full mock tests'
    ),
    'included_product_ids', (
      select coalesce(jsonb_agg(other.id), '[]'::jsonb)
      from public.products other
      where other.status = 'active' and other.id <> p.id
    )
  )
from public.products p
where p.status = 'active'
  and exists (
    select 1 from public.products other
    where other.status = 'active' and other.id <> p.id
  );

commit;
