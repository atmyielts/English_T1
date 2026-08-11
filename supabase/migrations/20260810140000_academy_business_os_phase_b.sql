-- SCHood Education Business OS — Phase B
-- Commercial agreements, immutable receivables ledger, allocations, balances,
-- discounts, debt operations, and provider reconciliation.

create unique index if not exists academy_offers_academy_id_id_uidx
  on public.academy_offers (academy_id, id);
create unique index if not exists academy_payments_academy_id_id_uidx
  on public.academy_payments (academy_id, id);
create unique index if not exists academy_payments_academy_contact_id_uidx
  on public.academy_payments (academy_id, contact_id, id);
create unique index if not exists academy_entitlements_academy_id_id_uidx
  on public.academy_entitlements (academy_id, id);

create or replace function public.academy_finance_can_view(target_academy_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id=target_academy_id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin')
  ) or exists (
    select 1 from public.academy_role_grants g
    where g.academy_id=target_academy_id and g.user_id=auth.uid() and g.role in ('owner','admin','center_admin')
      and g.status in ('invited','active') and g.starts_at<=now() and (g.expires_at is null or g.expires_at>now())
  );
$$;

create table public.academy_pricing_plans (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid,
  classroom_id uuid,
  legacy_offer_id uuid,
  plan_key text not null,
  name text not null,
  pricing_model text not null check (pricing_model in (
    'monthly_fixed', 'calendar_month', 'per_lesson', 'per_teaching_hour',
    'lesson_package', 'module_fee', 'course_fee', 'upfront_course',
    'installment_plan', 'individual_lesson', 'custom', 'scholarship', 'free'
  )),
  billing_cycle text not null default 'monthly' check (billing_cycle in (
    'weekly', 'monthly', 'calendar_month', 'quarterly', 'term', 'course', 'package', 'one_time', 'custom'
  )),
  base_amount bigint not null check (base_amount >= 0),
  currency text not null default 'UZS',
  lessons_included numeric(10,2) check (lessons_included is null or lessons_included >= 0),
  teaching_hours_included numeric(10,2) check (teaching_hours_included is null or teaching_hours_included >= 0),
  duration_days integer check (duration_days is null or duration_days > 0),
  installment_count integer check (installment_count is null or installment_count > 0),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, plan_key),
  unique (academy_id, id),
  unique (academy_id, legacy_offer_id),
  foreign key (academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict,
  foreign key (academy_id, classroom_id) references public.academy_classrooms(academy_id, id) on delete restrict,
  foreign key (academy_id, legacy_offer_id) references public.academy_offers(academy_id, id) on delete set null (legacy_offer_id)
);

create index academy_pricing_plans_active_idx
  on public.academy_pricing_plans (academy_id, is_active, pricing_model, name);

create table public.academy_subscriptions (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null,
  branch_id uuid,
  classroom_id uuid,
  pricing_plan_id uuid not null,
  entitlement_id uuid,
  status text not null default 'draft' check (status in (
    'draft', 'active', 'paused', 'overdue', 'cancelled', 'expired', 'completed'
  )),
  starts_on date not null,
  ends_on date,
  billing_cycle text not null,
  billing_anchor_day integer check (billing_anchor_day is null or billing_anchor_day between 1 and 31),
  list_amount bigint not null check (list_amount >= 0),
  discount_amount bigint not null default 0 check (discount_amount >= 0),
  agreed_amount bigint not null check (agreed_amount >= 0),
  currency text not null default 'UZS',
  auto_renew boolean not null default false,
  renewal_notice_days integer not null default 7 check (renewal_notice_days >= 0),
  cancelled_at timestamptz,
  cancellation_reason text,
  completed_at timestamptz,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, id),
  unique (academy_id, contact_id, id),
  unique (academy_id, idempotency_key),
  foreign key (academy_id, contact_id) references public.academy_contacts(academy_id, id) on delete restrict,
  foreign key (academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict,
  foreign key (academy_id, classroom_id) references public.academy_classrooms(academy_id, id) on delete restrict,
  foreign key (academy_id, pricing_plan_id) references public.academy_pricing_plans(academy_id, id) on delete restrict,
  foreign key (academy_id, entitlement_id) references public.academy_entitlements(academy_id, id) on delete set null (entitlement_id),
  check (ends_on is null or ends_on >= starts_on),
  check (discount_amount <= list_amount),
  check (agreed_amount = list_amount - discount_amount)
);

create index academy_subscriptions_contact_idx
  on public.academy_subscriptions (academy_id, contact_id, status, starts_on desc);
create index academy_subscriptions_renewal_idx
  on public.academy_subscriptions (academy_id, ends_on, status) where status in ('active', 'paused', 'overdue');

create table public.academy_subscription_freezes (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid not null,
  starts_on date not null,
  ends_on date not null,
  reason text not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'completed', 'cancelled')),
  idempotency_key text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (academy_id, id),
  unique (academy_id, idempotency_key),
  foreign key (academy_id, subscription_id) references public.academy_subscriptions(academy_id, id) on delete restrict,
  check (ends_on >= starts_on)
);

