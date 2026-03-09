-- ============================================================================
-- Optional v2 domain-events worker invocation helper (no scheduler changes)
-- ----------------------------------------------------------------------------
-- This migration is intentionally non-invasive:
-- - does NOT modify existing domain-events scheduler
-- - does NOT replace existing invoke_domain_events_worker()
-- - provides opt-in function for manual/controlled v2 runs only
-- ============================================================================

create or replace function public.invoke_domain_events_worker_v2(
  p_limit integer default 50,
  p_event_type text default 'all'
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_service_role_key text;
  v_request_id bigint;
  v_limit integer;
  v_event_type text;
begin
  v_service_role_key := nullif(current_setting('app.settings.service_role_key', true), '');
  if v_service_role_key is null then
    raise warning 'domain-events-v2 invoke skipped: app.settings.service_role_key is not available';
    return null;
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 50), 200));
  v_event_type := coalesce(nullif(trim(p_event_type), ''), 'all');

  select net.http_post(
    url := 'https://bbjawctnqrufvnesdsel.supabase.co/functions/v1/domain-events-v2',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := jsonb_build_object(
      'limit', v_limit,
      'event_type', v_event_type
    )
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.invoke_domain_events_worker_v2(integer, text) from public;
