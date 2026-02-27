
-- ===== BEGIN packages\infrastructure\supabase\migrations\001_foundation_users_entitlements.sql =====

-- ============================================================================
-- 🔒 FOUNDATION DATABASE SCHEMA — FROZEN
-- ============================================================================
-- 
-- ⚠️ DO NOT MODIFY THESE TABLES
-- ⚠️ NO PRODUCT-SPECIFIC COLUMNS ALLOWED
-- ⚠️ ANY AGENT MODIFYING THIS FILE VIOLATES THE FOUNDATION CONTRACT
--
-- These tables answer only TWO questions:
--   1. Who is the user (inside our domain)?
--   2. What is the user allowed to access?
--
-- Nothing else.
--
-- Version: 1.0.0
-- Freeze Date: 2024-12-25
-- ============================================================================


-- ============================================================================
-- 1️⃣ USERS — Domain Mirror of auth.users
-- ============================================================================
-- 
-- Purpose:
--   - Decouple domain from Supabase auth internals
--   - Store profile, role, and system-level flags
--   - Act as the root FK for everything else
--
-- Rules:
--   - 1-to-1 with auth.users
--   - Never deleted directly (soft delete only)
--   - NO product-specific columns
-- ============================================================================

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,

  -- Identity
  email text not null,
  full_name text,
  avatar_url text,

  -- System roles (NOT permissions)
  -- Examples: user, admin, staff (expand later)
  role text not null default 'user',

  -- Account state
  is_active boolean not null default true,

  -- Audit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Comment for documentation
comment on table public.users is 
  '🔒 FROZEN: Domain mirror of auth.users. DO NOT add product-specific columns.';


-- ============================================================================
-- Users: Updated At Trigger
-- ============================================================================

create or replace function public.handle_user_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger users_updated_at
before update on public.users
for each row
execute procedure public.handle_user_updated_at();


-- ============================================================================
-- 2️⃣ ENTITLEMENTS — Universal Access Control
-- ============================================================================
--
-- Purpose:
--   Answers: "Is this user allowed to do this thing right now?"
--
-- Supports:
--   - Free access
--   - Trials
--   - Paid access
--   - Admin grants
--   - Time-limited access
--   - Usage-limited access (future)
--
-- Conceptual Model:
--   An entitlement is:
--     - Granted to a user
--     - For a resource
--     - Under conditions
--
--   The resource can be:
--     - A product
--     - An experience
--     - A feature
--     - A quota
--
--   We do NOT hardcode these types.
-- ============================================================================

create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),

  -- Ownership
  user_id uuid not null references public.users(id) on delete cascade,

  -- What is being granted (flexible, not enum)
  -- Examples:
  --   resource_type = 'product', resource_id = <product_uuid>
  --   resource_type = 'experience', resource_id = <experience_uuid>
  --   resource_type = 'feature', resource_id = NULL (global feature flag)
  --   resource_type = 'unlimited_access', resource_id = NULL
  resource_type text not null,
  resource_id uuid,

  -- Access rules
  is_active boolean not null default true,
  starts_at timestamptz default now(),
  ends_at timestamptz,

  -- Optional limits (future-safe, dormant for now)
  usage_limit integer,
  usage_count integer not null default 0,

  -- Origin (for observability and debugging)
  -- Examples: system, admin, stripe, promo, trial
  source text not null default 'system',

  -- Audit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Comment for documentation
comment on table public.entitlements is 
  '🔒 FROZEN: Universal access control. Answers "can user X do Y right now?"';


-- ============================================================================
-- Entitlements: Updated At Trigger
-- ============================================================================

create trigger entitlements_updated_at
before update on public.entitlements
for each row
execute procedure public.handle_user_updated_at();


-- ============================================================================
-- 3️⃣ INDEXES — Performance Critical
-- ============================================================================

-- Find all entitlements for a user
create index if not exists entitlements_user_id_idx
on public.entitlements(user_id);

-- Find entitlements by resource
create index if not exists entitlements_resource_idx
on public.entitlements(resource_type, resource_id);

-- Fast active entitlement lookup
create index if not exists entitlements_active_idx
on public.entitlements(user_id, is_active);


-- ============================================================================
-- 4️⃣ ROW-LEVEL SECURITY — Minimal & Safe
-- ============================================================================

