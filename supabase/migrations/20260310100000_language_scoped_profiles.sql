-- ============================================================================
-- Language-scoped shared personalization (English-first, multi-language ready)
-- ----------------------------------------------------------------------------
-- Adds first-class language modeling, canonical language signals, shared
-- learner language profiles, DB guardrails, and one-time historical backfill.
-- ============================================================================

create table if not exists public.languages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status text not null default 'active'
    check (status in ('draft', 'active', 'disabled', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists languages_status_idx on public.languages(status);

drop trigger if exists languages_updated_at on public.languages;
create trigger languages_updated_at
before update on public.languages
for each row
execute procedure public.handle_user_updated_at();

alter table public.languages enable row level security;

drop policy if exists "Languages select authenticated" on public.languages;
create policy "Languages select authenticated"
on public.languages
for select
using (auth.role() = 'authenticated');

drop policy if exists "Languages mutate admin" on public.languages;
create policy "Languages mutate admin"
on public.languages
for all
using (public.is_admin())
with check (public.is_admin());

insert into public.languages (code, name, status, metadata)
values ('en', 'English', 'active', jsonb_build_object('is_default', true))
on conflict (code) do update
set
  name = excluded.name,
  status = excluded.status,
  metadata = coalesce(public.languages.metadata, '{}'::jsonb) || excluded.metadata;

create table if not exists public.product_languages (
  product_id uuid primary key references public.products(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete restrict,
  included_in_shared_profile boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_languages_language_idx
  on public.product_languages(language_id, included_in_shared_profile, updated_at desc);

drop trigger if exists product_languages_updated_at on public.product_languages;
create trigger product_languages_updated_at
before update on public.product_languages
for each row
execute procedure public.handle_user_updated_at();

alter table public.product_languages enable row level security;

drop policy if exists "Product languages select authenticated" on public.product_languages;
create policy "Product languages select authenticated"
on public.product_languages
for select
using (auth.role() = 'authenticated');

drop policy if exists "Product languages mutate admin" on public.product_languages;
create policy "Product languages mutate admin"
on public.product_languages
for all
using (public.is_admin())
with check (public.is_admin());

create table if not exists public.language_signal_weights (
  language_id uuid not null references public.languages(id) on delete cascade,
  source_type text not null default '*',
  skill_key text not null default '*',
  metric_key text not null default '*',
  weight numeric not null default 1,
  max_age_days integer,
  half_life_days integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (language_id, source_type, skill_key, metric_key),
  constraint language_signal_weights_weight_positive check (weight > 0),
  constraint language_signal_weights_max_age_positive check (max_age_days is null or max_age_days > 0),
  constraint language_signal_weights_half_life_positive check (half_life_days is null or half_life_days > 0)
);

create index if not exists language_signal_weights_language_idx
  on public.language_signal_weights(language_id, updated_at desc);

drop trigger if exists language_signal_weights_updated_at on public.language_signal_weights;
create trigger language_signal_weights_updated_at
before update on public.language_signal_weights
for each row
execute procedure public.handle_user_updated_at();

alter table public.language_signal_weights enable row level security;

drop policy if exists "Language signal weights select admin" on public.language_signal_weights;
create policy "Language signal weights select admin"
on public.language_signal_weights
for select
using (public.is_admin());

drop policy if exists "Language signal weights mutate admin" on public.language_signal_weights;
create policy "Language signal weights mutate admin"
on public.language_signal_weights
for all
using (public.is_admin())
with check (public.is_admin());

create table if not exists public.language_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,

  source_type text not null,
  skill_key text not null,
  metric_key text not null,
  metric_value numeric not null,
  confidence numeric not null default 1,

  occurred_at timestamptz not null,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint language_signals_confidence_range check (confidence >= 0 and confidence <= 1)
);

create index if not exists language_signals_user_language_idx
  on public.language_signals(user_id, language_id, occurred_at desc);

create index if not exists language_signals_language_product_idx
  on public.language_signals(language_id, product_id, occurred_at desc);

create index if not exists language_signals_source_skill_metric_idx
  on public.language_signals(language_id, source_type, skill_key, metric_key, occurred_at desc);

create or replace function public.enforce_language_signal_product_mapping()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_language_id uuid;
begin
  select pl.language_id
  into v_language_id
  from public.product_languages pl
  where pl.product_id = new.product_id;

  if v_language_id is null then
    raise exception using
      errcode = '23514',
      message = format('Product %s is not mapped to any language', new.product_id);
  end if;

  if v_language_id <> new.language_id then
    raise exception using
      errcode = '23514',
      message = format('Language mismatch for product %s (expected %s, got %s)', new.product_id, v_language_id, new.language_id);
  end if;

  return new;
end;
$$;

drop trigger if exists language_signals_product_language_guard on public.language_signals;
create trigger language_signals_product_language_guard
before insert or update of product_id, language_id
on public.language_signals
for each row
execute procedure public.enforce_language_signal_product_mapping();

alter table public.language_signals enable row level security;

drop policy if exists "Language signals select own" on public.language_signals;
create policy "Language signals select own"
on public.language_signals
for select
using (auth.uid() = user_id);

drop policy if exists "Language signals select admin" on public.language_signals;
create policy "Language signals select admin"
on public.language_signals
for select
using (public.is_admin());

create table if not exists public.learner_language_profiles (
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,

  schema_version text not null default 'language-profile.v1',
  signals_count integer not null default 0,
  sessions_count integer not null default 0,

  profile jsonb not null default '{}'::jsonb,
  service_breakdown jsonb not null default '{}'::jsonb,

  latest_signal_at timestamptz,
  latest_event_id uuid references public.domain_event_outbox(id) on delete set null,
  latest_event_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, language_id)
);

create index if not exists learner_language_profiles_language_idx
  on public.learner_language_profiles(language_id, updated_at desc);

create index if not exists learner_language_profiles_user_idx
  on public.learner_language_profiles(user_id, updated_at desc);

drop trigger if exists learner_language_profiles_updated_at on public.learner_language_profiles;
create trigger learner_language_profiles_updated_at
before update on public.learner_language_profiles
for each row
execute procedure public.handle_user_updated_at();

alter table public.learner_language_profiles enable row level security;

drop policy if exists "Learner language profiles select own" on public.learner_language_profiles;
create policy "Learner language profiles select own"
on public.learner_language_profiles
for select
using (auth.uid() = user_id);

drop policy if exists "Learner language profiles select admin" on public.learner_language_profiles;
create policy "Learner language profiles select admin"
on public.learner_language_profiles
for select
using (public.is_admin());

create table if not exists public.learner_language_profile_events (
  event_id uuid primary key references public.domain_event_outbox(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  language_id uuid not null references public.languages(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists learner_language_profile_events_user_language_idx
  on public.learner_language_profile_events(user_id, language_id, occurred_at desc);

alter table public.learner_language_profile_events enable row level security;

drop policy if exists "Learner language profile events select admin" on public.learner_language_profile_events;
create policy "Learner language profile events select admin"
on public.learner_language_profile_events
for select
using (public.is_admin());

create or replace function public.recompute_learner_language_profile(
  p_user_id uuid,
  p_language_id uuid,
  p_latest_event_id uuid default null,
  p_latest_event_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signals_count integer := 0;
  v_sessions_count integer := 0;
  v_latest_signal_at timestamptz := null;
  v_profile jsonb := '{}'::jsonb;
  v_service_breakdown jsonb := '{}'::jsonb;
begin
  if p_user_id is null or p_language_id is null then
    raise exception 'p_user_id and p_language_id are required';
  end if;

  with scoped as (
    select
      s.user_id,
      s.language_id,
      s.source_type,
      s.skill_key,
      s.metric_key,
      s.metric_value,
      s.confidence,
      s.occurred_at,
      s.session_id,
      coalesce(w.weight, 1::numeric) as cfg_weight,
      w.max_age_days,
      w.half_life_days
    from public.language_signals s
    join public.product_languages pl
      on pl.product_id = s.product_id
     and pl.included_in_shared_profile = true
    left join lateral (
      select
        lw.weight,
        lw.max_age_days,
        lw.half_life_days
      from public.language_signal_weights lw
      where lw.language_id = s.language_id
        and lw.source_type in (s.source_type, '*')
        and lw.skill_key in (s.skill_key, '*')
        and lw.metric_key in (s.metric_key, '*')
      order by
        case when lw.source_type = s.source_type then 0 else 1 end,
        case when lw.skill_key = s.skill_key then 0 else 1 end,
        case when lw.metric_key = s.metric_key then 0 else 1 end,
        lw.updated_at desc
      limit 1
    ) w on true
    where s.user_id = p_user_id
      and s.language_id = p_language_id
  ),
  weighted as (
    select
      scoped.*,
      greatest(0::numeric, least(1::numeric, coalesce(scoped.confidence, 1::numeric))) as confidence_clamped,
      greatest(0::numeric, extract(epoch from (now() - scoped.occurred_at)) / 86400::numeric) as age_days
    from scoped
  ),
  recency as (
    select
      weighted.*,
      case
        when weighted.max_age_days is not null and weighted.age_days > weighted.max_age_days::numeric then 0::numeric
        when weighted.half_life_days is not null and weighted.half_life_days > 0
          then exp(ln(0.5::numeric) * (weighted.age_days / weighted.half_life_days::numeric))
        else 1::numeric
      end as recency_factor
    from weighted
  ),
  effective as (
    select
      recency.*,
      (coalesce(recency.cfg_weight, 1::numeric) * recency.confidence_clamped * recency.recency_factor) as effective_weight
    from recency
  ),
  valid as (
    select *
    from effective
    where effective_weight > 0
  ),
  metric_agg as (
    select
      v.skill_key,
      v.metric_key,
      count(*)::integer as samples,
      sum(v.metric_value * v.effective_weight) as weighted_sum,
      sum(v.effective_weight) as total_weight,
      max(v.occurred_at) as latest_at
    from valid v
    group by v.skill_key, v.metric_key
  ),
  skill_metrics as (
    select
      ma.skill_key,
      jsonb_object_agg(
        ma.metric_key,
        jsonb_build_object(
          'value_avg', round((ma.weighted_sum / nullif(ma.total_weight, 0))::numeric, 4),
          'samples', ma.samples,
          'weight_total', round(ma.total_weight::numeric, 4),
          'latest_at', ma.latest_at
        )
        order by ma.metric_key
      ) as metrics,
      max(ma.latest_at) as latest_at,
      sum(ma.samples)::integer as samples
    from metric_agg ma
    group by ma.skill_key
  ),
  service_metric_agg as (
    select
      v.source_type,
      v.skill_key,
      v.metric_key,
      count(*)::integer as samples,
      sum(v.metric_value * v.effective_weight) as weighted_sum,
      sum(v.effective_weight) as total_weight,
      max(v.occurred_at) as latest_at
    from valid v
    group by v.source_type, v.skill_key, v.metric_key
  ),
  service_skill_metrics as (
    select
      sma.source_type,
      sma.skill_key,
      jsonb_object_agg(
        sma.metric_key,
        jsonb_build_object(
          'value_avg', round((sma.weighted_sum / nullif(sma.total_weight, 0))::numeric, 4),
          'samples', sma.samples,
          'weight_total', round(sma.total_weight::numeric, 4),
          'latest_at', sma.latest_at
        )
        order by sma.metric_key
      ) as metrics,
      max(sma.latest_at) as latest_at,
      sum(sma.samples)::integer as samples
    from service_metric_agg sma
    group by sma.source_type, sma.skill_key
  ),
  service_tree as (
    select
      ssm.source_type,
      jsonb_object_agg(
        ssm.skill_key,
        jsonb_build_object(
          'metrics', ssm.metrics,
          'samples', ssm.samples,
          'latest_at', ssm.latest_at
        )
        order by ssm.skill_key
      ) as skills,
      max(ssm.latest_at) as latest_at,
      sum(ssm.samples)::integer as samples
    from service_skill_metrics ssm
    group by ssm.source_type
  ),
  totals as (
    select
      count(*)::integer as signals_count,
      count(distinct v.session_id)::integer as sessions_count,
      max(v.occurred_at) as latest_signal_at
    from valid v
  )
  select
    coalesce((select t.signals_count from totals t), 0),
    coalesce((select t.sessions_count from totals t), 0),
    (select t.latest_signal_at from totals t),
    coalesce(
      (
        select jsonb_object_agg(
          sm.skill_key,
          jsonb_build_object(
            'metrics', sm.metrics,
            'samples', sm.samples,
            'latest_at', sm.latest_at
          )
          order by sm.skill_key
        )
        from skill_metrics sm
      ),
      '{}'::jsonb
    ),
    coalesce(
      (
        select jsonb_object_agg(
          st.source_type,
          jsonb_build_object(
            'skills', st.skills,
            'samples', st.samples,
            'latest_at', st.latest_at
          )
          order by st.source_type
        )
        from service_tree st
      ),
      '{}'::jsonb
    )
  into
    v_signals_count,
    v_sessions_count,
    v_latest_signal_at,
    v_profile,
    v_service_breakdown;

  insert into public.learner_language_profiles (
    user_id,
    language_id,
    schema_version,
    signals_count,
    sessions_count,
    profile,
    service_breakdown,
    latest_signal_at,
    latest_event_id,
    latest_event_at
  )
  values (
    p_user_id,
    p_language_id,
    'language-profile.v1',
    v_signals_count,
    v_sessions_count,
    coalesce(v_profile, '{}'::jsonb),
    coalesce(v_service_breakdown, '{}'::jsonb),
    v_latest_signal_at,
    p_latest_event_id,
    coalesce(p_latest_event_at, v_latest_signal_at)
  )
  on conflict (user_id, language_id) do update
  set
    schema_version = excluded.schema_version,
    signals_count = excluded.signals_count,
    sessions_count = excluded.sessions_count,
    profile = excluded.profile,
    service_breakdown = excluded.service_breakdown,
    latest_signal_at = excluded.latest_signal_at,
    latest_event_id = coalesce(excluded.latest_event_id, public.learner_language_profiles.latest_event_id),
    latest_event_at = coalesce(excluded.latest_event_at, public.learner_language_profiles.latest_event_at),
    updated_at = now();

  return jsonb_build_object(
    'user_id', p_user_id,
    'language_id', p_language_id,
    'signals_count', v_signals_count,
    'sessions_count', v_sessions_count,
    'latest_signal_at', v_latest_signal_at
  );
end;
$$;

revoke all on function public.recompute_learner_language_profile(uuid, uuid, uuid, timestamptz) from public;

create or replace function public.rebuild_all_learner_language_profiles(
  p_language_id uuid default null,
  p_user_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select distinct s.user_id, s.language_id
    from public.language_signals s
    join public.product_languages pl
      on pl.product_id = s.product_id
     and pl.included_in_shared_profile = true
    where (p_language_id is null or s.language_id = p_language_id)
      and (p_user_id is null or s.user_id = p_user_id)
  loop
    perform public.recompute_learner_language_profile(v_row.user_id, v_row.language_id, null, null);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.rebuild_all_learner_language_profiles(uuid, uuid) from public;

create or replace function public.backfill_language_signals_from_exam_outcomes(p_limit integer default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_upserted integer := 0;
begin
  v_limit := case
    when p_limit is null or p_limit < 1 then 2147483647
    else p_limit
  end;

  with source_rows as (
    select
      eo.id as outcome_id,
      eo.user_id,
      eo.product_id,
      eo.session_id,
      eo.score_method,
      eo.status,
      eo.schema_version,
      eo.computed_at,
      skill.key as skill_key,
      metric.metric_key,
      metric.metric_value,
      pl.language_id
    from public.exam_outcomes eo
    join public.product_languages pl
      on pl.product_id = eo.product_id
     and pl.included_in_shared_profile = true
    cross join lateral jsonb_each(coalesce(eo.skill_breakdown, '{}'::jsonb)) as skill(key, value)
    cross join lateral (
      values
        ('ratio'::text, case when trim(coalesce(skill.value->>'ratio', '')) ~ '^-?[0-9]+([.][0-9]+)?$' then (skill.value->>'ratio')::numeric else null end),
        ('scaled_score_40'::text, case when trim(coalesce(skill.value->>'scaled_score_40', '')) ~ '^-?[0-9]+([.][0-9]+)?$' then (skill.value->>'scaled_score_40')::numeric else null end),
        ('scaled_score_800'::text, case when trim(coalesce(skill.value->>'scaled_score_800', '')) ~ '^-?[0-9]+([.][0-9]+)?$' then (skill.value->>'scaled_score_800')::numeric else null end),
        ('band'::text, case when trim(coalesce(skill.value->>'band', '')) ~ '^-?[0-9]+([.][0-9]+)?$' then (skill.value->>'band')::numeric else null end)
    ) as metric(metric_key, metric_value)
    where metric.metric_value is not null
    order by eo.computed_at asc
    limit v_limit
  ),
  upserted as (
    insert into public.language_signals (
      user_id,
      language_id,
      product_id,
      session_id,
      source_type,
      skill_key,
      metric_key,
      metric_value,
      confidence,
      occurred_at,
      idempotency_key,
      payload
    )
    select
      s.user_id,
      s.language_id,
      s.product_id,
      s.session_id,
      'exam.result'::text as source_type,
      s.skill_key,
      s.metric_key,
      s.metric_value,
      1::numeric as confidence,
      coalesce(s.computed_at, now()) as occurred_at,
      format('exam.signal:%s:%s:%s', s.outcome_id, s.skill_key, s.metric_key) as idempotency_key,
      jsonb_build_object(
        'source', 'exam_outcomes_backfill',
        'outcome_id', s.outcome_id,
        'score_method', s.score_method,
        'status', s.status,
        'schema_version', s.schema_version
      ) as payload
    from source_rows s
    on conflict (idempotency_key) do update
    set
      user_id = excluded.user_id,
      language_id = excluded.language_id,
      product_id = excluded.product_id,
      session_id = excluded.session_id,
      source_type = excluded.source_type,
      skill_key = excluded.skill_key,
      metric_key = excluded.metric_key,
      metric_value = excluded.metric_value,
      confidence = excluded.confidence,
      occurred_at = excluded.occurred_at,
      payload = excluded.payload
    returning 1
  )
  select count(*) into v_upserted from upserted;

  return coalesce(v_upserted, 0);
end;
$$;

revoke all on function public.backfill_language_signals_from_exam_outcomes(integer) from public;

with en as (
  select id from public.languages where code = 'en' limit 1
),
english_products as (
  select
    p.id as product_id,
    (select id from en) as language_id,
    true as included_in_shared_profile,
    jsonb_build_object('seeded_by', '20260310100000_language_scoped_profiles') as metadata
  from public.products p
  where (
    lower(coalesce(p.metadata->>'slug', '')) in (
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
    or lower(p.name) like '%ielts%'
    or lower(p.name) like '%toefl%'
    or lower(p.name) = 'english reading'
    or lower(p.name) = 'english listening'
    or lower(p.name) = 'english writing'
    or lower(p.name) = 'english speaking'
    or lower(p.name) = 'english grammar'
    or lower(p.name) = 'english immersion'
    or lower(p.name) = 'english vocabulary'
  )
  and lower(coalesce(p.metadata->>'slug', '')) <> 'sat-exam-simulator'
  and lower(p.name) not like '%sat%'
)
insert into public.product_languages (product_id, language_id, included_in_shared_profile, metadata)
select
  ep.product_id,
  ep.language_id,
  ep.included_in_shared_profile,
  ep.metadata
from english_products ep
where ep.language_id is not null
on conflict (product_id) do update
set
  language_id = excluded.language_id,
  included_in_shared_profile = excluded.included_in_shared_profile,
  metadata = coalesce(public.product_languages.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

with en as (
  select id from public.languages where code = 'en' limit 1
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
  (select id from en) as language_id,
  row_values.source_type,
  row_values.skill_key,
  row_values.metric_key,
  row_values.weight,
  row_values.max_age_days,
  row_values.half_life_days,
  jsonb_build_object('seeded_by', '20260310100000_language_scoped_profiles')
from (
  values
    ('*'::text, '*'::text, '*'::text, 1::numeric, null::integer, null::integer),
    ('exam.result'::text, 'reading'::text, '*'::text, 1.15::numeric, null::integer, 180::integer),
    ('exam.result'::text, 'listening'::text, '*'::text, 1.15::numeric, null::integer, 180::integer),
    ('exam.result'::text, 'writing'::text, '*'::text, 1.10::numeric, null::integer, 180::integer),
    ('exam.result'::text, 'speaking'::text, '*'::text, 1.10::numeric, null::integer, 180::integer),
    ('grade-writing.ai'::text, 'writing'::text, '*'::text, 1.20::numeric, null::integer, 120::integer),
    ('grade-writing.ai'::text, 'grammar'::text, '*'::text, 1.15::numeric, null::integer, 120::integer),
    ('grade-writing.ai'::text, 'vocabulary'::text, '*'::text, 1.15::numeric, null::integer, 120::integer)
) as row_values(source_type, skill_key, metric_key, weight, max_age_days, half_life_days)
where (select id from en) is not null
on conflict (language_id, source_type, skill_key, metric_key) do update
set
  weight = excluded.weight,
  max_age_days = excluded.max_age_days,
  half_life_days = excluded.half_life_days,
  metadata = coalesce(public.language_signal_weights.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

do $$
declare
  v_signals integer := 0;
  v_profiles integer := 0;
begin
  select public.backfill_language_signals_from_exam_outcomes(null) into v_signals;
  select public.rebuild_all_learner_language_profiles(null, null) into v_profiles;
  raise notice 'Backfilled language signals: %, rebuilt language profiles: %', v_signals, v_profiles;
end
$$;
