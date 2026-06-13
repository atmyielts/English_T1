create table if not exists public.partner_voucher_dispatches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  batch_id uuid references public.partner_voucher_batches(id) on delete set null,
  voucher_id uuid references public.partner_vouchers(id) on delete set null,
  channel text not null check (channel in ('sms', 'telegram')),
  provider text,
  recipient_name text,
  recipient_phone text,
  recipient_email text,
  telegram_chat_id text,
  message text,
  redeem_url text,
  status text not null default 'prepared' check (status in ('prepared', 'sent', 'failed')),
  provider_response jsonb not null default '{}'::jsonb,
  attempted_by uuid references public.users(id) on delete set null,
  attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists partner_voucher_dispatches_tenant_idx
  on public.partner_voucher_dispatches (tenant_id, attempted_at desc);

create index if not exists partner_voucher_dispatches_batch_idx
  on public.partner_voucher_dispatches (batch_id, attempted_at desc)
  where batch_id is not null;

create index if not exists partner_voucher_dispatches_voucher_idx
  on public.partner_voucher_dispatches (voucher_id, attempted_at desc)
  where voucher_id is not null;

create index if not exists partner_voucher_dispatches_status_idx
  on public.partner_voucher_dispatches (tenant_id, status, attempted_at desc);

alter table public.partner_voucher_dispatches enable row level security;

drop policy if exists "Partner voucher dispatches view by center staff" on public.partner_voucher_dispatches;
create policy "Partner voucher dispatches view by center staff"
on public.partner_voucher_dispatches
for select
using (public.partner_center_can_view(tenant_id));

drop policy if exists "Partner voucher dispatches manage by center admin" on public.partner_voucher_dispatches;
create policy "Partner voucher dispatches manage by center admin"
on public.partner_voucher_dispatches
for all
using (public.partner_center_is_admin(tenant_id))
with check (public.partner_center_is_admin(tenant_id));