-- Users: Can only view themselves
alter table public.users enable row level security;

create policy "Users can view themselves"
on public.users
for select
using (auth.uid() = id);

-- Entitlements: Can only view own entitlements
alter table public.entitlements enable row level security;

create policy "Users can view own entitlements"
on public.entitlements
for select
using (auth.uid() = user_id);

-- NOTE: No insert/update policies — system-managed only via service role


-- ============================================================================
-- 🚫 WHAT YOU MUST NOT ADD (NOW OR EVER TO THIS FILE)
-- ============================================================================
--
-- ❌ product_id in users
-- ❌ exam_id in entitlements
-- ❌ permissions JSON
-- ❌ role-based logic here
-- ❌ session references
-- ❌ IELTS-specific columns
-- ❌ payment/subscription columns
--
-- Those belong elsewhere.
-- ============================================================================


-- ============================================================================
-- ✅ SANITY TEST
-- ============================================================================
--
-- If tomorrow you:
--   - Delete IELTS entirely
--   - Add TOEFL
--   - Add Math tests
--   - Add a blog
--   - Add a mobile app
--
-- 👉 These tables remain UNTOUCHED
--
-- That's how you know they're truly foundational.
-- ============================================================================

-- ===== END packages\infrastructure\supabase\migrations\001_foundation_users_entitlements.sql =====


-- ===== BEGIN packages\infrastructure\supabase\migrations\002_domain_core_structure.sql =====

-- ============================================================================
-- 🔒 DOMAIN CORE TABLES — FROZEN (Meaning, Not Evolution)
-- ============================================================================
-- 
-- ⚠️ AI AGENTS: You may READ these. You do NOT redesign them.
-- 
-- ALLOWED:
--   ✅ Add columns
--   ✅ Add indexes
--   ✅ Add metadata usage
--
-- NEVER DO:
--   ❌ Rename tables
--   ❌ Change meaning
--   ❌ Mix product logic in here
--
-- Layer: Domain Core (Exam Engine)
-- Purpose: Represent ANY structured assessment system
--
-- CRITICAL: Nothing in this hierarchy:
--   - knows about IELTS
--   - knows about time
--   - knows about scoring
--   - knows about users
--
-- That's by design.
--
-- Version: 1.0.0
-- Freeze Date: 2024-12-25
-- ============================================================================


-- ============================================================================
-- 1️⃣ PRODUCTS — "What can a user access or buy?"
-- ============================================================================
--
-- A product is the unit of access and entitlement.
--
-- Examples:
--   - IELTS Simulator
--   - TOEFL Practice
--   - Vocabulary Trainer
--
-- WHAT IT IS NOT:
--   ❌ Not an exam attempt
--   ❌ Not a test structure
--   ❌ Not content
--
-- Rules:
--   - Entitlements attach here
--   - One product → many experiences
--   - Rarely changes
-- ============================================================================

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),

  -- Human-readable name (e.g. "IELTS Academic Simulator")
  name text not null,

  -- Type of product (exam, practice, tool)
  type text not null check (type in ('exam', 'practice', 'tool', 'course')),

  -- Lifecycle state
  status text not null default 'active'
    check (status in ('draft', 'active', 'disabled', 'archived')),

  -- Optional description
  description text,

  -- Optional extensibility (pricing tier, version, flags)
  metadata jsonb default '{}'::jsonb,

  created_at timestamptz not null default now()
);

comment on table public.products is 
  '🔒 FROZEN: Unit of access/entitlement. DO NOT add product-specific columns.';


-- ============================================================================
-- 2️⃣ EXPERIENCES — "A complete structured activity a user can start"
-- ============================================================================
--
-- This is what a session is created from.
--
-- Examples:
--   - Full IELTS Academic Test
--   - IELTS Listening Mock #2
--   - Reading Practice Set A
--
-- WHAT IT IS NOT:
--   ❌ Not a user attempt
--   ❌ Not time-tracked here
--   ❌ No scoring logic
--
-- Rules:
--   - Users start sessions from experiences
--   - Experience defines structure, not behavior
--   - Timing rules come later via rules/config
-- ============================================================================

