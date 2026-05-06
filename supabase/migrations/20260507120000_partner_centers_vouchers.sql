-- Education center partner profiles, wallet ledger, and voucher inventory.

create table if not exists public.partner_center_profiles (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  display_name text not null,
  slug text not null unique,
  logo_url text,
  status text not null default 'pending' check (status in ('pending', 'active', 'paused', 'disabled')),
  package_tier text not null default 'starter' check (package_tier in ('starter', 'growth', 'premium', 'exclusive')),
  commercial_model text not null default 'prepaid_wallet' check (commercial_model in ('prepaid_wallet', 'wholesale', 'revenue_share', 'hybrid')),
  public_instructions text,
  powered_by_schood boolean not null default true,
  branding jsonb not null default '{}'::jsonb,
  commission_rules jsonb not null default '{}'::jsonb,
  wholesale_pricing jsonb not null default '{}'::jsonb,
  wallet_settings jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists partner_center_profiles_slug_lower_unique
  on public.partner_center_profiles (lower(slug));

create table if not exists public.partner_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  entry_kind text not null check (entry_kind in ('topup', 'debit', 'credit', 'commission', 'refund', 'adjustment')),
  status text not null default 'posted' check (status in ('posted', 'reserved', 'void')),
  amount integer not null check (amount > 0),
  currency text not null default 'UZS',
  voucher_batch_id uuid,
  payment_id uuid references public.payments(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_wallet_ledger_tenant_idx
  on public.partner_wallet_ledger (tenant_id, currency, created_at desc);

create table if not exists public.partner_voucher_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  batch_code text not null,
  access_kind text not null check (access_kind in ('mock_exam', 'subscription', 'seat')),
  product_id uuid references public.products(id) on delete set null,
  experience_id uuid references public.experiences(id) on delete set null,
  plan_id uuid references public.plans(id) on delete set null,
  quantity integer not null check (quantity > 0),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'void')),
  prefix text,
  source_model text not null default 'prepaid_wallet' check (source_model in ('prepaid_wallet', 'wholesale', 'revenue_share', 'manual')),
  payment_id uuid references public.payments(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, batch_code)
);

create index if not exists partner_voucher_batches_tenant_idx
  on public.partner_voucher_batches (tenant_id, created_at desc);

