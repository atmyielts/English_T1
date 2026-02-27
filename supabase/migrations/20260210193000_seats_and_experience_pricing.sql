-- Experience pricing + seat licenses for teacher subscriptions

alter table public.experiences
  add column if not exists price_amount integer,
  add column if not exists price_currency text not null default 'UZS';

create index if not exists experiences_price_amount_idx on public.experiences(price_amount);

create table if not exists public.seat_licenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  purchaser_id uuid references public.users(id) on delete set null,
  assigned_user_id uuid references public.users(id) on delete set null,
  assigned_tenant_id uuid references public.tenants(id) on delete set null,
  status text not null default 'unassigned' check (status in ('unassigned','active','expired','revoked')),
  expires_at timestamptz not null,
  assigned_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  payment_id uuid references public.payments(id) on delete set null,
  metadata jsonb default '{}'::jsonb
);

create index if not exists seat_licenses_tenant_id_idx on public.seat_licenses(tenant_id);
create index if not exists seat_licenses_plan_id_idx on public.seat_licenses(plan_id);
create index if not exists seat_licenses_assigned_user_id_idx on public.seat_licenses(assigned_user_id);
create index if not exists seat_licenses_status_idx on public.seat_licenses(status);

alter table public.seat_licenses enable row level security;

create policy "Seat licenses view by tenant membership"
  on public.seat_licenses
  for select
  using (
    exists (
      select 1 from public.tenant_memberships m
      where m.tenant_id = seat_licenses.tenant_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

create policy "Seat licenses manage by owner/admin"
  on public.seat_licenses
  for all
  using (
    exists (
      select 1 from public.tenant_memberships m
      where m.tenant_id = seat_licenses.tenant_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1 from public.tenant_memberships m
      where m.tenant_id = seat_licenses.tenant_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner','admin')
    )
  );
