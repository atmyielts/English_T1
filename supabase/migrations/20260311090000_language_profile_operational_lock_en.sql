-- ============================================================================
-- English language profile operational lock
-- ----------------------------------------------------------------------------
-- 1) Lock product-language mappings for current English services.
-- 2) Ensure SAT is mapped but excluded from shared English profile.
-- 3) Seed baseline English signal weights for all target skills.
-- 4) Re-run idempotent backfill + profile rebuild.
-- 5) Emit validation notices for rollout checks.
-- ============================================================================

insert into public.languages (code, name, status, metadata)
values (
  'en',
  'English',
  'active',
  jsonb_build_object(
    'is_default', true,
    'seeded_by', '20260311090000_language_profile_operational_lock_en'
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
  where
    p.id in (
      'ead05eae-aa97-4bda-a07c-51e5dbb062c0'::uuid, -- IELTS
      'b262ffa8-9912-4eba-93d7-58af3164d1cc'::uuid, -- TOEFL iBT
      '0e8ad198-6284-4406-9e07-11ba7da0f42d'::uuid  -- English Reading
    )
    or lower(coalesce(p.metadata->>'slug', '')) in (
      'ielts-academic-simulator',
      'toefl-ibt-simulator',
      'english-reading',
      'english-listening',
      'english-writing',
      'english-speaking',
      'english-grammar',
      'english-immersion',
      'english-vocabulary'
    )
    or lower(coalesce(p.name, '')) in (
      'ielts academic simulator',
      'toefl ibt simulator',
      'english reading',
      'english listening',
      'english writing',
      'english speaking',
      'english grammar',
      'english immersion',
      'english vocabulary'
    )
),
non_sat_english_products as (
  select ep.product_id
  from english_products ep
  join public.products p on p.id = ep.product_id
  where
    ep.product_id <> '5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef'::uuid
    and lower(coalesce(p.metadata->>'slug', '')) <> 'sat-exam-simulator'
    and lower(coalesce(p.name, '')) not like '%sat%'
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
    'seeded_by', '20260311090000_language_profile_operational_lock_en',
    'scope', 'english_shared_profile'
  )
from non_sat_english_products ep
cross join en
on conflict (product_id) do update
set
  language_id = excluded.language_id,
  included_in_shared_profile = excluded.included_in_shared_profile,
  metadata = coalesce(public.product_languages.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

with en as (
  select id as language_id
  from public.languages
  where code = 'en'
  limit 1
),
sat_products as (
  select p.id as product_id
  from public.products p
  where
    p.id = '5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef'::uuid
    or lower(coalesce(p.metadata->>'slug', '')) = 'sat-exam-simulator'
    or lower(coalesce(p.name, '')) like '%sat%'
)
insert into public.product_languages (
  product_id,
  language_id,
  included_in_shared_profile,
  metadata
)
select
  sp.product_id,
  en.language_id,
  false,
  jsonb_build_object(
    'seeded_by', '20260311090000_language_profile_operational_lock_en',
    'scope', 'excluded_from_english_shared_profile'
  )
from sat_products sp
cross join en
on conflict (product_id) do update
set
  language_id = excluded.language_id,
  included_in_shared_profile = excluded.included_in_shared_profile,
  metadata = coalesce(public.product_languages.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

with en as (
  select id as language_id
  from public.languages
  where code = 'en'
  limit 1
)
insert into public.language_signal_weights (
  language_id,
  source_type,
  skill_key,
  metric_key,
  weight,
  max_age_days,
  half_life_days,
  metadata
)
select
  en.language_id,
  cfg.source_type,
  cfg.skill_key,
  cfg.metric_key,
  cfg.weight,
  cfg.max_age_days,
  cfg.half_life_days,
  jsonb_build_object(
    'seeded_by', '20260311090000_language_profile_operational_lock_en',
    'phase', 'english_baseline_weights'
  )
from en
cross join (
  values
    ('*'::text, '*'::text, '*'::text, 1.00::numeric, null::integer, null::integer),
    ('score-session.auto'::text, 'reading'::text, '*'::text, 1.15::numeric, null::integer, 180::integer),
    ('score-session.auto'::text, 'listening'::text, '*'::text, 1.15::numeric, null::integer, 180::integer),
    ('score-session.auto'::text, 'writing'::text, '*'::text, 1.10::numeric, null::integer, 180::integer),
    ('score-session.auto'::text, 'speaking'::text, '*'::text, 1.10::numeric, null::integer, 180::integer),
    ('exam.result'::text, 'reading'::text, '*'::text, 1.15::numeric, null::integer, 180::integer),
    ('exam.result'::text, 'listening'::text, '*'::text, 1.15::numeric, null::integer, 180::integer),
    ('exam.result'::text, 'writing'::text, '*'::text, 1.10::numeric, null::integer, 180::integer),
    ('exam.result'::text, 'speaking'::text, '*'::text, 1.10::numeric, null::integer, 180::integer),
    ('grade-writing.ai'::text, 'writing'::text, '*'::text, 1.20::numeric, null::integer, 120::integer),
    ('grade-writing.ai'::text, 'grammar'::text, '*'::text, 1.15::numeric, null::integer, 120::integer),
    ('grade-writing.ai'::text, 'vocabulary'::text, '*'::text, 1.15::numeric, null::integer, 120::integer),
    ('language.signal.v1'::text, 'reading'::text, '*'::text, 1.05::numeric, null::integer, 120::integer),
    ('language.signal.v1'::text, 'listening'::text, '*'::text, 1.05::numeric, null::integer, 120::integer),
    ('language.signal.v1'::text, 'writing'::text, '*'::text, 1.10::numeric, null::integer, 120::integer),
    ('language.signal.v1'::text, 'speaking'::text, '*'::text, 1.10::numeric, null::integer, 120::integer),
    ('language.signal.v1'::text, 'grammar'::text, '*'::text, 1.10::numeric, null::integer, 120::integer),
    ('language.signal.v1'::text, 'vocabulary'::text, '*'::text, 1.10::numeric, null::integer, 120::integer),
    ('language.signal.v1'::text, 'immersion'::text, '*'::text, 1.05::numeric, null::integer, 90::integer)
) as cfg(source_type, skill_key, metric_key, weight, max_age_days, half_life_days)
on conflict (language_id, source_type, skill_key, metric_key) do update
set
  weight = excluded.weight,
  max_age_days = excluded.max_age_days,
  half_life_days = excluded.half_life_days,
  metadata = coalesce(public.language_signal_weights.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

do $$
declare
  v_en_id uuid;
  v_backfilled integer := 0;
  v_rebuilt integer := 0;
  v_english_mapped integer := 0;
  v_sat_mapped integer := 0;
  v_sat_included integer := 0;
  v_sat_signals_total integer := 0;
  v_sat_signals_included integer := 0;
  v_users_both integer := 0;
  v_users_both_missing_profiles integer := 0;
begin
  select id into v_en_id
  from public.languages
  where code = 'en'
  limit 1;

  if v_en_id is null then
    raise exception 'English language (code=en) not found';
  end if;

  select public.backfill_language_signals_from_exam_outcomes(null) into v_backfilled;
  select public.rebuild_all_learner_language_profiles(v_en_id, null) into v_rebuilt;

  with english_products as (
    select p.id as product_id
    from public.products p
    where
      p.id in (
        'ead05eae-aa97-4bda-a07c-51e5dbb062c0'::uuid,
        'b262ffa8-9912-4eba-93d7-58af3164d1cc'::uuid,
        '0e8ad198-6284-4406-9e07-11ba7da0f42d'::uuid
      )
      or lower(coalesce(p.metadata->>'slug', '')) in (
        'ielts-academic-simulator',
        'toefl-ibt-simulator',
        'english-reading',
        'english-listening',
        'english-writing',
        'english-speaking',
        'english-grammar',
        'english-immersion',
        'english-vocabulary'
      )
  )
  select count(*)
  into v_english_mapped
  from english_products ep
  join public.product_languages pl on pl.product_id = ep.product_id
  where pl.language_id = v_en_id
    and pl.included_in_shared_profile = true;

  with sat_products as (
    select p.id as product_id
    from public.products p
    where
      p.id = '5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef'::uuid
      or lower(coalesce(p.metadata->>'slug', '')) = 'sat-exam-simulator'
      or lower(coalesce(p.name, '')) like '%sat%'
  )
  select
    count(*) filter (where pl.product_id is not null),
    count(*) filter (where pl.included_in_shared_profile = true)
  into
    v_sat_mapped,
    v_sat_included
  from sat_products sp
  left join public.product_languages pl on pl.product_id = sp.product_id;

  with sat_products as (
    select p.id as product_id
    from public.products p
    where
      p.id = '5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef'::uuid
      or lower(coalesce(p.metadata->>'slug', '')) = 'sat-exam-simulator'
      or lower(coalesce(p.name, '')) like '%sat%'
  )
  select
    count(*),
    count(*) filter (where coalesce(pl.included_in_shared_profile, false) = true)
  into
    v_sat_signals_total,
    v_sat_signals_included
  from public.language_signals ls
  join sat_products sp on sp.product_id = ls.product_id
  left join public.product_languages pl on pl.product_id = ls.product_id;

  with
  ielts_products as (
    select p.id as product_id
    from public.products p
    where
      p.id = 'ead05eae-aa97-4bda-a07c-51e5dbb062c0'::uuid
      or lower(coalesce(p.metadata->>'slug', '')) = 'ielts-academic-simulator'
  ),
  toefl_products as (
    select p.id as product_id
    from public.products p
    where
      p.id = 'b262ffa8-9912-4eba-93d7-58af3164d1cc'::uuid
      or lower(coalesce(p.metadata->>'slug', '')) = 'toefl-ibt-simulator'
  ),
  users_both as (
    select eo.user_id
    from public.exam_outcomes eo
    group by eo.user_id
    having
      bool_or(eo.product_id in (select product_id from ielts_products))
      and bool_or(eo.product_id in (select product_id from toefl_products))
  )
  select count(*) into v_users_both
  from users_both;

  with
  ielts_products as (
    select p.id as product_id
    from public.products p
    where
      p.id = 'ead05eae-aa97-4bda-a07c-51e5dbb062c0'::uuid
      or lower(coalesce(p.metadata->>'slug', '')) = 'ielts-academic-simulator'
  ),
  toefl_products as (
    select p.id as product_id
    from public.products p
    where
      p.id = 'b262ffa8-9912-4eba-93d7-58af3164d1cc'::uuid
      or lower(coalesce(p.metadata->>'slug', '')) = 'toefl-ibt-simulator'
  ),
  users_both as (
    select eo.user_id
    from public.exam_outcomes eo
    group by eo.user_id
    having
      bool_or(eo.product_id in (select product_id from ielts_products))
      and bool_or(eo.product_id in (select product_id from toefl_products))
  )
  select count(*)
  into v_users_both_missing_profiles
  from users_both ub
  left join public.learner_language_profiles llp
    on llp.user_id = ub.user_id
   and llp.language_id = v_en_id
  where llp.user_id is null;

  raise notice 'Language profile EN lock complete | backfilled=% | rebuilt=%', v_backfilled, v_rebuilt;
  raise notice 'EN shared mappings=% | SAT mapped=% | SAT included=%', v_english_mapped, v_sat_mapped, v_sat_included;
  raise notice 'SAT signals total=% | SAT signals contributing_to_shared=%', v_sat_signals_total, v_sat_signals_included;
  raise notice 'Users with both IELTS+TOEFL outcomes=% | missing EN profiles=%', v_users_both, v_users_both_missing_profiles;

  if v_sat_included > 0 then
    raise exception 'SAT product(s) are incorrectly included in shared English profile';
  end if;

  if v_sat_signals_included > 0 then
    raise exception 'SAT signals are contributing to shared profiles';
  end if;
end
$$;

