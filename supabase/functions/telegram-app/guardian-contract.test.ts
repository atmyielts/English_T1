import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("Telegram Mini App exposes guardian-scoped academy sections", () => {
  for (const signal of [
    "loadGuardianDashboard",
    "guardian_children",
    "guardian_attendance",
    "guardian_grades",
    "guardian_homework",
    "guardian_schedule",
    "guardian_billing",
    "guardian_messages",
    "guardian_resources",
    "guardian_announcements",
    "guardian_progress",
  ]) assert(source.includes(signal), signal);
});

Deno.test("Guardian Telegram identity requires secure account and numeric Telegram linkage", () => {
  const guardianLoader = source.slice(source.indexOf("const loadGuardianDashboard"), source.indexOf("const loadVocabStats"));
  assert(guardianLoader.includes('.eq("user_id", ctx.user.id)'));
  assert(guardianLoader.includes('.eq("telegram_user_id", ctx.telegram.telegram_user_id)'));
  assert(guardianLoader.includes('.eq("status", "verified")'));
  assert(guardianLoader.includes('.eq("consent_status", "granted")'));
  assertEquals(guardianLoader.includes("telegram_username"), false);
});

Deno.test("Guardian data sections honor relationship visibility flags", () => {
  for (const flag of [
    "can_view_attendance", "can_view_grades", "can_view_homework", "can_view_schedule",
    "can_view_payments", "can_view_debt", "can_view_messages", "can_view_progress_reports",
    "can_view_resources", "can_view_announcements",
  ]) assert(source.includes(flag), flag);
  assert(source.includes("attendance: canViewAttendance ?"));
  assert(source.includes("payments: canViewPayments ?"));
  assert(source.includes("debt: canViewDebt ?"));
});
