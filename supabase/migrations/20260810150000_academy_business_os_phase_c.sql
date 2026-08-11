-- Education Business OS Phase C: operational cash, expenses, economics, and payroll.
-- This is an operational subledger, not a general-ledger or statutory accounting system.

create unique index if not exists academy_staff_academy_id_id_uidx on public.academy_staff(academy_id,id);

create or replace function public.academy_payroll_can_view(p_academy_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.tenant_memberships m
    where m.tenant_id=p_academy_id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin')
  ) or exists(
    select 1 from public.academy_role_grants g
    where g.academy_id=p_academy_id and g.user_id=auth.uid() and g.status='active'
      and g.role in ('owner','admin','center_admin') and (g.starts_at is null or g.starts_at<=now())
      and (g.expires_at is null or g.expires_at>now())
  );
$$;

create table public.academy_cashboxes(
  id uuid primary key default gen_random_uuid(), academy_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null, name text not null, currency text not null default 'UZS', is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb, created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(academy_id,id), unique(academy_id,branch_id,name,currency),
  foreign key(academy_id,branch_id) references public.academy_branches(academy_id,id) on delete restrict
);

create table public.academy_cashier_shifts(
  id uuid primary key default gen_random_uuid(), academy_id uuid not null references public.tenants(id) on delete cascade,
  cashbox_id uuid not null, cashier_user_id uuid not null references public.users(id) on delete restrict,
  opened_at timestamptz not null default now(), closed_at timestamptz, opening_balance bigint not null check(opening_balance>=0),
  expected_closing_balance bigint, counted_closing_balance bigint, discrepancy bigint,
  status text not null default 'open' check(status in ('open','closed','reconciled','cancelled')),
  opening_note text, closing_note text, idempotency_key text not null, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(academy_id,id), unique(academy_id,idempotency_key),
  foreign key(academy_id,cashbox_id) references public.academy_cashboxes(academy_id,id) on delete restrict
);
create unique index academy_cashier_shifts_one_open_idx on public.academy_cashier_shifts(academy_id,cashbox_id) where status='open';

create table public.academy_expense_categories(
  id uuid primary key default gen_random_uuid(), academy_id uuid not null references public.tenants(id) on delete cascade,
  parent_id uuid, category_key text not null, name text not null, kind text not null default 'operating'
    check(kind in ('operating','teaching','marketing','facility','technology','payroll','tax','other')),
  is_active boolean not null default true, metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(academy_id,id), unique(academy_id,category_key),
  foreign key(academy_id,parent_id) references public.academy_expense_categories(academy_id,id) on delete restrict
);

create table public.academy_expenses(
  id uuid primary key default gen_random_uuid(), academy_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid, classroom_id uuid, category_id uuid not null, expense_date date not null default current_date,
  amount bigint not null check(amount>0), currency text not null default 'UZS', vendor text, description text not null,
  payment_method text not null default 'cash' check(payment_method in ('cash','bank_transfer','manual_pos','manual_settlement','other')),
  status text not null default 'approved' check(status in ('draft','approved','paid','void')),
  receipt_ref text, idempotency_key text not null, approved_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(academy_id,id), unique(academy_id,idempotency_key),
  foreign key(academy_id,branch_id) references public.academy_branches(academy_id,id) on delete restrict,
  foreign key(academy_id,classroom_id) references public.academy_classrooms(academy_id,id) on delete restrict,
  foreign key(academy_id,category_id) references public.academy_expense_categories(academy_id,id) on delete restrict
);

create table public.academy_cash_movements(
  id uuid primary key default gen_random_uuid(), academy_id uuid not null references public.tenants(id) on delete cascade,
  shift_id uuid not null, direction text not null check(direction in ('incoming','outgoing')),
  movement_type text not null check(movement_type in ('payment','expense','refund','payroll','transfer','opening_adjustment','closing_adjustment','other')),
  payment_method text not null check(payment_method in ('cash','bank_transfer','manual_pos','manual_settlement','click','payme','other')),
  amount bigint not null check(amount>0), currency text not null default 'UZS', occurred_at timestamptz not null default now(),
  academy_payment_id uuid, expense_id uuid, payroll_payout_id uuid, counterparty text, reason text not null,
  idempotency_key text not null, recorded_by uuid not null references public.users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique(academy_id,id), unique(academy_id,idempotency_key),
  foreign key(academy_id,shift_id) references public.academy_cashier_shifts(academy_id,id) on delete restrict,
  foreign key(academy_id,academy_payment_id) references public.academy_payments(academy_id,id) on delete restrict,
  foreign key(academy_id,expense_id) references public.academy_expenses(academy_id,id) on delete restrict
);

create table public.academy_cash_reconciliations(
  id uuid primary key default gen_random_uuid(), academy_id uuid not null references public.tenants(id) on delete cascade,
  shift_id uuid not null, expected_amount bigint not null, counted_amount bigint not null, discrepancy bigint not null,
  status text not null check(status in ('matched','discrepancy','reviewed')), reason text,
  idempotency_key text not null, reconciled_by uuid not null references public.users(id) on delete restrict,
  reconciled_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb,
  unique(academy_id,id), unique(academy_id,idempotency_key),
  foreign key(academy_id,shift_id) references public.academy_cashier_shifts(academy_id,id) on delete restrict
);