create table if not exists public.partner_vouchers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  batch_id uuid references public.partner_voucher_batches(id) on delete set null,
  code text not null unique,
  access_kind text not null check (access_kind in ('mock_exam', 'subscription', 'seat')),
  product_id uuid references public.products(id) on delete set null,
  experience_id uuid references public.experiences(id) on delete set null,
  plan_id uuid references public.plans(id) on delete set null,
  exam_token_id uuid references public.exam_tokens(id) on delete set null,
  seat_license_id uuid references public.seat_licenses(id) on delete set null,
  status text not null default 'unused' check (status in ('unused', 'redeemed', 'expired', 'void')),
  max_uses integer not null default 1 check (max_uses > 0),
  uses_count integer not null default 0 check (uses_count >= 0),
  expires_at timestamptz not null,
  assigned_name text,
  assigned_email text,
  assigned_phone text,
  redeemed_by uuid references public.users(id) on delete set null,
  redeemed_at timestamptz,
  source_payment_id uuid references public.payments(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_vouchers_tenant_idx
  on public.partner_vouchers (tenant_id, created_at desc);
create index if not exists partner_vouchers_batch_idx
  on public.partner_vouchers (batch_id);
create index if not exists partner_vouchers_status_idx
  on public.partner_vouchers (tenant_id, status, expires_at);
create index if not exists partner_vouchers_redeemed_by_idx
  on public.partner_vouchers (redeemed_by);

alter table public.partner_wallet_ledger
  add constraint partner_wallet_ledger_batch_fkey
  foreign key (voucher_batch_id) references public.partner_voucher_batches(id) on delete set null
  not valid;

alter table public.partner_wallet_ledger validate constraint partner_wallet_ledger_batch_fkey;

create or replace function public.handle_partner_centers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists partner_center_profiles_updated_at on public.partner_center_profiles;
create trigger partner_center_profiles_updated_at
before update on public.partner_center_profiles
for each row execute procedure public.handle_partner_centers_updated_at();

drop trigger if exists partner_wallet_ledger_updated_at on public.partner_wallet_ledger;
create trigger partner_wallet_ledger_updated_at
before update on public.partner_wallet_ledger
for each row execute procedure public.handle_partner_centers_updated_at();

drop trigger if exists partner_voucher_batches_updated_at on public.partner_voucher_batches;
create trigger partner_voucher_batches_updated_at
before update on public.partner_voucher_batches
for each row execute procedure public.handle_partner_centers_updated_at();

drop trigger if exists partner_vouchers_updated_at on public.partner_vouchers;
create trigger partner_vouchers_updated_at
before update on public.partner_vouchers
for each row execute procedure public.handle_partner_centers_updated_at();

create or replace function public.partner_wallet_available(
  p_tenant_id uuid,
  p_currency text default 'UZS'
)
returns integer
language sql
stable
as $$
  select greatest(
    0,
    coalesce(sum(
      case
        when entry_kind in ('topup', 'credit', 'commission', 'refund', 'adjustment') and status = 'posted' then amount
        when entry_kind = 'debit' and status in ('posted', 'reserved') then -amount
        else 0
      end
    ), 0)::integer
  )
  from public.partner_wallet_ledger
  where tenant_id = p_tenant_id
    and upper(currency) = upper(coalesce(p_currency, 'UZS'));
$$;

grant execute on function public.partner_wallet_available(uuid, text) to authenticated, service_role;

alter table public.partner_center_profiles enable row level security;
alter table public.partner_wallet_ledger enable row level security;
alter table public.partner_voucher_batches enable row level security;
alter table public.partner_vouchers enable row level security;

drop policy if exists "Partner center public active profiles" on public.partner_center_profiles;
create policy "Partner center public active profiles"
on public.partner_center_profiles
for select
using (status = 'active');

drop policy if exists "Partner center profiles manage by tenant admin" on public.partner_center_profiles;
create policy "Partner center profiles manage by tenant admin"
on public.partner_center_profiles
for all
using (
  exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = partner_center_profiles.tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = partner_center_profiles.tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
);

drop policy if exists "Partner wallet view by tenant membership" on public.partner_wallet_ledger;
create policy "Partner wallet view by tenant membership"
on public.partner_wallet_ledger
for select
using (
  exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = partner_wallet_ledger.tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists "Partner vouchers view by tenant membership" on public.partner_vouchers;
create policy "Partner vouchers view by tenant membership"
on public.partner_vouchers
for select
using (
  exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = partner_vouchers.tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists "Partner batches view by tenant membership" on public.partner_voucher_batches;
create policy "Partner batches view by tenant membership"
on public.partner_voucher_batches
for select
using (
  exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = partner_voucher_batches.tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

drop policy if exists "Partner wallet manage by tenant admin" on public.partner_wallet_ledger;
create policy "Partner wallet manage by tenant admin"
on public.partner_wallet_ledger
for all
using (
  exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = partner_wallet_ledger.tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = partner_wallet_ledger.tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
);

drop policy if exists "Partner batches manage by tenant admin" on public.partner_voucher_batches;
create policy "Partner batches manage by tenant admin"
on public.partner_voucher_batches
for all
using (
  exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = partner_voucher_batches.tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = partner_voucher_batches.tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
);

drop policy if exists "Partner vouchers manage by tenant admin" on public.partner_vouchers;
create policy "Partner vouchers manage by tenant admin"
on public.partner_vouchers
for all
using (
  exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = partner_vouchers.tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = partner_vouchers.tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
);

drop policy if exists "Partner center profiles admin manage" on public.partner_center_profiles;
create policy "Partner center profiles admin manage"
on public.partner_center_profiles
for all
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop policy if exists "Partner wallet admin manage" on public.partner_wallet_ledger;
create policy "Partner wallet admin manage"
on public.partner_wallet_ledger
for all
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop policy if exists "Partner batches admin manage" on public.partner_voucher_batches;
create policy "Partner batches admin manage"
on public.partner_voucher_batches
for all
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop policy if exists "Partner vouchers admin manage" on public.partner_vouchers;
create policy "Partner vouchers admin manage"
on public.partner_vouchers
for all
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

insert into public.admin_permissions_catalog (permission_key, label, description)
values ('admin.partners.manage', 'Manage partners', 'Approve education centers, adjust wallet balances, and inspect partner voucher usage.')
on conflict (permission_key) do update
set label = excluded.label,
    description = excluded.description;

insert into public.admin_role_permissions (role, permission_key)
values
  ('admin_commerce', 'admin.partners.manage'),
  ('admin_ops', 'admin.partners.manage')
on conflict (role, permission_key) do nothing;
