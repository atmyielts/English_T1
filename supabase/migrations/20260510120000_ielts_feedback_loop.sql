-- ============================================================================
-- IELTS FEEDBACK LOOP: simulator outcomes -> practice SRS + playbook freshness
-- ============================================================================
-- Phase B of the IELTS ecosystem unification. Two additive changes:
--
-- 1. `ielts_playbook_user_profiles.evidence_updated_at` lets the playbook UI
--    detect that the user has fresh simulator/practice signals since the last
--    plan was generated and prompt for a regeneration.
-- 2. The `domain-events` worker now uses this column as a side-effect after
--    processing each `exam.result` event. The worker also seeds SRS rows
--    for weak question types in `ielts_srs_question_reviews` directly via
--    INSERT ... ON CONFLICT DO NOTHING, leaning on the existing unique
--    constraint `ielts_srs_unique_per_user`. No new index needed there.
--
-- This migration is the schema half. The worker code change ships separately
-- in `supabase/functions/domain-events/index.ts`.

alter table public.ielts_playbook_user_profiles
  add column if not exists evidence_updated_at timestamptz;

comment on column public.ielts_playbook_user_profiles.evidence_updated_at is
  'Set by the domain-events worker after processing simulator/practice events. '
  'The playbook UI compares this against the latest recommendation timestamp '
  'to surface a "regenerate plan" prompt when fresh evidence has arrived.';

-- Backfill: any existing profiles get evidence_updated_at = updated_at so we
-- don't show stale-plan banners to everyone on first deploy.
update public.ielts_playbook_user_profiles
set evidence_updated_at = updated_at
where evidence_updated_at is null;
