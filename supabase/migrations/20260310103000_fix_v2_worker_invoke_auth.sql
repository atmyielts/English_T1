-- ============================================================================
-- Fix v2 worker invoke auth fallback
-- ----------------------------------------------------------------------------
-- Adds support for x-worker-secret (from internal_runtime_secrets) when
-- app.settings.service_role_key is unavailable.
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
  v_worker_secret text;
  v_request_id bigint;
  v_limit integer;
  v_event_type text;
  v_headers jsonb;
begin
  v_service_role_key := nullif(current_setting('app.settings.service_role_key', true), '');

  select nullif(trim(s.secret), '')
  into v_worker_secret
  from public.internal_runtime_secrets s
  where s.key = 'domain_events_worker_secret'
  limit 1;

  if v_service_role_key is null and v_worker_secret is null then
    raise warning 'domain-events-v2 invoke skipped: no service role key or worker secret is available';
    return null;
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 50), 200));
  v_event_type := coalesce(nullif(trim(p_event_type), ''), 'all');
  v_headers := jsonb_build_object('Content-Type', 'application/json');

  if v_service_role_key is not null then
    v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_service_role_key);
  end if;

  if v_worker_secret is not null then
    v_headers := v_headers || jsonb_build_object('x-worker-secret', v_worker_secret);
  end if;

  select net.http_post(
    url := 'https://bbjawctnqrufvnesdsel.supabase.co/functions/v1/domain-events-v2',
    headers := v_headers,
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
