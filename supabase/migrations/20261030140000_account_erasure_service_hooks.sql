-- Account closure: cleanup hooks for services whose personal data is not a plain
-- "delete where user_id = the account" (account_personal_erasure_tables() covers
-- that case). Additive: erase_account_personal_data() and its trigger
-- account_erasure_transaction (20261010160000) are unchanged.
--
-- A second BEFORE UPDATE OF deleted_at trigger on auth.users,
-- account_erasure_transaction_services, fires right after it in the same
-- transaction (row triggers on one event fire in name order). It acts only when
-- the closure has written its receipt for this account, which that function does
-- last, and then calls every function listed by account_erasure_service_hooks():
-- each is public.<name>(p_user uuid) returns jsonb. A failing or missing hook
-- rolls back the whole closure, like the inline cleanups and the ownership guard.
--
-- Services register a hook in their own migration with the same additive pattern
-- as account_personal_erasure_tables(): read the list, append, recreate.
-- Without auth.users (isolated test databases) only the registry is installed.
begin;

do $$
begin
  if to_regprocedure('public.account_erasure_service_hooks()') is null then
    create function public.account_erasure_service_hooks() returns text[]
      language sql immutable set search_path = pg_catalog, public as $q$ select '{}'::text[] $q$;
  end if;
end
$$;
revoke all on function public.account_erasure_service_hooks() from public, anon, authenticated;
grant execute on function public.account_erasure_service_hooks() to service_role;

create or replace function public.run_account_erasure_service_hooks()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
set lock_timeout = '3s'
set statement_timeout = '20s'
as $$
declare
  hook text;
begin
  if old.deleted_at is not null or new.deleted_at is null then return new; end if;
  if to_regclass('public.account_closure_receipts') is null then return new; end if;
  -- Only an account the closure transaction has just erased (or erased before).
  if not exists (select 1 from public.account_closure_receipts where user_id = old.id) then return new; end if;
  foreach hook in array public.account_erasure_service_hooks() loop
    if hook !~ '^[a-z_][a-z0-9_]{0,62}$' or to_regprocedure(format('public.%I(uuid)', hook)) is null then
      raise exception using errcode = 'P0001', message = 'account_erasure_hook_missing', detail = hook;
    end if;
    execute format('select public.%I($1)', hook) using old.id;
  end loop;
  return new;
end;
$$;
revoke all on function public.run_account_erasure_service_hooks() from public, anon, authenticated, service_role;

do $$
begin
  if to_regclass('auth.users') is null then
    raise notice 'auth.users is not installed; account erasure service hooks are not attached';
    return;
  end if;
  execute 'drop trigger if exists account_erasure_transaction_services on auth.users';
  execute 'create trigger account_erasure_transaction_services before update of deleted_at on auth.users for each row execute function public.run_account_erasure_service_hooks()';
end
$$;

commit;
