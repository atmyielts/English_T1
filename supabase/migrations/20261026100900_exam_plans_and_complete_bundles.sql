-- Make the IELTS and SAT families sellable (prices: owner-approved list,
-- 2026-10-24). All amounts in UZS. Existing active plans are not touched.
--
-- TOEFL is out of scope for this release (owner, 2026-10-27): no TOEFL rows
-- are added or changed here.
--
-- 1. Playbook Premium for IELTS and SAT: 59,000 / 30 days and 149,000 / 90 days.
--    (The inactive 119,000 placeholder plans seeded with the playbooks stay
--    inactive.)
-- 2. The SAT Exam Simulator is paywalled (its app and start-session require a
--    product entitlement) and had no active plan: Standard 69,000 / 30 days,
--    like IELTS Simulator Standard.
-- 3. "Complete" bundles, one product per exam family:
--      IELTS Complete = IELTS Simulator + IELTS Practice + IELTS Playbook, 179,000 / 30 days
--      SAT Complete   = SAT Simulator + SAT Practice + SAT Playbook,       159,000 / 30 days
--    Each bundle plan lists its members in metadata.included_product_ids, so
--    payment fulfilment (payment_fulfillment_transaction) grants the bundle
--    product AND every member product. Grants of the bundle product made any
--    other way (admin, academy sponsor) are expanded at check time by
--    supabase/functions/_shared/product-bundles.ts (same ids as below).
--    Trials are not offered for bundles (trial-claim refuses them).
--
-- Ids are deterministic: products md5('schood-product:<slug>')::uuid,
-- plans md5('schood-plan:<slug>')::uuid. Idempotent: safe to run more than once.

begin;
set local lock_timeout = '5s';

-- 3a. Bundle products.
insert into public.products (id, name, type, status, description, metadata)
values
  (
    md5('schood-product:ielts-complete')::uuid,
    'IELTS Complete',
    'exam',
    'active',
    'Everything for IELTS in one plan: the IELTS Academic Simulator, IELTS Practice and IELTS Playbook Premium.',
    jsonb_build_object(
      'slug', 'ielts-complete',
      'app_url', 'https://schood.online/ielts',
      'service_family', 'ielts',
      'short_description', 'Simulator, Practice and Playbook Premium for IELTS in one plan.',
      'tagline', 'Mock tests, daily practice and the strategy library, together.',
      'sort_order', 2,
      'bundle_of', jsonb_build_array('ielts-academic-simulator', 'ielts-practice', 'ielts-playbook'),
      'bundle_product_ids', jsonb_build_array(
        'ead05eae-aa97-4bda-a07c-51e5dbb062c0',
        'a74195fd-b4f3-4fd4-93bf-c807e42250c6',
        '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'
      ),
      'seeded_by', '20261026100900_exam_plans_and_complete_bundles'
    )
  ),
  (
    md5('schood-product:sat-complete')::uuid,
    'SAT Complete',
    'exam',
    'active',
    'Everything for the Digital SAT in one plan: the SAT Exam Simulator, SAT Practice Lab and SAT Playbook Premium.',
    jsonb_build_object(
      'slug', 'sat-complete',
      'app_url', 'https://schood.online/sat',
      'service_family', 'sat',
      'short_description', 'Simulator, Practice Lab and Playbook Premium for the SAT in one plan.',
      'tagline', 'Adaptive mocks, daily drills and a study plan, together.',
      'sort_order', 29,
      'bundle_of', jsonb_build_array('sat-exam-simulator', 'sat-practice', 'sat-playbook'),
      'bundle_product_ids', jsonb_build_array(
        '5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef',
        '2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010',
        'a8b41e2c-9a36-4caf-9bba-7212e35a8b8c'
      ),
      'seeded_by', '20261026100900_exam_plans_and_complete_bundles'
    )
  )
on conflict (id) do update
set
  name = excluded.name,
  type = excluded.type,
  status = excluded.status,
  description = excluded.description,
  metadata = coalesce(public.products.metadata, '{}'::jsonb) || excluded.metadata;