create table public.academy_pricing_adjustments (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid not null,
  adjustment_type text not null check (adjustment_type in (
    'percentage', 'fixed', 'sibling', 'scholarship', 'campaign', 'negotiated', 'temporary', 'promo_code', 'staff_override'
  )),
  percentage_basis_points integer check (percentage_basis_points is null or percentage_basis_points between 0 and 10000),
  amount bigint not null check (amount >= 0),
  original_amount bigint not null check (original_amount >= 0),
  final_amount bigint not null check (final_amount >= 0),
  reason text not null,
  promo_code text,
  starts_on date,
  ends_on date,
  applied_by uuid not null references public.users(id) on delete restrict,
  approved_by uuid references public.users(id) on delete restrict,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (academy_id, id),
  unique (academy_id, idempotency_key),
  foreign key (academy_id, subscription_id) references public.academy_subscriptions(academy_id, id) on delete restrict,
  check (final_amount = original_amount - amount),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table public.academy_charges (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null,
  subscription_id uuid,
  branch_id uuid,
  classroom_id uuid,
  charge_number text not null,
  cycle_key text,
  charge_type text not null default 'tuition' check (charge_type in (
    'tuition', 'registration', 'materials', 'exam', 'lesson', 'package', 'installment', 'adjustment', 'other'
  )),
  service_period_start date,
  service_period_end date,
  issued_on date not null default current_date,
  due_on date not null,
  original_amount bigint not null check (original_amount >= 0),
  discount_amount bigint not null default 0 check (discount_amount >= 0),
  net_amount bigint not null check (net_amount >= 0),
  currency text not null default 'UZS',
  status text not null default 'open' check (status in ('draft', 'open', 'partially_paid', 'paid', 'void', 'written_off')),
  description text,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, id),
  unique (academy_id, contact_id, id),
  unique (academy_id, charge_number),
  unique (academy_id, idempotency_key),
  unique (academy_id, subscription_id, cycle_key),
  foreign key (academy_id, contact_id) references public.academy_contacts(academy_id, id) on delete restrict,
  foreign key (academy_id, contact_id, subscription_id) references public.academy_subscriptions(academy_id, contact_id, id) on delete restrict,
  foreign key (academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict,
  foreign key (academy_id, classroom_id) references public.academy_classrooms(academy_id, id) on delete restrict,
  check (discount_amount <= original_amount),
  check (net_amount = original_amount - discount_amount),
  check (service_period_end is null or service_period_start is null or service_period_end >= service_period_start)
);

create index academy_charges_due_idx on public.academy_charges (academy_id, due_on, status);
create index academy_charges_contact_idx on public.academy_charges (academy_id, contact_id, issued_on desc);

create table public.academy_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete restrict,
  payment_id uuid not null,
  charge_id uuid not null,
  amount bigint not null check (amount > 0),
  currency text not null,
  allocation_kind text not null default 'application' check (allocation_kind in ('application', 'reversal')),
  reverses_allocation_id uuid,
  idempotency_key text not null,
  allocated_by uuid not null references public.users(id) on delete restrict,
  allocated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (academy_id, id),
  unique (academy_id, idempotency_key),
  foreign key (academy_id, payment_id) references public.academy_payments(academy_id, id) on delete restrict,
  foreign key (academy_id, charge_id) references public.academy_charges(academy_id, id) on delete restrict,
  foreign key (academy_id, reverses_allocation_id) references public.academy_payment_allocations(academy_id, id) on delete restrict
);

create index academy_payment_allocations_payment_idx on public.academy_payment_allocations(academy_id, payment_id);
create index academy_payment_allocations_charge_idx on public.academy_payment_allocations(academy_id, charge_id);

create table public.academy_account_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete restrict,
  contact_id uuid not null,
  subscription_id uuid,
  charge_id uuid,
  payment_id uuid,
  entry_type text not null check (entry_type in (
    'charge', 'payment_received', 'refund', 'account_credit', 'discount', 'write_off',
    'debit_adjustment', 'credit_adjustment', 'transferred_credit'
  )),
  amount bigint not null check (amount <> 0),
  currency text not null,
  effective_at timestamptz not null default now(),
  reason text,
  idempotency_key text not null,
  created_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (academy_id, id),
  unique (academy_id, idempotency_key),
  foreign key (academy_id, contact_id) references public.academy_contacts(academy_id, id) on delete restrict,
  foreign key (academy_id, contact_id, subscription_id) references public.academy_subscriptions(academy_id, contact_id, id) on delete restrict,
  foreign key (academy_id, contact_id, charge_id) references public.academy_charges(academy_id, contact_id, id) on delete restrict,
  foreign key (academy_id, contact_id, payment_id) references public.academy_payments(academy_id, contact_id, id) on delete restrict
);

create index academy_account_ledger_contact_idx
  on public.academy_account_ledger_entries(academy_id, contact_id, currency, effective_at, id);

create table public.academy_debt_cases (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null,
  subscription_id uuid,
  branch_id uuid,
  status text not null default 'open' check (status in ('open', 'promise', 'escalated', 'resolved', 'written_off')),
  responsible_user_id uuid references public.users(id) on delete set null,
  restriction_state text not null default 'none' check (restriction_state in ('none', 'warning', 'restricted')),
  collection_notes text,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, id),
  unique (academy_id, contact_id, subscription_id),
  foreign key (academy_id, contact_id) references public.academy_contacts(academy_id, id) on delete restrict,
  foreign key (academy_id, contact_id, subscription_id) references public.academy_subscriptions(academy_id, contact_id, id) on delete restrict,
  foreign key (academy_id, branch_id) references public.academy_branches(academy_id, id) on delete restrict
);

create table public.academy_payment_promises (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  debt_case_id uuid not null,
  amount bigint not null check (amount > 0),
  currency text not null,
  promised_for date not null,
  status text not null default 'open' check (status in ('open', 'kept', 'broken', 'cancelled')),
  notes text,
  idempotency_key text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (academy_id, id),
  unique (academy_id, idempotency_key),
  foreign key (academy_id, debt_case_id) references public.academy_debt_cases(academy_id, id) on delete restrict
);

create table public.academy_collection_events (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  debt_case_id uuid not null,
  event_type text not null check (event_type in ('reminder', 'call', 'message', 'note', 'escalation', 'restriction', 'resolution')),
  channel text,
  outcome text,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  unique (academy_id, id),
  foreign key (academy_id, debt_case_id) references public.academy_debt_cases(academy_id, id) on delete restrict
);

create table public.academy_payment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete restrict,
  academy_payment_id uuid,
  provider text not null,
  provider_transaction_id text not null,
  provider_event_id text not null,
  event_type text not null,
  amount bigint,
  currency text,
  status text not null check (status in ('matched', 'unmatched', 'duplicate', 'amount_mismatch', 'currency_mismatch', 'ignored')),
  payload_hash text not null,
  idempotency_key text not null,
  received_at timestamptz not null default now(),
  recorded_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  unique (academy_id, id),
  unique (provider, provider_event_id),
  unique (academy_id, idempotency_key),
  foreign key (academy_id, academy_payment_id) references public.academy_payments(academy_id, id) on delete restrict
);

