import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const migrationUrl = new URL(
  "../../migrations/20260810130000_academy_business_os_phase_a.sql",
  import.meta.url,
);
const migration = await Deno.readTextFile(migrationUrl);

const tenantTables = [
  "academy_branches",
  "academy_rooms",
  "academy_lead_sources",
  "academy_sales_pipelines",
  "academy_pipeline_stages",
  "academy_pipeline_transitions",
  "academy_leads",
  "academy_lead_stage_history",
  "academy_lead_activities",
  "academy_trial_lessons",
  "academy_lead_conversions",
];

Deno.test("Education Business OS Phase A enables RLS on every tenant table", () => {
  for (const table of tenantTables) {
    assert(
      migration.includes(`alter table public.${table} enable row level security;`),
      `${table} must enable RLS`,
    );
  }
});

Deno.test("Phase A relationships bind academy identity to referenced records", () => {
  for (const relation of [
    "foreign key (academy_id, branch_id)",
    "foreign key (academy_id, pipeline_id, current_stage_id)",
    "foreign key (academy_id, lead_id)",
    "foreign key (academy_id, contact_id)",
    "foreign key (academy_id, classroom_id)",
    "foreign key (academy_id, trial_id)",
    "foreign key (academy_id, branch_id, room_id)",
    "foreign key (academy_id, rescheduled_from_id)",
  ]) {
    assert(migration.includes(relation), `Missing tenant-safe relationship: ${relation}`);
  }
});

Deno.test("Phase A commands require idempotency and post audit plus outbox events", () => {
  for (const command of [
    "academy_create_lead",
    "academy_transition_lead",
    "academy_record_lead_activity",
    "academy_schedule_trial",
    "academy_set_trial_status",
    "academy_convert_lead",
  ]) {
    assert(migration.includes(`function public.${command}`), `${command} must exist`);
    assert(migration.includes(`revoke all on function public.${command}`), `${command} must not be client-callable`);
  }
  assert(migration.includes("insert into public.academy_audit_events"));
  assert(migration.includes("insert into public.domain_event_outbox"));
  assert(migration.includes("Idempotency key is required"));
});

Deno.test("Academy onboarding atomically creates the tenant, owner, and CRM defaults", () => {
  assert(migration.includes("function public.academy_create_organization"));
  assert(migration.includes("insert into public.tenant_memberships"));
  assert(migration.includes("perform public.ensure_academy_crm_defaults"));
  assert(migration.includes("revoke all on function public.academy_create_organization"));
});

Deno.test("Stage-change audit preserves the stage that was actually exited", () => {
  assert(migration.includes("v_from_stage_id := v_lead.current_stage_id"));
  assert(migration.includes("jsonb_build_object('from_stage_id', v_from_stage_id"));
});

Deno.test("Lead and trial state machines reject arbitrary mutation paths", () => {
  assert(migration.includes("Invalid lead stage transition"));
  assert(migration.includes("Use lead conversion to enter WON"));
  assert(migration.includes("Invalid trial status transition"));
  assert(migration.includes("Lost lead must be reopened before conversion"));
  assertEquals(
    migration.includes('create policy "Academy leads manage'),
    false,
    "direct client mutation must not bypass command validation",
  );
  assert(migration.includes("'scheduled', 'confirmed', 'attended'"));
  assert(migration.includes("v_trial.status = 'confirmed'"));
});

Deno.test("Phase A source and stage display labels are localization-ready", () => {
  assert(migration.includes("label_i18n jsonb"));
  assert(migration.includes("name_i18n jsonb"));
  assert(migration.includes("'uz'"));
  assert(migration.includes("'ru'"));
});