create table if not exists public.experiences (
  id uuid primary key default gen_random_uuid(),

  -- Which product this belongs to
  product_id uuid not null references public.products(id) on delete cascade,

  -- Name shown to users
  name text not null,

  -- Ordering inside product (for admin control)
  display_order integer not null default 0,

  -- Soft toggle
  is_active boolean not null default true,

  -- Future-proofing: duration, difficulty, etc
  metadata jsonb default '{}'::jsonb,

  created_at timestamptz not null default now()
);

comment on table public.experiences is 
  '🔒 FROZEN: Structured activity to start. Session created from this.';

-- Index for product lookup
create index if not exists experiences_product_id_idx 
on public.experiences(product_id);


-- ============================================================================
-- 3️⃣ SECTIONS — "Major logical divisions inside an experience"
-- ============================================================================
--
-- Examples:
--   - Listening
--   - Reading
--   - Writing
--
-- WHAT IT IS NOT:
--   ❌ No time rules
--   ❌ No navigation logic
--   ❌ No content directly
--
-- Rules:
--   - Pure structure
--   - Ordered
--   - Very stable → safe to freeze
-- ============================================================================

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),

  -- Parent experience
  experience_id uuid not null references public.experiences(id) on delete cascade,

  -- Section name (Listening, Reading, etc)
  name text not null,

  -- Order matters
  display_order integer not null,

  -- Optional future config (icons, labels)
  metadata jsonb default '{}'::jsonb,

  created_at timestamptz not null default now(),

  -- Ensure unique ordering within experience
  unique (experience_id, display_order)
);

comment on table public.sections is 
  '🔒 FROZEN: Major divisions in experience. Pure structure, no logic.';

-- Index for experience lookup
create index if not exists sections_experience_id_idx 
on public.sections(experience_id);


-- ============================================================================
-- 4️⃣ PARTS — "Subdivisions inside a section"
-- ============================================================================
--
-- Examples:
--   - Listening Part 1
--   - Reading Passage A
--
-- WHAT IT IS NOT:
--   ❌ Not questions
--   ❌ Not responses
--   ❌ No timing
--
-- Rules:
--   - Lowest structural unit
--   - Content attaches after this
--   - Freeze fully
-- ============================================================================

create table if not exists public.parts (
  id uuid primary key default gen_random_uuid(),

  -- Parent section
  section_id uuid not null references public.sections(id) on delete cascade,

  -- Part name
  name text not null,

  -- Order inside section
  display_order integer not null,

  -- Optional configuration (labels, grouping hints)
  metadata jsonb default '{}'::jsonb,

  created_at timestamptz not null default now(),

  -- Ensure unique ordering within section
  unique (section_id, display_order)
);

comment on table public.parts is 
  '🔒 FROZEN: Lowest structural unit. Content units attach to this.';

-- Index for section lookup
create index if not exists parts_section_id_idx 
on public.parts(section_id);


-- ============================================================================
-- RELATIONSHIP SUMMARY (Mental Model)
-- ============================================================================
--
-- Product
--   └── Experience
--         └── Section
--               └── Part
--                     └── Content Units (NEXT LAYER, not here)
--
-- ============================================================================


-- ============================================================================
-- WHAT COMES NEXT (Not in this migration)
-- ============================================================================
--
-- These attach ON TOP, never inside domain core:
--   - content_units
--   - sessions
--   - responses
--   - rules
--   - timing
--   - evaluation
--
-- ============================================================================

-- ===== END packages\infrastructure\supabase\migrations\002_domain_core_structure.sql =====


-- ===== BEGIN packages\infrastructure\supabase\migrations\020_ielts\001_content_units.sql =====

-- ============================================================================
-- 🟧 PRODUCT DATA LAYER — IELTS Content
-- ============================================================================
--
-- WHAT THIS LAYER IS:
--   Static, reusable exam content that exists before any user touches it.
--   This is where IELTS becomes IELTS.
--   If you delete all users tomorrow, this data still makes sense.
--
-- WHAT BELONGS HERE:
--   ✅ Questions
--   ✅ Passages
--   ✅ Audio files
--   ✅ Writing prompts
--   ✅ Instructions
--   ✅ Options (A/B/C/D)
--
-- WHAT DOES NOT BELONG:
--   ❌ User answers
--   ❌ Timing
--   ❌ Scoring
--   ❌ Sessions
--   ❌ User IDs
--
-- FREEZE STATUS:
--   ⚠️ Structure frozen, content replaceable
--   This layer evolves with product needs
--
-- Version: 1.0.0
-- Created: 2024-12-25
-- ============================================================================


