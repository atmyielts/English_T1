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
