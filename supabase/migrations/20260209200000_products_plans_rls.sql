-- Enable RLS + policies for products and plans (platform-facing catalog)

-- PRODUCTS
alter table public.products enable row level security;

-- Allow anyone to see active products (marketing + pricing selection).
create policy "Products read active"
on public.products
for select
using (status = 'active');

-- Admins can manage products.
create policy "Products admin manage"
on public.products
for all
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

-- PLANS
alter table public.plans enable row level security;

-- Allow anyone to see active plans (public catalog).
create policy "Plans read active"
on public.plans
for select
using (is_active = true);

-- Admins can manage plans.
create policy "Plans admin manage"
on public.plans
for all
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);