create table public.academy_budgets(
  id uuid primary key default gen_random_uuid(), academy_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid, category_id uuid, period_start date not null, period_end date not null, amount bigint not null check(amount>=0),
  currency text not null default 'UZS', status text not null default 'active' check(status in ('draft','active','closed','cancelled')),
  notes text, created_by uuid references public.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(academy_id,id), foreign key(academy_id,branch_id) references public.academy_branches(academy_id,id) on delete restrict,
  foreign key(academy_id,category_id) references public.academy_expense_categories(academy_id,id) on delete restrict,
  check(period_end>=period_start)
);

create table public.academy_lesson_deliveries(
  id uuid primary key default gen_random_uuid(), academy_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid, classroom_id uuid not null, staff_id uuid not null, delivered_on date not null,
  started_at timestamptz, ended_at timestamptz, duration_minutes integer not null check(duration_minutes between 1 and 1440),
  delivery_status text not null default 'delivered' check(delivery_status in ('scheduled','delivered','cancelled','substituted','make_up')),
  student_count integer not null default 0 check(student_count>=0), source_schedule_id uuid, substitute_for_staff_id uuid,
  verified_by uuid references public.users(id) on delete set null, idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(academy_id,id), unique(academy_id,idempotency_key),
  foreign key(academy_id,branch_id) references public.academy_branches(academy_id,id) on delete restrict,
  foreign key(academy_id,classroom_id) references public.academy_classrooms(academy_id,id) on delete restrict,
  foreign key(academy_id,staff_id) references public.academy_staff(academy_id,id) on delete restrict,
  foreign key(academy_id,substitute_for_staff_id) references public.academy_staff(academy_id,id) on delete restrict
);

create table public.academy_compensation_rules(
  id uuid primary key default gen_random_uuid(), academy_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null, branch_id uuid, rule_type text not null check(rule_type in (
    'fixed_monthly','per_lesson','per_teaching_hour','per_student','percentage_group_revenue',
    'fixed_commission','fixed_performance_bonus','tiered_rate','manual_custom_adjustment'
  )), name text not null, currency text not null default 'UZS', fixed_amount bigint not null default 0 check(fixed_amount>=0),
  unit_rate bigint not null default 0 check(unit_rate>=0), percentage_basis_points integer not null default 0 check(percentage_basis_points between 0 and 10000),
  performance_bonus bigint not null default 0 check(performance_bonus>=0), tiers jsonb not null default '[]'::jsonb,
  effective_from date not null, effective_to date, is_active boolean not null default true, version integer not null default 1 check(version>0),
  notes text, metadata jsonb not null default '{}'::jsonb, created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(academy_id,id), foreign key(academy_id,staff_id) references public.academy_staff(academy_id,id) on delete restrict,
  foreign key(academy_id,branch_id) references public.academy_branches(academy_id,id) on delete restrict,
  check(effective_to is null or effective_to>=effective_from)
);
create unique index academy_compensation_rules_active_academy_idx on public.academy_compensation_rules(academy_id,staff_id) where branch_id is null and is_active;
create unique index academy_compensation_rules_active_branch_idx on public.academy_compensation_rules(academy_id,staff_id,branch_id) where branch_id is not null and is_active;

create table public.academy_payroll_periods(
  id uuid primary key default gen_random_uuid(), academy_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid, period_start date not null, period_end date not null, currency text not null default 'UZS',
  status text not null default 'draft' check(status in ('draft','calculated','reviewed','approved','paid','cancelled')),
  calculated_at timestamptz, reviewed_at timestamptz, reviewed_by uuid references public.users(id) on delete set null,
  approved_at timestamptz, approved_by uuid references public.users(id) on delete set null,
  paid_at timestamptz, paid_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz, cancellation_reason text, idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb, created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(academy_id,id), unique(academy_id,idempotency_key),
  foreign key(academy_id,branch_id) references public.academy_branches(academy_id,id) on delete restrict,
  check(period_end>=period_start)
);

create table public.academy_payroll_rows(
  id uuid primary key default gen_random_uuid(), academy_id uuid not null references public.tenants(id) on delete cascade,
  payroll_period_id uuid not null, staff_id uuid not null, branch_id uuid, compensation_rule_id uuid not null,
  lessons_delivered integer not null default 0, minutes_delivered integer not null default 0, relevant_students integer not null default 0,
  generated_revenue bigint not null default 0, generated_amount bigint not null default 0, currency text not null default 'UZS',
  rule_snapshot jsonb not null, inputs_snapshot jsonb not null, calculation_version text not null default 'v1',
  created_at timestamptz not null default now(), unique(academy_id,id), unique(academy_id,payroll_period_id,staff_id),
  foreign key(academy_id,payroll_period_id) references public.academy_payroll_periods(academy_id,id) on delete restrict,
  foreign key(academy_id,staff_id) references public.academy_staff(academy_id,id) on delete restrict,
  foreign key(academy_id,branch_id) references public.academy_branches(academy_id,id) on delete restrict,
  foreign key(academy_id,compensation_rule_id) references public.academy_compensation_rules(academy_id,id) on delete restrict
);

