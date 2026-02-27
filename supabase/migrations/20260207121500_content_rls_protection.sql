-- ============================================================================
-- CONTENT RLS (PROTECT PAID CONTENT)
-- ============================================================================
-- Experiences/sections/parts/content_units are the paid "test content".
-- This enables RLS and allows SELECT only for:
-- - platform admins
-- - users who are members of a tenant that has an active entitlement to the
--   product that owns the experience.

-- Helper: admin check (kept inline in policies)

-- ---------------------------------------------------------------------------
-- EXPERIENCES
-- ---------------------------------------------------------------------------
alter table public.experiences enable row level security;

drop policy if exists "Experiences select (admin)" on public.experiences;
create policy "Experiences select (admin)"
on public.experiences
for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

drop policy if exists "Experiences select (entitled)" on public.experiences;
create policy "Experiences select (entitled)"
on public.experiences
for select
using (
  exists (
    select 1
    from public.tenant_memberships tm
    join public.entitlements e on e.tenant_id = tm.tenant_id
    where tm.user_id = auth.uid()
      and tm.status = 'active'
      and e.is_active = true
      and e.resource_type = 'product'
      and e.resource_id = experiences.product_id
      and (e.starts_at is null or e.starts_at <= now())
      and (e.ends_at is null or e.ends_at >= now())
  )
);

-- ---------------------------------------------------------------------------
-- SECTIONS
-- ---------------------------------------------------------------------------
alter table public.sections enable row level security;

drop policy if exists "Sections select (admin)" on public.sections;
create policy "Sections select (admin)"
on public.sections
for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

drop policy if exists "Sections select (entitled)" on public.sections;
create policy "Sections select (entitled)"
on public.sections
for select
using (
  exists (
    select 1
    from public.experiences exp
    where exp.id = sections.experience_id
      and exists (
        select 1
        from public.tenant_memberships tm
        join public.entitlements e on e.tenant_id = tm.tenant_id
        where tm.user_id = auth.uid()
          and tm.status = 'active'
          and e.is_active = true
          and e.resource_type = 'product'
          and e.resource_id = exp.product_id
          and (e.starts_at is null or e.starts_at <= now())
          and (e.ends_at is null or e.ends_at >= now())
      )
  )
);

-- ---------------------------------------------------------------------------
-- PARTS
-- ---------------------------------------------------------------------------
alter table public.parts enable row level security;

drop policy if exists "Parts select (admin)" on public.parts;
create policy "Parts select (admin)"
on public.parts
for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

drop policy if exists "Parts select (entitled)" on public.parts;
create policy "Parts select (entitled)"
on public.parts
for select
using (
  exists (
    select 1
    from public.sections s
    join public.experiences exp on exp.id = s.experience_id
    where s.id = parts.section_id
      and exists (
        select 1
        from public.tenant_memberships tm
        join public.entitlements e on e.tenant_id = tm.tenant_id
        where tm.user_id = auth.uid()
          and tm.status = 'active'
          and e.is_active = true
          and e.resource_type = 'product'
          and e.resource_id = exp.product_id
          and (e.starts_at is null or e.starts_at <= now())
          and (e.ends_at is null or e.ends_at >= now())
      )
  )
);

-- ---------------------------------------------------------------------------
-- CONTENT_UNITS
-- ---------------------------------------------------------------------------
alter table public.content_units enable row level security;

drop policy if exists "Content units select (admin)" on public.content_units;
create policy "Content units select (admin)"
on public.content_units
for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

drop policy if exists "Content units select (entitled)" on public.content_units;
create policy "Content units select (entitled)"
on public.content_units
for select
using (
  exists (
    select 1
    from public.parts p
    join public.sections s on s.id = p.section_id
    join public.experiences exp on exp.id = s.experience_id
    where p.id = content_units.part_id
      and exists (
        select 1
        from public.tenant_memberships tm
        join public.entitlements e on e.tenant_id = tm.tenant_id
        where tm.user_id = auth.uid()
          and tm.status = 'active'
          and e.is_active = true
          and e.resource_type = 'product'
          and e.resource_id = exp.product_id
          and (e.starts_at is null or e.starts_at <= now())
          and (e.ends_at is null or e.ends_at >= now())
      )
  )
);

