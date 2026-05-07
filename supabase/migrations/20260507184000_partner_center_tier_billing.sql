-- Paid education center tiers: catalog, subscriptions, and upgrade audit trail.

insert into public.products (id, name, type, status, description, metadata)
values (
  '00000000-0000-4000-8000-000000000701',
  'Schood Center Office',
  'tool',
  'active',
  'Paid education center operating tiers for Schood partner centers.',
  '{"catalog":"center_tier","is_center_tier_product":true}'::jsonb
)
on conflict (id) do update
set
  name = excluded.name,
  type = excluded.type,
  status = excluded.status,
  description = excluded.description,
  metadata = excluded.metadata;

insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active, metadata)
values
  (
    '00000000-0000-4000-8000-000000000711',
    '00000000-0000-4000-8000-000000000701',
    'Growth Center Monthly',
    490000,
    'UZS',
    30,
    true,
    '{"catalog":"center_tier","is_center_tier_plan":true,"center_tier":"growth","billing_period":"monthly"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000712',
    '00000000-0000-4000-8000-000000000701',
    'Growth Center Annual',
    4900000,
    'UZS',
    365,
    true,
    '{"catalog":"center_tier","is_center_tier_plan":true,"center_tier":"growth","billing_period":"annual"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000721',
    '00000000-0000-4000-8000-000000000701',
    'Premium Center Monthly',
    990000,
    'UZS',
    30,
    true,
    '{"catalog":"center_tier","is_center_tier_plan":true,"center_tier":"premium","billing_period":"monthly"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000722',
    '00000000-0000-4000-8000-000000000701',
    'Premium Center Annual',
    9900000,
    'UZS',
    365,
    true,
    '{"catalog":"center_tier","is_center_tier_plan":true,"center_tier":"premium","billing_period":"annual"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000731',
    '00000000-0000-4000-8000-000000000701',
    'Exclusive Center Monthly',
    2500000,
    'UZS',
    30,
    true,
    '{"catalog":"center_tier","is_center_tier_plan":true,"center_tier":"exclusive","billing_period":"monthly"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000732',
    '00000000-0000-4000-8000-000000000701',
    'Exclusive Center Annual',
    25000000,
    'UZS',
    365,
    true,
    '{"catalog":"center_tier","is_center_tier_plan":true,"center_tier":"exclusive","billing_period":"annual"}'::jsonb
  )
on conflict (id) do update
set
  product_id = excluded.product_id,
  name = excluded.name,
  amount = excluded.amount,
  currency = excluded.currency,
  duration_days = excluded.duration_days,
  is_active = excluded.is_active,
  metadata = excluded.metadata;

create table if not exists public.partner_center_tier_subscriptions (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  current_tier text not null default 'starter' check (current_tier in ('starter', 'growth', 'premium', 'exclusive')),
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled', 'expired')),
  billing_period text not null default 'monthly' check (billing_period in ('monthly', 'annual', 'manual')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  payment_id uuid references public.payments(id) on delete set null,
  amount integer,
  currency text not null default 'UZS',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_center_tier_change_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  previous_tier text not null default 'starter' check (previous_tier in ('starter', 'growth', 'premium', 'exclusive')),
  requested_tier text not null check (requested_tier in ('growth', 'premium', 'exclusive')),
  billing_period text not null default 'monthly' check (billing_period in ('monthly', 'annual')),
  amount integer not null check (amount >= 0),
  currency text not null default 'UZS',
  status text not null default 'pending_payment' check (status in ('pending_payment', 'paid', 'applied', 'failed', 'canceled', 'manual_review')),
  payment_id uuid references public.payments(id) on delete set null,
  requested_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  applied_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_center_tier_change_requests_tenant_idx
  on public.partner_center_tier_change_requests (tenant_id, created_at desc);

create index if not exists partner_center_tier_change_requests_payment_idx
  on public.partner_center_tier_change_requests (payment_id)
  where payment_id is not null;

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists partner_center_tier_subscriptions_updated_at on public.partner_center_tier_subscriptions;
create trigger partner_center_tier_subscriptions_updated_at
before update on public.partner_center_tier_subscriptions
for each row execute procedure public.handle_updated_at();

drop trigger if exists partner_center_tier_change_requests_updated_at on public.partner_center_tier_change_requests;
create trigger partner_center_tier_change_requests_updated_at
before update on public.partner_center_tier_change_requests
for each row execute procedure public.handle_updated_at();

alter table public.partner_center_tier_subscriptions enable row level security;
alter table public.partner_center_tier_change_requests enable row level security;

drop policy if exists "Center tier subscriptions view by tenant membership" on public.partner_center_tier_subscriptions;
create policy "Center tier subscriptions view by tenant membership"
on public.partner_center_tier_subscriptions
for select
using (
  exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = partner_center_tier_subscriptions.tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists "Center tier subscriptions admin manage" on public.partner_center_tier_subscriptions;
create policy "Center tier subscriptions admin manage"
on public.partner_center_tier_subscriptions
for all
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and lower(u.role) like 'admin%'
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and lower(u.role) like 'admin%'
  )
);

drop policy if exists "Center tier requests view by tenant membership" on public.partner_center_tier_change_requests;
create policy "Center tier requests view by tenant membership"
on public.partner_center_tier_change_requests
for select
using (
  exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = partner_center_tier_change_requests.tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists "Center tier requests admin manage" on public.partner_center_tier_change_requests;
create policy "Center tier requests admin manage"
on public.partner_center_tier_change_requests
for all
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and lower(u.role) like 'admin%'
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and lower(u.role) like 'admin%'
  )
);
