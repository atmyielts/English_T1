-- ============================================================================
-- PAYMENTS: GRANT TRACKING
-- ============================================================================

alter table public.payments
  add column if not exists granted_at timestamptz,
  add column if not exists grant_error text;
