-- Money loop: tie tuition offers to classrooms, gate access on entitlement

-- ── Link an offer to a specific classroom (a "tuition" offer) ─────────────────
alter table public.academy_offers
  add column if not exists classroom_id uuid references public.academy_classrooms(id) on delete set null;

create index if not exists academy_offers_classroom_idx on public.academy_offers(classroom_id);

-- ── Helper: does a contact have active paid access to a classroom? ────────────
-- An entitlement granted from a tuition payment carries resource_type='classroom'
-- and resource_id=<classroom_id>. A classroom with no tuition offer is free (open).
create or replace function public.academy_contact_has_classroom_access(
  p_academy_id uuid,
  p_classroom_id uuid,
  p_contact_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Free if the classroom has no active tuition offer at all
  select case
    when not exists (
      select 1 from public.academy_offers o
      where o.academy_id = p_academy_id
        and o.classroom_id = p_classroom_id
        and o.is_active = true
    ) then true
    -- Otherwise require an active, unexpired classroom entitlement
    else exists (
      select 1 from public.academy_entitlements e
      where e.academy_id = p_academy_id
        and e.contact_id = p_contact_id
        and e.status = 'active'
        and e.resource_type = 'classroom'
        and e.resource_id = p_classroom_id
        and (e.expires_at is null or e.expires_at > now())
    )
  end;
$$;
