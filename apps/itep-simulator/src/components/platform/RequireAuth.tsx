import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { buildPlatformUrl, getReturnTo, hasPlatformBase } from '../../lib/platformUrls';
import { useAccess } from '../../lib/useAccess';
import type { Location } from 'react-router-dom';
import { LoadingScreen } from './LoadingScreen';

export const RequireAuth: React.FC = () => {
  const location = useLocation();
  const { status } = useAccess();
  const returnTo = getReturnTo(location as Location);

  if (status === 'loading') {
    return <LoadingScreen label="Checking your session..." />;
  }

  if (status === 'unauthenticated') {
    const url = buildPlatformUrl('/auth', returnTo);
    if (hasPlatformBase) {
      window.location.assign(url);
      return null;
    }
    return <Navigate to={url} replace />;
  }

  return <Outlet />;
};
