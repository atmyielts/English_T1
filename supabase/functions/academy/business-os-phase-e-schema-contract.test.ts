import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const migration = await Deno.readTextFile(new URL("../../migrations/20260810170000_academy_business_os_phase_e.sql", import.meta.url));
const tables = [
  "academy_guardians",
  "academy_student_guardian_relationships",
  "academy_guardian_consents",
  "academy_guardian_link_tokens",
  "academy_guardian_notification_preferences",
  "academy_guardian_messages",
  "academy_notification_delivery_attempts",
];

Deno.test("Phase E enables RLS for guardian identity, consent, preferences, and delivery evidence", () => {
  for (const table of tables) {
    assert(migration.includes(`alter table public.${table} enable row level security;`), `${table} needs RLS`);
    assert(migration.includes(`on public.${table} for select`), `${table} needs an explicit read policy`);
  }
});

Deno.test("Guardian relationships model explicit responsibility and per-domain visibility", () => {
  for (const signal of [
    "mother','father','guardian','sponsor','emergency_contact','other",
    "is_primary_contact", "is_financially_responsible", "is_emergency_contact",
    "can_view_attendance", "can_view_grades", "can_view_homework", "can_view_schedule",
    "can_view_payments", "can_view_debt", "can_view_messages", "can_view_progress_reports",
    "can_view_resources", "can_view_announcements", "can_message_academy",
  ]) assert(migration.includes(signal), signal);
  assert(migration.includes("check(not is_financially_responsible or can_view_payments)"));
  assert(migration.includes("check(not can_view_debt or can_view_payments)"));
});

Deno.test("One-time linking stores only a hash and requires verified Telegram identifiers", () => {
  assert(migration.includes("token_hash bytea not null unique"));
  assert(migration.includes("extensions.digest(v_token,'sha256')"));
  assert(migration.includes("token_hash=extensions.digest(trim(p_token),'sha256') for update"));
  assert(migration.includes("Token and verified Telegram identifiers are required"));
  assert(migration.includes("p_telegram_user_id text,p_telegram_chat_id text,p_telegram_username text"));
  assertEquals(migration.includes("where telegram_username=p_telegram_username"), false);
});

Deno.test("Guardian claim, issue, relationship creation, and revocation are service-only commands", () => {
  for (const command of ["academy_create_guardian_relationship", "academy_issue_guardian_link", "academy_claim_guardian_link", "academy_revoke_guardian_relationship"]) {
    assert(migration.includes(`function public.${command}`), command);
    assert(migration.includes(`revoke all on function public.${command}`), `${command} must not be directly callable`);
  }
  assert(migration.includes("status='used',used_by=p_user_id,used_at=now()"));
  assert(migration.includes("status='revoked'"));
  assert(migration.includes("revocation_reason=trim(p_reason)"));
});

Deno.test("Consent and delivery history are immutable while notifications remain retry-safe", () => {
  assert(migration.includes("academy_guardian_consents_immutable"));
  assert(migration.includes("academy_notification_attempts_immutable"));
  assert(migration.includes("Guardian consent, token use, and delivery attempt history is immutable"));
  assert(migration.includes("academy_notifications_dedupe_uidx"));
  assert(migration.includes("unique(academy_id,notification_id,attempt_number)"));
});

Deno.test("Notification policy includes channels, quiet hours, locale, timezone, and critical override", () => {
  for (const signal of ["telegram_enabled", "inapp_enabled", "email_enabled", "sms_enabled", "locale", "timezone", "quiet_hours_start", "quiet_hours_end", "allow_critical_override", "critical_override"]) {
    assert(migration.includes(signal), signal);
  }
  assert(migration.includes("check((quiet_hours_start is null)=(quiet_hours_end is null))"));
});

Deno.test("Guardian RLS is limited to the authenticated guardian and active consented relationships", () => {
  assert(migration.includes("auth.uid()"));
  assert(migration.includes("Guardians read active relationships"));
  assert(migration.includes("status='active' and consent_status='granted'"));
  assert(migration.includes("Guardians read addressed notifications"));
  assert(migration.includes("Guardians read relationship messages"));
});
