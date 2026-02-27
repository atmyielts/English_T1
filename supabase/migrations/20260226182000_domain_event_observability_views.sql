-- ============================================================================
-- Phase 4: Domain-event observability views
-- ----------------------------------------------------------------------------
-- Lightweight monitoring surfaces for backlog and failure diagnostics.
-- Views are security_invoker so RLS on domain_event_outbox still applies.
-- ============================================================================

create or replace view public.domain_event_outbox_health
with (security_invoker = on)
as
select
  event_type,
  count(*) filter (where status = 'pending') as pending_count,
  count(*) filter (where status = 'processing') as processing_count,
  count(*) filter (where status = 'failed') as failed_count,
  count(*) filter (where status = 'delivered') as delivered_count,
  max(attempts) as max_attempts,
  min(created_at) filter (where status = 'pending') as oldest_pending_at,
  max(updated_at) as last_updated_at
from public.domain_event_outbox
group by event_type;

create or replace view public.domain_event_outbox_recent_failures
with (security_invoker = on)
as
select
  id,
  event_type,
  event_version,
  aggregate_type,
  aggregate_id,
  user_id,
  status,
  attempts,
  last_error,
  occurred_at,
  created_at,
  updated_at
from public.domain_event_outbox
where status = 'failed'
order by updated_at desc;

comment on view public.domain_event_outbox_health is
  'Event pipeline health summary by event type.';

comment on view public.domain_event_outbox_recent_failures is
  'Recent failed outbox events for troubleshooting.';
