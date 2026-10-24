-- Schood Teaching prices (owner delegated pricing on 2026-10-24).
--
-- Anchors: learner plans are 39 000-119 000 UZS a month; centre tiers are
-- Growth 490 000 and Premium 990 000 a month, with yearly = 10 x monthly.
-- One teacher is a fraction of a centre, so:
--   Teacher      149 000 / month  (homework OS + courses)        ~30% of Growth
--   Teacher Pro  249 000 / month  (+ AI pre-marking, mistakes)   ~50% of Growth
-- Yearly plans follow the centre rule: two months free.
--
-- Billing is still not enforced (academy_learning_config 'billing.enforced'),
-- so nobody loses access; the prices show in Academy → Homework → Plan.
-- The product is hidden from learner catalogues and only an academy owner or
-- administrator can buy it (institution_service).

update public.products
set status = 'active',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'kind', 'institution_service', 'service', 'schood-teaching', 'hidden', true,
      'priced_by', '20261024210000_schood_teaching_prices')
where id = '00000000-0000-4000-8000-000000000801';

update public.plans
set amount = 149000, is_active = true,
    metadata = (coalesce(metadata, '{}'::jsonb) - 'placeholder_price') || jsonb_build_object('billing_period', 'monthly', 'display_order', 1)
where id = '00000000-0000-4000-8000-000000000811';

update public.plans
set amount = 249000, is_active = true,
    metadata = (coalesce(metadata, '{}'::jsonb) - 'placeholder_price') || jsonb_build_object('billing_period', 'monthly', 'display_order', 3)
where id = '00000000-0000-4000-8000-000000000812';

insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active, metadata) values
  ('00000000-0000-4000-8000-000000000813', '00000000-0000-4000-8000-000000000801', 'Teacher (yearly)', 1490000, 'UZS', 365, true,
   jsonb_build_object('slug', 'teaching-teacher-yearly', 'teaching_tier', 'teacher', 'billing_period', 'annual', 'display_order', 2,
     'features', jsonb_build_array('Everything in Teacher', 'Two months free'),
     'seeded_by', '20261024210000_schood_teaching_prices')),
  ('00000000-0000-4000-8000-000000000814', '00000000-0000-4000-8000-000000000801', 'Teacher Pro (yearly)', 2490000, 'UZS', 365, true,
   jsonb_build_object('slug', 'teaching-teacher-pro-yearly', 'teaching_tier', 'teacher_pro', 'billing_period', 'annual', 'display_order', 4,
     'features', jsonb_build_array('Everything in Teacher Pro', 'Two months free'),
     'seeded_by', '20261024210000_schood_teaching_prices'))
on conflict (id) do update set amount = excluded.amount, is_active = excluded.is_active, metadata = excluded.metadata;