create or replace function public.academy_reject_financial_history_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Financial history is immutable; post a reversal or adjustment';
end;
$$;

create trigger academy_payment_allocations_immutable
before update or delete on public.academy_payment_allocations
for each row execute function public.academy_reject_financial_history_mutation();
create trigger academy_account_ledger_entries_immutable
before update or delete on public.academy_account_ledger_entries
for each row execute function public.academy_reject_financial_history_mutation();
create trigger academy_payment_reconciliations_immutable
before update or delete on public.academy_payment_reconciliations
for each row execute function public.academy_reject_financial_history_mutation();

create or replace function public.academy_capture_payment_ledger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.contact_id is null then return new; end if;
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    insert into public.academy_account_ledger_entries (
      academy_id, contact_id, payment_id, entry_type, amount, currency,
      effective_at, reason, idempotency_key, created_by, metadata
    ) values (
      new.academy_id, new.contact_id, new.id, 'payment_received', -new.amount,
      new.currency, coalesce(new.updated_at, now()), 'Payment received',
      'payment-received:' || new.id::text, new.created_by,
      jsonb_build_object('provider', new.provider, 'provider_transaction_id', new.provider_transaction_id)
    ) on conflict (academy_id, idempotency_key) do nothing;
  elsif new.status = 'refunded' and (tg_op = 'INSERT' or old.status is distinct from 'refunded') then
    insert into public.academy_account_ledger_entries (
      academy_id, contact_id, payment_id, entry_type, amount, currency,
      effective_at, reason, idempotency_key, created_by, metadata
    ) values (
      new.academy_id, new.contact_id, new.id, 'refund', new.amount,
      new.currency, coalesce(new.updated_at, now()), 'Payment refunded',
      'payment-refunded:' || new.id::text, new.created_by,
      jsonb_build_object('provider', new.provider, 'provider_transaction_id', new.provider_transaction_id)
    ) on conflict (academy_id, idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

create trigger academy_payments_capture_ledger
after insert or update of status on public.academy_payments
for each row execute function public.academy_capture_payment_ledger();

insert into public.academy_account_ledger_entries (
  academy_id, contact_id, payment_id, entry_type, amount, currency,
  effective_at, reason, idempotency_key, created_by, metadata
)
select p.academy_id, p.contact_id, p.id, 'payment_received', -p.amount, p.currency,
  p.updated_at, 'Payment received before commercial ledger migration',
  'payment-received:' || p.id::text, p.created_by,
  jsonb_build_object('provider', p.provider, 'provider_transaction_id', p.provider_transaction_id, 'backfilled', true)
from public.academy_payments p
where p.status in ('paid', 'refunded') and p.contact_id is not null
on conflict (academy_id, idempotency_key) do nothing;

insert into public.academy_account_ledger_entries (
  academy_id, contact_id, payment_id, entry_type, amount, currency,
  effective_at, reason, idempotency_key, created_by, metadata
)
select p.academy_id, p.contact_id, p.id, 'refund', p.amount, p.currency,
  p.updated_at, 'Payment refund before commercial ledger migration',
  'payment-refunded:' || p.id::text, p.created_by,
  jsonb_build_object('provider', p.provider, 'provider_transaction_id', p.provider_transaction_id, 'backfilled', true)
from public.academy_payments p
where p.status = 'refunded' and p.contact_id is not null
on conflict (academy_id, idempotency_key) do nothing;

create or replace view public.academy_charge_balances
with (security_invoker = true)
as
select
  c.*,
  coalesce(a.allocated_amount, 0)::bigint as allocated_amount,
  coalesce(j.adjustment_amount, 0)::bigint as adjustment_amount,
  greatest(c.net_amount + coalesce(j.adjustment_amount, 0), 0)::bigint as effective_amount,
  greatest(c.net_amount + coalesce(j.adjustment_amount, 0) - coalesce(a.allocated_amount, 0), 0)::bigint as outstanding_amount,
  case
    when c.status = 'void' then c.status
    when greatest(c.net_amount + coalesce(j.adjustment_amount, 0) - coalesce(a.allocated_amount, 0), 0) = 0 and coalesce(j.has_write_off,false) then 'written_off'
    when greatest(c.net_amount + coalesce(j.adjustment_amount, 0) - coalesce(a.allocated_amount, 0), 0) = 0 then 'paid'
    when coalesce(a.allocated_amount, 0) > 0 then 'partially_paid'
    else 'open'
  end as calculated_status,
  greatest(current_date - c.due_on, 0) as days_overdue,
  case
    when current_date <= c.due_on then 'current'
    when current_date - c.due_on <= 7 then '1-7'
    when current_date - c.due_on <= 14 then '8-14'
    when current_date - c.due_on <= 30 then '15-30'
    when current_date - c.due_on <= 60 then '31-60'
    else '60+'
  end as aging_bucket
from public.academy_charges c
left join (
  select academy_id, charge_id,
    sum(case when allocation_kind = 'application' then amount else -amount end)::bigint as allocated_amount
  from public.academy_payment_allocations
  group by academy_id, charge_id
) a on a.academy_id = c.academy_id and a.charge_id = c.id
left join (
  select academy_id, charge_id, sum(amount)::bigint as adjustment_amount,
    bool_or(entry_type='write_off') as has_write_off
  from public.academy_account_ledger_entries
  where charge_id is not null and entry_type <> 'charge'
  group by academy_id, charge_id
) j on j.academy_id = c.academy_id and j.charge_id = c.id;

create or replace view public.academy_account_balances
with (security_invoker = true)
as
select
  l.academy_id,
  l.contact_id,
  l.currency,
  sum(l.amount)::bigint as balance,
  sum(case when l.amount > 0 then l.amount else 0 end)::bigint as debits,
  -sum(case when l.amount < 0 then l.amount else 0 end)::bigint as credits,
  max(l.effective_at) as last_entry_at
from public.academy_account_ledger_entries l
group by l.academy_id, l.contact_id, l.currency;

create or replace function public.academy_create_pricing_plan(
  p_academy_id uuid, p_actor_id uuid, p_payload jsonb, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_plan public.academy_pricing_plans%rowtype; v_model text; v_cycle text; v_amount bigint;
begin
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Idempotency key is required'; end if;
  select * into v_plan from public.academy_pricing_plans where academy_id=p_academy_id and metadata->>'idempotency_key'=p_idempotency_key;
  if found then return to_jsonb(v_plan); end if;
  v_model := lower(trim(p_payload->>'pricing_model'));
  v_cycle := coalesce(nullif(lower(trim(p_payload->>'billing_cycle')), ''), 'monthly');
  v_amount := coalesce(nullif(p_payload->>'base_amount','')::bigint, 0);
  insert into public.academy_pricing_plans (
    academy_id, branch_id, classroom_id, legacy_offer_id, plan_key, name, pricing_model,
    billing_cycle, base_amount, currency, lessons_included, teaching_hours_included,
    duration_days, installment_count, metadata, created_by
  ) values (
    p_academy_id, nullif(p_payload->>'branch_id','')::uuid, nullif(p_payload->>'classroom_id','')::uuid,
    nullif(p_payload->>'legacy_offer_id','')::uuid, lower(trim(p_payload->>'plan_key')), trim(p_payload->>'name'),
    v_model, v_cycle, v_amount, upper(coalesce(nullif(trim(p_payload->>'currency'),''),'UZS')),
    nullif(p_payload->>'lessons_included','')::numeric, nullif(p_payload->>'teaching_hours_included','')::numeric,
    nullif(p_payload->>'duration_days','')::integer, nullif(p_payload->>'installment_count','')::integer,
    coalesce(p_payload->'metadata','{}'::jsonb) || jsonb_build_object('idempotency_key',p_idempotency_key), p_actor_id
  ) returning * into v_plan;
  insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_academy_id,p_actor_id,'pricing_plan.created','academy_pricing_plan',v_plan.id::text,jsonb_build_object('model',v_model,'amount',v_amount));
  return to_jsonb(v_plan);
end; $$;

create or replace function public.academy_create_subscription(
  p_academy_id uuid, p_contact_id uuid, p_actor_id uuid, p_payload jsonb, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sub public.academy_subscriptions%rowtype; v_plan public.academy_pricing_plans%rowtype; v_discount bigint; v_list bigint;
begin
  select * into v_sub from public.academy_subscriptions where academy_id=p_academy_id and idempotency_key=p_idempotency_key;
  if found then return to_jsonb(v_sub); end if;
  select * into v_plan from public.academy_pricing_plans where academy_id=p_academy_id and id=nullif(p_payload->>'pricing_plan_id','')::uuid and is_active;
  if not found then raise exception 'Pricing plan not found'; end if;
  if not exists(select 1 from public.academy_contacts where academy_id=p_academy_id and id=p_contact_id) then raise exception 'Contact not found'; end if;
  v_list := coalesce(nullif(p_payload->>'list_amount','')::bigint,v_plan.base_amount);
  v_discount := coalesce(nullif(p_payload->>'discount_amount','')::bigint,0);
  if v_discount > 0 and nullif(trim(p_payload->>'discount_reason'),'') is null then
    raise exception 'Discount reason is required';
  end if;
  insert into public.academy_subscriptions(
    academy_id,contact_id,branch_id,classroom_id,pricing_plan_id,status,starts_on,ends_on,
    billing_cycle,billing_anchor_day,list_amount,discount_amount,agreed_amount,currency,
    auto_renew,renewal_notice_days,idempotency_key,metadata,created_by,updated_by
  ) values (
    p_academy_id,p_contact_id,coalesce(nullif(p_payload->>'branch_id','')::uuid,v_plan.branch_id),
    coalesce(nullif(p_payload->>'classroom_id','')::uuid,v_plan.classroom_id),v_plan.id,
    coalesce(nullif(lower(trim(p_payload->>'status')),''),'active'),
    coalesce(nullif(p_payload->>'starts_on','')::date,current_date),nullif(p_payload->>'ends_on','')::date,
    coalesce(nullif(lower(trim(p_payload->>'billing_cycle')),''),v_plan.billing_cycle),
    nullif(p_payload->>'billing_anchor_day','')::integer,v_list,v_discount,v_list-v_discount,v_plan.currency,
    coalesce((p_payload->>'auto_renew')::boolean,false),coalesce(nullif(p_payload->>'renewal_notice_days','')::integer,7),
    p_idempotency_key,coalesce(p_payload->'metadata','{}'::jsonb),p_actor_id,p_actor_id
  ) returning * into v_sub;
  if v_discount > 0 then
    insert into public.academy_pricing_adjustments(
      academy_id,subscription_id,adjustment_type,amount,original_amount,final_amount,reason,
      applied_by,approved_by,idempotency_key,metadata
    ) values (
      p_academy_id,v_sub.id,coalesce(nullif(lower(trim(p_payload->>'discount_type')),''),'negotiated'),
      v_discount,v_list,v_list-v_discount,trim(p_payload->>'discount_reason'),
      p_actor_id,p_actor_id,'subscription-discount:'||v_sub.id::text,'{}'::jsonb
    );
  end if;
  insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,contact_id,classroom_id,metadata)
  values(p_academy_id,p_actor_id,'subscription.created','academy_subscription',v_sub.id::text,p_contact_id,v_sub.classroom_id,jsonb_build_object('amount',v_sub.agreed_amount,'discount',v_discount));
  insert into public.domain_event_outbox(event_type,event_version,aggregate_type,aggregate_id,user_id,payload,idempotency_key)
  values('subscription.created','v1','academy_subscription',v_sub.id,p_actor_id,jsonb_build_object('academy_id',p_academy_id,'contact_id',p_contact_id,'subscription_id',v_sub.id),'subscription.created:'||v_sub.id::text)
  on conflict(idempotency_key) do nothing;
  return to_jsonb(v_sub);
end; $$;

create or replace function public.academy_create_charge(
  p_academy_id uuid, p_subscription_id uuid, p_actor_id uuid, p_payload jsonb, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_charge public.academy_charges%rowtype; v_sub public.academy_subscriptions%rowtype; v_number text; v_original bigint; v_discount bigint;
begin
  select * into v_charge from public.academy_charges where academy_id=p_academy_id and idempotency_key=p_idempotency_key;
  if found then return to_jsonb(v_charge); end if;
  select * into v_sub from public.academy_subscriptions where academy_id=p_academy_id and id=p_subscription_id;
  if not found then raise exception 'Subscription not found'; end if;
  if v_sub.status not in ('active','overdue','paused') then raise exception 'Subscription cannot be billed in its current status'; end if;
  v_original := coalesce(nullif(p_payload->>'original_amount','')::bigint,v_sub.list_amount);
  v_discount := coalesce(nullif(p_payload->>'discount_amount','')::bigint,v_sub.discount_amount);
  v_number := coalesce(nullif(trim(p_payload->>'charge_number'),''),'INV-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'));
  insert into public.academy_charges(
    academy_id,contact_id,subscription_id,branch_id,classroom_id,charge_number,cycle_key,charge_type,
    service_period_start,service_period_end,issued_on,due_on,original_amount,discount_amount,net_amount,
    currency,status,description,idempotency_key,metadata,created_by
  ) values (
    p_academy_id,v_sub.contact_id,v_sub.id,v_sub.branch_id,v_sub.classroom_id,v_number,nullif(trim(p_payload->>'cycle_key'),''),
    coalesce(nullif(lower(trim(p_payload->>'charge_type')),''),'tuition'),nullif(p_payload->>'service_period_start','')::date,
    nullif(p_payload->>'service_period_end','')::date,coalesce(nullif(p_payload->>'issued_on','')::date,current_date),
    coalesce(nullif(p_payload->>'due_on','')::date,current_date),v_original,v_discount,v_original-v_discount,v_sub.currency,
    'open',nullif(trim(p_payload->>'description'),''),p_idempotency_key,coalesce(p_payload->'metadata','{}'::jsonb),p_actor_id
  ) returning * into v_charge;
  if v_charge.net_amount > 0 then
    insert into public.academy_account_ledger_entries(
      academy_id,contact_id,subscription_id,charge_id,entry_type,amount,currency,effective_at,reason,idempotency_key,created_by,metadata
    ) values(p_academy_id,v_sub.contact_id,v_sub.id,v_charge.id,'charge',v_charge.net_amount,v_charge.currency,now(),
      coalesce(v_charge.description,'Charge issued'),'charge:'||v_charge.id::text,p_actor_id,jsonb_build_object('charge_number',v_number));
  end if;
  insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,contact_id,classroom_id,metadata)
  values(p_academy_id,p_actor_id,'charge.created','academy_charge',v_charge.id::text,v_sub.contact_id,v_sub.classroom_id,jsonb_build_object('net_amount',v_charge.net_amount,'due_on',v_charge.due_on));
  insert into public.domain_event_outbox(event_type,event_version,aggregate_type,aggregate_id,user_id,payload,idempotency_key)
  values('charge.created','v1','academy_charge',v_charge.id,p_actor_id,jsonb_build_object('academy_id',p_academy_id,'contact_id',v_sub.contact_id,'charge_id',v_charge.id,'amount',v_charge.net_amount),'charge.created:'||v_charge.id::text)
  on conflict(idempotency_key) do nothing;
  return to_jsonb(v_charge);
