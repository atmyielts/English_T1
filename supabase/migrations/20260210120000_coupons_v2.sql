-- ============================================================================
-- COUPONS V2: limits + status + redemption tracking
-- ============================================================================

alter table public.coupons
  add column if not exists status text not null default 'active' check (status in ('active','paused','expired')),
  add column if not exists max_redemptions integer,
  add column if not exists max_per_user integer,
  add column if not exists min_amount integer,
  add column if not exists first_purchase_only boolean not null default false,
  add column if not exists stacking_policy text not null default 'none' check (stacking_policy in ('none','allow_with_same_type','allow')),
  add column if not exists effects jsonb default '[]'::jsonb,
  add column if not exists constraints jsonb default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'coupons_max_redemptions_positive') then
    alter table public.coupons
      add constraint coupons_max_redemptions_positive check (max_redemptions is null or max_redemptions > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coupons_max_per_user_positive') then
    alter table public.coupons
      add constraint coupons_max_per_user_positive check (max_per_user is null or max_per_user > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coupons_min_amount_nonnegative') then
    alter table public.coupons
      add constraint coupons_min_amount_nonnegative check (min_amount is null or min_amount >= 0);
  end if;
end $$;

create index if not exists coupons_status_idx on public.coupons(status);

alter table public.coupon_redemptions
  add column if not exists context_id text,
  add column if not exists status text not null default 'applied' check (status in ('pending','applied','reversed','failed')),
  add column if not exists redeemed_at timestamptz not null default now(),
  add column if not exists snapshot jsonb default '{}'::jsonb;

create index if not exists coupon_redemptions_coupon_status_idx on public.coupon_redemptions(coupon_id, status);
create index if not exists coupon_redemptions_user_status_idx on public.coupon_redemptions(user_id, status);
create unique index if not exists coupon_redemptions_coupon_user_context_unique
  on public.coupon_redemptions(coupon_id, user_id, context_id)
  where context_id is not null;
