-- Partner Office referrals, platform credits, and ticket eligibility.

create table if not exists public.referral_programs (
  id uuid primary key default gen_random_uuid(),
  program_key text not null unique,
  name text not null,
  status text not null default 'inactive' check (status in ('inactive', 'active', 'paused', 'archived')),
  currency text not null default 'UZS',
  referred_discount_type text check (referred_discount_type in ('percent', 'fixed')),
  referred_discount_value integer check (referred_discount_value is null or referred_discount_value >= 0),
  referrer_credit_type text check (referrer_credit_type in ('percent', 'fixed')),
  referrer_credit_value integer check (referrer_credit_value is null or referrer_credit_value >= 0),
  referrer_credit_cap integer check (referrer_credit_cap is null or referrer_credit_cap >= 0),
  min_purchase_amount integer check (min_purchase_amount is null or min_purchase_amount >= 0),
  eligible_purchase_types text[] not null default array['plan','token_pack','seat_pack']::text[],
  first_purchase_only boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referral_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  referral_code text not null unique,
  status text not null default 'active' check (status in ('active', 'paused', 'disabled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.referral_attributions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.referral_programs(id) on delete cascade,
  referrer_user_id uuid not null references public.users(id) on delete cascade,
  referred_user_id uuid not null references public.users(id) on delete cascade,
  referral_code text not null,
  status text not null default 'pending' check (status in ('pending', 'converted', 'rejected', 'expired')),
  claimed_at timestamptz not null default now(),
  converted_payment_id uuid references public.payments(id) on delete set null,
  converted_at timestamptz,
  rejection_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referral_attributions_no_self_referral check (referrer_user_id <> referred_user_id),
  unique (program_id, referred_user_id)
);

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  attribution_id uuid not null references public.referral_attributions(id) on delete cascade,
  program_id uuid not null references public.referral_programs(id) on delete cascade,
  referrer_user_id uuid not null references public.users(id) on delete cascade,
  referred_user_id uuid not null references public.users(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  status text not null default 'issued' check (status in ('pending', 'issued', 'reversed')),
  credit_amount integer not null check (credit_amount >= 0),
  currency text not null default 'UZS',
  issued_at timestamptz,
  reversed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attribution_id, payment_id)
);

create table if not exists public.platform_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  entry_kind text not null check (entry_kind in ('grant', 'reserve', 'reversal')),
  status text not null default 'posted' check (status in ('posted', 'reserved', 'consumed', 'released', 'void')),
  amount integer not null check (amount > 0),
  currency text not null default 'UZS',
  payment_id uuid references public.payments(id) on delete set null,
  reward_id uuid references public.referral_rewards(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists referral_accounts_user_idx on public.referral_accounts(user_id);
create index if not exists referral_accounts_code_idx on public.referral_accounts(referral_code);
create index if not exists referral_attributions_referrer_idx on public.referral_attributions(referrer_user_id, created_at desc);
create index if not exists referral_attributions_referred_idx on public.referral_attributions(referred_user_id, created_at desc);
create index if not exists referral_rewards_referrer_idx on public.referral_rewards(referrer_user_id, created_at desc);
create index if not exists platform_credit_ledger_user_idx on public.platform_credit_ledger(user_id, currency, created_at desc);
create unique index if not exists platform_credit_ledger_payment_reserve_unique
  on public.platform_credit_ledger(payment_id)
  where entry_kind = 'reserve' and payment_id is not null;
create unique index if not exists platform_credit_ledger_reward_grant_unique
  on public.platform_credit_ledger(reward_id)
  where entry_kind = 'grant' and reward_id is not null;

create or replace function public.handle_partner_referrals_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists referral_programs_updated_at on public.referral_programs;
create trigger referral_programs_updated_at
before update on public.referral_programs
for each row
execute procedure public.handle_partner_referrals_updated_at();

drop trigger if exists referral_accounts_updated_at on public.referral_accounts;
create trigger referral_accounts_updated_at
before update on public.referral_accounts
for each row
execute procedure public.handle_partner_referrals_updated_at();

drop trigger if exists referral_attributions_updated_at on public.referral_attributions;
create trigger referral_attributions_updated_at
before update on public.referral_attributions
for each row
execute procedure public.handle_partner_referrals_updated_at();

drop trigger if exists referral_rewards_updated_at on public.referral_rewards;
create trigger referral_rewards_updated_at
before update on public.referral_rewards
for each row
execute procedure public.handle_partner_referrals_updated_at();

drop trigger if exists platform_credit_ledger_updated_at on public.platform_credit_ledger;
create trigger platform_credit_ledger_updated_at
before update on public.platform_credit_ledger
for each row
execute procedure public.handle_partner_referrals_updated_at();

insert into public.referral_programs (program_key, name, status, currency, metadata)
values (
  'default',
  'Default Referral Program',
  'inactive',
  'UZS',
  jsonb_build_object('created_by_migration', '20260501120000_partner_referrals_and_credits')
)
on conflict (program_key) do nothing;

alter table public.payments
  add column if not exists credit_amount integer not null default 0 check (credit_amount >= 0),
  add column if not exists referral_discount_amount integer not null default 0 check (referral_discount_amount >= 0),
  add column if not exists referral_attribution_id uuid references public.referral_attributions(id) on delete set null,
  add column if not exists purchase_type text;

create index if not exists payments_referral_attribution_idx on public.payments(referral_attribution_id);
create index if not exists payments_purchase_type_idx on public.payments(purchase_type);

create or replace function public.platform_credit_available(
  p_user_id uuid,
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
        when entry_kind = 'grant' and status = 'posted' then amount
        when entry_kind = 'reversal' and status = 'posted' then -amount
        when entry_kind = 'reserve' and status in ('reserved', 'consumed') then -amount
        else 0
      end
    ), 0)::integer
  )
  from public.platform_credit_ledger
  where user_id = p_user_id
    and upper(currency) = upper(coalesce(p_currency, 'UZS'));
