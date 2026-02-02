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