end; $$;

create or replace function public.academy_allocate_payment(
  p_academy_id uuid, p_payment_id uuid, p_charge_id uuid, p_amount bigint,
  p_actor_id uuid, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_payment public.academy_payments%rowtype; v_charge public.academy_charges%rowtype; v_allocation public.academy_payment_allocations%rowtype; v_payment_used bigint; v_charge_paid bigint; v_charge_adjustments bigint; v_charge_obligation bigint;
begin
  select * into v_allocation from public.academy_payment_allocations where academy_id=p_academy_id and idempotency_key=p_idempotency_key;
  if found then return to_jsonb(v_allocation); end if;
  if p_amount <= 0 then raise exception 'Allocation amount must be positive'; end if;
  select * into v_payment from public.academy_payments where academy_id=p_academy_id and id=p_payment_id for update;
  if not found or v_payment.status <> 'paid' then raise exception 'Paid payment not found'; end if;
  select * into v_charge from public.academy_charges where academy_id=p_academy_id and id=p_charge_id for update;
  if not found or v_charge.status in ('void','written_off') then raise exception 'Open charge not found'; end if;
  if v_payment.contact_id is distinct from v_charge.contact_id then raise exception 'Payment and charge contacts differ'; end if;
  if v_payment.currency <> v_charge.currency then raise exception 'Payment and charge currencies differ'; end if;
  select coalesce(sum(case when allocation_kind='application' then amount else -amount end),0) into v_payment_used from public.academy_payment_allocations where academy_id=p_academy_id and payment_id=p_payment_id;
  select coalesce(sum(case when allocation_kind='application' then amount else -amount end),0) into v_charge_paid from public.academy_payment_allocations where academy_id=p_academy_id and charge_id=p_charge_id;
  select coalesce(sum(amount),0) into v_charge_adjustments from public.academy_account_ledger_entries
    where academy_id=p_academy_id and charge_id=p_charge_id and entry_type<>'charge';
  v_charge_obligation:=greatest(v_charge.net_amount+v_charge_adjustments,0);
  if v_payment_used+p_amount > v_payment.amount then raise exception 'Allocation exceeds unallocated payment'; end if;
  if v_charge_paid+p_amount > v_charge_obligation then raise exception 'Allocation exceeds charge balance'; end if;
  insert into public.academy_payment_allocations(academy_id,payment_id,charge_id,amount,currency,idempotency_key,allocated_by)
  values(p_academy_id,p_payment_id,p_charge_id,p_amount,v_payment.currency,p_idempotency_key,p_actor_id) returning * into v_allocation;
  update public.academy_charges set status=case when v_charge_paid+p_amount=v_charge_obligation then 'paid' else 'partially_paid' end,updated_at=now()
  where academy_id=p_academy_id and id=p_charge_id;
  insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,contact_id,metadata)
  values(p_academy_id,p_actor_id,'payment.allocated','academy_payment_allocation',v_allocation.id::text,v_charge.contact_id,jsonb_build_object('payment_id',p_payment_id,'charge_id',p_charge_id,'amount',p_amount));
  insert into public.domain_event_outbox(event_type,event_version,aggregate_type,aggregate_id,user_id,payload,idempotency_key)
  values('payment.allocated','v1','academy_payment',p_payment_id,p_actor_id,jsonb_build_object('academy_id',p_academy_id,'payment_id',p_payment_id,'charge_id',p_charge_id,'amount',p_amount),'payment.allocated:'||v_allocation.id::text)
  on conflict(idempotency_key) do nothing;
  return to_jsonb(v_allocation);