-- ============================================================================
-- CONTENT_UNITS — "The smallest atomic piece of content shown to the user"
-- ============================================================================
--
-- Everything the user reads, hears, or responds to is a content unit.
--
-- HOW IT CONNECTS:
--   - Belongs to a part
--   - Is shown during a session
--   - Receives responses
--
-- TYPES (examples):
--   - instruction
--   - reading_passage
--   - question_single_choice
--   - question_multi_choice
--   - question_text
--   - question_audio
--   - audio
--   - writing_prompt
--   - image
--
-- WHY data IS JSONB:
--   Because Listening ≠ Reading ≠ Writing
--   Options differ, prompts differ
--   ⚠️ Do not normalize too early — JSONB keeps you fast
-- ============================================================================

create table if not exists public.content_units (
  id uuid primary key default gen_random_uuid(),

  -- Structural placement
  part_id uuid not null references public.parts(id) on delete cascade,

  -- What kind of content this is
  -- Examples: instruction, reading_passage, question_single_choice, 
  --           question_text, audio, writing_prompt
  type text not null,

  -- Actual payload (question text, options, audio URL, etc)
  -- Structure varies by type — see examples below
  data jsonb not null,

  -- Order inside the part
  display_order integer not null,

  -- Optional flags (difficulty, tags, IELTS-specific info)
  metadata jsonb default '{}'::jsonb,

  created_at timestamptz not null default now(),

  -- Ensure unique ordering within part
  unique (part_id, display_order)
);

comment on table public.content_units is 
  '🟧 PRODUCT: Atomic content pieces. Structure frozen, content evolves.';

-- Index for part lookup
create index if not exists content_units_part_id_idx 
on public.content_units(part_id);

-- Index for type filtering
create index if not exists content_units_type_idx 
on public.content_units(type);


-- ============================================================================
-- CONTENT DATA EXAMPLES (for reference, not enforced in schema)
-- ============================================================================
--
-- Multiple Choice Question:
-- {
--   "question": "What is the main purpose of the passage?",
--   "options": [
--     { "id": "A", "text": "To explain a theory" },
--     { "id": "B", "text": "To compare methods" },
--     { "id": "C", "text": "To describe a process" },
--     { "id": "D", "text": "To present research findings" }
--   ]
-- }
--
-- Reading Passage:
-- {
--   "title": "The History of Writing",
--   "text": "Writing systems have evolved over thousands of years...",
--   "word_count": 892
-- }
--
-- Writing Task:
-- {
--   "task_type": "task2",
--   "prompt": "Some people believe that technology has made our lives more complicated...",
--   "word_limit": 250,
--   "time_suggested": 40
-- }
--
-- Audio Content:
-- {
--   "url": "/audio/listening-section-1.mp3",
--   "duration": 420,
--   "transcript": "..."
-- }
--
-- Instruction:
-- {
--   "text": "You will hear a conversation between two students...",
--   "format": "markdown"
-- }
--
-- ============================================================================

-- ===== END packages\infrastructure\supabase\migrations\020_ielts\001_content_units.sql =====


-- ===== BEGIN packages\infrastructure\supabase\migrations\020_ielts\002_sessions_responses.sql =====

-- ============================================================================
-- 🟥 RUNTIME LAYER — User Interaction
-- ============================================================================
--
-- This is where real users exist.
-- If product data is a book, runtime is someone reading and writing in it.
--
-- WHAT THIS LAYER IS:
--   User attempts, answers, and interactions with content
--
-- FREEZE STATUS:
--   ⚠️ Structure frozen, data is append-only
--   Responses are IMMUTABLE
--
-- Version: 1.0.0
-- Created: 2024-12-25
-- ============================================================================


