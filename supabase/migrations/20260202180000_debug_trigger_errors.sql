-- ============================================================================
-- DEBUG: LOG TRIGGER ERRORS
-- ============================================================================

create table if not exists public.trigger_error_log (
  id uuid primary key default gen_random_uuid(),
  context text not null,
  error text not null,
  created_at timestamptz not null default now()
);

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
exception when others then
  insert into public.trigger_error_log (context, error)
  values ('handle_auth_user_insert', sqlerrm);
  raise;
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
exception when others then
  insert into public.trigger_error_log (context, error)
  values ('handle_tenant_bootstrap_on_user_insert', sqlerrm);
  raise;
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
  tenant_id uuid;
begin
  select * into settings from public.platform_settings where id = 1;

  if settings.trial_enabled and settings.trial_autogrant_on_signup then
    select m.tenant_id into tenant_id
    from public.tenant_memberships m
    where m.user_id = new.id
      and m.status = 'active'
    order by m.created_at asc
    limit 1;

    if tenant_id is not null and settings.trial_resource_id is not null then
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
        tenant_id,
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
exception when others then
  insert into public.trigger_error_log (context, error)
  values ('handle_trial_autogrant_on_user_insert', sqlerrm);
  raise;
end;
$$;
