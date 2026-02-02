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
