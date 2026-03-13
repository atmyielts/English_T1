-- Seed missing English module products so app-side product IDs are backed by DB rows.
-- Also ensure each seeded product has at least one active plan and is mapped to EN shared profile.

do $$
declare
  spec record;
  resolved_product_id uuid;
begin
  for spec in
    select *
    from (
      values
        (
          'f9c4a14b-d5a2-4a66-9cd8-5b3a0d6e7bf1'::uuid,
          'english-listening'::text,
          'English Listening'::text,
          'https://listening.english.schood.online'::text,
          'English listening practice workspace with structured audio drills and transcript-aware review.'::text,
          'Train listening accuracy and speed with focused practice sets.'::text,
          'Catch detail, intent, and structure in live-speed audio.'::text,
          41::int,
          'aa1f6ca7-96f2-44de-9803-7dba5f9ac001'::uuid,
          'Listening Monthly Access'::text,
          79000::int
        ),
        (
          '2f7c2d09-08e4-4f9f-9e8d-4f5916ef8532'::uuid,
          'english-writing'::text,
          'English Writing'::text,
          'https://writing.english.schood.online'::text,
          'English writing practice workspace with guided tasks, scoring loops, and actionable feedback.'::text,
          'Train structure, grammar, and coherence through focused writing cycles.'::text,
          'Write with clarity, control, and exam-ready structure.'::text,
          42::int,
          'aa1f6ca7-96f2-44de-9803-7dba5f9ac002'::uuid,
          'Writing Monthly Access'::text,
          79000::int
        ),
        (
          '94ac6f14-15f3-4f35-a8a2-01f5aaecf66d'::uuid,
          'english-speaking'::text,
          'English Speaking'::text,
          'https://speaking.english.schood.online'::text,
          'English speaking practice workspace for fluency, pronunciation, and confidence growth.'::text,
          'Practice speaking responses with structured prompts and review.'::text,
          'Speak with smoother pacing and stronger response control.'::text,
          43::int,
          'aa1f6ca7-96f2-44de-9803-7dba5f9ac003'::uuid,
          'Speaking Monthly Access'::text,
          79000::int
        ),
        (
          '6c4f0566-6f50-4fb4-b176-c4397ecb8ec5'::uuid,
          'english-grammar'::text,
          'English Grammar'::text,
          'https://grammar.english.schood.online'::text,
          'English grammar practice workspace with targeted correction loops and rule-based drills.'::text,
          'Strengthen sentence accuracy with focused grammar routines.'::text,
          'Reduce recurring errors and stabilize language control.'::text,
          44::int,
          'aa1f6ca7-96f2-44de-9803-7dba5f9ac004'::uuid,
          'Grammar Monthly Access'::text,
          79000::int
        ),
        (
          'b1c98e87-84d3-4ddc-8f07-c72bcf7a716a'::uuid,
          'english-vocabulary'::text,
          'English Vocabulary'::text,
          'https://vocabulary.english.schood.online'::text,
          'English vocabulary practice workspace for lexical range, collocations, and recall training.'::text,
          'Build useful vocabulary with context-rich repetition and tracking.'::text,
          'Grow lexical range that transfers to all English modules.'::text,
          45::int,
          'aa1f6ca7-96f2-44de-9803-7dba5f9ac005'::uuid,
          'Vocabulary Monthly Access'::text,
          79000::int
        ),
        (
          '7ce43052-2f35-42ca-b305-0d9c358f73f0'::uuid,
          'english-immersion'::text,
          'English Immersion'::text,
          'https://immersion.english.schood.online'::text,
          'English immersion workspace with daily exposure practice for retention and transfer.'::text,
          'Stay in contact with English daily through guided immersion loops.'::text,
          'Turn passive exposure into active language retention.'::text,
          46::int,
          'aa1f6ca7-96f2-44de-9803-7dba5f9ac006'::uuid,
          'Immersion Monthly Access'::text,
          79000::int
        )
    ) as seeded(
      product_id,
      slug,
      name,
      app_url,
      description,
      short_description,
      tagline,
      sort_order,
      monthly_plan_id,
      monthly_plan_name,
      monthly_amount
    )
  loop
    select p.id
    into resolved_product_id
    from public.products p
    where lower(coalesce(p.metadata->>'slug', '')) = spec.slug
       or lower(p.name) = lower(spec.name)
    order by case when p.id = spec.product_id then 0 else 1 end, p.created_at asc
    limit 1;

    if resolved_product_id is null then
      insert into public.products (id, name, type, status, description, metadata)
      values (
        spec.product_id,
        spec.name,
        'course',
        'active',
        spec.description,
        jsonb_build_object(
          'slug', spec.slug,
          'app_url', spec.app_url,
          'short_description', spec.short_description,
          'tagline', spec.tagline,
          'sort_order', spec.sort_order
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
        name = spec.name,
        type = 'course',
        status = 'active',
        description = coalesce(nullif(description, ''), spec.description),
        metadata =
          coalesce(metadata, '{}'::jsonb)
          || jsonb_build_object(
            'slug', coalesce(nullif(coalesce(metadata, '{}'::jsonb)->>'slug', ''), spec.slug),
            'app_url', coalesce(nullif(coalesce(metadata, '{}'::jsonb)->>'app_url', ''), spec.app_url),
            'short_description', coalesce(
              nullif(coalesce(metadata, '{}'::jsonb)->>'short_description', ''),
              spec.short_description
            ),
            'tagline', coalesce(
              nullif(coalesce(metadata, '{}'::jsonb)->>'tagline', ''),
              spec.tagline
            ),
            'sort_order', coalesce(
              (
                case when coalesce(metadata, '{}'::jsonb)->>'sort_order' ~ '^\d+$'
                  then ((coalesce(metadata, '{}'::jsonb)->>'sort_order')::int)::numeric
                  else null
                end
              ),
              spec.sort_order
            )
          )
      where id = resolved_product_id;
    end if;

    insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active, metadata)
    values (
      spec.monthly_plan_id,
      resolved_product_id,
      spec.monthly_plan_name,
      spec.monthly_amount,
      'UZS',
      30,
      true,
      jsonb_build_object(
        'display_order', 1,
        'recommended', true,
        'tagline', 'Best for consistent improvement',
        'description', format('Full %s workflow, progress analytics, and continuous practice access.', lower(spec.name)),
        'features', jsonb_build_array(
          format('%s focused drills', spec.name),
          'Performance tracking',
          'Unified English profile signals'
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
  end loop;
end
$$;

insert into public.languages (code, name, status, metadata)
values (
  'en',
  'English',
  'active',
  jsonb_build_object(
    'is_default', true,
    'seeded_by', '20260313120000_seed_remaining_english_products'
  )
)
on conflict (code) do update
set
  name = excluded.name,
  status = excluded.status,
  metadata = coalesce(public.languages.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

with en as (
  select id as language_id
  from public.languages
  where code = 'en'
  limit 1
),
english_products as (
  select p.id as product_id
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) in (
    'english-reading',
    'english-listening',
    'english-writing',
    'english-speaking',
    'english-grammar',
    'english-vocabulary',
    'english-immersion'
  )
)
insert into public.product_languages (
  product_id,
  language_id,
  included_in_shared_profile,
  metadata
)
select
  ep.product_id,
  en.language_id,
  true,
  jsonb_build_object(
    'seeded_by', '20260313120000_seed_remaining_english_products',
    'scope', 'english_shared_profile'
  )
from english_products ep
cross join en
on conflict (product_id) do update
set
  language_id = excluded.language_id,
  included_in_shared_profile = excluded.included_in_shared_profile,
  metadata = coalesce(public.product_languages.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();
