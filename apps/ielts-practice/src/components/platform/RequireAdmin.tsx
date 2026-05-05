import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { buildPlatformUrl, getReturnTo, hasPlatformBase } from '../../lib/platformUrls';
import { useAccess } from '../../lib/useAccess';
import { AccessLoading } from './AccessLoading';

const hasPermission = (permissions: string[], required: string[]) =>
  permissions.includes('admin.*') || required.some((permission) => permissions.includes(permission));

export const RequireAdmin: React.FC = () => {
  const location = useLocation();
  const { status, me } = useAccess();
  const returnTo = getReturnTo(location);

  if (status === 'loading') {
    return <AccessLoading label="Checking admin access" detail="We are confirming your IELTS Practice admin permissions." />;
  }

  if (status === 'unauthenticated') {
    const url = buildPlatformUrl('/auth', returnTo);
    if (hasPlatformBase) {
      window.location.assign(url);
      return null;
    }
    return <Navigate to={url} replace />;
  }

  const permissions = Array.isArray(me?.admin?.permissions) ? me.admin.permissions : [];
  const allowed =
    String(me?.user.role ?? '').toLowerCase() === 'admin'
    || hasPermission(permissions, ['admin.products.manage', 'admin.analytics.view']);

  if (!allowed) {
    const url = buildPlatformUrl('/account', returnTo);
    if (hasPlatformBase) {
      window.location.assign(url);
      return null;
    }
    return <Navigate to={url} replace />;
  }

  return <Outlet />;
};

