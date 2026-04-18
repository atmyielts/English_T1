import { createContext, useContext } from 'react';
import type { MeResponse } from '../../lib/platformClient';

export type AdminAccessInfo = {
  userId: string;
  email: string | null;
  role: string;
  permissions: string[];
  sessionAal: string | null;
  securityPolicy: NonNullable<NonNullable<MeResponse['admin']>['security_policy']> | null;
};

export type AdminNavItem = {
  path: string;
  label: string;
  permission: string;
};

export const hasAdminPermission = (permissions: string[], required?: string): boolean => {
  if (!required) return true;
  if (permissions.includes('admin.*')) return true;
  return permissions.includes(required);
};

export const adminNavItems: AdminNavItem[] = [
  { path: '/admin/tests', label: 'Tests', permission: 'admin.tests.manage' },
  { path: '/admin/builder', label: 'Builder', permission: 'admin.builder.manage' },
  { path: '/admin/import', label: 'Import JSON', permission: 'admin.builder.manage' },
  { path: '/admin/assets', label: 'Assets', permission: 'admin.assets.manage' },
];

export const firstAllowedAdminRoute = (permissions: string[]): string | null => {
  const match = adminNavItems.find((item) => hasAdminPermission(permissions, item.permission));
  return match?.path ?? null;
};

export const AdminAccessContext = createContext<AdminAccessInfo | null>(null);

export const useAdminAccess = (): AdminAccessInfo | null => useContext(AdminAccessContext);

export const useAdminPermission = (required?: string): boolean => {
  const access = useAdminAccess();
  if (!access) return false;
  return hasAdminPermission(access.permissions, required);
};
