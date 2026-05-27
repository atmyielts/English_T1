-- Reactivate Academy as a production service and keep the legacy Teacher Studio
-- alias archived so catalog pages show one clear product.

insert into public.products (name, type, status, description, metadata)
select
  'Academy',
  'tool',
  'active',
  'Academy operations service for cohorts, classrooms, student communication, offers, payments, and sponsored access.',
  jsonb_build_object(
    'slug', 'academy',
    'app_url', 'https://academy.schood.online',
    'short_description', 'Run cohorts, classroom resources, student communication, payments, and sponsored access from one academy console.',
    'tagline', 'Operate a real academy on the Schood ecosystem.',
    'category', 'academy',
    'service_family', 'academy',
    'sort_order', 18,
    'visible', true,
    'deployed_domain', 'academy.schood.online',
    'seeded_by', '20260527120000_reactivate_academy_service'
  )
where not exists (
  select 1
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) in ('academy', 'teacher-studio')
     or lower(p.name) in ('academy', 'teacher studio')
);

with academy_products as (
  select id, name, metadata, created_at
  from public.products
  where lower(coalesce(metadata->>'slug', '')) in ('academy', 'teacher-studio')
     or lower(name) in ('academy', 'teacher studio')
),
canonical as (
  select id
  from academy_products
  order by
    case
      when lower(coalesce(metadata->>'slug', '')) = 'academy' then 0
      when lower(name) = 'academy' then 1
      else 2
    end,
    created_at nulls last,
    id
  limit 1
)
update public.products p
set
  name = 'Academy',
  type = 'tool',
  status = 'active',
  description = 'Academy operations service for cohorts, classrooms, student communication, offers, payments, and sponsored access.',
  metadata = (coalesce(p.metadata, '{}'::jsonb) - 'archived' - 'hidden') || jsonb_build_object(
    'slug', 'academy',
    'app_url', 'https://academy.schood.online',
    'short_description', 'Run cohorts, classroom resources, student communication, payments, and sponsored access from one academy console.',
    'tagline', 'Operate a real academy on the Schood ecosystem.',
    'category', 'academy',
    'service_family', 'academy',
    'sort_order', 18,
    'visible', true,
    'deployed_domain', 'academy.schood.online',
    'reactivated_by', '20260527120000_reactivate_academy_service'
  )
from canonical c
where p.id = c.id;

with academy_products as (
  select id
  from public.products
  where lower(coalesce(metadata->>'slug', '')) in ('academy', 'teacher-studio')
     or lower(name) in ('academy', 'teacher studio')
),
canonical as (
  select id
  from public.products
  where lower(coalesce(metadata->>'slug', '')) = 'academy'
    and lower(name) = 'academy'
    and status = 'active'
  order by created_at nulls last, id
  limit 1
)
update public.products p
set
  status = 'archived',
  metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object(
    'archived', true,
    'hidden', true,
    'legacy_of', 'academy',
    'archived_by', '20260527120000_reactivate_academy_service'
  )
from academy_products ap
where p.id = ap.id
  and p.id not in (select id from canonical);

with academy_product as (
  select id
  from public.products
  where lower(coalesce(metadata->>'slug', '')) = 'academy'
    and lower(name) = 'academy'
    and status = 'active'
  order by created_at nulls last, id
  limit 1
)
update public.plans pl
set
  is_active = case
    when coalesce((pl.metadata->>'placeholder_price')::boolean, false) then false
    else true
  end,
  metadata = (coalesce(pl.metadata, '{}'::jsonb) - 'archived' - 'hidden') || jsonb_build_object(
    'service_family', 'academy',
    'reactivated_by', '20260527120000_reactivate_academy_service'
  )
from academy_product ap
where pl.product_id = ap.id;

with academy_product as (
  select id
  from public.products
  where lower(coalesce(metadata->>'slug', '')) = 'academy'
    and lower(name) = 'academy'
    and status = 'active'
  order by created_at nulls last, id
  limit 1
)
insert into public.plans (product_id, name, amount, currency, duration_days, is_active, metadata)
select
  academy_product.id,
  'Academy Service Access',
  0,
  'UZS',
  30,
  false,
  jsonb_build_object(
    'slug', 'academy-service-access',
    'display_order', 1,
    'placeholder_price', true,
    'manual_quote_required', true,
    'description', 'Inactive placeholder until Academy commercial pricing is approved.',
    'features', jsonb_build_array(
      'Academy console',
      'Teacher and student workspaces',
      'Classroom resources and progress',
      'Offers, payments, and sponsored access'
    ),
    'seeded_by', '20260527120000_reactivate_academy_service'
  )
from academy_product
where not exists (
  select 1
  from public.plans pl
  where pl.product_id = academy_product.id
    and lower(coalesce(pl.metadata->>'slug', '')) = 'academy-service-access'
);

with academy_product as (
  select id
  from public.products
  where lower(coalesce(metadata->>'slug', '')) = 'academy'
    and lower(name) = 'academy'
    and status = 'active'
  order by created_at nulls last, id
  limit 1
),
en as (
  select id as language_id
  from public.languages
  where code = 'en'
  limit 1
)
insert into public.product_languages (product_id, language_id, included_in_shared_profile, metadata)
select
  academy_product.id,
  en.language_id,
  true,
  jsonb_build_object(
    'scope', 'english_shared_profile',
    'seeded_by', '20260527120000_reactivate_academy_service'
  )
from academy_product
cross join en
on conflict (product_id) do update
set
  language_id = excluded.language_id,
  included_in_shared_profile = excluded.included_in_shared_profile,
  metadata = coalesce(public.product_languages.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

alter table public.academy_classroom_resources
  drop constraint if exists academy_classroom_resources_kind_check;

alter table public.academy_classroom_resources
  add constraint academy_classroom_resources_kind_check
  check (kind in ('video', 'book', 'asset', 'link', 'assignment', 'mock', 'practice', 'playbook'));
