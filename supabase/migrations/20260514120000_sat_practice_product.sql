-- SAT Practice Lab product and plans.

insert into public.products (id, name, type, status, description, metadata)
values (
  '2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010'::uuid,
  'SAT Practice Lab',
  'practice',
  'active',
  'Daily adaptive SAT practice companion driven by simulator results, mistakes, and spaced review.',
  jsonb_build_object(
    'slug', 'sat-practice',
    'app_url', 'https://practice.sat.schood.online',
    'short_description', 'Adaptive SAT drills, mistake notebook, study plan, and AI tutor.',
    'tagline', 'Turn every mock result into tomorrow''s practice plan.',
    'sort_order', 31,
    'bundle_compatible_with', jsonb_build_array('sat-exam-simulator'),
    'seeded_by', '20260514120000_sat_practice_product'
  )
)
on conflict (id) do update
set
  name = excluded.name,
  type = excluded.type,
  status = excluded.status,
  description = excluded.description,
  metadata = coalesce(public.products.metadata, '{}'::jsonb) || excluded.metadata;

insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active, metadata)
values (
  'bb5b6e1f-b4f4-45a5-8bc2-7e60f17e4a1c'::uuid,
  '2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010'::uuid,
  'SAT Practice Starter',
  39000,
  'UZS',
  14,
  true,
  jsonb_build_object(
    'display_order', 1,
    'tagline', 'Two-week SAT repair sprint',
    'description', 'Adaptive drills, mistake notebook, and daily plan for focused SAT growth.',
    'features', jsonb_build_array(
      'Adaptive Reading & Writing and Math drills',
      'Mistake notebook and retry queue',
      'Daily study plan'
    ),
    'seeded_by', '20260514120000_sat_practice_product'
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
  '6737b183-cddf-4396-83e1-8b77cc9bb0d0'::uuid,
  '2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010'::uuid,
  'SAT Practice Monthly',
  89000,
  'UZS',
  30,
  true,
  jsonb_build_object(
    'display_order', 2,
    'recommended', true,
    'tagline', 'Best for daily score growth',
    'description', 'Full Practice Lab access with adaptive sessions, AI tutor, SRS, and analytics.',
    'features', jsonb_build_array(
      'Unlimited adaptive drill sessions',
      'AI explanations and similar questions',
      'Spaced repetition and weekly goals',
      'Score-impact insight'
    ),
    'seeded_by', '20260514120000_sat_practice_product'
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

insert into public.languages (code, name, status, metadata)
values ('en', 'English', 'active', jsonb_build_object('seeded_by', '20260514120000_sat_practice_product'))
on conflict (code) do update
set
  status = excluded.status,
  metadata = coalesce(public.languages.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

with en as (
  select id as language_id
  from public.languages
  where code = 'en'
  limit 1
)
insert into public.product_languages (product_id, language_id, included_in_shared_profile, metadata)
select
  '2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010'::uuid,
  en.language_id,
  false,
  jsonb_build_object(
    'seeded_by', '20260514120000_sat_practice_product',
    'scope', 'sat_practice'
  )
from en
on conflict (product_id) do update
set
  language_id = excluded.language_id,
  included_in_shared_profile = excluded.included_in_shared_profile,
  metadata = coalesce(public.product_languages.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

create table if not exists public.sat_practice_user_goals (
  user_id uuid primary key references public.users(id) on delete cascade,
  target_score integer not null default 1400 check (target_score between 400 and 1600),
  test_date date,
  hours_per_week integer not null default 3 check (hours_per_week between 1 and 40),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sat_practice_user_goals enable row level security;

drop policy if exists "SAT practice goals owned read" on public.sat_practice_user_goals;
create policy "SAT practice goals owned read"
on public.sat_practice_user_goals
for select
using (auth.uid() = user_id);

drop policy if exists "SAT practice goals owned insert" on public.sat_practice_user_goals;
create policy "SAT practice goals owned insert"
on public.sat_practice_user_goals
for insert
with check (auth.uid() = user_id);

drop policy if exists "SAT practice goals owned update" on public.sat_practice_user_goals;
create policy "SAT practice goals owned update"
on public.sat_practice_user_goals
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
