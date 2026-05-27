-- ============================================================================
-- TOEFL Playbook service + admin console
-- ----------------------------------------------------------------------------
-- Authoritative TOEFL iBT guidance: four skills (Reading, Listening, Speaking,
-- Writing), test-day protocol, and personalised study plans driven by TOEFL
-- simulator outcomes. Mirrors the IELTS/SAT Playbook architecture.
-- TOEFL scoring: 0-120 total, 0-30 per section.
-- ============================================================================

-- Product + plan seed ---------------------------------------------------------

insert into public.products (id, name, type, status, description, metadata)
values (
  'f9512c15-ec1c-4fcb-a5ec-a2c6ac3a020e'::uuid,
  'TOEFL Playbook',
  'course',
  'active',
  'Authoritative TOEFL iBT guidance with personalised study plans tied to simulator outcomes.',
  jsonb_build_object(
    'slug', 'toefl-playbook',
    'app_url', 'https://playbook.toefl.schood.online',
    'short_description', 'Production-ready TOEFL guidance service with public strategy content and premium personalised plans.',
    'tagline', 'Know the iBT, target the right skills, and act on scored weaknesses.',
    'sort_order', 13,
    'bundle_compatible_with', jsonb_build_array('toefl-ibt-simulator'),
    'seeded_by', '20260526190000_toefl_playbook_service'
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
  'ec18a324-4b30-4123-970a-a829dccf4228'::uuid,
  'f9512c15-ec1c-4fcb-a5ec-a2c6ac3a020e'::uuid,
  'TOEFL Playbook Monthly',
  119000,
  'UZS',
  30,
  false,
  jsonb_build_object(
    'display_order', 1,
    'recommended', false,
    'placeholder_price', true,
    'description', 'Placeholder inactive monthly plan for TOEFL Playbook until commercial pricing is approved.',
    'features', jsonb_build_array(
      'Premium strategy guides',
      'Diagnostic onboarding',
      'Saved recommendations',
      'Personalised TOEFL study plans'
    ),
    'seeded_by', '20260526190000_toefl_playbook_service'
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

with en as (
  select id as language_id
  from public.languages
  where code = 'en'
  limit 1
)
insert into public.product_languages (product_id, language_id, included_in_shared_profile, metadata)
select
  'f9512c15-ec1c-4fcb-a5ec-a2c6ac3a020e'::uuid,
  en.language_id,
  true,
  jsonb_build_object(
    'seeded_by', '20260526190000_toefl_playbook_service',
    'scope', 'english_shared_profile'
  )
from en
on conflict (product_id) do update
set
  language_id = excluded.language_id,
  included_in_shared_profile = excluded.included_in_shared_profile,
  metadata = coalesce(public.product_languages.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

-- Core schema ----------------------------------------------------------------

create table if not exists public.toefl_playbook_pages (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  parent_page_id uuid references public.toefl_playbook_pages(id) on delete set null,

  page_type text not null
    check (page_type in ('module', 'guide', 'study_plan', 'resource', 'myth', 'update', 'test_day', 'result_strategy', 'faq')),
  module_key text,
  slug text not null,
  title text not null,
  summary text not null default '',

  status text not null default 'draft'
    check (status in ('draft', 'review', 'published', 'archived')),
  visibility text not null default 'public'
    check (visibility in ('public', 'authenticated', 'premium')),

  locale_code text not null default 'en',
  country_scope text[] not null default '{}'::text[],
  variant_scope jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,

  seo_title text,
  seo_description text,
  seo_keywords text[] not null default '{}'::text[],
  published_at timestamptz,

  metadata jsonb not null default '{}'::jsonb,

  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint toefl_playbook_pages_slug_not_blank check (length(trim(slug)) > 0),
  constraint toefl_playbook_pages_title_not_blank check (length(trim(title)) > 0)
);

create unique index if not exists toefl_playbook_pages_slug_locale_unique
  on public.toefl_playbook_pages(locale_code, slug);

create index if not exists toefl_playbook_pages_product_status_idx
  on public.toefl_playbook_pages(product_id, status, visibility, sort_order, updated_at desc);

create index if not exists toefl_playbook_pages_module_idx
  on public.toefl_playbook_pages(module_key, page_type, sort_order);

create table if not exists public.toefl_playbook_page_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.toefl_playbook_pages(id) on delete cascade,
  block_type text not null
    check (block_type in ('rich_text', 'comparison_table', 'skill_grid', 'faq', 'checklist', 'resource_cards', 'timeline', 'cta_strip', 'callout', 'stat_grid')),
  heading text,
  status text not null default 'draft'
    check (status in ('draft', 'review', 'published', 'archived')),
  sort_order integer not null default 0,
  content jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists toefl_playbook_page_sections_page_idx
  on public.toefl_playbook_page_sections(page_id, status, sort_order);

create table if not exists public.toefl_playbook_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null default 'official_url'
    check (source_type in ('official_url', 'provider_url', 'news', 'internal_note')),
  provider_key text,
  title text not null,
  url text,
  summary text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'review', 'published', 'archived')),
  published_at timestamptz,
  verified_at timestamptz,
  last_checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists toefl_playbook_sources_url_unique
  on public.toefl_playbook_sources(url)
  where url is not null;

create index if not exists toefl_playbook_sources_status_idx
  on public.toefl_playbook_sources(status, verified_at desc, updated_at desc);

create table if not exists public.toefl_playbook_page_sources (
  page_id uuid not null references public.toefl_playbook_pages(id) on delete cascade,
  source_id uuid not null references public.toefl_playbook_sources(id) on delete cascade,
  sort_order integer not null default 0,
  citation_note text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (page_id, source_id)
);

create index if not exists toefl_playbook_page_sources_source_idx
  on public.toefl_playbook_page_sources(source_id, sort_order);

create table if not exists public.toefl_playbook_plan_templates (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  slug text not null,
  plan_type text not null
    check (plan_type in ('crash', 'balanced', 'improvement', 'skill_recovery')),
  title text not null,
  summary text not null default '',
  duration_days integer not null check (duration_days > 0),
  -- TOEFL iBT: 0-120 total, 0-30 per section.
  score_min integer not null default 0,
  score_max integer not null default 120,
  focus_section text check (focus_section in ('reading', 'listening', 'speaking', 'writing', 'all')),
  intensity text not null default 'moderate',
  status text not null default 'draft'
    check (status in ('draft', 'review', 'published', 'archived')),
  published_at timestamptz,
  schedule_json jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (product_id, slug),
  constraint toefl_playbook_plan_templates_score_bounds
    check (score_min >= 0 and score_max <= 120 and score_min <= score_max)
);

create index if not exists toefl_playbook_plan_templates_status_idx
  on public.toefl_playbook_plan_templates(product_id, status, plan_type, duration_days);

create table if not exists public.toefl_playbook_rule_sets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  rule_key text not null,
  rule_name text not null,
  description text,
  status text not null default 'active'
    check (status in ('draft', 'active', 'disabled', 'archived')),
  sort_order integer not null default 0,
  config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, rule_key)
);