-- ============================================================================
-- SESSIONS — "A user attempting an experience at a point in time"
-- ============================================================================
--
-- One session = one test attempt.
--
-- WHAT IT IS:
--   ✅ User attempt at an experience
--   ✅ Lifecycle tracking (created → active → completed)
--   ✅ Timing container
--
-- WHAT IT IS NOT:
--   ❌ Not content
--   ❌ Not answers
--   ❌ Not scoring
--
-- IMPORTANT RULES:
--   - Session references experience, not product
--   - Session owns timing
--   - One user → many sessions
-- ============================================================================

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),

  -- Who is taking this session
  user_id uuid not null references public.users(id) on delete cascade,
  
  -- What experience is being attempted
  experience_id uuid not null references public.experiences(id),

  -- Lifecycle status
  status text not null default 'created'
    check (status in ('created', 'active', 'paused', 'completed', 'abandoned', 'expired')),

  -- Timing
  started_at timestamptz,
  paused_at timestamptz,
  resumed_at timestamptz,
  completed_at timestamptz,

  -- Store timing, resume info, device, current position, etc
  metadata jsonb default '{}'::jsonb,

  created_at timestamptz not null default now()
);

comment on table public.sessions is 
  '🟥 RUNTIME: User attempt at experience. Structure frozen.';

-- Index for user lookup
create index if not exists sessions_user_id_idx 
on public.sessions(user_id);

-- Index for experience lookup
create index if not exists sessions_experience_id_idx 
on public.sessions(experience_id);

-- Index for finding resumable sessions
create index if not exists sessions_user_status_idx 
on public.sessions(user_id, status);


-- ============================================================================
-- RESPONSES — "Raw truth of what the user submitted"
-- ============================================================================
--
-- This is SACRED DATA.
-- Never overwrite. Never mutate.
--
-- WHAT IT IS:
--   ✅ Exact user submission
--   ✅ Immutable record
--   ✅ Audit trail
--
-- WHAT IT IS NOT:
--   ❌ Not scoring
--   ❌ Not evaluation
--   ❌ Not correctness
--
-- IMMUTABILITY RULE (CRITICAL):
--   ❌ No UPDATE
--   ❌ No DELETE
--   ✅ New row for every change
--
-- This enables:
--   - Re-evaluation
--   - AI grading
--   - Audits
--   - Appeals
-- ============================================================================

create table if not exists public.responses (
  id uuid primary key default gen_random_uuid(),

  -- Which session this belongs to
  session_id uuid not null references public.sessions(id) on delete cascade,
  
  -- Which content unit is being responded to
  content_unit_id uuid not null references public.content_units(id),

  -- Response type: text, single_choice, multi_choice, audio, file
  type text not null,

  -- User answer payload (structure varies by type)
  -- Examples:
  --   { "text": "I strongly agree because..." }
  --   { "selected_option": "B" }
  --   { "selected_options": ["A", "C"] }
  --   { "audio_url": "/uploads/...", "duration": 120 }
  data jsonb not null,

  -- When this response was submitted (not editable)
  submitted_at timestamptz not null default now(),

  -- Optional metadata (time taken, attempt number, etc)
  metadata jsonb default '{}'::jsonb
);

comment on table public.responses is 
  '🟥 RUNTIME: IMMUTABLE user submissions. NO UPDATE, NO DELETE.';

-- Index for session lookup
create index if not exists responses_session_id_idx 
on public.responses(session_id);

-- Index for content unit lookup
create index if not exists responses_content_unit_id_idx 
on public.responses(content_unit_id);

-- Index for finding responses by session + content
create index if not exists responses_session_content_idx 
on public.responses(session_id, content_unit_id);


-- ============================================================================
-- ROW-LEVEL SECURITY
-- ============================================================================

-- Sessions: Users can only see their own sessions
alter table public.sessions enable row level security;

create policy "Users can view own sessions"
on public.sessions
for select
using (auth.uid() = user_id);

-- Responses: Users can only see their own responses
alter table public.responses enable row level security;

create policy "Users can view own responses"
on public.responses
for select
using (
  session_id in (
    select id from public.sessions where user_id = auth.uid()
  )
);


-- ============================================================================
-- RESPONSE DATA EXAMPLES (for reference)
-- ============================================================================
--
-- Text Response (Writing):
-- {
--   "text": "I strongly agree with the statement because..."
-- }
--
-- Single Choice:
-- {
--   "selected_option": "B"
-- }
--
-- Multi Choice:
-- {
--   "selected_options": ["A", "C", "D"]
-- }
--
-- Audio Response (Speaking):
-- {
--   "audio_url": "/uploads/responses/123.mp3",
--   "duration": 120,
--   "file_size": 1048576
-- }
--
-- ============================================================================


