-- ============================================================================
-- FIX: DISAMBIGUATE tenant_id IN TRIGGER FUNCTIONS
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
    coalesce(new.email, 'unknown'),
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
  v_tenant_id uuid;
  slug_base text;
  slug_final text;
  suffix int := 0;
  display_name text;
begin
  display_name := coalesce(new.email, 'User');
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
  returning id into v_tenant_id;

  insert into public.tenant_memberships (tenant_id, user_id, role, status)
  values (v_tenant_id, new.id, 'owner', 'active');

  return new;
end;
$$;

create or replace function public.handle_trial_autogrant_on_user_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings record;
  trial_ends timestamptz;
  v_tenant_id uuid;
begin
  select * into settings from public.platform_settings where id = 1;

  if settings.trial_enabled and settings.trial_autogrant_on_signup then
    select m.tenant_id into v_tenant_id
    from public.tenant_memberships m
    where m.user_id = new.id
      and m.status = 'active'
    order by m.created_at asc
    limit 1;

    if v_tenant_id is not null and settings.trial_resource_id is not null then
      trial_ends := now() + make_interval(days => settings.trial_days);

      insert into public.entitlements (
        user_id,
        tenant_id,
        resource_type,
        resource_id,
        is_active,
        starts_at,
        ends_at,
        source
      ) values (
        new.id,
        v_tenant_id,
        settings.trial_resource_type,
        settings.trial_resource_id,
        true,
        now(),
        trial_ends,
        'trial'
      )
      on conflict (tenant_id, resource_type, resource_id)
      do update set
        is_active = excluded.is_active,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        source = excluded.source;
    end if;
  end if;

  return new;
end;
$$;
