-- Acquisition loop: student referrals + placement level on contacts

-- ── Academy-scoped student referrals ──────────────────────────────────────────
create table if not exists public.academy_referrals (
  id                  uuid primary key default gen_random_uuid(),
  academy_id          uuid not null references public.tenants(id) on delete cascade,
  referrer_contact_id uuid not null references public.academy_contacts(id) on delete cascade,
  code                text not null,
  referred_contact_id uuid references public.academy_contacts(id) on delete set null,
  referred_email      text,
  status              text not null default 'pending'
    check (status in ('pending','joined','enrolled')),
  created_at          timestamptz not null default now(),
  joined_at           timestamptz,
  metadata            jsonb not null default '{}'::jsonb,
  unique (academy_id, code, referred_contact_id)
);

create index if not exists academy_referrals_academy_idx   on public.academy_referrals(academy_id);
create index if not exists academy_referrals_referrer_idx  on public.academy_referrals(referrer_contact_id);
create unique index if not exists academy_referrals_code_idx on public.academy_referrals(academy_id, code)
  where referred_contact_id is null;

alter table public.academy_referrals enable row level security;

drop policy if exists "Academy referrals read by member" on public.academy_referrals;
create policy "Academy referrals read by member"
  on public.academy_referrals for select
  using (public.is_academy_member(academy_id));

drop policy if exists "Academy referrals manage by admin" on public.academy_referrals;
create policy "Academy referrals manage by admin"
  on public.academy_referrals for all
  using (public.is_academy_admin(academy_id))
  with check (public.is_academy_admin(academy_id));

-- ── Placement / diagnostic level on contacts ──────────────────────────────────
alter table public.academy_contacts
  add column if not exists placement_level text,
  add column if not exists placement_score numeric;