-- Member products point at the bundle that contains them (pricing pages use
-- this to offer the bundle). The old bundle_compatible_with hint stays as is.
update public.products p
set metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object('included_in_bundles', b.bundles)
from (
  values
    ('ead05eae-aa97-4bda-a07c-51e5dbb062c0'::uuid, jsonb_build_array('ielts-complete')),
    ('a74195fd-b4f3-4fd4-93bf-c807e42250c6'::uuid, jsonb_build_array('ielts-complete')),
    ('9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid, jsonb_build_array('ielts-complete')),
    ('5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef'::uuid, jsonb_build_array('sat-complete')),
    ('2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010'::uuid, jsonb_build_array('sat-complete')),
    ('a8b41e2c-9a36-4caf-9bba-7212e35a8b8c'::uuid, jsonb_build_array('sat-complete'))
) as b(product_id, bundles)
where p.id = b.product_id;

-- 1, 2, 3b. Plans.
insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active, metadata)
values
  -- IELTS Playbook Premium
  (
    md5('schood-plan:ielts-playbook-premium-30')::uuid,
    '9de6c9e7-31df-4d1d-9574-1f8f84a53b54',
    'IELTS Playbook Premium',
    59000, 'UZS', 30, true,
    jsonb_build_object(
      'slug', 'ielts-playbook-premium-30',
      'display_order', 1,
      'recommended', false,
      'tagline', 'One month of premium IELTS strategy',
      'description', 'Every premium deep guide, a diagnostic that reads your scored work, and a personal study plan you can follow week by week.',
      'features', jsonb_build_array(
        'All premium deep guides',
        'Diagnostic onboarding',
        'Saved recommendations',
        'Personal IELTS study plan'
      ),
      'seeded_by', '20261026100900_exam_plans_and_complete_bundles'
    )
  ),
  (
    md5('schood-plan:ielts-playbook-premium-90')::uuid,
    '9de6c9e7-31df-4d1d-9574-1f8f84a53b54',
    'IELTS Playbook Premium (3 months)',
    149000, 'UZS', 90, true,
    jsonb_build_object(
      'slug', 'ielts-playbook-premium-90',
      'display_order', 2,
      'recommended', true,
      'tagline', 'A full preparation cycle',
      'description', 'Three months of premium IELTS strategy: enough time to follow a full study plan through to test day.',
      'features', jsonb_build_array(
        'Everything in IELTS Playbook Premium',
        '90 days of access',
        'Re-run the diagnostic as your scores change'
      ),
      'seeded_by', '20261026100900_exam_plans_and_complete_bundles'
    )
  ),
  -- SAT Playbook Premium
  (
    md5('schood-plan:sat-playbook-premium-30')::uuid,
    'a8b41e2c-9a36-4caf-9bba-7212e35a8b8c',
    'SAT Playbook Premium',
    59000, 'UZS', 30, true,
    jsonb_build_object(
      'slug', 'sat-playbook-premium-30',
      'display_order', 1,
      'recommended', false,
      'tagline', 'One month of premium SAT strategy',
      'description', 'Premium SAT guides, a diagnostic that reads your simulator and practice results, and a personal study plan.',
      'features', jsonb_build_array(
        'All premium SAT strategy guides',
        'Diagnostic onboarding',
        'Saved recommendations',
        'Personal SAT study plan'
      ),
      'seeded_by', '20261026100900_exam_plans_and_complete_bundles'
    )
  ),
  (
    md5('schood-plan:sat-playbook-premium-90')::uuid,
    'a8b41e2c-9a36-4caf-9bba-7212e35a8b8c',
    'SAT Playbook Premium (3 months)',
    149000, 'UZS', 90, true,
    jsonb_build_object(
      'slug', 'sat-playbook-premium-90',
      'display_order', 2,
      'recommended', true,
      'tagline', 'A full preparation cycle',
      'description', 'Three months of premium SAT strategy: enough time to follow an 8- or 12-week plan through to test day.',
      'features', jsonb_build_array(
        'Everything in SAT Playbook Premium',
        '90 days of access',
        'Re-run the diagnostic as your scores change'
      ),
      'seeded_by', '20261026100900_exam_plans_and_complete_bundles'
    )
  ),
  -- SAT Simulator
  (
    md5('schood-plan:sat-simulator-standard-30')::uuid,
    '5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef',
    'Standard',
    69000, 'UZS', 30, true,
    jsonb_build_object(
      'slug', 'sat-simulator-standard-30',
      'display_order', 1,
      'recommended', true,
      'tagline', 'Full Digital SAT practice tests',
      'description', 'Adaptive-style Reading and Writing and Math modules with realistic timing and a scored report after every test.',
      'features', jsonb_build_array(
        'Full adaptive-style practice tests',
        'Module practice for Reading and Writing and Math',
        'Scored report with domain breakdown'
      ),
      'seeded_by', '20261026100900_exam_plans_and_complete_bundles'
    )
  ),
  -- Complete bundles
  (
    md5('schood-plan:ielts-complete-30')::uuid,
    md5('schood-product:ielts-complete')::uuid,
    'IELTS Complete',
    179000, 'UZS', 30, true,
    jsonb_build_object(
      'slug', 'ielts-complete-30',
      'display_order', 1,
      'recommended', true,
      'tagline', 'Best value for IELTS',
      'description', 'The IELTS Academic Simulator, IELTS Practice and IELTS Playbook Premium for 30 days, with one shared progress profile.',
      'features', jsonb_build_array(
        'IELTS Academic Simulator',
        'IELTS Practice',
        'IELTS Playbook Premium',
        'One shared progress profile'
      ),
      'included_product_ids', jsonb_build_array(
        'ead05eae-aa97-4bda-a07c-51e5dbb062c0',
        'a74195fd-b4f3-4fd4-93bf-c807e42250c6',
        '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'
      ),
      'seeded_by', '20261026100900_exam_plans_and_complete_bundles'
    )
  ),
  (
    md5('schood-plan:sat-complete-30')::uuid,
    md5('schood-product:sat-complete')::uuid,
    'SAT Complete',
    159000, 'UZS', 30, true,
    jsonb_build_object(
      'slug', 'sat-complete-30',
      'display_order', 1,
      'recommended', true,
      'tagline', 'Best value for the SAT',
      'description', 'The SAT Exam Simulator, SAT Practice Lab and SAT Playbook Premium for 30 days, with one shared progress profile.',
      'features', jsonb_build_array(
        'SAT Exam Simulator',
        'SAT Practice Lab',
        'SAT Playbook Premium',
        'One shared progress profile'
      ),
      'included_product_ids', jsonb_build_array(
        '5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef',
        '2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010',
        'a8b41e2c-9a36-4caf-9bba-7212e35a8b8c'
      ),
      'seeded_by', '20261026100900_exam_plans_and_complete_bundles'
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

commit;