create index if not exists toefl_playbook_rule_sets_status_idx
  on public.toefl_playbook_rule_sets(product_id, status, sort_order, updated_at desc);

create table if not exists public.toefl_playbook_user_profiles (
  user_id uuid not null references public.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,

  target_total_score integer not null default 90,
  current_score_or_estimate integer,
  deadline_date date,
  weakest_section text check (weakest_section in ('reading', 'listening', 'speaking', 'writing')),
  purpose text not null default 'university' check (purpose in ('university', 'scholarship', 'graduate', 'visa', 'placement', 'retake')),
  destination_country_code text,
  test_market_country_code text,
  preferred_delivery_mode text check (preferred_delivery_mode in ('home_edition', 'test_center', 'unsure')),
  prep_intensity text not null default 'balanced' check (prep_intensity in ('crash', 'balanced', 'thorough')),
  evidence_updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, product_id),
  constraint toefl_playbook_user_profiles_target_range
    check (target_total_score >= 0 and target_total_score <= 120),
  constraint toefl_playbook_user_profiles_current_range
    check (current_score_or_estimate is null or (current_score_or_estimate >= 0 and current_score_or_estimate <= 120))
);

create index if not exists toefl_playbook_user_profiles_deadline_idx
  on public.toefl_playbook_user_profiles(product_id, deadline_date, updated_at desc);

