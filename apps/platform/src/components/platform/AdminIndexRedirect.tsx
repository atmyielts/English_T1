import React from 'react';
import { Navigate } from 'react-router-dom';
import { hasAdminPermission, useAdminAccess } from './adminAccess';

const routeOrder: Array<{ path: string; permission: string }> = [
  { path: '/admin/analytics', permission: 'admin.analytics.view' },
  { path: '/admin/users', permission: 'admin.users.manage' },
  { path: '/admin/products', permission: 'admin.products.manage' },
  { path: '/admin/billing', permission: 'admin.billing.manage' },
  { path: '/admin/coupons', permission: 'admin.coupons.manage' },
  { path: '/admin/payments', permission: 'admin.payments.manage' },
  { path: '/admin/trials', permission: 'admin.trials.manage' },
  { path: '/admin/support', permission: 'admin.support.manage' },
  { path: '/admin/announcements', permission: 'admin.announcements.manage' },
  { path: '/admin/settings', permission: 'admin.settings.manage' },
];

export const AdminIndexRedirect: React.FC = () => {
  const access = useAdminAccess();
  if (!access) return <Navigate to="/account" replace />;

  const target = routeOrder.find((item) => hasAdminPermission(access.permissions, item.permission));
  if (target) return <Navigate to={target.path} replace />;

  return <Navigate to="/account" replace />;
};