$$;

create or replace function public.reserve_platform_credit(
  p_user_id uuid,
  p_tenant_id uuid,
  p_amount integer,
  p_currency text,
  p_payment_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available integer;
  v_existing public.platform_credit_ledger%rowtype;
  v_currency text := upper(coalesce(nullif(p_currency, ''), 'UZS'));
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', true, 'reserved_amount', 0, 'available_before', public.platform_credit_available(p_user_id, v_currency));
  end if;
  if p_payment_id is null then
    raise exception 'payment_id is required for credit reservation';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || v_currency));

  select * into v_existing
  from public.platform_credit_ledger
  where payment_id = p_payment_id
    and entry_kind = 'reserve'
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'ledger_id', v_existing.id,
      'reserved_amount', v_existing.amount,
      'status', v_existing.status,
      'deduped', true,
      'available_before', public.platform_credit_available(p_user_id, v_currency)
    );
  end if;

  v_available := public.platform_credit_available(p_user_id, v_currency);
  if p_amount > v_available then
    raise exception 'Insufficient credit balance';
  end if;

  insert into public.platform_credit_ledger (
    user_id,
    tenant_id,
    entry_kind,
    status,
    amount,
    currency,
    payment_id,
    metadata
  )
  values (
    p_user_id,
    p_tenant_id,
    'reserve',
    'reserved',
    p_amount,
    v_currency,
    p_payment_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_existing;

  return jsonb_build_object(
    'ok', true,
    'ledger_id', v_existing.id,
    'reserved_amount', v_existing.amount,
    'status', v_existing.status,
    'deduped', false,
    'available_before', v_available
  );
end;
$$;

create or replace function public.consume_platform_credit(
  p_payment_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.platform_credit_ledger%rowtype;
begin
  if p_payment_id is null then
    return jsonb_build_object('ok', true, 'consumed_amount', 0, 'missing_payment_id', true);
  end if;

  select * into v_row
  from public.platform_credit_ledger
  where payment_id = p_payment_id
    and entry_kind = 'reserve'
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'consumed_amount', 0, 'missing_reservation', true);
  end if;

  if v_row.status = 'consumed' then
    return jsonb_build_object('ok', true, 'ledger_id', v_row.id, 'consumed_amount', v_row.amount, 'deduped', true);
  end if;
  if v_row.status <> 'reserved' then
    return jsonb_build_object('ok', false, 'ledger_id', v_row.id, 'consumed_amount', 0, 'status', v_row.status);
  end if;

  update public.platform_credit_ledger
  set
    status = 'consumed',
    metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb)
  where id = v_row.id
  returning * into v_row;

  return jsonb_build_object('ok', true, 'ledger_id', v_row.id, 'consumed_amount', v_row.amount, 'deduped', false);
end;
$$;