end; $$;

create or replace function public.academy_post_account_adjustment(
  p_academy_id uuid, p_contact_id uuid, p_actor_id uuid, p_payload jsonb, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_entry public.academy_account_ledger_entries%rowtype; v_type text; v_amount bigint; v_signed bigint; v_charge public.academy_charges%rowtype; v_charge_paid bigint; v_charge_adjustments bigint; v_outstanding bigint; v_currency text;
begin
  select * into v_entry from public.academy_account_ledger_entries where academy_id=p_academy_id and idempotency_key=p_idempotency_key;
  if found then return to_jsonb(v_entry); end if;
  if not exists(select 1 from public.academy_contacts where academy_id=p_academy_id and id=p_contact_id) then raise exception 'Contact not found'; end if;
  v_type:=lower(trim(p_payload->>'entry_type')); v_amount:=nullif(p_payload->>'amount','')::bigint;
  if v_amount is null or v_amount<=0 then raise exception 'Adjustment amount must be positive'; end if;
  if v_type in ('account_credit','discount','write_off','credit_adjustment','transferred_credit') then v_signed:=-v_amount;
  elsif v_type in ('refund','debit_adjustment') then v_signed:=v_amount;
  else raise exception 'Invalid adjustment type'; end if;
  if nullif(trim(p_payload->>'reason'),'') is null then raise exception 'Adjustment reason is required'; end if;
  v_currency:=upper(coalesce(nullif(trim(p_payload->>'currency'),''),'UZS'));
  if nullif(p_payload->>'charge_id','') is not null then
    select * into v_charge from public.academy_charges
      where academy_id=p_academy_id and contact_id=p_contact_id and id=(p_payload->>'charge_id')::uuid for update;
    if not found then raise exception 'Charge not found for contact'; end if;
    if v_charge.currency<>v_currency then raise exception 'Adjustment and charge currencies differ'; end if;
    select coalesce(sum(case when allocation_kind='application' then amount else -amount end),0) into v_charge_paid
      from public.academy_payment_allocations where academy_id=p_academy_id and charge_id=v_charge.id;
    select coalesce(sum(amount),0) into v_charge_adjustments from public.academy_account_ledger_entries
      where academy_id=p_academy_id and charge_id=v_charge.id and entry_type<>'charge';
    v_outstanding:=greatest(v_charge.net_amount+v_charge_adjustments-v_charge_paid,0);
    if v_type in ('discount','write_off') and v_amount>v_outstanding then raise exception 'Adjustment exceeds charge balance'; end if;
  end if;
  insert into public.academy_account_ledger_entries(
    academy_id,contact_id,subscription_id,charge_id,payment_id,entry_type,amount,currency,effective_at,reason,idempotency_key,created_by,metadata
  ) values(
    p_academy_id,p_contact_id,nullif(p_payload->>'subscription_id','')::uuid,nullif(p_payload->>'charge_id','')::uuid,
    nullif(p_payload->>'payment_id','')::uuid,v_type,v_signed,v_currency,
    now(),trim(p_payload->>'reason'),p_idempotency_key,p_actor_id,coalesce(p_payload->'metadata','{}'::jsonb)
  ) returning * into v_entry;
  if v_type='write_off' and v_charge.id is not null and v_amount=v_outstanding then
    update public.academy_charges set status='written_off',updated_at=now() where academy_id=p_academy_id and id=v_charge.id;
  end if;
  insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,contact_id,metadata)
  values(p_academy_id,p_actor_id,'account.'||v_type,'academy_account_ledger_entry',v_entry.id::text,p_contact_id,jsonb_build_object('amount',v_signed,'reason',v_entry.reason));
  return to_jsonb(v_entry);
