-- Replace placeholder IELTS product UUID with a real UUID and remap references.
-- This keeps URLs/admin data cleaner while preserving all existing relations.

do $$
declare
  old_product constant uuid := '11111111-1111-1111-1111-111111111111';
  new_product constant uuid := 'ead05eae-aa97-4bda-a07c-51e5dbb062c0';
  ref_table record;
begin
  if not exists (select 1 from public.products where id = old_product) then
    return;
  end if;

  if not exists (select 1 from public.products where id = new_product) then
    insert into public.products (id, name, type, status, description, metadata, created_at)
    select
      new_product,
      p.name,
      p.type,
      p.status,
      p.description,
      coalesce(p.metadata, '{}'::jsonb),
      p.created_at
    from public.products p
    where p.id = old_product;
  end if;

  -- Ensure a stable slug for product param routing.
  update public.products
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'slug',
    coalesce(nullif(coalesce(metadata, '{}'::jsonb)->>'slug', ''), 'ielts-academic-simulator')
  )
  where id = new_product;

  -- Move all uuid product_id references automatically.
  for ref_table in
    select table_schema, table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'product_id'
      and udt_name = 'uuid'
  loop
    execute format(
      'update %I.%I set product_id = $1 where product_id = $2',
      ref_table.table_schema,
      ref_table.table_name
    )
    using new_product, old_product;
  end loop;

  -- Keep product entitlements consistent.
  update public.entitlements
  set resource_id = new_product
  where resource_type = 'product'
    and resource_id = old_product;

  -- Keep trial grants aligned.
  update public.platform_settings
  set trial_resource_id = new_product
  where trial_resource_id = old_product;

  -- Remap bundle metadata references where present.
  update public.plans
  set metadata = jsonb_set(
    coalesce(metadata, '{}'::jsonb),
    '{included_product_ids}',
    (
      select coalesce(
        jsonb_agg(to_jsonb(case when elem = old_product::text then new_product::text else elem end)),
        '[]'::jsonb
      )
      from jsonb_array_elements_text(coalesce(metadata->'included_product_ids', '[]'::jsonb)) as t(elem)
    ),
    true
  )
  where coalesce(metadata->'included_product_ids', '[]'::jsonb) @> jsonb_build_array(old_product::text);

  -- Remove the placeholder product row after references are moved.
  delete from public.products where id = old_product;
end $$;
