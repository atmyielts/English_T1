-- ============================================================================
-- COUPONS / DISCOUNTS
-- ============================================================================

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),

  -- Code users enter (case-insensitive unique)
  code text not null,
  description text,

  -- percent => value is 1..100
  -- fixed   => value is integer amount in coupon.currency
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  value integer not null check (value > 0),
  currency text not null default 'UZS',

  -- Scope
  product_id uuid not null references public.products(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete cascade,

  -- Lifecycle
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,

  metadata jsonb default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint coupons_percent_value_range check (
    discount_type <> 'percent' or (value >= 1 and value <= 100)
  )
);

create unique index if not exists coupons_code_lower_unique on public.coupons (lower(code));
create index if not exists coupons_product_id_idx on public.coupons (product_id);
create index if not exists coupons_plan_id_idx on public.coupons (plan_id);

create or replace function public.handle_coupons_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists coupons_updated_at on public.coupons;
create trigger coupons_updated_at
before update on public.coupons
for each row
execute procedure public.handle_coupons_updated_at();

-- Track successful uses (no limits enforced yet; this is audit/support friendly).
create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb default '{}'::jsonb
);

create unique index if not exists coupon_redemptions_payment_id_unique on public.coupon_redemptions (payment_id) where payment_id is not null;
create index if not exists coupon_redemptions_coupon_id_idx on public.coupon_redemptions (coupon_id);
create index if not exists coupon_redemptions_user_id_idx on public.coupon_redemptions (user_id);

-- Payments: store discount context for support/admin visibility.
alter table public.payments
  add column if not exists original_amount integer,
  add column if not exists discount_amount integer,
  add column if not exists coupon_code text,
  add column if not exists coupon_id uuid references public.coupons(id) on delete set null;

create index if not exists payments_coupon_id_idx on public.payments(coupon_id);

-- RLS
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;

-- Coupons can be read by authenticated users (so clients can show a friendly validation error if desired).
drop policy if exists "Coupons view (authenticated)" on public.coupons;
create policy "Coupons view (authenticated)"
on public.coupons
for select
using (auth.role() = 'authenticated');

-- Admin-only management.
drop policy if exists "Coupons manage (admin only)" on public.coupons;
create policy "Coupons manage (admin only)"
on public.coupons
for all
using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
)
with check (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "Coupon redemptions view (admin only)" on public.coupon_redemptions;
create policy "Coupon redemptions view (admin only)"
on public.coupon_redemptions
for select
using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