end; $$;

create or replace function public.academy_record_payment_reconciliation(
  p_academy_id uuid, p_payment_id uuid, p_actor_id uuid, p_payload jsonb, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.academy_payment_reconciliations%rowtype;
begin
  select * into v_row from public.academy_payment_reconciliations where academy_id=p_academy_id and idempotency_key=p_idempotency_key;
  if found then return to_jsonb(v_row); end if;
  insert into public.academy_payment_reconciliations(
    academy_id,academy_payment_id,provider,provider_transaction_id,provider_event_id,event_type,amount,currency,status,payload_hash,idempotency_key,recorded_by,metadata
  ) values(
    p_academy_id,p_payment_id,lower(trim(p_payload->>'provider')),trim(p_payload->>'provider_transaction_id'),trim(p_payload->>'provider_event_id'),
    lower(trim(p_payload->>'event_type')),nullif(p_payload->>'amount','')::bigint,upper(nullif(trim(p_payload->>'currency'),'')),
    lower(trim(p_payload->>'status')),trim(p_payload->>'payload_hash'),p_idempotency_key,p_actor_id,coalesce(p_payload->'metadata','{}'::jsonb)
  ) returning * into v_row;
  insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_academy_id,p_actor_id,'payment.reconciled','academy_payment_reconciliation',v_row.id::text,jsonb_build_object('payment_id',p_payment_id,'status',v_row.status,'provider',v_row.provider));
  return to_jsonb(v_row);
end; $$;

