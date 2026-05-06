-- Education center staff invitations.

create table if not exists public.partner_center_staff_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid references public.users(id) on delete set null,
  accepted_by uuid references public.users(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email, status)
);

create index if not exists partner_center_staff_invites_tenant_idx
  on public.partner_center_staff_invites (tenant_id, created_at desc);

create index if not exists partner_center_staff_invites_email_idx
  on public.partner_center_staff_invites (lower(email), status, expires_at);

alter table public.partner_center_staff_invites enable row level security;

drop trigger if exists partner_center_staff_invites_updated_at on public.partner_center_staff_invites;
create trigger partner_center_staff_invites_updated_at
before update on public.partner_center_staff_invites
for each row execute procedure public.handle_partner_centers_updated_at();

drop policy if exists "Partner staff invites tenant admins" on public.partner_center_staff_invites;
create policy "Partner staff invites tenant admins"
on public.partner_center_staff_invites
for all
using (
  exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_id = partner_center_staff_invites.tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_id = partner_center_staff_invites.tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
);

drop policy if exists "Partner staff invitee can view own pending" on public.partner_center_staff_invites;
create policy "Partner staff invitee can view own pending"
on public.partner_center_staff_invites
for select
using (
  status = 'pending'
  and expires_at > now()
  and lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
);
