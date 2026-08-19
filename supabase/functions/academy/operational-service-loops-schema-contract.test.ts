import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const migration = await Deno.readTextFile(
  new URL("../../migrations/20260819120000_academy_operational_service_loops.sql", import.meta.url),
);
const edge = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const client = await Deno.readTextFile(new URL("../../../apps/academy/src/lib/client.ts", import.meta.url));

const expectedTables = [
  "academy_access_invitations",
  "academy_timetable_terms",
  "academy_timetable_series",
  "academy_timetable_generation_runs",
  "academy_service_requests",
  "academy_service_request_events",
  "academy_communication_journeys",
  "academy_communication_journey_steps",
  "academy_communication_enrollments",
  "academy_collection_cases",
  "academy_collection_attempts",
  "academy_staff_requests",
  "academy_sensitive_cases",
  "academy_sensitive_case_events",
  "academy_competency_frameworks",
  "academy_competencies",
  "academy_learning_plans",
  "academy_learning_plan_items",
  "academy_competency_evidence",
  "academy_integration_endpoints",
  "academy_integration_deliveries",
  "academy_export_jobs",
];

Deno.test("operational service loops create every durable workflow record", () => {
  for (const table of expectedTables) {
    assert(migration.includes(`create table public.${table}`), table);
    assert(migration.includes(`alter table public.${table} enable row level security`), `${table} RLS`);
  }
});

Deno.test("operational service loops preserve tenant boundaries on workflow relationships", () => {
  for (const relationship of [
    "foreign key (academy_id, contact_id)",
    "foreign key (academy_id, classroom_id)",
    "foreign key (academy_id, staff_id)",
    "foreign key (academy_id, guardian_relationship_id)",
    "foreign key (academy_id, journey_id)",
    "foreign key (academy_id, plan_id)",
    "foreign key (academy_id, endpoint_id)",
  ]) assert(migration.includes(relationship), relationship);
  assert(migration.includes("academy_lesson_sessions_series_occurrence_uidx"));
  assert(migration.includes("academy_access_invitations_active_target_uidx"));
});

Deno.test("integration signing secrets are never granted through direct authenticated reads", () => {
  const grantBlock = migration.slice(migration.indexOf("grant select on"), migration.indexOf("-- Endpoint signing secrets"));
  assertEquals(grantBlock.includes("academy_integration_endpoints"), false);
  assertEquals(grantBlock.includes("academy_integration_deliveries"), false);
  assert(migration.includes("never receive authenticated\n-- table grants"));
  assert(migration.includes("event_id text"));
});

Deno.test("student-visible records are constrained to the signed-in requester or linked contact", () => {
  assert(migration.includes("requester_user_id = auth.uid()"));
  assert(migration.includes("contact.user_id = auth.uid()"));
  assert(migration.includes("published_at is not null"));
  assert(migration.includes("academy_sensitive_case_can_view"));
  assert(migration.includes("owner_only"));
  assert(migration.includes("revoke all on function public.academy_sensitive_case_can_view(uuid, text) from public, anon"));
  assert(migration.includes("grant execute on function public.academy_sensitive_case_can_view(uuid, text) to authenticated, service_role"));
});

Deno.test("every operational family has a role-scoped Edge read and a frontend client entry", () => {
  for (const action of [
    "access_invitations",
    "timetable_planning",
    "service_requests",
    "communication_journeys",
    "collection_cases",
    "workforce_requests",
    "sensitive_cases",
    "competency_plans",
    "integration_endpoints",
  ]) {
    assert(edge.includes(`action === "${action}"`), `${action} Edge read`);
  }
  for (const action of [
    "invitation_status",
    "accept_access_invitation",
    "student_service_requests",
    "student_service_request_create",
    "student_learning_plans",
    "guardian_service_requests",
    "guardian_service_request_create",
    "submit_sensitive_report",
  ]) {
    assert(edge.includes(`requestedAction === "${action}"`), `${action} requester route`);
    assert(
      client.includes(`action: "${action}"`) || client.includes(`action: '${action}'`),
      `${action} frontend client`,
    );
  }
});

Deno.test("background dispatch owns journey advancement and webhook retries", () => {
  assert(edge.includes("advanceCommunicationJourneys(sb, null, null, 100)"));
  assert(edge.includes("dispatchIntegrationEvents(sb, null, 50)"));
  assert(edge.includes('redirect: "error"'));
  assert(edge.includes("academyWebhookUrlIsPublic"));
  assert(edge.includes('"x-schood-signature"'));
  assert(edge.includes("attempts >= 5"));
  assert(edge.includes("advanceCommunicationJourneys(sb, null, null, 100).catch"));
  assert(edge.includes("dispatchIntegrationEvents(sb, null, 50).catch"));
});

Deno.test("advanced connections remain administrator-only", () => {
  const restriction = '["owner", "admin", "center_admin"].includes(access.role)';
  assert(edge.split(restriction).length >= 4);
  assert(edge.includes("Only academy administrators can manage outbound integrations"));
});
