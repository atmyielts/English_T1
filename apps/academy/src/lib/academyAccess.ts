import type { TeacherStudioAccessProfile } from './client';

export type AccessPermissionKey = keyof TeacherStudioAccessProfile['permissions'];
export type OfficeRouteIntent = 'office' | 'admin' | 'teacher' | 'center';

export const normalizeAccessRole = (access: TeacherStudioAccessProfile | null | undefined): string =>
  String(access?.role ?? 'member').trim().toLowerCase().replace(/[\s-]+/g, '_') || 'member';

export const isCenterAccess = (access: TeacherStudioAccessProfile | null | undefined): boolean =>
  access?.source === 'center' || normalizeAccessRole(access) === 'center_admin';

export const isAcademyAdminAccess = (access: TeacherStudioAccessProfile | null | undefined): boolean =>
  !isCenterAccess(access) && ['owner', 'admin'].includes(normalizeAccessRole(access));

export const isAcademyOperationsAccess = (access: TeacherStudioAccessProfile | null | undefined): boolean =>
  !isCenterAccess(access) && ['manager', 'counselor'].includes(normalizeAccessRole(access));

export const isTeacherWorkspaceAccess = (access: TeacherStudioAccessProfile | null | undefined): boolean =>
  !isCenterAccess(access) && ['teacher', 'assistant'].includes(normalizeAccessRole(access));

export const OFFICE_ROUTE_PERMISSION_CAPS: Record<OfficeRouteIntent, ReadonlySet<AccessPermissionKey> | null> = {
  office: null,
  admin: null,
  teacher: new Set<AccessPermissionKey>([
    'viewContacts',
    'viewClassrooms',
    'manageMessages',
    'manageAnnouncements',
    'manageAlerts',
    'resolveAlerts',
    'viewEducationOS',
    'resolveActionItems',
    'manageAssignments',
    'gradeSubmissions',
    'markAttendance',
    'manageSchedule',
    'manageResources',
  ]),
  center: new Set<AccessPermissionKey>([
    'viewAcademy',
    'manageAcademy',
    'manageStaff',
    'manageFinance',
    'manageOffers',
    'manageBranding',
    'manageAutomation',
    'viewContacts',
    'manageContacts',
    'viewClassrooms',
    'manageClassrooms',
    'manageRoster',
    'manageMessages',
    'manageAnnouncements',
    'sendGlobalAnnouncements',
    'manageAlerts',
    'resolveAlerts',
    'viewEducationOS',
    'resolveActionItems',
    'viewReports',
    'issueCertificates',
    'dispatchNotifications',
    'viewNotifications',
    'viewReferrals',
    'viewAudit',
  ]),
};

export const routeIntentAllowsPermission = (
  intent: OfficeRouteIntent,
  permission: AccessPermissionKey,
): boolean => {
  const permissionCaps = OFFICE_ROUTE_PERMISSION_CAPS[intent] ?? OFFICE_ROUTE_PERMISSION_CAPS.office;
  return permissionCaps === null || permissionCaps.has(permission);
};

export const hasAccessPermission = (
  access: TeacherStudioAccessProfile | null | undefined,
  permission: AccessPermissionKey,
): boolean => access?.permissions?.[permission] === true;

export const hasRoutePermission = (
  access: TeacherStudioAccessProfile | null | undefined,
  intent: OfficeRouteIntent,
  permission: AccessPermissionKey,
): boolean => routeIntentAllowsPermission(intent, permission) && hasAccessPermission(access, permission);
