-- Make active simulator mock experiences visible in teacher and center ticket catalogs.
-- Older seed data used several product slugs, so this backfill covers both legacy and current names.

with target_experiences as (
  select e.id
  from public.experiences e
  join public.products p on p.id = e.product_id
  where e.is_active = true
    and p.status = 'active'
    and lower(coalesce(p.metadata->>'slug', '')) in (
      'ielts-academic-simulator',
      'ielts-simulator',
      'toefl-ibt-simulator',
      'sat-exam-simulator',
      'sat-simulator',
      'itep-simulator'
    )
    and (
      lower(coalesce(e.metadata->>'catalog', '')) in ('full_test', 'mock_test', 'mock_exam')
      or lower(coalesce(e.metadata->>'kind', '')) in ('full_test', 'mock_test', 'mock_exam')
      or lower(coalesce(e.metadata->>'type', '')) in ('full_test', 'mock_test', 'mock_exam')
      or lower(coalesce(e.metadata->>'format', '')) in ('academic', 'digital_sat')
      or lower(e.name) like '%mock%'
      or lower(e.name) like '%full test%'
      or lower(e.name) like '%practice test%'
    )
)
update public.experiences e
set metadata =
  coalesce(e.metadata, '{}'::jsonb)
  || jsonb_build_object(
    'ticketing',
    coalesce(e.metadata->'ticketing', '{}'::jsonb)
    || jsonb_build_object(
      'eligible', true,
      'mode', 'single_sitting',
      'catalog_backfilled_at', now()
    )
  )
from target_experiences t
where e.id = t.id;