create table public.academy_payroll_row_components(
  id uuid primary key default gen_random_uuid(), academy_id uuid not null references public.tenants(id) on delete cascade,
  payroll_row_id uuid not null, classroom_id uuid, component_type text not null,
  quantity numeric not null default 0, rate bigint not null default 0, amount bigint not null, source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), unique(academy_id,id),
  foreign key(academy_id,payroll_row_id) references public.academy_payroll_rows(academy_id,id) on delete restrict,
  foreign key(academy_id,classroom_id) references public.academy_classrooms(academy_id,id) on delete restrict
);

create table public.academy_payroll_adjustments(
  id uuid primary key default gen_random_uuid(), academy_id uuid not null references public.tenants(id) on delete cascade,
  payroll_row_id uuid not null, adjustment_type text not null check(adjustment_type in ('bonus','deduction','correction')),
  amount bigint not null, reason text not null, idempotency_key text not null,
  created_by uuid not null references public.users(id) on delete restrict, created_at timestamptz not null default now(),
  unique(academy_id,id), unique(academy_id,idempotency_key),
  foreign key(academy_id,payroll_row_id) references public.academy_payroll_rows(academy_id,id) on delete restrict,
  check((adjustment_type='deduction' and amount<0) or (adjustment_type in ('bonus','correction') and amount<>0))
);

create table public.academy_payroll_payouts(
  id uuid primary key default gen_random_uuid(), academy_id uuid not null references public.tenants(id) on delete cascade,
  payroll_period_id uuid not null, payroll_row_id uuid not null, staff_id uuid not null,
  amount bigint not null check(amount>=0), currency text not null, payment_method text not null,
  payment_reference text, paid_at timestamptz not null default now(), paid_by uuid not null references public.users(id) on delete restrict,
  idempotency_key text not null, metadata jsonb not null default '{}'::jsonb,
  unique(academy_id,id), unique(academy_id,idempotency_key), unique(academy_id,payroll_row_id),
  foreign key(academy_id,payroll_period_id) references public.academy_payroll_periods(academy_id,id) on delete restrict,
  foreign key(academy_id,payroll_row_id) references public.academy_payroll_rows(academy_id,id) on delete restrict,
  foreign key(academy_id,staff_id) references public.academy_staff(academy_id,id) on delete restrict
);
alter table public.academy_cash_movements add constraint academy_cash_movements_payroll_payout_fk
  foreign key(academy_id,payroll_payout_id) references public.academy_payroll_payouts(academy_id,id) on delete restrict;

create or replace function public.academy_reject_operational_finance_history_mutation()
returns trigger language plpgsql as $$ begin raise exception 'Operational finance and payroll history is immutable; post a correction or new evidence'; end; $$;
create trigger academy_cash_movements_immutable before update or delete on public.academy_cash_movements for each row execute function public.academy_reject_operational_finance_history_mutation();
create trigger academy_cash_reconciliations_immutable before update or delete on public.academy_cash_reconciliations for each row execute function public.academy_reject_operational_finance_history_mutation();
create trigger academy_payroll_rows_immutable before update or delete on public.academy_payroll_rows for each row execute function public.academy_reject_operational_finance_history_mutation();
create trigger academy_payroll_components_immutable before update or delete on public.academy_payroll_row_components for each row execute function public.academy_reject_operational_finance_history_mutation();
create trigger academy_payroll_adjustments_immutable before update or delete on public.academy_payroll_adjustments for each row execute function public.academy_reject_operational_finance_history_mutation();
create trigger academy_payroll_payouts_immutable before update or delete on public.academy_payroll_payouts for each row execute function public.academy_reject_operational_finance_history_mutation();

create or replace view public.academy_payroll_row_totals with(security_invoker=true) as
select r.*,coalesce(a.adjustment_amount,0)::bigint adjustment_amount,
  greatest(r.generated_amount+coalesce(a.adjustment_amount,0),0)::bigint final_payable_amount
from public.academy_payroll_rows r left join(
  select academy_id,payroll_row_id,sum(amount)::bigint adjustment_amount from public.academy_payroll_adjustments group by academy_id,payroll_row_id
)a on a.academy_id=r.academy_id and a.payroll_row_id=r.id;

create or replace view public.academy_branch_contribution with(security_invoker=true) as
select b.academy_id,b.id branch_id,b.name branch_name,c.currency,
  coalesce(r.generated_revenue,0)::bigint generated_revenue,coalesce(e.operating_expenses,0)::bigint operating_expenses,
  coalesce(p.teacher_cost,0)::bigint teacher_cost,
  (coalesce(r.generated_revenue,0)-coalesce(e.operating_expenses,0)-coalesce(p.teacher_cost,0))::bigint contribution
from public.academy_branches b cross join lateral(select b.currency currency)c
left join(select academy_id,branch_id,currency,sum(effective_amount)::bigint generated_revenue from public.academy_charge_balances group by academy_id,branch_id,currency)r
  on r.academy_id=b.academy_id and r.branch_id=b.id and r.currency=c.currency
left join(select academy_id,branch_id,currency,sum(amount)::bigint operating_expenses from public.academy_expenses where status in('approved','paid') group by academy_id,branch_id,currency)e
  on e.academy_id=b.academy_id and e.branch_id=b.id and e.currency=c.currency
left join(select academy_id,branch_id,currency,sum(final_payable_amount)::bigint teacher_cost from public.academy_payroll_row_totals group by academy_id,branch_id,currency)p
  on p.academy_id=b.academy_id and p.branch_id=b.id and p.currency=c.currency;

