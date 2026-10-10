-- Additive report-link revocation. The Edge service supplies the verified Auth
-- actor; browsers cannot invoke this command or choose an authorization scope.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';

create or replace function public.parent_report_revoke(p_actor uuid, p_token_id uuid)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog
set lock_timeout = '2s'
set statement_timeout = '8s'
as $$
declare
  report public.parent_report_tokens%rowtype;
  checked_report public.parent_report_tokens%rowtype;
  academy public.tenants%rowtype;
  contact public.academy_contacts%rowtype;
  auth_actor record;
  access_row record;
  staff_row record;
  parent_id uuid;
  admin_allowed boolean := false;
  issuer_allowed boolean := false;
  grant_admin_until timestamptz := '-infinity';
  grant_issuer_until timestamptz := '-infinity';
  scoped boolean;
  verified_email text;
begin
  if p_actor is null or p_token_id is null then
    return jsonb_build_object('ok', false, 'code', 'report_revoke_denied');
  end if;
  -- SHARE (not KEY SHARE) also serializes non-key role/account updates. A
  -- concurrent demotion or closure must finish before its authority is read.
  select id, email, email_confirmed_at, deleted_at into auth_actor from auth.users where id = p_actor for share;
  if not found or auth_actor.deleted_at is not null then
    return jsonb_build_object('ok', false, 'code', 'report_session_required');
  end if;
  perform 1 from public.users where id = p_actor and is_active is true for share;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'report_session_required');
  end if;
  if auth_actor.email_confirmed_at is not null then
    verified_email := lower(trim(auth_actor.email));
  end if;
  select * into report from public.parent_report_tokens where id = p_token_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'report_revoke_denied');
  end if;
  select * into academy from public.tenants where id = report.academy_id for share;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'report_revoke_denied');
  end if;
  select * into contact from public.academy_contacts
    where id = report.contact_id and academy_id = report.academy_id for share;
  -- Freeze contact/classroom scope while considering delegated issuers.
  perform m.id from public.academy_classroom_memberships m
    where m.academy_id = report.academy_id and m.contact_id = report.contact_id
    order by m.id for share;
  perform c.id from public.academy_classrooms c where c.academy_id = report.academy_id
    and exists (select 1 from public.academy_classroom_memberships m
      where m.academy_id = report.academy_id and m.contact_id = report.contact_id and m.classroom_id = c.id)
    order by c.id for share;

  for access_row in select m.* from public.tenant_memberships m
    where m.tenant_id = report.academy_id and m.user_id = p_actor order by m.id for share
  loop
    if access_row.status = 'active' then
      admin_allowed := admin_allowed or access_row.role in ('owner', 'admin', 'center_admin');
      issuer_allowed := issuer_allowed or access_row.role in ('owner', 'admin', 'center_admin', 'manager', 'counselor', 'accountant');
    end if;
  end loop;

  -- Center authority is derived from the locked child's stored relationship,
  -- never from a caller-provided academy/center ID. Malformed legacy metadata
  -- contributes no authority and cannot prevent a direct owner from revoking.
  if academy.metadata->>'service_family' = 'academy'
    and coalesce(academy.metadata->>'parent_center_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    parent_id := (academy.metadata->>'parent_center_id')::uuid;
    perform 1 from public.tenants where id = parent_id for share;
    perform 1 from public.partner_center_profiles where tenant_id = parent_id for share;
    if found then
      for access_row in select m.* from public.tenant_memberships m
        where m.tenant_id = parent_id and m.user_id = p_actor order by m.id for share
      loop
        if access_row.status = 'active' and access_row.role in ('owner', 'admin') then
          admin_allowed := true;
        end if;
      end loop;
    end if;
  end if;

  for access_row in select g.* from public.academy_role_grants g
    where g.academy_id = report.academy_id and
      (g.user_id = p_actor or (g.user_id is null and verified_email is not null and lower(trim(g.email)) = verified_email))
    order by g.id for share
  loop
    -- Invited grants are not accepted by a revocation request. Use the existing
    -- acceptance flow first. Expiry is checked after any transaction wait.
    if access_row.status <> 'active' or access_row.starts_at > clock_timestamp()
      or (access_row.expires_at is not null and access_row.expires_at <= clock_timestamp()) then continue; end if;
    if access_row.scope_type <> 'academy' and jsonb_typeof(access_row.scope_ids) <> 'array' then continue; end if;
    scoped := false;
    if contact.id is not null then
      if access_row.scope_type = 'academy' then scoped := true;
      elsif access_row.scope_type = 'students' then scoped := access_row.scope_ids ? contact.id::text;
      elsif access_row.scope_type = 'classrooms' then
        scoped := exists (select 1 from public.academy_classroom_memberships m
          join public.academy_classrooms c on c.id = m.classroom_id and c.academy_id = m.academy_id
          where m.academy_id = report.academy_id and m.contact_id = contact.id
            and access_row.scope_ids ? m.classroom_id::text);
      elsif access_row.scope_type = 'branches' then
        scoped := access_row.scope_ids ? contact.primary_branch_id::text or exists (
          select 1 from public.academy_classroom_memberships m
          join public.academy_classrooms c on c.id = m.classroom_id and c.academy_id = m.academy_id
          where m.academy_id = report.academy_id and m.contact_id = contact.id
            and access_row.scope_ids ? c.branch_id::text);
      end if;
    end if;
    if access_row.scope_type = 'academy' and access_row.role in ('owner', 'admin', 'center_admin') then
      grant_admin_until := greatest(grant_admin_until, coalesce(access_row.expires_at, 'infinity'::timestamptz));
    end if;
    if scoped and access_row.role in ('owner', 'admin', 'center_admin', 'manager', 'counselor', 'accountant', 'branch_manager') then
      grant_issuer_until := greatest(grant_issuer_until, coalesce(access_row.expires_at, 'infinity'::timestamptz));
    end if;
  end loop;

  for staff_row in select s.* from public.academy_staff s
    where s.academy_id = report.academy_id and
      (s.user_id = p_actor or (s.user_id is null and verified_email is not null and lower(trim(s.email)) = verified_email))
    order by s.id for share
  loop
    if not staff_row.is_active then continue; end if;
    admin_allowed := admin_allowed or staff_row.role in ('owner', 'admin', 'center_admin');
    issuer_allowed := issuer_allowed or staff_row.role in ('owner', 'admin', 'center_admin', 'manager', 'counselor', 'accountant');
    if staff_row.role = 'branch_manager' and contact.id is not null then
      for access_row in select a.* from public.academy_staff_branch_assignments a
        where a.academy_id = report.academy_id and a.staff_id = staff_row.id order by a.id for share
      loop
        if access_row.status = 'active' and access_row.starts_on <= (clock_timestamp() at time zone 'UTC')::date
          and (access_row.ends_on is null or access_row.ends_on >= (clock_timestamp() at time zone 'UTC')::date)
          and (access_row.branch_id = contact.primary_branch_id or exists (
            select 1 from public.academy_classroom_memberships m
            join public.academy_classrooms c on c.id = m.classroom_id and c.academy_id = m.academy_id
            where m.academy_id = report.academy_id and m.contact_id = contact.id and c.branch_id = access_row.branch_id)) then
          grant_issuer_until := greatest(grant_issuer_until, coalesce(
            ((access_row.ends_on + 1)::timestamp at time zone 'UTC'), 'infinity'::timestamptz));
        end if;
      end loop;
    end if;
  end loop;

  -- Owning the historical link is insufficient by itself. Current admins can
  -- revoke any link; a current reporting delegate can revoke their own link
  -- only while its student is still in the delegate's authorized scope.
  if not (admin_allowed or grant_admin_until > clock_timestamp())
    and not (report.created_by = p_actor and (issuer_allowed or grant_issuer_until > clock_timestamp())) then
    return jsonb_build_object('ok', false, 'code', 'report_revoke_denied');
  end if;
  select * into checked_report from public.parent_report_tokens where id = p_token_id for update;
  if not found or checked_report.academy_id <> report.academy_id
    or checked_report.contact_id <> report.contact_id or checked_report.created_by <> report.created_by then
    return jsonb_build_object('ok', false, 'code', 'report_revoke_unavailable');
  end if;
  -- An expiring delegation may expire while waiting for the token lock.
  if not (admin_allowed or grant_admin_until > clock_timestamp())
    and not (checked_report.created_by = p_actor and (issuer_allowed or grant_issuer_until > clock_timestamp())) then
    return jsonb_build_object('ok', false, 'code', 'report_revoke_denied');
  end if;
  if checked_report.is_active then
    update public.parent_report_tokens set is_active = false where id = p_token_id;
    insert into public.academy_access_audit_logs(academy_id, actor_user_id, action, metadata)
      values(report.academy_id, p_actor, 'parent_report_revoked', jsonb_build_object('token_id', p_token_id));
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.parent_report_revoke(uuid, uuid) from public, anon, authenticated;
grant execute on function public.parent_report_revoke(uuid, uuid) to service_role;
comment on function public.parent_report_revoke(uuid, uuid) is
  'Verified-service-only current-authority revocation; no creator-only fallback, no bearer token in audit.';
notify pgrst, 'reload schema';
commit;
