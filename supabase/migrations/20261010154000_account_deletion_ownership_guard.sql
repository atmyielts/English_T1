-- Ownership protection is one part of the approved account-retention policy.
-- This does NOT implement personal-data erasure or authorize soft deletion.
-- Keep this backend-first: install before the account endpoint uses preflight.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

create or replace function public.account_deletion_preflight(p_actor uuid)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
set lock_timeout = '3s'
set statement_timeout = '15s'
as $$
declare
  scope_id uuid;
  scope_type text;
  scope_creator uuid;
  scope_business boolean;
  institutional_table text;
begin
  if p_actor is null or not exists(select 1 from public.users where id=p_actor) then
    return jsonb_build_object('eligible',false,'code','account_session_required');
  end if;
  -- Blocks new membership FK inserts while the final Auth transaction runs.
  -- Contention with tenant-first operations may abort; bounded timeouts and
  -- transaction rollback are intentional, never partial ownership changes.
  perform 1 from public.users where id=p_actor for update;

  -- Stable tenant order. Lock the tenant BEFORE its memberships. Existing
  -- ownership rows and tenant FK checks then serialize with the final guard.
  for scope_id in
    select t.id from public.tenants t
    where t.created_by=p_actor or exists(
      select 1 from public.tenant_memberships m
      where m.tenant_id=t.id and m.user_id=p_actor
    ) order by t.id
  loop
    select t.type,t.created_by into scope_type,scope_creator
      from public.tenants t where t.id=scope_id for update;
    perform 1 from public.tenant_memberships m
      where m.tenant_id=scope_id order by m.id for update;

    scope_business := scope_type <> 'personal';
    -- Some older academies/centers used a personal tenant. Stored institutional
    -- records take precedence over that legacy tenant label.
    -- Fixed, reviewed workspace anchors; optional tables cover deployments
    -- where Academy has not yet been installed.
    foreach institutional_table in array array['academy_contacts','academy_staff','academy_classrooms','academy_branding'] loop
      exit when scope_business;
      if to_regclass('public.'||institutional_table) is not null then
        execute format('select exists(select 1 from public.%I where academy_id=$1)',institutional_table)
          into scope_business using scope_id;
      end if;
    end loop;
    if not scope_business and to_regclass('public.partner_center_profiles') is not null then
      execute 'select exists(select 1 from public.partner_center_profiles where tenant_id=$1)'
        into scope_business using scope_id;
    end if;
    if not scope_business then continue; end if;
    -- A simultaneous deactivation of the replacement owner cannot make an
    -- otherwise orphaned historical workspace appear safe to delete.
    perform 1 from public.users u where u.id in(
      select m.user_id from public.tenant_memberships m
      where m.tenant_id=scope_id and m.user_id<>p_actor
        and m.role='owner' and m.status='active'
    ) order by u.id for share;

    -- Any current owner must transfer/demote their own ownership, even if
    -- another owner exists. Historical created_by attribution can remain when
    -- another active, non-deactivated owner has already taken responsibility.
    if exists(select 1 from public.tenant_memberships m
        where m.tenant_id=scope_id and m.user_id=p_actor
          and m.role='owner' and m.status='active')
      or (scope_creator=p_actor and not exists(
        select 1 from public.tenant_memberships m join public.users u on u.id=m.user_id
        where m.tenant_id=scope_id and m.user_id<>p_actor
          and m.role='owner' and m.status='active' and u.is_active
      )) then
      return jsonb_build_object('eligible',false,'code','account_ownership_transfer_required');
    end if;
  end loop;
  return jsonb_build_object('eligible',true);
end;
$$;
revoke all on function public.account_deletion_preflight(uuid) from public,anon,authenticated;
grant execute on function public.account_deletion_preflight(uuid) to service_role;

create or replace function public.guard_account_deletion_ownership()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
set lock_timeout = '3s'
set statement_timeout = '15s'
as $$
declare decision jsonb;
begin
  if tg_op='UPDATE' then
    if old.deleted_at is not null or new.deleted_at is null then return new; end if;
  end if;
  -- Auth can exist before the application mirror is created. Missing domain
  -- users do not own any tenant and must not break Auth cleanup.
  if exists(select 1 from public.users where id=old.id) then
    decision := public.account_deletion_preflight(old.id);
    if decision->>'code'='account_ownership_transfer_required' then
      raise exception using errcode='P0001',message='account_ownership_transfer_required';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_account_deletion_ownership() from public,anon,authenticated,service_role;
drop trigger if exists account_deletion_ownership_guard on auth.users;
create trigger account_deletion_ownership_guard
before delete or update of deleted_at on auth.users
for each row execute function public.guard_account_deletion_ownership();
commit;
