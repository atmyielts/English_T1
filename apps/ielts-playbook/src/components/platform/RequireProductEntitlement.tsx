import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { buildPlatformUrl, getReturnTo, hasPlatformBase } from '../../lib/platformUrls';
import { useAccess } from '../../lib/useAccess';
import { IELTS_PLAYBOOK_PRODUCT_ID, IELTS_PLAYBOOK_PRODUCT_SLUG } from '../../lib/constants';

export const RequireProductEntitlement: React.FC = () => {
  const location = useLocation();
  const { status, me, effective } = useAccess({ force: true, includeEffective: true });
  const disablePaywall = String(import.meta.env.VITE_DISABLE_PAYWALL ?? '').toLowerCase() === 'true';
  const returnTo = getReturnTo(location);

  if (status === 'loading') return <div className="route-loading">Checking access...</div>;

  if (status === 'unauthenticated') {
    const url = buildPlatformUrl('/auth', returnTo, { product: IELTS_PLAYBOOK_PRODUCT_SLUG });
    if (hasPlatformBase) {
      window.location.assign(url);
      return null;
    }
    return <Navigate to={url} replace />;
  }

  if (!me) return <div className="route-loading">Loading account...</div>;

  const direct = me.entitlements.some((entry) => entry.resource_type === 'product' && entry.resource_id === IELTS_PLAYBOOK_PRODUCT_ID);
  const viaEffective = Array.isArray(effective?.effective_product_ids) && effective.effective_product_ids.includes(IELTS_PLAYBOOK_PRODUCT_ID);

  if (!disablePaywall && !direct && !viaEffective) {
    const url = buildPlatformUrl('/pricing', returnTo, { product: IELTS_PLAYBOOK_PRODUCT_SLUG });
    if (hasPlatformBase) {
      window.location.assign(url);
      return null;
    }
    return <Navigate to={url} replace />;
  }

  return <Outlet />;
};

