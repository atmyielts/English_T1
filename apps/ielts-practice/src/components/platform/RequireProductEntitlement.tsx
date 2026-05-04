import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { buildPlatformUrl, getReturnTo, hasPlatformBase } from '../../lib/platformUrls';
import { useAccess } from '../../lib/useAccess';
import { IELTS_PRACTICE_PRODUCT_ID, IELTS_PRACTICE_PRODUCT_SLUG } from '../../lib/constants';
import { getAccessEffective, type AccessEffectiveResponse, type MeResponse } from '../../lib/api';

const hasProductEntitlement = (me: MeResponse, productId: string): boolean =>
  me.entitlements.some((entry) => entry.resource_type === 'product' && entry.resource_id === productId);

const hasEffectiveProductAccess = (
  me: MeResponse,
  effective: AccessEffectiveResponse | null,
  productId: string,
): boolean => {
  if (hasProductEntitlement(me, productId)) return true;
  return Array.isArray(effective?.effective_product_ids) && effective.effective_product_ids.includes(productId);
};

export const RequireProductEntitlement: React.FC = () => {
  const location = useLocation();
  const { status, me, accessToken } = useAccess({ force: true });
  const [effective, setEffective] = React.useState<AccessEffectiveResponse | null>(null);
  const [effectiveLoading, setEffectiveLoading] = React.useState(false);
  const disablePaywall = String(import.meta.env.VITE_DISABLE_PAYWALL ?? '').toLowerCase() === 'true';
  const returnTo = getReturnTo(location);
  const hasDirectAccess = me ? hasProductEntitlement(me, IELTS_PRACTICE_PRODUCT_ID) : false;

  React.useEffect(() => {
    let cancelled = false;

    setEffective(null);
    setEffectiveLoading(false);

    if (disablePaywall || status !== 'authenticated' || !me || !accessToken || hasDirectAccess) {
      return () => {
        cancelled = true;
      };
    }

    setEffectiveLoading(true);
    getAccessEffective(accessToken, { productId: IELTS_PRACTICE_PRODUCT_ID })
      .then((value) => {
        if (!cancelled) setEffective(value);
      })
      .catch(() => {
        if (!cancelled) setEffective(null);
      })
      .finally(() => {
        if (!cancelled) setEffectiveLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, disablePaywall, hasDirectAccess, me, status]);

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

  if (!disablePaywall && !hasDirectAccess && effectiveLoading) {
    return <div className="route-loading">Checking product access...</div>;
  }

  if (!disablePaywall && !hasEffectiveProductAccess(me, effective, IELTS_PRACTICE_PRODUCT_ID)) {
    const url = buildPlatformUrl('/pricing', returnTo, { product: IELTS_PRACTICE_PRODUCT_SLUG });
    if (hasPlatformBase) {
      window.location.assign(url);
      return null;
    }
    return <Navigate to={url} replace />;
  }

  return <Outlet />;
};

