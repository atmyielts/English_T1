-- Claim-based product trials with admin-controlled limits

alter table public.platform_settings
  add column if not exists trial_limits jsonb not null default '{}'::jsonb;

-- Enforce object JSON for limits payload
alter table public.platform_settings
  drop constraint if exists platform_settings_trial_limits_is_object;

alter table public.platform_settings
  add constraint platform_settings_trial_limits_is_object
  check (jsonb_typeof(trial_limits) = 'object');

-- Trial claims ledger (one claim per user per product)
create table if not exists public.trial_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  entitlement_id uuid null references public.entitlements(id) on delete set null,
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (user_id, product_id)
);

create index if not exists idx_trial_claims_user_id on public.trial_claims(user_id);
create index if not exists idx_trial_claims_tenant_id on public.trial_claims(tenant_id);
create index if not exists idx_trial_claims_product_id on public.trial_claims(product_id);

alter table public.trial_claims enable row level security;

drop policy if exists trial_claims_owner_select on public.trial_claims;
create policy trial_claims_owner_select
  on public.trial_claims
  for select
  to authenticated
  using (user_id = auth.uid());

-- Manual claim flow: disable signup auto-grant by default
update public.platform_settings
set trial_autogrant_on_signup = false
where id = 1;
