export type AcademyAccessSource = "tenant" | "staff" | "center" | "grant";
export type AcademyScope = "academy" | "assigned_classrooms";
export type AcademyRoleGrantStatus = "invited" | "active" | "suspended" | "expired" | "revoked";
export type AcademyRoleGrantScopeType = "academy" | "classrooms" | "students";

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
  grant_id?: string | null;
  classroom_ids?: string[];
  center_tenant_id?: string | null;
};

export type AcademyRoleGrantRow = {
  id?: string | null;
  academy_id?: string | null;
  role?: string | null;
  status?: string | null;
  scope_type?: string | null;
  scope_ids?: unknown;
  starts_at?: string | null;
  expires_at?: string | null;
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

export const normalizeAcademyRoleGrantStatus = (statusRaw: unknown): AcademyRoleGrantStatus => {
  const status = normalizeText(statusRaw, 40).toLowerCase();
  if (["active", "suspended", "expired", "revoked"].includes(status)) return status as AcademyRoleGrantStatus;
  return "invited";
};

export const normalizeAcademyRoleGrantScopeType = (scopeRaw: unknown): AcademyRoleGrantScopeType => {
  const scope = normalizeText(scopeRaw, 40).toLowerCase();
  if (scope === "classroom") return "classrooms";
  if (scope === "student") return "students";
  if (scope === "classrooms" || scope === "students") return scope;
  return "academy";
};

export const academyRoleGrantCanAccess = (
  grant: AcademyRoleGrantRow,
  now: Date = new Date(),
): boolean => {
  const status = normalizeAcademyRoleGrantStatus(grant.status);
  if (status !== "active" && status !== "invited") return false;
  const startsAt = grant.starts_at ? new Date(grant.starts_at) : null;
  if (startsAt && Number.isFinite(startsAt.getTime()) && startsAt.getTime() > now.getTime()) return false;
  const expiresAt = grant.expires_at ? new Date(grant.expires_at) : null;
  if (expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime()) return false;
  return true;
};

export const academyRoleGrantToMembership = (
  grant: AcademyRoleGrantRow,
  now: Date = new Date(),
): MembershipRow | null => {
  if (!academyRoleGrantCanAccess(grant, now)) return null;
  const academyId = normalizeText(grant.academy_id, 64);
  if (!academyId) return null;
  const role = normalizeAcademyRole(grant.role);
  const scopeType = normalizeAcademyRoleGrantScopeType(grant.scope_type);
  const classroomIds = scopeType === "classrooms" || isAcademyTeachingRole(role)
    ? toStringArray(grant.scope_ids)
    : [];

  return {
    tenant_id: academyId,
    role,
    status: "active",
    source: "grant",
    grant_id: grant.id ? normalizeText(grant.id, 64) : null,
    classroom_ids: classroomIds,
  };
};

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
