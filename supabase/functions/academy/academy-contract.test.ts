import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ACADEMY_ACTION_PERMISSIONS,
  buildAcademyPermissions,
  handleAcademyRequest,
  validateAcademyUploadFile,
} from "./index.ts";

const accessForRole = (role: string) => ({
  tenant_id: "academy-1",
  role,
  status: "active",
  source: "tenant" as const,
  classroom_ids: ["classroom-1"],
});

Deno.test("Academy owner keeps all high-risk operator permissions", () => {
  const permissions = buildAcademyPermissions(accessForRole("owner"));

  for (
    const permission of [
      "manageFinance",
      "manageCashier",
      "viewEconomics",
      "viewPayroll",
      "calculatePayroll",
      "approvePayroll",
      "payPayroll",
      "manageAssignments",
      "gradeSubmissions",
      "markAttendance",
      "manageStaff",
      "dispatchNotifications",
      "viewReports",
      "viewAudit",
      "manageBranding",
      "viewAdmissions",
      "manageAdmissions",
      "viewBranches",
      "manageBranches",
      "manageGuardians",
      "communicateGuardians",
      "manageRetention",
      "viewBusinessIntelligence",
      "manageImports",
    ] as const
  ) {
    assertEquals(permissions[permission], true, permission);
  }
});

Deno.test("Academy teacher can run class but cannot operate finance, staff, reports, or dispatch", () => {
  const permissions = buildAcademyPermissions(accessForRole("teacher"));

  assertEquals(permissions.manageAssignments, true);
  assertEquals(permissions.gradeSubmissions, true);
  assertEquals(permissions.markAttendance, true);
  assertEquals(permissions.manageResources, true);

  assertEquals(permissions.manageFinance, false);
  assertEquals(permissions.manageCashier, false);
  assertEquals(permissions.viewEconomics, false);
  assertEquals(permissions.viewPayroll, false);
  assertEquals(permissions.calculatePayroll, false);
  assertEquals(permissions.approvePayroll, false);
  assertEquals(permissions.payPayroll, false);
  assertEquals(permissions.manageStaff, false);
  assertEquals(permissions.dispatchNotifications, false);
  assertEquals(permissions.viewReports, false);
  assertEquals(permissions.viewAudit, false);
  assertEquals(permissions.viewAdmissions, false);
  assertEquals(permissions.manageAdmissions, false);
  assertEquals(permissions.viewBranches, true);
  assertEquals(permissions.manageBranches, false);
  assertEquals(permissions.manageTrialFeedback, true);
  assertEquals(permissions.manageGuardians, false);
  assertEquals(permissions.communicateGuardians, true);
  assertEquals(permissions.manageRetention, false);
  assertEquals(permissions.viewBusinessIntelligence, false);
  assertEquals(permissions.manageImports, false);
});

