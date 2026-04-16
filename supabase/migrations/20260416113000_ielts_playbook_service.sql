-- ============================================================================
-- IELTS Playbook service + admin console
-- ----------------------------------------------------------------------------
-- Standalone editorial + diagnostic IELTS guidance service tied to simulator
-- outcomes and platform entitlements.
-- ============================================================================

-- Product + plan seed ---------------------------------------------------------

insert into public.products (id, name, type, status, description, metadata)
values (
  '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid,
  'IELTS Playbook',
  'course',
  'active',
  'Authoritative IELTS guidance, diagnostics, study plans, and result strategy tied to simulator outcomes.',
  jsonb_build_object(
    'slug', 'ielts-playbook',
    'app_url', 'https://playbook.ielts.schood.online',
    'short_description', 'Production-ready IELTS guidance service with public editorial content and premium personalized strategy.',
    'tagline', 'Understand the exam, choose the right path, and act on scored weaknesses.',
    'sort_order', 9,
    'bundle_compatible_with', jsonb_build_array('ielts-academic-simulator', 'ielts-practice'),
    'seeded_by', '20260416113000_ielts_playbook_service'
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
  '7f5d70df-d958-4885-a5a0-58ed7e417264'::uuid,
  '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid,
  'IELTS Playbook Monthly',
  119000,
  'UZS',
  30,
  false,
  jsonb_build_object(
    'display_order', 1,
    'recommended', false,
    'placeholder_price', true,
    'description', 'Placeholder inactive monthly plan for IELTS Playbook until commercial pricing is approved.',
    'features', jsonb_build_array(
      'Premium deep guides',
      'Diagnostic onboarding',
      'Saved recommendations',
      'Personalized study plans'
    ),
    'seeded_by', '20260416113000_ielts_playbook_service'
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
values ('en', 'English', 'active', jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service'))
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
  '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid,
  en.language_id,
  true,
  jsonb_build_object(
    'seeded_by', '20260416113000_ielts_playbook_service',
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

create table if not exists public.ielts_playbook_pages (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  parent_page_id uuid references public.ielts_playbook_pages(id) on delete set null,

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

  constraint ielts_playbook_pages_slug_not_blank check (length(trim(slug)) > 0),
  constraint ielts_playbook_pages_title_not_blank check (length(trim(title)) > 0)
);

create unique index if not exists ielts_playbook_pages_slug_locale_unique
  on public.ielts_playbook_pages(locale_code, slug);

create index if not exists ielts_playbook_pages_product_status_idx
  on public.ielts_playbook_pages(product_id, status, visibility, sort_order, updated_at desc);

create index if not exists ielts_playbook_pages_module_idx
  on public.ielts_playbook_pages(module_key, page_type, sort_order);

create table if not exists public.ielts_playbook_page_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.ielts_playbook_pages(id) on delete cascade,
  block_type text not null
    check (block_type in ('rich_text', 'comparison_table', 'band_grid', 'faq', 'checklist', 'resource_cards', 'timeline', 'cta_strip', 'callout', 'stat_grid')),
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

create index if not exists ielts_playbook_page_sections_page_idx
  on public.ielts_playbook_page_sections(page_id, status, sort_order);

create table if not exists public.ielts_playbook_sources (
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

create unique index if not exists ielts_playbook_sources_url_unique
  on public.ielts_playbook_sources(url)
  where url is not null;

create index if not exists ielts_playbook_sources_status_idx
  on public.ielts_playbook_sources(status, verified_at desc, updated_at desc);

create table if not exists public.ielts_playbook_page_sources (
  page_id uuid not null references public.ielts_playbook_pages(id) on delete cascade,
  source_id uuid not null references public.ielts_playbook_sources(id) on delete cascade,
  sort_order integer not null default 0,
  citation_note text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (page_id, source_id)
);

create index if not exists ielts_playbook_page_sources_source_idx
  on public.ielts_playbook_page_sources(source_id, sort_order);

create table if not exists public.ielts_playbook_market_guidance (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  country_code text not null,
  provider_key text not null,
  summary text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'review', 'published', 'archived')),

  ukvi_available boolean not null default false,
  computer_available boolean not null default true,
  writing_on_paper_available boolean not null default false,
  one_skill_retake_available boolean not null default false,

  result_timing_note text,
  booking_url text,
  verified_at timestamptz,
  published_at timestamptz,

  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (country_code, provider_key)
);

create index if not exists ielts_playbook_market_guidance_status_idx
  on public.ielts_playbook_market_guidance(status, country_code, provider_key, verified_at desc);

create table if not exists public.ielts_playbook_market_sources (
  market_guidance_id uuid not null references public.ielts_playbook_market_guidance(id) on delete cascade,
  source_id uuid not null references public.ielts_playbook_sources(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (market_guidance_id, source_id)
);

create table if not exists public.ielts_playbook_plan_templates (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  slug text not null,
  plan_type text not null
    check (plan_type in ('crash', 'balanced', 'improvement', 'skill_recovery')),
  title text not null,
  summary text not null default '',
  duration_days integer not null check (duration_days > 0),
  band_min numeric(3,1) not null default 0,
  band_max numeric(3,1) not null default 9,
  focus_skill text,
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
  constraint ielts_playbook_plan_templates_band_bounds
    check (band_min >= 0 and band_max <= 9 and band_min <= band_max)
);

create index if not exists ielts_playbook_plan_templates_status_idx
  on public.ielts_playbook_plan_templates(product_id, status, plan_type, duration_days);

create table if not exists public.ielts_playbook_rule_sets (
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

create index if not exists ielts_playbook_rule_sets_status_idx
  on public.ielts_playbook_rule_sets(product_id, status, sort_order, updated_at desc);

create table if not exists public.ielts_playbook_user_profiles (
  user_id uuid not null references public.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,

  target_overall_band numeric(3,1) not null default 6.5,
  current_band_or_estimate numeric(3,1),
  deadline_date date,
  weakest_skill text check (weakest_skill in ('listening', 'reading', 'writing', 'speaking')),
  purpose text not null default 'study' check (purpose in ('study', 'work', 'migration', 'job', 'visa')),
  destination_country_code text,
  test_market_country_code text,
  preferred_delivery_mode text check (preferred_delivery_mode in ('computer', 'writing_on_paper', 'paper', 'unsure')),
  provider_key text not null default 'british-council',
  program_requires_academic boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, product_id),
  constraint ielts_playbook_user_profiles_target_band_range
    check (target_overall_band >= 0 and target_overall_band <= 9),
  constraint ielts_playbook_user_profiles_current_band_range
    check (current_band_or_estimate is null or (current_band_or_estimate >= 0 and current_band_or_estimate <= 9))
);

create index if not exists ielts_playbook_user_profiles_deadline_idx
  on public.ielts_playbook_user_profiles(product_id, deadline_date, updated_at desc);

create table if not exists public.ielts_playbook_recommendation_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  plan_template_id uuid references public.ielts_playbook_plan_templates(id) on delete set null,
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

create index if not exists ielts_playbook_recommendation_snapshots_user_idx
  on public.ielts_playbook_recommendation_snapshots(user_id, product_id, is_current, created_at desc);

create table if not exists public.ielts_playbook_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  product_id uuid not null references public.products(id) on delete cascade,
  page_id uuid references public.ielts_playbook_pages(id) on delete set null,

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

create index if not exists ielts_playbook_events_event_idx
  on public.ielts_playbook_events(product_id, event_name, occurred_at desc);

create index if not exists ielts_playbook_events_module_idx
  on public.ielts_playbook_events(module_key, page_type, occurred_at desc);

-- updated_at triggers --------------------------------------------------------

drop trigger if exists ielts_playbook_pages_updated_at on public.ielts_playbook_pages;
create trigger ielts_playbook_pages_updated_at
before update on public.ielts_playbook_pages
for each row
execute procedure public.handle_user_updated_at();

drop trigger if exists ielts_playbook_page_sections_updated_at on public.ielts_playbook_page_sections;
create trigger ielts_playbook_page_sections_updated_at
before update on public.ielts_playbook_page_sections
for each row
execute procedure public.handle_user_updated_at();

drop trigger if exists ielts_playbook_sources_updated_at on public.ielts_playbook_sources;
create trigger ielts_playbook_sources_updated_at
before update on public.ielts_playbook_sources
for each row
execute procedure public.handle_user_updated_at();

drop trigger if exists ielts_playbook_market_guidance_updated_at on public.ielts_playbook_market_guidance;
create trigger ielts_playbook_market_guidance_updated_at
before update on public.ielts_playbook_market_guidance
for each row
execute procedure public.handle_user_updated_at();

drop trigger if exists ielts_playbook_plan_templates_updated_at on public.ielts_playbook_plan_templates;
create trigger ielts_playbook_plan_templates_updated_at
before update on public.ielts_playbook_plan_templates
for each row
execute procedure public.handle_user_updated_at();

drop trigger if exists ielts_playbook_rule_sets_updated_at on public.ielts_playbook_rule_sets;
create trigger ielts_playbook_rule_sets_updated_at
before update on public.ielts_playbook_rule_sets
for each row
execute procedure public.handle_user_updated_at();

drop trigger if exists ielts_playbook_user_profiles_updated_at on public.ielts_playbook_user_profiles;
create trigger ielts_playbook_user_profiles_updated_at
before update on public.ielts_playbook_user_profiles
for each row
execute procedure public.handle_user_updated_at();

drop trigger if exists ielts_playbook_recommendation_snapshots_updated_at on public.ielts_playbook_recommendation_snapshots;
create trigger ielts_playbook_recommendation_snapshots_updated_at
before update on public.ielts_playbook_recommendation_snapshots
for each row
execute procedure public.handle_user_updated_at();

-- RLS -----------------------------------------------------------------------

alter table public.ielts_playbook_pages enable row level security;
alter table public.ielts_playbook_page_sections enable row level security;
alter table public.ielts_playbook_sources enable row level security;
alter table public.ielts_playbook_page_sources enable row level security;
alter table public.ielts_playbook_market_guidance enable row level security;
alter table public.ielts_playbook_market_sources enable row level security;
alter table public.ielts_playbook_plan_templates enable row level security;
alter table public.ielts_playbook_rule_sets enable row level security;
alter table public.ielts_playbook_user_profiles enable row level security;
alter table public.ielts_playbook_recommendation_snapshots enable row level security;
alter table public.ielts_playbook_events enable row level security;

drop policy if exists "IELTS playbook pages select published" on public.ielts_playbook_pages;
create policy "IELTS playbook pages select published"
on public.ielts_playbook_pages
for select
using (
  public.is_admin()
  or status = 'published'
);

drop policy if exists "IELTS playbook pages admin manage" on public.ielts_playbook_pages;
create policy "IELTS playbook pages admin manage"
on public.ielts_playbook_pages
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "IELTS playbook sections select published" on public.ielts_playbook_page_sections;
create policy "IELTS playbook sections select published"
on public.ielts_playbook_page_sections
for select
using (
  public.is_admin()
  or (
    status = 'published'
    and exists (
      select 1
      from public.ielts_playbook_pages p
      where p.id = page_id
        and p.status = 'published'
    )
  )
);

drop policy if exists "IELTS playbook sections admin manage" on public.ielts_playbook_page_sections;
create policy "IELTS playbook sections admin manage"
on public.ielts_playbook_page_sections
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "IELTS playbook sources select published" on public.ielts_playbook_sources;
create policy "IELTS playbook sources select published"
on public.ielts_playbook_sources
for select
using (public.is_admin() or status = 'published');

drop policy if exists "IELTS playbook sources admin manage" on public.ielts_playbook_sources;
create policy "IELTS playbook sources admin manage"
on public.ielts_playbook_sources
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "IELTS playbook page sources select published" on public.ielts_playbook_page_sources;
create policy "IELTS playbook page sources select published"
on public.ielts_playbook_page_sources
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.ielts_playbook_pages p
    where p.id = page_id
      and p.status = 'published'
  )
);

drop policy if exists "IELTS playbook page sources admin manage" on public.ielts_playbook_page_sources;
create policy "IELTS playbook page sources admin manage"
on public.ielts_playbook_page_sources
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "IELTS playbook market guidance select published" on public.ielts_playbook_market_guidance;
create policy "IELTS playbook market guidance select published"
on public.ielts_playbook_market_guidance
for select
using (public.is_admin() or status = 'published');

drop policy if exists "IELTS playbook market guidance admin manage" on public.ielts_playbook_market_guidance;
create policy "IELTS playbook market guidance admin manage"
on public.ielts_playbook_market_guidance
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "IELTS playbook market sources select published" on public.ielts_playbook_market_sources;
create policy "IELTS playbook market sources select published"
on public.ielts_playbook_market_sources
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.ielts_playbook_market_guidance g
    where g.id = market_guidance_id
      and g.status = 'published'
  )
);

drop policy if exists "IELTS playbook market sources admin manage" on public.ielts_playbook_market_sources;
create policy "IELTS playbook market sources admin manage"
on public.ielts_playbook_market_sources
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "IELTS playbook plan templates select published" on public.ielts_playbook_plan_templates;
create policy "IELTS playbook plan templates select published"
on public.ielts_playbook_plan_templates
for select
using (public.is_admin() or status = 'published');

drop policy if exists "IELTS playbook plan templates admin manage" on public.ielts_playbook_plan_templates;
create policy "IELTS playbook plan templates admin manage"
on public.ielts_playbook_plan_templates
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "IELTS playbook rules select admin" on public.ielts_playbook_rule_sets;
create policy "IELTS playbook rules select admin"
on public.ielts_playbook_rule_sets
for select
using (public.is_admin());

drop policy if exists "IELTS playbook rules admin manage" on public.ielts_playbook_rule_sets;
create policy "IELTS playbook rules admin manage"
on public.ielts_playbook_rule_sets
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "IELTS playbook profiles select own" on public.ielts_playbook_user_profiles;
create policy "IELTS playbook profiles select own"
on public.ielts_playbook_user_profiles
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "IELTS playbook profiles write own" on public.ielts_playbook_user_profiles;
create policy "IELTS playbook profiles write own"
on public.ielts_playbook_user_profiles
for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "IELTS playbook recommendations select own" on public.ielts_playbook_recommendation_snapshots;
create policy "IELTS playbook recommendations select own"
on public.ielts_playbook_recommendation_snapshots
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "IELTS playbook recommendations write own" on public.ielts_playbook_recommendation_snapshots;
create policy "IELTS playbook recommendations write own"
on public.ielts_playbook_recommendation_snapshots
for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "IELTS playbook events select own" on public.ielts_playbook_events;
create policy "IELTS playbook events select own"
on public.ielts_playbook_events
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "IELTS playbook events insert own" on public.ielts_playbook_events;
create policy "IELTS playbook events insert own"
on public.ielts_playbook_events
for insert
with check (user_id is null or auth.uid() = user_id or public.is_admin());

drop policy if exists "IELTS playbook events admin manage" on public.ielts_playbook_events;
create policy "IELTS playbook events admin manage"
on public.ielts_playbook_events
for all
using (public.is_admin())
with check (public.is_admin());

-- Seed sources ---------------------------------------------------------------

with seed_sources (
  source_type,
  provider_key,
  title,
  url,
  summary,
  status,
  published_at,
  verified_at,
  last_checked_at,
  metadata
) as (
  values
    (
      'official_url',
      'british-council',
      'IELTS Test Delivery Update',
      'https://takeielts.britishcouncil.org/ielts-recognising-organisations/updates-ielts-test-delivery',
      'Official British Council update on evolving IELTS delivery formats and transition guidance.',
      'published',
      now(),
      now(),
      now(),
      jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
    ),
    (
      'official_url',
      'british-council',
      'IELTS Test Update',
      'https://takeielts.britishcouncil.org/take-ielts/book/paper-computer/ielts-test-update',
      'British Council explanation of IELTS on Computer and Writing on Paper changes.',
      'published',
      now(),
      now(),
      now(),
      jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
    ),
    (
      'official_url',
      'british-council',
      'IELTS Frequently Asked Questions',
      'https://takeielts.britishcouncil.org/frequently-asked-questions',
      'FAQ baseline for registration, delivery, results, and operational questions.',
      'published',
      now(),
      now(),
      now(),
      jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
    ),
    (
      'official_url',
      'ielts-org',
      'IELTS Test Centre Finder Example',
      'https://ielts.org/for-test-takers/book-a-test/ielts/kuwait/british-council-kuwait',
      'Representative official provider listing used as a seed example for market-scoped booking flows.',
      'published',
      now(),
      now(),
      now(),
      jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
    ),
    (
      'official_url',
      'ielts-org',
      'IELTS General Training Format in Detail',
      'https://ielts.org/organisations/ielts-for-organisations/test-types/ielts-general-training-test/general-training-test-format-in-detail',
      'Official IELTS format guidance for General Training structure and task-level expectations.',
      'published',
      now(),
      now(),
      now(),
      jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
    ),
    (
      'official_url',
      'british-council',
      'IELTS Assessment Guide',
      'https://takeielts.britishcouncil.org/teach-ielts/test-information/assessment',
      'Official overview of scoring criteria, assessment principles, and band interpretation.',
      'published',
      now(),
      now(),
      now(),
      jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
    )
)
insert into public.ielts_playbook_sources (
  source_type,
  provider_key,
  title,
  url,
  summary,
  status,
  published_at,
  verified_at,
  last_checked_at,
  metadata
)
select
  seed_sources.source_type,
  seed_sources.provider_key,
  seed_sources.title,
  seed_sources.url,
  seed_sources.summary,
  seed_sources.status,
  seed_sources.published_at,
  seed_sources.verified_at,
  seed_sources.last_checked_at,
  seed_sources.metadata
from seed_sources
where not exists (
  select 1
  from public.ielts_playbook_sources existing
  where existing.url is not distinct from seed_sources.url
);

with seed_sources (
  source_type,
  provider_key,
  title,
  url,
  summary,
  status,
  published_at,
  verified_at,
  last_checked_at,
  metadata
) as (
  values
    (
      'official_url',
      'british-council',
      'IELTS Test Delivery Update',
      'https://takeielts.britishcouncil.org/ielts-recognising-organisations/updates-ielts-test-delivery',
      'Official British Council update on evolving IELTS delivery formats and transition guidance.',
      'published',
      now(),
      now(),
      now(),
      jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
    ),
    (
      'official_url',
      'british-council',
      'IELTS Test Update',
      'https://takeielts.britishcouncil.org/take-ielts/book/paper-computer/ielts-test-update',
      'British Council explanation of IELTS on Computer and Writing on Paper changes.',
      'published',
      now(),
      now(),
      now(),
      jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
    ),
    (
      'official_url',
      'british-council',
      'IELTS Frequently Asked Questions',
      'https://takeielts.britishcouncil.org/frequently-asked-questions',
      'FAQ baseline for registration, delivery, results, and operational questions.',
      'published',
      now(),
      now(),
      now(),
      jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
    ),
    (
      'official_url',
      'ielts-org',
      'IELTS Test Centre Finder Example',
      'https://ielts.org/for-test-takers/book-a-test/ielts/kuwait/british-council-kuwait',
      'Representative official provider listing used as a seed example for market-scoped booking flows.',
      'published',
      now(),
      now(),
      now(),
      jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
    ),
    (
      'official_url',
      'ielts-org',
      'IELTS General Training Format in Detail',
      'https://ielts.org/organisations/ielts-for-organisations/test-types/ielts-general-training-test/general-training-test-format-in-detail',
      'Official IELTS format guidance for General Training structure and task-level expectations.',
      'published',
      now(),
      now(),
      now(),
      jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
    ),
    (
      'official_url',
      'british-council',
      'IELTS Assessment Guide',
      'https://takeielts.britishcouncil.org/teach-ielts/test-information/assessment',
      'Official overview of scoring criteria, assessment principles, and band interpretation.',
      'published',
      now(),
      now(),
      now(),
      jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
    )
)
update public.ielts_playbook_sources as target
set
  source_type = seed_sources.source_type,
  provider_key = seed_sources.provider_key,
  title = seed_sources.title,
  summary = seed_sources.summary,
  status = seed_sources.status,
  published_at = seed_sources.published_at,
  verified_at = seed_sources.verified_at,
  last_checked_at = seed_sources.last_checked_at,
  metadata = coalesce(target.metadata, '{}'::jsonb) || seed_sources.metadata
from seed_sources
where target.url is not distinct from seed_sources.url;

-- Seed module pages ----------------------------------------------------------

with seed_pages(module_key, slug, title, summary, page_type, visibility, sort_order, seo_title, seo_description, metadata) as (
  values
    ('essentials', 'essentials', 'IELTS Essentials', 'Start with what IELTS is, why people take it, how the four skills work, and how band scores should actually be interpreted.', 'module', 'public', 1, 'IELTS Essentials | IELTS Playbook', 'Learn what IELTS is used for, how Academic and General differ, and how band scores work.', jsonb_build_object('theme', 'foundation', 'hero_kicker', 'Module 1')),
    ('test-types-booking', 'test-types-booking', 'Test Types and Booking Decisions', 'Help learners decide between Academic and General Training, UKVI or regular IELTS, and delivery options like computer or Writing on Paper.', 'module', 'public', 2, 'Which IELTS Test Do I Need? | IELTS Playbook', 'Choose the right IELTS format, UKVI status, delivery mode, and retake path.', jsonb_build_object('theme', 'decision', 'hero_kicker', 'Module 2')),
    ('listening-master-guide', 'listening-master-guide', 'Listening Master Guide', 'Break down the four Listening parts, common distractors, note-taking habits, and score-lifting routines.', 'module', 'public', 3, 'IELTS Listening Master Guide | IELTS Playbook', 'Master IELTS Listening traps, accents, note-taking, and answer transfer habits.', jsonb_build_object('theme', 'skill', 'skill', 'listening', 'hero_kicker', 'Module 3')),
    ('reading-master-guide', 'reading-master-guide', 'Reading Master Guide', 'Separate Academic and General Training Reading while teaching skimming, scanning, paraphrase recognition, and time management.', 'module', 'public', 4, 'IELTS Reading Master Guide | IELTS Playbook', 'Learn IELTS Reading strategy for Academic and General passages, question types, and timing.', jsonb_build_object('theme', 'skill', 'skill', 'reading', 'hero_kicker', 'Module 4')),
    ('writing-master-guide', 'writing-master-guide', 'Writing Master Guide', 'Cover Academic Task 1, General Task 1, and Task 2 with scoring criteria, structure systems, and band-killing mistakes.', 'module', 'public', 5, 'IELTS Writing Master Guide | IELTS Playbook', 'Understand IELTS Writing scoring, task response, structure, and high-impact improvement paths.', jsonb_build_object('theme', 'skill', 'skill', 'writing', 'hero_kicker', 'Module 5')),
    ('speaking-master-guide', 'speaking-master-guide', 'Speaking Master Guide', 'Show how Part 1, 2, and 3 really work, what examiners reward, and how to sound natural under pressure.', 'module', 'public', 6, 'IELTS Speaking Master Guide | IELTS Playbook', 'Prepare for IELTS Speaking with better fluency, development, recovery, and band-aware strategy.', jsonb_build_object('theme', 'skill', 'skill', 'speaking', 'hero_kicker', 'Module 6')),
    ('band-scores-improvement-map', 'band-scores-improvement-map', 'Band Scores and Improvement Map', 'Explain the practical difference between Bands 5, 6, 7, 8, and 9 so users can diagnose where they are stuck.', 'module', 'public', 7, 'IELTS Band Scores and Improvement Map | IELTS Playbook', 'See what separates IELTS band levels and how to move from weakness to targeted improvement.', jsonb_build_object('theme', 'diagnostic', 'hero_kicker', 'Module 7')),
    ('intricacies-traps-myths', 'intricacies-traps-myths', 'Intricacies, Traps, and Myths', 'Surface the hidden IELTS rules learners usually miss, from paraphrase traps to the danger of memorized answers.', 'module', 'public', 8, 'IELTS Intricacies and Myths | IELTS Playbook', 'Avoid common IELTS myths, hidden scoring traps, and over-coached strategies.', jsonb_build_object('theme', 'insight', 'hero_kicker', 'Module 8')),
    ('updates-policy', 'updates-policy', 'Updates, Policy, and News Tracker', 'Track delivery changes, result timing expectations, One Skill Retake rollout notes, and verified official updates.', 'module', 'public', 9, 'IELTS Updates and Policy Tracker | IELTS Playbook', 'Follow verified IELTS delivery, policy, and operational updates with citations.', jsonb_build_object('theme', 'updates', 'hero_kicker', 'Module 9')),
    ('study-plans', 'study-plans', 'Study Plans and Templates', 'Turn information into action with crash plans, balanced plans, long-horizon plans, and recovery routes for weak skills.', 'module', 'public', 10, 'IELTS Study Plans and Templates | IELTS Playbook', 'Use structured IELTS study plans for short deadlines, balanced prep, or weak-skill recovery.', jsonb_build_object('theme', 'planning', 'hero_kicker', 'Module 10')),
    ('test-day-guide', 'test-day-guide', 'Test-Day Operating Manual', 'Cover registration, ID, week-before preparation, the night before, and what to do when panic hits during the test.', 'module', 'public', 11, 'IELTS Test-Day Guide | IELTS Playbook', 'Prepare for IELTS test day with practical operating guidance and result-handling steps.', jsonb_build_object('theme', 'operations', 'hero_kicker', 'Module 11')),
    ('retake-results-strategy', 'retake-results-strategy', 'Retake and Result Strategy', 'Help users decide whether to retake, remark, or use One Skill Retake after interpreting the result profile clearly.', 'module', 'public', 12, 'IELTS Retake and Result Strategy | IELTS Playbook', 'Interpret IELTS results and decide between retake, One Skill Retake, or remark paths.', jsonb_build_object('theme', 'results', 'hero_kicker', 'Module 12'))
)
insert into public.ielts_playbook_pages (
  product_id,
  module_key,
  slug,
  title,
  summary,
  page_type,
  status,
  visibility,
  locale_code,
  sort_order,
  seo_title,
  seo_description,
  published_at,
  metadata
)
select
  '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid,
  module_key,
  slug,
  title,
  summary,
  page_type,
  'published',
  visibility,
  'en',
  sort_order,
  seo_title,
  seo_description,
  now(),
  metadata || jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
from seed_pages
on conflict (locale_code, slug) do update
set
  title = excluded.title,
  summary = excluded.summary,
  page_type = excluded.page_type,
  status = excluded.status,
  visibility = excluded.visibility,
  sort_order = excluded.sort_order,
  seo_title = excluded.seo_title,
  seo_description = excluded.seo_description,
  published_at = excluded.published_at,
  metadata = coalesce(public.ielts_playbook_pages.metadata, '{}'::jsonb) || excluded.metadata;

with seed_guides(module_key, slug, title, summary, page_type, visibility, sort_order, metadata) as (
  values
    ('listening-master-guide', 'guide-listening-traps-premium', 'Listening Traps Deep Guide', 'Premium guide focused on distractors, map labeling, spelling control, and answer-transfer discipline.', 'guide', 'premium', 301, jsonb_build_object('teaser_for', 'listening-master-guide')),
    ('reading-master-guide', 'guide-reading-paraphrase-premium', 'Reading Paraphrase Deep Guide', 'Premium guide for paraphrase spotting, Not Given logic, and pressure-proof timing systems.', 'guide', 'premium', 401, jsonb_build_object('teaser_for', 'reading-master-guide')),
    ('writing-master-guide', 'guide-writing-task-2-premium', 'Writing Task 2 Deep Guide', 'Premium guide for idea generation, development depth, coherence, and band-safe language choices.', 'guide', 'premium', 501, jsonb_build_object('teaser_for', 'writing-master-guide')),
    ('speaking-master-guide', 'guide-speaking-band-7-premium', 'Speaking Band 7+ Deep Guide', 'Premium guide focused on natural expansion, fluency control, recovery after errors, and Part 3 depth.', 'guide', 'premium', 601, jsonb_build_object('teaser_for', 'speaking-master-guide')),
    ('band-scores-improvement-map', 'guide-band-6-to-7-roadmap', 'Band 6.0 to 7.0 Roadmap', 'Premium diagnostic roadmap for identifying which weaknesses stop users moving into university-safe band territory.', 'guide', 'premium', 701, jsonb_build_object('teaser_for', 'band-scores-improvement-map')),
    ('retake-results-strategy', 'guide-retake-decision-premium', 'Premium Result Strategy Guide', 'Premium post-result decision support for OSR, full retake, remark awareness, and next-attempt prioritization.', 'result_strategy', 'premium', 1201, jsonb_build_object('teaser_for', 'retake-results-strategy'))
)
insert into public.ielts_playbook_pages (
  product_id,
  parent_page_id,
  module_key,
  slug,
  title,
  summary,
  page_type,
  status,
  visibility,
  locale_code,
  sort_order,
  seo_title,
  seo_description,
  published_at,
  metadata
)
select
  '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid,
  parent_page.id,
  seed_guides.module_key,
  seed_guides.slug,
  seed_guides.title,
  seed_guides.summary,
  seed_guides.page_type,
  'published',
  seed_guides.visibility,
  'en',
  seed_guides.sort_order,
  seed_guides.title || ' | IELTS Playbook',
  seed_guides.summary,
  now(),
  seed_guides.metadata || jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
from seed_guides
join public.ielts_playbook_pages parent_page
  on parent_page.slug = seed_guides.module_key
 and parent_page.locale_code = 'en'
on conflict (locale_code, slug) do update
set
  parent_page_id = excluded.parent_page_id,
  title = excluded.title,
  summary = excluded.summary,
  page_type = excluded.page_type,
  status = excluded.status,
  visibility = excluded.visibility,
  sort_order = excluded.sort_order,
  seo_title = excluded.seo_title,
  seo_description = excluded.seo_description,
  published_at = excluded.published_at,
  metadata = coalesce(public.ielts_playbook_pages.metadata, '{}'::jsonb) || excluded.metadata;

with page_seed as (
  select id, module_key, slug, title, summary
  from public.ielts_playbook_pages
  where product_id = '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid
    and locale_code = 'en'
    and status = 'published'
)
insert into public.ielts_playbook_page_sections (
  page_id,
  block_type,
  heading,
  status,
  sort_order,
  content,
  metadata
)
select
  page_seed.id,
  'rich_text',
  'Why This Matters',
  'published',
  1,
  jsonb_build_object(
    'lead', page_seed.summary,
    'body', case
      when page_seed.slug = 'essentials' then 'Use this module to understand the exam before you build strategy. It covers what IELTS is for, how Academic and General Training differ, how the four skills are tested, and how overall bands relate to section bands in real decision-making.'
      when page_seed.slug = 'test-types-booking' then 'Learners need a decision engine before they book. This module explains which track fits the user goal, when UKVI matters, what computer delivery changes operationally, and how One Skill Retake eligibility depends on location and original test mode.'
      when page_seed.slug = 'listening-master-guide' then 'Listening is often lost through habits, not English level. This module maps the four-part structure, distractor patterns, spelling traps, note-taking under speed, and answer-transfer discipline that protect scores.'
      when page_seed.slug = 'reading-master-guide' then 'Reading rewards paraphrase recognition and time control more than raw confidence. This module separates Academic and General Training, then explains skimming, scanning, headings, True/False/Not Given logic, and pressure management.'
      when page_seed.slug = 'writing-master-guide' then 'Writing bands rise when task response and development improve, not when memorized phrases get longer. This module separates Academic Task 1, General Task 1, and Task 2 while keeping scoring criteria central.'
      when page_seed.slug = 'speaking-master-guide' then 'Speaking is evaluated through natural communication, not theatrical vocabulary. This module shows what examiners reward in Parts 1, 2, and 3, and how to recover calmly after a mistake.'
      when page_seed.slug = 'band-scores-improvement-map' then 'Band descriptions become useful only when they become diagnostic. This module translates band levels into observable weakness patterns and shows what improvement looks like in performance, not theory.'
      when page_seed.slug = 'intricacies-traps-myths' then 'Many serious learners still miss hidden IELTS mechanics. This module corrects the myths that waste time, including template overuse, uneven progress across skills, and the difference between strong English and strong exam execution.'
      when page_seed.slug = 'updates-policy' then 'IELTS operations change by market and delivery mode, so this module stays source-linked and admin-verified. Use it to understand result timing expectations, rollout notes, and where policy guidance must be checked locally.'
      when page_seed.slug = 'study-plans' then 'Information becomes valuable when it turns into a schedule. This module organizes crash plans, balanced plans, longer improvement cycles, and weak-skill recovery routes with simulator and practice tie-ins.'
      when page_seed.slug = 'test-day-guide' then 'Test-day errors often come from poor operational planning. This module covers registration, ID, what to do in the final week, what to do the night before, and how to stabilize if panic appears during the test.'
      when page_seed.slug = 'retake-results-strategy' then 'Results need interpretation, not emotion. This module helps users decide between full retake, One Skill Retake, and a remark-informed review while keeping market and eligibility differences visible.'
      else page_seed.summary
    end
  ),
  jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
from page_seed
on conflict do nothing;

with page_seed as (
  select id, slug
  from public.ielts_playbook_pages
  where product_id = '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid
    and locale_code = 'en'
    and status = 'published'
)
insert into public.ielts_playbook_page_sections (
  page_id,
  block_type,
  heading,
  status,
  sort_order,
  content,
  metadata
)
select
  page_seed.id,
  'checklist',
  'Key Outcomes',
  'published',
  2,
  jsonb_build_object(
    'items', case
      when page_seed.slug = 'essentials' then jsonb_build_array('Know what IELTS is used for', 'Understand Academic vs General Training', 'Separate overall band from section bands', 'Interpret common score ranges in practical terms')
      when page_seed.slug = 'test-types-booking' then jsonb_build_array('Choose the correct IELTS track', 'Understand when UKVI matters', 'Compare computer vs Writing on Paper', 'Check One Skill Retake eligibility logic')
      when page_seed.slug = 'listening-master-guide' then jsonb_build_array('Understand the 4-part structure', 'Spot distractors and spelling traps', 'Improve note-taking and transfer habits', 'Build accent exposure deliberately')
      when page_seed.slug = 'reading-master-guide' then jsonb_build_array('Apply skimming and scanning correctly', 'Handle True/False/Not Given and headings', 'Recognize paraphrase instead of chasing keywords', 'Manage time under pressure')
      when page_seed.slug = 'writing-master-guide' then jsonb_build_array('Use the scoring criteria actively', 'Structure paragraphs for development', 'Balance range with accuracy', 'Avoid memorized or off-task writing')
      when page_seed.slug = 'speaking-master-guide' then jsonb_build_array('Navigate Parts 1, 2, and 3', 'Expand answers naturally', 'Prioritize fluency over speed', 'Recover after mistakes without spiraling')
      when page_seed.slug = 'band-scores-improvement-map' then jsonb_build_array('See what separates Bands 5-9', 'Identify sticking-point weaknesses', 'Compare current performance to target', 'Turn diagnosis into practice priority')
      when page_seed.slug = 'intricacies-traps-myths' then jsonb_build_array('Avoid common IELTS myths', 'Understand hidden scoring traps', 'Separate language level from exam execution', 'Expect uneven progress across skills')
      when page_seed.slug = 'updates-policy' then jsonb_build_array('Track delivery updates', 'Monitor result timing notes', 'See policy changes by market', 'Review official prep and provider announcements')
      when page_seed.slug = 'study-plans' then jsonb_build_array('Choose a plan by deadline', 'Work around weakest skill first', 'Blend simulator and practice routines', 'Set realistic improvement expectations')
      when page_seed.slug = 'test-day-guide' then jsonb_build_array('Prepare documents and logistics', 'Use a final-week checklist', 'Control nerves with a response plan', 'Know how results and retakes work')
      when page_seed.slug = 'retake-results-strategy' then jsonb_build_array('Interpret score profiles', 'Decide whether to retake', 'Evaluate One Skill Retake fit', 'Prioritize the next attempt strategically')
      else jsonb_build_array('Use the module carefully')
    end
  ),
  jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
from page_seed
on conflict do nothing;

with page_seed as (
  select id, slug
  from public.ielts_playbook_pages
  where product_id = '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid
    and locale_code = 'en'
    and status = 'published'
)
insert into public.ielts_playbook_page_sections (
  page_id,
  block_type,
  heading,
  status,
  sort_order,
  content,
  metadata
)
select
  page_seed.id,
  'cta_strip',
  'Next Move',
  'published',
  3,
  jsonb_build_object(
    'label', case when page_seed.slug like 'guide-%' then 'Unlock premium strategy' else 'Turn this into action' end,
    'primary_text', case
      when page_seed.slug like 'guide-%' then 'Open your diagnostic dashboard'
      when page_seed.slug = 'study-plans' then 'Generate your personal study plan'
      else 'Start diagnostic onboarding'
    end,
    'primary_url', case
      when page_seed.slug like 'guide-%' then '/dashboard'
      when page_seed.slug = 'study-plans' then '/onboarding'
      else '/diagnostic'
    end,
    'secondary_text', 'Go to IELTS Simulator',
    'secondary_url', 'https://ielts.schood.online',
    'surface', case when page_seed.slug like 'guide-%' then 'premium' else 'module' end
  ),
  jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
from page_seed
on conflict do nothing;

-- Seed citations -------------------------------------------------------------

with pages as (
  select id, slug
  from public.ielts_playbook_pages
  where product_id = '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid
    and locale_code = 'en'
),
sources as (
  select id, url
  from public.ielts_playbook_sources
),
links(page_slug, source_url, sort_order, citation_note, is_primary) as (
  values
    ('essentials', 'https://takeielts.britishcouncil.org/teach-ielts/test-information/assessment', 1, 'Band scoring and assessment baseline', true),
    ('test-types-booking', 'https://takeielts.britishcouncil.org/frequently-asked-questions', 1, 'Booking and format decision baseline', true),
    ('test-types-booking', 'https://takeielts.britishcouncil.org/take-ielts/book/paper-computer/ielts-test-update', 2, 'Delivery format update', false),
    ('listening-master-guide', 'https://takeielts.britishcouncil.org/teach-ielts/test-information/assessment', 1, 'Assessment baseline', true),
    ('reading-master-guide', 'https://ielts.org/organisations/ielts-for-organisations/test-types/ielts-general-training-test/general-training-test-format-in-detail', 1, 'Reading track and task baseline', true),
    ('writing-master-guide', 'https://takeielts.britishcouncil.org/teach-ielts/test-information/assessment', 1, 'Writing criteria baseline', true),
    ('speaking-master-guide', 'https://takeielts.britishcouncil.org/teach-ielts/test-information/assessment', 1, 'Speaking criteria baseline', true),
    ('band-scores-improvement-map', 'https://takeielts.britishcouncil.org/teach-ielts/test-information/assessment', 1, 'Band interpretation baseline', true),
    ('intricacies-traps-myths', 'https://takeielts.britishcouncil.org/frequently-asked-questions', 1, 'Operational myth baseline', true),
    ('updates-policy', 'https://takeielts.britishcouncil.org/ielts-recognising-organisations/updates-ielts-test-delivery', 1, 'Official delivery update', true),
    ('updates-policy', 'https://takeielts.britishcouncil.org/take-ielts/book/paper-computer/ielts-test-update', 2, 'Computer-first and Writing on Paper context', false),
    ('study-plans', 'https://takeielts.britishcouncil.org/teach-ielts/test-information/assessment', 1, 'Scoring-driven plan rationale baseline', true),
    ('test-day-guide', 'https://takeielts.britishcouncil.org/frequently-asked-questions', 1, 'Test-day operational FAQ baseline', true),
    ('retake-results-strategy', 'https://takeielts.britishcouncil.org/frequently-asked-questions', 1, 'Results and retake baseline', true),
    ('guide-listening-traps-premium', 'https://takeielts.britishcouncil.org/teach-ielts/test-information/assessment', 1, 'Listening scoring baseline', true),
    ('guide-reading-paraphrase-premium', 'https://ielts.org/organisations/ielts-for-organisations/test-types/ielts-general-training-test/general-training-test-format-in-detail', 1, 'Reading format baseline', true),
    ('guide-writing-task-2-premium', 'https://takeielts.britishcouncil.org/teach-ielts/test-information/assessment', 1, 'Writing scoring baseline', true),
    ('guide-speaking-band-7-premium', 'https://takeielts.britishcouncil.org/teach-ielts/test-information/assessment', 1, 'Speaking scoring baseline', true),
    ('guide-band-6-to-7-roadmap', 'https://takeielts.britishcouncil.org/teach-ielts/test-information/assessment', 1, 'Band progression baseline', true),
    ('guide-retake-decision-premium', 'https://takeielts.britishcouncil.org/frequently-asked-questions', 1, 'Retake and results baseline', true)
)
insert into public.ielts_playbook_page_sources (page_id, source_id, sort_order, citation_note, is_primary)
select pages.id, sources.id, links.sort_order, links.citation_note, links.is_primary
from links
join pages on pages.slug = links.page_slug
join sources on sources.url = links.source_url
on conflict (page_id, source_id) do update
set
  sort_order = excluded.sort_order,
  citation_note = excluded.citation_note,
  is_primary = excluded.is_primary;

-- Seed market guidance -------------------------------------------------------

insert into public.ielts_playbook_market_guidance (
  product_id,
  country_code,
  provider_key,
  summary,
  status,
  ukvi_available,
  computer_available,
  writing_on_paper_available,
  one_skill_retake_available,
  result_timing_note,
  booking_url,
  verified_at,
  published_at,
  metadata
)
values
  (
    '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid,
    'GLOBAL',
    'british-council',
    'Global fallback guidance used when market-specific rows are not yet curated. Computer delivery should be treated as the default path, while Writing on Paper and One Skill Retake must still be confirmed locally.',
    'published',
    false,
    true,
    false,
    false,
    'Most IELTS on Computer results are typically issued within around 2 days, with faster turnaround possible in some markets. Always confirm with the provider in the user market.',
    'https://ielts.org/for-test-takers/book-a-test/ielts/kuwait/british-council-kuwait',
    now(),
    now(),
    jsonb_build_object(
      'seeded_by', '20260416113000_ielts_playbook_service',
      'scope', 'fallback_global',
      'writing_on_paper_rollout_note', 'Expose only when a market-specific row allows it.'
    )
  )
on conflict (country_code, provider_key) do update
set
  summary = excluded.summary,
  status = excluded.status,
  ukvi_available = excluded.ukvi_available,
  computer_available = excluded.computer_available,
  writing_on_paper_available = excluded.writing_on_paper_available,
  one_skill_retake_available = excluded.one_skill_retake_available,
  result_timing_note = excluded.result_timing_note,
  booking_url = excluded.booking_url,
  verified_at = excluded.verified_at,
  published_at = excluded.published_at,
  metadata = coalesce(public.ielts_playbook_market_guidance.metadata, '{}'::jsonb) || excluded.metadata;

with market_row as (
  select id
  from public.ielts_playbook_market_guidance
  where country_code = 'GLOBAL'
    and provider_key = 'british-council'
  limit 1
),
sources as (
  select id, url
  from public.ielts_playbook_sources
  where url in (
    'https://takeielts.britishcouncil.org/ielts-recognising-organisations/updates-ielts-test-delivery',
    'https://takeielts.britishcouncil.org/take-ielts/book/paper-computer/ielts-test-update',
    'https://takeielts.britishcouncil.org/frequently-asked-questions'
  )
)
insert into public.ielts_playbook_market_sources (market_guidance_id, source_id, sort_order)
select
  market_row.id,
  sources.id,
  case
    when sources.url like '%updates-ielts-test-delivery' then 1
    when sources.url like '%paper-computer/ielts-test-update' then 2
    else 3
  end
from market_row
cross join sources
on conflict (market_guidance_id, source_id) do update
set
  sort_order = excluded.sort_order;

-- Seed plan templates --------------------------------------------------------

insert into public.ielts_playbook_plan_templates (
  product_id,
  slug,
  plan_type,
  title,
  summary,
  duration_days,
  band_min,
  band_max,
  focus_skill,
  intensity,
  status,
  published_at,
  schedule_json,
  metadata
)
values
  (
    '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid,
    'crash-14',
    'crash',
    '14-Day Crash Plan',
    'Short-window preparation for urgent deadlines with daily simulator or practice contact and aggressive weakness triage.',
    14,
    4.0,
    9.0,
    null,
    'high',
    'published',
    now(),
    jsonb_build_object(
      'weeks', jsonb_build_array(
        jsonb_build_object(
          'label', 'Week 1',
          'focus', jsonb_build_array('Understand format fast', 'Stabilize weakest skill', 'Run one timed diagnostic'),
          'daily_routine', jsonb_build_array('45-60 minutes concept repair', '45 minutes targeted drilling', '15 minutes review log')
        ),
        jsonb_build_object(
          'label', 'Week 2',
          'focus', jsonb_build_array('Timed execution', 'Task-response discipline', 'Final logistics'),
          'daily_routine', jsonb_build_array('1 timed block', '1 review block', '1 short speaking or writing recovery block')
        )
      ),
      'simulator_cta', '/?source=playbook&mode=crash',
      'practice_cta', 'https://practice.ielts.schood.online/dashboard?source=playbook&plan=crash-14'
    ),
    jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
  ),
  (
    '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid,
    'balanced-28',
    'balanced',
    '4-Week Balanced Plan',
    'Balanced month-long preparation for learners who need structure without unsustainable daily intensity.',
    28,
    4.0,
    8.5,
    null,
    'moderate',
    'published',
    now(),
    jsonb_build_object(
      'weeks', jsonb_build_array(
        jsonb_build_object('label', 'Week 1', 'focus', jsonb_build_array('Foundations', 'Decision clarity', 'Baseline diagnostic')),
        jsonb_build_object('label', 'Week 2', 'focus', jsonb_build_array('Weak-skill repair', 'Question-type routines')),
        jsonb_build_object('label', 'Week 3', 'focus', jsonb_build_array('Timed execution', 'Feedback-driven revision')),
        jsonb_build_object('label', 'Week 4', 'focus', jsonb_build_array('Mock control', 'Test-day readiness'))
      ),
      'weekly_rhythm', jsonb_build_array('2 heavy days', '3 focused practice days', '1 review day', '1 recovery day'),
      'simulator_cta', '/?source=playbook&mode=balanced',
      'practice_cta', 'https://practice.ielts.schood.online/dashboard?source=playbook&plan=balanced-28'
    ),
    jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
  ),
  (
    '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid,
    'improvement-56',
    'improvement',
    '8-Week Improvement Plan',
    'Two-month structured band-improvement plan with cycling diagnostics and staged skill repair.',
    56,
    4.0,
    8.5,
    null,
    'moderate',
    'published',
    now(),
    jsonb_build_object(
      'phases', jsonb_build_array(
        jsonb_build_object('label', 'Phase 1', 'days', 14, 'goal', 'Repair foundation weaknesses'),
        jsonb_build_object('label', 'Phase 2', 'days', 21, 'goal', 'Build consistent timed performance'),
        jsonb_build_object('label', 'Phase 3', 'days', 21, 'goal', 'Consolidate and mock under pressure')
      ),
      'daily_routine', jsonb_build_array('Concept block', 'Timed task or drill', 'Error log and reflection'),
      'simulator_cta', '/?source=playbook&mode=improvement',
      'practice_cta', 'https://practice.ielts.schood.online/dashboard?source=playbook&plan=improvement-56'
    ),
    jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
  ),
  (
    '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid,
    'extended-84',
    'improvement',
    '12-Week Extended Plan',
    'Longer-horizon plan for ambitious band movement, especially when writing or speaking improvement needs repeated feedback cycles.',
    84,
    4.0,
    9.0,
    null,
    'moderate',
    'published',
    now(),
    jsonb_build_object(
      'phases', jsonb_build_array(
        jsonb_build_object('label', 'Phase 1', 'days', 21, 'goal', 'Foundation and diagnostics'),
        jsonb_build_object('label', 'Phase 2', 'days', 21, 'goal', 'Targeted skill expansion'),
        jsonb_build_object('label', 'Phase 3', 'days', 21, 'goal', 'Full-test endurance'),
        jsonb_build_object('label', 'Phase 4', 'days', 21, 'goal', 'Refinement and final review')
      ),
      'simulator_cta', '/?source=playbook&mode=extended',
      'practice_cta', 'https://practice.ielts.schood.online/dashboard?source=playbook&plan=extended-84'
    ),
    jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
  ),
  (
    '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid,
    'writing-recovery-42',
    'skill_recovery',
    'Writing Recovery Plan',
    'Skill-specific plan for learners stuck at writing plateaus such as 6.0 or 6.5 because of weak task response or thin development.',
    42,
    5.0,
    8.0,
    'writing',
    'moderate',
    'published',
    now(),
    jsonb_build_object(
      'focus_skill', 'writing',
      'weeks', jsonb_build_array(
        jsonb_build_object('label', 'Week 1-2', 'focus', jsonb_build_array('Task response', 'Idea generation')),
        jsonb_build_object('label', 'Week 3-4', 'focus', jsonb_build_array('Paragraph development', 'Accuracy under pressure')),
        jsonb_build_object('label', 'Week 5-6', 'focus', jsonb_build_array('Timed refinement', 'Feedback loops'))
      ),
      'simulator_cta', '/?source=playbook&focus=writing',
      'practice_cta', 'https://practice.ielts.schood.online/dashboard?source=playbook&focus=writing'
    ),
    jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
  )
on conflict (product_id, slug) do update
set
  plan_type = excluded.plan_type,
  title = excluded.title,
  summary = excluded.summary,
  duration_days = excluded.duration_days,
  band_min = excluded.band_min,
  band_max = excluded.band_max,
  focus_skill = excluded.focus_skill,
  intensity = excluded.intensity,
  status = excluded.status,
  published_at = excluded.published_at,
  schedule_json = excluded.schedule_json,
  metadata = coalesce(public.ielts_playbook_plan_templates.metadata, '{}'::jsonb) || excluded.metadata;

-- Seed rule sets -------------------------------------------------------------

insert into public.ielts_playbook_rule_sets (
  product_id,
  rule_key,
  rule_name,
  description,
  status,
  sort_order,
  config,
  metadata
)
values
  (
    '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid,
    'purpose_default_track',
    'Purpose Default Track',
    'Maps user purpose to Academic or General Training unless a program-specific override is present.',
    'active',
    1,
    jsonb_build_object(
      'study', 'academic',
      'work', 'general',
      'migration', 'general',
      'job', 'general',
      'visa', 'general'
    ),
    jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
  ),
  (
    '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid,
    'deadline_bucket',
    'Deadline Bucket',
    'Maps remaining days to crash, balanced, improvement, or extended planning buckets.',
    'active',
    2,
    jsonb_build_object(
      'crash_max_days', 14,
      'balanced_max_days', 35,
      'improvement_max_days', 84
    ),
    jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
  ),
  (
    '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid,
    'skill_priority',
    'Skill Priority',
    'Ranks weakest skill first, then band gap, then purpose pressure and deadline pressure.',
    'active',
    3,
    jsonb_build_object(
      'weakest_skill_bonus', 2.2,
      'band_gap_weight', 1.45,
      'deadline_pressure_bonus', 0.75,
      'purpose_pressure', jsonb_build_object('study', 0.35, 'migration', 0.55, 'work', 0.4, 'job', 0.45, 'visa', 0.55)
    ),
    jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
  ),
  (
    '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid,
    'delivery_mode_preference',
    'Delivery Mode Preference',
    'Defaults delivery mode to computer and only exposes Writing on Paper where market guidance explicitly allows it.',
    'active',
    4,
    jsonb_build_object(
      'default_mode', 'computer',
      'fallback_when_missing_market', 'computer'
    ),
    jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
  ),
  (
    '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid,
    'one_skill_retake_eligibility',
    'One Skill Retake Eligibility',
    'Shows One Skill Retake only when market guidance allows it and the original test context remains compatible.',
    'active',
    5,
    jsonb_build_object(
      'window_days', 60,
      'require_market_support', true,
      'require_delivery_match', true
    ),
    jsonb_build_object('seeded_by', '20260416113000_ielts_playbook_service')
  )
on conflict (product_id, rule_key) do update
set
  rule_name = excluded.rule_name,
  description = excluded.description,
  status = excluded.status,
  sort_order = excluded.sort_order,
  config = excluded.config,
  metadata = coalesce(public.ielts_playbook_rule_sets.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();