create or replace function public.release_platform_credit(
  p_payment_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.platform_credit_ledger%rowtype;
begin
  if p_payment_id is null then
    return jsonb_build_object('ok', true, 'released_amount', 0, 'missing_payment_id', true);
  end if;

  select * into v_row
  from public.platform_credit_ledger
  where payment_id = p_payment_id
    and entry_kind = 'reserve'
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'released_amount', 0, 'missing_reservation', true);
  end if;

  if v_row.status = 'released' then
    return jsonb_build_object('ok', true, 'ledger_id', v_row.id, 'released_amount', v_row.amount, 'deduped', true);
  end if;
  if v_row.status <> 'reserved' then
    return jsonb_build_object('ok', false, 'ledger_id', v_row.id, 'released_amount', 0, 'status', v_row.status);
  end if;

  update public.platform_credit_ledger
  set
    status = 'released',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('released_reason', p_reason, 'released_at', now())
  where id = v_row.id
  returning * into v_row;

  return jsonb_build_object('ok', true, 'ledger_id', v_row.id, 'released_amount', v_row.amount, 'deduped', false);
end;
$$;

grant execute on function public.platform_credit_available(uuid, text) to authenticated, service_role;
grant execute on function public.reserve_platform_credit(uuid, uuid, integer, text, uuid, jsonb) to service_role;
grant execute on function public.consume_platform_credit(uuid, jsonb) to service_role;
grant execute on function public.release_platform_credit(uuid, text) to service_role;

alter table public.referral_programs enable row level security;
alter table public.referral_accounts enable row level security;
alter table public.referral_attributions enable row level security;
alter table public.referral_rewards enable row level security;
alter table public.platform_credit_ledger enable row level security;

drop policy if exists "Referral programs read authenticated" on public.referral_programs;
create policy "Referral programs read authenticated"
on public.referral_programs
for select
using (auth.role() = 'authenticated');

drop policy if exists "Referral accounts view own" on public.referral_accounts;
create policy "Referral accounts view own"
on public.referral_accounts
for select
using (auth.uid() = user_id);

drop policy if exists "Referral attributions view involved users" on public.referral_attributions;
create policy "Referral attributions view involved users"
on public.referral_attributions
for select
using (auth.uid() = referrer_user_id or auth.uid() = referred_user_id);

drop policy if exists "Referral rewards view own" on public.referral_rewards;
create policy "Referral rewards view own"
on public.referral_rewards
for select
using (auth.uid() = referrer_user_id or auth.uid() = referred_user_id);

drop policy if exists "Platform credits view own" on public.platform_credit_ledger;
create policy "Platform credits view own"
on public.platform_credit_ledger
for select
using (auth.uid() = user_id);

-- Admin-only management for referral/credit tables. Granular Edge functions still enforce RBAC.
drop policy if exists "Referral programs admin manage" on public.referral_programs;
create policy "Referral programs admin manage"
on public.referral_programs
for all
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop policy if exists "Referral accounts admin manage" on public.referral_accounts;
create policy "Referral accounts admin manage"
on public.referral_accounts
for all
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop policy if exists "Referral attributions admin manage" on public.referral_attributions;
create policy "Referral attributions admin manage"
on public.referral_attributions
for all
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop policy if exists "Referral rewards admin manage" on public.referral_rewards;
create policy "Referral rewards admin manage"
on public.referral_rewards
for all
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop policy if exists "Platform credits admin manage" on public.platform_credit_ledger;
create policy "Platform credits admin manage"
on public.platform_credit_ledger
for all
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

insert into public.admin_permissions_catalog (permission_key, label, description)
values ('admin.referrals.manage', 'Manage referrals', 'Configure referral programs and inspect credit ledger activity.')
on conflict (permission_key) do update
set
  label = excluded.label,
  description = excluded.description;

insert into public.admin_role_permissions (role, permission_key)
values
  ('admin_commerce', 'admin.referrals.manage'),
  ('admin_ops', 'admin.referrals.manage')
on conflict (role, permission_key) do nothing;

-- Mark full mock experiences as Partner Office ticket-eligible without inventing prices.
with target_experiences as (
  select e.id
  from public.experiences e
  join public.products p on p.id = e.product_id
  where e.is_active = true
    and p.status = 'active'
    and lower(coalesce(p.metadata->>'slug', '')) in (
      'ielts-simulator',
      'toefl-ibt-simulator',
      'sat-simulator',
      'itep-simulator'
    )
    and (
      lower(coalesce(e.metadata->>'catalog', '')) = 'full_test'
      or lower(coalesce(e.metadata->>'format', '')) in ('academic', 'digital_sat')
      or lower(e.name) like '%mock%'
      or lower(e.name) like '%full test%'
    )
)
update public.experiences e
set metadata =
  coalesce(e.metadata, '{}'::jsonb)
  || jsonb_build_object(
    'ticketing',
    coalesce(e.metadata->'ticketing', '{}'::jsonb)
    || jsonb_build_object(
      'eligible', true,
      'mode', 'single_sitting',
      'backfilled_at', now()
    )
  )
from target_experiences t
where e.id = t.id;