create table if not exists public.toefl_playbook_recommendation_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  plan_template_id uuid references public.toefl_playbook_plan_templates(id) on delete set null,
  latest_exam_outcome_id uuid references public.exam_outcomes(id) on delete set null,

  snapshot_type text not null default 'recommendation',
  recommendation_slug text,
  recommendation_json jsonb not null default '{}'::jsonb,
  inputs_json jsonb not null default '{}'::jsonb,
  derived_context jsonb not null default '{}'::jsonb,
  is_current boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists toefl_playbook_recommendation_snapshots_user_idx
  on public.toefl_playbook_recommendation_snapshots(user_id, product_id, is_current, created_at desc);

create table if not exists public.toefl_playbook_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  product_id uuid not null references public.products(id) on delete cascade,
  page_id uuid references public.toefl_playbook_pages(id) on delete set null,

  event_name text not null
    check (event_name in (
      'page_view',
      'premium_gate_seen',
      'premium_gate_clicked',
      'onboarding_completed',
      'recommendation_generated',
      'simulator_referral_opened',
      'practice_referral_opened',
      'resource_clicked',
      'official_source_clicked'
    )),
  page_type text,
  module_key text,
  market_country_code text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists toefl_playbook_events_event_idx
  on public.toefl_playbook_events(product_id, event_name, occurred_at desc);

create index if not exists toefl_playbook_events_module_idx
  on public.toefl_playbook_events(module_key, page_type, occurred_at desc);

-- updated_at triggers --------------------------------------------------------

drop trigger if exists toefl_playbook_pages_updated_at on public.toefl_playbook_pages;
create trigger toefl_playbook_pages_updated_at
before update on public.toefl_playbook_pages
for each row execute procedure public.handle_user_updated_at();

drop trigger if exists toefl_playbook_page_sections_updated_at on public.toefl_playbook_page_sections;
create trigger toefl_playbook_page_sections_updated_at
before update on public.toefl_playbook_page_sections
for each row execute procedure public.handle_user_updated_at();

drop trigger if exists toefl_playbook_sources_updated_at on public.toefl_playbook_sources;
create trigger toefl_playbook_sources_updated_at
before update on public.toefl_playbook_sources
for each row execute procedure public.handle_user_updated_at();

drop trigger if exists toefl_playbook_plan_templates_updated_at on public.toefl_playbook_plan_templates;
create trigger toefl_playbook_plan_templates_updated_at
before update on public.toefl_playbook_plan_templates
for each row execute procedure public.handle_user_updated_at();

drop trigger if exists toefl_playbook_rule_sets_updated_at on public.toefl_playbook_rule_sets;
create trigger toefl_playbook_rule_sets_updated_at
before update on public.toefl_playbook_rule_sets
for each row execute procedure public.handle_user_updated_at();

drop trigger if exists toefl_playbook_user_profiles_updated_at on public.toefl_playbook_user_profiles;
create trigger toefl_playbook_user_profiles_updated_at
before update on public.toefl_playbook_user_profiles
for each row execute procedure public.handle_user_updated_at();

drop trigger if exists toefl_playbook_recommendation_snapshots_updated_at on public.toefl_playbook_recommendation_snapshots;
create trigger toefl_playbook_recommendation_snapshots_updated_at
before update on public.toefl_playbook_recommendation_snapshots
for each row execute procedure public.handle_user_updated_at();

-- Row-level security ---------------------------------------------------------

alter table public.toefl_playbook_pages enable row level security;
alter table public.toefl_playbook_page_sections enable row level security;
alter table public.toefl_playbook_sources enable row level security;
alter table public.toefl_playbook_page_sources enable row level security;
alter table public.toefl_playbook_plan_templates enable row level security;
alter table public.toefl_playbook_rule_sets enable row level security;
alter table public.toefl_playbook_user_profiles enable row level security;
alter table public.toefl_playbook_recommendation_snapshots enable row level security;
alter table public.toefl_playbook_events enable row level security;

