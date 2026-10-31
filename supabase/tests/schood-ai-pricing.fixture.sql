-- Isolated stand-ins for the platform catalogue and payment objects the Schood AI pricing
-- migration reads and writes (after the core fixture). Column sets are the ones the
-- migration uses; the real tables live in production (20260202170000_platform_spine and
-- later). It does not replay the payment flows: payments are inserted already paid, as
-- the Click webhook leaves them.
alter table public.users add column if not exists telegram_chat_id text;
create table public.tenants (id uuid primary key default gen_random_uuid(), name text not null default 'Personal');
create table public.tenant_memberships (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('exam', 'practice', 'tool', 'course')),
  status text not null default 'active' check (status in ('draft', 'active', 'disabled', 'archived')),
  description text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  name text not null,
  amount numeric not null,
  currency text not null default 'UZS',
  duration_days integer,
  is_active boolean not null default true,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
-- The real catalogue guard (20260226203000): a plan cannot be active while its product is not.
create or replace function public.enforce_plan_active_product() returns trigger language plpgsql as $$
declare v_product_status text;
begin
  if coalesce(new.is_active, false) = false then return new; end if;
  select p.status into v_product_status from public.products p where p.id = new.product_id;
  if coalesce(v_product_status, '') <> 'active' then raise exception 'Plan % cannot be active while product % has status %', new.id, new.product_id, v_product_status; end if;
  return new;
end $$;
create trigger plans_enforce_active_product before insert or update of product_id, is_active on public.plans for each row execute procedure public.enforce_plan_active_product();
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  tenant_id uuid references public.tenants(id),
  product_id uuid,
  plan_id uuid,
  provider text not null default 'click',
  status text not null default 'pending',
  amount numeric not null default 0,
  currency text not null default 'UZS',
  created_at timestamptz not null default now()
);
create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  resource_type text not null,
  resource_id uuid,
  is_active boolean not null default true,
  starts_at timestamptz default now(),
  ends_at timestamptz,
  source text not null default 'system',
  value jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entitlements_tenant_resource_unique unique (tenant_id, resource_type, resource_id)
);
-- An existing, unrelated product and its active plan: launch must leave them alone.
insert into public.products (id, name, type, status) values ('00000000-0000-4000-8000-00000000c001', 'IELTS Simulator', 'exam', 'active');
insert into public.plans (id, product_id, name, amount, duration_days, is_active) values ('00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-00000000c001', 'Standard', 69000, 30, true);
-- Personal tenants for the four fixture people (sign-up creates one for everyone).
insert into public.tenants (id) values
  ('00000000-0000-4000-8000-0000000001a1'), ('00000000-0000-4000-8000-0000000001a2'),
  ('00000000-0000-4000-8000-0000000001a3'), ('00000000-0000-4000-8000-0000000001a4');
insert into public.tenant_memberships (tenant_id, user_id) values
  ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000001a2', '00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-8000-0000000001a3', '00000000-0000-4000-8000-0000000000a3'),
  ('00000000-0000-4000-8000-0000000001a4', '00000000-0000-4000-8000-0000000000a4');