create or replace function public.academy_record_payment_promise(
  p_academy_id uuid, p_contact_id uuid, p_actor_id uuid, p_payload jsonb, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_case public.academy_debt_cases%rowtype; v_promise public.academy_payment_promises%rowtype;
begin
  select * into v_promise from public.academy_payment_promises where academy_id=p_academy_id and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('debt_case',to_jsonb((select d from public.academy_debt_cases d where d.academy_id=p_academy_id and d.id=v_promise.debt_case_id)),'promise',to_jsonb(v_promise)); end if;
  insert into public.academy_debt_cases(academy_id,contact_id,subscription_id,branch_id,status,responsible_user_id,restriction_state,collection_notes)
  values(p_academy_id,p_contact_id,nullif(p_payload->>'subscription_id','')::uuid,nullif(p_payload->>'branch_id','')::uuid,'promise',p_actor_id,
    coalesce(nullif(lower(trim(p_payload->>'restriction_state')),''),'none'),nullif(trim(p_payload->>'notes'),''))
  on conflict (academy_id,contact_id,subscription_id) do update set status='promise',responsible_user_id=p_actor_id,updated_at=now()
  returning * into v_case;
  insert into public.academy_payment_promises(academy_id,debt_case_id,amount,currency,promised_for,notes,idempotency_key,created_by)
  values(p_academy_id,v_case.id,(p_payload->>'amount')::bigint,upper(coalesce(nullif(trim(p_payload->>'currency'),''),'UZS')),
    (p_payload->>'promised_for')::date,nullif(trim(p_payload->>'notes'),''),p_idempotency_key,p_actor_id) returning * into v_promise;
  insert into public.academy_collection_events(academy_id,debt_case_id,event_type,channel,outcome,created_by,metadata)
  values(p_academy_id,v_case.id,'note','internal','Payment promise recorded',p_actor_id,jsonb_build_object('promise_id',v_promise.id,'promised_for',v_promise.promised_for));
  insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,contact_id,metadata)
  values(p_academy_id,p_actor_id,'debt.promise_recorded','academy_payment_promise',v_promise.id::text,p_contact_id,jsonb_build_object('amount',v_promise.amount,'promised_for',v_promise.promised_for));
  return jsonb_build_object('debt_case',to_jsonb(v_case),'promise',to_jsonb(v_promise));
end; $$;

create or replace function public.academy_manage_subscription(
  p_academy_id uuid, p_subscription_id uuid, p_actor_id uuid, p_action text,
  p_payload jsonb, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sub public.academy_subscriptions%rowtype;
  v_freeze public.academy_subscription_freezes%rowtype;
  v_action text := lower(trim(p_action));
  v_reason text := nullif(trim(p_payload->>'reason'), '');
  v_starts_on date;
  v_ends_on date;
  v_renewal jsonb;
begin
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Idempotency key is required'; end if;
  select * into v_sub from public.academy_subscriptions
    where academy_id=p_academy_id and id=p_subscription_id for update;
  if not found then raise exception 'Subscription not found'; end if;

  if exists(select 1 from public.domain_event_outbox where idempotency_key='subscription.command:'||p_idempotency_key) then
    select * into v_freeze from public.academy_subscription_freezes
      where academy_id=p_academy_id and idempotency_key=p_idempotency_key;
    select to_jsonb(s) into v_renewal from public.academy_subscriptions s
      where s.academy_id=p_academy_id and s.idempotency_key=p_idempotency_key;
    return jsonb_build_object(
      'subscription',to_jsonb(v_sub),
      'freeze',case when v_freeze.id is null then null else to_jsonb(v_freeze) end,
      'renewal',v_renewal
    );
  end if;

  if v_action='freeze' then
    if v_sub.status not in ('active','overdue') then raise exception 'Only an active or overdue subscription can be frozen'; end if;
    if v_reason is null then raise exception 'Freeze reason is required'; end if;
    v_starts_on:=coalesce(nullif(p_payload->>'starts_on','')::date,current_date);
    v_ends_on:=nullif(p_payload->>'ends_on','')::date;
    if v_ends_on is null or v_ends_on<v_starts_on then raise exception 'A valid freeze end date is required'; end if;
    insert into public.academy_subscription_freezes(
      academy_id,subscription_id,starts_on,ends_on,reason,status,idempotency_key,created_by
    ) values(
      p_academy_id,v_sub.id,v_starts_on,v_ends_on,v_reason,
      case when v_starts_on<=current_date then 'active' else 'scheduled' end,p_idempotency_key,p_actor_id
    ) returning * into v_freeze;
    if v_starts_on<=current_date then
      update public.academy_subscriptions set status='paused',updated_by=p_actor_id,updated_at=now()
        where academy_id=p_academy_id and id=v_sub.id returning * into v_sub;
    end if;
  elsif v_action='resume' then
    if v_sub.status<>'paused' then raise exception 'Only a paused subscription can be resumed'; end if;
    update public.academy_subscription_freezes set status='completed'
      where academy_id=p_academy_id and subscription_id=v_sub.id and status='active';
    update public.academy_subscription_freezes set status='cancelled'
      where academy_id=p_academy_id and subscription_id=v_sub.id and status='scheduled';
    update public.academy_subscriptions set status='active',updated_by=p_actor_id,updated_at=now()
      where academy_id=p_academy_id and id=v_sub.id returning * into v_sub;
  elsif v_action='cancel' then
    if v_sub.status not in ('draft','active','paused','overdue') then raise exception 'Subscription is already terminal'; end if;
    if v_reason is null then raise exception 'Cancellation reason is required'; end if;
    update public.academy_subscription_freezes set status='cancelled'
      where academy_id=p_academy_id and subscription_id=v_sub.id and status in ('scheduled','active');
    update public.academy_subscriptions set status='cancelled',cancelled_at=now(),cancellation_reason=v_reason,
      auto_renew=false,updated_by=p_actor_id,updated_at=now()
      where academy_id=p_academy_id and id=v_sub.id returning * into v_sub;
  elsif v_action='complete' then
    if v_sub.status not in ('active','paused','overdue') then raise exception 'Subscription cannot be completed in its current status'; end if;
    update public.academy_subscriptions set status='completed',completed_at=now(),auto_renew=false,
      updated_by=p_actor_id,updated_at=now()
      where academy_id=p_academy_id and id=v_sub.id returning * into v_sub;
  elsif v_action='renew' then
    v_starts_on:=coalesce(nullif(p_payload->>'starts_on','')::date,coalesce(v_sub.ends_on+1,current_date));
    v_ends_on:=nullif(p_payload->>'ends_on','')::date;
    v_renewal:=public.academy_create_subscription(
      p_academy_id,v_sub.contact_id,p_actor_id,
      jsonb_build_object(
        'pricing_plan_id',v_sub.pricing_plan_id,'branch_id',v_sub.branch_id,'classroom_id',v_sub.classroom_id,
        'status','active','starts_on',v_starts_on,'ends_on',v_ends_on,'billing_cycle',v_sub.billing_cycle,
        'billing_anchor_day',v_sub.billing_anchor_day,'list_amount',v_sub.list_amount,'discount_amount',v_sub.discount_amount,
        'discount_type','negotiated','discount_reason',coalesce(v_reason,'Renewed agreement terms'),
        'auto_renew',v_sub.auto_renew,'renewal_notice_days',v_sub.renewal_notice_days,
        'metadata',jsonb_build_object('renewed_from_subscription_id',v_sub.id)
      ),p_idempotency_key
    );
  else
    raise exception 'Invalid subscription action';
  end if;

  insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,contact_id,classroom_id,metadata)
  values(p_academy_id,p_actor_id,'subscription.'||v_action,'academy_subscription',v_sub.id::text,v_sub.contact_id,v_sub.classroom_id,
    jsonb_build_object('reason',v_reason,'renewal_subscription_id',v_renewal->>'id'));
  insert into public.domain_event_outbox(event_type,event_version,aggregate_type,aggregate_id,user_id,payload,idempotency_key)
  values('subscription.'||v_action,'v1','academy_subscription',v_sub.id,p_actor_id,
    jsonb_build_object('academy_id',p_academy_id,'contact_id',v_sub.contact_id,'subscription_id',v_sub.id,'renewal',v_renewal),
    'subscription.command:'||p_idempotency_key);
  return jsonb_build_object('subscription',to_jsonb(v_sub),'freeze',case when v_freeze.id is null then null else to_jsonb(v_freeze) end,'renewal',v_renewal);
