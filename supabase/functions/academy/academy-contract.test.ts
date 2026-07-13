import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
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
      "manageAssignments",
      "gradeSubmissions",
      "markAttendance",
      "manageStaff",
      "dispatchNotifications",
      "viewReports",
      "viewAudit",
      "manageBranding",
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
  assertEquals(permissions.manageStaff, false);
  assertEquals(permissions.dispatchNotifications, false);
  assertEquals(permissions.viewReports, false);
  assertEquals(permissions.viewAudit, false);
});

Deno.test("Academy critical write actions require the intended permissions", () => {
  assertEquals(ACADEMY_ACTION_PERMISSIONS.create_payment, "manageFinance");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.mark_payment_paid, "manageFinance");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.create_assignment, "manageAssignments");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.update_assignment, "manageAssignments");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.grade_submission, "gradeSubmissions");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.mark_attendance, "markAttendance");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.upsert_staff, "manageStaff");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.remove_staff, "manageStaff");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.dispatch_notifications, "dispatchNotifications");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.generate_parent_report, "viewReports");
  assertEquals(ACADEMY_ACTION_PERMISSIONS.issue_academy_certificate, "issueCertificates");
});

Deno.test("Academy upload policy allows useful learning media and rejects unsupported files", () => {
  const pdf = new File(["lesson"], "lesson.pdf", { type: "application/pdf" });
  const image = new File(["image"], "diagram.png", { type: "image/png" });
  const unsupported = new File(["data"], "model.bin", { type: "model/gltf-binary" });
  const oversized = {
    size: 50 * 1024 * 1024 + 1,
    type: "image/png",
  } as File;

  assertEquals(validateAcademyUploadFile(pdf), null);
  assertEquals(validateAcademyUploadFile(image), null);
  assertEquals(validateAcademyUploadFile(unsupported), "File type is not allowed");
  assertEquals(validateAcademyUploadFile(oversized), "File exceeds 50 MiB limit");
});

Deno.test("Academy Edge handler is importable and answers CORS preflight without env", async () => {
  const response = await handleAcademyRequest(new Request("https://academy.local", { method: "OPTIONS" }));

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("Access-Control-Allow-Methods"), "GET, POST, OPTIONS");
  assert((await response.text()).includes("ok"));
});
