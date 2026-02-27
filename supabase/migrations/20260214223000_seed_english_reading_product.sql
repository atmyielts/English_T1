-- Seed English Reading product and plans for unified platform pricing/auth flow.

do $$
declare
  target_product_id constant uuid := '0e8ad198-6284-4406-9e07-11ba7da0f42d';
  starter_plan_id constant uuid := '62a647dc-1f9c-42d5-9306-09a2511b75a7';
  monthly_plan_id constant uuid := 'e77514a8-887b-4911-8ffb-6b5e63b6d577';
  resolved_product_id uuid;
begin
  select p.id
  into resolved_product_id
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) = 'english-reading'
     or lower(p.name) = 'english reading'
  order by case when p.id = target_product_id then 0 else 1 end, p.created_at asc
  limit 1;

  if resolved_product_id is null then
    insert into public.products (id, name, type, status, description, metadata)
    values (
      target_product_id,
      'English Reading',
      'course',
      'active',
      'English reading practice workspace with structured lessons and progress tracking.',
      jsonb_build_object(
        'slug', 'english-reading',
        'app_url', 'https://reading.english.schood.online',
        'short_description', 'English reading practice workspace with daily drills and class tracking.',
        'tagline', 'Vocabulary, speed, and comprehension in one workspace.',
        'sort_order', 40
      )
    )
    on conflict (id) do update
    set
      name = excluded.name,
      type = excluded.type,
      status = excluded.status,
      description = excluded.description,
      metadata = coalesce(public.products.metadata, '{}'::jsonb) || excluded.metadata
    returning id into resolved_product_id;
  else
    update public.products
    set
      name = 'English Reading',
      type = 'course',
      status = 'active',
      description = coalesce(
        nullif(description, ''),
        'English reading practice workspace with structured lessons and progress tracking.'
      ),
      metadata =
        coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'slug', coalesce(nullif(coalesce(metadata, '{}'::jsonb)->>'slug', ''), 'english-reading'),
          'app_url', coalesce(nullif(coalesce(metadata, '{}'::jsonb)->>'app_url', ''), 'https://reading.english.schood.online'),
          'short_description', coalesce(
            nullif(coalesce(metadata, '{}'::jsonb)->>'short_description', ''),
            'English reading practice workspace with daily drills and class tracking.'
          ),
          'tagline', coalesce(
            nullif(coalesce(metadata, '{}'::jsonb)->>'tagline', ''),
            'Vocabulary, speed, and comprehension in one workspace.'
          ),
          'sort_order', coalesce(
            (case when coalesce(metadata, '{}'::jsonb)->>'sort_order' ~ '^\d+$'
              then ((coalesce(metadata, '{}'::jsonb)->>'sort_order')::int)::numeric
              else null
            end),
            40
          )
        )
    where id = resolved_product_id;
  end if;

  insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active, metadata)
  values (
    starter_plan_id,
    resolved_product_id,
    'Starter',
    29000,
    'UZS',
    14,
    true,
    jsonb_build_object(
      'display_order', 1,
      'tagline', 'Kickstart your reading routine',
      'description', 'Two weeks of guided reading drills and performance tracking.',
      'features', jsonb_build_array(
        'Daily reading sets',
        'Progress dashboard',
        'Community and task board'
      ),
      'limits', jsonb_build_object(
        'section_practice', 40,
        'writing_submissions', 0
      )
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

  insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active, metadata)
  values (
    monthly_plan_id,
    resolved_product_id,
    'Monthly Access',
    79000,
    'UZS',
    30,
    true,
    jsonb_build_object(
      'display_order', 2,
      'recommended', true,
      'tagline', 'Best for consistent improvement',
      'description', 'Full reading workflow, progress analytics, and unlimited lesson navigation.',
      'features', jsonb_build_array(
        'Unlimited reading sets',
        'Performance report tracking',
        'Classroom and community access'
      ),
      'limits', jsonb_build_object(
        'section_practice', 180,
        'writing_submissions', 0
      )
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
end $$;