end; $$;

revoke all on function public.academy_create_pricing_plan(uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.academy_create_subscription(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.academy_create_charge(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.academy_allocate_payment(uuid,uuid,uuid,bigint,uuid,text) from public,anon,authenticated;
revoke all on function public.academy_post_account_adjustment(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.academy_record_payment_reconciliation(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.academy_record_payment_promise(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.academy_manage_subscription(uuid,uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.academy_create_pricing_plan(uuid,uuid,jsonb,text) to service_role;
grant execute on function public.academy_create_subscription(uuid,uuid,uuid,jsonb,text) to service_role;
grant execute on function public.academy_create_charge(uuid,uuid,uuid,jsonb,text) to service_role;
grant execute on function public.academy_allocate_payment(uuid,uuid,uuid,bigint,uuid,text) to service_role;
grant execute on function public.academy_post_account_adjustment(uuid,uuid,uuid,jsonb,text) to service_role;
grant execute on function public.academy_record_payment_reconciliation(uuid,uuid,uuid,jsonb,text) to service_role;
grant execute on function public.academy_record_payment_promise(uuid,uuid,uuid,jsonb,text) to service_role;
grant execute on function public.academy_manage_subscription(uuid,uuid,uuid,text,jsonb,text) to service_role;

alter table public.academy_pricing_plans enable row level security;
alter table public.academy_subscriptions enable row level security;
alter table public.academy_subscription_freezes enable row level security;
alter table public.academy_pricing_adjustments enable row level security;
alter table public.academy_charges enable row level security;
alter table public.academy_payment_allocations enable row level security;
alter table public.academy_account_ledger_entries enable row level security;
alter table public.academy_debt_cases enable row level security;
alter table public.academy_payment_promises enable row level security;
alter table public.academy_collection_events enable row level security;
alter table public.academy_payment_reconciliations enable row level security;

create policy "Academy pricing plans read by finance staff" on public.academy_pricing_plans for select using (public.academy_finance_can_view(academy_id));
create policy "Academy subscriptions read by finance staff" on public.academy_subscriptions for select using (public.academy_finance_can_view(academy_id));
create policy "Academy freezes read by finance staff" on public.academy_subscription_freezes for select using (public.academy_finance_can_view(academy_id));
create policy "Academy pricing adjustments read by finance staff" on public.academy_pricing_adjustments for select using (public.academy_finance_can_view(academy_id));
create policy "Academy charges read by finance staff" on public.academy_charges for select using (public.academy_finance_can_view(academy_id));
create policy "Academy allocations read by finance staff" on public.academy_payment_allocations for select using (public.academy_finance_can_view(academy_id));
create policy "Academy ledger read by finance staff" on public.academy_account_ledger_entries for select using (public.academy_finance_can_view(academy_id));
create policy "Academy debt cases read by finance staff" on public.academy_debt_cases for select using (public.academy_finance_can_view(academy_id));
create policy "Academy promises read by finance staff" on public.academy_payment_promises for select using (public.academy_finance_can_view(academy_id));
create policy "Academy collection events read by finance staff" on public.academy_collection_events for select using (public.academy_finance_can_view(academy_id));
create policy "Academy reconciliations read by finance staff" on public.academy_payment_reconciliations for select using (public.academy_finance_can_view(academy_id));

drop policy if exists "Academy payments read by membership" on public.academy_payments;
create policy "Academy payments read by finance staff" on public.academy_payments
for select using (public.academy_finance_can_view(academy_id));

do $$ declare t text; begin
  foreach t in array array['academy_pricing_plans','academy_subscriptions','academy_charges','academy_debt_cases'] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.handle_updated_at()',t,t);
  end loop;
end $$;
