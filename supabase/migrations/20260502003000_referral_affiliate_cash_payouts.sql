-- First-class referral links and optional cash payout settlement.

alter table public.referral_programs
  add column if not exists referrer_cash_type text check (referrer_cash_type in ('percent', 'fixed')),
  add column if not exists referrer_cash_value integer check (referrer_cash_value is null or referrer_cash_value >= 0),
  add column if not exists referrer_cash_cap integer check (referrer_cash_cap is null or referrer_cash_cap >= 0),
  add column if not exists cash_payouts_enabled boolean not null default false,
  add column if not exists minimum_cash_payout_amount integer not null default 0 check (minimum_cash_payout_amount >= 0);

create table if not exists public.referral_cash_payout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'approved', 'paid', 'rejected', 'canceled')),
  amount integer not null check (amount > 0),
  currency text not null default 'UZS',
  payout_method text not null default 'cash',
  payout_details jsonb not null default '{}'::jsonb,
  note text,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  paid_at timestamptz,
  rejected_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.referral_rewards
  add column if not exists cash_amount integer not null default 0 check (cash_amount >= 0),
  add column if not exists cash_status text not null default 'none' check (cash_status in ('none', 'available', 'requested', 'approved', 'paid', 'rejected', 'void')),
  add column if not exists cash_payout_request_id uuid references public.referral_cash_payout_requests(id) on delete set null,
  add column if not exists cash_payout_requested_at timestamptz,
  add column if not exists cash_paid_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text;

create index if not exists referral_rewards_cash_active_idx
  on public.referral_rewards(referrer_user_id, cash_status, created_at desc)
  where cash_amount > 0;

create index if not exists referral_cash_payout_requests_user_idx
  on public.referral_cash_payout_requests(user_id, status, created_at desc);

create index if not exists referral_cash_payout_requests_status_idx
  on public.referral_cash_payout_requests(status, created_at desc);

drop trigger if exists referral_cash_payout_requests_updated_at on public.referral_cash_payout_requests;
create trigger referral_cash_payout_requests_updated_at
before update on public.referral_cash_payout_requests
for each row
execute procedure public.handle_partner_referrals_updated_at();

alter table public.referral_cash_payout_requests enable row level security;

drop policy if exists "Referral cash payouts view own" on public.referral_cash_payout_requests;
create policy "Referral cash payouts view own"
on public.referral_cash_payout_requests
for select
using (auth.uid() = user_id);

drop policy if exists "Referral cash payouts admin manage" on public.referral_cash_payout_requests;
create policy "Referral cash payouts admin manage"
on public.referral_cash_payout_requests
for all
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
