import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { buildPlatformUrl, getReturnTo, hasPlatformBase } from '../../lib/platformUrls';
import { useAccess } from '../../lib/useAccess';
import { IELTS_PRACTICE_PRODUCT_SLUG } from '../../lib/constants';

export const RequireProductEntitlement: React.FC = () => {
  const location = useLocation();
  const { status, me } = useAccess({ force: true });
  const returnTo = getReturnTo(location);

  if (status === 'loading') return <div className="route-loading">Checking access...</div>;

  if (status === 'unauthenticated') {
    const url = buildPlatformUrl('/auth', returnTo, { product: IELTS_PRACTICE_PRODUCT_SLUG });
    if (hasPlatformBase) {
      window.location.assign(url);
      return null;
    }
    return <Navigate to={url} replace />;
  }

  if (!me) return <div className="route-loading">Loading account...</div>;

  return <Outlet />;
};