create or replace view public.academy_classroom_contribution with(security_invoker=true) as
select c.academy_id,c.id classroom_id,c.name classroom_name,coalesce(r.currency,'UZS') currency,
  coalesce(r.generated_revenue,0)::bigint generated_revenue,coalesce(e.operating_expenses,0)::bigint operating_expenses,
  coalesce(p.attributed_teacher_cost,0)::bigint attributed_teacher_cost,
  (coalesce(r.generated_revenue,0)-coalesce(e.operating_expenses,0)-coalesce(p.attributed_teacher_cost,0))::bigint contribution
from public.academy_classrooms c
left join(select academy_id,classroom_id,currency,sum(effective_amount)::bigint generated_revenue from public.academy_charge_balances where classroom_id is not null group by academy_id,classroom_id,currency)r
  on r.academy_id=c.academy_id and r.classroom_id=c.id
left join(select academy_id,classroom_id,currency,sum(amount)::bigint operating_expenses from public.academy_expenses where classroom_id is not null and status in('approved','paid') group by academy_id,classroom_id,currency)e
  on e.academy_id=c.academy_id and e.classroom_id=c.id and e.currency=coalesce(r.currency,e.currency)
left join(select x.academy_id,x.classroom_id,t.currency,sum(x.amount)::bigint attributed_teacher_cost from public.academy_payroll_row_components x join public.academy_payroll_rows t on t.academy_id=x.academy_id and t.id=x.payroll_row_id where x.classroom_id is not null group by x.academy_id,x.classroom_id,t.currency)p
  on p.academy_id=c.academy_id and p.classroom_id=c.id and p.currency=coalesce(r.currency,p.currency);

create or replace function public.academy_open_cashier_shift(p_academy_id uuid,p_cashbox_id uuid,p_actor_id uuid,p_opening_balance bigint,p_note text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$ declare v public.academy_cashier_shifts%rowtype;
begin
 select * into v from public.academy_cashier_shifts where academy_id=p_academy_id and idempotency_key=p_idempotency_key;if found then return to_jsonb(v);end if;
 if p_opening_balance<0 then raise exception 'Opening balance cannot be negative';end if;
 insert into public.academy_cashier_shifts(academy_id,cashbox_id,cashier_user_id,opening_balance,opening_note,idempotency_key)
 values(p_academy_id,p_cashbox_id,p_actor_id,p_opening_balance,nullif(trim(p_note),''),p_idempotency_key) returning * into v;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata) values(p_academy_id,p_actor_id,'cashier.shift_opened','academy_cashier_shift',v.id::text,jsonb_build_object('opening_balance',p_opening_balance));return to_jsonb(v);
end;$$;

