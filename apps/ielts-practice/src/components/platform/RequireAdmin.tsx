import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { buildPlatformUrl, getReturnTo, hasPlatformBase } from '../../lib/platformUrls';
import { useAccess } from '../../lib/useAccess';

export const RequireAdmin: React.FC = () => {
  const location = useLocation();
  const { status, me } = useAccess();
  const returnTo = getReturnTo(location);

  if (status === 'loading') return <div className="route-loading">Checking admin access...</div>;

  if (status === 'unauthenticated') {
    const url = buildPlatformUrl('/auth', returnTo);
    if (hasPlatformBase) {
      window.location.assign(url);
      return null;
    }
    return <Navigate to={url} replace />;
  }

  if (!me || String(me.user.role ?? '').toLowerCase() !== 'admin') {
    const url = buildPlatformUrl('/account', returnTo);
    if (hasPlatformBase) {
      window.location.assign(url);
      return null;
    }
    return <Navigate to={url} replace />;
  }

  return <Outlet />;
};

