-- ============================================================================
-- SESSION INTEGRITY GUARD (ANTI-TAMPERING)
-- ============================================================================
-- Sessions contain server-tracked state (deadlines, resume position, audio locks,
-- candidate token bindings, etc). End-users must NOT be able to mutate that state.
--
-- This migration enforces:
-- - No end-user edits to sessions.metadata, token_id, registration_id
-- - Monotonic session status transitions (finalized sessions can't be reopened)
-- - Server-side timestamps for started_at / completed_at / paused_at / resumed_at
--
-- Service role + migrations bypass this guard.

create or replace function public.sessions_integrity_guard()
returns trigger as $$
declare
  jwt_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '');
  uid uuid := auth.uid();
  old_status text := lower(coalesce(old.status, ''));
  new_status text := lower(coalesce(new.status, ''));
begin
  -- Bypass for internal/system roles (Edge Functions using service role key, migrations, etc.).
  if jwt_role = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if uid is null then
    raise exception 'Unauthorized';
  end if;

  -- Defensive: RLS should already enforce ownership, but we don't rely on it here.
  if uid <> old.user_id then
    raise exception 'Forbidden';
  end if;

  -- Immutable bindings / anti-tamper.
  if new.user_id is distinct from old.user_id then
    raise exception 'Cannot change user_id';
  end if;

  if new.experience_id is distinct from old.experience_id then
    raise exception 'Cannot change experience_id';
  end if;

  if new.token_id is distinct from old.token_id then
    raise exception 'Cannot change token_id';
  end if;

  if new.registration_id is distinct from old.registration_id then
    raise exception 'Cannot change registration_id';
  end if;

  if new.metadata is distinct from old.metadata then
    raise exception 'Cannot modify session metadata';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'Cannot change created_at';
  end if;

  -- Finalized sessions are immutable.
  if old_status in ('completed', 'abandoned', 'expired') and new_status is distinct from old_status then
    raise exception 'Session is finalized';
  end if;

  -- Allowed status transitions.
  if old_status = 'created' and new_status not in ('created', 'active', 'abandoned', 'expired') then
    raise exception 'Invalid session status transition';
  end if;

  if old_status = 'active' and new_status not in ('active', 'paused', 'completed', 'abandoned', 'expired') then
    raise exception 'Invalid session status transition';
  end if;

  if old_status = 'paused' and new_status not in ('paused', 'active', 'completed', 'abandoned', 'expired') then
    raise exception 'Invalid session status transition';
  end if;

  -- Server-side timestamps (prevent client-side backdating/forwarddating).
  -- started_at: set once when first activated.
  if old.started_at is not null then
    new.started_at := old.started_at;
  elsif old_status = 'created' and new_status = 'active' then
    new.started_at := now();
  else
    new.started_at := old.started_at;
  end if;

  -- completed_at: set once when finalized.
  if old.completed_at is not null then
    new.completed_at := old.completed_at;
  elsif old_status is distinct from new_status and new_status in ('completed', 'abandoned', 'expired') then
    new.completed_at := now();
  else
    new.completed_at := old.completed_at;
  end if;

  -- paused_at/resumed_at: only set on transitions; otherwise keep old value.
  if old_status is distinct from new_status then
    if new_status = 'paused' then
      new.paused_at := now();
    else
      new.paused_at := old.paused_at;
    end if;

    if old_status = 'paused' and new_status = 'active' then
      new.resumed_at := now();
    else
      new.resumed_at := old.resumed_at;
    end if;
  else
    new.paused_at := old.paused_at;
    new.resumed_at := old.resumed_at;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists sessions_integrity_guard on public.sessions;
create trigger sessions_integrity_guard
before update on public.sessions
for each row
execute procedure public.sessions_integrity_guard();

