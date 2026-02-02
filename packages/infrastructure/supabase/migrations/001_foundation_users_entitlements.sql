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
