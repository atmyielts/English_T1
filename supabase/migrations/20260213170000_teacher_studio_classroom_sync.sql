-- Keep classroom memberships in sync with active classroom_access entitlements.

create index if not exists academy_entitlements_classroom_access_idx
  on public.academy_entitlements (academy_id, contact_id, resource_id)
  where grant_type = 'classroom_access';

create or replace function public.sync_classroom_membership_from_entitlement(
  p_academy_id uuid,
  p_contact_id uuid,
  p_classroom_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_active_entitlement boolean := false;
begin
  if p_academy_id is null or p_contact_id is null or p_classroom_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.academy_classrooms c
    where c.id = p_classroom_id
      and c.academy_id = p_academy_id
  ) then
    return;
  end if;

  select exists (
    select 1
    from public.academy_entitlements e
    where e.academy_id = p_academy_id
      and e.contact_id = p_contact_id
      and e.grant_type = 'classroom_access'
      and e.resource_id = p_classroom_id
      and e.status = 'active'
      and e.starts_at <= now()
      and (e.expires_at is null or e.expires_at >= now())
  )
  into v_has_active_entitlement;

  if v_has_active_entitlement then
    insert into public.academy_classroom_memberships (
      academy_id,
      classroom_id,
      contact_id,
      role,
      metadata
    )
    values (
      p_academy_id,
      p_classroom_id,
      p_contact_id,
      'student',
      jsonb_build_object('source', 'entitlement', 'managed', true)
    )
    on conflict (classroom_id, contact_id) do nothing;
  else
    delete from public.academy_classroom_memberships m
    where m.academy_id = p_academy_id
      and m.classroom_id = p_classroom_id
      and m.contact_id = p_contact_id
      and coalesce(m.metadata ->> 'source', '') = 'entitlement';
  end if;
end;
$$;

create or replace function public.handle_entitlement_classroom_membership_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.grant_type = 'classroom_access' and old.resource_id is not null then
      perform public.sync_classroom_membership_from_entitlement(old.academy_id, old.contact_id, old.resource_id);
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.grant_type = 'classroom_access' and old.resource_id is not null then
      perform public.sync_classroom_membership_from_entitlement(old.academy_id, old.contact_id, old.resource_id);
    end if;
  end if;

  if new.grant_type = 'classroom_access' and new.resource_id is not null then
    perform public.sync_classroom_membership_from_entitlement(new.academy_id, new.contact_id, new.resource_id);
  end if;

  return new;
end;
$$;

drop trigger if exists academy_entitlements_classroom_sync on public.academy_entitlements;
create trigger academy_entitlements_classroom_sync
after insert or update or delete on public.academy_entitlements
for each row
execute procedure public.handle_entitlement_classroom_membership_sync();

do $$
declare
  v_row record;
begin
  for v_row in
    select distinct e.academy_id, e.contact_id, e.resource_id as classroom_id
    from public.academy_entitlements e
    where e.grant_type = 'classroom_access'
      and e.resource_id is not null
  loop
    perform public.sync_classroom_membership_from_entitlement(v_row.academy_id, v_row.contact_id, v_row.classroom_id);
  end loop;
end;
$$;
