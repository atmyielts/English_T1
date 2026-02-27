-- Archive Academy products from user-facing listings while preserving data for future reactivation.
with academy_products as (
  select id
  from public.products
  where lower(coalesce(metadata->>'slug', '')) in ('academy', 'teacher-studio')
     or lower(name) in ('academy', 'teacher studio')
)
update public.products p
set
  status = 'archived',
  metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object('archived', true)
from academy_products ap
where p.id = ap.id;

-- Deactivate plans for archived Academy products so they are not purchasable.
update public.plans pl
set is_active = false
where exists (
  select 1
  from public.products p
  where p.id = pl.product_id
    and p.status = 'archived'
    and (
      lower(coalesce(p.metadata->>'slug', '')) in ('academy', 'teacher-studio')
      or lower(p.name) in ('academy', 'teacher studio')
    )
);