-- ============================================================================
-- HOW THESE LAYERS CONNECT (CLEAR FLOW)
-- ============================================================================
--
-- Product (IELTS Simulator)
--   ↓
-- Experience (Full IELTS Test)
--   ↓
-- Sections (Listening / Reading)
--   ↓
-- Parts (Listening Part 1)
--   ↓
-- Content Units (questions, audio)
--   ↓
-- Session (user attempt)
--   ↓
-- Responses (user answers)
--
-- ============================================================================

-- ===== END packages\infrastructure\supabase\migrations\020_ielts\002_sessions_responses.sql =====


-- ===== BEGIN packages\infrastructure\supabase\migrations\003_platform_settings_payments.sql =====

-- ============================================================================
-- PLATFORM SETTINGS, ADMINS, AND PAYMENTS (NON-PRODUCT SPECIFIC)
-- ============================================================================

-- 1) Platform settings (singleton)
create table if not exists public.platform_settings (
  id integer primary key default 1,

  trial_enabled boolean not null default false,
  trial_days integer not null default 15,
  trial_autogrant_on_signup boolean not null default false,
  trial_once_per_user boolean not null default true,
  trial_resource_type text not null default 'product',
  trial_resource_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint platform_settings_singleton check (id = 1)
);

insert into public.platform_settings (id)
values (1)
on conflict (id) do nothing;

create or replace function public.handle_platform_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger platform_settings_updated_at
before update on public.platform_settings
for each row
execute procedure public.handle_platform_settings_updated_at();

alter table public.platform_settings enable row level security;

create policy "Platform settings view (authenticated)"
on public.platform_settings
for select
using (auth.role() = 'authenticated');

create policy "Platform settings update (admin only)"
on public.platform_settings
for update
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

-- 2) Platform admins (bootstrap)
create table if not exists public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create policy "Platform admins view (admin only)"
on public.platform_admins
for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

create policy "Platform admins manage (admin only)"
on public.platform_admins
for insert
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

create policy "Platform admins update (admin only)"
on public.platform_admins
for update
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

-- 3) Auto-assign admin role by email on user insert
create or replace function public.handle_admin_role_on_user_insert()
returns trigger as $$
begin
  if exists (select 1 from public.platform_admins a where a.email = new.email) then
    update public.users set role = 'admin' where id = new.id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists users_admin_role on public.users;
create trigger users_admin_role
after insert on public.users
for each row
execute procedure public.handle_admin_role_on_user_insert();

-- 4) Trial auto-grant on signup
create or replace function public.handle_trial_autogrant_on_user_insert()
returns trigger as $$
declare
  settings record;
  trial_ends timestamptz;
begin
  select * into settings from public.platform_settings where id = 1;

  if settings.trial_enabled and settings.trial_autogrant_on_signup then
    if settings.trial_resource_id is not null then
      if settings.trial_once_per_user then
        if exists (
          select 1 from public.entitlements e
          where e.user_id = new.id
            and e.resource_type = settings.trial_resource_type
            and e.resource_id = settings.trial_resource_id
            and e.source = 'trial'
        ) then
          return new;
        end if;
      end if;

      trial_ends := now() + make_interval(days => settings.trial_days);

      insert into public.entitlements (
        user_id,
        resource_type,
        resource_id,
        is_active,
        starts_at,
        ends_at,
        source
      ) values (
        new.id,
        settings.trial_resource_type,
        settings.trial_resource_id,
        true,
        now(),
        trial_ends,
        'trial'
      );
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists users_trial_autogrant on public.users;
create trigger users_trial_autogrant
after insert on public.users
for each row
execute procedure public.handle_trial_autogrant_on_user_insert();

-- 5) Payments table (provider-agnostic)
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),

  user_id uuid references public.users(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,

  provider text not null,
  provider_transaction_id text not null,

  amount integer not null,
  currency text not null default 'UZS',
  status text not null default 'pending',

  metadata jsonb default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (provider, provider_transaction_id)
);

