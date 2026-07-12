import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as academyAccess from "./access.ts";

type PermissionKey = keyof ReturnType<typeof academyAccess.buildAcademyPermissions>;
type RoleKey =
  | "owner"
  | "admin"
  | "center_admin"
  | "manager"
  | "counselor"
  | "teacher"
  | "assistant"
  | "student";

type ResourceKey =
  | "contacts"
  | "classrooms"
  | "roster"
  | "assignments"
  | "gradebook"
  | "attendance"
  | "schedule"
  | "staff"
  | "finance"
  | "offers"
  | "payments"
  | "alerts_messages_announcements"
  | "education_os_actions";

const roles: RoleKey[] = [
  "owner",
  "admin",
  "center_admin",
  "manager",
  "counselor",
  "teacher",
  "assistant",
  "student",
];

const resourcePermission: Record<ResourceKey, PermissionKey[]> = {
  contacts: ["viewContacts"],
  classrooms: ["viewClassrooms"],
  roster: ["viewClassrooms", "manageRoster"],
  assignments: ["manageAssignments"],
  gradebook: ["gradeSubmissions"],
  attendance: ["markAttendance"],
  schedule: ["manageSchedule"],
  staff: ["manageStaff"],
  finance: ["manageFinance"],
  offers: ["manageOffers"],
  payments: ["manageFinance"],
  alerts_messages_announcements: ["manageMessages", "manageAnnouncements", "manageAlerts"],
  education_os_actions: ["viewEducationOS", "resolveActionItems"],
};

const expectedAccess: Record<RoleKey, Record<ResourceKey, boolean>> = {
  owner: {
    contacts: true,
    classrooms: true,
    roster: true,
    assignments: true,
    gradebook: true,
    attendance: true,
    schedule: true,
    staff: true,
    finance: true,
    offers: true,
    payments: true,
    alerts_messages_announcements: true,
    education_os_actions: true,
  },
  admin: {
    contacts: true,
    classrooms: true,
    roster: true,
    assignments: true,
    gradebook: true,
    attendance: true,
    schedule: true,
    staff: true,
    finance: true,
    offers: true,
    payments: true,
    alerts_messages_announcements: true,
    education_os_actions: true,
  },
  center_admin: {
    contacts: true,
    classrooms: true,
    roster: true,
    assignments: false,
    gradebook: false,
    attendance: false,
    schedule: true,
    staff: true,
    finance: true,
    offers: true,
    payments: true,
    alerts_messages_announcements: true,
    education_os_actions: true,
  },
  manager: {
    contacts: true,
    classrooms: true,
    roster: true,
    assignments: false,
    gradebook: false,
    attendance: false,
    schedule: true,
    staff: false,
    finance: false,
    offers: false,
    payments: false,
    alerts_messages_announcements: true,
    education_os_actions: true,
  },
  counselor: {
    contacts: true,
    classrooms: true,
    roster: true,
    assignments: false,
    gradebook: false,
    attendance: false,
    schedule: true,
    staff: false,
    finance: false,
    offers: false,
    payments: false,
    alerts_messages_announcements: true,
    education_os_actions: true,
  },
  teacher: {
    contacts: true,
    classrooms: true,
    roster: true,
    assignments: true,
    gradebook: true,
    attendance: true,
    schedule: true,
    staff: false,
    finance: false,
    offers: false,
    payments: false,
    alerts_messages_announcements: true,
    education_os_actions: true,
  },
  assistant: {
    contacts: true,
    classrooms: true,
    roster: true,
    assignments: true,
    gradebook: true,
    attendance: true,
    schedule: true,
    staff: false,
    finance: false,
    offers: false,
    payments: false,
    alerts_messages_announcements: true,
    education_os_actions: true,
  },
  student: {
    contacts: false,
    classrooms: false,
    roster: false,
    assignments: false,
    gradebook: false,
    attendance: false,
    schedule: false,
    staff: false,
    finance: false,
    offers: false,
    payments: false,
    alerts_messages_announcements: false,
    education_os_actions: false,
  },
};

const permissionsForRole = (role: RoleKey) =>
  academyAccess.buildAcademyPermissions({
    tenant_id: "00000000-0000-0000-0000-000000000001",
    role,
    status: "active",
    source: "tenant",
    classroom_ids: role === "teacher" || role === "assistant"
      ? ["00000000-0000-0000-0000-000000000010"]
      : [],
  });

