-- ============================================================================
-- FIX: HANDLE NULL EMAIL FROM AUTH USERS
-- ============================================================================

create or replace function public.handle_auth_user_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, created_at, updated_at)
  values (
    new.id,
    coalesce(new.email, new.phone, 'unknown'),
    now(),
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.handle_tenant_bootstrap_on_user_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tenant_id uuid;
  slug_base text;
  slug_final text;
  suffix int := 0;
  display_name text;
begin
  display_name := coalesce(new.email, new.phone, 'User');
  slug_base := regexp_replace(lower(display_name), '[^a-z0-9]+', '-', 'g');
  if slug_base is null or length(slug_base) = 0 then
    slug_base := 'user-' || substring(new.id::text, 1, 8);
  end if;

  slug_final := slug_base;
  while exists (select 1 from public.tenants t where t.slug = slug_final) loop
    suffix := suffix + 1;
    slug_final := slug_base || '-' || suffix::text;
  end loop;

  insert into public.tenants (name, slug, type, created_by)
  values (display_name, slug_final, 'personal', new.id)
  returning id into tenant_id;

  insert into public.tenant_memberships (tenant_id, user_id, role, status)
  values (tenant_id, new.id, 'owner', 'active');

  return new;
end;
$$;
