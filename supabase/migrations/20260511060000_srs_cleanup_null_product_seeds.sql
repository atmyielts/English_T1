-- ============================================================================
-- Cleanup: orphan SRS rows seeded with NULL product_id by the v1 worker
-- ============================================================================
-- The first iteration of the IELTS feedback-loop worker
-- (`supabase/functions/domain-events/index.ts`, shipped 2026-05-10) inserted
-- SRS rows with `product_id = NULL`. The practice frontend hardcodes
-- `IELTS_PRACTICE_PRODUCT_ID` on every queue/review call, so it queries the
-- table with `eq('product_id', <uuid>)` and never finds the null-product rows.
-- Result: any auto-seeded row sat unreviewable in the queue and the user's
-- "Got it" click silently created a second row instead of advancing the
-- existing one.
--
-- This migration deletes those orphan rows so the v2 worker (which now
-- queries `products.slug = 'ielts-practice'` and writes the real product_id)
-- doesn't leave duplicates side-by-side.
--
-- Scope: only rows that meet ALL of these conditions are removed:
--   - product_id IS NULL
--   - metadata->>'seeded_from_event' = 'true'    (i.e. came from our worker)
--   - review_count = 0                            (the user never interacted)
-- Anything a user reviewed (review_count > 0) is preserved out of caution
-- even though it likely became an unreachable duplicate.

delete from public.ielts_srs_question_reviews
where product_id is null
  and review_count = 0
  and (metadata ->> 'seeded_from_event') = 'true';