Deno.test("Academy critical write actions require the intended permissions", () => {
  assertEquals(ACADEMY_ACTION_PERMISSIONS.create_payment, "collectFinance");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.mark_payment_paid, "collectFinance");
  assertEquals(
    ACADEMY_ACTION_PERMISSIONS.create_assignment,
    "manageAssignments",
  );
  assertEquals(
    ACADEMY_ACTION_PERMISSIONS.update_assignment,
    "manageAssignments",
  );
  assertEquals(ACADEMY_ACTION_PERMISSIONS.upsert_course, "manageAssignments");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.publish_course, "manageAssignments");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.assign_course, "manageAssignments");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.upsert_module, "manageAssignments");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.upsert_lesson, "manageAssignments");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.upsert_quiz, "manageAssignments");
  assertEquals(
    ACADEMY_ACTION_PERMISSIONS.upsert_quiz_question,
    "manageAssignments",
  );
  assertEquals(
    ACADEMY_ACTION_PERMISSIONS.upsert_grade_category,
    "gradeSubmissions",
  );
  assertEquals(ACADEMY_ACTION_PERMISSIONS.upsert_rubric, "gradeSubmissions");
  assertEquals(
    ACADEMY_ACTION_PERMISSIONS.grade_quiz_attempt,
    "gradeSubmissions",
  );
  assertEquals(
    ACADEMY_ACTION_PERMISSIONS.set_enrollment_status,
    "manageRoster",
  );
  assertEquals(ACADEMY_ACTION_PERMISSIONS.grade_submission, "gradeSubmissions");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.mark_attendance, "markAttendance");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.upsert_staff, "manageStaff");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.remove_staff, "manageStaff");
  assertEquals(
    ACADEMY_ACTION_PERMISSIONS.dispatch_notifications,
    "dispatchNotifications",
  );
  assertEquals(
    ACADEMY_ACTION_PERMISSIONS.generate_parent_report,
    "viewReports",
  );
  assertEquals(
    ACADEMY_ACTION_PERMISSIONS.issue_academy_certificate,
    "issueCertificates",
  );
  assertEquals(ACADEMY_ACTION_PERMISSIONS.upsert_branch, "manageBranches");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.upsert_room, "manageBranches");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.create_lead, "manageAdmissions");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.transition_lead, "manageAdmissions");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.record_lead_activity, "manageAdmissions");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.schedule_trial, "manageAdmissions");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.set_trial_status, "manageTrialFeedback");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.convert_lead, "manageAdmissions");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.create_pricing_plan, "manageFinance");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.create_subscription, "manageFinance");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.manage_subscription, "manageFinance");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.create_charge, "manageFinance");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.allocate_payment, "collectFinance");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.post_account_adjustment, "adjustFinance");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.record_payment_reconciliation, "reconcileFinance");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.record_payment_promise, "collectFinance");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.create_cashbox, "manageCashier");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.record_expense, "manageFinance");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.upsert_compensation_rule, "calculatePayroll");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.calculate_payroll, "calculatePayroll");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.transition_payroll, "viewPayroll");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.create_lesson_session, "manageAcademicOperations");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.transition_lesson_session, "manageAcademicOperations");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.record_session_attendance, "markAttendance");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.record_attendance_exception, "manageAcademicOperations");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.create_guardian_relationship, "manageGuardians");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.issue_guardian_link, "manageGuardians");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.revoke_guardian_relationship, "manageGuardians");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.upsert_guardian_preferences, "manageGuardians");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.send_guardian_message, "communicateGuardians");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.queue_guardian_notification, "communicateGuardians");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.upsert_risk_definition, "manageRetention");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.evaluate_retention_risk, "manageRetention");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.create_intervention, "manageRetention");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.upsert_renewal_opportunity, "manageRetention");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.update_operational_action, "resolveActionItems");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.create_import_job, "manageImports");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.commit_import_job, "manageImports");
});

Deno.test("Academy upload policy allows useful learning media and rejects unsupported files", () => {
  const pdf = new File(["lesson"], "lesson.pdf", { type: "application/pdf" });
  const image = new File(["image"], "diagram.png", { type: "image/png" });
  const unsupported = new File(["data"], "model.bin", {
    type: "model/gltf-binary",
  });
  const oversized = {
    size: 50 * 1024 * 1024 + 1,
    type: "image/png",
  } as File;

  assertEquals(validateAcademyUploadFile(pdf), null);
  assertEquals(validateAcademyUploadFile(image), null);
  assertEquals(
    validateAcademyUploadFile(unsupported),
    "File type is not allowed",
  );
  assertEquals(
    validateAcademyUploadFile(oversized),
    "File exceeds 50 MiB limit",
  );
});

Deno.test("Academy Edge handler is importable and answers CORS preflight without env", async () => {
  const response = await handleAcademyRequest(
    new Request("https://academy.local", { method: "OPTIONS" }),
  );

  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("Access-Control-Allow-Methods"),
    "GET, POST, OPTIONS",
  );
  assert((await response.text()).includes("ok"));
});
