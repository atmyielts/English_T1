-- Link Academy tenant workspaces to Education Center tenants without merging the
-- two services. Centers stay the business layer; academies stay delivery units.

update public.tenants t
set metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
  'service_family', 'academy',
  'academy_service', true,
  'metadata_backfilled_by', '20260528103000_link_center_owned_academies'
)
where t.type = 'team'
  and coalesce(t.metadata->>'service_family', '') = ''
  and (
    exists (select 1 from public.academy_contacts c where c.academy_id = t.id)
    or exists (select 1 from public.academy_classrooms c where c.academy_id = t.id)
    or exists (select 1 from public.academy_offers o where o.academy_id = t.id)
    or exists (select 1 from public.academy_entitlements e where e.academy_id = t.id)
  );

create index if not exists tenants_service_family_idx
on public.tenants ((metadata->>'service_family'));

create index if not exists tenants_academy_parent_center_idx
on public.tenants ((metadata->>'parent_center_id'))
where metadata->>'service_family' = 'academy';
