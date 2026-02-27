-- Archive seed/demo data before production deployment.
-- Safe to run multiple times.

begin;

-- Hide the two seeded IELTS demo experiences from learner/admin lists.
update public.experiences
set
  is_active = false,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'archived_seed_example', true,
    'archived_at', now()
  )
where id in (
  '33333333-3333-3333-3333-333333333333'::uuid,
  '77777777-7777-7777-7777-777777777777'::uuid
);

-- Deactivate seed plan presets that were created by bootstrap migrations.
-- Keep rows for historical payment references; only disable new purchases.
update public.plans
set
  is_active = false,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'archived_seed_example', true,
    'archived_at', now()
  )
where name in ('Starter', 'Monthly Access', 'All-Access Bundle')
  and coalesce(metadata->>'tagline', '') in (
    'Short practice sprint',
    'Best for steady progress',
    'Unlock multiple services'
  );

commit;
