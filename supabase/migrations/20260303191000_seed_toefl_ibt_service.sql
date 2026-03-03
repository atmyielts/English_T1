-- Seed TOEFL iBT simulator product and pricing plans.

do $$
declare
  target_product_id constant uuid := 'b262ffa8-9912-4eba-93d7-58af3164d1cc';
  starter_plan_id constant uuid := 'c0c63289-666c-4a78-9247-ba454da86cba';
  monthly_plan_id constant uuid := 'd112f584-1167-48bf-b7c6-f90174bc9d57';
  resolved_product_id uuid;
begin
  select p.id
  into resolved_product_id
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) = 'toefl-ibt-simulator'
     or lower(p.name) = 'toefl ibt simulator'
  order by case when p.id = target_product_id then 0 else 1 end, p.created_at asc
  limit 1;

  if resolved_product_id is null then
    insert into public.products (id, name, type, status, description, metadata)
    values (
      target_product_id,
      'TOEFL iBT Simulator',
      'exam',
      'active',
      'TOEFL iBT preparation service with integrated skill practice and full simulation flow.',
      jsonb_build_object(
        'slug', 'toefl-ibt-simulator',
        'app_url', 'https://toefl.schood.online',
        'short_description', 'Practice Reading, Listening, Speaking, and Writing with realistic pacing.',
        'tagline', 'Warm, structured TOEFL iBT preparation workspace.',
        'sort_order', 35
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
      name = 'TOEFL iBT Simulator',
      type = 'exam',
      status = 'active',
      description = coalesce(
        nullif(description, ''),
        'TOEFL iBT preparation service with integrated skill practice and full simulation flow.'
      ),
      metadata =
        coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'slug', coalesce(nullif(coalesce(metadata, '{}'::jsonb)->>'slug', ''), 'toefl-ibt-simulator'),
          'app_url', coalesce(nullif(coalesce(metadata, '{}'::jsonb)->>'app_url', ''), 'https://toefl.schood.online'),
          'short_description', coalesce(
            nullif(coalesce(metadata, '{}'::jsonb)->>'short_description', ''),
            'Practice Reading, Listening, Speaking, and Writing with realistic pacing.'
          ),
          'tagline', coalesce(
            nullif(coalesce(metadata, '{}'::jsonb)->>'tagline', ''),
            'Warm, structured TOEFL iBT preparation workspace.'
          ),
          'sort_order', coalesce(
            (case when coalesce(metadata, '{}'::jsonb)->>'sort_order' ~ '^\d+$'
              then ((coalesce(metadata, '{}'::jsonb)->>'sort_order')::int)::numeric
              else null
            end),
            35
          )
        )
    where id = resolved_product_id;
  end if;

  insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active, metadata)
  values (
    starter_plan_id,
    resolved_product_id,
    'TOEFL Starter',
    49000,
    'UZS',
    14,
    true,
    jsonb_build_object(
      'display_order', 1,
      'tagline', 'Two-week TOEFL setup',
      'description', 'Focused TOEFL skill practice for a short preparation sprint.',
      'features', jsonb_build_array(
        'Reading and Listening drills',
        'Integrated writing starter tasks',
        'Speaking response templates'
      ),
      'limits', jsonb_build_object(
        'section_practice', 90,
        'writing_submissions', 20
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
    'TOEFL Monthly Access',
    119000,
    'UZS',
    30,
    true,
    jsonb_build_object(
      'display_order', 2,
      'recommended', true,
      'tagline', 'Best for full band growth',
      'description', 'Continuous TOEFL iBT preparation across all four skills.',
      'features', jsonb_build_array(
        'Full skill-track dashboard',
        'Reading + Listening + Speaking + Writing flow',
        'Progress tracking and review'
      ),
      'limits', jsonb_build_object(
        'section_practice', 300,
        'writing_submissions', 120
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
