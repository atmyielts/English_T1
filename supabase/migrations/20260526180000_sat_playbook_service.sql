-- ============================================================================
-- SAT Playbook service + admin console
-- ----------------------------------------------------------------------------
-- Authoritative SAT guidance: domains (R&W + Math), strategy modules, test-day
-- protocol, market-specific info, and personalised study plans driven by SAT
-- simulator outcomes. Mirrors the IELTS Playbook architecture so the editor
-- surface and the recommendation engine work the same way across exams.
-- ============================================================================

-- Product + plan seed ---------------------------------------------------------

insert into public.products (id, name, type, status, description, metadata)
values (
  'a8b41e2c-9a36-4caf-9bba-7212e35a8b8c'::uuid,
  'SAT Playbook',
  'course',
  'active',
  'Authoritative SAT guidance with personalised study plans tied to simulator outcomes.',
  jsonb_build_object(
    'slug', 'sat-playbook',
    'app_url', 'https://playbook.sat.schood.online',
    'short_description', 'Production-ready SAT guidance service with public strategy content and premium personalised plans.',
    'tagline', 'Know the test, target the right domains, and act on scored weaknesses.',
    'sort_order', 12,
    'bundle_compatible_with', jsonb_build_array('sat-exam-simulator', 'sat-practice'),
    'seeded_by', '20260526180000_sat_playbook_service'
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
  '5e1ba3a4-2c19-4d8d-9d1b-6a8a91a8a3aa'::uuid,
  'a8b41e2c-9a36-4caf-9bba-7212e35a8b8c'::uuid,
  'SAT Playbook Monthly',
  119000,
  'UZS',
  30,
  false,
  jsonb_build_object(
    'display_order', 1,
    'recommended', false,
    'placeholder_price', true,
    'description', 'Placeholder inactive monthly plan for SAT Playbook until commercial pricing is approved.',
    'features', jsonb_build_array(
      'Premium strategy guides',
      'Diagnostic onboarding',
      'Saved recommendations',
      'Personalised SAT study plans'
    ),
    'seeded_by', '20260526180000_sat_playbook_service'
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
  'a8b41e2c-9a36-4caf-9bba-7212e35a8b8c'::uuid,
  en.language_id,
  true,
  jsonb_build_object(
    'seeded_by', '20260526180000_sat_playbook_service',
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

create table if not exists public.sat_playbook_pages (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  parent_page_id uuid references public.sat_playbook_pages(id) on delete set null,

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

  constraint sat_playbook_pages_slug_not_blank check (length(trim(slug)) > 0),
  constraint sat_playbook_pages_title_not_blank check (length(trim(title)) > 0)
);

create unique index if not exists sat_playbook_pages_slug_locale_unique
  on public.sat_playbook_pages(locale_code, slug);

create index if not exists sat_playbook_pages_product_status_idx
  on public.sat_playbook_pages(product_id, status, visibility, sort_order, updated_at desc);

create index if not exists sat_playbook_pages_module_idx
  on public.sat_playbook_pages(module_key, page_type, sort_order);

create table if not exists public.sat_playbook_page_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.sat_playbook_pages(id) on delete cascade,
  block_type text not null
    check (block_type in ('rich_text', 'comparison_table', 'domain_grid', 'faq', 'checklist', 'resource_cards', 'timeline', 'cta_strip', 'callout', 'stat_grid')),
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

create index if not exists sat_playbook_page_sections_page_idx
  on public.sat_playbook_page_sections(page_id, status, sort_order);

create table if not exists public.sat_playbook_sources (
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

create unique index if not exists sat_playbook_sources_url_unique
  on public.sat_playbook_sources(url)
  where url is not null;

create index if not exists sat_playbook_sources_status_idx
  on public.sat_playbook_sources(status, verified_at desc, updated_at desc);

create table if not exists public.sat_playbook_page_sources (
  page_id uuid not null references public.sat_playbook_pages(id) on delete cascade,
  source_id uuid not null references public.sat_playbook_sources(id) on delete cascade,
  sort_order integer not null default 0,
  citation_note text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (page_id, source_id)
);

create index if not exists sat_playbook_page_sources_source_idx
  on public.sat_playbook_page_sources(source_id, sort_order);

create table if not exists public.sat_playbook_plan_templates (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  slug text not null,
  plan_type text not null
    check (plan_type in ('crash', 'balanced', 'improvement', 'skill_recovery')),
  title text not null,
  summary text not null default '',
  duration_days integer not null check (duration_days > 0),
  -- SAT score range: 400-1600 total, 200-800 per section. Use scaled overall.
  score_min integer not null default 400,
  score_max integer not null default 1600,
  focus_section text check (focus_section in ('reading_writing', 'math', 'both')),
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
  constraint sat_playbook_plan_templates_score_bounds
    check (score_min >= 400 and score_max <= 1600 and score_min <= score_max)
);

create index if not exists sat_playbook_plan_templates_status_idx
  on public.sat_playbook_plan_templates(product_id, status, plan_type, duration_days);

create table if not exists public.sat_playbook_rule_sets (
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

create index if not exists sat_playbook_rule_sets_status_idx
  on public.sat_playbook_rule_sets(product_id, status, sort_order, updated_at desc);

create table if not exists public.sat_playbook_user_profiles (
  user_id uuid not null references public.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,

  target_total_score integer not null default 1200,
  current_score_or_estimate integer,
  deadline_date date,
  weakest_section text check (weakest_section in ('reading_writing', 'math')),
  weakest_domain text,
  purpose text not null default 'university' check (purpose in ('university', 'scholarship', 'merit', 'placement', 'retake')),
  destination_country_code text,
  test_market_country_code text,
  preferred_delivery_mode text check (preferred_delivery_mode in ('digital_bluebook', 'paper', 'unsure')),
  prep_intensity text not null default 'balanced' check (prep_intensity in ('crash', 'balanced', 'thorough')),
  evidence_updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, product_id),
  constraint sat_playbook_user_profiles_target_range
    check (target_total_score >= 400 and target_total_score <= 1600),
  constraint sat_playbook_user_profiles_current_range
    check (current_score_or_estimate is null or (current_score_or_estimate >= 400 and current_score_or_estimate <= 1600))
);

create index if not exists sat_playbook_user_profiles_deadline_idx
  on public.sat_playbook_user_profiles(product_id, deadline_date, updated_at desc);

create table if not exists public.sat_playbook_recommendation_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  plan_template_id uuid references public.sat_playbook_plan_templates(id) on delete set null,
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

create index if not exists sat_playbook_recommendation_snapshots_user_idx
  on public.sat_playbook_recommendation_snapshots(user_id, product_id, is_current, created_at desc);

create table if not exists public.sat_playbook_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  product_id uuid not null references public.products(id) on delete cascade,
  page_id uuid references public.sat_playbook_pages(id) on delete set null,

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

create index if not exists sat_playbook_events_event_idx
  on public.sat_playbook_events(product_id, event_name, occurred_at desc);

create index if not exists sat_playbook_events_module_idx
  on public.sat_playbook_events(module_key, page_type, occurred_at desc);

-- updated_at triggers --------------------------------------------------------

drop trigger if exists sat_playbook_pages_updated_at on public.sat_playbook_pages;
create trigger sat_playbook_pages_updated_at
before update on public.sat_playbook_pages
for each row
execute procedure public.handle_user_updated_at();

drop trigger if exists sat_playbook_page_sections_updated_at on public.sat_playbook_page_sections;
create trigger sat_playbook_page_sections_updated_at
before update on public.sat_playbook_page_sections
for each row
execute procedure public.handle_user_updated_at();

drop trigger if exists sat_playbook_sources_updated_at on public.sat_playbook_sources;
create trigger sat_playbook_sources_updated_at
before update on public.sat_playbook_sources
for each row
execute procedure public.handle_user_updated_at();

drop trigger if exists sat_playbook_plan_templates_updated_at on public.sat_playbook_plan_templates;
create trigger sat_playbook_plan_templates_updated_at
before update on public.sat_playbook_plan_templates
for each row
execute procedure public.handle_user_updated_at();

drop trigger if exists sat_playbook_rule_sets_updated_at on public.sat_playbook_rule_sets;
create trigger sat_playbook_rule_sets_updated_at
before update on public.sat_playbook_rule_sets
for each row
execute procedure public.handle_user_updated_at();

drop trigger if exists sat_playbook_user_profiles_updated_at on public.sat_playbook_user_profiles;
create trigger sat_playbook_user_profiles_updated_at
before update on public.sat_playbook_user_profiles
for each row
execute procedure public.handle_user_updated_at();

drop trigger if exists sat_playbook_recommendation_snapshots_updated_at on public.sat_playbook_recommendation_snapshots;
create trigger sat_playbook_recommendation_snapshots_updated_at
before update on public.sat_playbook_recommendation_snapshots
for each row
execute procedure public.handle_user_updated_at();

-- Row-level security ---------------------------------------------------------

alter table public.sat_playbook_pages enable row level security;
alter table public.sat_playbook_page_sections enable row level security;
alter table public.sat_playbook_sources enable row level security;
alter table public.sat_playbook_page_sources enable row level security;
alter table public.sat_playbook_plan_templates enable row level security;
alter table public.sat_playbook_rule_sets enable row level security;
alter table public.sat_playbook_user_profiles enable row level security;
alter table public.sat_playbook_recommendation_snapshots enable row level security;
alter table public.sat_playbook_events enable row level security;

-- Pages: anyone can read published; admins manage.
drop policy if exists "SAT playbook pages select published" on public.sat_playbook_pages;
create policy "SAT playbook pages select published"
on public.sat_playbook_pages
for select
using (public.is_admin() or status = 'published');

drop policy if exists "SAT playbook pages admin manage" on public.sat_playbook_pages;
create policy "SAT playbook pages admin manage"
on public.sat_playbook_pages
for all
using (public.is_admin())
with check (public.is_admin());

-- Sections: anyone can read published; admins manage.
drop policy if exists "SAT playbook sections select published" on public.sat_playbook_page_sections;
create policy "SAT playbook sections select published"
on public.sat_playbook_page_sections
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.sat_playbook_pages p
    where p.id = sat_playbook_page_sections.page_id
      and p.status = 'published'
  )
);

drop policy if exists "SAT playbook sections admin manage" on public.sat_playbook_page_sections;
create policy "SAT playbook sections admin manage"
on public.sat_playbook_page_sections
for all
using (public.is_admin())
with check (public.is_admin());

-- Sources + page sources: read published; admins manage.
drop policy if exists "SAT playbook sources select published" on public.sat_playbook_sources;
create policy "SAT playbook sources select published"
on public.sat_playbook_sources
for select
using (public.is_admin() or status = 'published');

drop policy if exists "SAT playbook sources admin manage" on public.sat_playbook_sources;
create policy "SAT playbook sources admin manage"
on public.sat_playbook_sources
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "SAT playbook page sources select published" on public.sat_playbook_page_sources;
create policy "SAT playbook page sources select published"
on public.sat_playbook_page_sources
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.sat_playbook_pages p
    where p.id = sat_playbook_page_sources.page_id
      and p.status = 'published'
  )
);

drop policy if exists "SAT playbook page sources admin manage" on public.sat_playbook_page_sources;
create policy "SAT playbook page sources admin manage"
on public.sat_playbook_page_sources
for all
using (public.is_admin())
with check (public.is_admin());

-- Plan templates: read published; admins manage.
drop policy if exists "SAT playbook plan templates select published" on public.sat_playbook_plan_templates;
create policy "SAT playbook plan templates select published"
on public.sat_playbook_plan_templates
for select
using (public.is_admin() or status = 'published');

drop policy if exists "SAT playbook plan templates admin manage" on public.sat_playbook_plan_templates;
create policy "SAT playbook plan templates admin manage"
on public.sat_playbook_plan_templates
for all
using (public.is_admin())
with check (public.is_admin());

-- Rule sets: admin only.
drop policy if exists "SAT playbook rules select admin" on public.sat_playbook_rule_sets;
create policy "SAT playbook rules select admin"
on public.sat_playbook_rule_sets
for select
using (public.is_admin());

drop policy if exists "SAT playbook rules admin manage" on public.sat_playbook_rule_sets;
create policy "SAT playbook rules admin manage"
on public.sat_playbook_rule_sets
for all
using (public.is_admin())
with check (public.is_admin());

-- User profiles + recommendations: owned.
drop policy if exists "SAT playbook profiles select own" on public.sat_playbook_user_profiles;
create policy "SAT playbook profiles select own"
on public.sat_playbook_user_profiles
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "SAT playbook profiles write own" on public.sat_playbook_user_profiles;
create policy "SAT playbook profiles write own"
on public.sat_playbook_user_profiles
for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "SAT playbook recommendations select own" on public.sat_playbook_recommendation_snapshots;
create policy "SAT playbook recommendations select own"
on public.sat_playbook_recommendation_snapshots
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "SAT playbook recommendations write own" on public.sat_playbook_recommendation_snapshots;
create policy "SAT playbook recommendations write own"
on public.sat_playbook_recommendation_snapshots
for all
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

-- Events: insert by anyone (including anonymous for page_view), select own.
drop policy if exists "SAT playbook events select own" on public.sat_playbook_events;
create policy "SAT playbook events select own"
on public.sat_playbook_events
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "SAT playbook events insert own" on public.sat_playbook_events;
create policy "SAT playbook events insert own"
on public.sat_playbook_events
for insert
with check (user_id is null or auth.uid() = user_id or public.is_admin());

drop policy if exists "SAT playbook events admin manage" on public.sat_playbook_events;
create policy "SAT playbook events admin manage"
on public.sat_playbook_events
for all
using (public.is_admin())
with check (public.is_admin());
