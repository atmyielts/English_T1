export type AcademyAccessSource = "tenant" | "staff" | "center";
export type AcademyScope = "academy" | "assigned_classrooms";

export type AcademyAccessPermissions = {
  viewAcademy: boolean;
  manageAcademy: boolean;
  manageStaff: boolean;
  manageFinance: boolean;
  manageOffers: boolean;
  manageBranding: boolean;
  manageAutomation: boolean;
  viewContacts: boolean;
  manageContacts: boolean;
  viewClassrooms: boolean;
  manageClassrooms: boolean;
  manageRoster: boolean;
  manageMessages: boolean;
  manageAnnouncements: boolean;
  sendGlobalAnnouncements: boolean;
  manageAlerts: boolean;
  resolveAlerts: boolean;
  viewEducationOS: boolean;
  resolveActionItems: boolean;
  manageAssignments: boolean;
  gradeSubmissions: boolean;
  markAttendance: boolean;
  manageSchedule: boolean;
  manageResources: boolean;
  viewReports: boolean;
  issueCertificates: boolean;
  dispatchNotifications: boolean;
  viewNotifications: boolean;
  viewReferrals: boolean;
};

export type MembershipRow = {
  tenant_id: string;
  role: string;
  status: string;
  source?: AcademyAccessSource;
  staff_id?: string | null;
  classroom_ids?: string[];
  center_tenant_id?: string | null;
};

const normalizeText = (value: unknown, maxLen = 300): string => String(value ?? "").trim().slice(0, maxLen);

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => normalizeText(item, 64)).filter((item) => item.length > 0)));
};

export const normalizeAcademyRole = (roleRaw: unknown): string => {
  const role = normalizeText(roleRaw, 40).toLowerCase();
  if (role === "center-admin" || role === "center admin") return "center_admin";
  if (role === "administrator") return "admin";
  return role || "member";
};

export const academyRoleRank = (roleRaw: unknown): number => {
  const role = normalizeAcademyRole(roleRaw);
  if (role === "owner") return 100;
  if (role === "admin") return 90;
  if (role === "center_admin") return 85;
  if (role === "manager") return 70;
  if (role === "counselor") return 60;
  if (role === "teacher") return 50;
  if (role === "assistant") return 40;
  return 20;
};

export const isAcademyAdminRole = (roleRaw: unknown): boolean =>
  ["owner", "admin", "center_admin"].includes(normalizeAcademyRole(roleRaw));

export const isAcademyManagerRole = (roleRaw: unknown): boolean =>
  ["manager", "counselor"].includes(normalizeAcademyRole(roleRaw));

export const isAcademyTeachingRole = (roleRaw: unknown): boolean =>
  ["teacher", "assistant"].includes(normalizeAcademyRole(roleRaw));

export const academyAccessScope = (access: MembershipRow): AcademyScope => {
  const role = normalizeAcademyRole(access.role);
  if (isAcademyAdminRole(role) || isAcademyManagerRole(role)) return "academy";
  return "assigned_classrooms";
};

export const academyAccessClassroomIds = (access: MembershipRow): string[] | null => {
  if (academyAccessScope(access) === "academy") return null;
  return toStringArray(access.classroom_ids);
};

export const buildAcademyPermissions = (access: MembershipRow): AcademyAccessPermissions => {
  const role = normalizeAcademyRole(access.role);
  const ownerAdmin = ["owner", "admin"].includes(role);
  const centerAdmin = role === "center_admin";
  const manager = isAcademyManagerRole(role);
  const teacher = isAcademyTeachingRole(role);
  const ops = ownerAdmin || centerAdmin || manager;
  const staff = ops || teacher;
  const classroomLms = ownerAdmin || teacher;

  return {
    viewAcademy: ops,
    manageAcademy: ownerAdmin || centerAdmin,
    manageStaff: ownerAdmin || centerAdmin,
    manageFinance: ownerAdmin || centerAdmin,
    manageOffers: ownerAdmin || centerAdmin,
    manageBranding: ownerAdmin || centerAdmin,
    manageAutomation: ownerAdmin || centerAdmin,
    viewContacts: staff,
    manageContacts: ops,
    viewClassrooms: staff,
    manageClassrooms: ops,
    manageRoster: ops,
    manageMessages: staff,
    manageAnnouncements: staff,
    sendGlobalAnnouncements: ops,
    manageAlerts: staff,
    resolveAlerts: staff,
    viewEducationOS: staff,
    resolveActionItems: staff,
    manageAssignments: classroomLms,
    gradeSubmissions: classroomLms,
    markAttendance: classroomLms,
    manageSchedule: ownerAdmin || centerAdmin || manager || teacher,
    manageResources: classroomLms,
    viewReports: ops,
    issueCertificates: ownerAdmin,
    dispatchNotifications: ops,
    viewNotifications: ops,
    viewReferrals: ops,
  };
};

export const academyAccessProfile = (access: MembershipRow): Record<string, unknown> => {
  const scope = academyAccessScope(access);
  return {
    role: normalizeAcademyRole(access.role),
    source: access.source ?? "tenant",
    scope,
    classroom_ids: scope === "academy" ? [] : toStringArray(access.classroom_ids),
    center_tenant_id: access.center_tenant_id ?? null,
    permissions: buildAcademyPermissions(access),
  };
};

export const academyAccessHas = (access: MembershipRow, permission: keyof AcademyAccessPermissions): boolean =>
  buildAcademyPermissions(access)[permission] === true;

export const requireAcademyPermission = (access: MembershipRow, permission: keyof AcademyAccessPermissions): void => {
  if (!academyAccessHas(access, permission)) throw new Error("Forbidden");
};
