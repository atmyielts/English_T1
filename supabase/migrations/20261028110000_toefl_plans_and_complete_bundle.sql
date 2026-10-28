-- Make the TOEFL family sellable, like IELTS and SAT
-- (20261026100900_exam_plans_and_complete_bundles). Prices: owner-approved
-- list, 2026-10-28. All amounts in UZS. Ships after the TOEFL Playbook content
-- is live, so nothing empty goes on sale.
--
-- 1. TOEFL Playbook Premium: 59,000 / 30 days and 149,000 / 90 days. The old
--    hand-made plan "test" (5f49a588-34e9-4503-8233-86076d82f457) is already
--    inactive and is not touched; nor is the inactive 119,000 placeholder.
-- 2. The TOEFL iBT Simulator is paywalled (its app gates every test route on a
--    product entitlement and start-session refuses sessions without one) and
--    had no active plan: Standard 69,000 / 30 days, like the IELTS and SAT
--    simulators.
-- 3. TOEFL Complete = TOEFL iBT Simulator + TOEFL Playbook, 109,000 / 30 days.
--    The bundle plan lists its members in metadata.included_product_ids, so
--    payment fulfilment grants the bundle product AND every member product.
--    Grants of the bundle made any other way (admin, academy sponsor) are
--    expanded at check time by supabase/functions/_shared/product-bundles.ts
--    (same ids). Trials are not offered for bundles (trial-claim refuses them).
--
-- Ids are deterministic: products md5('schood-product:<slug>')::uuid,
-- plans md5('schood-plan:<slug>')::uuid. Idempotent: safe to run more than once.

begin;
set local lock_timeout = '5s';

-- 3a. Bundle product.
insert into public.products (id, name, type, status, description, metadata)
values (
  md5('schood-product:toefl-complete')::uuid,
  'TOEFL Complete',
  'exam',
  'active',
  'Everything for TOEFL iBT in one plan: the TOEFL iBT Simulator and TOEFL Playbook Premium.',
  jsonb_build_object(
    'slug', 'toefl-complete',
    'app_url', 'https://schood.online/toefl',
    'service_family', 'toefl',
    'short_description', 'Simulator and Playbook Premium for TOEFL iBT in one plan.',
    'tagline', 'Timed practice tests and the strategy library, together.',
    'sort_order', 34,
    'bundle_of', jsonb_build_array('toefl-ibt-simulator', 'toefl-playbook'),
    'bundle_product_ids', jsonb_build_array(
      'b262ffa8-9912-4eba-93d7-58af3164d1cc',
      'f9512c15-ec1c-4fcb-a5ec-a2c6ac3a020e'
    ),
    'seeded_by', '20261028110000_toefl_plans_and_complete_bundle'
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
set metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object('included_in_bundles', jsonb_build_array('toefl-complete'))
where p.id in ('b262ffa8-9912-4eba-93d7-58af3164d1cc'::uuid, 'f9512c15-ec1c-4fcb-a5ec-a2c6ac3a020e'::uuid);

-- 1, 2, 3b. Plans.
insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active, metadata)
values
  -- TOEFL Playbook Premium
  (
    md5('schood-plan:toefl-playbook-premium-30')::uuid,
    'f9512c15-ec1c-4fcb-a5ec-a2c6ac3a020e',
    'TOEFL Playbook Premium',
    59000, 'UZS', 30, true,
    jsonb_build_object(
      'slug', 'toefl-playbook-premium-30',
      'display_order', 1,
      'recommended', false,
      'tagline', 'One month of premium TOEFL strategy',
      'description', 'Premium TOEFL iBT guides for the 2026 test format, a diagnostic that reads your simulator results, and a personal study plan.',
      'features', jsonb_build_array(
        'All premium TOEFL strategy guides',
        'Diagnostic onboarding',
        'Saved recommendations',
        'Personal TOEFL study plan'
      ),
      'seeded_by', '20261028110000_toefl_plans_and_complete_bundle'
    )
  ),
  (
    md5('schood-plan:toefl-playbook-premium-90')::uuid,
    'f9512c15-ec1c-4fcb-a5ec-a2c6ac3a020e',
    'TOEFL Playbook Premium (3 months)',
    149000, 'UZS', 90, true,
    jsonb_build_object(
      'slug', 'toefl-playbook-premium-90',
      'display_order', 2,
      'recommended', true,
      'tagline', 'A full preparation cycle',
      'description', 'Three months of premium TOEFL strategy: enough time to follow an 8- or 12-week plan through to test day.',
      'features', jsonb_build_array(
        'Everything in TOEFL Playbook Premium',
        '90 days of access',
        'Re-run the diagnostic as your scores change'
      ),
      'seeded_by', '20261028110000_toefl_plans_and_complete_bundle'
    )
  ),
  -- TOEFL iBT Simulator
  (
    md5('schood-plan:toefl-simulator-standard-30')::uuid,
    'b262ffa8-9912-4eba-93d7-58af3164d1cc',
    'Standard',
    69000, 'UZS', 30, true,
    jsonb_build_object(
      'slug', 'toefl-simulator-standard-30',
      'display_order', 1,
      'recommended', true,
      'tagline', 'Timed TOEFL iBT practice tests',
      'description', 'TOEFL iBT practice tests with realistic timing and an estimated score report after every test.',
      'features', jsonb_build_array(
        'Timed TOEFL iBT practice tests',
        'Section practice',
        'Estimated score report'
      ),
      'seeded_by', '20261028110000_toefl_plans_and_complete_bundle'
    )
  ),
  -- TOEFL Complete
  (
    md5('schood-plan:toefl-complete-30')::uuid,
    md5('schood-product:toefl-complete')::uuid,
    'TOEFL Complete',
    109000, 'UZS', 30, true,
    jsonb_build_object(
      'slug', 'toefl-complete-30',
      'display_order', 1,
      'recommended', true,
      'tagline', 'Best value for TOEFL iBT',
      'description', 'The TOEFL iBT Simulator and TOEFL Playbook Premium for 30 days, with one shared progress profile.',
      'features', jsonb_build_array(
        'TOEFL iBT Simulator',
        'TOEFL Playbook Premium',
        'One shared progress profile'
      ),
      'included_product_ids', jsonb_build_array(
        'b262ffa8-9912-4eba-93d7-58af3164d1cc',
        'f9512c15-ec1c-4fcb-a5ec-a2c6ac3a020e'
      ),
      'seeded_by', '20261028110000_toefl_plans_and_complete_bundle'
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
