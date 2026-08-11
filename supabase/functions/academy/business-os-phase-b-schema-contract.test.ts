import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const migration = await Deno.readTextFile(new URL(
  "../../migrations/20260810140000_academy_business_os_phase_b.sql",
  import.meta.url,
));

const tables = [
  "academy_pricing_plans", "academy_subscriptions", "academy_subscription_freezes",
  "academy_pricing_adjustments", "academy_charges", "academy_payment_allocations",
  "academy_account_ledger_entries", "academy_debt_cases", "academy_payment_promises",
  "academy_collection_events", "academy_payment_reconciliations",
];

Deno.test("Commercial core enables RLS on every tenant financial table", () => {
  for (const table of tables) {
    assert(migration.includes(`alter table public.${table} enable row level security;`), `${table} must enable RLS`);
  }
});

Deno.test("Commercial relationships carry academy identity across every financial aggregate", () => {
  for (const relation of [
    "foreign key (academy_id, contact_id)", "foreign key (academy_id, branch_id)",
    "foreign key (academy_id, classroom_id)", "foreign key (academy_id, pricing_plan_id)",
    "foreign key (academy_id, subscription_id)", "foreign key (academy_id, payment_id)",
    "foreign key (academy_id, charge_id)", "foreign key (academy_id, academy_payment_id)",
  ]) assert(migration.includes(relation), `Missing tenant-safe relationship ${relation}`);
  assert(migration.includes("foreign key (academy_id, contact_id, subscription_id)"));
  assert(migration.includes("foreign key (academy_id, contact_id, charge_id)"));
  assert(migration.includes("foreign key (academy_id, contact_id, payment_id)"));
});

Deno.test("Financial RLS excludes ordinary teachers and general academy membership", () => {
  assert(migration.includes("function public.academy_finance_can_view"));
  assert(migration.includes("g.role in ('owner','admin','center_admin')"));
  assert(migration.includes('drop policy if exists "Academy payments read by membership"'));
  assertEquals(migration.includes("read by finance staff\" on public.academy_charges for select using (public.academy_org_can_view"), false);
});

Deno.test("Ledger, allocations, and reconciliation evidence are append-only", () => {
  assert(migration.includes("academy_reject_financial_history_mutation"));
  assert(migration.includes("academy_payment_allocations_immutable"));
  assert(migration.includes("academy_account_ledger_entries_immutable"));
  assert(migration.includes("academy_payment_reconciliations_immutable"));
  assert(migration.includes("post a reversal or adjustment"));
  assertEquals(migration.includes('create policy "Academy ledger manage'), false);
});

Deno.test("Existing Academy payments feed one coherent commercial ledger", () => {
  assert(migration.includes("academy_payments_capture_ledger"));
  assert(migration.includes("payment-received:"));
  assert(migration.includes("payment-refunded:"));
  assert(migration.includes("academy_offers_academy_id_id_uidx"));
  assert(migration.includes("legacy_offer_id"));
});

Deno.test("Commercial commands are service-only, idempotent, audited, and event-ready", () => {
  for (const command of [
    "academy_create_pricing_plan", "academy_create_subscription", "academy_create_charge",
    "academy_allocate_payment", "academy_post_account_adjustment",
    "academy_record_payment_reconciliation", "academy_record_payment_promise", "academy_manage_subscription",
  ]) {
    assert(migration.includes(`function public.${command}`), `${command} missing`);
    assert(migration.includes(`revoke all on function public.${command}`), `${command} must be service-only`);
  }
  assert(migration.includes("insert into public.academy_audit_events"));
  assert(migration.includes("insert into public.domain_event_outbox"));
});

Deno.test("Subscription lifecycle supports audited freezes, resumes, cancellation, completion, and renewal", () => {
  for (const operation of ["v_action='freeze'", "v_action='resume'", "v_action='cancel'", "v_action='complete'", "v_action='renew'"]) {
    assert(migration.includes(operation), `Missing lifecycle operation ${operation}`);
  }
  assert(migration.includes("'subscription.'||v_action"));
  assert(migration.includes("renewed_from_subscription_id"));
  assert(migration.includes("Freeze reason is required"));
  assert(migration.includes("Cancellation reason is required"));
  assert(migration.includes("Discount reason is required"));
});

Deno.test("Balances expose account credit, charge aging, and allocation-derived debt", () => {
  assert(migration.includes("view public.academy_charge_balances"));
  assert(migration.includes("view public.academy_account_balances"));
  for (const bucket of ["'current'", "'1-7'", "'8-14'", "'15-30'", "'31-60'", "'60+'"]) {
    assert(migration.includes(bucket), `Missing aging bucket ${bucket}`);
  }
  assert(migration.includes("Allocation exceeds unallocated payment"));
  assert(migration.includes("Allocation exceeds charge balance"));
  assert(migration.includes("adjustment_amount"));
  assert(migration.includes("Adjustment exceeds charge balance"));
});
