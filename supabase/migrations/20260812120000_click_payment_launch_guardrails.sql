-- CLICK launch guardrails: deterministic checkout identity, terminal paid state,
-- safe callback audit records, and least-privilege Academy grant execution.

alter table public.payments
  add column if not exists checkout_idempotency_key text,
  add column if not exists grant_completed_at timestamptz,
  add column if not exists fiscalization_status text,
  add column if not exists fiscal_receipt_id text,
  add column if not exists fiscalized_at timestamptz,
  add column if not exists fiscalization_error text;

update public.payments
set grant_completed_at = granted_at
where granted_at is not null and grant_completed_at is null;

create unique index if not exists payments_click_checkout_idempotency_unique
  on public.payments (user_id, checkout_idempotency_key)
  where provider = 'click' and user_id is not null and checkout_idempotency_key is not null;

alter table public.payments
  drop constraint if exists payments_click_amount_positive;
alter table public.payments
  add constraint payments_click_amount_positive
  check (provider <> 'click' or amount > 0) not valid;

alter table public.payments
  drop constraint if exists payments_click_currency_uzs;
alter table public.payments
  add constraint payments_click_currency_uzs
  check (provider <> 'click' or currency = 'UZS') not valid;

alter table public.payments
  drop constraint if exists payments_click_status_valid;
alter table public.payments
  add constraint payments_click_status_valid
  check (
    provider <> 'click' or status in (
      'created', 'pending', 'paid', 'success', 'completed',
      'failed', 'failure', 'canceled', 'cancelled', 'expired',
      'rejected', 'refunded'
    )
  ) not valid;

alter table public.payments
  drop constraint if exists payments_fiscalization_status_valid;
alter table public.payments
  add constraint payments_fiscalization_status_valid
  check (
    fiscalization_status is null or fiscalization_status in (
      'not_required', 'not_configured', 'pending', 'submitted',
      'succeeded', 'failed'
    )
  ) not valid;

-- These validations intentionally fail deployment if legacy production data
-- contradicts the launch assumptions; do not silently coerce financial data.
alter table public.payments validate constraint payments_click_amount_positive;
alter table public.payments validate constraint payments_click_currency_uzs;
alter table public.payments validate constraint payments_click_status_valid;
alter table public.payments validate constraint payments_fiscalization_status_valid;

create or replace function public.enforce_click_payment_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old_status text := lower(trim(old.status));
  v_new_status text := lower(trim(new.status));
  v_initial_provider_reference boolean;
begin
  if lower(trim(old.provider)) <> 'click' then
    return new;
  end if;

  if new.provider is distinct from old.provider
    or new.user_id is distinct from old.user_id
    or new.tenant_id is distinct from old.tenant_id
    or new.product_id is distinct from old.product_id
    or new.plan_id is distinct from old.plan_id
    or new.amount is distinct from old.amount
    or new.currency is distinct from old.currency then
    raise exception 'CLICK payment financial identity is immutable';
  end if;

  if new.provider_transaction_id is distinct from old.provider_transaction_id then
    v_initial_provider_reference :=
      old.provider_transaction_id in (old.id::text, 'pending')
      and new.provider_transaction_id ~ '^[0-9]+$'
      and v_old_status in ('created', 'pending')
      and v_new_status in ('created', 'pending');
    if not v_initial_provider_reference then
      raise exception 'CLICK provider transaction ID is immutable after Prepare';
    end if;
  end if;

  if v_new_status is distinct from v_old_status then
    if v_old_status in ('created', 'pending')
      and v_new_status in ('pending', 'paid', 'canceled', 'failed', 'expired') then
      return new;
    end if;
    raise exception 'Invalid CLICK payment status transition: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists payments_click_immutability on public.payments;
create trigger payments_click_immutability
before update on public.payments
for each row execute function public.enforce_click_payment_immutability();

-- Remove signature material written by earlier function versions. Normal
-- payment readers can see provider_payload through RLS, so signatures must not
-- remain there even though they are hashes.
update public.payments
set provider_payload =
  (coalesce(provider_payload, '{}'::jsonb) #- '{webhook_prepare,sign_string}')
    #- '{webhook_complete,sign_string}'
where provider = 'click'
  and (
    provider_payload #> '{webhook_prepare,sign_string}' is not null
    or provider_payload #> '{webhook_complete,sign_string}' is not null
  );

create table if not exists public.click_callback_events (
  id bigint generated always as identity primary key,
  correlation_id text not null,
  action text not null,
  click_transaction_id text,
  payment_id uuid references public.payments(id) on delete set null,
  service_id text,
  tenant_id uuid references public.tenants(id) on delete set null,
  payment_status text,
  outcome text not null check (outcome in ('accepted', 'rejected')),
  protocol_error integer not null,
  http_status integer not null check (http_status between 100 and 599),
  duration_ms integer not null check (duration_ms >= 0),
  created_at timestamptz not null default now()
);

create index if not exists click_callback_events_created_idx
  on public.click_callback_events (created_at desc);
create index if not exists click_callback_events_transaction_idx
  on public.click_callback_events (click_transaction_id, created_at desc);
create index if not exists click_callback_events_payment_idx
  on public.click_callback_events (payment_id, created_at desc);

alter table public.click_callback_events enable row level security;
revoke all on table public.click_callback_events from public, anon, authenticated;
grant select, insert on table public.click_callback_events to service_role;
grant usage, select on sequence public.click_callback_events_id_seq to service_role;

-- This security-definer function performs entitlement issuance. It must never
-- be directly executable by browser roles; authorized Edge Functions use the
-- service role after their own tenant/finance checks.
revoke all on function public.apply_academy_payment(uuid, uuid) from public;
revoke all on function public.apply_academy_payment(uuid, uuid) from anon;
revoke all on function public.apply_academy_payment(uuid, uuid) from authenticated;
grant execute on function public.apply_academy_payment(uuid, uuid) to service_role;