create or replace function public.handle_payments_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger payments_updated_at
before update on public.payments
for each row
execute procedure public.handle_payments_updated_at();

create index if not exists payments_user_id_idx on public.payments(user_id);
create index if not exists payments_product_id_idx on public.payments(product_id);

alter table public.payments enable row level security;

create policy "Payments view own"
on public.payments
for select
using (auth.uid() = user_id);

-- Inserts/updates should be performed by service role only (edge functions)

-- 6) Optional bootstrap admin
-- Intentionally not seeding an email in repo.
-- After creating your first account, run:
--   node tools/make-admin.mjs <email>

-- ===== END packages\infrastructure\supabase\migrations\003_platform_settings_payments.sql =====


-- ===== BEGIN packages\infrastructure\supabase\migrations\004_auth_users_mirror.sql =====

-- ============================================================================
-- AUTH USERS MIRROR (FOUNDATION SAFE)
-- ============================================================================

create or replace function public.handle_auth_user_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, created_at, updated_at)
  values (new.id, new.email, now(), now())
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists auth_users_to_public_users on auth.users;
create trigger auth_users_to_public_users
after insert on auth.users
for each row
execute procedure public.handle_auth_user_insert();

-- ===== END packages\infrastructure\supabase\migrations\004_auth_users_mirror.sql =====


-- ===== BEGIN packages\infrastructure\supabase\migrations\005_tenants.sql =====

