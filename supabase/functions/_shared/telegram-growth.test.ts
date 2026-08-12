import {
  advanceTelegramJourney,
  deriveStudentNextAction,
  evaluateNotificationPolicy,
  parseTelegramStartPayload,
  scoreVocabularyDiagnostic,
} from "./telegram-growth.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

Deno.test("campaign parser routes IELTS and preserves campaign", () => {
  const parsed = parseTelegramStartPayload("ielts_aug_instagram_reel17");
  assert(parsed.funnel === "student_ielts", "expected IELTS funnel");
  assert(parsed.source === "instagram", "expected Instagram attribution");
  assert(parsed.campaign === "ielts_aug_instagram_reel17", "campaign must be preserved");
});

Deno.test("campaign parser routes academy and referral payloads", () => {
  assert(parseTelegramStartPayload("academy_meta_aug26").funnel === "academy", "expected academy funnel");
  assert(parseTelegramStartPayload("referral_PARTNER42").referrerCode === "partner42", "expected referral code");
});

Deno.test("campaign parser rejects unsafe payload", () => {
  let failed = false;
  try { parseTelegramStartPayload("../../admin"); } catch { failed = true; }
  assert(failed, "unsafe payload must be rejected");
});

Deno.test("notification policy enforces channel and category preferences", () => {
  assert(evaluateNotificationPolicy({ category: "commercial", telegramEnabled: false }).reason === "telegram_disabled", "channel preference must win");
  assert(evaluateNotificationPolicy({ category: "commercial", categoryEnabled: false }).reason === "category_disabled", "category preference must win");
});

Deno.test("academic notification is not blocked by commercial caps", () => {
  const decision = evaluateNotificationPolicy({ category: "academic_required", recentCategoryCount: 99, frequencyCap: 2 });
  assert(decision.outcome === "send", "required academic notification should send");
});

Deno.test("study habit notification defers in local quiet hours", () => {
  const decision = evaluateNotificationPolicy({
    category: "study_habit",
    now: new Date("2026-08-12T19:30:00.000Z"),
    timezone: "Asia/Tashkent",
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
  });
  assert(decision.outcome === "defer", "habit notification should defer during quiet hours");
  assert(Boolean(decision.deliverAt), "deferred notification needs a delivery time");
});

Deno.test("required academic notification respects local quiet hours", () => {
  const decision = evaluateNotificationPolicy({
    category: "academic_required",
    now: new Date("2026-08-12T19:30:00.000Z"),
    timezone: "Asia/Tashkent",
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
  });
  assert(decision.outcome === "defer", "non-urgent academic notification should wait until quiet hours end");
});

Deno.test("quiet-hour release is exact and follows spring DST transition", () => {
  const decision = evaluateNotificationPolicy({
    category: "study_habit",
    now: new Date("2026-03-08T06:30:37.000Z"),
    timezone: "America/New_York",
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
  });
  assert(decision.deliverAt === "2026-03-08T11:00:00.000Z", "spring DST must release at 07:00 local without overshoot");
});

Deno.test("quiet-hour release follows fall DST transition", () => {
  const decision = evaluateNotificationPolicy({
    category: "academic_required",
    now: new Date("2026-11-01T05:30:00.000Z"),
    timezone: "America/New_York",
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
  });
  assert(decision.deliverAt === "2026-11-01T12:00:00.000Z", "fall DST must release at 07:00 local standard time");
});

Deno.test("commercial and habit frequency caps are enforced", () => {
  assert(evaluateNotificationPolicy({ category: "study_habit", recentCategoryCount: 2 }).reason === "frequency_cap", "habit cap expected");
  assert(evaluateNotificationPolicy({ category: "commercial", recentCategoryCount: 2 }).reason === "frequency_cap", "commercial cap expected");
});

Deno.test("dedupe suppresses a repeated candidate", () => {
  assert(evaluateNotificationPolicy({ category: "transactional", dedupeSeen: true }).reason === "duplicate", "duplicate must be suppressed");
});

Deno.test("student context prioritizes payment then assignments then vocabulary", () => {
  assert(deriveStudentNextAction({ paymentOverdue: true, vocabularyDue: 10 }).kind === "payment_overdue", "payment should be first");
  assert(deriveStudentNextAction({ overdueAssignment: { id: "a1", title: "Essay" }, vocabularyDue: 10 }).kind === "assignment_overdue", "overdue assignment should precede vocabulary");
  assert(deriveStudentNextAction({ vocabularyDue: 10, vocabularyFailed: 3 }).kind === "vocabulary_due", "vocabulary action expected");
});

Deno.test("vocabulary diagnostic returns a grounded seven-day plan", () => {
  const result = scoreVocabularyDiagnostic({ q1: "to evaluate", q2: "wrong", q3: "to explain meaning" });
  assert(result.correct === 2, "score must derive from submitted answers");
  assert(result.missedWords.includes("relevant"), "missed word should be preserved");
  assert(result.plan.length === 7, "seven-day plan expected");
});

Deno.test("student funnel progresses, resumes from state, and produces a real result", () => {
  let snapshot = { funnel: "generic" as const, lastStep: "started", state: {} };
  let next = advanceTelegramJourney(snapshot, "student_begin");
  assert(next.step === "student_goal" && next.funnel === "student_ielts", "student funnel should start");
  next = advanceTelegramJourney({ funnel: "student_ielts", lastStep: next.step, state: next.state }, "goal_7_0");
  next = advanceTelegramJourney({ funnel: "student_ielts", lastStep: next.step, state: next.state }, "exam_90");
  for (const action of ["answer_q1_0", "answer_q2_1", "answer_q3_0"]) {
    next = advanceTelegramJourney({ funnel: "student_ielts", lastStep: next.step, state: next.state }, action);
  }
  assert(next.step === "diagnostic_result", "diagnostic should complete");
  assert((next.state.result as { correct: number }).correct === 2, "result must use stored answers");
  assert(next.firstValue === true, "result is the first value action");
});

Deno.test("journey rejects invalid repeated callback and expired session", () => {
  let invalid = false;
  try { advanceTelegramJourney({ funnel: "student_ielts", lastStep: "student_exam_date" }, "goal_7_0"); } catch { invalid = true; }
  assert(invalid, "repeated callback must not advance a different step");
  let expired = false;
  try { advanceTelegramJourney({ funnel: "student_ielts", lastStep: "student_goal", expiresAt: "2026-01-01T00:00:00Z" }, "goal_7_0", "", new Date("2026-08-12T00:00:00Z")); } catch { expired = true; }
  assert(expired, "expired session must fail");
});

Deno.test("academy funnel validates input, qualifies, and can be canceled", () => {
  const begin = advanceTelegramJourney({ funnel: "generic", lastStep: "started" }, "academy_begin");
  assert(begin.funnel === "academy" && begin.step === "academy_name", "academy route expected");
  let invalid = false;
  try { advanceTelegramJourney({ funnel: "academy", lastStep: "academy_name" }, "input", "x"); } catch { invalid = true; }
  assert(invalid, "short academy name must fail");
  const canceled = advanceTelegramJourney({ funnel: "academy", lastStep: "academy_contact" }, "cancel");
  assert(canceled.canceled === true, "cancellation expected");
});