const hasResourceAccess = (role: RoleKey, resource: ResourceKey): boolean => {
  if (role === "student") return false;
  const permissions = permissionsForRole(role);
  return resourcePermission[resource].some((permission) => permissions[permission] === true);
};

Deno.test("Academy role matrix allows and denies staff API resources by role", () => {
  for (const role of roles) {
    for (const resource of Object.keys(resourcePermission) as ResourceKey[]) {
      assertEquals(
        hasResourceAccess(role, resource),
        expectedAccess[role][resource],
        `${role} -> ${resource}`,
      );
    }
  }
});

Deno.test("Academy workspace scopes match production role lanes", () => {
  assertEquals(academyAccess.academyAccessProfile({
    tenant_id: "00000000-0000-0000-0000-000000000001",
    role: "manager",
    status: "active",
    source: "tenant",
    classroom_ids: [],
  }).scope, "academy");

  assertEquals(academyAccess.academyAccessProfile({
    tenant_id: "00000000-0000-0000-0000-000000000001",
    role: "teacher",
    status: "active",
    source: "staff",
    classroom_ids: ["00000000-0000-0000-0000-000000000010"],
  }).scope, "assigned_classrooms");
});

Deno.test("Academy role grants resolve active classroom scope and deny inactive states", () => {
  const now = new Date("2026-06-18T08:00:00.000Z");
  const teacherGrant = academyAccess.academyRoleGrantToMembership({
    id: "00000000-0000-0000-0000-000000000020",
    academy_id: "00000000-0000-0000-0000-000000000001",
    role: "teacher",
    status: "active",
    scope_type: "classrooms",
    scope_ids: [
      "00000000-0000-0000-0000-000000000010",
      "00000000-0000-0000-0000-000000000011",
    ],
    starts_at: "2026-06-01T00:00:00.000Z",
    expires_at: "2026-07-01T00:00:00.000Z",
  }, now);

  assertEquals(teacherGrant?.source, "grant");
  assertEquals(teacherGrant?.status, "active");
  assertEquals(teacherGrant?.classroom_ids, [
    "00000000-0000-0000-0000-000000000010",
    "00000000-0000-0000-0000-000000000011",
  ]);
  assertEquals(academyAccess.academyAccessProfile(teacherGrant!).scope, "assigned_classrooms");

  for (const status of ["suspended", "revoked", "expired"]) {
    assertEquals(academyAccess.academyRoleGrantToMembership({
      academy_id: "00000000-0000-0000-0000-000000000001",
      role: "manager",
      status,
      scope_type: "academy",
      scope_ids: [],
    }, now), null, status);
  }

  assertEquals(academyAccess.academyRoleGrantToMembership({
    academy_id: "00000000-0000-0000-0000-000000000001",
    role: "teacher",
    status: "active",
    scope_type: "classrooms",
    scope_ids: ["00000000-0000-0000-0000-000000000010"],
    expires_at: "2026-06-18T07:59:59.000Z",
  }, now), null, "expired timestamp");
});

Deno.test("Academy invited email grants are access-ready until accepted by login", () => {
  const invitedGrant = academyAccess.academyRoleGrantToMembership({
    id: "00000000-0000-0000-0000-000000000021",
    academy_id: "00000000-0000-0000-0000-000000000001",
    role: "manager",
    status: "invited",
    scope_type: "academy",
    scope_ids: [],
  }, new Date("2026-06-18T08:00:00.000Z"));

  assertEquals(invitedGrant?.source, "grant");
  assertEquals(invitedGrant?.role, "manager");
  assertEquals(invitedGrant?.status, "active");
  assertEquals(academyAccess.academyAccessProfile(invitedGrant!).scope, "academy");
});

Deno.test("Academy center route exposes schedule but not teacher grading controls", async () => {
  const routeCapsSource = await Deno.readTextFile(
    new URL("../../../apps/academy/src/lib/academyAccess.ts", import.meta.url),
  );
  const centerCaps = routeCapsSource.slice(
    routeCapsSource.indexOf("center: new Set<AccessPermissionKey>"),
    routeCapsSource.indexOf("],", routeCapsSource.indexOf("center: new Set<AccessPermissionKey>")),
  );
  assertEquals(centerCaps.includes("'manageSchedule'"), true);
  assertEquals(centerCaps.includes("'manageAssignments'"), false);
  assertEquals(centerCaps.includes("'gradeSubmissions'"), false);
  assertEquals(centerCaps.includes("'markAttendance'"), false);
});