drop policy if exists "TOEFL playbook pages select published" on public.toefl_playbook_pages;
create policy "TOEFL playbook pages select published"
on public.toefl_playbook_pages for select
using (public.is_admin() or status = 'published');

drop policy if exists "TOEFL playbook pages admin manage" on public.toefl_playbook_pages;
create policy "TOEFL playbook pages admin manage"
on public.toefl_playbook_pages for all
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "TOEFL playbook sections select published" on public.toefl_playbook_page_sections;
create policy "TOEFL playbook sections select published"
on public.toefl_playbook_page_sections for select
using (
  public.is_admin()
  or exists (
    select 1 from public.toefl_playbook_pages p
    where p.id = toefl_playbook_page_sections.page_id and p.status = 'published'
  )
);

drop policy if exists "TOEFL playbook sections admin manage" on public.toefl_playbook_page_sections;
create policy "TOEFL playbook sections admin manage"
on public.toefl_playbook_page_sections for all
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "TOEFL playbook sources select published" on public.toefl_playbook_sources;
create policy "TOEFL playbook sources select published"
on public.toefl_playbook_sources for select
using (public.is_admin() or status = 'published');

drop policy if exists "TOEFL playbook sources admin manage" on public.toefl_playbook_sources;
create policy "TOEFL playbook sources admin manage"
on public.toefl_playbook_sources for all
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "TOEFL playbook page sources select published" on public.toefl_playbook_page_sources;
create policy "TOEFL playbook page sources select published"
on public.toefl_playbook_page_sources for select
using (
  public.is_admin()
  or exists (
    select 1 from public.toefl_playbook_pages p
    where p.id = toefl_playbook_page_sources.page_id and p.status = 'published'
  )
);

drop policy if exists "TOEFL playbook page sources admin manage" on public.toefl_playbook_page_sources;
create policy "TOEFL playbook page sources admin manage"
on public.toefl_playbook_page_sources for all
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "TOEFL playbook plan templates select published" on public.toefl_playbook_plan_templates;
create policy "TOEFL playbook plan templates select published"
on public.toefl_playbook_plan_templates for select
using (public.is_admin() or status = 'published');

drop policy if exists "TOEFL playbook plan templates admin manage" on public.toefl_playbook_plan_templates;
create policy "TOEFL playbook plan templates admin manage"
on public.toefl_playbook_plan_templates for all
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "TOEFL playbook rules select admin" on public.toefl_playbook_rule_sets;
create policy "TOEFL playbook rules select admin"
on public.toefl_playbook_rule_sets for select
using (public.is_admin());

drop policy if exists "TOEFL playbook rules admin manage" on public.toefl_playbook_rule_sets;
create policy "TOEFL playbook rules admin manage"
on public.toefl_playbook_rule_sets for all
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "TOEFL playbook profiles select own" on public.toefl_playbook_user_profiles;
create policy "TOEFL playbook profiles select own"
on public.toefl_playbook_user_profiles for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "TOEFL playbook profiles write own" on public.toefl_playbook_user_profiles;
create policy "TOEFL playbook profiles write own"
on public.toefl_playbook_user_profiles for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "TOEFL playbook recommendations select own" on public.toefl_playbook_recommendation_snapshots;
create policy "TOEFL playbook recommendations select own"
on public.toefl_playbook_recommendation_snapshots for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "TOEFL playbook recommendations write own" on public.toefl_playbook_recommendation_snapshots;
create policy "TOEFL playbook recommendations write own"
on public.toefl_playbook_recommendation_snapshots for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "TOEFL playbook events select own" on public.toefl_playbook_events;
create policy "TOEFL playbook events select own"
on public.toefl_playbook_events for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "TOEFL playbook events insert own" on public.toefl_playbook_events;
create policy "TOEFL playbook events insert own"
on public.toefl_playbook_events for insert
with check (user_id is null or auth.uid() = user_id or public.is_admin());

drop policy if exists "TOEFL playbook events admin manage" on public.toefl_playbook_events;
create policy "TOEFL playbook events admin manage"
on public.toefl_playbook_events for all
using (public.is_admin()) with check (public.is_admin());
