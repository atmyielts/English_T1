-- English ecosystem onboarding persistence
-- ============================================================================
-- The front-door onboarding flow (adaptive CEFR placement + goal setting) needs
-- somewhere durable to land its results so the hub can detect "already placed /
-- goal set" across sessions and devices, and so the dashboard can show a real
-- CEFR estimate instead of hardcoded fallback scores.
--
-- learner_language_goals already stores target_cefr, goal_keys, daily_time_minutes
-- and a metadata jsonb. This migration ensures the column that learning-profile-v3
-- already reads (current_cefr_estimate) exists. On production this column was very
-- likely added by an untracked drift migration, so this is written to be a no-op
-- there: `add column if not exists` is idempotent and never destructive. Per-skill
-- placement detail is stored under metadata.placement (no schema change needed).
-- ============================================================================

alter table public.learner_language_goals
  add column if not exists current_cefr_estimate text;

-- Constrain to the CEFR scale only if no constraint is already present.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'learner_language_goals_current_cefr_estimate_check'
  ) then
    alter table public.learner_language_goals
      add constraint learner_language_goals_current_cefr_estimate_check
      check (current_cefr_estimate is null
             or current_cefr_estimate in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));
  end if;
end $$;
