import type { TeacherStudioAccessProfile } from './client';

export type AccessPermissionKey = keyof TeacherStudioAccessProfile['permissions'];
export type OfficeRouteIntent = 'office' | 'admin' | 'teacher' | 'center';

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