-- ============================================================================
-- TENANCY (PLATFORM LAYER)
-- ============================================================================

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  type text not null default 'personal' check (type in ('personal', 'team', 'org')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists tenant_memberships_user_id_idx on public.tenant_memberships(user_id);
create index if not exists tenant_memberships_tenant_id_idx on public.tenant_memberships(tenant_id);

alter table public.tenants enable row level security;
alter table public.tenant_memberships enable row level security;

create policy "Tenants view via membership"
on public.tenants
for select
using (
  exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = tenants.id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

create policy "Memberships view own"
on public.tenant_memberships
for select
using (auth.uid() = user_id);

-- Bootstrap: personal tenant + membership on user insert
create or replace function public.handle_tenant_bootstrap_on_user_insert()
returns trigger as $$
declare
  tenant_id uuid;
  slug_base text;
  slug_final text;
  suffix int := 0;
begin
  slug_base := regexp_replace(lower(new.email), '[^a-z0-9]+', '-', 'g');
  if slug_base is null or length(slug_base) = 0 then
    slug_base := 'user-' || substring(new.id::text, 1, 8);
  end if;

  slug_final := slug_base;
  while exists (select 1 from public.tenants t where t.slug = slug_final) loop
    suffix := suffix + 1;
    slug_final := slug_base || '-' || suffix::text;
  end loop;

  insert into public.tenants (name, slug, type, created_by)
  values (new.email, slug_final, 'personal', new.id)
  returning id into tenant_id;

  insert into public.tenant_memberships (tenant_id, user_id, role, status)
  values (tenant_id, new.id, 'owner', 'active');

  return new;
end;
$$ language plpgsql;

drop trigger if exists users_tenant_bootstrap on public.users;
create trigger users_tenant_bootstrap
after insert on public.users
for each row
execute procedure public.handle_tenant_bootstrap_on_user_insert();

-- ===== END packages\infrastructure\supabase\migrations\005_tenants.sql =====


-- ===== BEGIN packages\infrastructure\supabase\migrations\006_entitlements_tenant_scope.sql =====

-- ============================================================================
-- ENTITLEMENTS TENANT SCOPE
-- ============================================================================

alter table public.entitlements
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;

alter table public.entitlements
  add column if not exists value jsonb default '{}'::jsonb;

-- Backfill tenant_id for existing entitlements
update public.entitlements e
set tenant_id = m.tenant_id
from public.tenant_memberships m
where e.tenant_id is null
  and e.user_id = m.user_id
  and m.status = 'active';

-- Enforce non-null after backfill
alter table public.entitlements
  alter column tenant_id set not null;

-- Unique entitlement per tenant/resource
alter table public.entitlements
  add constraint entitlements_tenant_resource_unique unique (tenant_id, resource_type, resource_id);

-- RLS: allow tenant members to view entitlements
create policy "Entitlements view by tenant membership"
on public.entitlements
for select
using (
  exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = entitlements.tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

-- ===== END packages\infrastructure\supabase\migrations\006_entitlements_tenant_scope.sql =====


-- ===== BEGIN packages\infrastructure\supabase\migrations\007_trial_autogrant_tenant.sql =====

-- ============================================================================
-- TRIAL AUTOGRANT (TENANT SCOPED)
-- ============================================================================

create or replace function public.handle_trial_autogrant_on_user_insert()
returns trigger as $$
declare
  settings record;
  trial_ends timestamptz;
  tenant_id uuid;
begin
  select * into settings from public.platform_settings where id = 1;

  if settings.trial_enabled and settings.trial_autogrant_on_signup then
    select m.tenant_id into tenant_id
    from public.tenant_memberships m
    where m.user_id = new.id
      and m.status = 'active'
    order by m.created_at asc
    limit 1;

    if tenant_id is not null and settings.trial_resource_id is not null then
      trial_ends := now() + make_interval(days => settings.trial_days);

      insert into public.entitlements (
        user_id,
        tenant_id,
        resource_type,
        resource_id,
        is_active,
        starts_at,
        ends_at,
        source
      ) values (
        new.id,
        tenant_id,
        settings.trial_resource_type,
        settings.trial_resource_id,
        true,
        now(),
        trial_ends,
        'trial'
      )
      on conflict (tenant_id, resource_type, resource_id)
      do update set
        is_active = excluded.is_active,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        source = excluded.source;
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists users_trial_autogrant on public.users;
create trigger users_trial_autogrant
after insert on public.users
for each row
execute procedure public.handle_trial_autogrant_on_user_insert();

-- ===== END packages\infrastructure\supabase\migrations\007_trial_autogrant_tenant.sql =====


-- ===== BEGIN packages\infrastructure\supabase\migrations\008_payments_hardening.sql =====

-- ============================================================================
-- PAYMENTS HARDENING (SERVER-PRICED + TENANT SCOPED)
-- ============================================================================

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  amount integer not null,
  currency text not null default 'UZS',
  duration_days integer,
  is_active boolean not null default true,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists plans_product_id_idx on public.plans(product_id);

alter table public.payments
  add column if not exists tenant_id uuid references public.tenants(id) on delete set null,
  add column if not exists plan_id uuid references public.plans(id) on delete set null,
  add column if not exists provider_payload jsonb default '{}'::jsonb;

-- Backfill tenant_id for existing payments
update public.payments p
set tenant_id = m.tenant_id
from public.tenant_memberships m
where p.tenant_id is null
  and p.user_id = m.user_id
  and m.status = 'active';

create index if not exists payments_tenant_id_idx on public.payments(tenant_id);
create index if not exists payments_plan_id_idx on public.payments(plan_id);

-- Optional: enforce unique provider transaction
alter table public.payments
  add constraint payments_provider_txn_unique unique (provider, provider_transaction_id);

-- RLS: tenant members can view payments tied to their tenant
create policy "Payments view by tenant membership"
on public.payments
for select
using (
  exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = payments.tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

-- ===== END packages\infrastructure\supabase\migrations\008_payments_hardening.sql =====


-- ===== BEGIN packages\infrastructure\supabase\migrations\009_seed_ielts_product_plan.sql =====

-- ============================================================================
-- SEED: IELTS PRODUCT + DEFAULT PLAN (MVP)
-- ============================================================================

-- ???? UUIDs so apps/tests can reference deterministically
-- You can change later by inserting new rows and updating references.

insert into public.products (id, name, type, status, description)
values (
  '11111111-1111-1111-1111-111111111111',
  'IELTS Academic Simulator',
  'exam',
  'active',
  'IELTS Academic exam simulator (Listening/Reading/Writing)'
)
on conflict (id) do nothing;

insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Monthly Access',
  99000,
  'UZS',
  30,
  true
)
on conflict (id) do nothing;

update public.platform_settings
set trial_resource_id = '11111111-1111-1111-1111-111111111111'
where id = 1
  and trial_resource_id is null;

-- ===== END packages\infrastructure\supabase\migrations\009_seed_ielts_product_plan.sql =====