create or replace function public.ensure_academy_operations_defaults(p_academy_id uuid,p_actor_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 insert into public.academy_expense_categories(academy_id,category_key,name,kind,created_by)
 select p_academy_id,v.key,v.name,v.kind,p_actor_id from(values
  ('rent','Rent','facility'),('utilities','Utilities','facility'),('teaching-materials','Teaching materials','teaching'),
  ('marketing','Marketing','marketing'),('technology','Technology','technology'),('staff-payroll','Staff payroll','payroll'),('other','Other','other')
 )v(key,name,kind) on conflict(academy_id,category_key) do nothing;
end;$$;

create or replace function public.academy_record_cash_movement(p_academy_id uuid,p_shift_id uuid,p_actor_id uuid,p_payload jsonb,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$ declare v public.academy_cash_movements%rowtype;v_shift public.academy_cashier_shifts%rowtype;v_currency text;
begin
 select * into v from public.academy_cash_movements where academy_id=p_academy_id and idempotency_key=p_idempotency_key;if found then return to_jsonb(v);end if;
 select * into v_shift from public.academy_cashier_shifts where academy_id=p_academy_id and id=p_shift_id and status='open' for update;if not found then raise exception 'Open cashier shift not found';end if;
 select currency into v_currency from public.academy_cashboxes where academy_id=p_academy_id and id=v_shift.cashbox_id;
 if upper(coalesce(nullif(p_payload->>'currency',''),'UZS'))<>v_currency then raise exception 'Movement and cashbox currencies differ';end if;
 insert into public.academy_cash_movements(academy_id,shift_id,direction,movement_type,payment_method,amount,currency,academy_payment_id,expense_id,counterparty,reason,idempotency_key,recorded_by,metadata)
 values(p_academy_id,p_shift_id,lower(p_payload->>'direction'),lower(p_payload->>'movement_type'),lower(p_payload->>'payment_method'),(p_payload->>'amount')::bigint,upper(coalesce(nullif(p_payload->>'currency',''),'UZS')),nullif(p_payload->>'academy_payment_id','')::uuid,nullif(p_payload->>'expense_id','')::uuid,nullif(trim(p_payload->>'counterparty'),''),trim(p_payload->>'reason'),p_idempotency_key,p_actor_id,coalesce(p_payload->'metadata','{}')) returning * into v;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata) values(p_academy_id,p_actor_id,'cashier.movement_recorded','academy_cash_movement',v.id::text,jsonb_build_object('direction',v.direction,'amount',v.amount,'method',v.payment_method));return to_jsonb(v);
end;$$;

create or replace function public.academy_close_cashier_shift(p_academy_id uuid,p_shift_id uuid,p_actor_id uuid,p_counted bigint,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$ declare v public.academy_cashier_shifts%rowtype;v_expected bigint;v_rec public.academy_cash_reconciliations%rowtype;
begin
 select * into v_rec from public.academy_cash_reconciliations where academy_id=p_academy_id and idempotency_key=p_idempotency_key;if found then select * into v from public.academy_cashier_shifts where academy_id=p_academy_id and id=p_shift_id;return jsonb_build_object('shift',to_jsonb(v),'reconciliation',to_jsonb(v_rec));end if;
 select * into v from public.academy_cashier_shifts where academy_id=p_academy_id and id=p_shift_id and status='open' for update;if not found then raise exception 'Open cashier shift not found';end if;
 select v.opening_balance+coalesce(sum(case when direction='incoming' then amount else -amount end),0) into v_expected from public.academy_cash_movements where academy_id=p_academy_id and shift_id=p_shift_id and payment_method='cash';
 update public.academy_cashier_shifts set status='closed',closed_at=now(),expected_closing_balance=v_expected,counted_closing_balance=p_counted,discrepancy=p_counted-v_expected,closing_note=nullif(trim(p_reason),''),updated_at=now() where academy_id=p_academy_id and id=p_shift_id returning * into v;
 insert into public.academy_cash_reconciliations(academy_id,shift_id,expected_amount,counted_amount,discrepancy,status,reason,idempotency_key,reconciled_by)
 values(p_academy_id,p_shift_id,v_expected,p_counted,p_counted-v_expected,case when p_counted=v_expected then 'matched' else 'discrepancy' end,nullif(trim(p_reason),''),p_idempotency_key,p_actor_id) returning * into v_rec;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata) values(p_academy_id,p_actor_id,'cashier.shift_closed','academy_cashier_shift',v.id::text,jsonb_build_object('expected',v_expected,'counted',p_counted,'discrepancy',p_counted-v_expected));return jsonb_build_object('shift',to_jsonb(v),'reconciliation',to_jsonb(v_rec));
end;$$;

create or replace function public.academy_record_expense(p_academy_id uuid,p_actor_id uuid,p_payload jsonb,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$ declare v public.academy_expenses%rowtype;
begin select * into v from public.academy_expenses where academy_id=p_academy_id and idempotency_key=p_idempotency_key;if found then return to_jsonb(v);end if;
 insert into public.academy_expenses(academy_id,branch_id,classroom_id,category_id,expense_date,amount,currency,vendor,description,payment_method,status,receipt_ref,idempotency_key,approved_by,created_by,metadata)
 values(p_academy_id,nullif(p_payload->>'branch_id','')::uuid,nullif(p_payload->>'classroom_id','')::uuid,(p_payload->>'category_id')::uuid,coalesce(nullif(p_payload->>'expense_date','')::date,current_date),(p_payload->>'amount')::bigint,upper(coalesce(nullif(p_payload->>'currency',''),'UZS')),nullif(trim(p_payload->>'vendor'),''),trim(p_payload->>'description'),lower(coalesce(nullif(p_payload->>'payment_method',''),'cash')),lower(coalesce(nullif(p_payload->>'status',''),'approved')),nullif(trim(p_payload->>'receipt_ref'),''),p_idempotency_key,p_actor_id,p_actor_id,coalesce(p_payload->'metadata','{}')) returning * into v;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata) values(p_academy_id,p_actor_id,'expense.recorded','academy_expense',v.id::text,jsonb_build_object('amount',v.amount,'category_id',v.category_id));return to_jsonb(v);end;$$;

create or replace function public.academy_create_payroll_period(p_academy_id uuid,p_actor_id uuid,p_payload jsonb,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$ declare v public.academy_payroll_periods%rowtype;
begin select * into v from public.academy_payroll_periods where academy_id=p_academy_id and idempotency_key=p_idempotency_key;if found then return to_jsonb(v);end if;
 insert into public.academy_payroll_periods(academy_id,branch_id,period_start,period_end,currency,idempotency_key,created_by)
 values(p_academy_id,nullif(p_payload->>'branch_id','')::uuid,(p_payload->>'period_start')::date,(p_payload->>'period_end')::date,upper(coalesce(nullif(p_payload->>'currency',''),'UZS')),p_idempotency_key,p_actor_id) returning * into v;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata) values(p_academy_id,p_actor_id,'payroll.period_created','academy_payroll_period',v.id::text,jsonb_build_object('period_start',v.period_start,'period_end',v.period_end));return to_jsonb(v);end;$$;

create or replace function public.academy_compensation_tier_rate(p_tiers jsonb,p_quantity integer,p_default bigint)
returns bigint language plpgsql immutable as $$ declare v jsonb;
begin
 for v in select value from jsonb_array_elements(case when jsonb_typeof(p_tiers)='array' then p_tiers else '[]'::jsonb end)
   order by coalesce(nullif(value->>'up_to','')::integer,2147483647) loop
   if p_quantity<=coalesce(nullif(v->>'up_to','')::integer,2147483647) then return coalesce(nullif(v->>'rate','')::bigint,p_default);end if;
 end loop;return p_default;
end;$$;

create or replace function public.academy_calculate_payroll(p_academy_id uuid,p_period_id uuid,p_actor_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_period public.academy_payroll_periods%rowtype;v_rule public.academy_compensation_rules%rowtype;v_lessons int;v_minutes int;v_students int;v_revenue bigint;v_amount bigint;v_row public.academy_payroll_rows%rowtype;v_count int:=0;
begin
 select * into v_period from public.academy_payroll_periods where academy_id=p_academy_id and id=p_period_id for update;if not found then raise exception 'Payroll period not found';end if;
 if v_period.status='calculated' and exists(select 1 from public.academy_payroll_rows where academy_id=p_academy_id and payroll_period_id=p_period_id) then return jsonb_build_object('period',to_jsonb(v_period),'row_count',(select count(*) from public.academy_payroll_rows where academy_id=p_academy_id and payroll_period_id=p_period_id));end if;
 if v_period.status<>'draft' then raise exception 'Only a draft payroll period can be calculated';end if;
 for v_rule in select * from public.academy_compensation_rules r where r.academy_id=p_academy_id and r.is_active and r.currency=v_period.currency and r.effective_from<=v_period.period_end and (r.effective_to is null or r.effective_to>=v_period.period_start) and (v_period.branch_id is null or r.branch_id is null or r.branch_id=v_period.branch_id) loop
  select count(*),coalesce(sum(duration_minutes),0) into v_lessons,v_minutes from public.academy_lesson_deliveries d where d.academy_id=p_academy_id and d.staff_id=v_rule.staff_id and d.delivered_on between v_period.period_start and v_period.period_end and d.delivery_status in('delivered','substituted','make_up') and (v_period.branch_id is null or d.branch_id=v_period.branch_id);
  select count(distinct m.contact_id) into v_students from public.academy_classroom_memberships m where m.academy_id=p_academy_id and m.role='student' and m.status='active' and m.classroom_id in(select distinct d.classroom_id from public.academy_lesson_deliveries d where d.academy_id=p_academy_id and d.staff_id=v_rule.staff_id and d.delivered_on between v_period.period_start and v_period.period_end and d.delivery_status in('delivered','substituted','make_up'));
  select coalesce(sum(c.effective_amount),0) into v_revenue from public.academy_charge_balances c where c.academy_id=p_academy_id and c.issued_on between v_period.period_start and v_period.period_end and c.classroom_id in(select distinct d.classroom_id from public.academy_lesson_deliveries d where d.academy_id=p_academy_id and d.staff_id=v_rule.staff_id and d.delivered_on between v_period.period_start and v_period.period_end and d.delivery_status in('delivered','substituted','make_up'));
  v_amount:=case v_rule.rule_type when 'fixed_monthly' then v_rule.fixed_amount when 'per_lesson' then v_lessons*v_rule.unit_rate when 'per_teaching_hour' then round((v_minutes::numeric/60)*v_rule.unit_rate)::bigint when 'per_student' then v_students*v_rule.unit_rate when 'percentage_group_revenue' then round(v_revenue*v_rule.percentage_basis_points::numeric/10000)::bigint when 'fixed_commission' then v_rule.fixed_amount+round(v_revenue*v_rule.percentage_basis_points::numeric/10000)::bigint when 'fixed_performance_bonus' then v_rule.fixed_amount+v_rule.performance_bonus when 'tiered_rate' then v_lessons*public.academy_compensation_tier_rate(v_rule.tiers,v_lessons,v_rule.unit_rate) when 'manual_custom_adjustment' then 0 else 0 end;
  insert into public.academy_payroll_rows(academy_id,payroll_period_id,staff_id,branch_id,compensation_rule_id,lessons_delivered,minutes_delivered,relevant_students,generated_revenue,generated_amount,currency,rule_snapshot,inputs_snapshot)
  values(p_academy_id,p_period_id,v_rule.staff_id,coalesce(v_rule.branch_id,v_period.branch_id),v_rule.id,v_lessons,v_minutes,v_students,v_revenue,v_amount,v_rule.currency,to_jsonb(v_rule)-'metadata',jsonb_build_object('lessons',v_lessons,'minutes',v_minutes,'students',v_students,'generated_revenue',v_revenue,'period_start',v_period.period_start,'period_end',v_period.period_end)) returning * into v_row;
  if v_rule.rule_type='per_lesson' then
   insert into public.academy_payroll_row_components(academy_id,payroll_row_id,classroom_id,component_type,quantity,rate,amount,source_snapshot)
   select p_academy_id,v_row.id,d.classroom_id,v_rule.rule_type,count(*),v_rule.unit_rate,count(*)*v_rule.unit_rate,jsonb_build_object('rule_version',v_rule.version)
   from public.academy_lesson_deliveries d where d.academy_id=p_academy_id and d.staff_id=v_rule.staff_id and d.delivered_on between v_period.period_start and v_period.period_end and d.delivery_status in('delivered','substituted','make_up') and(v_period.branch_id is null or d.branch_id=v_period.branch_id) group by d.classroom_id;
  elsif v_rule.rule_type='per_teaching_hour' then
   insert into public.academy_payroll_row_components(academy_id,payroll_row_id,classroom_id,component_type,quantity,rate,amount,source_snapshot)
   select p_academy_id,v_row.id,d.classroom_id,v_rule.rule_type,sum(d.duration_minutes)::numeric/60,v_rule.unit_rate,round((sum(d.duration_minutes)::numeric/60)*v_rule.unit_rate)::bigint,jsonb_build_object('rule_version',v_rule.version)
   from public.academy_lesson_deliveries d where d.academy_id=p_academy_id and d.staff_id=v_rule.staff_id and d.delivered_on between v_period.period_start and v_period.period_end and d.delivery_status in('delivered','substituted','make_up') and(v_period.branch_id is null or d.branch_id=v_period.branch_id) group by d.classroom_id;
  else
   insert into public.academy_payroll_row_components(academy_id,payroll_row_id,classroom_id,component_type,quantity,rate,amount,source_snapshot) values(p_academy_id,v_row.id,null,v_rule.rule_type,case when v_rule.rule_type='per_student' then v_students else 1 end,case when v_rule.rule_type in('percentage_group_revenue','fixed_commission') then v_rule.percentage_basis_points else v_rule.unit_rate end,v_amount,jsonb_build_object('rule_version',v_rule.version));
  end if;v_count:=v_count+1;
 end loop;
 update public.academy_payroll_periods set status='calculated',calculated_at=now(),updated_at=now() where academy_id=p_academy_id and id=p_period_id returning * into v_period;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata) values(p_academy_id,p_actor_id,'payroll.calculated','academy_payroll_period',p_period_id::text,jsonb_build_object('row_count',v_count,'calculation_version','v1'));
 insert into public.domain_event_outbox(event_type,event_version,aggregate_type,aggregate_id,user_id,payload,idempotency_key) values('payroll.calculated','v1','academy_payroll_period',p_period_id,p_actor_id,jsonb_build_object('academy_id',p_academy_id,'payroll_period_id',p_period_id,'row_count',v_count),'payroll.calculated:'||p_idempotency_key) on conflict(idempotency_key) do nothing;
 return jsonb_build_object('period',to_jsonb(v_period),'row_count',v_count);
end;$$;

create or replace function public.academy_transition_payroll(p_academy_id uuid,p_period_id uuid,p_actor_id uuid,p_next_status text,p_payload jsonb,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$ declare v public.academy_payroll_periods%rowtype;v_next text:=lower(trim(p_next_status));v_row record;
begin select * into v from public.academy_payroll_periods where academy_id=p_academy_id and id=p_period_id for update;if not found then raise exception 'Payroll period not found';end if;
 if exists(select 1 from public.domain_event_outbox where idempotency_key='payroll.transition:'||p_idempotency_key) then return to_jsonb(v);end if;
 if not((v.status='calculated' and v_next='reviewed') or(v.status='reviewed' and v_next='approved')or(v.status='approved' and v_next='paid')or(v.status in('draft','calculated','reviewed','approved') and v_next='cancelled')) then raise exception 'Invalid payroll transition';end if;
 if v_next='paid' and nullif(trim(p_payload->>'payment_method'),'') is null then raise exception 'Payment method is required';end if;
 update public.academy_payroll_periods set status=v_next,reviewed_at=case when v_next='reviewed' then now() else reviewed_at end,reviewed_by=case when v_next='reviewed' then p_actor_id else reviewed_by end,approved_at=case when v_next='approved' then now() else approved_at end,approved_by=case when v_next='approved' then p_actor_id else approved_by end,paid_at=case when v_next='paid' then now() else paid_at end,paid_by=case when v_next='paid' then p_actor_id else paid_by end,cancelled_at=case when v_next='cancelled' then now() else cancelled_at end,cancellation_reason=case when v_next='cancelled' then nullif(trim(p_payload->>'reason'),'') else cancellation_reason end,updated_at=now() where academy_id=p_academy_id and id=p_period_id returning * into v;
 if v_next='paid' then for v_row in select * from public.academy_payroll_row_totals where academy_id=p_academy_id and payroll_period_id=p_period_id loop insert into public.academy_payroll_payouts(academy_id,payroll_period_id,payroll_row_id,staff_id,amount,currency,payment_method,payment_reference,paid_by,idempotency_key) values(p_academy_id,p_period_id,v_row.id,v_row.staff_id,v_row.final_payable_amount,v_row.currency,lower(p_payload->>'payment_method'),nullif(trim(p_payload->>'payment_reference'),''),p_actor_id,p_idempotency_key||':'||v_row.id::text);end loop;end if;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata) values(p_academy_id,p_actor_id,'payroll.'||v_next,'academy_payroll_period',p_period_id::text,jsonb_build_object('reason',p_payload->>'reason','payment_reference',p_payload->>'payment_reference'));
 insert into public.domain_event_outbox(event_type,event_version,aggregate_type,aggregate_id,user_id,payload,idempotency_key) values('payroll.'||v_next,'v1','academy_payroll_period',p_period_id,p_actor_id,jsonb_build_object('academy_id',p_academy_id,'payroll_period_id',p_period_id,'status',v_next),'payroll.transition:'||p_idempotency_key);return to_jsonb(v);end;$$;

create or replace function public.academy_post_payroll_adjustment(p_academy_id uuid,p_row_id uuid,p_actor_id uuid,p_type text,p_amount bigint,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$ declare v public.academy_payroll_adjustments%rowtype;v_status text;
begin select * into v from public.academy_payroll_adjustments where academy_id=p_academy_id and idempotency_key=p_idempotency_key;if found then return to_jsonb(v);end if;
 select p.status into v_status from public.academy_payroll_rows r join public.academy_payroll_periods p on p.academy_id=r.academy_id and p.id=r.payroll_period_id where r.academy_id=p_academy_id and r.id=p_row_id;if v_status not in('calculated','reviewed') then raise exception 'Adjustments are only allowed before approval';end if;
 insert into public.academy_payroll_adjustments(academy_id,payroll_row_id,adjustment_type,amount,reason,idempotency_key,created_by) values(p_academy_id,p_row_id,lower(p_type),p_amount,trim(p_reason),p_idempotency_key,p_actor_id) returning * into v;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata) values(p_academy_id,p_actor_id,'payroll.adjusted','academy_payroll_row',p_row_id::text,jsonb_build_object('type',p_type,'amount',p_amount,'reason',p_reason));return to_jsonb(v);end;$$;

revoke all on function public.academy_open_cashier_shift(uuid,uuid,uuid,bigint,text,text) from public,anon,authenticated;
revoke all on function public.ensure_academy_operations_defaults(uuid,uuid) from public,anon,authenticated;
revoke all on function public.academy_record_cash_movement(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.academy_close_cashier_shift(uuid,uuid,uuid,bigint,text,text) from public,anon,authenticated;
revoke all on function public.academy_record_expense(uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.academy_create_payroll_period(uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.academy_calculate_payroll(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.academy_transition_payroll(uuid,uuid,uuid,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.academy_post_payroll_adjustment(uuid,uuid,uuid,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.academy_open_cashier_shift(uuid,uuid,uuid,bigint,text,text) to service_role;
grant execute on function public.ensure_academy_operations_defaults(uuid,uuid) to service_role;
grant execute on function public.academy_record_cash_movement(uuid,uuid,uuid,jsonb,text) to service_role;
grant execute on function public.academy_close_cashier_shift(uuid,uuid,uuid,bigint,text,text) to service_role;
grant execute on function public.academy_record_expense(uuid,uuid,jsonb,text) to service_role;
grant execute on function public.academy_create_payroll_period(uuid,uuid,jsonb,text) to service_role;
grant execute on function public.academy_calculate_payroll(uuid,uuid,uuid,text) to service_role;
grant execute on function public.academy_transition_payroll(uuid,uuid,uuid,text,jsonb,text) to service_role;
grant execute on function public.academy_post_payroll_adjustment(uuid,uuid,uuid,text,bigint,text,text) to service_role;

alter table public.academy_cashboxes enable row level security;
alter table public.academy_cashier_shifts enable row level security;
alter table public.academy_expense_categories enable row level security;
alter table public.academy_expenses enable row level security;
alter table public.academy_cash_movements enable row level security;
alter table public.academy_cash_reconciliations enable row level security;
alter table public.academy_budgets enable row level security;
alter table public.academy_lesson_deliveries enable row level security;
alter table public.academy_compensation_rules enable row level security;
alter table public.academy_payroll_periods enable row level security;
alter table public.academy_payroll_rows enable row level security;
alter table public.academy_payroll_row_components enable row level security;
alter table public.academy_payroll_adjustments enable row level security;
alter table public.academy_payroll_payouts enable row level security;
create policy "Academy cashboxes read by finance" on public.academy_cashboxes for select using(public.academy_finance_can_view(academy_id));
create policy "Academy cashier shifts read by finance" on public.academy_cashier_shifts for select using(public.academy_finance_can_view(academy_id));
create policy "Academy expense categories read by finance" on public.academy_expense_categories for select using(public.academy_finance_can_view(academy_id));
create policy "Academy expenses read by finance" on public.academy_expenses for select using(public.academy_finance_can_view(academy_id));
create policy "Academy cash movements read by finance" on public.academy_cash_movements for select using(public.academy_finance_can_view(academy_id));
create policy "Academy cash reconciliations read by finance" on public.academy_cash_reconciliations for select using(public.academy_finance_can_view(academy_id));
create policy "Academy budgets read by finance" on public.academy_budgets for select using(public.academy_finance_can_view(academy_id));
create policy "Academy lesson deliveries read by payroll" on public.academy_lesson_deliveries for select using(public.academy_payroll_can_view(academy_id));
create policy "Academy compensation rules read by payroll" on public.academy_compensation_rules for select using(public.academy_payroll_can_view(academy_id));
create policy "Academy payroll periods read by payroll" on public.academy_payroll_periods for select using(public.academy_payroll_can_view(academy_id));
create policy "Academy payroll rows read by payroll" on public.academy_payroll_rows for select using(public.academy_payroll_can_view(academy_id));
create policy "Academy payroll components read by payroll" on public.academy_payroll_row_components for select using(public.academy_payroll_can_view(academy_id));
create policy "Academy payroll adjustments read by payroll" on public.academy_payroll_adjustments for select using(public.academy_payroll_can_view(academy_id));
create policy "Academy payroll payouts read by payroll" on public.academy_payroll_payouts for select using(public.academy_payroll_can_view(academy_id));

insert into public.academy_expense_categories(academy_id,category_key,name,kind,created_by)
select t.id,v.key,v.name,v.kind,t.created_by from public.tenants t cross join(values
 ('rent','Rent','facility'),('utilities','Utilities','facility'),('teaching-materials','Teaching materials','teaching'),
 ('marketing','Marketing','marketing'),('technology','Technology','technology'),('staff-payroll','Staff payroll','payroll'),('other','Other','other')
)v(key,name,kind) where t.metadata->>'academy_service'='true' on conflict(academy_id,category_key) do nothing;
